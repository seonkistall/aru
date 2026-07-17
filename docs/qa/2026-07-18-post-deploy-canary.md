# Production canary — 2026-07-18

Production alias: `https://aru-beauty.vercel.app`

Verified deployment:

- Vercel deployment: `dpl_TA7wP6c7mmtWrpvKNH2prn9NRP1o`
- Immutable URL: `https://aru-beauty-ng6uwox7n-seonkistalls-projects.vercel.app`
- Source merge: `ba9053fecdff52c207d4c8e94eb8bd3ca6bf9ff4`
- State: `Ready`, Production, canonical alias attached

No secret value, email address, face image, or participant data is recorded in
this report.

## Mobile journey

The canary used a 390 × 844 Chromium viewport and exercised both the first-use
and returning-user states.

- `/`, `/scan`, `/survey`, `/report`, `/care`, `/privacy`, and `/unsubscribe`
  returned 200.
- Home → survey-only → report completed without a camera or external account.
- `/api/reason` returned 200 and the report rendered analysis, three product
  picks, the AM/PM routine, and the care handoff.
- The product handoff returned 302 to an Olive Young search URL with
  `noopener noreferrer`.
- Reminder signup remained disabled until a valid email and explicit consent
  were both present. No test subscription was submitted.
- Camera denial rendered a recoverable `다시 시도` action and a survey-only
  fallback. It produced no console error.
- English locale switching updated `html[lang]` and the visible navigation
  without horizontal overflow.
- Every inspected route had `scrollWidth === innerWidth` at 390 px and no
  browser-console error.

The returning-user home state exposed one regression: `지난 결과 이어보기` and
`다시 스캔하기` were only 31.5 px high. A failing mobile layout contract now
protects this state, and both links use the shared 44 px minimum tap target.
The fixed local production build rendered no interactive target below 44 px.

## API and security boundary

- `POST /api/analyze` with an empty JSON object returned 400 `invalid image`.
- `POST /api/reason` with an empty JSON object returned 400 `invalid items`.
- A cross-origin JSON preflight received no
  `Access-Control-Allow-Origin`, so browsers cannot call the AI routes from
  another origin.
- The app-level per-IP limit and the Vercel Firewall limit remain separate
  defenses; this canary did not intentionally exhaust either production limit.
- `GET /api/sync` reported `configured`, `cropBucketConfigured`, and
  `originGuardConfigured` as true.
- An unauthenticated canonical-origin sync POST returned 401.
- Vercel returned no error-level runtime log for the verified deployment in the
  one-hour post-deploy window.

An authenticated sync dry-run was not performed because the production sync
token is intentionally unavailable to this QA environment. Database RLS,
service-role rollback, and private Storage evidence remain recorded separately
in [the Supabase production report](2026-07-18-supabase-production.md).

## Self-hosted MediaPipe

- `/vendor/mediapipe/face_landmarker.task` returned 200 as
  `application/octet-stream`, 3,758,596 bytes.
- `/vendor/mediapipe/wasm/vision_wasm_internal.js` returned 200 as JavaScript,
  322,044 bytes.
- `/vendor/mediapipe/wasm/vision_wasm_internal.wasm` returned 200 as
  `application/wasm`, 11,153,617 bytes.
- The active service worker controlled the page and cached a same-origin
  MediaPipe request in `aru-mediapipe-v1`.
- No runtime request referenced jsDelivr or a Google-hosted MediaPipe asset.

## Fresh local release gates

- `npm run smoke`: 52 files, 254 tests, ESLint, Next.js 16.2.9 production
  build, TypeScript, ML Python compile, and route/auth probes passed.
- `npm run android:check`: `com.seonkistall.aru` 1.1.0 (11000), target API 36,
  local JDK 17 and Android SDK passed.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- `git diff --check`: passed.

## Gates not replaced by this canary

- Resend verified-domain delivery, signed unsubscribe, revoked-recipient
  exclusion, and retention cleanup require a real sender and recipient.
- The remaining camera lighting/occlusion matrix, TWA internal-track test, and
  iPhone Safari matrix require physical hardware.
- Play submission still requires the owner-supplied legal developer name,
  public support email, Play App Signing distribution certificate, Console
  declarations, internal testing, and the pre-launch report.
