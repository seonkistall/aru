import { expect, test } from "@playwright/test";

/**
 * /report's heading spoke for a reading the report had set aside.
 *
 * On the first step the h1 was the reading's headline whenever a reading existed. A
 * capture recommended for a retake (one failed signal, here a dark 조명) is not used for
 * the picks (shouldApplyScan), so the trust card says 사진은 참고만 했어요 and the
 * routine is the plain survey one, while the heading still read "오늘은 진정 루틴이
 * 먼저예요" over a routine with no calming step. The heading and the line under it now
 * follow the same flag the trust card does. Found by the cycle 119 bug hunt.
 */

const SURVEY = { type: "지성", concerns: [], budget: 30000, avoid: [], category: "토너" };

function reads(retakeRecommended: boolean) {
  return {
    oil: { value: "유분 적정", level: 0, calm: true },
    pores: { value: "결 매끈", level: 0, calm: true },
    redness: { value: "붉은기 뚜렷", level: 2, calm: false },
    overall: { value: "진정 관리 필요", level: 2, calm: false },
    headline: "오늘은 진정 루틴이 먼저예요",
    narrative: "볼의 붉은기가 눈에 띄어요.",
    confidence: retakeRecommended ? 0.55 : 0.82,
    confidenceLabel: retakeRecommended ? "낮음" : "보통",
    retakeRecommended,
    retakeReasons: [],
    signals: [{ label: "조명", ok: !retakeRecommended, detail: "조명" }],
    source: "roi-calibrated",
  };
}

function scan(retakeRecommended: boolean) {
  return { oil: 0, redness: 2, pores: 0, confidence: retakeRecommended ? 0.55 : 0.82, retakeRecommended, source: "roi-calibrated" };
}

async function open(page: import("@playwright/test").Page, retakeRecommended: boolean) {
  await page.addInitScript(
    ({ survey, reads, scan }) => {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
      sessionStorage.setItem("gyeol_reads", JSON.stringify(reads));
      sessionStorage.setItem("gyeol_scan", JSON.stringify(scan));
    },
    { survey: SURVEY, reads: reads(retakeRecommended), scan: scan(retakeRecommended) }
  );
  await page.goto("/report");
}

test("a set-aside reading does not head the report", async ({ page }) => {
  await open(page, true);
  await expect(page.getByRole("heading", { level: 1, name: "지성 피부를 위한 리포트" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "오늘은 진정 루틴이 먼저예요" })).toHaveCount(0);
  await expect(page.getByText("설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.")).toBeVisible();
  await expect(page.getByText("카메라에서 확인한 피부 특징을 설문 답변과 함께 정리했어요.")).toHaveCount(0);
});

test("a reading the picks used still heads the report", async ({ page }) => {
  await open(page, false);
  await expect(page.getByRole("heading", { level: 1, name: "오늘은 진정 루틴이 먼저예요" })).toBeVisible();
  await expect(page.getByText("카메라에서 확인한 피부 특징을 설문 답변과 함께 정리했어요.")).toBeVisible();
});
