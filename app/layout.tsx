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
  metadataBase: new URL("https://reroom.smart-ai-portal.com"),
  title: "ミセルリフォーム - 理想の部屋生成AI | お部屋のリフォーム・模様替えシミュレーター",
  description:
    "お部屋の写真をアップロードして希望のスタイルを選ぶだけで、AIが約10秒で理想のリフォーム・模様替え完成予想図を作成。壁紙や床材の提案、提案カルテPDFの出力にも対応し、理想の空間づくりをスマートにします。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ミセルリフォーム",
  },
  openGraph: {
    title: "ミセルリフォーム - 理想の部屋生成AI | お部屋のリフォーム・模様替えシミュレーター",
    description:
      "お部屋の写真をアップロードしてスタイルを選ぶだけで、AIが約10秒で理想のリフォーム後の完成予想図を作成します。",
    url: "https://reroom.smart-ai-portal.com",
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
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full antialiased ${notoSerif.variable}`}>
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        <AuthProvider>
          {children}
          <AuthModal />
        </AuthProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
