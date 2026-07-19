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

const reportCopy = {
  ko: {
    label: "오늘의 피부 리포트",
    surveyOnly: "설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.",
    products: "살펴볼 제품 후보",
    routine: "오늘부터 가볍게 시작할 루틴",
    merchantNote: "현재 가격, 옵션, 전성분은 판매처에서 다시 확인해 주세요.",
    careTitle: "제품과 루틴 이어보기",
    careSection: "추천 제품 더 알아보기",
    careIntro: "궁금한 제품의 정보와 판매처를 한눈에 비교해 보세요.",
    consultation: "피부 고민이 계속 신경 쓰인다면",
  },
  en: {
    label: "Today's skin report",
    surveyOnly: "We've organized skincare ideas based on your questionnaire answers.",
    products: "Product options to explore",
    routine: "A simple routine to start today",
    merchantNote: "Check the retailer for current prices, options, and the full ingredient list.",
    careTitle: "Continue with products and your routine",
    careSection: "Learn more about your product options",
    careIntro: "Compare product details and retailers at a glance.",
    consultation: "If a skin concern keeps bothering you",
  },
  ja: {
    label: "今日の肌レポート",
    surveyOnly: "質問への回答をもとに、自分に合いそうなスキンケアをまとめました。",
    products: "気になるアイテム候補",
    routine: "今日から無理なく始めるルーティン",
    merchantNote: "現在の価格、オプション、全成分は販売店で改めてご確認ください。",
    careTitle: "アイテムとルーティンを続けて確認",
    careSection: "おすすめアイテムを詳しく見る",
    careIntro: "気になるアイテムの情報と販売店をまとめて比較できます。",
    consultation: "肌悩みが続いて気になるときは",
  },
  zh: {
    label: "今日肌肤报告",
    surveyOnly: "根据问卷回答，整理了适合自己的护肤建议。",
    products: "值得了解的候选产品",
    routine: "今天开始的简单护肤步骤",
    merchantNote: "当前价格、规格和完整成分，请以销售平台信息为准。",
    careTitle: "继续查看产品和护肤步骤",
    careSection: "进一步了解候选产品",
    careIntro: "一眼比较感兴趣的产品信息和销售平台。",
    consultation: "如果肌肤问题一直让你在意",
  },
} as const;

const survey = {
  type: "복합성",
  concerns: ["모공", "유분"],
  budget: 29000,
  avoid: [],
  category: "토너",
};

for (const [lang, copy] of Object.entries(reportCopy)) {
  test(`Report and Care use natural ${lang} copy`, async ({ page }) => {
    await page.addInitScript(({ nextLang, nextSurvey }) => {
      localStorage.setItem("aru.lang", nextLang);
      sessionStorage.setItem("gyeol_survey", JSON.stringify(nextSurvey));
    }, { nextLang: lang, nextSurvey: survey });

    await page.goto("/report");
    await expect(page.getByText(copy.label, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.surveyOnly, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: new RegExp(copy.products) }).click();
    await expect(page.getByText(copy.merchantNote, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: new RegExp(copy.routine) })).toBeVisible();

    await page.goto("/care");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.careTitle);
    await expect(page.getByText(copy.careSection, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.careIntro, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.consultation, { exact: true })).toBeVisible();
  });
}
