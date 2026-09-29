import { expect, test, type Page } from "@playwright/test";

/**
 * Cycle 39, acquisition. Measured on a production build before this spec
 * existed: `/robots.txt` and `/sitemap.xml` both answered 404, and `/`, `/scan`,
 * `/survey`, `/report`, `/care`, `/checkin`, `/studio`, `/privacy` and
 * `/unsubscribe` all served the root layout's single title, single description,
 * no canonical and no robots tag. A search engine had no statement about the
 * site and no way to tell one page from another.
 *
 * The unit test (`tests/seo-metadata.test.ts`) pins the route table. This pins
 * what a crawler is actually served over HTTP, which is the only thing that
 * matters: a table can be right while a layout is missing.
 */

const INDEXABLE = ["/", "/scan", "/survey", "/privacy", "/guide/serum-for-combination-skin", "/guide/toner-for-oily-skin"];
const NOINDEX = ["/report", "/care", "/checkin", "/studio", "/unsubscribe"];

/**
 * `/ops`, `/pilot` and `/eval` are internal, and what a crawler is served for them
 * depends on which server started: `proxy.ts` -> `internalAccessDecision()` returns
 * "allow" only when `NODE_ENV !== "production"`. Since cycle 56 the gate runs against
 * `next build` + `next start`, where — with no `INTERNAL_TOOLS_USER` /
 * `INTERNAL_TOOLS_PASSWORD` in the gate's environment, and the gate sets none — the proxy
 * answers 404 with `X-Robots-Tag: noindex, nofollow` before the page renders. Measured
 * against the running gate server on 2026-09-29: `ops_status=404` and
 * `x-robots-tag: noindex, nofollow`.
 *
 * So they are asserted separately, and per server rather than as an either/or: under the
 * `ARU_E2E_SERVER=dev` opt-in the page renders and its own meta tag has to carry the
 * noindex; under the production default the route must not be reachable at all and the
 * header has to carry it. A 401 in the production branch would mean credentials reached
 * the gate's environment, which is why it is not accepted here.
 */
const INTERNAL = ["/ops", "/pilot", "/eval"];
const internalRendersHere = process.env.ARU_E2E_SERVER === "dev";

const ORIGIN = "https://aru-beauty.vercel.app";

async function head(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  return {
    status,
    title: await page.title(),
    description: await page.locator('head meta[name="description"]').getAttribute("content"),
    canonical: await page.locator('head link[rel="canonical"]').getAttribute("href"),
    robots: await page.locator('head meta[name="robots"]').getAttribute("content"),
    ogTitle: await page.locator('head meta[property="og:title"]').getAttribute("content"),
    ogImage: await page.locator('head meta[property="og:image"]').getAttribute("content"),
    ogUrl: await page.locator('head meta[property="og:url"]').getAttribute("content"),
  };
}

test("robots.txt allows the site, disallows /api/ and points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /api/");
  expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  // A Disallow would stop a crawler reading the noindex tag it is meant to obey.
  for (const path of [...NOINDEX, ...INTERNAL]) expect(body).not.toContain(`Disallow: ${path}`);
});

test("sitemap.xml lists the indexable pages and nothing that is noindex", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const body = await response.text();
  const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locations).toEqual(INDEXABLE.map((path) => (path === "/" ? ORIGIN : `${ORIGIN}${path}`)));
  for (const path of [...NOINDEX, ...INTERNAL]) expect(locations).not.toContain(`${ORIGIN}${path}`);
  expect(body).not.toContain("<lastmod>");
  // No per-locale URLs exist, so no alternate can honestly be claimed.
  expect(body).not.toContain("hreflang");
});

for (const path of INDEXABLE) {
  test(`${path} is served as indexable, with its own title and canonical`, async ({ page }) => {
    const meta = await head(page, path);
    expect(meta.status).toBe(200);
    expect(meta.robots).toBe("index, follow");
    expect(meta.canonical).toBe(path === "/" ? ORIGIN : `${ORIGIN}${path}`);
    expect(meta.title.length).toBeGreaterThan(8);
    expect(meta.description?.length ?? 0).toBeGreaterThan(30);
    expect(meta.ogTitle).toBe(meta.title);
    expect(meta.ogUrl).toBe(meta.canonical);
    // Absolute, or a messenger scraper cannot fetch it.
    expect(meta.ogImage).toBe(`${ORIGIN}/og.png`);
  });
}

test.describe("noindex routes, as served", () => {
  // `/report` client-redirects to `/survey` on a first visit with empty storage,
  // and Next adds the new route's tags to <head> during that navigation, so an
  // in-page read that loses the race sees two `og:url`s. A crawler or a share
  // scraper does not run the script either, so read the served document with
  // JavaScript off.
  test.use({ javaScriptEnabled: false });

  for (const path of NOINDEX) {
    test(`${path} is served noindex but still describes itself for a shared link`, async ({ page }) => {
      const meta = await head(page, path);
      expect(meta.status).toBe(200);
      expect(meta.robots).toBe("noindex, nofollow");
      expect(meta.canonical).toBe(`${ORIGIN}${path}`);
      expect(meta.title.length).toBeGreaterThan(8);
      expect(meta.ogTitle).toBe(meta.title);
      expect(meta.ogImage).toBe(`${ORIGIN}/og.png`);
    });
  }
});

for (const path of INTERNAL) {
  test(`${path} is kept out of a crawler's index the way this server serves it`, async ({ request }) => {
    const response = await request.get(path);
    if (internalRendersHere) {
      expect(response.status()).toBe(200);
      expect(await response.text()).toMatch(/<meta name="robots" content="noindex, nofollow"\s*\/?>/);
      return;
    }
    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });
}

/**
 * Read over plain HTTP rather than in a page: `/report` client-redirects to
 * `/survey` on a first visit with empty storage, which tears the document out
 * from under a locator. The served document is also exactly what a crawler's
 * first fetch gets.
 */
test("no two pages share a title or a description", async ({ request }) => {
  const titles: string[] = [];
  const descriptions: string[] = [];
  // The internal three serve no document in production, where `tests/seo-metadata.test.ts`
  // is what holds their titles and descriptions apart (its own `new Set(...)` checks).
  for (const path of [...INDEXABLE, ...NOINDEX, ...(internalRendersHere ? INTERNAL : [])]) {
    const html = await (await request.get(path)).text();
    titles.push(html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "");
    descriptions.push(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  }
  expect(titles.filter((t) => t.length > 8)).toHaveLength(titles.length);
  expect(new Set(titles).size).toBe(titles.length);
  expect(new Set(descriptions).size).toBe(descriptions.length);
});

test("the shared-link preview image is the declared 1200x630 and loads", async ({ request }) => {
  const response = await request.get("/og.png");
  expect(response.status()).toBe(200);
  const body = await response.body();
  expect(body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
});
