import type { MetadataRoute } from "next";
import { SITE_ORIGIN, INDEXABLE_PATHS, CRAWLER_DISALLOW } from "@/lib/site";

/**
 * ARU had no robots.txt and no sitemap at all until 2026-09-21, which mattered more
 * than it sounds: search is the only user-acquisition channel that costs nothing, and
 * the revenue model (`scripts/revenue-model.mjs`) puts the binding constraint on
 * traffic rather than on product quality.
 *
 * Two jobs here, and the second is the one worth being careful about. The research
 * surfaces (`/ops`, `/pilot`, `/eval`) already 404 in production unless
 * `INTERNAL_TOOLS_*` is set, and their layouts already send `robots: noindex`. This
 * adds the crawl-time refusal in front of both, so a crawler that reaches a deploy
 * where those ARE enabled never requests them. Defence in depth for a surface that
 * exports participant data.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: INDEXABLE_PATHS.map((entry) => entry.path),
      disallow: CRAWLER_DISALLOW,
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    // No `host`. Next emits it verbatim as `Host: https://…`, but the directive is a
    // Yandex extension that takes a bare hostname — Google ignores it and the one
    // crawler that reads it would be handed a form it does not accept. A malformed
    // line in robots.txt is not worth a directive nothing needs.
  };
}
