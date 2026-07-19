import { expect, test } from "@playwright/test";

const anchors = {
  ko: {
    tagline: "아름다움을, 매일의 루틴으로",
    heading: ["오늘의 내 피부,", "어떤 스킨케어가 좋을까요?"],
    cta: "내 피부 살펴보기",
  },
  en: {
    tagline: "Beauty, part of every day",
    heading: ["What skincare suits", "your skin today?"],
    cta: "Start my skin check",
  },
  ja: {
    tagline: "きれいを、毎日の習慣に",
    heading: ["今日の肌には、", "どんなケアが合いそうですか？"],
    cta: "肌をチェックする",
  },
  zh: {
    tagline: "让美，成为每天的习惯",
    heading: ["今天的肌肤，", "适合怎么护理？"],
    cta: "看看我的肌肤状态",
  },
} as const;

for (const [lang, copy] of Object.entries(anchors)) {
  test(`Home uses natural ${lang} product copy`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("aru.lang", value), lang);
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(page.getByText(copy.tagline, { exact: true })).toBeVisible();
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

const followUpCopy = {
  ko: {
    routine: "오늘부터 가볍게 시작할 루틴",
    reminderTitle: "2주 뒤, 루틴은 잘 맞는지 같이 확인해 볼까요?",
    reminderLead: "2주와 4주 뒤에 한 번씩 이메일로 가볍게 알려드릴게요. 원할 때 언제든 그만 받을 수 있어요.",
    reminderCta: "이메일로 알림 받기",
    reminderSuccess: "알림을 신청했어요. 2주 뒤에 잊지 않도록 알려드릴게요.",
    checkinTitle: "스킨케어, 직접 써보니 어땠나요?",
    checkinLead: "짧게 사용감을 남겨두면 내 루틴을 돌아보기 좋아요.",
    studioTitle: "공유할 문구 다듬기",
    shareNote: "오늘의 피부 특징을 간단히 정리했어요.",
    shareCta: "오늘의 피부 리포트 공유하기",
  },
  en: {
    routine: "A simple routine to start today",
    reminderTitle: "Let's check in on your routine in two weeks",
    reminderLead: "We'll send a light check-in at two and four weeks. You can stop the emails at any time.",
    reminderCta: "Get email reminders",
    reminderSuccess: "You're signed up. We'll remind you in two weeks.",
    checkinTitle: "How has your skincare felt so far?",
    checkinLead: "A quick note about how it felt can help you look back on your routine.",
    studioTitle: "Edit the text before sharing",
    shareNote: "Here's a quick look at today's skin.",
    shareCta: "Share today's skin report",
  },
  ja: {
    routine: "今日から無理なく始めるルーティン",
    reminderTitle: "2週間後、ルーティンの様子を一緒に確認しませんか？",
    reminderLead: "2週間後と4週間後に一度ずつ、メールでそっとお知らせします。いつでも配信を停止できます。",
    reminderCta: "メールでお知らせを受け取る",
    reminderSuccess: "お知らせを受け付けました。2週間後にメールでご案内します。",
    checkinTitle: "スキンケアを実際に使ってみて、いかがでしたか？",
    checkinLead: "使用感を短く残しておくと、ルーティンを振り返るときに役立ちます。",
    studioTitle: "共有する文を編集",
    shareNote: "今日の肌の特徴を簡単にまとめました。",
    shareCta: "今日の肌レポートを共有",
  },
  zh: {
    routine: "今天开始的简单护肤步骤",
    reminderTitle: "两周后，一起看看这套护肤步骤用得怎么样吧",
    reminderLead: "我们会在第2周和第4周各发一封轻提醒邮件，随时都可以取消。",
    reminderCta: "接收邮件提醒",
    reminderSuccess: "提醒已开启。两周后会发邮件提醒你。",
    checkinTitle: "这套护肤品实际用起来怎么样？",
    checkinLead: "简单记录一下使用感受，回顾护肤步骤时会更方便。",
    studioTitle: "调整分享文案",
    shareNote: "简单整理了今天的肌肤特点。",
    shareCta: "分享今日肌肤报告",
  },
} as const;

for (const [lang, copy] of Object.entries(followUpCopy)) {
  test(`follow-up uses natural ${lang} copy`, async ({ page }) => {
    await page.route("**/api/reengage/subscribe", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    await page.addInitScript(({ nextLang, nextSurvey }) => {
      localStorage.setItem("aru.lang", nextLang);
      sessionStorage.setItem("gyeol_survey", JSON.stringify(nextSurvey));
    }, { nextLang: lang, nextSurvey: survey });

    await page.goto("/report");
    await page.getByRole("tab", { name: new RegExp(copy.routine) }).click();
    await expect(page.getByText(copy.reminderTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.reminderLead, { exact: true })).toBeVisible();
    await page.locator("input[type='email']").fill("person@example.com");
    await page.locator("input[type='checkbox']").check();
    await page.getByRole("button", { name: copy.reminderCta }).click();
    await expect(page.getByRole("status")).toHaveText(copy.reminderSuccess);

    await page.goto("/checkin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.checkinTitle);
    await expect(page.getByText(copy.checkinLead, { exact: true })).toBeVisible();

    await page.goto("/studio");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.studioTitle);
    await expect(page.getByText(copy.shareNote, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: copy.shareCta })).toBeVisible();
  });
}

test("Check-in waiting, saved, and complete states keep their promise", async ({ page }) => {
  const week = 7 * 24 * 60 * 60 * 1000;
  await page.addInitScript(({ startedAt }) => {
    localStorage.setItem("aru.lang", "ko");
    if (localStorage.getItem("gyeol_purchases")) return;
    localStorage.setItem("gyeol_purchases", JSON.stringify([{
      id: "copy-checkin-use",
      sku_id: "cr3",
      name: "레드 블레미쉬 수분 크림",
      confirmedUse: true,
      ts: startedAt,
    }]));
  }, { startedAt: Date.now() - week });

  await page.goto("/checkin");
  await expect(page.getByText("2주 정도 사용해 본 뒤에 다시 물어볼게요.", { exact: true })).toBeVisible();

  await page.evaluate((startedAt) => {
    const uses = JSON.parse(localStorage.getItem("gyeol_purchases") ?? "[]");
    localStorage.setItem("gyeol_purchases", JSON.stringify(uses.map((use: { ts: number }) => ({ ...use, ts: startedAt }))));
  }, Date.now() - 3 * week);
  await page.reload();

  await page.getByRole("button", { name: "좋음" }).click();
  await page.getByRole("button", { name: "없었어요" }).click();
  await page.getByRole("button", { name: "할래요" }).click();
  await page.getByRole("button", { name: "기록하기" }).click();

  await expect(page.getByRole("status")).toHaveText("남겨주신 피드백을 저장했어요.");
  await expect(page.getByText("체크인을 모두 마쳤어요. 다음 스킨케어가 궁금할 때 다시 피부를 살펴보세요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘 피부 다시 살펴보기" })).toHaveAttribute("href", "/scan");
});

const privacyCopy = {
  ko: {
    title: "사진과 데이터는 이렇게 사용해요",
    lead: "기본 촬영은 기기에서 처리하고, 필요한 기능만 직접 선택할 수 있어요.",
    summary: "기기에서 먼저 확인해요",
    details: "데이터 처리 기준 자세히 보기",
    provider: "AI 분석을 선택한 촬영에서만 얼굴 부분 이미지가 Google Gemini 또는 OpenAI로 전송되며, 현재 추천을 만드는 데 사용돼요.",
    research: "연구용 저장을 선택하면 얼굴 부분 이미지, 라벨과 촬영 품질 정보를 이 브라우저에 최대 120개까지 보관해요. 파일럿에서 별도로 동의한 연구 데이터의 서버 보존 기간은 기본 180일이에요.",
    email: "이메일 알림 기록에는 이메일, 동의 문구 버전과 발송 시각이 저장돼요. 해지하거나 마지막 알림을 보낸 뒤 30일 안에 삭제 대상이 됩니다.",
    deleteCta: "이 기기의 ARU 데이터 모두 지우기",
    confirmTitle: "이 기기의 데이터를 모두 지울까요?",
    confirmBody: "스캔 결과, 설문, 체크인과 설정이 삭제돼요. 이메일 알림과 연구 서버 데이터는 포함되지 않아요.",
    confirmCta: "모두 지우기",
    medical: "ARU는 화장품 선택을 도와드려요",
    scanDetails: "사진과 데이터 사용 자세히 보기",
    scanSummary: "사진은 기기에서 먼저 확인해요. 전송과 저장은 선택한 경우에만 진행됩니다.",
    unsubscribeTitle: "이메일 알림을 그만 받을까요?",
    unsubscribeBody: "2주·4주 루틴 확인 메일을 중단해요.",
    unsubscribeCta: "이메일 알림 해지하기",
    invalid: "이 링크는 사용할 수 없거나 유효 기간이 지났어요.",
  },
  en: {
    title: "How we use your photos and data",
    lead: "Standard camera checks run on your device, and you choose any extra features yourself.",
    summary: "Checked on your device first",
    details: "See how your data is handled",
    provider: "Only when you choose AI analysis is a face-region image sent to Google Gemini or OpenAI for the current recommendation.",
    research: "If you choose research storage, up to 120 face-region images with labels and capture-quality information are kept in this browser. Separately consented pilot research data is kept on the server for 180 days by default.",
    email: "Email reminder records include your email, consent-copy version, and send times. They become eligible for deletion within 30 days after you unsubscribe or the final reminder is sent.",
    deleteCta: "Delete all ARU data on this device",
    confirmTitle: "Delete all data on this device?",
    confirmBody: "Your scan results, questionnaire, check-ins, and settings will be deleted. Email reminders and research server data aren't included.",
    confirmCta: "Delete everything",
    medical: "ARU helps you choose skincare products",
    scanDetails: "Learn more about photo and data use",
    scanSummary: "Your photo is checked on your device first. Sending and storage happen only when you choose them.",
    unsubscribeTitle: "Stop email reminders?",
    unsubscribeBody: "Stop the 2- and 4-week routine check-in emails.",
    unsubscribeCta: "Unsubscribe from email reminders",
    invalid: "This link can't be used or has expired.",
  },
  ja: {
    title: "写真とデータはこのように使います",
    lead: "基本の撮影は端末内で行い、必要な機能だけ自分で選べます。",
    summary: "まず端末で確認します",
    details: "データの取り扱いを詳しく見る",
    provider: "AI分析を選んだ撮影に限り、顔部分の画像がGoogle GeminiまたはOpenAIへ送られ、今回のおすすめ作成に使われます。",
    research: "研究用保存を選ぶと、顔部分の画像、ラベル、撮影品質の情報をこのブラウザに最大120件まで保存します。パイロットで別途同意した研究データのサーバー保存期間は、初期設定で180日です。",
    email: "メールのお知らせの記録には、メールアドレス、同意文のバージョン、送信時刻が保存されます。配信停止または最後のお知らせから30日以内に削除対象となります。",
    deleteCta: "この端末のARUデータをすべて削除",
    confirmTitle: "この端末のデータをすべて削除しますか？",
    confirmBody: "スキャン結果、質問への回答、チェックイン、設定が削除されます。メールのお知らせと研究サーバーのデータは含まれません。",
    confirmCta: "すべて削除",
    medical: "ARUはスキンケア商品の選択をお手伝いします",
    scanDetails: "写真とデータの利用を詳しく見る",
    scanSummary: "写真はまず端末で確認します。送信と保存は選んだ場合にだけ行われます。",
    unsubscribeTitle: "メールのお知らせを停止しますか？",
    unsubscribeBody: "2週間後・4週間後のルーティン確認メールを停止します。",
    unsubscribeCta: "メールのお知らせを停止する",
    invalid: "このリンクは使用できないか、有効期限が切れています。",
  },
  zh: {
    title: "照片和数据会这样使用",
    lead: "基础拍摄在设备上处理，其他功能由你按需选择。",
    summary: "先在设备上查看",
    details: "查看数据处理详情",
    provider: "只有选择AI分析时，面部区域图片才会发送至Google Gemini或OpenAI，用于生成本次建议。",
    research: "选择研究存储后，此浏览器最多保存120条面部区域图片、标签和拍摄质量信息。试点中另行同意的研究数据，服务器默认保留180天。",
    email: "邮件提醒记录包含邮箱、同意文案版本和发送时间。退订或最后一封提醒发出后，将在30天内进入删除流程。",
    deleteCta: "删除此设备上的全部ARU数据",
    confirmTitle: "要删除此设备上的全部数据吗？",
    confirmBody: "肌肤检查结果、问卷、回访和设置将被删除。邮件提醒和研究服务器数据不在其中。",
    confirmCta: "全部删除",
    medical: "ARU帮助你选择护肤产品",
    scanDetails: "了解照片和数据的使用方式",
    scanSummary: "照片会先在设备上查看，只有选择后才会发送或保存。",
    unsubscribeTitle: "要停止接收邮件提醒吗？",
    unsubscribeBody: "停止第2周和第4周的护肤回访邮件。",
    unsubscribeCta: "取消邮件提醒",
    invalid: "此链接无法使用或已过期。",
  },
} as const;

for (const [lang, copy] of Object.entries(privacyCopy)) {
  test(`privacy disclosure uses natural ${lang} copy`, async ({ page }) => {
    await page.addInitScript((nextLang) => localStorage.setItem("aru.lang", nextLang), lang);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(page.getByText(copy.lead, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.summary })).toBeVisible();
    await expect(page.getByText(copy.provider, { exact: true })).toBeHidden();
    await page.getByText(copy.details, { exact: true }).click();
    await expect(page.getByText(copy.provider, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.research, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.email, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: copy.deleteCta }).click();
    await expect(page.getByRole("heading", { name: copy.confirmTitle })).toBeVisible();
    await expect(page.getByText(copy.confirmBody, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.confirmCta })).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.medical })).toBeVisible();

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/unsubscribe");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.unsubscribeTitle);
    await expect(page.getByText(copy.unsubscribeBody, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.unsubscribeCta })).toBeDisabled();
    await expect(page.getByText(copy.invalid, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}
