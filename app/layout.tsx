import type { Metadata } from "next";
import { Fraunces, Gowun_Batang } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const gowun = Gowun_Batang({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-gowun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "결 — 믿을 수 있는 화장품 추천",
  description: "과장 없이, 너한테 딱 맞는 셋. 카메라로 피부를 읽고 큐레이션해 드려요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${fraunces.variable} ${gowun.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
