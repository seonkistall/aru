# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-20

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

   And do not run `npx eslint .` at the same time as `npx vitest run`, which cycle 20 hit:
   `tests/blemish-perturbation-tolerance.test.ts` writes and deletes modules under
   `tests/.blemish-perturb-tmp/`, so a concurrent lint globs a path that is gone by the
   time it opens it and dies with `Error: ENOENT: no such file or directory, open
   '.../tests/.blemish-perturb-tmp/skin-lut-1024-linear.ts'`. That is a race and not a red
   build — re-run lint on its own to confirm — but it looks exactly like a broken tree.
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
- [AI] `minQwkGainOverHeuristic` is 0.0 — strictly-greater, with no noise band. A
  model that beats the heuristic by 0.001 on one validation split passes, and that
  gain may be noise. Estimate the band: bootstrap the validation rows, report a CI on
  the qwk difference, and require the gain to clear it. That is the honest version of
  a margin, and the reason no positive number was invented for it.
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

- 2026-09-20 (cycle 20) — Branch `autopilot/2026-09-20-0639`. **A guard on `|b*|` could
  not have been right, because what diverges is the ratio and not b\*. The window cycle
  19 pinned as divergent is a 0.04-of-one-8-bit-unit shell around the neutral axis — and
  the axis is inside it, so 242 of 256 greys read the wrong SIGN while a capture crossing
  zero steps over the window without once landing in it. The guard is `b* == 0` in all
  three implementations and the `ita` parity group is `exact`.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **558 passed in 85 files**, `python3
  ml/selftest.py` **Ran 83 tests ... OK**, `npx eslint .` **2 warnings** both in
  `lib/care.ts`.

  **Item 1 of the brief: how reachable the window actually is. Two answers, pointing at
  different fixes.** On a skin-coloured region it is a knife edge. The blue-channel gain
  that takes each committed fixture through `b* = 0`, and the width of the interval
  around it where `|b*| < 0.01`, by bisection on the shipped `rgbToLab`:

  ```
  fixture              b* at gain 1   crossing gain   |b*|<0.01 window
  synthetic-face cheek       10.7383        1.136741           2.561e-4
  swatch-1                    8.2152        1.079614           1.945e-4
  swatch-3                   17.4931        1.235578           2.714e-4
  swatch-6                   14.8922        1.573947           7.784e-4
  ```

  Over the 8-bit cube uniformly at n = **2,000,000**, `|b*| < 0.01` holds on **300
  triples (0.0150%)** and `|b*| < 1e-6` on **0**. In 8-bit units the window is a shell
  **0.031 to 0.043** of one level thick. And the shipped path confirms it: **121 blue
  gains from 1.000 to 1.600 in 0.005 steps** through `analyzeSkin` on the committed
  synthetic face step **88.5 → 89.6 → −89.2 → −88.4** across the crossing, the largest
  `|toneIta|` in the whole sweep is **89.6**, and **not one of the 121 captures produced
  a reading the old guard would have clamped**.

  **Which corrects cycle 19's own reachability argument**, and that correction is in
  `docs/tone-ita-verification.md` and `docs/redness-formula-decision.md` rather than only
  here. It read §3's cool cast — ITA 61.8 to −87.6 on a real fixture — as evidence that a
  capture reaches the window. It is evidence that a capture **crosses** it. Passing
  through a 2.6e-4-wide interval is not landing in it.

  **What made it reachable is the neutral axis, and nobody was looking there.** ARU
  carries the sRGB→XYZ matrix to four decimals, so for `r = g = b` the z row sums to
  `1.089 / 1.08883 = 1.00016` of the y row and `b* = 200 * (f(y) − f(z))` comes out small
  and NEGATIVE, growing with level. So a grey does not approach the window, it sits
  inside it, and 8-bit quantisation puts real pixel values exactly on the axis:

  ```
  greys inside |b*|<0.01: 242/256, inside |b*|<1e-6: 1/256

  grey       L*             b*     shipped ITA   rejected wide   true limit
    32  12.25003   -0.002534755     89.996153           -90.0         90.0
    96  40.73055   -0.005090190     89.968537           -90.0         90.0
   119  50.03444   -0.005924988    -80.238169            90.0        -90.0
   128  53.58501   -0.006243566    -89.900215            90.0        -90.0
   240  94.79625   -0.009941274    -89.987285            90.0        -90.0
  ```

  On **all 241 non-black greys inside the old window the ±90 fallback returned the sign
  the limit does not have** — it answers `sign(L* − 50)` where the limit is
  `sign((L* − 50) / b*)`, and b\* is negative there, so the two are opposites everywhere.
  **The registry's narrower guard held the correct column**, which settles cycle 19's
  "neither is obviously the right one" on a measurement. The path is `ml/ita.py` rather
  than the browser: `tone_from_image_path` is called from `ml/external_manifest.py:374`
  and `ml/prepare_crop_dataset.py:48`, both through PIL's `convert("RGB")`, and on an
  L-mode file that yields `r = g = b` exactly. Which datasets ship greyscale was NOT
  audited and the doc says so.

  **Item 2: the decision, and the two options that were refused on measurement rather
  than on taste.** *Sign-awareness alone* leaves a second defect in the same guard: a
  window on b\* asserts a vertical angle however small `|L* − 50|` is, so at L\* 50.001
  and b\* 0.005 it published **90** (`very_light`) where the angle is **11.31** (`tan`) —
  and a sign-aware ±90 publishes 90 there too. Not a constructed input either: grey 119
  lands at L\* **50.03444** on the real axis, angle **−80.238169** against the rejected
  90. Pinned as a break, which fails 4 assertions including `expected 90 to be close to
  11.309932474020215, received difference is 78.69006752597979`. *An "undetermined"
  band* — the option cycle 19 hinted at — is refused because the condition it would fire
  on does not exist: the angle is **well conditioned** for small b\* whenever
  `|L* − 50|` is not also small (every grey above reads within 0.04° of vertical bar 119),
  and the one genuinely ill-conditioned input is `0/0`, an achromatic mid-grey, which is
  not a face and which the scan already refuses on `n >= 40` / `meanL > 1` / ROI quality.
  *Dropping the guard entirely* is unsafe in Python, and the reason is asymmetric between
  the languages rather than a matter of style:

  ```
  20.0/0.0     -> ZeroDivisionError: float division by zero
  20.0/-0.0    -> ZeroDivisionError: float division by zero
  0.0/0.0      -> ZeroDivisionError: float division by zero
  20.0/1e-320  = inf
  20.0/5e-324  = inf
  math.atan(inf) = 1.5707963267948966 -> degrees 90.0
  ```

  V8 divides `+0` to `Infinity`, `-0` to `-Infinity` and `0/0` to `NaN`; CPython raises
  on all three. Denormals are fine in both. So **`b* == 0` is the only input that needs a
  branch, and it needs one in both or they part company on `-0`** — which is why the
  shipped guard is `bstar === 0` rather than `Math.abs(bstar) < eps`, and why `-0` is a
  case in the test and not a row in the table (`JSON.stringify(-0)` is `"0"`). At
  `b* == 0` the value is a convention and is documented as one; `L* > 50 ? 90 : -90` is
  kept because a number matters more than which number — `toneBandFromIta` maps a NaN to
  `"unknown"` and a tone-unknown row blocks promotion.

  **Item 3: what it costs downstream. Nothing, and that is only true because the third
  option was refused.** `ml/subgroups.py`, `coarse_tone_band`, `resolve_tone_band` and
  `promotion_check` are untouched. Had `coarse_tone_band` gained an "undetermined" state,
  `aggregate_by_cell`'s per-cell arithmetic and `worst_group`'s `min_n` floor would both
  have needed a meaning for a sample with no band and the gate a rule for whether such a
  sample blocks, is skipped, or folds into `unknown`.

  **`fallbackVersion` is not bumped, and the justification is the byte-identity rather
  than an assertion.** Twenty readings — five capture conditions (neutral wall, warm wood
  wall, warm cast, cool cast, and a strong `[0.8, 1.0, 1.3]` cool cast) at each of the
  four frame sizes — were run through `analyzeSkin` on this branch and on main
  `eb527e9`, printing every field of `SkinRawFeatures` plus all three levels and all
  three confidences: **all 20 rows byte-for-byte identical**, as is the 121-step sweep.
  A bump would therefore partition samples carrying identical values, and it would do
  real damage rather than none — `coverage_warnings` is where a mixed-generation run is
  meant to surface, so a spurious boundary would make every run spanning today report a
  mix that does not exist. `oil`, `redness` and `pores` did not move: all three levels
  and all three confidences are in that identical comparison. `ATTR_THRESHOLDS`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` untouched —
  guardrail 8's `status` and `promotionGate` byte-identical. `NEXT_PUBLIC_FUNNEL_FLUSH`
  untouched. No consent kind or flow invented.

  **Second item, and it is outside "Now" on purpose.** Everything left in "Now" that the
  loop can do alone is blocked — the deep-link needs an allowlisted host, the blemish
  constants and `roughness_ratio` need faces, the funnel flush needs the PIPA answer, the
  cost item needs a phone — and the brief excluded the rest. So the pick is the item from
  "Next" that makes this cycle's decision actually binding: **`SampleMeta.toneBand` was
  declared, documented as "derived on-device from the ITA already measured during the
  scan", and written by nothing.** Deleted. `resolve_tone_band` reads a recorded band
  BEFORE `toneIta`, so a band stored by one generation of `itaDegrees` would keep
  outranking the current definition of the stratifier — the same drift, one level up from
  the formula. That preference order is right for an external manifest, where the band
  comes from a Fitzpatrick or Monk column and there is no ITA to recompute from, and it
  stays.

  **Eight new cases and two rewritten, and thirteen breaks.** New: six in
  `tests/ita-guard-decision.test.ts`, one in `tests/subgroup-contract.test.ts`, one in
  `ml/selftest.py` — which is the +7 vitest and +1 Python in the counts below. Rewritten
  rather than added, because cycle 19's versions asserted the divergence this cycle
  removed: the `ita` case in `tests/index-parity.test.ts` and the `ita` case in
  `ml/selftest.py`. Every break alters the SOURCE line the case protects, never the test,
  and is reverted from a file copy:

  ```
  app guard bstar === 0 -> |b*| < 0.01   4 fail; itaDegrees(70, 0.005): expected 90 to
    (the rejected wide guard back)       be 89.98567605542014; grey 1: the shipped angle
                                         carries the limit's sign: expected -1 to be 1
  app guard made SIGN-AWARE at 0.01     4 fail; expected 90 to be close to
    instead of narrowed                  11.309932474020215, received difference is
                                         78.69006752597979
  app fallback pivot > 50 -> >= 50      2 fail; itaDegrees(50, 0): expected 90 to be -90
  app rgbToLab z 1.08883 -> 1.089       4 fail; 8-bit greys inside the rejected wide
                                         guard: expected 256 to be 242
  python registry guard -> 1e-6         1 fail; 90.0 != 89.9999999971352 : b* a thousand
                                         times smaller again: ita(70, 1e-09)
  python registry guard -> 0.01         2 fail; 90.0 != 89.98567605542014; grey 1: the
                                         shipped angle must carry the limit's sign
  python registry pivot > 50 -> >= 50   1 fail; 90.0 != -90 : b* exactly zero AT the
                                         pivot: ita(50, 0)
  ml/ita.py guard -> 0.01               1 fail; 0.014323944579857084 not <=
                                         3.9968028886505635e-14 : ml/ita.py must agree
                                         with the committed column
  python registry guard REMOVED         1 error; ZeroDivisionError: float division by
                                         zero
  parity table ita exact -> divergent   both languages; 'divergent' != 'exact'
  SampleMeta declares toneBand again    1 fail; SampleMeta must not declare a stored
                                         tone band
  resolve_tone_band drops toneIta       1 fail; resolve_tone_band must read the
    from its ITA key TUPLE               "toneIta" the app writes
  resolve_tone_band reads toneIta       1 fail; expected 647 to be less than 126
    BEFORE a recorded band
  ```

  **The twelfth is the one that earned its place, and it did not fail the first time.**
  Deleting `"toneIta"` from `resolve_tone_band`'s key tuple left
  `tests/subgroup-contract.test.ts` **green**, because the docstring immediately above
  that line also contains the string `"toneIta"` and the assertion was a `toContain` over
  the whole function. It now matches the key TUPLE. Same failure mode as cycle 19's
  redness epsilon and cycle 18's copied `minResidual`: an assertion that goes on passing
  after the thing it measures has moved, found only because the guardrail requires
  breaking every new case.

  **Rotation, per step 8.** "Recent cycles" holds cycles 20, 19 and 18; cycle 17's
  **243-line** entry moved to `docs/autopilot-changelog.md` and is present there exactly
  once, byte-identical, as the tail of the file. Two items ticked `[x]` and moved under
  the headings they were filed beneath: the `ita` guard item to "Closed backlog items ->
  Now" and `SampleMeta.toneBand` to "-> Next", each body rewritten as its outcome.
  `wc -l`: `docs/AUTOPILOT.md` **1362 -> 1297**, `docs/autopilot-changelog.md`
  **3299 -> 3591**. `comm -23` against a sorted snapshot of the pre-change pair reports
  **27 differing lines**, every one accounted for — **22** from the `ita` item's old body
  (its 4-line table included) and **5** from the `toneBand` item's, and **0** from
  anywhere else. Nothing from the moved entry appears in that list.

  **Verification before the push**, all four re-run on the final tree: vitest **565
  passed in 86 files** (558 + 7), `python3 ml/selftest.py` **Ran 84 tests ... OK**
  (83 + 1), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .`
  **2 warnings** both in `lib/care.ts` unchanged, `npm run smoke` green —
  `Smoke test passed.`, with its own vitest 565, `ml/selftest.py` 84, and **44 mobile
  E2E specs passed** behind the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override the protocol
  records.


  **Supervisor, same day — the cycle found the case the reviewer missed, and the
  reviewer's reachability conclusion was wrong.** Going in, the review had derived two
  things independently: that `Math.atan` handles `b* = 0` on its own in V8 (`(l-50)/0` is
  ±Infinity, `atan(±Infinity)` is ±90) so the fallback is unnecessary for its stated
  purpose, and that inside its own window the guard *creates* the 180-degree error rather
  than preventing one — at L\* 70, b\* −0.005 plain `atan` gives −89.986 and the guard
  gives +90. Both hold and the cycle's fix follows them.

  It had also concluded the defect was **latent rather than live**, by sweeping a blue
  cast across a skin-coloured region and finding the closest sampled approach to be
  `|b*| = 0.44`, 44x the window. **That is true of skin and false of the case that
  decides it.** The cycle swept the neutral axis instead and found it sits *inside* the
  window. Recomputed from scratch in review: the z row sums to
  `(0.0193 + 0.1192 + 0.9505) / 1.08883 = 1.00015613` of the y row, so
  **242 of 256 greys** fall inside `|b*| < 0.01` and exactly **1** inside `1e-6`; the old
  guard was 180 degrees off on every grey from 32 up. One fixture family is not a
  reachability argument when the quantity under test is a distance to the neutral axis
  and the fixture is, by construction, not neutral. Recorded in
  `docs/ita-guard-decision.md`.

  **The obvious-looking simplification was avoided, and it is a trap.** The review flagged
  `atan2` before reading the branch: `atan2(l-50, b)` needs no branch at all but resolves
  the quadrant, so at L\* 70, b\* −0.005 it returns +90.014 where ITA's convention
  (`arctan((L*-50)/b*)` on (−90, 90]) requires −89.986 — 180 degrees, the same class of
  error the cycle exists to remove. `grep -rn atan2 lib/ ml/ tests/` returns nothing.

  **Checked rather than accepted.** No published axis moved: `analyzeSkin` on this branch
  and on main `eb527e9` agrees at four frame sizes on `blemishCount`, `blemishDensity`,
  `shine`, `relRedness`, `cov`, `toneIta`, `toneLstar`, all three levels and `confidence`.
  The `fallbackVersion` reasoning is argued rather than asserted — the semantics moved
  only within 0.043 of an 8-bit unit of the neutral axis, where no cheek centroid lands,
  so a bump would partition byte-identical samples — and `toneIta` is computed from
  `dominantTone` over cheek pixels, which is never neutral, so the argument holds. All
  three guards are pinned: widening the TypeScript one back to `|b*| < 0.01` fails 4 cases
  (`itaDegrees(70, 0.005): expected 90 to be 89.98567605542014`), and widening either
  Python one fails `ml/selftest.py`.

  One reviewer error worth recording, since the standard here is to record them: the first
  attempt at breaking `ml/skin_indices.py` reported the guard as *unpinned*, because the
  regex replaced the first `bstar == 0` in the file — which is in the docstring, not the
  code. Re-run against line 150 it fails as it should. A break that does not break is a
  false negative, and it looks exactly like a coverage gap.

  Rotation: 27 differing lines, all from the two items this cycle touched.
- 2026-09-20 (cycle 19) — Branch `autopilot/2026-09-20-0039`. **An a\* difference is
  not scale-free, and that is arithmetic rather than a property of the fixture: a
  common gain takes it to g^0.8 of itself. The app's chromaticity difference wins by
  24x, 11x and 3.3x on the three nuisances the design doc names, ties on the two it
  does not, and the Python side moved. The registry audit cycles 16-18 were running is
  finished, and the last index it covered turned out to be wrong too — by 180 degrees.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **551 passed in 84 files**, `python3
  ml/selftest.py` **Ran 80 tests ... OK**, `npx eslint .` **2 warnings** both in
  `lib/care.ts`.

  **The question, and why it needed a construction rather than a sweep.** Two indices
  on two scales cannot be compared by spread — that rewards whichever sits further
  from zero. So every sweep is reported as **nuisance / signal**: how far a capture
  change moves the index, over how far four faces of genuinely different redness move
  it at one capture. Both forms order those four, so this is not a contest between an
  index and a constant. Both columns come from the SAME two `sampleRegion` outputs of
  the SAME frame, and the rejected column goes through the shipped `labAStar`.

  ```
  nuisance                     chromaticity   a* difference   winner
  exposure, cheekL 70..170          0.0209          0.5047    chromaticity by 24.16x
  melanin tone                      0.0227          0.2545    chromaticity by 11.19x
  white balance                     0.0624          0.2071    chromaticity by  3.32x
  tone curve, gamma 0.8..1.25       0.3930          0.4076    chromaticity by  1.04x
  veiling flare, black lift 0..30   0.1878          0.1822    a*           by  1.03x
  ```

  The exposure row as values: chromaticity **1.0249x** over a 2.43x exposure range,
  a\* **2.1683x** — 1.82634 to 3.95999 on one face whose skin did not change, monotone
  in the brightness, every row unclipped.

  **The mechanism, checked against the shipped code rather than argued.** `a* = 500 *
  (f(x) - f(y))` with f a cube root above its knee, so a\* is homogeneous of degree 1/3
  in the linear signal; the linear signal is degree 2.4 in the 8-bit channel. A common
  gain g multiplies BOTH regions' a\* by `g^0.8` — and a difference of two things that
  both scale scales too. **It factors out of the difference instead of cancelling in
  it**, which is exactly what the old docstring got wrong: "both regions went through
  the same sensor and the same light" is true of an ADDITIVE common term and false of a
  multiplicative one. Under a pure 2.4 power law the prediction is exact to every
  printed digit (0.66454 / 0.83651 / 1.15703 against `g^0.8`); the shipped
  affine-then-power curve sits near it without being it (0.65561 at g = 0.6), because
  the +0.055 offset does not scale. The chromaticity form over the same scalings moves
  by at most **one ulp of 1.0**, a bound derived from two correctly-rounded divisions
  and measured at exactly half of it.

  **Two construction choices, either of which would have changed the answer, and they
  are in the file rather than in a paragraph.** The melanin sweep raises each channel
  to a different power (`s^0.75 / s^1.0 / s^1.2`) because melanin absorbs more at short
  wavelengths — a scalar darkening would make that sweep arithmetically identical to
  the exposure sweep and the second table would be the first one twice. The gamma and
  flare sweeps re-normalise the exposure, because both change the frame's brightness as
  a side effect; uncorrected, the gamma sweep's a\* column reads BETTER than it should.

  **The two ties are kept rather than trimmed, and one of them costs a published
  level.** Neither form is invariant to a camera that is not linear. Gamma 0.8 to 1.25
  with the exposure held takes this face from **0.010348 to 0.016477**, across the
  `ATTR_THRESHOLDS.redness` 0.012 cut — and **moving the cut does not help**, because
  the sweep straddles it wherever it is put and the rejected form moves by as much. It
  is a limit of reading redness off an uncalibrated camera and a cousin of the
  illuminant-correction backlog item, not an argument for either formula. Pinned as a
  case, so a later cycle claiming the chromaticity form is simply the stable one has to
  fail a test to say so. One synthetic face; the golden-set blocker is what would
  change that.

  **No published value moved**, and it is checkable rather than asserted: the app
  already computed the winner. `ATTR_THRESHOLDS`, `fallbackVersion`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched — guardrail 8's `status` and `promotionGate` byte-identical.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented. The Python
  function was never on a path that produced a value (all three pipeline scripts read
  the app's `relRedness` column) and its old inputs were a\* values no ARU export
  carries.

  **Second item, which the brief filed as the cheap half and which is not a negative
  result.** `ita` was the last index both unpinned and not known to be wrong. It is
  wrong. **Three implementations exist and only two agree**: `lib/skin.ts:itaDegrees`
  and `ml/ita.py:ita_from_lab` fall back to ±90 at `|b*| < 0.01`, the registry's uses
  `1e-6`. That would be a rounding question if the fallback were continuous, and it is
  not — **the ±90 fallback ignores the SIGN of b\***:

  ```
   L*     b*        app        registry     note
   70   0.005    90.000000    89.985676     inside the app's guard, outside the registry's
   70  -0.005    90.000000   -89.985676     +90 against -90: light against deep
   30  -0.005   -90.000000    89.985676     the same, the other way, below the L* pivot
   70    1e-06   90.000000    89.999997     the registry's guard is `<`, so it computes
   70    1e-09   90.000000    90.000000     inside both: they agree, at the fallback
   70   0.01     89.971352    89.971352     the app's guard is `<` too, so both compute
  ```

  41 is the light cut and 10 the deep one, so one column is above the first and the
  other below the second — **opposite ends of the tone stratifier from one frame.**
  Reachable rather than arithmetic: `docs/tone-ita-verification.md` §3 has a cool cast
  taking ITA from 61.8 to −87.6 on a real fixture, so a capture travels through zero.
  **Pinned divergent, not decided**, because both implementations carry the same
  discontinuity and disagree only about where it sits. `lib/skin.ts` gains
  `itaDegrees`, which existed **twice, byte for byte**, in that one file — the
  duplication the 2026-09-15 `confidenceLabel` finding is about — and
  `ml/skin_indices.py:ita` converts with `* 180 / math.pi` instead of `math.degrees`,
  the same trade-off cycle 17 recorded for the cube root: `math.degrees` rounds once
  and is MORE accurate, and over **1,186,709** (L\*, b\*) pairs the two associations
  are bit-identical on **74.5%** and differ by up to **1.42e-14** degrees, **0.71**
  units of `90 * 2^-52`. Matching the app isolates the guard as the group's only
  divergence. `ml/ita.py` keeps `math.degrees` and is held to the app's guard exactly
  and its value within `2 * 90 * 2^-52`.

  **Ten new cases — seven in vitest, three in `ml/selftest.py` — and ten breaks**, each
  altering the SOURCE line the case protects, never the test, and reverted from a file
  copy:

  ```
  redChromaticity r/(r+g+b||1)         2 fail; cheekL 80 ...: expected
    -> r/(r+g+b+1)                     0.011632146391430398 to be 0.011694677871148473
  relativeRedness operands swapped     3 fail; expected -0.011694677871148473 to be
                                       0.011694677871148473
  the relRedness call site stops       1 fail; expected '/**\n * Visible-signal skin
    delegating (values identical)      analysis.…' to contain 'relRedness:
                                       relativeRedness(cheeks, t…'
  labF Math.cbrt(t) -> Math.sqrt(t)    1 fail; shipped labAStar at gain 0.6: expected
                                       0.5451407988491981 to be close to
                                       0.664539805948974 ... but expected 0.05
  python red_chromaticity guard        1 fail; -0.4011393442622951 !=
    -> max(total, 1e-6)                0.09836065573770492 : a region summing to 1e-9
  python relative_redness swapped      2 fail; -0.011694677871148473 !=
                                       0.011694677871148473
  app itaDegrees guard 0.01 -> 1e-6    1 fail; itaDegrees(70, 0.005): expected
                                       89.98567605542014 to be 90
  one tone site stops delegating       1 fail; both tone sites must delegate: expected
                                       1 to be 2
  python ita guard 1e-6 -> 0.01        1 fail; 90.0 != 89.98567605542014
  python ita -> math.degrees           1 fail; 44.47436539354238 !=
                                       44.474365393542385
  ```

  **The fifth is the one that earned its place, and it did not fail the first time.**
  The redness group originally had two black-region rows and nothing between zero and
  an epsilon, so swapping Python's `total if total else 1.0` for `max(total, 1e-6)`
  agreed on a region of exactly zero and `ml/selftest.py` stayed green: the rows
  located the branch ON zero and located nothing about WHERE IT SITS. That is the same
  failure `tone_evenness`'s 2e-7 / 2e-6 pair was added to close, one index over, and it
  was found only because the guardrail requires breaking every new case. Two rows now
  straddle it — a region summing to 1e-9 and the same chromaticity a million times
  larger, which must read the same — and the break fails in both languages.

  **Where the registry stands now, which is the thing cycles 16-19 were for.** All
  seven indices have had their values checked; six are pinned in
  `ml/index-parity.json`. Three of the seven declarations were false — `shine_ratio`,
  `relative_redness`, `ita` — while `tests/skin-index-contract.test.ts` pinned all
  seven NAMES throughout and stayed green for every one of them. `melanin_index` is
  the seventh and is deliberately not in the table: it is the one index a value
  contract is the wrong instrument for, because there is no app-side value to compare
  against, and it keeps its own open item.

  **Verification before the push**, all four re-run on the final tree: vitest **558
  passed in 85 files** (551 + 7), `python3 ml/selftest.py` **Ran 83 tests ... OK**
  (80 + 3), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .`
  **2 warnings** both in `lib/care.ts` unchanged.


  **Supervisor, same day — same verdict, reached independently, and one claim bounded.**
  The reviewer swept both forms on its own fixture before reading the branch and got the
  same answer on every axis it tried: relative spread of 31.40% against 62.39% on
  exposure, 6.02% against 37.82% on white balance, and **1.18% against 45.72% on skin
  tone**. The tone row is the one that matters for this product and it is the one where
  the gap is widest. The mechanism is that `rIdx = R/(R+G+B)` is homogeneous of degree
  zero — multiply the whole pixel by any scalar and it is unchanged exactly — while
  `a* = 500(f(x) - f(y))` with f a cube root is not, so subtracting two regions does not
  cancel the nonlinearity. The cycle's own five axes are a superset of the reviewer's
  three, and it reports the one axis where the a* form wins (veiling flare, 1.03x)
  instead of leaving it out.

  **What the review bounds is the exposure row.** It is measured over cheekL 70..170,
  but `buildSignals` passes 조명 for **70..210**, so the product publishes readings
  above that band. Re-swept in 0.02 exposure steps and split:

  ```
  band        n    chromaticity   a*        ratio
   70..170    30    3.84%         65.15%    chromaticity by 16.95x
   70..210    43   28.03%         71.64%    chromaticity by  2.56x
  170..210    13   28.29%         25.94%    a* by 1.09x
  ```

  The decision stands — over the band the product uses, chromaticity is still the more
  stable form — but the 24x is a property of stopping at 170. Over the real band it is
  2.56x, and in the top fifth alone the two are equivalent. The cause is the one cycles
  14 and 18 measured: above ~170 the cheek's channels start pinning at the 8-bit ceiling,
  and a ratio of channel sums is homogeneous only while no channel is pinned. Recorded in
  `docs/redness-formula-decision.md`; one synthetic face, so the crossover may be
  fixture-specific while the collapse of the margin is not.

  **Checked rather than accepted.** The app's expressions were extracted byte-identically
  — `rIdx` into `redChromaticity`/`relativeRedness`, and the ITA expression, which was
  duplicated inline in two places, into `itaDegrees` — so nothing published moved:
  `analyzeSkin` on this branch and on main `edbe5c9` agrees at four frame sizes on
  `blemishCount`, `blemishDensity`, `shine`, `relRedness`, `cov`, `toneIta`, `toneLstar`,
  all three levels and `confidence` to twelve decimals, with blemish counts of 7–9 so the
  detector path is exercised. `fallbackVersion` and the manifest are untouched. Three
  source lines broken: the TypeScript `redChromaticity` denominator fails 2 cases
  (`expected 0.010499683744465527 to be 0.011694677871148473`), the Python side of the
  new group fails `ml/selftest.py` with 2 errors, and moving `itaDegrees`' guard from
  0.01 to 0.5 fails with `itaDegrees(70, 0.02): expected 90 to be 89.94270423958551`.
  Rotation: 33 differing lines, all from the two items this cycle touched.
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
