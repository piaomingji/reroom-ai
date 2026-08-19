import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ROOM_TYPES, STYLES } from '@/lib/constants';
import { quotaGet, quotaIncrement } from '@/lib/quotaStore';
import { IP_QUOTA_KEY, GOOGLE_QUOTA_KEY, QUOTA_TTL_SECONDS, FREE_TOTAL_CREDITS, FREE_GUEST_CREDITS } from '@/lib/quota';
import { getCurrentUser, deductUserCredit, getIpQuotaFromCookie, incrementIpQuotaCookie } from '@/lib/auth';

/**
 * Counters go through the shared store, and are incremented rather than written.
 *
 * The previous pair of helpers returned 0 and did nothing whenever the REST credentials were absent
 * -- which was always -- so every server-side limit in this file read as "nothing used yet". They
 * also read a value and wrote value+1, which loses a count whenever two requests overlap.
 */
async function safeKvGet(key: string): Promise<number> {
  return await quotaGet(key);
}

async function bumpCounter(key: string): Promise<number> {
  return await quotaIncrement(key, QUOTA_TTL_SECONDS);
}

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
      quotaRemaining,
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

        const currentUser = await getCurrentUser();
    let remainingCredits: number | undefined = undefined;
    const ipQuotaCount = await getIpQuotaFromCookie();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const ipKey = IP_QUOTA_KEY(ip);
    const currentIpCount = await safeKvGet(ipKey);
    const effectiveIpCount = Math.max(ipQuotaCount, currentIpCount);

    if (currentUser) {
      // The account's own counter matters as much as the device's: signing in with a second Google
      // account on the same device must not hand out a fresh allowance, and the same account used
      // from a second device must not either. Whichever count is higher is the one that applies.
      const accountCount = currentUser.email
        ? await safeKvGet(GOOGLE_QUOTA_KEY(currentUser.email))
        : 0;
      const effectiveCount = Math.max(effectiveIpCount, accountCount);

      if (currentUser.plan === "free" && currentUser.credits <= 0) {
        return NextResponse.json(
          {
            error: "残りの生成クレジットがありません。有料プランへのご加入、または追加クレジットのご購入をお願いいたします。",
            requiresUpgrade: true,
            remainingCredits: 0,
          },
          { status: 403 }
        );
      }

      if (currentUser.plan === "free" && effectiveCount >= FREE_TOTAL_CREDITS) {
        return NextResponse.json(
          {
            error: "このIPアドレス（端末）からの無料利用枠（合計10回）を超過しました。有料プラン（Proプラン）へのお申し込みが必要です。",
            requiresUpgrade: true,
            remainingCredits: 0,
          },
          { status: 403 }
        );
      }

      // The credit is taken after the image exists, not here. Charging up front meant a generation
      // that timed out or was refused still cost the person a credit, with nothing to show for it --
      // and when the platform kills the request there is no code left running to give it back.
      remainingCredits = currentUser.credits;
    } else {
      if (effectiveIpCount >= FREE_GUEST_CREDITS) {
        return NextResponse.json(
          {
            error: "この端末（IP）からの無料お試しの制限回数（5回）を超過しました。無料会員登録をするとさらにクレジットを獲得できます！",
            requiresAuth: true,
            requiresUpgrade: true,
          },
          { status: 403 }
        );
      }
    }

    // ip defined above
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

    // The allowance is checked once, above: 10 for a signed-in account, 5 for a guest. A second
    // check used to sit here with a limit of its own, and it ran after the credit had already been
    // deducted -- when the two disagreed it cost a generation that never arrived.

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
        instruction = `DRAMATIC MATERIAL & PRODUCT MAKEOVER:
You are a top-tier interior designer and architectural visualization expert.
Your task is to execute a BOLD, STRIKING BEFORE-AND-AFTER RENOVATION of the room in Image 1 using the provided reference product/material samples:

${refDescriptions.join("\n")}

MAKEOVER QUALITY REQUIREMENTS:
- Make the material, wallpaper, flooring, and equipment replacements HIGHLY VISIBLE, BOLD, AND DRAMATIC.
- The new surfaces must look immaculate, modern, and high-end with crisp textures and realistic studio lighting.
- Overhaul old lighting with warm ambient illumination and clear architectural highlights.

CAMERA & GEOMETRY LOCK:
- Keep the room perspective, camera position, walls, ceiling height, and window/door locations locked to Image 1. Do not distort the room outline.

Photorealistic 8K resolution, Architectural Digest standard, vivid textures, warm ambient lighting.`;
      } else {
        instruction = `DRAMATIC HYBRID STYLE & MATERIAL RENOVATION:
You are an award-winning interior design visualization expert.
Execute a DARING, HIGH-IMPACT BEFORE-AND-AFTER MAKEOVER of the room in Image 1, transforming it into the ${style.prompt} style while integrating the reference material/product samples:

${refDescriptions.join("\n")}

MAKEOVER EXCELLENCE GUIDELINES:
1. STYLE TRANSFORMATION: Overhaul the visual atmosphere to strongly feature the signature colors, materials, furniture, and lighting of the ${style.prompt} style.
2. MATERIAL INTEGRATION: Apply reference flooring to floors, reference wallpaper to walls, and swap matching fixtures with the modern reference product design.
3. VISUAL IMPACT: Ensure the before-and-after change is DRAMATIC, VIBRANT, AND IMPRESSIVE. Upgrade dull ceiling lights to luxurious architectural warm lighting and designer fixtures.

CAMERA & GEOMETRY LOCK:
- Preserve the exact room perspective, camera angle, wall boundaries, and window/door positions of Image 1.

Photorealistic 8K resolution, Architectural Digest standard, rich textures, stunning architectural lighting.`;
      }
    } else {
      instruction = `DRAMATIC INTERIOR MAKEOVER & STRIKING BEFORE-AND-AFTER REVISION:
You are an award-winning interior designer and architectural visualization expert.
Execute a DARING, HIGH-IMPACT, OBVIOUS BEFORE-AND-AFTER RENOVATION of this ${roomType.prompt} photo into the ${style!.prompt} style.

VISUAL TRANSFORM REQUIREMENTS (HIGH CONTRAST & CLEAR VISUAL IMPACT):
1. WALLS & SURFACES: Completely replace old wallpaper/paint with fresh, premium, high-contrast ${style!.prompt} wall treatments, accent textures, or modern panels.
2. FLOORING: Overhaul the flooring with brand new, rich, highly visible ${style!.prompt} materials (e.g. pristine light oak hardwood, modern dark walnut, fresh tatami, or polished stone tiles).
3. LIGHTING & ATMOSPHERE: Dramatically upgrade room lighting! Replace dated lighting with warm architectural spotlights, indirect LED strip glow, and stylish designer lamps.
4. FURNITURE & DECOR: Replace dated furniture with elegant, modern, high-contrast ${style!.prompt} furniture, plush rugs, indoor greenery, and refined decor.

CAMERA & GEOMETRY LOCK:
- Preserve the exact room perspective, camera position, wall boundaries, ceiling height, and window/door coordinates of the original photo.
- Do NOT distort room geometry, but DO make every single surface, color, texture, lighting, and decor element look 100% newly remodeled and visually breathtaking.

Photorealistic 8K resolution, Architectural Digest magazine standard, vivid photorealism, warm luxury ambient lighting.`;
    }

    parts.push({ text: instruction });

    const ai = new GoogleGenAI({ apiKey, vertexai: false });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputs: any[] = [
      { type: "text", text: instruction },
      { type: "image", data: base64Image, mime_type: mimeType }
    ];

    if (refFlooring && refFlooring.startsWith("data:")) {
      const match = refFlooring.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) inputs.push({ type: "image", data: match[2], mime_type: match[1] });
    }
    if (refWallpaper && refWallpaper.startsWith("data:")) {
      const match = refWallpaper.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) inputs.push({ type: "image", data: match[2], mime_type: match[1] });
    }
    if (refKitchen && refKitchen.startsWith("data:")) {
      const match = refKitchen.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) inputs.push({ type: "image", data: match[2], mime_type: match[1] });
    }

    const interaction = await ai.interactions.create({
      model: "gemini-3.1-flash-image",
      input: inputs,
      response_format: {
        type: "image"
      }
    });

    const imageBase64 = interaction?.output_image?.data;

    if (!imageBase64) {
      return NextResponse.json(
        { error: '画像の生成に失敗したか、ブロックされました。別の空間タイプやスタイルを選択してください。' },
        { status: 400 }
      );
    }

    // Now that there is an image to hand back, record the use: deduct the credit, count it against
    // both the connection and the account, and advance the cookie. Nothing above this point costs
    // the person anything.
    if (currentUser) {
      const { success, remainingCredits: updatedCredits } = await deductUserCredit(currentUser.id);
      if (success) remainingCredits = updatedCredits;
      await bumpCounter(IP_QUOTA_KEY(ip));
      if (currentUser.email) await bumpCounter(GOOGLE_QUOTA_KEY(currentUser.email));
      await incrementIpQuotaCookie();
    } else {
      await bumpCounter(IP_QUOTA_KEY(ip));
      await incrementIpQuotaCookie();
    }

    // Counting happens once, just above. It used to be repeated here as well, which charged two
    // uses for every generation.
    if (isDemoMode && !isPremium) {
      // PRO 회원 생성 기록 업데이트 (누적 횟수 증가 및 최종 생성 시각 업데이트)
      if (isProUser) {
        const record = proUsageTracker.get(trackingKey);
        if (record) {
          record.dailyCount += 1;
          record.lastGeneratedAt = Date.now();
        }
      }
    }

    return NextResponse.json({ image: imageBase64, remainingCredits });
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
