# ARU Production and Play Plan Review

Reviewed: 2026-07-16

Review status: approved for inline execution. This is a manual application of the CEO, design, engineering, security, QA and DX review criteria. The full `/autoplan` workflow was not claimed because its mandatory interactive gate is unavailable in the current execution mode.

## Premise and scope challenge

- A native rewrite would not improve this release enough to justify duplicating the already-passing browser camera and privacy flows. TWA remains the lowest-risk Play route.
- “Production web deployed” and “Play public release” are different completion states. Code, signed local artifacts and store materials can progress independently, but Play Console identity/App Signing and real legal/contact data cannot be inferred.
- The product cannot truthfully optimize a global production funnel while events remain local/pilot-synced. The plan adds the missing denominator but labels the source honestly instead of silently uploading behavioral data.
- A service worker must improve failure behavior without caching another user's report or API responses. The plan deliberately avoids navigation HTML caches.
- The scan file needs separation, but a broad rewrite would endanger the only real-device-qualified path. Characterization and one seam per commit are required.

## Spec coverage

| Design section | Implementation evidence |
|---|---|
| Goals, non-goals, TWA approach | execution index; Android Tasks 1-5 |
| Consumer and research flows | Product Tasks 1-5; Security Task 2; Camera Task 5 |
| Mobile hierarchy and trust copy | Product Tasks 3-4 |
| Typography and four locales | Product Task 1; Camera Task 2 |
| Device and server data lifecycle | Product Task 2; Security Task 3; Android Task 4 |
| Internal routes, APIs, email, headers | Security Tasks 1-4 |
| Dependency and Supabase reproducibility | Security Tasks 4-5 |
| Camera assets and scan separation | Camera Tasks 1 and 4 |
| PWA manifest and offline behavior | Camera Tasks 2-3 |
| Android package and Digital Asset Links | Android Tasks 1-3 |
| PRD and metric contract | Product Task 5 |
| Test strategy and device QA | every task; Camera Task 5; Android Task 5 |
| Deployment, rollback, store preparation | Android Tasks 4-5 |
| External owner gates | execution index; Android Task 5 |

No design requirement is intentionally dropped. Real entity/contact, Resend ownership, Play Console/App Signing and physical device access remain evidence gates rather than placeholder implementation.

## System boundary after implementation

```text
Galaxy / mobile browser
        |
        +-- TWA (com.seonkistall.aru) -- Digital Asset Links --+
        |                                                       |
        +---------------- HTTPS ----------------------------- ARU origin
                                                                |
              +----------------------+--------------------------+------------------+
              |                      |                          |                  |
          Next pages           same-origin WASM/model       bounded APIs      service worker
              |                      |                          |                  |
       local/session data       on-device analysis       +------+-------+    offline fallback
              |                                         |      |       |
       explicit delete                           Gemini/OpenAI Supabase Resend
                                                 optional crop service  reminder
```

## Test-path review

```text
Input/body -> readBoundedJson -> pure parser -> route -> provider timeout/output cap
              request-guard    parser tests    route source/build probes

Locale -> LanguageProvider -> Care/Privacy/Unsubscribe -> 4-language browser matrix
          locale tests         dictionary coverage       console/screenshot evidence

Storage write -> DEVICE_DATA_KEYS -> clear -> re-read -> Privacy success state
                registry test       fake stores           browser verification

Camera -> shared landmarker -> quality loop -> capture analysis -> survey/report
          asset/factory tests  existing ROI tests  characterization  Galaxy/TWA QA

Manifest -> SW/offline -> Bubblewrap -> signed artifact -> assetlinks -> TWA launch
unit/source tests  smoke   Android lint  signature dump  public probe  physical QA
```

## Failure and rescue registry

| Failure | User-visible risk | Planned detection | Rescue |
|---|---|---|---|
| Oversized/chunked JSON | cost or memory abuse | actual UTF-8 byte tests and production probes | 413 before schema/provider work |
| Missing internal credentials | staff pages exposed or broken | default-deny access test | production 404; configure credentials out of band |
| Reminder send succeeds but DB update fails | duplicate email | failure counter and deterministic idempotency key | retry safely and alert operator |
| Supabase project rebuilt from schema | browser privileges regress | source security contract and environment check | reapply schema; do not direct traffic |
| Service worker network failure | blank TWA/browser error | offline smoke and browser offline run | branded HTTP-200 fallback |
| Stale report cached | another user's state shown | cache contract rejects API/report HTML | network-only navigation and local state only |
| Digital Asset Link fingerprint mismatch | visible Custom Tab UI | public association probe and device launch | add exact upload/Play signing fingerprint, redeploy |
| Camera refactor regression | capture blocks or wrong result | characterized seams and existing ROI tests | revert only failing seam; retain last green version |
| Production web regression | every installed TWA regresses immediately | canary against exact commit | promote prior Vercel deployment; withhold AAB |
| Play policy/account gate missing | submission rejected | release checklist and store pack tests | retain internal artifact; do not claim release |

## Design review

Target design score: 8/10 before physical QA. Strengths are a coherent single locale, first-viewport primary CTA, reduced merchant action density, honest product evidence and explicit privacy deletion. Remaining score depends on rendered before/after evidence at 360-430 px, long JA/ZH strings, font loading, actual camera surfaces and store screenshots.

The design plan avoids a component-library migration. Existing paper/sketch identity stays; only hierarchy, tokenized tap sizes, language-specific display typography and misleading/obscuring elements change.

## Engineering and security review

The highest-risk dependencies are ordered first: server boundaries before consumer polish, web/PWA before wrapper generation, production association before device TWA sign-off. Each interface is pure or narrow enough for Node Vitest, and every large scan extraction has a last-known-green checkpoint.

The in-memory limiter remains defense in depth, not a distributed quota. Vercel Firewall configuration is still required and must be evidenced at deploy. CSP starts report-only because enforcing an untested policy could disable Next.js or MediaPipe; other security headers can enforce immediately.

## Developer experience review

Web target time-to-first-run remains under five minutes: `npm install`, `npm run dev`. Android first setup is necessarily longer because JDK, SDK licenses and build tools are external; the runbook and `npm run android:check` must turn missing prerequisites into problem/cause/fix output rather than opaque Gradle errors.

Expected final entry points:

- `npm run smoke` — complete web gate;
- `npm run android:check` — package, origin, SDK, permission and secret hygiene;
- `android\\gradlew.bat -p android bundleRelease` — signed release build after env setup;
- `docs/android-build-runbook.md` — copyable setup and verification;
- `docs/production-release-checklist.md` — web, email, database, Android and owner gates.

## Decision audit trail

| # | Decision | Classification | Rationale | Rejected |
|---|---|---|---|---|
| 1 | TWA/Bubblewrap | architecture | preserves validated browser camera and one product code path | Capacitor and native rewrite |
| 2 | Four sequential plans | execution | independent review/rollback boundaries | one monolithic diff |
| 3 | Single global locale | product correctness | prevents reproduced JA/EN mixed page | page-local KO/EN controls |
| 4 | No live price/rating presentation | trust | catalog contains representative seed values | disclosure buried under numeric cards |
| 5 | Local/pilot metric truth | privacy | no silent analytics expansion | automatic consumer event upload |
| 6 | CSP report-only first | security availability | collects compatibility evidence before enforcement | immediate unverified enforcement |
| 7 | Upload key plus later Play fingerprint | release | enables local signing while respecting Play App Signing | fabricated distribution fingerprint |
| 8 | Inline execution | coordination | user requested uninterrupted sequential progress; delegation was not requested | subagent-driven execution |

## Review conclusion

No unresolved taste decision changes the approved direction. The first executable slice is `2026-07-16-security-data-reliability.md`, Task 1. Completion remains unproven until the acceptance criteria are backed by current tests, deployed behavior, signed artifact inspection and required owner/device evidence.
