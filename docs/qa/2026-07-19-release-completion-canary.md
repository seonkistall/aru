# Release completion canary — 2026-07-19

Production alias: `https://aru-beauty.vercel.app`

Verified release:

- GitHub PR: `#52`
- merge commit: `1e884e646ab25510b312a750240e6020d16342fc`
- Vercel deployment: `dpl_3YTFaCFcvjEyWHTWXXmC8PDDPsUr`
- immutable URL:
  `https://aru-beauty-3m7gu84hc-seonkistalls-projects.vercel.app`
- state: `Ready`, Production, canonical alias attached

No secret value, email address, face image, participant data, or Play Console
identity document is recorded in this report.

## Reproduced issues and fixes

The 360 × 800 production audit reproduced four mobile defects before the
release:

1. the denied-camera `사진 없이 추천받기` action was 20 px high;
2. the routine reminder input/button were 43 px and the consent target was
   19 px;
3. Studio widened the document to 373 px and clipped four row controls;
4. longer Japanese and Chinese hero callouts extended past the left viewport.

The release applies the shared 44 px touch contract, lets the Studio flex input
shrink, moves the localized callout anchor inside the viewport, and exposes a
consumer-visible `개인정보와 동의` report link for address-bar-free TWA review.

## Automated release gates

Fresh `npm run smoke` evidence:

- ESLint passed;
- Vitest: 52 files, 260 tests passed;
- Playwright Chromium: 4 rendered 360 × 800 tests passed;
- KO/EN/JA/ZH home callout bounds and horizontal overflow passed;
- denied-camera fallback, Studio controls, routine reminder, and the report
  privacy path passed;
- Next.js 16.2.9 production build and TypeScript passed;
- five ML Python entry points compiled;
- 23 routes generated;
- `/scan`, `/privacy`, `/offline.html`, and `/sw.js` returned 200;
- production-hidden `/pilot`, `/ops`, and `/eval` returned 404;
- `/api/out` returned the expected 302;
- unauthenticated `/api/sync` POST remained blocked.

`npm audit --omit=dev` reported zero production vulnerabilities.

The full development audit still reports transitive advisories under the
latest available `@bubblewrap/cli` 1.24.1 (`file-type`, `tar`, and `uuid`).
They are isolated to the local Android packaging toolchain and do not ship in
the Web runtime. `npm audit fix --force` would downgrade Bubblewrap to 0.5.1,
so no breaking forced rewrite was applied. Android packaging must continue to
use trusted local project inputs while the upstream toolchain is monitored.

## Public Production canary

The public alias was checked after Vercel attached the merge deployment.

- Home Chinese callout:
  `x=1.655`, `right=132.345`, `scrollWidth=360`, `innerWidth=360`.
- Denied-camera fallback:
  `height=44`, `x=131.781`, `right=228.203`, no overflow.
- Studio:
  17 inspected inputs/buttons/textareas, no target below 44 px, no offscreen
  control, `scrollWidth=360`.
- Routine reminder:
  email input 44 px, submit button 44 px, consent label 44 px.
- Report privacy action:
  44 px high, visible at 360 px, and navigation reached `/privacy`.
- Browser console:
  no error.
- Journey network:
  Home, Scan, Studio, Report, `/api/reason`, and Privacy responses succeeded;
  no failed canary request was observed.

Local ignored screenshots:

- `.gstack/qa-reports/screenshots/production-home-zh-final.png`
- `.gstack/qa-reports/screenshots/production-scan-denied-final.png`
- `.gstack/qa-reports/screenshots/production-studio-final.png`
- `.gstack/qa-reports/screenshots/production-report-routine-final.png`

## Runtime and self-hosted assets

- `GET /api/sync` returned 200 with `configured`,
  `cropBucketConfigured`, and `originGuardConfigured` all true.
- The response retained a 5,242,880-byte sync limit and 12 requests per
  60-second app-level limit.
- `/privacy` returned 200 with the enforced security headers.
- `/vendor/mediapipe/face_landmarker.task` returned 200 as
  `application/octet-stream`, exactly 3,758,596 bytes.
- Vercel returned no error-level runtime log for the new deployment during the
  post-deploy check.

## Android and Google Play evidence

- package: `com.seonkistall.aru`
- version: `1.1.0 (11000)`
- target API: 36; min SDK: 23
- AAB SHA-256:
  `532731EB753341607E9E4034FC67F5EFE79BE5C2E7A22290F9928013450092B2`
- APK SHA-256:
  `438B86205EEFB9E390E1A1B0EE429ABE8FD27F6061B55FE3A3D8A8C1F632501A`
- native-library entries: `0`, following Android's automatic 16 KB
  compatibility path for Java/Kotlin-only apps
- camera/storage/media/location/microphone/contacts/AD_ID permissions: absent

Current policy references:

- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL)
- [16 KB page-size compatibility](https://developer.android.com/guide/practices/page-sizes)
- [New personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [New personal-account device verification](https://support.google.com/googleplay/android-developer/answer/14316361)

## External gates not replaced by this release

- Play Console identity verification and the payment-account alert must be
  completed by the account owner before app creation is enabled.
- The actual developer/legal name and public support email must be supplied.
- The upload keystore must be backed up in an encrypted external store.
- After Play App Signing enrollment, its distribution certificate must be
  added to Digital Asset Links and redeployed.
- If the account is a personal account created after 2023-11-13, complete the
  mobile-app device verification and the continuous 12-tester/14-day closed
  test before requesting production access.
- Galaxy S25 Edge internal-track TWA, the remaining camera lighting/occlusion
  matrix, iPhone Safari, and the Play pre-launch report require physical
  devices or Play infrastructure.
- Resend verified-domain delivery, signed unsubscribe, revoked-recipient
  exclusion, and cleanup need a real sender and recipient.
- Supabase authenticated sync dry-run and production backup evidence remain
  operator-only checks.
