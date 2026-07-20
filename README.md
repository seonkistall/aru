# ARU

**A 30-second, on-device skin scan that honestly picks your K-beauty routine.**

ARU is a mobile-first web app. It combines an optional on-device camera reading
with a short questionnaire, then proposes up to three product candidates and a
morning/evening routine that fit the user's preferences, budget and context —
no account required.

The camera result describes cosmetic tendencies visible in the current photo.
It is **not** a medical diagnosis, treatment, or condition monitor. The whole
recommendation flow can also be completed with the questionnaire alone.

- **Live:** <https://aru-beauty.vercel.app>
- **한국어 문서:** [README.ko.md](README.ko.md) (full Korean documentation)
- **OpenAI Build Week (Apps for Your Life):** [submission pack](docs/buildweek/SUBMISSION.md) · [build log](BUILDLOG.md) · [user research](docs/buildweek/user-research.md)

---

## Why this exists

There are thousands of K-beauty products and no shortage of skin-analysis
apps. Two things are still missing:

1. **Honesty.** Most analysis tools sell "improves", "whitens", "regenerates".
   Those are efficacy claims that Korean cosmetics advertising rules restrict
   and that users have learned to distrust.
2. **A decision.** Analysis alone does not answer "so what do I buy today?".

ARU reads **only three visible signals** — oil, redness, texture — and refuses
to say more than the photo supports. When capture confidence is low it demotes
its own reading and leans on the questionnaire instead. Every recommendation
sentence, including the ones an LLM writes, has to pass a per-language
banned-claims filter before a user ever sees it.

## Core user flows

| Flow | Path |
|---|---|
| Camera journey | `/` → `/scan` → `/survey` → `/report` → `/care` or `/studio` |
| Questionnaire only | `/` → `/survey` → `/report` → `/care` or `/studio` |
| Re-engagement | opt-in subscribe → 2-week / 4-week cron → signed unsubscribe → 30-day cleanup |
| Research ops | `/pilot` → `/ops` → `/eval` (404 in production unless explicitly enabled) |

Screens: [`docs/buildweek/assets`](docs/buildweek/assets) (English, 1080×2160).

## How the scan works

1. **MediaPipe Face Landmarker** runs in the browser (model and WASM served
   same-origin from `public/vendor/mediapipe`, cached by the service worker).
2. A quality loop grades **light, distance, steadiness and glare** per frame.
   Auto-capture fires only when all gates hold, after a 3-2-1 countdown.
3. ROI sampling reads T-zone and cheek regions across multiple frames.
4. The basic scan never uploads or stores the original photo. Sending face
   crops for external AI analysis and storing training crops are **two separate
   opt-ins**, each recorded with a consent version.
5. If the GPU delegate emits corrupted landmarks, the app detects the invalid
   coordinate range and self-heals by switching to the CPU delegate once.

## Compliance model

- `efficacyClean()` gates Korean copy; `lib/claim-filter.ts` adds
  per-language banned-claim patterns for EN/JA/ZH/AR.
- Any LLM sentence failing the filter is replaced with a pre-approved template,
  so the app **structurally cannot** publish an efficacy claim.
- Korean source strings are the message ids. Stored values stay Korean-canonical
  and are translated at render time, so a language switch never rewrites data.

## Tech stack

Next.js 16.2.9 (App Router) · React 19.2.4 · TypeScript · MediaPipe Tasks Vision ·
Supabase (research data only, RLS enforced) · Vercel · optional Gemini/OpenAI ·
Resend · Android TWA (`com.seonkistall.aru`).

Languages: **English (default)**, Korean, Japanese, Simplified Chinese, and
Arabic (right-to-left).

---

## Local development

### Requirements

- Node.js 20+ and npm
- A Chromium install for Playwright (`npx playwright install chromium`)

### Install and run

```bash
npm install
npm run dev
# http://localhost:3000
```

**No environment variables are required to run the app.** With no keys set,
the questionnaire → report → care journey works end to end using on-device
analysis and pre-approved template copy. The camera works on `localhost` and
over HTTPS. No sample data or seeding step is needed — product catalogue and
routine rules ship in `lib/skus.ts` and `lib/recommend.ts`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest contract, compliance and security regressions |
| `npm run test:mobile-ui` | Playwright Chromium mobile, i18n and text-fit regressions |
| `npm run test:ios-safari` | Playwright WebKit iPhone camera-lifecycle regressions |
| `npm run lint` | ESLint |
| `npm run build` | Next.js production build |
| `npm run smoke` | lint + unit + mobile browser + build + ML compile + route/auth probes |
| `npm run supabase:check` | Production Supabase permission and storage audit |
| `npm run android:check` | TWA package, origin, API level, permission and secret audit |

### Environment variables

All are optional and **server-only**. Never prefix any of them with
`NEXT_PUBLIC_`. Copy [`.env.local.example`](.env.local.example) to `.env.local`.

| Variable | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `/api/reason`, optional vision | Enables LLM phrasing of recommendation reasons |
| `OPENAI_REASON_MODEL` | `/api/reason` | Defaults to `gpt-5.6` |
| `OPENAI_VISION_MODEL` | `/api/analyze` | Defaults to `gpt-4o-mini` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | `/api/analyze` | Alternative vision provider, defaults to `gemini-2.0-flash` |
| `VISION_PROVIDER` | `/api/analyze` | `gemini` or `openai` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | pilot sync, email | HTTPS URL; modern `sb_secret_*` or legacy service-role key |
| `SUPABASE_SYNC_TOKEN` | `/api/sync` | 32+ character operator token |
| `SUPABASE_CROP_BUCKET` / `SUPABASE_CROP_RETENTION_DAYS` | pilot crops | Private bucket, 180-day default retention |
| `SUPABASE_SYNC_ALLOWED_ORIGINS` | `/api/sync` | Comma-separated origin allowlist |
| `RESEND_API_KEY` / `REENGAGE_FROM` / `REENGAGE_LINK_BASE` | reminder email | Verified sending domain required |
| `CRON_SECRET` / `UNSUBSCRIBE_SECRET` | reminder email | Must be different values |
| `INTERNAL_TOOLS_USER` / `INTERNAL_TOOLS_PASSWORD` | `/ops`, `/pilot`, `/eval` | Absent ⇒ those routes 404 in production |

If a provider key is missing the corresponding route degrades to a documented
fallback rather than failing: `/api/reason` returns template copy with
`source: "template"`, and `/api/analyze` keeps the on-device reading.

### Verifying a change

```bash
npm test
npm run test:mobile-ui
npm run lint
npm run build
npm run smoke
```

Current baseline: **58 Vitest files / 297 tests** and **42 Playwright mobile
tests**, covering scan geometry, recommendation attribution, claim filtering,
consent scope, API guards, RLS boundaries, PWA manifest, Android config and a
180-combination text-fit matrix (9 routes × 5 locales × 4 viewports).

Every change follows: failing regression test first → smallest implementation →
full suite, lint, production build → mobile viewport check → post-deploy canary.

## Repository layout

```
app/            Next.js routes, scan pipeline, API handlers
lib/            domain logic: recommend, skus, i18n, claim filter, consent, funnel
lib/server/     request guards, input parsing, signed tokens, internal access
tests/          Vitest suites; tests/e2e holds Playwright specs
ml/             Python calibration and evaluation entry points (compile-checked)
android/        TWA project for Google Play
supabase/       schema.sql and migrations
docs/           PRD, architecture, QA evidence, Play pack, Build Week pack
```

## Security and privacy invariants

- Nine Supabase application tables have RLS enabled; browser roles hold no
  table privileges.
- Enforced CSP; `'unsafe-eval'` is development-only, production keeps only
  `'wasm-unsafe-eval'` for MediaPipe.
- AI and subscription endpoints are rate limited per IP and behind a global
  provider limit.
- Internal routes (`/ops`, `/pilot`, `/eval`) return 404 in production by
  default.
- All device data is enumerable and deletable from `/privacy`.

Details: [`docs/architecture.md`](docs/architecture.md) ·
[`docs/PRD.md`](docs/PRD.md) · [`docs/STATUS.md`](docs/STATUS.md)

## Status and known limitations

- Web production is live; email delivery is code-complete but unverified
  (needs a verified Resend domain).
- The physical-device camera matrix (five lighting conditions) is partially
  complete.
- Google Play submission is blocked on developer identity verification, not on
  code.
- `docs/STATUS.md` separates finished code from external owner gates and is the
  single source of truth for release state.
