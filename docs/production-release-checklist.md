# ARU Production Release Checklist

Date: 2026-07-18

## Code gates

- [x] `npm run smoke` passes: 52 test files and 252 tests, lint, production build, ML compile, and route probes.
- [x] MediaPipe model size is exactly 3,758,596 bytes and WASM assets exist under `public/vendor/mediapipe/wasm`.
- [x] No production scan code references jsDelivr or Google-hosted MediaPipe assets.
- [x] AI validation, scoped consent, camera lifecycle, RLS, and unsubscribe tests pass.
- [x] Enforced CSP passes the real Chromium hydration, service-worker, and same-origin MediaPipe regression matrix.

## Web performance and browser QA

- [x] Complete the 390 × 844 route matrix in KO/EN/JA/ZH.
- [x] Record Fast 4G cold/repeat Home and Scan measurements.
- [x] Verify the same-origin MediaPipe model, JS, and WASM from cache while fully offline.
- [x] Preserve real online 404 responses instead of masking them with the offline page.
- Evidence: `docs/qa/2026-07-16-web-performance.md` at commit `d687e8b`.
- Security evidence: `docs/qa/2026-07-17-post-deploy-security.md`.

## Supabase operations

- [ ] Back up the production project.
- [x] Confirm migration `20260715153303 harden_aru_data_api_permissions` and all nine application tables exist in production.
- [x] Confirm RLS is enabled for all application tables.
- [x] Confirm anon and authenticated roles cannot select, insert, update, or delete application rows.
- [x] Confirm the service role can insert inside a transaction and the rollback leaves no row.
- [x] Confirm `gyeol-crop-samples` exists and is private.
- [ ] A modern production secret key is registered; confirm authenticated `/api/sync` dry-run and Storage access through the new deployment.
- Evidence: `docs/qa/2026-07-18-supabase-production.md`.

## Vercel and secrets

- [x] Register a modern `SUPABASE_SERVICE_ROLE_KEY`; URL, high-entropy sync token, bucket, retention, and allowed origins are set.
- [x] Set a distinct high-entropy `UNSUBSCRIBE_SECRET` and `CRON_SECRET`.
- [x] Reject Vercel secret-mask placeholders and weak sync tokens at runtime.
- [x] Configure a live Vercel Firewall fixed-window limit for `/api/analyze`, `/api/reason`, and `/api/reengage/subscribe` POST: 20 requests per IP per 60 seconds, default 429 action.
- [ ] Verify AI provider and Resend spending limits/alerts.

## Physical-device release gate

- [ ] Complete every required row in `docs/mobile-camera-qa.md` on physical hardware.
- [ ] Record OS/browser, video/track/crop dimensions, gate latency, and capture result.
- [ ] Verify permission denial, background/resume, orientation change, retry, and survey-only fallback.

## Privacy and email

- [ ] Send a real week-2 test email and verify its unsubscribe link.
- [ ] Confirm a revoked contact is excluded from the next scheduled run.
- [ ] Confirm expired contacts are deleted in a bounded cron run.
- [x] Verify the privacy page clears all 17 registered local/session keys through its two-step delete UI.

## Android and Google Play

- [x] Bubblewrap 1.24.1 is exact-pinned; package `com.seonkistall.aru` targets API 36 with min SDK 23.
- [x] Signed AAB/APK pass bundletool, package/version, permission, and APK v1/v2 signature checks.
- [x] Upload certificate fingerprint matches the committed TWA manifest and Digital Asset Links.
- [x] ko-KR/en-US listing copy, Data safety worksheet, content-rating notes, reviewer instructions, release notes, icon, feature graphic, and four real UI screenshots exist.
- [ ] Back up the upload keystore and environment in an encrypted store before Play enrollment.
- [ ] Add the Play App Signing distribution certificate fingerprint and redeploy Digital Asset Links.
- [ ] Add the actual developer/legal name and public support email to the privacy policy and Play Console.
- [ ] Pass Galaxy S25 Edge internal-track TWA QA and the Play pre-launch report.

Evidence: `docs/qa/2026-07-16-android-artifact.md` and `docs/play-store/internal-test-checklist.md`.

Do not enable a gated Supabase, Resend, physical-device, or Play capability until its corresponding section is complete. The public local-only web path may remain live while those external gates stay visibly pending.
