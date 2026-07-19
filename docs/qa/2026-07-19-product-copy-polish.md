# Multilingual product copy and text-fit QA — 2026-07-19

Release branch: `codex/product-copy-polish`

Baseline: `origin/main` at `50ed8dca96ce405567208c505a46e90e0fc6b1ba`

Release PR: [#57](https://github.com/seonkistall/aru/pull/57)

This ledger records the pre-merge release gate. The authoritative merge SHA,
Vercel deployment, canonical alias check, and Production canary are recorded
on PR #57 after deployment so that documentation does not create a
self-referential redeploy loop.

No secret, email address, face image, participant record, or signing material
is included.

## Outcome

ARU's consumer journey now uses one calm, friendly product voice from Home
through Scan, Survey, Report, Care, reminder email, Check-in, sharing,
Privacy, and Unsubscribe.

English, Japanese, and Simplified Chinese values were adapted independently
for the local reading order and mobile-service convention. They do not reuse
Korean sentence order through word-for-word substitution. Privacy detail,
medical boundaries, storage, transfer, retention, and deletion facts remain
available even though the default UI summary is shorter.

The complete smoke passed. An automated text-fit matrix covered 144
route/locale/viewport combinations, followed by manual 320 px browser review.
The final pre-merge run found no remaining corrupted character, untranslated
Korean key, text clipping, document overflow, or browser console error.

## Voice changes

The release removes anxiety marketing, familiar second-person address,
self-praise, developer terminology in the default UI, unsupported certainty,
and claims that Check-in changes later recommendations.

The replacement voice:

- asks a light question and gives one clear next action;
- says `오늘의 피부`, `살펴보다`, `제품 후보`, and `루틴`;
- distinguishes camera observations from survey answers;
- describes a product as a candidate close to selected preferences;
- keeps errors specific and gives a practical recovery action;
- puts dense data facts behind one optional detail disclosure without
  removing them.

Locale anchors:

| Locale | Headline | Primary CTA | Translation approach |
|---|---|---|---|
| KO | `오늘의 내 피부, 어떤 스킨케어가 좋을까요?` | `내 피부 살펴보기` | conversational honorific product voice |
| EN | `What skincare suits your skin today?` | `Start my skin check` | short, warm, direct sentences |
| JA | `今日の肌には、どんなスキンケアが合いそうですか？` | `肌をチェックする` | natural polite service language and Japanese order |
| ZH | `今天的肌肤，适合怎样的护肤方案？` | `看看我的肌肤状态` | concise, courteous mobile-service wording |

## Test-driven fixes

Copy contracts and locale coverage were added before the implementation.
During the text-fit RED run, three concrete defects were reproduced and fixed:

1. long Report tab labels clipped inside fixed single-line tabs;
2. the shared progress steps widened the document at 320 px;
3. a multiline recommendation-basis key was missing in EN/JA/ZH and exposed
   Korean text.

The smallest fixes let Report tabs wrap naturally, hide only decorative flow
arrows below 360 px while retaining labels and 44 px targets, and add the
missing locale-specific recommendation sentences.

## Automated release gate

`npm run smoke` passed:

- ESLint with no error; two pre-existing unused-parameter warnings in
  `lib/care.ts`;
- Vitest: **58 files, 285 tests**;
- Playwright Chromium: **36 mobile E2E tests**;
- Next.js 16.2.9 Production build and TypeScript;
- 23 application routes;
- five Python ML entry-point compile checks;
- public `/scan`, `/privacy`, `/offline.html`, and `/sw.js`;
- Production-hidden `/pilot`, `/ops`, and `/eval` returning 404;
- allowed commerce redirect and blocked unauthenticated sync mutation.

`git diff --check` also passed.

## Text-fit matrix

The reusable regression in `tests/e2e/product-copy-fit.spec.ts` combines:

- routes: `/`, `/scan`, `/survey`, `/report`, `/care`, `/checkin`, `/studio`,
  `/privacy`, `/unsubscribe`;
- locales: KO, EN, JA, ZH;
- viewports: 320 × 800, 360 × 800, 393 × 873, 768 × 1024.

Total states: **9 × 4 × 4 = 144**.

Every state waits for locale hydration and checks:

- Unicode replacement character `�`;
- Hangul leakage in EN/JA/ZH;
- explicit text clipping;
- root horizontal overflow and its offending elements;
- route-safe rendering of seeded Report, Care, and follow-up states.

## Manual browser review

A production build was served locally and reviewed in a real Chromium session
at 320 × 800.

Reviewed states included:

- Korean and English Home;
- English Survey and all three Report tabs;
- English Privacy collapsed and expanded;
- Japanese and Simplified Chinese Privacy;
- Simplified Chinese Scan pre-permission, Care, Check-in, and Unsubscribe.

Representative local evidence is stored under the ignored
`.gstack/qa-reports/screenshots/` directory. Every reviewed interaction
reported zero console error and stayed within the viewport.

Headless Chromium cannot complete a physical front-camera capture. The
separate Galaxy S25 Edge evidence supplied by the release owner remains PASS
for permission, front-camera mirroring, quality gate, capture, and retake.

## Unchanged external gates

- real Resend delivery, signed unsubscribe, revoked-recipient exclusion, and
  retention cleanup;
- low-light, direct-reflection, occlusion, background/resume camera matrix;
- iPhone Safari camera and layout QA;
- Play Console identity/payment, Play App Signing distribution association,
  internal track, and pre-launch report.

These gates are not represented as complete by the copy or browser tests.
