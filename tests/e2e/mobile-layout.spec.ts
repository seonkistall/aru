import { expect, test, type Locator, type Page } from "@playwright/test";

const languages = ["ko", "en", "ja", "zh"] as const;
const survey = {
  type: "복합성",
  concerns: ["모공", "유분"],
  budget: 25000,
  avoid: [],
  category: "토너",
};

async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectTapHeight(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("localized home copy stays inside required viewports", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const width of [320, 360, 393, 768]) {
    for (const lang of languages) {
      const context = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 800 } });
      await context.addInitScript((nextLang) => localStorage.setItem("aru.lang", nextLang), lang);
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveAttribute("lang", lang === "zh" ? "zh-CN" : lang);
      await expectInsideViewport(page, page.getByTestId("hero-callout"));
      await expectInsideViewport(page, page.getByRole("heading", { level: 1 }));
      const primary = page.locator("[data-primary-action='scan']");
      await expectInsideViewport(page, primary);
      await expectTapHeight(primary);
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll("body *")]
          .map((element) => ({
            element: element.tagName.toLowerCase(),
            text: element.textContent?.trim().slice(0, 80),
            rect: element.getBoundingClientRect().toJSON(),
          }))
          .filter(({ rect }) => rect.left < -1 || rect.right > document.documentElement.clientWidth + 1),
      }));
      expect(
        layout.scrollWidth,
        JSON.stringify({ width, lang, offenders: layout.offenders }, null, 2),
      ).toBeLessThanOrEqual(width);
      await context.close();
    }
  }
});

test("camera fallback remains an accessible touch target", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aru.lang", "ko");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException("Denied for test", "NotAllowedError")),
      },
    });
  });
  await page.goto("/scan");
  const start = page.getByRole("button", { name: "카메라 시작" });
  await expect(start).toBeVisible();
  await start.click();
  const fallback = page.getByRole("link", { name: "사진 없이 추천받기" });
  await expect(fallback).toBeVisible();
  await expectTapHeight(fallback);
});

test("studio editor does not clip controls at 360px", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/studio");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  const controls = page.locator("main button, main input, main textarea");
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    await expectInsideViewport(page, control);
    await expectTapHeight(control);
  }
});

test("routine reminder and privacy path are usable in the TWA viewport", async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("aru.lang", "ko");
    sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
  }, survey);
  await page.goto("/report");
  await page.getByRole("tab", { name: /오늘의 루틴/ }).click();

  await expectTapHeight(page.getByRole("textbox", { name: "이메일 주소" }));
  await expectTapHeight(page.getByRole("button", { name: "신청" }));
  await expectTapHeight(page.getByText("리마인드 발송을 위해 이메일 저장에 동의해요").locator(".."));

  const privacy = page.getByRole("link", { name: "개인정보와 동의" });
  await expect(privacy).toHaveAttribute("href", "/privacy");
  await privacy.click();
  await expect(page).toHaveURL(/\/privacy$/);
});
