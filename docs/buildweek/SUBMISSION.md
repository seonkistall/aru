# OpenAI Build Week — ARU submission pack

**Track: Apps for Your Life**

| | |
|---|---|
| Live app | <https://aru-beauty.vercel.app> |
| Repository | <https://github.com/seonkistall/aru-buildweek> (public) |
| Demo video | <https://youtu.be/oc-ccLo-yn0> |
| Build log | [BUILDLOG.md](../../BUILDLOG.md) |
| User research | [user-research.md](user-research.md) |
| Demo scripts | [English](DEMO-SCRIPT.md) · [Korean](DEMO-SCRIPT-KO.md) |
| Screenshots | [assets/](assets) — English, 1080×2160 |

---

## 1. Project description (paste into Devpost)

### One line

A 30-second selfie scan that reads what your skin actually shows today, and
picks three products and a morning/evening routine — with honest reasons and no
efficacy claims.

### Who it is for

People choosing K-beauty products, along two axes. Korean users who cannot
decide because there is *too much* ingredient and review data. And visitors to
Korea standing in a store unable to read a Korean product name or ingredient
list — which is why the app defaults to English and supports Korean, Japanese,
Simplified Chinese and Arabic with right-to-left layout.

### The problem

Skin-analysis tools already exist. Most lose trust by promising to "whiten",
"improve" or "regenerate" — efficacy claims that Korean cosmetics advertising
rules restrict and users have learned to discount. The rest analyse and stop,
never answering "so what do I buy today?". Meanwhile the user wants an answer in
thirty seconds, and the incumbent flow asks for an account, a twenty-question
survey, or a booked consultation.

### How it works

1. **On-device scan, 30 seconds.** MediaPipe Face Landmarker samples T-zone and
   cheek regions. A quality loop grades light, distance, steadiness and glare
   every frame, and auto-capture fires only when all four hold. On the basic
   path the original photo is never uploaded or stored.
2. **Only what is visible.** Three signals — oil, redness, texture. If capture
   confidence is low the app demotes its own reading and says so, leaning on the
   questionnaire instead.
3. **A compliance gate around the model.** GPT-5.6 phrases why each product was
   picked, but every sentence must pass a per-language banned-claims filter
   (`lib/claim-filter.ts` plus `efficacyClean()`). Anything failing is replaced
   with a pre-approved template, so the app *structurally cannot* publish an
   efficacy claim.
4. **Turn it into action.** Three product candidates, a morning/evening routine,
   retailer and dermatologist outlinks, then a 2-week and 4-week email check-in
   that feeds the next recommendation.

### How to actually use it

`/` → `/scan` (auto-capture) → `/survey` (skin type, concerns, budget) →
`/report` (analysis → picks → routine) → `/care` (buy and consult) → `/checkin`
(2 and 4 weeks later). If the camera is denied or unavailable, the
questionnaire alone reaches the same report. The language switcher is fixed in
the corner of every screen; Arabic flips the whole layout to RTL.

### Why it is different

This is not a general beauty chatbot with a skin prompt. **The medical boundary
and the advertising-law constraint are implemented as code** — in the input
validation, the prompt, and the output filter — and what the AI is permitted to
say is pinned by automated tests.

---

## 2. Judging-criteria mapping

**Technological Implementation.** On-device ML (MediaPipe, self-hosted model and
WASM) with a per-frame quality gate, an optional vision-API cross-check, and a
per-language claim filter that gates LLM output. 297 Vitest tests across 59
files plus 42 Playwright mobile tests, production CSP, Supabase RLS on nine
tables, per-IP rate limits. The GPU-delegate corruption self-heal
(`app/scan/use-landmarker.ts`) is the clearest example of non-trivial work:
detected at runtime, recovered automatically, regression-tested.

**Design.** A first flow that needs no account and no keys. Empty state — the
questionnaire-only path reaches a full report with no scan. Error states —
camera denial recovery, low-confidence demotion, GPU self-heal, storage-blocked
fallbacks. Consistency — nine routes × five locales × four viewports are pinned
by a 180-combination text-fit regression, with 44px touch targets at 320px.

**Potential Impact.** In moderated interviews, 4–5 of 10 people stated they
would buy the specific product ARU picked. That is stated intent from a small
sample, and [user-research.md](user-research.md) says so plainly rather than
inflating it. The 2-/4-week check-in exists to convert that into measured
retention.

**Quality of the Idea.** The insight is that the scan is a hook and the purchase
moment is the product — which is why the roadmap prioritises a manual concierge
round over more camera features. The differentiator is a product that refuses to
overclaim, in a category defined by overclaiming.

---

## 3. Checklist status

| # | Item | Status |
|---|---|---|
| 1 | Working project using Codex and GPT-5.6 | Live in production; Vitest 297 + mobile E2E 42 + smoke green. `/api/reason` defaults to `gpt-5.6-luna` — **requires `OPENAI_API_KEY` in production to exercise the LLM path** |
| 2 | One official track | Apps for Your Life |
| 3 | Project description | Section 1 of this document |
| 4 | Public YouTube demo under 3 minutes | Published: <https://youtu.be/oc-ccLo-yn0> (scripts: [EN](DEMO-SCRIPT.md) / [KO](DEMO-SCRIPT-KO.md)) |
| 5 | Judgeable repository | Public: <https://github.com/seonkistall/aru-buildweek> — 25 branches, full history including every `codex/` session branch |
| 6 | README and run instructions | [README.md](../../README.md) — install, run, env vars, tests. Runs with no keys and no sample data |
| 7 | Codex usage and key decisions | [BUILDLOG.md](../../BUILDLOG.md), including an explicit tooling disclosure |
| 8 | `/feedback` session ID | Submitted with the Devpost entry |
| 9 | Developer Tool extras | Not applicable (Apps track) |

## 4. Remaining owner actions

1. ~~Set `OPENAI_API_KEY` in Vercel production~~ — **done 2026-07-21.**
   `OPENAI_API_KEY` and `OPENAI_REASON_MODEL=gpt-5.6-luna` are registered in
   Vercel production, `openai:check` passes against the live key, and
   `POST /api/reason` on <https://aru-beauty.vercel.app> returns
   `"source": "llm"` in EN and KO.
2. ~~Run `/feedback` in a Codex session~~ — **done; session ID submitted with
   the Devpost entry.**
3. ~~Record the demo~~ — **done: <https://youtu.be/oc-ccLo-yn0>.**
4. ~~Submit on Devpost~~ — **submitted 2026-07-22 (KST) before the deadline.**
   Judging runs July 22 – August 7; keep the live app stable during that
   window.
