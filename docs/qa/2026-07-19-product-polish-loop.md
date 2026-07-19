# Product polish loop — 2026-07-19

Target branch: `codex/product-qa-polish`

Baseline: `origin/main` at `06b254fe897c555e6b571be2c2c1f4cee67f3761`

This report records the release-candidate QA loop. Production deployment and
post-deploy canary evidence are added only after the merge deployment is
ready. No secret value, email address, face image, participant record, or
signing password is included.

## Outcome

Ten reproducible issues were fixed with regression coverage. The final clean
install passed the complete Web smoke, the full npm dependency audit, Android
configuration checks, Android release lint, and a signed release-bundle build.
Two fresh-browser product loops then completed with no remaining observed
console error, failed request, layout overflow, broken image, accessibility
structure error, or mobile touch-target failure.

This is not evidence that the external owner gates are complete. A real Resend
delivery, the remaining physical-camera environment matrix, iPhone Safari,
Play App Signing distribution association, and Play internal-track review
remain separate gates.

## Reproduced issues and fixes

| ID | Reproduction | Fix | Regression evidence |
|---|---|---|---|
| ISSUE-001 | The Check-in home action rendered at 22 × 22 px. | Restored the shared 44 px mobile touch contract. | `tests/e2e/checkin-touch-target.regression-1.spec.ts` |
| ISSUE-002 | Routine copy claimed the user selected oil/redness concerns when those values were inferred only from skin type. | Restricted attribution copy to answers the user actually supplied. | `tests/recommend-attribution.regression-2.test.ts` |
| ISSUE-003 | Korean recommendation copy produced invalid particles such as `크림를`, `크림예요`, and `세럼로`; English also produced `A Cream`. | Replaced particle-sensitive category sentences with neutral KO/EN/JA/ZH templates. | `tests/recommend-copy.regression-3.test.ts`, `tests/e2e/report-copy.regression-3.spec.ts` |
| ISSUE-004 | `/reco` briefly rendered an empty client shell before redirecting. | Moved the legacy route to a server-side 307 redirect. | `tests/e2e/reco-redirect.regression-4.spec.ts` |
| ISSUE-005 | An invalid email reached application submit handling even though the browser knew it was invalid. | Added native email form semantics, required input, and submit behavior. | `tests/e2e/reengage-email-validation.regression-5.spec.ts` |
| ISSUE-006 | Production CSP allowed general `'unsafe-eval'`. | Limited `'unsafe-eval'` to development and retained only `'wasm-unsafe-eval'` for production MediaPipe. | `tests/csp-production.regression-6.test.ts` plus production-mode header probe |
| ISSUE-007 | A four-week Check-in round opened after only three elapsed weeks. | Changed the eligibility boundary to four real weeks. | `tests/e2e/checkin-schedule.regression-7.spec.ts` |
| ISSUE-008 | Re-subscribing preserved the original schedule and sent markers; Production also lacked the consent columns expected by the route. | Restarted the schedule on fresh consent, reset delivery markers, and migrated/backfilled consent metadata. | `tests/reengage-resubscribe.regression-8.test.ts`, migration `20260718193557_fix_reengage_resubscribe_schedule.sql` |
| ISSUE-009 | EN/JA/ZH opt-ins still received Korean-only reminder content. | Persisted the active locale and added four localized email templates. | `tests/reengage-locale.regression-9.test.ts`, `tests/e2e/reengage-locale.regression-9.spec.ts`, migration `20260718212921_add_reengage_locale.sql` |
| ISSUE-010 | The root Android generator dependency exposed 10 high/moderate transitive advisories; release lint also reported six stale-resource/themed-icon warnings. | Removed the generator from the release dependency graph, kept the checked-in Gradle wrapper as the release path, deleted unused generated resources, and added an ARU monochrome launcher layer. | `tests/android-config.test.ts`, full `npm audit`, `android:check`, `lintRelease`, and signed `bundleRelease` |

## Test-driven sequence

Each issue followed the same gate:

1. reproduce it in the browser, API, database, or Android release task;
2. add a failing regression test or explicit release assertion;
3. apply the smallest targeted implementation;
4. run the focused test;
5. run the complete smoke and product-browser loops.

The issue commits are:

- `72de855` — ISSUE-001
- `f01667f` — ISSUE-002
- `5787f06` — ISSUE-003
- `78632e3` — ISSUE-004
- `599010b` — ISSUE-005
- `54aa07d` — ISSUE-006
- `5c17f99` — ISSUE-007
- `aa6ae3e` — ISSUE-008
- `f4bce3e` — ISSUE-009
- `eac5d16` — ISSUE-010

## Clean Web release gate

`npm ci` installed 402 packages and audited 403 packages:

- production and development dependency vulnerabilities: **0**
- MediaPipe model/JS/WASM copied to the same-origin public asset path

The final `npm run smoke` passed:

- ESLint
- Vitest: **57 files, 277 tests**
- Playwright Chromium: **10 rendered mobile regressions**
- Next.js 16.2.9 production build and TypeScript
- 23 application routes
- five Python ML entry-point compile checks
- public `/scan`, `/privacy`, `/offline.html`, and `/sw.js`
- hidden `/pilot`, `/ops`, and `/eval` returning 404
- allowed commerce redirect and blocked unauthenticated sync mutation

The first build attempt found a stray `ts` token in generated
`.next/dev/types/validator.ts`, left by an interrupted development server. The
verified worktree-local `.next` cache was removed; a clean rebuild regenerated
the file and the complete smoke passed twice. No generated file was patched.

## Browser product loops

### Loop 1 — route and viewport matrix

Forty combinations were opened in production mode:

- routes: `/`, `/scan`, `/survey`, `/report`, `/care`, `/studio`, `/checkin`,
  `/privacy`, `/unsubscribe`, `/reco`
- viewports: 360 × 800 Galaxy S25 Edge CSS width, 393 × 873 phone,
  768 × 1024 tablet, 1440 × 900 desktop

Observed failures: **0**

The loop checked document navigation, console and page errors, failed network
requests, one `main`, one visible `h1`, horizontal overflow, broken images,
unnamed visible actions, and sub-44 px actions at the 360 px mobile width.

### Loop 2 — stateful and localized contracts

Fresh contexts verified:

- KO, EN, JA, and ZH report routine and Care rendering
- correct `html[lang]` values, including `zh-CN`
- native blocking of invalid reminder email before network
- active locale in all four subscribe payloads
- `NotAllowedError`, `NotFoundError`, `NotReadableError`, and
  `OverconstrainedError` camera states
- reason-specific camera copy and a 44 px survey fallback
- `/reco` returning one document 307 and landing on `/report`
- production CSP without general `'unsafe-eval'` and with
  `'wasm-unsafe-eval'`

Observed failures: **0**

Ignored visual evidence:

- `.gstack/qa-reports/screenshots/2026-07-19-checkin-after.png`
- `.gstack/qa-reports/screenshots/2026-07-19-report-after.png`

## Production Supabase migration evidence

Project: `gyeol-pilot` (`zayyhjsppoybprvwdddj`, Seoul)

Applied migrations:

- `20260718193557_fix_reengage_resubscribe_schedule`
- `20260718212921_add_reengage_locale`

Read-only post-migration verification found:

- `reengage_contacts` row count: 0
- `consent_version`, `consented_at`, `revoked_at`, `retention_until`, and
  `locale` present
- `consented_at` and `locale` non-null with defaults
- locale CHECK limited to `ko`, `en`, `ja`, and `zh`
- RLS enabled
- direct `anon` and `authenticated` SELECT/INSERT denied
- service role retained the required server-only access

The migrations were applied before the application release and remain
backward-compatible with the previous route version. No production row or PII
was changed.

The local `npm run supabase:check` intentionally does not receive the
Production service-role secret and therefore reports the missing local
variable. Production permission/schema verification used the authenticated
management connection instead.

## Android release evidence

- `npm run android:check`: PASS
- package: `com.seonkistall.aru`
- version: `1.1.0 (11000)`
- min SDK: 23
- compile/target SDK: 36
- `lintRelease`: **No issues found**
- clean signed `bundleRelease`: PASS
- AAB size: 1,276,986 bytes
- AAB SHA-256:
  `6F92AA61DF06B7F6067C218DB8C54219EB30CB8E501BE40FFB6B9893FE168FB3`

The checked-in Android wrapper was originally generated with Bubblewrap
1.24.1. Bubblewrap is not required to build the committed Gradle project and
is intentionally absent from the root npm graph. Any future regeneration is a
separate reviewed maintenance operation, followed by a full Android diff,
audit, and release build.

## Remaining external gates

- send and receive a real Resend message, open the signed unsubscribe link,
  and verify revoked/expired cron behavior
- complete the documented low-light, direct-reflection, occlusion,
  background/resume, and iPhone Safari camera matrix
- resolve Play Console identity/payment gates
- add the Play App Signing distribution certificate to Digital Asset Links
- upload this signed AAB to an internal track and pass Galaxy S25 Edge TWA and
  Play pre-launch testing
