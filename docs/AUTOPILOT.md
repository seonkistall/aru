# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-19

## What this is for

ARU should end up used by real people and earning money. The loop exists to make
the product better every cycle without a human in the seat for each one.

Be clear-eyed about what the loop can and cannot move:

- **It can** raise product quality, close the ML gap, fix bugs, tighten the funnel,
  and prepare everything a launch needs.
- **It cannot** acquire users, sign an affiliate contract, or create demand. Those
  are owner actions, and they sit in BLOCKERS below.

### The revenue arithmetic, written down so no cycle forgets it

Target: **$10,000 / month**. ARU's only revenue surface today is the commerce
out-link (`/api/out` → `lib/commerce.ts`).

| Quantity | Value | Where it comes from |
|---|---|---|
| Typical Korean skincare basket | ~₩30,000 (~$22) | catalogue price band in `lib/skus.ts` |
| Affiliate commission | **7%** on a recommended item, 3% on another item bought through the link | 올리브영 쇼핑 큐레이터 terms, 2026-09-15 |
| Revenue per converted click | ~₩2,100 (~$1.5) at 7% | basket × commission |
| Conversions needed per month | **~6,700** | $10,000 ÷ revenue per conversion |
| Scan→purchase conversion (optimistic) | 2–5% | affiliate-content benchmark, unverified for this product |
| Monthly scans implied | **~100,000–700,000** | conversions ÷ conversion rate |

Two things follow, and every cycle should act on them rather than re-deriving them:

Rates by programme, as far as they could be verified on 2026-09-15 (Korean sites are
blocked from the build network, so these come from search results, not from pages this
repository opened):

| Programme | Rate | Channel it accepts | Verified? |
|---|---|---|---|
| 올리브영 쇼핑 큐레이터 | 7% recommended item / 3% other item via the link | in-app curator links, shared to external channels | rate stated consistently across sources |
| 네이버 쇼핑 커넥트 | 5–28% per product, 1.8% cross-store | creator space + an owned channel | whether a web service qualifies is **unverified** |
| 쿠팡 파트너스 | **unverified** — sources say 3%, 1–3%, and 5% for beauty | website and mobile-app URLs may be registered | channel support is stated in the official guide |

Note the programme name: it is **네이버 쇼핑 커넥트**, not "쇼핑파트너" (쇼핑파트너센터 is
the seller-side console). An earlier version of this file had it wrong.

Two things follow, and every cycle should act on them rather than re-deriving them:

1. **The links earn $0 today.** `addCommerceTracking()` adds UTM parameters only —
   no affiliate or partner id. `COMMERCE_LINK_OVERRIDES_JSON` is the designed
   insertion point for real affiliate URLs. Until the owner signs up for the
   programmes, 100% of traffic monetises at zero, whatever the loop builds.
   **When that env is set, `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` must be set in the same
   deploy** — see `affiliateDisclosureActive()`. Live affiliate URLs with the
   disclosure still reading "no commission" is a false statement to users and, under
   올리브영's curator terms, forfeits the payout.
2. **Traffic is the binding constraint, not features.** At six figures of monthly
   scans the product needs to be excellent; at zero scans it does not matter how
   excellent it is. Cycles should prefer work that either (a) makes the product
   worth returning to and sharing, or (b) instruments what actually happens, over
   work that only adds surface.

## Standing objective: run until $10,000/month

The owner's instruction, 2026-09-15: keep the 6-hourly cycle running until ARU earns
more than **$10,000 in a month**. Two things must be said plainly so no cycle pretends
otherwise.

**The loop cannot see revenue.** Nothing in this repository records a sale. Affiliate
earnings live in the merchants' dashboards, behind accounts the loop has no business
touching. So the stop condition is owner-reported: the owner writes the month's figure
into the table below, and until a line there exceeds $10,000 the cycle keeps running.
A cycle must never infer, estimate, or celebrate revenue from anything in the codebase.

**The loop cannot create demand.** It can make the product worth returning to and worth
sending to a friend; it cannot sign an affiliate contract or bring traffic. Those stay
in BLOCKERS and stay the owner's.

### Revenue log (owner fills this in)

| Month | Revenue | Source | Note |
|---|---|---|---|
| 2026-09 | $0 | — | No affiliate id exists in the codebase; every out-click earns $0. |

### What "revenue-upstream" means when ordering the backlog

While that table reads $0, prefer work in this order. It is not a rule against quality
work — a broken product converts nothing — but a tie-breaker when two items look equally
worth doing.

1. **Anything that makes an existing click earn money.** The affiliate plumbing is the
   clearest case: `COMMERCE_LINK_OVERRIDES_JSON` is the designed insertion point and is
   empty, and every link currently lands on a *search results page* rather than a product
   page. That second one is a conversion leak the loop can fix today, without waiting for
   the owner's programme applications.
2. **Anything that makes the funnel observable.** Optimising what you cannot measure is
   guessing. `lib/funnel.ts` is still localStorage-only.
3. **Anything that makes one user bring another.** The share loop is the only organic
   acquisition path the product has. **It depends on item 2 and the ordering did not
   say so** (supervisor, 2026-09-16): `share_clicked` is recorded in the sender's
   browser (`app/scan/page.tsx`, `app/studio/page.tsx`) and `share_landed` in the
   receiver's (`app/components/mood-from-link.tsx`). Two devices, both localStorage,
   and `/ops` reads one browser — so landings per send, the only number the loop has,
   is not merely unmeasured today but **structurally uncomputable**: no store anywhere
   has ever held both halves. Server-side collection is what makes item 3 possible at
   all, which is part of why item 2 went first this cycle.

   What collection would still not give: `#m=NNN` encodes mood levels, not a share id
   (`lib/share-link.ts`), so the aggregate ratio becomes computable and per-share
   attribution does not. Adding a share id would put a new identifier into a URL people
   paste to each other — a privacy decision, not a plumbing one, and not an obvious fix
   to reach for.
4. **Everything else** — model quality, subgroup fairness, defects, polish. Still real
   work, still lands every cycle; it just does not win a tie against 1-3 while the
   revenue line reads zero.

## One cycle

Each firing does all of this, in order. One coherent improvement per track is
better than four half-finished ones.

1. **Orient.** Read this file. Run `git log --oneline -10` and read "Recent cycles"
   at the bottom of this file so the cycle does not redo finished work. That section
   holds the last three cycles; everything older is in
   [`docs/autopilot-changelog.md`](autopilot-changelog.md) and a cycle does not need to
   read it to do a cycle.
2. **Verify green.** `npm run smoke` must pass before any change. If it is red,
   fixing that is the whole cycle.

   In a sandboxed worker, export `PLAYWRIGHT_CHROMIUM_EXECUTABLE` first:

   ```bash
   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run smoke
   ```

   `@playwright/test` 1.61.1 pins chromium build 1228; the container ships 1194, and
   `npx playwright install chromium` is refused by the egress proxy
   (`403 ... no rule or allowlist entry allows host "cdn.playwright.dev"`). Without the
   override all 44 mobile E2E specs fail at browser launch and smoke reads red while
   nothing in the product is broken. Unset, Playwright resolves its own build, so CI is
   unchanged. Find the path with `ls /opt/pw-browsers` — the build number moves.

   Also: pipe smoke through `tee` and it reports `tee`'s exit code, not its own. Check for
   the literal `Smoke test passed.` line, not `$?` at the end of a pipeline.
3. **Research** (자료조사). One concrete question that the next step needs
   answered — a dataset licence, a Play policy, a Korean affiliate programme's
   terms, a competitor's onboarding, an ML technique. Verify against a primary
   source; record the finding and the source in the right doc. Never record a
   search snippet as a fact.
4. **ML.** Move the scan model forward: calibration, subgroup coverage, an index
   that needs validating, a metric that is missing, an inconsistency between
   `lib/skin.ts` and the Python pipeline. `python ml/selftest.py` must stay green.
5. **UI/UX and user flow.** One real improvement to what a user sees or how far
   they get: a drop-off in `lib/funnel.ts`, a screen that is confusing on a
   360px phone, copy that overpromises, a locale that reads like a translation.
6. **Bug fix.** Hunt actively rather than waiting for a report: run the app, read
   an error path, check a boundary. Fix at least one real defect, with a test
   that fails without the fix.
7. **Land it.** `npm run smoke` green → commit → push a branch → open a PR →
   merge it → write a dated entry under "Recent cycles" and update the BACKLOG →
   update `README.md` if anything a reader would care about changed.
8. **Rotate, so this file stays readable.** This is not optional housekeeping; it is
   what stops step 1 costing more every cycle. After writing the entry:
   - **"Recent cycles" holds three entries.** Move the fourth-oldest to the bottom of
     the Changelog in [`docs/autopilot-changelog.md`](autopilot-changelog.md), text
     unchanged. Do not summarise it on the way — the archive is the full record.
   - **Move every backlog item this cycle ticked `[x]`** into "Closed backlog items"
     there, under the heading it was filed beneath. `[~]` stays: partly done is live
     work. An entry whose finding is still open is not closed history, whatever its
     date.
   - **Prove the move**, in the PR body, with `wc -l` on both files before and after
     and a check that the moved text is byte-identical — not with an assertion that
     nothing was lost.

   The measurement that forced this, 2026-09-17: ten cycles of appending had taken this
   file to 2,329 lines, 1,545 of them (66%) changelog, while every brief still told a
   fresh session to read the whole thing first.

Use subagents freely for fan-out — parallel research angles, parallel review
lenses, adversarial verification of anything before it is written down as true.
Verification is where the loop earns its keep: an unverified "improvement" that
looks right is worse than no change, because the next cycle builds on it.

## Hard guardrails

These are not preferences. Breaking one is worse than skipping a cycle.

1. **Never push a red build.** `npm run smoke` green before every push, no exceptions.
   If it cannot be made green, revert the change and record why in BLOCKERS.
2. **Never fabricate evidence.** Every number written into a doc, PR body or
   CHANGELOG must be the actual output of a command that actually ran. Paste real
   output. If a run was not done, say it was not done.
3. **Never make a medical claim.** ARU describes cosmetic tendencies visible in a
   photo. No diagnosis, no treatment, no condition monitoring, in any language.
   `efficacyClean()` stays on every LLM product reason.
4. **Never merge the two consent streams** (AI analysis / learning crop) or weaken
   the audit trail.
5. **Never ship a face image off-device** beyond the existing consented crop path,
   and never write a person identifier next to their measurements in an export.
6. **Never commit dataset images**, model weights over a few MB, or anything from a
   gated dataset.
7. **Never change a dataset licence tier** on anything other than a term the owner
   has actually read and reported. The current tiers and their evidence live in
   `ml/external_datasets.json`.
8. **Never promote a model** past the gate in `public/models/visible-attributes/manifest.json`.
9. **Surgical changes only.** Every diff traces to a backlog item or a defect. No
   refactor-for-its-own-sake, no dependency added without a reason in the PR body.
10. **Never push to `main` directly.** Branch → PR → merge.

## Backlog

`[AI]` the loop can do alone. `[OWNER]` needs a human, an account, or a signature.

### Now

Items ticked `[x]` move to [`docs/autopilot-changelog.md`](autopilot-changelog.md)
once the work is merged, so this list is the open work and nothing else. `[~]` means
partly done and stays here.

- [AI] **Deep-link the commerce out-links to product pages.** Every entry in
  `buildCommerceLinks` (`lib/commerce.ts`) currently points at a merchant *search* URL —
  `oliveYoungSearchUrl`, `naverShoppingSearchUrl`, `coupangSearchUrl` all build
  `?query=<brand> <name>`. A user who taps "올리브영" lands on a result list and has to
  pick the product again, which is the largest avoidable drop between intent and
  purchase, and it will still be there the day affiliate ids arrive. Resolve stable
  product URLs per SKU where they exist, keep the search URL as the fallback for the
  ones that do not, and keep `isAllowedCommerceUrl` as the gate. Do not invent URLs:
  a link that 404s is worse than a search page, so anything unverified stays a search
  URL and gets recorded as unverified.
  **2026-09-15: attempted and stopped, deliberately.** Every merchant host refuses this
  network, so not one product URL could be verified to resolve, and the item's own rule
  says an unverifiable URL stays a search URL. Verbatim:

  ```
  --- https://www.oliveyoung.co.kr/store/main/main.do
  curl: (56) CONNECT tunnel failed, response 403
  --- https://search.shopping.naver.com/search/all?query=test
  curl: (56) CONNECT tunnel failed, response 403
  --- https://www.coupang.com/np/search?q=test
  curl: (56) CONNECT tunnel failed, response 403
  --- https://global.oliveyoung.com/
  curl: (56) CONNECT tunnel failed, response 403
  --- https://www.google.com/search?q=test
  curl: (56) CONNECT tunnel failed, response 403
  ```

  Nor is the answer hiding in the repo: the 22 files in `public/products` are named
  `cl1.jpg`…`tn3.jpg` and carry no merchant goods number, and the only `goodsNo` string
  anywhere in the tree is the `PARTNER_GOODS_NO` placeholder in the playbook. So this
  needs either an allowlisted host for the worker or the owner pasting real product
  URLs. What the cycle *could* fix without a network is the override path those URLs
  will arrive through — see the 2026-09-15 (cycle 2) entry in
  [`docs/autopilot-changelog.md`](autopilot-changelog.md); it was silently discarding them.
- [AI] Validate the blemish-detection constants (`BLEMISH` in `lib/skin.ts`) against
  real photos through `/eval`, and replace them with calibrated values. They were
  chosen on a synthetic face.
- [~] [AI] Server-side funnel telemetry. `lib/funnel.ts` is localStorage-only, so nobody
  can see where users drop off. Without it every UX cycle is guessing. (2026-09-15 added
  `share_landed` and `viralActivation`, but they are still on-device.)
  **2026-09-16, cycle 6: the flush path is built and it is off, and the reason it is off
  is a blocker.** Confirmed first, not assumed: the only two `fetch("/api/sync"` call
  sites in the tree are both `app/ops/page.tsx` (lines 168 and 440), and `/ops` is a 404
  in production unless `INTERNAL_TOOLS_USER`/`INTERNAL_TOOLS_PASSWORD` are set
  (`internalAccessDecision`), on top of needing `SUPABASE_SYNC_TOKEN` typed in. So every
  real user's funnel data has been written to their own browser and read by nobody.
  `lib/funnel-flush.ts` + `app/components/funnel-flush.tsx` are the missing call site,
  behind `NEXT_PUBLIC_FUNNEL_FLUSH` (exact `"on"`, default off, same shape as
  `NEXT_PUBLIC_COMMERCE_AFFILIATE`). **It cannot authenticate**: `POST /api/sync`
  requires `SUPABASE_SYNC_TOKEN` and a browser cannot hold a secret, so the flush is
  refused 401 — pinned against the real route handler so nobody switches the flag on
  believing otherwise. Full write-up, redaction rules, the `sendBeacon` finding and the
  PIPA analysis: `docs/funnel-flush-design.md`.
  **2026-09-17, cycle 7: the endpoint exists and the flush reaches it.** The item is
  still `[~]` and it will stay that way until an owner answers §5, because the thing
  that keeps the flag off was never the transport. `NEXT_PUBLIC_FUNNEL_FLUSH` is unset
  in code and in every config in the repository, and no cycle may set it.
  **2026-09-17, cycle 8: something now reads the table.** Still `[~]`, and for the same
  §5 reason. The read side is the closed item "Nobody can read `funnel_events`" in
  [`docs/autopilot-changelog.md`](autopilot-changelog.md); the flag is untouched.
- [~] [AI] Measure the real per-scan cost of the new within-image indices on a mid-range
  phone profile, not on the build container.
  **2026-09-19, cycle 15: the container half is measured and written down; the phone half
  is a device and stays blocked.** `tests/scan-cost-benchmark.test.ts` +
  `docs/scan-cost-measurement.md`. What a container CAN establish is established: the
  per-frame work in pixels, how each phase scales, the split between phases, and each
  phase's share of a budget here. What it cannot is a phone number, and no device
  multiplier was invented — that half is the physical-device QA blocker already recorded
  below. Stays `[~]` for exactly that reason and for no other.
- [AI] **The promotion gate is fed two different models' numbers in one call.**
  Verified by the supervisor at main `b2ec030`, `ml/train_visible_attributes.py:805-845`,
  independently of PR #69 which reports the same area. The training loop saves
  `best_path` whenever `mean_val > best`, so the best checkpoint can be any epoch, and
  separately keeps `last_val_confusion = val_confusion` every epoch, so that variable
  always holds the FINAL epoch's. After the loop the best checkpoint is loaded, so
  `evaluate_by_cell` produces `subgroup_metrics` from the best checkpoint — but
  `final_val_metrics = metrics_from_confusion(last_val_confusion)` is the last epoch's,
  from a model no longer in memory. `promotion_check` then receives both.

  So the qwk/pearson floor and the heuristic comparison read one model's numbers while
  the worst-group gap and the per-axis sample floor read another's, and `metrics.json`
  records the pair as though they described one artifact. They agree only when the best
  epoch happens to be the last, which is the case best-checkpoint tracking exists to not
  assume. No live impact yet — zero consented crops, so no run has produced a
  `metrics.json` — which also means it must be fixed before the first one does, i.e.
  before anyone would notice it was wrong. PR #69 fixes it as part of a larger branch
  and is waiting on an owner decision; if that branch is not wanted whole, this split is
  a handful of lines and is a cycle item on its own. Noted 2026-09-17.
- [AI] **`relative_redness` in `ml/skin_indices.py` and `relRedness` in `lib/skin.ts`
  are two different formulas under one declared name — the same defect cycle 16 closed
  on the oil axis.** `FEATURE_KEY` maps `relative_redness` to `relRedness`, but the
  Python function returns an **a\* difference** and the app returns
  `rIdx(cheeks) - rIdx(tzone)`, a difference of **red chromaticities**
  (`meanR / (meanR + meanG + meanB)`). Different colour space, different scale, one
  declared field. Cycle 13 looked at this pair and recorded "nothing to keep in step" —
  right about `cov`, which has no Python index at all and so no declaration that can be
  wrong, and wrong about this one. Not fixed with the `shine` item on purpose: deciding
  which is right is its own measurement (which of an a\* difference and a chromaticity
  difference is the more stable within-image quantity), and `shine` is the worked
  example of what picking a side without measuring costs. The mechanism to pin the
  answer already exists — add a group to `ml/index-parity.json`. Noted 2026-09-19.
- [AI] **Three of the seven indices in `ml/skin_indices.py` still have their names
  pinned and their values unchecked, and checking the other two turned up a defect in
  each.** The registry is declaration-only: verified 2026-09-19 that **no pipeline
  script calls any of the seven functions** (`run_pipeline.py`, `calibrate.py` and
  `prepare_crop_dataset.py` all read the columns the app exported; the only callers are
  `ml/selftest.py` and the parity test). So each entry is a claim about what an index
  IS, and only a value contract can catch a false claim. `ml/index-parity.json` now
  covers `shine_ratio` (formula and path), `tone_evenness` (formula only) and, since
  cycle 17, `blemish_count`/`blemish_density` — **checked and it agrees exactly** on the
  quantities `detectBlemishes` actually produces, so it is pinned rather than fixed,
  including the two (area, face width) pairs one face gave at two capture resolutions so
  the invariance the third argument exists for is checked and not asserted.
  `relative_redness` is the item above. **`roughness_ratio` and `melanin_index` are each
  wrong, and neither is a one-liner** — see the two items below. `ita` is the only one
  left that is both unpinned and not yet known to be wrong; `docs/tone-ita-verification.md`
  checks the angle against two outside references, which is more than a parity row would
  give. Noted 2026-09-19.
- [AI] **`roughness_ratio` and `roughnessRatio` disagree at the guard, and it is the
  `shine_ratio` epsilon defect again.** Measured 2026-09-19 (cycle 17). Python is
  `region_highfreq / max(reference_highfreq, 1e-6)`; the app
  (`lib/skin.ts:1083`) is `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`. On a
  perfectly smooth forehead — reference high-frequency exactly 0 —

  ```
  python: 500000.0      app: 0
  ```

  and at a reference of 1e-7, just under the app's guard, the same pair. Above 1e-5 they
  agree. This is the mechanism cycle 16 measured on the oil axis, where
  `max(cheek_specular, 1e-6)` made the Python form read **24,691** against the app's
  **0.0674**: an epsilon clamp turns "no signal in the denominator" into an enormous
  ratio where the app publishes nothing. Two further differences in the same pair, both
  real: the app returns 0 when either region is missing (`n < 40`, or `meanL <= 1`),
  which Python has no concept of; and the app's inputs are each region's high-frequency
  energy **divided by that region's own mean L\***, which the Python docstring does not
  say. Not fixed here because the app's guard and the app's normalisation are what ships
  and the Python side is what should move — but "which side moves" is the decision
  cycle 16's whole entry exists to say should not be taken without measuring, and the
  measurement for this one is which guard produces a usable dryness reading on a smooth
  forehead, which needs faces. A parity group with the guard branches in it is the
  cheap half and can land first. Noted 2026-09-19.
- [AI] **`FEATURE_KEY` declares `melanin_index` to be `toneLstar`, and it is not — it is
  a nonlinear transform of it.** `FEATURE_KEY`'s own documented contract is "index id ->
  the feature key `lib/skin.ts` writes into every exported sample". `melanin_index` is
  `100 * log10(100 / max(lstar, 1.0))`; `toneLstar` carries L\* itself, so at
  L\* = 70 the index is **15.49** and the declared column holds **70**. Verified
  2026-09-19 that no TypeScript counterpart exists anywhere — the only match for
  "melanin" in `lib/` and `app/` is a prose comment in `lib/tone-bands.ts`. So this is
  the reverse of `cov`, which cycle 13 correctly left alone: `cov` has no Python index
  and therefore no declaration that can be wrong, while this has a declaration and no
  app-side value to declare. The fix is a decision, not an edit: either the app computes
  and exports a melanin index (a new field, which needs a reason beyond a test wanting
  one) or the registry records that this index is derived offline from `toneLstar`
  rather than carried by it, which means `FEATURE_KEY` needs a second kind of entry.
  Noted 2026-09-19.
- [AI] **The remaining win in a scan is the sRGB transfer curve, and taking it needs a
  measurement nobody has done.** Cycle 17 took the `a*`-only fast path and found it
  buys far less than the item it was filed under promised: `labAStar` still calls
  `Math.pow(., 2.4)` three times, and ablating that line takes 37-61% out of
  `detectBlemishes` (`C5` in `tests/scan-cost-benchmark.test.ts`), against the fast
  path's own 1.4-7.8%. So the curve is where the time is. It is not free: the
  inputs are `Math.min(255, channel * gain)`, floats, so a 256-entry table is an
  approximation; and `detectBlemishes` picks local maxima in `a*` and suppresses
  neighbours, so an error far below any threshold can still flip which cells survive.
  **The missing number is how far `a*` can move before `blemishCount` changes** — not
  "is the error small" but "is it smaller than the gap between the cells that survive
  and the cells that do not", which is a property of the fixture and of
  `BLEMISH.minResidual` and is measurable with the machinery already committed. Until
  that exists, any approximation of the curve is a guess about a published value.
  Noted 2026-09-19.
- [AI] **The 0.86 vision-confidence cap and the 0.8614 confidence gate are 0.0014
  apart and were chosen independently.** `mergeVisionAnalysis`
  (`app/scan/capture-analysis.ts`) sets `next.confidence = Math.max(base.confidence,
  Math.min(0.86, visionConfidence * 0.9))`, so a vision model reporting 0.9556 or more
  saturates at exactly 0.86 — which since cycle 14 is just under the 높음 gate. The
  consequence is defensible (the cap exists precisely so an over-confident LLM cannot
  claim certainty, and the `Math.max` still lets a well-separated ROI reading carry
  높음) but it is an accident rather than a decision, and a nudge to either constant
  moves a whole path's label at once. `tests/confidence-label-contract.test.ts` now
  pins the cap's value and that it sits below the gate, so neither can move alone
  unnoticed; what nobody has decided is where the cap SHOULD be relative to the gate,
  and that needs the vision path's confidences measured against real readings rather
  than reasoned about. Noted 2026-09-18.
- [AI] **The 120-seed retake table did not reproduce and the sweep that replaces it is
  now committed.** `ARU_PRINT_RETAKE_SWEEP=1 npx vitest run tests/retake-signal-rule.test.ts`
  re-derives it from cycle 11's written description. 반사 and 피부 영역 came back within
  a handful of seeds; 조명 did not, in both directions (dark oil 21/120 against 71/120,
  dark pores 120/120 against 4/120), because the fixture construction is a
  re-derivation and not the original script. The rule is unaffected — every condition
  still costs a published reading on a sixth of the seeds or more — but if anyone
  wants the ORIGINAL numbers back, the construction that produced them is gone and
  only a new measurement can settle it. Noted 2026-09-18.
- [AI] The ordinal floor is 0.40/0.40 and provisional — it was chosen from synthetic
  predictors because no labelled ARU validation set exists yet
  (`docs/ordinal-metric-verification.md`). The first real training run should report
  its own qwk and pearson and the floor should be re-set against those, not against
  the synthetic table. Do not raise it on a hunch, and do not lower it to make a run
  pass.
- [~] [AI] Share surface: audit `app/components/share-card.tsx` against what actually
  renders in KakaoTalk. **Partly answered** 2026-09-15 in `docs/share-preview-findings.md`
  — the structural half is settled, the Kakao-render half is not and needs a phone. The
  og tags are already correct and already static; the blocker is structural, not a bug.
  A per-result preview is impossible while the levels live in the URL fragment, which
  is the very thing that keeps them off the server. Kakao's own scraper spec could not
  be fetched (egress-blocked), so the Kakao-specific half of this item is now in BLOCKERS.
  The receiving half of the loop is now instrumented (`share_landed`).
- [AI] Decide the share-preview fork recorded in `docs/share-preview-findings.md`.
  Option B (levels in a query param) is the only way to a per-result card and it puts
  skin levels in server and messenger logs. Needs an owner call, not a loop decision.
- [AI] `viralActivation` now has a denominator but no baseline. Once any real traffic
  exists, read it before changing the share surface again.
- [OWNER] **Apply to the affiliate programmes** — 쿠팡 파트너스 (self-serve, accepts a
  website or app URL as the channel), 올리브영 쇼핑 큐레이터 (in-app, 7%/3%), 네이버 쇼핑
  커넥트 (5–28%, confirm a web service counts as a channel). Until then every out-click
  earns $0. This is the single highest-leverage item on the whole list. The in-product
  disclosure is already shipped and waiting on `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`.
- [OWNER] AI-Hub 71645 data application (domestic applicant, account required).
- [OWNER] Golden set: 20–30 real photos with two-operator consensus labels, so the
  camera thresholds come from faces instead of from a synthetic frame.

### Next

Items ticked `[x]` move to [`docs/autopilot-changelog.md`](autopilot-changelog.md)
once the work is merged, so this list is the open work and nothing else. `[~]` means
partly done and stays here.

- [AI] `blemishCount` is sensitive to a per-channel colour cast, and cycle 5's
  aliasing fix is what made it visible. `tests/skin-index-contract.test.ts` asserted
  `warmer.blemishCount === baseline.blemishCount` and was green at **2 == 2**: the
  point-sampling detector found the same 2 of the fixture's 5 discs in every condition,
  so the equality held by blindness rather than by invariance. With the stride window
  averaged the baseline finds all 5 and a `[1.12, 1, 0.92]` cast finds 3, while an
  exposure change of ×1.12 is still exactly invariant at 5. Dropping the gray-world
  gains from `detectBlemishes` changes neither number, so the cast moves the a*
  residual itself and this is pre-existing, not caused by the fix. Same cast and same
  synthetic face as the ITA cast sensitivity two items up — likely one remedy
  (a face-region illuminant estimate) for both, which is the argument for not patching
  the residual floor on its own. The test case now records the two counts exactly
  rather than asserting a property that is false. Noted 2026-09-16.
- [AI] Tone and dryness have no label source. Propose the smallest consented way to
  collect one, with the PIPA consequences spelled out; do not implement it alone.
- [~] [AI] Recommendation quality: the reasons are LLM-generated and efficacy-filtered,
  but nothing measures whether they are *useful*. Design a measurable proxy.
  **2026-09-17, cycle 9: the proxy exists and is unreadable, and those are two different
  states.** The funnel was one ratio short of having any number conditioned on the
  recommendation at all. `failurePreventionConversion` divides commerce clicks by
  COMPLETED SCANS, so a session that completed a scan and never opened `/report` is in
  its denominator and a survey-only session that saw a reco and clicked through is in
  neither half — it answers "does a scan lead anywhere", and it is untouched because
  other docs cite it. `recoCommerceRate` is sessions recording both `reco_viewed` and
  `commerce_clicked`, over sessions recording `reco_viewed`, conditioned the way
  `captureStart` is conditioned on `scan_opened`. In `FunnelSummary`, so both `/ops`
  panels have it from one definition, and rendered in both (checked, not assumed: the
  panels share `summarizeFunnel` but each names the fields it prints).
  Stays `[~]` for two reasons, neither of which a cycle can close. The ratio measures
  whether a session that saw the reasons opened a merchant link — not whether the
  reasons are good, and not a purchase. And it reads zero everywhere a human can see it
  until the flush is switched on, which is the PIPA blocker below: on-device it counts
  the operator's own browser, and the server-side panel has no rows to count.
  The known inflation is written into the code rather than only here:
  `commerce_clicked` also fires from `/care` (`placement` is `care` there, against
  `report_product` / `report_summary` on `/report`) and `/care` is reachable from the
  nav on every page, so a session that viewed the reco and later clicked on `/care` is
  in the numerator with no reco click in it. Not filtered by placement on purpose —
  the aggregate never selects `props` (`FUNNEL_AGGREGATE_COLUMNS`) and `FunnelCountable`
  has no field for them, so a placement filter would either widen that select list,
  undoing cycle 8's privacy narrowing, or make the two panels print different numbers
  under one label. It is a type error, not a preference. Pinned in
  `tests/funnel-reco-conversion.test.ts`.
- [AI] iPhone Safari camera matrix is code-verified but hardware-pending; extend the
  automated lifecycle coverage as far as it can go without hardware.
- [AI] `VISIBLE_MODEL_CONTRACT.inputSchemaVersion` has never actually changed. The
  constant still reads `2026-06-30.visible-face-crop.v1` under three "Bumped" comments
  (07-03, 09-14 and now 09-16), each recording a real change to feature semantics, so
  nothing downstream can tell one generation of collected features from another —
  `ml/prepare_crop_dataset.py` and `ml/run_pipeline.py` both record the string per row
  and it is the same string for all of them. Moving it also moves
  `public/models/visible-attributes/manifest.json`, which `tests/ml-registry.test.ts`
  pins to it, and that is guardrail 8 territory. Needs a deliberate decision about what
  happens to already-collected samples, not a one-line bump. Noted 2026-09-16.
- [AI] Illuminant correction for tone, done properly. Removing the gray-world gain
  stopped the background deciding the tone band, but an uncorrected warm lamp still
  moves the reading, which is the documented limit of ITA-from-a-photo. Doing better
  needs an illuminant estimate from the face region rather than the frame mean, and it
  would have to be applied identically in `lib/skin.ts` and `ml/ita.py` or it
  reintroduces exactly the split that was just closed. Noted 2026-09-16.
- [AI] The ITA band cut points (55 / 41 / 28 / 10 in `ml/subgroups.py`) are attributed
  to the Chardon convention and no primary source for them is reachable from this
  network. `docs/tone-ita-verification.md` establishes that ARU computes the *angle*
  correctly to 1.8e-02 degrees against two references; where to cut it is a separate
  question and stays unverified. Not urgent — nothing depends on moving them — but it
  should not be written down as verified. Noted 2026-09-16.
- [AI] **Illuminant correction for tone, done properly — the number is attached.**
  Removing the gray-world gain stopped the *background* deciding the tone band. An
  illuminant or device cast still moves it, now measured rather than waved at: a
  ±12% / −8% channel cast moves swatch-3 from `light` to `very_light`, and on the
  synthetic fixture (cheek `b* = 10.74`, low) a cool cast takes ITA from 61.8 to −87.6 —
  `very_light` to `brown_dark` — because ITA divides by `b*` and the cast pushes it
  through zero. Deep tones are the most stable, having the largest `b*`. Table in
  `docs/tone-ita-verification.md` §3. Not caused by the 09-16 change and not fixed by
  it (`ml/ita.py` has always had it), but it bounds what the stratifier can be used for:
  good enough to catch a model failing badly on darker skin in aggregate, not good
  enough to call one scan's band that person's tone. Doing better needs a **face-region**
  illuminant estimate, applied identically in `lib/skin.ts` and `ml/ita.py` or it
  reintroduces the split just closed. `docs/analysis-performance-roadmap.md` had an open
  item whose literal wording would have re-added frame-mean gray-world; it now points
  here. Noted 2026-09-16.
- [AI] The "do not pool feature generations" rule is documentation and nothing else.
  `fallbackVersion` moved to `roi-calibrated-2026-09-16` and the string is carried per
  row (`ml/prepare_crop_dataset.py`, `ml/run_pipeline.py`), but no ML script filters,
  groups or warns on it, and `ml/calibrate.py` has no version handling at all. So a
  pre-09-16 and a post-09-16 tone reading still land in the same subgroup cell and the
  same threshold fit. Cheapest useful version: a `coverage_warnings` entry when one run
  mixes generations. Noted 2026-09-16.
- [AI] `SampleMeta.toneBand` (`lib/labels.ts`) is declared and documented as "derived
  on-device from the ITA already measured during the scan", and is never written by any
  code path. `resolve_tone_band` prefers it over recomputing, so the comment describes a
  behaviour that does not exist. Populate it or delete it; leaving it is an invitation
  to populate it inconsistently later. Noted 2026-09-16.
- [AI] `toneSpread` is background-coupled at about 2% through the same frame-mean gains
  the tone path just stopped using — 0.052372 behind a blue wall, 0.053504 behind warm
  wood, on a face held byte-for-byte identical. It is a ratio, so this is second-order
  rather than the sign flip ITA suffered, and `tests/skin-index-contract.test.ts`'s
  `toBeCloseTo(…, 2)` hides it — but it is compared against cut points drawn *across*
  frames, so "within one frame" understates it. Pre-existing, same class one level down.
  Noted 2026-09-16.
- [AI] The ITA band cut points (55 / 41 / 28 / 10 in `ml/subgroups.py` and
  `lib/tone-bands.ts`) are attributed to the Chardon convention and no primary source
  for them is reachable from this network. `docs/tone-ita-verification.md` establishes
  that ARU computes the *angle* correctly to 1.8e-02 degrees against two references;
  where to cut it is a separate question and stays unverified. Nothing depends on moving
  them, but it must not be written down as verified. Noted 2026-09-16.
- [OWNER] Google Play Console identity, payment account, support email, App Signing.

## Blockers

Owner-only, dated when first recorded.

- 2026-09-14 — Affiliate programme sign-ups. No partner id exists anywhere in the
  codebase; `COMMERCE_LINK_OVERRIDES_JSON` is ready to receive real URLs.
- 2026-09-14 — AI-Hub 71645 data itself. Licence is `commercial_ok` on the owner's
  reading of the terms; the data still needs an approved application.
- 2026-09-14 — Real golden-set photos with consensus labels.
- 2026-09-14 — Physical-device QA: iPhone Safari matrix, Play internal track.
- 2026-09-15 — The share-preview fork in `docs/share-preview-findings.md`. Per-result
  link previews require moving the skin levels out of the URL fragment and into the
  request target, where ARU's server and the messenger's scraper both log them. PIPA
  consequence, owner decision.
- 2026-09-15 — Egress. This worker cannot reach `developers.kakao.com`, `ogp.me`,
  `www.rfc-editor.org`, `partners.coupang.com`, `adpartners.coupang.com`,
  `partner.naver.com`, `www.oliveyoung.co.kr` or `cdn.playwright.dev`. So the research
  track cannot verify Kakao's scraper spec or any affiliate commission term from a
  primary source, and the `3-10%` commission band in the revenue table above stays
  unverified. Either allowlist those hosts for the worker or the owner reads the terms.
  Re-probed 2026-09-15 and widened: `search.shopping.naver.com`, `www.coupang.com`,
  `global.oliveyoung.com` and `www.google.com` all refuse too (`CONNECT tunnel failed,
  response 403`), which is what stops the deep-link item, and so do
  `developer.mozilla.org`, `en.wikipedia.org`, `scikit-learn.org`, `arxiv.org`,
  `support.google.com` and `developers.google.com`. The second group was first recorded
  as `http=000`, which is the same refusal seen through a curl invocation that swallows
  the message — not a different outcome. Of everything probed only `pypi.org` answered
  (`http=200`), which is the one thing that made this cycle's metric verification
  possible at all.
  **Re-probed 2026-09-16 and narrowed in one place.** `raw.githubusercontent.com`
  answers with content (a real fetch of a repository README returned
  `http=200 bytes=75536`) and `api.github.com` returns `http=200`, while `github.com`'s
  own HTML pages return 403. `registry.npmjs.org` and `files.pythonhosted.org` answer
  too. So a cycle can now read a file out of a public repository, which was not true
  last cycle — useful for reading a library's source, and not a primary source for a
  paper, a statute, or a merchant's affiliate terms. None of those became reachable:
  `developer.mozilla.org`, `en.wikipedia.org`, `law.go.kr`, `www.kcs.go.kr`, `doi.org`,
  `www.ncbi.nlm.nih.gov` and `www.w3.org` all still refuse. Full probe output is in
  `docs/tone-ita-verification.md`.
- 2026-09-16 (re-stated 2026-09-17, and now the ONLY thing standing in the way) —
  **The legal basis for switching the funnel flush on.** Cycle 7 built the ingest
  endpoint, so every technical item on the §6 checklist in
  `docs/funnel-flush-design.md` is done except a real round trip against a staging
  Supabase, which needs credentials this environment does not have. What remains is
  this, and it is not a loop decision. `lib/funnel-flush.ts`
  ships off. Turning it on starts sending a persistent random `visitorId` next to
  behavioural events to ARU's own server, which is a new purpose that neither existing
  consent stream (`ai_analysis`, `learning_crop`) covers, and guardrail 4 forbids
  merging them. Whether PIPA requires a consent step or a legitimate-interest-style
  ground applies is an owner decision informed by an actual reading of the statute: both
  `www.law.go.kr` and `www.pipc.go.kr` refuse this network
  (`curl: (56) CONNECT tunnel failed, response 403`, probed 2026-09-16), so no cycle can
  settle it from a primary source and none should settle it from recall. The reasoning,
  labelled as recalled, is §5 of `docs/funnel-flush-design.md`. No new consent kind and
  no new consent flow was invented.
  **2026-09-17, cycle 8: the READ side now has the same missing half.** The aggregate
  read of `funnel_events` is verified against the real route handler with the Supabase
  client mocked at the query-builder level — which pins the select list, the
  `metadata->>source` filter, the row cap and the count semantics, and is what makes
  "never selects `visitor_id`" checkable. It has never run against a real Postgres, for
  the same reason as §6 step 4: no Supabase credentials exist in this environment. So
  the query shape is verified and the round trip is not, and that is stated rather than
  implied. The `count: "exact"` semantics the truncation report rests on were checked
  against PostgREST's own docs source and the installed `@supabase/postgrest-js`
  2.108.2 — §9.5 — which is the closest a network without a database can get.
  **2026-09-17, cycle 9: the recommendation's own conversion number now waits on the
  same thing.** `recoCommerceRate` is computed, tested and rendered on both `/ops`
  panels, and it will read the operator's own browser on one and zero rows on the other
  until this is answered. Nothing about the ratio is a reason to answer it differently:
  it counts sessions, reads no `props` and no `visitor_id`, and adds no field to what is
  collected or flushed. The flag was not touched.

- 2026-09-15 — Which host a real affiliate link lands on. The override allowlist in
  `lib/commerce.ts` accepts `www.oliveyoung.co.kr`, `search.shopping.naver.com`,
  `www.coupang.com` and `www.google.com`. A 네이버 쇼핑 커넥트 link is likely on a
  smart-store or brand-store host and a 쿠팡 파트너스 link on a redirect host, neither
  of which is on the list, and neither could be verified from here. It is a one-line
  change once the owner has a real link in hand — but it must not be guessed, because
  the allowlist is what stops `/api/out` becoming an open redirect. A wrong host now
  logs loudly instead of failing silently.

## How the schedule actually runs

A Routine that creates its own fresh session **cannot do this job**, and the reason is
worth keeping written down because it costs a day to rediscover.

`create_trigger` has no parameter for a repository source, so every session it spawns
starts with `sources: []`. A session without the repo declared as a source hits an
approval prompt the moment it writes to that repo, and an unattended session has nobody
to approve it, so it stops and goes idle. From the outside this looks like a run that
"succeeded": the routine records SUCCEEDED, the session burned real tokens, and nothing
was pushed.

Measured on 2026-09-15, four fires, four empty results:

| fire | model | ran for | output tokens | branch pushed |
|---|---|---|---|---|
| 09-14 21:26 manual | Sonnet 5 | 4m43s | 10,308 | none |
| 09-15 06:39 scheduled | Sonnet 5 | 1m54s | 4,617 | none |
| 09-15 13:20 manual | Opus 5 | 5m49s | 17,967 | none |
| 09-15 13:27 minimal push test | Opus 5 | 4m52s | 12,563 | none |

Then two sessions differing in exactly one variable:

| session | `source_url` | outcome |
|---|---|---|
| diag A | declared | pushed `diag/with-source` |
| diag B | absent | BLOCKED: `"confirm: proceed with git push to seonkistall/aru?"` |

So the working shape is:

```
Routine (cron)  ->  supervisor session (has the repo, GitHub MCP, push rights)
                       -> create_session(source_url=...) -> worker does the cycle, pushes a branch
                       -> supervisor reviews the diff, opens the PR, merges it
```

The worker gets a fresh context every cycle, which is the point. The supervisor does the
parts the worker cannot: review with tools the worker lacks, and merge.

Two things follow for anyone editing the Routine:

- Never move the cycle back into a fresh-session Routine without also solving the source
  declaration. It will silently do nothing.
- A run that ends in a few minutes having pushed nothing is this failure, not a fast cycle.

## Supervisor findings not yet actioned

Verified by the supervisor during a cycle, recorded here so the next one can pick them
up rather than rediscover them.

- [x] **2026-09-15 — `confidenceLabel` exists twice, byte-for-byte.** ~~A latent
  divergence: change one threshold and the vision-API path disagrees with the ROI path,
  silently.~~ Actioned 2026-09-16 as the contract test the finding asked for, not a
  refactor — the two functions stay where they are, each gains a comment pointing at
  the other, and both are exported only so `tests/confidence-label-contract.test.ts`
  can hold them together. It sweeps 0→1 in 0.0005 steps plus both boundaries at ±1e-9
  and ±1e-12 plus four out-of-range values, and asserts equality, monotonicity, that
  each function uses all three labels (so they cannot agree by both going constant),
  and that the two boundaries sit in the same place to 12 decimals. Deliberately pins
  the *agreement*, not the numbers, because the open item below may yet move the
  thresholds or drop the label to two levels — whatever it decides has to be decided in
  both places. Verified by drifting one copy to 0.80: 42 of 2013 sweep values disagree
  and 2 of the 4 cases fail.

## Recent cycles

The last three cycles in full, which is what stops a cycle redoing last night's work.
Everything older is in [`docs/autopilot-changelog.md`](autopilot-changelog.md),
unchanged and complete — a cycle does not need to read it to do a cycle.

- 2026-09-19 (cycle 17) — Branch `autopilot/2026-09-19-1239`. **The `rgbToLab` fast
  path is taken, and the number it was filed under is wrong. `a*`-only buys 1.4-7.8% of
  `detectBlemishes`, not 53-59%; the sRGB transfer curve, which no `a*`-only path can
  touch, is 37-61%. Exact cross-language equality is measured and does not hold, so the
  parity table gains its first tolerance — 1.472 units observed over 268,877 inputs,
  4 committed.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **535 passed in 82 files**, `python3 ml/selftest.py`
  **Ran 78 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **Step 1, before anything changed: how far apart are the two languages?** Cycle 16
  left this open in exactly these words — "`rgbToLab` involves `pow` and a matrix, where
  exact cross-language equality is **not** guaranteed the way it is for four arithmetic
  operations". It is not, and it does not hold. Over **268,877 inputs** — a 5-step grid
  over the whole sRGB cube plus 120,000 floats of the shape `detectBlemishes` feeds —
  V8 and CPython 3.11 agree **bit for bit on 63-80%** of them, and where they differ the
  worst case anywhere is **1.4720** units of `channelScale * 2^-52`, with the median
  exactly **0** in every channel and every family. The measurement is two committed
  commands, not a paragraph: `ARU_LAB_PARITY_DUMP=... npx vitest run
  tests/lab-parity-sweep.test.ts` then `python3 ml/lab_parity_sweep.py`.

  The unit is where the number comes from rather than a convenience. `a* = 500 * (f(x)
  - f(y))` subtracts two quantities of order 1 and multiplies by 500, so a last-place
  error in either `f()` arrives in `a*` scaled by 500 and by nothing else — which is why
  the worst case lands just above one such unit instead of anywhere else.

  **And the decomposition says which transcendental, which turned into a finding about
  `ml/ita.py` nobody was looking for:**

  ```
  pow   V8 vs c ** 2.4 (as shipped)    exact 3820/4256 ( 89.8%)  worst 1 ulp
  cbrt  V8 vs t ** (1/3) (as shipped)  exact 4027/5000 ( 80.5%)  worst 2 ulp
  cbrt  V8 vs math.cbrt                exact 2289/5000 ( 45.8%)  worst 3 ulp
  ```

  `math.cbrt` is the better cube root — CPython 3.11 added it precisely because
  `t ** (1/3)` is not one — and swapping `ml/ita.py` to it would make the two languages
  agree **less** often, 45.8% against 80.5%. "More correct" and "agrees with the app"
  are different goals here. `ml/ita.py` keeps `t ** (1 / 3)`, now for a measured reason
  rather than by inheritance.

  **So the tolerance is `toleranceK * channelScale * 2^-52`, k = 4**, built from two
  committed integers rather than typed as a float so it cannot be widened by editing a
  digit. 4 is the smallest integer above what the mechanism bounds (about 3 units: one
  last place from each of the two `f()` calls, plus the `pow` errors attenuated through
  a cube root), and 1.472 observed sits inside that. What it still cannot hide: in `a*`
  it is **4.44e-13** against a `BLEMISH.minResidual` of **1.6**, twelve orders of
  magnitude, while the defect this file exists to catch moves values by whole units —
  `shine_ratio` read 24,691 where the app read 0.0674. **11 of the table's 20 rows
  actually disagree**, and three of them are the sweep's own worst inputs, so the
  tolerance is exercised rather than declared.

  **Step 2: taken, and the framing corrected.** `labAStar` computes `a*` and skips `z`,
  the third `f()` and the object. It is **not a second formula**: `rgbToLab` calls it,
  so `a*` has one implementation in `lib/skin.ts` and the two cannot drift by
  construction. The partial duplication cycle 16 warned about is declared out loud in
  `ml/index-parity.json` — `computes: ["a"]`, `doesNotCompute: ["l", "b"]`,
  `fastPath.python: null`, because nothing in the Python pipeline wants `a*` alone.

  **The measurement that makes this cycle worth more than the change.** Over eight runs
  x four frame sizes, paired and order-alternating:

  | | saved, ms/frame | % of detectBlemishes | positive |
  |---|---|---|---|
  | 400x480 | +0.048 .. +0.274 | +1.4 .. +7.6% | 8/8 |
  | 720x960 | +0.082 .. +0.317 | +2.1 .. +7.8% | 8/8 |
  | 1080x1440 | +0.115 .. +0.319 | +2.5 .. +6.3% | 8/8 |
  | 1440x1920 | −0.075 .. +0.174 | −1.3 .. +3.3% | 6/8 |

  **Not resolvable at 1440x1920 and not claimed there.** The grid is the same 18,291
  cells at the three larger sizes, so `labAStar` runs the same number of times and the
  growing pixel pass dilutes it into the noise. Per scan, three burst frames: roughly
  0.15 to 0.95 ms off a scan costing 6.6 to 11.6 ms.

  **Against that, the part no `a*`-only path can reach — 32 of 32 positive, never inside
  its own spread:**

  | | removed, ms/frame | % of detectBlemishes |
  |---|---|---|
  | 400x480 | +1.645 .. +2.054 | 59.4 .. 61.0% |
  | 720x960 | +1.917 .. +2.312 | 51.6 .. 55.5% |
  | 1080x1440 | +1.828 .. +2.303 | 41.7 .. 47.1% |
  | 1440x1920 | +1.843 .. +2.376 | 37.3 .. 41.4% |

  Cycle 15's "53-59% of a scan" was a true statement about `rgbToLab` whole, and the
  backlog item that carried it read as though a fast path could capture it. It cannot:
  that ablation replaced the call with `{ l: L, a: r - g, b: g - b }`, removing the
  three `Math.pow(., 2.4)` calls, and an `a*`-only path keeps all three.
  `docs/scan-cost-measurement.md` §5 now carries the correction where the old number is.

  **One benchmark hazard found by tripping over it, and closed.** Measured the obvious
  way — the statically imported `detectBlemishes` against one freshly loaded ablated
  module — the "saving" changed sign between frame sizes AND between runs: −23.3% at
  1440x1920 in one run, +6.1% at 720x960 in the next. The shipped build had already been
  driven through V8's tiers by four earlier sections of the same sweep while the ablated
  one was fresh. `C4` now builds an UNCHANGED copy too and times two freshly loaded
  modules, alternating which runs first within each repeat, and reports the median of
  the PAIRED differences rather than the difference of two medians. The first
  arrangement was measuring the benchmark's own history.

  **No published value moved, and it is checkable rather than asserted.** `labAStar`
  computes `a*` with the identical sequence of doubles, so the result is not close to
  the old one, it **is** it. The proof is that the pins did not have to move: applying
  the change gave **one** failure in 535 — `tests/scan-cost-benchmark.test.ts:232`,
  `expect(source).toContain(LAB_CALL)`, the source text of an ablation needle the change
  necessarily reworded. `blemishCount` and `blemishDensity` at four frame sizes stayed
  green **untouched**, and so did every absolute-value pin in
  `tests/skin-index-contract.test.ts`, `tests/shine-exposure-scale.test.ts` and
  `tests/axis-exposure-scale.test.ts`. `fallbackVersion`, `ATTR_THRESHOLDS`,
  `inputSchemaVersion` and the manifest are untouched; guardrail 8's `status` and
  `promotionGate` are byte-identical. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent
  kind or flow invented.

  **Eight new cases — seven in vitest, one in `ml/selftest.py` — and ten breaks**, each
  altering the SOURCE line the case protects and reverted from a file copy. Seven here,
  two more with the second item below, and one recorded after them because it did not
  fire the first time:

  ```
  labAStar 500 -> 500.0000001         3 fail; expected 0.0052604999593560105 to be
                                      0.00526049995830391 (a* row, fast-path row, and
                                      the source pin on the 500)
  rgbToLab stops delegating a* and     2 fail; expected 0.0035069753741012732 to be
    recomputes it with 0.95048         0.00526049995830391
  ml/ita.py white point 0.95048        1 fail; 0.001753524584202637 not less than or
                                       equal to 4.440892098500626e-13 : cube: white
  ml/ita.py f() knee 0.008856 -> 0.008 1 fail; 0.01596509300618365 not less than or
                                       equal to 1.0302869668521453e-13 : knee: f()
                                       linear segment, y below 0.008856
  srgbLinear reworded onto two lines   1 fail (default) + Error: skin-no-srgb-pow: the
                                       line moved; the ablation measures nothing
  call site reverted to rgbToLab       1 fail; expected source to contain
                                       'astar[gy * gw + gx] = labAStar('
  toleranceK 4 -> 40                   ts: expected 40 to be 4; py: 40 != 4
  ```

  The fourth is the one worth recording: the `knee: f() linear segment` row was added
  because a branch could move in one language only, and that is exactly the break it
  caught — a tolerance of 1e-13 against a disagreement of 1.6e-02.

  **Second item: the "five unpinned indices" item, and checking two of them properly
  cost one pin and found two defects.** `blemish_count` / `blemish_density` **agrees
  exactly** on the quantities `detectBlemishes` produces, so it is pinned rather than
  fixed — a negative result recorded as one, the way `tone_evenness` was. Its 8 rows
  include the two (area, face width) pairs one synthetic face gave at 400x480 and
  1440x1728, so the resolution invariance the third argument exists for is checked and
  not asserted, and a degenerate row that exercises both languages' guards, which sit in
  different places. It is keyed by the REGISTRY id `blemish_count` while the function is
  `blemish_density` and the column is `blemishDensity` — three names for one index, now
  visible in the table rather than discovered from a `KeyError`.

  The other two are wrong, and both are filed with their numbers rather than patched:

  - **`roughness_ratio` is the `shine_ratio` epsilon defect again.** Python is
    `region_hf / max(reference_hf, 1e-6)`, the app is
    `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`. On a perfectly smooth forehead the
    two read **500000.0** and **0**. Exactly the mechanism that made the rejected
    `shine_ratio` read 24,691 against 0.0674. Two more differences in the same pair: the
    app returns 0 when a region is missing, and the app's inputs are each region's
    high-frequency energy divided by that region's own mean L\*, which the Python
    docstring does not say.
  - **`FEATURE_KEY` declares `melanin_index` to be `toneLstar` and it is not.** The
    contract is "the feature key `lib/skin.ts` writes into every exported sample";
    `melanin_index` is `100 * log10(100 / L*)`, so at L\* = 70 the index is **15.49**
    and the declared column holds **70**. No TypeScript counterpart exists anywhere —
    the only "melanin" in `lib/` and `app/` is a prose comment. The reverse of `cov`,
    which cycle 13 correctly left alone: `cov` has no declaration that can be wrong,
    this has a declaration and no value to declare.

  Two more breaks for the pin, on top of the seven above:

  ```
  app areaFace drops the face-width   1 fail; expected source to contain
    normalisation                     'return { count, areaFace: (validCells...'
  python blemish_density reverts to   2 fail; 142.7483821850019 != 2.960030452988199 :
    the raw-pixel denominator         one face at 400x480, and the pre-existing
                                      resolution-invariance case with it
  ```

  **The tenth break did not fire, and that is worth having.** "agrees with the fast path
  on every input in the sweep, bit for bit" is the case that carries the whole
  no-reading-moved argument, and the obvious way to break it — make `rgbToLab` compute
  `a*` inline instead of calling `labAStar` — leaves all 268,877 inputs **passing**,
  because the inline expression is the identical sequence of doubles and therefore the
  identical double. The case pins that the two AGREE; it does not pin that one calls the
  other. Perturbing the inline copy's white point to 0.95048 fires it
  (`Error: labAStar disagrees with rgbToLab at 0, 0, 5`), which is the real shape of
  what it guards. What pins the delegation itself is the source-text assertion in
  "states a tolerance that is derived, small, and cannot be widened by a digit", and
  that is now the reason it is there rather than a nicety.

  **Verification before the push**, all four re-run on the final tree: vitest
  **542 passed in 83 files** (535 + 7 new, across three files), `python3 ml/selftest.py`
  **Ran 79 tests ... OK** (78 + 1), `npx tsc --noEmit | grep -c "error TS"` **13**
  unchanged, `npx eslint .` **2 warnings** both in `lib/care.ts` unchanged,
  `npm run smoke` green — `Smoke test passed.`,
  with its own vitest 542, `ml/selftest.py` 79, and 44 mobile E2E specs passed in 2.8m
  behind the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override the protocol records.

- 2026-09-19 (cycle 16) — Branch `autopilot/2026-09-19-0639`. **The two `shine`
  formulas are one formula. The app's won, on five independent grounds, and the thing
  that let them drift at all is closed with a value contract rather than another name
  check.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **518 passed in 80 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The decision, measured on faces, not argued.** `tests/shine-formula-decision.test.ts`
  is committed and re-runnable (`ARU_PRINT_SHINE_DECISION=1`); both tables are in
  `docs/shine-formula-decision.md`. Five findings, each of which settles it alone:

  1. **The rejected form had no second input.** `cheek_specular` is not a field of
     `SkinRawFeatures` and never has been — `tzoneSpecular` is exported and there is no
     cheek counterpart. It could not be computed from an ARU export at all; the
     measurement had to call `sampleRegion` directly to obtain it.
  2. **Nothing ever called it.** `run_pipeline.py`, `calibrate.py` and
     `prepare_crop_dataset.py` all read the app's `shine` column straight out of the
     export; the only caller of `shine_ratio()` was `ml/selftest.py`.
  3. **Degenerate on a matte cheek.** A correctly-exposed matte cheek has not "few"
     pixels above the 218 cut but exactly **zero**, so `max(cheek_specular, 1e-6)` is the
     epsilon and the reading is `tzoneSpecular x 1e6`: **24,691** where the app reads
     **0.0674**. One cheek pixel in 81 crossing the cut moves it by
     `(1 / 1e-6) / 81 = 12,345.7`, to 2.0. The app's index does not move at all.
  4. **Wrong sign.** Holding the T-zone and adding oil to the cheek: 24,691 -> 2.0 ->
     1.0 -> 0.4. An all-over-oily face reads matte.
  5. **Blind to the brightness gap**, which is most of the oil signal on skin that is
     not actively glinting. Three faces with no glint and T-zone/cheek contrast
     1.00 / 1.08 / 1.20: the app reads 0.0000 / 0.0427 / 0.1103 and publishes two
     different levels; the rejected form returns **exactly 0 for all three**. Over the
     whole 60-row sweep it publishes only levels 0 and 2 — its middle band needs the
     cheek to be 6 to 20 times oilier than the T-zone — while the app uses all three.

  **And the one property it WAS asserted to have is false on a frame.** `ml/selftest.py`
  checked `shine_ratio(0.30, 0.10) == shine_ratio(0.30x1.7, 0.10x1.7)`: true of two
  numbers that both scale, and a specular ratio does not scale — it is the share of a
  patch above a *fixed* cut. One face, ramped highlights so the specular fraction
  responds to exposure the way a real capture does:

  ```
  cheekL   tzSpec    ckSpec     app shine     rejected  signals failed
    92.0  0.000000  0.000000    0.094300     0.0000e+0  -
   115.0  0.000000  0.000000    0.094204     0.0000e+0  -
   138.0  0.000000  0.000000    0.094317     0.0000e+0  -
   161.0  0.049383  0.000000    0.143483     4.9383e+4  -
   184.0  0.444444  0.000000    0.528755     4.4444e+5  반사
   206.0  0.740741  0.259259    0.809682     2.8571e+0  반사,노출 여유
   223.7  0.987654  0.654321    1.040119     1.5094e+0  조명,반사,노출 여유
  ```

  Across the four captures **every signal accepts** — nothing asks for a retake — the
  rejected form runs **0 -> 49,383**. The app's index holds **within 0.12% across a 1.5x
  exposure range** and then moves at 161 because the T-zone genuinely started to glint.

  **So `ml/skin_indices.py` moved to the app's formula** —
  `shine_ratio(tzone_specular, tzone_luminance, cheek_luminance)`, with
  `SHINE_REFERENCE_CHEEK_L = 140.0` mirroring `lib/skin.ts` — **and `ml/selftest.py`'s
  invariance case moved with it and narrowed on the way**: the gap term is Weber
  contrast and cancels a gain applied to both luminances exactly, at three gains; the
  specular term is passed through rather than asserted invariant, because the table
  above is what happens when you assert that it is.

  **No published value moved.** `lib/skin.ts`'s expression was extracted into an
  exported `shineIndex(tzoneSpecular, tzoneL, cheekL)` **byte-for-byte unchanged**, so
  there is one formula for both languages to agree with; the absolute-value pins in
  `tests/shine-exposure-scale.test.ts`, `tests/axis-exposure-scale.test.ts` and
  `tests/skin-index-contract.test.ts` are what prove it. `ATTR_THRESHOLDS`,
  `fallbackVersion`, `inputSchemaVersion` and the manifest are untouched; guardrail 8's
  `status` and `promotionGate` are byte-identical. The Python function was never on a
  path that produced a published value — finding 2 is what makes that checkable rather
  than asserted. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented.

  **The contract that compares VALUES.** `tests/skin-index-contract.test.ts` pins NAMES
  and stayed green from 2026-09-14, when `ml/skin_indices.py` was added, to 2026-09-19,
  while the values diverged — five days, and only because a cycle read both files side
  by side, not because anything checked. Names were never what could drift. Python and TypeScript cannot call each other here — vitest in node,
  `unittest` in `python3`, no bridge and no network — so the cheapest honest check is a
  committed table: **`ml/index-parity.json`**, asserted by `tests/index-parity.test.ts`
  AND by `ml/selftest.py`, neither able to move alone. Three things make it a contract
  rather than a snapshot: the expected values are literals compared **exactly** (`+`,
  `-`, `*`, `/` and `sqrt` on doubles are correctly rounded, so a matching
  implementation matches bit for bit — not `toBeCloseTo`); **16 of the 22 shine rows are
  real readings** carrying the recipe of the frame that produced them, and the
  TypeScript side rebuilds each frame and checks the whole path through `analyzeSkin`,
  so moving which patch `tzoneSpecular` is measured over cannot leave them green; and
  six rows are edge branches a face family cannot reach.

  **Second item, and it came out of checking the first properly: the registry is
  declaration-only, and one more entry in it is wrong.** No pipeline script calls ANY of
  the seven index functions — so each is a claim about what an index IS, and only a
  value contract can catch a false claim. `tone_evenness` has claimed in its docstring
  since 2026-09-14 to be "the same formula as `relativeSpread` in `lib/skin.ts`", which
  is exactly the kind of claim that turned out false for `shine_ratio` and was equally
  untested. **It is true** — both are `sqrt(variance) / abs(mean)` with the same two
  guards, differing only by a non-numeric filter Python needs and TypeScript's types
  make unnecessary. So it is pinned rather than fixed: a second group in
  `ml/index-parity.json`, 10 rows, `relativeSpread` exported for the test. A negative
  result recorded as one. It is pinned **less deeply** and that is stated rather than
  implied: its inputs are the four region L* values, which `SkinRawFeatures` does not
  export, so the rows pin that the two implementations agree on the same inputs and do
  not pin what reaches them. Adding a field so a test could go deeper is adding a field
  for the wrong reason.

  **What is NOT fixed, and is now dated rather than rediscovered.** `relative_redness`
  is the same defect as `shine_ratio`: `FEATURE_KEY` declares it to be `relRedness`,
  Python returns an a* difference and the app returns a difference of red chromaticities
  — different colour space, different scale, one declared field. Cycle 13 recorded
  "nothing to keep in step" about this pair; right about `cov` (no Python index, so no
  declaration to be wrong), wrong about this one. Not fixed here because deciding which
  is right is its own measurement and `shine` is the worked example of what picking a
  side without one costs. Three backlog items filed: this, the five still-unpinned
  indices, and `rgbToLab` — which cycle 15 called a backlog item inside its cycle entry
  and never actually added to the backlog, so it would have rotated out of this file and
  been lost.

  **Does settling this change the `rgbToLab` decision?** It changes what it looks like
  and does not settle it. Cycle 15 declined the largest remaining win in a scan partly
  because a second near-duplicate of a function with a cross-language twin is "exactly
  how `shine_ratio` and `shine` became two formulas under one name". That named the
  right risk and the wrong remedy: what let the split survive was that nothing compared
  values, and `ml/index-parity.json` shows that costs one group and a test case. Two
  things it does not remove — a fast path returning only `a` is a PARTIAL duplicate, so
  the table must say which outputs it does not compute; and `rgbToLab` involves `pow`
  and a matrix, where exact cross-language equality is **not** guaranteed the way it is
  for four arithmetic operations, so a tolerance would have to be chosen and justified.
  Smaller than it was, still not a one-liner. Not taken, on purpose.

  **One verification hazard found by tripping over it, and closed.** Breaking a Python
  source line and re-running `ml/selftest.py` can report the PREVIOUS edit's result:
  Python invalidates bytecode on (mtime, size) at one-second granularity, and
  `SHINE_REFERENCE_CHEEK_L = 140.0` -> `139.0` -> restored is two same-size edits inside
  one second. A restored file kept failing with `139.0 != 140.0` until `ml/__pycache__`
  was deleted by hand, which means two of this cycle's break results were wrong when
  first read and were redone. `ml/selftest.py` now sets `sys.dont_write_bytecode = True`
  with the measurement in the comment. A stale green would be worse than the stale red
  that exposed it.

  **Every new case broken at the SOURCE line it protects**, 13 breaks, each reverted
  from a file copy, and **two of them found real gaps in the tests rather than
  confirming them**:

  ```
  shineIndex 140/255 -> 140/254     3 fail; expected 0.3262545674114569 to be
                                    0.32594342628532147
  shineIndex loses max(0, ...)      1 fail; T-zone darker than the cheek: the gap clamps
                                    at 0: expected -0.1568627450980392 to be +0
  skin_indices.py reverted to the   2 errors; TypeError: shine_ratio() takes 2 positional
    rejected form                   arguments but 3 were given, + 1 TS source pin
  SHINE_REFERENCE_CHEEK_L 139.0     2 fail; AssertionError: 139.0 != 140.0
    in python only
  one shine row perturbed 1e-12     1 py + 2 ts fail; 0.14143110985736712 !=
                                    0.14143110985836713
  python gap loses max(0, ...)      2 fail; -0.1568627450980392 != 0.0
  specular cut 218 -> 210           1 fail; expected 3 to be greater than or equal to 4
  cheekSpecular added to            1 fail; expected 'export type SkinRawFeatures…' not
    SkinRawFeatures                 to contain 'cheekSpecular'
  run_pipeline.py calls             1 fail; run_pipeline.py calls shine_ratio
    shine_ratio(
  relativeSpread variance / (n-1)   2 fail; expected 0.18399148175369934 to be
                                    0.15934129727864463
  one toneSpread row perturbed      1 py + 1 ts fail; 0.15934129727864463 !=
                                    0.15934131321277437
  python tone_evenness guard        1 fail; 0.5 != 0 : mean 2e-7, just inside the 1e-6
    1e-6 -> 1e-12                   guard
  TS relativeSpread guard           1 fail; expected 0.5 to be +0
    1e-6 -> 1e-12
  ```

  The guard break is the one worth recording. It **passed on the first attempt** — the
  two rows meant to locate the 1e-6 mean guard were `[0,0,0,0]` and
  `[-1e-7, 1e-7, -1e-7, 1e-7]`, and both have a mean of exactly zero, so moving the
  guard to 1e-12 left the whole table green. Replaced with a pair that straddles it
  (mean 2e-7 and mean 2e-6), and the break then failed in both languages. Exactly what
  "break it on purpose" exists to catch, and the second cycle running that it caught a
  case that was green by blindness.

  Verification on this branch: vitest **534 passed in 82 files** (from 518 in 80),
  `python3 ml/selftest.py` **Ran 78 tests ... OK** (from 77), `npx tsc --noEmit |
  grep -c "error TS"` **13** unchanged, `npx eslint .` **2 warnings** both in
  `lib/care.ts` unchanged.


  **Supervisor, same day — the contract bites in both directions, and the cycle's
  sharpest finding is one the review did not have.** The reviewer went in with three
  independent grounds for rejecting the Python form, derived before reading the branch:
  it is degenerate (on a matte cheek `0.05 / 1e-6 = 50000`, and a cheek at exactly 0 and
  at 1e-6 read the same, so the value is a property of the clamp); it INVERTS the oil
  ranking at ordinary values (a matte cheek with mild T-zone shine reads 50000 against
  1.5 for a face shiny in both regions, while the app ranks the second above the first by
  4.68); and it is uncomputable, because `grep -rn "cheek_specular\|cheekSpecular"` over
  the tree returns exactly two hits, both inside the Python function's own body — the
  second argument is not a field ARU records anywhere.

  The cycle found a fourth that beats all three: **the deleted `ml/selftest.py` case
  asserted invariance under a transformation an exposure change never performs.** It
  scaled both specular ratios by a gain, but a specular ratio is a count fraction above
  the 218 cut. Measured on a graded highlight, `tzoneSpecular` reads 0.00000 at cheekL
  92.0, 115.0, 138.0 and 161.0 — the whole correctly-exposed range — then 0.39506,
  0.70370, 0.95062. Zero times any gain is zero, so the old case could not even be
  applied where the product reads faces; and where the quantity does move, cheekL
  184.0 to 206.0 is an exposure ratio of 1.12 against a specular ratio of 1.78. Added as
  a case and a table rather than left as the branch's (correct) one-line argument;
  moving the specular cut to 150 fails it with `expected 1 to be greater than or equal
  to 4`.

  **The parity contract is real, checked in both directions.** Changing
  `SHINE_REFERENCE_CHEEK_L` in `ml/skin_indices.py` alone fails `ml/selftest.py` with
  `AssertionError: 0.11764705882352942 != 0.10980392156862746`; changing it in
  `lib/skin.ts` alone fails `tests/index-parity.test.ts` with `expected 150 to be 140`
  across three cases. `ml/index-parity.json` is a committed table both runners assert
  against, which is the shape the name-level contract could never have been.

  **No published value moved, verified rather than accepted.** `analyzeSkin` was run on
  three faces on this branch and on main `18be007`: `shine`, `relRedness`, `cov`, all
  three published levels and `confidence` are identical to six decimal places on every
  one. So leaving `fallbackVersion` and the manifest untouched is correct, not an
  oversight. Rotation: 12 differing lines, all of them the body of the one item this
  cycle closed, now in the changelog rewritten as its outcome.
- 2026-09-19 (cycle 15) — Branch `autopilot/2026-09-19-0039`. **A scan costs 6.6-11.6ms
  a frame on this box, `detectBlemishes` is 79-87% of it, and cycle 14's per-pixel branch
  is 58µs of it. The brief's premise about where that branch runs was wrong, and the
  measurement is what showed it.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **509 passed in 79 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The correction first, because it changes what the question means.** The brief put
  cycle 14's clipped-channel branch "in a loop that runs per region, per frame, on a
  650ms MediaPipe cadence". It does not. `sampleRegion` is reached only from
  `extractRawFeatures`, and the only non-test callers of that are `analyzeSkin` (`/eval`)
  and `analyzeSkinBurst` (**once per scan**, over **at most three** burst frames —
  `for (let i = 1; i < 3; i += 1)`). The 650ms tick runs `evaluateCapturedQuality` ->
  `evaluateSkinRoiQuality` in `app/scan/skin-roi-quality.ts`, which takes only the
  `SAMPLING_LANDMARKS` constant from `lib/skin.ts`. So the branch runs 6 regions x 3
  frames per scan, not per preview tick, and the budget it is measured against is the
  scan's, not the tick's. Pinned as a case so the next cycle does not re-derive it wrong.

  **The second structural fact, counted rather than timed: `sampleRegion` does not scale
  with frame size.** It reads a 9x9 patch around each landmark in six lists — 56 patches,
  81 pixels, **4,536 pixels per frame**, identical at 400x480 and at 1440x1920. Only
  `detectBlemishes` reads pixels in proportion to the face, and even it walks a grid of a
  fixed ~90 cells across the face width. Four runs of the committed benchmark, medians of
  7 repeats each, ranges spanning all four runs:

  ```
  frame        analyzeSkin   burst(3f)   6xsampleRegion  frameGains  detectBlemishes
  400x480      6.60-6.86ms   19.7-20.4   1000-1025us     22us        5.21-5.34ms
  720x960      8.03-8.35ms   24.3-24.7   1007-1015us     20us        6.81-6.86ms
  1080x1440    9.53-10.02ms  28.7-29.0   1003-1020us     20us        8.12-8.27ms
  1440x1920   11.39-11.63ms  34.4-35.3    978-995us      20us        9.92-10.17ms
  ```

  The face box grows **14.4x** down that table; `sampleRegion` moves **4.8%** and
  `detectBlemishes` **1.9x**. Over the three rows sharing an 18,291-cell grid,
  `detectBlemishes` fits **5.8ms fixed + 6.9ns per face-box pixel** — so at 720x960 the
  whole pixel pass is about 1.0ms of 6.8 and the rest is per-cell work at ~315ns a cell.

  **Cycle 14's branch, isolated against a build of `lib/skin.ts` with exactly that line
  removed** — the shipped function, not a copy, and the sweep throws rather than
  measuring nothing if the line is reworded. Sixteen measurements, four runs x four frame
  sizes, **all positive**: **44.1-72.5µs a frame, median 58.4µs**, i.e. 9.7-16.0ns a
  pixel and **~175µs a scan, 0.7% of `analyzeSkinBurst` at 720x960**, constant in frame
  size. Read as an **upper bound**: deleting the line also deletes the `clipped`
  accumulator and shrinks the body, which moves V8's inlining, and 12.9ns for three
  integer comparisons is well above what the comparisons alone can cost. Stated rather
  than hidden, and so is this — an EARLIER arrangement of the same benchmark could not
  resolve it at all (deltas ±15µs, sign changing between frame sizes). A difference this
  small is sensitive to how the benchmark is laid out; the number to trust is the one the
  committed file reproduces, which is why it is committed.

  **What the measurement found instead, and the one change taken.** The non-skin
  exclusion test ran all ~42 `NON_SKIN` points against each of ~18,000 grid cells.
  `cy` depends only on the row, so a point further than `excludeR` in y alone can never
  be within `excludeR`, and the predicate is a plain OR over the points: dropping those
  once per row is **exactly the same test**. Measured by rebuilding `lib/skin.ts` with
  the loop it replaced, after asserting both builds return the same count AND the same
  area:

  ```
  frame        row-filtered      point-by-point    saved/frame   saved/scan (3f)
  400x480      5.18-5.43ms       7.47-8.43ms       2.19-3.00ms   6.6-9.0ms
  720x960      6.61-6.83ms       8.93-9.75ms       2.33-2.92ms   7.0-8.8ms
  1080x1440    7.99-8.22ms       9.84-10.64ms      1.86-2.41ms   5.6-7.2ms
  1440x1920    9.99-10.21ms     11.01-11.83ms      0.99-1.62ms   3.0-4.9ms
  ```

  **No published value moves**, which is the condition on a performance change here.
  `fallbackVersion`, `ATTR_THRESHOLDS`, `inputSchemaVersion` and the manifest are all
  untouched; guardrail 8's `status` and `promotionGate` are byte-identical. Two guards,
  both default cases: `blemishCount`/`blemishDensity` pinned to the values the
  PRE-change build produced (measured on that build, not assumed) on a fixture whose
  discs sit inside the nostril group's exclusion band in y, and the two predicates
  re-derived over the real grid at five radii and asserted to mark the same cells.
  Reverting the row filter leaves the count pin GREEN — that is the proof — and fails
  only the source pin.

  **The bigger hot spot is filed, not taken.** `rgbToLab`, once per valid cell, is
  **3.91-6.20ms — 61-75% of `detectBlemishes` and 53-59% of a whole scan**. The obvious
  win is unavailable: its inputs are `Math.min(255, channel * gain)`, floats not
  integers, so a 256-entry transfer-curve table is an approximation and an approximation
  moves `blemishCount`. The other win — `detectBlemishes` reads only `lab.a`, so `fz`
  and the `z` dot product are dead — needs a second entry point beside a function
  `ml/ita.py` already mirrors, and a near-duplicate of a function with a cross-language
  twin is exactly how `shine_ratio` and `shine` became two formulas under one name.
  Backlog item, not a quiet third copy.

  **The fixture had to be rebuilt before any of this was a measurement.** Every existing
  skin fixture in the repository collapses all thirteen T-zone landmarks onto ONE point,
  so `sampleRegion` reads the same 81 pixels thirteen times out of L1; and with the
  landmarks stacked, `skinRoiRegionsFromLandmarks` produces a degenerate ROI, so the
  first run of section D timed an early return and printed **0.000ms**. Both are fixed —
  56 patches at 56 places, non-skin groups where they belong — and the sweep now throws
  if the ROI bails out rather than publishing a zero. For the record, the 650ms tick's
  real cost: **0.88ms (0.14% of the budget) at 400x480 rising to 12.8ms (1.97%) at
  1440x1920**, scaling with pixels the way `detectBlemishes` does not.

  **Nothing that runs by default asserts a duration.** A timing threshold fails on a
  loaded box while nothing in the product is broken. The seven default cases count
  pixels, pin source lines and pin values, and run in 1.6s; every timing is behind
  `ARU_PRINT_SCAN_COST`, the shape `ARU_PRINT_SCALE_SWEEP` / `ARU_PRINT_SHINE_SWEEP` /
  `ARU_PRINT_CLIP_SWEEP` already set.

  **Second item: `funnelDropoff`'s anchor, which did not need the wait it was parked
  on.** The chart is an intersection from stage 0, so anchoring on `scan_opened` alone
  zeroes every log recorded before that kind existed — which is why the item said
  "revisit once logs in hand all contain it". The anchor is now `scan_opened` UNION
  `scan_started`: since `scan_opened` fires on /scan entry and `scan_started` at the
  shutter, the second implies the first in any modern log and the union IS the
  `scan_opened` set, so the camera loss appears as the drop into 스캔 시작; a legacy
  session enters at its own 스캔 시작 and reads a 0% camera drop, which is "not measured
  here" rather than "nothing happened". The cost is pinned as a case rather than left to
  be found: a log MIXING the generations understates the drop, 50% becoming 33% on the
  three-session fixture. Three existing cases pinned the deferral and were rewritten to
  pin the new property — a decision changed deliberately, not a guard weakened.

  **Every new case broken at the SOURCE line it protects**, eight breaks, each reverted
  from a file copy:

  ```
  sampleRegion radius 4 -> 5        1 fail; AssertionError: expected [ 1573, 1694, 968, 847,
                                    847, 847 ] to deeply equal [ 1053, 1134, 648, 567, 567, 567 ]
  clipped-channel line deleted      1 fail; expected '/**\n * Visible-signal skin analysis.…'
                                    to contain '        if (r >= 255 || g >= 255 || b…'
  burst 3 frames -> 4               1 fail; expected '"use client";\n\nimport { useCallback…'
                                    to contain 'for (let i = 1; i < 3; i += 1)'
  row filter bound x0.25            2 fail; AssertionError: 400x480 blemishDensity: expected
                                    3.8926712054465358 to be 4.122487064212401
  row filter fully reverted         1 fail (the SOURCE pin only); the blemishCount pin stays
                                    green, which is the equivalence proof
  funnel anchor loses the union     5 fail; AssertionError: expected +0 to be 1 — the exact
                                    harm the backlog item was parked on
  scan_opened stage removed         5 fail; expected [ 'scan_started', …(4) ] to deeply equal
                                    [ 'scan_opened', 'scan_started', …(4) ]
  stage 0 reads scan_opened         5 fail; AssertionError: expected 0.5 to be close to
    instead of the anchor           0.3333333333333333
  ```

  Two of the seven new benchmark cases are NOT source guards and are not claimed as
  such: the grid-mask equivalence case re-derives both predicates in the test, so it
  checks the reasoning rather than the shipped line (the `blemishCount` pin is what
  guards that), and the read-twice case is a harness sanity check.

  **Not attempted, deliberately.** No third item. This branch changes the hottest
  function in the app and adds a benchmark and a doc; a fourth unrelated edit would make
  the perf claim harder to review and harder to revert. `NEXT_PUBLIC_FUNNEL_FLUSH`
  untouched. No consent kind or flow invented. `status` and `promotionGate` byte-identical.


  **Supervisor, same day — reviewed, and two of the reviewer's own expectations were
  the things that did not survive.** The equivalence proof was checked the way it has
  to be: `lib/skin.ts` was replaced with main's pre-change version (exports added, no
  logic touched, `tsc` still 13) and the branch's pinned `blemishCount` /
  `blemishDensity` values passed against it at all four frame sizes — so those pins are
  genuinely the before-values, and the optimised build matching them is proof the row
  filter is behaviour-preserving end to end. Breaking the bound (`excludeRSq / 4`) fails
  the pin with `400x480 blemishDensity: expected 3.8926712054465358 to be
  4.122487064212401`; removing the filter entirely while keeping it correct leaves the
  pin green and fails only the source pin, which is exactly the right shape. Suite
  timing over four consecutive runs on the branch: 11.02 / 10.27 / 9.89 / 9.97 s against
  main's 12.59 / 12.66 / 15.58 s — faster than main and not flaky, and no timing
  assertion runs by default.

  The saving reproduces on an independent fixture built to be UNFAVOURABLE to it
  (landmarks around an ellipse, so the non-skin points do not cluster in y): 1.95 ms and
  1.94 ms saved at 400x480 and 720x960, 35% and 29% off `detectBlemishes`. Below the
  table's range, as an adversarial geometry should be, and recorded in
  `docs/scan-cost-measurement.md` as the floor.

  **Two supervisor expectations were wrong and both are worth recording.** First, a
  pre-registered claim that `analyzeSkin` is flat in frame size at ~1.5 ms — measured on
  a fixture whose landmarks all sat on three points, so `faceW` was 0 and
  `detectBlemishes` returned early at its `faceW < 20` guard without running at all. The
  cheap phases are flat; the expensive one is not, and the reviewer's fixture had
  excluded it. Second, a pre-registered prediction that cycle 14's clipped-channel
  branch would be below the noise floor and that any specific number for it should be
  rejected. The cycle measured it properly — isolating `sampleRegion` rather than the
  whole call, sixteen measurements all positive, median 58.4 µs a frame — and then
  called it an upper bound because the ablation also changes V8's inlining. That is a
  better design than the reviewer's and a better piece of self-criticism than the
  reviewer asked for.
