import type { Metadata, Viewport } from "next";
import "@fontsource/nanum-pen-script";
import "./globals.css";
import { SketchDefs } from "./components/sketch";
import { LanguageProvider } from "../lib/i18n";
import { LanguageSwitcher } from "./components/language-switcher";
import { ServiceWorkerRegistration } from "./components/service-worker-registration";

// Self-hosted Korean display handwriting — used only for short brand moments.

export const metadata: Metadata = {
  title: "ARU | 오늘의 피부에 맞는 스킨케어 찾기",
  description:
    "AI 카메라와 간단한 설문으로 오늘의 피부를 살펴보고, 제품 후보와 스킨케어 루틴을 함께 확인해 보세요.",
  metadataBase: new URL("https://aru-beauty.vercel.app"),
  openGraph: {
    title: "ARU | 오늘의 피부에 맞는 스킨케어 찾기",
    description: "오늘의 피부를 살펴보고 제품 후보와 스킨케어 루틴을 함께 확인해 보세요.",
    url: "https://aru-beauty.vercel.app",
    siteName: "ARU",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ARU 오늘의 피부 리포트" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ARU | Find skincare for your skin today",
    description: "Explore your skin and build a simple K-beauty routine with ARU.",
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
        <ServiceWorkerRegistration />
        <SketchDefs />
        <LanguageProvider>
          <LanguageSwitcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
