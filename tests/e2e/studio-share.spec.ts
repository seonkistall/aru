import { expect, test } from "@playwright/test";

/**
 * The share button on /studio, clicked in a browser under the app's real CSP.
 *
 * `shareCardImage` rasterized the card to a `data:image/png;base64,...` URL and then
 * did `await (await fetch(dataUrl)).blob()` to get a File for the share sheet. The
 * app's own header is `connect-src 'self'` (next.config.ts), which governs `fetch` and
 * allows neither `data:` nor `blob:` — so that line threw `TypeError: Failed to fetch`
 * for every user on every browser, before the `navigator.canShare` branch was reached.
 * The deliberate download fallback at the end of the function was therefore unreachable
 * too, and `onShare` never fired, so `share_clicked` was never recorded for this
 * surface at all.
 *
 * Three routes visit /studio already (mobile-layout, product-copy, product-copy-fit) and
 * none of them clicks this button, which is why a total failure of the product's only
 * image-share path went unseen.
 *
 * `navigator.share` is stubbed because a headless Chromium has no share sheet; the CSP
 * is NOT stubbed — it is the real header the dev and production configs both emit, which
 * is the whole point of testing this in a browser rather than with a mocked `fetch`.
 */
test("the studio share button reaches the share sheet under the app's own CSP", async ({ page }) => {
  const refusals: string[] = [];
  page.on("console", (message) => {
    if (/Refused to connect/i.test(message.text())) refusals.push(message.text().slice(0, 120));
  });

  await page.addInitScript(() => {
    localStorage.setItem("aru.lang", "ko");
    // A share sheet that records what it was handed, so the assertion is about the
    // File actually reaching navigator.share and not merely about no error showing.
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: { files?: File[] }) => {
        (window as unknown as { __shared?: unknown }).__shared = {
          files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
        };
        return Promise.resolve();
      },
    });
  });

  await page.goto("/studio");
  const share = page.getByRole("button", { name: "오늘의 피부 리포트 공유하기" });
  await expect(share).toBeVisible();
  await share.click();

  // Wait for the handler to settle before judging it: the button reads "생성 중..."
  // while the raster runs, and asserting on the error row before that clears would
  // pass against the broken build for a reason that has nothing to do with the fix.
  await expect(share, "the share handler never finished").toHaveText("오늘의 피부 리포트 공유하기", {
    timeout: 30_000,
  });

  await expect(
    page.getByText("공유에 실패했어요. PNG 저장을 이용해 주세요."),
    "the share path reported failure to the user",
  ).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: { files: unknown[] } }).__shared), {
      timeout: 20_000,
      message: "navigator.share was never reached, so the card never got to the share sheet",
    })
    .toBeTruthy();

  const shared = await page.evaluate(
    () => (window as unknown as { __shared: { files: Array<{ name: string; type: string; size: number }> } }).__shared,
  );
  expect(shared.files.length, "no file was handed to the share sheet").toBe(1);
  expect(shared.files[0].name).toBe("aru-skin-card.png");
  expect(shared.files[0].type).toBe("image/png");
  expect(shared.files[0].size, "an empty PNG reached the share sheet").toBeGreaterThan(1000);

  expect(refusals, `the page was refused a connection by its own CSP: ${refusals[0] ?? ""}`).toEqual([]);
});
