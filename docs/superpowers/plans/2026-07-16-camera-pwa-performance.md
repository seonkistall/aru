# ARU Camera, PWA, and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the proven camera behavior while sharing one same-origin MediaPipe path, making ARU installable and failure-safe as a PWA/TWA, and extracting scan orchestration behind characterized interfaces.

**Architecture:** The scan and evaluation harness consume the same asset factory; a minimal service worker owns only offline navigation fallback and versioned static assets. Scan refactoring proceeds from pure functions outward so each extraction is behavior-preserving and independently reversible.

**Tech Stack:** Next.js 16.2.9, React 19, MediaPipe Tasks Vision 0.10.35, Web Workers/WASM, Web App Manifest, service worker, Vitest.

## Global Constraints

- MediaPipe WASM and face-landmarker model URLs are same-origin on every route.
- No camera threshold changes without physical-device evidence.
- Service worker never caches API responses, report HTML, or user-specific page state.
- First use may require network; repeat scan assets may be served from a successful same-origin cache.
- Portrait orientation, 192/512 icons and maskable safe-zone icon are required.
- Pretendard remains the body/control font; Nanum Pen Script is self-hosted and used only for short Korean display text.

---

### Task 1: Make evaluation and scan use one MediaPipe factory

**Files:**
- Create: `app/scan/create-landmarker.ts`
- Modify: `app/scan/landmarker-config.ts`
- Modify: `app/scan/page.tsx`
- Modify: `app/eval/page.tsx`
- Modify: `app/scan/landmarker.worker.ts`
- Modify: `tests/mediapipe-assets.test.ts`
- Create: `tests/create-landmarker.test.ts`

**Interfaces:**
- Produces: `createVideoLandmarker(delegate: "GPU" | "CPU")` and `createImageLandmarker(delegate: "GPU" | "CPU")` using exported `WASM` and `MODEL` constants.

- [ ] **Step 1: Write failing shared-path tests**

```ts
for (const file of ["app/scan/page.tsx", "app/eval/page.tsx", "app/scan/landmarker.worker.ts"]) {
  const source = readFileSync(file, "utf8");
  expect(source).not.toContain("cdn.jsdelivr.net");
  expect(source).not.toContain("storage.googleapis.com/mediapipe-models");
}
expect(readFileSync("app/eval/page.tsx", "utf8")).toContain("createImageLandmarker");
```

- [ ] **Step 2: Run and confirm the deployed defect**

Run: `npm test -- tests/mediapipe-assets.test.ts tests/create-landmarker.test.ts`

Expected: FAIL because `/eval` still declares both remote URLs and the factory is missing.

- [ ] **Step 3: Implement the shared factory**

```ts
async function createLandmarker(runningMode: "VIDEO" | "IMAGE", delegate: "GPU" | "CPU") {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}
```

Keep the existing GPU→CPU recovery behavior in Scan; Eval may expose the selected delegate in staff-only output.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/mediapipe-assets.test.ts tests/create-landmarker.test.ts && npm run build`

Expected: no consumer code contains remote MediaPipe asset URLs and the build passes.

Commit: `fix: share same-origin MediaPipe runtime`

### Task 2: Install the production font and complete the manifest

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/manifest.ts`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/icon-maskable-512.png`
- Create: `tests/pwa-manifest.test.ts`
- Create: `tests/font-contract.test.ts`

**Interfaces:**
- Produces: `--font-hand-ko` and `--font-display` tokens; manifest `id`, `scope`, `orientation`, categories and PNG icons.

- [ ] **Step 1: Write failing manifest/font tests**

```ts
expect(manifest()).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", orientation: "portrait" });
expect(manifest().icons).toEqual(expect.arrayContaining([
  expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
  expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
  expect.objectContaining({ src: "/icon-maskable-512.png", purpose: "maskable" }),
]));
expect(readFileSync("app/globals.css", "utf8")).not.toMatch(/Segoe Print|Comic Sans/);
```

- [ ] **Step 2: Confirm failure**

Run: `npm test -- tests/pwa-manifest.test.ts tests/font-contract.test.ts`

Expected: FAIL on missing manifest fields/icons and system handwriting fallbacks.

- [ ] **Step 3: Self-host Nanum Pen Script**

Install `@fontsource/nanum-pen-script` at the current stable version, import its Korean CSS once in `app/layout.tsx`, and define:

```css
:root { --font-hand-ko: "Nanum Pen Script", var(--font-sans); }
html[lang="ko"] { --font-display: var(--font-hand-ko); }
html[lang="en"], html[lang="ja"], html[lang="zh-CN"] { --font-display: var(--font-sans); }
```

Replace display uses of `--font-hand` with `--font-display`; keep controls, prices and body copy on Pretendard. The installed package license remains in the dependency tree and no font is fetched at runtime.

- [ ] **Step 4: Generate deterministic PNG icons and manifest fields**

Render `app/icon.svg` into 192 and 512 PNGs, then create the maskable 512 image with the mark inside the central 80% safe zone on the ARU paper background. Add `lang: "ko"`, `categories: ["beauty", "lifestyle"]`, `orientation: "portrait"`, `id: "/"`, and `scope: "/"`.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/pwa-manifest.test.ts tests/font-contract.test.ts && npm run build`

Expected: icons exist with exact dimensions, manifest tests pass, and production CSS has no external font URL.

Commit: `feat: complete installable ARU manifest`

### Task 3: Add safe offline and service-worker behavior

**Files:**
- Create: `public/offline.html`
- Create: `public/sw.js`
- Create: `app/components/service-worker-registration.tsx`
- Modify: `app/layout.tsx`
- Create: `tests/service-worker.test.ts`
- Modify: `scripts/smoke-test.mjs`

**Interfaces:**
- Produces: cache names `aru-shell-v1` and `aru-mediapipe-v1`; registration at `/sw.js` with scope `/`.

- [ ] **Step 1: Write failing service-worker contract tests**

Require an install-time `/offline.html` precache, navigation fallback on fetch error/404/5xx, runtime caching only for `/vendor/mediapipe/`, exclusion of `/api/`, old-cache cleanup, and a mounted registration component.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/service-worker.test.ts`

Expected: FAIL because no service worker or fallback exists.

- [ ] **Step 3: Implement the minimal worker**

```js
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => (response.status === 404 || response.status >= 500) ? caches.match("/offline.html") : response).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/vendor/mediapipe/")) {
    event.respondWith(caches.open("aru-mediapipe-v1").then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
```

The registration component runs only in production-capable browsers, logs no user data, and calls `navigator.serviceWorker.register("/sw.js", { scope: "/" })` after `load`.

- [ ] **Step 4: Extend smoke and verify offline**

Add `/offline.html` and `/sw.js` status/content probes. In browser QA, visit Scan online once, switch network offline, reload `/scan`, and expect the branded 200 offline page rather than a browser error. Restore online, reopen Scan and expect MediaPipe assets from service-worker cache without caching `/api/analyze`.

- [ ] **Step 5: Commit**

Run: `npm test -- tests/service-worker.test.ts && npm run smoke`

Expected: full smoke passes and offline probes return 200.

Commit: `feat: add safe PWA offline fallback`

### Task 4: Extract scan orchestration in characterized seams

**Files:**
- Create: `app/scan/capture-analysis.ts`
- Create: `app/scan/use-landmarker.ts`
- Create: `app/scan/use-quality-loop.ts`
- Create: `app/scan/use-capture-analysis.ts`
- Modify: `app/scan/page.tsx`
- Create: `tests/capture-analysis.test.ts`
- Create: `tests/scan-orchestration-contract.test.ts`

**Interfaces:**
- Produces: `medianReads(reads)`, `captureGateDecision(input)`, `useLandmarker(options)`, `useQualityLoop(options)`, and `useCaptureAnalysis(options)`.
- Preserves: capture modes, exact consent authorization, GPU→CPU recovery, quality thresholds, automatic countdown, storage timing and survey fallback.

- [ ] **Step 1: Characterize pure capture behavior**

Move no code yet. Write fixtures for three-frame median fusion, invalid-landmark rejection, retake reasons, and `guideState !== "ready"` capture blocking based on current observable outputs.

- [ ] **Step 2: Extract pure helpers**

Run the characterization test and confirm it fails only because exports are missing. Move the existing calculations byte-for-byte into `capture-analysis.ts`, import them from the page, then run camera, ROI, geometry and capture tests.

- [ ] **Step 3: Extract landmarker lifecycle**

Move load/close/recovery refs and state behind `useLandmarker`. The hook returns `{ landmarkerRef, delegate, guideState, guideError, reload }`; it owns cleanup on unmount. Do not change timing constants or delegate fallback.

- [ ] **Step 4: Extract quality loop and capture analysis**

Move the self-scheduling detection timer into `useQualityLoop` and the burst/crop/optional-AI/persistence sequence into `useCaptureAnalysis`. Keep UI phase state in `page.tsx`. After each extraction, run:

`npm test -- tests/camera-quality.test.ts tests/camera-stream.test.ts tests/skin-roi-quality.test.ts tests/scan-geometry.test.ts tests/scan-consent-authorization.test.ts tests/capture-analysis.test.ts`

Expected: all pass after each seam; no threshold snapshot changes.

- [ ] **Step 5: Enforce the size and dependency contract**

`tests/scan-orchestration-contract.test.ts` requires `app/scan/page.tsx` to be below 800 physical lines and forbids direct `FilesetResolver` creation there. If a safe extraction cannot meet 800 lines, stop at the last green seam and document the remaining line count rather than rewriting behavior.

- [ ] **Step 6: Full verification and commit**

Run: `npm run smoke`

Expected: all tests, lint, build, ML compile and routes pass.

Commit each green seam separately:

- `refactor: extract capture analysis helpers`
- `refactor: extract landmarker lifecycle`
- `refactor: extract scan quality loop`
- `refactor: extract capture analysis flow`

### Task 5: Measure the production performance and camera regression

**Files:**
- Modify: `docs/mobile-camera-qa.md`
- Modify: `docs/production-release-checklist.md`
- Create: `docs/qa/2026-07-16-web-performance.md`

**Interfaces:**
- Produces: traceable browser and Galaxy evidence; no code change is accepted solely from a synthetic score.

- [ ] **Step 1: Run the production browser matrix**

At 390 × 844, run `/`, `/scan`, `/survey`, `/report`, `/care`, `/privacy`, `/unsubscribe`, 404 in KO/EN/JA/ZH. Capture console errors, failed requests, horizontal overflow, tap target failures and before/after screenshots.

- [ ] **Step 2: Measure cold and repeat loads**

Record navigation timing, transfer size, FCP/LCP/CLS and MediaPipe asset cache source for Home and Scan under Fast 4G and repeat-load conditions. Acceptance: no Core Web Vital regression from the baseline, and repeat Scan does not retransfer successful MediaPipe model/WASM assets.

- [ ] **Step 3: Re-run Galaxy S25 Edge browser QA**

Verify permission, mirroring, skin-region guide, automatic and manual capture, quality rejection, result, retake, background/foreground and rotation recovery. Record Android 16/One UI 8.5 and exact deployed commit.

- [ ] **Step 4: Commit evidence**

Commit: `docs: record web and camera release evidence`
