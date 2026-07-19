# iPhone Safari camera lifecycle QA — 2026-07-20

## Outcome

ARU now releases a stale Safari camera stream and presents an explicit,
localized restart state after background, `pagehide`, video-track `mute`, or
video-track `ended`. The scoped automated health score moved from 93/100 to
100/100 after three defects were closed.

This result is WebKit engine/profile evidence. Current and previous-major
physical iPhone Safari rows remain `PENDING DEVICE VERIFICATION`.

## Release under test

- Branch: `codex/ios-safari-camera-lifecycle`
- Code commit: `4313bb1`
- Framework: Next.js 16.2.9 / React 19.2.4
- Playwright: 1.61.1
- Safari engine proxy: WebKit 26.5, build `webkit-2311`
- Device profile: Playwright `iPhone 17 Pro`
- Emulated user agent: iPhone OS 18.7 / Safari 26.5
- CSS viewport: 402 × 681, device scale factor 3

## Implemented behavior

- `NotAllowedError` and `SecurityError` are terminal; permission denial no
  longer triggers the same fallback request twice.
- Camera video tracks report the first `mute` or `ended` interruption and remove
  listeners during cleanup.
- Hidden `visibilitychange` and `pagehide` cancel any active capture run,
  detach `video.srcObject`, stop tracks and quality sampling, and move to the
  recovery state.
- Camera restart happens only after the user taps the CTA.
- The video contract explicitly includes `autoPlay`, `playsInline`, and `muted`.
- Recovery copy is authored separately for Korean, English, Japanese, and
  Simplified Chinese.

The approach follows Apple's inline video guidance, WebKit's recommendation to
listen for capture-track mute state, and the W3C MediaStream lifecycle:
[Apple video guidance](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari),
[WebKit media capture](https://webkit.org/blog/7763/a-closer-look-into-webrtc/),
[W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/).

## Defects found and fixed

| ID | Severity | Finding | Fix | Verification |
|---|---|---|---|---|
| IOS-CAMERA-001 | High | Safari `mute`/`ended` or background could leave a stale stream with no explicit recovery state | One-shot track observer, document lifecycle handling, stream detach/stop, explicit restart | Vitest plus WebKit background/track/pagehide cases |
| IOS-CAMERA-002 | Medium | A denied permission request was retried through the resolution fallback | Treat permission/security errors as terminal | `camera-stream.test.ts` verifies one request |
| IOS-CAMERA-003 | Medium | First recovery screenshot showed the restart button and questionnaire link overlapping | Recovery actions now use a centered column layout | Bounding-box separation assertion and inspected after screenshot |

No threshold, capture timing, consent, crop, mirroring, or model behavior changed.

## Verification results

| Gate | Result |
|---|---|
| Focused camera/unit contracts | PASS |
| Vitest | PASS — 58 files, 290 tests |
| ESLint | PASS — 0 errors; 2 pre-existing `lib/care.ts` warnings |
| Next.js production build / TypeScript | PASS |
| Playwright Chromium mobile | PASS — 41 cases |
| Playwright WebKit iPhone profile | PASS — 5 cases |
| KO/EN/JA/ZH recovery copy | PASS |
| Background → explicit restart | PASS |
| Track `mute`, `ended`, `pagehide` | PASS |
| Restart target ≥44px | PASS |
| Recovery action overlap | PASS |
| Horizontal overflow | PASS |
| Browser console/page errors in WebKit cases | 0 |
| Full `npm run smoke` | PASS |
| ML Python compile | PASS |
| Route/auth smoke | PASS |

MediaPipe emitted its expected native XNNPACK/OpenGL diagnostic warnings while
the model initialized; no application console error or page exception occurred.

## Screenshot evidence

- Before interruption:
  `.gstack/qa-reports/screenshots/2026-07-20-ios-safari-camera-ready.png`
- After interruption and layout fix:
  `.gstack/qa-reports/screenshots/2026-07-20-ios-safari-camera-interrupted.png`

Both screenshots were visually inspected. The recovery title, description,
restart CTA, and questionnaire fallback remain inside the iPhone profile
viewport; the two actions do not overlap.

## Remaining physical-device gate

Run both a current iOS Safari device and a previous supported iOS major. Record:

1. iPhone model, iOS version, Safari version, date, and deployed merge SHA.
2. First permission allow, first denial, retry, Safari Settings reset.
3. Actual front-camera selection and natural mirrored preview.
4. `/scan?debug=1` requested profile, video size, track settings, and crop sizes.
5. Automatic and manual capture under soft frontal light.
6. Dim light, glare, lens smudge, glasses, hair and cheek obstruction rejection.
7. Background/foreground, Safari camera pause, page restore and explicit restart.
8. Portrait/landscape recovery, result, retake, and questionnaire fallback.

Do not replace these checks with this WebKit result and do not mark either
iPhone matrix row passed until the physical evidence is recorded.

## PR summary

QA found 3 iPhone Safari camera issues, fixed 3, and moved the scoped automated
health score from 93 to 100; physical iPhone verification remains pending.
