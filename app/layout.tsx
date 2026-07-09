import type { Metadata, Viewport } from "next";
import { Nanum_Pen_Script } from "next/font/google";
import "./globals.css";
import { SketchDefs } from "./components/sketch";
import { LanguageProvider } from "../lib/i18n";
import { LanguageSwitcher } from "./components/language-switcher";

// Hand-drawn pen handwriting — the xiaohei "spontaneous sketch on white paper" voice.
const hand = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-hand",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "아루 ARU — 매일의 K뷰티 루틴",
  description: "아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱. 카메라로 피부를 읽고 솔직하게 골라드려요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${hand.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SketchDefs />
        <LanguageProvider>
          <LanguageSwitcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
