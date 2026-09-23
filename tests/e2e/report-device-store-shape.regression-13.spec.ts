import { expect, test } from "@playwright/test";

/**
 * One malformed value in a device store takes the whole `/report` page down.
 *
 * `ScanHistoryStrip` renders on `/report`'s first step. It calls `getScanHistory()`,
 * which is `JSON.parse(localStorage.getItem(KEY) || "[]")` inside a try/catch — so a
 * TRUNCATED value returns `[]` and the strip renders nothing, while a value that
 * PARSES to the wrong shape is handed back as-is and reaches the component's own
 * expressions: `history.length < 2` is `undefined < 2` on an object (false, so the
 * early return does not fire) and `history.slice(-6)` then throws inside render.
 *
 * A throw in render is not a strip that fails to appear. React unmounts the segment
 * and `app/error.tsx` replaces the ENTIRE page with "앗, 잠깐 멈췄어요" — the report,
 * the product cards, and both `/api/out` links with them. The crash is deterministic
 * in the stored value, so `reset()` re-renders and throws again: the only escape is
 * leaving, and the page is dead on that device until the key is cleared.
 *
 * This is the same class as `tests/funnel-store-shape.test.ts` (cycle 29) one level
 * up: there the wrong shape switched analytics off silently, here it takes a user's
 * report with it. `/report` is also the surface the repository's only revenue path
 * runs through, which is why this is proved in a browser and not only at the store.
 */

const SCAN_HISTORY_KEY = "aru_scan_history_v1";

const survey = {
  type: "복합성",
  concerns: ["모공", "유분"],
  budget: 25000,
  avoid: [],
  category: "토너",
};

// Every one of these is valid JSON, so the try/catch at the read never sees it.
// `"abcdef"` is in the list because a string survives BOTH of the component's guards
// — `.length` is 6 and `.slice(-6)` returns a string — and dies one call later on
// `.map`, which an `Array.isArray` guard covers and a `.length` check does not.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["an object", '{"a":1}'],
  ["a string", '"abcdef"'],
  ["a boolean", "false"],
];

for (const [name, raw] of WRONG_SHAPES) {
  test(`/report survives a scan history holding ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(
      ([key, value, seeded]) => {
        localStorage.setItem("aru.lang", "ko");
        localStorage.setItem(key as string, value as string);
        sessionStorage.setItem("gyeol_survey", seeded as string);
      },
      [SCAN_HISTORY_KEY, raw, JSON.stringify(survey)] as const,
    );
    const page = await context.newPage();
    await page.goto("/report");

    // The strip reads the store in a mount effect, so the FIRST paint is always clean
    // and an assertion made immediately passes while the crash is one commit away.
    // Two animation frames put both assertions after that effect and its re-render.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );

    // The error boundary's heading is the one string that only appears when a render
    // threw, so it names the failure rather than reporting a missing element.
    const boundary = page.getByText("앗, 잠깐 멈췄어요");
    await expect(
      boundary,
      `/report fell into app/error.tsx because the scan history held ${name} — a malformed device store took the whole report down`,
    ).toHaveCount(0);

    // And the page is actually the report, not a blank shell that merely avoided the
    // boundary: the survey-only headline of step 1, the step this strip renders on.
    await expect(
      page.getByRole("heading", { level: 1, name: "복합성 피부를 위한 리포트" }),
      `/report rendered no analysis step with a scan history holding ${name}`,
    ).toBeVisible();

    await context.close();
  });
}
