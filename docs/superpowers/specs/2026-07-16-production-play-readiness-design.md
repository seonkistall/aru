# ARU Production and Google Play Readiness Design

Status: Approved for implementation

Approved: 2026-07-16

Android application ID: `com.seonkistall.aru`

Production origin: `https://aru-beauty.vercel.app`

## 1. Context

ARU is a mobile-first K-beauty recommendation product. A user can complete an optional on-device camera scan, answer a preference survey, receive a cosmetic-only report, compare recommended products, open purchase or clinic-search links, and optionally leave a later check-in.

The current web production candidate is functional: the full repository smoke command passes lint, 152 Vitest tests, the Next.js production build, Python ML compilation, and route probes. A Galaxy S25 Edge browser baseline also passed permission, front-camera mirroring, capture, quality-gate, and retake flows.

That evidence is not sufficient for a Google Play release. The repository has no Android project or signed App Bundle, the PWA manifest is incomplete for store packaging, offline/TWA failure behavior is absent, the privacy UI cannot delete all local ARU data, internal tools are public, and several production UI and trust defects were reproduced on the deployed mobile site.

This design closes those gaps without rewriting the working camera product.

## 2. Goals

1. Make every consumer journey coherent, readable, privacy-correct, and usable on a 360-430 px mobile viewport.
2. Fix reproduced functional, security, policy, and data-lifecycle defects with regression coverage.
3. Preserve the proven browser camera behavior and the on-device-first privacy model.
4. Package the web product as a Trusted Web Activity (TWA) using Bubblewrap.
5. Produce a verifiable Android App Bundle for `com.seonkistall.aru` targeting the current Google Play API requirement.
6. Prepare the code, PRD, policy declarations, store copy, assets, and QA evidence needed for an internal Play track.
7. Leave external owner-only actions explicit rather than claiming that a Play or email release occurred without account evidence.

## 3. Non-goals

- No React Native or native Android rewrite.
- No medical diagnosis, treatment, prescription, or clinical efficacy claims.
- No account system or cross-device consumer history.
- No learned-model publication before the existing data-readiness gates pass.
- No live commerce-price scraper or unverified merchant partnership claim.
- No speculative relaxation of the camera quality thresholds without real-device evidence.
- No analytics SDK, advertising SDK, stable device fingerprint, or broad Android permission.

## 4. Release approach

### 4.1 Selected: Trusted Web Activity

Bubblewrap will generate a small Android wrapper that opens ARU's production origin as a full-screen TWA. Digital Asset Links will prove that the Android package and the web origin have the same owner.

This approach is selected because it:

- preserves the Chrome camera permission, mirroring, MediaPipe, WebGL/WASM, storage, and navigation behavior already tested;
- avoids a second WebView-specific camera and storage implementation;
- keeps web and Android releases on one product code path;
- produces the AAB format required for Play submission;
- gives users a launcher icon and app-like full-screen experience while retaining the web fallback.

### 4.2 Rejected alternatives

Capacitor is rejected for this release because it adds a WebView permission and lifecycle surface that would require a second full camera qualification. A React Native rewrite is rejected because it duplicates the recommendation, privacy, i18n, report, and camera pipelines and would delay the validated product.

## 5. Product flow design

### 5.1 Primary camera journey

1. Home explains the value and shows the primary scan CTA in the first mobile viewport.
2. Scan start explains on-device processing before the browser permission request.
3. The live gate evaluates the face plus T-zone and both cheek skin regions for distance, exposure, glare, sharpness, and motion.
4. A failed model or camera path always offers survey-only continuation.
5. A verified capture produces an on-device report; optional AI transfer occurs only after the separate AI grant.
6. Survey collects category, skin type, and budget as required inputs; concerns and avoided ingredients remain optional.
7. Report uses three stages: analysis, recommendations, and routine/follow-up.
8. Recommendation actions do not cover product content. The primary merchant action appears in flow after the recommendation set.
9. Care shows one primary merchant action per product and hides alternate merchants behind an explicit expansion.
10. Check-in and email opt-in remain optional.

### 5.2 Survey-only journey

Home -> survey -> report -> recommendation -> routine/care. The report states that it is survey-based and offers a scan without blocking the recommendations.

### 5.3 Returning journey

The last local report can restore a consumer report or care page in a new tab. The UI must tolerate missing, stale, or invalid local values without rendering `NaN`, crashing, or making unsupported claims.

### 5.4 Internal research journey

`/pilot`, `/ops`, and `/eval` remain available only behind a default-deny production access gate. They are excluded from the consumer navigation, sitemap, and store review journey.

## 6. UI, content, and typography

### 6.1 Mobile hierarchy

- Shorten or responsively size the home headline so a final Korean word is not stranded on its own line.
- Move the primary CTA above the three explanatory cards or compact the hero so it is visible without scrolling on a 390 x 844 viewport.
- Keep minimum interactive targets at 44 CSS px.
- Remove the fixed report purchase bar that obscures recommendation content. Use an in-flow CTA after the products and comparison.
- Collapse secondary care merchants to reduce the initial 12-button wall.
- Keep the safety boundary visible but remove a red "consult first" priority derived solely from mild cosmetic redness.

### 6.2 Trust copy

- Remove fictional-looking rating and review counts from product cards and comparisons.
- Do not display seed prices as live merchant prices. Use budget-band language and tell users to confirm current price and ingredients at the merchant.
- Change the promise from an unconditional three products to "up to three" where a category contains fewer candidates.
- Never describe uncontracted merchants as active affiliates. `partner-ready` remains an internal field, not a consumer claim.
- Brand and localize the unsubscribe page and provide routes back to ARU and the privacy policy.

### 6.3 Font system

- Keep self-hosted Pretendard as the body, form, number, price, and control font.
- Self-host Nanum Pen Script under its OFL license for short Korean display headings and annotations only.
- Do not use `Segoe Print` or `Comic Sans MS` as production brand fonts.
- For English, Japanese, and Simplified Chinese, use the readable sans stack for headings rather than a Korean-only handwriting face.
- Maintain correct `html[lang]` values and locale-specific CJK line breaking.
- Limit the display face by token instead of assigning it to all serif/display roles.

## 7. Internationalization

The global KO/EN/JA/ZH language switch is the only consumer locale controller.

- Remove the independent KO/EN segmented controls from Care and Privacy.
- Derive all copy and care-link locale behavior from the global language.
- Do not permit a Japanese or Chinese page to switch an inner section to English while the surrounding page remains Japanese or Chinese.
- Add tests for all four languages on Home, Scan, Survey, Report, Care, Privacy, errors, 404, check-in, and unsubscribe.
- Persist the user's global language choice, but include language preference in the documented local-data inventory.

## 8. Privacy and data lifecycle

### 8.1 On-device data registry

Create one documented registry/helper for every ARU local or session key, including:

- scan inputs and reads;
- last result and scan history;
- survey state;
- labels and learning crops;
- consent events;
- purchase, care-intent, and check-in records;
- funnel events, visitor ID, and session ID;
- pilot notes and current pilot session;
- language preference.

The Privacy page will show meaningful groups and provide:

1. scoped export/delete actions where useful for research;
2. one prominent "Delete all ARU data on this device" action;
3. a confirmation step that names what will be removed;
4. a success state verified by re-reading every registered key.

Language preference may be preserved only if the confirmation copy says so. The default implementation deletes it to make "all" literal.

### 8.2 Server data

The public policy must state:

- default scan data stays on device;
- an AI crop is sent to Google Gemini or OpenAI only after the matching grant and is used ephemerally for the request;
- pilot learning samples can reach the private research store only with exact participant/session consent;
- reminder email data, purpose, delivery metadata, revocation behavior, and 30-day post-week-four/revocation retention;
- how a user can request server deletion;
- the real developer/entity name and a working privacy contact.

The entity name and privacy email are external owner inputs and must be supplied before a production Play submission. Placeholder identities must never be published.

### 8.3 Google Play declarations

Prepare a Data Safety worksheet covering controlled TWA content. On-device-only camera processing is distinguished from optional off-device face-crop processing, reminder email storage, and any synced pilot research data. The declarations and the public privacy page must agree.

## 9. Security and backend design

### 9.1 Internal surfaces

- Gate `/ops`, `/pilot`, and `/eval` through a production server boundary using environment-backed credentials.
- Default to not found/denied when the credentials are absent.
- Add `noindex` metadata and keep the routes out of consumer navigation.
- Do not put an access token in a query parameter or browser local storage.

### 9.2 Request controls

Use the shared bounded JSON reader and client-key logic for every JSON API:

- `/api/analyze` and `/api/reason` retain their current byte/schema/rate/timeout controls and add bounded provider output tokens;
- `/api/sync` enforces actual UTF-8 bytes even when `Content-Length` is missing or chunked;
- re-engagement subscribe/manual endpoints enforce small bodies and validated schemas;
- production Vercel Firewall rules remain required because per-instance maps are defense in depth, not distributed quotas.

Token and secret comparisons use timing-safe comparison where feasible. Configuration status endpoints disclose no unnecessary operational detail.

### 9.3 Email delivery

- Require distinct cron and unsubscribe secrets in production.
- Cap each cron run to a duration-safe batch.
- Use deterministic provider idempotency keys if supported by the selected Resend API version.
- Treat post-send database update failure as an operational error and expose it in logs/response counters.
- Continue deleting expired contacts according to the documented policy.
- Keep all sending disabled until a verified owner domain, sender, API key, and test recipient are configured.

### 9.4 Headers and dependencies

- Add HSTS, nosniff, referrer, frame, and least-privilege Permissions-Policy headers.
- Introduce CSP in report-only mode first because Next.js and current inline styles require compatibility evidence; enforce only after route and camera verification.
- Apply compatible patch upgrades.
- Resolve the nested PostCSS advisory with a tested override or upstream-compatible release; never accept the audit tool's destructive Next.js downgrade.
- Remove unused, misleading client Supabase and duplicate rate-limit modules if import evidence still proves they are dead.

### 9.5 Supabase reproducibility

Keep the already-verified production RLS posture and encode it fully in `supabase/schema.sql`, including table grants, sequence/function privileges, storage policy, and hardened default privileges. A clean project rebuilt from the schema must not reintroduce anon/authenticated table access.

## 10. Camera and ML design

- Keep MediaPipe WASM and the face-landmarker model on the ARU origin.
- Make `/eval` import the same asset configuration and analysis path as `/scan`.
- Do not change ROI thresholds based only on headless tests.
- Add a post-change Galaxy S25 Edge run for permission, mirroring, ROI feedback, automatic capture, manual capture, retake, background/foreground, rotation recovery, and TWA launch.
- Add at least one additional Android class and one iPhone Safari class before broad traffic.

`app/scan/page.tsx` will be split incrementally after characterization tests. The sequence is pure capture helpers -> camera/landmarker lifecycle hook -> quality loop hook -> capture-analysis orchestrator -> phase presentation. Each extraction must preserve observable behavior and pass focused tests before the next extraction.

## 11. PWA and offline behavior

The web manifest will include:

- stable `id`, `start_url`, and `scope`;
- standalone display and portrait orientation;
- 192 and 512 px PNG icons;
- a 512 px maskable icon with safe-zone artwork;
- ARU theme/background colors, language, and beauty/lifestyle categories.

A small service worker will:

- precache a branded HTTP-200 offline fallback;
- use network-first navigation with the fallback for network, 404, and 5xx failures;
- never cache API responses or user-specific report HTML;
- cache versioned static assets safely;
- cache the large MediaPipe assets only after successful same-origin requests so a repeat scan can work after a prior online load;
- delete old named caches on activation.

The UI must explain that a first scan requires the model assets to have loaded online. Offline handling must never silently show a stale user's report.

## 12. Android package

Bubblewrap 1.24.1 or a verified newer compatible release will generate the Android project.

Required configuration:

- application ID: `com.seonkistall.aru`;
- app name: `ARU 아루`;
- production host: `aru-beauty.vercel.app`;
- minimum SDK: 23;
- target/compile SDK: at least API 35, matching the policy in force at build time;
- portrait launch;
- no storage, location, contacts, microphone, advertising, or other unrelated permission;
- only the browser-mediated camera behavior required by the web product;
- version name aligned with the repository package version and monotonically increasing version code.

The generated project and `twa-manifest.json` are committed. Keystores, passwords, service-account JSON, generated APK/AAB files, and local SDK/JDK files are ignored.

`public/.well-known/assetlinks.json` will contain the required package relation. During local/internal testing it includes the upload certificate fingerprint. After Play App Signing is enabled, it must also include the Play distribution certificate fingerprint before production rollout.

## 13. PRD and metrics

Rewrite `docs/PRD.md` as the single product contract with:

- problem, users, promise, journeys, functional and non-functional requirements;
- cosmetic/medical boundary;
- privacy and retention matrix;
- recommendation-data trust rules;
- camera quality and fallback requirements;
- web, TWA, and Play release gates;
- ownership and external prerequisites.

Add `survey_viewed` and keep the existing metric definitions. Production reporting must be honest about its source. Either events are uploaded through an explicitly consented first-party endpoint or the PRD labels the current local/operator-sync funnel as pilot-only. This release will not silently transmit consumer behavioral events merely to make a dashboard work.

## 14. Test and verification strategy

### 14.1 Test-first fixes

Every reproduced behavior bug gets a failing test before the minimum implementation. Initial regression coverage includes:

- four-language Care/Privacy behavior with no nested locale divergence;
- complete local-data deletion;
- invalid/stale local survey values;
- seed price/rating disclosure behavior;
- clinic priority not triggered by mild cosmetic redness;
- exact byte limits without `Content-Length`;
- re-engagement body and email validation;
- local-only MediaPipe URLs on all routes;
- schema/default-privilege hardening;
- manifest icons, orientation, service-worker registration, and offline fallback;
- internal tool default-deny behavior;
- `survey_viewed` event contract.

### 14.2 Web verification

1. Focused regression tests.
2. Full `npm test`.
3. ESLint and production build.
4. Python ML compile.
5. Local production smoke routes and unauthenticated API probes.
6. Mobile browser flows at 390 x 844 in KO, EN, JA, and ZH.
7. Console/network/error checks after each core interaction.
8. Before/after screenshots for every visual QA issue.
9. Deploy preview, then production canary.

### 14.3 Android verification

1. Bubblewrap PWA validation.
2. Gradle release build.
3. Verify signed APK/AAB structure and certificate.
4. Verify `assetlinks.json` is public with the correct content type and fingerprints.
5. Install the test APK through ADB on the Galaxy S25 Edge.
6. Confirm TWA verification does not fall back to a visible Custom Tab.
7. Run the physical camera matrix and background/foreground tests.
8. Upload the AAB to a Play internal testing track.
9. Resolve Play pre-launch, policy, and device-catalog warnings before production promotion.

## 15. Deployment and rollback

- Ship small, independently verifiable commits; do not mix unrelated fixes.
- Deploy the web changes first because the TWA is a live view of that origin.
- Canary the production web origin before building the final AAB.
- Keep the previous Vercel deployment available for immediate rollback.
- Do not promote a Play artifact if the linked web production has regressed.
- A web rollback does not change the Android version code; an Android wrapper defect requires a new version code.

## 16. Store preparation

Repository artifacts will include:

- Korean and English app title/short/full descriptions;
- privacy and Data Safety worksheet;
- target audience and content-rating notes;
- reviewer instructions explaining camera permission, on-device processing, optional AI consent, and survey fallback;
- 512 px app icon, 1024 x 500 feature graphic, and required phone screenshots;
- release notes and internal-test checklist.

Store copy will lead with the unique scan, survey, routine, and privacy value. It will not position the app as an affiliate-link wrapper or make medical or efficacy claims.

## 17. External owner gates

The implementation can produce a production deployment and signed/verified local Android artifacts. The following cannot be truthfully completed without external account state:

- real legal developer/entity name and privacy contact;
- verified Resend owner domain, sender, API key, and test recipient;
- Play Console developer account, identity verification, app creation, and policy declarations;
- Play App Signing distribution fingerprint;
- physical USB/ADB access to the Galaxy or a user-executed test run.

These are release inputs, not reasons to weaken code quality. All independent code, documentation, assets, and local verification continue before requesting them at the exact gate where they are required.

## 18. Acceptance criteria

The release is ready for Play internal testing only when all of the following are evidenced:

- no unresolved critical/high web QA defect;
- all automated tests, lint, build, ML compile, and smoke probes pass;
- all consumer MediaPipe assets are same-origin;
- all local ARU data can be deleted from one documented action;
- public privacy content matches actual code and Data Safety answers;
- internal tools are default-deny in production;
- product cards make no unverified live price, rating, partnership, or medical claim;
- four locales do not mix local and global language controls;
- PWA icons, maskability, orientation, service worker, offline fallback, and TWA validation pass;
- a signed AAB for `com.seonkistall.aru` targets the current required API;
- Digital Asset Links validate for the signing certificate used on the tested build;
- Galaxy S25 Edge packaged-TWA camera QA passes;
- README, PRD, architecture, runbook, production checklist, and store pack reflect the shipped state;
- the deployed production commit, GitHub commit/PR, Vercel deployment, and built Android artifact are traceable to the same release version.

Production Play promotion additionally requires the owner gates in section 17 and a clean Play internal/pre-launch review.

## 19. Reference policies and tools

- Google Play target API requirement: <https://developer.android.com/google/play/requirements/target-sdk>
- Trusted Web Activity overview: <https://developer.chrome.com/docs/android/trusted-web-activity>
- Bubblewrap quick start: <https://developer.chrome.com/docs/android/trusted-web-activity/quick-start>
- TWA offline/error quality criteria: <https://developer.chrome.com/docs/android/trusted-web-activity/whats-new>
- Google Play Data Safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Google Play User Data policy: <https://support.google.com/googleplay/android-developer/answer/10144311>
- Google Play functionality and spam policy: <https://support.google.com/googleplay/android-developer/answer/9898783>
- Nanum font OFL source: <https://github.com/naver/nanumfont>
