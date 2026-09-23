# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-23

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
  **2026-09-21, cycle 23: the acceptance instrument now exists.** The decision margin of
  every counted cell is measured and asserted in
  `tests/blemish-perturbation-tolerance.test.ts` (§7 of
  `docs/blemish-perturbation-tolerance.md`), so a candidate table can be checked against
  the margin it has to clear rather than against the certified radius alone. What this item
  waits on has not changed: the noiseless fixture's zero margin, which is now an assertion
  rather than a finding, and the decision recorded in the item below it.
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
- [~] [AI] **Should `detectBlemishes` notice that a frame is plateau-dominated, instead of
  reporting a count settled by scan order?** Opened 2026-09-21 (cycle 23), from the guard
  that measured it. On the noiseless fixture one to three of the five counted cells are
  tied with a suppression neighbour EXACTLY, so `j < i` and not the image decides them,
  and the decision margin is zero at every frame size. The tie-break itself is not the
  problem and should not be "fixed": `scikit-image`'s `peak_local_max` resolves an
  intensity tie the same way (stable argsort over row-major coordinates, then a greedy
  `_ensure_spacing`), read from its own source at v0.24.0/v0.25.2. What that reference has
  and ARU does not is a degenerate-input branch — `_get_peak_mask`'s
  `# no peak for a trivial image`, which reports NO peaks when every masked cell is a local
  maximum. It is not transplantable as it stands: it fires only on an entirely flat field,
  and ARU's noiseless fixture is plateau-dominated but not flat, so a copy of it would not
  fire there. The open question is what `blemishCount` should do on a degenerate frame —
  report it, refuse it, or carry a confidence — and it is the same question as "should
  `tests/blemish-density-scale.test.ts`'s cross-resolution agreement hold at all", which
  the `srgbLinear` item above is still waiting on. Answering one answers both. Evidence and
  the fetch sha256s: `docs/blemish-perturbation-tolerance.md` §7.5.
  **2026-09-22, cycle 28: it notices now, and the half that is a product decision is still
  open.** `detectBlemishes` returns `tiedPeaks` next to `count` and `areaFace` — how many
  counted cells carry a neighbour with the bit-identical residual, so `j < i` and not the
  image picked the survivor. `count` is byte-identical and nothing reads the new field yet.
  Why it had to be INSIDE: §7.4's sixth break (quantise `residual[i]` to three decimals) is
  invisible to the replica, which rebuilds the residual from the captured a\* grid, and both
  margin cases stayed green under it. Counted off the residual the detector actually
  classifies, that break now fails a case whose message names it — `noise 4 600x720: 2 of 5
  counted cells are settled by scan order, not by the image` — with the two margin cases
  still green, which is §7.4's own finding reproduced. Fifteen realistic frames carry zero
  ties; the noiseless fixture reads `3/2 3/1 3/2 3/0 3/1` across
  `tests/blemish-density-scale.test.ts`'s five sizes, so **`1080x1296` has no tie at all**
  and "the noiseless fixture always has a tie" is false — the case pins the vector rather
  than asserting `> 0`. The research half says what shape the answer takes: scipy's
  `find_peaks` makes a plateau's extent a reported property (`plateau_sizes`, `left_edges`,
  `right_edges`) and documents `(None, None)` for computing it without filtering anything,
  so **report first, decide the filter separately**. Taking that second half — refuse, or
  carry a confidence, on a published index — is the product call this item still holds, and
  it is still the same question as the cross-resolution assertion.
  `tests/blemish-plateau-census.test.ts`, `docs/blemish-perturbation-tolerance.md` §7.6-§7.7.
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
- [~] [AI] `minQwkGainOverHeuristic` is 0.0 — strictly-greater, with no noise band. A
  model that beats the heuristic by 0.001 on one validation split passes, and that
  gain may be noise. Estimate the band: bootstrap the validation rows, report a CI on
  the qwk difference, and require the gain to clear it. That is the honest version of
  a margin, and the reason no positive number was invented for it.
  **2026-09-21, cycle 24: the band is measured and reported, and the third clause is
  the owner's.** `ml/qwk_noise.py` puts a percentile bootstrap on the qwk difference —
  scipy's convention, read from scipy's own source and then verified numerically
  against the installed scipy (`worst |mine - np.percentile| = 5.551e-17`; against
  `scipy.stats.bootstrap` the bounds agree to 6.0e-4 and 2.7e-4, which is the
  Monte-Carlo spread). Every run's `metrics.json` now carries `gainNoiseBand` and
  `clearsNoiseBand` per covered axis, and `promotion_check` returns a `warnings` list
  separate from `blockers`.
  **The number the item asked for: at the gate's own `minTrainingCrops: 300` the 95%
  band on the gain is about ±0.15 qwk.** Two scorers identical in expectation produced
  raw gains up to **+0.0869** over twelve trials at that size, and every one of them
  passes `gain > 0.0`. So the concern was not theoretical. The instrument is not merely
  wide either: across 72 trials at six row counts a model with no real edge cleared its
  band **0 times**.
  Stays `[~]` for one reason and it is not a technical one. "Require the gain to clear
  it" is a new promotion rule, and writing one means editing `promotionGate` in the
  shipped manifest — hard guardrail 8, the owner's call. The published rule is still
  `gain > 0.0` and this cycle did not touch it; what changed is that a gain inside its
  own sampling error no longer reads as a win with nothing said. A fixed positive
  constant would be the wrong shape anyway, since the band depends on the split's size.
  Measurements, the fetch sha256s and the ten source-line breaks: `docs/qwk-noise-band.md`.
- [AI] **`shareUrl` is a dead parameter, so no shared card carries a way back to ARU.**
  Found 2026-09-21 (cycle 25) while fixing the share path above it, and deliberately not
  folded into that fix. `shareCardImage` (`app/components/share-card.tsx`) accepts
  `opts.shareUrl` and adds `text` + `url` to the `navigator.share` payload only when it is
  set — under a comment that says "Include the deep link so the shared post carries a way
  back to aru (viral loop)". The single call site, `app/studio/page.tsx`, does not pass it,
  and no other code, test or doc mentions it. `lib/share-link.ts:moodShareUrl` exists for
  exactly this and is used only by `/scan`'s clipboard path. So even now that the studio
  share works, it sends a bare PNG with no return path, and `share_landed` /
  `viralActivation` can never be driven from that surface. This is revenue-upstream item 3
  and it is one argument away from being a one-line change — but `moodShareUrl` needs the
  mood levels, `/studio` holds edited copy rather than reads, and deciding what a studio
  card should link to is a product call rather than a plumbing one. Not guessed.
  **2026-09-21, cycle 26: the decision is written up and still nobody's but the owner's.**
  `docs/share-return-path-decision.md` states the five options with what each costs, and
  rejects one of them on evidence: the values are free-text inputs and the two shipped presets
  already contain strings with no mood axis in `MOOD_LABELS`, so reverse-mapping the edited
  card yields nothing the moment anyone types. The recommendation is option E (mood link while
  the card still says what the scan said, bare origin once it does not) with option B as the
  fallback, and what would change it is a measurement of how many `/studio` sessions are
  preset-only — which needs the funnel flush and is therefore behind the PIPA blocker. No code
  was changed on this item, deliberately.
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
- [AI] **At what fraction of unusable rows should the readiness report stop reporting an
  accuracy at all?** Cycle 30 stopped `run_pipeline.heuristic_baseline` grading a
  non-finite feature as level 2 and made the residue a reported `unusable` count with a
  per-axis warning (`docs/non-finite-feature-policy.md`). What it deliberately did not
  invent is a threshold: at some fraction the accuracy over the rows that remain stops
  meaning anything, and a warning should become a blocker. No number for that was chosen,
  because picking one needs a real export and none exists — the golden-set blocker. Also
  unknown, and not to be written down as if it were: whether any real export has EVER
  carried a non-finite feature. This is a hole closed before it was observed. Noted
  2026-09-23.
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
- [AI] **Four device stores still read `JSON.parse(localStorage…)` and hand the result
  back unchecked**, after cycle 29 guarded `lib/funnel.ts` and cycle 30 guarded
  `lib/scan-history.ts`, `lib/crops.ts` and `lib/labels.ts`. They are `lib/consent.ts`,
  `lib/store.ts`, `lib/pilot.ts` and `lib/funnel-flush.ts`, and they are NOT claimed to be
  safe — nobody has measured what a wrong shape does to each. `lib/store.ts` is the closest
  to biting and is a different failure from the two already fixed: its `lsPush` calls
  `all.push(value)` OUTSIDE the try, so a wrong shape rejects into `recordCareIntent`'s
  caller on `/care` as an unhandled rejection rather than as a render throw, and the
  commerce click still opens while nothing is recorded. **`lib/consent.ts` must not be
  given this guard casually**: "read as empty" there means "no consent event in the audit
  trail", which is guardrail 4 and a decision rather than a line. Mechanism and both
  grades of evidence: `docs/funnel-store-shape.md`. Noted 2026-09-23.
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
- [~] [AI] `toneSpread` is background-coupled at about 2% through the same frame-mean gains
  the tone path just stopped using — 0.052372 behind a blue wall, 0.053504 behind warm
  wood, on a face held byte-for-byte identical. It is a ratio, so this is second-order
  rather than the sign flip ITA suffered, and `tests/skin-index-contract.test.ts`'s
  `toBeCloseTo(…, 2)` hides it — but it is compared against cut points drawn *across*
  frames, so "within one frame" understates it. Pre-existing, same class one level down.
  Noted 2026-09-16.
  **2026-09-22, cycle 29: measured, pinned, and the fix is a schema decision rather than a
  line of code.** The note reproduces: across five walls on the `faceOnWall` fixture,
  warm wood reads **0.05350370949189595** and cool blue **0.0523705964019627**, a widest
  ratio of **2.1636%**. (The note's 0.053504 is that warm-wood value rounded; its 0.052372
  is 1e-6 off the 0.0523706 measured here, and the measured values are the ones pinned.)
  Two things it did not establish, now asserted rather than spot-checked: it is **exactly
  one field** — `roughnessRatio`, `blemishCount`, `blemishDensity`, `shine`, `relRedness`,
  `cov`, `toneIta`, `toneLstar`, `tzoneL` and `cheekL` are bit-identical across all five
  walls — and `blemishCount` is **0** on that fixture, so nothing here speaks to
  `detectBlemishes`'s own use of the same gains. The guard is a new
  `describe("toneSpread under a changing background")` in `tests/tone-ita-contract.test.ts`,
  which is where the fixture lives; the alternative was a second copy of `faceOnWall` that
  could drift from the tone half.
  Stays `[~]` for a reason the item did not know. Taking the gains out of the region L\*
  computation drives the coupling to **exactly zero** — measured, as the second of the two
  source-line breaks — so the fix is one expression. What stops it is that `toneSpread` is
  in `NEW_FEATURE_KEYS` and exported into every ML sample, so moving it moves a published
  column for every future capture while `VISIBLE_MODEL_CONTRACT.inputSchemaVersion` has
  never moved under three "Bumped" comments, and already-collected samples could not be
  told apart from new ones. That is the schema-version item four entries down, not a line
  to slip in here. Measurements and both breaks: `docs/tone-ita-verification.md` §4.
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

- 2026-09-23 (cycle 30) — Branch `autopilot/2026-09-23-0039`. **One theme, four tracks: a
  value that is not what its type says, and what each layer does about it. The ML pipeline
  was grading an unmeasurable feature as the MOST SEVERE level and counting it in the
  accuracy an operator reads. A malformed value in one device store replaced the whole
  `/report` page — product cards and both `/api/out` links included — with the error
  boundary, permanently. And `/unsubscribe` told three different failures, one of them
  ARU's own misconfiguration, that the reader's link had expired.**

  **Baselines, measured here on a clean tree at `af00c7c` before any edit; they match the
  supervisor's.** `node_modules` was absent, so `npm ci` first (exit 0). `npm run smoke`
  green with the chromium override at `/opt/pw-browsers/chromium-1194`
  (`Smoke test passed.`), vitest **635 passed in 94 files**, its Playwright leg
  **70 passed (4.6m)**, `python3 ml/selftest.py` **Ran 137 tests in 2.221s ... OK**,
  `npm run lint` **0 errors, 2 warnings** (the same `_reads` / `_result` at
  `lib/care.ts:70`), `npx tsc --noEmit | grep -c "error TS"` **13**.

  **Research (자료조사): what a mature pipeline does with a feature that is not a finite
  number — it refuses, and it never substitutes.** The ML track needed this before
  deciding between refuse, drop and grade. Read from scikit-learn's own source rather
  than documentation or recall: `sklearn/utils/validation.py` @ **1.5.2** from
  `raw.githubusercontent.com` (`http=200 bytes=92307`, sha256
  `a6beb3a2…3b8249dc`). `check_array`'s `force_all_finite` defaults to **True**, and its
  three options are raise, accept, and accept-NaN-only — **none of them is "substitute a
  value"**. `_assert_all_finite` raises `ValueError("Input contains NaN")`, and the
  estimator-facing message names the two remedies in as many words: "using an imputer
  transformer in a pipeline or drop samples with missing values". Two limits stated
  rather than glossed: it governs an estimator's input matrix, not a report's accuracy
  figure, and ARU cannot raise the way an estimator can — one unmeasurable row must not
  end a run over 300 good ones. So the answer it gives ARU is the second half, drop, with
  the count reported, which is the shape cycle 28 took from scipy's `find_peaks`.
  `docs/non-finite-feature-policy.md`.

  **ML: three code paths met one situation and disagreed, and the one that fed the report
  was the wrong one.** Measured on `af00c7c` before any change:
  `run_pipeline.feature_summary` **drops** a non-finite value (`math.isfinite`);
  `ml/heuristic_baseline._as_float` — the screen the promotion gate's baseline uses —
  **refuses** it; and `run_pipeline.heuristic_baseline` **graded** it. `nan < lo` and
  `nan < hi` are both False, so `bucket` returned **2**, the most severe of three levels,
  and the row counted in `n` and entered the confusion matrix as a prediction.
  `bucket(inf) = 2`, `bucket(-inf) = 0`. A `None` value was worse: `float(None)` raises,
  and that call runs once per report, so one such row ended the whole run.

  The cell it lands in is the worst one there is — always predicted 2, so on a row
  labelled 0 it is a two-level miss, which quadratic weighting punishes four times as
  hard as a one-level miss. On 16 rows whose 12 measurable ones the shipped cuts grade
  perfectly, against the pre-change function copied verbatim from
  `git show HEAD:ml/run_pipeline.py`:

  ```
  BEFORE  n=16 accuracy=0.75 unusable=n/a   confusion actual=0 -> {'0': 4, '1': 0, '2': 4}
  AFTER   n=12 accuracy=1.0  unusable=4     confusion actual=0 -> {'0': 4, '1': 0, '2': 0}
  ```

  `_as_float` is now public `as_feature_float` and `run_pipeline` imports it, so there is
  one screen instead of two; the residue is REPORTED as `unusable` rather than skipped in
  silence, on the report line and as a per-axis warning. `bucket` was deliberately NOT
  changed — strictly-less-than against each cut in order is the shipped rule, identical to
  `bucket()` in `lib/skin.ts` and `predict_level` in `ml/heuristic_baseline.py`, and
  moving it would manufacture a fake accuracy gap between the heuristic and the app; its
  docstring now says what it requires of its caller. A **fourth** disagreement was found
  by the test rather than by reading: `isinstance(True, int)` is True in Python, so
  `feature_summary` summarised a JSON `true` as the number **1.0** while
  `as_feature_float` rejected it — that case failed the first time it ran and
  `feature_summary` now excludes `bool`. Two source-line breaks, both run and reverted:
  the screen back to `float(features[feat])` gives
  `TypeError: float() argument must be a string or a real number, not 'NoneType'` plus
  `AssertionError: 16 != 12 : NaN rows were graded` (2 failures, 1 error); dropping the
  `bool` exclusion gives `AssertionError: {'shine': {'count': 1, ...}} != {}`
  (1 failure). `test_a_clean_run_reports_nothing_dropped` stays green under both.
  **Nothing in `public/models/visible-attributes/manifest.json` was touched** — not
  `status`, not `promotionGate`, not `minQwkGainOverHeuristic`. This changes what the
  readiness report *says*, not what the gate *requires*.

  **Bug fix: a malformed device store took the whole `/report` page, permanently.**
  `ScanHistoryStrip` renders on `/report`'s first step. `getScanHistory()` was
  `JSON.parse(localStorage.getItem(KEY) || "[]")` handed straight back, so a TRUNCATED
  value self-healed through the catch while a value that PARSES to the wrong shape reached
  the component: `history.length < 2` is `undefined < 2` on an object (**false**, so the
  early return does not fire) and `history.slice(-6)` then throws INSIDE RENDER. React
  unmounts the segment and `app/error.tsx` replaces the entire report — the analysis, the
  product cards and both `/api/out` links with them — and because the crash is
  deterministic in the stored value, the boundary's own "다시 시도" throws again. Proved in
  Chromium first: `tests/e2e/report-device-store-shape.regression-13.spec.ts` failed **5 of
  5** against the unfixed source, the console naming both throw sites
  (`TypeError: history.slice is not a function` at `scan-history-strip.tsx:21`, and
  `recent.map is not a function` at `:41` — which is why `"abcdef"` is in the shape list: a
  string survives BOTH guards and dies one call later). `Array.isArray` at the read fixes
  it and is also what makes the next write repair the key.
  `tests/device-store-shape.test.ts` breaks at the source line: **10 failed | 2 passed**,
  with the two controls (an unparseable value, which already self-healed, and a real array,
  which was never affected) green — which is what makes this an inconsistency rather than a
  preference. This is the same class as cycle 29's funnel fix one level up, and
  `docs/funnel-store-shape.md` now carries both halves.

  *Two more reads guarded on a weaker grade of evidence, said plainly.* `lib/crops.ts` and
  `lib/labels.ts` feed `app/scan/feedback.tsx`'s LAZY `useState` initialisers
  (`useState(() => cropSampleCount())`), which run during render with no try/catch of their
  own. The throw is measured (5 of 18 cases fail with the guards dropped); the page-level
  consequence is **not**. A browser spec written to reproduce it the way `/report` was
  reproduced passed on all five shapes, because the `Feedback` panel mounts only after a
  capture and this container has no camera — that spec was DELETED rather than kept, since
  a test passing for the wrong reason tells the next cycle a path is covered. The four
  remaining stores on the same idiom (`lib/consent.ts`, `lib/store.ts`, `lib/pilot.ts`,
  `lib/funnel-flush.ts`) were left, with reasons, in the backlog item below.

  **UI/UX: `/unsubscribe` told three different failures that the reader's link had
  expired.** `POST /api/reengage/unsubscribe` has four outcomes and only ONE means the link
  is finished: **400** (token does not verify), **503** (`UNSUBSCRIBE_SECRET` or the
  Supabase admin client not configured), **500** (the consent write failed), and a request
  that never arrives, which the page's `.catch(() => null)` collapses into the same `null`.
  All four rendered "이 링크는 사용할 수 없거나 유효 기간이 지났어요." Revoking consent is
  the one action in the product that must not fail quietly: a person told their unsubscribe
  link has expired stops trying, and then keeps receiving the mail they asked to stop,
  because what actually happened was ARU's own misconfiguration. Now 400 alone says the
  link is finished, and 500/503/no-response get a retryable sentence that also names the
  fallback route — replying to the mail itself — added to `en`, `ja`, `zh` and `ar`. The
  missing-token case is no longer `role="alert"` either: a live region whose content is
  present on the FIRST render announces nothing, so the one sentence explaining why the
  only control on the page is disabled is now plain text tied to the button with
  `aria-describedby`, and the alert is kept for what genuinely arrives later.
  `tests/e2e/unsubscribe-outcome.regression-14.spec.ts` fails **4 of 6** against the
  pre-fix page while the two controls (400 → expired, 200 → confirmed) stay green.

  **Verification.** `npm run smoke` green (`Smoke test passed.`) with the chromium
  override; vitest **653 passed in 95 files** (from 635/94 — one new unit file plus the two
  new specs' cases), `python3 ml/selftest.py` **Ran 142 tests ... OK** (from 137),
  `npx tsc --noEmit | grep -c "error TS"` **13** (unchanged), `npm run lint` **0 errors, 2
  warnings** (the same two). Full output in the session report.

  *Rotation.* 1325 → 1340 and 6176 → 6312; `comm -23` over the two files concatenated
  and sorted finds **1 line missing**, and it is `Last updated: 2026-09-22`, changed to
  2026-09-23 by this entry. Cycle 27's 135 lines are byte-identical in the changelog
  (sha256 `cebd1ecf…3d36cece` on both sides of the move). No backlog item was ticked
  `[x]` this cycle — none of the four tracks closed a listed item — so nothing moved to
  "Closed backlog items"; two new items were opened instead. "Recent cycles" holds
  30/29/28.

- 2026-09-22 (cycle 29) — Branch `autopilot/2026-09-22-1839`. **`toneSpread` is the one
  published ML column that still reads the room it was captured in, and the size of that
  is now a pinned 2.1636% instead of a note. One malformed value in `localStorage` could
  switch a device's funnel off permanently and silently, because the two corruption modes
  were handled differently for no reason. And the dead `noteEn` field is gone, with the
  audit that could never have seen it built first.**

  **Baselines, measured here on a clean tree at `bedb80a` before any edit; they match the
  supervisor's.** `node_modules` was absent, so `npm ci` first (exit 0). `npm run smoke`
  green with the chromium override at `/opt/pw-browsers/chromium-1194`
  (`Smoke test passed.`), vitest **618 passed in 92 files**, its Playwright leg
  **70 passed (3.4m)**, `python3 ml/selftest.py` **Ran 137 tests in 1.713s ... OK**,
  `npm run lint` **0 errors, 2 warnings** (the same `_reads` / `_result` at
  `lib/care.ts:70`), `npx tsc --noEmit | grep -c "error TS"` **13**.

  **Research (자료조사): does a shipped browser analytics SDK check the shape of its own
  persisted event queue?** The bug-fix track needed to know whether `Array.isArray` at the
  read was the normal guard or an over-reaction, and the answer decided where the guard
  sits. Read from the libraries' own source, pinned by digest —
  `@amplitude/analytics-core` **2.57.0** from `registry.npmjs.org`
  (sha256 `1cb97d68…1cab28e`) and `posthog-js@main`
  `packages/browser/src/storage.ts` (sha256 `d2406cda…61f546`). Neither validates the
  shape at the read. Amplitude's `BrowserStorage.get()` is a try/catch around
  `JSON.parse` returning whatever came out — byte-for-byte the shape ARU had — and the
  guard lives at the consumer, as `unsent && unsent.length > 0` before `.map`. That is a
  duck-type check, and it is four-fifths of one: verified in node against the five values
  that parse, it skips `null`, `5` and `{}`, and lets `"abc"` through to
  `TypeError: v.map is not a function`. PostHog is `JSON.parse(...) || {}` at every read,
  same class. So ARU was strictly weaker than both references (it had neither guard), and
  the finding that actually changed the fix is the third one: **where** the guard sits
  decides whether the store repairs itself. Guard at the consumer and the bad value stays
  in the key forever; guard at the read and return `[]`, and the next write overwrites it.
  Neither reference does that. `docs/funnel-store-shape.md`, which also states plainly
  that no occurrence has been observed in the wild and must not be cited as if one had.

  **ML: `toneSpread` is background-coupled, and it is the only published field that is.**
  §2 of `docs/tone-ita-verification.md` took the frame-mean gray-world gains off `toneIta`
  and `toneLstar`; it never took them off `toneSpread`, which builds its region L\* values
  through them. The claim on record was a 2026-09-16 note with two numbers and no test.
  Re-measured through `analyzeSkin` on the `faceOnWall` fixture — one face held
  byte-for-byte identical, only the wall changing — every published field of
  `SkinReads.raw`:

  ```
  wall         gains (r, g, b)                    toneSpread             vs grey
  grey         0.93626, 1.01253, 1.05898          0.052903635205415585   —
  warm wood    0.82791, 1.01832, 1.23438          0.05350370949189595    +1.134%
  cool blue    1.03366, 1.03720, 0.93595          0.0523705964019627     −1.008%
  white        0.94373, 1.01096, 1.05128          0.05286602230161696    −0.071%
  dark         0.91027, 1.01825, 1.08772          0.05303399943360612    +0.246%
  ```

  Widest ratio **2.1636%** (`max/min - 1 = 0.021636436622493482`), which is the "about 2%"
  the note claimed. Two things the note did not establish. It is **exactly one field**:
  `roughnessRatio`, `blemishCount`, `blemishDensity`, `shine`, `relRedness`, `cov`,
  `toneIta`, `toneLstar`, `tzoneL` and `cheekL` are **bit-identical** across all five
  walls, asserted rather than spot-checked, so a change that starts moving one of them is
  a new coupling rather than a wider version of this one. And `blemishCount` is **0** on
  this fixture, which carries no discs — said out loud because it means these rows say
  nothing about `detectBlemishes`'s own use of the same gains. The note's 0.053504 is the
  warm-wood value rounded; its 0.052372 is 1e-6 off the 0.0523706 measured here.

  The case lives in `tests/tone-ita-contract.test.ts` because the fixture does — a second
  copy of `faceOnWall` would give the two halves of one measurement two fixtures that
  could drift — and the walls are now one shared `WALLS` const so the tone half and the
  spread half can never be measured over different ones. Two source-line breaks, both run
  and both reverted: `frameChannelGains`'s sub-sampling divisor 60 → 30 gives
  `AssertionError: toneSpread behind a grey wall — a published ML column moving with the
  room: expected 0.05291142788884354 to be 0.052903635205415585` (1 failed | 6 passed);
  dropping the gains from the region L\* helper gives the same assertion at
  `expected 0.0525811307190166` **plus** `expected 0 to be greater than 0.02`
  (2 failed | 5 passed). That second break is the finding: **the fix is one expression and
  it drives the coupling to exactly zero.** What stops it is that `toneSpread` is in
  `NEW_FEATURE_KEYS` and exported into every ML sample, so moving it moves a published
  column for every future capture while `inputSchemaVersion` has never moved under three
  "Bumped" comments — the schema-version backlog item, not a line to slip in here.
  `docs/tone-ita-verification.md` §4.

  **Bug fix: one bad value in `localStorage` switched a device's funnel off for good.**
  `getFunnelEvents` wrapped `JSON.parse` in a try/catch, so a TRUNCATED value returned
  `[]` and the next `recordFunnelEvent` overwrote the key — the store repaired itself. A
  value that PARSES to the wrong shape took no such path: it was returned as-is,
  `recordFunnelEvent` called `.push` on it, and the throw landed in the outer catch that
  exists so analytics can never break the user flow. Nothing rewrote the key, so every
  later event hit the same throw. `tests/funnel-store-shape.test.ts` fails against the
  unfixed source on all five shapes that parse —
  `AssertionError: recordFunnelEvent() returned null on an object — the funnel is off:
  expected null not to be null`, **10 failed | 2 passed** — while the two control cases
  pass, which is what makes this an inconsistency rather than a preference: unparseable
  JSON already self-healed, and a real array was never affected. The fix is
  `Array.isArray` at the read, which is also what makes the repair happen. This is the
  device-side half of a hole `/api/sync` already closed on the server
  (`tests/api-json-boundaries.test.ts`), and the funnel is the only measurement the
  product has of where users leave — revenue-upstream item 2.

  **UI/UX: the dead `noteEn` field, deleted, with the audit built first.** Cycle 28 filed
  it and said "delete it or render it". Rendering it would duplicate what `t(link.note)`
  already produces in English, so it went — from `lib/commerce.ts` and `lib/care.ts`,
  the only two files that mentioned it. What made that a deletion rather than a guess is
  `tests/care-link-copy-coverage.test.ts`, which closes the blind spot the item named:
  cycle 27's sweep read the Korean literal at each `t("…")` CALL SITE, and these literals
  are DATA passed through `t(link.note)`, so a call-site sweep could not see them. The new
  file collects them from the data instead — `buildCommerceLinks`, `productSearchLinks`
  over all 23 catalogue skus, `clinicLinks` in both branches — and asserts each resolves
  in `en`, `ja`, `zh` and `ar`. The rule is Hangul-bearing rather than an exception list,
  and a second case pins `"Global search"` as the only language-neutral string so "no
  Hangul" cannot grow into "untranslated". Broken at source by deleting the 올리브영 note
  from `lib/i18n/en.ts:855`: `care copy that would render as Korean: en:
  buildCommerceLinks[oliveyoung].note = "오늘 매장이나 온라인 재고를 바로 볼 수 있어요"`,
  2 of 3 failing. The item's `careSummary` half was looked at and deliberately left:
  `tests/product-trust.test.ts:63` passes a visible-redness reading in precisely to assert
  it does NOT raise `clinicPriority`, so `_reads` is what that test's intent is written
  in. The two lint warnings stay, now as a recorded decision.

  **Verification.** `npm run smoke` green (`Smoke test passed.`) with the chromium
  override; vitest **635 passed in 94 files** (from 618/92 — the two new files plus the
  toneSpread cases); `npx tsc --noEmit | grep -c "error TS"` **13**, unchanged;
  `python3 ml/selftest.py` **Ran 137 tests in 1.713s ... OK**; `npm run lint` **0 errors,
  2 warnings**, the same two. Nothing in `public/models/visible-attributes/manifest.json`,
  `NEXT_PUBLIC_FUNNEL_FLUSH`, `shareUrl` or what `blemishCount` reports was touched.

  *Rotation, against a pre-review snapshot of main.* `wc -l` 1420 → 1290 and 5886 → 6176.
  `comm -23` over the two files concatenated and sorted finds **2 lines missing**, and both
  are backlog-item headers this cycle EDITED rather than moved — the `noteEn` header, now
  carrying `[x]`, and the `toneSpread` header, now carrying `[~]`. Nothing was lost in
  either move: `diff` says the cycle 26 entry (256 lines) and the closed `noteEn` item
  (33 lines) are **byte-identical** in their new homes. "Recent cycles" holds 29/28/27.

  **Supervisor review.** One note on the run itself first: the scheduled 12:39 cycle did
  NOT run — the supervising session had no tool access at that time and the trigger only
  queued. This cycle is the 18:39 firing, spawned at 20:49 UTC; the two queued firings were
  not run back to back.

  *The funnel defect is real and its guard bites.* Restoring the unchecked
  `return JSON.parse(localStorage.getItem(KEY) || "[]")` fails 10 cases, the first two
  naming the mechanism: `getFunnelEvents() on null: expected null to deeply equal []` and
  `recordFunnelEvent() returned null on null — the funnel is off`. The asymmetry the
  comment describes is the whole defect: a truncated value throws in `JSON.parse` and the
  store repairs itself on the next write, while a value that PARSES to the wrong shape
  was returned as-is, threw on `.push` inside the catch that exists so analytics cannot
  break the flow, and nothing ever rewrote the key.

  *`noteEn` went the safe direction.* This review had flagged before the branch arrived
  that resolving the item by RENDERING the field would put four merchant claims in front
  of users, one of them an unsourced comparative (`"Fastest delivery option in Korea."`,
  `lib/commerce.ts:78`). The branch deleted it — 5 lines from `lib/commerce.ts`, 2 from
  `lib/care.ts`, nothing rendered.

  *`toneSpread` was measured and not changed.* It is a published, exported column, and
  `git diff` on `lib/skin.ts` is empty; the item went `[AI]` → `[~]` rather than closing.

  *Rotation.* 1420 → 1297 and 5886 → 6176; `comm -23` finds **2 lines missing** — the
  first line of the `noteEn` item (closed, 3 mentions now in the changelog) and the first
  line of the `toneSpread` item (the `[~]` marker). `shareUrl` is still open, a fifth
  cycle running. `lib/skin.ts` and the manifest are untouched.

- 2026-09-22 (cycle 28) — Branch `autopilot/2026-09-22-0639`. **`detectBlemishes` now says
  whether the frame it just counted was decided by the image or by scan order, and the
  census is inside the detector because that is the only place it can see what cycle 23's
  replica could not. `/care` — the second commerce surface, reachable from the nav on every
  page — had a disclosure whose `aria-controls` named a panel containing the disclosure
  itself, and no browser-level coverage of any kind. And `/ops` was telling the operator
  that zero more crops were needed for a band that crops cannot unlock.**

  **Baselines, measured here on a clean tree at `87a9834` before any edit; they match the
  supervisor's.** `node_modules` was absent, so `npm ci` first. `npm run smoke` green with
  the chromium override at `/opt/pw-browsers/chromium-1194` (`Smoke test passed.`), vitest
  **615 passed in 91 files**, its Playwright leg **67 passed (3.9m)**, `python3
  ml/selftest.py` **Ran 137 tests ... OK**, `npm run lint` **0 errors, 2 warnings** (the
  same `_reads` / `_result` at `lib/care.ts:72`), `npx tsc --noEmit | grep -c "error TS"`
  **13**.

  **Research (자료조사): what a mature peak detector does with a plateau — report it.** The
  ML item below had to choose between report, refuse and carry-a-confidence, and cycle 23
  had only half an answer: `scikit-image`'s `peak_local_max` has a degenerate-input branch
  that fires on an entirely flat field, which ARU's plateau-dominated fixture is not.
  `scipy.signal.find_peaks` answers the other half, read from scipy's own source on
  `raw.githubusercontent.com` (`_peak_finding_utils.pyx` and `_peak_finding.py` @ v1.14.1,
  sha256s in the doc). `_local_maxima_1d` defines a maximum as "one or more samples of equal
  value that are surrounded on both sides by at least one smaller sample" and returns
  `midpoints`, `left_edges` and `right_edges` — a plateau is ONE maximum whose extent is an
  output, and index order picks the representative of a maximum already established, never
  whether there is one. `find_peaks` then exposes `plateau_size` as the first condition
  evaluated and documents the report-without-filter case in as many words: "To calculate and
  return properties without excluding peaks, provide the open interval ``(None, None)``".
  So the reference's answer is **report, on the same return value as the count, and leave
  the filter to the caller**. Two limits stated rather than glossed: it is 1-D, so
  "surrounded on both sides" has no direct analogue in a 5x5 suppression window, and its
  plateau is a run of exactly equal samples while ARU's degenerate frame is
  plateau-dominated rather than flat. `docs/blemish-perturbation-tolerance.md` §7.6.

  **ML: the plateau census moved inside `detectBlemishes`, which is what makes it bite.**
  `detectBlemishes` returns `tiedPeaks` next to `count` and `areaFace`: counted cells
  carrying a neighbour with the bit-identical residual somewhere in their suppression
  window, so `j < i` and not the image chose the survivor. One float comparison per
  neighbour the loop already visits; `count` byte-identical; nothing reads the field yet,
  deliberately. The argument for inside is §7.4's sixth break, which that section recorded
  as "did not bite": quantising `residual[i]` to three decimals manufactures plateaus, and
  the replica rebuilds the residual from the captured a\* grid so it cannot see anything
  downstream of a\*. Applied to `lib/skin.ts` and run: `Tests 7 failed | 610 passed (617)`,
  the new case failing first with `noise 4 600x720: 2 of 5 counted cells are settled by scan
  order, not by the image: expected 2 to be +0`, and the two margin cases §7.4 names — "measures
  a real margin on every realistic frame, and says how real" and "fails the same predicate on
  the noiseless fixture" — **not** in the failure list, which reproduces §7.4's finding. The
  other six report a moved number on the noiseless fixture or a moved pin; none of them says
  what went wrong. `lib/skin.ts` restored byte-identical afterwards. Fifteen realistic frames
  (three noise levels × five sizes) carry zero ties. The noiseless fixture reads
  `3/2 3/1 3/2 3/0 3/1` — the `3, 3, 3, 3, 3` `tests/blemish-density-scale.test.ts` asserts
  must agree, four of five carrying a tie and `1080x1296` carrying none, which is why the case
  pins the vector instead of asserting `> 0`. `tests/blemish-plateau-census.test.ts`,
  `docs/blemish-perturbation-tolerance.md` §7.7. The backlog item stays `[~]`: what
  `blemishCount` should DO about a plateau-dominated frame is a product call on a published
  index, and §7.6 only says to report before deciding the filter.

  **UI/UX: `/care`'s merchant disclosure named a panel that contained it, and `/care` had no
  browser coverage at all.** `aria-controls={merchantPanelId}` pointed at the grid the toggle
  was itself a child of, so a screen-reader user following the relationship from "다른 판매처
  보기" landed on a region whose contents included the button they had just left, and the
  always-rendered region was announced as collapsed. Confirmed in Chromium at 360px in all
  five locales before the fix (`containsToggle=true`, five of five). The fix makes the toggle
  the panel's SIBLING — two nested grids at the same 7px gap — and the rendered geometry is
  unchanged: every button's x, y, width and height identical collapsed and expanded, diffed
  before against after. Breaking it at its source line (the `id` back on the outer grid)
  fails 2 of the 3 new cases with `aria-controls="care-merchants-tn2" names a panel that
  contains its own toggle: a disclosure cannot control a region it is inside` and `the
  expanded panel swallowed its own toggle`, while the layout case stays green.
  `tests/e2e/care-merchant-disclosure.regression-12.spec.ts` also gives `/care` its first
  360px × five-locale guard on document overflow and the 44px tap contract.

  **The layout sweep that found nothing, recorded so the next cycle does not redo it.**
  `/care`, `/survey`, `/privacy` and `/checkin` measured in Chromium at 320px and 360px in
  ko/en/ja/zh/ar — twenty-four page loads per route pair — looking for document overflow and
  for any `button`, `a`, `input`, `select` or `textarea` under 44px or clipped outside the
  viewport. **Nothing found.** That is a measurement and not an improvement, and it is the
  reason this cycle's UI work is the disclosure rather than a clipping fix.

  **Bug fix: `/ops` reported "Crops needed for next band: 0" for a band crops cannot
  unlock.** `getMlReadiness`'s participant gate (`lib/ml-readiness.ts`) returns
  `band: "calibrate"` whenever fewer than five pilot participants are linked, whatever the
  crop count — and it returned `minCropsForNextBand: 30` with it. `app/ops/page.tsx:233`
  renders that as `Crops needed for next band: {Math.max(0, minCropsForNextBand - crops)}`,
  so at any crop count of 30 or more with four participants the panel printed **0**, telling
  the operator they had finished collecting while the band was pinned on something else
  entirely. `tests/ml-readiness.test.ts` already pinned exactly that state (300 crops, 4
  participants, band `calibrate`) without ever looking at the number beside it. Fixed to
  `null`, which `/ops` already handles by not rendering the line — the branch's `nextAction`
  ("Use /pilot to link P001-P030 sessions") is what actually applies. Reverting the one line
  fails the new case with `at 30 crops and 4 participants /ops offers a crop target the band
  does not depend on…: expected +0 to be null`, 1 of 3 in the file. The crop-count bands are
  untouched and the case asserts one of them still reports a real target (12 crops → 18).

  **Verification, pasted from the runs that produced it.** `npm run smoke` with the chromium
  override → `Test Files 92 passed (92)`, `Tests 618 passed (618)`, Playwright `70 passed
  (3.7m)`, `Smoke test passed.` `npx tsc --noEmit | grep -c "error TS"` → `13`. `npm run
  lint` → `0 errors, 2 warnings` (`lib/care.ts`). `python3 ml/selftest.py` → `Ran 137 tests
  ... OK` — unchanged, this cycle's ML work is in TypeScript.

  **Rotation.** `docs/AUTOPILOT.md` 1533 → 1378; `docs/autopilot-changelog.md` 5588 →
  5886. Cycle 25's 297-line entry moved verbatim to the changelog bottom. **No backlog item
  was ticked `[x]` this cycle**, so nothing moved to "Closed backlog items": the plateau item
  went `[AI]` → `[~]` because the decision it names is still open, and one new item was filed
  under "### Next" for the dead `noteEn` field. `wc -l` before/after and the `comm -23`
  preservation check are in the PR body.

  **Supervisor review.** Kept cheap — the account is at `seven_day / allowed_warning`
  (resets 2026-09-22 20:00 UTC) and the worker was told to be economical, so this was too:
  two reads before the branch, two breaks after.

  *The fork this cycle had to get right, and did.* The item names three outcomes — report
  it, refuse it, or carry a confidence — and they are not equally available to a cycle.
  `blemishCount` is in `ml/skin_indices.py:141` `NEW_FEATURE_KEYS`, so it is an export
  column every ML sample carries, and it is pinned per frame size at
  `tests/scan-cost-benchmark.test.ts:347`. **Refusing or altering the count would move an
  exported column and retroactively change what every already-collected sample means** —
  the `fallbackVersion` class of change, needing the version treatment or an owner call.
  Reporting alongside is additive and ordinary cycle work. This cycle took the additive
  branch, left `count` untouched (`git diff` on
  `tests/scan-cost-benchmark.test.ts` is **0 lines**), and says in the function's own
  comment that what to do about a plateau-dominated frame "is an open decision, not this
  function's to make". The item went `[AI]` → `[~]` rather than closing, which is the
  honest marker: "notice" is answered, "what to do" is not.

  *Both breaks bite, and the second is the one that matters.* Removing the census line
  fails 1 of 2 with the pinned string named. Quantising `residual[i]` to three decimals —
  the sixth break in §7.4, the one that did NOT bite when the census was computed from an
  outside replica — now fails 2 of 2, and fires on the NOISY fixture as well:
  `noise 4 600x720: 2 of 5 counted cells are settled by scan order, not by the image. On a
  frame with real pixel noise the suppression margins are 1e6x the detector's own rounding
  error, so an exact tie means something upstream collapsed distinct residuals.` That is
  the proof the census is computed inside the detector rather than from a replica, which
  is exactly what the "decision-margin guard is blind to the residual arithmetic" item
  asked for.

  *Read of the tie logic, since a census that miscounts is worse than none.* The
  suppression loop breaks out on `residual[j] > residual[i] || (residual[j] === residual[i]
  && j < i)`, so a cell that survives as a peak has run the full neighbour loop and
  `onPlateau` is fully determined for it; and a surviving cell's ties can only be with
  later-indexed neighbours, which is precisely "won on `j < i`" as the comment claims.

  *Scope held for a fourth cycle.* `shareUrl` is still open in this file and absent from
  the changelog.

  *Rotation.* 1533 → 1378 and 5588 → 5886; `comm -23` finds **1 line missing**, and it is
  the plateau item's own first line, changed by the `[AI]` → `[~] [AI]` marker. "Recent
  cycles" holds 28/27/26.
