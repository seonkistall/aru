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

// Bilingual so international testers see a legible tab title / link preview
// before the client-side language switch kicks in.
export const metadata: Metadata = {
  title: "아루 ARU — 매일의 K뷰티 루틴 · Daily K-Beauty Ritual",
  description:
    "아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱. 카메라로 피부를 읽고 솔직하게 골라드려요. — A 30-second camera skin scan that honestly picks the 3 K-beauty products for you. KO·EN·日本語·中文.",
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
      <head>
        {/* Warm up the MediaPipe CDN + model host so the scan guide loads faster. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://storage.googleapis.com" crossOrigin="anonymous" />
      </head>
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
