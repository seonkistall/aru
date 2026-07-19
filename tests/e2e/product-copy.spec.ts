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

const journeyCopy = {
  ko: {
    scanTitle: "오늘의 피부를 카메라로 살펴볼게요",
    cameraCta: "카메라로 살펴보기",
    fallback: "카메라 없이 설문으로 시작하기",
    surveyTitle: "나에게 맞는 스킨케어를 찾아볼게요",
    surveyLead: "피부와 취향을 조금 더 알려주세요.",
    concernHint: "평소 신경 쓰이는 고민을 골라주세요.",
    submit: "내 스킨케어 결과 보기",
  },
  en: {
    scanTitle: "Let's take a look at your skin today",
    cameraCta: "Check my skin with the camera",
    fallback: "Start with the questionnaire",
    surveyTitle: "Let's find skincare that suits you",
    surveyLead: "Tell us a little more about your skin and preferences.",
    concernHint: "Choose any concerns that have been on your mind.",
    submit: "See my skincare results",
  },
  ja: {
    scanTitle: "今日の肌をカメラでチェックしてみましょう",
    cameraCta: "カメラで肌をチェックする",
    fallback: "カメラを使わず、質問から始める",
    surveyTitle: "自分に合いそうなスキンケアを探しましょう",
    surveyLead: "肌のことや好みをもう少し教えてください。",
    concernHint: "普段気になっている肌悩みを選んでください。",
    submit: "スキンケア結果を見る",
  },
  zh: {
    scanTitle: "用相机看看今天的肌肤状态",
    cameraCta: "用相机查看肌肤",
    fallback: "不用相机，从问卷开始",
    surveyTitle: "一起找到适合自己的护肤方案",
    surveyLead: "再告诉我们一点肌肤状况和偏好。",
    concernHint: "请选择平时比较在意的肌肤问题。",
    submit: "查看我的护肤结果",
  },
} as const;

for (const [lang, copy] of Object.entries(journeyCopy)) {
  test(`camera recovery uses natural ${lang} copy`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("aru.lang", value);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(new DOMException("Denied for test", "NotAllowedError")),
        },
      });
    }, lang);
    await page.goto("/scan");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.scanTitle);
    await page.getByRole("button", { name: copy.cameraCta }).click();
    const fallback = page.getByRole("link", { name: copy.fallback });
    await expect(fallback).toBeVisible();
    const box = await fallback.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test(`Survey uses natural ${lang} copy`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("aru.lang", value), lang);
    await page.goto("/survey");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.surveyTitle);
    await expect(page.getByText(copy.surveyLead, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.concernHint, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.submit })).toBeVisible();
  });
}
