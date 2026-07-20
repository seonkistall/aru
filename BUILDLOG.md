# Build Log

## Project

- **Project name:** ARU — a 30-second on-device skin scan that honestly picks your K-beauty routine
- **Track:** Apps for Your Life
- **User and problem:** People choosing K-beauty products — both Korean users drowning in ingredient and review data, and visitors to Korea who cannot read Korean product names or ingredient lists. Existing skin-analysis tools either lean on efficacy claims users have learned to distrust, or stop at analysis without answering "so what do I buy today?".

## Initial Brief

- **Goal:** A 30-second selfie scan that reads only the skin signals a photo actually supports, combines them with a short questionnaire, and returns three product candidates plus a morning/evening routine — then closes the loop with retailer links and a 2-/4-week check-in.
- **Context:** Next.js 16 App Router, MediaPipe Face Landmarker on-device, Supabase for consented research data only, optional OpenAI/Gemini for cross-checking and phrasing. Five languages (EN default, KO/JA/ZH, AR right-to-left).
- **Constraints:**
  1. No medical claims. `efficacyClean()` plus per-language banned-claim regexes gate every sentence, including LLM output.
  2. The basic scan is on-device; the original photo is never sent or stored.
  3. Two separate consents — sending crops for AI analysis, and storing training crops — never bundled.
  4. 44px touch targets and no horizontal overflow at 320px in every language.
- **Done when:** The full journey (home → scan → survey → report → care → check-in) works end to end on a real phone browser, `npm run smoke` is green, and a post-deploy production canary passes.

## Tooling disclosure

Two AI coding assistants were used, and the split is visible in the public git
history rather than only asserted here.

- **Codex** carried the feature rounds. Branch names starting `codex/` (21 in
  this repository) are one Codex working session each: the camera quality gate,
  the scan pipeline split, product visuals, the eval harness, the hardening
  rounds, the Android/Play readiness track and the iOS Safari camera lifecycle
  work.
- **The 2026-07-13 → 07-19 production and Play-readiness track (PRs #44–#61) is
  entirely Codex.** No commit in that range carries another assistant's
  trailer. That window produced the RLS and CSP hardening, the signed Android
  App Bundle, the Play submission pack and the WebKit camera lifecycle fixes.
- **Claude Code** was used in parallel on other days, mostly 2026-07-03 → 07-12
  and again on 07-20; 62 commits carry a `Co-Authored-By: Claude` trailer, and
  `CLAUDE.md` is checked in. Those sessions covered the i18n rollout, several
  adversarial bug hunts, the Arabic/RTL round and this submission pack.
- **Every merge, deployment and production database migration was executed by a
  human** after review. No assistant had standing permission to merge or deploy.

The delegations below are Codex sessions unless noted.

## Key Delegations

### Delegation 1 — Redesign the camera quality gate

- **Purpose:** Auto-capture never fired on Android portrait streams.
- **Request:** "Centre and distance gates never pass on a phone. Investigate the coordinate system and thresholds and redesign — do not just retune numbers."
- **Result:** Found the cover-crop aspect conversion was fragile, demoted centre and distance from blocking conditions to guidance, and rebuilt auto-capture on raw face-box size so it is aspect-ratio independent. Added a `/scan?debug=1` diagnostic overlay exposing video dimensions, ratio, raw box size and every gate value live.
- **Next human decision:** Verify on a physical device before further tuning — and adopt "never guess camera thresholds without real-device debug data" as a rule.

### Delegation 2 — gettext-style i18n and per-language compliance

- **Purpose:** Reach the international users the strategy work identified.
- **Request:** "Korean source strings are the message ids. Store Korean-canonical values, translate at render. New strings must land in every dictionary at once."
- **Result:** `lib/i18n/core.ts` with dictionaries of ~890 entries per language, a fixed switcher, and a 180-combination text-fit regression (9 routes × 5 locales × 4 viewports). Later extended to Arabic with `html[dir="rtl"]` switching.
- **Next human decision:** Tone per language, and the product call to make English the default rather than Korean.

### Delegation 3 — Adversarial hardening before launch

- **Purpose:** Close security and data-boundary gaps before real users.
- **Request:** "Hunt this surface adversarially and pin every confirmed finding with a regression test."
- **Result:** Found and fixed real defects pre-deploy, including an unauthenticated email relay endpoint and a consent-scope bypass where an undefined scope skipped filtering entirely. Enabled RLS on nine Supabase tables, revoked browser-role privileges, and enforced CSP and per-IP rate limits.
- **Next human decision:** Register production secrets and approve the database migrations.

## Failure & Recovery

- **What failed:** Android auto-capture. Two rounds of threshold tuning both failed to fix it.
- **Why it failed:** We were debugging a camera/ML problem from desktop reproduction and treating it as a numeric threshold issue. Real-device `?debug=1` output showed the actual cause: the **MediaPipe GPU delegate was emitting corrupted landmarks with values around 1e34**, so the derived face size was ~1e35 and the distance gate could never be satisfied. The input data was poisoned; the thresholds were never the problem.
- **How we changed the approach:**
  1. Implemented self-healing — when the face box falls outside `[0,1]`, treat the GPU delegate as corrupted and re-initialise once on the CPU delegate.
  2. Adopted a standing rule: no threshold changes for camera/ML bugs without real-device debug data.
  3. Extracted the fragile coordinate maths into `lib/scan-geometry.ts` and pinned it with unit tests so the same class of bug fails a test instead of a phone.

The same reproduce → regression test → smallest fix loop later caught a CJK
wrapping bug (a global `keep-all` forbade every line break in Japanese and
Chinese) and an Arabic RTL bug where forward arrows still pointed right.

## Verification

- **Tests and checks:** 297 Vitest tests across 59 files, 42 Playwright mobile end-to-end tests, and `npm run smoke` (ESLint, production build, TypeScript, Python ML compile, route and API guard probes). Dictionary coverage, claim filtering, consent scope, API boundaries and RLS behaviour are all pinned by automated tests.
- **Working user flow:** Home → 30-second scan with auto-capture → questionnaire → three-step report (analysis, picks, routine) → care and retailer links → 2-/4-week email check-in. Verified on <https://aru-beauty.vercel.app> with a full-route production canary.
- **Known limitations:**
  - The physical-device camera matrix (five lighting conditions) is partially complete.
  - Reminder email is code-complete but unverified end to end; it needs a verified Resend sending domain.
  - Google Play submission is blocked on developer identity verification, not on code.
  - `/api/reason` only calls an LLM when `OPENAI_API_KEY` is present; otherwise it serves approved template copy and reports `source: "template"`.

## Human Decisions

- **What the assistants handled:** Feature rounds and refactors, adversarial bug hunts, test authoring, i18n dictionaries, Android/Play packaging, and documentation — always as branch-scoped sessions.
- **What people decided:**
  1. The strategic pivot: the scan is the hook, the purchase moment is the product — so manual concierge sales come before more camera work.
  2. Every compliance invariant: no medical claims, split consent, on-device by default.
  3. Market direction: English as the default language, adding Arabic, targeting visitors to Korea.
  4. All merges, production deployments and database migrations.
  5. Licensing review of the external datasets considered for calibration.
