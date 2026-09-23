import { expect, test } from "@playwright/test";

/**
 * A malformed value in either /checkin store leaves the page BLANK — not broken, blank.
 *
 * `/checkin` is the landing page for every re-engagement email, so the whole point of
 * it is that somebody arrived from outside. Its mount effect is
 * `Promise.all([getProductUses(), getCheckins()]).then(...)` with no `.catch`, and
 * `getProductUses()` is `lsGet(...).filter(...)` over a bare `JSON.parse` — so a stored
 * value that PARSES to the wrong shape rejected the promise, the `.then` never ran,
 * `productUses` stayed `null`, and the component's own `productUses === null` branch
 * renders an empty `<main>`. No error boundary, no retry, no text: a white screen for
 * the life of the install.
 *
 * That is a quieter failure than `/report`'s (regression 13, which at least showed the
 * boundary) and a worse one to diagnose, because nothing anywhere says it happened.
 *
 * Two fixes stand behind these cases and they are not the same fix, so what this spec
 * does and does not prove was measured rather than assumed. `lib/store.ts` guards the
 * read with `Array.isArray`, so the rejection never happens and the next write repairs
 * the key; `app/checkin/page.tsx` catches, so that ANYTHING rejecting in that effect —
 * including whatever is added to it next — produces the empty state rather than a dead
 * page. Running this spec against each tree, five cases each:
 *
 *   guard + catch (shipped)  5 passed
 *   guard only, catch removed  5 passed
 *   catch only, guard removed  5 passed
 *   NEITHER                    5 failed
 *
 * So these cases prove the defect and prove it is closed. They do NOT isolate either
 * fix: for this input each one is sufficient on its own, and the spec cannot tell them
 * apart. The store guard is isolated at its source line in
 * `tests/commerce-store-shape.test.ts`.
 */

const PRODUCT_USES_KEY = "gyeol_purchases";
const CHECKINS_KEY = "gyeol_checkins";

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["an object", '{"a":1}'],
  ["a string", '"abcdef"'],
  ["a boolean", "false"],
];

for (const [name, raw] of WRONG_SHAPES) {
  test(`/checkin still renders when its stores hold ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(
      ([usesKey, checkinsKey, value]) => {
        localStorage.setItem("aru.lang", "ko");
        localStorage.setItem(usesKey as string, value as string);
        localStorage.setItem(checkinsKey as string, value as string);
      },
      [PRODUCT_USES_KEY, CHECKINS_KEY, raw] as const,
    );
    const page = await context.newPage();
    await page.goto("/checkin");

    // The stores are read in a mount effect, so the first paint is the blank loading
    // <main> either way. Two animation frames put the assertions after that effect and
    // its re-render, which is where the difference between "loading" and "dead" is.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );

    // The page's own heading — the one thing the blank `<main>` does not render.
    await expect(
      page.getByRole("heading", { level: 1, name: "스킨케어, 직접 써보니 어땠나요?" }),
      `/checkin rendered its blank loading shell forever because its stores held ${name}`,
    ).toBeVisible();

    // And it reached the empty state rather than the boundary, so both of the CTAs a
    // re-engagement visit exists to offer are actually on screen.
    await expect(page.getByText("앗, 잠깐 멈췄어요"), `/checkin fell into app/error.tsx on ${name}`).toHaveCount(0);
    await expect(page.getByText("아직 기록된 사용 제품이 없어요"), `/checkin showed no empty state on ${name}`).toBeVisible();
    await expect(page.getByRole("link", { name: "내 리포트 보기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "피부 스캔하기" })).toBeVisible();

    await context.close();
  });
}
