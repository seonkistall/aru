# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-21

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
- [AI] **Should `detectBlemishes` notice that a frame is plateau-dominated, instead of
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
- [AI] **The decision-margin guard is blind to the residual arithmetic, and the blind spot
  is measured.** Noted 2026-09-21 (cycle 23). `tests/blemish-perturbation-tolerance.test.ts`
  measures margins from a replica that recomputes the residual from the a\* grid it
  captured, so a change `lib/skin.ts` makes downstream of a\* is invisible to it: quantising
  `residual[i]` to 3 decimals at the source leaves both margin cases green. It is caught
  today by three assertions in two other files, which is why nothing was patched — but the
  guard's stated scope is the a\*-production path only, and a cycle that widens it should
  add a second hook rather than assume the margins cover the whole classifier.
  `docs/blemish-perturbation-tolerance.md` §7.4.
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
- [AI] **`recordCareIntent` throws away the same write signal `recordCheckin` just
  stopped throwing away.** `lib/store.ts:recordCareIntent` calls `lsPush` and discards
  its boolean, returning a fully-populated `CareIntent` whether or not localStorage
  accepted it — the defect fixed on the check-in path in cycle 24, one function below
  it. Left alone deliberately rather than swept up: its only caller is
  `app/care/page.tsx:78`, which does `void recordCareIntent({...})` and shows the user
  nothing, so unlike the check-in card it never tells anyone their data was saved. The
  consequence is a silently short care-intent log on a full or blocked store, which is
  a measurement problem and not a lie to a user. Fixing it is the same one line plus a
  decision about whether `/care` should surface anything. Noted 2026-09-21 (cycle 24).
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

- 2026-09-21 (cycle 24) — Branch `autopilot/2026-09-21-0639`. **The promotion gate's
  0.0 margin now has the number it was missing: at the gate's own `minTrainingCrops: 300`
  the 95% band on a qwk gain is about ±0.15, and two scorers identical in expectation
  produced raw gains up to +0.0869 — every one of which passes `gain > 0.0`. Also: the
  first test that ever reached `/scan`'s live camera screen found the privacy-sheet link
  at 290.0x26.8px, the re-engagement cron would have sent the 2주 and 4주 mails to the
  same person minutes apart on its first real run, and `/checkin` told users their
  feedback was saved when the write had been refused.**

  **Baselines on arrival, counted rather than recalled.** `npm ci` was run first because
  `node_modules` was absent, and it failed once on `ECONNRESET` mid-download
  (`npm error network aborted`) leaving a partial tree; the retry succeeded on its first
  attempt. All five then matched the brief: `npm run smoke` green with the chromium
  override at `/opt/pw-browsers/chromium-1194` (`Smoke test passed.`), vitest **595
  passed in 87 files**, `npx tsc --noEmit | grep -c "error TS"` **13**,
  `python3 ml/selftest.py` **Ran 103 tests ... OK**, `npm run lint` 0 errors / 2
  warnings in `lib/care.ts`.

  **Two stale doc items closed, one of which was not where the brief said it was.** The
  brief reported a stale PR #69 entry in BLOCKERS as well as the stale backlog item.
  There is no PR #69 entry in BLOCKERS on main — `grep -n "#69" docs/AUTOPILOT.md` finds
  three hits, two of them inside the backlog item itself and one in cycle 20's archived
  entry. The "waiting on an owner decision" sentence the brief meant is the backlog
  item's own last line, and it moved to the changelog with it. Said plainly rather than
  silently doing nothing about a listed instruction.

  **Research: ARU's bootstrap convention is scipy's, read from scipy and then checked
  against scipy.** A percentile bootstrap has one detail that is easy to get wrong in a
  way nothing looks wrong about — which quantiles the two bounds are — so it was not
  invented. `scipy/stats/_resampling.py` at **v1.14.1** (`http=200 bytes=98486`, sha256
  `cfa7d1e20adced3fe3b30f9cb29801487ce37fa603349ffa34b8fd582712123a`) and at **v1.17.1**
  (`http=200 bytes=106090`, sha256
  `4ef9a44edbaa2a51f83b55df26b58fe65f1936298a06559f91dd716104b2abf1`) both take
  `alpha = (1 - confidence_level)/2` and read the `alpha` and `1-alpha` quantiles under
  numpy's default `linear` method. Another project's source, not a paper and not a
  standard: `en.wikipedia.org` is still `http=000` from here and nothing is attributed
  to a textbook. `pypi.org` answered, so the convention was then verified numerically
  rather than only read — `worst |mine - np.percentile| = 5.551e-17` over 63 (n, q)
  pairs, and against `scipy.stats.bootstrap(method="percentile")` on 300 paired rows the
  bounds agree to **6.0e-4 and 2.7e-4**, which is the Monte-Carlo spread measured
  separately (sd 3.8e-3 at 2000 resamples) rather than a difference in what is computed.
  numpy and scipy were installed into the container for this and nothing in the
  repository depends on them; `ml/qwk_noise.py` is stdlib-only like the rest of `ml/`.

  **ML: the honest version of the 0.0 margin, and a measured claim that had to be
  withdrawn.** `ml/qwk_noise.py` bootstraps the qwk difference between the model and the
  shipped heuristic; `heuristic_baseline.score` now returns the confusion matrix it
  scored, so both sides come from the rows the comparison was actually made on; the band
  is computed on `promoted_val_confusion` and reported per axis as `gainNoiseBand` /
  `clearsNoiseBand`, with a new `warnings` list on `promotion_check` that is separate
  from `blockers`.

  ```
  rows  trials  median width  half-width  max |point|  clears 0.0
    60      12        0.6543      0.3272       0.2385       0/12
   150      12        0.4061      0.2030       0.1654       0/12
   300      12        0.3011      0.1506       0.0869       0/12
   600      12        0.2062      0.1031       0.0625       0/12
  1200      12        0.1442      0.0721       0.0520       0/12
  3000      12        0.0900      0.0450       0.0341       0/12
  ```

  Model and heuristic equally good by construction, so every `|point|` above is pure
  noise. At 300 rows it reaches **0.0869** and the published rule `gain > 0.0` passes all
  twelve. The instrument is not simply wide: across all 72 trials a model with no real
  edge cleared its band **0 times**, and a modest real edge at the same size clears it
  (`+0.1974`, band `[+0.0715, +0.3254]`).

  **It does not block, and that is guardrail 8 rather than caution.** "Require the gain
  to clear it" is a new promotion rule and writing one means editing `promotionGate` in
  the shipped manifest. `status`, `promotionGate` and `minQwkGainOverHeuristic: 0.0` are
  untouched. What changed is that a gain inside its own sampling error no longer reads as
  a win with nothing said.

  **The claim that had to be withdrawn.** `ml/qwk_noise.py`'s first draft said resampling
  the two confusion matrices separately is conservative, because the trainer keeps no
  per-row predictions and so cannot pair them. Measured over 36 trials it is only true in
  the regime that matters: with the two scorers failing on the same rows the unpaired band
  is **1.104-1.269x** the paired one (12 trials, mean 1.195), but with their errors
  conditionally independent given the truth it is **0.952-1.103x** — the same width inside
  Monte-Carlo spread, not conservative at all. The docstring now says that, and
  `gain_band_paired` ships ready for the day per-row predictions exist.

  **Ten source-line breaks, never of a test; nine bit, and the tenth is why there are
  121 tests and not 120.** Every file's sha256 was compared before and after and all five
  matched. Quantising nothing and asserting nothing would have been easy to miss:
  changing `alpha` from `(1-c)/2` to `(1-c)` — a one-sided interval sold as two-sided —
  left **all 120 tests green**, because every case read a 95% band where both conventions
  still produce a plausible interval. The case that separates them asks for a **50%**
  band, where the two-sided reading gives the 25th and 75th percentiles and the one-sided
  reading gives the median twice: `0.0 not greater than 0.0 : a 50% interval collapsed to
  a point: alpha is not being halved`. With it, that break fails 1 of 121. The other nine
  fail 1, 7, 3, 1, 1, 1, 1, 2 and 1 — narrow enough that the failure names what broke,
  except break 2 (making resampling a no-op), which collapses every band to a point and
  should fail everything that reads one. `docs/qwk-noise-band.md`.

  **The PR #69 fix is verified and now guarded.** Confirmed on main rather than assumed:
  `ml/train_visible_attributes.py:858` reads
  `final_val_metrics = metrics_from_confusion(promoted_val_confusion)` from a validation
  pass taken after the best checkpoint is reloaded, and the last epoch's is kept under its
  own name at line 926. Nothing asserted any of it, so reintroducing the defect was free —
  which is how it existed in the first place. Three assertions now read the trainer's
  source for the ORDER reload → re-score → gate, so moving the re-score above the reload
  fails even with every string still present: `34871 not less than 34619 : the promoted
  checkpoint is scored BEFORE it is loaded, so the gate reads whatever weights happened to
  be in memory`.

  **UI/UX: the live camera screen was measured in a browser for the first time, and it
  was not clean.** Everything in `tests/e2e/mobile-layout.spec.ts` visited `/scan` only in
  the camera-DENIED state, because reaching `phase === "ready"` needs a real MediaStream —
  so the one screen a scanning user looks at had no pixel-level coverage at all, and cycle
  22's clipping was caught by hand and pinned by a SOURCE contract that cannot see a
  laid-out box. `getUserMedia` is now shimmed to a canvas `captureStream()`: a real stream
  with a live track, so `openCamera` resolves on its first attempt, `watchCameraStream`
  finds tracks to listen on, and the page reaches `ready` the way it does on a phone. The
  landmarker is not mocked and in fact loads here.

  What it found at 360x800 in all five locales: `infoLinkBtn` (`app/scan/scan-styles.ts`)
  at **290.0x26.8px** against `--tap-min: 44px`. That is the only way into the "사진과
  데이터 사용" sheet, on the panel where the user consents to AI analysis and research
  storage — the control that explains what happens to their face, sitting at 61% of the
  minimum. `ghostLink`, two exports below it in the same file, already carried the
  minimum and is pinned by the contract test; this one was missed because nothing had ever
  reached `ready` in a browser. Reverting the fix fails the spec with exactly one offender
  named: `ko: controls under 44px ... ["사진과 데이터 사용 자세히 보기 290.0x26.8"]`.

  **Two things checked and corrected rather than shipped.** The spec's first run flagged
  three 18x18px checkboxes as well. They are not a defect — each sits inside a 52px
  `<label>`, which is the box a finger lands on — so the rule measures the label where one
  wraps the control, and the product was not changed for them. And the source contract
  added alongside used `/export const infoLinkBtn:[\s\S]*?minHeight: "var\(--tap-min\)"/`,
  which **passed against a reverted `infoLinkBtn`**: the lazy match ran past the end of the
  declaration and found `ghostLink`'s own `minHeight` fifty lines down. It is bounded to
  the object literal with `[^}]*` now, and re-verified by the same revert:
  `expected 'import type { CSSProperties } from "r…' to match /export const infoLinkBtn:
  CSSProperti…/`. A guard that cannot fail is worse than no guard.

  **Bug fix 1: the re-engagement cron would have mailed 2주 and 4주 to the same person in
  one sweep.** `app/api/reengage/run/route.ts` loops `[2, 4]` and the two passes were
  independent — the week-4 query filtered on `week4_sent_at is null` and `consented_at`
  alone, never on whether week 2 had gone out. A contact consented four or more weeks ago
  with neither column set matched BOTH queries, and the week-2 send inside the loop sets
  only `week2_sent_at`, a column the week-4 query does not look at. This is the default
  path, not a corner case: `lib/reengage.ts` is a documented no-op until the owner sets
  `RESEND_API_KEY` while `/api/reengage/subscribe` has been storing consenting contacts the
  whole time, so the first cron tick after the secrets are set sweeps everyone who has been
  waiting since consent and sends each of them both mails minutes apart. Two different
  `reengageIdempotencyKey(email, week)` values, so Resend's idempotency does not collapse
  them. The fix is one predicate — the four-week mail follows two weeks behind the two-week
  one — and it leans on a NULL comparison not being true, so "week two has not gone out"
  holds week four back as well. `tests/reengage-double-send.test.ts` fakes Supabase at the
  query-builder level and models that NULL rule explicitly; reverting the predicate fails
  3 of 5, including `expected [ { …(2) }, { …(2) } ] to deeply equal [ { …(2) } ]` with
  both mails addressed to `waiting@example.com`. The two that still pass are the controls.

  **Bug fix 2: `/checkin` told the user their feedback was saved when the write was
  refused.** `lsPush` (`lib/store.ts`) swallows a `setItem` throw and returns false on
  purpose — its own comment says a blocked or full store "must not reject into the caller's
  click handler". `recordProductUse` honours that; `recordCheckin` discarded it and
  returned a fully-populated `Checkin`, so `save()` called `onDone()` unconditionally and
  the card rendered "남겨주신 피드백을 저장했어요." over an empty store. Safari private mode
  and a quota-full device both make `setItem` throw. `/checkin` is the landing page of
  every re-engagement mail (`app/api/reengage/run/route.ts`), so the user answers three
  questions, is told it was saved, finds the card un-answered next visit, and the mail
  keeps asking. `recordCheckin` now returns `Checkin | null` like its sibling and the card
  shows the error row `app/components/product-card.tsx` already uses — reusing the exact
  string, which exists in all four dictionaries, so no i18n key was added and no locale
  falls back. Reverting the one line fails 1 of 3:
  `expected { sku_id: 'sr1', week: 2, …(5) } to be null`.

  **The fix broke an existing test, and the test was restated rather than relaxed.**
  `tests/reengage-resubscribe.regression-8.test.ts` pinned ISSUE-008 — the cron's due
  date must come from `consented_at`, never `created_at` — by asserting the runner makes
  exactly **2** `.lte()` calls, both on `consented_at`. The spacing predicate makes it 3,
  so the full run came back `expected "vi.fn()" to be called 2 times, but got 3 times`.
  The guarded behaviour did not change; the arity did. The assertion now names every
  `.lte()` column — `["consented_at", "consented_at", "week2_sent_at"]` — which is at
  least as tight (a fourth filter or a swap still fails it) and was re-verified by
  reintroducing ISSUE-008 itself: `expected [ 'created_at', 'created_at', …(1) ] to
  deeply equal [ Array(3) ]`. Recorded because the first full smoke of this cycle was
  RED on it, not green.

  **One candidate found and deliberately not fixed**, recorded as a backlog item rather
  than swept up: `recordCareIntent` discards the same signal one function below
  `recordCheckin`. Its only caller does `void recordCareIntent({...})` and shows the user
  nothing, so it is a short log rather than a lie to a user, and fixing it carries a
  question about what `/care` should surface.

  **Rotation, proved rather than asserted.** Measured across the rotation step alone:
  `docs/AUTOPILOT.md` **1535 -> 1506**, `docs/autopilot-changelog.md` **4396 -> 4694**.
  (This paragraph was written after that measurement, so the committed file is a little
  longer than 1506; `wc -l` on the commit is the authority and the delta above is the
  rotation's, not the whole cycle's.) "Recent cycles" holds 24/23/22; cycle 21 moved
  verbatim to the bottom of the changelog, and both `[x]` items moved under their
  original "### Now" heading with the original text preserved as a blockquote.
  Normalising both files' non-blank lines (strip leading whitespace and `>`, strip
  trailing whitespace, `sort -u`) and running `comm -23 before after` leaves exactly
  **1** line:

  ```
  - [AI] `minQwkGainOverHeuristic` is 0.0 — strictly-greater, with no noise band. A
  ```

  which is that item gaining its `[~]` — the one line this cycle edited rather than
  moved. 5026 unique lines before, 5271 after.

  **Verification.** `npm run smoke` green (`Smoke test passed.`), vitest **603 passed in
  89 files** (595 in 87 plus 8 cases in 2 new files), `npx tsc --noEmit | grep -c
  "error TS"` **13** unchanged, `npm run lint` **0 errors, 2 warnings** — the same two,
  `'_reads'` and `'_result'` at `lib/care.ts:72` — `python3 ml/selftest.py` **Ran 121
  tests ... OK** (103 plus 18), mobile E2E **50 passed**. The arriving E2E case count was
  not separately recorded this cycle (the baseline smoke output was tailed past that
  line and the brief gave only `Smoke test passed.`), so 50 is stated as measured and the
  delta is not. `lib/skin.ts` is untouched;
  `public/models/visible-attributes/manifest.json` is untouched, `status` and
  `promotionGate` included; `NEXT_PUBLIC_FUNNEL_FLUSH` was not set; no consent kind was
  invented and neither stream was merged; no dataset licence tier moved.

  **Supervisor review.** The finding this cycle turns on was derived here before the
  worker reported, and the worker found it independently and went further.

  *PR #69's fix was live and unguarded, and that is now closed.* PR #69 merged between
  cycles, resolving an owner blocker open since 2026-09-15. Guardrail 8 was checked
  first: `status` is still `pending-training-data`, `promotionGate` gained only a
  BLOCKER (`minQwkGainOverHeuristic: 0.0`, strictly-greater), `lib/skin.ts` gained an
  `export` with no logic change. Then the fix itself was broken at its source line —
  `metrics_from_confusion(promoted_val_confusion)` reverted to `last_val_confusion`,
  restoring exactly the defect #69 was written to fix — and on main **all 103 Python
  tests stayed green**. Not a structural limit: torch is absent so `ml/selftest.py`
  reads the trainer as SOURCE TEXT and asserts on it, a technique already used five
  times (lines 1061, 1154, 1255, 1299, 1530), one of them added by #69 itself for its
  heuristic wiring. It guarded the wiring and not the checkpoint fix.

  Re-run on this branch, the same break now **fails**, and so does a second one this
  review only thought of because the branch's guard is stronger than the one this
  review would have written — moving the re-score above the checkpoint reload, which
  leaves every asserted string present and still fails on the ORDER assertion:

  ```
  BREAK reverted to last_val_confusion      Ran 121 tests   FAILED (failures=1, errors=1)
  BREAK rescore moved before the reload     Ran 121 tests   FAILED (failures=1)
  ```

  *The headline band reproduces from an independently written bootstrap.* Not by
  running `ml/qwk_noise.py`, and not with scipy (absent here): qwk written from the
  definition, the percentile convention taken from scipy's own source, the resampling
  written from scratch, stdlib only, on a 300-row fixture of this review's own
  construction. Against `gain_band_paired` on the same rows, 4000 resamples, seed
  12345:

  ```
  independent stdlib bootstrap   lo=-0.156817 hi=+0.126445 point=-0.014784 width=0.2833
  ml/qwk_noise.gain_band_paired  lo=-0.156817 hi=+0.126445 point=-0.014784 width=0.2833
  delta lo=1.11e-16  hi=1.94e-16  point=2.22e-16
  ```

  A width of **0.2833 at 300 rows** — a half-width of ±0.14 — independently confirms
  the entry's ±0.15. The two scipy sources cited in `docs/qwk-noise-band.md` were also
  re-fetched here and both sha256 match byte for byte (`cfa7d1e2…` 98,486 bytes,
  `4ef9a44e…` 106,090 bytes).

  *Both defect guards bite at their source lines.* Making `recordCheckin` swallow the
  failed write again fails 1 of 3 (`expected { sku_id: 'sr1', week: 2, … } to be null`);
  dropping the week-2 predicate from the week-4 query fails 3, with the double-send
  symptom itself (`expected [ 2 items ] to deeply equal [ 1 item ]`).

  *A reviewer error, and the branch is right about it.* This cycle's brief told the
  worker that the PR #69 entry in BLOCKERS was stale and should move. **There is no
  such entry and there never was** — checked on main after reading the branch's
  correction: `## Blockers` contains no `#69`, and the only mentions anywhere in the
  file are inside two backlog items' prose and one changelog line. PR #69 was one of
  the three owner decisions this supervisor has been listing in its reports to the
  owner, which is not the same thing as an entry in this file, and the brief conflated
  them. The worker checked rather than complying, which is the right response to an
  instruction that does not match the tree.

  *Rotation, against a pre-review snapshot of main.* 1535 → 1524 and 4396 → 4694.
  `comm -23` over both files' sorted non-blank lines finds **30 missing**, all 30 from
  the three backlog items this cycle closed — the two-model gate item, the `/scan`
  pixel-coverage item, and the `minQwkGainOverHeuristic` noise-band item — each present
  in the changelog. "Recent cycles" holds 24/23/22.

- 2026-09-21 (cycle 23) — Branch `autopilot/2026-09-21-0039`. **The blemish detector now
  has a guard on its own decision margin, and unlike cycle 22's attempt this one bites:
  five of six source-line breaks fail it, two of them on the new assertions, and the
  noiseless fixture fails the same predicate with a suppression margin of EXACTLY zero at
  every frame size. Also: `/checkin`'s seven answer pills shipped at 35.5px in all five
  locales, and an exact score tie in `recommend` was being decided by floating-point
  accumulation order, so the 19,000원 toner outranked the equally-scored 18,000원 one.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief: `npm run smoke` green with the
  chromium override at `/opt/pw-browsers/chromium-1194` (`Smoke test passed.`, 44 E2E
  passed), vitest **577 passed in 87 files**, `npx tsc --noEmit | grep -c "error TS"`
  **13**, `npm run lint` **0 errors, 2 warnings** both in `lib/care.ts`,
  `python3 ml/selftest.py` **Ran 85 tests ... OK**.

  **ML: the margin guard the backlog item asked for, and proof that it bites.**
  `certifiedRadius` already had the ingredient and had never been pointed at it — it takes
  the minimum over EVERY cell, divides by the amplification factors 2 and 4, combines a
  counted cell's margins with `min` and an uncounted cell's with `max`, was only ever
  computed on the NOISY family, and was pinned to exact values rather than asserted to be
  above anything. So it cannot tell a suppression tie from a floor graze. What landed
  measures the raw, undivided distances over the cells that actually survived: the smallest
  `residual[i] - max(residual over i's 5x5 window)`, the smallest
  `residual[i] - BLEMISH.minResidual`, and a census of how many counted cells are tied
  with a neighbour exactly. The noise floor it is compared against is computed, not
  recalled: the background is four reads of a summed-area table over `gw*gh` cells, so
  `gw*gh * EPSILON * max|a*|` bounds one residual's rounding error.

  ```
  decision margin on the realistic fixture family (a* units)
  noise  frame        counted  tied    peak gap   floor gap   noise scale   peak/noise
      4  400x480           5     0    4.185e-5    3.461e+0    3.435e-11    1.218e+6
      4  720x960           5     0    3.396e-4    7.276e+0    3.803e-11    8.930e+6
      4  1080x1440         5     0    1.307e-3    7.321e+0    3.794e-11    3.446e+7
      4  1440x1920         5     0    1.654e-4    7.050e+0    3.796e-11    4.357e+6
      9  400x480           6     0    7.144e-4    3.518e+0    3.447e-11    2.072e+7
      9  720x960           5     0    1.835e-3    7.294e+0    3.813e-11    4.813e+7
      9  1080x1440         5     0    9.327e-3    7.331e+0    3.798e-11    2.456e+8
      9  1440x1920         5     0    1.050e-3    7.048e+0    3.801e-11    2.762e+7
     14  400x480           7     0    5.928e-4    3.556e+0    3.463e-11    1.712e+7
     14  720x960           5     0    8.147e-3    7.333e+0    3.820e-11    2.133e+8
     14  1080x1440         5     0    1.205e-2    7.353e+0    3.799e-11    3.172e+8
     14  1440x1920         5     0    3.769e-3    7.035e+0    3.808e-11    9.899e+7

  decision margin with noiseAmplitude 0 (a* units)
  frame        counted  tied    peak gap   floor gap  decided
  400x480           5     1           0    3.431e+0    false
  720x960           5     1           0    7.249e+0    false
  1080x1440         5     3           0    7.304e+0    false
  1440x1920         5     3           0    7.057e+0    false
  ```

  Both cases run the SAME predicate, which is what stops either passing by being weak.
  Cycle 22's zero-margin finding is now a property asserted of the fixture rather than a
  mystery about a lookup table: one to three of the noiseless frame's five counts are
  settled by `j < i`, so `tests/blemish-density-scale.test.ts`'s cross-resolution
  agreement holds for one bit pattern and a 1e-16 nudge moves it.

  **`MARGIN_RATIO` is 1e4 and not 1e6, and the reason is in the table.** The tightest row
  — noise 4 at 400x480 — clears its noise bound by **1.218e6**, so a threshold of 1e6
  would be cleared by 1.22x, which is a coin flip dressed as a guard. At 1e4 that row
  clears by 122x and the noiseless fixture still fails with a margin of exactly zero.

  **Six source-line breaks of `lib/skin.ts`, never of the test; five fail.** `lib/skin.ts`
  was restored byte-identical to HEAD afterwards and the restoration verified with
  `git diff`. Rounding the stride-window channel averages to integers collapses the
  smallest suppression margin from 4.185e-5 a\* to **1.066e-14** — four orders of magnitude
  BELOW the detector's own rounding error — while leaving the count unchanged, so nothing
  else in the suite notices: `noise 4 720x960: the smallest suppression margin is
  1.066e-14 a*, only 2.798e-4x the detector's own rounding error: expected
  0.0002798453713286699 to be greater than 10000`. Quantising those averages to steps of 8
  fails the census: `noise 4 400x480: 3 of 67 counts are settled by scan order, not by the
  image: expected 3 to be +0`. Those two are the ones that matter, because they fail on the
  NEW assertions; rounding a\* to 3 decimals, point-sampling the stride window and
  dithering a\* by cell index also fail, but on the pinned table, which any pin catches.

  **The sixth did not bite, and that is a limitation rather than a footnote.** Quantising
  `residual[i]` to 3 decimals inside `lib/skin.ts` leaves both margin cases green, because
  the harness's replica recomputes the residual from the captured a\* grid — so anything
  the detector does downstream of a\* is invisible to these margins. The guard covers the
  a\*-production path, which is where a transfer-curve approximation lands and is what it
  was built for, and not the residual arithmetic. That break IS caught, by three
  assertions in two other files (`counts across resolutions: 2, 3, 2, 2, 2`,
  `the shipped build is supposed to agree: 2, 3, 2, 2, 2`, and
  `expected [ 413, 422, 415, 421 ] to deeply equal [ 415, 421, 414, 418 ]`), which is why
  the blind spot is recorded rather than patched over with more harness.
  `docs/blemish-perturbation-tolerance.md` §7.

  **Research: ARU's plateau tie-break is the conventional one, and what it lacks is the
  degenerate-input branch.** No paper and no standard is reachable from this network, so
  nothing is attributed to one. What `raw.githubusercontent.com` served is
  `scikit-image`'s own source: `skimage/feature/peak.py` at **v0.24.0**
  (`http=200 bytes=14427`, sha256
  `8d65f9a973a128a86c0d7a2689166bfa9768471e071c0fcb43f73e2863d3d85b`) and at **v0.25.2**
  (`http=200 bytes=14478`, `_get_peak_mask` byte-identical), **v0.22.0**
  (`http=200 bytes=14970`, the same function differing only in line wrapping), plus
  `skimage/_shared/coord.py` at v0.24.0 (`http=200 bytes=4337`, sha256
  `5d44f698e581e6f8b11c789489b91d638a363805964b8967c2e50bdcea65edbd`).
  `api.github.com` now refuses anything outside this session's own repositories
  (`http=403`), and `peak.py` on `main` is a 404 — the tagged paths are what resolve.

  `peak_local_max` resolves an intensity tie the same way ARU does:
  `np.argsort(-intensities, kind="stable")` over `np.nonzero(mask)` coordinates, then a
  greedy `_ensure_spacing` walk, and a stable sort over row-major coordinates means the
  earlier index wins among equals — that is `residual[j] === residual[i] && j < i`. So
  `lib/skin.ts:1091` is not an idiosyncrasy to be fixed; cycle 22 found a property of the
  input, not of the rule. What ARU has no equivalent of is `_get_peak_mask`'s
  `# no peak for a trivial image` branch: when every cell in the mask is a local maximum it
  reports **no peaks at all** rather than letting index order manufacture them. Said
  plainly because the distance matters — that branch fires only when the field is ENTIRELY
  flat, and ARU's noiseless fixture is plateau-dominated but not entirely flat, so a
  transplanted copy would not fire there. It is not a drop-in fix and is not proposed as
  one. It is on the backlog as the question it actually raises.

  **UI/UX: `/checkin`'s answer controls were 35.5px high in every locale, and it was
  measured in chromium rather than computed.** `pill()` (`app/checkin/page.tsx`) styles
  every control a user answers with — 만족도 (3), 트러블 (2), 재구매 (2), seven buttons per
  card — and set `fontSize: 13` with `padding: "7px 11px"` and no minimum size, against
  `--tap-min: 44px`. `app/checkin/page.tsx` was the only consumer page in the tree with
  **zero** references to `var(--tap-min)`, and `tests/mobile-layout-contract.test.ts`'s
  file list is where it was missed. On the real page at 360x800: **32 of 45 controls under
  the contract across five locales**, every pill 35.5px high, and the short answers narrow
  as well as short — zh `好`/`有`/`否` at 37px, ar `لا` at **31.4px**, en `No` at 40.8px,
  which is why the fix takes both dimensions (following `app/studio/page.tsx:163`) and not
  just the height that `app/survey/page.tsx`'s twin chip carries. Re-measured the same way:
  **0 of 45**, and `doc scrollWidth=360 clientWidth=360 overflowing=0` in all five, because
  raising them widened the rows and that half was checked rather than assumed.

  Why an earlier audit called `/checkin` clean: the pills only render once a confirmed
  product use is at least two weeks old (`roundFor`), so against an empty
  `gyeol_purchases` the page shows two empty-state links and the controls never render.
  This is the landing page of every re-engagement mail
  (`app/api/reengage/run/route.ts`), i.e. the primary controls of the one surface the
  product has for bringing a user back. Five E2E cases, one per locale, seed the due use
  the way `tests/e2e/checkin-schedule.regression-7.spec.ts` does and assert the pixels;
  reverting `pill()` fails all five (`Error: ko: controls under 44px`, and the same in en,
  ja, zh, ar — `5 failed, 1 passed`). `docs/checkin-tap-target-measurement.md`.

  **Bug fix: an exact score tie in `recommend` was decided by floating-point accumulation
  order, not by price.** `rank` (`lib/recommend.ts`) sorted on
  `scoreSku(b) - scoreSku(a) || a.price - b.price`, i.e. "on an equal score the cheaper
  product wins". Every weight in `scoreSku` is a multiple of 0.1 and so is the exact score,
  but the ADDITIONS are not, and the order they arrive in depends on which concerns each
  SKU declares. For a 지성 / 토너 survey with 모공·건조·트러블, tn1 and tn2 both score 14.1:

  ```
  tn1 order 3,2,1.2,1.2,2,1.2,1.5,2 => 14.1
  tn2 order 3,2,1.2,2,1.2,1.2,1.5,2 => 14.099999999999998
  diff = 1.7763568394002505e-15   equal = false   round(x*10): 141 vs 141
  picks before: tn1 19000 | tn2 18000 | tn3 16000
  picks after : tn2 18000 | tn1 19000 | tn3 16000
  ```

  That difference of 1.78e-15 is truthy, so `||` never reached the price key and the
  19,000원 toner outranked the equally-scored 18,000원 one — on the top card of `/report`
  and on the hero product attached to both hydrate steps. The fix compares the score in
  tenths, which is exact rather than tolerant: the smallest real gap between two scores is
  0.1, fourteen orders of magnitude above the error.

  **Scope measured, not estimated**, by importing the pre-fix module alongside the fixed
  one and comparing pick lists over every 3-concern survey (5 skin types x 8 categories x
  56 concern triples): `surveys=2240 pick lists changed=19 of which the top pick got
  cheaper=17`. One of the 19 changes the pick SET and not only the order
  (지성 세럼 [모공/잡티/유분]: `sr1|sr2|sr4` became `sr1|sr2|sr3`), because `diversify`
  reorders around the tone/brand filter once a different SKU leads. Four cases in
  `tests/recommend.test.ts`, including a control that the fix did not become "cheapest
  first" — `baseSurvey`'s order is identical before and after, verified against the pre-fix
  module, and keeps the 19,000원 tn1 ahead of the 16,000원 tn3. Reverting the comparator
  fails two of them (`expected [ 'tn1 19000', 'tn2 18000', …(1) ] to deeply equal
  [ 'tn2 18000', 'tn1 19000', …(1) ]` and `expected 'tn1' to be 'tn2'`).

  **One hunt candidate checked and rejected, since the standard here is to record them.**
  A reported defect in `attach` — that it skips a routine hero when `picks.find(...)`
  returns an already-`seen` SKU, leaving two routine cards product-free — does not hold.
  Run against the real module with `category: "클렌저"`: `picks: cl3,cl1,cl2`,
  `am: am-cleanse=cl3 am-hydrate=NONE am-protect=NONE`. `am-hydrate` is empty because no
  pick is a 토너 (every pick is in `survey.category`), not because of the `seen` set, and
  `attach(am)` and `attach(pm)` keep separate `seen` sets so `pm-cleanse=cl3` too. Nothing
  was changed on the strength of it.

  **Verification.** `npm run smoke` green (`Smoke test passed.`, 49 E2E passed — the 44
  baseline plus the five new locale cases), vitest **583 passed in 87 files** (+6 cases),
  `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npm run lint` **0 errors, 2
  warnings** the same two in `lib/care.ts`, `python3 ml/selftest.py`
  **Ran 85 tests ... OK**. `lib/skin.ts`, `public/models/visible-attributes/manifest.json`
  and `fallbackVersion` are untouched; `NEXT_PUBLIC_FUNNEL_FLUSH` was not set; no consent
  kind was invented and neither stream was merged.

  **Supervisor review.** The margins were instrumented and measured here first, from a
  separate copy of `lib/skin.ts` with counters added at the two decision points, before
  the worker reported.

  *The pinned numbers reproduce under different instrumentation.* On the noisy fixture
  at 400x480 this review measured a smallest nonzero suppression gap of **7.144e-4**
  against the branch's pinned **0.0007143695914120229** — the same quantity, arrived at
  by counting inside the detector's own loop rather than by replicating it, agreeing to
  the four significant figures this review printed. The separation the guard rests on is
  real and it is not marginal: exact ties on the noiseless fixture at every frame size
  against **none** on any realistic one, and the smallest nonzero gap moving from ~1e-15
  (2-8 ULPs) to 5.8e-5..1.1e-3. Any threshold in the eleven orders between separates
  them, which is why `MARGIN_RATIO = 1e4` does not need defending as a delicate constant.

  *The guard bites, and it is the only thing in the file that catches its own line.*
  Removing the tie-break at `lib/skin.ts:1091` — `residual[j] === residual[i] && j < i`,
  the exact line the guard exists to protect — fails **1 test of 10**, and it is the new
  non-vacuity case: `flat 400x480: the replica disagrees with detectBlemishes: expected
  5 to be 8`. Nine pass. Set against cycle 22's seven breaks that caught nothing, that is
  the difference between a guard and a green line.

  *One reviewer misstep, recorded.* The first break tried here — quantising the residual
  to two decimals — failed **7 of 10** and proved nothing: it moves counts everywhere, so
  every pre-existing tolerance case fails too and the new guard's contribution is
  invisible inside the noise. A break has to be narrow enough that what fails identifies
  what is protected.

  *The bug fix is real and its guard bites.* Reverting `rank` to the raw float comparison
  fails 2 cases with the exact symptom described: `expected [ 'tn1 19000', 'tn2 18000' ]
  to deeply equal [ 'tn2 18000', 'tn1 19000' ]` — the 19,000원 toner ranked above the
  equally-scored 18,000원 one, because a 1.78e-15 difference in addition order is truthy
  and `||` never reached the price tie-break. Worth noting that this and the blemish
  finding are the same defect class in two places: an exact float comparison deciding a
  user-visible outcome.

  *One thing to state so the next reader does not over-read the guard.* It asserts BOTH
  margins, and only one of them was ever near the edge. Measured here across both
  fixture families, the gap to `BLEMISH.minResidual` is healthy everywhere — the
  branch's own pinned `floorGap` runs 3.43..7.35 on the realistic rows and 3.43..7.30 on
  the noiseless ones, against a threshold of 1.6. Nothing sits near it on either family.
  The fragility was entirely in the neighbour comparison. Asserting the floor too is
  cheap insurance and correct; it is not a second near-miss.

  *Rotation, checked against a pre-review snapshot of main.* 1523 → 1480 and 4029 →
  4301. `sort -u` over both files' non-blank lines then `comm -23` against main's finds
  **17 lines missing**: 16 are the decision-margin backlog item this cycle closed, which
  is in the changelog at line 32 marked `[x]` and struck through with the original
  preserved verbatim as a blockquote, and the 17th is `Last updated: 2026-09-20`, now
  `2026-09-21`. "Recent cycles" holds 23/22/21.

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
