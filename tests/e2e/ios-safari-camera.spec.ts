import { expect, test, type Page } from "@playwright/test";

const recoveryCopy = {
  ko: {
    start: "카메라로 살펴보기",
    title: "카메라가 잠시 멈췄어요.",
    description: "계속하려면 카메라를 다시 켜주세요.",
    restart: "카메라 다시 켜기",
  },
  en: {
    start: "Check my skin with the camera",
    title: "The camera paused for a moment.",
    description: "Turn it back on when you're ready to continue.",
    restart: "Turn camera back on",
  },
  ja: {
    start: "カメラで肌をチェックする",
    title: "カメラが一時停止しました。",
    description: "続けるには、もう一度カメラをオンにしてください。",
    restart: "カメラをもう一度オンにする",
  },
  zh: {
    start: "用相机查看肌肤",
    title: "摄像头暂时停用了。",
    description: "想继续的话，请重新打开摄像头。",
    restart: "重新打开摄像头",
  },
} as const;

async function installCameraMock(page: Page, lang: keyof typeof recoveryCopy) {
  await page.addInitScript((nextLang) => {
    localStorage.setItem("aru.lang", nextLang);
    let hidden = false;
    let cameraStarts = 0;
    let latestTrack: FakeVideoTrack | null = null;
    const mediaSources = new WeakMap<HTMLMediaElement, unknown>();

    class FakeVideoTrack extends EventTarget {
      stop() {}
    }

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => hidden ? "hidden" : "visible",
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      get() {
        return mediaSources.get(this) ?? null;
      },
      set(value: unknown) {
        mediaSources.set(this, value);
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => {
          cameraStarts += 1;
          const track = new FakeVideoTrack();
          latestTrack = track;
          return Promise.resolve({
            getTracks: () => [track],
            getVideoTracks: () => [track],
          });
        },
      },
    });
    Object.defineProperty(window, "__aruSetCameraHidden", {
      configurable: true,
      value: (next: boolean) => {
        hidden = next;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });
    Object.defineProperty(window, "__aruCameraStarts", {
      configurable: true,
      get: () => cameraStarts,
    });
    Object.defineProperty(window, "__aruInterruptCameraTrack", {
      configurable: true,
      value: (type: "mute" | "ended") => latestTrack?.dispatchEvent(new Event(type)),
    });
  }, lang);
}

for (const [lang, copy] of Object.entries(recoveryCopy)) {
  test(`iPhone Safari explicitly recovers an interrupted camera in ${lang}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await installCameraMock(page, lang as keyof typeof recoveryCopy);
    await page.goto("/scan");

    await page.getByRole("button", { name: copy.start }).click();
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __aruCameraStarts: number }
    ).__aruCameraStarts)).toBe(1);
    expect(await video.evaluate((element) => ({
      autoPlay: element.autoplay,
      playsInline: element.playsInline,
      muted: element.muted,
    }))).toEqual({ autoPlay: true, playsInline: true, muted: true });

    if (lang === "ko") {
      await page.screenshot({ path: testInfo.outputPath("camera-ready-before-background.png"), fullPage: true });
    }
    await page.evaluate(() => (
      window as typeof window & { __aruSetCameraHidden: (next: boolean) => void }
    ).__aruSetCameraHidden(true));

    await expect(page.getByText(copy.title, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.description, { exact: true })).toBeVisible();
    const restart = page.getByRole("button", { name: copy.restart });
    await expect(restart).toBeVisible();
    const restartBox = await restart.boundingBox();
    const fallbackBox = await page.getByRole("link", {
      name: lang === "ko"
        ? "카메라 없이 설문으로 시작하기"
        : lang === "en"
          ? "Start with the questionnaire"
          : lang === "ja"
            ? "カメラを使わず、質問から始める"
            : "不用相机，从问卷开始",
    }).boundingBox();
    expect(restartBox?.height).toBeGreaterThanOrEqual(44);
    expect(fallbackBox?.y).toBeGreaterThanOrEqual((restartBox?.y ?? 0) + (restartBox?.height ?? 0) + 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    if (lang === "ko") {
      await page.screenshot({ path: testInfo.outputPath("camera-interrupted-after-background.png"), fullPage: true });
    }

    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __aruCameraStarts: number }
    ).__aruCameraStarts)).toBe(1);
    await page.evaluate(() => (
      window as typeof window & { __aruSetCameraHidden: (next: boolean) => void }
    ).__aruSetCameraHidden(false));
    await restart.click();
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __aruCameraStarts: number }
    ).__aruCameraStarts)).toBe(2);
    await expect(video).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
}

test("iPhone Safari recovers from track mute, track end, and pagehide", async ({ page }) => {
  await installCameraMock(page, "ko");
  await page.goto("/scan");
  const start = page.getByRole("button", { name: recoveryCopy.ko.start });
  const restart = page.getByRole("button", { name: recoveryCopy.ko.restart });
  const interrupted = page.getByText(recoveryCopy.ko.title, { exact: true });

  await start.click();
  await expect(page.locator("video")).toBeVisible();
  await page.evaluate(() => (
    window as typeof window & { __aruInterruptCameraTrack: (type: "mute" | "ended") => void }
  ).__aruInterruptCameraTrack("mute"));
  await expect(interrupted).toBeVisible();

  await restart.click();
  await expect(page.locator("video")).toBeVisible();
  await page.evaluate(() => (
    window as typeof window & { __aruInterruptCameraTrack: (type: "mute" | "ended") => void }
  ).__aruInterruptCameraTrack("ended"));
  await expect(interrupted).toBeVisible();

  await restart.click();
  await expect(page.locator("video")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(interrupted).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __aruCameraStarts: number }
  ).__aruCameraStarts)).toBe(3);
});
