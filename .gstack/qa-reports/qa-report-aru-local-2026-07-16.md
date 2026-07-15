# ARU Product QA Report

- Date: 2026-07-16
- Build: branch `feat/skin-roi-quality-gate`
- Framework: Next.js 16.2.9 / React 19.2.4
- Automated viewports: 360x800 and 412x915
- Physical baseline supplied by user: Galaxy S25 Edge, Android 16, One UI 8.5

## Outcome

Health score: 98/100. No reproducible critical, high, or medium defects were found in the tested flows. The new skin-ROI algorithm is covered by deterministic tests but remains pending a post-deploy physical-device retest.

## Verification

- `npm run smoke`: PASS
- ESLint: PASS
- Vitest: 32 files, 152 tests PASS
- Production build and TypeScript: PASS
- ML Python compilation: PASS
- Route/authentication smoke: PASS
- Home at 360px: PASS, meaningful content and CTA visible
- Scan entry at 360px: PASS
- Camera unavailable/permission fallback: PASS, retry and survey fallback visible
- Survey selection and submit at 412px: PASS
- Report analysis/recommendation/routine tabs at 412px: PASS
- Care page at 412px: PASS
- Privacy empty state: PASS
- Unsubscribe missing-token state: PASS
- Browser console/page errors during tested flows: none reported

## Physical Evidence

The user verified the pre-ROI camera flow on Galaxy S25 Edge / Android 16 / One UI 8.5: permission prompt, front camera, mirroring, quality gate, capture, and retake all passed. This is a baseline only; it does not prove the new ROI thresholds on the device.

## Fixed in This Branch

1. Face detection alone no longer makes a frame capture-ready.
2. T-zone and both cheek regions must be measurable.
3. Skin-region exposure, glare, and detail sharpness now gate live and final capture consistently.
4. Dark, glare, soft-detail, and alignment failures provide actionable Korean and English guidance.
5. ROI analysis iterates pixels in place without allocating per-region pixel arrays.

## Recommended Follow-ups

1. P0: Re-run Galaxy S25 Edge under soft frontal light, dim light, direct glare, smudged lens, and one-cheek obstruction; record `/scan?debug=1` ROI values.
2. P0: Run the same matrix on current iPhone Safari before calling the gate production-verified.
3. P1: Calibrate thresholds from consented aggregate quality metadata only after enough real-device samples exist; do not add per-device exceptions from one phone.
4. P1: Add a deterministic fake-camera browser fixture so the live overlay, countdown cancellation, and captured-frame rejection can run in CI.
5. P2: Revisit the quality-chip density at 360px during the physical ROI retest; combine region and clarity indicators if labels truncate.
6. Operational: Complete Resend domain/API-key setup and real unsubscribe delivery verification separately.

## Evidence Files

- `screenshots/aru-home-360.png`
- `screenshots/aru-scan-360.png`
- `screenshots/aru-camera-fallback-360.png`
- `screenshots/aru-report-412.png`
- `screenshots/aru-recommendations-412.png`
- `screenshots/aru-routine-412.png`
- `screenshots/aru-care-412.png`
