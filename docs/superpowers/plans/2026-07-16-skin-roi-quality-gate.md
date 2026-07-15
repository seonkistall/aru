# Skin ROI Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require measurable, well-exposed, low-glare, sharp T-zone and cheek regions before ARU captures or accepts a skin scan.

**Architecture:** Add one pure pixel-analysis module beside the existing camera helpers. The scan controller derives source-frame ROI rectangles from the existing landmark groups, evaluates them during live preview and captured-frame verification, and folds the result into the existing gate without changing MediaPipe or skin scoring.

**Tech Stack:** Next.js 16, React 19, TypeScript, MediaPipe FaceLandmarker, Vitest.

## Global Constraints

- Face detection remains mandatory for framing and ROI location.
- T-zone, left cheek, and right cheek must all be measurable.
- No browser autofocus control, per-device tables, new camera modes, recommendation changes, persistence, or transmission.
- Corrective copy is limited to skin-region alignment, dark exposure, glare, and soft detail in Korean and English.
- Preview and captured-frame verification use the same pure evaluator.
- Implementation follows red-green-refactor and preserves `npm run smoke`.

---

### Task 1: Pure Skin ROI Evaluator

**Files:**
- Create: `app/scan/skin-roi-quality.ts`
- Create: `tests/skin-roi-quality.test.ts`

**Interfaces:**
- Consumes: `ImageData`, normalized source-frame rectangles, exposure thresholds.
- Produces: `evaluateSkinRoiQuality(image, regions, thresholds): SkinRoiQualityResult` and `skinRoiRegionsFromLandmarks(landmarks): SkinRoiRegions | null`.

- [ ] **Step 1: Write failing tests for a valid frame and fail-closed regions**

Create deterministic synthetic `ImageData` fixtures. Assert that three checker-textured, mid-luminance regions pass and that missing, clipped-to-zero, or smaller-than-eight-pixel regions return `{ passed: false, reason: "regions" }`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/skin-roi-quality.test.ts`
Expected: FAIL because `app/scan/skin-roi-quality.ts` does not exist.

- [ ] **Step 3: Implement region mapping and bounded pixel iteration**

Define normalized rectangles in source-video coordinates, clamp them to image bounds, require at least eight pixels on both axes, and calculate luminance, dark ratio, hot ratio, and adjacent-pixel luma difference without allocating per-pixel arrays.

- [ ] **Step 4: Add failing dark, glare, blur, and precedence tests**

Assert reason order `regions -> dark -> glare -> soft`, including one failing cheek while the other two pass. Use a uniform mid-gray fixture for `soft` and clipped near-white pixels for `glare`.

- [ ] **Step 5: Implement the minimum evaluator**

Return aggregate booleans `regionsReady`, `exposure`, `noGlare`, `sharp`, `passed` and stable reason. Use conservative constants backed by fixtures; reject non-finite statistics.

- [ ] **Step 6: Run focused tests and commit GREEN**

Run: `npm test -- tests/skin-roi-quality.test.ts`
Expected: PASS.

Commit: `feat: add skin ROI quality evaluator`

---

### Task 2: Gate Contract and User Guidance

**Files:**
- Modify: `app/scan/camera-quality.ts`
- Modify: `app/scan/types.ts`
- Modify: `app/scan/guide.tsx`
- Modify: `lib/i18n/en.ts`
- Modify: `tests/camera-quality.test.ts`

**Interfaces:**
- Consumes: `SkinRoiQualityResult` from Task 1.
- Produces: a `skinReady` requirement on `CaptureGateQuality` and Quality UI flags for region exposure, glare, and sharpness.

- [ ] **Step 1: Write a failing combined-gate test**

Extend the existing valid quality fixture with `skinReady: true`; assert `scanCaptureReady` rejects the identical fixture when `skinReady` is false.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/camera-quality.test.ts`
Expected: FAIL because the gate ignores `skinReady`.

- [ ] **Step 3: Add the minimal gate field**

Require `skinReady` in `CaptureGateQuality`, `Quality`, `initialQuality`, and `captureGatePassed`. Update all existing fixtures explicitly so TypeScript exposes missed call sites.

- [ ] **Step 4: Add localized corrective messages**

Add Korean source keys and English translations for: align measurable skin regions, move toward soft frontal light, reduce direct glare, and clean the lens/hold still. Display skin readiness in `QualityPanel` without adding another dense chip row.

- [ ] **Step 5: Run focused tests and commit GREEN**

Run: `npm test -- tests/camera-quality.test.ts`
Expected: PASS.

Commit: `feat: require skin readiness for capture`

---

### Task 3: Live and Captured-Frame Integration

**Files:**
- Modify: `app/scan/page.tsx`
- Modify: `app/scan/skin-roi-quality.ts`
- Modify: `tests/skin-roi-quality.test.ts`

**Interfaces:**
- Consumes: MediaPipe landmarks, live/captured canvas `ImageData`, capture profile exposure thresholds.
- Produces: identical ROI decision behavior in live preview and final capture verification.

- [ ] **Step 1: Write a failing source-coordinate landmark test**

Assert that landmark-derived T-zone and cheek rectangles stay normalized, do not use mirrored overlay coordinates, and fail when a required landmark group is absent.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/skin-roi-quality.test.ts`
Expected: FAIL because source ROI derivation is not implemented.

- [ ] **Step 3: Implement source ROI derivation**

Reuse `SAMPLING_LANDMARKS`, split cheeks consistently, pad each bounds rectangle conservatively, and return source-normalized rectangles without `object-fit: cover` or mirroring transforms.

- [ ] **Step 4: Integrate one shared evaluation path**

In the live timer, sample the downscaled quality canvas and combine ROI results with face/distance/center/motion. In captured-frame verification, evaluate the captured canvas with the same helper before skin analysis. Map stable reasons to the four approved messages and include aggregate statistics in staff/debug metadata only.

- [ ] **Step 5: Verify focused and full unit tests**

Run: `npm test -- tests/skin-roi-quality.test.ts tests/camera-quality.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all test files PASS.

Commit: `feat: gate scans on measurable skin regions`

---

### Task 4: Product Smoke and Mobile Browser QA

**Files:**
- Modify only if a defect is reproduced: the smallest owning source file.
- Create for each behavioral fix: `tests/<bug-name>.regression-N.test.ts`.
- Update: `docs/mobile-camera-qa.md` only with supplied physical-device evidence.

**Interfaces:**
- Consumes: production build and the Galaxy S25 Edge evidence supplied by the user.
- Produces: verified smoke output, browser evidence, defect list, and follow-up physical retest checklist.

- [ ] **Step 1: Run the complete repository smoke suite**

Run: `npm run smoke`
Expected: lint, tests, build, route checks, and ML compilation all pass.

- [ ] **Step 2: Start the production build and run mobile viewport QA**

Run the built app locally, open `/`, `/scan`, `/survey`, `/report`, `/care`, `/privacy`, and `/unsubscribe` at 360x800 and 412x915 viewports, and check console errors, navigation, overflow, loading/error states, and camera-denied fallback.

- [ ] **Step 3: Fix only reproducible product defects**

For each critical/high/medium defect: add a focused failing regression test, verify RED, apply the smallest owning-file fix, verify GREEN, and commit one defect per commit. Record low-severity or device-only observations without speculative code changes.

- [ ] **Step 4: Re-run smoke after all fixes**

Run: `npm run smoke`
Expected: PASS with no new warnings attributable to the change.

- [ ] **Step 5: Record physical evidence and define retest**

Record Galaxy S25 Edge / Android 16 / One UI 8.5 baseline passes without claiming ROI changes are physically verified. Request a retest under soft frontal light, dim light, direct glare, lens blur, and one-cheek obstruction after deployment.

Commit: `docs: record Galaxy camera QA baseline`

---

### Task 5: Final Review and Delivery

**Files:**
- Review all branch changes; no unrelated edits.

- [ ] **Step 1: Inspect diff and repository state**

Run: `git diff main...HEAD --check` and `git status --short`.
Expected: no whitespace errors and a clean worktree.

- [ ] **Step 2: Run final verification**

Run: `npm run smoke`.
Expected: PASS from a fresh final run.

- [ ] **Step 3: Summarize release evidence**

List implemented behavior, focused/full test counts, browser pages and viewports checked, fixed bugs with commit IDs, deferred improvements, and the required physical-device retest. Do not call the feature production-verified until that retest passes.
