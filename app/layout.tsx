import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SketchDefs } from "./components/sketch";
import { LanguageProvider } from "../lib/i18n";
import { LanguageSwitcher } from "./components/language-switcher";

// Hand-drawn pen handwriting — the xiaohei "spontaneous sketch on white paper" voice.

// Bilingual so international testers see a legible tab title / link preview
// before the client-side language switch kicks in.
export const metadata: Metadata = {
  title: "아루 ARU — 매일의 K뷰티 루틴 · Daily K-Beauty Ritual",
  description:
    "아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱. 카메라로 피부를 읽고 최대 3가지 선택을 솔직하게 골라드려요. — A 30-second camera skin scan that honestly picks up to 3 K-beauty products for you. KO·EN·日本語·中文.",
  metadataBase: new URL("https://aru-beauty.vercel.app"),
  openGraph: {
    title: "아루 ARU — 매일의 K뷰티 루틴 · Daily K-Beauty Ritual",
    description: "30초 카메라 피부 스캔으로 최대 3가지 K뷰티 선택과 루틴을 골라드려요. A 30-second camera skin scan that honestly picks your K-beauty routine.",
    url: "https://aru-beauty.vercel.app",
    siteName: "아루 ARU",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "아루 ARU — 30-second K-beauty skin scan" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "아루 ARU — Daily K-Beauty Ritual",
    description: "A 30-second camera skin scan that honestly picks your K-beauty routine. KO·EN·日本語·中文.",
    images: ["/og.png"],
  },
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
    <html lang="ko" className="h-full antialiased">
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
