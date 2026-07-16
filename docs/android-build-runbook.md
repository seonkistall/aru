# ARU Android release build runbook

This runbook produces the signed internal-test artifacts for
`com.seonkistall.aru`. It never commits a keystore, password, APK, AAB, SDK, or
JDK. Google Play App Signing will replace the upload signature for store
distribution.

## Pinned release inputs

- Web origin: `https://aru-beauty.vercel.app`
- Bubblewrap: 1.24.1
- JDK: Temurin 17
- Android compile/target SDK: 36
- Android Build Tools: 36.0.0
- Gradle: 8.11.1
- Android Gradle Plugin: 8.9.1
- Bundletool: 1.18.3
- Minimum SDK: 23
- Package: `com.seonkistall.aru`

API 36 is intentional. Google Play accepts API 35 before 2026-08-31, but new
apps and updates must target Android 16/API 36 from that date. See the
[Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

## 1. Install and verify local tools

Install JDK 17 and the official Android command-line tools outside Git, then
install `platform-tools`, `platforms;android-36`, and `build-tools;36.0.0`.
Set `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT`, or use the ignored
`.toolchains/` layout consumed by `npm run android:check`.

```powershell
npx.cmd bubblewrap --version
npm.cmd run android:check
```

Expected: Bubblewrap 1.24.1 and an `android:check` PASS for version 1.1.0,
versionCode 11000, and target API 36.

## 2. Create or restore upload signing material

For the first release only:

```powershell
node scripts/create-android-signing.mjs
```

The script creates ignored `android/aru-upload.jks` and
`.env.android.local`, uses RSA-4096 with alias `aru-upload`, never logs a
password, and refuses to overwrite either file. If one file exists without the
other, restore the missing backup. Never create a replacement key after Play
enrollment.

Back up both files in an encrypted password manager or offline vault before
uploading any bundle. Loss of the upload key requires the Play Console upload
key reset process; loss of the passwords prevents local signing.

## 3. Load signing values into the current shell

```powershell
Get-Content .env.android.local | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
```

Do not print the variables. Gradle reads only `ARU_KEYSTORE_PATH`,
`ARU_KEYSTORE_PASSWORD`, `ARU_KEY_ALIAS`, and `ARU_KEY_PASSWORD`. A release
artifact task fails with the missing variable names when any is absent; debug
and lint tasks do not need signing secrets.

## 4. Build signed artifacts

Set the JDK/SDK variables, then run:

```powershell
android\gradlew.bat -p android clean bundleRelease assembleRelease --warning-mode all
```

After dependencies have been cached, verify reproducibility without network:

```powershell
android\gradlew.bat -p android clean bundleRelease assembleRelease --offline --warning-mode all
```

Outputs are ignored by Git:

- `android/app/build/outputs/bundle/release/app-release.aab`
- `android/app/build/outputs/apk/release/app-release.apk`

## 5. Verify the outputs

Use the matching Build Tools and the current official
[bundletool](https://developer.android.com/tools/bundletool):

```powershell
java -jar bundletool-all-1.18.3.jar validate --bundle=android/app/build/outputs/bundle/release/app-release.aab
java -jar bundletool-all-1.18.3.jar dump manifest --bundle=android/app/build/outputs/bundle/release/app-release.aab --module=base
aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk
apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```

Require package `com.seonkistall.aru`, version `1.1.0 (11000)`, min SDK 23,
target SDK 36, launch URL `https://aru-beauty.vercel.app/`, and SHA-256
certificate fingerprint matching both Digital Asset Links files. Only the
AndroidX dynamic-receiver protection permission is expected in the merged
manifest; storage, media, location, microphone, contacts, and advertising ID
permissions are release blockers.

The upload certificate is intentionally self-signed and the AAB has no public
CA chain or timestamp. Google Play validates the upload key and re-signs served
artifacts with the Play App Signing key. APK v2 verification must pass; v1 is
also retained because min SDK 23 predates v2-only installation support.

## 6. Version and association updates

For each release:

1. Update `package.json` version and `android/twa-manifest.json` `appVersion`
   together.
2. Increment `appVersionCode`; never reuse a code uploaded to Play.
3. Run `npm run android:check` and the Android configuration tests.
4. Rebuild and record new hashes.
5. After Play App Signing enrollment, append the Play distribution certificate
   fingerprint to `ARU_ANDROID_CERT_FINGERPRINTS`, regenerate
   `public/.well-known/assetlinks.json`, redeploy, and verify HTTP 200 before
   device TWA QA.

Bubblewrap `update` regenerates Android sources. It may restore API 35,
`jcenter()`, localhost generation inputs, or remove environment-only signing.
After any regeneration, review the Android diff and rerun all checks before
building.
