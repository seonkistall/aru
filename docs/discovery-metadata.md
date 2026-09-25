# Can a search engine or a link preview find and describe ARU?

Cycle 39, 2026-09-25. Acquisition, not polish: organic search and shared-link
previews are the only zero-cost acquisition channels this codebase controls, and
the owner's rule is to answer "how do the first 100 users arrive" before more
product work.

Everything below was measured against a production build (`npm run build` then
`npx next start -p 3199`), not read off the source.

## 1. What a crawler was served before this cycle

`/robots.txt` and `/sitemap.xml` did not exist as routes:

```
/robots.txt -> 404 ct=text/html; charset=utf-8 bytes=14021
/sitemap.xml -> 404 ct=text/html; charset=utf-8 bytes=14021
/sitemap.txt -> 404 ct=text/html; charset=utf-8 bytes=14021
```

And every reachable page served the root layout's single metadata block. The
`<title>`, `<meta name="description">`, `<link rel="canonical">`,
`<meta name="robots">` and `og:url` of `/`, `/scan`, `/survey`, `/report`,
`/care`, `/checkin`, `/studio`, `/privacy` and `/unsubscribe` were, on all nine:

```
title:  ARU | Find skincare for your skin today
desc:   Check your skin with the AI camera and a short questionnaire, then explore
        product options and a simple K-beauty routine.
canon:  <none>
robots: <none>
og:url: https://aru-beauty.vercel.app
```

`/ops`, `/pilot` and `/eval` answered **404** — `proxy.ts` gates them through
`internalAccessDecision`, which returns `not-found` outside a deploy that sets
`INTERNAL_TOOLS_USER` and `INTERNAL_TOOLS_PASSWORD`. So their `noindex` tag was
never reachable in this configuration; the 404 was doing the work.

`og:image` was already **`https://aru-beauty.vercel.app/og.png`** — absolute, via
`metadataBase` — on all nine. That half was not broken.

## 2. Which pages deserve to be in an index, measured

"Indexable" was decided by one question, answered in a real Chromium at 360x800
against the production build with a **fresh context per page** (empty
localStorage): what does a first-time visitor actually see? A crawler arriving
cold is exactly that visitor.

| path | final URL | localStorage keys | innerText chars | first line |
|---|---|---|---|---|
| `/` | `/` | 2 | 754 | "ARU Beauty, part of every day…" |
| `/scan` | `/scan` | 2 | 567 | "30-SECOND SKIN CHECK…" |
| `/survey` | `/survey` | 2 | 713 | "Let's find skincare that suits you…" |
| `/report` | **`/survey`** | 2 | 713 | (redirected away) |
| `/care` | `/care` | 2 | 235 | "There's no report to continue from yet." |
| `/checkin` | `/checkin` | 2 | 289 | "No products in use have been logged yet" |
| `/studio` | `/studio` | 0 | 406 | "Edit the text before sharing" (shipped preset) |
| `/privacy` | `/privacy` | 0 | 1424 | "How we use your photos and data" |
| `/unsubscribe` | `/unsubscribe` | 0 | 182 | "This link can't be used or has expired." |
| `/reco` | **`/survey`** | 2 | 713 | (307 to `/report`, then redirected away) |

So four pages stand on their own with empty storage — `/`, `/scan`, `/survey`,
`/privacy` — and those are the four in the sitemap. `/report` redirects.
`/care` and `/checkin` render an empty state. `/studio` renders `PRESETS[0]`,
the shipped placeholder card, because the real one is read from `sessionStorage`
(`app/studio/page.tsx:49`) and a crawler has none. `/unsubscribe` needs a token.

`/reco` gets no entry in the route table at all: it is `redirect("/report")` in a
server component, answers **307**, and renders nothing a crawler keeps.

## 3. What changed

One route table, `SEO_ROUTES` in [`lib/seo.ts`](../lib/seo.ts), is the single
source for the sitemap, the canonicals and the index/noindex split. Next.js's own
metadata-route conventions do the rest: `app/robots.ts`, `app/sitemap.ts`, and a
`layout.tsx` per route exporting `seoMetadata("/that-path")`.

After, on the same production build:

```
### /robots.txt http=200 ct=text/plain bytes=91
User-Agent: *
Allow: /
Disallow: /api/

Sitemap: https://aru-beauty.vercel.app/sitemap.xml
### /sitemap.xml http=200 ct=application/xml bytes=346
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>https://aru-beauty.vercel.app</loc>
</url>
<url>
<loc>https://aru-beauty.vercel.app/scan</loc>
</url>
<url>
<loc>https://aru-beauty.vercel.app/survey</loc>
</url>
<url>
<loc>https://aru-beauty.vercel.app/privacy</loc>
</url>
</urlset>
```

Three decisions in there are worth the words:

**The noindex pages are NOT disallowed in `robots.txt`.** A `Disallow` stops a
crawler fetching the page, so it never reads the `noindex` tag it is supposed to
obey. Belt-and-braces is the wrong instinct here; only `/api/` is disallowed,
where nothing is a page and two routes spend the owner's money on a model call.
`tests/seo-metadata.test.ts` and the e2e both assert no noindex path appears
under a `Disallow`.

**No `lastModified` in the sitemap.** Nothing in this repository records when a
page's content last changed, and `new Date()` — which the Next.js doc's own
example uses — would stamp every entry with the moment the sitemap was fetched,
telling a crawler the whole site changed on every crawl. An absent optional field
is honest; a manufactured one is not. `<loc>` is the only required child.

**`openGraph` and `twitter` are written out in full on every route.** Next.js
replaces a metadata field in a child segment rather than deep-merging it. A route
layout that set only `openGraph.title` would silently drop the root's `images`
and ship a page that shares with no preview picture. That is break C in §6: it
costs **12 of 16** e2e cases.

## 4. Why there is no `hreflang`, and what adding it would need

Language is chosen client-side from `localStorage` (`aru.lang`) on the SAME URLs.
`https://aru-beauty.vercel.app/scan` is the Korean page, the English page, the
Japanese page, the Chinese page and the Arabic page, depending on what is in the
visitor's browser. There are no per-locale paths and no locale query parameter.

An `hreflang` alternate names a URL that serves a specific language. ARU has none
to name, so any alternate written today would point a crawler at a URL that
serves whatever the crawler's own storage happens to hold — which is nothing, so
it would serve the default. Next.js's sitemap convention does support
`alternates.languages`, and using it here would be inventing a URL structure that
does not exist. The e2e asserts the sitemap contains no `hreflang`.

What it would take is an **owner decision about URL structure**, not a plumbing
change: per-locale paths (`/en/scan`, `/ko/scan`) or a locale subdomain, each
page rendered server-side in that language, each with its own canonical, and the
client-side switcher changed to navigate rather than to re-render. That is a
routing change across every page and every internal link, and it is the only
thing that makes ARU findable in a Korean search rather than only an English one
— which, given the product is Korean-facing, is probably the larger prize here.
It is recorded as a backlog item, not attempted.

## 5. The shared-link preview

`public/og.png` is a real PNG at **1200x630**, **40556 bytes**, sha256
`67c60326d910d3a818170e493a13b661e38eefe695ed79ba4e148780561749e2` — matching the
`width`/`height` the metadata declares, which is the defect this check was
looking for. `og:image` resolves to the absolute
`https://aru-beauty.vercel.app/og.png` on every page, before and after this
cycle. **No defect found.** The e2e now fetches `/og.png`, checks the PNG
signature bytes and reads the IHDR width and height, so a replacement image of
the wrong size fails rather than silently shipping a cropped preview.

What did change for previews: every page now carries its own `og:title` and
`og:description`, so a `/report` link pasted into a messenger no longer reads
"ARU | Find skincare for your skin today" like every other link. Per-RESULT
previews are still not possible and that is unchanged — the skin levels live in
the URL fragment (`#m=NNN`), which no scraper receives. That fork is the
2026-09-15 blocker in `docs/share-preview-findings.md`.

## 6. Broken on purpose

Every count below was re-run on the committed tree. `tests/seo-metadata.test.ts`
is **38 passed**; `tests/e2e/discovery-metadata.regression-26.spec.ts` is
**16 passed**.

| break | unit | e2e |
|---|---|---|
| A — delete `app/robots.ts` and `app/sitemap.ts` | file fails to load | 2 failed / 14 passed |
| B — sitemap lists every route, not just the indexable ones | 2 failed / 36 passed | 1 failed / 15 passed |
| C — a route's `openGraph` carries only title/description/url | 1 failed / 37 passed | **12 failed / 4 passed** |
| D — `robots.txt` also disallows the noindex paths | 2 failed / 36 passed | 1 failed / 15 passed |
| E — `app/scan/layout.tsx` is missing | 1 failed / 37 passed | 2 failed / 14 passed |

B and D are the "weaker but still plausible" ones: listing everything so a search
engine "finds it all", and disallowing the pages you do not want indexed. Both
are the obvious thing to do and both are wrong, and both now fail.

## 7. Research: Next.js's own documentation source

Three files from `vercel/next.js` at `canary`, fetched from
`raw.githubusercontent.com`, which is the one host on this network that serves
real content (the 2026-09-16 entry in BLOCKERS). `vercel.com` and
`developer.mozilla.org` were not tried again this cycle; they are recorded as
refusing in the 2026-09-15 and 2026-09-25 blocker entries.

```
.../docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.mdx
  -> http=200 bytes=4780
     sha256=e8003da970452a059001ea1817f82b7744059a00396fb99c2be68684454a17cd
.../docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.mdx
  -> http=200 bytes=11672
     sha256=c259e4972b7bbd31e2462d5538bdb29e91e26578046205e445808650d92c4a8c
.../docs/01-app/03-api-reference/04-functions/generate-metadata.mdx
  -> http=200 bytes=49181
     sha256=68e0ff80fa633a99fe65ac1b6f1d7f7ededa666adc0a407a1ab43f43cf7ebe1a
```

Three things in those files decided the shape of this change:

- `robots.mdx` line 20: "Add a `robots.js` or `robots.ts` file that returns a
  [`Robots` object]", with `rules` taking either one object or an array and
  `sitemap` a string. That is why `app/robots.ts` exists instead of a static
  `public/robots.txt` — the sitemap URL then comes from the same `SITE_URL`
  constant the sitemap route uses.
- `sitemap.mdx` line 42: "You can use the `sitemap.(js|ts)` file convention to
  programmatically **generate** a sitemap by exporting a default function that
  returns an array of URLs." Its example sets `lastModified: new Date()`, which
  is what §3 declines to copy.
- `generate-metadata.mdx` lines 395-396: "`metadataBase` allows URL-based
  `metadata` fields defined in the **current route segment and below** to use a
  **relative path**… The field's relative path will be composed with
  `metadataBase` to form a fully qualified URL." That is why every route layout
  can write `canonical: "/scan"` and `"/og.png"` and still serve absolute URLs,
  and why `metadataBase` stays exactly where and what it was.

## 8. What this does not establish

- **Nothing was submitted to a search engine.** No Search Console, no ping, no
  IndexNow. Whether Google or Naver ever crawls these URLs is not something this
  repository can make true, and none of it was attempted.
- **No traffic number changed.** This is a precondition for organic acquisition,
  not evidence of any. There is no measurement here that anyone arrived.
- **The production deploy was not checked.** Everything is measured against a
  local production build. Whether `aru-beauty.vercel.app` serves these routes is
  a deploy away and was not verified.
- **The titles are English only.** The root layout is `lang="en"` and metadata is
  rendered server-side before any locale is known, so a Korean searcher sees an
  English title. That is the same gap §4 describes and has the same fix.
- **`efficacyClean` is a weak check on English copy.** Its banned list is
  entirely Korean, so every English string passes it trivially. The test runs it
  anyway (the guardrail says it stays on) and adds an English claim list beside
  it — `treat`, `cure`, `diagnos`, `acne`, `dermatolog`, `clinical`,
  `whitening`, `proven` and ten more — which is what actually has teeth here.
