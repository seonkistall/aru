# iPhone Safari Camera Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/scan` recover predictably from iPhone Safari camera interruptions without changing camera-quality thresholds or Android behavior.

**Architecture:** Keep stream event primitives in `camera-stream.ts`, add cancellability to the existing capture hook, and let `page.tsx` orchestrate browser lifecycle events and the explicit recovery UI. Verify behavior with Vitest and a dedicated Playwright WebKit iPhone profile before full smoke and deployment.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript 5, Vitest 4.1.9, Playwright 1.61.1 WebKit.

## Global Constraints

- Do not change skin ROI, exposure, distance, centering, or movement thresholds.
- Do not automatically reacquire a camera after foreground return.
- Camera access must still begin from a user click.
- Keep `facingMode: "user"`, high-resolution fallback, mirrored preview, consent, and capture behavior.
- Do not mark physical iPhone QA passed from automated WebKit results.
- New recovery copy must be localized in Korean, English, Japanese, and Simplified Chinese and fit at 320px.

---

### Task 1: Characterize Safari stream interruption

**Files:**
- Modify: `tests/camera-stream.test.ts`
- Modify: `app/scan/camera-stream.ts`

**Interfaces:**
- Produces: `CameraInterruptionReason = "muted" | "ended"`.
- Produces: `watchCameraStream(stream, onInterrupted): () => void`.
- Preserves: `openCamera()` and `stopMediaStream()`.

- [ ] **Step 1: Write failing stream tests**

Add tests that dispatch `mute` and `ended` on fake video tracks, expect only the
first interruption to be reported, and expect cleanup to remove listeners. Add
a permission test using:

```ts
const denied = new DOMException("denied", "NotAllowedError");
const get = vi.fn().mockRejectedValue(denied);
await expect(openCamera(get)).rejects.toBe(denied);
expect(get).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/camera-stream.test.ts`
Expected: FAIL because `watchCameraStream` is not exported and permission denial
currently triggers the fallback attempt.

- [ ] **Step 3: Add the minimal stream lifecycle helpers**

Implement terminal permission errors and one-shot video-track observation:

```ts
export type CameraInterruptionReason = "muted" | "ended";

export function watchCameraStream(
  stream: MediaStream,
  onInterrupted: (reason: CameraInterruptionReason) => void,
) {
  let active = true;
  const listeners = stream.getVideoTracks().flatMap((track) => {
    const onMute = () => {
      if (!active) return;
      active = false;
      onInterrupted("muted");
    };
    const onEnded = () => {
      if (!active) return;
      active = false;
      onInterrupted("ended");
    };
    track.addEventListener("mute", onMute);
    track.addEventListener("ended", onEnded);
    return [{ track, type: "mute", listener: onMute }, { track, type: "ended", listener: onEnded }] as const;
  });
  return () => {
    active = false;
    listeners.forEach(({ track, type, listener }) => track.removeEventListener(type, listener));
  };
}
```

Keep `NotAllowedError` and `SecurityError` terminal in `openCamera`; retain the
existing fallback for other failures.

- [ ] **Step 4: Verify and commit the primitive**

Run: `npm test -- tests/camera-stream.test.ts tests/camera-quality.test.ts`
Expected: PASS.

Commit: `fix: observe Safari camera interruptions`

---

### Task 2: Cancel interrupted capture and render recovery

**Files:**
- Modify: `tests/scan-orchestration-contract.test.ts`
- Modify: `app/scan/use-capture-analysis.ts`
- Modify: `app/scan/page.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/ja.ts`
- Modify: `lib/i18n/zh.ts`

**Interfaces:**
- Consumes: `watchCameraStream()`.
- Produces: `useCaptureAnalysis()` result `{ capture, cancelCapture }`.
- Produces: scan phase `"interrupted"`.

- [ ] **Step 1: Write a failing orchestration contract**

Require the capture hook to expose `cancelCapture`, the scan page to call it
from its camera interruption path, and the video element to contain `autoPlay`,
`playsInline`, and `muted`.

- [ ] **Step 2: Run and confirm the contract fails**

Run: `npm test -- tests/scan-orchestration-contract.test.ts`
Expected: FAIL because the hook currently returns only `capture` and no
interruption path exists.

- [ ] **Step 3: Add capture-run cancellation**

Use a monotonically increasing run id:

```ts
const captureRunRef = useRef(0);
const cancelCapture = useCallback(() => {
  captureRunRef.current += 1;
}, []);
```

At capture start, save the current run id. After every asynchronous boundary,
return without setting UI or result state if the id changed. In the outer catch,
return silently when cancelled. Continue clearing `captureLockRef` in `finally`.
Return `{ capture, cancelCapture }`.

- [ ] **Step 4: Add the explicit Safari recovery lifecycle**

Track the current phase in a ref. While phase is `ready` or `analyzing`, attach
`watchCameraStream`. On hidden `visibilitychange`, `pagehide`, `mute`, or
`ended`, call `cancelCapture()`, detach `video.srcObject`, stop all tracks and
the quality loop, then set phase to `interrupted`.

Render the approved copy and reuse the questionnaire fallback. Add `autoPlay`
to the video element. Add these translations:

```text
EN: The camera paused for a moment. / Turn it back on when you're ready to continue. / Turn camera back on
JA: カメラが一時停止しました。 / 続けるには、もう一度カメラをオンにしてください。 / カメラをもう一度オンにする
ZH: 摄像头暂时停用了。 / 想继续的话，请重新打开摄像头。 / 重新打开摄像头
```

- [ ] **Step 5: Verify focused behavior and commit**

Run: `npm test -- tests/camera-stream.test.ts tests/camera-quality.test.ts tests/scan-orchestration-contract.test.ts tests/capture-analysis.test.ts`
Expected: PASS.

Commit: `fix: recover iPhone Safari camera sessions`

---

### Task 3: Add an iPhone WebKit regression suite

**Files:**
- Create: `playwright.ios.config.ts`
- Create: `tests/e2e/ios-safari-camera.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run test:ios-safari`.
- Uses: Playwright `devices["iPhone 17 Pro"]` and `browserName: "webkit"`.

- [ ] **Step 1: Add the failing WebKit test**

Mock `getUserMedia` with a real empty `MediaStream`, stub `play()`, and expose a
test-only function that changes `document.hidden` and dispatches
`visibilitychange`. Assert:

```ts
expect(await page.locator("video").evaluate((video) => ({
  autoPlay: video.autoplay,
  playsInline: video.playsInline,
  muted: video.muted,
}))).toEqual({ autoPlay: true, playsInline: true, muted: true });
```

After backgrounding, expect the three approved recovery strings, no horizontal
overflow, and a second `getUserMedia` call only after tapping the restart CTA.

- [ ] **Step 2: Install the matching WebKit runtime**

Run: `npx playwright install webkit`
Expected: Playwright 1.61.1 WebKit is installed.

- [ ] **Step 3: Run and verify the iPhone profile**

Run: `npm run test:ios-safari`
Expected: PASS under the iPhone 17 Pro WebKit project with no console errors.

- [ ] **Step 4: Commit the regression suite**

Commit: `test: add iPhone Safari camera lifecycle coverage`

---

### Task 4: Full QA, documentation, and release

**Files:**
- Modify: `docs/mobile-camera-qa.md`
- Create: `docs/qa/2026-07-20-ios-safari-camera.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: focused Vitest and WebKit evidence.
- Produces: traceable automated evidence and an explicitly pending physical
  iPhone matrix.

- [ ] **Step 1: Run full local verification**

Run:

```text
npm test
npm run lint
npm run build
npm run test:mobile-ui
npm run test:ios-safari
npm run smoke
```

Expected: every command passes.

- [ ] **Step 2: Run browser QA and inspect screenshots**

Exercise the local recovery state at iPhone dimensions, capture before/after
screenshots, inspect them, and record console errors, failed requests,
horizontal overflow, accessible names, and 44px tap targets.

- [ ] **Step 3: Update release documentation**

Record exact automated engine/profile, test counts, screenshots, remaining
physical-device steps, and keep both iPhone rows `PENDING DEVICE VERIFICATION`.
Add the new iPhone Safari test command and lifecycle behavior to README.

- [ ] **Step 4: Commit, push, review, and deploy**

Commit: `docs: record iPhone Safari camera QA`

Push the branch, open a PR, wait for required checks, merge, deploy the merged
main commit to Production, and run production route/API/asset plus recovery
canaries. Record the deployment URL and commit. Physical-device status remains
pending until real hardware evidence is supplied.
