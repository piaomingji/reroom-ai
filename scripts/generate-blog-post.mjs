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
    eyecatch: '/blog/interior-color-guide.jpg'
  },
  {
    keyword: 'リビング クロス 選び方 明るい',
    titleHint: '【2026決定版】リビングを広く明るく見せる壁紙クロスの選び方とおすすめ定番カラー',
    eyecatch: '/blog/interior-color-guide.jpg'
  },
  {
    keyword: '部屋 狭い 広く見せる 壁紙',
    titleHint: '狭い子ども部屋や寝室を劇的に広く見せる！壁紙選び・配色のコツと視覚トリック',
    eyecatch: '/blog/interior-color-guide.jpg'
  },
  {
    keyword: '北欧風 インテリア 壁紙 コーディネート',
    titleHint: '憧れの北欧風インテリアを実現する！壁紙（クロス）の色選びと家具の組み合わせ実例',
    eyecatch: '/blog/interior-color-guide.jpg'
  },
  {
    keyword: '和モダン 壁紙 おしゃれ 張り替え',
    titleHint: '和室をモダンでおしゃれな空間に変身させる！和モダン壁紙クロスの選び方テクニック',
    eyecatch: '/blog/interior-color-guide.jpg'
  }
];

// ランダムにトピックを1つ選択
const selectedTopic = topics[Math.floor(Math.random() * topics.length)];

async function generateArticle() {
  const prompt = `
あなたは内装クロス・壁紙リフォームとインテリアコーディネートのプロのSEOライターです。
ターゲットキーワード: "${selectedTopic.keyword}" を含み、以下のヒントに沿った高品質なSEO集客ブログ記事を生成してください。
タイトルヒント: "${selectedTopic.titleHint}"

【満たすべき条件】
1. 読者の悩みや疑問を解決する信頼性の高い情報を含め、自然な日本語で執筆してください。
2. 見出し（h2, h3）、太字（<strong>）、順不同リスト（<ul> <li>）などを使って綺麗にマークアップされたHTML本文（contentHtml）にしてください。
3. 記事内の後半に、当サービス（ミセルリフォーム）のAIお部屋リフォームシミュレーションを紹介し、以下のCTAリンクを「必ず」中央寄せで設置してください：
   <p class="text-center my-8">
     <a href="/?contact=false" class="inline-flex items-center justify-center rounded-full bg-clay px-8 py-4 text-sm font-bold text-paper hover:bg-ink transition-all hover:scale-105 shadow-lg gap-2">
       🎨 お部屋の無料AIシミュレーションを試す
     </a>
   </p>
4. 出力は以下のJSON構造に厳密に従ってください。

【返却するJSONの構造スキーマ】
{
  "slug": "英語でURLに適したユニークなスラッグ（例: living-room-wallpaper-selection-guide）",
  "title": "読者を引きつけるSEOに強い記事タイトル",
  "excerpt": "記事の概要・抜粋（100〜150文字程度）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3"],
  "contentHtml": "h2、h3、p、ul、li、strong等のHTMLタグで構成された本文（markdownではなく素のHTML文字列）"
}
`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    }
  });

  const textContent = response.text;
  if (!textContent) {
    throw new Error('Empty response from Gemini API');
  }
  return JSON.parse(textContent);
}

async function main() {
  try {
    console.log('Generating AI Blog post...');
    const article = await generateArticle();
    
    // アイキャッチ画像の設定
    article.eyecatch = selectedTopic.eyecatch;
    // 本日の日付
    const today = new Date().toISOString().split('T')[0];
    article.date = today;

    console.log(`Generated: ${article.title}`);

    // lib/blog.ts の更新
    const filePath = path.join(process.cwd(), 'lib/blog.ts');
    let fileContent = fs.readFileSync(filePath, 'utf-8');

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
