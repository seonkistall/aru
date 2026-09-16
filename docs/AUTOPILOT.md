# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-16

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
   acquisition path the product has.
4. **Everything else** — model quality, subgroup fairness, defects, polish. Still real
   work, still lands every cycle; it just does not win a tie against 1-3 while the
   revenue line reads zero.

## One cycle

Each firing does all of this, in order. One coherent improvement per track is
better than four half-finished ones.

1. **Orient.** Read this file. Run `git log --oneline -10` and read the last
   CHANGELOG entries so the cycle does not redo finished work.
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
   merge it → update this file's CHANGELOG and BACKLOG → update `README.md` if
   anything a reader would care about changed.

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
  will arrive through — see the changelog entry below; it was silently discarding them.
- [AI] `confidenceLabel` no longer distinguishes reading ambiguity. After the
  2026-09-15 fix, a frame whose three capture signals all pass lands in
  [0.7804, 0.9424], and the 높음 gate is 0.78 — so it reads 높음 even when all three
  readings sit exactly on their cut points. The label is now a restatement of capture
  quality, and it clears the gate by 0.0004, so any later nudge of the 0.695 floor or
  the 0.78 threshold flips every well-captured scan at once. Decide whether the
  attribute term should get more travel in `readsFromRaw`, or whether the label should
  be dropped to two levels. Note `confidenceLabel` is duplicated byte-for-byte in
  `app/scan/capture-analysis.ts`.

  **2026-09-16, supervisor: the numbers above are right and the conclusion is not.**
  Reproduced exactly — `distanceConfidence` is bounded to [0.695, 0.92] for every
  input, the three attribute weights sum to 1, so all-signals-pass gives
  [0.7804, 0.9424] and clears 0.78 by 0.0004. But that is the NON-burst path, and the
  non-burst path is `/eval` only. `app/scan/use-capture-analysis.ts:216` calls
  `analyzeSkinBurst`, which passes `burst`, and `lib/skin.ts:743` then multiplies by
  `0.9 + 0.1 * meanAgreement`. With three frames, per-attribute agreement is a third,
  two thirds or one, so the reachable floors on the path real users take are:

  ```
  agreement 1.00/1.00/1.00  mean 1.0000  ->  0.7804 .. 0.9424   높음 at the floor
  agreement 1.00/1.00/0.67  mean 0.8889  ->  0.7717 .. 0.9319   보통 at the floor
  agreement 0.67/0.67/0.67  mean 0.6667  ->  0.7544 .. 0.9110   보통 at the floor
  agreement 0.33/0.33/0.33  mean 0.3333  ->  0.7284 .. 0.8796   보통 at the floor
  ```

  (node, against the real weights in `readsFromRaw`.) One attribute disagreeing on one
  of three frames drops the floor to 0.7717 and flips 높음 to 보통. So in production the
  label reports **burst frame stability**, not capture quality and not reading
  ambiguity — a third thing, and one the user is never told about. Both remedies the
  item proposes would be chosen against the `/eval` picture. Decide what axis the label
  should report first. Note also that `meanAgreement < 0.67` already pushes its own
  retake reason, so the multiplier and the reason count read one signal twice.
- [AI] Decide whether ONE failed capture signal should force a retake. Measured after
  the 2026-09-15 `distanceConfidence` fix: `retakeRecommended` is
  `confidence < 0.58 || retakeReasons.length >= 2`, and with confidence no longer
  collapsing on unambiguous readings the lowest reachable value with 2 of 3 signals
  passing is 0.6871, so a single failed signal can no longer trip the gate. Two or more
  failures still do, via the reason count. The old code caught the single-failure case
  only as a side effect of the inversion — i.e. by accident — but "피부 영역" failing
  alone does genuinely undermine the pores reading, so this deserves an explicit rule
  rather than an accident. Numbers above are from a `node` evaluation of the new
  function against the real `attrConfidence * 0.72 + signalScore * 0.28` weighting.
- [AI] Validate the blemish-detection constants (`BLEMISH` in `lib/skin.ts`) against
  real photos through `/eval`, and replace them with calibrated values. They were
  chosen on a synthetic face.
- [x] [AI] ~~**The report headline survives the vision merge and can contradict the
  rows under it.**~~ — done 2026-09-16. `headlineFor` and `narrativeFor` are exported
  from `lib/skin.ts` and `mergeVisionAnalysis` rederives both from `next.*` after the
  bucket loop, with `payload.narrative` still the override it was. The report was one
  field short: `overall` — the 전반 row on `/report`, the scan result card and
  `/studio` — is derived from the same three buckets and also arrived through
  `...base`, so it was stale in exactly the same way. It is now `overallFor`, extracted
  from `readsFromRaw` so both paths compute it from one definition rather than two.
  That also settles the second-order half: `localizedNarrative` returns the stored
  Korean sentence as-is and rebuilds it from the levels for every other language, so a
  stale stored sentence showed a Korean user one face and an English user another from
  one object; with the stored sentence rederived, the two agree.
  `tests/vision-merge-consistency.test.ts` covers all three fields, the payload
  override, and a no-op merge.
- [x] [AI] ~~`blemishDensity` divides by an area in real capture pixels~~ — done
  2026-09-16, measured first. Over a 7.2x range of face width on one synthetic face the
  pixel area moves **50.8x** (10,577 → 537,804) while `areaPx / faceW²` moves **1.9%**
  (2.0403 → 2.0012), and `blemishDensity` collapses **84.7x** (472.72 → 5.58) with the
  count staying between 2 and 8. So the sampled area is already invariant in face-width
  units and the pixel denominator was the only scale-dependent term. `detectBlemishes`
  now returns `areaFace`; `ml/skin_indices.blemish_density` takes `face_width_px` and
  uses the same unit. `fallbackVersion` → `roi-calibrated-2026-09-16b` in both places
  (not guardrail 8: `status` and `promotionGate` untouched). Table and method in
  `docs/capture-resolution-invariance.md`, re-runnable from the committed test.
- [x] [AI] ~~**The blemish COUNT is itself resolution-sensitive**~~ — done 2026-09-16
  (cycle 5), measured before and after with the committed sweep. Both candidate fixes
  the item named turned out to be needed, and each is load-bearing on its own. The
  stride is no longer rounded to whole pixels: `round(faceW / 90)` moved the effective
  grid between 72 and 108 cells across, and because `backgroundRadius` (5) and
  `suppressionRadius` (2) are counted in CELLS, it moved the physical size of every
  window the detector uses. And the stride window is averaged rather than
  point-sampled at its corner, so a disc landing between two sample points is no longer
  missed outright. Noise-free counts over face widths 144px to 518.4px went
  **2, 4, 3, 5, 3 → 3, 3, 3, 3, 3**; `areaPx / faceW²` tightened 1.0199 → 1.0109. The
  two smallest frames (faceW 72 and 108) are excluded by name rather than quietly, both
  in the test and in the doc: at 72px the stride clamps at one whole pixel. Cost is
  measured, not waved at — §5.4 of `docs/capture-resolution-invariance.md`.
  `fallbackVersion` → `roi-calibrated-2026-09-16c` in `lib/skin.ts` AND the manifest
  (guardrail 8 respected: `status` and `promotionGate` untouched).
- [x] [AI] ~~`auditCommerceOverrides` has no production caller, and cannot check the
  sku id without an import cycle~~ — done 2026-09-16, both halves. The cycle is avoided
  by injection rather than by a new module: `auditCommerceOverrides(raw, { knownSkus })`
  and `commerceOverrideUrl(sku, merchant, { knownSkus })` take the ids from the caller
  that already holds `SKUS`, so `lib/commerce.ts` still imports nothing. `/api/out`
  passes them, which puts the check on the production hot path; `/api/sync` GET reports
  the accepted/rejected split and `/ops` renders it, which is the first screen an
  operator can see it on — behind the sync token. The first draft returned the audit to
  anyone, reasoning that sku and merchant ids are public already: true of catalogue ids,
  false of exactly the rows the new check adds, since an `unknown-sku` key is by
  construction NOT in the catalogue. `/api/sync` GET has no origin guard and no rate
  limit (both are POST-only) and is not in the `proxy.ts` matcher that 404s `/ops`, so
  the screen would have been private while the data it renders was world-readable.
  `/ops` sends the token it already collects. `value` is never returned either way — the
  URL stays in the server log, where an operator debugging a typo'd host needs it. New
  `unknown-sku` issue reason.
  `tests/commerce.test.ts` pins the catch, that a real catalogue id is still accepted,
  and that omitting the sku list keeps the old behaviour for a caller with no
  catalogue.
- [~] [AI] Two camera dead-ends were off the funnel or mislabelled. **The mislabelled
  half is fixed, 2026-09-16.** The stream-attach path now sets an `attach` reason with
  its own copy in all four dictionaries, so someone who has already granted camera
  permission is no longer told to grant camera permission — `getUserMedia` has resolved
  before that path is reachable, so the 권한 copy sent them to a setting that was
  already correct, or showed the previous attempt's reason, since `startCamera` never
  clears it. `tests/camera-denied-reason.test.ts` fails if any future `setPhase("denied")`
  forgets its reason, which matters because the render chain ends in the 권한 branch as
  its `else` and so fails silently rather than loudly.
  **The other half is fixed too, 2026-09-16.** `interruptCamera` now takes the reason
  from its call site — `"muted"`/`"ended"` straight through from `watchCameraStream`,
  `"backgrounded"` from `visibilitychange`/`pagehide` — so the two cases are told apart
  before either is counted, which was the condition this item put on its own fix. New
  `camera_interrupted` funnel kind carries it. The screen stopped telling both groups
  the same thing: a user whose camera was seized by another app was being asked to turn
  their camera back on, which is not the action available to them.
  `tests/camera-interrupt-reason.test.ts`, 4 of its 5 cases fail against `origin/main`.
- [AI] Server-side funnel telemetry. `lib/funnel.ts` is localStorage-only, so nobody
  can see where users drop off. Without it every UX cycle is guessing. (Still open —
  2026-09-15 added `share_landed` and `viralActivation`, but they are still on-device.)
- [x] [AI] ~~Four more drop-offs are uninstrumented~~ — done 2026-09-15. `home_viewed`,
  `scan_opened`, `camera_blocked`, `care_viewed` and `checkin_opened` now fire, with
  `captureStart` and `cameraBlockRate` in the summary and in `/ops`. Still on-device:
  the server-side item above is what makes any of this readable by a human.
- [AI] Measure the real per-scan cost of the new within-image indices on a mid-range
  phone profile, not on the build container.
- [AI] The ordinal floor is 0.40/0.40 and provisional — it was chosen from synthetic
  predictors because no labelled ARU validation set exists yet
  (`docs/ordinal-metric-verification.md`). The first real training run should report
  its own qwk and pearson and the floor should be re-set against those, not against
  the synthetic table. Do not raise it on a hunch, and do not lower it to make a run
  pass.
- [AI] `funnelDropoff` still anchors its cumulative chart on `scan_started`, so the
  camera loss `scan_opened` now measures does not appear in the drop-off bars — it is
  only in the summary (`captureStart`, `cameraBlockRate`). Moving the anchor would
  zero every stage of an event log recorded before `scan_opened` existed, because the
  chart is an intersection from stage 0. Revisit once logs in hand all contain it.
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

- [x] [AI] ~~The promotion gate still reads only `accuracy` and the unused
  `worstOrdinalMae`~~ — done 2026-09-15. `promotionGate.ordinal` in the shipped
  manifest now carries `minQwk` / `minPearson` (both 0.40, provisional), mirrored in
  `model_contract.FALLBACK_ORDINAL_GATE`, and `subgroups.ordinal_check` blocks per
  axis — including when an axis reports no qwk at all, on the same rule that makes an
  unevaluated subgroup a blocker. Both scorers were verified against scikit-learn and
  SciPy first (`docs/ordinal-metric-verification.md`); the floor was chosen from a
  measured table of predictors, not from a benchmark nobody here can open.

- [x] [AI] ~~`minSamplesPerBand` is compared against the wrong unit~~ — done 2026-09-16.
  The reproduction ran and matched the backlog exactly (`n reported to worst_group: 30`
  for 10 real samples, `clears the floor? True`). `_aggregate` moved out of the
  torch-importing trainer into stdlib-only `ml/subgroups.py` as `aggregate_by_cell`,
  which is what put it in reach of `ml/selftest.py` — the same move and the same reason
  as `promotion_check` and the ordinal scorers. **The one meaning chosen: `n` is a
  count of labelled samples on ONE axis**, the smallest among the axes carrying any
  label in the cell, which is the unit `fit_tone_calibration` already gates on. The
  minimum rather than the mean, because the cell's accuracy is a label-weighted average
  ACROSS axes and a cell whose pores head saw 3 samples makes no trustworthy claim about
  pores. Axes with no label in the cell are skipped rather than counted as zero. The old
  sum survives as `observations`, named for what it is — the denominator of those
  averages — and nothing gates on it. `coverage_warnings` still counts rows and cannot
  do otherwise (it runs on metadata, before any label is read); its docstring now says
  so and says that a row count is an upper bound on the number the gate applies.
  7 new selftest cases, 5 of which fail against the old unit.
- [AI] `minQwkGainOverHeuristic` is 0.0 — strictly-greater, with no noise band. A
  model that beats the heuristic by 0.001 on one validation split passes, and that
  gain may be noise. Estimate the band: bootstrap the validation rows, report a CI on
  the qwk difference, and require the gain to clear it. That is the honest version of
  a margin, and the reason no positive number was invented for it.
- [AI] `minSamplesPerBand` is compared against the wrong unit. `_aggregate` in
  `ml/train_visible_attributes.py` sums `n` ACROSS axes, and `worst_group` gates on
  that sum. Reproduced by feeding the real `_aggregate` one cell of 10 samples
  labelled on the three default axes:

  ```
  real samples in the cell:  10
  labelled axes           :  3
  n reported to worst_group: 30
  manifest minSamplesPerBand: 20
  clears the floor?          True
  ```

  So a subgroup a third the size of the documented floor is evaluated as if it met it.
  `fit_tone_calibration` in the same file uses the correct per-axis unit, and
  `coverage_warnings` uses raw row counts — three meanings for one manifest number.
- [x] [AI] ~~`raw.toneIta` has no behavioural test anywhere~~ — done 2026-09-16, and
  writing the test found a real defect rather than confirming the code. `lib/skin.ts`
  applied gray-world gains to the cheek pixels before computing tone; gray-world
  estimates the illuminant from the whole frame, so the wall behind the user was being
  divided out of their face. One synthetic face, held byte-for-byte identical, read
  `brown_dark` in front of warm wood and `very_light` in front of grey — three of the
  five bands, the full width of the scale, decided by the room — while `ml/ita.py` applies no such gain offline, so
  a dataset image and a live scan of one face landed in different cells. Worse, both
  scales sat in one file: `ita_for_row` in `ml/prepare_crop_dataset.py` takes the app's
  value when there is one and recomputes through `ml/ita.py` when there is not. Tone is
  now measured on the pixels as captured. `tests/tone-ita-contract.test.ts` (5 cases,
  all 5 fail against `origin/main`) pins the background independence, the degrees
  scale, the ordering, and six swatch angles checked against scikit-image and
  colour-science; `ml/selftest.py` pins the same six for the Python side. Numbers and
  method in `docs/tone-ita-verification.md`.
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
- [AI] Recommendation quality: the reasons are LLM-generated and efficacy-filtered,
  but nothing measures whether they are *useful*. Design a measurable proxy.
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
- [x] [AI] ~~The `0.58` confidence threshold exists in five places~~ — done 2026-09-16
  (cycle 5) as the test the item specified, a separate file so the label contract test's
  scope stays where the supervisor set it. `tests/confidence-threshold-agreement.test.ts`
  pins the three exported sites behaviourally (2001-point sweep asserting 낮음 ⟺
  재촬영 권장, plus both boundaries at ±1e-9 and ±1e-12) and all five as source literals,
  the two inline ones by regex with the anchor failing loudly if the code moves. Verified
  by moving 0.58 → 0.62 in BOTH `confidenceLabel` copies — the combination the existing
  contract test permits: all 3 new cases fail
  (`confidence 0.58: label 낮음=true but 전반 재촬영 권장=false`,
  `the five sites carry: 0.62, 0.58, 0.58, 0.62, 0.58`) while
  `tests/confidence-label-contract.test.ts` stays green, which is the gap.
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

## Changelog

- 2026-09-14 — Autopilot established. Cycle protocol, guardrails, revenue
  arithmetic and backlog written down for the first time.
- 2026-09-15 — Four scheduled fires produced nothing. Root cause found and
  fixed: fired sessions had no declared repository source, so every push blocked on an
  approval prompt nobody could answer. The Routine now wakes a supervisor session that
  spawns a properly sourced worker.
- 2026-09-15 — First worker cycle to land all four tracks.
  **smoke** was red on arrival for an environment reason (pinned Playwright browser
  build absent, CDN egress-blocked); `playwright.mobile.config.ts` gained an opt-in
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override and the prerequisite is written into
  "One cycle" above.
  **bug** `distanceConfidence` in `lib/skin.ts` was sign-inverted outside the threshold
  band — confidence peaked at the decision boundary (0.9159 just below `lo`) and fell to
  0 for unambiguous readings. A clean capture of very calm skin scored 0.5759, under the
  0.58 gate, so the user was told 재촬영 권장 with an empty `retakeReasons` and
  `shouldApplyScan` discarded the scan entirely. Fixed; the same capture now scores
  0.9124. `tests/confidence-monotonicity.regression-12.test.ts` pins the invariant and
  7 of its 8 cases fail against the old body. Known consequence, now a backlog item: a
  single failed capture signal can no longer trip the confidence gate on its own (two
  or more still do, through `retakeReasons.length >= 2`), and `confidenceLabel` now
  reads 높음 for any frame whose three capture signals pass. Both are backlog items.
  Scope of the bug, measured on a feature grid rather than one hand-picked triple
  (shine 0-0.5, relRedness -0.03-0.08, cov 0-0.3, 51 steps each, all signals passing):
  41.54% of 132,651 points scored under the 0.58 gate before, 0% after, and no point
  moved the other way.
  **ML** `promotion_check` moved from the torch-importing trainer into stdlib-only
  `ml/subgroups.py`, which is what put it in reach of `ml/selftest.py` for the first
  time, and its `elif dimension == "tone" / elif "age"` chain became an unconditional
  `else`. `tone_x_age` — declared by the shipped manifest and structurally unevaluable
  on consumer scans, since every joint cell is `<tone>/unknown` — previously appended no
  blocker, so a run could report `promotable: True` with a declared fairness dimension
  never checked. That contradicted the manifest's own note. selftest went 44 -> 50 tests;
  3 of the new ones fail against the old branch.
  **UX** `share_landed` + `viralActivation`: the share loop counted sends and never
  arrivals, so it had a numerator and no denominator. Fired from the hash
  `MoodFromLink` already parses, surfaced in `/ops`.
  **research** `docs/share-preview-findings.md` — a per-result link preview is
  structurally impossible while the levels live in the fragment, demonstrated with a
  local HTTP probe and the Next 16.2.9 docs shipped in `node_modules`. Kakao's own spec
  is egress-blocked and is recorded as unverified rather than guessed.
- 2026-09-15 — Standing objective recorded: run until $10,000/month, owner-reported,
  with a revenue-upstream tie-breaker for backlog ordering. First cycle landed (PR #66).
- 2026-09-15 (cycle 2) — All four tracks landed, plus the commerce item they are
  ordered behind. Branch `autopilot/2026-09-15-1839`. `npm run smoke` green before any
  change and again after all of them; the baseline run needed the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override and nothing else. Final run:

  ```
   Test Files  63 passed (63)
        Tests  351 passed (351)
    44 passed (3.0m)
  Ran 66 tests in 0.014s
  OK
  Smoke test passed.
  ```

  **commerce (revenue-upstream #1)** The top backlog item was attempted first and
  stopped on its own rule: every merchant host refuses this network, so no product URL
  could be verified and none was invented. Recorded in the backlog entry with the
  verbatim curl output. What *was* fixable without a network is the path those URLs
  will arrive through, and it was broken. `commerceOverrideUrl` returned `null`
  identically for "not configured", "unparseable JSON" and "host not on the
  allowlist", and the caller falls back to the search URL — so a wrong affiliate URL
  is indistinguishable from no affiliate URL, while `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`
  is separately telling users the link earns a commission. The repo walked into this
  itself: `docs/commerce-partnership-playbook.md` documented a `smartstore.naver.com`
  override as its worked example for `naver-shopping`, and the gate rejects that host.
  Measured against `isAllowedCommerceUrl` before the fix:

  ```
  ALLOW  https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000123456
  ALLOW  https://search.shopping.naver.com/search/all?query=x
  BLOCK  https://shopping.naver.com/catalog/12345678
  BLOCK  https://smartstore.naver.com/brand/products/12345678
  BLOCK  https://brand.naver.com/brand/products/12345678
  ALLOW  https://www.coupang.com/vp/products/1234567890
  BLOCK  https://link.coupang.com/a/abcdef
  BLOCK  https://global.oliveyoung.com/product/detail?prdtNo=GA123456
  override returned: null
  ```

  Fixed by making the rejection loud, not by widening the allowlist: `ALLOWED_HOSTS` is
  what keeps `/api/out` from being an open redirect and none of the blocked hosts above
  could be verified as a real affiliate link host from here. New
  `auditCommerceOverrides()` separates accepted from rejected and distinguishes
  unparseable JSON from unset; `commerceOverrideUrl` warns once per distinct env value
  naming the sku, merchant and URL. The runbook's example is now one the gate accepts,
  the hosts a real link may need are listed as explicitly unverified, and
  `tests/commerce.test.ts` pins the runbook's allowlist and its worked example against
  the code so the two cannot drift again. A misspelled *merchant* key is reported too;
  a misspelled *sku* id is not, because `lib/skus.ts` imports `lib/commerce.ts` and
  checking the catalogue there would be a cycle — that gap is pinned by a test and
  listed in the backlog rather than left implied. With `lib/commerce.ts` and the
  playbook reverted to `origin/main`, `6 failed | 7 passed (13)` — the file has 5
  pre-existing cases and 8 new ones, of which 6 fail without the fix, three with
  `TypeError: auditCommerceOverrides is not a function`. The two new cases that pass
  either way are no-regression guards, not evidence.

  **ML** The promotion gate now refuses a head that learned nothing. `qwk` and
  `pearson` were computed and compared to nothing, so the only thing the gate measured
  was the subgroup gap — which a constant predictor passes easily, being perfectly
  even-handed. `promotionGate.ordinal` (`minQwk` / `minPearson`, both 0.40) is in the
  shipped manifest and in `model_contract.FALLBACK_ORDINAL_GATE`, and
  `subgroups.ordinal_check` blocks per axis, including when an axis reports no qwk at
  all. Fed the repo's own `metrics_from_confusion` a majority-class predictor on three
  axes with a subgroup layout that passes on its own:

  ```
  per-axis metrics of a majority-class predictor (3 axes, 100 samples each):
    oil      accuracy=0.8000 within_one_grade=0.9500 ordinal_mae=0.2500 qwk=0.0000 pearson=0.0000
    redness  accuracy=0.8000 within_one_grade=0.9500 ordinal_mae=0.2500 qwk=0.0000 pearson=0.0000
    pores    accuracy=0.8000 within_one_grade=0.9500 ordinal_mae=0.2500 qwk=0.0000 pearson=0.0000

  BEFORE (origin/main):  promotable = True   blockers = []
  AFTER  (this branch):  promotable = False
     blocker: [oil] qwk 0.000 is below the floor 0.400
     blocker: [oil] pearson 0.000 is below the floor 0.400
     blocker: [redness] qwk 0.000 is below the floor 0.400
     ...
  ```

  A non-finite score blocks too, which it does not do by itself: `float("nan") < 0.4`
  is `False`, and NaN is exactly what the reference implementations return on the
  degenerate matrices where ARU's own scorers return 0.0. So is a run that evaluated
  no axis at all. The three scorers moved out of the torch-importing trainer into
  stdlib-only `ml/ordinal_metrics.py` — the same move `promotion_check` made, for the
  same reason: it is what puts them in reach of `ml/selftest.py`, and an AST
  comparison against `origin/main` confirms all three bodies are unchanged. selftest
  went 50 -> 66 tests.

  **research** `docs/ordinal-metric-verification.md`. Gating on a metric means first
  checking it is the metric. `pypi.org` turned out to be the only reachable host of
  eight probed, which made reference implementations available: over 1,982 random
  confusion matrices, ARU's kappa agrees with
  `sklearn.metrics.cohen_kappa_score(weights="quadratic")` to **6.661e-16** and its
  correlation with `scipy.stats.pearsonr` to **1.110e-15**. The two deliberate
  divergences are both where the reference is undefined, and both resolve conservatively
  (0.0, which blocks). The 0.40 floor was then chosen from a measured table of nine
  predictors rather than a benchmark band, because no page stating those bands is
  reachable — which the doc says outright rather than citing one from memory. Neither
  library is or becomes a dependency.

  **UX** The funnel started at the shutter, so everything lost before it counted as
  nothing having happened — a refused camera permission in particular was invisible.
  `home_viewed`, `scan_opened`, `camera_blocked` (with a `reason` of
  permission/busy/notfound/unsupported/attach), `care_viewed` and `checkin_opened` now
  fire, the last of which is the only measure of whether the re-engagement emails bring
  anyone back. `captureStart` and `cameraBlockRate` are conditioned on `scan_opened`
  and shown in `/ops`. The existing drop-off chart was deliberately left anchored on
  `scan_started`: it is a cumulative intersection from stage 0, so re-anchoring it
  would zero every stage of an event log recorded before this change. A shared
  `useFunnelPageView` hook carries the StrictMode double-invoke guard the four pages
  would otherwise each need.

  **bug** Two, both found by an adversarial hunt rather than a report, both with tests
  that fail against `origin/main`.

  `latestConsent` (`lib/consent.ts`) skipped its scope filter entirely when the caller
  passed no scope, so an unscoped read saw every participant's events — the exact
  fail-open shape `latestConsentGranted` in `lib/sync-payload.ts` already carries a
  comment warning about, and the last place still using the loose form.
  `recordConsentEvent` dedupes against it, so on a device that had ever run a pilot
  session, a consumer ticking 학습용 크롭 저장 matched P001's grant and **no event was
  written at all**: the UI showed the toggle on, `resolveCaptureConsent` (which does
  match scope exactly) then found no unscoped grant and discarded the crop, and the
  person's own consent decision never entered the audit trail. Guardrail 4. Measured
  before the fix:

  ```
  stored after the pilot grant      : 1
  consumer grant returns pid        : "P001" (expected undefined)
  stored after the consumer grant   : 1 (expected 2)
  resolveCaptureConsent(no scope)   : null -> crop discarded
  latestConsent(no scope).pid       : "P001"
  ```

  Fail-closed, so nothing was captured that should not have been — but `/ops` was also
  reporting that participant's decision as the device's consent state. 4 of the 5 new
  cases in `tests/consent-storage.test.ts` fail against `origin/main`.

  Second: `buildReportTrust().sourceLabel` is stored in a map and passed to `t()` as a
  variable, so `tests/i18n-coverage.test.ts`'s regex over `t("…")` literals never saw
  it, and neither `기기에서 확인` nor `기기 확인 + 선택한 AI 분석` existed as a key in
  any of the four dictionaries. English is the default language, so the first chip on
  the `/report` trust card read raw Korean for every non-Korean user. `피부 선명도` in
  the live camera checklist was missing from `ja` and `zh` for the same reason. Both
  fixed, and the coverage test now walks all three `AnalysisSource` values and the
  camera checklist labels explicitly — the two new cases fail against `origin/main`
  with `"기기에서 확인" missing from en dictionary` and `"피부 선명도" missing from ja
  dictionary`.

  **review** The diff was reviewed adversarially by a subagent before commit, and the
  review changed it. Worth recording because the cycle protocol asks for this step and
  it is only worth the tokens if it finds things:

  - The stated justification for the 0.40 floor was **refuted by row 7 of its own
    table**. The draft claimed the floor separates predictors that beat the trivial
    baseline from those that do not; "correct 60%, else off by exactly one" scores
    accuracy 0.7696 (below always-majority's 0.8000) at qwk 0.6657, so it clears the
    floor while being less accurate than the baseline. The numbers were real, the
    inference over them was not. `docs/ordinal-metric-verification.md` now states only
    what the table supports and says plainly what the earlier draft got wrong.
  - NaN bypassed the new gate (above).
  - `test_the_manifest_supplies_the_ordinal_floor` asserted `0.4`, which
    `FALLBACK_ORDINAL_GATE` supplies whether or not the manifest declares it — so
    reverting the shipped manifest left selftest green and the guardrail-8 half of the
    change had no coverage. Replaced with a test that reads the manifest, plus one
    that makes the fallback disagree and checks the manifest wins.
  - `/ops` printed "0% of scan opens" where there were no scan opens at all, turning
    "no data" into a measurement of total failure. Now renders `—`.
  - A misspelled merchant key was reported as *accepted* — the same silent no-op the
    change claims to close. Now an `unknown-merchant` issue; the sku half is a
    documented, tested gap rather than an implied fix.
  - Two numbers in this changelog were wrong: "4 of the 7 new commerce cases" (the
    file has 8 new cases and 6 of them fail without the fix), and the blockers list
    presented `http=000` and `CONNECT tunnel failed` as two different outcomes when
    they are one failure seen through two curl invocations. Both corrected.
  - The verification scripts were uncommitted, so the research numbers rested on
    something nobody could re-run. They are now `ml/tools/verify_ordinal_metrics.py`
    and `ml/tools/ordinal_floor_table.py`, seeded, with the optional imports inside
    `main()`; both reproduce the doc's tables exactly.

  Also dropped a `props` parameter from `useFunnelPageView` that nothing passed, and
  corrected three stale comments (`supabase/schema.sql`'s funnel-kind list, the
  `camera_blocked` reason list, and the claim that the two new rates cannot sum above
  1 — a session refused once and then capturing is in both).
- 2026-09-15 — Second autopilot cycle landed (PR #70). Consent: `latestConsent` matched
  loosely when unscoped, so a consumer's crop consent could dedupe against a pilot
  participant's grant and never be recorded. ML: a per-axis QWK/correlation floor now
  blocks a head that learned nothing, with ARU's scorers first checked against sklearn
  and scipy to 6.7e-16 over 1,982 matrices. Commerce: override rejections are visible,
  and the playbook's own naver example turned out to use a host that is not on the
  allowlist. Funnel: page views on the four surfaces that fired nothing. Supervisor
  re-ran `npm run smoke` independently (351 vitest, 66 Python self-tests, 0 lint errors)
  and reproduced the stdlib metric table byte-for-byte.
- 2026-09-16 (cycle 3) — Branch `autopilot/2026-09-16-0039`. All four tracks plus the
  two items the supervisor had sized. `npm run smoke` green on arrival and green again
  after every change, both runs with the documented `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
  override and nothing else. Baseline `63 files / 351 tests / 66 python`; final:

  ```
   Test Files  67 passed (67)
        Tests  376 passed (376)
    44 passed (2.4m)
  Ran 68 tests in 0.012s
  OK
  Smoke test passed.
  ```

  Lint was `✖ 2 problems (0 errors, 2 warnings)` before and after — the same two unused
  parameters in `lib/care.ts`, untouched by this diff.

  **ML — the tone stratifier was measuring the room.** The cycle set out to close the
  "`raw.toneIta` has no behavioural test" gap and the test found a defect instead of
  confirming the code. `lib/skin.ts` applied gray-world illuminant gains to the cheek
  pixels before computing tone. Gray-world estimates the illuminant from the *whole
  frame*, so a coloured wall behind the user was read as coloured light and divided out
  of their face. One synthetic face, held byte-for-byte identical, with only the wall
  changed:

  | wall | toneIta before | band before | toneIta after |
  |---|---|---|---|
  | grey (180,180,180) | 75.2 | very_light | 61.7 |
  | white (235,235,235) | 73.3 | very_light | 61.7 |
  | dark (60,60,60) | 82.3 | very_light | 61.7 |
  | cool blue (120,150,205) | 49.2 | light | 61.7 |
  | warm wood (200,150,105) | **-60.5** | **brown_dark** | 61.7 |

  Three of the five tone bands for one face — `very_light`, `light` and `brown_dark`,
  which is the full width of the scale; `intermediate` and `tan` do not appear. `relRedness` (0.00243) and `shine`
  (0.03973) were identical across all five rows before and after — the within-image
  indices were never affected, which is why nothing else caught it. This is the
  stratifier `ml/subgroups.py` derives every tone band from and the promotion gate
  blocks on, so a subgroup that "passed" may have been a subgroup of wallpaper. The
  `[0.6, 1.6]` clamp bounded each gain but not the angle: ITA divides by `b*`, and the
  warm-wood gains drag `b*` through zero, so the sign flips whatever the clamp — the
  comment claiming "extreme scenes cannot invent a tone shift" was wrong about what it
  bounded. `ml/ita.py` applies no gain offline and its docstring already required the
  two to match ("Change one, change both"), so the browser was the side that had
  drifted; and the two scales were not merely in different datasets but in the same
  file, since `ita_for_row` in `ml/prepare_crop_dataset.py` takes the app's value when
  there is one and recomputes through `ml/ita.py` when there is not. Fixed by measuring
  tone on the pixels as captured. `tests/tone-ita-contract.test.ts` — all 5 cases fail
  against `origin/main`, the wall case with
  `AssertionError: toneIta behind a warm wood wall: expected -60.5 to be 75.2`.

  `fallbackVersion` moves to `roi-calibrated-2026-09-16` in `lib/skin.ts` and in
  `public/models/visible-attributes/manifest.json` — the procedure
  `docs/label-free-axes.md` already states for a feature-semantics change and the one
  the 09-14 bump followed. Not guardrail 8: `status` and `promotionGate` are untouched.
  The measured invariant in that doc moved with the change and is corrected there —
  `toneLstar` under exposure ×1.12 now reads 70.0 → 77.6, was 69.6 → 77.2, while
  `toneSpread` (0.0532 → 0.0528) and `blemishCount` are unchanged, which is that
  section's own point.

  **What the fix does not fix, measured rather than waved at.** A ±12% / −8% channel
  cast still moves a mid-tone face about one band, and on a low-`b*` face it does far
  worse — the synthetic fixture goes 61.8 → −87.6, `very_light` → `brown_dark`, because
  ITA divides by `b*` and the cast pushes it through zero. `ml/ita.py` has always had
  this and the change neither causes nor cures it; what the change removed is a
  *second*, avoidable dependence on top of it. Before, one face spanned three bands with
  the light held constant and only the wall moving, which is noise with no signal in it
  at all. Table and the consequence for the fairness gate in
  `docs/tone-ita-verification.md` §3; backlog item with the numbers attached.

  **research — `docs/tone-ita-verification.md`.** Gating fairness on a metric means
  first checking it is the metric, and nothing had. `pypi.org` is still reachable, so
  colour-science 0.4.7 and scikit-image 0.26.0 gave two independent references; neither
  is or becomes a dependency (imported inside `main()`, same pattern as
  `ml/tools/verify_ordinal_metrics.py`). Over 4,000 random sRGB triples ARU's CIELAB
  agrees with colour-science to `3.717e-05` in L\*, `2.412e-03` in a\*, `1.381e-02` in
  b\*, and with scikit-image to `7.502e-03 / 2.062e-02 / 2.129e-02`; the residual is
  ARU's four-decimal sRGB→XYZ matrix against the references' longer one. ITA agrees to
  `4.844e-02` degrees on skin-plausible `|b*| > 5` and `2.985e-01` across the whole
  range, the difference being the formula's own conditioning near `b*=0` rather than a
  disagreement about colour. Six swatches are now pinned in both suites and agree with
  both references to `1.815e-02` degrees. What is **not** verified and is now a backlog
  item: the band cut points themselves. Also re-probed egress — `raw.githubusercontent.com`
  returns real content and `api.github.com` answers, which was not true last cycle;
  nothing else opened up.

  **UX — the report could contradict itself.** `mergeVisionAnalysis` rewrites the three
  buckets and `headline` arrived through `...base`, computed from the buckets as they
  were. So did `overall`, which the original report missed — the 전반 row on `/report`,
  the scan result card and `/studio`. Both are now rederived from `next.*`, via exported
  `headlineFor`/`narrativeFor` and an `overallFor` extracted out of `readsFromRaw` so
  the two paths share one definition. `payload.narrative` is still the override it was.
  Measured by reverting only the three recompute lines and keeping the exports, so the
  failures are behavioural rather than import errors — 5 of 6 cases fail:

  ```
  AssertionError: expected '피부 컨디션이 비교적 안정적이에요' to be '오늘은 진정 루틴이 먼저예요'
  AssertionError: expected { value: '대체로 안정', level: +0, …(2) } to deeply equal { value: '균형 관리 필요', level: 2, …(2) }
  ```

  That headline sat above rows reading 붉은기 뚜렷, from one scan of one face. The
  second-order half is settled by the same change: `localizedNarrative` returns the
  stored Korean sentence as-is and rebuilds it from the levels for every other
  language, so a stale stored sentence showed a Korean user one face and an English
  user another.

  **bug — the denied screen told users to fix something that was not broken.** The
  stream-attach failure recorded `camera_blocked {reason:"attach"}` and called
  `setPhase("denied")` with no `setDeniedReason`. `getUserMedia` has already resolved by
  then, so permission was granted, and the render chain ends in the 권한 branch as its
  `else` — the user was told to grant a permission they had already granted, or shown
  the previous attempt's reason, since `startCamera` never clears it. Fixed with an
  `attach` reason and its own copy in all four dictionaries.
  `tests/camera-denied-reason.test.ts` fails on the next path that forgets, and 2 of
  its 5 cases fail against `origin/main`.

  **commerce (revenue-upstream #1) — the sku half of the override audit.** Last cycle
  left it as a documented gap because `lib/skus.ts` imports `lib/commerce.ts`. Closed by
  injection rather than a new module: the ids come from the caller that already holds
  `SKUS`, so `lib/commerce.ts` still imports nothing. `/api/out` passes them, which puts
  the check on the production hot path; `/api/sync` GET reports the accepted/rejected
  split and `/ops` renders it, which is the first screen an operator can see it on —
  **behind the sync token**, which the adversarial review changed (see below). `value`
  is never returned: the URL stays in the server log, where an operator debugging a
  typo'd host needs it. Verified against the built server with one good override and one
  of each rejection kind:

  ```
  --- GET /api/sync  (unauthenticated) ---
  { "configured": …, "rateLimit": {…} }            # no commerceOverrides key at all
  --- GET /api/sync  (Bearer <SUPABASE_SYNC_TOKEN>) ---
  "commerceOverrides": {
    "configured": true, "parsed": true, "accepted": 1,
    "issues": [
      { "sku": "UNRELEASED_Q4", "merchant": "oliveyoung",     "reason": "unknown-sku" },
      { "sku": "cl1",           "merchant": "kurly",          "reason": "unknown-merchant" },
      { "sku": "sr1",           "merchant": "naver-shopping", "reason": "not-https-or-allowlisted" }
    ]
  }
  --- GET /api/out with the one valid override ---
  status=302
  location=https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000123456&utm_source=kbeauty_ai_camera&utm_medium=commerce_link&utm_campaign=skin_scan_recommendation&utm_content=verify_tn1_oliveyoung
  --- server log (never leaves the server) ---
  [commerce] override for UNRELEASED_Q4/oliveyoung ignored: "UNRELEASED_Q4" is not a sku id in the catalogue. The link is still a search URL.
  [commerce] override for cl1/kurly ignored: "kurly" is not a merchant id (oliveyoung, naver-shopping, coupang, global-search). The link is still a search URL.
  [commerce] override for sr1/naver-shopping ignored: the URL is not an https URL on the allowlist (www.oliveyoung.co.kr, search.shopping.naver.com, www.coupang.com, www.google.com) (https://smartstore.naver.com/b/products/1). The link is still a search URL.
  ```

  The third row is worth noting on its own: `smartstore.naver.com` is the host the
  partnership playbook used as its worked example before last cycle corrected it, and is
  still the host a real 네이버 쇼핑 커넥트 link is most likely to be on. The allowlist
  blocker below stays open. 3 of the 5 new cases fail against `origin/main`; the other
  two are no-regression guards for the no-catalogue caller and are not evidence.

  **confidence label — the contract test the supervisor asked for, not a refactor.**
  Both copies stay where they are and are exported only so the test can hold them
  together. It sweeps 0→1 in 0.0005 steps plus both boundaries at ±1e-9 and ±1e-12,
  and asserts equality, monotonicity, that each uses all three labels, and that both
  boundaries sit in the same place to 12 decimals. It pins the agreement rather than
  the numbers, because the open backlog item may yet move them. Verified by drifting
  one copy to 0.80: `42 of 2013 values disagree`, 2 of 4 cases fail. Its limits are in
  its own header rather than left implied: `0.58` lives in five places and this holds
  two of them, so moving it in both labels still passes. Now a backlog item.

  **review** Three subagents reviewed the diff before commit, and the review changed it
  in eight places. Recording them because the protocol asks for this step and it is only
  worth the tokens if it finds things:

  - The override audit was returned to **anyone**, justified by a claim that is true of
    catalogue ids and false of exactly the rows the new check surfaces. Now behind the
    sync token. Two reviewers found this independently.
  - No version identifier moved for a feature-semantics change, against the repo's own
    written rule and its own precedent. `fallbackVersion` now bumps in both places. An
    earlier draft instead wrote a comment claiming the string "has never actually
    changed" — true of `inputSchemaVersion`, false of `fallbackVersion`, which is the
    one the three "Bumped" comments actually describe.
  - **"four of the five tone bands" was wrong: it is three.** 75.2 / 73.3 / 82.3 / 49.2
    / −60.5 are `very_light, very_light, very_light, light, brown_dark`; `intermediate`
    and `tan` never appear. The table was right and the sentence over it was not, in
    four places.
  - The cost of the fix was described in prose and never measured. Now a table, and the
    worst case in it (−87.6) is worse than the prose implied.
  - `docs/label-free-axes.md` carried a measured `toneLstar` invariant this change moved
    and no test guards (the assertion is only `> 2`). Re-measured. `docs/golden-set.md`
    still named `roi-calibrated-2026-07-03` and "gray-world 톤 보정", and
    `docs/analysis-performance-roadmap.md` had an open item whose literal wording would
    have re-added frame-mean gray-world. Both corrected.
  - `describeCommerceOverrideIssue` needed `value` for one branch, and `value` is
    withheld from `/ops` — so the helper written for that screen could only ever be used
    by the log it was meant to replace. It now takes only the identifying fields.
  - The camera test's proximity window could be satisfied by the *previous* path's
    `setDeniedReason` if the code between them shrank, one plausible refactor away from
    silently re-admitting the exact bug. The load-bearing assertion is now a count. Its
    `[a-z]+` regexes would also have dropped a hyphenated or camelCase reason, and an
    extracted union type would have made `declaredReasons()` return `[]` while every
    test still passed; both now fail loudly.
  - `/ops` rendered "Status unavailable" on every first paint before the fetch resolved,
    and would have crashed the page on a cached response missing `issues`. The tone test
    re-parsed `ITA_BANDS` out of the Python when `lib/tone-bands.ts` already exports
    `toneBandFromIta` and `tests/subgroup-contract.test.ts` already pins the two
    together. A redundant dictionary check duplicated `tests/i18n-coverage.test.ts` more
    weakly and its window ran past the denied block into the camera-paused one.


  **Supervisor review, 2026-09-16 01:33–01:50 UTC.** Every number this cycle wrote into
  a doc was re-derived by running it, not read. `ml/tools/verify_tone_ita.py`
  reproduces its §1 table digit for digit in a fresh venv against colour-science 0.4.7
  and scikit-image 0.26.0. Re-applying the gray-world gains to the tone path reproduces
  the §2 "before" column exactly (grey wall 75.2, warm wood −60.5) and additionally
  collapses all six flat swatches to ITA 90.0 — a flat frame is its own gray-world
  reference, so the balanced tone of every swatch is neutral. `toneLstar` 70.0 → 77.6
  at exposure ×1.12 with `toneSpread` 0.0532 → 0.0528 and `blemishCount` unchanged,
  as `docs/label-free-axes.md` now states. Each new guard was broken on purpose and
  failed: `confidence-label-contract` (0.78 → 0.80), `camera-denied-reason`
  (`setDeniedReason` removed), `vision-merge-consistency` (headline rederivation
  removed), `tone-ita-contract`. The sku check reaches `auditCommerceOverrides` by
  injection from `/api/out`, so `lib/commerce.ts` still imports no catalogue and the
  cycle it was avoiding does not exist. Two corrections made in review: a `value` field
  passed to `describeCommerceOverrideIssue` in `tests/commerce.test.ts` added two
  `tsc --noEmit` errors main does not have (16 → 18, both in test files), and
  `docs/architecture.md` said the wall moved one face across four tone bands where the
  measurement is three.

- 2026-09-16 (cycle 4) — Branch `autopilot/2026-09-16-0639`. All four tracks. Baseline on
  arrival, with `npm ci` run first because `node_modules` was absent: `67 files / 376
  vitest / 68 python`, lint `0 errors, 2 warnings`, `tsc --noEmit` **13 errors, all in
  test files** — not the 16 the cycle brief expected, and the same 13 before and after
  this diff. Final:

  ```
   Test Files  69 passed (69)
        Tests  385 passed (385)
  Ran 77 tests in 0.015s
  OK
  ```

  `npm run smoke` green after every change, with the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  override and nothing else (tail of the run, verbatim):

  ```
  Ran 77 tests in 0.014s
  OK
  ok GET /scan -> 200
  ok GET /privacy -> 200
  ok GET /offline.html -> 200
  ok GET /sw.js -> 200
  ok GET /pilot -> 404
  ok GET /ops -> 404
  ok GET /eval -> 404
  ok GET /api/out?sku=tn1&merchant=oliveyoung&placement=smoke -> 302
  ok GET /api/sync -> 200
  ok POST /api/sync -> 401

  Smoke test passed.
  ```

  Only the tail was captured, so the vitest and Playwright counts quoted above are from
  the separate `npx vitest run` and `python3 ml/selftest.py` runs, not read off the
  smoke log.

  **ML — one manifest number, three meanings, and the gate was reading the wrong one.**
  `promotionGate.subgroup.minSamplesPerBand` is published as 20. `_aggregate` handed
  `worst_group` the SUM of the per-axis label counts, so the floor was applied to a
  number that is neither samples nor anything a floor can be written about. The backlog's
  reproduction was re-run against the real function (lifted out by AST, since the trainer
  imports torch and torch is not installed here) and matched it exactly:

  ```
  real samples in the cell:  10
  labelled axes           :  3
  n reported to worst_group: 30
  manifest minSamplesPerBand: 20
  clears the floor?          True
  ```

  A subgroup a third the documented size, evaluated as if it met the floor — the same
  class of defect as the tone bug cycle 3 found, in the same gate. After, from
  `ml/tools/verify_subgroup_sample_unit.py`, which prints both units side by side from
  one run of the real code rather than from a reimplementation of the old body:

  ```
  --- a cell of 10 real samples labelled on 3 axes ---
    observations (summed across axes, the pre-fix 'n'): 30
    n (labelled samples on the thinnest axis)         : 10
    manifest minSamplesPerBand                        : 20
    gating on observations: 30 >= 20 -> clears the floor
    gating on n           : 10 >= 20 -> refused
    worst_group evaluated?                            : False
  --- a cell of 20 real samples labelled on 3 axes ---
    observations (summed across axes, the pre-fix 'n'): 60
    n (labelled samples on the thinnest axis)         : 20
    gating on n           : 20 >= 20 -> clears the floor
    worst_group evaluated?                            : True
  ```

  The unit chosen is the one `fit_tone_calibration` already used: labelled samples on
  one axis. The minimum across axes rather than the mean or the max, because the cell's
  accuracy is a label-weighted average ACROSS axes — a cell whose pores head saw 3
  samples and whose oil head saw 200 has an aggregate number that says nothing
  trustworthy about pores, and the floor exists to refuse exactly that. Axes carrying no
  label in the cell are skipped rather than counted as zero, or any axis the dataset does
  not label everywhere would make every cell permanently unevaluable. The old sum stays
  as `observations`, named for what it is. `coverage_warnings` is the third meaning and
  keeps counting rows, because it runs on metadata before any label is read and cannot do
  otherwise; its docstring now says that a row count is an UPPER bound on what the gate
  applies, so a silent coverage report is not a promise the gate will find the cell
  evaluable. The function moved to stdlib-only `ml/subgroups.py` as `aggregate_by_cell`
  — the move is what put it in reach of `ml/selftest.py`, same as `promotion_check` and
  the ordinal scorers, and the trainer keeps `_aggregate = subgroups.aggregate_by_cell`
  with a selftest that fails if a second copy reappears. selftest 68 → 77.

  **bug / research — `blemishDensity` was measuring the camera, not the face.** Measured
  before deciding the normalisation, as the item required. The
  `tests/skin-index-contract.test.ts` synthetic face rendered at seven frame sizes, face
  width 72px to 518.4px (7.2x), landmarks and spot radii scaling with it so it is one
  face at seven capture resolutions:

  | frame | faceW | count | areaPx | areaPx / faceW² | density (pre-fix) |
  |---|---|---|---|---|---|
  | 200x240 | 72.0 | 5 | 10,577 | 2.0403 | 472.72 |
  | 400x480 | 144.0 | 2 | 42,032 | 2.0270 | 47.58 |
  | 800x960 | 288.0 | 6 | 167,238 | 2.0163 | 35.88 |
  | 1440x1728 | 518.4 | 3 | 537,804 | 2.0012 | 5.58 |

  `areaPx` moves **50.8x**, `areaPx / faceW²` moves **1.9%**, and the density collapses
  **84.7x** while the count stays between 2 and 8. The detector's grid stride is already
  a fraction of the face width, so the sampled area is invariant in face-width units and
  the pixel denominator was the only scale-dependent term in the index. `detectBlemishes`
  now returns `areaFace`, and `ml/skin_indices.blemish_density` takes `face_width_px` so
  the offline mirror uses the same unit — the "change one, change both" rule the tone
  path broke in exactly this way. `fallbackVersion` → `roi-calibrated-2026-09-16b` in
  `lib/skin.ts` and the manifest, because feature semantics moved and pre-bump values are
  on a resolution-dependent scale; `status` and `promotionGate` untouched, so not
  guardrail 8.

  **What the fix does not fix, said plainly.** With pixel noise off the count still reads
  2, 4, 2, 4, 3, 5, 3 across the sweep for one face with five spots on it: the detector
  point-samples its grid and a disc landing between sample points is missed. After the
  denominator fix the density spans 2.54x with no trend; before, 33.9x monotonically
  decreasing. A systematic bias became scatter. That is a real improvement and it is not
  "comparable across resolutions" — the remaining half is an aliasing defect, now its own
  backlog item with the numbers attached. `docs/capture-resolution-invariance.md` has the
  full tables and is re-runnable from the committed test
  (`ARU_PRINT_SCALE_SWEEP=1 npx vitest run tests/blemish-density-scale.test.ts`), so the
  numbers do not rest on a script nobody kept — the failure mode cycle 2's review caught.

  **UX — the camera being taken away and the user switching tabs were the same event.**
  `interruptCamera` took no argument, so `watchCameraStream`'s `"muted"`/`"ended"` reason
  died at the callback: a live camera seized by another app mid-scan recorded nothing in
  the funnel at all, and the screen told that user "계속하려면 카메라를 다시 켜주세요" —
  an instruction for someone who put the camera down themselves, not for someone whose
  camera was taken. The reason is now carried from the call site, which is what the
  backlog item required before either case could be counted: `visibilitychange` and
  `pagehide` pass `"backgrounded"` and are ARU stopping its own stream, not a loss. New
  `camera_interrupted` funnel kind (`reason`: muted | ended | backgrounded), distinct
  from `camera_blocked`, which is a camera that never opened and whose copy does not
  apply once permission has been granted and the hardware has worked. New copy in all
  four dictionaries.

  **verification** Each new guard was broken on purpose and watched fail, which is the
  only part of a test that is evidence:

  - `aggregate_by_cell`'s `"n": min(labelled_axes)` reverted to the pre-fix sum →
    5 of 7 new selftest cases fail, including
    `AssertionError: 30 != 10 : 10 real samples must not be reported as 30` and
    `AssertionError: 76 != 6`. The other two (`no labels at all`, `no second copy in the
    trainer`) pass either way and are guards, not evidence — the second was checked
    separately by re-adding a `def _aggregate(` to the trainer, which fails it.
  - `blemish_density`'s denominator reverted to `sampled_area_px / 1e6` →
    `AssertionError: 142.7483821850019 != 11.156480799696546 within 2.854967643700038
    delta`.
  - `detectBlemishes` reverted to `/ 1e6` → 2 of the 3 cases in
    `tests/blemish-density-scale.test.ts` fail:
    `expected 50.84655384324478 to be less than 1.03` and
    `expected 0.07815486682880753 to be greater than 0.970873786407767` — i.e. the same
    face read 12.8x apart between a 400x480 preview and a 1440x1728 still.
  - `interruptCamera`'s parameter and the funnel call removed → 4 of the 5 cases in
    `tests/camera-interrupt-reason.test.ts` fail. The fifth pins the copy branch and
    survives that particular break, which is stated here rather than counted as evidence.

  **Supervisor review, 2026-09-16 07:20–07:35 UTC.** Every figure re-derived by running
  it. `ml/tools/verify_subgroup_sample_unit.py` reproduces the unit bug against the live
  manifest floor: a cell of 10 real samples on 3 axes reports `observations=30`, clears
  a floor of 20 on the old unit and is refused on the new one, `worst_group evaluated?
  False`. The resolution sweep reproduces every row of
  `docs/capture-resolution-invariance.md` — `areaPx` 10,577 → 537,804 (50.8x),
  `areaPx / faceW²` 2.0403 → 2.0012 (1.9%), pre-fix density 472.72 → 5.58 (84.7x), and
  the noise-free counts 2/4/2/4/3/5/3 that §3 is honest about. Guardrail 8 respected:
  the manifest change is `fallbackVersion` only.

  Two corrections made in review. The README entry was inserted between the tone line
  and its own parenthetical, so the tone note rendered as a description of the new
  capture-resolution doc; the new entry now carries its own. And
  `tests/camera-interrupt-reason.test.ts` had a hole: deleting `setInterruptReason(reason)`
  from `interruptCamera` left all five assertions green while the render branched on a
  state that never left its initial `"backgrounded"` value — every seized camera would
  have shown the backgrounding copy, which is the exact bug the item existed to fix. One
  assertion added; it fails on that deletion. The other new guards were broken on purpose
  and did fail: `blemish-density-scale` (denominator back to `/1e6`, "expected 50.8 to be
  less than 1.03") and the four `SubgroupSampleUnit` cases in `ml/selftest.py`
  (`"n": observations`, "10 real samples must not be reported as 30").

  Verification on the merged head: vitest 386 in 69 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `npm run smoke` green, `tsc --noEmit` 16 errors — the same 16
  main carries, all in test files.

- 2026-09-16 (cycle 5) — Branch `autopilot/2026-09-16-1239`. All four tracks; the
  supervisor's pre-sized item covered ML and bug, as instructed. Baseline counted on
  arrival, with `npm ci` run first because `node_modules` was absent again:
  `69 files / 386 vitest / 77 python`, lint `0 errors, 2 warnings` (the same two unused
  parameters in `lib/care.ts`), `tsc --noEmit` **13 errors, all in test files** — not
  the 16 the cycle brief quoted, and the same 13 cycle 4 counted. Final:

  ```
   Test Files  70 passed (70)
        Tests  390 passed (390)
  Ran 77 tests in 0.018s
  OK
  ✖ 2 problems (0 errors, 2 warnings)
  ```

  `tsc --noEmit` is 13 again at the end. It was **14** mid-cycle — the new test typed a
  `Bucket.level` as `number` where the type is `SkinLevel = 0 | 1 | 2` — and that is
  recorded rather than quietly fixed, because "the branch must not add a tsc error" is
  only a real check if a breach gets written down when it happens.

  **ML + bug — the blemish count was resolution-sensitive, and both named fixes were
  needed.** Measured first with the committed sweep, as the item required:

  ```
  ARU_PRINT_SCALE_SWEEP=1 npx vitest run tests/blemish-density-scale.test.ts
  ```

  Noise off, one synthetic face, five discs on it, face width 72px to 518.4px:

  | frame | faceW | count before | count after |
  |---|---|---|---|
  | 200x240 | 72.0 | 2 | 2 |
  | 300x360 | 108.0 | 4 | 4 |
  | 400x480 | 144.0 | 2 | **3** |
  | 600x720 | 216.0 | 4 | **3** |
  | 800x960 | 288.0 | 3 | **3** |
  | 1080x1296 | 388.8 | 5 | **3** |
  | 1440x1728 | 518.4 | 3 | **3** |

  Over face widths 144px to 518.4px (3.6x) the sequence went **2, 4, 3, 5, 3 →
  3, 3, 3, 3, 3**. The backlog named two candidate fixes and it turned out to need both,
  each verified load-bearing by deletion (below). The first is the one the item did not
  name as the larger half: `stride = Math.round(faceW / 90)` moved the effective grid
  between 72 and 108 cells across, and since `backgroundRadius` (5) and
  `suppressionRadius` (2) are counted in CELLS, the rounding moved the *physical size of
  every window the detector uses*, not just the sampling density. A fractional stride
  fixes all three in face-width units. The second is the aliasing the item did name:
  the stride window is averaged instead of its corner pixel being read, so a disc
  between two sample points is no longer missed. The windows tile the face box, so the
  cost is one pass over it however fine the grid gets. `areaPx / faceW²` tightened from
  1.0199 to **1.0109** as a side effect.

  The two smallest frames still disagree and are excluded **by name** in the test and
  the doc rather than dropped: at faceW 72px `Math.max(1, ...)` clamps the stride to one
  whole pixel, so the grid is 72 cells across instead of 90 and the detector is in a
  different regime from every frame above it. Neither is a face size a real capture
  produces.

  `fallbackVersion` → `roi-calibrated-2026-09-16c` in `lib/skin.ts` and in
  `public/models/visible-attributes/manifest.json`, because feature semantics moved and
  pre-bump `blemishCount` values are on a different scale. **Saying it loudly as
  guardrail 8 requires: the manifest diff is one line and it is `fallbackVersion` only —
  `status` and `promotionGate` are untouched.** `ml/skin_indices.py` needs no matching
  change: it carries `blemish_density(count, sampled_area_px, face_width_px)` and no
  detector, so the "change one, change both" rule has nothing to mirror here.

  **What the fix uncovered, which is the part worth reading.**
  `tests/skin-index-contract.test.ts`'s `survives a per-channel gain change` asserted
  `warmer.blemishCount === baseline.blemishCount` and was green. It was green at
  **2 == 2**: the point-sampling detector found the same 2 of the 5 discs in every
  condition, so a test written to pin device-invariance was passing on blindness. With
  the window averaged the baseline finds all 5 and the `[1.12, 1, 0.92]` cast finds 3.
  Probed before concluding — removing the gray-world gains from `detectBlemishes`
  leaves both numbers at 5 and 3, so the cast moves the a* residual itself and the
  sensitivity is pre-existing, not introduced. The exposure case (×1.12) is still
  exactly invariant, at 5. That test case now records the two counts exactly, with the
  reason in its own comment, instead of asserting a property that is false; the
  property is a new backlog item, next to the ITA cast sensitivity it shares a cast and
  a fixture with.

  **research — the cost of the change, because O(grid cells) became O(face box).**
  The backlog's per-scan cost item is answered by half and the half that is not is said
  so. `analyzeSkin` over 20 runs on the same synthetic face, build container, node
  v22.22.2:

  | frame | before | after | increase | per 3-frame burst |
  |---|---|---|---|---|
  | 400x480 | 8.61 ms | 13.25 ms | +54% | +13.9 ms |
  | 640x480 | 5.61 ms | 8.15 ms | +45% | +7.6 ms |
  | 960x1280 | 12.40 ms | 15.42 ms | +24% | +9.1 ms |
  | 1440x1728 | 12.95 ms | 14.35 ms | +11% | +4.2 ms |

  The relative increase falls as resolution rises because `sampleRegion` and
  `frameChannelGains` are already O(frame) and dominate there. The scan path uses
  `video.videoWidth || 720` (`app/scan/use-capture-analysis.ts:123`), so it sits between
  the middle two rows. **This is a container measurement, not a device measurement.** The
  backlog item asks for a mid-range phone profile and stays open; no multiplier was
  applied to these numbers to manufacture a phone figure, because that would be an
  estimate written down as a measurement.

  **UI/UX — one screen could disagree with itself about whether the scan was any
  good.** The backlog item, done as the test it asked for. The `0.58` floor lives in
  five places: `confidenceLabel` and `confidenceLabelFor` (the two byte-identical
  copies), `overallFor`'s 재촬영 권장 branch, and `retakeRecommended` inline in each of
  `lib/skin.ts` and `app/scan/capture-analysis.ts`. Moving it in the two *labels* — the
  pair `tests/confidence-label-contract.test.ts` was built to hold together — passed
  every test in the repo while leaving a scan at 0.59 rendering 낮음 in the confidence
  chip directly above 대체로 안정 in the 전반 row, with `retakeRecommended: false`. Same
  class of self-contradiction `tests/vision-merge-consistency.test.ts` exists to
  prevent, one field over.
  `tests/confidence-threshold-agreement.test.ts` pins the three exported sites
  behaviourally — a 2001-point sweep asserting 낮음 ⟺ 재촬영 권장 and that the two label
  copies agree at every point, plus both boundaries at ±1e-9 and ±1e-12 — and all five
  sites as source literals, the two inline ones by regex whose anchor fails loudly
  rather than silently matching nothing if the code moves. Kept out of the label
  contract test on purpose: the supervisor set that file's scope, and the open
  `confidenceLabel` item may still move the numbers it deliberately does not pin.

  **verification — each new guard broken on purpose, by deleting the line it protects
  rather than by editing the test.**

  - `stride` reverted to `Math.max(1, Math.round(faceW / BLEMISH.gridAcrossFace))`, one
    line, box average left in place → 3 cases fail:
    `AssertionError: counts across resolutions: 2, 6, 3, 5, 2: expected 4 to be 1`,
    and both skin-index-contract cases with `expected 2 to be 5`.
  - The box average collapsed back to a corner point-sample (`bx1 = bx0; by1 = by0`),
    fractional stride left in place → 3 cases fail:
    `AssertionError: counts across resolutions: 2, 3, 5, 5, 4: expected 4 to be 1`,
    `expected 5 to be 4`, `expected 4 to be 5`.
    So neither half of the fix is decoration; the count is wrong in a different way
    without each.
  - `0.58` → `0.62` in BOTH `confidenceLabel` copies and nowhere else → all 3 cases of
    `tests/confidence-threshold-agreement.test.ts` fail
    (`confidence 0.58: label 낮음=true but 전반 재촬영 권장=false`,
    `expected '낮음' not to be '낮음'`,
    `the five sites carry: 0.62, 0.58, 0.58, 0.62, 0.58`) while
    `tests/confidence-label-contract.test.ts` reports `4 passed` — which is precisely
    the hole the backlog item described.

  **smoke.** Green, with the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  override and nothing else. Tail, verbatim:

  ```
   Test Files  70 passed (70)
        Tests  390 passed (390)
    44 passed (3.2m)
  Ran 77 tests in 0.016s
  OK
  ok GET /scan -> 200
  ok GET /privacy -> 200
  ok GET /offline.html -> 200
  ok GET /sw.js -> 200
  ok GET /pilot -> 404
  ok GET /ops -> 404
  ok GET /eval -> 404
  ok GET /api/out?sku=tn1&merchant=oliveyoung&placement=smoke -> 302
  ok GET /api/sync -> 200
  ok POST /api/sync -> 401

  Smoke test passed.
  ```

  An earlier draft of this entry recorded smoke as skipped for budget. It was then run
  and it passed, so the entry says what happened rather than what was planned.

  **Supervisor review, 2026-09-16 13:20–13:40 UTC.** Every figure re-derived by running
  it. The sweep reproduces §5.2's "after" column exactly — noise-free counts
  2, 4, 3, 3, 3, 3, 3 where cycle 4 measured 2, 4, 2, 4, 3, 5, 3 — and the denominator
  spread, `areaPx / faceW²` max/min 1.0199 → 1.0109, recomputes from those rows.
  §5.3's channel-cast finding reproduces including its control: 5 and 3 with the
  gray-world gains applied in `detectBlemishes`, 5 and 3 with them removed, so the cast
  moves the a* residual itself. Exposure ×1.12 still reads 5. Both halves of the fix
  are guarded — point-sampling restored gives "counts across resolutions: 2, 3, 2, 4, 2",
  re-rounding the stride gives "2, 6, 3, 5, 2", and each also fails the two
  `skin-index-contract` count pins.

  Two corrections made in review.

  **§5.4's cost table was one run, and its trend does not survive three.** The draft
  read +54% / +45% / +24% / +11% and explained the fall as the rest of `analyzeSkin`
  being O(frame) and dominating at high resolution. Re-measured with 5 warm-up calls,
  30 timed calls and three repeats per condition, the last row is +28%, not +11% — the
  draft's 12.95 ms "before" at 1440x1728 is high against 12.30 / 11.66 / 11.58 here,
  which is what made the increase look small. Medians: +53% / +33% / +24% / +28%,
  i.e. **+3 to +5 ms per frame**, +9 to +15 ms for a three-frame burst. The mechanism
  is plausible and this data does not show it, so it is out. Reading a monotone pattern
  off one sample is interpretation, not measurement, and the same guardrail that bans
  invented numbers should ban invented trends in them.

  **`tests/skin-index-contract.test.ts` tested only invariance, never a value.** Every
  case in it compares two readings, so a constant factor cancels. Verified by mutating
  `lib/skin.ts` one line at a time on main at 90611f9 and again on this branch:
  `toneSpread * 1.5`, `roughnessRatio * 1.5` and `blemishDensity * 1.5` each left all
  eight cases green. `ml/calibrate.py` draws thresholds from exactly those fields, and
  `docs/label-free-axes.md` requires a `fallbackVersion` bump when feature semantics
  move — a scale change is such a move, and three bumps landed on 2026-09-16 because a
  comment remembered to, not because anything checked. Absolute pins added for
  `toneSpread` (0.05322874576592159), `roughnessRatio` (1.07506721426881),
  `blemishDensity` (2.4772157318490424) and `blemishCount` (5); each of the three
  mutations now fails it. They are self-consistency pins, not outside-verified numbers
  like the ITA swatches, and the comment says so.

  Verification on the merged head: vitest 391 in 70 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `npm run smoke` green, `tsc --noEmit` 16 — the same 16 main
  carries, all in test files.
- 2026-09-15 (2) — ML track: the qwk/pearson gate, **superseded before it merged.**
  This branch built `promotionGate.subgroup.minQwk` / `minPearson` and an
  `ordinal_quality_check`; cycle 2 on `autopilot/2026-09-15-1839` independently built
  the same rule as `promotionGate.ordinal` and `subgroups.ordinal_check`, and merged
  first (PR #70). Its version won on merge: it verified both scorers against
  scikit-learn and SciPy and chose 0.4 from a measured table of predictors, where this
  one cited a convention whose primary source is egress-blocked from the worker. This
  branch's duplicate was deleted rather than reconciled — including two copies of
  `min_qwk()`/`min_pearson()` in `model_contract.py`, where the later definition
  silently shadowed the earlier and would have read a manifest key nothing else wrote.

  **Two autopilot cycles built the same thing at the same time.** Nothing in the loop
  tells a cycle what another is holding, so the only signal was a merge conflict. Worth
  a guard before the next parallel cycle: a branch naming convention, or a claim line
  in this file that a cycle writes before starting a backlog item.

  What survived from it, because cycle 2 had none of it: the gate scored the LAST
  epoch's confusion while promoting the BEST checkpoint, so every number it judged
  belonged to weights nobody would ship — main still had that bug and this branch
  fixes it.

- 2026-09-15 (3) — ML track, continued at the owner's direction: the heuristic
  baseline. The gate now scores the **shipped ROI heuristic** — the three threshold
  pairs in `lib/skin.ts` — on the same validation rows, through the same
  confusion-matrix code, and blocks a model that does not beat it per axis on qwk.

  This closes the gap the last two cycles kept naming. Every rule in the gate asked
  whether the model was good in absolute terms; none asked whether it should REPLACE
  what already ships. A model could clear the subgroup gap, clear the qwk floor, and
  still be worse than three numbers in a TypeScript file — and promoting it would have
  made the product worse with every figure in the report looking healthy.

  - `ml/ordinal_metrics.py` (new, stdlib-only): `quadratic_weighted_kappa`,
    `pearson_from_confusion`, `metrics_from_confusion` moved out of the torch-importing
    trainer, which re-exports them. Model and heuristic are now scored by the same code
    — a baseline from a second implementation is not a baseline.
  - `ml/heuristic_baseline.py` (new, stdlib-only): applies the shipped rule to the
    recorded ROI features and reports `scoredRows` / `skippedNoFeature`, so "the
    heuristic scored well" and "the heuristic was scored on nine rows" cannot look the
    same.
  - The manifest gains a `fallbackHeuristic` block mirroring `ATTR_THRESHOLDS` and
    `ATTR_RAW_KEY`, so Python never re-declares them.
    `tests/skin-index-contract.test.ts` fails on drift AND checks that applying the
    manifest rule to real `analyzeSkin` output reproduces the levels the app reports,
    cut-point edge convention included. Verified the guard bites: drifting one
    threshold 0.05 -> 0.06 fails with
    `AssertionError: oil: expected [ 0.05, 0.16 ] to deeply equal [ 0.06, 0.16 ]`.
  - Fails closed. An axis the heuristic covers but whose feature is missing from the
    data blocks, which is what correctly makes a pretrain on external data
    unpromotable: it carries none of ARU's ROI features.
  - **Both numbers must come from the same rows**, and this was a real flaw found in
    this cycle's own draft. The model is scored on every labelled validation row; the
    heuristic can only be scored on labelled rows that also carry its ROI feature. The
    first version compared the two qwk values anyway, so a heuristic measured on a
    strict subset would have been presented as a like-for-like baseline. The gate now
    requires `scoredRows == n` per axis and blocks otherwise, naming the count. A test
    pins it with a model "winning" by 0.80 on mismatched rows and still not passing.

  A tie does not pass — `minQwkGainOverHeuristic` is 0.0 meaning strictly greater. It
  is 0.0 rather than a positive margin because a margin should exceed validation noise
  and nothing estimates that noise yet; inventing one would have been a fake number.
  The bootstrap that would earn a real margin is now the top ML backlog item.

  **Not exercised on real data.** There are zero consented crops, so this gate has
  never produced a `metrics.json` containing a `heuristic_baseline` block, and
  `score()` has never run against a real trainer `Row` — every case uses a fake row or
  a hand-built dict. Verified by construction and by selftest, not by a training run.

  Adversarial review then found two blocking defects in this cycle's own draft:

  - **It failed OPEN when the manifest was missing.** `fallback_heuristic()` returned
    `{}`, so `covered_axes()` went empty, the beats-the-heuristic rule skipped every
    axis, and a model was promotable having never been compared to the rule it would
    replace — in exactly the scenario `FALLBACK_GATE`'s own comment anticipates, a
    checkout without the web app. Every other floor survived that; this one evaporated.
    There is now a `FALLBACK_HEURISTIC` constant beside `FALLBACK_GATE`.
  - **The cut-point guarantee was false.** The edge test defined its own copy of the
    rule and asserted the copy against itself, and all three synthetic frames land in
    level 0, so nothing exercised a cut point. Confirmed by flipping `<` to `<=` in
    `lib/skin.ts`: all 13 tests stayed green. `levelFor` is now exported and the test
    asserts the REAL function at `lo`, `lo-ε`, `hi`, `hi-ε` for every axis, plus a
    41-point sweep and a check that `bucket()` and `levelFor()` share one expression.
    Re-verified after the fix: flipping either copy, or both, fails 3 tests.

  Also fixed from the same review: the gate scored the LAST epoch's confusion while
  promoting the BEST checkpoint, so the qwk being compared belonged to weights nobody
  was going to ship; the drift guard only looked one way, so an axis added to
  `lib/skin.ts` and absent from the manifest was invisible; a malformed threshold list
  was masked rather than rejected, and a short list makes the heuristic WEAKER and the
  gate easier; labels were never range-checked; and four stale sentences still said the
  pipeline records no heuristic baseline, one of them three lines above the section
  describing it.

  Verified: `python ml/selftest.py` 61 -> 81 tests, OK.
