import type { Metadata } from "next";

/**
 * The site's own origin, as already set in `app/layout.tsx`'s `metadataBase`.
 * Kept here so the sitemap and robots routes cannot drift from the metadata.
 * Changing this changes the production domain — it is not a cycle's to change.
 */
export const SITE_URL = "https://aru-beauty.vercel.app";

/**
 * Which routes a search engine may index.
 *
 * `index: true` means one thing only, and it was measured rather than assumed
 * (`docs/discovery-metadata.md`): a first-time visitor with EMPTY device storage
 * sees real content at this URL. Everything else in ARU renders from device
 * storage (localStorage or sessionStorage), so a crawler arriving cold gets an
 * empty state ("There's no report to continue from yet.") or a redirect. Those pages still get a title
 * and a description — people share them — but they do not belong in search
 * results, and `/ops`, `/pilot` and `/eval` are research-only.
 *
 * Language is chosen client-side from localStorage on these SAME URLs. There
 * are no per-locale paths, so there is nothing for an `hreflang` alternate to
 * point at; see §4 of the doc for what adding it would require.
 */
export type SeoRoute = {
  /** Path as served, always starting with "/". */
  path: string;
  title: string;
  description: string;
  /** May a search engine list this URL? */
  index: boolean;
};

export const SEO_ROUTES: readonly SeoRoute[] = [
  {
    path: "/",
    title: "ARU | Find skincare for your skin today",
    description:
      "Check your skin with the AI camera and a short questionnaire, then explore product options and a simple K-beauty routine.",
    index: true,
  },
  {
    path: "/scan",
    title: "Skin check with your phone camera | ARU",
    description:
      "Line up your face with the on-screen guide and ARU takes the photo once the light and angle look right. The camera check runs on your own device.",
    index: true,
  },
  {
    path: "/survey",
    title: "Skincare questionnaire | ARU",
    description:
      "Three short questions about product type, skin type and budget. ARU uses the answers to put together product options and a simple daily routine.",
    index: true,
  },
  {
    path: "/privacy",
    title: "Privacy and consent | ARU",
    description:
      "What ARU does with your photo and your answers: what stays on your device, what you opt into separately, and how to withdraw at any time.",
    index: true,
  },
  {
    path: "/report",
    title: "Your skin report | ARU",
    description:
      "Today's skin read with the product options that go with it, put together on your device from your own scan and answers.",
    index: false,
  },
  {
    path: "/care",
    title: "Products and routine | ARU",
    description:
      "Product details and a simple morning and evening order, built from the report already on your device.",
    index: false,
  },
  {
    path: "/checkin",
    title: "Routine check-in | ARU",
    description:
      "Note how a product has felt so far, so you can look back on your routine later.",
    index: false,
  },
  {
    path: "/studio",
    title: "Share card studio | ARU",
    description: "Edit the wording on your skin mood card before you share it.",
    index: false,
  },
  {
    path: "/unsubscribe",
    title: "Email reminder settings | ARU",
    description: "Stop the 2- and 4-week routine check-in emails from ARU.",
    index: false,
  },
  {
    path: "/ops",
    title: "ARU operations console",
    description: "Internal dashboard. Not part of the product.",
    index: false,
  },
  {
    path: "/pilot",
    title: "ARU pilot session",
    description: "Internal research tool for pilot participants. Not part of the product.",
    index: false,
  },
  {
    path: "/eval",
    title: "ARU evaluation console",
    description: "Internal research tool for scoring scans. Not part of the product.",
    index: false,
  },
] as const;

export function seoRoute(path: string): SeoRoute {
  const route = SEO_ROUTES.find((entry) => entry.path === path);
  if (!route) throw new Error(`No SEO route registered for ${path}`);
  return route;
}

export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * Per-route metadata. `openGraph` and `twitter` are written out in full rather
 * than partially: Next.js replaces a metadata field in a child segment instead
 * of deep-merging it, so a child that set only `openGraph.title` would drop the
 * root's `images` and the page would share with no preview picture at all.
 */
export function seoMetadata(path: string): Metadata {
  const { title, description, index } = seoRoute(path);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "ARU",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "ARU today's skin report" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
