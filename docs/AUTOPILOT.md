# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-24

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
  **2026-09-23, cycle 33: the harness this item rests on was failing on the clock, and
  the open question is untouched.** `tests/blemish-perturbation-tolerance.test.ts` is
  where both this item and the `srgbLinear` one above get their a* error and certified
  radius, and its case `measures the certified radius and the achieved one, at every
  frame size` declared no timeout, so it ran against vitest's 5000ms default. Measured
  wall time over eight verbose runs: **4844, 4845, 4864, 4880, 4908, 4962, 4989
  and 5039 ms** — a margin of 1-3%. It failed three times before the fix (one of a
  standalone batch of eight, the first attempt of a second standalone batch, and one
  full-suite run), *Measured:* the one failure whose output was captured is
  **`Error: Test timed out in 5000ms`**, raised on the `it(...)` line and not on any
  assertion; the other two were recorded only as a failing count and a test name, so
  "never an assertion" is established for that one and not for all three. *Inferred:*
  that the other two are the same thing, because raising only the timeout took the case
  to 10 of 10, which a flaky assertion would not do. No number this file certifies was
  ever observed to differ. The case
  and `keeps its error under the noise bound every margin above is divided by` (3536
  and 3675 ms, the next one at risk) now carry `{ timeout: 120_000 }`, the convention
  already used by the `{ timeout: 300_000 }` case in the same file and by
  `tests/cheek-clipping-signal.test.ts:296`. Ten standalone runs after the change:
  **10 of 10 green**. A repo-wide verbose run reported exactly three cases at or above
  2500 ms — those two and `cheek-clipping-signal`'s 6472 ms one, which already declared
  a timeout — so this was the whole of the exposure in that run. *Not established:* why
  the case sits so close to 5000 ms (nothing was profiled or made faster), and whether
  another case drifts over the line on a slower machine; the sweep is one run's numbers
  on this container. The product question this item holds — report, refuse, or carry a
  confidence on a degenerate frame — is not advanced.
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
  **2026-09-23, cycle 31: half the 조명 discrepancy is accounted for, and the last clause is
  withdrawn for pinned rows only.**
  `ARU_PRINT_RETAKE_SPLIT=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
  clean and degraded level distributions behind each count. In **7 of the 12 rows the
  degraded level is pinned** — all 120 seeds publish the same level — and there the
  "disagreement count" is not a measurement of the condition at all but a readout of
  where `tuned()`'s bisection-at-seed-1 left the CLEAN capture relative to its own cut
  point. The identity is exact: 조명 dark redness pins at 1 against a clean split of
  `0:29 1:91` and reports **29/120**, the clean level-0 count; 조명 blown out redness
  pins at 0 against the same split and reports **91/120**, the level-1 count; 조명
  blown out pores pins at 0 against `0:59 1:61` and reports **61/120**. Of the two 조명
  rows the item named, dark pores (120/120 vs 4/120) is pinned and fully accounted for;
  **dark oil (21/120 vs 71/120) is NOT pinned** (degraded split `0:82 1:38`), so this
  identity does not explain it and it stays open. A pinned row's count follows the clean
  split, which `tuned()` sets at seed 1, so no pinned row's `n/120` should be quoted,
  compared across re-derivations, or used to set a threshold. (That a construction change
  would move it is inferred from the identity; no alternative construction was run.)
  **The rule is unaffected and for a stronger reason than its count gave:** four of the
  pinned rows pin at a level the clean capture never reaches at all, so the degradation
  decides the published reading on every seed. Four rows ARE genuine per-seed
  measurements (피부 영역 on all three attributes, 21/120 on 조명 dark oil) and are the
  ones worth quoting. One exception found and written down: **반사 pores is 0/120** with
  the degraded distribution identical to the clean one, so "every condition costs a
  reading on a sixth of the seeds" holds per condition but **not** per attribute.
  The mechanism is asserted, not only printed, in `tests/retake-signal-rule.test.ts`.
  Full table and the arithmetic: `docs/retake-sweep-what-it-measures.md`.
  **2026-09-23, cycle 32: the last open row is narrowed — 71/120 is not reachable from the
  committed construction's splits, and was not reached at any of eight tuning seeds.**
  `ARU_PRINT_RETAKE_OIL=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
  2x2 for 조명 dark oil over the 120 seeds at the committed construction:
  `c00=82 c01=21 c10=0 c11=17`. **The clean-1 / degraded-0 cell is empty** — no seed that
  reads level 1 clean drops to 0 when darkened — so the count is not two splits colliding
  but exactly the difference of the marginals, `38 - 17 = 21`. That bounds it: with `a`
  clean and `b` degraded level-1 seeds, disagreements are `c01 + c10` with
  `c01 <= min(120 - a, b)` and `c10 <= min(a, 120 - b)`, so at `a = 17, b = 38` the most
  any rearrangement of those seeds can give is **55**. A different noise field cannot
  produce 71; a different fixture, cut point or analyzer is required. Two sweeps say the
  row behaves like a real per-seed measurement and not like a pinned one: re-seeding
  `tuned()`'s bisection swings the CLEAN split from 17 to 101 level-1 seeds while the
  count stays between **12 and 21**, and darkening the capture moves it from **9** at
  cheekL 120 to **26** at cheekL 40 (one reversal, 14 then 15, between 90 and 100).
  Asserted, not only printed, so a construction change fails a named test. **Still
  unknown and needing cycle 11's fixture, which was never committed:** which of fixture,
  cut point or analyzer differed, and whether some construction not tried here reaches
  71. `docs/retake-sweep-what-it-measures.md`.
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
- [AI] **The RTL sweep covered three screens; six more have never been measured under
  `ar`.** Opened 2026-09-24 (cycle 34) by the sweep that found the two logical-property
  defects on `/report`. What was measured: `/report`, `/care` and `/checkin` at 360x800
  in Chromium, under each of `en`, `ja`, `zh` and `ar`, with a valid survey and a
  reading built from the values `lib/skin.ts` actually produces. What was not:
  `/`, `/scan`, `/survey`, `/studio`, `/privacy` and `/unsubscribe`, and on the three
  that were swept, nothing about switching language mid-session or about a real phone.
  The defect class is cheap to look for and was **0 for 4** on the text categories and
  **2 for 1 screen** on the layout category, so the remaining screens are worth the same
  pass. Grep first rather than render first: `left:`, `right:`, `paddingLeft`,
  `marginLeft`, `borderLeft` and `textAlign: "left"/"right"` in a `.tsx` are the
  candidates, and `tests/e2e/rtl-logical-inset.regression-18.spec.ts` is the shape a
  finding should land in. Separate and NOT covered by any of this: the vision path
  (`mergeVisionAnalysis`) can put LLM-written text into a reading, that text is not a
  dictionary key, and no sweep here exercised it — so "no Korean leaks" is a statement
  about the strings this build composes, not about every string a user can see.
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
- [~] [AI] **The device stores that read `JSON.parse(localStorage…)` and hand the result
  back unchecked.** Cycle 29 guarded `lib/funnel.ts`; cycle 30 guarded
  `lib/scan-history.ts`, `lib/crops.ts` and `lib/labels.ts`; this item named four more.
  **2026-09-23, cycle 31: three are fixed, one never needed it, and `lib/consent.ts` is
  the only one left — deliberately.**
  - `lib/store.ts` and `lib/pilot.ts` are guarded, with the failure measured against the
    unchanged code FIRST: `tests/commerce-store-shape.test.ts` failed **40 of 49 cases**
    before the guard and passes 49/49 after. Four consequences traced to call sites:
    `/care` opened the merchant link and logged nothing (`void recordCareIntent` swallows
    the rejection); `/privacy` lost the whole page including its delete-my-data controls
    (`careIntentCount()` threw at `.length` in an effect with no try/catch); `/checkin`
    rendered a blank `<main>` for the life of the install (its `Promise.all(...).then`
    had no `.catch`); `/pilot` dropped a roster row from the operator's click handler.
  - `getCurrentPilotSession` is the one that is NOT an array, and `Array.isArray` would
    have been the wrong guard. Its callers' truthiness checks already neutralised `null`
    and `false`; a truthy non-session (`5`, `"abcdef"`, `{"a":1}`) passed them with
    `participantId` `undefined`, so every consent event in that session landed UNSCOPED
    — a silent loss in the research stream, not a crash. It now checks the two fields
    the callers read.
  - `lib/funnel-flush.ts` **was already guarded and this item was wrong about it**.
    `readCursor` is its only such read and it has `Array.isArray` plus a per-element
    `typeof id === "string"` filter, stricter than the guard the other cycles added. No
    code changed; the claim is corrected here.
  - **`lib/consent.ts` stays open and must not be given this guard casually**: "read as
    empty" there means "no consent event in the audit trail", which is hard guardrail 4
    and a decision rather than a line. That is the whole of what is left of this item.
  Mechanism, the three break-the-line results and the primary source read for the
  object-shaped store: `docs/funnel-store-shape.md`. Noted 2026-09-23.
  **2026-09-23, cycle 32: the same class, found one read further along and on the paying
  path.** The SURVEY is not a list store and is not in localStorage, which is why five
  cycles of this item walked past it: `/report` and `/care` each read
  `sessionStorage["gyeol_survey"]` inside `try { JSON.parse } catch { return null }` and
  hand the result to `recommend()`, which indexes five fields on it unchecked. Eight of
  eleven wrong shapes throw there — inside a mount effect, so `app/error.tsx` takes the
  page, every `/api/out` link on `/report` and every merchant button on `/care` with it
  — and three more return a full report scored off fields nothing read. `/report` also
  calls `saveLastResult` on the line BEFORE the throw, so the bad value is mirrored into
  `localStorage["aru_last_result"]` and the fresh-tab fallback in both pages re-reads it
  forever. Guarded at all three reads with one `isSurvey` shape check
  (`lib/recommend.ts`); reproduced in Chromium first and closed in
  `tests/e2e/commerce-survey-shape.regression-16.spec.ts`, isolated at its source lines
  in `tests/survey-shape.test.ts`. `lib/consent.ts` is still the whole of what is left of
  this item.
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

- 2026-09-24 (cycle 34) — Branch `autopilot/2026-09-24-0039`. **ARU ships five languages
  and one of them reads right to left, so `/report` was measured under all four
  non-Korean locales at 360px. The two categories everyone worries about — Korean text
  leaking through and un-interpolated `{placeholders}` — came back clean, and that is
  recorded with the pages and locales checked rather than claimed. The category nobody
  had measured did not: on the picks step the comparison table's row labels scrolled off
  the screen in Arabic, and on the routine step every step number sat at the far end of
  the line it belonged to. Both are the same root cause, one CSS keyword apart.
  Separately, `melanin_index` was the seventh registry index and the only one no
  committed row pinned in either language.**

  **Baselines, measured here on a clean tree at `0fc3adb` before any edit.** `node_modules`
  was absent, so `npm ci` first. `npx vitest run` **786 passed in 98 files**,
  `npx tsc --noEmit | grep -c "error TS"` **13**, `npx eslint .` **0 errors, 2 warnings**
  (the same `_reads` / `_result` at `lib/care.ts:70`), `python3 ml/selftest.py`
  **Ran 142 tests in 1.414s ... OK**, and `npm run smoke` with the chromium override at
  `/opt/pw-browsers/chromium-1194` printed **`Smoke test passed.`** with **156 passed**.
  They match the supervisor's.

  **What the locale sweep checked, and what it found nothing in.** `/report`, `/care` and
  `/checkin` in Chromium at 360x800, `localStorage["aru.lang"]` set to each of `en`,
  `ja`, `zh` and `ar`, with a valid `gyeol_survey` and a `gyeol_reads` built from the
  values `lib/skin.ts` actually produces — 12 page/locale renders, plus the picks and
  routine steps of `/report` in each locale, 20 renders in total.

  - **Un-interpolated `{placeholders}`: none, on any of the 20 renders.** Checked
    statically as well, which is the stronger form: over the **3,636 dictionary entries**
    in `lib/i18n/{en,ja,zh,ar}.ts` (911 / 907 / 907 / 911), the set of `{...}` tokens in
    the Korean key equals the set in the translation on **every** entry — **0 mismatches
    in each of the four**. A translation cannot drop or rename a parameter today.
  - **Korean leaking into a non-Korean page: none, and the first run said otherwise
    because the fixture was wrong.** The first pass reused `VALID_READS` from
    `tests/e2e/reads-shape.regression-17.spec.ts` and reported four Korean strings on
    `/report` in all four locales. They are `"오늘 피부는 안정적이에요"`, `"유분 적정"`,
    `"모공 보통"` and `"전반 안정"` — and `lib/skin.ts` produces **none** of them.
    `SKIN_LABELS`, `overallFor` and `headlineFor` emit a different closed set, and all
    **17** of those strings are present in all four dictionaries. That fixture is a
    shape fixture and is right for what it tests; it is not a corpus. Re-run with real
    values the count is **0 Korean characters on all 20 renders**. Two static sweeps
    agree: **391** literal `t("…")` keys across `app/` and `lib/` (every one Korean),
    **0 missing** from each of the four dictionaries; and the catalogue fields the UI
    passes through `t(variable)` — brand (16), name (22), category (8), texture (10),
    highlights (44), key ingredients (28), concerns (12) and every `budgetBand` value
    (4) — **0 missing** from each of the four.
  - **Page-level horizontal overflow: none.** `document.documentElement.scrollWidth ===
    clientWidth === 360` on all 20 renders, `ar` included.
  - **Currency and number formatting: nothing wrong found.** ARU never calls
    `Intl.NumberFormat` on a price. Prices are rendered only as bands, and both band
    functions go through the dictionary: `budgetBand` (`lib/skus.ts`) and `budgetLabel`
    (`lib/recommend.ts`). The four reachable bands render as `Under ₩10,000` /
    `₩10,000 range` / `₩20,000 range` / `₩30,000 range` in `en`, `1万ウォン未満` /
    `1万ウォン台` … in `ja`, and `أقل من 10,000 وون` / `حوالي 10,000 وون` … in `ar`. The
    5th band `"4만원 이상"` is present in all four dictionaries and is **unreachable from
    the current catalogue** — the dearest of the 22 SKUs is 38,000 — so it was checked
    and not rendered. Won is the right currency in all five languages: ARU recommends
    from a Korean catalogue at Korean merchants.

  **Bug fix — the comparison table's row labels leave the screen in Arabic.** `/report`'s
  picks step is where the commerce out-links sit. `ProductCompare`'s row-label column is
  `position: sticky` at `left: 0` (`app/components/product-compare.tsx`), inside a
  container that is `overflowX: auto` around a table with `minWidth: 340`. Under
  `dir=rtl` that scroller runs the other way — `scrollLeft` goes negative — and `left`
  never catches the column. Measured on the unchanged code, scrolled to the inline end:

  | locale | before scrolling | after scrolling | viewport |
  |---|---|---|---|
  | `ar` | L=201 R=319 | **L=283 R=401** | 360 |
  | `en` | L=41 R=179 | L=41 R=179 | 360 |

  So in Arabic the column travelled 82px and its right edge landed **41px past a 360px
  viewport**, taking 예산대 / 용량 / 제형 / 핵심 성분 / 제외 성분 반영 with it — the five
  labels that say what the rows under them mean. In English it did not move. The fix is
  `insetInlineStart: 0`, plus `textAlign: "start"` on the two cells that had
  `textAlign: "left"`. After it, `ar` reads **L=201 R=319 both before and after**, and
  `en` is unchanged.

  **UI/UX — the routine step's numbers sat at the wrong end of every line.** Same root
  cause, different block, recorded separately because it is a different screen state.
  `RoutineHalf` in `app/report/page.tsx` draws a numbered rail with `paddingLeft: 40`, a
  dotted rail at `left: 13` with `borderLeft`, and each number at `left: -40`. Arabic
  titles right-align, so the numbers stayed on the physical left while the text they
  number started at the right:

  | | step 1 | step 2 | step 3 |
  |---|---|---|---|
  | `ar` before, title | L=137 R=319 | L=101 R=319 | L=114 R=319 |
  | `ar` before, number | L=41 R=69 | L=41 R=69 | L=41 R=69 |
  | `ar` after, title | L=97 R=279 | L=61 R=279 | L=74 R=279 |
  | `ar` after, number | L=291 R=319 | L=291 R=319 | L=291 R=319 |
  | `en` (unchanged), title | L=81 R=319 | L=81 R=319 | L=81 R=296 |
  | `en` (unchanged), number | L=41 R=69 | L=41 R=69 | L=41 R=69 |

  Before the fix the gap between a number and the title it numbers was 68, 32 and 45
  pixels of empty line, varying with the title's length. After it the number sits **12px**
  in front of the title on all three steps, which is exactly what LTR has always had
  (69 → 81). `paddingInlineStart` / `insetInlineStart` / `borderInlineStart`; the dotted
  rail moved from L=54 to L=304 and its dotted edge flipped from `border-left` to
  `border-right`, measured through `getComputedStyle`.

  *Break-the-line, three source edits, each re-run against the FINAL committed tree
  (`d99ad50`) and restored with `git checkout`:*

  | edit | result | which named tests failed |
  |---|---|---|
  | base, no edit | **4 passed** | — |
  | `stickyCol`'s `insetInlineStart: 0` → `left: 0` | **1 failed \| 3 passed** | `…stays pinned and on-screen under Arabic` |
  | both `stickyCol` `textAlign: "start"` → `"left"` (2 occurrences) | **2 failed \| 2 passed** | that one, plus `…still pins to the left in LTR` |
  | `RoutineHalf`'s three logical properties → physical | **1 failed \| 3 passed** | `routine step numbers sit in front of their step under Arabic` |
  | restored | **4 passed** | — |

  `tests/e2e/rtl-logical-inset.regression-18.spec.ts`, 4 cases, `ar` and `en` for each of
  the two blocks. The LTR cases are there because a logical property is only a fix if it
  leaves LTR alone, and the second row above is what proves they are not decorative.

  **ML — `melanin_index` had no committed row, and the docstring saying so had gone
  stale.** No `[AI]` ML item in "Backlog > Now" could be advanced honestly this cycle
  without a labelled export, and each is blocked for a reason already written in its own
  entry: the 0.86 cap / 0.8614 gate pair needs the vision path's confidences measured
  against real readings; the ordinal floor needs a first real training run; the blemish
  constants need real photos through `/eval`; `minQwkGainOverHeuristic`'s third clause is
  the owner's; the plateau-dominated `detectBlemishes` question is a product decision and
  guardrail 4 of this cycle's brief forbids moving what `blemishCount` reports; the
  `roughness_ratio` divergence's open half is "which side moves", which needs faces. So
  this cycle's ML item came from outside that list, and it is a hole in the test surface
  rather than a model question: **`ml/skin_indices.INDEX_BY_ID` holds 7 indices and
  `ml/index-parity.json` held rows for 6**, so nothing anywhere pinned `melanin_index`'s
  expression or either of its guards.

  It is now pinned with **12 rows**, and the group is `"comparison": "python-only"`
  rather than a parity group, because it cannot be one: `melanin_index` is ABSOLUTE and
  DERIVED, `DERIVED_FROM` names `toneLstar` as the column it reads *from*, `lib/skin.ts`
  computes no counterpart, and no export column holds the result. The rows pin both
  guards. The low one is shared with the benchmark the module
  cites: `ml/skin_indices.py` records that as hpicsk/regional-ccm `src/clinical.py`'s
  `MI_L_STAR_FLOOR = 1.0`, verified in cycle 20 against that source and not re-fetched
  here. L\* 0, 0.5 and 1.0 all read **200.0**. The high one is the single deliberate deviation from it — that
  reference clips to `[1.0, 100.0]` and this does not — so L\* 100 reads **0.0**,
  L\* 100.0000001 reads **-4.342944698377123e-08** and L\* 120 reads
  **-7.918124604762482**.

  *Break-the-line, two source edits to `ml/skin_indices.py:melanin_index`, each against
  the committed tree:*

  | edit | `python3 ml/selftest.py` | which named test |
  |---|---|---|
  | base | **Ran 142 tests … OK** | — |
  | drop the low floor (`max(lstar, 1.0)` → `lstar`) | **Ran 142 … FAILED (errors=1)** | `test_indices_match_the_typescript_implementations_value_for_value` |
  | clip the high end the way the cited reference does | **Ran 142 … FAILED (failures=1)**, `AssertionError: 0.0 != -4.342944698377123e-08 : above the ceiling: the reference clips to 0 here and this does not: melanin_index(100.0000001)` | the same test |
  | restored | **Ran 142 tests … OK** | — |

  The same test's docstring is corrected while it is being extended. It still said
  "Five of the seven registry indices are covered … the other two — melanin_index and
  ita — are name-pinned and value-unchecked", and the committed table contradicts the
  `ita` half: cycles 19-20 gave `ita` its own case, `"comparison": "exact"` and **17
  rows**. The set assertion in that test no longer repeats the six index ids by hand; it
  compares against `set(skin_indices.INDEX_BY_ID)`, so the registry growing an eighth
  index fails here instead of being silently uncovered.

  **Research (자료조사) — CSS Logical Properties and Values Level 1, from the CSS Working
  Group's own source.** Asked because the fix above turns on whether `inset-inline-start`
  is defined to follow `direction`, and on what `text-align: start` computes to — the
  second one is not a detail, because this cycle's first draft of the test asserted the
  computed value would be `"right"` under RTL, and the spec says it is not.

  ```
  https://raw.githubusercontent.com/w3c/csswg-drafts/main/css-logical-1/Overview.bs
  http=200 bytes=39421
  sha256 9b4a85569bcacff752f797fb6214a9eb04fca7173b93a160bcf8a47e39ed2b41
  ```

  Two quotes carry the change. The module's own worked example is Arabic, and it is the
  exact substitution made here (lines 105-109):

  ```css
  blockquote {
      text-align: start; /* left in latin, right in arabic */
      margin-inline-start: 0px; /* margin-left in latin, margin-right in arabic */
      border-inline-start: 5px solid gray; /* border-left in latin, border-right in arabic */
      padding-inline-start: 5px; /* padding-left in latin, padding-right in arabic */
  }
  ```

  And on the inset properties (§ "Flow-Relative Offsets", lines 606-628): the propdef
  gives `Computed value: Same as corresponding 'top'/'right'/'bottom'/'left' properties`,
  and the prose says "These properties correspond to the 'top', 'bottom', 'left', and
  'right' properties. The mapping depends on the element's 'writing-mode', 'direction',
  and 'text-orientation'." That is what the browser measurement then confirmed:
  `getComputedStyle` on the sticky cell reads `left=0px right=auto` in `en` and
  `left=auto right=0px` in `ar`, from one declaration. `text-align` is the opposite case
  — its propdef says `Computed value: specified keyword`, so `start` stays `start` in
  both, which is why the spec assertion is on the keyword and not on a side.

  This is a primary source for the CSS, not for what any browser ships; only Chromium
  1194 at 360x800 was measured, and no other engine was.

  **What was NOT established.** Only `/report`, `/care` and `/checkin` were swept, at one
  viewport, in one engine, at one language per run — nothing here says anything about
  `/scan`, `/survey`, `/studio` or `/privacy` in a non-Korean locale, about a language
  switched mid-session, or about a real phone. The Korean-leak result is a statement
  about the strings this build can produce: the vision path (`mergeVisionAnalysis`) can
  put LLM text into a reading, and that text is not a dictionary key and was not
  exercised here. And the `melanin_index` rows pin one language against itself — they
  are a regression pin, not the parity the other six groups carry, and nothing in them
  makes the index right.

  *Validation on the final tree:* see the PR body for the literal output.

  **Supervisor review.** Sound. The claims audit held on everything checked. The one
  correction is a README sentence that contradicted `app/globals.css`.

  *Predicted by reading, before the branch existed.* Two things. First, the RTL arrow
  glyphs are already mirrored by `html[dir="rtl"] .aru-dir-arrow, .aru-flow-steps__arrow`,
  so cycle 33's `/care` arrow should flip correctly. Second, product cards show price only
  through `t(budgetBand(...))`, so a currency-format defect on them is unlikely. Neither
  prediction is contradicted: the worker found no arrow or currency defect. The two real
  RTL defects it found were ones I had not predicted, the physical `left` in the compare
  table's sticky column and in the routine lane.

  *Re-derived here.* A throwaway vitest over the four dictionaries gives `en: entries=911
  mismatches=0`, `ja: 907 / 0`, `zh: 907 / 0` and `ar: 911 / 0` for `{placeholder}`
  token sets. That is the worker's 3,636 entries and 0 mismatches exactly. The twelve
  `melanin_index` rows were recomputed from `100*log10(100/max(L*,1.0))` in a separate
  interpreter, and every value matches to the last digit.

  *Breaks re-run on the committed tree*, against `rtl-logical-inset.regression-18.spec.ts`
  under `-c playwright.mobile.config.ts`. Putting `stickyCol` back to `left: 0` gives
  `1 failed` / `3 passed`. Putting `RoutineHalf`'s three logical properties back to
  `paddingLeft` / `left` / `borderLeft` gives `1 failed` / `3 passed`. Both match the
  worker's table.

  *Corrected before merge — `README.md`.* The draft said RTL "is built on CSS logical
  properties … not on per-direction overrides". `app/globals.css:120-121` is exactly one
  such override: `html[dir="rtl"]` mirroring the two arrow classes with
  `transform: scaleX(-1)`. It is correct to have, because a glyph has no logical form, but
  the sentence denied it existed. The sentence now names it. Same class of miss as
  cycles 31-33: a claim about another file, made without grepping it.

  *Validation on the corrected tree:* see the PR body for the literal output.

- 2026-09-23 (cycle 33) — Branch `autopilot/2026-09-23-1839`. **The shape check cycle 32
  put on the survey was missing one key over, and this time the screen died during render
  rather than in an effect. Two of the four screens that read it turned out not to break
  at all, and that is written down with the inputs rather than guarded away. The harness
  every blemish number in this backlog rests on was failing on the clock, not on a number.
  And on `/care` the link that earns had less affordance than the clinic link that does
  not.**

  **Baselines, measured here on a clean tree at `a27b202` before any edit.** `node_modules`
  was absent, so `npm ci` first. `npx vitest run` **755 passed in 97 files**,
  `npx tsc --noEmit | grep -c "error TS"` **13**, `npx eslint .` **0 errors, 2 warnings**
  (the same `_reads` / `_result` at `lib/care.ts:70`), `python3 ml/selftest.py`
  **Ran 142 tests in 2.620s ... OK**, and `npm run smoke` with the chromium override at
  `/opt/pw-browsers/chromium-1194` printed **`Smoke test passed.`** They match the
  supervisor's.

  **Bug fix — `gyeol_reads`, and the two screens that did NOT need guarding.** Measured
  against the UNCHANGED code first, in Chromium at 360px, with a valid `gyeol_survey` in
  place so cycle 32's guard never fired:
  `tests/e2e/reads-shape.regression-17.spec.ts` under `playwright.mobile.config.ts`,
  **13 failed | 39 passed (52)**. Twelve wrong `gyeol_reads` shapes across `/report`,
  `/care` and `/studio`, six wrong `gyeol_scan` shapes across `/report` and `/survey`,
  and two mirror cases. What broke:

  | `gyeol_reads` holds | /report | /care | /studio |
  |---|---|---|---|
  | `5`, `"abcdef"`, `{}`, `true`, `[]`, string buckets | ✘ (6) | ✓ (6) | ✓ (6) |
  | an oil bucket and nothing else | ✘ | ✓ | **✘** |
  | everything but `overall` | ✘ | ✓ | **✘** |
  | `signals: [5]` | ✘ | ✓ | ✓ |
  | `extras: [5]`, `retakeReasons: [5]`, `source: "made-up"` | ✓ (3) | ✓ (3) | ✓ (3) |

  So **nine of the twelve took `/report`, two took `/studio`, and none took `/care`.**
  `/report` throws during RENDER, not inside the mount effect the survey bug lived in —
  `analysisRows` tests `reads` for truthiness and then indexes `reads.oil.value`, so `5`
  and `"abcdef"` sail through:

  ```
  TypeError: Cannot read properties of undefined (reading 'value')
      at Report (app/report/page.tsx:200:55)
  > 200 | ..."유분"), reads.oil, explain("oil", reads.oil.value)] as [string, { value: string; calm...
  ```

  Plus the two cases outside the loop: `/report` fell into `app/error.tsx` on a `reads: 5`
  already sitting in `localStorage["aru_last_result"]`, and it mirrored a wrong-shaped
  `reads` into that key on the way past, because `saveLastResult` runs before the render
  that throws — the same third read cycle 32 found for the survey.

  **What did not break is on record rather than guarded.** `/care` parses `reads` and
  hands it to `careSummary(survey, _reads, _result)`, which reads neither underscored
  parameter — those two are the baseline's two eslint warnings — so nothing on that page
  renders a field of `reads`, and **no `/care` reads guard was added**; the twelve rows
  above are the inputs tried. `gyeol_scan` is the same: **twelve cases, all green** —
  `5`, `"abcdef"`, `{}`, `true`, `[]` and `{"oil":"x","redness":0,"pores":0}` on both
  `/report` and `/survey`, so **no scan guard was added either**, which extends the
  supervisor's `recommend()` measurement to `loadScanHint`'s property reads and
  comparisons. `/studio`'s existing `scan?.oil?.value` test already rejects everything
  except a PARTIAL reading, which passes it and then throws at `scan.pores.value`.

  The guard is `isSkinReads` in `lib/last-result.ts`, at three reads (`/report`'s parse,
  `/studio`'s parse, `loadLastResult`). Structural only, the rule `isSurvey` set: `source`
  and `confidenceLabel` are checked for `typeof === "string"` and NOT for membership,
  because a reading whose source string this build no longer knows still renders
  (`SOURCE_LABEL[source]` is undefined and the chip comes out empty — measured, row 12).
  All four buckets are checked because `/report` renders all four; `signals` is checked
  element by element because `signalCheck` calls `signal.label.includes`; `extras` and
  `retakeReasons` get `Array.isArray` and no more, because their elements were measured
  not to break anything. It lives in `lib/last-result.ts` and not beside the type so that
  `/care` and `/studio`, which import `SkinReads` as a type only, do not pull
  `lib/skin.ts`'s 67,485 bytes into their client bundles for a shape check.
  `loadLastResult` DROPS a wrong-shaped `reads` and keeps the record rather than rejecting
  it: the survey is still good and the report still renders without a reading.
  With the guard the same spec is **52 passed**.

  *Break-the-line, three guards, three separate runs of the same 52-case spec:*

  | guard removed | result | what failed |
  |---|---|---|
  | `app/report/page.tsx` | **10 failed \| 42 passed** | the nine `/report` reads cases and the mirror check |
  | `app/studio/page.tsx` | **2 failed \| 50 passed** | the two partial-object `/studio` cases only |
  | `lib/last-result.ts` | **1 failed \| 51 passed** | the mirrored-copy case only |

  The third, run over all of `tests/` instead, is **3 failed | 781 passed (784)**: the two
  named cases in `tests/skin-reads-shape.test.ts` — `drops a wrong-shaped reads and still
  returns the survey` and `drops a partial reads that the old optional-chain test let
  through` — plus one unrelated timeout, which became this cycle's ML item.
  `docs/reads-shape-probe.md`.

  **Research (자료조사) — the new spread in `loadLastResult`, from the specification's own
  source.** Asked because the fix rebuilds a record as `{ ...record, reads: null }` from a
  `JSON.parse`d value, and because `isSkinReads` uses `Number.isFinite` on a field that
  arrives out of a device store.

  ```
  --- https://raw.githubusercontent.com/tc39/ecma262/main/spec.html
  http=200 bytes=3087902
  sha256 17e1fe359da75a82ae164014e1c862287cbe2ffdc8297d45bcf6068c007a69af
  ```

  **`Number.isFinite`** is "*If `number` is not a Number, return `false`*" before it is
  anything else, so a `confidence` arriving as the string `"0.82"` is rejected rather than
  coerced — the global `isFinite` accepts it. **PropertyDefinitionEvaluation** has a
  ParseJSON branch that sets `isProtoSetter` to `false`, so `"__proto__"` inside a stored
  JSON is an ordinary own data property and not a prototype assignment.
  **CopyDataProperties**, the operation object spread runs, ends each key with "*Perform !
  CreateDataPropertyOrThrow(`target`, `nextKey`, `propertyValue`)*" — CreateDataProperty
  and not Set, so copying that own key forward does not invoke the
  `Object.prototype.__proto__` setter either. Checked against the engine as well as the
  text, node v22.22.2: `prototype unchanged: true`, `spread prototype unchanged: true`,
  `({}).polluted after spread: undefined`, `Number.isFinite("0.82"): false` against
  `isFinite("0.82"): true`. Both are asserted in `tests/skin-reads-shape.test.ts`.
  *Not established:* anything about the round-trip beyond these three clauses.

  **ML — the harness every blemish number rests on was failing on the clock.**
  `tests/blemish-perturbation-tolerance.test.ts` is where both the plateau item and the
  `srgbLinear` item get their a* error and certified radius. Its case `measures the
  certified radius and the achieved one, at every frame size` declared no timeout, so it
  ran against vitest's 5000 ms default (`vitest.config.ts` sets no `testTimeout`). Wall
  time over eight verbose runs: **4844, 4845, 4864, 4880, 4908, 4962, 4989 and
  5039 ms**. It failed three times before the fix — one of a standalone batch of eight,
  the first attempt of a second standalone batch, and one full-suite run — The one failure whose output was captured is
  **`Error: Test timed out in 5000ms`**, raised on the `it(...)` line and not on an
  assertion; the other two were recorded only as a count and a name, so that holds for
  the captured one and is an inference for the other two — raising only the clock took
  the case to 10 of 10, which a flaky assertion would not do. No certified number was
  ever observed to differ. That case and `keeps its error under the noise bound
  every margin above is divided by` (3536 and 3675 ms, the next one at risk) now carry
  `{ timeout: 120_000 }`, the convention the same file's `{ timeout: 300_000 }` case and
  `tests/cheek-clipping-signal.test.ts:296` already use. **10 of 10 standalone runs green
  after.** One repo-wide verbose run reported exactly three cases at or above 2500 ms —
  those two and `cheek-clipping-signal`'s 6472 ms one, which already declared a timeout.
  It was chosen over the `[AI]` ML items in "Now" that were read
  for this cycle — the blemish-constant calibration and the ordinal floor need a labelled
  export, the 0.86 cap needs real vision confidences, the share-preview fork needs an
  owner call, and `srgbLinear` cannot land without moving `toneSpread`, which this cycle
  is forbidden to touch; the rest of the section was not read item by item — and because a certification harness that goes red on a slow machine is what makes the next
  cycle distrust its own evidence. *Not established:* why the case sits so close to
  5000 ms; nothing was profiled or made faster, and the sweep is one run on this
  container. The plateau item's product question is untouched.

  **UI/UX — on `/care` the link that earns had less affordance than the link that does
  not.** Found by running the app in Chromium at 360px and then grepping the style objects
  rather than reading the screenshot for them. A DOM sweep of `/`, `/report`, `/care` and
  `/checkin` in ko and en found **no horizontal overflow** (`scrollWidth 360` against
  `clientWidth 360` on all eight) and, in ko, **no interactive element under 44x44** on any
  of the four, so the defect is not layout. It is hierarchy: `app/care/page.tsx:255` `linkBtn`,
  the `/api/out` merchant button, is `background: "var(--paper)"` with `1px solid
  var(--line)` and no arrow, while `app/care/page.tsx:257` `clinicBtn` on the SAME page is
  the same `var(--paper)` box with the same `var(--line)` border and carries a
  `.aru-dir-arrow` `→` in `var(--plum)` at 18px. So the two rows are painted alike and the
  one with the go-signal is the clinic link, which earns nothing. (Grepped, not assumed:
  the filled `var(--plum)` / `var(--on-plum)` treatment is `product-card.tsx:111` and,
  since cycle 32, `report/page.tsx:548`; `/care` uses it on neither.) The fix gives the
  FIRST merchant link — `productSearchLinks` sorts by priority and that one is what shows
  while the list is collapsed — the same arrow `clinicBtn` uses, one per product card,
  laid out as `clinicBtn` lays it out (row, `space-between`). The alternates behind
  "다른 판매처 보기" keep the quieter box, so the hierarchy inside the card still reads, and
  no new colour was introduced. *Break-the-line:* with the arrow removed, the new case in
  `tests/e2e/mobile-layout.spec.ts` fails **`ko: the primary merchant link has no
  go-arrow`** — `1 failed`. *Not established:* whether the arrow moves any click; there is
  no traffic to read, and `viralActivation` still has no baseline.

  **The new case went red once, in the first full smoke run, and the test was wrong rather
  than the page.** `Error: ko: no merchant button on /care ... Expected: > 0, Received: 0`:
  it counted the merchant buttons straight after `document.fonts.ready`, which does not
  wait for the mount effect that builds the picks, and the saved page snapshot shows the
  section header painted with the product rows not yet in it. The count now runs after an
  auto-waiting `toBeVisible()` on the first merchant button. Three consecutive runs of the
  whole file after the change: **7 passed** each time, and the break-the-line above was
  re-run against the corrected locator and still fails on the same message.

  *Validation on the final tree.* `npx vitest run` **786 passed in 98 files**,
  `npx tsc --noEmit | grep -c "error TS"` **13** (unchanged), `npx eslint .` **0 errors,
  2 warnings** (the same two, run on its own), `python3 ml/selftest.py` **Ran 142 tests in
  2.495s ... OK**, and two consecutive `npm run smoke` runs with the chromium override,
  the second reporting vitest leg **786 passed (98 files)**, Playwright leg **156 passed
  (7.7m)**, then **`Smoke test passed.`** The e2e count moves 103 → 156: the 52-case
  `reads-shape.regression-17` spec plus the one new `mobile-layout` case. The 103 is the
  supervisor's figure, not one measured here — the baseline smoke run's per-leg counts
  were not captured.

  *Rotation.* AUTOPILOT 1688 → 1744 and the changelog 6618 → 6781, cycle 30's 162 lines
  moved verbatim to the end of the changelog. `sort -u` over both files before and after
  and `comm -23` old against new finds **0 lines missing**. "Recent cycles" holds 33/32/31.
  `README.md` is unchanged: cycle 32's probe doc is not listed there either, so
  `docs/reads-shape-probe.md` follows it.

  *Scope held.* `lib/skin.ts`, `lib/consent.ts`, `public/models/visible-attributes/manifest.json`
  and `shareUrl` are untouched; `blemishCount` and `toneSpread` report exactly what they
  reported; `NEXT_PUBLIC_FUNNEL_FLUSH` is still unset everywhere; no dependency added.

  **Supervisor review.** Sound, and the claims audit the brief asked for held up: one
  count in the probe doc was stale, and nothing went past its own table this time.

  *Predicted before the branch existed, then checked.* A throwaway vitest on `a27b202`
  gave `recommend(survey, scan)` the same `picks=3 top=sr1` for a valid scan, `null`, and
  seven wrong shapes (`5`, `{}`, `"abc"`, `[]`, `true`, `{oil:"x",...}`, `{oil:null,...}`),
  so the brief told the worker not to guard scan on a crash claim. Reading `/report`
  then predicted three things without running them: a render-time throw at
  `reads.oil.value`, the mirror into `aru_last_result`, and `[]` throwing too. All three are
  in the worker's measured table, and no scan guard was added.

  *Reproduced.* With the four app files put back to `a27b202` and the new spec kept,
  `reads-shape.regression-17.spec.ts` under `-c playwright.mobile.config.ts` gives
  `13 failed` / `39 passed (3.3m)`, the worker's pre-fix figure exactly. Against its
  table, that is nine `/report` rows, two `/studio` rows and the two `aru_last_result`
  cases outside the loop.

  *Guards broken at their source lines against `tests/skin-reads-shape.test.ts`:*
  - Dropping `reads.signals.every(isConfidenceSignal)` → `2 failed | 29 passed (31)`,
    both named "signals".
  - Dropping `isBucket(reads.overall)` → `1 failed | 30 passed (31)`, "rejects a missing
    overall bucket".
  - Replacing `loadLastResult`'s ternary with `return parsed as LastResult;` →
    `3 failed | 28 passed (31)`. The probe doc said two; the third is the `__proto__`
    case, whose first assertion is that a stored `reads: 5` comes back `null`.
    Corrected in `docs/reads-shape-probe.md`. The entry above is right for the run it
    reports (784 tests, before that case existed).

  *Could the guard reject a real reading?* Every field `isSkinReads` requires is
  non-optional in the `SkinReads` type, and each one (`signals`, `source`,
  `retakeRecommended`, `retakeReasons`, `confidenceLabel`, `headline`, `Bucket.level`) was
  first added in `c991886` (2026-07-10). `lib/last-result.ts` did not exist until
  `7419b54` (2026-07-16), so no stored `aru_last_result` predates those fields, and
  "accepts the reading analyzeSkin produces" covers a live reading.

  *The two timeouts.* This is not a weakened test: only the clock moved, and the
  assertions are unchanged. On this container the two cases ran in 2807ms and 1937ms. The
  worker's 4844-5039ms is its own machine under load, so "failing on the clock" is
  container-dependent rather than a property of the code.

  *UI.* The `/care` arrow change was read, not measured here. It adds `primaryLinkBtn`,
  a new layout on the existing `linkBtn` box, and reuses the `--plum` arrow that
  `clinicBtn` rows already carry. No new colour, and the claim in its comment was checked
  against the file.

  *Validation on the corrected tree:* see the PR body for the literal output.

- 2026-09-23 (cycle 32) — Branch `autopilot/2026-09-23-1239`. **A malformed survey took
  both revenue screens, and `/report` wrote it to disk on the way past so the next tab
  session was born broken. `/api/out` was hunted for an open redirect and does not have
  one, which is now written down with the inputs that were tried. The last unreproduced
  retake row is answered: 71/120 is arithmetically out of reach of the splits that row
  has. And on `/report`'s commerce row the only link that can earn anything was the pale
  one.**

  **Baselines, measured here on a clean tree at `82fd93a` before any edit; they match the
  supervisor's.** `node_modules` was absent, so `npm ci` first. `npx vitest run`
  **704 passed in 96 files**, `npx tsc --noEmit | grep -c "error TS"` **13**,
  `npx eslint .` **0 errors, 2 warnings** (the same `_reads` / `_result` at
  `lib/care.ts:70`), `python3 ml/selftest.py` **Ran 142 tests in 1.795s ... OK**, and
  `npm run smoke` with the chromium override at `/opt/pw-browsers/chromium-1194`:
  vitest leg **704 passed (96 files)**, Playwright leg **86 passed (4.5m)**, then
  **`Smoke test passed.`** That baseline smoke run is not clean and is not claimed to
  be: it takes about eleven minutes here and its Playwright leg was still running when
  the first edits landed, so the specs after roughly [33/86] ran against a dev server
  that had hot-reloaded them. Its vitest leg had already completed on the untouched
  tree, and Playwright collects spec files at startup, so the 86 is the baseline suite
  and does not include this cycle's new spec. The authoritative run is the final one
  below.

  **Bug fix — one shape check at three reads, on the path a paying click travels.** The
  failure was measured against the UNCHANGED code first, and in a browser. `/report` and
  `/care` each restore the report from `sessionStorage["gyeol_survey"]` inside
  `try { JSON.parse } catch { return null }` and hand the result to `recommend()`, which
  indexes `survey.concerns`, `survey.avoid`, `survey.budget`, `survey.type` and
  `survey.category` without checking one of them. The catch covers the parse and nothing
  else. What each wrong shape does, printed from `recommend()` itself:

  ```
  null                   -> THREW Cannot read properties of null (reading 'concerns')
  a number               -> THREW Cannot read properties of undefined (reading 'includes')
  a string               -> THREW Cannot read properties of undefined (reading 'includes')
  an empty object        -> THREW Cannot read properties of undefined (reading 'includes')
  a boolean              -> THREW Cannot read properties of undefined (reading 'includes')
  an array               -> THREW Cannot read properties of undefined (reading 'includes')
  no avoid list          -> THREW Cannot read properties of undefined (reading 'every')
  no concerns list       -> THREW Cannot read properties of undefined (reading 'includes')
  concerns is a string   -> OK picks=3 relaxed=null
  budget is a string     -> OK picks=3 relaxed=null
  budget is null         -> OK picks=3 relaxed=budget
  ```

  Eight throw, inside a mount effect, so `app/error.tsx` replaces the page — every
  `/api/out` link on `/report` and every merchant button on `/care` with it. The other
  three are the quieter half: a full three-pick report scored off fields `recommend()`
  never read, with nothing on screen to say so.

  **`/report` makes it outlive the tab.** `loadInitialView` calls
  `saveLastResult({ survey, scan, reads, ts })` on the line BEFORE
  `recommend(survey, scan)`, so the bad value reaches
  `localStorage["aru_last_result"]` and then `loadLastResult` — whose check was
  `parsed.survey`, a truthiness test that `5`, `"abcdef"` and `{}` all pass — feeds it
  back to both pages on every future visit. That is the third read, and it is why the fix
  is three lines and not one.

  *Reproduced in Chromium against `82fd93a` with only the new specs added* (the four
  source files stashed), `tests/e2e/commerce-survey-shape.regression-16.spec.ts` under
  `playwright.mobile.config.ts`: **17 failed, 0 passed**. Five of the messages:

  ```
  1) /report survives a survey store holding null
     Error: /report fell into app/error.tsx on null
     Locator:  getByText('앗, 잠깐 멈췄어요')  Expected: 0  Received: 1
  2) /care still offers its merchant path when the survey store holds null
     Error: /care fell into app/error.tsx on null
  3) /report survives a survey store holding a survey whose concerns is a string
     Error: /report fell into app/error.tsx on a survey whose concerns is a string
  4) /care still offers its merchant path when the survey store holds a survey whose concerns is a string
     Error: /care showed neither its picks nor its empty state on a survey whose concerns is a string
  5) /care survives the mirrored copy a broken /report left in localStorage
     Error: /care fell into app/error.tsx on a mirrored bad survey
  ```

  Case 3 is worth reading twice: `recommend()` does NOT throw on a concerns string, and
  `/report` still died — `"모공".filter` is undefined in the second effect, the one that
  asks `/api/reason` for the product copy. Case 4 is the same input on `/care`, which
  does not have that effect and so rendered a report instead. With the guard, the same
  spec is **17 passed (19.0s)**: `/report` reaches the `/survey` redirect it already had,
  `/care` its own empty state, and the mirror is never written.

  The guard is `isSurvey` in `lib/recommend.ts`, structural only. It checks the five
  fields for the shape the code indexes with and NOT for membership of `SkinType` /
  `Concern` / `Category`, because a survey naming a category this build no longer ships
  is still a usable survey — `recommend()` returns zero picks and `/report` renders its
  no-picks branch — while an enum check would bounce that user to the survey for nothing.
  Both cases are asserted in `tests/survey-shape.test.ts`.

  *Break-the-line, three guards, three separate runs:*

  | guard removed | result | what failed |
  |---|---|---|
  | `app/report/page.tsx` `isSurvey` | **8 failed \| 9 passed (17)** | the eight `/report` cases only |
  | `app/care/page.tsx` `isSurvey` | **8 failed \| 9 passed (17)** | the eight `/care` cases only |
  | `lib/last-result.ts` `isSurvey`, back to the truthiness test | **10 failed \| 743 passed (753)** over all of `tests/` | the ten "reads as no saved result when its survey is …" cases |

  The last one leaves `null` green, because `null` is falsy and the old truthiness check
  already caught it — which is exactly the case that made the old check look adequate.

  **Nothing was found in `/api/out` itself, and that is recorded rather than left for
  the next cycle to re-hunt.** `isAllowedCommerceUrl` is `new URL(value)` then
  `protocol === "https:"` and `ALLOWED_HOSTS.has(url.hostname)`. Thirty inputs were
  run against that predicate in node v22.22.2 — userinfo `@`, backslash before `@`,
  trailing dot, ideographic full stop, Cyrillic look-alikes, protocol-relative,
  `javascript:`, `data:`, tab and newline in the host, an IPv6-shaped host, a port, a
  fullwidth `ｗ`, mixed case. **Every ALLOW resolved to a hostname genuinely on the
  list.** Three ALLOWs are worth knowing and none is a redirect elsewhere: a fullwidth
  `ｗ` normalises INTO `www.google.com`, `user:pass@www.google.com` keeps credentials in
  the `Location` header, and `www.coupang.com:8443` passes because the check reads
  `hostname` and not `host` — all three reachable only from
  `COMMERCE_LINK_OVERRIDES_JSON`, a server env var, never from a request. `placement` is
  the one user-controlled value that reaches the target URL, and
  `URLSearchParams.set` percent-encodes it: `"a\r\nSet-Cookie: x=1"` serialises to
  `utm_content=a%0D%0ASet-Cookie%3A+x%3D1_sku_merchant`. No CRLF, no extra parameter.
  `docs/commerce-out-allowlist-probe.md`.

  **Research (자료조사) — why the backslash case goes the SAFE way, from the standard's
  own source.** Asked because `https://www.oliveyoung.co.kr@evil.example/` is blocked
  while `https://www.oliveyoung.co.kr\@evil.example/` is allowed, and a predicate that is
  only accidentally right is one line from being wrong.

  ```
  --- https://raw.githubusercontent.com/whatwg/url/main/url.bs
  http=200 bytes=166059
  sha256 eb85ab4551eec91ca0f28367ff81eabed020cebac87f98eaac7ecbba629fa5d1
  ```

  **host state** ends the host at a backslash when the scheme is special, and `https` is
  special: "*`c` is the EOF code point, U+002F (/), U+003F (?), or U+0023 (#)* … *`url`
  is special and `c` is U+005C (\\)*". So the backslash terminates the host before the
  `@` is ever read and `@evil.example` is path. **authority state**, which runs before
  host state, is where `@` ends the userinfo: "*If `c` is U+0040 (@), then:*". Both
  outcomes are the safe one for an exact-match allowlist, and both are properties of the
  parser rather than of ARU's code — which is why the check is written against
  `url.hostname` and never against the string.

  **ML — 조명 dark + oil, the row cycle 31 left open, is answered as far as this
  construction can answer it.** It is the one 조명 row that is NOT pinned
  (degraded split `0:82 1:38`), so cycle 31's identity does not reach it and its 21/120
  against cycle 11's written 71/120 was unexplained.
  `ARU_PRINT_RETAKE_OIL=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
  2x2 over the 120 seeds at the committed construction:

  ```
  OIL contingency tuneSeed=1 cheekL=60	c00=82 c01=21 c10=0 c11=17
  ```

  **The clean-1 / degraded-0 cell is empty.** No seed that reads level 1 on the clean
  capture drops to 0 when darkened, so the count is not two splits colliding — it is
  exactly the difference of the marginals, `38 - 17 = 21`, which is the number the sweep
  reports. **That bounds it, and 71 is outside the bound.** With `a` clean and `b`
  degraded level-1 seeds over the same 120, disagreements are `c01 + c10` with
  `c01 <= min(120 - a, b)` and `c10 <= min(a, 120 - b)`, so at `a = 17, b = 38` the most
  any rearrangement can reach is **55**. A different noise field cannot produce 71 from
  these splits; a different fixture, cut point or analyzer is required. Two sweeps say
  the row behaves like a real per-seed measurement and not like a pinned one:

  ```
  OIL tuneSeed	clean level-1	degraded level-1	disagreements
  OIL 1	17	38	21/120
  OIL 2	65	65	12/120
  OIL 3	87	76	13/120
  OIL 5	63	65	12/120
  OIL 8	89	79	12/120
  OIL 13	8	24	16/120
  OIL 21	34	49	17/120
  OIL 34	101	83	18/120
  OIL cheekL	clean level-1	degraded level-1	disagreements
  OIL 40	17	43	26/120
  OIL 50	17	41	24/120
  OIL 60	17	38	21/120
  OIL 70	17	34	17/120
  OIL 80	17	31	16/120
  OIL 90	17	31	14/120
  OIL 100	17	32	15/120
  OIL 120	17	24	9/120
  ```

  Re-seeding `tuned()`'s bisection swings the CLEAN split from 17 to 101 level-1 seeds
  while the count stays between **12 and 21**; in a pinned row the count IS the clean
  split and would have swung with it. Darkening the capture moves the count from **9** at
  cheekL 120 to **26** at cheekL 40 — the trend runs with the darkness, and the single
  exception, 14 at cheekL 90 against 15 at cheekL 100, is named here rather than smoothed
  out of the sentence. *Measured:* every
  number above, and the 55, which is arithmetic on the measured marginals. *Inferred:*
  that cycle 11's 71 came from a different construction rather than a different seed.
  The bound rules out every arrangement at tuning seed 1 but **not** a different tuning
  seed — computed from the tuning-seed table it is 110, 77, 112, 72 and 83 at seeds 2, 3,
  5, 8 and 21 — so what argues against the seed is the measured 12-21, not the bound
  (supervisor correction at review; the draft said "the bound rules out the seed"). *Not
  established:* which of fixture, cut point or analyzer changed, and whether some
  construction not tried here reaches 71; both need cycle 11's fixture, which was never
  committed. The contingency and the bound are asserted, not only printed, so a
  construction change fails a named test instead of quietly re-opening the question.
  `docs/retake-sweep-what-it-measures.md`. Nothing here touches a real face; that needs
  the golden set, which is in BLOCKERS.

  **UI/UX — on `/report`'s commerce row the paying link was the pale one.** Found by
  running the app in Chromium at 360px and reading the two style objects behind the row.
  `buyBtn`, which is the `/api/out` link and the only thing on that page that can earn
  anything, was `background: var(--surface-tint)` on `flex: 1`; `commerceCareBtn`, an
  internal navigation to `/care`, was `var(--plum)` on `var(--on-plum)` at `flex: 1.3`.
  So the money link was both the quieter of the two and the narrower, and in ko
  "올리브영에서 제품 보기" wrapped onto two lines inside the smaller box while
  "제품과 상담 정보 보기" sat on one line in the filled one. The product cards' merchant
  CTA on the same page (`app/components/product-card.tsx` line 111) is already the filled
  treatment, so this row was out of step with it. (Supervisor correction at review: the
  draft also said both of `/care`'s merchant buttons were filled; `/care`'s `linkBtn` is
  `background: "var(--paper)"` with a line border.) The two
  treatments are swapped. The existing case in `tests/e2e/mobile-layout.spec.ts` checked
  that both CTAs were tappable and legible and passed throughout, in all five locales,
  which is how the defect survived; it now also checks that the out-link is painted like
  the product cards' CTA (read off one of them on the same step rather than hard-coded)
  and is not narrower than the `/care` link. *Break-the-line:* with the two style objects
  put back, that case fails **`ko: the out-link is not painted like the product cards'
  CTA`** — `1 failed`.

  *Verification, final tree.* `npx vitest run` **755 passed (97 files)**,
  `npx tsc --noEmit | grep -c "error TS"` **13** (unchanged), `npx eslint .` **0 errors,
  2 warnings** (the same two), `python3 ml/selftest.py` **Ran 142 tests in 1.670s ...
  OK**. `npm run smoke` was run twice with the chromium override, once on the final CODE tree
  and once on the exact tree that was pushed, after the last Markdown edit; the two trees
  differ only in Markdown. Both runs: vitest leg **755 passed (97 files)**, Playwright
  leg **103 passed** (4.5m and 4.6m), then the literal line **`Smoke test passed.`**
  No dependency added. `lib/skin.ts`, `lib/consent.ts`, the manifest, `shareUrl`,
  `blemishCount`, `toneSpread` and `NEXT_PUBLIC_FUNNEL_FLUSH` are untouched, and
  `README.md` is unchanged because nothing a reader of it would care about moved.

  *Rotation.* AUTOPILOT.md 1529 → 1642 and the changelog 6462 → 6618; cycle 29's entry
  moved verbatim (155 lines) to the end of the changelog's entries, which is where cycles
  28, 27 and 26 went. Byte-identical rather than asserted to be: `sha256sum` on the
  extracted block before and after both give
  `2ac97979b868d22788e827da6008f06e4bcb6788db0c8899d71fdd750b22394e`. Taking all lines of
  both files at `82fd93a`, `sort -u`, and `comm -23` against the new pair finds **0 lines
  missing** — every edit this cycle made to those two files is an insertion, and
  `Last updated:` already read 2026-09-23. "Recent cycles" holds 32/31/30.

  **Supervisor review.** The survey fix and the `/api/out` negative result are sound; the
  ML addition overstated what its bound rules out and was corrected before merge.

  *`/api/out`, predicted before the branch existed.* Reading the route while the worker
  ran, the only request-controlled value that reaches the redirect is `placement`, since
  `sku` and `merchant` are resolved against `SKUS` before any URL is built, and the
  host check is an exact-match `Set` on `url.hostname`. So an open redirect was not
  expected and none was found. The twelve quoted inputs were re-run here against the
  same predicate and every verdict and hostname matched; `url.bs` re-fetched as
  `http=200 bytes=166059` with the same sha256, and the special-scheme backslash clause
  is in it. One thing the supervisor raised and then found already handled: a 쿠팡
  파트너스 short link on `link.coupang.com` is not on `ALLOWED_HOSTS`, but
  `docs/commerce-partnership-playbook.md` already lists it as unverified and an earlier
  cycle made that rejection loud. Not new.

  *Survey guard.* In a browser, under `-c playwright.mobile.config.ts`, with all three
  reads unguarded (both pages' `isSurvey` line and `loadLastResult` back to its
  truthiness check), `commerce-survey-shape.regression-16.spec.ts` gives `17 failed`,
  each at the `app/error.tsx` assertion, which is the defect. Guards broken one at a time
  against `tests/survey-shape.test.ts`: removing `Number.isFinite(survey.budget)` gives
  `4 failed | 45 passed (49)`, all four named "budget". Removing the `Array.isArray`
  clause gives `49 passed (49)`. That clause is redundant, because an array fails the field
  checks that follow, so it is harmless and nothing depends on it. `budget` has been a
  `number` since `lib/recommend.ts` was first committed (`7419b54`), so the new check
  cannot reject a survey an older build saved.

  *Corrected before merge.* The contingency and both sweeps reproduced exactly here
  (`Tests 14 passed (14)`, every OIL line identical). The bound is right at tuning
  seed 1: `min(103,38) + min(17,82) = 55`. But the draft's "Inferred" line said "the bound
  rules out the seed", and the same bound from its own tuning-seed table is 110, 77, 112,
  72 and 83 at seeds 2, 3, 5, 8 and 21. So 71 is arithmetically reachable at five of
  the eight, and what argues against a different tuning seed is the measured count
  (12-21 everywhere), not the bound. The headline and both "Inferred" lines now say that.
  This is the second cycle running in which the prose went one step past its own table.

  *UI.* The swap of `buyBtn` and `commerceCareBtn` treatments was read, not measured
  here. The draft's claim that every other merchant CTA is already `--plum` holds for
  `product-card.tsx` line 111 and is false for `/care`, whose `linkBtn` is
  `var(--paper)` outlined; the code comment, the test comment and the entry above are
  corrected to say only what holds. The style change itself is unaffected. Smoke covers the added `mobile-layout.spec.ts` case.

  *Validation on the corrected tree:* see the PR body for the literal output.
