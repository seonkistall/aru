# ARU Production Release Checklist

Date: 2026-07-16

## Code gates

- [x] `npm run smoke` passes: 51 test files and 246 tests, lint, production build, ML compile, and route probes.
- [x] MediaPipe model size is exactly 3,758,596 bytes and WASM assets exist under `public/vendor/mediapipe/wasm`.
- [x] No production scan code references jsDelivr or Google-hosted MediaPipe assets.
- [x] AI validation, scoped consent, camera lifecycle, RLS, and unsubscribe tests pass.

## Web performance and browser QA

- [x] Complete the 390 × 844 route matrix in KO/EN/JA/ZH.
- [x] Record Fast 4G cold/repeat Home and Scan measurements.
- [x] Verify the same-origin MediaPipe model, JS, and WASM from cache while fully offline.
- [x] Preserve real online 404 responses instead of masking them with the offline page.
- Evidence: `docs/qa/2026-07-16-web-performance.md` at commit `d687e8b`.

## Supabase operations

- [ ] Back up the production project.
- [ ] Apply `supabase/schema.sql` in the production SQL editor.
- [ ] Confirm RLS is enabled for all application tables.
- [ ] Confirm anon and authenticated roles cannot select, insert, update, or delete application rows.
- [ ] Confirm the service role can run a dry-run sync and access the private crop bucket.

## Vercel and secrets

- [ ] Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SYNC_TOKEN`, and allowed origins.
- [ ] Set a distinct high-entropy `UNSUBSCRIBE_SECRET` and `CRON_SECRET`.
- [ ] Configure distributed firewall/rate limits for `/api/analyze`, `/api/reason`, and `/api/reengage/subscribe`.
- [ ] Verify AI provider and Resend spending limits/alerts.

## Physical-device release gate

- [ ] Complete every required row in `docs/mobile-camera-qa.md` on physical hardware.
- [ ] Record OS/browser, video/track/crop dimensions, gate latency, and capture result.
- [ ] Verify permission denial, background/resume, orientation change, retry, and survey-only fallback.

## Privacy and email

- [ ] Send a real week-2 test email and verify its unsubscribe link.
- [ ] Confirm a revoked contact is excluded from the next scheduled run.
- [ ] Confirm expired contacts are deleted in a bounded cron run.
- [ ] Verify the privacy page clears all documented on-device keys.

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

Production traffic must not be switched until every checkbox is complete. Code completion alone is not deployment approval.
