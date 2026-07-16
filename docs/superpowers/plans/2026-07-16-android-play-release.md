# ARU Android and Google Play Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a traceable, signed Android App Bundle for `com.seonkistall.aru`, a verified TWA association with `https://aru-beauty.vercel.app`, a complete store pack, and production web/Android QA evidence suitable for Play internal testing.

**Architecture:** Bubblewrap generates an Android wrapper under `android/`; the wrapper opens only the verified ARU production origin. Upload signing material stays outside Git, while public certificate fingerprints are generated into Digital Asset Links and documented for later Play App Signing augmentation.

**Tech Stack:** Bubblewrap 1.24.1 or newer compatible release, JDK 17, Android SDK/Build Tools, Gradle, Trusted Web Activity, Digital Asset Links, Vercel, Google Play Console.

## Global Constraints

- Application ID is exactly `com.seonkistall.aru` and may not change after store creation.
- Production origin is exactly `https://aru-beauty.vercel.app`.
- Minimum SDK is 23; compile and target SDK are at least 35 and rechecked against current policy at build time.
- Wrapper requests no storage, location, contacts, microphone, advertising ID, or unrelated Android permission.
- Keystores, passwords, service-account JSON, SDK/JDK files, generated APK/AAB files and `.env.android.local` are ignored.
- Version code is monotonic; version name matches `package.json`.
- Play release is not claimed until Play Console, Data Safety, App Signing, internal-track and pre-launch evidence exist.

---

### Task 1: Establish a reproducible Android toolchain and wrapper

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `android/twa-manifest.json`
- Create through Bubblewrap: `android/app/build.gradle`
- Create through Bubblewrap: `android/build.gradle`
- Create through Bubblewrap: `android/settings.gradle`
- Create through Bubblewrap: `android/gradle.properties`
- Create through Bubblewrap: `android/gradlew`
- Create through Bubblewrap: `android/gradlew.bat`
- Create through Bubblewrap: `android/gradle/wrapper/*`
- Create: `scripts/android-check.mjs`
- Create: `tests/android-config.test.ts`

**Interfaces:**
- Produces: a Bubblewrap Android project whose manifest source of truth is `android/twa-manifest.json`.
- Produces: `npm run android:check` validating package, origin, SDKs, permissions and ignored secrets.

- [ ] **Step 1: Write the failing configuration test**

```ts
expect(manifest.packageId).toBe("com.seonkistall.aru");
expect(manifest.host).toBe("aru-beauty.vercel.app");
expect(manifest.startUrl).toBe("/");
expect(manifest.orientation).toBe("portrait");
expect(gradle).toMatch(/targetSdk(?:Version)?\s+35/);
expect(androidManifest).not.toMatch(/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION|RECORD_AUDIO|AD_ID/);
```

- [ ] **Step 2: Confirm the project is absent**

Run: `npm test -- tests/android-config.test.ts`

Expected: FAIL because `android/twa-manifest.json` and Android sources do not exist.

- [ ] **Step 3: Install and record the toolchain**

Install JDK 17 and Android command-line tools into user-writable locations, accept Android licenses, and install platform/build-tools 35. Verify:

```powershell
java -version
javac -version
adb version
sdkmanager --list_installed
npx.cmd @bubblewrap/cli@1.24.1 --version
```

Expected: Java 17.x, ADB available, Android platform 35 installed, Bubblewrap 1.24.1.

- [ ] **Step 4: Generate the wrapper with exact product values**

Run Bubblewrap from `android/` against `https://aru-beauty.vercel.app/manifest.webmanifest` with app name `ARU 아루`, launcher name `ARU`, package `com.seonkistall.aru`, version name from `package.json`, version code `11000`, min SDK 23, portrait orientation and monochrome status/navigation colors matching the PWA. Set target/compile SDK to 35 if the generated defaults are lower.

- [ ] **Step 5: Add deterministic verification and ignore rules**

`scripts/android-check.mjs` exits non-zero with a problem/cause/fix message for missing tools, wrong package/origin/SDK, broad permissions, tracked keystore, or version mismatch. Add `android/app/build/`, `android/.gradle/`, `android/*.jks`, `android/*.keystore`, `.env.android.local`, `*.aab`, and `*.apk` to `.gitignore`.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/android-config.test.ts && npm run android:check && android\gradlew.bat -p android lintRelease`

Expected: configuration tests, checker and Android lint pass.

Commit: `feat: add ARU trusted web activity`

### Task 2: Generate upload signing and Digital Asset Links safely

**Files:**
- Create ignored local file: `.env.android.local`
- Create ignored local file: `android/aru-upload.jks`
- Create: `scripts/write-assetlinks.mjs`
- Create: `public/.well-known/assetlinks.json`
- Create: `tests/assetlinks.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: public relation `delegate_permission/common.handle_all_urls` for package `com.seonkistall.aru` and the real upload certificate SHA-256 fingerprint.

- [ ] **Step 1: Write the failing association test**

```ts
expect(assetlinks).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: {
  namespace: "android_app",
  package_name: "com.seonkistall.aru",
  sha256_cert_fingerprints: expect.arrayContaining([expect.stringMatching(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)])
} }]);
```

- [ ] **Step 2: Confirm failure**

Run: `npm test -- tests/assetlinks.test.ts`

Expected: FAIL because no association file exists.

- [ ] **Step 3: Generate the local upload key**

Create a cryptographically random store/key password, store it only in ignored `.env.android.local`, generate RSA-2048 or stronger key alias `aru-upload` valid for at least 25 years, and extract its SHA-256 fingerprint with `keytool -list -v`. Do not print passwords or commit the keystore.

- [ ] **Step 4: Write the association file from validated input**

`scripts/write-assetlinks.mjs` accepts a comma-separated `ARU_ANDROID_CERT_FINGERPRINTS`, normalizes uppercase colon format, rejects invalid lengths, removes duplicates and writes the exact JSON structure from Step 1. Run it with the upload fingerprint.

- [ ] **Step 5: Verify public delivery and commit**

Run: `npm test -- tests/assetlinks.test.ts && npm run build`

After web deploy, request `https://aru-beauty.vercel.app/.well-known/assetlinks.json`; expected status 200, JSON content type, package match and actual fingerprint. Add the Play App Signing distribution fingerprint to the same list when Play Console provides it.

Commit: `feat: publish Android app association`

### Task 3: Build and verify signed release artifacts

**Files:**
- Modify: `android/app/build.gradle`
- Create ignored artifact: `android/app/build/outputs/bundle/release/app-release.aab`
- Create ignored artifact: `android/app/build/outputs/apk/release/app-release.apk`
- Create: `docs/android-build-runbook.md`
- Create: `docs/qa/2026-07-16-android-artifact.md`

**Interfaces:**
- Produces: a signed AAB/APK from the same release version and certificate documented in Digital Asset Links.

- [ ] **Step 1: Configure environment-only signing**

Gradle reads `ARU_KEYSTORE_PATH`, `ARU_KEYSTORE_PASSWORD`, `ARU_KEY_ALIAS`, and `ARU_KEY_PASSWORD` from the environment and throws a clear release-build error when any is absent. Debug builds remain usable without these values.

- [ ] **Step 2: Build release artifacts**

Load the ignored local env values into the current PowerShell process, then run:

```powershell
android\gradlew.bat -p android clean bundleRelease assembleRelease
```

Expected: signed `app-release.aab` and `app-release.apk` are produced without entering a password interactively.

- [ ] **Step 3: Verify package, SDK, signature and TWA URL**

Use `bundletool dump manifest`, `apksigner verify --print-certs`, and `aapt2 dump badging` to prove package `com.seonkistall.aru`, target SDK ≥35, version code/name, certificate SHA-256 match, no broad permission, and production launch URL. Record file SHA-256 and sizes, not secrets.

- [ ] **Step 4: Document reproducible build and commit evidence**

The runbook includes prerequisites, environment names, commands, expected artifact paths, verification, version bump procedure, key backup warning and recovery path. The QA record includes exact Git commit, package version, artifact hashes and certificate fingerprint.

Commit: `docs: record signed Android artifact verification`

### Task 4: Prepare complete Google Play listing and policy artifacts

**Files:**
- Create: `docs/play-store/listing-ko.md`
- Create: `docs/play-store/listing-en.md`
- Create: `docs/play-store/data-safety.md`
- Create: `docs/play-store/privacy-policy-review.md`
- Create: `docs/play-store/content-rating.md`
- Create: `docs/play-store/reviewer-instructions.md`
- Create: `docs/play-store/release-notes-1.1.0.md`
- Create: `docs/play-store/internal-test-checklist.md`
- Create: `docs/play-store/assets/app-icon-512.png`
- Create: `docs/play-store/assets/feature-graphic-1024x500.png`
- Create: `docs/play-store/assets/phone-01-home.png`
- Create: `docs/play-store/assets/phone-02-scan.png`
- Create: `docs/play-store/assets/phone-03-report.png`
- Create: `docs/play-store/assets/phone-04-routine.png`
- Create: `tests/play-store-pack.test.ts`

**Interfaces:**
- Produces: a store pack with exact dimensions, truthful claims and a code-aligned Data Safety worksheet.

- [ ] **Step 1: Write failing artifact/dimension tests**

Require every file above, PNG dimensions 512×512, 1024×500 and phone screenshots within Play's accepted range, Korean and English short descriptions within 80 characters, full descriptions within 4000, and no banned diagnosis/treatment/live-price/affiliate wording.

- [ ] **Step 2: Confirm failure**

Run: `npm test -- tests/play-store-pack.test.ts`

Expected: FAIL because the store pack is missing.

- [ ] **Step 3: Write listing and policy content from actual code**

Lead with optional on-device camera scan, survey fallback, routine and privacy controls. Data Safety declares optional ephemeral AI face-crop processing, pilot-only consented research uploads and reminder email storage; it distinguishes on-device-only processing. Reviewer instructions describe permission, mirroring, survey fallback, AI grant and deletion. No medical, efficacy, live-price or uncontracted affiliate claim is allowed.

- [ ] **Step 4: Produce real UI assets**

Use the shipped ARU character, paper palette and typography for the icon/feature graphic. Capture screenshots from the production commit at a Play-compatible phone size and show Home, permission explanation/scan guide, cosmetic report, and routine; do not fabricate camera output or customer ratings.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/play-store-pack.test.ts`

Expected: all files, dimensions, copy limits and claim scans pass.

Commit: `docs: add Google Play submission pack`

### Task 5: Deploy, canary, install and run the release matrix

**Files:**
- Modify: `README.md`
- Modify: `docs/production-release-checklist.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/mobile-camera-qa.md`
- Create: `docs/qa/2026-07-16-production-canary.md`
- Create: `docs/qa/2026-07-16-twa-device-qa.md`

**Interfaces:**
- Produces: one traceable release commit shared by GitHub, Vercel, Digital Asset Links, Android artifact and QA records.

- [ ] **Step 1: Run pre-ship verification**

Run `git diff --check`, `npm run smoke`, `npm audit --omit=dev`, `npm run android:check`, Android lint, bundle build and artifact verification. Expected: no critical/high issue and every gate passes.

- [ ] **Step 2: Commit, push and deploy production**

Update README with architecture, setup, environment table, privacy model, web deploy, Android build/verification, owner gates and exact release commands. Push the reviewed main commit, deploy that commit to Vercel production, and record the deployment URL/commit.

Record the previous production deployment before promotion. If any canary route, header, consumer flow, camera launch, or association check regresses, immediately promote the previous Vercel deployment and keep the new Android artifact out of Play; document the failed commit and rollback result.

- [ ] **Step 3: Run production canary**

Probe `/`, `/scan`, `/survey`, `/privacy`, `/offline.html`, `/sw.js`, `/.well-known/assetlinks.json`; verify internal tools deny unauthenticated production access; verify security headers; verify invalid/oversized APIs return 400/413/429 without provider detail; check console/network on the complete consumer flow.

- [ ] **Step 4: Install and test the APK on Galaxy S25 Edge**

Use ADB to install the signed APK and verify full-screen verified TWA rather than visible Custom Tab fallback. Run permission, mirroring, skin-region guide, automatic capture, manual capture, quality rejection, retake, background/foreground, rotation recovery, offline fallback and return-online recovery. Record Android 16, One UI 8.5, package/version and exact build hash.

Before broad public rollout, repeat the consumer flow on one additional Android device class and one iPhone Safari class. Missing extra-device access blocks broad rollout but does not falsify a completed Galaxy internal-test record.

- [ ] **Step 5: Upload to Play internal testing when owner state exists**

Create the Play app with package `com.seonkistall.aru`, enable Play App Signing, add the distribution fingerprint to `assetlinks.json`, redeploy and revalidate association, complete app access/ads/content rating/target audience/Data Safety/privacy declarations, upload the AAB, add testers and resolve every pre-launch/policy/device-catalog warning.

- [ ] **Step 6: Close or explicitly retain owner gates**

Before claiming internal-track readiness, evidence must exist for real legal developer/entity and privacy contact, Resend verified domain/from/API/test recipient, Play Console identity/app/signing state, and physical-device TWA QA. If an owner gate remains absent, mark only that row pending while preserving the verified code/deployment/artifact result.

Commit: `docs: finalize ARU production release evidence`
