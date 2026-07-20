import type { Metadata, Viewport } from "next";
import "@fontsource/nanum-pen-script";
import "./globals.css";
import { SketchDefs } from "./components/sketch";
import { LanguageProvider } from "../lib/i18n";
import { LanguageSwitcher } from "./components/language-switcher";
import { ServiceWorkerRegistration } from "./components/service-worker-registration";

// Self-hosted Korean display handwriting — used only for short brand moments.

// Metadata follows the product default language (English); the in-app
// experience localizes itself after load.
export const metadata: Metadata = {
  title: "ARU | Find skincare for your skin today",
  description:
    "Check your skin with the AI camera and a short questionnaire, then explore product options and a simple K-beauty routine.",
  metadataBase: new URL("https://aru-beauty.vercel.app"),
  openGraph: {
    title: "ARU | Find skincare for your skin today",
    description: "Explore your skin today and review product options and a skincare routine together.",
    url: "https://aru-beauty.vercel.app",
    siteName: "ARU",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ARU today's skin report" }],
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
    <html lang="en" className="h-full antialiased">
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
