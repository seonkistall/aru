# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-17

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
- [AI] Measure the real per-scan cost of the new within-image indices on a mid-range
  phone profile, not on the build container.
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

- 2026-09-17 (cycle 10) — Branch `autopilot/2026-09-17-1839`. **The protocol file was
  66% history, and every brief told a fresh session to read all of it.** Measured before
  anything moved: 2,329 lines, of which 1,545 (66%) were changelog. The parts a worker
  must act on — the protocol, the ten guardrails, the live backlog — had become the
  minority of the file it is required to read first, and the tax grew every cycle.
  Split by what a cycle has to DO with a line, not by date alone. `docs/AUTOPILOT.md`
  keeps the cycle protocol, the guardrails, the revenue arithmetic and the
  revenue-upstream ordering, the standing objective, the open backlog, BLOCKERS, "How
  the schedule actually runs", "Supervisor findings not yet actioned", and the three
  most recent cycles under a new "Recent cycles". `docs/autopilot-changelog.md` takes
  the closed history: changelog entries 2026-09-14 through cycle 6, and the backlog
  items ticked `[x]`. `[~]` did not move — partly done is live work — and neither did
  any open `[AI]`/`[OWNER]` item.

  ```
  wc -l                          before   after split   after step 8 rotation
  docs/AUTOPILOT.md               2329          1015                     975
  docs/autopilot-changelog.md        0          1384                    1508
  ```

  Two stages because this cycle also ran the rule it wrote: the split moved the closed
  history, then step 8 rotated cycle 7 out to keep "Recent cycles" at three. 975 is the
  number a cycle 11 worker actually reads.

  **No content lost, checked rather than asserted**, because an assertion is exactly
  what this file's guardrail 2 forbids. Each moved block was located in the archive by
  content alone — asserting it appears exactly once — and compared byte-for-byte against
  its source range in `git show HEAD:docs/AUTOPILOT.md`: 58, 49, 40, 11 and 1,187 lines,
  each matching on sha256. Then the stronger check, which does not depend on knowing
  where anything went: every line of the original tested against a multiset of both new
  files. Six lines matched neither, and they are the six this cycle deliberately
  rewrote — protocol steps 1 and 7, and the three pointers into content that moved
  (`see the changelog entry below`, `the read side is the item below`, and the README
  line). Nothing else in 2,330 lines changed.

  **Protocol step 8 is new and is the actual fix.** A split without a rotation rule just
  resets the counter: cycle 11 appends, and by cycle 20 the file is back. Step 8 now
  says "Recent cycles" holds three entries, the fourth-oldest moves to the archive with
  its text unchanged, items ticked `[x]` that cycle move with it, and the move is proved
  with `wc -l` on both files plus a byte-identity check. It also says the thing that
  makes date a bad sole criterion: an entry whose finding is still open is not closed
  history. This entry rotated cycle 7 out, so the rule has been exercised once rather
  than only written down.

  **Bug fix — `AGENTS.md` advertised a file that has never existed.** Its "Key Files to
  Know" table mapped `lib/supabase.ts`, described as "Supabase client (public, no auth)
  + RLS note". `git log --all -- lib/supabase.ts` is empty and the only `createClient`
  call in the tree is `lib/supabase-admin.ts:14`, so there is no anon-key client and no
  RLS surface. The document every agent is told to read first was describing a security
  posture the app does not have — an agent trusting it would look for RLS as the
  protection on a path where the service-role key is the only thing in play. Row
  replaced with what is true.

  **`tests/doc-links.test.ts`** resolves all 179 relative markdown links across
  `README.md`, `AGENTS.md`, `CLAUDE.md`, root `AUTOPILOT.md` and `docs/**/*.md`, and
  pins the archive as reachable from the file a cycle actually reads — orphaning 1,508
  lines of history is the specific way this split could rot. It found the `AGENTS.md`
  row on its first run, before it was fixed. No link in the tree carries a `#fragment`
  (counted: zero), so it checks file existence and does not pretend to check anchors.
  Verified by breaking its subject three ways: deleting `docs/autopilot-changelog.md`
  (`"docs/AUTOPILOT.md -> autopilot-changelog.md (no docs/autopilot-changelog.md)"`,
  7 links, both cases fail); repointing every archive link in `AUTOPILOT.md`
  (`AssertionError: expected '# ARU Autopilot\n\nA scheduled sessio…' to contain
  'autopilot-changelog.md'`); and restoring the `AGENTS.md` row
  (`"AGENTS.md -> lib/supabase.ts (no lib/supabase.ts)"`).

  **ML and UI/UX were skipped this cycle, deliberately.** The split was the pre-sized
  main item and it is a whole-file change to the one document every future cycle starts
  from; adding an unrelated model or screen change to the same branch would have made
  the byte-identity proof harder to read for no gain. Research likewise: nothing this
  cycle needed an external fact, and padding the track with a lookup nobody asked for is
  how the changelog got to 1,545 lines. The backlog is unchanged apart from the `[x]`
  items moving — no item was closed, reworded or reordered.

  Verification on this branch: `npm run smoke` green (`Smoke test passed.`), vitest
  **466 passed in 75 files** (from 464 in 74 — the two new cases),
  `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint` **2 warnings**
  both in `lib/care.ts` unchanged, `python ml/selftest.py` **Ran 77 tests ... OK**
  unchanged. Baselines were re-measured from scratch rather than trusted: `node_modules`
  arrived empty in this container, so the first `tsc` run reported 2,451 errors, all of
  them "Cannot find module 'next/server'" and "Cannot find name 'process'". That is a
  missing `npm ci`, not a red build; after installing, the count was 13, matching the
  brief. Guardrail 8 untouched — no change to `status` or `promotionGate`.
- 2026-09-17 (cycle 9) — Branch `autopilot/2026-09-17-1239`. **The recommendation gets a
  conversion number of its own.** Cycles 6-8 built the funnel write path, the public
  ingest endpoint and the read side; none of them added a ratio that says anything about
  the recommendation. The nearest one does not: `failurePreventionConversion` counts
  `commerce_clicked` sessions within completed-scan sessions, over completed scans, so a
  session that completed a scan and never reached `/report` is in the denominator and a
  survey-only session that saw a reco and clicked through is in neither. It is a
  scan-to-purchase-intent number, other docs cite it, and it is untouched.

  **Baselines on arrival, counted rather than recalled, with `npm ci` run first because
  `node_modules` was absent.** The cycle brief said `tsc --noEmit` is **16**. It is
  **13** — the same 13 cycles 4, 7 and 8 counted, all pre-existing and all in test files
  (`tests/android-config.test.ts` ×1, `tests/e2e/ios-safari-camera.spec.ts` ×3,
  `tests/product-use.test.ts` ×3, `tests/skin-roi-quality.test.ts` ×6). The brief's
  vitest count was right and its file count was not: **457 tests in 73 files**, not 75.
  The other two matched: `ml/selftest.py` 77, lint `0 errors, 2 warnings` (the two
  unused parameters in `lib/care.ts`, untouched here). After this diff: **74 files /
  464 tests**, tsc still **13**, selftest still **77**, lint still 2 warnings. Final
  `npm run smoke`, verbatim, with the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  override and nothing else:

  ```
   Test Files  74 passed (74)
        Tests  464 passed (464)
    44 passed (3.0m)
  Ran 77 tests in 0.014s
  OK
  ok GET /api/sync -> 200
  ok POST /api/sync -> 401
  ok GET /api/funnel -> 200
  ok POST /api/funnel -> 403

  Smoke test passed.
  ```

  **The ratio.** `recoCommerceRate` on `FunnelSummary`: sessions that recorded both
  `reco_viewed` and `commerce_clicked`, over sessions that recorded `reco_viewed`.
  Conditioned on `reco_viewed` the way `captureStart` is conditioned on `scan_opened`,
  and for the same reason — `commerce_clicked` fires on survey-only and `/care`-only
  paths that never saw a reco, so an unconditioned numerator would read above 1 on a log
  where those outnumber the reco views. The numerator is an intersection, so it cannot
  exceed 1 by construction; a zero denominator returns 0 and both screens print "—" and
  name the missing denominator, which is the rule the camera rows already followed.

  **Both `/ops` panels, checked rather than assumed.** They share `summarizeFunnel`,
  which is why cycle 8 did the aggregate in Node — but each panel names the fields it
  prints, so a new ratio reaches neither screen on its own. Both now carry a
  "Reco-to-commerce" row against "of reco views", and a test reads `app/ops/page.tsx`
  and fails if either call site goes missing.

  **What makes it lie, written down rather than only the happy path.**
  `commerce_clicked` fires from `/care` as well as `/report` — its `placement` prop is
  `care` there against `report_product` / `report_summary` on `/report` — and `/care` is
  reachable from the nav on every page and from `/privacy`, not only from `/report`. So
  a session that viewed the reco and later clicked on `/care` lands in the numerator
  with no recommendation click in it: the ratio INFLATES, in exactly that shape. A
  session that clicked only from `/care` and never reached `/report` is in neither half,
  which is correct — it saw no reco. The sets are unordered, like `viralActivation`'s,
  so a click recorded before the reco view in the same session still counts.

  **Why the numerator is not filtered by `placement`, which is a decision and not an
  oversight.** The server-side aggregate never selects `props`
  (`FUNNEL_AGGREGATE_COLUMNS` is `"kind, session_id, ts"`) and `FunnelCountable` is
  `Pick<FunnelEvent, "kind" | "sessionId">`. Filtering on placement would either widen
  that select list — undoing cycle 8's deliberate privacy narrowing, for a ratio — or
  compute the numerator one way on the on-device panel and another on the aggregate,
  printing two different numbers under one label and destroying the comparability that
  is the whole point of the panels sitting side by side. It is enforced, not promised:
  attempting the filter is
  `lib/funnel.ts(257,104): error TS2339: Property 'props' does not exist on type
  'FunnelCountable'`.

  **`failurePreventionConversion` is untouched**, by name and by value. One test pins a
  log on which the two deliberately disagree (0.5 against 1) so a later change cannot
  quietly collapse one into the other.

  **ML — nothing this cycle, deliberately.** `ml/selftest.py` is green at 77 and was not
  touched. `ml/train_visible_attributes.py`'s metrics/checkpoint split was left alone:
  it is PR #69's, on a branch that has already taken eight merges from main, and a ninth
  parallel implementation is the failure mode that branch has hit four times.

  **Verification of the new tests.** All 7 cases in `tests/funnel-reco-conversion.test.ts`
  were checked by breaking the line each exists to protect, 5 mutations, every one of
  which failed at least one case. Replacing the intersection with the raw
  `commerce_clicked` set size (`clickedWithinReco` → `reachedSets.commerce_clicked.size`)
  failed the bound: `expected 3 to be 1`. Deleting the zero guard
  (`recoViewedSet.size ? … : 0` → the bare division) failed `expected NaN to be +0`.
  Swapping the denominator for completed scans (the ratio this must not be) failed 6 of
  the 7, including the props-free aggregate case at `expected +0 to be 0.25`. Deleting
  the on-device `<Row label="Reco-to-commerce">` failed
  `expected '"use client";…' to contain 'snapshot.funnel.recoCommerceRate'`, and
  deleting the per-source row failed the same test on `'source.summary.recoCommerceRate'`
  — the two are separate assertions precisely because one panel rendering it is not both.

  **What is still owner-blocked, said plainly.** This ratio reads zero everywhere a human
  can see it until `NEXT_PUBLIC_FUNNEL_FLUSH` is on, and that is the PIPA question in
  BLOCKERS, not a loop decision. The flag is untouched, in code and in every config in
  the repository; `status` and `promotionGate` in the manifest are untouched; no consent
  kind was invented and §5 was not reopened. No new owner-blocked item was found this
  cycle — the affiliate signups, the real product URLs, the AI-Hub application, the
  golden-set photos and physical-device QA are all exactly where the last cycle left
  them, and none of them moved because none of them can be moved from here.

- 2026-09-17 (cycle 8) — Branch `autopilot/2026-09-17-0639`. **The read side of
  `funnel_events`.** Cycle 6 built the flush, cycle 7 built the endpoint that accepts
  it, and nothing read the table. `/ops` drew its funnel panel from `readSnapshot()` →
  `summarizeFunnel()` over `lib/funnel.ts` — localStorage, the operator's own browser —
  so with the flag on and rows arriving, the only thing `/ops` would have shown is the
  operator's own session. The product would have collected data and still shown nobody
  anything.

  **Baselines on arrival, counted rather than recalled, with `npm ci` run first because
  `node_modules` was absent.** The cycle brief said `tsc --noEmit` is 16 and vitest is
  432 in 73 files. Counted: tsc is **13** — the same 13 cycles 4 and 7 counted, all
  pre-existing and all in test files (`tests/android-config.test.ts` ×1,
  `tests/e2e/ios-safari-camera.spec.ts` ×3, `tests/product-use.test.ts` ×3,
  `tests/skin-roi-quality.test.ts` ×6) — and vitest is 432 tests in **72** files, not
  73. The other two matched: `ml/selftest.py` 77, lint `0 errors, 2 warnings` (the two
  unused parameters in `lib/care.ts`, untouched here). After this diff: **73 files /
  457 tests**, tsc still 13, selftest still 77, lint still 2 warnings. Final
  `npm run smoke`, verbatim, with the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  override and nothing else:

  ```
   Test Files  73 passed (73)
        Tests  457 passed (457)
    44 passed (2.5m)
  Ran 77 tests in 0.015s
  OK
  ok GET /api/sync -> 200
  ok POST /api/sync -> 401
  ok GET /api/funnel -> 200
  ok POST /api/funnel -> 403

  Smoke test passed.
  ```

  **The read.** `lib/funnel-aggregate.ts` plus an `aggregate` field on
  `GET /api/funnel`, present only when `hasValidSyncToken(request)` — the same shape
  `/api/sync`'s GET already uses for `commerceOverrides`, and no new auth mechanism: no
  second secret, no query-string key, no cookie. It is on `/api/funnel` rather than
  `/api/sync` because that route owns the table and the source vocabulary, and because
  `/api/sync`'s GET is a pure env-status handler `/ops` re-fetches on a debounce
  whenever the token field changes — a database query behind that is a query per edit of
  a password field. The token check runs **before** the query, so an unauthenticated
  caller costs the route exactly what it cost before; the test asserts the query never
  ran, not merely that the field is absent, and `scripts/smoke-test.mjs` gained a
  `bodyExcludes` check so the running server is asserted from outside the process not to
  serve `aggregate` without a token.

  **Split by source, because the schema says so.** One query per source on
  `metadata->>source` — the expression `funnel_events_source_ts_idx` is declared on —
  and the response is a **list**, with no field anywhere that adds the two.
  `supabase/schema.sql` says on the column itself not to pool them: `ops-local` is an
  operator uploading their own device's log behind a typed token, `public-funnel` is an
  unauthenticated write whose `visitor_id` nobody can vouch for, and an `/ops` screen
  that summed them would count an operator's test session alongside the open internet.
  Each card on `/ops` carries the provenance of its marker next to its numbers.

  **Aggregate counts only, enforced in two places rather than promised once.** The
  select list is `kind, session_id, ts` — never `visitor_id`, never `props`, never `*` —
  and `summarizeFunnel`/`funnelDropoff` now take `FunnelCountable`
  (`Pick<FunnelEvent, "kind" | "sessionId">`), which is what lets the route select
  without the column instead of selecting it and undertaking not to look. Neither
  counter ever read `visitorId`; the narrowing only names that. A test serialises the
  whole aggregate and asserts no session id appears in it. No per-visitor timeline can
  be assembled from what this returns, which is the thing the schema comment warns turns
  a population into tracking.

  **Next to the on-device panel, not instead of it.** The existing summary keeps its
  section and is now labelled "on-device log" — it is still the right screen for an
  operator testing their own flow end to end.

  **The three states that are normal today, decided and written down** (§9.4 of
  `docs/funnel-flush-design.md`). Supabase unconfigured and query-failed are separate
  branches with separate sentences, because they need different actions and because
  rendering either as an empty panel would read as "nobody used the product" rather than
  "this deploy has no database". An empty table renders **both** cards saying "no rows",
  and so does the state where only one source has any — an absent card would let the card
  that is there be read as the whole table. `NaN` cannot reach the screen from the
  arithmetic (`summarizeFunnel` guards every division), but `0` is the wrong string:
  every ratio with a zero denominator prints "—" and names the missing denominator,
  which is the distinction the on-device panel already made for its two camera rows.
  Three more things are reported rather than swallowed: truncation at the 5,000-row cap
  (with the warning that session counts undercount any session straddling the cut), rows
  carrying no source marker at all, and kinds this build has no step for — the schema
  deliberately has no CHECK on `kind`, so an older deploy reading a newer table sees
  them, and they count towards rows and sessions and towards no step.

  Why the aggregate runs in Node rather than as a SQL `GROUP BY`: `summarizeFunnel`
  counts distinct sessions per kind over set intersections, and reimplementing that in
  SQL would be a second definition of every number `/ops` already shows. The two would
  drift, and the panels would stop being comparable — which is the point of putting them
  side by side. The row cap is the cost, and it is stated on the screen rather than
  applied silently.

  **research — is `count: "exact"` the total, or the page?** The truncation report is
  only honest if `count` is the number of rows that MATCHED. PostgREST's own
  documentation source (`PostgREST/postgrest-docs`,
  `docs/references/api/pagination_count.rst`, through `raw.githubusercontent.com`,
  `http=200 bytes=4518`) shows a 25-row request answering
  `Content-Range: 0-24/3573458`, and the installed client
  (`@supabase/postgrest-js` 2.108.2, `dist/index.cjs`) parses
  `count = parseInt(contentRange[1])` — the part after the slash, not `data.length`. So
  `count > data.length` is a sound truncation test. MDN and `www.rfc-editor.org` are
  still refused by this network. §9.5.

  **ML — nothing this cycle, deliberately.** `ml/selftest.py` is green at 77 and was not
  touched. The read screen was sized to take most of the cycle and did.

  **Verification of the new tests.** All 25 cases in `tests/funnel-aggregate.test.ts`
  were checked by breaking the line each exists to protect, 17 mutations in total, every
  one of which failed at least one test. Two are worth recording rather than glossing.
  Deleting the head count's own `if (table.error)` check failed **nothing** on the first
  pass, because the mock's single error switch failed the per-source reads too and the
  later check caught it; the mock gained a `headError` that fails the head count alone,
  and the guard is now genuinely held (it is a real case — a count over the whole table
  can be refused while a filtered read is served). And the first attempt at removing the
  `try`/`catch` produced a syntax error rather than a behavioural change, so it was
  redone properly; it then failed the test it exists for.

  **`NEXT_PUBLIC_FUNNEL_FLUSH` is still unset**, in code and in every config in the
  repository, and a test fails if any file this cycle touched sets it. §5's PIPA
  question was not reopened, no consent kind was invented, no consent flow was added.
  Building somewhere for the data to be read is not permission to start collecting it.
  One limit stated plainly and added to BLOCKERS: the read is verified against the real
  route handler with the Supabase client mocked at the query-builder level, which pins
  the select list, the filter, the cap and the count semantics — it has never run against
  a real Postgres, for the same reason §6 step 4 is still open.

**Supervisor review, 2026-09-17 19:22–19:45 UTC.** Checked by command rather than by
reading the PR.

*Nothing lost.* Sorting `docs/AUTOPILOT.md` + `docs/autopilot-changelog.md` together
and `comm -23`-ing against a sorted snapshot of main's `AUTOPILOT.md` at `e6efe6b`
prints **6** non-blank lines, and all six are protocol steps the split deliberately
rewrote to point at the archive — each one's replacement is in the file at a named
line (125, 164, 255, 341). That matches the worker's own "6 intentional rewrites"
exactly; it was checked, not taken.

*Guardrails moved, not softened.* `diff` of the `## Hard guardrails` section against
the snapshot: **byte-identical**.

*Counts, re-derived.* `wc -l`: 2,329 → **975** live + **1,508** archive. The live file
a cycle must read is down 58%; the pair is 154 lines larger than the original, which is
the pointers, the archive's own header and the new rotation rule.

*The structural part is better than what I asked for.* I scoped an archive and a
pointer; the worker also added **step 8, a rotation rule** — "Recent cycles" holds
three entries and the fourth-oldest moves to the archive as part of landing a cycle.
Without that the file regrows and this cycle is repaid in a month. Verified: 3 entries
inline, 11 in the archive.

*Link rot is now caught.* `tests/doc-links.test.ts` walks every markdown file and
resolves every relative link. Broken on purpose: appending a markdown link to a
`does-not-exist.md` fails it, and replacing every mention of the archive filename fails
both its cases
("expected [ …(7) ] to deeply equal []"). My first attempt at the orphan break passed —
because the mutation was incomplete, leaving 12 other mentions, not because the test is
weak; the complete mutation fails it.

*One stale reference fixed in passing*, correctly: `AGENTS.md` listed `lib/supabase.ts`,
which does not exist in the tree — only `lib/supabase-admin.ts` does.

Verification on the merged head: vitest 466 in 75 files, `ml/selftest.py` 77, lint 2
pre-existing warnings, `tsc --noEmit` 13 errors — unchanged from main — `npm run smoke`
green.

*Footnote, earned the hard way.* The first draft of this very note quoted that broken
link in its literal markdown form, and the test caught **its own review note** —
`docs/AUTOPILOT.md -> does-not-exist.md`. Left recorded rather than tidied away: the
guard reads prose as well as pointers, which is worth knowing before someone writes an
example link into a doc and spends ten minutes on a red suite.
