import type { Metadata } from "next";
import { Noto_Serif_JP } from "next/font/google";
import "./globals.css";

const notoSerif = Noto_Serif_JP({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reroom-ai.vercel.app"),
  title: "ミセルリフォーム - 現場で使える完成予想図作成ツール",
  description:
    "お部屋の写真をアップロードしてスタイルを選ぶだけで、AIが約10秒でリフォーム後の完成予想図を作成。間取りや窓の位置はそのままに、新しい空間デザインをご提案します。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ReRoomAI",
  },
  openGraph: {
    title: "ミセルリフォーム - 現場で使える完成予想図作成ツール",
    description:
      "お部屋の写真をアップロードしてスタイルを選ぶだけで、AIが約10秒で完成予想図を作成します。",
    url: "https://reroom-ai.vercel.app",
    siteName: "ミセルリフォーム",
    images: [
      {
        url: "/living_room_after.png",
        width: 1200,
        height: 1200,
        alt: "ミセルリフォーム 和モダンリフォーム提案ショーケース",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

import PwaRegister from "@/components/PwaRegister";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full antialiased ${notoSerif.variable}`}>
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
