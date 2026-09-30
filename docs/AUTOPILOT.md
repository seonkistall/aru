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

- [~] [AI+OWNER] **Search experiment: two catalogue-built guide pages. Shipped
  2026-09-27 (cycle 46); the test has not started and cannot start without the owner.**
  Seven cycles of product quality had landed against zero traffic, so this cycle spent
  the UI/UX slot on the one acquisition path that does not need a budget: two indexable
  English pages built from the catalogue, `/guide/serum-for-combination-skin` and
  `/guide/toner-for-oily-skin`, each handing a searcher into `/scan` or `/survey`.

  **Hypothesis.** A searcher looking for "serum for combination skin" wants a shortlist
  with reasons, not a landing page, and ARU's catalogue already holds the reasons
  (`lib/skus.ts`, `lib/ingredients.ts`, `CONCERN_ROLES`). If that is true, two pages at
  the two (category, skin type) pairs the catalogue covers best should pick up
  impressions without any spend. If it is false, they pick up nothing and the whole
  content-marketing direction is cheaper to abandon now than after twenty pages.

  **What the owner must do for this to be tested at all.** Submit `/sitemap.xml` to
  Google Search Console. This is already an owner blocker (cycle 39) and nothing has
  changed it: the sitemap lists both new URLs as of this cycle, and a sitemap nobody
  submits is a file nobody fetches. No amount of loop work substitutes for it.

  **The metric.** Search Console impressions for exactly these two URLs, read as the
  Pages report filtered to `/guide/`. Not clicks, not sessions, not `/ops` — the funnel
  store is localStorage-only and the flush is off for an unresolved consent question
  (BLOCKERS), so the loop cannot see a visitor arrive. Impressions is the only number
  that exists.

  **KILL CRITERION: 0 impressions for both URLs 4 weeks after the sitemap is submitted →
  delete both pages**, their two `SEO_ROUTES` entries, `lib/guides.ts`, the guides line
  on `/`, `tests/guides.test.ts` and
  `tests/e2e/guide-pages.regression-33.spec.ts`, and restore the two `INDEXABLE` lists.
  That is the whole footprint; it was built to be removable in one commit.

  **Nothing scales this up until that number is read.** No third guide, no per-locale
  guide URLs (an open owner decision, "Next"), no blog, no programmatic pages. Two is
  the experiment; more than two before a reading is the doorway-page failure mode this
  cycle deliberately stayed on the right side of.

  **Annotated 2026-09-27 (cycle 47).** No page was added — this rule was read and kept.
  What cycle 47 did change is how the two existing pages RENDER for a returning visitor
  who had already picked a language: the bodies were laying out inside whatever
  `html[lang]`/`dir` the chrome had, so a saved `ar` wrapped Latin prose in
  `html[dir=rtl]` and a saved `ko` put the Korean display face on an English `h1`. Fixed
  on the guide's own root; the pages' measured geometry is now identical under all five
  saved languages, pinned by
  `tests/e2e/guide-ltr-in-rtl-chrome.regression-34.spec.ts`. This does not touch the
  experiment, its metric or its kill criterion, and the footprint to delete is unchanged
  except that the new spec joins the list above. `/sitemap.xml` still lists the same
  **6** URLs (`lib/seo.ts` has **6** `index: true` entries and was not modified).

  **Opportunity cost, stated.** This cycle did not touch the commerce deep-links, the
  funnel flush, or the model. If the owner never submits the sitemap, the cycle bought
  nothing except two pages nobody reads — which is the same risk every item above the
  affiliate blocker carries.

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
- [x] [AI] **`/report`'s first screen shows 6 Korean characters in `en`, `ja`, `zh` and `ar`,
  and the fix is a translation key.** Measured 2026-09-26 (cycle 43) on a production build
  at 360x800, a fresh context per locale with only localStorage seeded: the leaking node is
  the trust chip `노출 여유 확인`, from `signalCheck`'s fallback branch in
  `lib/report-trust.ts`, which composes `${signal.label} 확인` / `${signal.label} 보류` at
  runtime. Of the **14** strings that function can return, **12** are dictionary keys in
  all four locales and the **2** for the `노출 여유` signal are in none:
  `grep -cF '  "노출 여유 확인":' lib/i18n/{en,ja,zh,ar}.ts` is **0** each, against **1**
  each for `조명 확인`, `반사 확인`, `피부 영역 확인` and their `보류` forms. The `보류`
  half is reachable too — `노출 여유` fails whenever `cheekClipped >= CHEEK_CLIP_LIMIT` —
  and was not measured on screen. Not fixed in cycle 43 because that cycle's brief forbade
  adding or removing a translation key; composing the chip from `t(label)` and a separate
  `확인` would need two more keys and would change what the other three chips render, so
  the cheap fix is the two missing entries.
  **Closed in the cycle 43 supervisor review.** The two entries were added to all four
  dictionaries, following their neighbours (`Lighting OK` / `Lighting pending`), and the
  base phrase each dictionary already had for `노출 여유`. The translation-coverage test
  only sees `t("...")` literals, so a composed chip passed it. The new
  `tests/report-trust-chip-keys.test.ts` reads the labels and details out of
  `buildSignals`, runs every combination through `buildReportTrust`, and requires every
  resulting chip to be a key in `en`, `ja`, `zh` and `ar`. It gives **5 passed**. Without
  the new entries it gives **4 failed | 1 passed**. With only `ja`'s `노출 여유 보류`
  removed it gives **1 failed | 4 passed**.
- [~] [AI] Validate the blemish-detection constants (`BLEMISH` in `lib/skin.ts`) against
  real photos through `/eval`, and replace them with calibrated values. They were
  chosen on a synthetic face.
  **2026-09-26, cycle 44: which of the five is worth the labelling session is now
  measured, and two of them cannot be calibrated on a synthetic face at all.**
  `tests/blemish-constant-sensitivity.test.ts` builds a copy of `lib/skin.ts` per variant
  with ONE constant rewritten and runs the shipped `detectBlemishes` on the
  `tests/scan-cost-benchmark.test.ts` face at 400x480 and 720x960, where the build reads
  **6** and **5**. `suppressionRadius` dominates: **9**/**7** at 1 and **5**/**5** at 3, a
  span of **4**. `backgroundRadius` spans **2** (**7**/**5** at 4), `gridAcrossFace` spans
  **1** (**5**/**6** at 80). `minResidual` at 1.4 and 1.8 and `excludeFraction` at 0.045
  and 0.065 move **neither** size off 6 and 5, because the fixture's five blemishes are
  +26 r over their background and nothing is marginal against a 1.6 a\* floor — so no
  synthetic sweep can settle those two, which is the item's own argument as a number.
  Nothing shipped moved; `/eval` against real photos is still what closes this, and
  `suppressionRadius` is where it should start. Sensitivity on one fixture at two sizes,
  not a calibration.
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

  **2026-09-26, cycle 43: what a capture has to be to land in the divergent window, and
  the headline number is not the guard's.** Chosen because it needs no labelled export and
  is not the sRGB knee item cycles 41 and 42 both worked. Two results, both arithmetic.
  (1) The window is **not** the set `highFreq === 0`, so a fix phrased as "is the forehead
  perfectly smooth" would miss a capture that is inside it. `highFreq` is the mean of
  `|L - mean(4 neighbours)|` over `lum(r,g,b) = 0.299r + 0.587g + 0.114b`, so it reads
  luminance only: a 1px checkerboard of `(60,60,176)` and `(63,81,60)` — distinct colours
  whose exact luminance numerator `299r + 587g + 114b` is **73224** for both — gives
  `highFreq` **1.4210854715202004e-14**, which is the float error and not 0, against
  **0** for the flat frame. Region mean L* **73.22399999999999**, so `foreheadHf` is
  **1.9407372876655204e-16**, inside the `<= 1e-6` window, with the region's luminance
  texture **5.188544138981456e-13** and mean blue **118.8944246737841**: flat in
  luminance, not in colour. (2) The committed row's "python: 320000.0 app: 0" magnitude is
  a property of the OTHER region, not of the epsilon — here both regions are in the window
  together and the Python form returns **1.9407372876655204e-10**, which is also exactly
  its own ceiling `cheekHf / 1e-6`. So no `n/1e-6` disagreement should be quoted as if the
  clamp produced it. `tests/roughness-ratio-divergent-window.test.ts` **4 passed**, broken
  three ways: widening the app's guard to `foreheadHf >= 0` **2 failed | 2 passed**;
  accumulating the signed difference instead of `Math.abs` **2 failed | 2 passed**;
  making `highFreq` a sum instead of a mean **1 failed | 3 passed**. No constant moved and
  the item **stays `[~]`**: which side moves still needs a usable dryness reading on a
  genuinely smooth forehead, which needs faces.
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
  **2026-09-25, cycle 41: the acceptance criterion is a run now, not a paragraph.** The
  sentence "either the a*-only fast path takes the table and `rgbToLab` keeps `Math.pow`,
  or the table is built so the knee cell is exact" rested on two numbers nothing in the
  suite re-derived. `tests/srgb-lut-knee-cell.test.ts` builds the 4096-entry table this
  item describes, sweeps the whole 0-255 domain against `labAStar` itself, and measures
  where the worst a* error sits: **cell 165**, the cell the knee at `0.04045 * 255 =
  10.31475` falls inside, cell width **0.062255859375**. It lands there on the grey
  diagonal (worst **9.005782231064074e-9** at channel **10.314453125**) and with one
  channel varying against a held pair (worst **0.00006554712123119089** at r=**10.3125**,
  g=b=**30**), and in the ungated 0-40 band the same cell carries it. Inside the
  detector's own **132-220** band the table clears **1.046e-5**; outside it does not.
  **4 passed.** Broken two ways: `N = 255` — the exact-integer table this item's own trap
  paragraph rejects — gives **2 failed | 2 passed**, and making the knee cell exact (the
  second of the two escapes) also gives **2 failed | 2 passed**, which is the test doing
  its job rather than a bug. `srgbLinear` is untouched, no published field moved and no
  labelled export was needed. **Stays open**: whether the table is worth shipping is a
  phone-profile question this container cannot answer, and which escape to take is not
  decided here.
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
  **2026-09-26, cycle 42: "reachable in principle" now has a size, and it is small.**
  `tests/srgb-knee-window-consequence.test.ts` (**4 passed**) re-derives the window from
  both sources and sweeps the whole continuous interval rather than the 256 integers:
  channel window **[10.31473368, 10.31475]**, worst linear-light difference
  **2.32950731317641e-9** (the knee discontinuity itself, so the branches never come
  closer inside it), worst a* difference **0.000003178226778643989** at
  **(30, 10.31475, 30)** against `BLEMISH.minResidual`'s **1.6** a* units —
  **503425.37252255186x** larger. So no reachable input makes the knee choice change a
  blemish decision, and the cost side of "moving it is a decision" is now measured. Still
  open for the same reason: the standard is still unreachable and no constant moved.
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
  **2026-09-26, cycle 45: the third knob, and the first joint sweep of two of them.**
  Both of cycle 32's knobs keep the clean capture ON its cut — re-seeding re-bisects.
  The one that gives that up, a fixture landing NEAR the cut, had not been moved.
  `ARU_PRINT_RETAKE_DARKOIL=1 npx vitest run tests/retake-signal-rule.test.ts` offsets
  `tuned("oil")`'s `contrast` by `delta` and leaves the rest alone. **The count is a
  ridge over the cut, not a slope:** it is **0/120** at `delta -0.02` (clean shine
  **0.039002**) and at `+0.02` and `+0.04` (**0.061003**, **0.071852**), because a
  disagreement needs both captures to straddle the cut; the peak over the offset alone
  is **22/120** at `delta -0.001`, one seed above the committed **21/120**. Over both
  knobs — 7 offsets x 4 darknesses — the largest of the 28 cells is **43/120**, at
  `delta -0.002` and cheekL **20**, a face darker than any condition the sweep names,
  and still under cycle 32's bound of 55. Where the grids overlap they agree: `delta 0`
  at cheekL 40 reads **26/120** in both. **71/120 is a majority of the seeds (59.2%) and
  nothing in this fixture family produces a majority** — 43/120 is 35.8%. Asserted at
  four corners with 24 seeds (**7, 2, 8, 3**, each below 12). The item stays open for
  exactly what cycle 32 left open: which of fixture, cut point or analyzer differed.
  `docs/retake-sweep-what-it-measures.md`.
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
  **Audited 2026-09-27 (cycle 48): the card has no rendering defect, and what it lacks is
  named rather than guessed.** Measured on the real page at a 360x800 viewport in all five
  locales: the card rasterizes at **320x640** (the component's `width: 360` is capped by
  its own `maxWidth: "100%"` inside the page padding), horizontal overflow **0** and
  vertical overflow **0** on the card and on every text node inside it, **0** clipped
  nodes, and Hangul present only under `ko` — so **0** Korean leaks in `en`/`ja`/`zh`/`ar`.
  `dir` follows the chrome (`rtl` under `ar`), and `zh` reports `lang="zh-CN"`.
  **What the card does not carry: any url, domain or handle.** A regex for
  `aru[-.]|https?:|\.com|\.app|vercel` over the card's rendered text is **false** in all
  five. `shareUrl` reaches the share SHEET only, so a DOWNLOADED card (the `/studio`
  download button, and the fallback every desktop browser takes) has nothing pointing back
  at the product but the word `ARU`. Left alone: `shareUrl` is an owner decision and the
  fix is a card-design change, not a plumbing one.
  **The claim gates are now pinned rather than assumed** by
  `tests/share-card-claims.test.ts` (**13 passed**, broken three ways at **1 failed | 12
  passed**, **2 failed | 11 passed** and **2 failed | 11 passed**). It sweeps the closed
  set of **30** distinct strings the card can draw — chrome, share-sheet text, `/studio`
  presets, all **5** headlines `headlineFor()` can return and all **3** values
  `overallFor()` can, plus `SKIN_LABELS` — through both gates in all five locales.
  `efficacyClean()` passes **all 30 in all 5**. `BANNED_BY_LANG` does not, and the hit is
  pre-existing and not fixable from here: **1** string trips `en` and the same **1** trips
  `zh` (`오늘은 진정 루틴이 먼저예요` → "Today, soothing comes first" on `sooth`, → 今天舒缓优先
  on 舒缓), while `ja` (鎮静) and `ar` (التهدئة) give **0**. The Korean source passes
  `efficacyClean()` because 진정 is not on the Korean list, so the asymmetry is between the
  LISTS, not in the copy — the same shape as the cycle 46 review's finding, now shown to
  reach a shipped headline (also rendered on `/report` and `/scan`) and not only a SKU
  name. Nothing is broken today: the gates run only on LLM reason paths. The test pins the
  exact hit list so a SECOND one cannot arrive unnoticed.
  **One stale comment fixed**: `app/components/share-card.tsx` claimed the scan result
  screen shares the card. It does not — `shareResultCard()` copies a `moodShareUrl()` deep
  link and never touches the component; `grep -rn "ShareCard" app/ --include=*.tsx`
  outside that file gives **2** hits, both in `app/studio/page.tsx`.
  **Not established:** nothing was measured in KakaoTalk (still needs a phone, still in
  BLOCKERS), no card-overflow e2e spec was added — the probe above was a one-off, so the
  320x640 numbers are not regression-pinned — and the `skin mood` literal was left
  unlocalized on purpose rather than tested.
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
  **2026-09-25, cycle 41: the two camera-gated blocks are measured, and one of them was
  a defect.** No camera was needed and none was used — `getUserMedia` is shimmed to a
  canvas `captureStream()`, the pattern `tests/e2e/mobile-layout.spec.ts` already used,
  and `/scan` reaches `phase === "ready"` the way it does on a phone. `info-sheet.tsx`'s
  `<ul>` **was** a defect: its computed `list-style-type` is `none`, so the
  18px is pure indent and not marker room, and under `ar` it landed at the reading END —
  every `<li>` line ended at **327**, the `<ul>` box's own edge, as did the sibling
  above it, so the indent was **0px** where `en` reads **18px** (list text at 51 against
  the sibling's 33). `scan-controls.tsx`'s `privacyPill` was **not**: its Arabic string
  renders as one line in a box that fits it exactly (**44…186.7**, line **44…186.7**),
  so `textAlign` paints nothing. Same verdict, same reason, for
  `app/report/page.tsx:305`'s value span — `flexShrink: 0` and box width equal to text
  width on all three rows (**31.7/31.7**, **44.7/44.7**, **77.4/77.4**, one line each).
  Three more defects were found by grepping wider and fixed the same way:
  `app/care/page.tsx`'s `tipList` (the same `paddingLeft: 18`),
  `app/components/product-card.tsx`'s price span (`marginLeft: "auto"`, which resolved
  on the inline END under `ar`) and `app/care/page.tsx:149`'s mascot
  (`marginLeft: -12`, which hung it **12px** past the card's inline end under `ar`).
  Pinned by `tests/e2e/rtl-logical-inset.regression-29.spec.ts` (**9 passed**).
  **Still open**: `app/care/page.tsx`'s `linkBtn` / `otherMerchantsBtn`
  `textAlign: "left"` are measured and cleared but not changed, and mid-session
  language switching and a real phone remain unmeasured on all nine screens.
  **2026-09-26, cycle 42: mid-session switching is measured on two of the nine, and the
  direction half of it is clean.** en → ar → ja through the real picker at 360x800 on a
  production build, on `/report` with the picks step open and on `/care`: `dir` followed
  every time (**ltr / rtl / ltr**) and `scrollWidth === clientWidth === 360` on every
  screen in every locale, so **0** direction or overflow defects. What it did lose was
  state, which is not an RTL question: `/report`'s selected tab went **1 → 0 → 0** and its
  merchant links **4 → 0 → 0**, fixed this cycle and pinned by
  `tests/e2e/lang-chunk-tap-hold.regression-30.spec.ts`. `/care`'s scroll offset went
  **400 → 400 → 0** with **1062** px still scrollable in ja, measured and not explained.
  Seven screens and the real phone are still unmeasured for mid-session switching.
  **2026-09-28, cycle 50: the six screens' physical-property candidates are re-grepped and
  both survivors measure CLEAN, so this item's layout half has nothing left to fix at
  360x800.** The grep the item asks for (`left:`, `right:`, `paddingLeft`, `marginLeft`,
  `borderLeft`, `textAlign: "left"/"right"`, plus the `Right` variants) over the six
  screens' own files returns **3** hits and **2** candidates today. Per file, `grep -c`:
  `app/page.tsx` **1**, `app/scan/page.tsx` **1**, `app/scan/scan-controls.tsx` **1**,
  and `app/survey/page.tsx`, `app/studio/page.tsx`, `app/privacy/page.tsx`,
  `app/unsubscribe/page.tsx`, `app/unsubscribe/unsubscribe-form.tsx` **0** each. The
  `app/scan/page.tsx` hit is line **401**, a `left: 6, right: 6` staff-mode debug overlay
  — symmetric on both edges, so direction cannot move it — which leaves the two below. Both were rendered under `en` and `ar` at 360x800 on a production
  build. `app/page.tsx:62` (the decorative `aria-hidden` arrow beside the mascot,
  `position: absolute; left: -8`) is **byte-identical in both directions**: box
  **94…136**, parent **102…258**, offset from the parent's left **-8** under `en` and
  **-8** under `ar` — its containing block is `margin: 6px auto 0` centred and symmetric,
  so a physical `left` lands in the same place either way. `scan-controls.tsx:111`'s
  `privacyPill` `textAlign: "right"` still paints nothing under `ar`, the same verdict
  cycle 41 reached and for the same reason, re-measured: **1** line, box
  **35…195.7**, text extent **44…186.7** against a content box of **43…187.7**, so the
  text fills its line. Under `en` the same pill now wraps to **2** lines (box
  **146.5…325**, extent **160.5…316**), where `right` IS the reading end and is what the
  `space-between` row wants — so switching it to `end` would change nothing in `en` and
  nothing measurable in `ar`, and it was left alone rather than churned. `scrollWidth ===
  clientWidth === 360` on `/scan` under both. No spec was added for a non-defect.
  **Still open, unchanged:** `app/care/page.tsx`'s `linkBtn` / `otherMerchantsBtn`
  `textAlign: "left"`, mid-session switching on seven of the nine screens, and a real
  phone on all nine.
  **2026-09-29, cycle 53: this item's text half — "no Korean leaks" — is now measured by
  RENDERING rather than by composing, and it holds.** **43** states in each of `en`, `ja`, `zh`
  and `ar` at 360x800, **172** renders, every visible text node and every `aria-label` / `alt` /
  `title` / `placeholder` checked against three Hangul blocks, `<details>` forced open first:
  **0** leaks. The one Hangul string any screen shows is the language switcher's `한국어`, on
  the switcher-open state only, and it is intended — `"한국어": "한국어"` is the value in all
  four dictionaries and the only Hangul-bearing value any of them carries. Pinned by
  `tests/e2e/hangul-leak-sweep.regression-37.spec.ts`. **Still open, unchanged:**
  `app/care/page.tsx`'s `linkBtn` / `otherMerchantsBtn` `textAlign: "left"`, mid-session
  switching on seven of the nine screens, and a real phone on all nine.
- [AI] **The path from `/` to the first merchant link is 4 screens and 6 taps, and no step
  can be cut cheaply.** Measured 2026-09-28 (cycle 50) at 360x800 on a production build,
  `ko` and `en`, survey-only path: **4** screens (`/`, `/survey`, `/report` analysis,
  `/report` picks), **6** taps, **3** required survey fields, and the first merchant link
  needs **0** px of scroll on the picks step in `ko` (box **738.3→783.3** of an **800**
  viewport) and **153** px in `en` (**908→953**). The scan path is the same tail plus
  **3** screens and **3** taps and saves **0** required fields — it pre-selects three
  `고민` chips and `고민` is optional. The cut the cycle looked for does not exist: every
  required field moves the picks (budget **120** of **320** combinations, skin type
  **184** of **320**, category **200** of **200** — `tests/recommend-required-fields.test.ts`),
  and the remaining taps are the entry choice, the submit and the step tab. Pinned as a
  ratchet by `tests/e2e/first-merchant-link-path.regression-36.spec.ts`. What a future
  cycle could still weigh, and this one did not: landing survey-only visitors on the picks
  step instead of the analysis step (it would drop the scan nudge from their first screen,
  so it is a flow decision, not a defect fix), and the **153** px of English copy above
  the first buy button.

  **Appended 2026-09-28 (cycle 51): the scan cannot honestly pre-select 피부 타입, so it
  was not built, and the reason is the oil index's own formula.** The candidate was
  "high `oil` reading → pre-select 지성". `shineIndex` (`lib/skin.ts`) is
  `tzoneSpecular + max(0, (tzoneL - cheekL) / cheekL) * (SHINE_REFERENCE_CHEEK_L / 255)`,
  with `SHINE_REFERENCE_CHEEK_L` **140** and `ATTR_THRESHOLDS.oil` **0.05**/**0.16**. Term
  two is a T-zone-against-CHEEK contrast, so the index rises when the cheeks are DIMMER
  than the T-zone, which is the description of 복합성, not 지성. Computed from the
  committed formula at one specular value: a face whose cheek is as bright as its T-zone
  (`tzoneSpecular` **0.06**, `tzoneL` = `cheekL` = **140**) scores **0.06** — oil level
  **0**, "유분 적음". The same specular with `tzoneL` **170** against `cheekL` **140**
  scores **0.1776470588235294** — oil level **2**, "유분 많음". Reaching level 2 with NO
  T-zone/cheek gap needs `tzoneSpecular` **0.16** on its own, and `buildSignals` fails its
  own 반사 check at `tzoneSpecular >= 0.1`; below that cut the gap ratio must exceed
  **0.10928571428571428** for the index to reach **0.16** (check: `shineIndex(0.0999,
  140 * 1.10928571428571428, 140)` = **0.15989999999999993**). So on a capture that passes
  its own quality signals, `oil >= 2` is evidence of a T-zone/cheek DIFFERENCE, and
  pre-selecting 지성 from it would name the wrong one of the two types it distinguishes.
  `/report` says the same thing in words: all three `explain("oil", …)` strings
  (`app/report/page.tsx:24-26`) are about the **T존**, and the page never states a skin
  type. 민감성 was never a candidate (not visible in a photo), and neither 중성 nor 건성
  has a measured reading behind it.

  **The double-count was measured too, and it is real.** Over all **200** (skin type ×
  category × budget) combinations with no concerns selected, a scan of
  `{oil: 2, redness: 0, pores: 0, confidence: 0.8, retakeRecommended: false}` — which
  `shouldApplyScan` accepts — already changes `recommend()`'s picks in **87** of **200**,
  through the `유분` concern `effectiveConcerns` adds. Forcing `survey.type` to 지성 on
  top of that scan changes the picks in a further **60** of the **160** combinations whose
  type is not already 지성. Both pushes come out of the same `oil` number and land on
  different terms of `scoreSku` (`forTypes` +3, concern +2 and +1.2), so the pre-fill
  would not be a shortcut through an answer the scan already knows — it would be a second
  vote from one reading.

  **Appended 2026-09-28 (cycle 52): all five locales measured, four were below the fold, and
  one layout-only reorder fixed every one.** `ja`, `zh` and `ar` had never been measured.
  Same method as `tests/e2e/first-merchant-link-path.regression-36.spec.ts`, 360x800:
  `ko` **0** px of scroll (box **738.3→783.3** of an **800** viewport), `zh` **18.7**
  (**773.7→818.7**), `ja` **84.3** (**839.3→884.3**), `ar` **145.7** (**900.7→945.7**),
  `en` **153** (**908→953**). Every block above the link was measured per locale and all the
  extra height is copy wrapping: the page header **146.9 → 182.3**, the step tablist
  **49.2 → 64.8** (`ja`/`en`), the "추천 기준" section **96.5 → 120.5** (`en`), and inside the
  first card the name/price row **68 → 112.8** (`en`/`ar`), the highlight chips
  **27.3 → 59.5** (`ar`), the ingredient tags **49 → 82.3** (`ja`/`ar`/`en`) and the merchant
  note **16.7 → 33.3** (`ja`/`ar`/`en`). None of those shortens by moving anything. What did
  move is the one block whose position was arbitrary: "추천 기준" now renders AFTER the
  product grid instead of before it — above the grid it plus its margins occupied **150.5**
  px in `ko`/`zh`/`ja`/`ar` and **174.5** px in `en`. Copy, styles and render conditions are
  byte-identical; only the DOM position changed, and `CommerceDisclosure` did not move.
  First-link box bottoms afterwards: **636.8** (`ko`), **672.2** (`zh`), **737.8** (`ja`),
  **782.5** (`en`), **799.2** (`ar`) — **0** px of scroll in all five. Identical with
  `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`; the disclosure block stays **33.3** px in every
  locale because the longer affiliate sentence still wraps to two lines. **The open part is
  `ar`'s 0.8 px of margin**: the next copy edit above that card's buy button in `ar` pushes it
  back under the fold. regression-36 now covers all **5** locales at budget **0** and prints
  `marginBelow` (**163.2** / **127.8** / **62.2** / **17.5** / **0.8**), so it will say so —
  and when it does, the answer is another layout move, not a shorter disclosure. The two
  candidates cycle 50 listed are still untouched: landing survey-only visitors on the picks
  step, and the English copy above the button.

  **Appended 2026-09-29 (cycle 53): `/care`, the other screen that carries merchant links, was
  measured for the first time and needs 0 px of scroll in all five locales — so nothing was
  changed there.** `/report`'s routine step sends people to `/care` with "제품과 상담 정보
  보기", and until now only `/report` had ever been measured. Same method, 360x800, valid survey
  in session storage: `zh` box **494.5→552.9** (**0** px of scroll, **247.1** px of margin
  below), `ko` **517.7→576.1** (**0**, **223.9**), `ar` **577.1→635.6** (**0**, **164.4**),
  `ja` **581.5→639.9** (**0**, **160.1**), `en` **603.3→661.8** (**0**, **138.3**). `/care` is
  shorter above its link than `/report` because the button sits in the first product row of the
  first section: in `en` the eyebrow **16.5** px, `FlowSteps` **73**, the title **69.6**, the
  lead **46.4**, the section head **33**, the compare-intro row **60.5** and
  `CommerceDisclosure` **33.3** come to **463.3** px before that row, against `/report`'s
  **737.5**. Identical with `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`, disclosure block **33.3** px
  in every locale either way. Pinned by
  `tests/e2e/care-first-merchant-link.regression-38.spec.ts` (**5 passed**, `SCROLL_BUDGET`
  **0** per locale, `marginBelow` printed on every run), which a hard zero suits here in a way
  it does not on `/report`: the tightest locale has **138.3** px of headroom against `ar`'s
  **0.8** px there. Broken two ways — `leadStyle` `marginBottom` 24 → 324 gives **5 failed**
  (`ko` **76.1** px, `zh` **52.9**, `ar` **135.6**, `ja` **139.9**, `en` **161.8**), and moving
  `CommerceDisclosure` below the product rows gives **5 failed** on the disclosure-order
  assertion. Still untouched, from cycle 50: landing survey-only visitors on the picks step,
  and the English copy above `/report`'s button.

  **Appended 2026-09-29 (cycle 54): every `0` above is for a survey with NO `result.note`,
  and a note puts the link back below the fold in 28 of the 35 cases it can appear in.**
  `recommend()` (`lib/recommend.ts`) composes `note` from three independent sentences —
  scan-not-applied (`!scanApplied && scan`), budget-relaxed (`relaxed === "budget" |
  "both"`) and avoid-relaxed (`relaxed === "avoid" | "both"`) — so there are **7**
  note-bearing states per locale, and `/report`'s picks step renders the note ABOVE the
  section header and the grid (`app/report/page.tsx:379`, `noteStyle`). Measured at
  360x800 in all five locales on the same dev server the other specs use, surveys derived
  from the code rather than guessed (budget-relaxed: 세럼 at the **19,000**원 band, whose
  cheapest SKU is **22,000**; avoid-relaxed: 토너 with all seven avoid terms, which no
  toner's `freeOf` satisfies; both: 세럼 with all seven; the scan sentence: a stored scan
  with `retakeRecommended: true`, which `shouldApplyScan` refuses). Scroll needed for the
  first merchant link, by locale, over `none / scan / budget / avoid / both / scan+budget /
  scan+avoid / scan+both`:
  `ko` **0 / 0 / 0 / 0 / 53.9 / 0 / 34.4 / 73.4**;
  `zh` **0 / 0 / 0 / 50.3 / 56 / 0 / 69.8 / 75.5**;
  `ja` **0 / 46.9 / 61 / 126.2 / 159.8 / 100 / 145.7 / 198.8**;
  `ar` **0 / 31.3 / 51.9 / 91.1 / 150.7 / 90.9 / 130.1 / 189.7**;
  `en` **0 / 99.6 / 87 / 176.8 / 222.7 / 145.5 / 235.3 / 281.2**.
  **No layout-only fix was made, and the arithmetic says why.** The note must stay above
  the first product it qualifies — it is the reason those picks differ from what the user
  asked for — so its own height is added height, and the only way to pay for it is to move
  something ELSE from above the grid to below it. Block by block in `en` on the picks step,
  depth-1 children of `main > div`: the page header **182.3** px (**36→218.3**), the step
  tabs **64.8** (**230.3→295.1**), then the note (**178** px at three sentences,
  **299.1→477.1**), then the section-header row **18.5** (**501.1→519.6**), then the grid
  from **533.6**. Cycle 52 already moved the one movable block (추천 기준) below the grid,
  and with the note absent `en` has **4.9** px of margin on this survey — so there is no
  **99.6**-to-**281.2** px anywhere above the button to recover without changing the page
  header, the tabs, the card, or the copy. Recorded and stopped, as the brief's own escape
  clause allows. What a cycle that wants to fix it would have to weigh: shortening the note
  copy (a copy change, forbidden here), or landing note-bearing surveys on the picks step
  with the note as the first block (a flow decision, same shape as the open cycle-50 item
  above).

  **Appended 2026-09-30 (cycle 57): every px figure in this item was re-measured on the
  production server the gate has used since cycle 56, and not one digit moved.** Cycles 52,
  53 and 54 measured the fold through `playwright.mobile.config.ts` when its
  `webServer.command` was `npm run dev` — `git show 1165b91:playwright.mobile.config.ts` and
  `git show 40da7d6:playwright.mobile.config.ts` both print `command:` … `npm run dev --
  --hostname ${host} --port ${port}` — while cycle 50's `ko`/`en` pair was a hand-run
  `npm run build` + `next start`, as its changelog entry states. Cycle 56 switched the
  config to `next build` + `next start`, which left those numbers quoted as current without
  saying which server produced them. Re-run here on the production default, `regression-36`
  and `regression-38` together,
  **10 passed (37.3s)**: `/report` box bottoms **636.8** (`ko`), **672.2** (`zh`), **737.8**
  (`ja`), **782.5** (`en`), **799.2** (`ar`) with `marginBelow` **163.2** / **127.8** /
  **62.2** / **17.5** / **0.8**, and `/care` **517.7→576.1** (`ko`, **223.9**),
  **494.5→552.9** (`zh`, **247.1**), **577.1→635.6** (`ar`, **164.4**), **581.5→639.9**
  (`ja`, **160.1**), **603.3→661.8** (`en`, **138.3**) — identical to the dev figures above,
  every one of the ten boxes and ten margins. `scrollNeeded` is **0** in all ten cases, so
  no locale is below the fold on production and there is no product finding to fix. **`ar`'s
  0.8 px is a production fact now, not a dev artefact, and the open item above stands
  unchanged.** The budget stays a hard **0**: `neededScroll <= 0` is the property the spec
  exists to assert, and a budget with slack in it would pass a link that is partly below the
  fold. Proved a live tripwire rather than a formality by adding **10** px to the
  `marginBottom` of `/report`'s section-header row above the grid and re-running on
  production — **1 failed** then **4 passed (34.0s)**, `ar: the first merchant link needs
  9.2px of scroll (box 764.2→809.2), budget 0`, ko/zh/ja/en still at **0** (`marginBelow`
  **153.2** / **117.8** / **52.2** / **7.5**) — then reverted and `app/report/page.tsx`
  compared
  byte-for-byte (sha256 `19263733f86d7a5f1f4a741edde35f1f2c003e1cfe2b01d21962631330bab3b8`
  before and after). Not established: the `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` half. Both
  specs were re-run on production with the flag set (**10 passed (37.5s)**, same geometry),
  but `lib/commerce.ts:130` reads `process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE` and
  `grep -rho '"on"===' .next/static/chunks/` shows it surviving into the client bundle as a
  runtime `process.env` lookup rather than an inlined literal, so whether the flag reached
  the browser under a production build was not shown and the affiliate claim still rests on
  the cycle 52/53 dev measurements.
- [~] [AI] **Cycle 51's unnamed vitest failure did not reproduce in 25 runs; the clock
  mechanism that produces its line is fixed, the diagnosis is still open.** Opened
  2026-09-28 (cycle 52). `npx vitest run` was run **25** times on `11e6c4f` with full
  output kept per run — **6** cold (`node_modules/.vite` and `node_modules/.vitest` removed
  first), **7** warm, **7** `--sequence.shuffle`, **2** concurrent processes, **2**
  `--reporter=json`, **1** cold under six busy-loops — and every one printed **Test Files
  119 passed (119) / Tests 1087 passed (1087)**. What WAS found and fixed: vitest's
  `testTimeout` default is **5000** ms and **3** tests carry no timeout of their own while
  running long enough to race it. At `--testTimeout=5000` under twelve busy-loops,
  `tests/cheek-clipping-signal.test.ts > … > puts the cut below every capture whose published
  cheek level has moved` (**8462ms**), `tests/blemish-plateau-census.test.ts > … > reports no
  tie on a frame with real pixel noise, at any frame size or noise level` (**7141ms**) and
  `tests/ita-guard-decision.test.ts > … > is never entered by a capture: 121 blue gains step
  straight over it` (**6489ms**) all raise `Test timed out in 5000ms` with **0** assertion
  failures. `vitest.config.ts` now sets `testTimeout: 60_000`, pinned by
  `tests/vitest-timeout-budget.test.ts`. **What stays open:** whether that was cycle 51's
  failure. Its name was never captured and it did not reproduce here, so the mechanism is
  recorded as the one that reproduces the signature, not as the diagnosis. The candidates
  ruled out along the way, so a future cycle does not redo them: **0** `setTimeout`,
  `await new Promise` or `useFakeTimers` in `tests/*.test.ts`; nothing asserts a duration by
  default; `performance.now` in **1** file and `Math.random` in **2**; **0** of the **10**
  `readdirSync` call sites walk `tests/`, so the cycle-20 lint race against
  `tests/.blemish-perturb-tmp/` has no in-vitest twin, and two concurrent vitest processes
  sharing that directory both passed; `process.env` writes exist in **6** test files but
  `pool` is `forks` and `isolate` is `true` by default (both confirmed from vitest's own
  docs), so they cannot leak between files, and the 7 shuffle runs are the check that they do
  not leak within one. The one candidate class left unexamined is anything that depends on
  the wall-clock DATE rather than on elapsed time — `Date.now()` appears in the re-engage and
  funnel tests, all of it as offsets from now rather than as absolute dates, read but not
  proven safe across a day or month boundary.
- [~] [AI] **Two user-facing states the Korean-leak sweep could not render, so "0 leaks" does
  not cover them.** Opened 2026-09-29 (cycle 53) by
  `tests/e2e/hangul-leak-sweep.regression-37.spec.ts`, which renders **43** states in each of
  `en`/`ja`/`zh`/`ar` (**172** renders) and finds **0** leaks plus one intended `한국어`.
  (a) `/scan`'s own result card, `app/scan/result-card.tsx`. `phase === "result"` follows a real
  capture and the canvas `captureStream()` shim cannot produce a face, so seeding `gyeol_reads`
  leaves `/scan` on its intro screen — **28** text nodes and **466** characters, the same as a
  cold `/scan`. It renders the FULL `retakeReasons` list where `/report` shows `slice(0, 3)`,
  and `t(extra.note)` for both extra reads, so it is the one screen that can show a retake
  reason past the third. Either a real capture fixture or a `phase` override reachable from a
  test would settle it; do not add a production code path just to test it.
  (b) The error boundary, `app/error.tsx`. A stored reading that passes `isScanReads` with
  wrong-shaped `signals` did NOT throw — `/report` rendered its no-reads state at **42** nodes /
  **379** characters, identical to `/report` with no survey — so nothing in this container has
  ever rendered that boundary in a non-Korean locale. All four of its strings are `t("…")`
  literals, so `tests/i18n-coverage.test.ts` sees them; what is unmeasured is the LAYOUT, not
  the translation. Also still uncovered and deliberately so: the LLM `narrative`, which
  `localizedNarrative` returns only under `ko`.
- [~] [AI] **The smoke gate's two newest specs cost 5.8m of it, and 2.2m of that has been
  taken back. What is left is the four locales' serial repetition, and running them
  concurrently was measured and REJECTED.** Opened 2026-09-29 (cycle 54).
  `tests/e2e/hangul-leak-sweep.regression-37.spec.ts` plus
  `tests/e2e/care-first-merchant-link.regression-38.spec.ts` ran **9 passed (5.8m)** on
  `fd09407` in this container, against a whole `npm run smoke` of **17.7m** on the same box
  (the supervisor read **15.1m** for that commit on theirs, so only same-box pairs are
  subtractable). After the change they are **9 passed (3.6m)** and smoke is **15.8m**. Timed phase by phase over the sweep's **172** renders the loop
  spent **306,244** ms, of which `networkidle` was **110,395** and a flat 300 ms sleep
  **53,060** — against `page.goto` **60,229**, the `document.fonts` wait **5,245** and the
  collect **6,309**. Replacing both with `settle()` (the non-empty text-node count holds
  still for **250** ms, the locale chunk has landed, the fonts are in) is what this cycle
  took back. **What is NOT taken back, and why the obvious lever is closed:** sweeping the
  four locales concurrently in one test — the only way to parallelise them, since
  `playwright.mobile.config.ts` pins `workers: 1` so the geometry and timing specs are
  never run beside each other — makes `/scan ready` render **23** non-empty text nodes
  where it renders **41** serially, and that state took **30,263** ms instead of
  **5,761**: four MediaPipe runtimes do not fit on four cores, and a gate that sweeps
  fewer strings when the box is busy is worse than a slow one. Measured, not reasoned.
  What a later cycle could still weigh: `/scan ready` alone is the sweep's most expensive
  state at **4,655** / **4,686** / **4,643** / **4,844** ms (en / ja / zh / ar on the final
  tree) with the camera shim running, and the **43** states are the same **43** in every
  locale, so a cheaper design would have to make the states themselves cheaper rather than
  overlap them.
- [x] **`/report`'s routine step has a 13x15 checkbox, under both the 24x24 AA floor and
  `--tap-min`.** **Actioned 2026-09-30 (cycle 59): the `<label>` is the target, measured
  and not assumed, so no product change.** At 360x800 on a production build the label is
  **244x44** in all five locales (`--tap-min` reads **44**), against the input's
  **15x15** (`ko`, `zh`), **13.046875x15** (`en`) and **13x15** (`ja`, `ar`) — so the
  target clears the **24**x24 AA floor on both axes and meets the **44** contract on
  height. Six probe clicks per locale — the four inner corners 3px in, the far end from
  the input, and the midpoint — each flipped `checked`, in both directions, in all five
  locales; `document.elementFromPoint` at those points returned `label` or its `span`,
  never anything outside the label. The reading is the same one cycle 49 applied to the
  `/scan` consent checkboxes. `tests/e2e/reengage-optin-label-target.regression-39.spec.ts`
  ratchets it, and broke **5 failed** twice: the label's `minHeight` set to **0** gives
  **18.75** (`ko`) / **37.5** (`en`) / **37.5** (`ja`) / **18.75** (`zh`) / **37.5** (`ar`),
  and `display: "inline"` gives **15** / **39** / **39** / **15** / **39**. One method note
  for whoever measures a target by clicking it: Playwright's `boundingBox()` is not
  scroll-adjusted, so a first pass that clicked the label's un-scrolled page coordinates
  recorded a `NOCHANGE` on each of its **25** clicks, with `elementFromPoint` = `none`. That was
  the probe missing the viewport, not the label failing to toggle;
  `scrollIntoViewIfNeeded()` first is what makes the result mean anything. Found
  2026-09-28 (cycle 50) by extending cycle 49's target sweep to
  `/report`'s other two steps: the `ReengageOptIn` checkbox measures **15x15** under `ko`
  and **13x15** under `en`, against SC 2.5.8's **24**x24 (AA) and `--tap-min` **44**. Not
  fixed here because it is outside the four screens this cycle was scoped to and because
  the `/scan` consent checkboxes are the same shape and cycle 49 cleared them on the
  Spacing/label-is-the-target reading (README, "Target size") — whoever takes this has to
  decide whether the surrounding `<label>` is the real target here too, and measure it,
  rather than resizing the input on sight. Everything else on the same sweep was clean:
  **0** of **284** controls without an accessible name, **0** unlabelled form controls,
  **0** of **6** images without `alt`/`aria-hidden`, **0** of **904** text nodes under
  their contrast floor across **22** screen x locale pairs.
- [AI] **Two contrast questions cycle 51 measured and did NOT act on.** (a) SC 1.4.11
  Non-text Contrast asks for **3**:1 on "[v]isual information required to identify user
  interface components and states". `--line` **#dcdcdc** is the border of the outlined
  buttons and cards on every screen and is **1.3713058806238527**:1 on `--paper` and
  **1.2578122331668762**:1 on `--surface-tint`. Whether those borders are *required to
  identify* the control is the open question — most of them wrap a visible text label,
  which is the usual argument that they are not — and moving `--line` is a change to
  every divider on every screen, which is a design decision and not a defect fix. Not
  established either way here. The decorative fills are fine on the same SC: `--blue`
  **#2f6de0** is **4.789395592096463**:1 on `--paper` and **4.393009940622331**:1 on
  `--surface-tint`. (b) `/checkin`'s disabled submit puts `--muted` **#767676** on
  `--surface-tint` **#f5f5f5** = **4.166295937845939**:1, the same pair as `/survey`'s and
  excused by the same SC 1.4.3 Incidental sentence — but cycle 51's render reached that
  state on `/survey` only (`button.disabled === true`, rgb(118, 118, 118) on rgb(245, 245,
  245)); on `/checkin` the card needs a product-use record first and the run did not
  produce one, so that one rests on reading `app/checkin/page.tsx:225` and not on a
  render. `tests/contrast-matrix.test.ts` carries both as `EXEMPT` and says which is
  which.

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
  on its own.

  **2026-09-30 (cycle 60): all five funnel screens are now counted, and two of the
  numbers above need reading with a correction.** `docs/first-load-js.md` has the method,
  the exact commands and the full per-route chunk listing. What a browser downloads before
  the page is interactive, `gzip -9` per file and summed: `/` **672119** raw / **201102**
  gzipped, `/survey` **667597** / **200355**, `/scan` **720028** / **218841**, `/report`
  **714373** / **215103**, `/care` **678806** / **203251**. The English dictionary is
  **82569** raw / **28307** gzipped of every one of the five, so the cost this item
  describes is not `/`-only — it is the whole path. And cycle 40's own figures counted a
  `noModule` polyfill chunk (`0cz1d0mv5g_q7.js`, **112594** raw / **39392** gzipped) that
  the container's Chromium skipped on all ten rows of a Playwright run, so `/`'s
  **1050358** → **783030** raw and **322373** → **240097** gzipped are each that much
  larger than what the browser fetched. The saving cycle 40 measured is unaffected: the
  chunk is on both sides of it. Nothing about the fix changes — it is still the
  per-locale-URL decision, still the owner's.

- [AI] **Nothing else on the funnel path is worth moving behind a dynamic `import()`, and
  there is no first-load ceiling in the gate.** Opened 2026-09-30 (cycle 60), which looked
  for a module a funnel route ships on first load but does not render or run before the
  first user action, at a bar of **20480** bytes gzipped. Nothing clears it, so no product
  code changed. Exactly four first-load files anywhere on the path are over that bar and
  all four are accounted for: React/react-dom (**72373** gzip) and the app-router client
  (**38480**) both run at hydration; the `noModule` polyfill (**39392**) is not downloaded;
  the English dictionary (**28307**) is the language the server rendered and belongs to the
  item above. The two obvious libraries are already lazy —
  `app/components/share-card.tsx:62` awaits `import("html-to-image")` and
  `app/scan/create-landmarker.ts:6` awaits `import("@mediapipe/tasks-vision")`. The one
  genuine ships-but-does-not-run-until-a-tap module, `lib/skin.ts` (**67485** bytes of
  source), lands in chunks whose WHOLE gzipped size is **12631** on `/scan` and **19345**
  on `/report`, so it is under the bar on both even counting its chunk-mates as if they
  were part of it — and moving it would sit inside `/scan`'s capture path. What is left
  open, and what a cycle could do without the owner: (a) no ceiling is pinned anywhere, so
  any of these numbers can drift upward with nothing noticing — a unit test over the
  prerendered HTML's `<script src>` set would catch it, and `docs/first-load-js.md` has the
  command it would be built from; (b) per-module attribution inside a chunk was bounded by
  the chunk total rather than measured, because Turbopack emits no module ids into the
  output (`grep -o '\[project\]/[^ "]*'` over the four largest chunks returns nothing);
  (c) nothing here measures parse or time-to-interactive on a real phone, which is what the
  weight is a proxy for.

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
  **2026-09-27, cycle 46: two more hosts refuse and the `api.github.com` line above is
  now wrong.** `static.googleusercontent.com` and `google.github.io` both give
  `curl: (56) CONNECT tunnel failed, response 403`, so Google's rater guidelines PDF is
  out of reach along with `developers.google.com` and `support.google.com`. And
  `api.github.com` no longer answers a general query: `search/repositories` returns
  `http=403` with `"This GitHub API path is not available: sessions are bound to their
  configured repositories. Use repository-scoped endpoints (repos/{owner}/{repo}/...)."`
  `raw.githubusercontent.com` still serves any public repository's files
  (`google/robotstxt` README, `http=200 bytes=5282`), and a blobless `git clone --depth 1
  --filter=blob:none --no-checkout` of a public repository works and costs **524K** of
  `.git`, which is how cycle 46 searched `GoogleChrome/web.dev`'s **3987** paths without
  downloading it. So a cycle can read a named file out of a known public repository and
  cannot search GitHub for one.
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

- [x] **2026-09-29 — `/care`'s DOM was not replaced between a `waitFor` and the next read;
  the wait matched a button the read cannot see (cycle 54 review).** **Actioned 2026-09-29
  (cycle 55): named, reproduced, and fixed in the spec — it was a `next dev` artifact, not a
  product flicker.** `page.locator(css)` pierces open shadow roots and
  `document.querySelectorAll(css)` does not. `next dev` mounts `<nextjs-portal>`, whose
  shadow root holds exactly **1** button and it carries `aria-controls`
  (`#next-logo[aria-controls="nextjs-dev-tools-menu"]`). At the instant the helper waited,
  Playwright saw **4** matches where the light DOM held **3**. On `/care` with no survey —
  the fallback page, which renders **0** app toggles — the old wait still resolved in
  **203** ms against `root=NEXTJS-PORTAL #next-logo`, which is the cycle 54 failure
  signature exactly: the wait passes, the `querySelectorAll` that follows returns **0**.
  Nothing was replaced: the MutationObserver recorded one `mut +3 -0` per load and never a
  removal, `performance.getEntriesByType("navigation")[0].type` stayed `navigate`, and the
  init script ran once per load. Fixed by waiting on the DOM the assertions read. Full
  numbers in the cycle 55 entry.

  Original finding, for the record: `tests/e2e/care-merchant-disclosure.regression-12.spec.ts:36`
  failed as test 6 of 300 in cycle 54's first smoke — `no merchant disclosure rendered; the
  fixture reached the wrong page`, `Expected: > 0 / Received: 0` — after
  `page.locator("button[aria-controls]").first().waitFor()` had just passed, while the
  failure snapshot showed three toggles. A Next dev full reload was the leading guess and it
  was not shown.

- [x] **2026-09-27 — neither claim list covers "reduce / control / minimise" (cycle 46
  review).** **Actioned 2026-09-27 (cycle 47): the verbs added in all five languages,
  and what the additions cost measured rather than asserted.** `lib/recommend.ts`
  gains 감소 / 예방 / 억제 (Korean, so `efficacyClean()` covers all five locales);
  `BANNED_BY_LANG` gains reduce / control / minimise / minimize / prevent / fade /
  brighten / firm in `en`, 減少 / 予防 / 抑制 / 引き締め in `ja`, 减少 / 预防 / 抑制 in
  `zh`, and تقليل / يقلل / وقاية / يمنع / تفتيح in `ar`. `tests/claim-filter.test.ts`
  **8 passed → 12 passed**, broken three ways at **1 failed | 11 passed** each.
  **Nothing on a reason path trips them**, checked by enumeration and not by reading:
  **100** pre-approved reason templates (4 surveys × 2 scan states × 5 languages × the
  picks each returns) and **95** heroNotes (19 distinct ingredient pairs × 5 languages)
  all pass both gates, and both guide pages give **0** hits for the new English group.
  **What it does cost is one SKU name**: the same sweep over all **110** (SKU name ×
  language) pairs moves from **6** rejected to **7**, the newcomer being `en:
  Brightening Calming Spot Serum` on `brighten` — so if an LLM echoes that product's
  name the candidate is refused and the pre-approved template shows instead. The other
  **6** are pre-existing (`sooth` / 舒缓 / 淡斑). **The legal question stays open and is
  labelled as such in both files**: every primary source refused this container, so the
  additions rest on the lists' own internal logic (a verb claiming to change a
  condition is the concept class of 개선 and 완화, already banned) and on the header's
  stated asymmetry, NOT on a reading of 화장품법. The owner should still put the list in
  front of counsel. Two blunter entries were rejected on measurement: bare `منع` fires
  on `منعش` (the catalogue's word for 산뜻) and bare `شد` on `الشد` (the care tip for
  밤사이 당김); both near-misses are now pinned as must-pass cases. Full numbers in the
  cycle 47 entry.

- [x] **2026-09-26 — the first visit after a MediaPipe upgrade pairs new code with the
  cached old runtime (cycle 44).** **Actioned 2026-09-26 (cycle 45): the versioned
  directory, from one source of truth, plus a prune on both sides.** The runtime is
  copied to `public/vendor/mediapipe/<version>/wasm` and
  `app/scan/landmarker-config.ts` builds its URL from `app/scan/mediapipe-version.ts`,
  which `scripts/copy-mediapipe-assets.mjs` writes in the same pass as the copy, so no
  install can separate them. The cache name was NOT used: it is a static file with no
  build step to inject a version into, and renaming it would make every warm visitor
  re-download the whole runtime on a deploy that changed nothing (cycle 44's own
  finding). **What the skew actually does was measured first, and it is less than the
  finding assumed.** Four pairings ran a real `FaceLandmarker` in Chromium against the
  committed `face_landmarker.task`: matched **0.10.35**, matched **1.0.1**, new JS
  **1.0.1** on cached runtime **0.10.35**, and new JS **0.10.35** on cached **0.10.34**
  — all four built the graph and returned a result object, **0** page errors. There is
  no version handshake to fail: the bundle looks up `self.ModuleFactory` and calls
  Emscripten exports off what it returns, and `grep -o "0\.10\.[0-9]*"` finds **0**
  version strings in either half of 0.10.35. The fix is worth having anyway because
  nothing detects the pairing that does break — from 0.10.35 to 1.0.1 the glue gains
  **9** symbols and the bundle calls **6** of them that 0.10.35 does not have — and
  because MediaPipe's own documented setup has the same shape (below, Research).
  Old versions do not accumulate: the copy script removes every other directory under
  `public/vendor/mediapipe/`, and `public/sw.js` drops cache entries under another
  version once one is asked for. Full numbers in the cycle 45 entry.

  Original finding, for the record: `scripts/copy-mediapipe-assets.mjs` copies the
  package's `wasm/` to the unversioned path `/vendor/mediapipe/wasm` at `postinstall`.
  The `@mediapipe/tasks-vision` JS is bundled by the build, and `public/sw.js` answers the
  runtime from `aru-mediapipe-v1` before it revalidates (cycle 44). So on the first
  capture after a version bump, a warm visitor runs the new API against the old runtime,
  and only the second visit is consistent. Whether 0.10.x tolerates that skew is unknown.
  Cheapest fixes to weigh:
  - copy into a versioned directory (`/vendor/mediapipe/<version>/wasm`) and point
    `landmarker-config.ts` at it;
  - or put the package version into the cache name.
  Either way, pin it with the `tests/sw-mediapipe-revalidate.test.ts` harness.

- [x] **2026-09-25 — a tap during the English interval is thrown away (cycle 40).**
  ~~Actioned 2026-09-26 (cycle 42): (b) + (c), not (a).~~ Measured first on a production
  build at 360x800, navigation start → `html[lang]` becoming the saved locale, three runs
  each: unthrottled `/scan` **390.4 / 375.9 / 370.2** ms (ja), **374.3 / 384.5 / 349**
  (zh), **346.4 / 356.8 / 367** (ar); under a CDP `Network.emulateNetworkConditions`
  profile of latency **562.5** ms, download **180000** B/s, upload **84375** B/s,
  **4223.8 / 4224.7 / 4223.6** (ja), **4063.2 / 4065 / 4056.9** (zh), **3921.1 / 3932.1 /
  3925.6** (ar). `ko` and `en` reach the same point at **3148.7** and **3139.8** ms under
  the same profile, so the window a tap can be lost in is that gap — about **1.1 s**, not
  the ~0.4 s an unthrottled box suggests. Reproduced with a real hit-tested mouse click at
  3400 ms: accepted, camera started, and after the remount the checklist was **0** with
  the start button visible again in all three locales.
  (a) was rejected on the grep the finding asked for: `t()` reads a module singleton, so a
  component has to subscribe to the context to re-render on a change, and almost none do —
  `grep -rl "useLang\b\|useLanguage\b" app/ --include=*.tsx` lists **4** files
  (`app/components/language-switcher.tsx`, `app/unsubscribe/unsubscribe-form.tsx`,
  `app/care/page.tsx`, `app/privacy/page.tsx`) against **30** that `grep -rl 't("'` finds. (b) shipped — the chunk fetch now
  starts at module evaluation — and it only shrinks the window, by **360.0 / 250.7 /
  134.7** ms on `/scan` (ja/zh/ar medians of three) and **52.0 / 43.0 / 26.3** ms on `/`.
  (c) is what closes it: while `active !== saved` the provider marks `<body>` `inert`,
  `aria-busy` and `data-aru-lang-pending`, the last dimming the controls to opacity
  **0.55** through one rule in `app/globals.css`. A tap inside the window is now refused
  rather than swallowed, and the page is in its pre-tap state when the remount lands.
  `ko`/`en` never match any of it: `/` and `/scan` geometry under both locales is
  byte-identical before and after (`diff` clean), including **199** and **105** DOM nodes
  and `class` as the only body attribute. Pinned by
  `tests/e2e/lang-chunk-tap-hold.regression-30.spec.ts` (**3 passed**), broken three ways
  at **1 failed | 2 passed** each. Full numbers in the cycle 42 entry.
  **What stays open:** during the hold nothing on the page responds, the language switcher
  included, so a visitor who wants to switch away mid-load has to wait out the interval.
  That is a deliberate trade against discarding the action, and it is the one thing here
  nobody has put in front of a user.

  Original finding, for the record:
  `LanguageProvider` renders English until a `ja`/`zh`/`ar` dictionary chunk lands, then
  remounts the whole subtree under `key={active}` (`lib/i18n.tsx`). Any state a visitor
  created in between is discarded. On `/scan` that is the camera start: with the `ja`
  chunk delayed 3000ms, a `scan-start` tap in English ended back on the start button
  with no quality checklist (supervisor probe, cycle 41 review). Before cycle 40, the
  same remount followed hydration directly, because the saved language came from a
  synchronous store. That is read from the code, not measured. Options for
  the cycle that takes it:
  - (a) Re-render without remounting. This only works if every `t()` call site re-runs
    on a context change; measure that first.
  - (b) Start the dictionary fetch before hydration, which shrinks the window but does
    not close it.
  - (c) Hold interactive controls until `active === saved`.
  Pin the fix with a spec that delays the chunk the way the probe did. Do not merge a
  fix that only makes the window shorter without saying so.

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

- 2026-09-30 (cycle 60) — Branch `autopilot/2026-09-30-1839`. **All five screens on the
  path to the first merchant link now have a first-load JS number, and the measurement
  found a flaw in cycle 40's method rather than a module to move. What the browser
  downloads before the page is interactive: `/` **672119** bytes raw / **201102** gzipped,
  `/survey` **667597** / **200355**, `/scan` **720028** / **218841**, `/report` **714373** /
  **215103**, `/care` **678806** / **203251**. Cycle 40 counted a `noModule` polyfill chunk
  of **112594** raw / **39392** gzipped that a modern browser skips, so its **783030** /
  **240097** for `/` is that much larger than what a visitor fetched. Nothing on the path
  clears the 20 KB-gzipped bar for a dynamic `import()`, so `app/`, `lib/`, `public/` and
  `ml/` are untouched and no test was added.**

  **The method, and the one place it had to differ from cycle 40's.** Turbopack prints no
  first-load column, so the numbers come from the `<script src>` set in the prerendered
  `.next/server/app/<route>.html`, raw bytes summed and each file gzipped at level 9 and
  summed — cycle 40's method exactly, which is what makes `/` comparable across twenty
  cycles. The difference is that cycle 40 took every `<script src>`; this cycle also read
  the tag's attributes, and one of the thirteen on `/` carries `noModule`. Both figures are
  in `docs/first-load-js.md` with the exact commands so the next cycle can re-run either.
  On cycle 40's own method, unchanged, this tree reads:

  ```
  index scripts=13 raw=784713 gzip=240494
  survey scripts=13 raw=780191 gzip=239747
  scan scripts=14 raw=832622 gzip=258233
  report scripts=14 raw=826967 gzip=254495
  care scripts=13 raw=791400 gzip=242643
  ```

  `/`'s **784713** raw against cycle 40's **783030** is **1683** bytes of drift over twenty
  cycles. The split cycle 40 made still holds: the ja, zh and ar dictionary chunks
  (`2ju8yzfndwcag.js` **91733** raw / **29230** gzip, `1v0h5r-biq8qi.js` **77159** /
  **27187**, `3v8lhb0_stdmj.js` **100349** / **29691**) are referenced from no prerendered
  HTML at all.

  **The `noModule` finding, which is a correction to the measurement and not to the
  product.** `0cz1d0mv5g_q7.js` is **112594** raw / **39392** gzipped and is tagged
  `noModule` in all five documents — it is the legacy-browser polyfill bundle, and a
  browser with ES-module support never requests it. So cycle 40's **1050358** → **783030**
  raw and **322373** → **240097** gzipped for `/` are each **112594** raw and **39392** gzip
  above what the browser actually fetched. The saving cycle 40 measured is unaffected,
  because the chunk sits on both sides of it. Nothing needs fixing: dropping the chunk would
  save a modern browser nothing, since it never asks for it, and would remove the only
  reason it exists. The backlog item and `README.md` now both carry the correction beside
  the old numbers rather than replacing them.

  **Checked in a real browser, not only in the HTML.** A throwaway Playwright run at
  360x800 against `npx next start` on port **3108** loaded each route, recorded every
  script response, and split them into the ones the document references and the ones that
  arrive after. Two storage states, `empty` (a first-time visitor) and `aru.lang=ko`:

  ```
  [first-load] empty / url=/ lang=en docScripts=13 downloadedFromDoc=12 raw=672119 gzip=201102 | extraAfter=3 extraRaw=138027 extraGzip=46986
  [first-load] empty /survey url=/survey lang=en docScripts=13 downloadedFromDoc=12 raw=667597 gzip=200355 | extraAfter=3 extraRaw=142549 extraGzip=47733
  [first-load] empty /scan url=/scan lang=en docScripts=14 downloadedFromDoc=13 raw=720028 gzip=218841 | extraAfter=1 extraRaw=47320 extraGzip=14997
  [first-load] empty /report url=/survey lang=en docScripts=14 downloadedFromDoc=13 raw=714373 gzip=215103 | extraAfter=4 extraRaw=185347 extraGzip=61983
  [first-load] empty /care url=/care lang=en docScripts=13 downloadedFromDoc=12 raw=678806 gzip=203251 | extraAfter=3 extraRaw=138027 extraGzip=46986
  [first-load] ko / url=/ lang=ko docScripts=13 downloadedFromDoc=12 raw=672119 gzip=201102 | extraAfter=3 extraRaw=138027 extraGzip=46986
  [first-load] ko /survey url=/survey lang=ko docScripts=13 downloadedFromDoc=12 raw=667597 gzip=200355 | extraAfter=3 extraRaw=142549 extraGzip=47733
  [first-load] ko /scan url=/scan lang=ko docScripts=14 downloadedFromDoc=13 raw=720028 gzip=218841 | extraAfter=1 extraRaw=47320 extraGzip=14997
  [first-load] ko /report url=/survey lang=ko docScripts=14 downloadedFromDoc=13 raw=714373 gzip=215103 | extraAfter=4 extraRaw=185347 extraGzip=61983
  [first-load] ko /care url=/care lang=ko docScripts=13 downloadedFromDoc=12 raw=678806 gzip=203251 | extraAfter=3 extraRaw=138027 extraGzip=46986
  ```

  `downloadedFromDoc` is `docScripts` minus **1** on all ten rows and the `raw` / `gzip`
  pairs are byte-identical to the noModule-dropped table, which is what establishes that
  the skipped file is the `noModule` chunk and that the HTML-derived number is right. `ko`
  and `empty` download the same bytes on every route — Korean needs no dictionary and
  English is a static import, so the product's own market pays the English dictionary and
  gains nothing for its own language. `lang=en` under `empty` and `lang=ko` under `ko`
  confirm the two states really differed rather than both falling back. The brief asked for
  `ko` AND an empty storage state; those are two different states in this product
  (`lib/i18n.tsx` makes English the first-visit default), so both were run rather than one
  guessed at.

  **`/report` on an empty storage state reports `url=/survey`.** With no stored result it
  redirects. The bytes above are `/report`'s own document, fetched before the redirect,
  which is what a visitor who lands on `/report` pays. `extraAfter` is the app router
  prefetching linked routes after hydration and is reported separately because it is not
  first-load weight.

  **The three largest chunks are the same three files on every route.**
  `0i7h8_tk58lvw.js` **232787** raw / **72373** gzip is React and react-dom
  (`grep -o -F react-dom` **1** hit, `createRoot` **2**, `useMemo` **13**, `Fragment` **8**); `11oof8oxnxiv9.js` **141598** /
  **38480** is the app-router client (`Router` **33**, `prefetch` **49**);
  `39680g4crf4zr.js` **82569** / **28307** is the English dictionary
  (`Turn camera back on` **1** hit, the ja/zh/ar equivalents **0** each). The `noModule`
  chunk would be third by size and is excluded because it is not downloaded. The largest
  route-specific files are `/scan`'s `0nbqz_u5xt-55.js` **62927** / **20105**, `/report`'s
  `05nl_w77jzrvo.js` **55225** / **19345**, `/care`'s `1lid53sf9e4no.js` **54007** /
  **17146**, `/` `0o58hq7nka77u.js` **47320** / **14997** and `/survey`'s
  `10ajzjvbtk999.js` **42798** / **14250**.

  **Why no product code changed.** The bar was a module a route ships on first load but
  does not render or run before the first user action, at **≥ 20 KB gzipped** = **20480**
  bytes. Exactly four first-load files anywhere on the path are over it and every one is
  accounted for: react-dom (**72373**) and the app-router client (**38480**) both run at
  hydration; the `noModule` polyfill (**39392**) is not downloaded; the English dictionary
  (**28307**) is the language the server rendered, so it is not unrendered — and it is the
  owner's URL decision, which the brief put out of scope. The two obvious libraries are
  already lazy: `app/components/share-card.tsx:62` awaits `import("html-to-image")` inside
  the share handler and `app/scan/create-landmarker.ts:6` awaits
  `import("@mediapipe/tasks-vision")`. The largest route-specific file, `/scan`'s
  **20105** gzip, is **375** bytes under the bar as a WHOLE chunk and holds several modules
  (`getUserMedia` **2** hits, `landmark` **8**, `consent` **4**), so nothing inside it is
  near.

  **The one real candidate, and why it does not qualify.** `lib/skin.ts` is the analysis
  runtime, **67485** bytes of source per `wc -c`, reaching `/scan` through
  `app/scan/use-capture-analysis.ts:13`-`18` and `/report` through `app/report/page.tsx:14`, and
  nothing in it runs until the visitor captures a frame — a genuine ships-but-does-not-run
  module. Grepping its `CHEEKS` landmark array
  (`50,101,118,117,116,205,36,280,330,347,346,345,425,266`) across `.next/static/chunks`
  puts it in `2rkq86eu5t2oh.js` on `/scan` and `05nl_w77jzrvo.js` on `/report`, chunks whose
  WHOLE gzipped size is **12631** and **19345** bytes. So it is under the **20480**-byte bar
  on both routes even if its entire chunk were counted as `lib/skin.ts`, and moving it would
  also sit inside `/scan`'s capture path, which the brief fenced off. Measured, not assumed:
  the same grep over `/`'s twelve downloaded chunks returns nothing, so `lib/skin.ts` is not
  on the landing page's first load at all.

  **No change, therefore no regression test and no break to prove.** The brief made the
  test conditional on making a change ("If you do make a change, add a regression test"),
  and there is no change, so there is nothing whose saving a test could pin. A ceiling on
  numbers this cycle did not move would be a new contract rather than a guard on this
  cycle's work, and it is filed as open backlog instead, with the command it would be built
  from. `git diff ba67ed0 --stat -- app lib public ml tests scripts package.json
  package-lock.json playwright.mobile.config.ts next.config.ts` prints nothing: this cycle
  is three docs and nothing else.

  **What this does NOT establish.** Every `gzip` figure is `gzip -9` over the file on disk,
  summed per route, which is cycle 40's method and comparable with it — it is not what
  `next start` puts on the socket and it is not Brotli, which a real CDN would serve.
  Nothing here measures parse, compile or time-to-interactive, on this container or on the
  mid-range phone the item is about; weight is a proxy for the cost, not the cost. The
  `noModule` skip was observed in the container's Chromium only. Per-module attribution
  inside a chunk is bounded by the chunk total rather than measured, because Turbopack emits
  no module ids into the output (`grep -o '\[project\]/[^ "]*'` over the four largest chunks
  returns nothing). One build, one Playwright run per route per state, so no figure carries
  a variance estimate. And only the five funnel routes were measured: `/checkin`,
  `/privacy`, `/reco`, `/studio`, the two `/guide/*` pages and the research-mode `/eval`,
  `/ops` and `/pilot` were not.

  **ML:** skipped this cycle, as the item said to. `python3 ml/selftest.py` was still run
  and is green (below).

  **Rotation.** Cycle 57's entry (**177** lines) moved verbatim to the end of
  `docs/autopilot-changelog.md`, after cycle 56; `cmp` of the extracted block against
  changelog lines **12820**–**12996** reports no difference. `sort -u` over both files at
  `ba67ed0` gives **13176** unique lines and over this pair **13367**; `comm -23` of the
  first against the second drops **2** lines. Both are from the English-dictionary backlog
  item, whose closing sentence this cycle rewrote because the measurement made it false —
  the dropped lines are `  on its own. Also unmeasured and cheap to do: ...` and
  `  counted, before or after.`, and what replaced them is the paragraph of numbers now in
  that item. Nothing else was lost.

  **Reproduced on a second, independent build.** The gate's own `npm run build` replaced
  the `.next` the numbers came from, and both commands re-run against it print the same
  lines byte-for-byte — command (1) `index scripts=13 raw=784713 gzip=240494` through
  `care scripts=13 raw=791400 gzip=242643`, command (2) `index scripts=12 raw=672119
  gzip=201102` through `care scripts=12 raw=678806 gzip=203251`. The chunk names are
  content hashes, so an unchanged tree rebuilds to the same ones; that is the only
  reproduction claim here, and it is not a variance estimate.

  *Validation on this tree:* `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(ls -d
  /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run smoke` on the
  committed tree — `Test Files  120 passed (120)` / `Tests  1089 passed (1089)`,
  **311 passed (13.9m)**, `✖ 2 problems (0 errors, 2 warnings)`, `ml/selftest.py`
  `Ran 146 tests in 2.323s` / **OK**, **Smoke test passed.** at log line **1164**, exit
  **0**. Re-run afterwards, each on its own: `npx tsc --noEmit | grep -c "error TS"`
  **13**; `npx eslint .` **✖ 2 problems (0 errors, 2 warnings)** (the same pre-existing
  `_reads` / `_result` at `lib/care.ts:70`); `python3 ml/selftest.py` `Ran 146 tests in
  2.252s` / **OK**. The suite is **311** here and **311** on the supervisor's `ba67ed0`,
  which is what a cycle that added no test should read. `git status --porcelain` after the
  run lists the three modified docs and the one new one and no product file, and
  `ss -ltnp` afterwards shows nothing listening on 3100-3109. What the smoke run does not
  cover: the three doc files themselves, including this validation paragraph, which were
  written around it — `tsc`, `eslint` and `ml/selftest.py` above were all re-run after the
  last doc edit. Rotation: `comm -23` over `sort -u` of both files at `ba67ed0` against
  this pair drops **2** lines, both named above.

  *Supervisor review:* sound, merged. This is a measurement cycle with no product change:
  `git diff --stat ba67ed0..HEAD` touches only `README.md`, `docs/AUTOPILOT.md`,
  `docs/autopilot-changelog.md` and the new `docs/first-load-js.md`.

  I reproduced the headline table independently. On a fresh `npm run build` of this tree,
  command (2) from `docs/first-load-js.md` printed:
  - `index scripts=12 raw=672119 gzip=201102`
  - `survey scripts=12 raw=667597 gzip=200355`
  - `scan scripts=13 raw=720028 gzip=218841`
  - `report scripts=13 raw=714373 gzip=215103`
  - `care scripts=12 raw=678806 gzip=203251`

  That is byte-identical to the doc on all five routes. The English dictionary check
  also matched: `grep -l 'Turn camera back on'` finds one chunk,
  `39680g4crf4zr.js`, at **82569** raw / **28307** gzipped. `index.html` carries
  **1** `noModule` tag.

  Nothing was broken on purpose this cycle, because no test was added to prove live.

  Rotation: `comm -23` over `sort -u` of both files at `ba67ed0` drops **2** lines. Both
  are from the English-dictionary backlog item's old "Also unmeasured and cheap to do"
  sentence, which the worker rewrote to point at the new doc. Nothing was lost.

  Gate on this tree:
  - `npm run smoke`: `Test Files 120 passed (120) / Tests 1089 passed (1089)`,
    **311 passed (16.9m)**, **Smoke test passed.**
  - tsc: **13**.
  - `npx eslint .`: `✖ 2 problems (0 errors, 2 warnings)`.
  - `python3 ml/selftest.py`: **OK**.
  - Ports 3100–3109: none listening afterwards; `git status` clean.

- 2026-09-30 (cycle 59) — Branch `autopilot/2026-09-30-1239`. **The last open tap-target
  item from cycle 50 is closed by measurement, and it closes with no product change. The
  `ReengageOptIn` checkbox really is 15x15 / 13.046875x15 / 13x15, but the `<label>` around
  it is **244x44** in all five locales and every point probed inside it toggles `checked`,
  so the label is the target — the same reading cycle 49 made for the three /scan consent
  checkboxes. `tests/e2e/reengage-optin-label-target.regression-39.spec.ts` ratchets it in
  `ko en ja zh ar`, and `app/`, `lib/`, `public/` and `ml/` are untouched.**

  **What the item demanded, and why it could not be answered by reading the file.** The
  backlog required the is-the-label-the-target judgement to be made BY MEASUREMENT, not on
  sight, because the file alone is ambiguous: the label carries
  `minHeight: "var(--tap-min)"` but also `display: "flex"` with a `<span>` beside the
  input, and whether a click in the space the span does not occupy reaches the label is a
  layout fact, not a source fact. So it was probed at six points per locale.

  **The numbers, from the spec's own line reporter on the production server.**

  ```
  [reengage-target] ko: dir=ltr tapMin=44 label=244x44 input=15x15 probes=TL,TR,BL,BR,far,mid
  [reengage-target] en: dir=ltr tapMin=44 label=244x44 input=13.046875x15 probes=TL,TR,BL,BR,far,mid
  [reengage-target] ja: dir=ltr tapMin=44 label=244x44 input=13x15 probes=TL,TR,BL,BR,far,mid
  [reengage-target] zh: dir=ltr tapMin=44 label=244x44 input=15x15 probes=TL,TR,BL,BR,far,mid
  [reengage-target] ar: dir=rtl tapMin=44 label=244x44 input=13x15 probes=TL,TR,BL,BR,far,mid
  ```

  `ar` reports `dir=rtl`, so the RTL case is the real one and not an LTR page with Arabic
  text in it. The six probes are the four inner corners **3** px in, the far end from the
  input (the right edge in the four LTR locales, the left edge in `ar`), and the midpoint.
  Each of the **6** clicks per locale flipped `checked`, alternating `false`→`true`→`false`,
  and the sixth left it back at `false` in all five — **30** clicks, **30** toggles. The
  exploratory pass also read `document.elementFromPoint` at each point before clicking: it
  returned `label` or the label's own `span` at every one of the **30**, never an element
  outside the label. So `244` ≥ **24** and `44` ≥ `--tap-min` **44**, and the whole box is
  live. The input's own **13.046875** px in `en` is the flex item shrinking under a longer
  translation; it is recorded rather than fixed, because widening a 13px input inside a
  244x44 target changes what the eye sees and not what a finger hits.

  **So: no product change.** `git diff --stat -- app lib public ml` over this commit prints
  nothing. The constraints the item named are met by having changed nothing at all: the
  opt-in's default `checked` state, its `name`, its submit handler, what it sends and when,
  every string of copy, `lib/consent.ts` and the three /scan consent checkboxes are all
  byte-identical to `ef32957`. The two consent streams are untouched and not merged.

  **The spec cannot submit the form, by two independent facts.** The label sits outside the
  `<form>` — the spec asserts `label.closest("form")` is null before it clicks anything —
  and no address is ever typed, so `submit()` returns at its own `!email.trim()` guard. On
  top of that the spec records every request the page makes and fails if one URL contains
  `/api/reengage/`. Nothing was sent, no provider was called, and no email exists.

  **Proved a live tripwire twice, each reverted.** Setting the label's `minHeight` to **0**:
  **5 failed**, with `consent label height` `Received` **18.75** (`ko`), **37.5** (`en`),
  **37.5** (`ja`), **18.75** (`zh`), **37.5** (`ar`) against `Expected: >= 44`. Setting the
  label to `display: "inline"`: **5 failed**, `Received` **15** / **39** / **39** / **15** /
  **39** on the same assertion. Both breaks were reverted from a copy taken before the
  first; `sha256sum` reads
  `9c237445439a6b967b4ecf8d7e010b3cc7e0e0f4d12d8a944d2e3f09088bd979`
  (`app/components/reengage-optin.tsx`) and
  `9bc43119c597cae18e69dbb819cc2c55a6d2a4fb08d58a1a46adc6a7f5f12e41`
  (`tests/e2e/reengage-optin-label-target.regression-39.spec.ts`) both before the first
  break and after the last revert, and `diff` over the two listings reports no difference.
  Note what the break numbers say about the height floor: at `minHeight: 0` the label still
  measures **37.5** in `en`, `ja` and `ar`, which is over the **24** AA floor — so a spec
  that pinned only 2.5.8 would have passed a control the repo's own contract rejects. The
  floor read at runtime from `--tap-min` is what catches it.

  **One method note, because it nearly produced a false finding.** The first probe pass
  clicked the label's `boundingBox()` coordinates directly and recorded **NOCHANGE** on all
  **25** of its clicks (**5** probes x **5** locales; the midpoint probe came later) with
  `elementFromPoint` = `none` at every one. That was not the label failing to toggle:
  Playwright's `boundingBox()` is relative to the viewport and does not scroll the element
  into it, and the opt-in sits at `y` ≈ **1660** (`ko`) on an **800** px viewport, so every
  click landed outside the window.
  `scrollIntoViewIfNeeded()` first moved the label to `y` ≈ **540** and all **30** clicks
  of the six-probe pass toggled. A cycle that had stopped at the first pass would have "measured" a dead target
  and resized a control that was never broken.

  **Research / ML:** skipped this cycle, as the item said to. `python3 ml/selftest.py` was
  still run and is green (below).

  **Rotation.** Cycle 56's entry moved verbatim to the end of
  `docs/autopilot-changelog.md`, after cycle 55. Both files at `ef32957` concatenated and
  `sort -u`'d come to **13053** lines; `comm -23` of that against the same over this pair
  drops **0** lines, and `wc -l` over the pair read **14996** immediately before and
  immediately after the move.

  *Validation on this tree:* `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(ls -d
  /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run smoke` on the
  committed tree — `Test Files 120 passed (120) / Tests 1089 passed (1089)`,
  **311 passed (12.8m)**, `✖ 2 problems (0 errors, 2 warnings)`, `ml/selftest.py`
  `Ran 146 tests in 1.945s` **OK**, **Smoke test passed.**, exit **0**.
  `npx tsc --noEmit | grep -c "error TS"` **13**. `npx eslint .` **0 errors, 2
  warnings**. `git status --porcelain` after the run lists **0** lines, and `ss -ltnp`
  afterwards shows nothing listening on 3100-3109. The suite went from the supervisor's
  **306** on `ef32957` to **311** here, which is the **5** tests this cycle added and
  nothing else. Rotation: `comm -23` over `sort -u` of both files at `ef32957` against
  this pair drops **0** lines.

  *Supervisor review:* sound, merged. The item is closed by measurement with no product
  change: `git diff --stat ef32957..HEAD -- app lib public ml` prints nothing. I reproduced
  the spec independently on this tree with `npx playwright test
  tests/e2e/reengage-optin-label-target.regression-39.spec.ts --project=mobile`: the same
  five `[reengage-target]` lines (`label=244x44` in all five locales, `ar` at `dir=rtl`)
  and **5 passed (1.1m)**.

  I then broke it a way the worker did not try. Both of the worker's breaks trip the
  box-size assertion. `pointerEvents: "none"` on the `<label>` leaves the box at
  244x44, so it reaches the toggle assertion instead. Result: **5 failed**, each with
  `<lang>: click at TL did not toggle the checkbox`. The file was then restored from a
  copy, and `sha256sum` matched the pre-break listing (`diff` empty, `git status` clean).

  I made one wording correction in the entry. The method note said `boundingBox()` "is
  not scroll-adjusted". Playwright's box is viewport-relative. The cause was that the
  label sat below the fold and `page.mouse.click` does not scroll, so the sentence now
  says that.

  Rotation: `comm -23` over `sort -u` of both files at `ef32957` drops **2** lines. They
  are the two header lines of the backlog item, which the tick rewrote as
  `- [x] **…`, so nothing was lost.

  Gate on this tree:
  - `npm run smoke`: `Test Files 120 passed (120) / Tests 1089 passed (1089)`,
    **311 passed (13.0m)**, **Smoke test passed.**
  - tsc: **13**.
  - `npx eslint .`: `✖ 2 problems (0 errors, 2 warnings)`.
  - `python3 ml/selftest.py`: **OK**.
  - Ports 3100–3109: none listening afterwards.

- 2026-09-30 (cycle 58) — Branch `autopilot/2026-09-30-0639`. **The owner's revenue
  switch-on is now performed end to end on a production server on every run of the gate.
  `tests/e2e/commerce-switch-on.spec.ts` starts from the two environment variables
  `docs/commerce-partnership-playbook.md` tells the owner to set and asserts what a
  visitor's click actually does: the overridden pair answers **302** with the affiliate URL
  plus `/api/out`'s four UTM parameters, a non-allowlisted override still lands on the
  default search URL and is named in the server's log, and the disclosure reads the 제휴
  sentence in `ko` and `en` with the no-commission sentence gone from both surfaces. No
  product behaviour changed and `ALLOWED_HOSTS` is untouched.**

  **What the gap was.** `tests/commerce.test.ts` covers the parsing of
  `COMMERCE_LINK_OVERRIDES_JSON` in isolation, and nothing exercised it through a running
  server. `NEXT_PUBLIC_COMMERCE_AFFILIATE` was worse off: it is inlined at build time, so
  the only way to check it is to build with it set, and
  `tests/e2e/care-first-merchant-link.regression-38.spec.ts` says in its own comment that
  cycle 57's run with the flag set "did NOT establish that the flag reached the browser
  through a production build". The two halves fail in opposite directions — an override the
  allowlist drops earns nothing while the disclosure claims a commission, and a disclosure
  that never flips leaves a live affiliate link described as one ARU takes nothing from.

  **How it gets its environment, and why it is not a quarantine.** The gate's single
  `webServer` cannot carry these values: the affiliate flag changes the disclosure sentence
  every other spec reads and an override changes where `/api/out` sends a click. So
  `playwright.mobile.config.ts` now declares TWO web servers and two projects. The second
  runs `npm run build && npm run start` on port **3104** with
  `COMMERCE_LINK_OVERRIDES_JSON`, `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` and `ARU_DIST_DIR`
  set, and the `commerce-switch-on` project runs this one spec against it. Nothing is
  conditional and nothing is skipped: `npm run smoke` ran **306** tests on this tree where
  cycle 57's ran **300**. A spec that skipped itself when the variables were absent would
  have left the owner's real configuration the one arrangement nobody ever exercises.

  **Added gate time, stated honestly.** `npx playwright test --config
  playwright.mobile.config.ts --project commerce-switch-on` on this tree printed
  **6 passed (44.6s)**, and that figure INCLUDES starting both web servers, so both
  production builds are inside it. The whole suite printed **306 passed (13.2m)** and
  **306 passed (13.7m)** on the two full runs here, against the supervisor's
  **300 passed (9.9m)** on `8be1254`. Those are different runs on a container that has
  recorded the same 300-test suite at **13.4m** (cycle 55) and **14.8m** (cycle 56), so the
  3-4 minute gap is not attributable to this spec and is not claimed to be: the 300-test
  suite was NOT re-run alone on this tree to separate them. The 44.6s figure is the one
  measured upper bound on what was added.

  **What it asserts, in the run's own words.** From the final gate's line reporter:

  ```
  [switch-on] /api/out?sku=tn1&merchant=oliveyoung&placement=report_product -> 302 https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000&utm_source=kbeauty_ai_camera&utm_medium=commerce_link&utm_campaign=skin_scan_recommendation&utm_content=report_product_tn1_oliveyoung
  [switch-on] /api/out?sku=tn1&merchant=coupang&placement=care_en -> 302 https://www.coupang.com/np/search?q=%EC%95%84%EB%88%84%EC%95%84+%EC%96%B4%EC%84%B1%EC%B4%88+77+%ED%86%A0%EB%84%88&utm_source=kbeauty_ai_camera&utm_medium=commerce_link&utm_campaign=skin_scan_recommendation&utm_content=care_en_tn1_coupang
  [switch-on] server log: [commerce] override for tn1/coupang ignored: the URL is not an https URL on the allowlist (www.oliveyoung.co.kr, search.shopping.naver.com, www.coupang.com, www.google.com) (https://link.coupang.com/a/dryrun). The link is still a search URL.
  [switch-on] /report ko: affiliate=4 noCommission=0
  [switch-on] /care en: affiliate=1 noCommission=0
  ```

  The `/report` href is the one the product renders (`a[href^="/api/out"]` on the picks
  card); the `/care` one is captured by replacing `window.open`, which is also what keeps
  the merchant off the network. Every request uses `maxRedirects: 0` and reads `Location`,
  so no redirect is ever followed and nothing leaves the container. Both override URLs are
  invented — `DRYRUN000000` is not a goods number, `/a/dryrun` is not a partner link, and
  no affiliate id exists anywhere in this repository.

  **Proved a live tripwire, three ways, each reverted.** Dropping
  `NEXT_PUBLIC_COMMERCE_AFFILIATE` from that server's environment: **3 failed**,
  **3 passed** — the two disclosure tests and the one that asserts the no-commission
  sentence is gone from both surfaces. Making `/api/out` discard the override it resolves
  while still auditing it (`const override = null;`): **1 failed**, **5 passed**. Putting
  `link.coupang.com` on `ALLOWED_HOSTS`: **2 failed**, **4 passed** — the default-search
  redirect and the ignored-override log line. Each break was reverted from a copy taken
  before it: `sha256sum` on the three files reads
  `13544120c36460e27ece48e64ae7e4f5d58758cbb6bf88aaaaa590724da075de`
  (`tests/e2e/support/commerce-switch-on.ts`),
  `d2fec4ffdaeb07edcd8810f59b558aa0b18db70ad822546e26bc3bf8ee453871`
  (`app/api/out/route.ts`) and
  `cd1e522e81d2cd0caa95238df8a5ca72fd3e0ae4e9d0619482e9407c06d5c2a5`
  (`lib/commerce.ts`) both before the first break and after the last revert, and `diff`
  over the two `sha256sum` listings reports no difference. The allowlist itself is not in
  this cycle's diff: `git diff --stat -- lib app public ml` over the commit prints nothing,
  so `ALLOWED_HOSTS`, `shareUrl`, `metadataBase` / SITE_URL, `lib/consent.ts` and the
  manifest's `status` / `promotionGate` are all untouched, and the only places
  `ALLOWED_HOSTS` appears in the diff at all are prose and two doc comments in the new test
  files. `NEXT_PUBLIC_FUNNEL_FLUSH` is set by nothing here, the switch-on build included.
  No provider was called, no email was sent, and no request left the container.

  **Build-config changes this needed, and one that is not cosmetic.** `next.config.ts`
  takes `ARU_DIST_DIR` (unset everywhere else) because `next build` empties its `distDir`
  and the two builds run concurrently from one tree; `.gitignore` and `eslint.config.mjs`
  ignore `.next-switch-on/**`, the second of which is not optional — unignored it made
  `npx eslint .` read **408 errors, 6498 warnings** instead of **0 errors, 2 warnings**,
  and `npm run smoke` runs `lint` first, so the gate would have gone red at step 1 over a
  build output nobody wrote. `scripts/smoke-test.mjs` asserts port **3104** is free
  alongside **3102**, for the reason already written above `assertPortFree`.
  `tsconfig.json` is committed as `next build` rewrote it: the switch-on build appends
  `.next-switch-on/types/**/*.ts` and `.next-switch-on/dev/types/**/*.ts` to `include` and
  reformats the file, so committing that output is what stops every gate run leaving a
  dirty tree. `sha256sum tsconfig.json` read
  `a5bb2155685ee7aa26eec8aa1cd9ef554c284d905af99040055737fd7089d5d6` before a full gate run
  and the same after it, so it is idempotent.

  **Research / ML:** skipped this cycle, as the item said to.

  *Validation on this tree:* `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(ls -d
  /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run smoke` on the
  committed tree — `Test Files 120 passed (120) / Tests 1089 passed (1089)`,
  **306 passed (13.7m)**, `✖ 2 problems (0 errors, 2 warnings)`, `python ml/selftest.py`
  **OK**, **Smoke test passed.**, exit **0**. `npx tsc --noEmit | grep -c "error TS"`
  **13**. `git status --porcelain` after the run lists **0** lines. Rotation: `comm -23`
  over `sort -u` of both files at `8be1254` against this pair drops **0** lines.

  *Supervisor review:* sound, merged. This is the first test in the gate that exercises
  the owner's actual revenue switch-on through the real production server. It does so
  with no product change: `git diff --stat 8be1254..HEAD -- lib app public ml` prints
  nothing. The one config line (`ARU_DIST_DIR` in `next.config.ts`) is inert unless that
  variable is set.

  *Reproduced here.*
  - `npm run smoke`: **Test Files 120 passed (120) / Tests 1089 passed (1089)**, **306
    passed (14.9m)**, **Smoke test passed.**
  - Five seconds after it exited, `ss -ltnp` showed nothing listening on 3100–3109. So
    the `| tee` in the second server's command does not leave a server behind for the
    next run's port preflight. `git status --short` was empty: the log is covered by
    `*.log` in `.gitignore` and the dist dir by the new `/.next-switch-on/` line.
  - Broken a way the worker did not try: `NEXT_PUBLIC_COMMERCE_AFFILIATE: "off"` instead
    of dropping the key. `--project=commerce-switch-on` gave **3 failed | 3 passed
    (1.1m)**, all three failures on the affiliate-sentence visibility check. The flag's
    VALUE is checked, not just its presence. Reverted; ports free afterwards.

  *Cost, stated because the brief asked for it and the entry should carry it.* The gate
  went from **9.9m** (cycle 57's tree) to **14.9m** here, because the second production
  build runs alongside the first. That is the price of testing the real deploy shape. A
  cheaper variant is left open: building once with the flag and serving both from it
  would not work, because every other spec reads the flag-off disclosure.

  *Protocol note.* The worker pushed twice (`a8ab796`, then `f177cca` correcting a
  sentence in its own entry) against a brief that said once. The correction was right,
  and nothing broke.

  *Validation on this tree, supervisor:* smoke as above; `tsc` **13**. Rotation: `comm
  -23` over `sort -u` of both files at `8be1254` against this pair drops **0** lines.
