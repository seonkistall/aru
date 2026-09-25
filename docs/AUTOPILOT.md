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
  **2026-09-24, cycle 35: the OTHER half of the pair — what the two arguments are — is
  now in the Python function and asserted.** The third difference cycle 17 measured
  ("the app's inputs are each region's high-frequency energy divided by that region's
  own mean L\*") lived only in a selftest docstring; `ml/skin_indices.py`'s own
  docstring, which is what a Python caller reads, still said "Texture energy against a
  smooth reference region." It does not cancel: the app's form equals the raw-energy
  ratio times `foreheadL/cheekL`, and over the **12** distinct positive
  `(tzoneL, cheekL)` pairs `ml/index-parity.json` commits under `shine_ratio` that
  factor runs **0.7142857142857143 to 1.5**, i.e. **-28.6% to +50%**. The identity's
  worst relative residual over those 12 pairs by 4 energy pairs is **2.27e-16**.
  `selftest.test_roughness_ratio_inputs_are_l_star_normalised` asserts the arithmetic
  and the docstring's own phrases (142 → 143 tests). `lib/skin.ts` is untouched and no
  published value moved. **Which side moves is still undecided and still needs faces**
  — that is unchanged, and this cycle did not touch either guard.
  **2026-09-24, cycle 37: a THIRD instance of the same class, in blemish density, is now
  measured and pinned.** Not this item's pair and recorded as an extension of it, because
  it is the same defect class in the same two artifacts. `detectBlemishes` returns
  `{ count: 0, areaFace: 0 }` for `faceW < 20` (`lib/skin.ts:965`); `blemish_density`
  clamps at `max(face_width_px ** 2, 1e-6)` (`ml/skin_indices.py:350`), which bites only
  at zero. At a 19.999px face box the app publishes **0** against Python's
  **23.99760006**, at 10px **0** against **6.0**, and at 20px both read **24.0**. It was
  invisible because the app column in `tests/index-parity.test.ts` modelled the guard as
  `faceWidthPx > 0`, which is not what `lib/skin.ts:965` says and which agrees with
  Python inside the band. A `guardDivergence` block with **5** rows now sits under the
  `blemish_count` group (**49 insertions, 0 deletions** to `ml/index-parity.json`), each
  language asserting its own column; `ml/selftest.py` goes **144 → 145** tests. Which
  guard is right is the same kind of question this item's pair asks and needs the same
  real captures, so nothing was changed: `lib/skin.ts` is untouched and what
  `blemishCount` / `blemishDensity` reports did not move.
  **2026-09-25, cycle 40: a FOURTH instance, in the shine denominator, and the first that
  is not a band.** `denominator = cheek_luminance if cheek_luminance else 1.0`
  (`ml/skin_indices.py`) and `cheekL || 1` (`lib/skin.ts:740`) agree on **0.0**, on
  **-0.0** and on every sub-epsilon positive value — both give **1490196077.7862747** at
  a cheek of **1e-7** — and disagree only on NaN, which Python treats as truthy and
  JavaScript as falsy: Python returns `tzone_specular` (**0.1** on the probe pair) and the
  app returns **NaN**. Unlike the first three it is **not reachable from a capture today**
  and that is measured: `sampleRegion` returns null when `collected.length === 0` and
  otherwise divides by `kept`, which is `sorted.slice(...)` only when the trim would leave
  at least 20 and `sorted` itself otherwise, so `kept` is never empty. Both sides pinned,
  neither changed: `ml/selftest.py` goes **145 → 146** tests and
  `tests/shine-guard-nonfinite.test.ts` is **3 passed**. Which side is right is undecided,
  the same as the other three.
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
  **2026-09-25, cycle 39: the "must move in BOTH files" half now has a guard, and the
  premise it was written on was wrong.** Measured before writing anything: moving the
  knee in `lib/skin.ts` alone already fails `tests/index-parity.test.ts` (2 of 12),
  moving it in `ml/ita.py` alone already fails `python3 ml/selftest.py` (failures=1),
  and changing the 1.055 scale in `ml/ita.py` alone fails selftest (failures=3) while
  index-parity stays 12 passed. So no move ships silently, which is not what this item
  implied. What neither guard does is compare the two implementations to each other:
  both check ONE language against `ml/index-parity.json`, a committed artifact, in two
  different runners. `tests/srgb-knee-parity.test.ts` (8 passed) reads the four
  constants out of both sources and requires them to agree, and re-derives cycle 22's
  numbers from a run rather than a sentence: colour-science's breakpoint
  0.040449936 from 12.92 * 0.0031308, ARU's distance 6.40000000010077e-8, the knee
  discontinuity 2.32950731317641e-9, and 0 of 256 integer channels in the window.
  **Stays open**: where the knee BELONGS still needs IEC 61966-2-1, which this network
  cannot reach, and nothing here moved a constant.
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
  **2026-09-25, cycle 38: the cap was also standing in for input validation, and that
  half is now separated out.** `mergeVisionAnalysis` clamped each vision confidence to
  `[0,1]` where it read the per-attribute value and NOT where it summed the mean that
  becomes `next.confidence`, while `/api/analyze`'s `readConfidence` clamps before the
  payload ever leaves the route — so the same payload published two different numbers.
  `{oil: 2, redness: 0, pores: 0}` read **0.600000 / 보통 / retake false** through the
  function and **0.300000 / 낮음 / retake true** through the route; `{oil: -2, redness:
  1, pores: 1}` diverged the other way, **0.200000** against **0.600000**. It was
  invisible because the cap saturates from a mean of 0.95555… up, so the obvious
  adversarial payloads (everything at 5, everything at 1) read 0.860000 on both paths.
  One clamp, applied once before the value is used, and both columns now read the
  route's number; the production path is unchanged because the route already clamped.
  Table, breaks and what is still undecided: `docs/vision-confidence-clamp.md`. **The
  item stays open**: where the cap belongs relative to the gate is the same unanswered
  question, and it still needs real readings.
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
- [~] [AI] **The RTL sweep covered three screens; six more have never been measured under
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
  **2026-09-24, cycle 36: this note is closed, with one correction to the reading that
  closed it.** Re-checked here rather than taken on report. The LLM `narrative` is
  filtered server-side — `app/api/analyze/route.ts:84` is
  `typeof payload.narrative === "string" && efficacyClean(payload.narrative).ok ?
  payload.narrative : ""`, so an unclean narrative becomes the empty string before it
  ever reaches a reading. It is rendered only through `localizedNarrative`
  (`lib/skin.ts:689-693`), whose first line is
  `if (getLang() === "ko" && reads.narrative && /[가-힣]/.test(reads.narrative)) return
  reads.narrative;` — so the stored sentence is returned only under `ko`, and every
  other language falls through to the template rebuilt from the bucket levels through
  `t()`. **The correction:** that path has TWO render sites, not one.
  `grep -rn "\.narrative" app/ --include=*.tsx` returns exactly one line,
  `app/report/page.tsx:245`, but `app/scan/result-card.tsx:93` calls
  `localizedNarrative(reads)` with the whole reading and so renders it too. Both go
  through the same gate, so the conclusion holds on both; "only on /report" did not.
  **2026-09-24, cycle 35: the six screens are measured and the item is now `[~]` for
  the two blocks a camera-less container cannot reach.** All six rendered under `en`,
  `ja`, `zh` and `ar` at 360x800 — 24 renders, **0 Korean characters**, **0
  un-interpolated `{placeholders}`**, `scrollWidth === clientWidth === 360` on every
  one. Five physical-keyword defects found and fixed, pinned by
  `tests/e2e/rtl-logical-inset.regression-19.spec.ts`; full measurement in
  `docs/rtl-sweep-part-two.md`. **What is still not measured, and was NOT changed on
  reasoning alone:** `app/scan/scan-controls.tsx:111` (`privacyPill`'s
  `textAlign: "right"`) and `app/scan/info-sheet.tsx:22` (a `<ul>` whose
  list indent is set with the physical `paddingLeft: 18`). Both render only at
  `phase === "ready"`, which needs a camera. A run with Chromium's fake-media-stream
  flags, or a phone, would settle them; grepping did not. Also still open and outside
  this cycle's six screens: `app/report/page.tsx:293`'s `textAlign: "right"`, which
  cycle 34's sweep of `/report` did not touch. And mid-session language switching and
  a real phone remain unmeasured on all nine screens.
- [AI] **The English dictionary is still in every visitor's first load, and only a URL
  decision gets it out.** Opened 2026-09-25 (cycle 40), which moved ja/zh/ar behind a
  dynamic `import()` and cut `/`'s initial JS from **1050358** to **783030** bytes raw
  (**322373** to **240097** gzipped). English could not follow: `getServerSnapshot()` in
  `lib/i18n.tsx` returns `"en"`, so the server HTML is English and the hydration render
  has to produce the same text — a lazy EN would paint Korean message ids against English
  markup. So a Korean visitor still downloads **82434** bytes raw / **28343** gzipped of
  English they will never read. The fix is the same per-locale-URL decision the item
  below describes: once a route knows its language on the server, the server renders that
  language, the hydration render matches it, and every dictionary including English
  becomes per-locale. Nothing smaller works, and no cycle should invent the URL structure
  on its own. Also unmeasured and cheap to do: `/` is the only route whose initial JS was
  counted, before or after.

- [OWNER] **Apply to the affiliate programmes** — 쿠팡 파트너스 (self-serve, accepts a
  website or app URL as the channel), 올리브영 쇼핑 큐레이터 (in-app, 7%/3%), 네이버 쇼핑
  커넥트 (5–28%, confirm a web service counts as a channel). Until then every out-click
  earns $0. This is the single highest-leverage item on the whole list. The in-product
  disclosure is already shipped and waiting on `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`.
- [OWNER] AI-Hub 71645 data application (domestic applicant, account required).
- [OWNER] Golden set: 20–30 real photos with two-operator consensus labels, so the
  camera thresholds come from faces instead of from a synthetic frame.

- [OWNER] **Per-locale URLs, or ARU stays findable only in English.** Opened 2026-09-25
  (cycle 39) while adding the sitemap. Language is chosen client-side from
  `localStorage` on the SAME URLs: `/scan` is the Korean page, the English page, the
  Japanese page, the Chinese page and the Arabic page depending on what is in the
  visitor's browser. Metadata renders server-side before any locale is known, so every
  title and description in `lib/seo.ts` is English, and a Korean searcher — the product's
  actual market — has nothing to match. It is also why there is no `hreflang`: an
  alternate names a URL that serves a specific language and ARU has none to name, so
  writing one would invent a structure that does not exist. The fix is a routing
  decision, not a plumbing one: per-locale paths (`/ko/scan`) or a locale subdomain,
  each page rendered server-side in that language, each with its own canonical, and the
  switcher changed to navigate rather than re-render — across every page and every
  internal link. Costs and what it would take: §4 of
  [`docs/discovery-metadata.md`](discovery-metadata.md). Not attempted, and no cycle
  should invent the URL structure on its own.

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

- 2026-09-25 — **A cap on what the two LLM routes can be billed.** Cycle 38 closed the
  cross-site hole and tightened the payload check on `/api/analyze` and `/api/reason`,
  but nothing in this repository bounds the bill: `createRateLimiter` is an in-memory
  `Map` per running instance keyed on a header the caller sends, so it is 10 requests
  per key per minute per instance and a caller rotating `x-forwarded-for` gets a fresh
  bucket each time. In front of it the live Vercel Firewall rule recorded in
  `docs/qa/2026-07-17-post-deploy-security.md` (`Provider request budget`, client IP,
  20 requests per 60 seconds, verified 2026-07-17) is the better of the two layers and
  is still a rate per IP, not a budget. The cheapest real cap is the provider's own
  account spend limit —
  no code, no dependency, and it caps the bill rather than the rate — and it should be
  set the day a key is. The alternatives (a shared counter in KV/Upstash/Supabase, or a
  minted token) each add a paid service or a dependency, which a cycle may not do on its
  own. Costs and failure modes: §5 of `docs/llm-route-cost-exposure.md`. Also unknown,
  and recorded as unknown: how a deployed edge sets or strips `x-vercel-forwarded-for`
  and `x-forwarded-for`. `vercel.com/docs/headers/request-headers` returned `http=000`
  from this worker on 2026-09-25.
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

- 2026-09-24 — **Whether a POST to `/api/reengage/subscribe` may undo an unsubscribe.**
  Measured this cycle, not fixed: subscribe → unsubscribe → subscribe leaves the row
  `consent: true`, `revoked_at: null`, `retention_until: null`, and the runner mails it
  again once the new consent is two weeks old. There is no double opt-in, so any POST
  can do it to any address, and after the overwrite nothing in the table records that a
  withdrawal ever happened. Every repair is a consent decision the loop may not make —
  the four options, what each costs, and what has to be checked against the statute are
  in [`docs/reengage-resubscribe-consent-decision.md`](reengage-resubscribe-consent-decision.md).
  Reachable today; the mailing half waits on `RESEND_API_KEY`. Korean statutory text
  could not be fetched from this container (`law.go.kr` is not on the egress allowlist),
  so no PIPA or 정보통신망법 wording is quoted anywhere in that doc.

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

- 2026-09-25 (cycle 40) — Branch `autopilot/2026-09-25-1239`. **Every first-time visitor
  downloaded all four locale dictionaries and could read at most one of them. Measured on
  a production build: one chunk, `1e3h7wv-_iggr.js`, was **350267** bytes, of which
  **349333** were the four dictionaries, and `/` loaded it. Japanese, Chinese and Arabic
  are now a dynamic `import()` each and `/`'s initial JS drops from **1050358** to
  **783030** bytes raw, **322373** to **240097** gzipped. English stays static, and the
  reason is the hydration contract, not an oversight.**

  **Baselines, re-measured here on `382c59f` before any edit.** `node_modules` was
  absent, so `npm ci` first — `npm run build` reads `sh: 1: next: not found` and exits
  **127** without it. After: `npx vitest run` **Test Files 104 passed (104) / Tests 906
  passed (906)**, `npx tsc --noEmit | grep -c "error TS"` **13**, `npx eslint .` **0
  errors, 2 warnings** (the same `_reads` / `_result` at `lib/care.ts:70`), `python3
  ml/selftest.py` **Ran 145 tests in 2.625s ... OK**. They match the supervisor's. A
  baseline smoke was not run; only the post-change one below, which is green.

  **What `/` actually downloaded, on `npm run build` at `382c59f`.** Next.js 16.2.9 with
  Turbopack prints no first-load column, so the number was taken from the prerendered
  `.next/server/app/index.html`: **13** script files, **1050358** bytes raw, **322373**
  gzipped (each file gzipped at level 9 and summed). Grepping `.next/static/chunks` for
  one string out of each dictionary (`Turn camera back on`, `カメラをもう一度オンにする`,
  `重新打开摄像头`, `إعادة تشغيل الكاميرا`) put **all four in the same chunk**,
  `1e3h7wv-_iggr.js`, **350267** bytes raw / **110807** gzipped. Measured as byte spans
  from each dictionary's first value to its last: EN **81102** raw / **27538** gzip, JA
  **91405** / **29123**, ZH **76838** / **27072**, AR **99988** / **29483** — **349333**
  of the chunk's 350267 bytes. The source is **368003** bytes over the four files per
  `wc -c`. So the supervisor's read was right and the chunk is, to 99.7%, dictionaries.

  **The fix, and why English is not part of it.** `lib/i18n/core.ts` keeps `import { EN }`
  and moves JA/ZH/AR behind `loadDict(lang)`, one literal `import("./ja")` per case;
  `registerDict` fills a mutable registry and notifies subscribers; `t()` is untouched
  and still synchronous, still falling back to the Korean message id. English **cannot**
  be lazy without changing what the server renders: `getServerSnapshot()` in
  `lib/i18n.tsx` returns `"en"`, so the server HTML is English and the hydration render
  must produce the same text or it paints Korean source strings against English markup.
  That is the honest limit of this cycle — a Korean visitor still downloads the English
  dictionary, **82434** bytes raw / **28343** gzipped in its own chunk, and removing that
  needs the per-locale-URL decision already filed as `[OWNER]`.
  `LanguageProvider` renders `active = ready ? saved : "en"`, where `ready` comes from a
  second `useSyncExternalStore` over the dictionary registry, so the saved language
  appears only once its chunk has landed. `html[lang]`, `dir` and the remount `key` all
  follow `active`, not `saved`, so Arabic never paints Latin text in RTL. The picker
  reads a new `saved` field off the context so a tap registers before the chunk arrives.

  **After, on the same kind of build.** `/` loads **13** script files, **783030** bytes
  raw / **240097** gzipped — **-267328** raw and **-82276** gzip, both **-25.5%**. EN is
  its own chunk (**82434** / **28343**) and `/` loads it; JA (**91598** / **29315**), ZH
  (**77031** / **27238**) and AR (**100181** / **29636**) are three more chunks and `/`
  loads none of them.

  **Hydration was measured before and after, not reasoned about**, at 360x800 against
  `npx next start`, sampling the `<h1>` every animation frame from before the app's own
  scripts run, one fresh context per language. **Before**: no saved choice and `en` paint
  English and stay; `ko` goes English → Korean at **390.4ms**; `ja` English → English →
  Japanese at **385.8ms**; `zh` → Chinese at **398.5ms**; `ar` English → Arabic at
  **428.7ms**. **After**: the same language sequence in every case — `ko` at **422ms**,
  `ja` at **405.9ms**, `zh` at **401.8ms**, `ar` at **474.5ms**. No Korean frame anywhere,
  before or after; the first paint is English in all ten runs. What changed is **`ar`
  gained one intermediate English state** (the shape `ja` and `zh` already had) and the
  settle is later by **31.6ms** (ko), **20.1ms** (ja), **3.3ms** (zh) and **45.8ms** (ar)
  — on localhost, which is the weakest part of this measurement: a real network moves
  those numbers and this container cannot produce one.

  **Broken on purpose, three ways on the i18n change.** `tests/i18n-lazy-dict.test.ts` is
  **12 passed** and `tests/e2e/i18n-dictionary-split.regression-27.spec.ts` **10 passed**.
  Putting the four static imports back: **4 failed | 8 passed**. Collapsing the switch to
  one `import(./${lang})` with a template literal — the DRY refactor: **1 failed | 11 passed**, and *that one
  is the weaker-but-plausible case in both directions*, because building it measured
  **783878** bytes of initial JS against **783030**, i.e. **Turbopack 16.2.9 splits the
  template form too**. The literal paths are what Next.js's doc guarantees, not the only
  thing that works, and both the code comment and the test say so. Third: rendering the
  saved language without waiting for its dictionary (`active = saved`) gives **1 failed |
  11 passed** on the unit file and **3 failed | 7 passed** on the e2e — `ja`, `zh` and
  `ar` all fail "settles on its own language with no Korean on screen on the way", which
  is the per-frame sampler doing its job.

  **Research — Next.js's own docs from `raw.githubusercontent.com/vercel/next.js/canary`.**
  `docs/01-app/02-guides/lazy-loading.mdx` **http=200**, **10617** bytes, sha256
  `0a8f49a0cd5e2cff43d8e29b7aa4d1a75e3b0ccf6d98789bddcfb01d4a554d1b`; line 239: "In
  `import('path/to/component')`, the path must be explicitly written. It can't be a
  template string nor a variable." That sentence chose the switch over a template
  literal. `docs/01-app/03-api-reference/05-config/01-next-config-js/optimizePackageImports.mdx`
  **http=200**, **1384** bytes, sha256
  `c93fc1c9205326ccdcdbd47f1e7a9aaad2d070f3be4dd9d75331cc2a6359c7b1`, was read and
  **ruled out**: it "will only load the modules you are actually using" for packages that
  "export hundreds or thousands of modules", and each dictionary is one named export of
  one object, so it has nothing to prune. `docs/01-app/03-api-reference/06-cli/next.mdx`
  **http=200**, **25860** bytes, sha256
  `5be90c3fa7fee222265b3aedf6a84a37924c164c4c256f3251df3f4133cb6740`. `vercel.com` and
  `developer.mozilla.org` were not probed this cycle; they are recorded as refusing in
  the 2026-09-15 and 2026-09-25 blocker entries.

  **ML — a fourth instance of the epsilon-guard class, at the boundary the first three
  did not reach.** Chosen because it needs no labelled export and extends the
  `roughness_ratio` `[~]` item's own defect class, the way cycle 37's blemish-density
  instance did. `denominator = cheek_luminance if cheek_luminance else 1.0`
  (`ml/skin_indices.py`) and `cheekL || 1` (`lib/skin.ts:740`) agree on **0.0**, on
  **-0.0** and on every sub-epsilon positive value — at a cheek of **1e-7** both give
  **1490196077.7862747** — and part company on NaN, which is truthy in Python and falsy
  in JavaScript: Python returns `tzone_specular` (**0.1** on the probe pair) and the app
  returns **NaN**. Unlike the first three this is not a band, and it is **not reachable
  from a capture today**, which is measured rather than assumed: `sampleRegion` returns
  null when `collected.length === 0` and otherwise divides by `kept`, which is
  `sorted.slice(...)` only when the trim would leave at least 20 and `sorted` itself
  otherwise, so it is never empty. Both sides are pinned and neither is changed:
  `ml/selftest.py` goes **145 → 146** tests and `tests/shine-guard-nonfinite.test.ts` is
  **3 passed**. Broken two ways: swapping the Python `max`'s arguments to
  `max((tzone - cheek) / denominator, 0.0)` — a pure tidy-up to read — gives **FAILED
  (failures=1)**; giving the app the 1e-6 epsilon the other indices use gives **2 failed
  | 32 passed** across `tests/shine-guard-nonfinite.test.ts`,
  `tests/index-parity.test.ts` and `tests/skin-index-contract.test.ts`. **Which side is
  right is not decided here**, and the item stays open.

  **UI/UX — the landing header's tagline touched the wordmark in four of five locales.**
  Found at 360x800 on the production build, measuring painted glyph rects rather than
  boxes. `app/page.tsx`'s header reserved 118px for the fixed language pill and nothing
  else, so `justify-between` gave the tagline every remaining pixel and the two boxes
  abutted at exactly **0.0px** in `en`, `ja`, `zh` and `ar` (**53.1px** in `ko`, whose
  tagline fits on one line). The painted first line came within **1.7px** of the wordmark
  in `ar`, **4.4px** in `zh`, **10.3px** in `ja` and **29.9px** in `en`. The reservation
  is now **106px** with a **12px** `columnGap`, which keeps the tagline box at the same
  **155.3px** so nothing rewraps — header height stays **85px** (60 in `ko`) and the
  primary CTA does not move (`ctaTop` **536.8 / 612.2 / 628.4 / 579.8 / 602.2** before and
  after). Glyph gaps become **13.7 / 16.4 / 22.3 / 41.9 / 65.1** and the pill still clears
  the header text by **13.4px** at worst (`en`).
  `tests/e2e/landing-header-clearance.regression-28.spec.ts` is **5 passed**. Broken two
  ways: reverting to the reservation alone fails **all 5**, the first on the geometry
  floor at `worstGlyphGap=1.015625`; adding the gap *without* cutting the reservation —
  the obvious fix — also fails all 5, but **only on the 106px pin**: the geometry floor
  still passes, because that edit buys the clearance out of the tagline's own width
  instead of out of the reservation. That second one is caught by a constant, not by a
  measurement, and is worth saying plainly.

  *The primary CTA was checked and was not a defect.* It sits fully above the 800px fold
  in all five locales, bottom edge **611.3 / 686.7 / 702.9 / 654.3 / 676.7**, with
  `scrollWidth === clientWidth === 360` on every one. Recorded as none rather than
  invented.

  **What this does not establish.** No traffic number changed and none was measured;
  a smaller first load is a precondition for keeping a visitor, not evidence of one. All
  byte counts are from a local production build — what Vercel's edge serves, with its own
  compression, was not measured. The hydration timings are localhost, so the window in
  which a `ja`/`zh`/`ar` visitor sees English is longer in the field than the numbers
  above and by how much is unknown. The English dictionary is still in every visitor's
  first load and will be until ARU has per-locale URLs. And `/` is the only route whose
  initial JS was counted, before or after; the other routes import the same core and were
  not measured one by one.

  *Validation on this tree:* see the report for the literal output.

  *Supervisor review:* pending.

- 2026-09-25 (cycle 39) — Branch `autopilot/2026-09-25-0639`. **A search engine had no
  statement about ARU and no way to tell one page from another. `/robots.txt` and
  `/sitemap.xml` were both 404, and all nine reachable pages served one title and one
  description. Four pages now stand on their own with empty storage and are in a
  sitemap; the other eight say `noindex` and still describe themselves for a shared
  link. Which four was measured in a browser, not chosen.**

  **Baselines, measured here before any edit.** `node_modules` was absent, so `npm ci`
  first — with it missing, `npx tsc --noEmit | grep -c "error TS"` reads **2797** and
  `npx vitest run` cannot resolve `vite`, which is a missing install and not a red tree.
  After `npm ci`: `npx vitest run` **Test Files 102 passed (102) / Tests 860 passed
  (860)**, `npx tsc --noEmit | grep -c "error TS"` **13**, `npx eslint .` **0 errors, 2
  warnings** (the same `_reads` / `_result` at `lib/care.ts:70`), `python3 ml/selftest.py`
  **Ran 145 tests in 1.878s ... OK**. They match the supervisor's. **A baseline smoke on
  `c49d272` was not run** — only the post-change one below, which is green; so the
  claim here is that the tree is green after, not that it was re-verified green
  before.

  **What a crawler was actually served, measured against a production build**
  (`npm run build` then `npx next start -p 3199`), not read off the source.
  `/robots.txt`, `/sitemap.xml` and `/sitemap.txt` each returned
  **`http=404 ct=text/html; charset=utf-8 bytes=14021`**. `/`, `/scan`, `/survey`,
  `/report`, `/care`, `/checkin`, `/studio`, `/privacy` and `/unsubscribe` all returned
  **200** with the identical `<title>` `ARU | Find skincare for your skin today`, the
  identical description, **no** `<link rel="canonical">`, **no** `<meta name="robots">`
  and `og:url` `https://aru-beauty.vercel.app` on all nine. `/ops`, `/pilot` and `/eval`
  returned **404** — `proxy.ts` gates them and `internalAccessDecision` answers
  `not-found` without `INTERNAL_TOOLS_USER`/`INTERNAL_TOOLS_PASSWORD` — so their
  existing `noindex` tag was never reachable in that configuration. `og:image` was
  already absolute (`https://aru-beauty.vercel.app/og.png`) on all nine; that half was
  not broken.

  **Which pages deserve an index entry was measured, not decided.** A real Chromium at
  360x800 against the production build, a fresh context per page so localStorage is
  empty, which is exactly what a crawler arriving cold is. `/` **754** innerText chars,
  `/scan` **567**, `/survey` **713**, `/privacy` **1424** — those four stand on their
  own and are the four in the sitemap. `/report` **redirects to `/survey`**; `/care`
  renders **235** chars of "There's no report to continue from yet."; `/checkin`
  **289** of "No products in use have been logged yet"; `/studio` **406** of
  `PRESETS[0]`, the shipped placeholder card, because the real one is read from
  `sessionStorage` (`app/studio/page.tsx:49`) and a crawler has none;
  `/unsubscribe` **182** of "This link can't be used or has expired."
  `/reco` answers **307** and lands on `/survey` too, so it gets no route-table entry
  at all.

  **The fix, on Next.js's own metadata-route conventions.** One table, `SEO_ROUTES` in
  `lib/seo.ts`, is the single source for the sitemap, the canonicals and the
  index/noindex split; `app/robots.ts`, `app/sitemap.ts`, and a `layout.tsx` per route
  exporting `seoMetadata("/that-path")`. After, on the same build: `/robots.txt` is
  **`http=200 ct=text/plain bytes=91`** and `/sitemap.xml` **`http=200
  ct=application/xml bytes=346`** listing exactly those four `<loc>`s. Three decisions
  are worth the words. **The noindex pages are not `Disallow`ed** — a `Disallow` stops
  a crawler fetching the page, so it never reads the `noindex` tag it is meant to obey;
  only `/api/` is disallowed. **No `lastModified`**, which the Next.js example uses via
  `new Date()`: nothing here records when a page changed and a per-request stamp tells
  a crawler the whole site changed on every crawl. **`openGraph` and `twitter` are
  written out in full on every route**, because Next.js replaces a metadata field in a
  child segment rather than merging it — a layout setting only `openGraph.title` ships
  a page with no preview image at all, and that is break C below at **12 of 16** e2e
  cases. `metadataBase` is untouched and still `https://aru-beauty.vercel.app`.

  **No `hreflang`, and the reason is a URL-structure decision the loop may not make.**
  Language is chosen client-side from `localStorage` on the SAME URLs — there are no
  per-locale paths and no locale parameter, so there is no URL for an alternate to
  name. Writing one would invent a structure that does not exist. What it would take is
  per-locale paths or a subdomain, each page rendered server-side in that language,
  each with its own canonical, and the switcher changed to navigate rather than
  re-render — which is also the only thing that makes ARU findable in a Korean search
  rather than only an English one. Recorded as an owner decision in §4 of
  [`docs/discovery-metadata.md`](discovery-metadata.md) and as a backlog item, not
  attempted.

  **Broken on purpose, five ways, every count re-run on the committed tree.**
  `tests/seo-metadata.test.ts` is **38 passed** and
  `tests/e2e/discovery-metadata.regression-26.spec.ts` is **16 passed**. Deleting
  `app/robots.ts` and `app/sitemap.ts`: the unit file fails to load, e2e **2 failed /
  14 passed**. Sitemap lists every route instead of the indexable ones: **2 failed / 36
  passed** and **1 failed / 15 passed**. A route's `openGraph` carries only
  title/description/url: **1 failed / 37 passed** and **12 failed / 4 passed**.
  `robots.txt` also disallows the noindex paths: **2 failed / 36 passed** and **1
  failed / 15 passed**. `app/scan/layout.tsx` missing: **1 failed / 37 passed** and
  **2 failed / 14 passed**. The middle two are the weaker-but-plausible ones — list
  everything so a search engine finds it all, and disallow what you do not want indexed
  — and both are the obvious thing to do and both are wrong.

  **Research — Next.js's own documentation source, three files from `vercel/next.js` at
  `canary` via `raw.githubusercontent.com`.** `robots.mdx` **http=200**, **4780 bytes**,
  sha256 `e8003da970452a059001ea1817f82b7744059a00396fb99c2be68684454a17cd`;
  `sitemap.mdx` **http=200**, **11672 bytes**, sha256
  `c259e4972b7bbd31e2462d5538bdb29e91e26578046205e445808650d92c4a8c`;
  `generate-metadata.mdx` **http=200**, **49181 bytes**, sha256
  `68e0ff80fa633a99fe65ac1b6f1d7f7ededa666adc0a407a1ab43f43cf7ebe1a`. Line 20 of
  `robots.mdx` is the `robots.ts` convention; line 42 of `sitemap.mdx` is the
  `sitemap.ts` one, with the `lastModified: new Date()` example §3 of the doc declines
  to copy; lines 395-396 of `generate-metadata.mdx` — "`metadataBase` allows URL-based
  `metadata` fields defined in the **current route segment and below** to use a
  **relative path**" — are why every layout can write `canonical: "/scan"` and still
  serve an absolute URL, and why `metadataBase` did not have to move. `vercel.com` and
  `developer.mozilla.org` were not re-probed; they are recorded as refusing in the
  2026-09-15 and 2026-09-25 blocker entries.

  **ML — the sRGB knee guard, and the premise it was written on turned out to be
  wrong.** Chosen because it is the one `[AI]` item on the vision path that needs no
  labelled export and no real photo. Cycle 22's item ends with "if it moves it has to
  move in BOTH files in one change", and the assumption was that nothing enforced it.
  Measured rather than assumed, and it is more than expected: moving the knee in
  `lib/skin.ts` alone fails `tests/index-parity.test.ts` **2 failed / 10 passed**;
  moving it in `ml/ita.py` alone fails `python3 ml/selftest.py` with **failures=1** while
  index-parity stays **12 passed**; changing the 1.055 scale in `ml/ita.py` alone fails
  selftest with **failures=3**, index-parity again **12 passed**. So no move ships
  silently today, and that sentence in the backlog was not the gap it looked like.
  What is still missing is what landed: both existing guards compare ONE language
  against `ml/index-parity.json`, a committed artifact, in two different runners, and
  neither compares the two implementations to each other.
  `tests/srgb-knee-parity.test.ts` reads the four constants out of both sources and
  requires them to agree, so the failure names the constant. It is **8 passed**; the TS
  knee alone gives **4 failed / 4 passed**, both knees together **3 failed / 5 passed**,
  the Python scale alone **2 failed / 6 passed**, and the TS knee moved to a value the
  fixtures do not straddle (0.0405) **5 failed / 3 passed**. It re-derives
  colour-science's breakpoint **0.040449936** from `12.92 * 0.0031308`, ARU's distance
  from it **6.40000000010077e-8**, the knee discontinuity **2.32950731317641e-9** and
  **0** of 256 integer channels inside the window — cycle 22's numbers, now carried by
  a run rather than by a sentence. **The backlog item stays open**: where the knee
  belongs needs IEC 61966-2-1, which this network cannot reach.

  **UI/UX — the shared-link preview, and no defect found.** `public/og.png` is a real
  PNG at **1200x630**, **40556 bytes**, sha256
  `67c60326d910d3a818170e493a13b661e38eefe695ed79ba4e148780561749e2`, matching the
  `width`/`height` the metadata declares, and `og:image` resolved to the absolute
  `https://aru-beauty.vercel.app/og.png` on every page both before and after. Recorded
  as none rather than invented. What did change: every page now carries its own
  `og:title` and `og:description`, so a `/report` link pasted into a messenger no
  longer reads the same line as every other link. The e2e now fetches `/og.png`, checks
  the PNG signature bytes and reads the IHDR width and height, so a replacement image
  of the wrong size fails instead of silently shipping a cropped preview. Per-RESULT
  previews are still impossible and unchanged — the levels live in the URL fragment,
  which no scraper receives; that is the 2026-09-15 blocker.

  **What this does not establish, and it is the important paragraph.** Nothing was
  submitted to any search engine — no Search Console, no ping, no IndexNow — and
  whether Google or Naver ever crawls these URLs is not something this repository can
  make true. No traffic number changed and none was measured: this is a precondition
  for organic acquisition, not evidence of any. Everything is measured against a local
  production build; whether the deployed `aru-beauty.vercel.app` serves these routes
  was not verified. And every title is English, because metadata renders server-side
  before any locale is known — the same gap §4 describes, with the same fix.
  [`docs/discovery-metadata.md`](discovery-metadata.md).

  *An existing guard caught this change, and its intent was kept.*
  `tests/internal-access.test.ts` asserted the literal string `index: false` in each of
  `app/ops`, `app/pilot` and `app/eval`'s `layout.tsx`, which this cycle moved into the
  route table. The test now asserts the metadata those layouts actually export, which
  is strictly stronger: flipping `/ops` to `index: true` in the table gives **4 failed /
  41 passed** across that file and `tests/seo-metadata.test.ts` together, where the
  string check would have stayed green.

  *Validation on this tree:* see the report for the literal output.

  **Supervisor review.** Sound, and no correction needed. It is the first cycle
  that works on acquisition rather than on defects inside the product.

  *Predicted by reading, before the branch existed:*
  - `/robots.txt` and `/sitemap.xml` would 404 today, and every public page shared one
    title. The worker measured both.
  - `/report`, `/care`, `/checkin` and `/studio` render from device-local state, so a
    crawler would get an empty page. The worker measured this and marked them noindex.
  - `/ops`, `/pilot` and `/eval` were already `index: false`, and still are.

  *Checked here.*
  - The `/survey` description says "three short questions". The survey's own
    `ready` needs `type && category && budget` (`app/survey/page.tsx:63`) and the page
    prompts "제품 종류, 피부 타입, 예산을 선택해 주세요", so the three required answers
    are what the text describes. Concerns and avoid are optional.
  - `tests/internal-access.test.ts` was edited, and the edit is a strengthening, not
    a weakening. It used to grep each layout for the string `index: false`. It now
    asserts the metadata that layout exports, so flipping the table entry fails it too.

  *Breaks run here against `tests/seo-metadata.test.ts`, each narrow:*
  - `seoMetadata` returning `index: true` for every route → `1 failed | 37 passed
    (38)`, the failure being "marks indexable routes index and the rest noindex".
  - `app/report/layout.tsx` deleted (the plausible regression: `/report` would then
    fall back to the root layout's indexable metadata) → `1 failed`, the failure being
    "app/report/layout.tsx calls seoMetadata("/report")".
  - The sitemap's `index` filter removed → `2 failed`, the failures being "lists
    exactly the indexable routes…" and "lists nothing that carries a noindex tag".

  *Validation on this tree:* see the PR body for the literal output.

- 2026-09-25 (cycle 38) — Branch `autopilot/2026-09-25-0039`. **The two routes that
  spend the owner's money took work from anyone who asked. Three questions about that,
  answered by driving the real handlers with the upstream `fetch` stubbed rather than by
  reading them: all three came back yes, two are fixed here and the third is an owner
  decision with a cost. The 360px walk of `/report` found the mascot laid out off-screen
  in two of five locales.**

  **Baselines, measured here on a clean tree at `1663f9c` before any edit.**
  `node_modules` was absent, so `npm ci` first. `npx vitest run` **808 passed in 100
  files**, `npx tsc --noEmit | grep -c "error TS"` **13**, `npx eslint .` **0 errors, 2
  warnings** (the same `_reads` / `_result` at `lib/care.ts:70`), `python3 ml/selftest.py`
  **Ran 145 tests in 2.172s ... OK**, and `npm run smoke` with the chromium override at
  `/opt/pw-browsers/chromium-1194` printed **`Smoke test passed.`** with **184 passed
  (7.9m)**. They match the supervisor's.

  **Question 1 — does either route accept a caller that plainly is not one of ARU's
  pages? Yes, every shape tried, and it is fixed.** Neither `/api/analyze` nor
  `/api/reason` looked at where a call came from.
  `tests/llm-route-cost-exposure.regression-24.test.ts` replays seven header sets
  against both real handlers with `globalThis.fetch` replaced by a stub that throws on
  any URL it does not recognise, so nothing in this work could reach OpenAI or Google.
  With the guard call deleted from both handlers, all **14** cases (seven header sets ×
  two routes) recorded **`status=200 upstreamCalls=1`** — seven to
  `generativelanguage.googleapis.com`, seven to `api.openai.com/v1/chat/completions`.
  On the committed tree the same 14 are **403** with **0** upstream calls: no `Origin`,
  a foreign `Origin`, an `Origin` whose host merely *contains* ARU's, an unparseable
  `Origin`, `Sec-Fetch-Site: cross-site` (including with ARU's own `Origin` spoofed
  alongside it), and `Sec-Fetch-Site: same-site`. `isForeignOriginRequest`
  (`lib/server/request-guard.ts`) runs before the limiter and before the body is read.
  ARU's own pages still get through and that is measured twice, not assumed: five
  same-origin cases in the file reach the model, and a real Chromium at 360px loading
  `/report` sends `origin=http://127.0.0.1:3102` on its `POST /api/reason` and gets
  **`status=200`**, not 403. (Playwright's interception layer reports `sec-fetch-site`
  and `host` as `(none)` — it does not surface `Sec-` headers or `Host`, which the
  network stack sets after interception — so that probe shows the Origin arm passing,
  not both arms.) The 189-spec smoke run below is green with the guard in place. It is a CSRF boundary and **not** authentication — curl can still send
  whatever headers it likes, which is said in the code, in the doc and here.

  **Question 2 — what does the limiter bound? Measured, and narrower than it reads.**
  `createRateLimiter` allows **10** of 40 calls on one key at one instant, **40** of 40
  when the key rotates each call, and **20** across two instances built from the same
  policy before either refuses. `requestClientKey` reads `x-vercel-forwarded-for`, then
  `x-forwarded-for`, then `"unknown"`. So the bound the CODE provides is 10 per client
  key per minute per running instance, which is not a cap on spend. **It is not the only
  layer, and that was nearly missed**: `docs/qa/2026-07-17-post-deploy-security.md`
  records a live Vercel Firewall rule, `Provider request budget`, on the exact POST
  paths `/api/analyze`, `/api/reason` and `/api/reengage/subscribe` — fixed window,
  **keyed on client IP**, **20 requests per 60 seconds** — verified against production
  on 2026-07-17 with `{}` bodies so no provider was called. That layer fixes both of the
  app limiter's weaknesses (the key is not a header the caller sends, and the window is
  not per instance) and is still a rate per IP rather than a budget; this cycle could
  not re-verify it, because the rule's live state is not readable from this worker.
  **How a deployed edge sets or strips the two forwarding headers is unknown and is
  recorded as unknown**:
  `vercel.com/docs/headers/request-headers` returned `http=000` from this worker and so
  did the MDN page, and the one Vercel source file that did fetch
  (`raw.githubusercontent.com/vercel/vercel/main/packages/next/src/index.ts`, **HTTP
  200**, **101605 bytes**, sha256
  `334d55f4fbff4ee4ab2bf9b86fc20fb6a9a7b6126ed5dde31dbec93f69693c25`) contains **0**
  lines matching either header name. A real global cap needs infrastructure, so it is an
  owner decision with its options costed — the Firewall rule bounds a rate per IP, not a
  total — §5 of
  [`docs/llm-route-cost-exposure.md`](llm-route-cost-exposure.md), with a BLOCKERS entry
  above. Nothing paid, nothing database-backed and no dependency was added.

  **Question 3 — can a caller buy work ARU never asks for? Yes, and the free cases are
  closed.** `parseAnalyzeInput` checked the data-URL shape and the 1.5 MB decoded
  ceiling and never looked at the bytes, so 1 MB of `AAAA…` under
  `data:image/jpeg;base64,` was paid for, as was a PNG labelled `image/jpeg` and a JPEG
  labelled `image/png` — and the label is what the upstream request tells the model it
  is sending. It now also requires the declared type's signature at offset 0: `/9j/`
  (`FF D8 FF`) and `iVBORw0K` (`89 50 4E 47 0D 0A`), both whole base64 groups so the
  encoding is exact, both derived with `Buffer.from([...]).toString("base64")`. This
  does **not** make the image a face; any real JPEG still passes, and no cycle can tell
  a face from a wall without running a detector server-side. `tests/ai-input.test.ts`
  asserted `AQID` — bytes `01 02 03` — was an acceptable JPEG; that case is now the
  refusal it should have been.

  **Broken on purpose, seven ways, every count re-run on the committed tree.**
  `tests/llm-route-cost-exposure.regression-24.test.ts` is **37 passed**: deleting the
  guard call from both routes gives **15 failed | 22 passed**; deleting only the
  `Sec-Fetch-Site` check **4 failed | 33 passed**; weakening the host compare to
  `origin.includes(host)` **2 failed | 35 passed**; deleting the magic-byte check
  **4 failed | 33 passed** here and **1 failed | 4 passed** in `tests/ai-input.test.ts`;
  weakening `startsWith` to `includes` **1 failed | 36 passed** and **1 failed | 4
  passed**.

  **Research — the Fetch Metadata spec, primary source.**
  `https://raw.githubusercontent.com/w3c/webappsec-fetch-metadata/main/index.bs`,
  **HTTP 200**, **22801 bytes**, sha256
  `529f0cff7812e53ddd6ba67a7d9b359db4ffff4e744ce7561e36e6a31965b55c`. Two sentences
  chose the guard's shape. Lines 205-207: "Valid `Sec-Fetch-Site` values include
  `cross-site`, `same-origin`, `same-site`, and `none`. In order to support
  forward-compatibility with as-yet-unknown request types, servers SHOULD ignore this
  header if it contains an invalid value" — so an unrecognised value is allowed through
  rather than refused. Lines 340-345: the `Sec-` prefix makes these "unmodifiable from
  JavaScript. This will prevent malicious websites from convincing user agents to send
  forged metadata along with requests" — which is the whole basis for trusting the
  header from a browser and not from anything else. The `set-site` algorithm at lines
  209-238 never sets `none` for a page's own `fetch()`, which is why `none` is allowed.
  `index.src.html` in the same repository is **HTTP 404** (14 bytes); `vercel.com` and
  `developer.mozilla.org` refused, as recorded above.

  **ML — the 0.86 cap was also doing input validation.** Chosen because it is the one
  `[AI]` item on the vision path that needed no labelled export and because the bug-fix
  work put the route's own `readConfidence` side by side with it. `mergeVisionAnalysis`
  clamped each vision confidence to `[0,1]` where it read the per-attribute value and
  not where it summed the mean that becomes `next.confidence`, while `/api/analyze`
  clamps before the payload leaves the route. So one payload published two numbers:
  `{oil: 2, redness: 0, pores: 0}` read **0.600000 / 보통 / retake false** through the
  function against **0.300000 / 낮음 / retake true** through the route, and `{oil: -2,
  redness: 1, pores: 1}` diverged the other way, **0.200000** against **0.600000**. It
  hid because `Math.min(0.86, mean * 0.9)` saturates from a mean of 0.95555… up, so
  everything-at-5 and everything-at-1 both read **0.860000** on both paths. One clamp,
  applied once before the value is used; the production path is unchanged because the
  route already clamped. `tests/vision-confidence-clamp.test.ts` is **12 passed**;
  pushing the raw value again gives **5 failed | 7 passed**, clamping only the lower
  bound **4 failed | 8 passed**. `ml/selftest.py` is untouched at **Ran 145 tests**.
  The backlog item **stays open**: where the cap belongs relative to the 0.8614 gate is
  the same unanswered question and still needs real readings.
  [`docs/vision-confidence-clamp.md`](vision-confidence-clamp.md).

  **UI/UX — `/report`'s mascot was laid out off-screen in `en` and `ar`.** Probed at
  360x800 on `/report` in all five locales. The title row is a flex row of a text column
  and a 60px mascot with `justifyContent: space-between`. The text column had no
  `minWidth`, so it took its max-content width — **331.5** under `en` and **332.8**
  under `ar` against a **320** content box — and the mascot, which has no intrinsic
  minimum, was shrunk to **width 0** and laid out at left **361.5** (`en`) and **-2.8**
  (`ar`). `ko`, `ja` and `zh` fitted and showed it. `minWidth: 0` on the column and
  `flexShrink: 0` on the mascot fix that, and needed a second property: alone they
  narrow the column to 250px and push the step rail's last label out to **350.5** (`en`)
  and **8.2** (`ar`), so the step rail's own flex container
  (`app/components/flow-steps.tsx`) gets `flexWrap: "wrap"` — inert wherever it already
  fits. All five locales now read mascot **width 60.0** inside the box (`en`
  280→340, `ar` 20→80, mirrored correctly), **0** descendants outside the column, and no
  page scroll (`docScroll` 360 = `docClient` 360).
  `tests/e2e/report-header-fit.regression-25.spec.ts` is **5 passed**; reverting the two
  report properties gives **5 failed** (mascot width **54.5625** under `ko` and
  **42.84375** under `en`, against the asserted 60), and
  reverting `flexWrap` alone gives **5 failed** on the descendant count (ko 2, en 6,
  ja 2, zh 2, ar 6 outside the column).

  **Not established.** Whether either route has ever actually been called by a third
  party — there is no server-side request log to read, and this cycle added none.
  Whether the guard survives a deployed edge that rewrites `Origin` or `Host`; only the
  handler's own view was measured. How Vercel treats the two forwarding headers, per
  question 2. Whether any real image is a face. Which side of the vision-confidence
  divergence was the *better* number, as opposed to which one shipped. And of the
  revenue-upstream screens only `/report` was walked at 360px this cycle: `/scan` needs
  a camera, and `/care`'s 360px coverage is still the cycle-12 spec
  (`tests/e2e/care-merchant-disclosure.regression-12.spec.ts`) rather than a fresh walk.

  *Validation on the committed tree.* `npx vitest run` **858 passed in 102 files**,
  `npx tsc --noEmit | grep -c "error TS"` **13** (unchanged), `npx eslint .` **0 errors,
  2 warnings**, `python3 ml/selftest.py` **Ran 145 tests in 2.047s ... OK**, and
  `npm run smoke` printed **`Smoke test passed.`** with **189 passed (7.5m)** — 184 plus
  this cycle's five. Three new test files —
  `tests/llm-route-cost-exposure.regression-24.test.ts`,
  `tests/vision-confidence-clamp.test.ts` and
  `tests/e2e/report-header-fit.regression-25.spec.ts` — and nothing skipped or disabled.
  Rotation: `docs/AUTOPILOT.md` is **1671** lines against **1662** at `1663f9c`,
  `docs/autopilot-changelog.md` **7992** against **7802**, `comm -23` of `sort -u` over
  both files at `1663f9c` against both files now returns **0** lines, and `cmp` on cycle
  35's **189** moved lines is byte-identical.

  **Supervisor review.** Sound. One test was hardened before merge: a plausible
  weakening of the host compare got through it.

  *Predicted by reading, before the branch existed.* A cross-site POST with no `Origin`
  would be accepted today, the limiter is per-instance, and there is no spend cap. The
  worker measured all three. Whether Vercel strips or overwrites `x-vercel-forwarded-for`
  I marked unknown, and the worker also left it unknown: `vercel.com` returned `http=000`
  and nothing was quoted from memory.

  *Re-checked here.*
  - `parseAnalyzeInput` accepts only `image/(jpeg|png)`. The client's AI crop is
    `mimeType: "image/jpeg"` (`app/scan/camera-quality.ts:55`) through
    `canvas.toDataURL`, so the new magic-byte check cannot refuse ARU's own capture.
  - The Firewall numbers the doc quotes (20 per 60 s, client IP, `deny` → 429) match
    `docs/qa/2026-07-17-post-deploy-security.md:37-54` line for line.

  *Breaks re-run on the committed tree* against
  `tests/llm-route-cost-exposure.regression-24.test.ts`:
  - `if (!origin) return false` → `3 failed | 34 passed (37)`.
  - `FOREIGN_FETCH_SITES` without `same-site` → `1 failed | 36 passed`.
  - Magic-byte line removed → `5 failed | 37 passed (42)`, with `tests/ai-input.test.ts`
    included in the run.
  - Host compare weakened to `!host.includes(new URL(origin).hostname)` →
    **`37 passed (37)`**. The file covered an Origin that CONTAINS ARU's host
    (`aru.test.evil.example`) but not the other direction, where ARU's host contains a
    shorter one. An attacker holding a name that ARU's host ends in would pass that
    weakened compare.

  *Hardened before merge.* I added an Origin of `https://ru.test` against host
  `aru.test`. The file is now `39 passed`, and the same weakening fails exactly the two
  new cases. Modern browsers would also be stopped by `Sec-Fetch-Site`; this pins the
  `Origin`-only path that older browsers take.

  *Owner decision carried forward.* A real spend cap needs a shared counter (KV / Upstash
  / Supabase). The doc prices that as an owner decision and does not build it.

  *Validation on the corrected tree:* see the PR body for the literal output.
