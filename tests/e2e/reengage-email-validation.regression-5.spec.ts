import { expect, test } from "@playwright/test";

const survey = {
  type: "복합성",
  concerns: ["붉은기"],
  budget: 39000,
  avoid: [],
  category: "크림",
};

// Regression: ISSUE-005 — a syntactically invalid email was sent to the API.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("reminder opt-in blocks invalid email before the network", async ({ page }) => {
  let subscribeRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/reengage/subscribe") {
      subscribeRequests += 1;
    }
  });
  await page.addInitScript((value) => {
    localStorage.setItem("aru.lang", "ko");
    sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
  }, survey);
  await page.goto("/report");
  await page.getByRole("tab", { name: /오늘부터 가볍게 시작할 루틴/ }).click();

  const email = page.getByRole("textbox", { name: "이메일 주소" });
  await email.fill("not-an-email");
  await page.getByText("리마인드 발송을 위해 이메일 저장에 동의해요").click();
  await page.getByRole("button", { name: "이메일로 알림 받기" }).click();

  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  expect(subscribeRequests).toBe(0);
});
