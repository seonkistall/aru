# ARU Production Hardening Design

Date: 2026-07-15
Repository: `seonkistall/aru`

## Goal

Make ARU safe and dependable enough for a production deployment while preserving its anonymous, camera-first consumer experience. The work closes data-access and AI-cost risks first, then strengthens consent, camera delivery, product measurement, maintainability, and email privacy.

## Scope and Sequence

The implementation is delivered as eight independently verifiable stages:

1. Deny direct anonymous Supabase table access.
2. Bound and validate the public AI endpoints.
3. Require exact pilot-session consent.
4. Automate camera lifecycle QA and document physical-device verification.
5. Serve MediaPipe runtime assets from the application origin.
6. Establish one product requirements document and metric contract.
7. Extract scan orchestration behind focused interfaces without changing behavior.
8. Add signed email unsubscribe and retention controls.

Each stage must add a failing regression test before production code, pass its focused tests, and preserve the full smoke suite before the next stage begins.

## 1. Data Access Boundary

ARU remains usable without login. Browser code does not directly read or write Supabase application tables. Consumer purchases, check-ins, and care intents remain on-device; remote persistence for those records is outside this design.

All public-schema application tables enable row-level security. No anon or authenticated allow policy is created, so the default behavior is deny. The service-role-backed sync and re-engagement routes remain the only remote data writers and bypass RLS intentionally on the server. `reengage_contacts` and `funnel_events` receive the same explicit RLS protection as the other tables.

A repository check must fail when required RLS statements or privilege revocations are absent. Operational documentation must state that the migration is applied before production traffic.

## 2. Public AI Endpoint Boundary

`/api/analyze` and `/api/reason` share a small server-only request-guard module. It provides:

- content-length rejection before parsing;
- a hard parsed-body byte limit;
- per-client process-local rate limiting with bounded key storage;
- stable 400, 413, and 429 responses;
- external-provider abort timeouts.

Analyze accepts only JPEG or PNG base64 data URLs, validates base64 syntax, and limits decoded bytes. Reason accepts a bounded list of items and limits every user-controlled string and array. The server never forwards arbitrary unbounded request text to an AI provider.

The in-process limiter is defense in depth, not the distributed production control. Deployment documentation requires a Vercel Firewall or distributed rate-limit rule for both routes.

## 3. Consent Boundary

When no pilot session exists, unscoped consent remains valid for the ordinary consumer flow. When a pilot session exists, only an event whose `participantId` and `sessionId` exactly match that session can authorize AI transfer or learning-crop retention. Unscoped consent never falls back into a pilot session.

Consent evaluation is extracted into a pure, tested helper. Capture requires both the current UI choice and an eligible persisted grant. Existing sync-side exact-scope enforcement remains in place.

## 4. Camera QA

Camera behavior is decomposed enough to test lifecycle decisions without a real camera. Automated tests cover permission failure, high-resolution fallback, model-loading failure state, hidden-tab pacing, retry, and track cleanup where those behaviors can be isolated reliably.

Physical iPhone and Android outcomes are not fabricated. `docs/mobile-camera-qa.md` gains a release matrix and evidence fields. Until real devices are run, those rows remain explicitly marked `PENDING DEVICE VERIFICATION`.

## 5. Same-Origin MediaPipe Assets

The FaceLandmarker WASM runtime and model are served below `public/vendor/mediapipe/`. Main-thread and worker code import the same configuration. Runtime production code contains no jsDelivr or Google Storage model dependency.

A deterministic asset-copy script copies the installed MediaPipe WASM files during setup/build. The pinned face-landmarker model is stored in the repository together with source, version, and license attribution. A test verifies same-origin URLs and asset presence.

## 6. Product Requirements and Metrics

`docs/PRD.md` becomes the product-level source of truth. It separates the consumer journey from research operations and defines MVP scope, exclusions, privacy posture, non-medical claim boundaries, functional requirements, release gates, and metric formulas.

The metric contract uses existing funnel events where possible. Required metrics are scan-start-to-completion, capture failure, report reach, survey completion, retake, recommendation click, and week-two check-in. Every metric defines its numerator, denominator, event source, and initial target.

## 7. Scan Orchestration Boundary

The scan page is reduced incrementally, with no visual redesign and no scoring changes. Shared MediaPipe configuration is centralized first. Consent authorization and camera startup/fallback are extracted as pure or narrowly side-effecting modules. Capture/analyze orchestration is extracted only where its inputs and outputs can be tested without DOM-heavy coupling.

The page remains the owner of React state and presentation. New modules own one responsibility each and expose explicit TypeScript interfaces. Large state-machine replacement is out of scope.

## 8. Email Unsubscribe and Retention

Re-engagement contacts record consent version, consent timestamp, revocation timestamp, and retention deadline. A server-only HMAC helper creates and verifies signed, expiring unsubscribe tokens. A public unsubscribe route changes only the address encoded in a valid token; arbitrary email input cannot unsubscribe another address.

The scheduled sender filters revoked contacts. After the week-four send, retention is set to 30 days. A scheduled cleanup path removes expired contacts in bounded batches. Re-subscription explicitly clears revocation and records a new consent timestamp/version.

## Error Handling

Public APIs return bounded, non-sensitive error messages and never include provider bodies, secrets, or database details. Expected user errors use 4xx responses; unavailable configured dependencies use 503; upstream AI failures use 502. Best-effort local persistence continues to avoid breaking the consumer flow.

## Verification and Release Gates

Production readiness requires:

- focused tests for each new boundary;
- full `npm run smoke` success;
- no direct browser Supabase table access;
- same-origin MediaPipe URLs and required assets present;
- documented RLS migration application;
- documented platform rate-limit rule requirement;
- real-device camera matrix clearly separated into passed and pending rows;
- unsubscribe success, tamper rejection, revocation filtering, and retention cleanup tests.

Applying the production database migration, configuring platform firewall rules, provisioning secrets, and deploying to production are operational actions outside code implementation. They must be completed in the release runbook before traffic is switched.

## Out of Scope

- Adding user accounts or login.
- Replacing MediaPipe or the skin-scoring algorithm.
- Claiming dermatological diagnosis or treatment efficacy.
- A full scan UI redesign.
- Fabricating physical-device QA results.
- Introducing a paid distributed rate-limit dependency without an explicit operational decision.
