import { test, expect, type Page } from "@playwright/test";

/**
 * Regression 27 — every visitor downloaded all four locale dictionaries.
 *
 * `lib/i18n/core.ts` used to statically import EN, JA, ZH and AR, and
 * `app/page.tsx` imports `t` from it, so the landing page shipped four
 * dictionaries to a visitor who can read one of them. Japanese, Chinese and
 * Arabic are now dynamic `import()`s with a literal path each, so the bytes for
 * a language arrive only when that language is the one on screen.
 *
 * The check is on what the browser actually downloaded, not on the source: it
 * reads the body of every script the page fetched and looks for a string that
 * exists in exactly one dictionary.
 */

const NEEDLE = {
  en: "Turn camera back on",
  ja: "カメラをもう一度オンにする",
  zh: "重新打开摄像头",
  ar: "إعادة تشغيل الكاميرا",
} as const;

type Loc = keyof typeof NEEDLE;

async function fetchedDictionaries(page: Page, saved: string | null): Promise<Set<Loc>> {
  const bodies: Promise<string>[] = [];
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if (type !== "script") return;
    bodies.push(res.text().catch(() => ""));
  });
  if (saved) await page.addInitScript(`try{localStorage.setItem("aru.lang",${JSON.stringify(saved)})}catch{}`);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const text = (await Promise.all(bodies)).join("\n");
  const seen = new Set<Loc>();
  for (const [loc, needle] of Object.entries(NEEDLE) as [Loc, string][]) {
    if (text.includes(needle)) seen.add(loc);
  }
  return seen;
}

test("a first visit downloads the English dictionary and no other", async ({ page }) => {
  const seen = await fetchedDictionaries(page, null);
  expect([...seen].sort()).toEqual(["en"]);
});

test("a Korean visitor downloads no ja/zh/ar dictionary", async ({ page }) => {
  const seen = await fetchedDictionaries(page, "ko");
  expect(seen.has("ja")).toBe(false);
  expect(seen.has("zh")).toBe(false);
  expect(seen.has("ar")).toBe(false);
  await expect(page.locator("h1")).toContainText("오늘의 내 피부");
});

for (const lang of ["ja", "zh", "ar"] as const) {
  test(`a ${lang} visitor downloads ${lang} and neither of the other two`, async ({ page }) => {
    const seen = await fetchedDictionaries(page, lang);
    const others = (["ja", "zh", "ar"] as const).filter((l) => l !== lang);
    expect(seen.has(lang), `${lang} dictionary was not fetched`).toBe(true);
    for (const other of others) {
      expect(seen.has(other), `${other} dictionary was fetched for a ${lang} visitor`).toBe(false);
    }
  });
}

const EXPECTED_H1: Record<string, string> = {
  ko: "오늘의 내 피부",
  en: "What skincare suits",
  ja: "今日の肌には、",
  zh: "今天的肌肤，",
  ar: "ما العناية المناسبة",
};

for (const lang of ["ko", "en", "ja", "zh", "ar"] as const) {
  test(`${lang} settles on its own language with no Korean on screen on the way`, async ({ page }) => {
    // Sample the heading every animation frame from before the app's own scripts
    // run. A provider that switched `currentLang` before the dictionary arrived
    // would paint the Korean message ids for a frame or two and then settle
    // correctly, which an end-state assertion cannot see.
    await page.addInitScript(
      `try{localStorage.setItem("aru.lang",${JSON.stringify(lang)})}catch{}\n` +
        `window.__h1 = [];` +
        `const t0 = performance.now();` +
        `const tick = () => { const h = document.querySelector("h1"); if (h) window.__h1.push(h.innerText);` +
        `  if (performance.now() - t0 < 4000) requestAnimationFrame(tick); };` +
        `requestAnimationFrame(tick);`,
    );
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(EXPECTED_H1[lang]);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", lang === "zh" ? "zh-CN" : lang);
    await expect(html).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    if (lang !== "ko") {
      const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      expect(body, `Korean source string left on screen under ${lang}`).not.toMatch(/[가-힣]/);
      await page.waitForTimeout(1500);
      const frames: string[] = await page.evaluate(() => (window as unknown as { __h1: string[] }).__h1);
      expect(frames.length).toBeGreaterThan(10);
      const korean = frames.filter((f) => /[가-힣]/.test(f));
      expect(korean, `Korean painted in ${korean.length} of ${frames.length} sampled frames under ${lang}`).toEqual([]);
    }
  });
}
