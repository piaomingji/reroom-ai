import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ROOM_TYPES, STYLES } from '@/lib/constants';
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.REDIS_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.REDIS_REST_API_TOKEN || "",
});

export const runtime = 'nodejs';
export const maxDuration = 60;

// PRO 회원 안전대책 (일일 100회 제한 & 10秒 연속생성 제한) 추적 맵
const proUsageTracker = new Map<string, { dailyCount: number; resetAt: number; lastGeneratedAt: number }>();

// 有料アカウントの同時ログインセッション制限追跡マップ (キー: finalUserIdentifier, 値: sessionIdの配列)
const activeSessions = new Map<string, string[]>();

export async function POST(req: NextRequest) {
  try {
    // Sanitize headers to prevent ByteString conversion crashes in any outgoing runtime fetch calls
    try {
      const keys = Array.from(req.headers.keys());
      for (const key of keys) {
        const val = req.headers.get(key) || '';
        let hasNonAscii = false;
        for (let i = 0; i < val.length; i++) {
          if (val.charCodeAt(i) > 255) {
            hasNonAscii = true;
            break;
          }
        }
        if (hasNonAscii) {
          req.headers.set(key, encodeURIComponent(val));
        }
      }
    } catch (e) {
      console.error('Error sanitizing headers:', e);
    }

    // 요청 용량 제한 체크 (~8MB)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'アップロード容量制限（8MB）を超過しました。画像の解像度を下げてください。' },
        { status: 413 }
      );
    }

    const {
      image,
      roomTypeId,
      styleId,
      byokKey,
      refFlooring,
      refWallpaper,
      refKitchen,
      userId,
      userEmail,
      isPremiumUser,
      userPlan,
      sessionId,
    } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'リフォーム前の元となるお部屋の写真をアップロードしてください。' },
        { status: 400 }
      );
    }

    const roomType = ROOM_TYPES.find((r) => r.id === roomTypeId);
    const style = STYLES.find((s) => s.id === styleId);
    if (!roomType) {
      return NextResponse.json(
        { error: '空間タイプを選択してください。' },
        { status: 400 }
      );
    }
    const hasRefImages = !!(refFlooring || refWallpaper || refKitchen);
    if (!style && !hasRefImages) {
      return NextResponse.json(
        { error: 'スタイル、または参考画像を1つ以上指定してください。' },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    // API 키 결정 (BYOK 우선, 없으면 서버 환경변수 키)
    const apiKey = (typeof byokKey === 'string' && byokKey.trim()) || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'APIキーが設定されていません。' },
        { status: 500 }
      );
    }

    // Google 계정 식별자 추출 (IAP 헤더 또는 바디 정보)
    const getSafeHeader = (name: string): string => {
      const val = req.headers.get(name) || '';
      if (!val) return '';
      try {
        if (val.startsWith('base64:')) {
          return Buffer.from(val.slice(7), 'base64').toString('utf8').trim();
        }
        return decodeURIComponent(val).trim();
      } catch {
        return val.trim();
      }
    };

    const googleUserEmailHeader = getSafeHeader('x-goog-authenticated-user-email') || getSafeHeader('x-user-email') || '';
    const googleUserIdHeader = getSafeHeader('x-goog-authenticated-user-id') || getSafeHeader('x-user-id') || '';
    const bodyUserId = (typeof userId === 'string' && userId.trim()) || '';
    const bodyUserEmail = (typeof userEmail === 'string' && userEmail.trim()) || '';
    const finalUserIdentifier = googleUserEmailHeader || googleUserIdHeader || bodyUserEmail || bodyUserId || null;

    // PROプラン・法人プラン（サブスク会員）のユーザーに対する安全対策（API乱用・連打防止）
    const isProUser = userPlan === 'pro' || userPlan === 'business';
    const trackingKey = finalUserIdentifier || ip;

    // 無料体験枠（通算5回）の制限チェック（IPとGoogleアカウントのダブル判定）
    const isDemoMode = !byokKey;

    if (isProUser && isDemoMode) {
      // 0. 同時ログイン（複数セッション）の防止制御 (Proプランは最大1台、法人プランは最大5台)
      if (finalUserIdentifier && sessionId) {
        const maxSessions = userPlan === 'business' ? 5 : 1;
        let sessions = activeSessions.get(finalUserIdentifier) || [];

        if (sessions.includes(sessionId)) {
          // すでに有効リストにある場合は、最新順にするため一度除外して末尾に追加（更新）
          sessions = sessions.filter((id) => id !== sessionId);
          sessions.push(sessionId);
          activeSessions.set(finalUserIdentifier, sessions);
        } else {
          // 新規セッションの場合は制限数チェック
          if (sessions.length >= maxSessions) {
            // 上限（個人1 / 法人5）を超えた場合、最も古いセッション（先頭）を切断する
            sessions.shift();
          }
          sessions.push(sessionId);
          activeSessions.set(finalUserIdentifier, sessions);
        }

        // 現在の自身のセッションIDが有効リストに残っているか検証
        const currentActiveSessions = activeSessions.get(finalUserIdentifier) || [];
        if (!currentActiveSessions.includes(sessionId)) {
          return NextResponse.json(
            { error: 'MULTIPLE_SESSIONS_DETECTED' },
            { status: 403 }
          );
        }
      }

      const now = Date.now();
      let record = proUsageTracker.get(trackingKey);

      // 初期化 또는 24시간 리셋
      if (!record || now > record.resetAt) {
        record = {
          dailyCount: 0,
          resetAt: now + 24 * 60 * 60 * 1000,
          lastGeneratedAt: 0,
        };
        proUsageTracker.set(trackingKey, record);
      }

      // 1. 連打・短時間連続リクエストの防止（レートリミット: 10秒間隔）
      const timeSinceLast = now - record.lastGeneratedAt;
      if (timeSinceLast < 10 * 1000) {
        return NextResponse.json(
          { error: 'リクエストの間隔が短すぎます。前回の生成から10秒以上あけて再度お試しください。' },
          { status: 429 }
        );
      }

      // 2. 1日あたりの生成上限（フェアユース制限: Proは最大100回、法人プランは最大500回）
      const limit = userPlan === 'business' ? 500 : 100;
      if (record.dailyCount >= limit) {
        return NextResponse.json(
          { error: `本日の生成上限（${limit}回）に達しました。明日以降に再度お試しください。` },
          { status: 429 }
        );
      }
    }

    const isPremium = !!isPremiumUser; // Check premium status sent from client
    if (isDemoMode && !isPremium) {
      const ipKey = `reroom-ai:ip:${ip}`;
      const googleKey = finalUserIdentifier ? `reroom-ai:google:${finalUserIdentifier}` : null;

      const currentIpCount = (await kv.get<number>(ipKey)) || 0;
      const currentGoogleCount = googleKey ? ((await kv.get<number>(googleKey)) || 0) : 0;

      if (currentIpCount >= 5 || currentGoogleCount >= 5) {
        return NextResponse.json(
          { error: '無料体験枠（通算5回）をすべて消費しました。引き続きご利用いただくには有料プランをご検討ください。' },
          { status: 429 }
        );
      }
    }

    let mimeType = 'image/jpeg';
    let base64Image = image;
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Image = match[2];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];
    parts.push({ inlineData: { mimeType, data: base64Image } }); // Image 1 is always the main room photo

    let imageIndex = 1;
    const refDescriptions: string[] = [];

    if (refFlooring && typeof refFlooring === 'string') {
      imageIndex++;
      let flooringMime = 'image/jpeg';
      let flooringBase64 = refFlooring;
      if (refFlooring.startsWith('data:')) {
        const match = refFlooring.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          flooringMime = match[1];
          flooringBase64 = match[2];
        }
      }
      parts.push({ inlineData: { mimeType: flooringMime, data: flooringBase64 } });
      refDescriptions.push(`- Image ${imageIndex} is a reference flooring material sample (showing wood grain, tile patterns, carpet texture, etc.). You must analyze its colors, patterns, and textures, and transfer/render this exact design onto the floor area of the room.`);
    }

    if (refWallpaper && typeof refWallpaper === 'string') {
      imageIndex++;
      let wallpaperMime = 'image/jpeg';
      let wallpaperBase64 = refWallpaper;
      if (refWallpaper.startsWith('data:')) {
        const match = refWallpaper.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          wallpaperMime = match[1];
          wallpaperBase64 = match[2];
        }
      }
      parts.push({ inlineData: { mimeType: wallpaperMime, data: wallpaperBase64 } });
      refDescriptions.push(`- Image ${imageIndex} is a reference wallpaper/wall material sample (showing print design, panel textures, solid paint colors, etc.). You must analyze its patterns and colors, and transfer/render this exact design onto the walls (wall coverings/paint surfaces) of the room.`);
    }

    if (refKitchen && typeof refKitchen === 'string') {
      imageIndex++;
      let kitchenMime = 'image/jpeg';
      let kitchenBase64 = refKitchen;
      if (refKitchen.startsWith('data:')) {
        const match = refKitchen.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          kitchenMime = match[1];
          kitchenBase64 = match[2];
        }
      }
      parts.push({ inlineData: { mimeType: kitchenMime, data: kitchenBase64 } });
      refDescriptions.push(`- Image ${imageIndex} is a reference equipment/furniture design sample (showing a modern kitchen, unit bathroom, toilet, vanity/washbasin, or specific furniture design). You must completely replace and reconstruct (Replace & Reconstruct) the corresponding equipment/fixtures present in the original room (Image 1) with the shape, product design, component layout, and modern flat/seamless structures shown in this reference image. Do not just colorize or apply texture; adapt the actual physical shape and design profile of the reference equipment (e.g. flat panels, seamless structures, modern contours) to fit the original layout position.`);
    }

    let instruction = '';
    const hasRefImagesBool = imageIndex > 1;

    if (hasRefImagesBool) {
      if (!style) {
        // 1. 「参考商品画像」のみがアップロードされている場合：
        // - 「スタイル」のプロンプト条件は完全に適用しない。
        // - 元の部屋の写真の構造・雰囲気をベースに、添付された参考商品の柄・色・テクスチャ（素材感）のみを忠実に適用・反映する。
        instruction = `You are a professional architectural visualization tool.
You are provided with multiple input images:
- Image 1 is the original room interior photo before remodeling. This is the structural baseline.
${refDescriptions.join('\n')}

CRITICAL GEOMETRY CONSTRAINT (HIGHEST PRIORITY):
- You must STRICTLY and ABSOLUTELY lock the original room structure, layout, geometry, wireframe outlines (edges), and perspective of the original photo (Image 1). 
- Every single boundary line of the room, ceiling shape, beam positions, column alignment, window locations, window frames, door coordinates, and camera perspective must align 100% perfectly with Image 1 down to the single-pixel level. Absolutely no distortion, warping, shifting, or structural changes are allowed.
- The skeletal frame (骨組み) of the room must not move by a single millimeter.

MATERIAL & TEXTURE MAPPING:
- For flooring and walls: treat the reference images (Image 2, etc.) as decorative texture maps. Carefully analyze their colors, patterns, and material textures, and apply/map them onto the floor and wall regions of Image 1 strictly within the locked structural boundaries.
- For equipment/furniture replacement (e.g., kitchen cabinets, bath units, toilets, vanity): replace the old equipment with the modern design (seamless flat doors, integrated design, etc.) of the reference image. However, the new equipment must fit exactly within the same physical volume, outline, and spatial bounds occupied by the old equipment in Image 1. Do not extend, shift, or distort the equipment boundaries outside their original layout footprint.

Keep the lighting, shadows, and perspective natural while swapping in the target materials. Do not change the overall room layout.
High-quality professional interior design photography, realistic textures, realistic lighting, highly detailed.`;
      } else {
        // 2. 「参考商品画像」と「スタイル」の両方がアップロード・選択されている場合：
        // - 選択されたスタイルのトーン＆マナーを適用する。
        // - 添付された参考商品の柄・色・テクスチャ（素材感）がそのスタイル内に自然に組み込まれるようにプロンプトを合成する。
        instruction = `You are a professional architectural visualization tool.
You are provided with multiple input images:
- Image 1 is the original room interior photo before remodeling. This is the structural baseline.
${refDescriptions.join('\n')}

CRITICAL GEOMETRY CONSTRAINT (HIGHEST PRIORITY):
- You must STRICTLY and ABSOLUTELY lock the original room structure, layout, geometry, wireframe outlines (edges), and perspective of the original photo (Image 1). 
- Every single boundary line of the room, ceiling shape, beam positions, column alignment, window locations, window frames, door coordinates, and camera perspective must align 100% perfectly with Image 1 down to the single-pixel level. Absolutely no distortion, warping, shifting, or structural changes are allowed.
- The skeletal frame (骨組み) of the room must not move by a single millimeter.

REDESIGN TASK:
- Redesign the original room (Image 1) into the ${style.prompt} style, applying its color palettes, furniture themes, and overall decor mood.
- Simultaneously, perform realistic surface texture mapping and equipment replacement based on the reference images:
  - Apply the flooring reference traits onto the floor area.
  - Apply the wallpaper reference traits onto the wall areas.
  - Replace any matching equipment/fixtures in the room with the physical product shape, design layout, and modern flat/seamless structure of the reference image, ensuring the new design elements blend naturally with the ${style.prompt} style and fit exactly within the original spatial bounds, volume, and footprint occupied by the old equipment in Image 1.

Keep the lighting, shadows, and perspective natural.
High-quality professional interior design photography, realistic textures, realistic lighting, highly detailed.`;
      }
    } else {
      // 3. スタイルのみ指定されている場合（従来通り）
      instruction = `Redesign this ${roomType.prompt} interior in ${style!.prompt}.
CRITICAL GEOMETRY CONSTRAINT (HIGHEST PRIORITY):
- You must STRICTLY and ABSOLUTELY lock the original room structure, layout, geometry, wireframe outlines (edges), and perspective of the original photo (Image 1). 
- Every single boundary line of the room, ceiling shape, beam positions, column alignment, window locations, window frames, door coordinates, and camera perspective must align 100% perfectly with Image 1 down to the single-pixel level. Absolutely no distortion, warping, shifting, or structural changes are allowed.
- The skeletal frame (骨組み) of the room must not move by a single millimeter.

Change ONLY the interior finishes: replace the wallpaper, paint, flooring material, furniture, lighting fixtures, and decorative items to match the target style. 
Do not change the structure of the room. High-quality professional interior design photography, realistic textures, realistic lighting, highly detailed.`;
    }

    parts.push({ text: instruction });

    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
    });

    const candidate = res.candidates?.[0];

    if (candidate?.finishReason === 'SAFETY') {
      return NextResponse.json(
        { error: '安全ポリシーにより画像の生成がブロックされました。別の画像を使用してください。' },
        { status: 400 }
      );
    }

    const part = candidate?.content?.parts?.find((p) => p.inlineData);
    const imageBase64 = part?.inlineData?.data;

    if (!imageBase64) {
      return NextResponse.json(
        { error: '画像の生成に失敗したか、ブロックされました。別の空間タイプやスタイルを選択してください。' },
        { status: 400 }
      );
    }

    if (isDemoMode && !isPremium) {
      // IP address rate limiting with 72-hour reset (259200 seconds)
      const ipKey = `reroom-ai:ip:${ip}`;
      const currentIpCount = (await kv.get<number>(ipKey)) || 0;
      if (currentIpCount === 0) {
        await kv.set(ipKey, 1, { ex: 72 * 60 * 60 });
      } else {
        const ttl = await kv.ttl(ipKey);
        await kv.set(ipKey, currentIpCount + 1, ttl > 0 ? { ex: ttl } : { ex: 72 * 60 * 60 });
      }

      // Google account rate limiting with 72-hour reset
      if (finalUserIdentifier) {
        const googleKey = `reroom-ai:google:${finalUserIdentifier}`;
        const currentGoogleCount = (await kv.get<number>(googleKey)) || 0;
        if (currentGoogleCount === 0) {
          await kv.set(googleKey, 1, { ex: 72 * 60 * 60 });
        } else {
          const ttl = await kv.ttl(googleKey);
          await kv.set(googleKey, currentGoogleCount + 1, ttl > 0 ? { ex: ttl } : { ex: 72 * 60 * 60 });
        }
      }

      // PRO 회원 생성 기록 업데이트 (누적 횟수 증가 및 최종 생성 시각 업데이트)
      if (isProUser) {
        const record = proUsageTracker.get(trackingKey);
        if (record) {
          record.dailyCount += 1;
          record.lastGeneratedAt = Date.now();
        }
      }
    }

    return NextResponse.json({ image: imageBase64 });
  } catch (error) {
    console.error('Gemini Generate API Error:', error);
    const errMsg = error instanceof Error ? error.message : '';

    if (
      errMsg.includes('API_KEY_INVALID') ||
      errMsg.includes('API key not valid') ||
      errMsg.includes('invalid api key')
    ) {
      return NextResponse.json(
        { error: 'APIキーが無効です。発行された有効なAPIキーを正しく入力してください。' },
        { status: 401 }
      );
    }

    if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('429')) {
      return NextResponse.json(
        { error: 'APIの無料リクエスト制限を超過しました。しばらく時間をおいてから再試行してください。' },
        { status: 429 }
      );
    }

    if (errMsg.includes('SAFETY') || errMsg.includes('safety') || errMsg.includes('blocked')) {
      return NextResponse.json(
        { error: '安全フィルターにより生成が拒否されました。別の写真やスタイルでお試しください。' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `リフォーム案の生成に失敗しました: ${errMsg || '不明なサーバーエラー'}` },
      { status: 500 }
    );
  }
}
