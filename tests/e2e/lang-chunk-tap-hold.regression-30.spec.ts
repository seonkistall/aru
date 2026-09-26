import { expect, test } from "@playwright/test";

/**
 * Regression: a tap during the English interval was thrown away.
 *
 * Cycle 40 moved the ja/zh/ar dictionaries behind a dynamic `import()`, so
 * `LanguageProvider` renders English until the chunk lands and then remounts the
 * whole subtree under `key={active}` (`lib/i18n.tsx`). Every piece of React state
 * a visitor creates in between goes with the discarded tree. On `/scan` that is
 * the camera: the tap started it, the remount put the page back on its start
 * button, and the visitor had to tap again.
 *
 * Measured on a production build at 360x800 against `npx next start`, with a
 * canvas `captureStream()` for the camera, taps fired as real hit-tested mouse
 * clicks at 3400ms (inside the interval) and CDP
 * `Network.emulateNetworkConditions` at latency 562.5ms / 180000 Bps down /
 * 84375 Bps up. Before the fix, all three lazy locales: the tap was accepted
 * (`[data-quality-checklist]` count 1 immediately after), and after the remount
 * the checklist was 0 with the start button visible again — ja remount 4289.0ms,
 * zh 4086.3, ar 3931.8. `ko` and `en` kept the camera (checklist 1 both before
 * and after), because neither waits for a chunk.
 *
 * The fix holds the discarded tree instead of accepting actions it cannot keep:
 * while `active !== saved` the provider marks `<body>` `inert`, `aria-busy` and
 * `data-aru-lang-pending`. HTML's inert section is the contract — hit-testing
 * "must act as if the 'pointer-events' CSS property were set to 'none'" — and it
 * also asks that inert content be "visually obscured in some way", which is the
 * one CSS rule in `app/globals.css` that dims the controls to opacity 0.55. No
 * wrapper element, so ko/en geometry is untouched: `/` and `/scan` measured
 * before and after under both locales are byte-identical, including 199 and 105
 * DOM nodes and `class` as the only body attribute.
 *
 * What this spec asserts is the promise the fix makes, which is NOT that the tap
 * is honoured: a tap inside the interval is refused, and after the remount the
 * page is in its pre-tap state with a live button. It also asserts the page is
 * genuinely usable once the chunk lands, so the hold cannot pass by breaking
 * everything.
 */

const JA_MARKER = "カメラをもう一度オンにする";
const VALID_SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';
const REAL_READS = JSON.stringify({
  oil: { value: "유분 많음", level: 2, calm: false },
  pores: { value: "결 약간 보임", level: 1, calm: false },
  redness: { value: "붉은기 약간", level: 1, calm: false },
  overall: { value: "균형 관리 필요", level: 2, calm: false },
  headline: "T존 유분과 피부결을 함께 볼게요",
  narrative: "T존 유분감이 비교적 뚜렷해요.",
  confidence: 0.72,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "조명", ok: true, detail: "빛이 충분해요" }],
  source: "roi-calibrated",
  raw: {},
});
const CHUNK_DELAY_MS = 3000;

const CANVAS_CAMERA = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c8a080";
  ctx.fillRect(0, 0, 640, 480);
  setInterval(() => ctx.fillRect(0, 0, 640, 480), 100);
  const stream = canvas.captureStream(30);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "canvas", label: "canvas" }],
    },
  });
};

async function tapCentre(page: import("@playwright/test").Page, selector: string) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  expect(box, `${selector} should be present to tap`).not.toBeNull();
  // A real hit-tested click, not HTMLElement.click(): `inert` is defined in
  // terms of hit-testing, so a synthetic dispatch would walk straight past it
  // and the spec would pass against a tree that is not actually held.
  await page.mouse.click(box!.x, box!.y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe("a tap during the English interval", () => {
  test("is refused while the ja dictionary is in flight, and works after it lands", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("aru.lang", "ja");
      } catch {
        /* private mode — the in-memory fallback keeps the session working */
      }
    });
    await page.addInitScript(CANVAS_CAMERA);

    // Delay only the chunk that carries the Japanese dictionary, the way the
    // supervisor's probe did. Every other script is served untouched, so the
    // page hydrates on time and the interval is the dictionary's alone.
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes(JA_MARKER)) {
        await route.fulfill({ response, body });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      await route.fulfill({ response, body });
    });

    await page.goto("/scan");

    // The hold is on and the page is still English: this is the window.
    await expect
      .poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 20_000 })
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    expect(await page.evaluate(() => document.body.getAttribute("aria-busy"))).toBe("true");
    const startButton = page.locator('[data-testid="scan-start"]');
    await expect(startButton).toBeVisible();
    // The spec's own cue check: the control is dimmed, not silently dead.
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="scan-start"]');
        return el ? getComputedStyle(el).opacity : null;
      }),
    ).toBe("0.55");

    await tapCentre(page, '[data-testid="scan-start"]');

    // Refused, not swallowed: no camera was started inside the doomed tree.
    expect(await page.locator("[data-quality-checklist]").count()).toBe(0);
    await expect(startButton).toBeVisible();

    // The remount lands; the hold lifts.
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
      .toBe("ja");
    await expect
      .poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 10_000 })
      .toBe(false);
    expect(await page.evaluate(() => document.body.hasAttribute("data-aru-lang-pending"))).toBe(false);

    // Pre-tap state, with a live button — nothing was started and nothing lost.
    await expect(startButton).toBeVisible();
    expect(await page.locator("[data-quality-checklist]").count()).toBe(0);
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="scan-start"]');
        return el ? getComputedStyle(el).opacity : null;
      }),
    ).toBe("1");

    // And the same tap now works, so the hold is a hold and not a wall.
    await tapCentre(page, '[data-testid="scan-start"]');
    await expect(page.locator("[data-quality-checklist]").first()).toBeVisible({ timeout: 20_000 });
  });

  test("never happens for ko, which waits for no chunk", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("aru.lang", "ko");
      } catch {
        /* private mode */
      }
    });
    await page.addInitScript(CANVAS_CAMERA);
    // Same routing, same delay. ko needs no dictionary — the message ids are the
    // Korean strings — so nothing here should ever be held.
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes(JA_MARKER)) {
        await route.fulfill({ response, body });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      await route.fulfill({ response, body });
    });

    await page.goto("/scan");
    await expect(page.locator('[data-testid="scan-start"]')).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
      .toBe("ko");
    expect(await page.evaluate(() => document.body.hasAttribute("inert"))).toBe(false);
    expect(await page.evaluate(() => document.body.hasAttribute("data-aru-lang-pending"))).toBe(false);

    await tapCentre(page, '[data-testid="scan-start"]');
    await expect(page.locator("[data-quality-checklist]").first()).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * The same remount, reached the other way: not by a chunk landing but by the
 * visitor using the language switcher. Measured on a production build at
 * 360x800 with the picks step open, switching en -> ar -> ja through the real
 * picker: the selected tab went 1 -> 0 -> 0 and the merchant links on screen
 * went 4 -> 0 -> 0, i.e. a language switch closed the only step that carries
 * commerce links. `dir` followed correctly (ltr/rtl/ltr) and
 * `scrollWidth === clientWidth === 360` throughout, so the defect was the lost
 * step and nothing else. /report now keeps the step in sessionStorage
 * (DEVICE_DATA_KEY.reportStep, registered so "delete my device data" clears it)
 * and restores it in the same after-mount effect that loads the reading.
 */
test("a language switch on /report keeps the picks step and its links", async ({ page }) => {
  await page.addInitScript(
    ([survey, reads]) => {
      localStorage.setItem("aru.lang", "en");
      sessionStorage.setItem("gyeol_survey", survey);
      sessionStorage.setItem("gyeol_reads", reads);
    },
    [VALID_SURVEY, REAL_READS] as const,
  );
  await page.goto("/report");

  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  const merchantLinks = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("a[href]")).filter((a) =>
          /oliveyoung|coupang|naver/.test(a.getAttribute("href") ?? ""),
        ).length,
    );
  const linksBefore = await merchantLinks();
  expect(linksBefore).toBeGreaterThan(0);

  for (const [code, label, dir] of [
    ["ar", "العربية", "rtl"],
    ["ja", "日本語", "ltr"],
  ] as const) {
    await page.click('button[aria-label="Language"]');
    await page.getByRole("option", { name: new RegExp(label) }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
      .toBe(code === "ar" ? "ar" : "ja");
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    // The step survived the remount, and so did the links it carries.
    await expect(page.locator('[role="tab"]').nth(1)).toHaveAttribute("aria-selected", "true");
    expect(await merchantLinks()).toBe(linksBefore);
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(box.scrollWidth, `${code} must not overflow 360px`).toBe(box.clientWidth);
  }
});
