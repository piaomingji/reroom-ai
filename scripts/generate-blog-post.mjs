import fs from 'fs';
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
  const prompt = `
あなたのメインテーマは内装クロス・壁紙リフォームとインテリアコーディネートです。
ターゲットキーワード: "${selectedTopic.keyword}" を含み、以下のヒントに沿った高品質なSEO集客ブログ記事を生成してください。
タイトルヒント: "${selectedTopic.titleHint}"

【満たすべき条件】
1. 読者の悩みや疑問を解決する信頼性の高い情報を含め、自然な日本語で執筆してください。
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

// 記事の内容に沿ったアイキャッチ画像を生成する関数 (Imagen 3がエラーの場合はUnsplashのフリー画像をフォールバック)
async function generateImage(title, excerpt, defaultEyecatch, keywords, existingEyecatches, slug) {
  const promptForImagePrompt = `
You are an expert prompt engineer for AI image generators (Imagen 3).
Create a highly detailed, descriptive English prompt for generating a blog cover image that perfectly matches the following article:

Article Title: ${title}
Article Excerpt: ${excerpt}

Requirements for the generated prompt:
1. Describe a realistic, high-quality, professional photograph of a residential house interior/room in Japan.
2. The image MUST visually represent the theme of the article. For example:
   - If the article is about "accent cross" or "accent wallpaper", describe a stylish bedroom or living room showing a prominent accent wall.
   - If the article is about "Nordic style", describe a bright room with Scandinavian style wallpaper and light oak wood furniture.
   - If the article is about "small room / kids room / bedroom", describe a cozy but neat, clean room with smart space-saving layout.
   - If the article is about "living room / bright room", describe a spacious bright living room with large windows letting in sunlight.
   - If the article is about "Japanese modern / washitsu", describe a modern Japanese tatami room with stylish textured washi wallpaper.
3. Specify realistic lighting (e.g., "warm afternoon sunlight", "bright daytime daylight") and setting (e.g., "clean room", "minimalist decoration").
4. Use interior photography style keywords: "professional interior design photography, modern Japanese residential interior, detailed texture, 8k resolution".
5. Do NOT include any text, overlays, UI elements, signs, or people in the image.
6. The prompt must be in English and output ONLY the prompt text, without any introductory or concluding remarks.
`;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const promptResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptForImagePrompt
    });

    const imagePrompt = promptResponse.text.trim();
    console.log(`Generated Image Prompt: ${imagePrompt}`);

    console.log('Attempting to generate image via Imagen 3...');
    // Imagenモデルで画像を生成
    const imageResponse = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: `${imagePrompt}, professional interior design photography, beautiful residential living room wall paint and cozy furniture, daytime daylight, highly detailed, blog header banner`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });

    const base64Image = imageResponse.generatedImages[0].image.imageBytes;
    return { type: 'buffer', data: Buffer.from(base64Image, 'base64') };
  } catch (error) {
    console.log('Imagen 3 generation failed or not supported. Falling back to specific image...', error.message);
    
    // プリセットのデフォルト画像が指定されており、まだ使われていない場合はそれを使用
    if (defaultEyecatch && !existingEyecatches.includes(defaultEyecatch)) {
      console.log(`Using default preset eyecatch: ${defaultEyecatch}`);
      return { type: 'url', data: defaultEyecatch };
    }
    
    // ダイナミックに生成されたトピックの場合、キーワードをもとにUnsplashから動的に合致する画像URLを作成
    // 同一画像が他の記事で使い回されないよう、クエリパラメータに一意の `sig=${slug}` を付与して一意性を担保
    const queryKeywords = keywords && keywords.length > 0 
      ? keywords.filter(k => k !== 'ReRoomAI' && k !== 'ミセルリフォーム').slice(0, 3).join(',')
      : 'interior,room';
    const dynamicUnsplashUrl = `https://images.unsplash.com/featured/1200x675/?${encodeURIComponent(queryKeywords)},interior,room&sig=${slug}`;
    
    // 静的なフォールバック画像リスト（他で使用済みのURLは排除する）
    const fallbackImages = [
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&q=80'
    ];
    
    // 未使用の画像のみにフィルタリング
    const unusedFallbackImages = fallbackImages.filter(img => !existingEyecatches.includes(img));
    
    if (unusedFallbackImages.length > 0) {
      const selectedUrl = unusedFallbackImages[Math.floor(Math.random() * unusedFallbackImages.length)];
      console.log(`Using unused fallback Unsplash image URL: ${selectedUrl}`);
      return { type: 'url', data: selectedUrl };
    } else {
      console.log(`Using unique dynamic Unsplash featured URL: ${dynamicUnsplashUrl}`);
      return { type: 'url', data: dynamicUnsplashUrl };
    }
  }
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
    
    // 画像の自動生成
    console.log('Generating matching eyecatch image...');
    const resultImage = await generateImage(article.title, article.excerpt, selectedTopic.defaultEyecatch, article.keywords, existingEyecatches, article.slug);
    
    if (resultImage.type === 'buffer') {
      const imageFilename = `${article.slug}.jpg`;
      const imagePath = path.join(process.cwd(), 'public/blog', imageFilename);
      fs.writeFileSync(imagePath, resultImage.data);
      console.log(`Saved generated eyecatch image to: public/blog/${imageFilename}`);
      article.eyecatch = `/blog/${imageFilename}`;
    } else {
      console.log(`Using fallback Unsplash image URL: ${resultImage.data}`);
      article.eyecatch = resultImage.data;
    }
    
    // 本日の日付
    const today = new Date().toISOString().split('T')[0];
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
    console.log('Successfully added new article to lib/blog.ts');
  } catch (error) {
    console.error('Failed to run blog generation:', error);
    process.exit(1);
  }
}

main();
