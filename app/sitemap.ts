import type { MetadataRoute } from "next";
import { SITE_ORIGIN, INDEXABLE_PATHS } from "@/lib/site";

/**
 * Three urls, and that number is the finding rather than an oversight — see the
 * comment block in `lib/site.ts` for which pages are excluded and why a session app
 * has so little a crawler can read.
 *
 * `lastModified` is deliberately absent. Next would let this route emit `new Date()`,
 * which would tell every crawler that all three pages changed on every build whether
 * or not anything did. A wrong freshness signal is worse than none: a sitemap that
 * cries wolf gets crawled less, not more.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((entry) => ({
    url: entry.path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${entry.path}`,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
