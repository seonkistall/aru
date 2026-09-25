import type { MetadataRoute } from "next";
import { SEO_ROUTES, absoluteUrl } from "@/lib/seo";

/**
 * `/sitemap.xml`, built from the one route table so it cannot list a page that
 * is also `noindex`.
 *
 * No `lastModified`: nothing in the repository records when a page's content
 * last changed, and `new Date()` would stamp every entry with the moment the
 * sitemap was requested, which tells a crawler the whole site changed on every
 * fetch. An absent optional field is honest; a manufactured one is not.
 *
 * No `alternates.languages` either: language is chosen client-side on these
 * same URLs, so there is no per-locale URL for an alternate to point at.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return SEO_ROUTES.filter((route) => route.index).map((route) => ({
    url: absoluteUrl(route.path),
  }));
}
