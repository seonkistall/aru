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
  **2026-09-20, cycle 22: built, measured, and taken back out — and what stopped it was
  not the table.** `lib/skin.ts` is byte-identical to main on that branch. Everything
  below is in `docs/srgb-transfer-table.md`, including the five source-line breaks the
  reverted test file was verified against, so landing it does not mean re-deriving it.

  The speed question is answered: **42.0-61.2% off `detectBlemishes`** and **37.6-48.9%
  off `analyzeSkin`**, 9/9 paired reps at four frame sizes, and what would be left of
  the transfer curve in the detector is **3.5-6.5%**.

  The table the item names is the wrong one, and by a lot. Its **1.9e-6** is the
  FIXTURE's error, not the function's: over the whole domain `detectBlemishes` can
  reach — `lum` in [40, 230], `r > b`, gains clamped to [0.6, 1.6] — a 4096-entry
  linear table's worst `|delta a*|` is **1.783e-4** against the certified radius
  **1.046e-5** re-derived the same session. That is 17x OVER, where on the fixture's
  132-220 channels it reads 1.9e-6 and looks comfortable. Knee alignment alone is worth
  **13.7x** (1.783e-4 to 1.297e-5, same size, same interpolation) because a table
  indexed off the 0-255 channel puts the kink inside a cell. And interpolation order
  beats table size: a **512-cell per-cell quadratic** over the power branch is
  **5.485e-7**, a **19.08x** margin, in 12,288 bytes — a third the size and 24x the
  accuracy.

  **What stopped it**: `blemishCount` on the NOISELESS fixture in
  `tests/blemish-density-scale.test.ts` moved from `3, 3, 3, 3, 3` to `2, 3, 3, 2, 3`.
  Making the table 8x finer does not converge on main's answer, it gives three more
  different ones. A nudge of **1e-16** to a\* does the same thing. That fixture has no
  margin: `detectBlemishes`'s suppression breaks plateau ties on an exact float
  equality (`residual[j] === residual[i] && j < i`), a noiseless synthetic face is
  nothing but plateaus, and the assertion holds for one bit pattern only. On the NOISY
  fixture every build agrees, the table included.

  So what this item now waits on is a decision it did not create: **should
  `tests/blemish-density-scale.test.ts`'s "every frame must agree" hold across
  resolutions at all?** The same file's noisy fixture does not satisfy it on main
  either (`5, 4, 2, 4, 2`), so count-invariance is already a property of the noiseless
  path alone. That is a question about what `blemishCount` guarantees, it is bigger
  than a speed item, and a cycle that also wants the speed should not be the one to
  answer it. The behaviour now has a guard either way
  (`tests/blemish-tie-break.test.ts`).

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
  **2026-09-20, supervisor review of cycle 21: it wins, and the acceptance criterion
  above is not sufficient.** Measured in situ rather than as a leaf micro-benchmark,
  which is cycle 17's lesson: two copies of `lib/skin.ts` differing only in
  `srgbLinear`, both imported into one process, 9 alternating paired reps per frame
  size.

  ```
  frame          pow(ms)   lut(ms)    faster   reps won
  400x480          5.396     3.121     42.2%        9/9
  720x960          5.861     3.403     41.9%        9/9
  1080x1440        6.660     4.349     34.7%        9/9
  1440x1920        7.636     5.220     31.6%        9/9
  ```

  That sits under `C5`'s own upper bound re-run the same session (59.9 / 52.6 / 45.4 /
  38.5%), which is what it should do: `C5` replaces the curve with `c*c`, so it bounds
  what any fast path can reach. `blemishCount` and `blemishDensity` — the two fields
  this item names — are byte-identical at all four sizes. **`toneSpread` is not:**

  ```
  400x480    0.052883212269148897 -> 0.05288320807659231   d=4.193e-9
  720x960    0.05289727268417309  -> 0.05289727029154059   d=2.393e-9
  1080x1440  0.05253761924787499  -> 0.0525376193879307    d=1.401e-10
  1440x1920  0.05324491896960167  -> 0.05324491583095241   d=3.139e-9
  ```

  It is published, it is in `NEW_FEATURE_KEYS`, and it is exported into every ML
  sample. `confidence`, `toneIta`, `toneLstar`, `shine`, `relRedness`, `cov`,
  `roughnessRatio`, `tzoneL` and `cheekL` did not move — on this fixture. `toneLstar`
  and `toneIta` come out of `dominantTone`'s k-means, whose cluster assignment is a
  DISCRETE decision, so "did not move here" is a property of the fixture and not a
  guarantee: a 1e-9 nudge that flips an assignment moves them by a lot, not a little.

  The **1.9e-6** above is the DETECTOR's domain, not `srgbLinear`'s. Replaying the
  detector's own gate, the channels it actually feeds `labAStar` are 132–220 on this
  fixture family and the worst a* error there is 1.513e-6 … 1.538e-6 — consistent with
  1.9e-6, and clearing 1.046e-5 as the item claims. Over the whole 0–255 domain the
  worst error is **9.138e-5**, at channel ≈ 11.09, just above the sRGB knee (channel
  10.31) where a straight line and a power law meet inside one table cell. That is 8.7x
  OVER the certified radius. It matters because `srgbLinear` is SHARED: the `L >= 40`
  gate that keeps the input away from the knee lives in `detectBlemishes`
  (`lib/skin.ts:1031`), not in `srgbLinear`, and `rgbToLab` calls it at
  `lib/skin.ts:403`, `1120` and `1128` with region means under no such gate.

  So: worth landing, but scoped and bounded — either the a*-only fast path takes the
  table and `rgbToLab` keeps `Math.pow`, or the table is built so the knee cell is
  exact. And the criterion is every published field plus a re-derived pin, not the two
  fields named above.

  One trap checked and rejected before it was written anywhere: "the detector only ever
  sees 256 integer channel values, so use an exact 256-entry table and the error is
  zero." False. `lib/skin.ts:1026-1028` averages a stride window (`r = sr / n`) and then
  applies a gray-world gain, so the input is continuous in [0,255].
- [AI] **The blemish detector has no guard on its own decision margin, and the obvious
  one is vacuous.** Cycle 22 tried to assert that a realistic (noisy) frame's
  `blemishCount` does not move under a 1e-16 perturbation of a\*. It does not — measured
  at five frame sizes — but **seven source-line breaks of `lib/skin.ts` were tried
  against an assertion of it and none made it fail**, so it ships as a printed
  measurement in `tests/blemish-tie-break.test.ts` and not as a case. The reason is
  structural: a uniform nudge cancels in `astar[i] - background`, and what actually
  moves the noiseless fixture is that the addition ROUNDS differently at different
  magnitudes; quantising the residual absorbs the nudge, and quantising the channel
  averages into plateaus leaves the ties exactly tied. A real guard has to measure the
  margin between competing cells directly — the smallest gap between a surviving cell
  and its suppression-window neighbours, and between a residual and
  `BLEMISH.minResidual` — and assert it is far above float noise. That is what would
  have caught the noiseless fixture's zero margin years before a lookup table did.
  `tests/blemish-perturbation-tolerance.test.ts` already replicates the classifier and
  is the natural home. Noted 2026-09-20.
- [AI] **ARU's sRGB breakpoint is the rounded one, in both languages, and moving it is a
  decision rather than a fix.** Found 2026-09-20 (cycle 22) while deciding where to
  align the transfer table, from `colour-science/colour`'s own source — another
  project's implementation, not IEC 61966-2-1, which this network cannot reach
  (`webstore.iec.ch` `http=000`, and so do `www.itu.int`, `www.w3.org` and
  `en.wikipedia.org`). Its `eotf_sRGB` does not branch on a literal: it branches on
  `eotf_inverse_sRGB(0.0031308)`, that is on `12.92 * 0.0031308 = 0.040449936`.
  `lib/skin.ts:srgbLinear` and `ml/ita.py:36` both use **0.04045**, which is 6.4e-8
  higher, 1.632e-5 of one 8-bit level, and leaves ARU's own curve discontinuous by
  **2.3295e-9** at its knee. The multiplicative constants (12.92, 0.055, 1.055, 2.4)
  agree exactly. **0 of 256** integer channels fall in the window where the two
  implementations take different branches, though the detector's inputs are continuous
  so it is reachable in principle. Nothing is wrong today and nothing depends on moving
  it — the two languages agree with each other, which is what parity needs — but it
  must not be written down as verified against the standard, and if it moves it has to
  move in BOTH files in one change or it reintroduces exactly the split cycle 18 closed.
  Measurements and the fetch's sha256: `docs/srgb-transfer-table.md` §1.
- [AI] **`/scan` has no pixel-level mobile-layout coverage, and that is how the camera
  quality checklist clipped its labels in all five locales unnoticed.**
  `tests/e2e/mobile-layout.spec.ts` asserts overflow on `/` and `/studio` only, and
  visits `/scan` solely for the camera-denied tap-target case, because reaching
  `phase === "ready"` needs a fake media stream that suite does not set up. So the
  clipping fixed in cycle 22 was caught by hand in a browser and is pinned by a SOURCE
  contract (`tests/mobile-layout-contract.test.ts`), which cannot see a pixel. A fake
  `getUserMedia` returning a canvas stream would let the spec reach the live-camera
  screen and assert `scrollWidth <= clientWidth` on every check, which is the assertion
  that would have caught it. Noted 2026-09-20; the measurement both ways is in
  `docs/scan-quality-checklist-layout.md`.
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
- [AI] Four i18n keys are carried by `en.ts` and `ar.ts` and by neither `ja.ts` nor
  `zh.ts`, and they are dead in all four: `"피부 영역을 가이드 안에 맞춰주세요."` and the
  three beside it are retake-guidance sentences that no code emits — the live loop in
  `app/scan/use-quality-loop.ts` uses a different, fully covered set. Found 2026-09-20
  while auditing coverage the other way round, which came back clean: all 333 `t("…")`
  Korean literal call sites across 284 distinct keys resolve in all four dictionaries,
  so nothing a user sees falls back to Korean. The question is only whether the four are
  stale entries to delete or a retake path that was removed and should come back; that
  needs someone to say which, so it is not a delete a cycle should do on its own.
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
  `lib/tone-bands.ts`) have no primary source reachable from this network.
  `docs/tone-ita-verification.md` establishes that ARU computes the *angle* correctly to
  1.8e-02 degrees against two references; where to cut it is a separate question and
  stays unverified. Nothing depends on moving them, but it must not be written down as
  verified. Noted 2026-09-16.
  **2026-09-20, cycle 21: the attribution was corrected and the item did not close.**
  This item and a near-duplicate of it (same claim, same date, a sentence apart in
  wording) both said the cut points were "attributed to the Chardon convention"; they
  are Del Bino & Bernerd's six-category cutpoints, and Chardon's is the arctan
  formula. `ml/subgroups.py` and `lib/tone-bands.ts` now say so, agreeing with
  `ml/skin_indices.py`, which had said it all along. The evidence is `src/clinical.py`
  in hpicsk/regional-ccm — another project's source code, not either paper — so this
  stays open for exactly the reason it was opened. The duplicate is merged into this
  one, which is the other thing that kept it from being read.
  `docs/melanin-index-verification.md` §4.
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

- 2026-09-20 (cycle 22) — Branch `autopilot/2026-09-20-1839`. **The `srgbLinear` lookup
  table was built, measured at 42.0-61.2% off `detectBlemishes`, and taken back out —
  and what stopped it was not the table. It moved `blemishCount` on one committed
  fixture, and so does a nudge of 1e-16, because that fixture is noiseless and
  `detectBlemishes` settles plateau ties on an exact float equality. `lib/skin.ts` is
  byte-identical to main; the finding got a guard instead.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief: `npm run smoke` green with
  the chromium override (`Smoke test passed.`), `npx tsc --noEmit | grep -c "error TS"`
  **13**, `npm run lint` **0 errors, 2 warnings** both in `lib/care.ts`, vitest **571
  passed in 86 files**, `python3 ml/selftest.py` **Ran 85 tests ... OK**.

  **Research: ARU's sRGB breakpoint is the rounded one, and that decided where the
  table's knee goes.** No primary source is reachable — `webstore.iec.ch`,
  `www.itu.int`, `www.w3.org` and `en.wikipedia.org` all returned `http=000` on the
  same probe — so IEC 61966-2-1 was not read and nothing is attributed to it. What
  `raw.githubusercontent.com` served is `colour-science/colour`'s own source
  (`http=200 bytes=4308`, sha256 `520ba88acb642628ee2d99f3d4802ea1e0725f946ece49f725b581fdcfb9f973`,
  re-fetched in-session and matching byte for byte). Its multiplicative constants —
  12.92, 0.055, 1.055, 2.4 — are `lib/skin.ts:srgbLinear` and `ml/ita.py:36` character
  for character. Its BREAKPOINT is not a literal: it branches on
  `eotf_inverse_sRGB(0.0031308)`, that is `12.92 * 0.0031308 = 0.040449936`, against
  ARU's **0.04045**. The gap is 6.4e-8 in `c`, **1.632e-5 of one 8-bit level**, it
  leaves ARU's own curve discontinuous by **2.3295e-9** at its knee, and **0 of 256**
  integer channels fall inside it. So the table was aligned to ARU's breakpoint and not
  to the reference's: aligning it to the "more correct" one would have silently changed
  the shipped curve and split `lib/skin.ts` from `ml/ita.py`, which is exactly the
  divergence cycle 18 closed. On the backlog now, as a decision for both languages at
  once. `docs/srgb-transfer-table.md` §1.

  **ML: the item's own acceptance criterion was met by 19x and the change still could
  not ship.** Three numbers the item did not have. The **1.9e-6** in it is the
  FIXTURE's error, not the function's: over the whole domain `detectBlemishes` can
  reach — `lum` in [40, 230], `r > b`, each channel then scaled by a gain
  `frameChannelGains` clamps to [0.6, 1.6] — a 4096-entry linear table's worst
  `|delta a*|` is **1.783e-4** against the certified radius **1.046e-5** re-derived the
  same session, i.e. **17x over**, while on the fixture's 132-220 channels it reads
  1.9e-6 and looks safe. Knee alignment alone is worth **13.7x** (1.783e-4 to 1.297e-5,
  same size, same interpolation). And interpolation order beats table size: a 512-cell
  per-cell QUADRATIC over the power branch is **5.485e-7** — a **19.08x** margin — in
  12,288 bytes, a third the size of the table that does not clear it.

  Scoped the way the cycle-21 review asked: `labAStar` and `rgbToLab` kept `Math.pow`,
  a second entry point took the table, both sharing one extracted a\* formula. So
  `toneSpread` — which moved at all four frame sizes when that review replaced
  `srgbLinear` wholesale — did not move at all, and every field `analyzeSkin` publishes
  was byte-identical against a `Math.pow` build at four frame sizes on a light fixture
  AND a dark one, compared with `Object.is`. Measured in situ, both builds loaded
  fresh, 9 alternating paired reps:

  ```
  frame          pow(ms)   table(ms)   faster   reps won
  400x480          6.664       3.588     46.2%        9/9
  720x960          7.472       3.821     48.9%        9/9
  1080x1440        8.242       4.568     44.6%        9/9
  1440x1920       10.075       6.286     37.6%        9/9
  ```

  **And then smoke went red on a fixture the branch had not looked at.**
  `tests/blemish-density-scale.test.ts` reads the five-spot face with
  `noiseAmplitude = 0` at five resolutions and asserts every frame agrees:
  `AssertionError: counts across resolutions: 2, 3, 3, 2, 3: expected 2 to be 1`.
  Making the table finer does not converge on main's answer — `N=1024` gives
  `2, 3, 2, 3, 4`, `N=2048` gives `2, 5, 4, 3, 3`, `N=4096` gives `2, 3, 2, 3, 2` —
  which is what said the table was not the cause. Builds differing only by a constant
  added where a\* is consumed:

  ```
  build                counts across the five realistic resolutions   (noiseAmplitude 0)
  m-exact              3, 3, 3, 3, 3   distinct=1
  m-table              2, 3, 3, 2, 3   distinct=2
  m-e15  (+1e-15)      4, 3, 2, 4, 4   distinct=3
  m-e16  (+1e-16)      2, 4, 4, 4, 3   distinct=3

  the same builds at noiseAmplitude 9
  m-exact / m-table / m-e15 / m-e16    5, 4, 2, 4, 2   distinct=3, all four identical
  ```

  **1e-16** moves it — below one ulp of a\* at these magnitudes, eleven orders of
  magnitude under the certified radius. The mechanism is one line:
  `detectBlemishes`'s suppression breaks plateau ties on `residual[j] === residual[i]
  && j < i`, and a noiseless synthetic face is nothing but plateaus, so the count is
  settled by scan order rather than by the image. On a noisy face every build agrees.
  So the assertion holds for exactly one bit pattern, and whether `blemishCount` should
  be resolution-invariant at all is a question about what the detector guarantees —
  made harder by the fact that the same file's NOISY fixture does not satisfy it on
  **main** either (`5, 4, 2, 4, 2`). That is bigger than a speed item and a cycle that
  wants the speed is the wrong one to decide it. The table came out, the item stays
  open with every number on it, and `lib/skin.ts` and `tests/scan-cost-benchmark.test.ts`
  are byte-identical to main.

  **What landed instead: `tests/blemish-tie-break.test.ts`.** It pins the tie-break line
  and its comment as source and asserts that the noiseless fixture's agreement really
  does rest on it. Five breaks in `lib/skin.ts`, never in the test: removing the
  tie-break clause fails `the suppression tie-break moved` and reads `12, 4, 7, 4, 4`;
  rewording its comment fails the source pin; rounding the averaged channels to integers
  fails `the shipped build is supposed to agree: 2, 4, 3, 4, 3`; quantising the residual
  to 3 decimals fails with `2, 3, 2, 2, 2`; quantising the channel averages to steps of
  8 fails with `14, 8, 11, 15, 13`. **One thing is deliberately not asserted**: that a
  noisy face is stable under the nudge. It is (printed under `ARU_PRINT_TIE_BREAK=1`),
  but **seven source-line breaks were tried against an assertion of it and none made it
  fail** — a uniform nudge cancels in `astar[i] - background` — so it ships as a
  measurement. An assertion nothing can break is a green line that looks like coverage.
  On the backlog as the margin guard that would actually bite.

  **UI/UX: the live camera checklist clipped its own labels in all five locales, and it
  was measured in a browser rather than reasoned about.** `QualityPanel`
  (`app/scan/guide.tsx`) laid out one grid track per check, which is 47px per cell in
  the 320px content box of a 360px phone; `overflow: hidden` zeroes a grid item's
  automatic minimum size, so the `1fr` tracks shrank below min-content and
  `whiteSpace: "nowrap"` had nowhere to go. In chromium at 360px on the real `/scan`
  page, so the app's own stylesheet and fonts decided the metrics: **20 of 30 label
  cells clipped, every locale** — ko `피부 선명도` lost 24.1px of 71.1px, en
  `Capture area` 33.6px of 80.6px, ja `測定エリア` 22.3px of 69.3px, zh `肌肤清晰度`
  21.5px of 68.5px, ar `منطقة القياس` 29.1px of 76.1px — and `body { overflow-x: hidden }`
  meant nothing scrolled into view either. This is the screen that tells a user what to
  fix before the shutter fires. `repeat(auto-fit, minmax(96px, 1fr))` and no clipping
  gives three columns of 101px at that width; re-measured the same way, **0 of 30**.
  Pinned in `tests/mobile-layout-contract.test.ts`, broken three ways at the source.
  The assertion is sliced to the ONE line carrying the cell style, because the first
  attempt matched the comment explaining the fix — the cycle-20 docstring trap, hit and
  caught. `docs/scan-quality-checklist-layout.md`.

  **Bug fix: a full page of funnel rows read as a truncated one, and `/ops` said so.**
  `aggregateFunnelSource` (`lib/funnel-aggregate.ts`) computed
  `truncated: totalRows > rows.length`, but `rows` is the COUNTABLE subset —
  `toCountableRows` drops rows whose `kind` or `session_id` is not a usable string and
  reports them separately as `unusableRows`. So any unusable row made a complete page
  read as truncated. Reproduced against the real module before it was touched:

  ```
  raw rows PostgREST returned : 10
  exact count for the source  : 10
  aggregate.rows              : 8
  aggregate.unusableRows      : 2
  aggregate.totalRows         : 10
  aggregate.truncated         : true   <- nothing was truncated
  unattributedRowCount(10,..) : null
  ```

  Both consequences are the operator's only view of the table: `/ops` printed "Showing
  the most recent 8 of 10 rows" about a page that was not short, and
  `unattributedRowCount` returns `null` the moment any source is truncated, so it
  stopped reporting unattributed rows at all. Both wrong in the direction of claiming
  data is missing when it is not. Truncation is now measured against `raw.length`.
  Two cases in `tests/funnel-aggregate.test.ts`, one for each direction so the fix
  cannot be "never truncated"; broken at the source line, `truncated: totalRows >
  rows.length` fails with `nothing was truncated: 3 of 3 rows were read: expected true
  to be false`.

  **Verification.** `npm run smoke` green (`Smoke test passed.`), vitest **577 passed in
  87 files** (+6 cases, +1 file), `npx tsc --noEmit | grep -c "error TS"` **13**
  unchanged, eslint **0 errors, 2 warnings** the same two in `lib/care.ts`,
  `python3 ml/selftest.py` **Ran 85 tests ... OK**. `lib/skin.ts`,
  `tests/scan-cost-benchmark.test.ts`, `public/models/visible-attributes/manifest.json`
  and `fallbackVersion` are all untouched; `NEXT_PUBLIC_FUNNEL_FLUSH` was not set.

  **Supervisor review.** The cycle's own conclusion was re-derived here before it
  reported, and it holds on a fixture it never used.

  *The 1e-16 claim reproduces on different landmarks.* Built three copies of
  `lib/skin.ts` differing only by a constant added where a\* is consumed, and ran them
  over the scan-cost benchmark's SPREAD landmark layout rather than
  `tests/blemish-density-scale.test.ts`'s, at five frame sizes:

  ```
  NOISELESS (amp 0)
    exact     5, 5, 5, 5, 5   distinct=1
    +1e-16    5, 5, 6, 5, 6   distinct=2
    +1e-15    5, 5, 5, 5, 5   distinct=1
  NOISY (amp 9)
    exact     6, 6, 5, 5, 5   distinct=2
    +1e-16    6, 6, 5, 5, 5   distinct=2
    +1e-15    6, 6, 5, 5, 5   distinct=2
  ```

  Different fixture, different absolute counts, same phenomenon: on the noiseless face
  a 1e-16 nudge destroys resolution stability, and on the noisy face all three builds
  are bit-identical. **One detail sharpens the cycle's argument rather than weakening
  it: here +1e-15 did NOT move the counts while +1e-16 did.** The effect is not
  monotonic in epsilon, which is what it must look like if the cause is WHICH ties
  break rather than HOW BIG the error is. An accuracy problem would be monotonic. The
  mechanism is one line and it reads as claimed — `lib/skin.ts:1091`,
  `residual[j] === residual[i] && j < i`, an exact float equality on a plateau that a
  noiseless synthetic face is made entirely of.

  *The parity breach was hit here first, and the cycle's design routes around it
  better than this review's did.* This review had built the table behind a scoped
  `srgbLinearFast` called from `labAStar`, which keeps `toneSpread` still (confirmed:
  no published field moved at any of four sizes, 26.3–36.3% faster, 35/36 paired reps)
  and then fails `tests/index-parity.test.ts` exactly as the cycle records —
  `expected 0.0031556203582971953 to be 0.003155620347972121` from a 4096-interval
  linear table, against the cycle's `expected 0.003155620347528032 to be
  0.003155620347972121` from its 512-cell quadratic. Same committed value, two
  different tables, one contract. The cycle's second entry point (`labAStarTabulated`,
  sharing an extracted `aStarFromLinear`) leaves `labAStar` on `Math.pow` and is the
  right shape; the scoped-`srgbLinear` design this review proposed in the cycle-21
  backlog note was not, and is superseded.

  Regenerating the committed table would not have rescued it either, it would move the
  failure to Python: `ml/selftest.py:813` compares `ml/ita.py` to the same rows on a
  MECHANISM-DERIVED tolerance of `4 * channelScale * 2**-52` = **4.4409e-13** for a\*,
  and the observed difference at mid grey is **1.0325e-11**, **23.2x** over it — with
  ~1.5e-6 on the detector's own domain, seven orders out. That bound is the size of a
  last-place disagreement between two correctly implemented `pow`/`cbrt`; a table's
  interpolation error is not that kind of error, and widening k to swallow it would
  turn a derived bound into a fitted one.

  *The funnel defect is real on main.* Putting main's `lib/funnel-aggregate.ts` back
  and running the new case fails with `nothing was truncated: 3 of 3 rows were read:
  expected true to be false`, so the guard bites at its source and the bug it describes
  is live today.

  *One reviewer error, recorded because that is the standard here.* This review first
  read the branch as RED — one failing test — and it was this review's own
  contamination. `git checkout origin/main -- <path>` writes the INDEX as well as the
  working tree, so the later `git checkout -- <path>` restored main's version from that
  staged index rather than the branch's. The branch was green throughout: with the tree
  actually clean, **577 passed in 87 files**. Same class as cycle 20's docstring regex —
  a check that fails for a reason that is not the code's, and it looks exactly like a
  defect.

- 2026-09-20 (cycle 21) — Branch `autopilot/2026-09-20-1239`. **The registry's 24
  borrowed numbers were never checked against the work they came from; all 24 hold. And
  that check is what settled the `melanin_index` fork the backlog had been holding open:
  the benchmark ARU cites computes the melanin index from L\* too, so the index is
  DERIVED and the app should not grow a field to carry it. `FEATURE_KEY` keeps the six
  indices the app carries and `DERIVED_FROM` carries the one it does not.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** `npm run smoke` green with the chromium override
  (`Smoke test passed.`), `npx tsc --noEmit | grep -c "error TS"` **13**, `npm run lint`
  **0 errors, 2 warnings** both in `lib/care.ts`, `python3 ml/selftest.py` **Ran 84 tests
  ... OK**. Vitest was **565 passed in 86 files** per the brief.

  **Research: `raw.githubusercontent.com` answers, so the source could be read, and it
  was the right thing to read.** `ml/skin_indices.py` opens with a 20-line benchmark
  summary that the whole transfer-class design rests on, and nothing had ever checked it.
  Its named source is hpicsk/regional-ccm, whose `srt_submission/parameters.tex` carries
  the header `%%% AUTO-GENERATED by src/build_parameters.py. %%% Source: results/*.json`
  — so every macro in it is a number the analysis produced rather than one an author
  typed. **24 of 24 matched**, subjects through ANOVA eta-squared, with the full table in
  `docs/melanin-index-verification.md`. Two characterisations were checked as well as the
  figures: a\* 0.725 and b\* 0.713 sit below the source's own `ICC_GOOD_MIN = 0.75`, so
  "only moderate" holds, and 0.1165 / 0.0006 = **194.17**, so "roughly 200x" holds.
  Fetched with `http=200` and sha256 recorded; `doi.org` and `www.ncbi.nlm.nih.gov`
  returned `http=000` on the same probe, so this is the authors' code and generated
  parameters, not either paper, and the doc says so in those words.

  **ML: the fork was a decision and the source decided it.** `FEATURE_KEY`'s contract is
  "the feature key `lib/skin.ts` writes into every exported sample". It declared
  `melanin_index` to be `toneLstar`, and at L\* = 70 the index is **15.490195998574317**
  while the declared column holds **70** — a nonlinear transform named as if it were the
  value. The backlog's two options were: add an app-side melanin field, or give the
  registry a second kind of entry. `src/clinical.py:compute_melanin_index` computes the
  same `100*log10(100/L*)` from a CIELAB L\* reading with the same `1.0` floor, so it is
  a derived quantity and an app-side field would be an export column with no producer and
  no reader — `melanin_index()` has no caller in this repository outside `ml/selftest.py`,
  which is exactly why nobody had noticed. `DERIVED_FROM` now names the INPUT column; an
  index in neither map or in both fails `ml/selftest.py`, a derived index equal to its
  source fails it too, and a derived index whose source is not a real `SkinRawFeatures`
  field fails `tests/skin-index-contract.test.ts`.

  The source's ONE deviation is left in place deliberately and measured rather than
  waved at: it clips L\* to `[1.0, 100.0]` and ARU clips only the bottom, so above
  L\* = 100 the source returns 0.0 and ARU a negative number. Over **all 16,777,216**
  8-bit sRGB triples through `ml/ita.py:rgb_to_lab` the maximum L\* is **100.0 exactly**,
  at `rgb=(255, 255, 255)`. Copying the upper clip would make pure white and a physically
  impossible L\* report as the same skin, which is worse than a negative number only a
  caller that is already wrong can reach.

  **Bug fix: `efficacyClean()` is Korean-only by design and the multilingual gate that
  covers for it had holes in three of the four languages.** `reasonClean` runs
  `efficacyClean` first and then `BANNED_BY_LANG[lang]`, and that file's own header says
  it mirrors `lib/recommend.ts BANNED`. It did not. Measured, not assumed — nine
  sentences of the kind a model writes when told to sell a product in one line passed
  the gate:

  ```
  en 효능/효과: A gentle formula with a visible brightening effect.
  en 효능/효과: Proven efficacy on enlarged pores.
  zh 효능/효과: 对油性肌肤效果明显。
  zh 효능/효과: 温和有效，适合日常使用。
  ar 개선: يساعد على تحسين ملمس البشرة.
  ar 효능/효과: فعالية عالية للبشرة الدهنية.
  ar 효능/효과: منتج فعال لتقليل اللمعان.
  en 피부과: Dermatologist recommended for sensitive skin.
  zh 피부과: 皮肤科医生推荐。
  ```

  Three concepts had no equivalent somewhere: **효능/효과** was absent from `en` and
  `ar` and present in `zh` only as the compounds 功效/疗效 and never as plain 效果,
  **개선** was absent from `ar` entirely, and **피부과** was absent from `en`, `zh` and
  `ja`. `ar` had no test case in `tests/claim-filter.test.ts` at all, which is how a
  whole missing concept survived. All nine are now cases. Two additions are deliberately
  blunt and the header says so: English `effect` catches "a cooling effect", and Arabic
  `تأثير`/`فعال` catch neutral uses — a false positive costs one pre-approved template
  fallback, which is the asymmetry the filter already declared it was built on.
  `efficacyClean()` itself is untouched and still runs first on every candidate, so the
  Korean spellings were blocked in every locale the whole time; what leaked was
  non-Korean wording in the non-Korean locales.

  **UI/UX: the share card and the report described the same level with two different
  words, and the duplication is what let them.** `lib/share-link.ts` keeps its own copy
  of the three axes' level labels; `pores[1]` read **"결 약간"** against `SKIN_LABELS`'
  **"결 약간 보임"**. So a sender whose report said one thing shared a link whose mood
  line said the other — on `/`, the page a first-time visitor lands on from a friend, and
  the only organic acquisition path the product has. Fixed to match. The copy is NOT
  replaced by an import, on purpose: `app/components/mood-from-link.tsx` is the only
  consumer and it renders on that landing, so importing `lib/skin.ts` would put the whole
  ~1,300-line analysis runtime into the bundle of the one page whose load time is the
  viral loop's first impression. Instead `MOOD_LABELS` is exported for one reason and the
  reason is in the comment: `tests/share-link.test.ts` imports both tables and compares
  them element by element, which a test may do and a page may not.

  **A second research finding, corrected in the repository rather than only recorded.**
  Three files describe the same five ITA edges and credited them to two different papers:
  `ml/subgroups.py` and `lib/tone-bands.ts` said "the Chardon convention", while
  `ml/skin_indices.py` said "Del Bino & Bernerd cutpoints". The source separates them the
  ordinary way — `src/clinical.py` attributes the arctan FORMULA to Chardon et al. (1991)
  and Del Bino et al. (2006), and the six-category CUTPOINTS −30/10/28/41/55 to Del Bino
  & Bernerd (2013) — and ARU uses those cutpoints. The two files now say so. **This does
  not close the open backlog item**, which asks for a primary source and is not satisfied
  by another project's source file; the repository merely stopped contradicting itself,
  and `docs/tone-ita-verification.md` says that in those words. The two duplicate copies
  of that item in "Next" are merged into one, which is the other thing that kept it from
  being read.

  **Also recorded and not acted on:** the source guards ITA at `|b*| < 1e-6` with a signed
  epsilon, so an exact zero collapses to `+90` whatever L\* is, against ARU's cycle-20
  `b* == 0 → L* > 50 ? 90 : -90`. Not changed to match. Cycle 20 measured that a window
  guard puts 242 of 256 8-bit greys inside it and returns the wrong sign for 241; the
  source's window is the narrow one (1 of 256) and ARU's `== 0` is narrower still. At
  exactly zero the value is a convention either way. Written down in
  `docs/melanin-index-verification.md` §5 so a future cycle comparing the two does not
  read the difference as a defect.

  **Thirteen breaks, every one at the SOURCE line and never at the test.** Four on the
  registry split, four on the claim filter, one on the share labels, and the guards that
  already existed were left alone:

  ```
  melanin_index put back in FEATURE_KEY     2 fail; melanin_index is declared both
    (and left in DERIVED_FROM)                carried and derived; toneLstar is already
                                              some other index's own value
  melanin_index() made the identity         1 fail; 30.0 == 30.0 within 6 places :
    (`return lstar`)                          melanin_index equals its source toneLstar
                                              at L*=30.0; if that holds everywhere it
                                              belongs in FEATURE_KEY
  melanin_index moved back to FEATURE_KEY   1 fail; expected 'FEATURE_KEY = {\n
    and out of DERIVED_FROM                   "relative_rednes…' not to contain
                                              'melanin_index'
  a 2nd DERIVED_FROM entry whose source     1 fail; toneLightness missing from
    is not a SkinRawFeatures field            SkinRawFeatures
  en effect|efficac|proven removed          1 fail; expected true to be false
  ar تحسين|تحسن|يحسن removed                 1 fail; expected true to be false
  zh 效果|有效|见效 removed                    1 fail; expected true to be false
  dermatolog|皮肤科|皮膚科 removed             1 fail; expected true to be false
  share pores[1] drifted back to "결 약간"    2 fail; expected [ '결 매끈', '결 약간',
                                              '결 뚜렷' ] to deeply equal [ '결 매끈',
                                              '결 약간 보임', '결 뚜렷' ]; expected
                                              '유분 적음 · 붉은기 낮음 · 결 약간' to
                                              contain '결 약간 보임'
  ```

  The first break is the one worth keeping: it fires TWO different assertions from two
  different tests, because "carried and derived at once" and "that column is already
  another index's value" are separate ways the split can be violated and neither implies
  the other.

  **Nothing that moves a reading moved.** `lib/share-link.ts` gained one exported alias
  (`MOOD_LABELS`) and one corrected string constant; `lib/skin.ts` is untouched. No index
  formula, threshold, or `fallbackVersion` was touched, and `public/models/visible-
  attributes/manifest.json` is byte-identical — `status` and `promotionGate` included.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented. PR #69's area
  (`ml/train_visible_attributes.py`) not touched.

  **Six new vitest cases and one new Python case**, which is the 565 → 571 and 84 → 85
  below. Verification: `npm run smoke` **`Smoke test passed.`** — inside it
  `npx vitest run` **571 passed in 86 files**, the mobile E2E suite **44 passed (3.0m)**
  with the chromium override, and `python3 ml/selftest.py` **Ran 85 tests ... OK**.
  Separately, `npm run lint` **0 errors, 2 warnings** (the same two, `lib/care.ts`) and
  `npx tsc --noEmit` **13 errors** (the baseline, unchanged).
  Rotation: `docs/AUTOPILOT.md` 1342 → 1304 lines, `docs/autopilot-changelog.md`
  3591 → 3823, and the moved cycle-18 block is byte-identical — `diff` of the 202-line
  block against the changelog's last 202 lines is empty.

  **Supervisor review.** Everything load-bearing was re-derived independently before the
  worker reported, and the two things that decided the cycle were derived against it.

  *The melanin_index declaration was worse than the backlog said, and the fix closes it.*
  The backlog called the declaration wrong. Measured on main, it was **unpinned**: the
  declaration was swapped at its source line to a different, wrong field (`toneIta`, an
  angle in degrees), patching only inside the `FEATURE_KEY` block so no docstring was
  hit, and **565 vitest and 84 Python tests all stayed green**. The check meant to catch
  it (`tests/skin-index-contract.test.ts:196`) asserted only that the name appears as a
  `number` field on `SkinRawFeatures` — a name-only check, blind to a transform — and it
  had already been the vector for `shine_ratio` (cycles 16/19) and `relative_redness`
  (cycle 19). Re-run on this branch, both breaks fail as they should: restoring
  `melanin_index` to `FEATURE_KEY` fails `ml/selftest.py`
  (`melanin_index is declared both carried and derived`) **and** vitest; pointing
  `DERIVED_FROM` at a wrong-but-existing column (`cov`) fails vitest. The cycle also
  caught something this review did not: the old slice ran to `#: Feature keys added`,
  so with a second map between them it would have swallowed `DERIVED_FROM`'s entries and
  passed them through the `SkinRawFeatures` check as though they were carried. It now
  slices at each map's own closing brace.

  *The 24 figures were re-fetched, not taken on trust.* All three cited files were
  re-fetched independently and all three sha256 match byte for byte:
  `src/clinical.py` **008796658a2af68d…** (16,843 bytes), `parameters.tex`
  **b7ced068d7dbcdf…** (10,528), `README.md` **ced5768ac11f057…** (6,406). Against the
  fetched source: `compute_melanin_index` is `100 × log10(100 / L*)`,
  `MI_L_STAR_FLOOR = 1.0`, and line 361 is `np.clip(L_star, MI_L_STAR_FLOOR, 100.0)` —
  so the "one deviation is the upper end" claim is exact. The attribution split holds
  too: line 67 credits the six-category CUTPOINTS to Del Bino & Bernerd (2013) and line
  388 the FORMULA to Chardon et al. (1991), and the source's
  `ITA_BIN_EDGES = (-30.0, 10.0, 28.0, 41.0, 55.0)` are ARU's `ITA_BANDS` edges with
  Brown and Dark merged, which is the only difference the docstring claims.

  *The two new app-side guards bite at their source lines.* Reverting `pores[1]` to
  `결 약간` fails `tests/share-link.test.ts` on two cases; dropping `effect` from the
  English pattern fails `tests/claim-filter.test.ts`. `reasonClean` was checked for the
  obvious hazard in widening the pattern — `app/api/reason/route.ts:77` returns
  `item.fallback` WITHOUT re-filtering it, so a blunt pattern costs a template fallback
  and cannot loop. Checked separately: the new `결 약간 보임` is present in all four
  dictionaries, so the label change does not leak Korean.

  *Rotation, checked against a pre-review snapshot of main.* 1342 → 1304 and 3591 →
  3823 as claimed. `sort -u` over the non-blank lines of both files then `comm -23`
  against main's 4,164: **25 lines missing**, and all 25 belong to the two backlog items
  this cycle worked. All **14** non-blank lines of the closed `melanin_index` item are
  preserved verbatim in the changelog blockquote. The ITA-band item did NOT close — its
  primary source is still unreachable — and the near-duplicate it absorbed was real:
  main carried the same claim twice, at `docs/AUTOPILOT.md` lines 495 and 530.

  *Nothing published moved.* The manifest is untouched, `fallbackVersion` is still
  `roi-calibrated-2026-09-18`, `lib/tone-bands.ts` and `ml/subgroups.py` are
  comment-only, and no band edge changed.

  *One thing this review found that the cycle did not*, recorded on the backlog item
  itself: the `srgbLinear` LUT wins in situ (31.6–42.2% off `analyzeSkin`, 35/36 then
  36/36 paired reps) but the item's stated acceptance criterion is not sufficient —
  `toneSpread` moves at all four frame sizes while `blemishCount` and `blemishDensity`
  do not, and the item's **1.9e-6** error figure is the detector's domain rather than
  `srgbLinear`'s, which is **9.138e-5** at the sRGB knee.

  *One re-verification, so a five-day-old block is not quoted as current.* The commerce
  deep-link item's egress block was re-run today: `curl: (56) CONNECT tunnel failed,
  response 403` for all three merchant hosts, and the proxy's own
  `recentRelayFailures` names each one with `gateway answered 403 to CONNECT`. Still
  blocked, same reason.

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
