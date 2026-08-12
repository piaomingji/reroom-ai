import { NextResponse } from 'next/server';
import { blogPosts } from '@/lib/blog';

export const runtime = 'nodejs';

export async function GET() {
  const siteUrl = 'https://reroom-ai-rust.vercel.app';

  const xmlItems = blogPosts
    .map((post) => {
      const postUrl = `${siteUrl}/blog/${post.slug}`;
      const pubDate = new Date(post.date).toUTCString();
      const eyecatchUrl = post.eyecatch.startsWith('http') 
        ? post.eyecatch 
        : `${siteUrl}${post.eyecatch}`;
      const imageType = post.eyecatch.endsWith('.png') ? 'image/png' : 'image/jpeg';

      return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${post.excerpt}]]></description>
      <enclosure url="${eyecatchUrl}" length="0" type="${imageType}" />
    </item>`;
    })
    .join('');

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ミセルリフォーム - お部屋リフォームお役立ちブログ</title>
    <link>${siteUrl}/blog</link>
    <description>お部屋の壁紙・クロス選びやシミュレーション活用術などのお役立ち情報を発信します。</description>
    <language>ja</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
    ${xmlItems}
  </channel>
</rss>`;

  return new NextResponse(rssFeed, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate',
    },
  });
}
