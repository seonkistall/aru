# ARU Autopilot

A scheduled session picks this file up every 6 hours, does one cycle, and writes
back to it. It is the only state that survives between cycles — a fresh session
starts with no memory of the last one.

Last updated: 2026-09-18

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
  **2026-09-18, cycle 11: the reason count half of that is gone.** `retakeRecommended`
  no longer counts `retakeReasons`; it reads `signals`, so wobble now reaches the
  decision only through the `0.9 + 0.1 * meanAgreement` multiplier. The double-count is
  closed and the question this item owns — which axis the label reports — is untouched.
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
- [AI] **`shine_ratio` in `ml/skin_indices.py` and `shine` in `lib/skin.ts` are two
  different formulas under one name.** The Python index is
  `tzone_specular / cheek_specular`; the TypeScript one is
  `tzone.specularRatio + Weber contrast of the T-zone against the cheek`. `FEATURE_KEY`
  maps `shine_ratio` to the app's `shine` field, and `ml/selftest.py`'s
  `test_shine_and_roughness_are_ratios_so_exposure_cancels` asserts an exposure
  invariance for the Python one that was false of the TypeScript one until cycle 12 —
  so the cross-language contract held by nobody checking the values, the same way
  `tests/skin-index-contract.test.ts` pins names but not formulas. Deciding which
  formula is right is a measurement, not a rename: the cheek specular ratio is near
  zero on a matte cheek, which is why the app never used the Python form. Noted
  2026-09-18.
- [AI] **No capture signal looks at a saturated CHEEK channel, and both cheek-derived
  axes lose a level before one fires.** `buildSignals` has three: 조명 (cheekL 70..210),
  반사 (T-zone pixels whose LUMINANCE exceeds 218, as a fraction under 0.1) and 피부
  영역. `relRedness` and `cov` are computed from the CHEEK, whose red channel can reach
  the 8-bit ceiling before any luminance reaches 218.
  Measured (`tests/axis-exposure-scale.test.ts`, 2026-09-18): on a warm face at the pores
  cut, 2.5% of the cheek patch is clipped at cheekL 177.9, 14.8% at 184.8 and 25.9% at
  190.7 — and at 190.7 the published pores level has dropped a bucket while all three
  signals say ok. Worse, clipping delays the one signal that could catch it: a clipped
  pixel's computed luminance is lower than the scene's, so fewer pixels cross 218, and
  the saturating face's 반사 fails 6 counts of cheekL LATER than the control's. The
  cheapest honest version is a fourth signal on the cheek's clipped-channel fraction, but
  adding one reopens the retake rule (`retakeRecommendedFor`, cycle 11) and moves what
  `confidenceLabel` reports, so it is a deliberate decision and not a one-line add.
  **How much this matters off the fixture is one unknown number.** Swept on R/L alone at
  a fixed cheek luminance (same test, supervisor case), the silent window opens between
  **R/L 1.17 (holds) and 1.20 (flips)**. This repository's own skin constant
  `[196, 152, 140]` is R/L **1.1967** — inside that band, and a fixture rather than a
  measurement of anyone's skin. Which side real captures fall on is settled by the
  golden-set photos already blocked on the owner, not by another sweep. Noted
  2026-09-18, R/L band added by the supervisor the same day.
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

- 2026-09-18 (cycle 13) — Branch `autopilot/2026-09-18-1239`. **The other two axes were
  swept and they are clean. What is not clean is the 8-bit ceiling, and no capture signal
  watches it.** Cycle 12 measured `shine` and found an absolute brightness term.
  `relRedness` and `cov` were asserted exposure-invariant by this repository's own
  thesis document and had never been measured. They are now.

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief: `npx tsc --noEmit | grep -c
  "error TS"` **13**, vitest **482 passed in 77 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The negative result, which is the main one.** Cycle 12's fixture could not be reused:
  its frame is flat, so `texture` is 0 and `cov` is 0 at every exposure — a face needs
  texture before pores can be measured at all. `tests/axis-exposure-scale.test.ts` builds
  one: the scene is float, every variation on it is multiplicative (texture, per-channel
  jitter, exposure gain), and the 8-bit write happens last, which is the only place an
  exposure can leave a trace in an index built from ratios. Warm face at both cuts
  (cheek 200/150/138, R/L 1.223, texture amplitude 0.19):

  ```
  cheekL  R=255   relRedness  등급          cov      등급          failed
   71.2   0.0%    0.01355     붉은기 약간   0.08704  결 약간 보임   -
  101.6   0.0%    0.01280     붉은기 약간   0.08698  결 약간 보임   -
  142.3   0.0%    0.01334     붉은기 약간   0.08699  결 약간 보임   -
  162.6   0.0%    0.01319     붉은기 약간   0.08698  결 약간 보임   -
  177.9   2.5%    0.01313     붉은기 약간   0.08694  결 약간 보임   -
  184.8  14.8%    0.01291     붉은기 약간   0.08568  결 약간 보임   -
  190.7  25.9%    0.01219     붉은기 약간   0.08355  결 매끈        -
  197.0  38.3%    0.01159     붉은기 낮음   0.07949  결 매끈        반사
  209.5  55.6%    0.01058     붉은기 낮음   0.06883  결 매끈        반사
  ```

  Over cheekL 71.2 to 172.8 — a 2.4x exposure range at a fixed relative face structure,
  and the whole span in which no channel saturates — `cov` spans **1.0092x** and
  `relRedness` **1.0587x**. Neither carries an absolute term. The oil control on the same
  harness spans **1.0116x** and keeps one level. So the answer
  to the brief's question is: no drift, on both axes, and no fix to `lib/skin.ts`.
  `ATTR_THRESHOLDS`, `fallbackVersion` and the manifest are all untouched, because
  nothing was found that would justify moving them. Guardrail 8 untouched.

  **The 190.7 row is the finding.** The published pores level drops a bucket while 조명,
  반사 and 피부 영역 all say ok. Redness holds there but with 1.6% of margin left against
  its 0.012 cut, so a slightly less red face loses its level inside the passing band too.

  **It is the sensor range, not the normalisation, and the control is what says so.** A
  second face with the SAME texture amplitude and the same `relRedness` at the reference
  exposure, but R/L 1.101 instead of 1.223, swept over the identical exposures:

  ```
  cheekL  R=255   relRedness  cov      등급
   71.1   0.0%    0.01396     0.08673  결 약간 보임
  142.3   0.0%    0.01370     0.08725  결 약간 보임
  177.8   0.0%    0.01370     0.08698  결 약간 보임
  191.1   0.0%    0.01338     0.08699  결 약간 보임
  203.2  12.3%    0.01354     0.08647  결 약간 보임
  212.8  25.9%    0.01248     0.08354  결 매끈
  ```

  Same exposure, one face loses the level and the other does not. The difference is how
  much room the red channel had. Saturation cuts the top off the luminance distribution,
  so the variance falls and `cov` falls with it; red clips first, so `rIdx(cheeks)` falls
  and `relRedness` follows. No renormalisation recovers a pixel already written as 255,
  which is why this one does not end in a formula change the way cycle 12 did.

  **What IS ARU's, filed rather than fixed.** Of the three signals only 반사 can see
  saturation, and it watches the **T-zone's LUMINANCE** crossing 218 — while `relRedness`
  and `cov` are computed from the **cheek**, whose red channel pins at 255 first on a
  warm enough face. Measured above: 2.5% clipped at 177.9 and 14.8% at 184.8, all
  signals ok. And clipping delays its own detector — a clipped pixel's computed luminance
  is lower than the scene's, so fewer pixels cross 218 and the saturating face's 반사
  fails **6 counts of cheekL later** than the control's (197.0 against 191.1). A fourth
  signal is the fix and it reopens the retake rule and moves what `confidenceLabel`
  reports, both of which the brief put out of scope. Backlog item, dated.

  **Supervisor, same day — the one number this rested on had no source, and now the band
  does.** The worker's text put the whole off-fixture case on "skin's R/L is about 1.2",
  which traces only to this repository's own `[196, 152, 140]` fixture constant
  (R/L 1.1967) and to nothing measured on skin. Sweeping R/L itself at a fixed cheek
  luminance, with the two published faces as the endpoints, locates the window instead
  of asserting it:

  ```
  R/L    cov@160   worst-silent cov   pores level   verdict
  1.100  0.08696   0.08687            1 -> 1        holds
  1.140  0.08691   0.08678            1 -> 1        holds
  1.170  0.08715   0.08628            1 -> 1        holds
  1.200  0.08698   0.08428            1 -> 0        FLIPS
  1.223  0.08701   0.08157            1 -> 0        FLIPS
  ```

  The silent window opens between **1.17 and 1.20**, and the repository's own fixture
  sits at 1.1967 — inside it. The claim about skin is removed from `lib/skin.ts` and both
  docs; what replaces it is the measured band plus a named unknown, and what settles the
  unknown is the golden-set photos already blocked on the owner. Pinned as a ninth case
  in the same file; breaking it by moving the specular cut to 185 fails it
  (`× opens that silent window only above R/L 1.17`).

  **Adversarial review, all of it re-derived rather than accepted.** The invariance was
  re-measured on an independent fixture — a sinusoid texture instead of the worker's hash
  noise — and came back the same: `cov` 1.0148x and no trend over cheekL 70..170, with
  the headroom control flat at 188 (0.06886 -> 0.06860). The clipping attribution
  reproduced on that fixture too. Every new case was broken at the source line it
  protects, never at the test: reverting `cov` to `texture / 140` fails 5 of 9, making
  `relRedness` an absolute red difference fails 3 (2.318x spread), moving the specular
  cut from 218 to 190 fails 3. Step 8 rotation verified by sorting both docs and
  `comm -23` against main's pair: **0 lines lost**, 2482 -> 2599. Suite 490 in 78 files,
  `tsc` 13, eslint 2 warnings, `npm run smoke` passed.

  **The quantisation floor: real, measured, and three cuts below anything that matters.**
  The brief asked whether a dark-end pores drift would be a normalisation or a sensor
  problem. There is no dark-end drift to attribute: the face at the pores cut holds
  within 1.02x from cheekL 66 to 170 and never changes level. The effect the question
  anticipated does exist one axis down — 8-bit rounding adds a variance of 1/12 count²
  regardless of exposure, so it inflates `cov` more when the absolute texture is smaller.
  On a face whose `cheekTexture` is **0.9456** counts at cheekL 66 and 2.3588 at 170:

  ```
  cov dark mean   (cheekL 66/70/75)        0.013986
  cov bright mean (cheekL 140/152/160/170) 0.013787
  ratio                                    1.0144
  ```

  1.4%, in the direction theory predicts, on a reading already 6x below the 0.085 cut.
  Neither fix applies because neither problem is present at ARU's cut points.

  **`ml/skin_indices.py` has nothing to keep in step.** Checked, not assumed:
  `relative_redness(target_astar, reference_astar)` is an a* difference — a different
  formula with no brightness term — and there is no Python index for pores at all. Same
  situation as cycle 12 found for `shine_ratio`, and left alone for the same reason.

  **Verification of the new tests.** All 7 substantive cases in
  `tests/axis-exposure-scale.test.ts` checked by breaking the line each protects in
  `lib/skin.ts`, four breaks, every case covered by at least one. The 8th is the
  env-gated print block. Changing `cov: cheeks.texture / (cheekL || 1)` to
  `cheeks.texture / 140` failed 5, among them
  `AssertionError: clipping-prone cov 0.04425 0.05026 0.06315 0.07606 0.08841 0.10104 0.10716: expected 2.4219529150904826 to be less than 1.02`
  and
  `AssertionError: clipping-prone published 결 매끈/결 매끈/결 매끈/결 매끈/결 약간 보임/결 약간 보임/결 약간 보임: expected 2 to be 1`.
  Changing `relRedness: rIdx(cheeks) - rIdx(tzone)` to the absolute
  `(cheeks.meanR - tzone.meanR) / 255` failed 3, among them
  `AssertionError: clipping-prone relRedness 0.01292 0.01443 0.01711 0.02083 0.02523 0.02857 0.02995: expected 2.318300902953162 to be less than 1.08`.
  Restoring cycle 12's removed term, `shine: tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255)`,
  failed the oil control alone:
  `AssertionError: oil 0.02601 0.02955 0.03676 0.04414 0.05145 0.05886 0.06300: expected 2.42241788561679 to be less than 1.08`.
  Flipping the sign to `rIdx(tzone) - rIdx(cheeks)` failed the ordering case,
  `AssertionError: -0.011245679366465866 -0.013337001362681844 -0.017442733570711244 -0.026645026780333758: expected -0.013337001362681844 to be greater than -0.011245679366465866`.

  **UI/UX and research skipped, deliberately**, on cycle 12's reasoning. Nothing a user
  sees changed — the whole finding is that two numbers do not move — and a screen edit
  bolted onto a branch whose claim is "these are invariant and this is where they stop
  being" would only make the tables harder to read. The research track's question was
  answered by running the code; a lookup added to fill the track is how the changelog
  got long.

  Verification on this branch: vitest **490 passed in 78 files** (from 482 in 77 — the
  8 cases in `tests/axis-exposure-scale.test.ts`; the print block is a counted case and
  prints nothing with `ARU_PRINT_AXIS_SWEEP` unset), `npx tsc --noEmit | grep -c "error TS"`
  **13** unchanged, `npx eslint .` **2 warnings** both in `lib/care.ts` unchanged,
  `python3 ml/selftest.py` **Ran 77 tests ... OK** unchanged, `npm run smoke` green.
  Guardrail 8 untouched: `status` and `promotionGate` byte-identical.
  `fallbackVersion`, `ATTR_THRESHOLDS`, `inputSchemaVersion`, `NEXT_PUBLIC_FUNNEL_FLUSH`,
  the retake rule and the shine normalisation all untouched.

- 2026-09-18 (cycle 12) — Branch `autopilot/2026-09-18-0639`. **The oil index carried an
  absolute brightness term while the whole thesis is within-image measurement.**
  `lib/skin.ts` computed
  `shine = tzone.specularRatio + max(0, (tzoneL - cheekL) / 255)`. The first term is a
  ratio. The second divided a luminance difference by the constant 255 — not by the
  capture — while `cov` divides by `cheekL` and `relRedness` is a difference of two
  ratios. One of the three published features was scale-dependent, and it is the one
  cycle 11 measured taking the most damage from a bad exposure.

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief: `npx tsc --noEmit | grep -c
  "error TS"` **13**, vitest **475 passed in 76 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The effect is real and it flips published levels inside the passing band.** One
  synthetic face whose T-zone is a fixed 8% brighter than its cheeks, read at seven
  exposures, all three capture signals passing at every row so nothing asks for a
  retake:

  ```
  cheekL  tzoneL  before   level        after    level
    79.9    86.4  0.0254   유분 적음    0.0446   유분 적음
   120.0   129.7  0.0384   유분 적음    0.0448   유분 적음
   140.2   151.1  0.0427   유분 적음    0.0427   유분 적음
   159.6   172.4  0.0501   유분 약간    0.0440   유분 적음
   200.1   215.3  0.0595   유분 약간    0.0417   유분 적음
  ```

  The old index runs **x2.34** across cheekL 80 to 200 at fixed relative contrast and
  changes the published level between 140 and 160. At a T-zone 15% brighter the
  boundary moves to between cheekL 80 and 100; at 30%, to between 120 and 140. So the
  answer to the question the brief posed is yes: the same face read the same way at two
  legal exposures published two different oil levels. After the change the same sweep
  spans **0.935 to 0.956**, and what is left of that is 8-bit channel rounding.

  **The fix, derived rather than assumed.** The second term becomes Weber contrast
  against the cheek — `max(0, (tzoneL - cheekL) / cheekL)` — times `140 / 255`.
  `SHINE_REFERENCE_CHEEK_L = 140` is the midpoint of the band the 조명 signal passes
  (`buildSignals`: cheekL 70..210), which is this repository's only written definition
  of a correctly-exposed capture. The constant is **not** what makes the index
  invariant: the ratio is, for any value of it. All it decides is which exposure keeps
  today's number, and 140 was chosen so `ATTR_THRESHOLDS.oil` does not have to move.

  **Why moving the cuts instead is not the same change, measured.** The cuts are
  compared against `specularRatio + gap` and only the gap is rescaled. Cuts scaled by
  255/140 (0.05 → 0.0911, 0.16 → 0.2914) drop a level on every capture whose specular
  ratio lands in [0.05, 0.0911) or [0.16, 0.2914) — at the reference exposure, the one
  exposure the change is supposed to leave alone. Pinned with a measured case: a face
  with 5 of its 81 T-zone pixels above the specular cut reads `tzoneSpecular = 0.0617`,
  which is 유분 약간 today and 유분 적음 under the scaled cuts.

  **Which captures change bucket.** At cheekL 140 nothing does: the two formulas agree
  to within 5e-4 across specular ratios 0 to 0.60 and contrasts 1.00 to 1.20, checked
  case by case. Brightly-exposed faces read LOWER (cheekL 160-200 at an 8% T-zone gap:
  유분 약간 → 유분 적음) and darkly-exposed faces read HIGHER (cheekL 70-80 at a 15%
  gap: 유분 적음 → 유분 약간; at a 30% gap, cheekL 70-120 goes 유분 약간 → 유분 많음).
  Those are the captures the fix is for.

  **`fallbackVersion` → `roi-calibrated-2026-09-18`** in `lib/skin.ts` AND
  `public/models/visible-attributes/manifest.json`, the rule `docs/label-free-axes.md`
  states and cycles 3, 4 and 5 followed. Guardrail 8 untouched: `status` and
  `promotionGate` are byte-identical. `inputSchemaVersion` untouched.

  **`ml/skin_indices.py` does not carry this term, and checking that found something
  worse.** Its `shine_ratio(tzone_specular, cheek_specular)` is
  `tzone_specular / cheek_specular` — a different formula entirely, with no luminance
  term to mirror, so "change one, change both" had nothing to move. But `FEATURE_KEY`
  maps `shine_ratio` to the app's `shine`, and `ml/selftest.py`'s
  `test_shine_and_roughness_are_ratios_so_exposure_cancels` asserts exposure invariance
  for the index under that name — a property that was true of the Python and false of
  the TypeScript. It is true of both now, and the two formulas still differ. Filed as a
  backlog item rather than resolved here: which one is right is a measurement, since a
  matte cheek's specular ratio is near zero and that is presumably why the app never
  used the Python form.

  **Second item: cycle 11's sweep is committed, and it does not reproduce.** Behind
  `ARU_PRINT_RETAKE_SWEEP=1 npx vitest run tests/retake-signal-rule.test.ts`, the shape
  cycle 5 set. The construction is written into the test because it had to be
  re-derived from prose: three fixture families bisected so a clean capture sits on one
  attribute's lower cut point, 120 seeds, the same noise field used for the clean and
  the degraded capture at each seed. What came back:

  ```
  condition                          attr      cheekL range   signals   this run   cycle 11
  조명 dark                          oil        59.6-60.5     조명       21/120      71/120
  조명 dark                          redness    59.6-60.5     조명       29/120       0/120
  조명 dark                          pores      55.4-65.8     조명      120/120       4/120
  조명 blown out                     oil       214.7-215.3    조명,반사  120/120     120/120
  조명 blown out                     redness   214.7-215.3    조명       91/120     120/120
  조명 blown out                     pores     210.2-218.8    조명,반사   61/120       0/120
  반사                               oil       139.6-140.5    반사       120/120     120/120
  반사                               redness   139.6-140.5    반사       120/120     116/120
  반사                               pores     135.4-145.8    반사         0/120       0/120
  피부 영역                          oil       139.3-140.4    피부 영역   37/120      42/120
  피부 영역                          redness   139.3-140.4    피부 영역   33/120      22/120
  피부 영역                          pores     131.9-145.7    피부 영역   49/120      49/120
  ```

  **반사 and 피부 영역 came back; 조명 did not.** 피부 영역's pores column lands on 49
  exactly and its other two within 11; 반사 reproduces on two columns of three. 조명 is
  out in both directions — dark oil 21 against 71, dark pores 120 against 4 — and the
  reason is the part that could not be recovered from prose: the noise amplitude that
  puts `cov` on its cut point at cheekL 140 is 52 counts, and at cheekL 60 that clips
  against zero, which is a fixture artifact and not a property of the 조명 signal.
  Cycle 11's dark band was 51.4-69.1 and this one is 59.6-60.5, so they are not the
  same condition either. The table is **corrected, not quietly republished**: the new
  numbers replace the old ones in `lib/skin.ts`'s `retakeRecommendedFor` doc comment,
  which says in the same breath that they are a re-derivation and what the old ones
  were. **The rule is untouched and still supported** — every condition costs a
  published reading on at least a sixth of the seeds, 반사 is still the worst, and
  "any one failed signal recommends a retake" is what that says.

  One thing the committed sweep deliberately does not claim: its `oil pre-fix` column
  re-buckets the same captures on the old index, and the counts come out close (17 vs
  21 dark, 120 vs 120 blown out) for a reason that has nothing to do with invariance —
  the fixtures are tuned at cheekL 140, the one exposure where the two formulas agree
  by construction. The normalisation is measured in
  `tests/shine-exposure-scale.test.ts`, not there, and the comment says so.

  **Verification of the new tests.** All 6 cases in `tests/shine-exposure-scale.test.ts`
  checked by deleting or mutating the line each protects, four mutations, every case
  covered by at least one. Restoring
  `shine: tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255)` failed 2:
  `AssertionError: contrast 1.08 published 유분 적음 / 유분 적음 / 유분 약간 / 유분 약간: expected 2 to be 1`
  and `AssertionError: expected 2.3937556835404785 to be less than 1.1`. Changing
  `const SHINE_REFERENCE_CHEEK_L = 140;` to 100 failed 1:
  `AssertionError: contrast 1 glint 24: 0.3716842139458374 vs 0.4020067421828359: expected 0.03032252823699849 to be less than 0.001`.
  Deleting the whole gap term (leaving `shine: tzone.specularRatio,`) failed 3:
  `expected NaN to be greater than 0.9`, the same reference-exposure case at
  `expected 0.1057104458865396 to be less than 0.001`, and
  `AssertionError: 0 0 0 0: expected 0 to be greater than 0`. Changing
  `oil: [0.05, 0.16]` to the scaled `[0.0911, 0.2914]` failed the remaining case,
  `expected +0 to be 1` — which is the measured form of the argument against moving the
  cuts.

  **UI/UX and research skipped, deliberately.** Nothing a user sees changed except the
  oil level itself on mis-exposed captures, which is the point of the change; adding an
  unrelated screen edit to a branch whose whole claim is "these numbers move and those
  do not" would have made the before/after table harder to read. Research likewise —
  this cycle's question was answered by running the code, and a lookup added to fill
  the track is how the changelog got long.

  Verification on this branch: vitest **482 passed in 77 files** (from 475 in 76 — the
  6 cases in `tests/shine-exposure-scale.test.ts` plus the sweep case added to
  `tests/retake-signal-rule.test.ts`; both env-gated blocks are counted cases and print
  nothing with the variable unset), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged,
  `npx eslint .` **2 warnings** both in `lib/care.ts` unchanged, `python3 ml/selftest.py`
  **Ran 77 tests ... OK** unchanged, `npm run smoke` green. Guardrail 8 untouched.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched, `inputSchemaVersion` untouched, the retake rule
  itself untouched.

- 2026-09-18 (cycle 11) — Branch `autopilot/2026-09-18-0039`. **A retake was decided by
  counting entries in an array whose entries mean different things.**
  `retakeRecommended` was `confidence < 0.58 || retakeReasons.length >= 2`, over an
  array holding up to three capture-signal details plus, on the burst path, a fourth
  line about frame wobble. So one failed signal never forced a retake, one failed signal
  plus wobble did, and nothing anywhere said which signals were worth a retake.

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief: `tsc --noEmit` **13** errors
  (`grep -c "error TS"`; the raw line count is 16), vitest **466 in 75 files**,
  `ml/selftest.py` **77**, lint **2 warnings** both in `lib/care.ts`.

  **The 0.6871 was re-derived, not trusted, and it holds: 0.687067.** Not from the
  backlog's arithmetic but by sweeping `distanceConfidence` over every attribute's
  plausible range (20,001 points per attribute across 8× its band), finding its floor
  at **0.695000**, and putting that through the real
  `attrConfidence * 0.72 + signalScore * 0.28`:

  ```
  distanceConfidence floor over swept range = 0.695000
    3/3 signals pass -> min confidence = 0.780400 (gate is < 0.58)
    2/3 signals pass -> min confidence = 0.687067 (gate is < 0.58)
    1/3 signals pass -> min confidence = 0.593733 (gate is < 0.58)
    0/3 signals pass -> min confidence = 0.500400 (gate is < 0.58)
  ```

  Note the third line: **even 1 of 3 signals passing clears the 0.58 floor.** The
  confidence term cannot force a retake on capture quality at all, whatever fails.

  **Then the per-signal measurement, which contradicted the item's own expectation.**
  120 seeded synthetic captures per condition through `analyzeSkin`, three fixture
  families each tuned so one attribute's raw value sits on its own cut point (where
  noise costs a level), comparing published levels against a clean capture of the same
  face at the same seed:

  ```
  조명 alone, dark      (cheekL 51.4-69.1)   oil  71/120  redness   0/120  pores  4/120
  조명 alone, blown out (cheekL 214.5-225.7) oil 120/120  redness 120/120  pores  0/120
  반사 alone            (tzoneSpecular 0.2963) oil 120/120  redness 116/120  pores  0/120
  피부 영역 alone        (686 cheek samples)   oil  42/120  redness  22/120  pores 49/120
  ```

  The backlog expected 피부 영역 to be the one that mattered. It does — `cov`'s
  dispersion rises from sd 0.0080 to 0.0107 on 686 cheek samples against 1,134, and the
  pores level flips 41% of the time at the cut point — but it is the *mildest* of the
  three. 반사 is not noise at all: `shine` is `tzoneSpecular + max(0, (tzoneL - cheekL) / 255)`,
  so a specular ratio of 0.2963 adds itself to the oil index directly and moves the
  reading from 0.0515 to 0.4324, every capture, in one direction. So the
  signal-specific rule the item proposed would have left the larger two thirds of the
  damage publishing silently. **Rule chosen: any one failed signal recommends a retake.**

  One thing the sweep found that is worth not overclaiming: the oil damage from
  underexposure is already at 71/120 at **cheekL 112.5**, well inside the passing band,
  and 조명 does not fail until 69.1. The signal is a late indicator of a problem that
  starts earlier, so this rule catches the tail of it, not the whole of it. That is a
  separate item (the index is an absolute luminance difference over 255, not a
  brightness-normalised one) and was not opened this cycle.

  **`retakeRecommendedFor(confidence, signals)`**, exported from `lib/skin.ts` and
  called from both `readsFromRaw` and `mergeVisionAnalysis`. Keyed on `signals`, so the
  wobble line cannot reach it structurally rather than by convention. That also
  collapsed the 0.58 floor from five source sites to four:
  `tests/confidence-threshold-agreement.test.ts` went red on this change with
  `"no site matching /retakeRecommended: confidence < ([0-9.]+) \|\| retakeReasons\.length >= 2/ — the code moved, so this test is blind"`,
  which is exactly what it was written to do. It now pins four literals plus a fifth
  case asserting the merge still delegates instead of regrowing its own copy.

  **What happens to wobble alone: nothing changes.** `meanAgreement < 0.67` still adds
  its reason line and still does not recommend a retake. Median fusion across the burst
  is what the burst exists for, the confidence already carries the
  `0.9 + 0.1 * meanAgreement` discount for it, and which axis that number should report
  is the open `confidenceLabel` item, not this one. What did change is that wobble no
  longer pushes a one-signal capture over a count — it never should have, because the
  capture was already ungradable without it.

  **Which way the rule errs, said plainly: towards asking for a retake.** It fires on
  strictly more captures than before — exactly the lone-failure set — and never on
  fewer. The cost is a user re-taking a photo that might have read correctly; the cost
  avoided is a wrong level, which also costs the recommendation, because
  `shouldApplyScan` in `lib/recommend.ts` drops a retake-recommended scan and so a bad
  reading that stays under the gate flows into the products shown. At 41-100% level
  disagreement per lone failure, a retake is the cheaper error. **How much more often it
  fires cannot be measured from here**: it needs the share of real captures that fail
  exactly one signal, which is the funnel flush, which is the PIPA blocker. Not
  estimated, not guessed.

  **Verification of the new tests.** All 8 cases in `tests/retake-signal-rule.test.ts`
  checked by deleting the line each protects, three mutations. Deleting
  `|| signals.some((signal) => !signal.ok)` from `retakeRecommendedFor` failed 5 cases,
  all `AssertionError: expected false to be true`. Deleting
  `if (burst && meanAgreement < 0.67) retakeReasons.push("촬영 프레임 사이에 신호가 조금 흔들렸어요");`
  from `readsFromRaw` failed 2:
  `expected [] to deeply equal [ '촬영 프레임 사이에 신호가 조금 흔들렸어요' ]` and
  `expected [ '얼굴 영역이 작게 잡혔어요' ] to have a length of 2 but got 1`. Restoring
  `next.retakeRecommended = next.confidence < 0.58 || next.retakeReasons.length >= 2;`
  in `mergeVisionAnalysis` failed 2, one in each file:
  `expected 'import { t } from "@/lib/i18n/core";…' to contain 'next.retakeRecommended = retakeRecomm…'`
  and `expected false to be true`.

  **One existing fixture had to change and it is worth saying why.**
  `tests/capture-analysis.test.ts`'s vision-merge case built a hand-written partial
  `SkinReads` with two `retakeReasons` and no `signals` at all — a shape
  `readsFromRaw` never produces. It now carries a real three-signal array with 조명
  failing, which is what "two retake reasons" was standing in for.

  **ML and research skipped, deliberately.** `ml/selftest.py` is green at 77 and
  nothing in this cycle touches the Python side: the rule lives entirely in the
  TypeScript capture path, and `ml/train_visible_attributes.py`'s metrics/checkpoint
  split is PR #69's. Research likewise — the measurement this cycle needed came from
  running the code, not from an external source, and inventing a lookup to fill the
  track is how the changelog got long. UI/UX is not skipped but is not separate either:
  the retake prompt on `/scan` and the confidence card on `/report` are what this rule
  changes.

  Verification on this branch: vitest **475 passed in 76 files** (from 466 in 75 — the
  8 new cases plus 1 added to `tests/confidence-threshold-agreement.test.ts`),
  `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint` **2 warnings**
  both in `lib/care.ts` unchanged, `python3 ml/selftest.py` **Ran 77 tests ... OK**
  unchanged. Guardrail 8 untouched — no change to `status` or `promotionGate`.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched, `inputSchemaVersion` untouched,
  `distanceConfidence` and the 0.58 threshold untouched.
