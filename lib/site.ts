/**
 * What a crawler may see, stated once.
 *
 * `app/robots.ts` and `app/sitemap.ts` are two files that have to agree, and a
 * disagreement between them is the kind that nobody notices: a path in the sitemap
 * and in `disallow` is a crawl request the robots file then refuses, which Search
 * Console reports as an error against the sitemap rather than against the rule.
 * `tests/seo-surface.test.ts` fails if the two sets overlap.
 *
 * ## Why this list is short, and what that costs
 *
 * ARU is a session app. `/report`, `/care`, `/checkin` and `/studio` all read
 * `sessionStorage` written by an earlier step, so a crawler — which arrives with an
 * empty session — sees the empty state of each. Indexing them would put four
 * near-identical "nothing here yet" pages into the index under a brand that has no
 * pages to outrank them. So three URLs are indexable and the rest are not, and the
 * honest reading of that is not "the SEO config is small" but **ARU has almost no
 * indexable surface**. Fixing that means content, not configuration; the plan is in
 * `docs/marketing-plan.md`.
 *
 * ## The hreflang problem this file does not solve
 *
 * ARU ships five languages from ONE url each — the language is chosen client-side by
 * `LanguageProvider`, never by the path or a query parameter. So there is no
 * per-language url to declare as an alternate, and `alternates.languages` would have
 * to point every language at the same address, which tells a crawler nothing. A
 * Korean-language search cannot rank a page whose server-rendered copy is English.
 * Recorded in `docs/marketing-plan.md` as the structural SEO limit it is; changing it
 * is a routing decision, not a metadata one.
 */

/** Matches `metadataBase` in `app/layout.tsx`; both must move together. */
export const SITE_ORIGIN = "https://aru-beauty.vercel.app";

export type IndexablePath = {
  path: string;
  /** Sitemap hint only. Crawlers treat it as a hint and nothing more. */
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
  why: string;
};

export const INDEXABLE_PATHS: IndexablePath[] = [
  { path: "/", changeFrequency: "weekly", priority: 1, why: "The only page that renders the same for a crawler as for a user." },
  { path: "/scan", changeFrequency: "monthly", priority: 0.8, why: "The entry point every acquisition channel points at. Renders its pre-camera state without a session." },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3, why: "Static, and an app asking for camera permission should have a findable privacy page." },
];


/**
 * Pages whose crawlable state is an empty one: each reads `sessionStorage` an earlier
 * step wrote, and a crawler arrives with none of it.
 *
 * Kept as its own constant because the first version of this file listed four of them
 * by hand and left out `/survey`, which reads `DEVICE_DATA_KEY.scan` and
 * `DEVICE_DATA_KEY.survey` for exactly the same reason — so `Allow: /` made it fully
 * crawlable while it was in no sitemap. `tests/seo-surface.test.ts` iterates THIS
 * list rather than repeating it, so the next page added here is covered without
 * anyone remembering to update a second copy.
 */
export const SESSION_ONLY_PATHS: string[] = [
  "/survey",
  "/report",
  "/care",
  "/checkin",
  "/studio",
  "/reco",
];

/**
 * Paths no crawler should request.
 *
 * `/ops`, `/pilot` and `/eval` are research surfaces that export participant data and
 * 404 in production unless `INTERNAL_TOOLS_*` is set. Their layouts already send
 * `robots: noindex`, which is a *response* header — it only helps once the page has
 * been fetched. This refuses the fetch.
 *
 * The session pages are listed for a different reason: not secrecy, but that their
 * crawlable state is an empty one — see SESSION_ONLY_PATHS just below.
 */

export const CRAWLER_DISALLOW: string[] = [
  "/api/",
  "/ops",
  "/pilot",
  "/eval",
  "/unsubscribe",
  ...SESSION_ONLY_PATHS,
];
