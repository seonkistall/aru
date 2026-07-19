# iPhone Safari Camera Lifecycle Design

Date: 2026-07-20  
Repo: `seonkistall/aru`

## Goal

Prevent `/scan` from leaving an iPhone Safari user on a stale or black camera
preview after the tab is backgrounded, restored from the back-forward cache, or
the browser mutes or ends the video track.

## Approved Approach

Use an explicit-resume lifecycle:

1. Camera access still starts only from the existing user CTA.
2. While the preview or capture is active, listen for the document becoming
   hidden, `pagehide`, and video-track `mute` or `ended` events.
3. On interruption, cancel the in-progress capture, stop and detach the current
   stream, and show a calm recovery state.
4. The user explicitly taps `카메라 다시 켜기` to request a fresh stream.
5. Do not automatically reacquire the camera when the tab returns to the
   foreground.

This favors predictable Safari behavior, privacy, and user control over a
seamless-looking automatic restart that may race Safari's permission or media
activation state.

## Existing Behavior to Preserve

- The permission prompt is requested only after a user action.
- The front camera is preferred with `facingMode: "user"`.
- High-resolution constraints keep the existing safe fallback.
- The selfie preview remains mirrored while analysis uses the unmirrored source.
- `playsInline`, muted playback, and rejected `play()` recovery remain in place.
- Camera denial, camera busy, no-device, unsupported-browser, and questionnaire
  fallback states keep their existing behavior.
- Skin-region thresholds, capture modes, automatic-capture timing, consent, and
  analysis logic do not change.

## Architecture

`app/scan/camera-stream.ts` owns browser-independent stream lifecycle helpers.
It watches video tracks and reports the first unexpected `mute` or `ended`
event. It also keeps permission-denial errors terminal so fallback attempts do
not request the same denied permission twice.

`app/scan/use-capture-analysis.ts` exposes a small cancellation function. A
cancelled run stops setting capture states after its next asynchronous boundary,
so a background event cannot overwrite the recovery screen with a stale
`ready`, `noface`, or `result` state.

`app/scan/page.tsx` remains the UI orchestrator. It combines document lifecycle
events with stream-track events, releases the camera, transitions to an
`interrupted` phase, and renders localized recovery copy. The video element
also declares `autoPlay` alongside `playsInline` and `muted`.

## Copy

- Title: `카메라가 잠시 멈췄어요.`
- Description: `계속하려면 카메라를 다시 켜주세요.`
- Primary CTA: `카메라 다시 켜기`
- Secondary CTA: reuse `카메라 없이 설문으로 시작하기`

English, Japanese, and Simplified Chinese use short, polite, locally natural
equivalents and must fit the existing 320px minimum mobile layout.

## Verification

- Vitest first reproduces terminal permission handling and `mute`/`ended`
  observation.
- A source contract verifies capture cancellation is connected to the
  interruption path.
- Playwright WebKit runs with the iPhone 17 Pro device profile and verifies:
  inline/muted/autoplay metadata, background interruption, explicit restart,
  and no horizontal overflow in the recovery state.
- Run the focused tests, the complete Vitest suite, lint, production build,
  mobile UI suite, and full smoke suite.
- Run browser QA on the deployed production URL and record screenshots and
  console/network health.

## Physical-Device Gate

Automation does not mark a physical row passed. Current iOS Safari and the
previous supported iOS major remain pending until a real iPhone records:

- model, iOS version, and Safari version;
- first allow and deny flows;
- front-camera selection and mirrored preview;
- automatic and manual capture;
- background/foreground and `pagehide` recovery;
- portrait/landscape recovery;
- result, retake, and questionnaire fallback;
- `/scan?debug=1` video, track, and crop dimensions.

## Out of Scope

- Camera or skin-quality threshold tuning without physical-device evidence.
- Automatic foreground camera reacquisition.
- User-agent sniffing.
- Native iOS/App Store packaging.
- Claiming physical-device PASS from Playwright WebKit emulation.
