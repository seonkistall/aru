import { expect, test, type Page } from "@playwright/test";

/**
 * Two /report defects found by the cycle 115 bug hunt.
 *
 * 1. The 추천 기준 sentence listed "T존 유분" for an oil level-1 reading. recommend()
 *    adds 유분 only at level 2 (effectiveConcerns, lib/recommend.ts), so the picks and
 *    routine for oil 1 are those for oil 0, and /survey's hint for the same reading had
 *    just said the photo showed little. The sentence now uses the same threshold.
 *
 * 2. The routine step's email opt-in lost its confirmation when the visitor went to
 *    the picks step and back: the box is rendered only on that step, so it remounted
 *    with an empty form. It now remembers, until reload, that this tab opted in.
 */

const SURVEY = { type: "지성", concerns: [], budget: 29000, avoid: [], category: "토너" };

function readsWithOil(level: number) {
  const calm = { value: "안정", level: 0, calm: true };
  return {
    oil: { value: level >= 2 ? "유분 많음" : "유분 약간", level, calm: false },
    pores: calm,
    redness: calm,
    overall: { value: "균형", level: 1, calm: false },
    headline: "피부 컨디션이 비교적 안정적이에요",
    narrative: "",
    confidence: 0.9,
    confidenceLabel: "높음",
    retakeRecommended: false,
    retakeReasons: [],
    signals: [{ label: "조명", ok: true, detail: "빛이 충분해요" }],
    source: "roi-calibrated",
    raw: {},
  };
}

async function seed(page: Page, oil: number | null) {
  await page.addInitScript(
    ([survey, reads, scan]) => {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_survey", survey as string);
      if (reads) sessionStorage.setItem("gyeol_reads", reads as string);
      if (scan) sessionStorage.setItem("gyeol_scan", scan as string);
    },
    [
      JSON.stringify(SURVEY),
      oil === null ? null : JSON.stringify(readsWithOil(oil)),
      oil === null ? null : JSON.stringify({ oil, redness: 0, pores: 0, confidence: 0.9, retakeRecommended: false, source: "roi-calibrated" }),
    ] as const,
  );
}

for (const [oil, listed] of [[1, false], [2, true]] as const) {
  test(`the basis sentence ${listed ? "lists" : "does not list"} T존 유분 for an oil level-${oil} scan`, async ({ page }) => {
    await seed(page, oil);
    await page.goto("/report");
    await page.getByRole("tab").nth(1).click();
    const basis = page.locator("main p").filter({ hasText: "도 함께 참고했어요." }).first();
    await expect(basis).toBeVisible();
    if (listed) await expect(basis).toContainText("T존 유분");
    else await expect(basis).not.toContainText("T존 유분");
  });
}

test("the opt-in confirmation survives leaving the routine step and coming back", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/reengage/subscribe", (route) => {
    posts += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await seed(page, null);
  await page.goto("/report");
  const tabs = page.getByRole("tab");
  await tabs.nth(2).click();

  await page.getByRole("textbox", { name: "이메일 주소" }).fill("reader@example.com");
  await page.locator('label input[type="checkbox"]').check();
  await page.getByRole("button", { name: "이메일로 알림 받기" }).click();
  const done = page.getByText("알림을 신청했어요. 2주 뒤에 잊지 않도록 알려드릴게요.");
  await expect(done).toBeVisible();

  await tabs.nth(1).click();
  await tabs.nth(2).click();

  await expect(done).toBeVisible();
  await expect(page.getByRole("button", { name: "이메일로 알림 받기" })).toHaveCount(0);
  expect(posts).toBe(1);
});

// The memory is per person: on a shared pilot device the next participant in the same
// tab must still get the form (the cycle 115 review's case).
test("the next pilot participant in the same tab still gets the opt-in form", async ({ page }) => {
  await page.route("**/api/reengage/subscribe", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await seed(page, null);
  const setParticipant = (id: string) =>
    page.evaluate((participantId) => {
      localStorage.setItem(
        "gyeol_current_pilot_session_v1",
        JSON.stringify({ participantId, sessionId: `S-${participantId}`, round: "1", deviceId: "D1", reviewerId: "R1", startedAt: 1 }),
      );
    }, id);
  await page.goto("/report");
  await setParticipant("P001");
  const tabs = page.getByRole("tab");
  await tabs.nth(2).click();
  await page.getByRole("textbox", { name: "이메일 주소" }).fill("p001@example.com");
  await page.locator('label input[type="checkbox"]').check();
  await page.getByRole("button", { name: "이메일로 알림 받기" }).click();
  await expect(page.getByText("알림을 신청했어요. 2주 뒤에 잊지 않도록 알려드릴게요.")).toBeVisible();

  await setParticipant("P002");
  await tabs.nth(1).click();
  await tabs.nth(2).click();
  await expect(page.getByRole("button", { name: "이메일로 알림 받기" })).toBeVisible();
});
