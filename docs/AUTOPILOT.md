# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-15

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
- [AI] `confidenceLabel` no longer distinguishes reading ambiguity. After the
  2026-09-15 fix, a frame whose three capture signals all pass lands in
  [0.7804, 0.9424], and the 높음 gate is 0.78 — so it reads 높음 even when all three
  readings sit exactly on their cut points. The label is now a restatement of capture
  quality, and it clears the gate by 0.0004, so any later nudge of the 0.695 floor or
  the 0.78 threshold flips every well-captured scan at once. Decide whether the
  attribute term should get more travel in `readsFromRaw`, or whether the label should
  be dropped to two levels. Note `confidenceLabel` is duplicated byte-for-byte in
  `app/scan/capture-analysis.ts`.
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
- [AI] Server-side funnel telemetry. `lib/funnel.ts` is localStorage-only, so nobody
  can see where users drop off. Without it every UX cycle is guessing. (Still open —
  2026-09-15 added `share_landed` and `viralActivation`, but they are still on-device.)
- [AI] Four more drop-offs are uninstrumented, found while adding `share_landed`:
  the home page fires nothing; `/scan` records `scan_started` only at shutter, so a
  camera permission denial is invisible; `/care` records only `commerce_clicked`; and
  `/checkin` — the landing page for every re-engagement email — has no funnel import
  at all.
- [AI] Measure the real per-scan cost of the new within-image indices on a mid-range
  phone profile, not on the build container.
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

- [AI] `minQwkGainOverHeuristic` is 0.0 — strictly-greater, with no noise band. A
  model that beats the heuristic by 0.001 on one validation split passes, and that
  gain may be noise. Estimate the band: bootstrap the validation rows, report a CI on
  the qwk difference, and require the gain to clear it. That is the honest version of
  a margin, and the reason no positive number was invented for it.
- [AI] `minQwk`/`minPearson` remain **0.4 and provisional**: a floor against
  degeneracy, not a quality claim. 0.4 sits near the fair/moderate boundary of the
  commonly cited Landis & Koch kappa bands — their moderate band begins at 0.41, and
  the primary source is egress-blocked from this worker, so the convention itself is
  recorded as unverified. It has not been measured on ARU data. With the heuristic
  baseline now in the gate, this floor matters less than it did: "beats what ships"
  is the bar that carries the decision.
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
- [AI] `raw.toneIta` has no behavioural test anywhere, and it is the sole input to tone
  band assignment on both first-party ingest paths. A radians/degrees slip in
  `lib/skin.ts` would put every sample in `brown_dark`, collapse the tone dimension to
  one cell, and every existing check would still pass.
- [AI] Tone and dryness have no label source. Propose the smallest consented way to
  collect one, with the PIPA consequences spelled out; do not implement it alone.
- [AI] Recommendation quality: the reasons are LLM-generated and efficacy-filtered,
  but nothing measures whether they are *useful*. Design a measurable proxy.
- [AI] iPhone Safari camera matrix is code-verified but hardware-pending; extend the
  automated lifecycle coverage as far as it can go without hardware.
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
- 2026-09-15 (2) — ML track only, at the owner's direction: the qwk/pearson gate.
  `promotionGate.subgroup` in the shipped manifest now carries `minQwk` and
  `minPearson` (0.4, provisional), `model_contract` exposes them, and a new
  `subgroups.ordinal_quality_check` applies them per axis to the final validation
  confusion. Previously `qwk` and `pearson` were computed and compared to nothing, so
  a head that had learned nothing was not merely allowed through — it was the EASIEST
  thing to promote, because the only other rule measures the gap between mean and
  worst subgroup and a constant predictor is equally wrong everywhere. The gate fails
  closed: a missing metric or an axis with no validation samples blocks.

  Two holes found in this cycle's own first draft and closed before commit:

  - **NaN.** Every comparison against NaN is False, so `value < floor` waved a NaN
    metric straight through — the one direction this check must never fail in.
    Non-finite values are now rejected before the floor is applied.
  - **A default that disabled the rule.** `min_qwk`/`min_pearson` first defaulted to
    0.0, so a caller that forgot them silently got no ordinal-quality gate at all.
    They are now keyword-only with NO default: forgetting them raises `TypeError`.

  Adversarial review then found three more, all fixed in the follow-up commit:

  - **`accuracy` could be missing.** `promotion_check` read `overall[axis]["accuracy"]`
    for the mean BEFORE the ordinal check ran, so a malformed axis raised KeyError
    instead of the blocker the docstring promised. Making the mean tolerant then
    introduced a worse bug — a missing accuracy defaulted to 0.0, which drags the mean
    DOWN and makes the subgroup gap test easier to pass. An axis that cannot supply a
    finite accuracy is now unevaluated, not zero.
  - **`ordinalQuality` shipped two shapes.** The unevaluated branch omitted the floors,
    and with zero consented crops that short shape is exactly what the first real
    `metrics.json` will contain — so the first consumer would break on the common case.
    All branches now return the same keys.
  - **The operator runbook still described the old gate.** `docs/pretrain-finetune-runbook.md`
    is what a human reads to make the promotion call, and it told the operator to judge
    qwk/pearson by hand — the thing this change automated — without ever mentioning the
    floors or that 0.4 is provisional. Now corrected, including the sample BLOCKED
    output, since ordinal blockers are prepended and every axis is `n == 0` today.

  Verified: `python ml/selftest.py` 50 -> 61 tests, OK. The key case asserts its own
  precondition first — with the floors at 0.0 the majority-class confusion IS
  promotable — and then that the manifest's floors block it, so the regression is
  proven inside the test rather than by reverting the code. Real gate output on the
  numbers `metrics_from_confusion` returns for that predictor:

  ```
  promotable: False
    - [oil] qwk 0.000 is below the 0.400 floor (...)
    - [oil] pearson 0.000 is below the 0.400 floor (...)
  ```
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
