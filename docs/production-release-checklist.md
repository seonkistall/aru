# ARU Production Release Checklist

Date: 2026-07-15

## Code gates

- [ ] `npm run smoke` passes from a clean install.
- [ ] MediaPipe model size is exactly 3,758,596 bytes and WASM assets exist under `public/vendor/mediapipe/wasm`.
- [ ] No production scan code references jsDelivr or Google-hosted MediaPipe assets.
- [ ] AI validation, scoped consent, camera lifecycle, RLS, and unsubscribe tests pass.

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

Production traffic must not be switched until every checkbox is complete. Code completion alone is not deployment approval.
