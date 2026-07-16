# Post-deploy security hardening evidence

Date: 2026-07-17 KST

## Scope

This record closes the two code-controlled gates retained after the 2026-07-16 production release:

1. move the validated Content Security Policy from report-only to enforced mode;
2. add a distributed provider-cost limit in front of the per-instance application limiters.

It does not claim completion of production Supabase, Resend delivery, provider billing alerts, physical-device TWA QA, or Play Console owner gates.

## Enforced CSP

TDD sequence:

1. `tests/security-headers.test.ts` was changed to require `Content-Security-Policy` and reject `Content-Security-Policy-Report-Only`;
2. the targeted test failed because only the report-only header existed;
3. `next.config.ts` changed only the header key while preserving the previously validated policy;
4. the targeted test and full `npm run smoke` passed.

Local production response evidence:

- `Content-Security-Policy` present on `/`;
- `Content-Security-Policy-Report-Only` absent;
- Chromium 390x844 visits to `/`, `/scan`, `/survey`, and `/privacy` completed with zero console errors and zero failed/blocked requests;
- React survey selection changed the progress state to `필수 항목 1/3`;
- the service worker activated from `/sw.js`;
- `face_landmarker.task` and `vision_wasm_internal.wasm` returned 200 through browser `fetch` under the enforced policy.
- the privacy page's two-step delete UI removed all 13 registered localStorage keys and all 4 registered sessionStorage keys, showed its success state, and produced no console error.

## Vercel Firewall

Live rule:

- name: `Provider request budget`;
- id: `rule_ai_provider_request_budget_he96Pt`;
- status: enabled, published, no pending draft;
- condition groups: exact POST paths `/api/analyze`, `/api/reason`, or `/api/reengage/subscribe`;
- algorithm: fixed window;
- key: client IP;
- limit: 20 matching requests per 60 seconds;
- exceeded action: default rate-limit response.

Runtime boundary evidence used invalid `{}` bodies, so no AI or email provider call was made:

- analyze requests 1-10 returned input-validation 400;
- requests 11-20 were stopped by the app-level limiter;
- requests 21-22 were stopped by the distributed Firewall with 429;
- `/api/reason` shared the exhausted global window and returned 429;
- subscribe requests 1-5 returned input-validation 400, 6-20 were stopped by its app limiter, and 21-22 were stopped by the distributed Firewall with 429.

The first draft used the exceeded action `deny`, which correctly limited traffic but returned 403. The rule was changed to Vercel's default rate-limit action and re-tested to preserve the public 429 API contract.

## Verification summary

- targeted security-header test: pass;
- full smoke: 51 files, 248 tests, ESLint, Next.js production build and TypeScript, Python compile, route/API probes: pass;
- Chromium CSP compatibility matrix: pass;
- browser device-data deletion matrix: pass, 17/17 registered keys removed;
- distributed Firewall runtime checks: pass.

Release acceptance requires the canonical production URL to expose the enforced header and pass the same post-deploy canary; the deployment handoff records that final evidence.
