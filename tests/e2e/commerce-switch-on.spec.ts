import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  ALLOWLISTED_OVERRIDE,
  BLOCKED_OVERRIDE,
  SWITCH_ON_SERVER_LOG,
  SWITCH_ON_SKU,
} from "./support/commerce-switch-on";

/**
 * An end-to-end dry run of the owner's revenue switch-on, on a production server.
 *
 * `docs/commerce-partnership-playbook.md` tells the owner that signing an affiliate
 * programme means setting two environment variables in the same deploy:
 * `COMMERCE_LINK_OVERRIDES_JSON`, read on the server for every out-click, and
 * `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`, inlined into the client bundle at build time.
 * `tests/commerce.test.ts` covers the parsing of the first in isolation. Until this spec
 * nothing ran the pair together: no test had ever started a production server with both
 * set and asked what a visitor's click actually does. The two halves fail in opposite
 * directions: an override the allowlist silently drops earns nothing while the disclosure
 * claims a commission, and a disclosure that never flips leaves a live affiliate link
 * described to users as one ARU takes nothing from.
 *
 * `tests/e2e/care-first-merchant-link.regression-38.spec.ts` says in its own comment that
 * cycle 57's run with the flag set "did NOT establish that the flag reached the browser
 * through a production build". That is what the last three tests below establish.
 *
 * The environment comes from `playwright.mobile.config.ts`, which starts a SECOND server
 * for this file on its own port, out of its own build directory, on every run of the
 * suite. It is not conditional: a spec that skips itself when the variables are absent
 * would leave the owner's real configuration the one arrangement nobody ever exercises.
 * The cost is one extra `next build` per gate run, concurrent with the gate's own.
 *
 * Nothing here ever follows a redirect. Every assertion reads the `Location` header of a
 * 302 with `maxRedirects: 0`; no request leaves the container, and both override URLs are
 * invented — `DRYRUN000000` is not a goods number and `/a/dryrun` is not a partner link.
 */

const SURVEY = { type: "복합성", concerns: ["모공", "유분"], budget: 25000, avoid: [], category: "토너" };

/** `recommend()` returns tn2, tn1, tn3 for SURVEY, so the overridden sku is on both pages. */
const REPORT_HREF = `/api/out?sku=${SWITCH_ON_SKU}&merchant=oliveyoung&placement=report_product`;
const CARE_HREF = `/api/out?sku=${SWITCH_ON_SKU}&merchant=coupang&placement=care_en`;

/** The four parameters `addCommerceTracking()` appends, in the order it sets them. */
const EXPECTED_AFFILIATE_LOCATION =
  `${ALLOWLISTED_OVERRIDE}` +
  "&utm_source=kbeauty_ai_camera" +
  "&utm_medium=commerce_link" +
  "&utm_campaign=skin_scan_recommendation" +
  `&utm_content=report_product_${SWITCH_ON_SKU}_oliveyoung`;

const AFFILIATE_SENTENCE = {
  ko: "판매처로 이동하는 제휴 링크예요. 구매가 이뤄지면 ARU가 수수료를 받아요. 가격은 달라지지 않아요.",
  en: "These go to the retailer through an affiliate link. If you buy, ARU earns a commission. Your price is the same.",
} as const;

const NO_COMMISSION_SENTENCE = {
  ko: "판매처로 이동하는 링크예요. ARU는 이 링크로 수수료를 받지 않아요.",
  en: "This goes to the retailer. ARU earns no commission from this link.",
} as const;

async function openReport(page: import("@playwright/test").Page, lang: "ko" | "en") {
  await page.addInitScript(([l, s]) => {
    try {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_survey", s as string);
    } catch {}
  }, [lang, JSON.stringify(SURVEY)] as const);
  await page.goto("/report");
  // `/report` opens on the analysis step; the picks — the product cards that carry the
  // merchant anchor and the disclosure — are behind the second of its three step tabs.
  await page.getByRole("tab").nth(1).click();
}

/**
 * `/care` opens merchant links with `window.open`, so the href is never an attribute in
 * the DOM. Recording the argument instead of opening it is also what keeps the merchant
 * off the network: a real `window.open` on this URL would follow the redirect.
 */
async function openCare(page: import("@playwright/test").Page, lang: "ko" | "en") {
  await page.addInitScript(([l, s]) => {
    try {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_survey", s as string);
    } catch {}
    const opened: string[] = [];
    (window as unknown as { __aruOpened: string[] }).__aruOpened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
  }, [lang, JSON.stringify(SURVEY)] as const);
  await page.goto("/care");
}

test("the overridden pair's link on /report redirects to the affiliate URL with /api/out's UTM parameters", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await openReport(page, "ko");

  // The href the product renders, not one this spec composes: if the picks stopped
  // carrying tn1, or the placement changed, this locator finds nothing.
  const link = page.locator(`a[href="${REPORT_HREF}"]`);
  await expect(link).toHaveCount(1);

  const response = await request.get(REPORT_HREF, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = response.headers().location;
  console.log(`[switch-on] ${REPORT_HREF} -> ${response.status()} ${location}`);
  expect(location).toBe(EXPECTED_AFFILIATE_LOCATION);
});

test("the non-allowlisted override is ignored: the pair still redirects to the default search URL", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await openCare(page, "en");

  // The collapsed panel shows the highest-priority merchant only, so 쿠팡 is behind the
  // "other retailers" toggle. Its index in the expanded panel is its `priority` order.
  const panel = page.locator(`#care-merchants-${SWITCH_ON_SKU}`);
  await expect(panel.locator("button")).toHaveCount(1);
  await page.locator(`button[aria-controls="care-merchants-${SWITCH_ON_SKU}"]`).click();
  await expect(panel.locator("button")).toHaveCount(4);
  await panel.locator("button").nth(2).click();

  const opened = await page.evaluate(() => (window as unknown as { __aruOpened: string[] }).__aruOpened);
  expect(opened).toEqual([CARE_HREF]);

  const response = await request.get(CARE_HREF, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = response.headers().location || "";
  console.log(`[switch-on] ${CARE_HREF} -> ${response.status()} ${location}`);
  const target = new URL(location);
  expect(location).not.toContain(BLOCKED_OVERRIDE);
  expect(target.hostname).toBe("www.coupang.com");
  expect(target.pathname).toBe("/np/search");
  expect(target.searchParams.get("utm_content")).toBe(`care_en_${SWITCH_ON_SKU}_coupang`);
});

test("the ignored override is named in the server's log", async ({ request }) => {
  test.setTimeout(120_000);
  // `warnOnce` fires on the first override resolution per distinct env value, which is
  // the first out-click after a deploy — so make one here rather than relying on the
  // order of the tests above.
  const response = await request.get(REPORT_HREF, { maxRedirects: 0 });
  expect(response.status()).toBe(302);

  const logPath = path.resolve(process.cwd(), SWITCH_ON_SERVER_LOG);
  // The server writes through a pipe; poll rather than read once.
  await expect
    .poll(() => {
      try {
        return readFileSync(logPath, "utf8");
      } catch {
        return "";
      }
    }, { timeout: 15_000 })
    .toContain(`[commerce] override for ${SWITCH_ON_SKU}/coupang ignored:`);

  const log = readFileSync(logPath, "utf8");
  const line = log.split("\n").find((entry) => entry.includes("[commerce] override for")) || "";
  console.log(`[switch-on] server log: ${line.trim()}`);
  expect(line).toContain(BLOCKED_OVERRIDE);
  expect(line).toContain("The link is still a search URL.");
  // The accepted override must never be reported as rejected.
  expect(log).not.toContain(`override for ${SWITCH_ON_SKU}/oliveyoung ignored`);
});

test("the disclosure next to the link reads the affiliate sentence in ko", async ({ page }) => {
  test.setTimeout(120_000);
  await openReport(page, "ko");
  await expect(page.locator(`a[href="${REPORT_HREF}"]`)).toHaveCount(1);
  await expect(page.getByText(AFFILIATE_SENTENCE.ko, { exact: true }).first()).toBeVisible();
});

test("the disclosure next to the link reads the affiliate sentence in en", async ({ page }) => {
  test.setTimeout(120_000);
  await openCare(page, "en");
  await expect(page.locator(`#care-merchants-${SWITCH_ON_SKU}`)).toHaveCount(1);
  await expect(page.getByText(AFFILIATE_SENTENCE.en, { exact: true }).first()).toBeVisible();
});

test("no disclosure on either surface still says ARU earns no commission", async ({ page }) => {
  test.setTimeout(120_000);
  // `CommerceDisclosure` renders more than once per surface, and the compliance claim is
  // about every instance, not the first one a locator happens to find: a page carrying
  // both sentences at once is the state the disclosure exists to prevent.
  await openReport(page, "ko");
  await expect(page.locator(`a[href="${REPORT_HREF}"]`)).toHaveCount(1);
  const reportAffiliate = await page.getByText(AFFILIATE_SENTENCE.ko, { exact: true }).count();
  const reportStale = await page.getByText(NO_COMMISSION_SENTENCE.ko, { exact: true }).count();
  console.log(`[switch-on] /report ko: affiliate=${reportAffiliate} noCommission=${reportStale}`);
  expect(reportStale).toBe(0);
  expect(reportAffiliate).toBeGreaterThan(0);

  await openCare(page, "en");
  await expect(page.locator(`#care-merchants-${SWITCH_ON_SKU}`)).toHaveCount(1);
  const careAffiliate = await page.getByText(AFFILIATE_SENTENCE.en, { exact: true }).count();
  const careStale = await page.getByText(NO_COMMISSION_SENTENCE.en, { exact: true }).count();
  console.log(`[switch-on] /care en: affiliate=${careAffiliate} noCommission=${careStale}`);
  expect(careStale).toBe(0);
  expect(careAffiliate).toBeGreaterThan(0);
});
