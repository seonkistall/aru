# Camera Quality Upgrade Design

Date: 2026-07-07
Repo: `seonkistall/aru`

## Goal

Improve `/scan` capture quality so skin analysis receives sharper, higher-resolution input before considering a learned model upgrade. The work follows the agreed sequence:

1. Add camera quality diagnostics.
2. Request a higher-resolution front-camera stream with safe fallback.
3. Raise face crop quality for AI analysis and opt-in learning data.
4. Update the model path so later ML promotion can use the better capture source without overclaiming current model performance.

## Root-Cause Hypotheses

Current code requests `720x960` ideal video and caps face crop output at `384px` JPEG `0.82`. Even though ROI analysis uses the full captured frame, cloud analysis, opt-in learning data, and user confidence can degrade when the browser provides a low actual stream or the exported crop is too compressed.

The fix should measure actual device output instead of guessing:

- requested constraints
- actual `videoWidth x videoHeight`
- `MediaStreamTrack.getSettings()`
- face crop output dimensions and profile

## Implementation

- Add a small `app/scan/camera-quality.ts` module for testable scan-quality helpers.
- Use high-resolution constraints by default: front camera, `1080x1440` ideal, `30fps` ideal.
- Keep fallback safe: if high-res camera startup fails, retry with existing `720x960`.
- Keep live gating lightweight: the 360px exposure downscale remains unchanged.
- Split crop intent:
  - AI analysis crop: larger, sharper crop.
  - learning crop: also upgraded, but slightly more storage-aware.
  - model input crop: still `224x224` unless a real ONNX model is promoted.
- Add debug output only under `?debug=1`; normal users should not see technical diagnostics.

## Out of Scope

- No new dermatology claims.
- No immediate claim that model accuracy improved.
- No replacement of MediaPipe FaceLandmarker.
- No storage backend redesign.
- No UI redesign beyond debug fields.

## QA

- Unit tests for constraints, fallback selection, debug payload, crop sizing.
- Existing `npm run smoke`.
- Manual mobile QA should use `/scan?debug=1` and record actual video/track/crop sizes.

