import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// ローカル開発環境での動作確認のために .env.local をロード
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of envLines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        // クォーテーションのトリミング
        if (val.length > 0 && val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.log('Skipped loading .env.local:', e.message);
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set.');
  process.exit(1);
}

// SEOキーワードとテーマ候補 (ReRoomAI用 - 内装・壁紙・インテリア)
const topics = [
  {
    keyword: '壁紙 リフォーム 失敗 アクセントクロス',
    titleHint: 'アクセントクロス選びで後悔しない！失敗事例から学ぶおしゃれなお部屋の色の決め方',
    defaultEyecatch: '/blog/accent-cross-guide.png'
  },
  {
    keyword: 'リビング クロス 選び方 明るい',
    titleHint: '【2026決定版】リビングを広く明るく見せる壁紙クロスの選び方とおすすめ定番カラー',
    defaultEyecatch: '/blog/living-room-guide.png'
  },
  {
    keyword: '部屋 狭い 広く見せる 壁紙',
    titleHint: '狭い子ども部屋や寝室を劇的に広く見せる！壁紙選び・配色のコツと視覚トリック',
    defaultEyecatch: '/blog/kids-room-guide.jpg'
  },
  {
    keyword: '北欧風 インテリア 壁紙 コーディネート',
    titleHint: '憧れの北欧風インテリアを実現する！壁紙（クロス）の色選びと家具の組み合わせ実例',
    defaultEyecatch: '/blog/nordic-wallpaper-guide.png'
  },
  {
    keyword: '和モダン 壁紙 おしゃれ 張り替え',
    titleHint: '和室をモダンでおしゃれな空間に変身させる！和モダン壁紙クロスの選び方テクニック',
    defaultEyecatch: '/blog/japanese-modern-guide.png'
  }
];

const responseSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    title: { type: 'string' },
    excerpt: { type: 'string' },
    keywords: {
      type: 'array',
      items: { type: 'string' }
    },
    contentHtml: { type: 'string' }
  },
  required: ['slug', 'title', 'excerpt', 'keywords', 'contentHtml']
};

// 既存の記事と重複しない新しいトピックをGeminiで自動生成する関数
async function generateUniqueTopic(existingTitles, existingKeywords) {
  const prompt = `
あなたは住宅インテリアおよび壁紙・クロスリフォームの専門家であり、SEOコンサルタントです。
現在、ブログには以下のタイトルおよびテーマの記事がすでに存在します：
${existingTitles.map(t => `- ${t}`).join('\n')}

これらと内容が重複（ダブり）せず、かつ「壁紙・クロスリフォーム」「内装リフォーム」「インテリアコーディネート」に関連する、ユーザーの検索意図に沿った新しいターゲットSEOキーワードと記事タイトル案を1つ作成してください。
特に、以下の既存テーマとは絶対に重複しないようにしてください：
- 北欧風インテリアの壁紙・クロス選びと家具コーディネート
- アクセントクロスの選び方・失敗事例と色の決め方
- リビングを広く明るく見せる壁紙の選び方
- 狭い子ども部屋や寝室を広く見せる壁紙テクニック
- 壁紙・クロス選び全般の失敗しないコツやAIシミュレーション

魅力的な切り口（例：和室を和モダンに変える壁紙、DIYでのクロス貼りの限界と業者選定、ペットと暮らす部屋の壁紙選び、洗面所やトイレなど水回りの壁紙選び、最新のインテリアカラーのトレンドなど）を検討してください。

以下のJSONフォーマットに厳密に従って返却してください：
{
  "keyword": "ターゲットとなるSEOキーワード（日本語、スペース区切りで複数可）",
  "titleHint": "記事のタイトル案（日本語、魅力的でクリックしたくなるもの）"
}
`;

  console.log('Generating a completely new, unique topic using Gemini...');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          titleHint: { type: 'string' }
        },
        required: ['keyword', 'titleHint']
      }
    }
  });

  const generated = JSON.parse(response.text);
  console.log(`Generated Dynamic Topic: [Keyword: ${generated.keyword}] [TitleHint: ${generated.titleHint}]`);
  return generated;
}

async function generateArticle(selectedTopic) {
  const currentYear = new Date().getFullYear();
  const prompt = `
あなたのメインテーマは内装クロス・壁紙リフォームとインテリアコーディネートです。
ターゲットキーワード: "${selectedTopic.keyword}" を含み、以下のヒントに沿った高品質なSEO集客ブログ記事を生成してください。
タイトルヒント: "${selectedTopic.titleHint}"

【満たすべき条件】
1. 読者の悩みや疑問を解決する信頼性の高い情報を含め、自然な日本語で執筆してください。タイトルや本文中、要約（excerpt）などで「最新」や年号に言及する場合は、必ず現在の年である「${currentYear}年」を使用し、過去の年（2024年や2025年など）を使用しないでください（例：【${currentYear}年最新】）。
2. 見出し（h2, h3）、太字（<strong>）、順不同リスト（<ul> <li>）などを使って綺麗にマークアップされたHTML本文（contentHtml）にしてください。
3. 記事内の後半に、当サービス（ミセルリフォーム）のAIお部屋リフォームシミュレーションを紹介し、以下のCTAリンクを「必ず」中央寄せで設置してください（HTMLタグに含めてください）：
   <p class="text-center my-8">
     <a href="/?contact=false" class="inline-flex items-center justify-center rounded-full bg-clay px-8 py-4 text-sm font-bold text-paper hover:bg-ink transition-all hover:scale-105 shadow-lg gap-2">
       🎨 お部屋の無料AIシミュレーションを試す
     </a>
   </p>
4. JSON構造に厳密に従ってください。HTML本文内ではダブルクォーテーションを適切にエスケープするか、シングルクォーテーションを使用してください。
`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    }
  });

  const textContent = response.text;
  if (!textContent) {
    throw new Error('Empty response from Gemini API');
  }
  return JSON.parse(textContent);
}

// 記事の内容に沿ったアイキャッチ画像を生成・ダウンロードし、必ずローカル保存する関数
async function generateImage(title, excerpt, defaultEyecatch, keywords, existingEyecatches, slug) {
  console.log(`Generating matching eyecatch image for slug: ${slug}`);

  const promptForImagePrompt = `
You are an expert prompt engineer for AI image generators (Imagen 3).
Create a highly detailed, descriptive English prompt for generating an eye-catching, high-converting, professional blog cover image that perfectly matches the following article:

Article Title: ${title}
Article Excerpt: ${excerpt}

MANDATORY REQUIREMENTS FOR HIGH-CTR CLICK-WORTHY IMAGES:
1. CRITICAL ROOM TYPE MATCHING: Pay strict attention to the specific room/area in the Article Title and Excerpt. If title mentions '玄関' (entrance/foyer), describe a luxury Japanese genkan entrance foyer. If '和室' (tatami room), describe a Japanese modern tatami room. If '洗面所' or 'トイレ' (washroom/powder room), describe a stylish lavatory. If '子ども部屋' (kids room), describe a kids room. If 'リビング', describe a living room. DO NOT generate a living room if the article is about an entrance, toilet, or tatami room!
2. MUST be photorealistic, ultra-high quality, 8k resolution luxury architectural interior photography of the target room in Japan.
2. Must feature warm, inviting ambient cove lighting, elegant furniture, cozy atmosphere, and high-end Architectural Digest magazine aesthetic.
3. NO uncanny artifacts, NO text, NO empty, cold, plain, or monotonous bare rooms. ALWAYS include vibrant color harmony, warm inviting ambient lighting, stylish house plants, rich wallpaper textures, and high-end luxury feel.
4. Specify realistic lighting (e.g., "warm golden hour daylight", "soft cozy indoor LED lighting") and high-end camera details (e.g., "sharp focus, Architectural Digest style, detailed wallpaper texture, 8k resolution").
5. Do NOT include any text, overlays, UI elements, signs, or borders in the image.
6. Output ONLY the English prompt text, without any introductory or concluding remarks.
`;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, vertexai: false });
    const promptResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptForImagePrompt
    });

    const imagePrompt = promptResponse.text.trim();
    console.log(`Generated Image Prompt: ${imagePrompt}`);

    console.log("Attempting to generate image via Imagen 3 (imagen-3.0-generate-002)...");
    const imageResponse = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: `${imagePrompt}, luxury modern interior photography, high quality, 8k, architectural digest style, warm natural lighting`,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
        outputMimeType: "image/jpeg"
      }
    });

    if (imageResponse && imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
      const base64Image = imageResponse.generatedImages[0].image.imageBytes;
      console.log("Successfully generated image via Imagen 3!");
      return Buffer.from(base64Image, "base64");
    }
  } catch (e) {
    console.log("Gemini image generation skipped/failed:", e.message);
  }

  // Fallback 1: Pollinations AI
  try {
    console.log("Attempting Pollinations AI image generation...");
    const prompt = encodeURIComponent(`luxurious modern high-end architectural interior photography of stylish residential room in Japan, ${slug.replace(/-/g, " ")}, warm cozy lighting, architectural digest style, 8k resolution`);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=675&nologo=true`;
    const res = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 5000) {
        console.log(`Successfully generated image via Pollinations AI (${buffer.length} bytes)`);
        return buffer;
      }
    }
  } catch (e) {
    console.log("Pollinations AI image generation skipped/failed:", e.message);
  }

  // Fallback 2: High quality Unsplash interior photos
  const photoIds = [
    "photo-1616486338812-3dadae4b4ace", "photo-1618221195710-dd6b41faaea6", "photo-1586023492125-27b2c045efd7", "photo-1616046229478-9901c5536a45",
    "photo-1598928506311-c55ded91a20c", "photo-1600210492486-724fe5c67fb0", "photo-1600607687939-ce8a6c25118c", "photo-1600607687920-4e2a09cf159d",
    "photo-1617806118233-18e1db207faf", "photo-1502672260266-1c1ef2d93688", "photo-1554995207-c18c203602cb", "photo-1583847268964-b28dc8f51f92",
    "photo-1513694203232-719a280e022f", "photo-1484154218962-a197022b5858", "photo-1505691938895-1758d7feb511", "photo-1522771739844-6a9f6d5f14af"
  ];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const photoId = photoIds[Math.abs(hash) % photoIds.length];
  const unsplashUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`;

  try {
    console.log(`Downloading fallback interior photo from Unsplash: ${photoId}`);
    const res = await fetch(unsplashUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 5000) {
        console.log(`Downloaded image buffer from Unsplash (${buffer.length} bytes)`);
        return buffer;
      }
    }
  } catch (e) {
    console.log("Unsplash image download skipped/failed:", e.message);
  }

  // Fallback 3: Local file
  const publicBlogDir = path.join(process.cwd(), "public/blog");
  const localFiles = fs.readdirSync(publicBlogDir).filter(f => f.endsWith(".png") || f.endsWith(".jpg"));
  if (localFiles.length > 0) {
    const selectedFile = localFiles[Math.abs(hash) % localFiles.length];
    return fs.readFileSync(path.join(publicBlogDir, selectedFile));
  }

  throw new Error("No eyecatch image source available");
}

async function main() {
  try {
    // lib/blog.ts から既存のブログ記事の情報を読み込む
    const filePath = path.join(process.cwd(), 'lib/blog.ts');
    let fileContent = fs.readFileSync(filePath, 'utf-8');

    // 既存の記事タイトル、キーワード、スラッグ、アイキャッチを正規表現で抽出
    const existingTitles = [...fileContent.matchAll(/"title":\s*"([^"]+)"/g)].map(m => m[1]);
    const existingKeywords = [...fileContent.matchAll(/"keywords":\s*\[([\s\S]*?)\]/g)].flatMap(m => {
      return m[1].split(',').map(k => k.trim().replace(/"/g, ''));
    });
    const existingSlugs = [...fileContent.matchAll(/"slug":\s*"([^"]+)"/g)].map(m => m[1]);
    const existingEyecatches = [...fileContent.matchAll(/"eyecatch":\s*"([^"]+)"/g)].map(m => m[1]);

    console.log(`Loaded ${existingSlugs.length} existing articles from lib/blog.ts.`);

    // プリセットトピックからまだ使われていないものを抽出
    const unusedTopics = topics.filter(topic => {
      // タイトルまたは主要な類似表現が既に存在するかチェック
      const isTitleExists = existingTitles.some(title => title.includes(topic.titleHint.slice(0, 8)));
      return !isTitleExists;
    });

    let selectedTopic;
    if (unusedTopics.length > 0) {
      // 未使用のプリセットがあれば、そこからランダムに選択
      selectedTopic = unusedTopics[Math.floor(Math.random() * unusedTopics.length)];
      console.log(`Selected unused preset topic: [Keyword: ${selectedTopic.keyword}]`);
    } else {
      // すべてのプリセットが使用済みの場合は、Geminiで新しいユニークなテーマを生成
      selectedTopic = await generateUniqueTopic(existingTitles, existingKeywords);
    }

    console.log('Generating AI Blog post...');
    const article = await generateArticle(selectedTopic);

    // 既存のスラッグと重複した場合の回避措置
    if (existingSlugs.includes(article.slug)) {
      article.slug = `${article.slug}-${Date.now().toString().slice(-4)}`;
    }
    
    // 画像の生成とローカル保存（必ず public/blog に保存し、相対パスを指定）
    const blogDir = path.join(process.cwd(), 'public/blog');
    if (!fs.existsSync(blogDir)) {
      fs.mkdirSync(blogDir, { recursive: true });
    }
    const imageBuffer = await generateImage(article.title, article.excerpt, selectedTopic.defaultEyecatch, article.keywords, existingEyecatches, article.slug);
    const imageFilename = `${article.slug}.jpg`;
    const imagePath = path.join(blogDir, imageFilename);
    
    fs.writeFileSync(imagePath, imageBuffer);
    console.log(`Saved eyecatch image to ${imagePath}`);
    article.eyecatch = `/blog/${imageFilename}`;
    
    // 本日の日付
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    article.date = today;

    console.log(`Generated article title: ${article.title}`);

    // blogPosts 配列の定義部分を見つける
    const arrayStartMatch = fileContent.match(/export const blogPosts: BlogPost\[\] = \[\s*/);
    
    if (!arrayStartMatch) {
      throw new Error('Could not find blogPosts array in lib/blog.ts');
    }

    const insertIndex = arrayStartMatch.index + arrayStartMatch[0].length;
    
    // 挿入するJSONオブジェクトの生成
    const jsonString = JSON.stringify(article, null, 2);
    
    // 新しい記事を配列の先頭に追加
    const newContent = fileContent.slice(0, insertIndex) + jsonString + ',\n  ' + fileContent.slice(insertIndex);
    
    fs.writeFileSync(filePath, newContent, 'utf-8');
    // app/blog/page.tsx のリビルドタイムスタンプを更新して Vercel の静的ページ再構築を確実にトリガー
    const blogPagePath = path.join(process.cwd(), 'app', 'blog', 'page.tsx');
    if (fs.existsSync(blogPagePath)) {
      let blogPageContent = fs.readFileSync(blogPagePath, 'utf-8');
      blogPageContent = blogPageContent.replace(
        /\/\/ Rebuild trigger: .*/,
        `// Rebuild trigger: ${new Date().toISOString()}`
      );
      fs.writeFileSync(blogPagePath, blogPageContent, 'utf-8');
      console.log('Updated app/blog/page.tsx rebuild timestamp');
    }
    console.log('Successfully added new article to lib/blog.ts');
  } catch (error) {
    console.error('Failed to run blog generation:', error);
    process.exit(1);
  }
}

main();
