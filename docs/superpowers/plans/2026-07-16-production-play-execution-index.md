# ARU Production and Play Execution Index

Approved design: `docs/superpowers/specs/2026-07-16-production-play-readiness-design.md`

Execute these plans in order. A later plan may consume artifacts from an earlier plan, but every plan leaves the web product deployable and independently testable.

1. `2026-07-16-security-data-reliability.md` — public API boundaries, internal-route access, email reliability, headers, Supabase reproducibility, dependency audit.
2. `2026-07-16-product-ux-trust.md` — locale coherence, complete on-device deletion, recommendation truthfulness, mobile hierarchy, funnel/PRD/documentation.
3. `2026-07-16-camera-pwa-performance.md` — shared MediaPipe assets, scan orchestration seams, installable/offline PWA, font and performance verification.
4. `2026-07-16-android-play-release.md` — Bubblewrap project, Digital Asset Links, signed AAB, store pack, production deploy, mobile/TWA QA and owner gates.

Global execution order inside every behavior task is fixed:

1. write the smallest regression test that reproduces the observed failure;
2. run it and preserve the expected failure evidence;
3. implement only the behavior required by the approved design;
4. run the focused test and adjacent regression set;
5. run the full smoke gate when the slice is complete;
6. review the diff and commit only the slice.

The implementation runs inline in this session because no delegation was requested. External account actions are not simulated: missing Resend, Play Console, legal-contact, signing-fingerprint, or physical-device evidence remains an explicit release gate while all independent work continues.
