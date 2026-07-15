# ARU Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden ARU's data, AI, consent, camera, product, scan, and email boundaries for a production deployment.

**Architecture:** Preserve anonymous local-first use while denying browser database access. Add small server-only validation/security modules and extract only testable scan responsibilities, keeping the React page as state and presentation owner.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase PostgreSQL/Storage, MediaPipe Tasks Vision, Vercel.

## Global Constraints

- No login or user-account feature.
- No skin-scoring or recommendation behavior changes.
- Public API errors contain no provider, secret, or database detail.
- Physical-device outcomes remain pending until run on real hardware.
- Every behavior change follows a failing-test-first cycle.
- Production DB migration, firewall configuration, secret provisioning, and deployment remain explicit release operations.

---

### Task 1: Deny browser database access

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `lib/store.ts`
- Modify: `scripts/supabase-check.mjs`
- Test: `tests/supabase-security.test.ts`

**Interfaces:**
- Produces: local-only `recordPurchase`, `getPurchases`, `recordCheckin`, `getCheckins`, and `recordCareIntent`.
- Produces: SQL enabling RLS and revoking anon/authenticated table access for every application table.

- [ ] Write a test that reads `schema.sql` and requires RLS plus privilege revocation for every table, and reads `lib/store.ts` to reject browser Supabase access.
- [ ] Run `npm test -- tests/supabase-security.test.ts` and confirm it fails on the commented RLS and direct client calls.
- [ ] Enable RLS, revoke privileges, and make consumer storage local-only with the smallest changes.
- [ ] Extend `supabase-check.mjs` to report the required production SQL state.
- [ ] Re-run the focused test and full test suite.

### Task 2: Bound public AI requests

**Files:**
- Create: `lib/server/request-guard.ts`
- Create: `lib/server/ai-input.ts`
- Modify: `app/api/analyze/route.ts`
- Modify: `app/api/reason/route.ts`
- Test: `tests/ai-input.test.ts`
- Test: `tests/request-guard.test.ts`

**Interfaces:**
- Produces: `readBoundedJson(request, maxBytes)`, `rateLimitRequest(request, namespace, policy)`, and `fetchWithTimeout(input, init, timeoutMs)`.
- Produces: `parseAnalyzeInput(value)` and `parseReasonInput(value)` discriminated validation results.

- [ ] Write tests for invalid JSON shapes, oversized decoded images, unsupported MIME, excessive items/strings, and rate-limit exhaustion.
- [ ] Run the focused tests and confirm missing-module failures.
- [ ] Implement minimal pure validators and bounded limiter.
- [ ] Integrate guards, stable error status codes, and provider timeouts into both routes.
- [ ] Run focused tests, route smoke checks, and the full suite.

### Task 3: Require exact pilot consent

**Files:**
- Create: `app/scan/consent-authorization.ts`
- Modify: `app/scan/page.tsx`
- Test: `tests/scan-consent-authorization.test.ts`

**Interfaces:**
- Produces: `resolveCaptureConsent(events, kind, uiGranted, scope)` returning the eligible consent event or `null`.

- [ ] Write regression tests proving unscoped grants work for consumers but never authorize a scoped pilot session.
- [ ] Run the test and confirm the helper is missing.
- [ ] Implement exact-scope authorization and replace the page fallback.
- [ ] Run focused and full tests.

### Task 4: Automate camera lifecycle QA

**Files:**
- Create: `app/scan/camera-stream.ts`
- Modify: `app/scan/page.tsx`
- Modify: `docs/mobile-camera-qa.md`
- Test: `tests/camera-stream.test.ts`

**Interfaces:**
- Produces: `openCamera(getUserMedia)` returning `{ stream, attempt }` and `stopMediaStream(stream)`.

- [ ] Write tests for high-resolution success, fallback success, double failure, and complete track cleanup.
- [ ] Run the test and confirm the module is missing.
- [ ] Implement the camera lifecycle helper and use it from the page.
- [ ] Add the physical-device release matrix with evidence fields and pending status.
- [ ] Run focused and full tests.

### Task 5: Serve MediaPipe from the application origin

**Files:**
- Modify: `app/scan/landmarker-config.ts`
- Modify: `app/scan/page.tsx`
- Create: `scripts/copy-mediapipe-assets.mjs`
- Modify: `package.json`
- Create: `public/vendor/mediapipe/NOTICE.md`
- Add: `public/vendor/mediapipe/wasm/*`
- Add: `public/vendor/mediapipe/face_landmarker.task`
- Test: `tests/mediapipe-assets.test.ts`

**Interfaces:**
- Produces: same-origin `WASM` and `MODEL` constants used by main thread and Worker.

- [ ] Write a test that rejects remote runtime URLs and requires all configured assets.
- [ ] Run it and confirm failure on current CDN URLs.
- [ ] Add the deterministic copy script, local model, attribution, shared config, and package lifecycle hook.
- [ ] Run asset test and production build.

### Task 6: Establish the product and metric contract

**Files:**
- Create: `docs/PRD.md`
- Modify: `README.md`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Produces: canonical MVP scope, release gates, event formulas, and initial targets.

- [ ] Write the PRD with consumer/research separation, privacy and medical boundaries, functional requirements, non-functional requirements, metric formulas, targets, and release checklist.
- [ ] Link README and STATUS to the canonical PRD without duplicating it.
- [ ] Check the document for placeholders, contradictory status, and undefined metric denominators.

### Task 7: Extract scan orchestration boundaries

**Files:**
- Create: `app/scan/landmarker.ts`
- Create: `app/scan/capture-consent.ts`
- Modify: `app/scan/page.tsx`
- Test: `tests/scan-orchestration.test.ts`

**Interfaces:**
- Produces: shared landmarker factory/config and `captureConsentDecision` value object consumed by the page.

- [ ] Write behavior-level tests for centralized config and the capture consent decision.
- [ ] Run them and confirm missing-interface failures.
- [ ] Extract the smallest orchestration seams while preserving React state and scan scoring.
- [ ] Run camera, consent, scan geometry, and full tests.

### Task 8: Add email revocation and retention

**Files:**
- Modify: `supabase/schema.sql`
- Create: `lib/server/unsubscribe-token.ts`
- Modify: `app/api/reengage/subscribe/route.ts`
- Modify: `app/api/reengage/run/route.ts`
- Create: `app/api/reengage/unsubscribe/route.ts`
- Create: `app/unsubscribe/page.tsx`
- Modify: `lib/reengage.ts`
- Test: `tests/unsubscribe-token.test.ts`
- Test: `tests/reengage-policy.test.ts`

**Interfaces:**
- Produces: `createUnsubscribeToken(email, secret, expiresAt)` and `verifyUnsubscribeToken(token, secret, now)`.
- Produces: consent version/timestamps, revocation filtering, and 30-day post-week-four retention.

- [ ] Write tests for valid, expired, and tampered tokens plus retention-date calculation.
- [ ] Run focused tests and confirm missing-module failures.
- [ ] Implement HMAC tokens, schema fields, re-subscription semantics, unsubscribe route/page, sender filtering, and bounded cleanup.
- [ ] Run focused tests and full smoke.

### Task 9: Production readiness verification

**Files:**
- Create: `docs/production-release-checklist.md`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Produces: an operational checklist separating code-complete checks from external deployment actions.

- [ ] Run `git diff --check`.
- [ ] Run `npm run smoke` and inspect the complete output.
- [ ] Run the Supabase configuration/security check where environment access permits.
- [ ] Search production code for remote MediaPipe URLs and direct browser Supabase table calls.
- [ ] Record remaining external actions: DB migration, firewall rules, secrets, physical devices, and production deploy.
