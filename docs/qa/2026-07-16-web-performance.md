# Web performance and mobile-browser QA — 2026-07-16

## Release under test

- Commit: `d687e8b` (`fix: close mobile browser QA regressions`)
- Runtime: Next.js 16.2.9 production build on local HTTP
- Browser: Playwright Chromium 145, headless shell revision 1208
- Viewport: 390 × 844
- Network profile: Fast 4G, 150 ms latency, 1.6 Mbps down, 750 Kbps up
- Camera automation: Chromium fake camera and granted camera permission. This is
  browser regression evidence, not physical-device evidence.

## Browser matrix

The routes `/`, `/scan`, `/survey`, `/report`, `/care`, `/privacy`,
`/unsubscribe`, and `/qa-not-found` were checked in Korean, English, Japanese,
and Chinese: 32 route/locale combinations.

- No horizontal overflow was found.
- No visible interactive element lacked an accessible name.
- All expected 200 routes had no console error or failed request.
- A report without local session data redirected to `/survey` as designed.
- The deliberate `/qa-not-found` navigation returned a real 404 and rendered
  the ARU not-found page. Chromium reports the expected document 404 in its
  console; this is not an application exception.
- KO and EN Home were inspected after the font fix at 390 × 844. Both had zero
  targets below 44 × 44 and no horizontal overflow.

## Reproduced defects and fixes

| Defect | Evidence before | Fix | Evidence after |
|---|---|---|---|
| Service worker replaced online 404/5xx pages with the Korean offline document and a 200 response | `/qa-not-found` displayed the offline page while online | Navigation fallback now runs only when the network fetch rejects | `/qa-not-found` returns 404 and the ARU not-found UI |
| Survey chips were 41 px high | 37 undersized targets on `/survey` | Applied the shared 44 px tap minimum | 0 undersized targets |
| Scan survey-only link was 20 px high | One 266 × 20 target on `/scan` | Made the link a full-width 44 px inline-flex target | 0 undersized targets |
| Unsubscribe Home link was narrower than 44 px | 41–43 px wide by locale | Applied the shared 44 px minimum width | 0 undersized targets |
| Korean display-font subsets rewrapped the hero during slow loading | Home CLS 0.1048 cold and 0.121 repeat; traced layout-shift sources named the hero, tagline and CTA | Added a 78% metric-adjusted local fallback and explicit display line heights | Home CLS 0.0251 cold and 0.0103 repeat |

## Fast 4G measurements

Values are observed browser timings, not lab-score estimates. This release is
the first recorded performance baseline, so later releases should compare
against it; no claim is made about an earlier unrecorded release.

| Page/run | TTFB | FCP | LCP | CLS | Load | Requests | Transfer | JS | CSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Home cold, after fix | 57 ms | 1,340 ms | 1,340 ms | 0.0251 | 4,679 ms | 48 | 901,801 B | 259,363 B | 35,062 B |
| Home repeat, after fix | 5 ms | 52 ms | 52 ms | 0.0103 | 81 ms | 48 | 35,243 B | 0 B | 0 B |
| Scan cold shell | 3 ms | 1,232 ms | 1,232 ms | 0.0574 | 4,463 ms | 40 | 832,268 B | 252,171 B | 34,977 B |
| Scan repeat shell | 4 ms | 68 ms | 68 ms | 0.0008 | 57 ms | 47 | 50,064 B | 0 B | 0 B |

### Budget result

| Budget | Result |
|---|---|
| FCP < 1.8 s | PASS — 1.34 s Home cold |
| LCP < 2.5 s | PASS — 1.34 s Home cold |
| CLS < 0.1 | PASS — 0.0251 Home cold |
| JavaScript < 500 KB | PASS — 259 KB Home cold |
| CSS < 100 KB | PASS — 35 KB Home cold |
| Total initial transfer < 2 MB | PASS — 0.90 MB Home cold |
| Requests ≤ 50 | PASS — 48 Home cold |

## MediaPipe cache and offline evidence

After one controlled Scan load, service-worker cache `aru-mediapipe-v1`
contained only these same-origin assets:

| Asset | Cached response bytes | Offline fetch |
|---|---:|---|
| `/vendor/mediapipe/face_landmarker.task` | 3,758,596 | 200 |
| `/vendor/mediapipe/wasm/vision_wasm_internal.js` | 322,044 | 200 |
| `/vendor/mediapipe/wasm/vision_wasm_internal.wasm` | 11,153,617 | 200 |

The browser was switched fully offline before refetching each asset. All three
responses were served successfully with their original byte size. Resource
Timing reports `transferSize: 0` for service-worker-controlled responses, so it
is not used as evidence that the first network download was free. API paths are
excluded from the worker cache by contract and regression test.

## Remaining physical-device gate

The owner previously reported permission, front-camera mirroring, quality gate,
capture, and retake as passing on a Galaxy S25 Edge running Android 16 and One
UI 8.5. The current commit still needs a physical post-deploy run for
skin-region guide placement, automatic and manual capture separately,
background/foreground recovery, and rotation recovery. Synthetic Chromium
testing cannot close that release gate.
