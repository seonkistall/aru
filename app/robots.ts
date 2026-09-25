import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * `/robots.txt`. Before this existed the path was a 404, so a crawler had no
 * statement at all and no pointer to a sitemap.
 *
 * `/api/` is disallowed because nothing under it is a page and two of the
 * routes there spend the owner's money on a model call.
 *
 * The pages that must not be listed in search are NOT disallowed here. They
 * carry `robots: { index: false }` in their own metadata, and a crawler has to
 * be allowed to fetch a page to see that tag — a `Disallow` would hide the
 * instruction it is meant to obey. The split lives in `SEO_ROUTES`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
