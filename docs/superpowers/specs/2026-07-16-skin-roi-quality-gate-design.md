# Skin ROI Quality Gate Design

Date: 2026-07-16
Repository: `seonkistall/aru`

## Goal

Improve ARU capture quality by judging whether the visible skin regions are usable, rather than treating a detected face as sufficient evidence. Face landmarks remain the safety boundary for framing and for locating the skin regions.

The initial physical-device baseline is a Galaxy S25 Edge running Android 16 and One UI 8.5. Permission, front-camera selection, mirroring, the existing quality gate, capture, and retake all passed on that device.

## Scope

The capture gate will evaluate three landmark-derived regions of interest (ROIs): the T-zone, left cheek, and right cheek. Each ROI must be present and large enough to measure. The gate will assess:

- usable brightness and limited dark-pixel coverage;
- limited clipped-highlight and glare coverage;
- sufficient image sharpness for texture reads.

Face presence, distance, centering, and steadiness remain in place. This change does not request browser-level manual focus, replace MediaPipe, alter the skin scoring model, or make medical claims.

## Architecture

A pure camera-quality helper will accept pixel data plus the three guide-zone rectangles and return one aggregate skin-ROI result. The result includes pass/fail flags for exposure, glare, and sharpness, together with the first actionable failure reason. It must not depend on React state, DOM elements, or MediaPipe internals.

The scan orchestrator will continue to calculate landmarks and guide zones. It will pass the current frame and zones to the helper, then combine the skin-ROI result with the existing face, distance, centering, and motion checks. Existing whole-face exposure statistics may remain for diagnostics, but they cannot override a failed or unmeasurable skin ROI.

Thresholds will start conservatively so the verified Galaxy flow does not become unnecessarily strict. All three ROIs must be measurable, while aggregate statistics may tolerate small natural differences between cheeks and T-zone. Mode-specific threshold tuning is outside this first change unless an existing capture profile already supplies the relevant value.

## User Guidance

The UI will retain the face outline because it tells the user where the skin regions can be sampled. Quality copy will shift from face-centric success language toward skin readiness.

Only three new corrective messages are added:

1. Skin region too dark: move toward soft, frontal light.
2. Skin glare too strong: reduce direct light or visible shine.
3. Skin detail too soft: clean the lens and hold still briefly.

Messages must be available in the existing Korean and English localization paths. The first failing condition determines the displayed message so guidance does not flicker between several simultaneous causes.

## Data Flow

1. MediaPipe detects one face and supplies landmarks.
2. Existing guide-zone geometry derives T-zone and cheek rectangles.
3. Normalized landmark rectangles are clamped to frame bounds and mapped directly to source-video pixels, independent of the mirrored display coordinates.
4. The current video frame is sampled only inside those rectangles.
5. The pure helper returns ROI exposure, glare, and sharpness decisions.
6. The scan page combines those decisions with face, distance, centering, and steadiness.
7. Auto-capture and manual capture remain disabled until the combined gate passes.
8. Captured-frame verification repeats the same ROI checks before analysis, preventing a transient good preview from accepting a bad final frame.

No new image is persisted or transmitted by this quality check.

## Error Handling

- Missing, clipped, or zero-area ROI rectangles fail closed and prompt the user to realign.
- Very small frames fail the sharpness measurement rather than generating unstable scores.
- Unsupported or unavailable pixel sampling follows the existing camera error path; it does not silently bypass the gate.
- Numeric results are clamped and validated so invalid values cannot enable capture.

## Testing

Test-driven implementation will begin with failing unit tests for:

- a well-lit, sharp three-ROI frame passing;
- any missing or undersized ROI failing closed;
- a dark cheek or T-zone producing the lighting reason;
- clipped highlights or strong glare producing the glare reason;
- blurred skin detail producing the sharpness reason;
- failure precedence remaining stable when several checks fail;
- the combined capture gate requiring the skin-ROI result;
- captured-frame verification using the same gate as the live preview.

After focused tests pass, verification requires the complete `npm run smoke` suite and browser smoke at a mobile viewport. Physical-device regression then repeats the Galaxy S25 Edge happy path and, when available, iPhone Safari. Automated checks cannot mark those physical rows as passed.

## Success Criteria

- Face landmarks locate skin but do not alone make capture ready.
- T-zone and both cheek ROIs must be measurable and meet exposure, glare, and sharpness requirements.
- Auto-capture cancels immediately when a skin ROI becomes unusable.
- The final captured frame is rejected when it fails the same ROI rules.
- Korean and English guidance names the corrective skin-quality action.
- Existing camera lifecycle and full smoke tests remain green.
- The Galaxy S25 Edge retest completes without a material increase in false rejection under soft frontal light.

## Out of Scope

- Browser or hardware autofocus control.
- Per-device threshold tables.
- New camera modes or a visual redesign.
- Changes to product recommendation scoring.
- Diagnosis, disease detection, or treatment advice.
