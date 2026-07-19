# ARU Consumer Product Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ARU's awkward consumer copy with the approved friendly product voice in KO/EN/JA/ZH, preserve trust boundaries, prevent text clipping or corrupted characters, and deploy the verified result.

**Execution status:** Tasks 1–6 are implemented and verified. Task 7 release
tracking continues in [PR #57](https://github.com/seonkistall/aru/pull/57),
the 320 px locale follow-up [PR #58](https://github.com/seonkistall/aru/pull/58),
and the [multilingual product copy QA ledger](../../qa/2026-07-19-product-copy-polish.md).

**Architecture:** Keep the existing Korean-message-ID `t()` architecture and update only consumer message IDs, the three dictionaries, user-visible templates, metadata, and the smallest layout rules exposed by longer copy. Each journey segment gets a red-green test cycle and a reviewable commit; one final cross-locale browser matrix validates text fit and character integrity.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript, existing `lib/i18n/core.ts`, Vitest 4.1.9, Playwright 1.61.1, Vercel, Supabase runtime checks.

## Global Constraints

- Voice hierarchy: skin exploration first, routine second, product candidates third.
- Korean voice: friendly conversational honorifics; no `너`, anxiety marketing, self-praise, or medical certainty.
- EN/JA/ZH are independently authored for local service conventions, not literal Korean substitutions.
- Do not change camera thresholds, recommendation scores, routes, data schemas, consent scope, retention values, or API security.
- Keep medical, external-provider, storage, retention, and deletion facts accurate.
- Never claim Check-in feedback changes a later recommendation unless code consumes it.
- Primary and secondary CTAs allow two lines, remain at least 44 px high, and are never ellipsized.
- Required copy-fit viewports: 320 × 800, 360 × 800, 393 × 873, and 768 × 1024.
- Rendered pages must contain no `�`, leaked Korean message IDs in EN/JA/ZH, raw translation keys, clipped text, or unintended horizontal scroll.
- Follow red-green-refactor: no production copy change before its focused test fails for the expected legacy phrase.
- Design source: `docs/superpowers/specs/2026-07-19-product-copy-design.md`.

---

## File map

**Create**

- `tests/product-copy-contract.test.ts` — source-level approved/forbidden copy contract, extended task by task.
- `tests/e2e/product-copy.spec.ts` — visible KO/EN/JA/ZH copy and focused journey assertions.
- `tests/e2e/product-copy-fit.spec.ts` — reusable text overflow, character integrity, and viewport matrix.

**Modify**

- `app/layout.tsx` — title, description, Open Graph, Twitter, and image alt metadata.
- `app/page.tsx` — Home annotation, headline, descriptions, CTAs, cards, and annotation wrapping.
- `app/scan/page.tsx`, `app/scan/info-sheet.tsx`, `app/scan/scan-controls.tsx`,
  `app/scan/use-quality-loop.ts` — Scan entry, consent summary, camera guidance, and recovery copy.
- `app/survey/page.tsx` — Survey title, scan-assisted selection, hints, progress, and CTA.
- `app/report/page.tsx`, `app/components/product-card.tsx`,
  `app/components/product-compare.tsx`, `lib/report-trust.ts`,
  `lib/recommend.ts` — Report, product, comparison, trust, and routine copy.
- `app/care/page.tsx`, `lib/care.ts` — Care empty state, merchant, and consultation language.
- `app/components/reengage-optin.tsx`, `lib/reengage.ts`,
  `app/checkin/page.tsx`, `app/components/share-card.tsx`,
  `app/scan/page.tsx`, `app/studio/page.tsx` — Reminder, email, Check-in, Share, and Studio copy.
- `app/privacy/page.tsx`, `app/scan/info-sheet.tsx`,
  `app/unsubscribe/unsubscribe-form.tsx` — progressive privacy, consent, medical, deletion, and unsubscribe copy.
- `lib/i18n/en.ts`, `lib/i18n/ja.ts`, `lib/i18n/zh.ts` — natural locale-specific values for every changed Korean message ID.
- `tests/i18n-coverage.test.ts`, existing E2E copy tests — complete consumer coverage and updated accessible names.
- `docs/i18n-ux-flow.md`, `README.md`, `docs/STATUS.md` — current copy examples and release evidence.

---

### Task 1: Home, metadata, and localized voice anchors

**Files:**

- Create: `tests/product-copy-contract.test.ts`
- Create: `tests/e2e/product-copy.spec.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`
- Modify: `docs/i18n-ux-flow.md`

**Interfaces:**

- Consumes: `t(msg: string, params?: Record<string, string | number>): string`.
- Produces: approved Home Korean message IDs and EN/JA/ZH anchor values used as the voice reference for later tasks.

- [ ] **Step 1: Write the failing Home copy contract**

Create `tests/product-copy-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("ARU consumer product copy", () => {
  it("uses the approved Home journey", () => {
    const home = source("app/page.tsx");
    for (const phrase of [
      "나에게 맞는 화장품 찾기,",
      "30초면 충분해요.",
      "오늘의 내 피부,",
      "어떤 스킨케어가 좋을까요?",
      "AI 카메라로 지금 피부에 맞는 제품과 루틴을 함께 찾아봐요.",
      "내 피부 살펴보기",
      "카메라 없이 설문으로 시작하기",
      "사진은 기기에서 확인하고, 동의 없이 저장하지 않아요.",
    ]) {
      expect(home).toContain(phrase);
    }
  });

  it("removes the legacy Home marketing phrases", () => {
    const consumer = [
      source("app/page.tsx"),
      source("app/layout.tsx"),
      source("docs/i18n-ux-flow.md"),
    ].join("\n");
    for (const phrase of [
      "4만원짜리 실패는 그만",
      "너한테 맞는 최대 셋",
      "내 피부 결, 보러 가기",
      "솔직하게 골라드려요",
      "No more ₩40,000 mistakes",
      "Go see my skin texture",
    ]) {
      expect(consumer).not.toContain(phrase);
    }
  });
});
```

- [ ] **Step 2: Run the Home contract and observe RED**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts
```

Expected: FAIL because the approved phrases are absent and legacy phrases are present.

- [ ] **Step 3: Add a failing visible four-locale Home test**

Create `tests/e2e/product-copy.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const anchors = {
  ko: { heading: ["오늘의 내 피부,", "어떤 스킨케어가 좋을까요?"], cta: "내 피부 살펴보기" },
  en: { heading: ["What skincare suits", "your skin today?"], cta: "Start my skin check" },
  ja: { heading: ["今日の肌には、", "どんなケアが合いそうですか？"], cta: "肌をチェックする" },
  zh: { heading: ["今天的肌肤，", "适合怎么护理？"], cta: "看看我的肌肤状态" },
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
```

Run:

```powershell
npm.cmd run test:mobile-ui -- --grep "Home uses natural"
```

Expected: FAIL on all four legacy headings/CTAs.

- [ ] **Step 4: Implement the approved Home and wrapping behavior**

In `app/page.tsx`, replace the hero with the approved message IDs and remove
`whiteSpace: "nowrap"` from `data-testid="hero-callout"`. Use a bounded,
authored two-line block:

```tsx
<span
  data-testid="hero-callout"
  style={{
    position: "absolute",
    right: "calc(100% - 28px)",
    top: 18,
    width: 156,
    fontFamily: "var(--font-display)",
    fontSize: 19,
    color: "var(--plum)",
    lineHeight: 1.18,
    transform: "rotate(-7deg)",
    textAlign: "right",
    whiteSpace: "normal",
  }}
>
  {t("나에게 맞는 화장품 찾기,")}<br />{t("30초면 충분해요.")}
</span>
```

Use:

```tsx
<h1>
  {t("오늘의 내 피부,")}<br />
  {t("어떤 스킨케어가 좋을까요?")}
</h1>
<p>{t("AI 카메라로 지금 피부에 맞는 제품과 루틴을 함께 찾아봐요.")}</p>
```

Change the flow labels to `카메라`, `설문`, `리포트`, apply the three exact
support-card titles/bodies from the design, and use the approved primary,
secondary, and privacy strings.

- [ ] **Step 5: Replace metadata with the approved promise**

In `app/layout.tsx`, use:

```ts
export const metadata: Metadata = {
  title: "ARU | 오늘의 피부에 맞는 스킨케어 찾기",
  description:
    "AI 카메라와 간단한 설문으로 오늘의 피부를 살펴보고, 제품 후보와 스킨케어 루틴을 함께 확인해 보세요.",
  metadataBase: new URL("https://aru-beauty.vercel.app"),
  openGraph: {
    title: "ARU | 오늘의 피부에 맞는 스킨케어 찾기",
    description:
      "오늘의 피부를 살펴보고 제품 후보와 스킨케어 루틴을 함께 확인해 보세요.",
    url: "https://aru-beauty.vercel.app",
    siteName: "ARU",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ARU 오늘의 피부 리포트" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ARU | Find skincare for your skin today",
    description: "Explore your skin and build a simple K-beauty routine with ARU.",
    images: ["/og.png"],
  },
};
```

- [ ] **Step 6: Author the Home anchors in each dictionary**

Add the exact anchor values from the design. The dictionary entries must
include:

```ts
// en.ts
"나에게 맞는 화장품 찾기,": "Find skincare that fits you,",
"30초면 충분해요.": "in just 30 seconds.",
"오늘의 내 피부,": "What skincare suits",
"어떤 스킨케어가 좋을까요?": "your skin today?",
"내 피부 살펴보기": "Start my skin check",
"카메라 없이 설문으로 시작하기": "Start with the questionnaire",

// ja.ts
"나에게 맞는 화장품 찾기,": "自分に合うコスメ探しは、",
"30초면 충분해요.": "30秒から。",
"오늘의 내 피부,": "今日の肌には、",
"어떤 스킨케어가 좋을까요?": "どんなケアが合いそうですか？",
"내 피부 살펴보기": "肌をチェックする",
"카메라 없이 설문으로 시작하기": "カメラを使わず、質問から始める",

// zh.ts
"나에게 맞는 화장품 찾기,": "找到适合自己的护肤品，",
"30초면 충분해요.": "30秒就够了。",
"오늘의 내 피부,": "今天的肌肤，",
"어떤 스킨케어가 좋을까요?": "适合怎么护理？",
"내 피부 살펴보기": "看看我的肌肤状态",
"카메라 없이 설문으로 시작하기": "不用相机，从问卷开始",
```

Author the Home description, flow labels, card titles/bodies, and privacy note
in the same locale voice. Remove the replaced legacy keys from all three
dictionaries.

- [ ] **Step 7: Expand the Home layout regression to all required widths**

Modify the existing Home test in `tests/e2e/mobile-layout.spec.ts` to loop over
`[320, 360, 393, 768]`, wait for `document.fonts.ready`, and assert the callout,
headline, primary CTA, and document stay inside the viewport. Do not hard-code
360 in `expectInsideViewport`; use `page.viewportSize()!.width`.

- [ ] **Step 8: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/i18n-coverage.test.ts
npm.cmd run test:mobile-ui -- --grep "Home uses natural|localized home"
```

Expected: all focused tests PASS.

Commit:

```powershell
git add app/page.tsx app/layout.tsx lib/i18n/en.ts lib/i18n/ja.ts lib/i18n/zh.ts docs/i18n-ux-flow.md tests/product-copy-contract.test.ts tests/e2e/product-copy.spec.ts tests/e2e/mobile-layout.spec.ts
git commit -m "fix(copy): establish ARU consumer voice"
```

---

### Task 2: Scan and Survey journey

**Files:**

- Modify: `tests/product-copy-contract.test.ts`
- Modify: `tests/e2e/product-copy.spec.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`
- Modify: `app/scan/page.tsx`
- Modify: `app/scan/info-sheet.tsx`
- Modify: `app/scan/scan-controls.tsx`
- Modify: `app/scan/use-quality-loop.ts`
- Modify: `app/survey/page.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`

**Interfaces:**

- Consumes: approved Home dictionaries and existing camera-state contracts.
- Produces: approved Scan/Survey message IDs without changing camera or Survey data behavior.

- [ ] **Step 1: Add failing Scan/Survey source assertions**

Append a test that reads `app/scan/page.tsx` and `app/survey/page.tsx` and
expects every approved phrase from sections 5 of the design, including:

```ts
for (const phrase of [
  "오늘의 피부를 카메라로 살펴볼게요",
  "얼굴을 가이드에 맞추면 빛과 각도를 확인한 뒤 자동으로 촬영해요.",
  "30초 피부 체크, 시작해볼까요?",
  "카메라로 살펴보기",
  "피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요.",
  "설문으로 이어가기",
  "나에게 맞는 스킨케어를 찾아볼게요",
  "피부와 취향을 조금 더 알려주세요.",
  "사진에서 확인한 {signals} 항목을 먼저 선택했어요. 내 느낌과 다르면 바꿔주세요.",
  "평소 신경 쓰이는 고민을 골라주세요.",
  "내 스킨케어 결과 보기",
]) {
  expect(`${scan}\n${survey}`).toContain(phrase);
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts -t "Scan/Survey"
```

Expected: FAIL with the first missing approved phrase.

- [ ] **Step 3: Apply the approved Korean copy without behavior changes**

Replace only `t()` message IDs and accessible names. Keep camera state
conditions and click handlers intact. Use one post-capture CTA,
`설문으로 이어가기`, because both branches navigate to `/survey`.

Use the exact user-approved failure sentence. Keep each quality message as
`cause + action`; for example:

```ts
return !quality.brightness
  ? t("피부가 어둡게 보여요. 부드러운 정면 빛이 있는 곳으로 이동해 주세요.")
  : !quality.glare
    ? t("빛 반사가 강해요. 직접 조명을 피하고 다시 확인해 주세요.")
    : !quality.steady
      ? t("화면이 흔들리고 있어요. 잠시 그대로 있어주세요.")
      : t("좋아요. 잠시 그대로 있어주세요.");
```

- [ ] **Step 4: Author natural EN/JA/ZH Scan and Survey values**

Use these anchor translations and match their register for the remaining
cause-specific guidance:

```ts
// EN anchors
"오늘의 피부를 카메라로 살펴볼게요": "Let's take a look at your skin today",
"카메라로 살펴보기": "Check my skin with the camera",
"피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요.":
  "Your skin isn't showing clearly yet. Face the camera in a bright spot, line up with the guide, and try again.",
"나에게 맞는 스킨케어를 찾아볼게요": "Let's find skincare that suits you",
"평소 신경 쓰이는 고민을 골라주세요.": "Choose any concerns that have been on your mind.",
"내 스킨케어 결과 보기": "See my skincare results",

// JA anchors
"오늘의 피부를 카메라로 살펴볼게요": "今日の肌をカメラでチェックしてみましょう",
"카메라로 살펴보기": "カメラで肌をチェックする",
"나에게 맞는 스킨케어를 찾아볼게요": "自分に合いそうなスキンケアを探しましょう",
"평소 신경 쓰이는 고민을 골라주세요.": "普段気になっている肌悩みを選んでください。",
"내 스킨케어 결과 보기": "スキンケア結果を見る",

// ZH anchors
"오늘의 피부를 카메라로 살펴볼게요": "用相机看看今天的肌肤状态",
"카메라로 살펴보기": "用相机查看肌肤",
"나에게 맞는 스킨케어를 찾아볼게요": "一起找到适合自己的护肤方案",
"평소 신경 쓰이는 고민을 골라주세요.": "请选择平时比较在意的肌肤问题。",
"내 스킨케어 결과 보기": "查看我的护肤结果",
```

- [ ] **Step 5: Add visible camera fallback and Survey assertions**

In `tests/e2e/product-copy.spec.ts`, stub `NotAllowedError`, click the localized
camera CTA, and assert the localized Survey fallback is visible and at least
44 px high. Add a Survey test with canonical Korean stored values and assert
the approved title, concern hint, and submit CTA in all four locales.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/i18n-coverage.test.ts
npm.cmd run test:mobile-ui -- --grep "camera|Survey|survey"
```

Expected: focused unit and E2E tests PASS.

Commit:

```powershell
git add app/scan app/survey/page.tsx lib/i18n/en.ts lib/i18n/ja.ts lib/i18n/zh.ts tests/product-copy-contract.test.ts tests/e2e/product-copy.spec.ts tests/e2e/mobile-layout.spec.ts
git commit -m "fix(copy): make scan and survey feel conversational"
```

---

### Task 3: Report, products, routine, and Care

**Files:**

- Modify: `tests/product-copy-contract.test.ts`
- Modify: `tests/e2e/product-copy.spec.ts`
- Modify: `tests/report-trust.test.ts`
- Modify: `tests/recommend-copy.regression-3.test.ts`
- Modify: `app/report/page.tsx`
- Modify: `app/components/product-card.tsx`
- Modify: `app/components/product-compare.tsx`
- Modify: `app/care/page.tsx`
- Modify: `lib/report-trust.ts`
- Modify: `lib/recommend.ts`
- Modify: `lib/care.ts`
- Modify: `app/api/reason/route.ts`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`

**Interfaces:**

- Consumes: `Survey`, `RecoResult`, `ReportTrust`, and existing claim filters.
- Produces: user-facing candidate/routine copy that remains particle-safe and claim-safe.

- [ ] **Step 1: Add failing Report/Product/Care contracts**

Expect the exact approved report, recommendation-basis, product-candidate,
merchant, routine, and follow-up strings from section 6, plus:

```ts
expect(source("app/report/page.tsx")).toContain(
  "설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.",
);
expect(source("app/components/product-card.tsx")).toContain("이 제품 사용 시작하기");
expect(source("app/components/product-card.tsx")).toContain("사용 시작일을 기록했어요.");
expect(source("app/care/page.tsx")).toContain("아직 이어서 볼 리포트가 없어요.");
expect(source("app/care/page.tsx")).toContain("추천 제품 더 알아보기");
expect(source("app/care/page.tsx")).toContain("피부 고민이 계속 신경 쓰인다면");
```

Reject consumer-visible phrases:

```ts
for (const phrase of [
  "사진과 설문을 함께 읽었어요.",
  "스캔 신호를 추천에 반영했어요",
  "후속 연결",
  "구매/상담 연결",
  "이 제품을 사용하기 시작했어요",
]) {
  expect(reportAndCare).not.toContain(phrase);
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/report-trust.test.ts
```

Expected: copy contract FAILS on legacy strings.

- [ ] **Step 3: Update Report and product components**

Use the exact section-6 message IDs. Preserve dynamic variables but use the
particle-safe sentence:

```tsx
{t(
  "피부 타입 {type}, 고민 {concerns}, 예산 {budget}을 함께 고려했어요. 이 조건에 가까운 {category} 제품을 최대 세 개 보여드릴게요.",
  {
    type: t(survey.type),
    concerns: concernText,
    budget: t(budgetLabel(survey.budget)),
    category: t(survey.category),
  },
)}
```

Change product-card copy only; keep `recordProductUse` behavior unchanged.

- [ ] **Step 4: Make trust and routine templates conversational**

In `lib/report-trust.ts`, keep the three tones but use:

```ts
const SOURCE_LABEL: Record<AnalysisSource, string> = {
  "roi-calibrated": "기기에서 확인",
  "vision-api": "기기 확인 + 선택한 AI 분석",
  "ml-model": "기기에서 확인",
};

if (reads.retakeRecommended) {
  return {
    tone: "retake",
    title: "사진은 참고만 했어요",
    body: "촬영 조건이 충족되지 않아 설문 답변을 중심으로 정리했어요. 밝은 곳에서 정면으로 다시 촬영하면 피부 특징을 더 선명하게 확인할 수 있어요.",
    sourceLabel: SOURCE_LABEL[reads.source],
    checks,
    reasons,
  };
}
```

The survey-led and trusted variants use `카메라에서 확인한 특징` and do not
promise precision. Update `tests/report-trust.test.ts` to assert those exact
boundaries.

In `lib/recommend.ts`, rewrite only visible titles/bodies/why strings that use
`스캔 신호`, `골라뒀어요`, or unsupported future improvement claims. Preserve
the existing boolean branches, categories, cadence, and product attachment.

- [ ] **Step 5: Keep the optional LLM in the same voice**

Update the `/api/reason` system instruction to request one short, courteous
consumer sentence in the selected locale, based only on the supplied type,
concerns, budget, exclusions, and product attributes. Retain the exact banned
claim instruction and JSON shape.

- [ ] **Step 6: Author independent locale values and test grammar**

EN uses `product options`, not `perfect picks`; JA uses `候補` and polite
sentences; ZH uses `产品选择` or `候选产品`, not guaranteed fit. Extend
`tests/recommend-copy.regression-3.test.ts` to reject English articles or
Korean particles leaking into all four locales.

- [ ] **Step 7: Add visible Report/Care journey tests**

Seed canonical Survey and Reads storage. Assert localized report title,
survey-only sentence, product section, routine title, Care section, and
merchant note. The test must not click a real merchant URL.

- [ ] **Step 8: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/report-trust.test.ts tests/recommend-copy.regression-3.test.ts tests/product-trust.test.ts
npm.cmd run test:mobile-ui -- --grep "Report|Care|report|care"
```

Expected: all focused tests PASS.

Commit:

```powershell
git add app/report/page.tsx app/components/product-card.tsx app/components/product-compare.tsx app/care/page.tsx app/api/reason/route.ts lib/report-trust.ts lib/recommend.ts lib/care.ts lib/i18n tests/product-copy-contract.test.ts tests/report-trust.test.ts tests/recommend-copy.regression-3.test.ts tests/e2e/product-copy.spec.ts
git commit -m "fix(copy): clarify reports products and routines"
```

---

### Task 4: Reminder, email, Check-in, Share, and Studio

**Files:**

- Modify: `tests/product-copy-contract.test.ts`
- Modify: `tests/reengage-locale.regression-9.test.ts`
- Modify: `tests/e2e/reengage-email-validation.regression-5.spec.ts`
- Modify: `tests/e2e/reengage-locale.regression-9.spec.ts`
- Modify: `tests/e2e/product-copy.spec.ts`
- Modify: `app/components/reengage-optin.tsx`
- Modify: `lib/reengage.ts`
- Modify: `app/checkin/page.tsx`
- Modify: `app/components/share-card.tsx`
- Modify: `app/scan/page.tsx`
- Modify: `app/studio/page.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`

**Interfaces:**

- Consumes: existing reminder locale persistence, Resend payload, product-use records, and Share API.
- Produces: friendly follow-up copy without claiming Check-in-driven recommendation learning.

- [ ] **Step 1: Add failing follow-up and false-claim tests**

Expect the exact approved strings from section 7. Explicitly reject:

```ts
const checkin = source("app/checkin/page.tsx");
expect(checkin).toContain(
  "체크인을 모두 마쳤어요. 다음 스킨케어가 궁금할 때 다시 피부를 살펴보세요.",
);
expect(checkin).not.toContain("다음 추천이 더 정확해져요");
expect(checkin).not.toContain("다음 스캔에 더 정확히 반영할게요");

const email = source("lib/reengage.ts");
expect(email).not.toContain("Your feedback makes the next recommendation more accurate");
expect(email).not.toContain("次回のおすすめがより正確になります");
expect(email).not.toContain("下次推荐更准确");
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/reengage-locale.regression-9.test.ts
```

Expected: FAIL on current reminder CTA/body and Check-in accuracy claims.

- [ ] **Step 3: Update reminder UI and E2E accessible names**

Use:

```tsx
<p>{t("2주 뒤, 루틴은 잘 맞는지 같이 확인해 볼까요?")}</p>
<p>{t("2주와 4주 뒤에 한 번씩 이메일로 가볍게 알려드릴게요. 원할 때 언제든 그만 받을 수 있어요.")}</p>
<button>{t("이메일로 알림 받기")}</button>
```

Keep HTML email validation and locale payload unchanged. Update the existing
E2E selectors to the new natural labels.

- [ ] **Step 4: Implement exact week-specific email copy**

Change `EMAIL_COPY` so `subject`, `body`, and `cta` accept the week:

```ts
type EmailCopy = {
  subject: (week: 2 | 4) => string;
  heading: (week: 2 | 4) => string;
  body: (week: 2 | 4) => string;
  cta: (week: 2 | 4) => string;
  footer: string;
  unsubscribe: string;
};
```

Korean exact values:

```ts
subject: (week) =>
  week === 2 ? "ARU | 루틴을 시작한 지 2주가 됐어요" : "ARU | 4주 동안의 루틴을 돌아볼까요?",
heading: (week) =>
  week === 2 ? "요즘 루틴은 잘 맞고 있나요?" : "루틴을 사용한 지 4주가 됐어요",
body: (week) =>
  week === 2
    ? "잠깐 시간을 내어 지금까지의 사용감을 남겨보세요."
    : "지금까지의 사용감을 남기고 다음 스킨케어를 살펴보세요.",
cta: (week) => `${week}주 체크인 남기기`,
unsubscribe: "이메일 알림 그만 받기",
```

Write equally natural week-specific EN/JA/ZH values and call
`copy.heading(opts.week)` / `copy.body(opts.week)` / `copy.cta(opts.week)` in
the HTML. Render the heading as the email's visible `<h1>`.

- [ ] **Step 5: Update email tests before implementation passes**

Capture both week-2 and week-4 payloads for every locale. Assert distinct
subjects, locale-appropriate CTA, `lang`, unsubscribe copy, and absence of
future-accuracy claims.

- [ ] **Step 6: Update Check-in and Share**

Use the exact approved Check-in title, lead, waiting, success, completion, and
restart CTA. Keep storage behavior unchanged. Replace Share self-praise with:

```tsx
<p>{t("오늘의 피부 특징을 간단히 정리했어요.")}</p>
```

Use `오늘의 피부 리포트 공유하기`, the approved Share lead, and
`공유할 문구 다듬기` in Scan/Studio entry points.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/reengage-locale.regression-9.test.ts
npm.cmd run test:mobile-ui -- --grep "reminder|Check-in|Share|Studio"
```

Expected: all focused tests PASS; no real email is sent.

Commit:

```powershell
git add app/components/reengage-optin.tsx lib/reengage.ts app/checkin/page.tsx app/components/share-card.tsx app/scan/page.tsx app/studio/page.tsx lib/i18n tests/product-copy-contract.test.ts tests/reengage-locale.regression-9.test.ts tests/e2e
git commit -m "fix(copy): humanize follow-up and reminder journeys"
```

---

### Task 5: Progressive privacy, consent, medical, and unsubscribe copy

**Files:**

- Modify: `tests/product-copy-contract.test.ts`
- Modify: `tests/e2e/product-copy.spec.ts`
- Modify: `app/privacy/page.tsx`
- Modify: `app/scan/info-sheet.tsx`
- Modify: `app/scan/scan-controls.tsx`
- Modify: `app/unsubscribe/unsubscribe-form.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`

**Interfaces:**

- Consumes: existing export/delete/consent handlers and exact retention policy.
- Produces: one collapsed `<details>` for dense facts while controls remain visible.

- [ ] **Step 1: Add failing privacy and unsubscribe contracts**

Expect the exact short titles/bodies, deletion confirmation, medical boundary,
unsubscribe copy, and the summary `데이터 처리 기준 자세히 보기`. Assert the
old visible `크롭` and `분석 API` message IDs are absent from consumer `t()`
calls:

```ts
const visibleCalls = [...privacy.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]);
expect(visibleCalls.filter((message) => /크롭|crop|분석 API/.test(message))).toEqual([]);
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts -t "privacy"
```

Expected: FAIL on missing summary and legacy technical terms.

- [ ] **Step 3: Reorganize Privacy without changing handlers**

At the top render the three short cards:

```tsx
<h1>{t("사진과 데이터는 이렇게 사용해요")}</h1>
<p>{t("기본 촬영은 기기에서 처리하고, 필요한 기능만 직접 선택할 수 있어요.")}</p>
<PrivacySummary title={t("기기에서 먼저 확인해요")} body={t("기본 촬영에서는 원본 사진을 외부로 보내거나 저장하지 않아요.")} />
<PrivacySummary title={t("선택한 기능만 사용해요")} body={t("AI 분석, 연구용 저장과 이메일 알림은 각각 따로 선택할 수 있어요.")} />
<PrivacySummary title={t("언제든 관리할 수 있어요")} body={t("이 기기에 저장된 결과와 활동 기록을 확인하거나 삭제할 수 있어요.")} />
```

Use one native `<details>` with the exact summary. Move provider, sample,
retention, merchant-click, and server-removal explanations inside it. Rewrite
`크롭` as `얼굴 부분 이미지` in visible copy. Keep export/delete controls and
their existing handlers outside.

- [ ] **Step 4: Update delete confirmation and medical boundary**

Use the exact approved title, body, CTA, and success text. Preserve the
two-step destructive confirmation and the statement that server data is not
included.

- [ ] **Step 5: Update Scan consent summary and Unsubscribe**

Use the three short Scan facts and `사진과 데이터 사용 자세히 보기`. Do not
change checkbox state or consent recording. Update Unsubscribe title, body,
CTA, success, and invalid-token text exactly as designed.

- [ ] **Step 6: Author calm locale-specific privacy values**

EN is direct and non-legalistic; JA uses polite explanatory forms; ZH uses
short clear sentences. Preserve Google Gemini/OpenAI, 120, 180 days, 30 days,
local-versus-server deletion, and no-purchase facts in every locale.

- [ ] **Step 7: Add browser disclosure and deletion tests**

Assert in all four locales:

- the short summary is visible;
- exact provider/retention detail is hidden before opening `<details>`;
- opening the summary reveals provider, 120, 180, and 30;
- the destructive button opens a confirmation rather than deleting directly;
- Unsubscribe invalid token copy fits at 320 px.

- [ ] **Step 8: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- tests/product-copy-contract.test.ts tests/i18n-coverage.test.ts tests/device-data.test.ts
npm.cmd run test:mobile-ui -- --grep "privacy|unsubscribe|consent"
```

Expected: focused tests PASS.

Commit:

```powershell
git add app/privacy/page.tsx app/scan/info-sheet.tsx app/scan/scan-controls.tsx app/unsubscribe/unsubscribe-form.tsx lib/i18n tests/product-copy-contract.test.ts tests/e2e/product-copy.spec.ts
git commit -m "fix(copy): simplify privacy without hiding facts"
```

---

### Task 6: Cross-locale coverage and text-fit gate

**Files:**

- Create: `tests/e2e/product-copy-fit.spec.ts`
- Modify: `tests/i18n-coverage.test.ts`
- Modify: `playwright.mobile.config.ts` only if the new test needs a longer timeout
- Modify: consumer components only when a failing fit test identifies a real overflow

**Interfaces:**

- Consumes: completed KO/EN/JA/ZH dictionaries and consumer routes.
- Produces: reusable browser evidence for clipping, corruption, and 44 px targets.

- [ ] **Step 1: Extend dictionary coverage and observe RED**

Add all consumer sources:

```ts
const paths = [
  "app/page.tsx",
  "app/scan/page.tsx",
  "app/scan/info-sheet.tsx",
  "app/scan/scan-controls.tsx",
  "app/survey/page.tsx",
  "app/report/page.tsx",
  "app/care/page.tsx",
  "app/checkin/page.tsx",
  "app/studio/page.tsx",
  "app/components/product-card.tsx",
  "app/components/product-compare.tsx",
  "app/components/reengage-optin.tsx",
  "app/components/share-card.tsx",
  "app/privacy/page.tsx",
  "app/unsubscribe/unsubscribe-form.tsx",
  "lib/care.ts",
  "lib/report-trust.ts",
  "lib/recommend.ts",
];
```

Run `npm.cmd test -- tests/i18n-coverage.test.ts` and expect RED for any newly
exposed missing dictionary key. Add natural translations until GREEN.

- [ ] **Step 2: Write the failing browser text-fit audit**

Create `tests/e2e/product-copy-fit.spec.ts` with:

```ts
const langs = ["ko", "en", "ja", "zh"] as const;
const viewports = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 393, height: 873 },
  { width: 768, height: 1024 },
];
const routes = ["/", "/scan", "/survey", "/report", "/care", "/checkin", "/privacy", "/unsubscribe"];

async function textFitProblems(page) {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const corrupt = document.body.innerText.includes("\uFFFD");
    const clipped = [...document.querySelectorAll("h1,h2,h3,p,span,a,button,label,summary,td,th")]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .map((element) => element.textContent?.trim().slice(0, 120));
    return {
      corrupt,
      clipped,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}
```

Seed canonical Survey/Reads/product-use state, wait for `document.fonts.ready`,
and report route, locale, and viewport for every failure. EN/JA/ZH body text
must contain no Hangul.

- [ ] **Step 3: Run the matrix and observe RED**

Run:

```powershell
npm.cmd run test:mobile-ui -- --grep "consumer copy fits"
```

Expected: at least the Home annotation or one longer localized control fails
before layout fixes.

- [ ] **Step 4: Apply only evidence-driven layout fixes**

Fix each reported element locally:

- remove rigid height or `nowrap`;
- allow one- or two-line CTA text;
- add `minWidth: 0` to flex children;
- use locale-appropriate `wordBreak`/`overflowWrap`;
- preserve the component's existing visual style and 44 px target.

Do not globally add `word-break: break-all` or hide overflow.

- [ ] **Step 5: Re-run until GREEN**

Run:

```powershell
npm.cmd run test:mobile-ui -- --grep "consumer copy fits"
npm.cmd test -- tests/i18n-coverage.test.ts tests/product-copy-contract.test.ts
```

Expected: all locale/viewport cases PASS with zero clipped or corrupt text.

- [ ] **Step 6: Commit**

```powershell
git add tests/e2e/product-copy-fit.spec.ts tests/i18n-coverage.test.ts app lib
git commit -m "test(copy): enforce multilingual text fit"
```

---

### Task 7: Full product QA, documentation, GitHub, and Production deployment

**Files:**

- Modify: `README.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/i18n-ux-flow.md`
- Create: `docs/qa/2026-07-19-product-copy-polish.md`

**Interfaces:**

- Consumes: all six green implementation commits.
- Produces: clean release evidence, merged GitHub PR, Ready Vercel deployment, and Production canary.

- [ ] **Step 1: Run clean dependency and security checks**

Run:

```powershell
npm.cmd ci
npm.cmd audit
```

Expected: install succeeds and audit reports 0 vulnerabilities.

- [ ] **Step 2: Run the full release gate**

Run:

```powershell
npm.cmd run smoke
git diff --check
```

Expected: lint, all Vitest tests, all mobile Playwright tests, Production
build, TypeScript, ML compile, route/API probes, and whitespace checks PASS.

- [ ] **Step 3: Run two independent browser review loops**

Loop 1:

- KO/EN/JA/ZH
- all eight consumer routes
- 320/360/393/768 required widths
- console, page error, failed request, overflow, clipping, replacement
  character, raw key, Hangul leakage, accessible names, and 44 px targets

Loop 2:

- fresh contexts
- Home → Scan denial → Survey → Report → Routine → Care
- Reminder validation and intercepted locale payload
- Check-in states
- Privacy details closed/open and deletion confirmation
- Unsubscribe invalid-token state

Expected: zero observed failures in both loops.

- [ ] **Step 4: Visually inspect representative screenshots**

Capture and inspect Home, Scan, Report, Check-in, and Privacy in all four
locales at 360 px, plus Home at 320 and 768. Confirm line rhythm, hierarchy,
button balance, no orphaned punctuation, and no mechanical translations.

- [ ] **Step 5: Update documentation and QA ledger**

Record:

- old-to-new voice principles;
- changed routes and dynamic templates;
- locale review anchors;
- test counts and viewport matrix;
- any fit defect found and its focused fix;
- known external Play/Resend/device gates unchanged.

Do not include secrets, email addresses, user records, or screenshots with
personal data.

- [ ] **Step 6: Verify documentation and commit**

Run:

```powershell
git diff --check
git status --short
```

Commit:

```powershell
git add README.md docs/STATUS.md docs/i18n-ux-flow.md docs/qa/2026-07-19-product-copy-polish.md
git commit -m "docs: record multilingual product copy QA"
```

- [ ] **Step 7: Push and create a ready PR**

Push `codex/product-copy-polish`, create a non-draft PR against `main`, and
include the red-green cycles, full smoke, copy-fit matrix, security audit, and
remaining external gates. Wait for all GitHub/Vercel checks to pass.

- [ ] **Step 8: Merge and trace the exact Production deployment**

Merge only after checks are green. Capture the authoritative merge SHA, wait
for its Vercel Production status to become `success`, and inspect the exact
deployment ID and canonical aliases.

- [ ] **Step 9: Run Production canary**

Against `https://aru-beauty.vercel.app` verify:

- the four localized Home anchors;
- `/scan`, `/survey`, `/report`, `/care`, `/checkin`, `/privacy`,
  `/unsubscribe`;
- CSP still omits general `unsafe-eval`;
- internal routes remain 404;
- MediaPipe model remains 3,758,596 bytes;
- Supabase configuration flags remain true;
- no 5xx or error-level runtime log appears after canary traffic.

- [ ] **Step 10: Record final evidence without a deployment loop**

Add the final deployment ID, merge SHA, and canary result as a PR comment. Do
not create a self-referential documentation redeploy solely to record its own
deployment ID.

---

## Plan self-review checklist

- Every approved Korean section maps to Tasks 1–5.
- EN/JA/ZH human-authored anchors and dictionary work are present in every
  copy task.
- Text clipping, wrapping, font readiness, Hangul leakage, and `�` checks map
  to Task 6.
- Trust, medical, consent, retention, and false Check-in claims have explicit
  tests.
- Every implementation task begins RED, ends GREEN, and has a focused commit.
- Full smoke, visual QA, PR, deploy, and Production canary map to Task 7.
- No new content abstraction, dependency, schema, or product behavior is
  introduced.
