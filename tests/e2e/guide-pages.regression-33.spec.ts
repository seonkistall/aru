import { expect, test, type Page } from "@playwright/test";

/**
 * Cycle 46, acquisition. Two indexable guide pages built from the catalogue
 * (`lib/guides.ts`), shipped as a search experiment with a kill criterion
 * (docs/AUTOPILOT.md, Backlog > Now).
 *
 * What this pins that a unit test cannot: that the body is in the FIRST HTML
 * response. A page whose text arrives in a client effect is an empty page to
 * anything that does not run scripts, and the only reason these two exist is to
 * be read by something that might not. So the substance is checked with
 * JavaScript disabled, and the geometry at 360x800 with it on.
 */

const GUIDES = [
  {
    path: "/guide/serum-for-combination-skin",
    h1: "Serums for combination skin",
    rows: ["sr1", "sr2", "sr3", "sr4"],
    other: "/guide/toner-for-oily-skin",
  },
  {
    path: "/guide/toner-for-oily-skin",
    h1: "Toners for oily skin",
    rows: ["tn1", "tn2", "tn3"],
    other: "/guide/serum-for-combination-skin",
  },
];

/** The words a reader gets from the served document alone. */
function wordsInBody(html: string): number {
  const body = html.slice(html.indexOf("<body"));
  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ");
  return text.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

test.describe("served without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const guide of GUIDES) {
    test(`${guide.path} has its whole body in the first response`, async ({ request }) => {
      const response = await request.get(guide.path);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(html).toContain(guide.h1);
      // Every product row, by the data attribute the view stamps on it.
      for (const id of guide.rows) expect(html).toContain(`data-guide-row="${id}"`);
      // Both hand-offs into the product, and the cross-link.
      expect(html).toContain('href="/scan"');
      expect(html).toContain('href="/survey"');
      expect(html).toContain(`href="${guide.other}"`);
      expect(html).toContain("Take the 30-second scan");
      // Not a stub: the body carries real prose, not a loading shell.
      expect(wordsInBody(html)).toBeGreaterThan(250);
    });

    test(`${guide.path} renders that body in a browser with scripts off`, async ({ page }) => {
      await page.goto(guide.path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toHaveText(guide.h1);
      await expect(page.locator("[data-guide-row]")).toHaveCount(guide.rows.length);
      await expect(page.locator('[data-guide-cta="scan"]')).toBeVisible();
      await expect(page.locator('[data-guide-cta="survey"]')).toBeVisible();
    });
  }

  test("the landing page links both guides where a crawler reaches them", async ({ request }) => {
    const html = await (await request.get("/")).text();
    for (const guide of GUIDES) {
      expect(html).toContain(`href="${guide.path}"`);
      expect(html).toContain(guide.h1);
    }
  });

  /**
   * The bug this cycle fixed. `/offline.html` is a static page in `public/`, so
   * the route-table guard that walks `app/` could never see it: it answered 200
   * with a title and no robots tag.
   */
  test("/offline.html is served noindex", async ({ request }) => {
    const response = await request.get("/offline.html");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

for (const guide of GUIDES) {
  test(`${guide.path} fits 360x800 with no sideways scroll`, async ({ page }) => {
    await page.goto(guide.path);
    const { scrollWidth, clientWidth } = await overflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    for (const selector of ['[data-guide-cta="scan"]', '[data-guide-cta="survey"]']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.height, selector).toBeGreaterThanOrEqual(44);
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(360);
    }

    // The h1 must clear the fixed language pill, or the first thing a visitor
    // sees is a heading with a button on top of it.
    const h1 = (await page.locator("h1").boundingBox())!;
    const pill = (await page.locator('button[aria-label="Language"]').boundingBox())!;
    expect(h1.y).toBeGreaterThanOrEqual(pill.y + pill.height);
  });
}

/**
 * The guides line was added to `/` deliberately BELOW the hero, so the primary
 * CTA does not move. This asserts the ordering the measurement showed.
 */
test("the landing guides line sits below the primary CTA, which stays visible", async ({ page }) => {
  await page.goto("/");
  const cta = (await page.locator('[data-primary-action="scan"]').boundingBox())!;
  const links = (await page.locator('[data-testid="guide-links"]').boundingBox())!;
  await expect(page.locator('[data-primary-action="scan"]')).toBeVisible();
  expect(links.y).toBeGreaterThan(cta.y + cta.height);
  const { scrollWidth, clientWidth } = await overflow(page);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
