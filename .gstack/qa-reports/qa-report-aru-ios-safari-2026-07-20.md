# ARU iPhone Safari Camera QA Report

- Date: 2026-07-20
- Branch: `codex/ios-safari-camera-lifecycle`
- Code commit: `3149a5d`
- Framework: Next.js 16.2.9 / React 19.2.4
- Browser: Playwright 1.61.1 WebKit 26.5 (`webkit-2311`)
- Device profile: iPhone 17 Pro, iPhone OS 18.7 user agent,
  402 x 681 CSS viewport, device scale factor 3

## Outcome

Scoped health score: 100/100. Four reproducible issues were fixed:

1. Safari background, track `mute` and `ended` had no explicit stale-stream recovery.
2. Permission denial was retried through the camera resolution fallback.
3. The first recovery UI screenshot showed overlapping actions.
4. A capture callback refresh could cancel an active capture without a Safari interruption.

## Final verification

- Vitest: 58 files, 290 tests PASS
- Playwright Chromium mobile: 41 PASS
- Playwright WebKit iPhone profile: 5 PASS
- KO/EN/JA/ZH recovery copy: PASS
- `visibilitychange`, `mute`, `ended`, `pagehide`: PASS
- Explicit camera restart with no automatic foreground reacquisition: PASS
- Horizontal overflow: none
- Restart target: at least 44px
- Console/page errors: none
- Production build, ML compile, route/auth smoke: PASS

## Evidence

- `screenshots/2026-07-20-ios-safari-camera-ready.png`
- `screenshots/2026-07-20-ios-safari-camera-interrupted.png`

Both screenshots were inspected. The post-fix actions are vertically separated
and stay inside the iPhone profile viewport.

## Deferred external verification

Current and previous-major physical iPhone Safari rows remain pending. Real
hardware must record the native permission sheet, front lens, mirroring,
quality gates, capture, rotation, background/resume, retake and debug
video/track/crop sizes.

## PR summary

QA found 4 issues, fixed 4, health score 100/100; physical iPhone verification
remains pending.
