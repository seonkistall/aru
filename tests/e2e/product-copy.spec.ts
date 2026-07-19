import { expect, test } from "@playwright/test";

const anchors = {
  ko: {
    heading: ["오늘의 내 피부,", "어떤 스킨케어가 좋을까요?"],
    cta: "내 피부 살펴보기",
  },
  en: {
    heading: ["What skincare suits", "your skin today?"],
    cta: "Start my skin check",
  },
  ja: {
    heading: ["今日の肌には、", "どんなスキンケアが合いそうですか？"],
    cta: "肌をチェックする",
  },
  zh: {
    heading: ["今天的肌肤，", "适合怎样的护肤方案？"],
    cta: "看看我的肌肤状态",
  },
} as const;

for (const [lang, copy] of Object.entries(anchors)) {
  test(`Home uses natural ${lang} product copy`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("aru.lang", value), lang);
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(copy.heading[0]);
    await expect(heading).toContainText(copy.heading[1]);
    await expect(page.getByRole("link", { name: copy.cta })).toBeVisible();
  });
}
