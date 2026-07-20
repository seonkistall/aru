# Polish loop — Arabic RTL & English default — 2026-07-20

Branch: `feat/arabic-locale-default-en` (PR [#62](https://github.com/seonkistall/aru/pull/62))

Scope: the surface introduced by the Arabic locale / English-default round —
RTL rendering, the first-visit language contract, the flag-emoji switcher, and
metadata/doc consistency. Follows the loop documented in
[2026-07-19-product-polish-loop.md](2026-07-19-product-polish-loop.md):
reproduce → regression test → smallest fix → full gates.

## Contracts verified clean before fixes

- Fresh visit (no saved language): `html[lang="en"]`, `dir="ltr"`, English H1,
  switcher pill `🇺🇸 English`, no Hangul on screen.
- Saved `ar`: `html[lang="ar"]` + `dir="rtl"` after hydration; switching to
  English in-session flips `dir` back to `ltr`; picking العربية via the UI
  persists across reload.
- Arabic across `/`, `/scan`, `/survey`, `/report`, `/care`, `/checkin`,
  `/studio`, `/privacy`, `/unsubscribe` at 360px: zero console errors, zero
  page errors, zero sub-44px touch targets. The only failed request is the
  known keyless-dev `/api/reason` abort (template fallback path).
- The 180-combination text-fit gate (9 routes × KO/EN/JA/ZH/AR × 4 viewports)
  and the mobile-layout matrix already pass with `ar` included.

## Reproduced issues and fixes

| ID | Reproduction | Fix | Regression evidence |
|---|---|---|---|
| RTL-001 | Under `dir="rtl"` every decorative forward arrow (FlowSteps SVG, home journey SVG, literal `→` glyphs on home/care/privacy CTAs and report step nav) still pointed right — against the reading direction, so the journey read backwards. | Shared `.aru-dir-arrow` class + `html[dir="rtl"]` CSS mirror (`scaleX(-1)`); applied to all forward-arrow SVGs and glyph spans. | `tests/e2e/rtl-arrows.regression-10.spec.ts` (mirrored in ar, unmirrored in en) |
| RTL-002 | The fixed language pill sat at the physical top-right in every direction, but RTL pages start their top content (eyebrow lines like `تقرير بشرة اليوم`) at the right — the pill covered the first line on `/report`, `/care`, `/survey`, and collided with the home header. | Switcher container and dropdown moved to logical `insetInlineEnd`; home header reserve moved to `paddingInlineEnd`. The pill now mirrors to the top-left in RTL, matching platform convention; LTR is pixel-identical. | Screenshot evidence below; layout matrices re-run green |
| RTL-003 | PWA manifest declared `lang: "ko"` and root metadata (title/description/OpenGraph) stayed Korean-first while the product default is now English. | Manifest `lang: "en"` with English-first name/description; root metadata English (matching the existing Twitter card). | `tests/pwa-manifest.test.ts` (lang pin updated) |
| RTL-004 | `docs/i18n-ux-flow.md` still documented Korean-default first visit, a 4-language dropdown, and the 144-combination matrix; `docs/PRD.md` listed KO/EN/JA/ZH only. | Docs updated to the 5-language switcher (flags, RTL note), English default, and the 180-combination matrix. | Doc diff in this branch |

During the loop the Arabic FlowSteps labels were also confirmed fixed at the
dictionary level (`مسح / أسئلة / توصيات / عناية`) after the text-fit gate
caught a 43px horizontal overflow at 360/393px in the initial Arabic round.

## Visual evidence

360×800 Arabic production screenshots (pill top-left, arrows pointing along
the reading direction, no overlap):

- [screenshots/2026-07-20-ar-home.png](../../.gstack/qa-reports/screenshots/2026-07-20-ar-home.png)
- [screenshots/2026-07-20-ar-report.png](../../.gstack/qa-reports/screenshots/2026-07-20-ar-report.png)
- [screenshots/2026-07-20-ar-care.png](../../.gstack/qa-reports/screenshots/2026-07-20-ar-care.png)
- [screenshots/2026-07-20-ar-survey.png](../../.gstack/qa-reports/screenshots/2026-07-20-ar-survey.png)

## Final gates

- `npm test`: 58 files, 293 tests passed (includes ar dictionary coverage,
  duplicate-key, reengage ar template, manifest lang pin)
- `npm run test:mobile-ui`: 42 passed (adds `rtl-arrows.regression-10`)
- `npm run smoke`: ESLint, production build, TypeScript, ML compile, route
  and API guards all green

## Out of scope / known limits

- Windows Chrome renders flag emoji as letter codes (KR/US/…); real flags on
  mobile and macOS. Accepted.
- The home header tagline wraps to two lines in Arabic at 360px (decorative
  brand line, no overlap). Accepted.
- Real-device Arabic verification (system Arabic fonts, iOS Safari RTL) stays
  with the physical-device camera QA gate.
