# Signed Android artifact verification — 2026-07-16

## Source and toolchain

- Source commit: `429d6be` (`fix: rotate Android upload association`)
- Package: `com.seonkistall.aru`
- Version: `1.1.0` (`versionCode 11000`)
- JDK: Temurin 17.0.19
- Android platform/build tools: API 36 / 36.0.0
- ADB: 37.0.0
- Gradle / AGP: 8.11.1 / 8.9.1
- Bubblewrap: 1.24.1
- Bundletool: 1.18.3, SHA-256
  `A099CFA1543F55593BC2ED16A70A7C67FE54B1747BB7301F37FDFD6D91028E29`

The final release was rebuilt successfully with `--offline --warning-mode all`
after Maven Central dependencies were cached. No Gradle deprecation warning
remained.

## Artifact identity

| Artifact | Size | SHA-256 |
|---|---:|---|
| `app-release.aab` | 1,264,398 B | `9B5F637A7D340D192F48BF7B9B2DB4B79194CC26E407523A59D9EDD9FA2D96E7` |
| `app-release.apk` | 1,158,463 B | `12630801B89590F9BB833DF9B9C134D6FD7EF0439DFFEDFF4F39FB4C9AA1673F` |

The files remain ignored under `android/app/build/outputs/`; the hashes, not
the binaries, are committed.

## Manifest and TWA result

Bundletool 1.18.3 `validate` passed. Bundletool manifest dump and APK badging
both reported:

- package `com.seonkistall.aru`
- versionName `1.1.0`; versionCode `11000`
- compileSdk/targetSdk `36`; minSdk `23`
- application label `ARU 아루`; launcher label `ARU`
- launch URL `https://aru-beauty.vercel.app/`
- web manifest `https://aru-beauty.vercel.app/manifest.webmanifest`

The merged artifact declares only
`com.seonkistall.aru.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, an AndroidX
signature-level protection permission. It does not request camera, storage,
media library, location, microphone, contacts, advertising ID, or notification
permission. Camera permission remains a browser-origin prompt inside Chrome.

## Signature result

- Upload certificate: RSA 4096-bit
- Subject: `CN=ARU Upload, OU=Mobile, O=ARU, L=Seoul, ST=Seoul, C=KR`
- SHA-256: `03:BB:50:2D:02:E5:5B:A7:64:8C:20:3E:C2:00:06:49:74:EE:03:FE:80:C9:7B:10:1B:C5:15:99:54:99:60:2C`
- APK v1 verification: PASS
- APK v2 verification: PASS
- AAB JAR verification: `jar verified`
- The fingerprint matches `android/twa-manifest.json` and
  `public/.well-known/assetlinks.json`.

`jarsigner` warns that the upload certificate is self-signed, has no public
timestamp, and that AAB ZIP/POSIX metadata is interpreted differently by
`JarFile` and `JarInputStream`. These are not Play signing failures:
Bundletool validation passed, Gradle's `signReleaseBundle` passed, and the
certificate extracted from the AAB matches the published upload fingerprint.
Play will re-sign distributed APKs with its distribution certificate.

The earlier local preparation key was replaced before any Play Console
enrollment or artifact upload. Only the fingerprint and hashes in this
document are valid for the current upload-key backup and internal-test build.

## Gates not closed by artifact verification

- Back up `.env.android.local` and `android/aru-upload.jks` outside this machine.
- Deploy and validate `/.well-known/assetlinks.json` over production HTTPS.
- Add the Play App Signing distribution fingerprint after Console enrollment.
- Install the signed APK on the Galaxy S25 Edge and verify full-screen TWA,
  camera lifecycle, background/foreground, rotation, offline and return-online.
- Upload the AAB to Play internal testing and resolve Console/pre-launch policy
  warnings.
