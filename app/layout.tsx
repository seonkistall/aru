import type { Metadata, Viewport } from "next";
import "@fontsource/nanum-pen-script";
import "./globals.css";
import { SketchDefs } from "./components/sketch";
import { LanguageProvider } from "../lib/i18n";
import { LanguageSwitcher } from "./components/language-switcher";
import { ServiceWorkerRegistration } from "./components/service-worker-registration";
import { FunnelFlush } from "./components/funnel-flush";
import { PageViewScope } from "./components/page-view-scope";
import { SITE_URL, seoMetadata } from "../lib/seo";

// Self-hosted Korean display handwriting — used only for short brand moments.

// Metadata follows the product default language (English); the in-app
// experience localizes itself after load.
//
// This block is the DEFAULT for every route. Each route that has its own
// `layout.tsx` replaces it with `seoMetadata("/that-path")`; `/` has no layout
// of its own, so it is served from here — from the same `SEO_ROUTES` entry the
// sitemap reads, so the two cannot drift.
export const metadata: Metadata = {
  ...seoMetadata("/"),
  metadataBase: new URL(SITE_URL),
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
        <FunnelFlush />
        <PageViewScope />
        <SketchDefs />
        <LanguageProvider>
          <LanguageSwitcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
