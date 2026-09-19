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
  covers **four of the seven**: `shine_ratio` (formula and path), `tone_evenness`
  (formula only), `blemish_count`/`blemish_density` since cycle 17 — **checked and it
  agrees exactly** on the quantities `detectBlemishes` actually produces, so it is
  pinned rather than fixed, including the two (area, face width) pairs one face gave at
  two capture resolutions so the invariance the third argument exists for is checked and
  not asserted — and, since cycle 18, `roughness_ratio`, which is the first group whose
  two columns are pinned **because they disagree** rather than because they match.
  Three are left. `relative_redness` is the item above and **is wrong**;
  `melanin_index` is the item below and **is wrong**, and neither is a one-liner. `ita`
  is the only one that is both unpinned and not yet known to be wrong;
  `docs/tone-ita-verification.md` checks the angle against two outside references, which
  is more than a parity row would give. Noted 2026-09-19.
- [~] [AI] **`roughness_ratio` and `roughnessRatio` disagree at the guard, and it is the
  `shine_ratio` epsilon defect again.** Measured 2026-09-19 (cycle 17). Python is
  `region_highfreq / max(reference_highfreq, 1e-6)`; the app is
  `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`. On a perfectly smooth forehead —
  reference high-frequency exactly 0 —

  ```
  python: 320000.0      app: 0
  ```

  on the committed row, and the same pair at a reference of 1e-7 and at exactly 1e-6
  (Python clamps to the epsilon, the app's `>` excludes it). Above the guard they agree
  exactly. This is the mechanism cycle 16 measured on the oil axis, where
  `max(cheek_specular, 1e-6)` made the Python form read **24,691** against the app's
  **0.0674**. Two further differences in the same pair, both real: the app returns 0
  when either region is missing (`n < 40`, or `meanL <= 1`), which Python has no concept
  of; and the app's inputs are each region's high-frequency energy **divided by that
  region's own mean L\***, which the Python docstring does not say.
  **2026-09-19, cycle 18: the cheap half landed and the decision did not.**
  `ml/index-parity.json` now carries a `roughness_ratio` group — the first one whose
  `comparison` is `"divergent"` rather than exact — with 10 rows, each carrying BOTH
  columns. Each language asserts its own, so neither implementation can move unnoticed
  while the decision waits, and the two app-only rows record the missing-region branch
  as an absent Python column rather than as a zero that looks like a value.
  `lib/skin.ts:roughnessRatio` was extracted from the object literal to make the app
  column assertable, expression byte-for-byte unchanged (the published
  `roughnessRatio` 1.07506721426881 pin in `tests/skin-index-contract.test.ts` did not
  move). Still `[~]` for exactly the reason the item gave: **which side moves** is the
  question of which guard produces a usable dryness reading on a smooth forehead, and
  that needs faces, which is the golden-set blocker.
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
- [AI] **Is a 4096-entry interpolated table for `srgbLinear` actually faster than
  `Math.pow(., 2.4)`?** This is what is left of "the remaining win in a scan is the
  sRGB transfer curve" after cycle 18 measured it — that item is closed, with its
  outcome, in [`docs/autopilot-changelog.md`](autopilot-changelog.md) — and what is
  left is a speed question rather than a correctness one. 4096 entries read
  with linear interpolation is the smallest table measured whose a* error (**1.9e-6**)
  clears the certified radius of every frame in the fixture family (**1.046e-5**, a
  factor of 5.5), so it is the only candidate that would not be shipping an
  approximation nobody can bound. Whether it is worth anything is unmeasured: 32KB of
  doubles against three `Math.pow` calls per grid cell, on a phone profile this
  container cannot produce, and a cache-resident table behaves differently from a
  micro-benchmark of one. The prize is the **37-61%** of `detectBlemishes` that `C5`
  isolates. Anything that lands has to keep `blemishCount` and `blemishDensity`
  byte-identical at all four frame sizes — the pins in
  `tests/scan-cost-benchmark.test.ts` — and the tolerance harness
  (`tests/blemish-perturbation-tolerance.test.ts`) already reports the a* error of any
  table put through it. Noted 2026-09-19.
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

- 2026-09-19 (cycle 18) — Branch `autopilot/2026-09-19-1839`. **The number cycle 17
  said was missing is measured, and it is a red light. Below 1.046e-5 a* units nothing
  can change `blemishCount`; a 256-entry table for the transfer curve is off by 0.470
  and moves the count from 6 to 7. The curve stays, and the item closes on a
  measurement rather than on a judgement.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **542 passed in 83 files**, `python3 ml/selftest.py`
  **Ran 79 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **What was measured, and why it is two numbers rather than one.** `detectBlemishes`
  counts a cell when its residual — a* minus the mean a* of the valid cells within 5 of
  it — clears `BLEMISH.minResidual` 1.6 AND it is the maximum in its 5x5 neighbourhood.
  So the count moves only when a cell changes its classification, and that is bounded
  from the run's own margins: a per-cell error of delta moves a residual by at most
  `2*delta` and a difference of two residuals by at most `4*delta`. The minimum over
  every valid cell is a **certified radius** — below it no error field of that size can
  change the count, whatever its shape — and it is a different claim from an
  **achieved radius**, which is the smallest delta at which a perturbation the cycle
  actually applied did change it. Both are reported because a cycle that reported only
  the second would be saying "we tried some error fields" and calling it a bound.

  **The certified radius, over twelve frames — the same face at three noise amplitudes
  either side of the committed 9, at all four frame sizes:**

  ```
  noise  frame        count  certified
      4  400x480         5   1.046e-5
      4  720x960         5   8.490e-5
      4  1080x1440       5   3.268e-4
      4  1440x1920       5   4.135e-5
      9  400x480         6   1.786e-4
      9  720x960         5   4.588e-4
      9  1080x1440       5   2.332e-3
      9  1440x1920       5   2.625e-4
     14  400x480         7   1.482e-4
     14  720x960         5   2.037e-3
     14  1080x1440       5   3.013e-3
     14  1440x1920       5   9.423e-4
  smallest: 1.046e-5
  ```

  Two and a half orders of magnitude across twelve frames, which is why the brief asked
  for the distribution: the useful number is the **smallest**, 1.046e-5, because an
  approximation has to beat the worst frame it will ever meet.

  **And then the thing the tolerance is for, measured rather than reasoned about.** The
  same machinery rebuilds `lib/skin.ts` with `srgbLinear` replaced by a table over the
  0-255 channel domain and nothing else changed, so the a* difference it produces IS the
  approximation error on the inputs the detector feeds:

  ```
  table          frame        worst |da*|   count
  256 nearest   400x480        4.703e-1       7
  256 linear    400x480        4.788e-4       6
  1024 linear   400x480        3.026e-5       6
  4096 linear   400x480        1.849e-6       6
  ```

  The committed count at 400x480 is **6**. **The 256-entry table the item named moves a
  published value**, on the first fixture anyone tried — no argument required.
  Interpolating it does not rescue it: **5.0e-4 is 48 times** the worst frame's
  certified radius, and it leaves the count alone here by luck rather than by property.
  The smallest table that clears every frame is **4096 entries interpolated**, 1.9e-6
  against 1.046e-5. So the curve stays, cycle 17 was right to stop, and what is left is
  a narrower and purely-speed item: is a 4096-entry table actually faster than
  `Math.pow(., 2.4)` on a phone? Full write-up, every table, and the two limits that
  bound all of it — one synthetic face, and a radius stricter than the count —
  `docs/blemish-perturbation-tolerance.md`.

  **An asymmetry nobody was looking for, and it is pinned rather than described.**
  Dropping the most marginal counted cell by TWICE the margin that would take it under
  the floor **does not remove a count**, at any of the four frame sizes: the cell it was
  suppressing becomes the local maximum and is counted in its place. A count comes off
  only when the suppression neighbourhood goes with it. Lifting, by contrast, takes
  about **1.25 a\*** at every size, because the best noise peak on this fixture sits at
  a residual of 0.35 against a floor of 1.6.

  **The harness guards itself, because a hook that perturbs nothing reports an enormous
  tolerance and looks like good news.** With no perturbation installed the rebuilt module
  reproduces the committed counts and densities exactly; a 4.0 a* checkerboard moves the
  count to a pinned 415/421/414/418; the test's replica of the classification is asserted
  to produce the same count as `detectBlemishes` on every frame before the oracle uses it
  to pick a target; and `minResidual`, `backgroundRadius` and `suppressionRadius` are
  READ OUT of `lib/skin.ts` rather than copied into the test — which was found by
  breaking it. The first version copied them, and a `minResidual` break failed exactly
  one assertion, the achieved radius, while the twelve certified radii went on being
  computed against a floor the detector no longer used. A test that keeps measuring
  after the thing it measures has moved is the same failure as a hook that perturbs
  nothing.

  **Second item: the `roughness_ratio` parity group, which is the cheap half the backlog
  item said could land first.** `ml/index-parity.json` gains the first group whose
  `comparison` is `"divergent"` rather than exact: 10 rows, each carrying BOTH columns,
  each language asserting its own. `python: 320000.0` against `app: 0` on a forehead
  with no texture, the same pair at 1e-7 and at exactly 1e-6 (Python clamps to the
  epsilon, the app's `>` excludes it), and exact agreement above the guard — so the
  divergence is located rather than declared. The two app-only rows record the
  missing-region branch as an ABSENT Python column rather than as a zero that looks like
  a value. **Which side moves is not decided**, which is what the item asked for: that
  needs faces. `lib/skin.ts:roughnessRatio` was extracted from the object literal to make
  the app column assertable, expression byte-for-byte unchanged.

  **No published value moved, and it is checkable rather than asserted.** The
  `blemishCount` / `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` were not
  edited and stayed green; `tests/skin-index-contract.test.ts`'s `roughnessRatio`
  1.07506721426881 did not move. `fallbackVersion`, `ATTR_THRESHOLDS`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched — guardrail 8's `status` and `promotionGate` byte-identical.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented.

  **Ten new cases — nine in vitest, one in `ml/selftest.py` — and nine breaks**, each
  altering the SOURCE line the case protects, never the test, and reverted from a file
  copy:

  ```
  BLEMISH.minResidual 1.6 -> 1.55      2 fail; BLEMISH.minResidual: expected 1.55 to be
                                       1.6, and 400x480 lift: expected
                                       0.9597128738739016 to be close to 1
  BLEMISH.backgroundRadius 5 -> 4      7 fail; 400x480 committed count: expected 7 to
                                       be 6
  srgbLinear 2.4 -> 2.41               3 fail; 400x480 certified: expected
                                       0.00017903110422778923 to be
                                       0.00017859239785300574
  the hook's anchor comment reworded   6 fail; Error: perturbation hook: the astar
                                       consumer moved; the harness measures nothing
  the hook perturbs a COPY of the      2 fail; 400x480: a 4.0 a* checkerboard left the
    grid (the failure mode itself)     count alone: expected 6 not to be 6
  python epsilon 1e-6 -> 1e-5          1 fail; 31999.999999999996 !=
                                       319999.9680000032 : reference one ulp above the
                                       guard: the two still agree
  app guard > 1e-6 -> >= 1e-6          1 fail; reference exactly at 1e-6 ...:
                                       roughnessRatio(0.32, 0.000001): expected 320000
                                       to be +0
  the call site stops delegating       1 fail; expected '/**\n * Visible-signal skin
                                       analysis.…' to contain 'roughnessRatio:
                                       roughnessRatio(cheekH…'
  ```

  The fifth is the one worth having: it is the harness's own failure mode, and the guard
  case is the only thing in the file that catches it.

  **Verification before the push**, all four re-run on the final tree: vitest
  **551 passed in 84 files** (542 + 9), `python3 ml/selftest.py` **Ran 80 tests ... OK**
  (79 + 1), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .`
  **2 warnings** both in `lib/care.ts` unchanged, `npm run smoke` green —
  `Smoke test passed.`, with its own vitest 551, `ml/selftest.py` 80, and **44 mobile
  E2E specs passed in 3.4m** behind the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override the
  protocol records.

  **Rotation, per step 8.** "Recent cycles" holds cycles 18, 17 and 16; cycle 15's
  184-line entry moved to `docs/autopilot-changelog.md` and `diff` reports it
  **byte-identical**, and the one item this cycle ticked `[x]` moved to "Closed backlog
  items -> Now" with its body rewritten as its outcome. `comm -23` against a sorted
  snapshot of the pre-change pair reports **43 differing lines**, every one of them from
  the three backlog items this cycle rewrote: the closed transfer-curve item's old body,
  the `roughness_ratio` item's body (its `500000.0` example replaced by the committed
  row's `320000.0`, and the older figure still stands in cycle 17's entry), and the
  "indices still unchecked" item's recount from three covered to four. Nothing from the
  moved entry appears in that list.

  **Supervisor, same day — the method is better than the reviewer's and the verdict is
  one step too confident.** The reviewer went in with a perturbation sweep of its own and
  got a tolerance of **0.03 a\* units**, three orders of magnitude looser than this
  cycle's 1.046e-5. The cycle is right and the reviewer was answering a weaker question:
  0.03 was the *achieved* radius for one deterministic error shape, and what an
  approximation has to clear is the *certified* one, computed from the run's own margins
  and safe against an error of any shape. The cycle reports both, labels them as
  different claims, and measures `uniform -> null` — the trap where a constant offset
  cancels in the local-background subtraction and a harness built on one reports an
  unbounded tolerance. It is pinned as a case.

  **The correction.** §5 green-lights a 4096-entry interpolated table at 1.9e-6 against
  1.046e-5. That 1.9e-6 is the error on the pixel values the four fixtures happen to
  produce, because the rebuilt `lib/skin.ts` only converts the cells a real frame hands
  it. It is not the worst case over the inputs `detectBlemishes` will ACCEPT, and a
  certificate has to cover those. The gate is `L in [40, 230] && r > b` on the raw pixel
  (`lib/skin.ts:958`) with the conversion on `channel * gain`. Swept over every input
  clearing that gate at gains 0.72 / 1.0 / 1.33:

  ```
  table          whole cube    inside the gate    vs 1.046e-5
  1024 linear    3.701e-4      1.962e-4           does not certify
  4096 linear    1.621e-5      1.251e-5           does not certify
  ```

  The 4096 table's worst admissible input is around rgb(22, 35, 17) after gain — dark and
  green-leaning, which passes `r > b`. So **no table measured certifies**, the 5.5x of
  headroom is headroom on the fixture family rather than on the input domain, and the
  open question is not only the speed question §5 reduces it to. Recorded in
  `docs/blemish-perturbation-tolerance.md` §5; §2 and §3 are unaffected.

  **Checked rather than accepted.** The printer reproduces every row of §2 exactly.
  Three source lines were broken: `minResidual` 1.6 -> 1.2 fails 2 cases including the
  certified-radius one, `suppressionRadius` 2 -> 1 fails 4, and moving the Python
  `roughness_ratio` epsilon from 1e-6 to 1e-5 fails `ml/selftest.py`, so the new parity
  group holds the Python side the way cycle 16 established. The `blemishCount` /
  `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` are untouched — the diff
  against main is empty — and `fallbackVersion` and the manifest did not move, which on
  this cycle is the requirement. Rotation: 42 differing lines, all from the two items
  this cycle touched, the closed one rewritten as its outcome in the changelog.
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


  **Supervisor, same day — the headline is the correction, and the reviewer's own
  prediction was the weaker version of it.** Before reading the branch the reviewer
  micro-benchmarked an a*-only path at 200,000 calls over 11 repeats and got −7.5%
  against the full function when the result is consumed immediately, inside a noise
  floor of 8–13%, concluding the fast path was worth nothing and that cycle 15's
  53–75% was the arithmetic. The direction was right and the number was not: measured
  in situ rather than on a leaf, the cycle gets +1.4 .. +7.8% with the sign consistent
  8 runs out of 8 at three frame sizes, and reports the fourth honestly as 6/8 with a
  range that straddles zero. In situ beats a micro-benchmark and sign-consistency beats
  a median, so the cycle's number stands and the reviewer's does not.

  **Every reading is bit-identical to main, checked rather than accepted.** `analyzeSkin`
  was run at four frame sizes on this branch and on main `f7c52df` with a fixture whose
  blemish discs give counts of 6 and 7, so the maxima-and-suppression path `lab.a` feeds
  is genuinely exercised: `blemishCount`, `blemishDensity` at full precision, `shine`,
  `relRedness`, `cov`, `toneIta`, `toneLstar`, all three published levels and
  `confidence` to twelve decimals agree on every row. `fallbackVersion` and the manifest
  are untouched, which on this cycle is the requirement rather than an omission. The
  `blemishCount` / `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` were not
  edited — the only removed lines in that file are an ablation helper string.

  **The parity contract bites from both sides**, on the same standard cycle 16 set:
  perturbing `ml/ita.py`'s X matrix coefficient fails `ml/selftest.py`; perturbing
  `labAStar`'s fails `tests/index-parity.test.ts` and `tests/lab-parity-sweep.test.ts`
  with `cube: white: a*: expected 0.007013975346747969 to be 0.00526049995830391`. Note
  the split the cycle chose is right: within TypeScript the committed rows are pinned
  with exact equality, and the ULP tolerance applies only across languages.

  **An independent sampling supports choosing the mechanism bound over the observed
  max.** The reviewer re-ran the cross-language comparison on a different grid — 8,956
  inputs, the cube at stride 17 plus a float grid at the five gains `frameChannelGains`
  actually produces — and got max |Δa*| 1.137e-13, median 0, 68.78% exact, worst at
  rgb(102, 238, 221). That is **1.024 ULPs** of the a* output scale where the cycle's own
  sweep found 1.472 on its inputs. Two grids, two different maxima, both inside the
  mechanism's ~3: which is precisely why `toleranceK` is set from the mechanism rather
  than from max-observed times a safety factor. Recorded in `docs/rgb-to-lab-parity.md`.

  Rotation: 27 differing lines against a pre-review snapshot of main's pair, all
  accounted for — the closed `rgbToLab` item's body, rewritten as its outcome in the
  changelog, and the "seven indices" item correctly renumbered from five to three
  because this cycle covered two more.
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
