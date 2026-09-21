import { expect, test, type Locator, type Page } from "@playwright/test";

const languages = ["ko", "en", "ja", "zh", "ar"] as const;
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
  const start = page.getByRole("button", { name: "카메라로 살펴보기" });
  await expect(start).toBeVisible();
  await start.click();
  const fallback = page.getByRole("link", { name: "카메라 없이 설문으로 시작하기" });
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
  await page.getByRole("tab", { name: /오늘부터 가볍게 시작할 루틴/ }).click();

  await expectTapHeight(page.getByRole("textbox", { name: "이메일 주소" }));
  await expectTapHeight(page.getByRole("button", { name: "이메일로 알림 받기" }));
  await expectTapHeight(page.getByText("리마인드 발송을 위해 이메일 저장에 동의해요").locator(".."));

  const privacy = page.getByRole("link", { name: "개인정보와 동의" });
  await expect(privacy).toHaveAttribute("href", "/privacy");
  await privacy.click();
  await expect(page).toHaveURL(/\/privacy$/);
});

/**
 * The live-camera screen, measured in a browser rather than asserted from source.
 *
 * Everything above this point visits `/scan` only in the camera-DENIED state, because
 * reaching `phase === "ready"` needs a real MediaStream. So the one screen a scanning
 * user actually looks at — the quality checklist, the consent toggles, the capture
 * button — had no pixel-level coverage at all, and the clipping fixed in cycle 22 was
 * caught by hand in a browser and pinned afterwards by a SOURCE contract
 * (`tests/mobile-layout-contract.test.ts`), which cannot see a laid-out box.
 *
 * `getUserMedia` is shimmed to a canvas `captureStream()`: a real MediaStream with a
 * live video track, so `openCamera` resolves on its first attempt, `watchCameraStream`
 * finds tracks to listen on, `stopMediaStream` has something to stop, and the page
 * reaches `ready` the same way it does on a phone. The landmarker is not mocked — it
 * may well fail to load here, and it does not have to succeed: the checklist, the
 * toggles and the capture button all render on `phase === "ready"` alone.
 */
const FAKE_CAMERA = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const context = canvas.getContext("2d")!;
  let tick = 0;
  const paint = () => {
    tick += 1;
    context.fillStyle = "#c98b6b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `rgb(${210 + (tick % 8)}, 176, 152)`;
    context.beginPath();
    context.ellipse(320, 240, 130, 170, 0, 0, Math.PI * 2);
    context.fill();
  };
  paint();
  setInterval(paint, 100);
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream })
    .captureStream(10);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => stream },
  });
};

test("the live camera screen does not clip or shrink its controls in any locale", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const lang of languages) {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript((nextLang) => localStorage.setItem("aru.lang", nextLang), lang);
    await context.addInitScript(FAKE_CAMERA);
    const page = await context.newPage();
    await page.goto("/scan");
    await page.evaluate(() => document.fonts.ready);

    await page.getByTestId("scan-start").click();
    // The quality checklist is the first thing `phase === "ready"` renders that has
    // text in it, and it is the element cycle 22 found clipped.
    const checklist = page.locator("main [data-quality-checklist]");
    await expect(checklist).toBeVisible({ timeout: 20_000 });

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll("main *")]
        .map((element) => ({
          element: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 60),
          rect: element.getBoundingClientRect().toJSON(),
        }))
        .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)),
      clipped: [...document.querySelectorAll("main *")]
        .filter((element) => element.children.length === 0 && (element.textContent || "").trim().length > 0)
        .map((element) => ({
          text: (element.textContent || "").trim().slice(0, 60),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        // A text node laid out wider than the box it sits in is the shape of the
        // cycle-22 defect: nothing overflows the viewport, the label is just cut.
        .filter((box) => box.clientWidth > 0 && box.scrollWidth > box.clientWidth + 1),
    }));

    expect(layout.scrollWidth, JSON.stringify({ lang, offenders: layout.offenders }, null, 2))
      .toBeLessThanOrEqual(360);
    expect(layout.clipped, `${lang}: text clipped inside its own box`).toEqual([]);

    const controls = page.locator("main button:visible, main a:visible, main input:visible");
    const count = await controls.count();
    expect(count, `${lang}: the ready screen rendered no controls to measure`).toBeGreaterThan(0);
    const small: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const box = await control.boundingBox();
      if (!box) continue;
      await expectInsideViewport(page, control);
      // A checkbox inside a <label> is not the tap target — the label is, and
      // `ScanControls`'s toggle rows are 52px tall for exactly that reason. Measuring
      // the 18px input instead would report three defects that do not exist, so the
      // control is judged on the box a finger actually lands on.
      const target = await control.evaluate((element) => {
        const label = element.closest("label");
        const rect = (label ?? element).getBoundingClientRect();
        return { width: rect.width, height: rect.height, wrapped: Boolean(label) };
      });
      if (target.height < 44 || target.width < 44) {
        small.push(`${(await control.textContent())?.trim().slice(0, 30)} ${target.width.toFixed(1)}x${target.height.toFixed(1)}`);
      }
    }
    expect(small, `${lang}: controls under 44px`).toEqual([]);
    await context.close();
  }
});
