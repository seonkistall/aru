import type { Metadata } from "next";
import { Nanum_Pen_Script } from "next/font/google";
import "./globals.css";
import { SketchDefs } from "./components/sketch";

// Hand-drawn pen handwriting — the xiaohei "spontaneous sketch on white paper" voice.
const hand = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-hand",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "결 — 믿을 수 있는 화장품 추천",
  description: "과장 없이, 너한테 딱 맞는 셋. 카메라로 피부를 읽고 큐레이션해 드려요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${hand.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SketchDefs />
        {children}
      </body>
    </html>
  );
}
