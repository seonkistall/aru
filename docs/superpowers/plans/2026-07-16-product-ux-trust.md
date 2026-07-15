# ARU Product UX and Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ARU's four-language mobile journey coherent, truthful, privacy-complete, and conversion-friendly while retaining its cosmetic-only recommendation boundary.

**Architecture:** Move testable page decisions into small pure helpers, use the existing global `LanguageProvider` as the only locale source, and centralize all browser storage keys in one registry. Keep the visual system lightweight and avoid a component-library migration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing i18n dictionaries, Vitest, CSS variables.

## Global Constraints

- KO, EN, JA, and ZH use one global locale with no nested page language switch.
- Product price, rating, review count, partnership, and medical claims must reflect verifiable data.
- “Delete all ARU data” removes every registered localStorage and sessionStorage key, including language preference.
- Mild cosmetic redness alone never produces a clinic-priority warning.
- Primary controls are at least 44 CSS px and recommendation content is never covered by fixed actions.
- No new analytics SDK or silent event upload.

---

### Task 1: Make global locale the only page locale

**Files:**
- Modify: `lib/i18n.tsx`
- Modify: `app/care/page.tsx`
- Modify: `app/privacy/page.tsx`
- Modify: `app/unsubscribe/page.tsx`
- Modify: `app/unsubscribe/unsubscribe-form.tsx`
- Modify: `lib/care.ts`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`
- Create: `tests/page-locale.test.ts`
- Modify: `tests/i18n-coverage.test.ts`

**Interfaces:**
- Produces: `useLanguage(): { lang: Lang; setLang(lang: Lang): void }` from `lib/i18n.tsx`.
- Consumes: global `t()` translations and `Lang` from `lib/i18n/core.ts`.

- [ ] **Step 1: Write failing locale-source tests**

```ts
for (const file of ["app/care/page.tsx", "app/privacy/page.tsx"]) {
  const source = readFileSync(file, "utf8");
  expect(source).not.toMatch(/setLocale|CareLocale|aria-label=.?English/);
  expect(source).toContain("useLanguage()");
}

it("contains no hard-coded English branch in care", () => {
  const source = readFileSync("app/care/page.tsx", "utf8");
  expect(source).not.toContain('locale === "ko"');
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/page-locale.test.ts tests/i18n-coverage.test.ts`

Expected: FAIL because Care and Privacy own KO/EN state and `useLanguage` is not exported.

- [ ] **Step 3: Export and consume the global locale**

```ts
export function useLanguage() {
  return useContext(LangContext);
}
```

Remove both segmented controls and all `pick(ko, en)` branches. Pass `lang` into a revised `clinicLinks(lang)` that returns Korean-canonical msgids for all four languages; render every string through `t()`. The page `lang` attribute is unnecessary because `html[lang]` is already authoritative.

- [ ] **Step 4: Brand and localize unsubscribe**

Use the same ARU heading, `t()` copy, loading/success/error states, a Privacy link, and a Home link. Add every new Korean msgid to EN/JA/ZH and extend coverage to ensure no Hangul leaks in non-Korean values.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/page-locale.test.ts tests/i18n-coverage.test.ts && npm run build`

Expected: all locale tests and build pass.

Commit: `fix: unify consumer locale controls`

### Task 2: Create a complete local-data registry and deletion flow

**Files:**
- Create: `lib/device-data.ts`
- Modify: `lib/consent.ts`
- Modify: `lib/crops.ts`
- Modify: `lib/funnel.ts`
- Modify: `lib/i18n/core.ts`
- Modify: `lib/labels.ts`
- Modify: `lib/last-result.ts`
- Modify: `lib/pilot.ts`
- Modify: `lib/scan-history.ts`
- Modify: `lib/store.ts`
- Modify: `app/privacy/page.tsx`
- Create: `tests/device-data.test.ts`

**Interfaces:**
- Produces: `DEVICE_DATA_KEYS`, `clearAllDeviceData(storage)`, and `remainingDeviceDataKeys(storage)`.
- `storage` is `{ local: Pick<Storage, "getItem" | "removeItem">; session: Pick<Storage, "getItem" | "removeItem"> }` so Node tests use maps without JSDOM.

- [ ] **Step 1: Write the failing registry test**

```ts
const expected = [
  "aru.lang", "aru_last_result", "aru_scan_history_v1",
  "gyeol_consent_events_v1", "gyeol_crop_samples_v1", "aru_funnel_events_v1",
  "aru_funnel_visitor_v1", "aru_funnel_session_v1", "gyeol_labels_v1",
  "gyeol_pilot_notes_v1", "gyeol_current_pilot_session_v1",
  "gyeol_purchases", "gyeol_checkins", "gyeol_care_intents",
  "gyeol_scan", "gyeol_reads", "gyeol_survey"
];
expect(DEVICE_DATA_KEYS.map((entry) => entry.key).sort()).toEqual(expected.sort());
expect(remainingDeviceDataKeys(storageAfterClear)).toEqual([]);
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/device-data.test.ts`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement one authoritative registry**

```ts
export const DEVICE_DATA_KEYS = [
  { key: "aru.lang", area: "local", group: "preferences" },
  { key: "gyeol_scan", area: "session", group: "scan" },
  { key: "gyeol_reads", area: "session", group: "scan" },
  { key: "gyeol_survey", area: "session", group: "survey" },
] as const satisfies readonly DeviceDataEntry[];

export function clearAllDeviceData(storage: DeviceStorage) {
  for (const entry of DEVICE_DATA_KEYS) storage[entry.area].removeItem(entry.key);
  return remainingDeviceDataKeys(storage);
}
```

Complete the array with every key from the failing test and replace duplicated key literals in the owning modules with exported constants from this registry.

- [ ] **Step 4: Implement a truthful two-step Privacy action**

The first tap opens an inline confirmation naming scan/report, survey, research/consent, activity/check-in, and language data. The destructive button calls `clearAllDeviceData`, re-reads every key, shows success only when the result is empty, and resets displayed counts. It must not claim deletion of reminder email or Supabase research data; link those to the documented contact path.

Update the same page's server-data section to match the code exactly: default on-device scan, optional Gemini/OpenAI crop transfer after the matching grant, exact-session pilot storage, reminder delivery metadata, revocation and 30-day retention. The Play release checklist keeps the real developer/entity name and working privacy email as blocking owner inputs; no invented identity is rendered.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/device-data.test.ts tests/consent-storage.test.ts tests/labels-storage.test.ts tests/funnel.test.ts && npm run build`

Expected: registry and existing store tests pass.

Commit: `fix: delete all registered device data`

### Task 3: Remove unverified commerce and medical signals

**Files:**
- Modify: `lib/skus.ts`
- Modify: `lib/recommend.ts`
- Modify: `lib/care.ts`
- Modify: `app/components/product-card.tsx`
- Modify: `app/components/product-compare.tsx`
- Modify: `app/care/page.tsx`
- Modify: `app/report/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `tests/catalog.test.ts`
- Modify: `tests/recommend.test.ts`
- Create: `tests/product-trust.test.ts`

**Interfaces:**
- Produces: `budgetBand(price)` returning a translated label key, not a live price.
- Produces: `careSummary(...).clinicPriority` based on explicit trouble concern or persistent-user input, not `reads.redness > 0`.

- [ ] **Step 1: Write failing trust tests**

```ts
expect(readFileSync("app/components/product-card.tsx", "utf8")).not.toMatch(/rating|reviewCount|toLocaleString/);
expect(readFileSync("app/components/product-compare.tsx", "utf8")).not.toMatch(/maxRating|minPrice/);
expect(careSummary({ ...survey, concerns: ["붉은기"] }, null, result, "ko").clinicPriority).toBe(false);
expect(careSummary({ ...survey, concerns: ["트러블"] }, null, result, "ko").clinicPriority).toBe(true);
expect(readFileSync("app/page.tsx", "utf8")).not.toContain("딱 맞는 셋");
```

- [ ] **Step 2: Confirm the reproduced failures**

Run: `npm test -- tests/product-trust.test.ts tests/recommend.test.ts tests/catalog.test.ts`

Expected: FAIL on ratings/prices and mild-redness clinic priority.

- [ ] **Step 3: Render only honest comparison data**

Keep numeric seed price for budget filtering, but never render it as current merchant price. Replace price/rating rows with budget band, volume, texture, avoided-ingredient fit, and “판매처에서 현재 가격·전성분 확인” copy. Remove `rating` as a scoring tiebreak so unverifiable popularity does not affect ranking. Remove “partner-ready” badges and consumer partnership wording.

- [ ] **Step 4: Correct claims and recommendation count copy**

Replace layout/home/open-graph “3 products/딱 맞는 셋” promises with “up to three/최대 세 가지”. Keep `slice(0, 3)` but support one or two valid picks. Change clinic priority to explicit trouble concern only; cosmetic redness may appear as neutral sensitivity guidance.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/product-trust.test.ts tests/recommend.test.ts tests/catalog.test.ts tests/claim-filter.test.ts && npm run build`

Expected: tests and build pass with no forbidden medical/efficacy wording.

Commit: `fix: make recommendation claims verifiable`

### Task 4: Repair mobile hierarchy and obscured actions

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/report/page.tsx`
- Modify: `app/care/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/mobile-layout-contract.test.ts`

**Interfaces:**
- Produces: first-viewport home CTA, in-flow report commerce CTA, and collapsed alternate merchants.

- [ ] **Step 1: Add failing source contracts**

Require the home scan CTA before the `HowCard` list, reject `position: "fixed"` from the report purchase action, require `aria-expanded` for alternate care merchants, and require a `--tap-min: 44px` token used by primary buttons.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/mobile-layout-contract.test.ts`

Expected: FAIL on CTA ordering, fixed report action, expanded merchant wall, and missing tap token.

- [ ] **Step 3: Apply the smallest layout corrections**

Move the existing scan/survey CTA block immediately after the hero explanation, then place the three process cards below it. Cap the Korean hero display size to `clamp(34px, 10vw, 48px)` and add locale-specific sans display styling for EN/JA/ZH. Replace the fixed report bar with an in-flow section after comparison. Show only the first merchant per Care product and toggle the remaining links with a 44px “다른 판매처 보기” control.

- [ ] **Step 4: Verify mobile rendering and commit**

Run: `npm test -- tests/mobile-layout-contract.test.ts && npm run build`

Then use a 390 × 844 browser viewport on `/`, `/report`, and `/care`; expected: CTA visible in the first viewport, no obscured content, all tap targets at least 44px, no horizontal overflow.

Commit: `fix: polish primary mobile journey`

### Task 5: Complete funnel and single-source PRD documentation

**Files:**
- Modify: `lib/funnel.ts`
- Modify: `app/survey/page.tsx`
- Modify: `app/ops/page.tsx`
- Modify: `tests/funnel.test.ts`
- Rewrite: `docs/PRD.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Produces: `survey_viewed` as a funnel event and denominator for survey completion.
- Produces: one PRD contract that labels the current event source as local/pilot-sync, not global production analytics.

- [ ] **Step 1: Write the failing funnel test**

```ts
expect(FUNNEL_ORDER).toContain("survey_viewed");
expect(summarizeFunnel([ev("s1", "survey_viewed"), ev("s1", "survey_completed")]).surveyCompletion).toBe(1);
```

- [ ] **Step 2: Confirm failure**

Run: `npm test -- tests/funnel.test.ts`

Expected: FAIL because `survey_viewed` is absent.

- [ ] **Step 3: Add the event without silent upload**

Record `survey_viewed` once after Survey mounts, include it in the event union, ordering, summary and Ops table, and continue storing it locally. Do not add a new public analytics endpoint.

- [ ] **Step 4: Rewrite the PRD and align docs**

The PRD must contain problem, users, promise, both consumer journeys, research journey, functional/non-functional requirements, cosmetic/medical boundary, data inventory/retention matrix, trust rules, metric formulas/targets, web/TWA/Play gates, release ownership, and external prerequisites. Remove contradictory old version/status claims from README and STATUS; link rather than duplicate the contract.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/funnel.test.ts && npm run smoke`

Expected: full smoke passes; `git grep -n "survey-view sessions\|survey_viewed" docs/PRD.md lib/funnel.ts app/survey/page.tsx` shows the same denominator contract.

Commit: `docs: establish product and metric contract`
