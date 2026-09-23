# ARU Autopilot — closed history

Split out of [`docs/AUTOPILOT.md`](AUTOPILOT.md) on 2026-09-17 (cycle 10), when the
changelog had grown to 1,545 of that file's 2,329 lines and every worker brief still
told a fresh session to read the whole thing before doing anything.

Nothing here is summarised. Every line below is the text it had in `AUTOPILOT.md`,
moved unchanged. What stayed behind is everything a cycle must obey or act on: the
cycle protocol, the ten hard guardrails, the revenue arithmetic and the
revenue-upstream ordering, the standing objective, the live backlog, BLOCKERS, how the
schedule runs, supervisor findings not yet actioned, and the two or three most recent
cycles under "Recent cycles".

What is here, and why it is here rather than there:

- **Closed backlog items** — items ticked `[x]`, i.e. the work is merged and the item
  is done. Items still open (`[AI]`, `[OWNER]`) and items partly done (`[~]`) stayed in
  `AUTOPILOT.md`, because a cycle still has to act on them.
- **Changelog entries through cycle 6** — the dated record of merged cycles. The three
  most recent cycles stay inline in `AUTOPILOT.md`, because stopping a cycle from
  redoing last night's work is the one live function the changelog has.

This file is append-only history. A cycle reads it when it needs to know why something
was done the way it was; it does not need to read it to do a cycle.

## Closed backlog items

Ticked `[x]` and moved here; the section each was under is kept.

### Now

- [x] [AI] ~~`savePilotNote` is the only store in the repo with no `window` guard, no cap and
  no try/catch~~ — closed 2026-09-21 (cycle 26). Every clause held on arrival. Fixed with the
  guard, a 500-row cap matching `lib/labels.ts`, a try/catch, and a `PilotNote | null` return
  matching `recordConsentEvent` and `saveCropSample`. The part the item named as the real cost
  became the shape of the fix: the participant scope is now written BEFORE the note, from its
  own small key, so a store that refuses the growing array cannot also cost the scope that
  `/scan` reads on every consent toggle. `setCurrentPilotSession` was guarded too — it had the
  same bare `setItem`. `/pilot` reports a refused write and keeps the typed fields, which is
  the opposite answer to cycle 25's `recordCareIntent` and for a stated reason: there nothing
  on screen claimed the write had happened, here the form clears and the roster re-reads, so a
  dropped note looks like a note that was never typed. `tests/pilot-note-write-signal.test.ts`,
  7 cases, four source-line breaks that bite (`expected [Function] to not throw an error but
  'QuotaExceededError: quota' was thrown`; `expected null to match object { participantId:
  'P007' }`; `expected [ ...(501) ] to have a length of 500 but got 501`; `QuotaExceededError:
  quota`) and **one that does not**: deleting the `typeof window` guard leaves all 7 green,
  because Node has no `localStorage` binding and the ReferenceError is swallowed by the same
  try/catch. That is recorded at the assertion rather than dressed up as a guard. The original
  text, for the record:

  > - [AI] **`savePilotNote` is the only store in the repo with no `window` guard, no cap and
  > no try/catch.** Found 2026-09-21 (cycle 25). `lib/pilot.ts:151` does a bare
  > `localStorage.setItem(KEY, JSON.stringify(all))` where `labels.ts`, `consent.ts`,
  > `crops.ts`, `store.ts`, `scan-history.ts` and `funnel.ts` all guard and cap. On a full or
  > blocked store the `QuotaExceededError` escapes into `/pilot`'s click handler, the note is
  > lost, and `setCurrentPilotSession` at line 154 never runs — so the participant scope is
  > never established and consent events recorded afterwards land unscoped, which is what the
  > participant-grouped cross-validation needs. **Research-mode only**: `/pilot` is in
  > `proxy.ts`'s matcher and 404s in production unless `INTERNAL_TOOLS_USER` /
  > `INTERNAL_TOOLS_PASSWORD` are set, which is why it did not win the bug-fix track over a
  > defect every user hits. Same shape as the cycle 24 and cycle 25 store fixes.

- [x] [AI] ~~The promotion gate is fed two different models' numbers in one call~~ —
  closed 2026-09-21 (cycle 24). Fixed on main by PR #69 (merged 2026-09-21) and
  **verified here rather than taken on trust**: `ml/train_visible_attributes.py:858`
  reads `final_val_metrics = metrics_from_confusion(promoted_val_confusion)`, from a
  validation pass taken after `model.load_state_dict(checkpoint["model"])`, and the
  last epoch's is kept separately as `last_epoch_val_confusion` at line 926. The fix
  had **no guard**, which is how the defect was free to exist in the first place;
  cycle 24 added three, in `ml/selftest.py`'s `PromotedCheckpointIsWhatTheGateScores`.
  They assert the ORDER reload -> re-score -> gate on the trainer's source, so moving
  the re-score above the reload fails even though every string is still present:
  `34871 not less than 34619 : the promoted checkpoint is scored BEFORE it is loaded,
  so the gate reads whatever weights happened to be in memory`. Restoring the original
  defect fails two. The item's own sentence "PR #69 fixes it ... and is waiting on an
  owner decision" is what made it stale: that decision happened. The original text,
  for the record:

  > - [AI] **The promotion gate is fed two different models' numbers in one call.**
  >   Verified by the supervisor at main `b2ec030`, `ml/train_visible_attributes.py:805-845`,
  >   independently of PR #69 which reports the same area. The training loop saves
  >   `best_path` whenever `mean_val > best`, so the best checkpoint can be any epoch, and
  >   separately keeps `last_val_confusion = val_confusion` every epoch, so that variable
  >   always holds the FINAL epoch's. After the loop the best checkpoint is loaded, so
  >   `evaluate_by_cell` produces `subgroup_metrics` from the best checkpoint — but
  >   `final_val_metrics = metrics_from_confusion(last_val_confusion)` is the last epoch's,
  >   from a model no longer in memory. `promotion_check` then receives both.
  >
  >   So the qwk/pearson floor and the heuristic comparison read one model's numbers while
  >   the worst-group gap and the per-axis sample floor read another's, and `metrics.json`
  >   records the pair as though they described one artifact. They agree only when the best
  >   epoch happens to be the last, which is the case best-checkpoint tracking exists to not
  >   assume. No live impact yet — zero consented crops, so no run has produced a
  >   `metrics.json` — which also means it must be fixed before the first one does, i.e.
  >   before anyone would notice it was wrong. PR #69 fixes it as part of a larger branch
  >   and is waiting on an owner decision; if that branch is not wanted whole, this split is
  >   a handful of lines and is a cycle item on its own. Noted 2026-09-17.

- [x] [AI] ~~`/scan` has no pixel-level mobile-layout coverage~~ — closed 2026-09-21
  (cycle 24), and the instrument found a defect on its first run.
  `tests/e2e/mobile-layout.spec.ts` now shims `getUserMedia` to a canvas
  `captureStream()` — a real MediaStream, so `openCamera` resolves, `watchCameraStream`
  finds tracks, and the page reaches `phase === "ready"` the way it does on a phone —
  and then measures the live-camera screen at 360x800 in all five locales: viewport
  overflow, text laid out wider than its own box, and every visible control's tap box.
  What it found: `infoLinkBtn` (`app/scan/scan-styles.ts`), the only way into the
  "사진과 데이터 사용" sheet and the control that explains what happens to the user's
  photo, shipped at **290.0x26.8px** against `--tap-min: 44px`. `ghostLink` two exports
  below it already carried the minimum. Reverting the fix fails the spec with exactly
  one offender named — `ko: controls under 44px ... ["사진과 데이터 사용 자세히 보기
  290.0x26.8"]` — and fails the source contract too. One reviewer misstep recorded: the
  first version of that contract assertion used `[\s\S]*?` and passed against a
  REVERTED `infoLinkBtn`, because it ran past the declaration and matched `ghostLink`'s
  own `minHeight` fifty lines down; it is bounded to the object literal now. The three
  18x18px checkboxes the spec first flagged are NOT a defect — each sits inside a 52px
  `<label>`, which is the box a finger lands on — so the rule measures the label, not
  the input. The original text, for the record:

  > - [AI] **`/scan` has no pixel-level mobile-layout coverage, and that is how the camera
  >   quality checklist clipped its labels in all five locales unnoticed.**
  >   `tests/e2e/mobile-layout.spec.ts` asserts overflow on `/` and `/studio` only, and
  >   visits `/scan` solely for the camera-denied tap-target case, because reaching
  >   `phase === "ready"` needs a fake media stream that suite does not set up. So the
  >   clipping fixed in cycle 22 was caught by hand in a browser and is pinned by a SOURCE
  >   contract (`tests/mobile-layout-contract.test.ts`), which cannot see a pixel. A fake
  >   `getUserMedia` returning a canvas stream would let the spec reach the live-camera
  >   screen and assert `scrollWidth <= clientWidth` on every check, which is the assertion
  >   that would have caught it. Noted 2026-09-20; the measurement both ways is in
  >   `docs/scan-quality-checklist-layout.md`.

- [x] [AI] ~~The blemish detector has no guard on its own decision margin, and the obvious
  one is vacuous~~ — closed 2026-09-21 (cycle 23), with the margin measured directly the
  way the item said it had to be. **Five of six source-line breaks of `lib/skin.ts` fail
  the new guard, two of them on the new assertions, and the noiseless fixture fails the
  same predicate with a suppression margin of exactly zero at every frame size.** The
  original text, for the record:

  > - [AI] **The blemish detector has no guard on its own decision margin, and the obvious
  >   one is vacuous.** Cycle 22 tried to assert that a realistic (noisy) frame's
  >   `blemishCount` does not move under a 1e-16 perturbation of a\*. It does not — measured
  >   at five frame sizes — but **seven source-line breaks of `lib/skin.ts` were tried
  >   against an assertion of it and none made it fail**, so it ships as a printed
  >   measurement in `tests/blemish-tie-break.test.ts` and not as a case. The reason is
  >   structural: a uniform nudge cancels in `astar[i] - background`, and what actually
  >   moves the noiseless fixture is that the addition ROUNDS differently at different
  >   magnitudes; quantising the residual absorbs the nudge, and quantising the channel
  >   averages into plateaus leaves the ties exactly tied. A real guard has to measure the
  >   margin between competing cells directly — the smallest gap between a surviving cell
  >   and its suppression-window neighbours, and between a residual and
  >   `BLEMISH.minResidual` — and assert it is far above float noise. That is what would
  >   have caught the noiseless fixture's zero margin years before a lookup table did.
  >   `tests/blemish-perturbation-tolerance.test.ts` already replicates the classifier and
  >   is the natural home. Noted 2026-09-20.

- [x] [AI] ~~The `ita` guard is in two places and the disagreement is 180 degrees, not a
  rounding difference~~ — decided 2026-09-20 (cycle 20), on the measurement the item
  asked for rather than on the hypothesis it floated. **The guard is `b* == 0` in all
  three implementations and `ml/index-parity.json` -> `ita` is `exact` with one column.**

  The reachability question came back as two answers pointing at different fixes. On a
  skin-coloured region the window is a knife edge: the blue gain has to be tuned to
  between **1.945e-4 and 7.784e-4** to land in it, the window is **0.0150%** of the
  8-bit cube at n = 2,000,000, and a 121-step sweep of the shipped `analyzeSkin` steps
  from **89.6 to −89.2** across the crossing **without one clamped reading**. So cycle
  19's reachability argument was too strong — a capture *crosses* the window, which is
  not landing in it. What made it reachable is the **neutral axis**, which is INSIDE the
  window: ARU's four-decimal sRGB→XYZ matrix gives `r = g = b` a small negative b\*, so
  **242 of the 256** 8-bit greys satisfied `|b*| < 0.01` against **1 of 256** for
  `1e-6`, and on **all 241** non-black ones the ±90 fallback returned the sign the limit
  does not have. The registry's narrower guard held the correct column.

  Sign-awareness alone was rejected on a second defect in the same guard: what diverges
  is the RATIO, so at L\* 50.001 and b\* 0.005 the window published **90**
  (`very_light`) where the angle is **11.31** (`tan`) — and a sign-aware ±90 publishes
  90 there too. The "undetermined band" option was rejected on measurement rather than
  on cost: the only genuinely ill-conditioned input is `0/0`, an achromatic mid-grey,
  which is not a face, so the state would have carried a new value through
  `resolve_tone_band`, `aggregate_by_cell` and `promotion_check` to describe one point
  while leaving the sign wrong everywhere else in the window. `ml/subgroups.py` and the
  promotion gate are untouched, which is only true because that option was refused.
  Dropping the guard entirely is unsafe in Python and the reason is asymmetric: CPython
  raises `ZeroDivisionError` on both zeros while V8 divides `+0` to `Infinity`, `-0` to
  `-Infinity` and `0/0` to `NaN`; denormals are fine in both (`20.0/5e-324` is `inf`,
  `math.atan(inf)` is exactly π/2), so `b* == 0` is the only input that needs a branch.
  Full measurement, all four tables and the limits: `docs/ita-guard-decision.md`.

- [x] [AI] ~~`relative_redness` in `ml/skin_indices.py` and `relRedness` in
  `lib/skin.ts` are two different formulas under one declared name~~ — settled
  2026-09-20 (cycle 19), by the measurement the item named rather than by picking a
  side. **The app's chromaticity difference won and the Python side moved to it.**
  An a\* difference is not scale-free: a\* is homogeneous of degree 1/3 in the linear
  signal and the linear signal degree 2.4 in the 8-bit channel, so a common exposure
  gain g takes an a\* DIFFERENCE to g^0.8 of itself — it factors out of the difference
  instead of cancelling in it, which is what the old docstring's "both regions went
  through the same sensor and the same light" got wrong (true of an additive common
  term, false of a multiplicative one). Verified against a pure 2.4 power law to every
  printed digit. Over cheekL 70..170 on one face the rejected form runs 1.83 -> 3.96
  (2.1683x) where the shipped one holds within 1.0249x; as drift against the index's
  own range over four faces of different redness, the chromaticity form wins by
  **24.16x** (exposure), **11.19x** (melanin tone) and **3.32x** (white balance), and
  **ties** on the two transfer-function nuisances where neither form is invariant
  (tone curve 0.3930 / 0.4076, veiling flare 0.1878 / 0.1822). No published value
  moved — the app already computed the winner, and nothing in the pipeline had ever
  called the Python function. `ml/index-parity.json` gains a `relative_redness` group
  (8 face rows through `analyzeSkin` carrying the region means, 9 edge rows,
  `covers: "formula and path"`), `lib/skin.ts` gains `redChromaticity` and
  `relativeRedness` byte-for-byte unchanged, and `tests/redness-formula-decision.test.ts`
  is the re-runnable sweep. Full write-up, including the published level the tone-curve
  tie costs and why moving the cut does not fix it:
  [`docs/redness-formula-decision.md`](redness-formula-decision.md).
- [x] [AI] ~~Three of the seven indices in `ml/skin_indices.py` still have their names
  pinned and their values unchecked~~ — the audit cycles 16 to 19 were running is
  finished, 2026-09-20. All seven have had their values checked and six are pinned in
  `ml/index-parity.json`. Outcome per index: `shine_ratio` **was wrong** (cycle 16),
  `tone_evenness` agrees, `blemish_count` agrees (cycle 17), `roughness_ratio`
  **disagrees** and is pinned divergent (cycle 18), `relative_redness` **was wrong**
  (cycle 19), `ita` **disagrees by 180 degrees** in a guard window and is pinned
  divergent (cycle 19). Three of the seven declarations were false, which is the
  number that justifies the mechanism: `tests/skin-index-contract.test.ts` pinned all
  seven NAMES throughout and stayed green for every one of them. `melanin_index` is
  the seventh and is deliberately not in the table — it is the one index a value
  contract is the wrong instrument for, because no app-side value exists to compare
  against; it keeps its own open item. Table of where all seven stand:
  [`docs/redness-formula-decision.md`](redness-formula-decision.md).
- [x] [AI] ~~`shine_ratio` in `ml/skin_indices.py` and `shine` in `lib/skin.ts` are two
  different formulas under one name~~ — settled 2026-09-19 (cycle 16), by measurement
  rather than by rename, as the item required. **The app's formula won and the Python
  side moved to it.** Five independent grounds, each sufficient alone: `cheek_specular`
  was never a field of `SkinRawFeatures`, so the Python form was **uncomputable** from
  an ARU export; no pipeline script ever called `shine_ratio()` (all three read the
  app's `shine` column), so it was a declaration and the declaration was what was wrong;
  on a matte cheek `cheek_specular` is exactly 0, so the 1e-6 epsilon set the scale and
  one cheek pixel in 81 moved the index by **12,345.7x**; adding oil to the cheek made
  the index **fall**; and it returned exactly 0 for three faces whose T-zone/cheek
  brightness gap the app separates into two published levels. Its claimed exposure
  invariance — the one thing `ml/selftest.py` checked — is false on a frame: a specular
  ratio is a threshold count fraction, not a luminance, and across an exposure range
  every capture signal accepts it ran **0 -> 49,383** while the app's index held within
  **0.12%**. `ml/selftest.py`'s invariance case moved with the formula and narrowed
  (the Weber gap term cancels a gain exactly; the specular term is passed through, not
  asserted invariant). No published value moved: the app's expression was extracted into
  an exported `shineIndex` byte-for-byte unchanged, proven by the existing absolute-value
  pins. The drift itself is closed by `ml/index-parity.json` — a committed table of
  inputs and expected outputs asserted **exactly** by `tests/index-parity.test.ts` and by
  `ml/selftest.py`, 16 of whose 22 shine rows are real readings whose frames the
  TypeScript side rebuilds — because `tests/skin-index-contract.test.ts` pins names and
  names were never what could drift. Measurement, both tables and the reproduction
  commands: `docs/shine-formula-decision.md`.

- [x] [AI] ~~`funnelDropoff` anchors its cumulative chart on `scan_started`, so the camera
  loss `scan_opened` measures does not appear in the drop-off bars~~ — done 2026-09-19.
  The item was parked on "revisit once logs in hand all contain it", because the chart is
  an intersection from stage 0 and anchoring on `scan_opened` alone would report a chart
  of zeros for every session recorded before that kind existed. It did not need the wait:
  the anchor is `scan_opened` UNION `scan_started`. `scan_opened` fires on /scan entry
  and `scan_started` at the shutter, so in any log recorded since it existed the second
  implies the first and the union IS the `scan_opened` set — a 촬영 화면 stage now leads
  the chart and the camera loss appears as the drop into 스캔 시작. A legacy session
  enters at its own 스캔 시작 and reads a 0% camera drop: "not measured here", which is
  true, rather than "nothing happened", which is not. The cost is stated as a case rather
  than left to be discovered — a log MIXING the two generations understates the drop,
  50% becoming 33% on the pinned three-session fixture, because the older sessions join
  the anchor without ever being able to contribute a loss. It is a no-op once every log
  carries `scan_opened`. `tests/funnel.test.ts`; the case that replaced the deferral pin
  is the one that fails, `expected +0 to be 1`, if the union is dropped.

- [x] [AI] **Nothing checks that a capture signal's strings are translated.** Signal labels
  and details are raw Korean data translated at render via `t()`
  (`buildSignals`, `app/scan/result-card.tsx`), and `tests/i18n-coverage.test.ts` does
  not reach them — it covers the report trust card's runtime-composed strings and passes
  `signals: []`. The three older signals' six strings are in en/ja/zh/ar because
  somebody remembered. Cycle 14 covered its own three strings inside
  `tests/cheek-clipping-signal.test.ts`, which is the wrong home for a general rule: an
  untranslated signal shows raw Korean in the 측정 환경 checklist to every non-Korean
  user, and the next signal added will have nothing holding it. Cheapest useful version
  is a case in `tests/i18n-coverage.test.ts` that drives `analyzeSkin` on fixtures
  covering both states of all four signals and calls `expectCovered` on every string.
  Noted 2026-09-18.
  **CLOSED 2026-09-18 (cycle 14), as the cycle's second item.** The rule now lives in
  `tests/i18n-coverage.test.ts` rather than in the file for one signal: six fixtures
  drive `analyzeSkin` to every state of all four signals — all pass, 조명 dark, 조명
  blown out, 반사 glint, 노출 여유 with the cheek's red at the ceiling, 피부 영역 with
  the patch off-frame — collect every label and detail encountered, assert that all four
  labels were seen in BOTH states and that the set is exactly the 13 distinct strings
  those states produce, then `expectCovered` each. Driven through `analyzeSkin` rather
  than listed by hand, so a signal added without a fixture fails the count instead of
  escaping coverage. Verified by breaking it three ways at the source: renaming 조명's
  blown-out detail fails with `AssertionError: "빛이 아주 강해요" missing from en
  dictionary`, deleting the ja translation of 반사's detail fails with `AssertionError:
  "이마/T존 반사가 강해요" missing from ja dictionary`, and deleting the 노출 여유 signal
  from `buildSignals` fails with `AssertionError: expected 3 to be 4`.

- [x] [AI] **No capture signal looks at a saturated CHEEK channel, and both cheek-derived
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
  **CLOSED 2026-09-18 (cycle 14).** Fourth signal 노출 여유 added on
  `raw.cheekClipped`, the share of the cheek patch with any channel at 255, failing at
  `CHEEK_CLIP_LIMIT = 0.15`. The cut was derived from a committed sweep of 84 faces
  rather than chosen: 0.15 is the only value above every bucket whose indices are still
  inside the invariance the unclipped band delivers (cov 1.02x, relRedness 1.08x; last
  clean bucket 14.81%, cov leaves its band at 16.05%) and below every bucket in which a
  published level has ever moved (first flip 20.99%). Cost measured on the same sweep:
  645 of 10,273 previously-passing captures (6.28%) now ask for a retake, 0.00% of them
  below cheekL 140. It catches 379 of the 380 silent flips; the one miss has NO clipping
  and is the dark-end quantisation cycle 13 already measured. The R/L 1.17..1.20 window
  is still the measurement it was and the golden set still owns the unknown — what
  changed is that the window no longer decides a published level.
  `tests/cheek-clipping-signal.test.ts`, `ARU_PRINT_CLIP_SWEEP=1`.

- [x] [AI] `confidenceLabel` no longer distinguishes reading ambiguity. After the
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
  **CLOSED 2026-09-18 (cycle 14): the axis is decided and it is READING MARGIN.** The
  argument the item was missing came from the retake rule. `shouldApplyScan` requires
  `!retakeRecommended` and `retakeRecommendedFor` fails on any failed signal, so on the
  path where a reading is used `signalScore` is exactly 1 and its 0.28 is a constant.
  The 0.78 gate sat below the reachable floor of 0.7804, so at full frame agreement
  100% of the reachable range read 높음 and only wobble could move the label. The label
  now reports reading margin, which is the only one of the three axes the user is told
  nowhere else — capture quality is rendered signal-by-signal in the 측정 환경 checklist
  and frame wobble has its own `retakeReasons` line. Gate 0.78 -> 0.8614 in both copies,
  derived: `distanceConfidence`'s own midpoint 0.8075 (a reading a quarter-span from its
  nearest cut) composed as `0.8075 * 0.72 + 0.28`. The range now splits 50/50 and one
  attribute disagreeing on one of three frames decides the label only within 5.97% of it.
  The 0.58 gate did not move. Pinned as a derivation in
  `tests/confidence-label-contract.test.ts`, which also holds the `Math.min(0.86, ...)`
  vision cap below the gate so the two cannot drift apart unnoticed.

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
- [x] [AI] ~~**Design the unauthenticated funnel ingest endpoint.**~~ — built 2026-09-17
  (cycle 7). `app/api/funnel/route.ts`: 32 KiB body cap (1/160th of `/api/sync`'s 5 MB),
  its own `createRateLimiter` bucket at 20/60s per client key **run before the body is
  read** (there is no auth here for it to run after, so the limiter is the outermost
  defence rather than a second one), a same-origin guard that needs no configuration,
  100 events per request, and server-side re-derivation of the kind and prop-key
  allowlist. The allowlist is not duplicated: `lib/funnel-contract.ts` holds one copy
  that both the browser flush and the route import, and two tests fail if the route ever
  grows its own. Rows carry `metadata.source = "public-funnel"` — chosen by the route,
  never read from the body — plus `metadata.receivedAt` from ARU's own clock, and the
  write is `ignoreDuplicates`, so it can only ADD. That last one is the only place where
  copying `/api/sync`'s plain upsert would have been a real hole rather than a stylistic
  one: through an unauthenticated door it would let anyone who guesses a row id rewrite
  an operator's row. `GyeolSyncPayload["source"]` widened to `SyncSource`
  (`"ops-local" | "public-funnel"`) and `supabase/schema.sql` documents the vocabulary on
  the column, with a `(metadata->>'source', ts)` index so the two populations can be
  queried apart. Attacker table, the Fetch-spec citation under the origin guard, and what
  the route honestly **cannot** do about a forged `visitorId`: §8 of
  `docs/funnel-flush-design.md`. 27 new tests in `tests/funnel-ingest.test.ts`, 2 more in `tests/funnel-flush.test.ts`.
- [x] [AI] ~~**Nobody can read `funnel_events`.**~~ — built 2026-09-17 (cycle 8). Cycle 6
  built the flush and cycle 7 the endpoint, so the table could be written; `/ops` still
  drew its funnel panel from `readSnapshot()` → `summarizeFunnel()` over
  `lib/funnel.ts`, which is localStorage. With the flag on and rows arriving, the only
  thing `/ops` would have shown is the operator's own session. `lib/funnel-aggregate.ts`
  plus a token-gated `aggregate` field on `GET /api/funnel` is the read: the same shape
  `/api/sync`'s GET already uses for `commerceOverrides` (`hasValidSyncToken`, field
  absent without a valid token), and no new auth mechanism. Split by `metadata.source`,
  one query per source on the expression `funnel_events_source_ts_idx` is declared on,
  and the response is a **list** with no field that adds the two — the schema comment
  on the column says not to pool them and an `/ops` screen that did would be exactly
  the mistake it warns about. Aggregate counts only: the select list is
  `kind, session_id, ts`, never `visitor_id`, never `props`, never `*`, and
  `summarizeFunnel`/`funnelDropoff` now take `FunnelCountable`
  (`Pick<FunnelEvent, "kind" | "sessionId">`) so the counters have no field for a
  visitor to be read from. Rendered on `/ops` **next to** the on-device summary, which
  keeps its panel and is now labelled "on-device log" — it is still the right screen for
  an operator testing their own flow. The three states that are the normal state today
  are decided and written down rather than defaulted (§9.4 of
  `docs/funnel-flush-design.md`): unconfigured and query-failed are separate sentences,
  an empty table renders both cards saying "no rows" rather than an absent panel, and
  every ratio with a zero denominator prints "—" rather than "0%", because "0% reached
  the shutter" is a measurement of total failure and "no scan opens recorded" is no
  measurement. Truncation at the 5,000-row cap, rows carrying no source marker, and
  kinds this build has no step for are all reported rather than swallowed. 25 tests in
  `tests/funnel-aggregate.test.ts`. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched.
- [x] [AI] ~~**Commit the retake sweep, or stop citing its table.**~~ — done 2026-09-18.
  Cycle 11's 120-seed-per-condition disagreement table rested on a script that was not
  committed, the only decision-driving measurement here that could not be re-run. The
  sweep is now an env-gated block in `tests/retake-signal-rule.test.ts`
  (`ARU_PRINT_RETAKE_SWEEP=1`), the shape `tests/blemish-density-scale.test.ts` set,
  with the fixture construction written into the test because it had to be re-derived
  from prose. **It did not reproduce.** 반사 and 피부 영역 came back within a handful of
  seeds (피부 영역 pores lands on 49/120 exactly); 조명 is out in both directions — dark
  oil 21/120 against 71/120, dark pores 120/120 against 4/120 — because the noise
  amplitude that puts `cov` on its cut point clips against zero at cheekL 60, and
  because cycle 11's dark band was 51.4-69.1 against this run's 59.6-60.5. The table in
  `lib/skin.ts`'s `retakeRecommendedFor` doc comment is corrected and labelled as a
  re-derivation, with the old numbers named in the same comment. The rule is untouched
  and still supported: every condition costs a published reading on at least a sixth of
  the seeds. Full account in the cycle 12 entry.
- [x] [AI] ~~Four more drop-offs are uninstrumented~~ — done 2026-09-15. `home_viewed`,
  `scan_opened`, `camera_blocked`, `care_viewed` and `checkin_opened` now fire, with
  `captureStart` and `cameraBlockRate` in the summary and in `/ops`. Still on-device:
  the server-side item above is what makes any of this readable by a human.

- [x] [AI] ~~**`rgbToLab` is 53-59% of a scan and the fast path is still not taken.**~~
  Taken 2026-09-19 (cycle 17), with the item's own framing corrected on the way out.
  The fast path is `labAStar` in `lib/skin.ts`: `a*` alone, no `z`, no third `f()`, no
  object, and **not a second formula** — `rgbToLab` calls it, so `a*` has one
  implementation and the two cannot drift. Cycle 16's two open worries are both
  answered rather than argued: the partial duplication is declared in
  `ml/index-parity.json`'s new `primitives.rgb_to_lab` group (`computes: ["a"]`,
  `doesNotCompute: ["l", "b"]`, `fastPath.python: null`), and the tolerance came from a
  measurement of 268,877 inputs rather than from a round number — the two languages
  agree exactly on 63-80% of them and differ by at most **1.472** units of
  `channelScale * 2^-52`, so `toleranceK` is 4.
  **The 53-59% does not transfer, and that is the more useful half.** Cycle 15's
  ablation replaced the whole `rgbToLab` call, which removes the three
  `Math.pow(., 2.4)` calls; an `a*`-only path keeps all three. Measured with a paired,
  order-alternating benchmark (`C4`) over eight runs, the fast path saves **0.05-0.32 ms
  a frame, 1.4-7.8%** of `detectBlemishes` — positive in all 24 measurements at the
  three smaller frame sizes, and not resolvable at 1440x1920, where 2 of 8 runs came out
  negative. The transfer curve it cannot touch is **37-61% of `detectBlemishes`**
  (`C5`, 32 of 32 positive).
  No published value moved: `a*` is computed with the identical sequence of doubles,
  and the `blemishCount` / `blemishDensity` pins stayed green without being edited.
  `docs/rgb-to-lab-parity.md`.

- [x] [AI] ~~**The remaining win in a scan is the sRGB transfer curve, and taking it
  needs a measurement nobody has done.**~~ — measured 2026-09-19 (cycle 18), and the
  answer is **no, the curve stays**. The missing number is now four committed tables in
  `docs/blemish-perturbation-tolerance.md`
  (`ARU_PRINT_BLEMISH_TOLERANCE=1 npx vitest run tests/blemish-perturbation-tolerance.test.ts`).
  Below **1.046e-5** a* units, no per-cell error can change `blemishCount` on the worst
  of twelve frames measured — that is a certified radius, derived from the run's own
  margins rather than from trying error fields, and the smallest of a family spanning
  1.0e-5 to 3.0e-3. A 256-entry table is nowhere near it: read at its nearest entry it
  is off by **0.470 a\*** and **moves the count from 6 to 7** at 400x480, and read with
  linear interpolation it is off by **5.0e-4**, 48 times the radius, leaving the count
  alone on this fixture by luck rather than by property. What survives is a narrower and
  purely-speed question, filed as its own item below.

- [x] [AI] ~~`FEATURE_KEY` declares `melanin_index` to be `toneLstar`, and it is not~~ —
  closed 2026-09-20 (cycle 21) on the second of the two options the item named. The
  registry gained `DERIVED_FROM`, a second kind of entry for an index computed offline
  from an exported column, and `melanin_index` moved into it. The app did NOT grow a
  melanin field: the benchmark this registry already cites computes the index from a
  CIELAB L* reading the same way (`src/clinical.py:compute_melanin_index` in
  hpicsk/regional-ccm, same `100*log10(100/L*)`, same `1.0` floor), so it is derived
  rather than measured and a new column would have had no producer and no reader.
  Guards: an index in neither map or in both fails `ml/selftest.py`, a derived index
  equal to its source fails it too, and a derived index whose source is not a real
  `SkinRawFeatures` field fails `tests/skin-index-contract.test.ts`. Full verification,
  including all 24 of the module's borrowed figures, in
  `docs/melanin-index-verification.md`. The original item read:

  > [AI] **`FEATURE_KEY` declares `melanin_index` to be `toneLstar`, and it is not — it is
  > a nonlinear transform of it.** `FEATURE_KEY`'s own documented contract is "index id ->
  > the feature key `lib/skin.ts` writes into every exported sample". `melanin_index` is
  > `100 * log10(100 / max(lstar, 1.0))`; `toneLstar` carries L\* itself, so at
  > L\* = 70 the index is **15.49** and the declared column holds **70**. Verified
  > 2026-09-19 that no TypeScript counterpart exists anywhere — the only match for
  > "melanin" in `lib/` and `app/` is a prose comment in `lib/tone-bands.ts`. So this is
  > the reverse of `cov`, which cycle 13 correctly left alone: `cov` has no Python index
  > and therefore no declaration that can be wrong, while this has a declaration and no
  > app-side value to declare. The fix is a decision, not an edit: either the app computes
  > and exports a melanin index (a new field, which needs a reason beyond a test wanting
  > one) or the registry records that this index is derived offline from `toneLstar`
  > rather than carried by it, which means `FEATURE_KEY` needs a second kind of entry.
  > Noted 2026-09-19.

- [x] [AI] ~~**The decision-margin guard is blind to the residual arithmetic, and the blind
  spot is measured.**~~ Closed 2026-09-21 (cycle 25) the way the item asked — a SECOND hook,
  not a widened first one. `__observeResidual` is injected after the residual loop and
  before the classification loop, so the field the detector actually classifies is read out
  and held against the replica at every valid cell. The break this item names (quantise
  `residual[i]` to 3 decimals in `lib/skin.ts`) now **fails**, first assertion: `the
  detector's own residual differs from this file's replica at 11789 of 11789 valid cells
  (worst |d| = 5.000e-4)`. And because that break was already visible elsewhere, a second
  one was needed to show the hook adds coverage rather than duplicating it: clamping only
  residuals far below the `minResidual` floor changes no count anywhere, so every count pin
  stays green, and across five blemish/skin test files — **45 tests — 2 fail, both in this
  file**. `docs/blemish-perturbation-tolerance.md` §7.6. Original note follows.

  > **The decision-margin guard is blind to the residual arithmetic, and the blind spot
  > is measured.** Noted 2026-09-21 (cycle 23). `tests/blemish-perturbation-tolerance.test.ts`
  > measures margins from a replica that recomputes the residual from the a\* grid it
  > captured, so a change `lib/skin.ts` makes downstream of a\* is invisible to it: quantising
  > `residual[i]` to 3 decimals at the source leaves both margin cases green. It is caught
  > today by three assertions in two other files, which is why nothing was patched — but the
  > guard's stated scope is the a\*-production path only, and a cycle that widens it should
  > add a second hook rather than assume the margins cover the whole classifier.
  > `docs/blemish-perturbation-tolerance.md` §7.4.

- [x] [AI] ~~**`recordCareIntent` throws away the same write signal `recordCheckin` just
  stopped throwing away.**~~ Closed 2026-09-21 (cycle 25), including the UI question the
  item left open — and the answer to that question is **no**. Checked before fixing, as
  the item asked: `recordCareIntent` has exactly one caller, `app/care/page.tsx:78`, it is
  a bare `void`, and nothing on screen claims the intent was stored, so unlike cycle 24's
  check-in card this was never a lie to a user. `openCareLink` opens the merchant link
  whether or not the log write landed, so the user's actual action succeeds either way and
  an error row would report a failure that did not happen to them. The fix is therefore the
  signal alone — `Promise<CareIntent | null>`, matching both siblings — and
  `tests/care-intent-write-signal.test.ts` pins the decision as well as the signal: its
  third case asserts the ORDER (`window.open` after the record, never gated on it) and that
  nothing between them sets a failure state, so a later cycle cannot "finish" this by adding
  UI that misreports. Original note follows.

  > **`recordCareIntent` throws away the same write signal `recordCheckin` just
  > stopped throwing away.** `lib/store.ts:recordCareIntent` calls `lsPush` and discards
  > its boolean, returning a fully-populated `CareIntent` whether or not localStorage
  > accepted it — the defect fixed on the check-in path in cycle 24, one function below
  > it. Left alone deliberately rather than swept up: its only caller is
  > `app/care/page.tsx:78`, which does `void recordCareIntent({...})` and shows the user
  > nothing, so unlike the check-in card it never tells anyone their data was saved. The
  > consequence is a silently short care-intent log on a full or blocked store, which is
  > a measurement problem and not a lie to a user. Fixing it is the same one line plus a
  > decision about whether `/care` should surface anything. Noted 2026-09-21 (cycle 24).


### Next

- [x] [AI] ~~`ml/calibrate.py` still has no feature-generation handling~~ — closed 2026-09-22
  (cycle 27), the remaining half of the pooling item cycle 26 opened. The two clauses cycle 26
  wrote were lifted out of `subgroups.coverage_warnings` into `subgroups.generation_warnings(counts,
  total)`, one shared definition; `ml/calibrate.py` now calls it, resolving each export row's
  generation from `meta` first (where the app nests `modelVersion`/`inputSchemaVersion`) and the
  flat row second (where `prepare_crop_dataset` writes them). A mixed run is reported and still
  fits thresholds — splitting/filtering/refusing is the `inputSchemaVersion` decision and not a
  cycle's. `ml/selftest.py` grew 7 cases to `Ran 137 tests ... OK`; two source-line breaks
  confirmed to fail exactly the new cases (`> 1` -> `> 2` fails 4 incl. the both-readers agreement
  test `1 != 2`; dropping `meta` from `sample_generation` fails 3+1). `subgroups.py`/`calibrate.py`
  restored byte-identical (sha recorded). `docs/feature-generation-pooling.md` §5. Original:

  > - [AI] **`ml/calibrate.py` still has no feature-generation handling, and it is the half of
  >   the pooling item that a warning did not close.** Cycle 26 gave every run that computes
  >   subgroup coverage a report when it pools two generations, but threshold fitting does not go
  >   through `coverage()`: `ml/calibrate.py` reads a CSV directly and has no version handling at
  >   all, so a pre-09-16 and a post-09-16 reading still land in the same threshold fit with
  >   nothing said. The same two clauses on the same two fields would do it. What stays out of
  >   scope for a cycle is what to DO about a mixed run — split it, filter it, refuse it — which is
  >   the same question `VISIBLE_MODEL_CONTRACT.inputSchemaVersion` is waiting on, and it is about
  >   what happens to already-collected samples. Noted 2026-09-21 (cycle 26);
  >   `docs/feature-generation-pooling.md` §5.

- [x] [AI] ~~`/checkin`'s "See my report" link is 43.0px high in `ja` and 45.0px in the other four
  locales~~ — closed 2026-09-22 (cycle 27). The empty-state CTAs now carry `minHeight:
  var(--tap-min)` + flex centring via a shared `ctaBase`, the same shape `pill()` and `flow-steps`
  use, so the height is locale-independent. Measured in Chromium at 360x800, all five locales
  compute `font-size: 14px` / `line-height: 21px`, so 21 + 2x11 = 43px was the height the CSS asked
  for; `ja` was the only locale to get it, and ko/en/zh/ar read 45.0 because their glyphs fall back
  to a font whose baseline is 2px off the strut's — the four "correct" locales were the accident.
  Re-measured ja 155.0x44, all others >=45, doc overflow 0. 5 new per-locale cases in
  `tests/e2e/checkin-touch-target.regression-1.spec.ts`; breaking the fix at its source line fails
  exactly `ja` (`["マイレポートを見る 155x43"] != []`). `docs/tap-target-provenance.md` records where
  the 44 comes from. Original:

  > - [AI] **`/checkin`'s "See my report" link is 43.0px high in `ja` and 45.0px in the other
  >   four locales.** Measured 2026-09-21 (cycle 26) in Chromium at 360x800 while sweeping every
  >   public route for tap targets: `マイレポートを見る` comes back 155.0x43.0 against ko 115.1x45.0,
  >   en 128.3x45.0, zh 120.0x45.0 and ar 113.5x45.0. That is 1px under `--tap-min: 44px`, on the
  >   empty-state links of the surface every re-engagement mail lands on. It is not covered by
  >   `tests/e2e/checkin-touch-target.regression-1.spec.ts`, which measures the home link, nor by
  >   the answer-controls case beside it, which seeds a confirmed purchase so the card renders and
  >   the empty state never appears. Left open rather than nudged because 1px in one locale is a
  >   line-box question (which font falls back, and at what line-height) and the fix should come
  >   from whatever makes the height locale-independent, not from a magic number. Noted 2026-09-21.

- [x] [AI] ~~The "do not pool feature generations" rule is documentation and nothing else~~ —
  closed 2026-09-21 (cycle 26) at the cheapest useful version the item itself named.
  `subgroups.feature_generation(row)` resolves a row's generation from `model_version` and
  `input_schema_version` in either spelling, `Coverage.generations` counts them, and
  `coverage_warnings` emits one line naming and counting pooled generations and a second for
  unstamped rows sitting beside stamped ones. Every run that already wrote `subgroup_warnings`
  gets it. Warning rather than blocking follows scikit-learn's own line between a provenance
  mismatch (`warnings.warn(InconsistentVersionWarning)`) and a structural one
  (`raise ValueError` on a feature-name mismatch), read from its source at v1.5.2 and v1.7.1;
  putting it in `blockers` would be a new promotion rule and that is guardrail 8. The item did
  not know the check would still not have fired: `run_pipeline.py:363` hands `coverage()` a
  narrow projection of each row that had dropped both version fields, so every row's generation
  was invisible at the one place the check runs. Five source-line breaks, all biting.
  `ml/calibrate.py` is NOT covered — threshold fitting does not go through `coverage()` — and
  that half is now its own item under "Next". `docs/feature-generation-pooling.md`. The
  original text, for the record:

  > - [AI] The "do not pool feature generations" rule is documentation and nothing else.
  > `fallbackVersion` moved to `roi-calibrated-2026-09-16` and the string is carried per
  > row (`ml/prepare_crop_dataset.py`, `ml/run_pipeline.py`), but no ML script filters,
  > groups or warns on it, and `ml/calibrate.py` has no version handling at all. So a
  > pre-09-16 and a post-09-16 tone reading still land in the same subgroup cell and the
  > same threshold fit. Cheapest useful version: a `coverage_warnings` entry when one run
  > mixes generations. Noted 2026-09-16.

- [x] [AI] ~~`SampleMeta.toneBand` is declared, documented as derived on-device, and
  never written by any code path~~ — deleted 2026-09-20 (cycle 20), which is the
  "populate it or delete it" the item asked for, and deleting is the side that is safe.
  `resolve_tone_band` (`ml/subgroups.py`) reads a recorded band BEFORE it reads
  `toneIta`, so a band stored by one generation of `itaDegrees` would keep outranking
  the current definition of the stratifier — exactly the drift
  `docs/ita-guard-decision.md` closed inside the formula the same cycle. That preference
  order is right for an external manifest, where the band comes from a Fitzpatrick or
  Monk column and there is no ITA to recompute from, and it stays. The band is derived
  where it is consumed, from the `toneIta` the scan records.
  `tests/subgroup-contract.test.ts` holds the field deleted, holds `ageBand` next to it
  so the case cannot pass by finding the wrong block, and holds `"toneIta"` inside
  `resolve_tone_band`'s ITA key TUPLE rather than anywhere in its text — which is how
  the first version of that assertion was found to be matching the docstring above the
  line instead of the line.

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

- [x] [AI] ~~Decide whether ONE failed capture signal should force a retake.~~ — done
  2026-09-18 (cycle 11). Measured after
  the 2026-09-15 `distanceConfidence` fix: `retakeRecommended` is
  `confidence < 0.58 || retakeReasons.length >= 2`, and with confidence no longer
  collapsing on unambiguous readings the lowest reachable value with 2 of 3 signals
  passing is 0.6871, so a single failed signal can no longer trip the gate. Two or more
  failures still do, via the reason count. The old code caught the single-failure case
  only as a side effect of the inversion — i.e. by accident — but "피부 영역" failing
  alone does genuinely undermine the pores reading, so this deserves an explicit rule
  rather than an accident. Numbers above are from a `node` evaluation of the new
  function against the real `attrConfidence * 0.72 + signalScore * 0.28` weighting.
  **Decided: ANY ONE failed signal recommends a retake**, and the gate is now keyed on
  which signals failed rather than on `retakeReasons.length`. The 0.6871 above is right
  — re-derived this cycle as **0.687067**, from `distanceConfidence`'s floor of 0.695
  swept over every attribute's range, times the real `0.72 / 0.28` weighting — but the
  item's guess about which signal matters was not. Measured through `analyzeSkin` on
  120 seeded captures per condition, with each attribute's raw value tuned onto its own
  cut point, the level disagreement against a clean capture of the same face was:
  조명 dark oil 71/120; 조명 blown out oil 120/120 and redness 120/120; 반사 oil 120/120
  and redness 116/120; 피부 영역 pores 49/120, oil 42/120, redness 22/120. All three
  cost a published reading, so the signal-specific rule the item expected would have
  left two thirds of the damage in place. `retakeRecommendedFor` in `lib/skin.ts`,
  called from both `readsFromRaw` and `mergeVisionAnalysis`; the burst wobble line is
  explicitly not a signal and no longer moves the gate.
  `tests/retake-signal-rule.test.ts`.

- [x] [AI] ~~Two camera dead-ends were off the funnel or mislabelled.~~ — both halves
  done 2026-09-16, ticked 2026-09-18 (cycle 11). **The mislabelled
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
  Ticked on reading: the item's own text records both halves fixed and both tests
  exist in the tree (`tests/camera-denied-reason.test.ts`,
  `tests/camera-interrupt-reason.test.ts`). Nothing in it was still open; it had only
  never been rotated.
- [x] [AI] **`noteEn` is carried on every commerce link and rendered nowhere**, which is the
  `shareUrl` shape one surface over. `CommerceLink.noteEn` (`lib/commerce.ts`) holds an
  English sentence for each of the four merchants ("Korea's biggest beauty retailer — check
  stock online.", and three beside it), `productSearchLinks` copies it onto `CareLink`
  (`lib/care.ts:29`), and no code, test or doc reads it: `/care` renders `t(link.note)`.
  Checked before writing this down rather than assumed — all four Korean `note` strings and
  three of the four `label` strings resolve in `en`, `ja`, `zh` and `ar`, so nothing a
  non-Korean user sees falls back to Korean and this is dead weight rather than a live
  defect. (The fourth label is `"Global search"`, already English, which `t()` passes
  through for `en` and leaves in English for `ja`/`zh`/`ar`.) Delete it or render it — but
  note the audit that would have caught it: cycle 27's coverage sweep read the Korean
  literal at each `t("…")` CALL SITE, and these literals are data in `lib/commerce.ts`
  passed through `t(link.note)`, so a call-site sweep cannot see them. Same class:
  `careSummary` (`lib/care.ts:72`) takes `_reads` and `_result` and reads neither, which is
  where the two standing lint warnings come from. Noted 2026-09-22.
  **2026-09-22, cycle 29: deleted, and the audit that could not see it now exists.**
  `CommerceLink.noteEn` and `CareLink.noteEn` are gone from `lib/commerce.ts` and
  `lib/care.ts`; nothing else in the tree mentioned either. What made that a deletion
  rather than a guess is `tests/care-link-copy-coverage.test.ts`, which collects the
  strings `/care` puts through `t()` from the DATA — `buildCommerceLinks`,
  `productSearchLinks` over all 23 catalogue skus, and `clinicLinks` in both branches —
  and asserts each resolves in `en`, `ja`, `zh` and `ar`. The rule is Hangul-bearing
  rather than an exception list, and a second case pins that `"Global search"` is the
  only language-neutral string, so "no Hangul" cannot grow into "untranslated". Broken at
  source by deleting the 올리브영 note from `lib/i18n/en.ts` (line 855): `care copy that
  would render as Korean: en: buildCommerceLinks[oliveyoung].note = "오늘 매장이나 온라인
  재고를 바로 볼 수 있어요"`, 2 of 3 cases failing.
  **The `careSummary` half was looked at and deliberately left.** `_reads` and `_result`
  are not dead weight in the same sense: `tests/product-trust.test.ts:63` passes a
  visible-redness reading in precisely to assert that it does NOT raise `clinicPriority`,
  so the parameters are what that test's intent is written in. Removing them would delete
  the expression of a deliberate design, so the two lint warnings stay and this is now a
  recorded decision rather than an unexamined leftover.

## Changelog

Dated entries for merged cycles, 2026-09-14 through cycle 6 (2026-09-16), oldest first.
Cycles 7 onward are in [`docs/AUTOPILOT.md`](AUTOPILOT.md) under "Recent cycles".

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

- 2026-09-16 (cycle 6) — Branch `autopilot/2026-09-16-1839`. **Revenue-upstream item 2,
  at the supervisor's correction after three cycles of item 4.** Baseline counted on
  arrival, `npm ci` first because `node_modules` was absent again: vitest **391 in 70
  files**, `ml/selftest.py` **77**, lint **0 errors, 2 warnings** (the same two unused
  parameters in `lib/care.ts`), `tsc --noEmit` **13 errors, all in test files** — not
  the 16 the cycle brief quoted, and the same 13 cycle 5 counted on arrival, in
  `tests/skin-roi-quality.test.ts` (6), `tests/e2e/ios-safari-camera.spec.ts` (3),
  `tests/product-use.test.ts` (3) and `tests/android-config.test.ts` (1). Recorded
  rather than reconciled: the brief's number and this checkout's number disagree and
  only one of them was measured here.

  **funnel (revenue-upstream #2) — the pipeline had no caller, and the caller it needs
  cannot authenticate.** Verified before acting on it, as instructed. Every
  `/api/sync` call site in the tree:

  ```
  $ grep -rn 'fetch("/api/sync"' --include=*.ts --include=*.tsx . | grep -v node_modules
  ./app/ops/page.tsx:168:      const resp = await fetch("/api/sync", {
  ./app/ops/page.tsx:440:  const resp = await fetch("/api/sync", {
  ```

  Both `/ops`, and `internalAccessDecision` returns `not-found` in production unless
  `INTERNAL_TOOLS_USER` **and** `INTERNAL_TOOLS_PASSWORD` are set — which is why smoke
  asserts `ok GET /ops -> 404` — on top of `SUPABASE_SYNC_TOKEN` being typed into the
  page. So five cycles of drop-off instrumentation have been writing to a store with no
  reader.

  `lib/funnel-flush.ts` is the missing call site, mounted by
  `app/components/funnel-flush.tsx` in the root layout (flush on mount, and on
  `visibilitychange` to hidden). `funnelFlushActive()` reads
  `NEXT_PUBLIC_FUNNEL_FLUSH === "on"` — exact, the `affiliateDisclosureActive()` shape —
  and unset, `flushFunnelEvents` returns `disabled` before touching the network. **No
  browser behaviour changes until the owner sets it.**

  **A defect in this cycle's own code, caught before push and written down rather than
  quietly fixed.** The first draft read the flag as `process.env[FUNNEL_FLUSH_FLAG]`,
  which is correct in node and therefore passed every test — and is dead in a browser.
  Next inlines public env through webpack's DefinePlugin keyed on the literal
  expression: `getNextPublicEnvironmentVariables` in
  `node_modules/next/dist/lib/static-env.js` (Next 16.2.9, read in the tree) builds each
  key as `` `process.env.${key}` ``, so the dynamic form is never replaced, reads
  `undefined` in every client bundle, and the flag could not have been switched on at
  all. Same class as the cycle-4 camera test and the cycle-5 blindness case: a green
  test asserting something the shipped path does not do. Now a literal, with
  `tests/funnel-flush.test.ts > reads the flag through a literal Next can inline`
  pinning it (`AssertionError: expected 'export function funnelFlushActive(): …' to
  contain 'process.env.NEXT_PUBLIC_FUNNEL_FLUSH …'` when reverted).

  **The blocker, which is the cycle's actual output.** `POST /api/sync` requires
  `SUPABASE_SYNC_TOKEN`; a browser cannot hold a secret, since anything the page can
  send a visitor can read. The flush therefore cannot succeed against that route, and
  that is pinned against the real handler rather than left to be discovered in
  production (`tests/funnel-flush.test.ts > is refused 401 when posted without the sync
  token`). The honest next step — an unauthenticated `POST /api/funnel` with its own
  rate limit, body cap, origin guard and **server-side** re-validation — is sized in §4
  of `docs/funnel-flush-design.md` and is now its own backlog item. It was not rushed
  into this branch: an unauthenticated write endpoint is a new attack surface on a
  product that has none.

  **What the flush must not do, enforced three ways because one would not.** (a) The
  body is built from scratch, not from `buildLocalSyncPayload()` — that helper reads
  `getCropSamples()`, i.e. consented face images as base64 data URLs, plus labels,
  pilot notes and the consent audit log, and reusing it would put face crops on a path
  that fires automatically in a consumer browser. (b) Each event is reconstructed field
  by field, never spread, because a stored event is JSON that sat in a browser ARU does
  not control. (c) Prop **keys** are allowlisted per kind: `sanitizeProps` bounds value
  types and cannot bound keys, so a future call site recording a `{ note: freeText }`
  prop would pass it intact — on-device a contained mistake, on a flush an egress of
  free text.

  The audit the item asked for came out clean. 15 call sites pass an explicit props
  object, enumerated from the tree; every value is a closed vocabulary (`reason`,
  `merchant`, `source`, `mode`, `surface`, `placement`), a boolean or a small count,
  including last cycle's `camera_blocked.reason` and `camera_interrupted.reason`. The
  four remaining kinds go through `useFunnelPageView(kind)`, which takes no props
  argument at all. Table in §3 of the write-up.

  **research — `navigator.sendBeacon` is the obvious transport and it is the wrong
  one**, verified against a primary source rather than recalled. `www.w3.org` and MDN
  both refuse this network, but the W3C Beacon spec's own source does not:
  `raw.githubusercontent.com/w3c/beacon/gh-pages/index.html`, `http=200 bytes=115132`,
  fetched 2026-09-16. Verbatim: *"Beacon API does not provide a response callback"* and
  *"this method does not provide any information whether the data transfer has succeeded
  or not."* A beacon flush cannot tell 200 from 401, so it would advance the cursor over
  the refusal and destroy exactly the events it was meant to deliver. Transport is
  `fetch(..., { keepalive: true })`, and `markFunnelEventsFlushed` runs only after a
  2xx; a test pins that a 401 leaves the cursor untouched.

  **bug — `funnelEvents` was the one array in the sync payload with no type check.**
  Found while reading the route for what an ingest endpoint would inherit. It is
  optional (it arrived with `sync.v2`), `payload.funnelEvents ?? []` accepts any truthy
  value, and `"abc".length` is 3 — so a string passes validation, enters the upsert
  branch and reaches `.map`. Reproduced against the real handler with `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SYNC_TOKEN` all set, the only configuration
  that gets there:

  ```
  PROBE THREW TypeError funnelEvents.map is not a function
  ```

  Uncaught, so a 500 where every other malformed array is a 400. One clause added to the
  existing validation block.

  **UX / privacy copy.** `/privacy` gains a 이용 기록 전송 paragraph rendered **only
  while the flag is on**, the way `CommerceDisclosure` switches wording on its own flag:
  a page must state what is true at the time it is read, and with the flush off this
  transfer does not happen. Two keys in each of `lib/i18n/{en,ja,zh,ar}.ts`.
  `DEVICE_DATA_KEY.funnelFlushed` is registered like every other key, so "delete my
  device data" clears the flush cursor too — a wiped device that kept its cursor would
  go on suppressing its own events. `tests/device-data.test.ts`'s explicit key list was
  updated with it, which is the registry test doing its job.

  **PIPA — the loop stopped where it was told to.** No new consent kind, no new consent
  flow. `www.law.go.kr` and `www.pipc.go.kr` both answer
  `curl: (56) CONNECT tunnel failed, response 403`, so the analysis in §5 of the
  write-up is labelled as recalled law and cites no article number, because a citation
  nobody can open is worse than an honest summary. Its conclusion — that an automatic
  server transfer is a new purpose neither existing consent stream covers, and that
  whether it needs a consent step is an owner call — is now a BLOCKER. Worth keeping:
  the funnel carries **no** skin levels, so this is not a 민감정보 question; it would be
  a much harder one if `reco_viewed` had ever carried them.

  **verification — each new guard broken on purpose by deleting the line it protects,
  never by editing the test.** Nine breaks, each reverted after:

  - deleted `if (!funnelFlushActive()) return { outcome: "disabled", attempted: 0 };` →
    `AssertionError: expected 'sent' to be 'disabled'` (the flag off, and it sent).
  - `redactFunnelEvent`'s field-by-field construction replaced by `{ ...event }` →
    `AssertionError: expected [ 'crop', 'email', 'id', 'kind', …(5) ] to deeply equal
    [ 'id', 'kind', 'props', …(3) ]`.
  - `redactProps` iterating the event's own keys instead of `FUNNEL_PROP_KEYS[kind]` →
    `AssertionError: expected { reason: 'permission', …(1) } to deeply equal
    { reason: 'permission' }`.
  - deleted `if (!FUNNEL_ORDER.includes(event.kind)) return null;` →
    `AssertionError: expected { id: 'evt-1', …(5) } to be null`.
  - deleted `if (!response.ok) return { outcome: "rejected", ... };` →
    `AssertionError: expected 'sent' to be 'rejected'` (the cursor advanced over a 401).
  - `flushFunnelEvents` ignoring the cursor → `AssertionError: expected 2 to be 1`.
  - `buildFunnelFlushPayload`'s explicit empty arrays replaced by
    `{ ...buildLocalSyncPayload() }` → `AssertionError: expected [ { id: 'crop-1', …(2) } ]
    to deeply equal []`. **This is the one that matters**, and it only fails because the
    test seeds crops/labels/consent/pilot into storage first: every device-data getter
    returns `[]` when `window` is undefined, so the same assertion written against a bare
    node environment would have stayed green while the builder shipped face crops. Same
    failure mode the supervisor caught in cycle 4's camera test.
  - `funnelFlushActive`'s exact `=== "on"` replaced by `Boolean(...)` →
    `AssertionError: expected true to be false`.
  - deleted the POST `/api/sync` token check → `AssertionError: expected 503 to be 401`.
  - deleted the new `funnelEvents` `Array.isArray` clause →
    `TypeError: funnelEvents.map is not a function`.

  One further correction made mid-cycle rather than quietly: the 401 test first used a 29-char
  token, and `getSyncToken()` requires ≥32, so it was passing on "no token is
  configured" rather than on "this request did not present the token" — a green test
  asserting the wrong thing. Fixed before the break table above was produced.

  **Final verification on this branch.** vitest **403 in 71 files** (from 391 in 70),
  `ml/selftest.py` **77**, lint **0 errors, 2 warnings** (the same two in `lib/care.ts`),
  `tsc --noEmit` **13**, unchanged — no tsc error added. `npm run smoke` green with the
  documented `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override and nothing else. Tail, verbatim:

  ```
   Test Files  71 passed (71)
        Tests  403 passed (403)
    44 passed (3.1m)
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

  A note on how that run was produced, because two earlier attempts read red and the
  reason was mine, not the product's. The first full run on this branch passed. Killing
  it to re-run on a later tree left a wedged `next dev` holding port 3102 at 117% CPU,
  and `playwright.mobile.config.ts` sets `reuseExistingServer: true`, so the next two
  attempts attached to that dead server and timed out on `config.webServer`. Killing the
  stale process and clearing `.next` fixed it. Nothing in the diff was involved, and no
  test was changed to make it green.

  **Supervisor review, 2026-09-16 19:22–19:45 UTC.** The scope held: the flag reads an
  exact `"on"` and `flushFunnelEvents` returns `disabled` before touching storage or the
  network, no sync token appears in client code, and no consent kind was invented. Four
  load-bearing guarantees were broken on purpose and each failed — a truthy-coercing flag
  ("expected true to be false", plus the literal-form source scan), `{ ...event }` in
  place of the field-by-field rebuild ("expected [ 'crop', 'email', 'id', 'kind', …(5) ]
  to deeply equal [ 'id', 'kind', 'props', …(3) ]"), dropping the `response.ok` check
  before the cursor advances ("expected 'sent' to be 'rejected'"), and removing the new
  `Array.isArray(payload.funnelEvents)` guard, which reproduces the 500 exactly:
  `TypeError: funnelEvents.map is not a function`.

  The research citation was re-fetched rather than trusted:
  `raw.githubusercontent.com/w3c/beacon/gh-pages/index.html` returns `http=200
  bytes=115132` and both quoted passages are in it verbatim, tags stripped. The Next
  DefinePlugin claim checks out against the installed source —
  `node_modules/next/dist/lib/static-env.js` builds its define key as
  `` `process.env.${key}` `` at lines 49 and 66, so the dynamic form really would be dead
  in a browser.

  One correction: the PR body claimed `tsc --noEmit` **13**, unchanged. It is **16**, on
  this branch and on main alike — the same 16 pre-existing errors, all in test files. The
  count is right that the branch adds none; the number was wrong, and the worker's status
  line carried the same 13 last cycle. Nothing in the code depended on it. Corrected in
  the PR body.

  Also added here: the revenue-upstream ordering now records that item 3 depends on
  item 2, because `share_clicked` and `share_landed` are recorded on different devices
  and no store has ever held both halves.

  Verification on the merged head: vitest 403 in 71 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `npm run smoke` green, `tsc --noEmit` 16.

  **Supervisor review, 2026-09-17 01:22–01:45 UTC.** Reviewed as a security review, since
  this is the first unauthenticated write surface the product has. Every check held.

  The finding I had prepared before the branch landed was the one the route answers
  directly. `/api/sync`'s `originAllowed` returns `true` when
  `SUPABASE_SYNC_ALLOWED_ORIGINS` is unset — defensible behind a token, and it would
  have been decorative here, where an unset env var is the default state of every
  unconfigured deploy. The new guard fails **closed**: same-origin by default with no
  configuration, `FUNNEL_INGEST_ALLOWED_ORIGINS` only widening.

  Three guarantees broken on purpose, each failed: removing the `originAllowed` call
  (4 cases), `ignoreDuplicates` dropped from the upsert options ("expected
  { onConflict: 'id' } to deeply equal { onConflict: 'id', …(1) }"), and the source
  constant set to `ops-local` ("expected 'ops-local' to be 'public-funnel'").

  Four hostile probes of my own, beyond the branch's own table, all clean: a
  `GyeolSyncPayload`-shaped body carrying `cropSamples`, `consentEvents` and `labels`
  alongside valid events stores **only** the events and writes only `funnel_events`
  (no `base64`, no `ai_analysis`, no `golden-p1` anywhere in the write log); a
  200 KB body with no `content-length` header is still 413 on real bytes; a
  prototype-polluting `__proto__` prop and a free-text `note` are both dropped while
  the allowlisted `merchant` survives.

  The Fetch Standard citation was re-fetched, not trusted: `whatwg/fetch` `fetch.bs`
  returns `http=200 bytes=444022` and the append-`Origin` algorithm reads as quoted —
  for a non-GET/HEAD request the header is appended unconditionally, with the value
  possibly the literal `null` under `no-referrer` or an https→http downgrade, which is
  why `new URL("null")` throwing into the catch is the right handling. `next.config.ts`
  does ship `Referrer-Policy: strict-origin-when-cross-origin`, so ARU's own
  same-origin https flush sends its real origin.

  One line added in review: the route trusts `x-forwarded-host` and now says why that
  is sound for its stated threat model rather than by accident. A CSRF attacker is a
  page in a victim's browser, which sets `Origin` itself and cannot be made to send
  `x-forwarded-host`; a caller who can set both is already curl, which this check never
  constrained. Probed: `origin: https://evil.example` with `x-forwarded-host:
  evil.example` is accepted, and is the curl case, not a new one.

  Verification on the merged head: vitest 432 in 73 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `tsc --noEmit` 16 — unchanged from main —
  and `npm run smoke` green including the two new rows,
  `ok GET /api/funnel -> 200` and `ok POST /api/funnel -> 403`.

  `NEXT_PUBLIC_FUNNEL_FLUSH` is set to `on` nowhere in the tree; a repo-wide grep finds
  only the flag's own definition, its test pin, and comments. The PIPA consent basis
  remains Sean's open decision and no consent kind or flow was invented.

  **Supervisor review, 2026-09-17 07:22–07:45 UTC.** Every scoped property held. The two
  sources are never added: `/ops` maps over `aggregate.sources` and the only whole-table
  figure is `tableRows`, labelled as the table rather than as a funnel. `visitor_id` is
  absent from `FUNNEL_AGGREGATE_COLUMNS` and from every response type, so no per-visitor
  timeline is constructible from this read. Auth is `hasValidSyncToken`, checked before
  any database work. All three unconfigured / empty / one-source-only states render a
  sentence rather than a zero, and both source cards render even when one is empty — an
  absent panel would let the present one read as the whole table.

  Three guarantees broken on purpose, each failed: `visitor_id` appended to the select
  columns ("expected 'kind, session_id, ts, visitor_id' not to contain 'visitor_id'"),
  the token gate removed from the aggregate (4 cases, "expected { available: true, …(5) }
  to be undefined"), and `not-configured` collapsed into an `available: true` with empty
  sources ("expected { available: true, …(5) } to deeply equal { available: false, …(1) }").

  Both external citations re-fetched rather than trusted. PostgREST's
  `docs/references/api/pagination_count.rst` returns `http=200 bytes=4518` and carries
  `Range: 0-24` and `Content-Range: 0-24/3573458` exactly as quoted, which is what makes
  the truncation report honest — `count` is the number of rows that matched, not the
  number returned. `@supabase/postgrest-js` is 2.108.2 in this tree, the version the
  section names.

  Also added in review, as its own backlog item: the promotion gate is fed two different
  models' numbers in one call. I verified that independently of PR #69 rather than
  relaying it — the mechanism is above.

  Verification on the merged head: vitest 457 in 75 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `tsc --noEmit` 16 — unchanged from main — and `npm run smoke`
  green. `NEXT_PUBLIC_FUNNEL_FLUSH` is set to `on` nowhere; the branch adds a test that
  fails if it ever is.

  **Supervisor review, 2026-09-17 13:22–13:45 UTC. The worker corrected me, and it is
  right.** My cycle brief gave `tsc --noEmit` as **16** and vitest as **457 in 75
  files**. Recounted on main at `c0f8cea`: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
  is **13**; the 16 is the raw LINE count, and the extra three lines are continuation
  detail on one error (`Property 'autoplay' / 'playsInline' / 'muted' does not exist on
  type 'HTMLElement'`). `Test Files 73 passed (73)`, `Tests 457 passed (457)` — the test
  count was right, the file count was not.

  I have been passing a line count as an error count into every worker brief since cycle
  7, and telling Sean the same number in three reports. It changed nothing in any diff —
  the claim each cycle made was "this branch adds none", and that was true every time —
  but a worker acting on a wrong baseline could have believed it had added three errors
  and gone looking. **The rule this cycle's brief opened with — count, do not recall —
  applied to the person writing the brief, and the worker was the one who applied it.**
  Baselines for the next brief: tsc 13 errors, vitest 457 in 73 files (before this diff),
  `ml/selftest.py` 77, lint 2 warnings.

  On the branch itself, every scoped property held. The numerator is an intersection on
  sessions, so the ratio cannot exceed 1, and the comment states the denominator, the
  ordering caveat and the inflation case outright. The decision NOT to filter by
  `placement` is better argued than the alternative I suggested: props are not in
  `FUNNEL_AGGREGATE_COLUMNS` and `FunnelCountable` has no field for them, so a placement
  filter would either widen cycle 8's deliberate privacy narrowing or make the two /ops
  panels print different numbers under one name. `failurePreventionConversion` is
  untouched — it appears in the diff only inside a new comment.

  Five probes of my own, all as documented: a `/care`-only click with no reco view sits
  in neither half; fifty of them against one reco view leave the ratio at 0 rather than
  at 50; the ratio reads 1 and 0.5 on the obvious fixtures; `failurePreventionConversion`
  still reads 0.5 on its own fixture; and the documented inflation is real — a session
  that viewed `/report` and later clicked from `/care` counts, which the comment says.

  Two guarantees broken on purpose, each failed: the numerator changed to
  `reachedSets.commerce_clicked.size` ("expected 3 to be 1"), and the denominator swapped
  to completed scans (4 cases).

  Verification on the merged head: vitest 464 in 74 files, `ml/selftest.py` 77, lint 2
  pre-existing warnings, `tsc --noEmit` 13 errors — unchanged from main — and
  `npm run smoke` green.

- 2026-09-17 (cycle 7) — Branch `autopilot/2026-09-17-0039`. **`POST /api/funnel`, the
  ingest endpoint** — the item cycle 6 sized and deliberately did not rush — plus the
  research that the origin guard rests on and one defect found on the same path.

  **Baselines on arrival, counted rather than recalled, with `npm ci` run first because
  `node_modules` was absent.** The cycle brief said `tsc --noEmit` is 16. It is **13**,
  the same 13 cycle 4 counted, all pre-existing and all in test files
  (`tests/android-config.test.ts` ×1, `tests/e2e/ios-safari-camera.spec.ts` ×3,
  `tests/product-use.test.ts` ×3, `tests/skin-roi-quality.test.ts` ×6). The other three
  matched the brief: vitest `71 files / 403 tests`, `ml/selftest.py` 77, lint
  `0 errors, 2 warnings` (the two unused parameters in `lib/care.ts`, untouched here).
  After this diff: **72 files / 432 tests**, tsc still **13**, selftest still **77**,
  lint still 2 warnings. Protocol note, said plainly rather than implied: the arrival
  baseline was vitest/tsc/selftest/lint, not `npm run smoke` — smoke was run after the
  change, green, and again with the two route checks this cycle adds to it. The final
  run, verbatim tail, with the documented
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  override and nothing else:

  ```
   Test Files  72 passed (72)
        Tests  432 passed (432)
    44 passed (2.7m)
  Ran 77 tests in 0.013s
  OK
  ok GET /api/sync -> 200
  ok POST /api/sync -> 401
  ok GET /api/funnel -> 200
  ok POST /api/funnel -> 403

  Smoke test passed.
  ```

  The last line of that list is the origin guard working from outside the process: a
  POST with no `Origin` header is refused before the body is read.

  **The route.** `app/api/funnel/route.ts` is the first unauthenticated write surface
  the product has, so it was written as the attacker's list first and made true after.
  32 KiB body cap against `/api/sync`'s 5 MB; its own limiter bucket at 20/60s per
  client key, run **before** the body is read rather than after auth as `/api/sync`
  does, because there is no auth here for it to run after; 100 events per body, refused
  on the count before anything iterates; a same-origin guard that needs no env; and
  server-side re-derivation of the kind and prop-key allowlist for every kind in
  `FUNNEL_ORDER`, checked mechanically so a kind added later is covered without editing
  the test. Rows are marked `metadata.source = "public-funnel"` — a route constant,
  never read from the body, so a caller cannot pass its rows off as an operator sync —
  and written with `ignoreDuplicates`, so the endpoint can only ADD. That last one is
  the one place where reusing `/api/sync`'s plain `onConflict: "id"` upsert would have
  been a real hole: reached through an unauthenticated door it lets anyone who guesses a
  row id rewrite an operator's row.

  **One allowlist, not two.** `FUNNEL_PROP_KEYS` was a client-side courtesy and became
  worthless the moment the endpoint went public. It now lives in `lib/funnel-contract.ts`
  — one copy, imported by both `lib/funnel-flush.ts` (which re-exports rather than
  restates) and the route, and it touches no `window`, no `localStorage`, no
  `process.env`, which is what lets a route handler import it. Two tests hold the
  divergence shut.

  **What the route honestly cannot do, recorded rather than glossed.** `visitor_id` and
  `session_id` are device-generated and forgeable on an unauthenticated endpoint. §8.3
  of `docs/funnel-flush-design.md` says so outright and says what is done instead
  (source marker, `receivedAt` from ARU's clock, insert-only), and
  `supabase/schema.sql` now carries the same warning on the column with a
  `(metadata->>'source', ts)` index so the two populations can be read apart. A
  `public-funnel` row is evidence about a population, not about a visitor.

  **The flush.** `FUNNEL_FLUSH_ENDPOINT` is `/api/funnel` and the body is no longer a
  `GyeolSyncPayload` with four arrays pinned empty — it is
  `{ schemaVersion, clientGeneratedAt, events }`, which has no field for a label, a
  crop, a pilot note or a consent event at all, so swapping in `buildLocalSyncPayload()`
  is now a type error rather than a silently larger payload. Cycle 6's 401 from
  `/api/sync` is still pinned, because it is still true.

  **`NEXT_PUBLIC_FUNNEL_FLUSH` is still unset**, in code and in every config in the
  repository. §5's PIPA question was not reopened, no consent kind was invented, and the
  transport working is not permission to switch it on.

  **research — the origin guard's spec claim, from a primary source.** Refusing a POST
  that carries no `Origin` header only works if a browser always sends one. Checked
  against the WHATWG Fetch Standard's own source (`whatwg/fetch`, `fetch.bs`, fetched
  through `raw.githubusercontent.com`, `http=200 bytes=444022` — `www.w3.org` and MDN
  both still refuse this network), algorithm "append a request `Origin` header":

  ```
  Otherwise, if request's method is neither `GET` nor `HEAD`, then:
    ... Append (`Origin`, serializedOrigin) to request's header list.
  ```

  Unconditional for a POST, same-origin included. The same algorithm has two branches
  that serialize the origin as the literal `null` — a `no-referrer` policy, and the
  `strict-origin` family on an https→http downgrade. That mattered: had ARU shipped
  `Referrer-Policy: no-referrer`, this guard would have 403'd its own flush. It ships
  `strict-origin-when-cross-origin` (`next.config.ts`) and the flush is a same-origin
  https POST, so neither branch fires, and `new URL("null")` throws into the catch
  anyway. Both cases are pinned.

  **bug — the flush cursor could re-POST the same event forever.**
  `markFunnelEventsFlushed` was called with the ids of the **redacted** events, and
  `redactFunnelEvent` truncates an id to 64 characters, so a longer id was acknowledged
  under a prefix `pendingFunnelEvents` never matches. The other half: an event the
  redactor drops outright — a retired kind, a 1970 timestamp — never reached the cursor
  at all, so it was offered, dropped and offered again, and while it was the only thing
  pending the flush returned `empty` and the device's real events behind it never moved
  either. On-device that was a wasted write; against a public endpoint with a 20/min
  budget a device could spend its whole budget re-sending one undeliverable event. Both
  fixed by marking the ids as this device stores them and retiring the undeliverable.

  **ML — nothing this cycle, deliberately.** `ml/selftest.py` is green at 77 and was not
  touched. The ingest route was sized to take most of the cycle and did; inventing a
  small ML change to fill a track would have been worse than saying this.

  **Verification of the new tests.** All 29 new cases were checked by breaking the line
  each exists to protect and watching it fail — 24 mutations, 23 of which failed at
  least one test, with the exact messages in the PR body. The 24th is a finding rather
  than a pass: deleting `if (!origin) return false;` from `originAllowed` failed
  **nothing**, because a null origin reaches `new URL(null)` below and throws into the
  catch. The line is redundant, the tests are held by removing the `originAllowed` call
  instead, and the route now says so in a comment so nobody narrows the catch believing
  the explicit check covers it. Two assertions have no line to delete at all and are
  reported as structural rather than verified: `Object.keys(body)` on the flush body,
  and "only `funnel_events` is ever written" — breaking either means ADDING a field,
  which is the thing they exist to prevent.

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

**Supervisor review, 2026-09-18 01:22–01:50 UTC.** The rule is right and it went
further than I scoped, correctly.

*The confidence table reproduces exactly.* Derived independently before the worker
reported: 3/3 → 0.7804, 2/3 → 0.687067, 1/3 → 0.593733, 0/3 → 0.500400. So does the
conclusion I had reached separately and the item had not — **the 0.58 floor is dead on
capture quality**; even one of three signals passing clears it. The count rule was not
the secondary mechanism the backlog implied, it was the only one.

*The decision contradicted my pre-sizing and the backlog's, and the mechanism holds.*
I expected a signal-specific rule sparing 조명 and 반사. `shine` is
`tzone.specularRatio + max(0, (tzoneL - cheekL) / 255)` (`lib/skin.ts:786`) — verified —
so a specular ratio adds *directly* to the oil index, in one direction, every capture.
Reproduced independently: a T-zone glint on an otherwise clean synthetic face moves oil
from level 0 to level **2**. 반사 is not noise. A rule sparing it would have left the
larger share of the damage publishing silently.

*The vision-API path had the same count rule*, and the branch fixed it. Two paths that
could disagree about one capture now share `retakeRecommendedFor`.

*Broken on purpose, two ways, each failing 5 cases*: reverting to `confidence < 0.58`
alone, and re-keying the gate on `retakeReasons.length >= 2`. The wobble-alone case is
pinned both ways — reason present, retake false.

*Step 8's rotation, its first run, worked.* `comm -23` of both files sorted against a
snapshot of main's pair prints **3** non-blank lines: the two backlog headers rewritten
as `[x]` (both now in "Closed backlog items" at `autopilot-changelog.md:194` and `:220`)
and the "Last updated" date. "Recent cycles" holds 3.

*One gap, filed above rather than fixed here.* The 120-seed table's script is not
committed, so the measurement that chose the rule is the only one in this repository
that cannot be re-run. Every other decision-driving measurement here is re-runnable, and
that is how three stale figures have been caught — including one of mine.

Verification on the merged head: vitest 475 in 76 files, `ml/selftest.py` 77, lint 2
pre-existing warnings, `tsc --noEmit` 13 errors, `npm run smoke` green.

**Supervisor review, 2026-09-18 07:22–07:50 UTC.** The defect was real and the fix is
better than what I scoped.

*I swept it myself before the worker reported, and again after.* Synthetic band frame,
T-zone held at a fixed percentage above the cheek, cheek luminance swept:

```
                     before                       after
pct=1.08  cheekL  50.4  shine 0.0164  oil 0   |  0.0456  oil 0
          cheekL 142.7  shine 0.0462  oil 0   |  0.0453  oil 0
          cheekL 167.6  shine 0.0513  oil 1   |  0.0429  oil 0
pct=1.20  cheekL  50.4  shine 0.0388  oil 0   |  0.1077  oil 1
          cheekL  66.8  shine 0.0513  oil 1   |  0.1075  oil 1
          cheekL 167.6  shine 0.1308  oil 1   |  0.1093  oil 1
```

Before, the index ran 3.6× across the exposure range at a constant relative T-zone
excess and the **published** oil level flipped on exposure alone — at cheekL 167.6 for
an 8% excess, at 66.8 for a 20% one. After, the index holds within about 6% and the
level is constant across the whole range in both cases. A 20%-excess face now reads
level 1 at every exposure instead of 0 when dark and 1 when bright.

*The `140/255` rescale is the part I would have got wrong.* I expected the cuts to move
instead. They cannot: the cuts are compared against `specularRatio + gap` and
`specularRatio` is not rescaled, so scaling the cuts by 255/140 would drop a level on
every capture whose specular ratio lands in [0.05, 0.0911) or [0.16, 0.2914). The
branch says so and pins it. Broken on purpose two ways, each failing a *different*
guarantee: reverting to `/ 255` fails exposure invariance ("expected 2.3937556835404785
to be less than 1.1"), and dropping the rescale fails the reference-exposure guarantee
("0.4885354863026262 vs 0.4020067421828359"). Two properties, two pins.

*The second item found that cycle 11's table was partly wrong, and said so.* The
committed sweep (`ARU_PRINT_RETAKE_SWEEP=1 npx vitest run tests/retake-signal-rule.test.ts`)
reproduces the corrected table exactly, and it prints the failed-signal SET per row —
which is how it caught that the blown-out fixtures also trip 반사, so cycle 11's "lone
failure" framing was not strictly true for that row. Corrected in place with both
constructions named, not quietly overwritten. The rule itself still stands: all three
signals still cost a reading on at least a sixth of the seeds.

*`ml/skin_indices.py` correctly untouched* — its `shine_ratio` is
`tzone_specular / cheek_specular` and never carried the `/255` term, so there was
nothing to keep in step.

`fallbackVersion` → `roi-calibrated-2026-09-18` in both `lib/skin.ts` and the manifest;
`status` and `promotionGate` untouched. Rotation lost nothing: `comm -23` against a
snapshot of main's pair prints 12 lines, all of them the backlog item I filed last cycle,
now closed at `autopilot-changelog.md:135`. "Recent cycles" holds 3.

Verification on the merged head: vitest 482 in 77 files, `ml/selftest.py` 77, lint 2
pre-existing warnings, `tsc --noEmit` 13 errors, `npm run smoke` green.

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

- 2026-09-18 (cycle 14) — Branch `autopilot/2026-09-18-1839`. **The silent window
  cycle 13 measured is closed, with a fourth capture signal whose cut was derived from a
  sweep — and `confidenceLabel`, eight cycles on the backlog, is decided.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **491 passed in 78 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The fourth signal.** `RegionStats` gains `clippedRatio` — the share of the UNTRIMMED
  patch with at least one channel at 255, untrimmed for the same reason `specularRatio`
  is, since the trim drops the brightest decile and that is exactly where clipping lives.
  `SkinRawFeatures.cheekClipped` carries the cheek's, and `buildSignals` gains **노출
  여유**, failing at `CHEEK_CLIP_LIMIT = 0.15`. It counts all three channels, not red:
  skin is usually warm so red pins first, but the signal is about sensor headroom rather
  than about skin, and a cool cast puts a different channel at the ceiling.

  **The cut is derived, and the sweep that derived it is committed.** 84 faces — R/L
  1.10..1.30 at fixed cheek luminance, texture amplitude 0.10..0.26, three T-zone scales
  — swept across the whole 조명 band, every capture the previous three signals passed
  bucketed by its clipped fraction. The pass/fail criterion is not taste: it is the
  invariance this repository already measured, cov within 1.02x and relRedness within
  1.08x (`tests/axis-exposure-scale.test.ts`). Below that, clipping is indistinguishable
  from the 8-bit rounding the indices already carry.

  ```
  clipped   n     max|dCov|  max|dRed|  published level flips
  11.11%    20      1.89%      4.92%     0
  12.35%    21      1.23%      3.43%     0
  13.58%     5      1.40%      3.48%     0
  14.81%    52      1.91%      6.19%     0   <- last bucket inside both tolerances
  16.05%    35      2.16%      5.72%     0   <- cov leaves its 2% band
  19.75%    13      2.71%      6.84%     0
  20.99%    20      2.45%      9.48%     1   <- first published level flip
  22.22%    82      3.59%     14.29%    30
  ```

  0.15 is the only cut that passes every capture still inside the measured invariance and
  refuses every capture in which a published level has ever moved. `ARU_PRINT_CLIP_SWEEP=1
  npx vitest run tests/cheek-clipping-signal.test.ts` reprints the table above verbatim.

  **What it costs, which is the brief's second question, measured on the same sweep.** Of
  the 10,273 captures the previous three signals passed, 645 (6.28%) now ask for a
  retake — and not evenly:

  ```
  cheekL <= 140      0/5964   0.00%
  cheekL 140..170   33/2520   1.31%
  cheekL 170..190  337/1367  24.65%
  cheekL 190..212  275/422   65.17%
  ```

  **A correctly-exposed capture does not trip it**, which is the answer the brief asked
  for: if it fired on one, the threshold would be wrong rather than the rule. It catches
  379 of the 380 silent published-level flips. The one miss is at cheekL 74.9 with NO
  clipping — relRedness 0.01276 quantising to 0.01197 across the 0.012 cut — which is
  cycle 13's dark-end 8-bit scatter and not something a clipping signal can see. Said
  rather than hidden.

  Cycle 13's two cases that pinned the defect are rewritten rather than deleted: they now
  evaluate the three old signals AND the shipped four separately, so the R/L window is
  still located at 1.17..1.20 (the measurement is unchanged and the golden set still owns
  the unknown) while a new assertion holds that no exposure all four signals accept moves
  a published level at any R/L in the sweep. Closed by refusing those captures, not by
  reading them differently, and a case asserts exactly that.

  **`confidenceLabel`: the axis is decided, and it is READING MARGIN.** The argument the
  item was missing is one the retake rule supplies. `shouldApplyScan` requires
  `!retakeRecommended`, and since cycle 11 `retakeRecommendedFor` fails on ANY failed
  signal — so on the only path where a reading is used, `signalScore` is exactly 1 by
  construction and its 0.28 is a constant carrying no information. The fourth signal
  widens what must pass and leaves that constant a constant. Two terms are left, and the
  0.78 gate sat BELOW the reachable floor of 0.7804:

  ```
  meanAgreement   range             share reading 높음 at 0.78   at 0.8614
  1.0000          0.7804 .. 0.9424          100.0%                 50.0%
  0.8889          0.7717 .. 0.9319           94.8%                 44.0%
  0.6667          0.7544 .. 0.9110           83.6%                 31.7%
  0.3333          0.7284 .. 0.8796           65.9%                 12.0%
  ```

  At full frame agreement the label was constant. Frame wobble was the only thing that
  could ever move it — the backlog's finding, now stated as a share of the range rather
  than as two floors.

  So the label reports reading margin, because that is the only one of the three axes the
  user is told nowhere else: capture quality is already rendered signal-by-signal in the
  측정 환경 checklist (four rows now) and routes a failure to the retake copy, and frame
  wobble already has its own `retakeReasons` line. The gate moves 0.78 -> **0.8614**, in
  BOTH copies. It is derived, not chosen: `distanceConfidence` maps a reading on a cut
  point to 0.695 and one a half-span away to 0.92, its midpoint 0.8075 is what it returns
  a quarter-span from the nearest cut, and `0.8075 * 0.72 + 0.28 = 0.8614`. Wobble is
  demoted rather than removed — one attribute disagreeing on one of three frames now
  decides the label only inside a 0.00968-wide band, 5.97% of the 0.162-wide range. The
  0.58 gate does NOT move; three other call sites compare against it.

  **One collision this exposes, pinned rather than left to be rediscovered.**
  `mergeVisionAnalysis` caps its confidence at `Math.min(0.86, ...)`, which is now 0.0014
  BELOW the gate — so a vision-model confidence cannot reach 높음 on its own strength,
  only through the `Math.max(base.confidence, ...)` that carries the ROI reading's
  margin. Arguably what the cap was for, but the two constants were chosen independently
  and are close enough that moving either alone moves a whole path's label. A case asserts
  the cap value and that it sits below the gate, so they cannot drift apart unnoticed.

  **Every new case broken at the SOURCE line it protects.** 11 breaks, each reverted from
  a file copy (an earlier attempt reverted with `git checkout`, which silently discarded
  the uncommitted work and voided its own results — redone from backups):

  ```
  CHEEK_CLIP_LIMIT 0.15 -> 0.35   6 fail; AssertionError: expected [] to deeply equal [ '노출 여유' ]
                                  AssertionError: expected [ 1.2, 1.223 ] to deeply equal []
  CHEEK_CLIP_LIMIT 0.15 -> 0.02   1 fail; AssertionError: the highest clipped fraction still
                                  accepted: 0.00%: expected 0 to be greater than or equal to
                                  0.14814814814814814
  clippedRatio over the trimmed    2 fail; AssertionError: cheekL 180: expected 0.15418502202643172
    set instead of collected       to be close to 0.12345679012345678
  count red channel only           1 fail; AssertionError: cheekL 188: expected +0 to be close to
                                   0.012345679012345678
  signal `ok: true`                6 fail; same two messages as the 0.35 break
  gate 0.8614 -> 0.78 both copies  2 fail; AssertionError: expected 0.78 to be close to 0.8614
  gate drifts in one copy only     3 fail; AssertionError: 125 of 2014 values disagree
  vision cap 0.86 -> 0.95          1 fail; AssertionError: expected 0.95 to be 0.86
  weights 0.72/0.28 -> 0.70/0.30   1 fail; AssertionError: expected '/**\n * Visible-signal skin
                                   analysis....' to contain 'const confidence = clamp01((attrConfi...'
  retakeRecommendedFor stops       1 fail; AssertionError: expected false to be true
    reading signals
  en translation deleted           1 fail; AssertionError: "볼이 너무 밝아 색이 날아갔어요" missing
                                   from the en dictionary
  ```

  The red-channel break is the one worth recording: it passed all 9 cases on the first
  attempt, because every face in the family is warm and red always clips first. That is a
  real uncovered branch, so a green-dominant fixture was added and the break then failed.
  Exactly what guardrail "break it on purpose" exists to catch.

  **What did NOT move, checked rather than assumed.** `ATTR_THRESHOLDS`,
  `fallbackVersion` and `inputSchemaVersion` are untouched: no published index or its
  cut points changed, and `cheekClipped` is a capture-health number, not a calibratable
  feature — it is absent from `FEATURE_KEY`, `NEW_FEATURE_KEYS`, `LabeledSample.features`
  and the `/eval` export, so no feature generation moved. Guardrail 8 untouched —
  `status` and `promotionGate` byte-identical. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched.
  The 노출 여유 label and both of its details are translated in en/ja/zh/ar, with a case
  holding it (the three older signals' strings are translated because somebody remembered;
  nothing checked, and that gap is noted below).

  **Second item, and it came out of the main one.** Writing the translations for 노출
  여유 showed that nothing checks a capture signal's strings at all:
  `tests/i18n-coverage.test.ts` covers the report trust card's runtime-composed strings
  and passes `signals: []`, so the six strings the three original signals carry are in
  en/ja/zh/ar because somebody remembered. An untranslated one shows raw Korean in the
  측정 환경 checklist to every non-Korean user. The rule now lives in that file rather
  than in the file for one signal: six fixtures drive `analyzeSkin` to every state of all
  four signals, assert all four labels were seen in BOTH states and that the set is
  exactly the 13 distinct strings those states produce, then `expectCovered` each.
  Driven through `analyzeSkin` rather than listed by hand, so a signal added without a
  fixture fails the count instead of escaping coverage.
  `tests/retake-signal-rule.test.ts` also gains the lone-failure fixture the new signal
  was missing: a cheek with red pinned at 255 and luminance 180, inside the 조명 band,
  so 노출 여유 is the only signal it trips — the exact case cycle 13 showed the other
  three cannot see.

  **Not attempted, deliberately.** No third item and no unrelated UI change. This branch
  opens the retake rule and moves a user-visible confidence label, which is enough for
  one diff to be reviewable and revertible on its own.

  Verification on this branch: vitest **508 passed in 79 files** (from 491 in 78),
  `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .` **2 warnings**
  both in `lib/care.ts` unchanged, `python3 ml/selftest.py` **Ran 77 tests ... OK**
  unchanged, `npm run smoke` green.


  **Supervisor, same day — the cut reproduces, and the one thing it does not measure is
  now measured.** Every number in the `CHEEK_CLIP_LIMIT` comment re-ran from the
  committed sweep (`ARU_PRINT_CLIP_SWEEP=1`): the 14.81% bucket is the last inside both
  tolerances, 16.05% is the first outside, the first published flip is at 20.99%, and
  the cost table (0.00% refused at cheekL <= 140, 1.31% / 24.65% / 65.17% above it,
  379 of 380 silent flips caught) is exact. Four source lines were broken to check the
  new cases carry weight: computing `clippedRatio` over the TRIMMED set fails 3 of 9,
  deleting the ceiling counter fails 5, moving the cut to 0.30 fails 5, and reverting
  `confidenceLabel` to 0.78 in `lib/skin.ts` alone fails the duplication guard with
  `165 of 2014 values disagree`. The 0.8614 derivation checks out arithmetically:
  `distanceConfidence` is `0.92 - distance * 0.45`, a quarter-span reading gives 0.8075,
  and `0.8075 * 0.72 + 0.28 = 0.8614`.

  What the cycle did not measure is what the signal costs a user whose reading was fine.
  The supervisor pre-registered TWO hypotheses, both predicting a large effect: rough
  skin reaches any clipped fraction sooner, so the cost should land on high-texture
  faces; warm skin clips its red channel sooner, so it should land on warm ones.
  **Neither is large.** On this file's own face family, the exposure band refused before
  anything is actually wrong runs a mean of 5.6 counts of cheekL at R/L 1.223 and 7.3 at
  1.30 — a factor of 1.30 — and texture from 0.10 to 0.42 at fixed R/L fits inside 10
  counts. No face is refused more than 11 counts early, all of them far above the 140 a
  correct capture sits at. Pinned as a case rather than a note, because it is the number
  that must grow before the signal becomes tone-unfair; breaking it by moving the cut to
  0.08 fails it.

  One correction the supervisor owes in public: an earlier scratch fixture put that
  tone factor near 2.5, and it does not reproduce. It built the T-zone as a flat scale
  of the cheek rather than through the per-channel `TZ_RATIO` the derivation uses, which
  moves where 반사 fires and so moves the far edge of the window. The 1.30 measured on
  the construction the cut was derived over is the repository's number; the 2.5 is not.

  Baselines after landing: vitest **508 in 79 files**, `tsc` 13, eslint 2 warnings,
  `ml/selftest.py` 77, `npm run smoke` passed. Rotation verified by `comm -23` against a
  snapshot of main's pair taken before review: the only two lines that moved are the two
  backlog items this cycle closed, both present in the changelog with `[x]` and their
  bodies intact.
- 2026-09-19 (cycle 15) — Branch `autopilot/2026-09-19-0039`. **A scan costs 6.6-11.6ms
  a frame on this box, `detectBlemishes` is 79-87% of it, and cycle 14's per-pixel branch
  is 58µs of it. The brief's premise about where that branch runs was wrong, and the
  measurement is what showed it.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **509 passed in 79 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The correction first, because it changes what the question means.** The brief put
  cycle 14's clipped-channel branch "in a loop that runs per region, per frame, on a
  650ms MediaPipe cadence". It does not. `sampleRegion` is reached only from
  `extractRawFeatures`, and the only non-test callers of that are `analyzeSkin` (`/eval`)
  and `analyzeSkinBurst` (**once per scan**, over **at most three** burst frames —
  `for (let i = 1; i < 3; i += 1)`). The 650ms tick runs `evaluateCapturedQuality` ->
  `evaluateSkinRoiQuality` in `app/scan/skin-roi-quality.ts`, which takes only the
  `SAMPLING_LANDMARKS` constant from `lib/skin.ts`. So the branch runs 6 regions x 3
  frames per scan, not per preview tick, and the budget it is measured against is the
  scan's, not the tick's. Pinned as a case so the next cycle does not re-derive it wrong.

  **The second structural fact, counted rather than timed: `sampleRegion` does not scale
  with frame size.** It reads a 9x9 patch around each landmark in six lists — 56 patches,
  81 pixels, **4,536 pixels per frame**, identical at 400x480 and at 1440x1920. Only
  `detectBlemishes` reads pixels in proportion to the face, and even it walks a grid of a
  fixed ~90 cells across the face width. Four runs of the committed benchmark, medians of
  7 repeats each, ranges spanning all four runs:

  ```
  frame        analyzeSkin   burst(3f)   6xsampleRegion  frameGains  detectBlemishes
  400x480      6.60-6.86ms   19.7-20.4   1000-1025us     22us        5.21-5.34ms
  720x960      8.03-8.35ms   24.3-24.7   1007-1015us     20us        6.81-6.86ms
  1080x1440    9.53-10.02ms  28.7-29.0   1003-1020us     20us        8.12-8.27ms
  1440x1920   11.39-11.63ms  34.4-35.3    978-995us      20us        9.92-10.17ms
  ```

  The face box grows **14.4x** down that table; `sampleRegion` moves **4.8%** and
  `detectBlemishes` **1.9x**. Over the three rows sharing an 18,291-cell grid,
  `detectBlemishes` fits **5.8ms fixed + 6.9ns per face-box pixel** — so at 720x960 the
  whole pixel pass is about 1.0ms of 6.8 and the rest is per-cell work at ~315ns a cell.

  **Cycle 14's branch, isolated against a build of `lib/skin.ts` with exactly that line
  removed** — the shipped function, not a copy, and the sweep throws rather than
  measuring nothing if the line is reworded. Sixteen measurements, four runs x four frame
  sizes, **all positive**: **44.1-72.5µs a frame, median 58.4µs**, i.e. 9.7-16.0ns a
  pixel and **~175µs a scan, 0.7% of `analyzeSkinBurst` at 720x960**, constant in frame
  size. Read as an **upper bound**: deleting the line also deletes the `clipped`
  accumulator and shrinks the body, which moves V8's inlining, and 12.9ns for three
  integer comparisons is well above what the comparisons alone can cost. Stated rather
  than hidden, and so is this — an EARLIER arrangement of the same benchmark could not
  resolve it at all (deltas ±15µs, sign changing between frame sizes). A difference this
  small is sensitive to how the benchmark is laid out; the number to trust is the one the
  committed file reproduces, which is why it is committed.

  **What the measurement found instead, and the one change taken.** The non-skin
  exclusion test ran all ~42 `NON_SKIN` points against each of ~18,000 grid cells.
  `cy` depends only on the row, so a point further than `excludeR` in y alone can never
  be within `excludeR`, and the predicate is a plain OR over the points: dropping those
  once per row is **exactly the same test**. Measured by rebuilding `lib/skin.ts` with
  the loop it replaced, after asserting both builds return the same count AND the same
  area:

  ```
  frame        row-filtered      point-by-point    saved/frame   saved/scan (3f)
  400x480      5.18-5.43ms       7.47-8.43ms       2.19-3.00ms   6.6-9.0ms
  720x960      6.61-6.83ms       8.93-9.75ms       2.33-2.92ms   7.0-8.8ms
  1080x1440    7.99-8.22ms       9.84-10.64ms      1.86-2.41ms   5.6-7.2ms
  1440x1920    9.99-10.21ms     11.01-11.83ms      0.99-1.62ms   3.0-4.9ms
  ```

  **No published value moves**, which is the condition on a performance change here.
  `fallbackVersion`, `ATTR_THRESHOLDS`, `inputSchemaVersion` and the manifest are all
  untouched; guardrail 8's `status` and `promotionGate` are byte-identical. Two guards,
  both default cases: `blemishCount`/`blemishDensity` pinned to the values the
  PRE-change build produced (measured on that build, not assumed) on a fixture whose
  discs sit inside the nostril group's exclusion band in y, and the two predicates
  re-derived over the real grid at five radii and asserted to mark the same cells.
  Reverting the row filter leaves the count pin GREEN — that is the proof — and fails
  only the source pin.

  **The bigger hot spot is filed, not taken.** `rgbToLab`, once per valid cell, is
  **3.91-6.20ms — 61-75% of `detectBlemishes` and 53-59% of a whole scan**. The obvious
  win is unavailable: its inputs are `Math.min(255, channel * gain)`, floats not
  integers, so a 256-entry transfer-curve table is an approximation and an approximation
  moves `blemishCount`. The other win — `detectBlemishes` reads only `lab.a`, so `fz`
  and the `z` dot product are dead — needs a second entry point beside a function
  `ml/ita.py` already mirrors, and a near-duplicate of a function with a cross-language
  twin is exactly how `shine_ratio` and `shine` became two formulas under one name.
  Backlog item, not a quiet third copy.

  **The fixture had to be rebuilt before any of this was a measurement.** Every existing
  skin fixture in the repository collapses all thirteen T-zone landmarks onto ONE point,
  so `sampleRegion` reads the same 81 pixels thirteen times out of L1; and with the
  landmarks stacked, `skinRoiRegionsFromLandmarks` produces a degenerate ROI, so the
  first run of section D timed an early return and printed **0.000ms**. Both are fixed —
  56 patches at 56 places, non-skin groups where they belong — and the sweep now throws
  if the ROI bails out rather than publishing a zero. For the record, the 650ms tick's
  real cost: **0.88ms (0.14% of the budget) at 400x480 rising to 12.8ms (1.97%) at
  1440x1920**, scaling with pixels the way `detectBlemishes` does not.

  **Nothing that runs by default asserts a duration.** A timing threshold fails on a
  loaded box while nothing in the product is broken. The seven default cases count
  pixels, pin source lines and pin values, and run in 1.6s; every timing is behind
  `ARU_PRINT_SCAN_COST`, the shape `ARU_PRINT_SCALE_SWEEP` / `ARU_PRINT_SHINE_SWEEP` /
  `ARU_PRINT_CLIP_SWEEP` already set.

  **Second item: `funnelDropoff`'s anchor, which did not need the wait it was parked
  on.** The chart is an intersection from stage 0, so anchoring on `scan_opened` alone
  zeroes every log recorded before that kind existed — which is why the item said
  "revisit once logs in hand all contain it". The anchor is now `scan_opened` UNION
  `scan_started`: since `scan_opened` fires on /scan entry and `scan_started` at the
  shutter, the second implies the first in any modern log and the union IS the
  `scan_opened` set, so the camera loss appears as the drop into 스캔 시작; a legacy
  session enters at its own 스캔 시작 and reads a 0% camera drop, which is "not measured
  here" rather than "nothing happened". The cost is pinned as a case rather than left to
  be found: a log MIXING the generations understates the drop, 50% becoming 33% on the
  three-session fixture. Three existing cases pinned the deferral and were rewritten to
  pin the new property — a decision changed deliberately, not a guard weakened.

  **Every new case broken at the SOURCE line it protects**, eight breaks, each reverted
  from a file copy:

  ```
  sampleRegion radius 4 -> 5        1 fail; AssertionError: expected [ 1573, 1694, 968, 847,
                                    847, 847 ] to deeply equal [ 1053, 1134, 648, 567, 567, 567 ]
  clipped-channel line deleted      1 fail; expected '/**\n * Visible-signal skin analysis.…'
                                    to contain '        if (r >= 255 || g >= 255 || b…'
  burst 3 frames -> 4               1 fail; expected '"use client";\n\nimport { useCallback…'
                                    to contain 'for (let i = 1; i < 3; i += 1)'
  row filter bound x0.25            2 fail; AssertionError: 400x480 blemishDensity: expected
                                    3.8926712054465358 to be 4.122487064212401
  row filter fully reverted         1 fail (the SOURCE pin only); the blemishCount pin stays
                                    green, which is the equivalence proof
  funnel anchor loses the union     5 fail; AssertionError: expected +0 to be 1 — the exact
                                    harm the backlog item was parked on
  scan_opened stage removed         5 fail; expected [ 'scan_started', …(4) ] to deeply equal
                                    [ 'scan_opened', 'scan_started', …(4) ]
  stage 0 reads scan_opened         5 fail; AssertionError: expected 0.5 to be close to
    instead of the anchor           0.3333333333333333
  ```

  Two of the seven new benchmark cases are NOT source guards and are not claimed as
  such: the grid-mask equivalence case re-derives both predicates in the test, so it
  checks the reasoning rather than the shipped line (the `blemishCount` pin is what
  guards that), and the read-twice case is a harness sanity check.

  **Not attempted, deliberately.** No third item. This branch changes the hottest
  function in the app and adds a benchmark and a doc; a fourth unrelated edit would make
  the perf claim harder to review and harder to revert. `NEXT_PUBLIC_FUNNEL_FLUSH`
  untouched. No consent kind or flow invented. `status` and `promotionGate` byte-identical.


  **Supervisor, same day — reviewed, and two of the reviewer's own expectations were
  the things that did not survive.** The equivalence proof was checked the way it has
  to be: `lib/skin.ts` was replaced with main's pre-change version (exports added, no
  logic touched, `tsc` still 13) and the branch's pinned `blemishCount` /
  `blemishDensity` values passed against it at all four frame sizes — so those pins are
  genuinely the before-values, and the optimised build matching them is proof the row
  filter is behaviour-preserving end to end. Breaking the bound (`excludeRSq / 4`) fails
  the pin with `400x480 blemishDensity: expected 3.8926712054465358 to be
  4.122487064212401`; removing the filter entirely while keeping it correct leaves the
  pin green and fails only the source pin, which is exactly the right shape. Suite
  timing over four consecutive runs on the branch: 11.02 / 10.27 / 9.89 / 9.97 s against
  main's 12.59 / 12.66 / 15.58 s — faster than main and not flaky, and no timing
  assertion runs by default.

  The saving reproduces on an independent fixture built to be UNFAVOURABLE to it
  (landmarks around an ellipse, so the non-skin points do not cluster in y): 1.95 ms and
  1.94 ms saved at 400x480 and 720x960, 35% and 29% off `detectBlemishes`. Below the
  table's range, as an adversarial geometry should be, and recorded in
  `docs/scan-cost-measurement.md` as the floor.

  **Two supervisor expectations were wrong and both are worth recording.** First, a
  pre-registered claim that `analyzeSkin` is flat in frame size at ~1.5 ms — measured on
  a fixture whose landmarks all sat on three points, so `faceW` was 0 and
  `detectBlemishes` returned early at its `faceW < 20` guard without running at all. The
  cheap phases are flat; the expensive one is not, and the reviewer's fixture had
  excluded it. Second, a pre-registered prediction that cycle 14's clipped-channel
  branch would be below the noise floor and that any specific number for it should be
  rejected. The cycle measured it properly — isolating `sampleRegion` rather than the
  whole call, sixteen measurements all positive, median 58.4 µs a frame — and then
  called it an upper bound because the ablation also changes V8's inlining. That is a
  better design than the reviewer's and a better piece of self-criticism than the
  reviewer asked for.

- 2026-09-19 (cycle 16) — Branch `autopilot/2026-09-19-0639`. **The two `shine`
  formulas are one formula. The app's won, on five independent grounds, and the thing
  that let them drift at all is closed with a value contract rather than another name
  check.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **518 passed in 80 files**, `python3 ml/selftest.py`
  **Ran 77 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **The decision, measured on faces, not argued.** `tests/shine-formula-decision.test.ts`
  is committed and re-runnable (`ARU_PRINT_SHINE_DECISION=1`); both tables are in
  `docs/shine-formula-decision.md`. Five findings, each of which settles it alone:

  1. **The rejected form had no second input.** `cheek_specular` is not a field of
     `SkinRawFeatures` and never has been — `tzoneSpecular` is exported and there is no
     cheek counterpart. It could not be computed from an ARU export at all; the
     measurement had to call `sampleRegion` directly to obtain it.
  2. **Nothing ever called it.** `run_pipeline.py`, `calibrate.py` and
     `prepare_crop_dataset.py` all read the app's `shine` column straight out of the
     export; the only caller of `shine_ratio()` was `ml/selftest.py`.
  3. **Degenerate on a matte cheek.** A correctly-exposed matte cheek has not "few"
     pixels above the 218 cut but exactly **zero**, so `max(cheek_specular, 1e-6)` is the
     epsilon and the reading is `tzoneSpecular x 1e6`: **24,691** where the app reads
     **0.0674**. One cheek pixel in 81 crossing the cut moves it by
     `(1 / 1e-6) / 81 = 12,345.7`, to 2.0. The app's index does not move at all.
  4. **Wrong sign.** Holding the T-zone and adding oil to the cheek: 24,691 -> 2.0 ->
     1.0 -> 0.4. An all-over-oily face reads matte.
  5. **Blind to the brightness gap**, which is most of the oil signal on skin that is
     not actively glinting. Three faces with no glint and T-zone/cheek contrast
     1.00 / 1.08 / 1.20: the app reads 0.0000 / 0.0427 / 0.1103 and publishes two
     different levels; the rejected form returns **exactly 0 for all three**. Over the
     whole 60-row sweep it publishes only levels 0 and 2 — its middle band needs the
     cheek to be 6 to 20 times oilier than the T-zone — while the app uses all three.

  **And the one property it WAS asserted to have is false on a frame.** `ml/selftest.py`
  checked `shine_ratio(0.30, 0.10) == shine_ratio(0.30x1.7, 0.10x1.7)`: true of two
  numbers that both scale, and a specular ratio does not scale — it is the share of a
  patch above a *fixed* cut. One face, ramped highlights so the specular fraction
  responds to exposure the way a real capture does:

  ```
  cheekL   tzSpec    ckSpec     app shine     rejected  signals failed
    92.0  0.000000  0.000000    0.094300     0.0000e+0  -
   115.0  0.000000  0.000000    0.094204     0.0000e+0  -
   138.0  0.000000  0.000000    0.094317     0.0000e+0  -
   161.0  0.049383  0.000000    0.143483     4.9383e+4  -
   184.0  0.444444  0.000000    0.528755     4.4444e+5  반사
   206.0  0.740741  0.259259    0.809682     2.8571e+0  반사,노출 여유
   223.7  0.987654  0.654321    1.040119     1.5094e+0  조명,반사,노출 여유
  ```

  Across the four captures **every signal accepts** — nothing asks for a retake — the
  rejected form runs **0 -> 49,383**. The app's index holds **within 0.12% across a 1.5x
  exposure range** and then moves at 161 because the T-zone genuinely started to glint.

  **So `ml/skin_indices.py` moved to the app's formula** —
  `shine_ratio(tzone_specular, tzone_luminance, cheek_luminance)`, with
  `SHINE_REFERENCE_CHEEK_L = 140.0` mirroring `lib/skin.ts` — **and `ml/selftest.py`'s
  invariance case moved with it and narrowed on the way**: the gap term is Weber
  contrast and cancels a gain applied to both luminances exactly, at three gains; the
  specular term is passed through rather than asserted invariant, because the table
  above is what happens when you assert that it is.

  **No published value moved.** `lib/skin.ts`'s expression was extracted into an
  exported `shineIndex(tzoneSpecular, tzoneL, cheekL)` **byte-for-byte unchanged**, so
  there is one formula for both languages to agree with; the absolute-value pins in
  `tests/shine-exposure-scale.test.ts`, `tests/axis-exposure-scale.test.ts` and
  `tests/skin-index-contract.test.ts` are what prove it. `ATTR_THRESHOLDS`,
  `fallbackVersion`, `inputSchemaVersion` and the manifest are untouched; guardrail 8's
  `status` and `promotionGate` are byte-identical. The Python function was never on a
  path that produced a published value — finding 2 is what makes that checkable rather
  than asserted. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented.

  **The contract that compares VALUES.** `tests/skin-index-contract.test.ts` pins NAMES
  and stayed green from 2026-09-14, when `ml/skin_indices.py` was added, to 2026-09-19,
  while the values diverged — five days, and only because a cycle read both files side
  by side, not because anything checked. Names were never what could drift. Python and TypeScript cannot call each other here — vitest in node,
  `unittest` in `python3`, no bridge and no network — so the cheapest honest check is a
  committed table: **`ml/index-parity.json`**, asserted by `tests/index-parity.test.ts`
  AND by `ml/selftest.py`, neither able to move alone. Three things make it a contract
  rather than a snapshot: the expected values are literals compared **exactly** (`+`,
  `-`, `*`, `/` and `sqrt` on doubles are correctly rounded, so a matching
  implementation matches bit for bit — not `toBeCloseTo`); **16 of the 22 shine rows are
  real readings** carrying the recipe of the frame that produced them, and the
  TypeScript side rebuilds each frame and checks the whole path through `analyzeSkin`,
  so moving which patch `tzoneSpecular` is measured over cannot leave them green; and
  six rows are edge branches a face family cannot reach.

  **Second item, and it came out of checking the first properly: the registry is
  declaration-only, and one more entry in it is wrong.** No pipeline script calls ANY of
  the seven index functions — so each is a claim about what an index IS, and only a
  value contract can catch a false claim. `tone_evenness` has claimed in its docstring
  since 2026-09-14 to be "the same formula as `relativeSpread` in `lib/skin.ts`", which
  is exactly the kind of claim that turned out false for `shine_ratio` and was equally
  untested. **It is true** — both are `sqrt(variance) / abs(mean)` with the same two
  guards, differing only by a non-numeric filter Python needs and TypeScript's types
  make unnecessary. So it is pinned rather than fixed: a second group in
  `ml/index-parity.json`, 10 rows, `relativeSpread` exported for the test. A negative
  result recorded as one. It is pinned **less deeply** and that is stated rather than
  implied: its inputs are the four region L* values, which `SkinRawFeatures` does not
  export, so the rows pin that the two implementations agree on the same inputs and do
  not pin what reaches them. Adding a field so a test could go deeper is adding a field
  for the wrong reason.

  **What is NOT fixed, and is now dated rather than rediscovered.** `relative_redness`
  is the same defect as `shine_ratio`: `FEATURE_KEY` declares it to be `relRedness`,
  Python returns an a* difference and the app returns a difference of red chromaticities
  — different colour space, different scale, one declared field. Cycle 13 recorded
  "nothing to keep in step" about this pair; right about `cov` (no Python index, so no
  declaration to be wrong), wrong about this one. Not fixed here because deciding which
  is right is its own measurement and `shine` is the worked example of what picking a
  side without one costs. Three backlog items filed: this, the five still-unpinned
  indices, and `rgbToLab` — which cycle 15 called a backlog item inside its cycle entry
  and never actually added to the backlog, so it would have rotated out of this file and
  been lost.

  **Does settling this change the `rgbToLab` decision?** It changes what it looks like
  and does not settle it. Cycle 15 declined the largest remaining win in a scan partly
  because a second near-duplicate of a function with a cross-language twin is "exactly
  how `shine_ratio` and `shine` became two formulas under one name". That named the
  right risk and the wrong remedy: what let the split survive was that nothing compared
  values, and `ml/index-parity.json` shows that costs one group and a test case. Two
  things it does not remove — a fast path returning only `a` is a PARTIAL duplicate, so
  the table must say which outputs it does not compute; and `rgbToLab` involves `pow`
  and a matrix, where exact cross-language equality is **not** guaranteed the way it is
  for four arithmetic operations, so a tolerance would have to be chosen and justified.
  Smaller than it was, still not a one-liner. Not taken, on purpose.

  **One verification hazard found by tripping over it, and closed.** Breaking a Python
  source line and re-running `ml/selftest.py` can report the PREVIOUS edit's result:
  Python invalidates bytecode on (mtime, size) at one-second granularity, and
  `SHINE_REFERENCE_CHEEK_L = 140.0` -> `139.0` -> restored is two same-size edits inside
  one second. A restored file kept failing with `139.0 != 140.0` until `ml/__pycache__`
  was deleted by hand, which means two of this cycle's break results were wrong when
  first read and were redone. `ml/selftest.py` now sets `sys.dont_write_bytecode = True`
  with the measurement in the comment. A stale green would be worse than the stale red
  that exposed it.

  **Every new case broken at the SOURCE line it protects**, 13 breaks, each reverted
  from a file copy, and **two of them found real gaps in the tests rather than
  confirming them**:

  ```
  shineIndex 140/255 -> 140/254     3 fail; expected 0.3262545674114569 to be
                                    0.32594342628532147
  shineIndex loses max(0, ...)      1 fail; T-zone darker than the cheek: the gap clamps
                                    at 0: expected -0.1568627450980392 to be +0
  skin_indices.py reverted to the   2 errors; TypeError: shine_ratio() takes 2 positional
    rejected form                   arguments but 3 were given, + 1 TS source pin
  SHINE_REFERENCE_CHEEK_L 139.0     2 fail; AssertionError: 139.0 != 140.0
    in python only
  one shine row perturbed 1e-12     1 py + 2 ts fail; 0.14143110985736712 !=
                                    0.14143110985836713
  python gap loses max(0, ...)      2 fail; -0.1568627450980392 != 0.0
  specular cut 218 -> 210           1 fail; expected 3 to be greater than or equal to 4
  cheekSpecular added to            1 fail; expected 'export type SkinRawFeatures…' not
    SkinRawFeatures                 to contain 'cheekSpecular'
  run_pipeline.py calls             1 fail; run_pipeline.py calls shine_ratio
    shine_ratio(
  relativeSpread variance / (n-1)   2 fail; expected 0.18399148175369934 to be
                                    0.15934129727864463
  one toneSpread row perturbed      1 py + 1 ts fail; 0.15934129727864463 !=
                                    0.15934131321277437
  python tone_evenness guard        1 fail; 0.5 != 0 : mean 2e-7, just inside the 1e-6
    1e-6 -> 1e-12                   guard
  TS relativeSpread guard           1 fail; expected 0.5 to be +0
    1e-6 -> 1e-12
  ```

  The guard break is the one worth recording. It **passed on the first attempt** — the
  two rows meant to locate the 1e-6 mean guard were `[0,0,0,0]` and
  `[-1e-7, 1e-7, -1e-7, 1e-7]`, and both have a mean of exactly zero, so moving the
  guard to 1e-12 left the whole table green. Replaced with a pair that straddles it
  (mean 2e-7 and mean 2e-6), and the break then failed in both languages. Exactly what
  "break it on purpose" exists to catch, and the second cycle running that it caught a
  case that was green by blindness.

  Verification on this branch: vitest **534 passed in 82 files** (from 518 in 80),
  `python3 ml/selftest.py` **Ran 78 tests ... OK** (from 77), `npx tsc --noEmit |
  grep -c "error TS"` **13** unchanged, `npx eslint .` **2 warnings** both in
  `lib/care.ts` unchanged.


  **Supervisor, same day — the contract bites in both directions, and the cycle's
  sharpest finding is one the review did not have.** The reviewer went in with three
  independent grounds for rejecting the Python form, derived before reading the branch:
  it is degenerate (on a matte cheek `0.05 / 1e-6 = 50000`, and a cheek at exactly 0 and
  at 1e-6 read the same, so the value is a property of the clamp); it INVERTS the oil
  ranking at ordinary values (a matte cheek with mild T-zone shine reads 50000 against
  1.5 for a face shiny in both regions, while the app ranks the second above the first by
  4.68); and it is uncomputable, because `grep -rn "cheek_specular\|cheekSpecular"` over
  the tree returns exactly two hits, both inside the Python function's own body — the
  second argument is not a field ARU records anywhere.

  The cycle found a fourth that beats all three: **the deleted `ml/selftest.py` case
  asserted invariance under a transformation an exposure change never performs.** It
  scaled both specular ratios by a gain, but a specular ratio is a count fraction above
  the 218 cut. Measured on a graded highlight, `tzoneSpecular` reads 0.00000 at cheekL
  92.0, 115.0, 138.0 and 161.0 — the whole correctly-exposed range — then 0.39506,
  0.70370, 0.95062. Zero times any gain is zero, so the old case could not even be
  applied where the product reads faces; and where the quantity does move, cheekL
  184.0 to 206.0 is an exposure ratio of 1.12 against a specular ratio of 1.78. Added as
  a case and a table rather than left as the branch's (correct) one-line argument;
  moving the specular cut to 150 fails it with `expected 1 to be greater than or equal
  to 4`.

  **The parity contract is real, checked in both directions.** Changing
  `SHINE_REFERENCE_CHEEK_L` in `ml/skin_indices.py` alone fails `ml/selftest.py` with
  `AssertionError: 0.11764705882352942 != 0.10980392156862746`; changing it in
  `lib/skin.ts` alone fails `tests/index-parity.test.ts` with `expected 150 to be 140`
  across three cases. `ml/index-parity.json` is a committed table both runners assert
  against, which is the shape the name-level contract could never have been.

  **No published value moved, verified rather than accepted.** `analyzeSkin` was run on
  three faces on this branch and on main `18be007`: `shine`, `relRedness`, `cov`, all
  three published levels and `confidence` are identical to six decimal places on every
  one. So leaving `fallbackVersion` and the manifest untouched is correct, not an
  oversight. Rotation: 12 differing lines, all of them the body of the one item this
  cycle closed, now in the changelog rewritten as its outcome.

- 2026-09-19 (cycle 17) — Branch `autopilot/2026-09-19-1239`. **The `rgbToLab` fast
  path is taken, and the number it was filed under is wrong. `a*`-only buys 1.4-7.8% of
  `detectBlemishes`, not 53-59%; the sRGB transfer curve, which no `a*`-only path can
  touch, is 37-61%. Exact cross-language equality is measured and does not hold, so the
  parity table gains its first tolerance — 1.472 units observed over 268,877 inputs,
  4 committed.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **535 passed in 82 files**, `python3 ml/selftest.py`
  **Ran 78 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **Step 1, before anything changed: how far apart are the two languages?** Cycle 16
  left this open in exactly these words — "`rgbToLab` involves `pow` and a matrix, where
  exact cross-language equality is **not** guaranteed the way it is for four arithmetic
  operations". It is not, and it does not hold. Over **268,877 inputs** — a 5-step grid
  over the whole sRGB cube plus 120,000 floats of the shape `detectBlemishes` feeds —
  V8 and CPython 3.11 agree **bit for bit on 63-80%** of them, and where they differ the
  worst case anywhere is **1.4720** units of `channelScale * 2^-52`, with the median
  exactly **0** in every channel and every family. The measurement is two committed
  commands, not a paragraph: `ARU_LAB_PARITY_DUMP=... npx vitest run
  tests/lab-parity-sweep.test.ts` then `python3 ml/lab_parity_sweep.py`.

  The unit is where the number comes from rather than a convenience. `a* = 500 * (f(x)
  - f(y))` subtracts two quantities of order 1 and multiplies by 500, so a last-place
  error in either `f()` arrives in `a*` scaled by 500 and by nothing else — which is why
  the worst case lands just above one such unit instead of anywhere else.

  **And the decomposition says which transcendental, which turned into a finding about
  `ml/ita.py` nobody was looking for:**

  ```
  pow   V8 vs c ** 2.4 (as shipped)    exact 3820/4256 ( 89.8%)  worst 1 ulp
  cbrt  V8 vs t ** (1/3) (as shipped)  exact 4027/5000 ( 80.5%)  worst 2 ulp
  cbrt  V8 vs math.cbrt                exact 2289/5000 ( 45.8%)  worst 3 ulp
  ```

  `math.cbrt` is the better cube root — CPython 3.11 added it precisely because
  `t ** (1/3)` is not one — and swapping `ml/ita.py` to it would make the two languages
  agree **less** often, 45.8% against 80.5%. "More correct" and "agrees with the app"
  are different goals here. `ml/ita.py` keeps `t ** (1 / 3)`, now for a measured reason
  rather than by inheritance.

  **So the tolerance is `toleranceK * channelScale * 2^-52`, k = 4**, built from two
  committed integers rather than typed as a float so it cannot be widened by editing a
  digit. 4 is the smallest integer above what the mechanism bounds (about 3 units: one
  last place from each of the two `f()` calls, plus the `pow` errors attenuated through
  a cube root), and 1.472 observed sits inside that. What it still cannot hide: in `a*`
  it is **4.44e-13** against a `BLEMISH.minResidual` of **1.6**, twelve orders of
  magnitude, while the defect this file exists to catch moves values by whole units —
  `shine_ratio` read 24,691 where the app read 0.0674. **11 of the table's 20 rows
  actually disagree**, and three of them are the sweep's own worst inputs, so the
  tolerance is exercised rather than declared.

  **Step 2: taken, and the framing corrected.** `labAStar` computes `a*` and skips `z`,
  the third `f()` and the object. It is **not a second formula**: `rgbToLab` calls it,
  so `a*` has one implementation in `lib/skin.ts` and the two cannot drift by
  construction. The partial duplication cycle 16 warned about is declared out loud in
  `ml/index-parity.json` — `computes: ["a"]`, `doesNotCompute: ["l", "b"]`,
  `fastPath.python: null`, because nothing in the Python pipeline wants `a*` alone.

  **The measurement that makes this cycle worth more than the change.** Over eight runs
  x four frame sizes, paired and order-alternating:

  | | saved, ms/frame | % of detectBlemishes | positive |
  |---|---|---|---|
  | 400x480 | +0.048 .. +0.274 | +1.4 .. +7.6% | 8/8 |
  | 720x960 | +0.082 .. +0.317 | +2.1 .. +7.8% | 8/8 |
  | 1080x1440 | +0.115 .. +0.319 | +2.5 .. +6.3% | 8/8 |
  | 1440x1920 | −0.075 .. +0.174 | −1.3 .. +3.3% | 6/8 |

  **Not resolvable at 1440x1920 and not claimed there.** The grid is the same 18,291
  cells at the three larger sizes, so `labAStar` runs the same number of times and the
  growing pixel pass dilutes it into the noise. Per scan, three burst frames: roughly
  0.15 to 0.95 ms off a scan costing 6.6 to 11.6 ms.

  **Against that, the part no `a*`-only path can reach — 32 of 32 positive, never inside
  its own spread:**

  | | removed, ms/frame | % of detectBlemishes |
  |---|---|---|
  | 400x480 | +1.645 .. +2.054 | 59.4 .. 61.0% |
  | 720x960 | +1.917 .. +2.312 | 51.6 .. 55.5% |
  | 1080x1440 | +1.828 .. +2.303 | 41.7 .. 47.1% |
  | 1440x1920 | +1.843 .. +2.376 | 37.3 .. 41.4% |

  Cycle 15's "53-59% of a scan" was a true statement about `rgbToLab` whole, and the
  backlog item that carried it read as though a fast path could capture it. It cannot:
  that ablation replaced the call with `{ l: L, a: r - g, b: g - b }`, removing the
  three `Math.pow(., 2.4)` calls, and an `a*`-only path keeps all three.
  `docs/scan-cost-measurement.md` §5 now carries the correction where the old number is.

  **One benchmark hazard found by tripping over it, and closed.** Measured the obvious
  way — the statically imported `detectBlemishes` against one freshly loaded ablated
  module — the "saving" changed sign between frame sizes AND between runs: −23.3% at
  1440x1920 in one run, +6.1% at 720x960 in the next. The shipped build had already been
  driven through V8's tiers by four earlier sections of the same sweep while the ablated
  one was fresh. `C4` now builds an UNCHANGED copy too and times two freshly loaded
  modules, alternating which runs first within each repeat, and reports the median of
  the PAIRED differences rather than the difference of two medians. The first
  arrangement was measuring the benchmark's own history.

  **No published value moved, and it is checkable rather than asserted.** `labAStar`
  computes `a*` with the identical sequence of doubles, so the result is not close to
  the old one, it **is** it. The proof is that the pins did not have to move: applying
  the change gave **one** failure in 535 — `tests/scan-cost-benchmark.test.ts:232`,
  `expect(source).toContain(LAB_CALL)`, the source text of an ablation needle the change
  necessarily reworded. `blemishCount` and `blemishDensity` at four frame sizes stayed
  green **untouched**, and so did every absolute-value pin in
  `tests/skin-index-contract.test.ts`, `tests/shine-exposure-scale.test.ts` and
  `tests/axis-exposure-scale.test.ts`. `fallbackVersion`, `ATTR_THRESHOLDS`,
  `inputSchemaVersion` and the manifest are untouched; guardrail 8's `status` and
  `promotionGate` are byte-identical. `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent
  kind or flow invented.

  **Eight new cases — seven in vitest, one in `ml/selftest.py` — and ten breaks**, each
  altering the SOURCE line the case protects and reverted from a file copy. Seven here,
  two more with the second item below, and one recorded after them because it did not
  fire the first time:

  ```
  labAStar 500 -> 500.0000001         3 fail; expected 0.0052604999593560105 to be
                                      0.00526049995830391 (a* row, fast-path row, and
                                      the source pin on the 500)
  rgbToLab stops delegating a* and     2 fail; expected 0.0035069753741012732 to be
    recomputes it with 0.95048         0.00526049995830391
  ml/ita.py white point 0.95048        1 fail; 0.001753524584202637 not less than or
                                       equal to 4.440892098500626e-13 : cube: white
  ml/ita.py f() knee 0.008856 -> 0.008 1 fail; 0.01596509300618365 not less than or
                                       equal to 1.0302869668521453e-13 : knee: f()
                                       linear segment, y below 0.008856
  srgbLinear reworded onto two lines   1 fail (default) + Error: skin-no-srgb-pow: the
                                       line moved; the ablation measures nothing
  call site reverted to rgbToLab       1 fail; expected source to contain
                                       'astar[gy * gw + gx] = labAStar('
  toleranceK 4 -> 40                   ts: expected 40 to be 4; py: 40 != 4
  ```

  The fourth is the one worth recording: the `knee: f() linear segment` row was added
  because a branch could move in one language only, and that is exactly the break it
  caught — a tolerance of 1e-13 against a disagreement of 1.6e-02.

  **Second item: the "five unpinned indices" item, and checking two of them properly
  cost one pin and found two defects.** `blemish_count` / `blemish_density` **agrees
  exactly** on the quantities `detectBlemishes` produces, so it is pinned rather than
  fixed — a negative result recorded as one, the way `tone_evenness` was. Its 8 rows
  include the two (area, face width) pairs one synthetic face gave at 400x480 and
  1440x1728, so the resolution invariance the third argument exists for is checked and
  not asserted, and a degenerate row that exercises both languages' guards, which sit in
  different places. It is keyed by the REGISTRY id `blemish_count` while the function is
  `blemish_density` and the column is `blemishDensity` — three names for one index, now
  visible in the table rather than discovered from a `KeyError`.

  The other two are wrong, and both are filed with their numbers rather than patched:

  - **`roughness_ratio` is the `shine_ratio` epsilon defect again.** Python is
    `region_hf / max(reference_hf, 1e-6)`, the app is
    `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`. On a perfectly smooth forehead the
    two read **500000.0** and **0**. Exactly the mechanism that made the rejected
    `shine_ratio` read 24,691 against 0.0674. Two more differences in the same pair: the
    app returns 0 when a region is missing, and the app's inputs are each region's
    high-frequency energy divided by that region's own mean L\*, which the Python
    docstring does not say.
  - **`FEATURE_KEY` declares `melanin_index` to be `toneLstar` and it is not.** The
    contract is "the feature key `lib/skin.ts` writes into every exported sample";
    `melanin_index` is `100 * log10(100 / L*)`, so at L\* = 70 the index is **15.49**
    and the declared column holds **70**. No TypeScript counterpart exists anywhere —
    the only "melanin" in `lib/` and `app/` is a prose comment. The reverse of `cov`,
    which cycle 13 correctly left alone: `cov` has no declaration that can be wrong,
    this has a declaration and no value to declare.

  Two more breaks for the pin, on top of the seven above:

  ```
  app areaFace drops the face-width   1 fail; expected source to contain
    normalisation                     'return { count, areaFace: (validCells...'
  python blemish_density reverts to   2 fail; 142.7483821850019 != 2.960030452988199 :
    the raw-pixel denominator         one face at 400x480, and the pre-existing
                                      resolution-invariance case with it
  ```

  **The tenth break did not fire, and that is worth having.** "agrees with the fast path
  on every input in the sweep, bit for bit" is the case that carries the whole
  no-reading-moved argument, and the obvious way to break it — make `rgbToLab` compute
  `a*` inline instead of calling `labAStar` — leaves all 268,877 inputs **passing**,
  because the inline expression is the identical sequence of doubles and therefore the
  identical double. The case pins that the two AGREE; it does not pin that one calls the
  other. Perturbing the inline copy's white point to 0.95048 fires it
  (`Error: labAStar disagrees with rgbToLab at 0, 0, 5`), which is the real shape of
  what it guards. What pins the delegation itself is the source-text assertion in
  "states a tolerance that is derived, small, and cannot be widened by a digit", and
  that is now the reason it is there rather than a nicety.

  **Verification before the push**, all four re-run on the final tree: vitest
  **542 passed in 83 files** (535 + 7 new, across three files), `python3 ml/selftest.py`
  **Ran 79 tests ... OK** (78 + 1), `npx tsc --noEmit | grep -c "error TS"` **13**
  unchanged, `npx eslint .` **2 warnings** both in `lib/care.ts` unchanged,
  `npm run smoke` green — `Smoke test passed.`,
  with its own vitest 542, `ml/selftest.py` 79, and 44 mobile E2E specs passed in 2.8m
  behind the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override the protocol records.


  **Supervisor, same day — the headline is the correction, and the reviewer's own
  prediction was the weaker version of it.** Before reading the branch the reviewer
  micro-benchmarked an a*-only path at 200,000 calls over 11 repeats and got −7.5%
  against the full function when the result is consumed immediately, inside a noise
  floor of 8–13%, concluding the fast path was worth nothing and that cycle 15's
  53–75% was the arithmetic. The direction was right and the number was not: measured
  in situ rather than on a leaf, the cycle gets +1.4 .. +7.8% with the sign consistent
  8 runs out of 8 at three frame sizes, and reports the fourth honestly as 6/8 with a
  range that straddles zero. In situ beats a micro-benchmark and sign-consistency beats
  a median, so the cycle's number stands and the reviewer's does not.

  **Every reading is bit-identical to main, checked rather than accepted.** `analyzeSkin`
  was run at four frame sizes on this branch and on main `f7c52df` with a fixture whose
  blemish discs give counts of 6 and 7, so the maxima-and-suppression path `lab.a` feeds
  is genuinely exercised: `blemishCount`, `blemishDensity` at full precision, `shine`,
  `relRedness`, `cov`, `toneIta`, `toneLstar`, all three published levels and
  `confidence` to twelve decimals agree on every row. `fallbackVersion` and the manifest
  are untouched, which on this cycle is the requirement rather than an omission. The
  `blemishCount` / `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` were not
  edited — the only removed lines in that file are an ablation helper string.

  **The parity contract bites from both sides**, on the same standard cycle 16 set:
  perturbing `ml/ita.py`'s X matrix coefficient fails `ml/selftest.py`; perturbing
  `labAStar`'s fails `tests/index-parity.test.ts` and `tests/lab-parity-sweep.test.ts`
  with `cube: white: a*: expected 0.007013975346747969 to be 0.00526049995830391`. Note
  the split the cycle chose is right: within TypeScript the committed rows are pinned
  with exact equality, and the ULP tolerance applies only across languages.

  **An independent sampling supports choosing the mechanism bound over the observed
  max.** The reviewer re-ran the cross-language comparison on a different grid — 8,956
  inputs, the cube at stride 17 plus a float grid at the five gains `frameChannelGains`
  actually produces — and got max |Δa*| 1.137e-13, median 0, 68.78% exact, worst at
  rgb(102, 238, 221). That is **1.024 ULPs** of the a* output scale where the cycle's own
  sweep found 1.472 on its inputs. Two grids, two different maxima, both inside the
  mechanism's ~3: which is precisely why `toleranceK` is set from the mechanism rather
  than from max-observed times a safety factor. Recorded in `docs/rgb-to-lab-parity.md`.

  Rotation: 27 differing lines against a pre-review snapshot of main's pair, all
  accounted for — the closed `rgbToLab` item's body, rewritten as its outcome in the
  changelog, and the "seven indices" item correctly renumbered from five to three
  because this cycle covered two more.

- 2026-09-19 (cycle 18) — Branch `autopilot/2026-09-19-1839`. **The number cycle 17
  said was missing is measured, and it is a red light. Below 1.046e-5 a* units nothing
  can change `blemishCount`; a 256-entry table for the transfer curve is off by 0.470
  and moves the count from 6 to 7. The curve stays, and the item closes on a
  measurement rather than on a judgement.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **542 passed in 83 files**, `python3 ml/selftest.py`
  **Ran 79 tests ... OK**, `npx eslint .` **2 warnings** both in `lib/care.ts`.

  **What was measured, and why it is two numbers rather than one.** `detectBlemishes`
  counts a cell when its residual — a* minus the mean a* of the valid cells within 5 of
  it — clears `BLEMISH.minResidual` 1.6 AND it is the maximum in its 5x5 neighbourhood.
  So the count moves only when a cell changes its classification, and that is bounded
  from the run's own margins: a per-cell error of delta moves a residual by at most
  `2*delta` and a difference of two residuals by at most `4*delta`. The minimum over
  every valid cell is a **certified radius** — below it no error field of that size can
  change the count, whatever its shape — and it is a different claim from an
  **achieved radius**, which is the smallest delta at which a perturbation the cycle
  actually applied did change it. Both are reported because a cycle that reported only
  the second would be saying "we tried some error fields" and calling it a bound.

  **The certified radius, over twelve frames — the same face at three noise amplitudes
  either side of the committed 9, at all four frame sizes:**

  ```
  noise  frame        count  certified
      4  400x480         5   1.046e-5
      4  720x960         5   8.490e-5
      4  1080x1440       5   3.268e-4
      4  1440x1920       5   4.135e-5
      9  400x480         6   1.786e-4
      9  720x960         5   4.588e-4
      9  1080x1440       5   2.332e-3
      9  1440x1920       5   2.625e-4
     14  400x480         7   1.482e-4
     14  720x960         5   2.037e-3
     14  1080x1440       5   3.013e-3
     14  1440x1920       5   9.423e-4
  smallest: 1.046e-5
  ```

  Two and a half orders of magnitude across twelve frames, which is why the brief asked
  for the distribution: the useful number is the **smallest**, 1.046e-5, because an
  approximation has to beat the worst frame it will ever meet.

  **And then the thing the tolerance is for, measured rather than reasoned about.** The
  same machinery rebuilds `lib/skin.ts` with `srgbLinear` replaced by a table over the
  0-255 channel domain and nothing else changed, so the a* difference it produces IS the
  approximation error on the inputs the detector feeds:

  ```
  table          frame        worst |da*|   count
  256 nearest   400x480        4.703e-1       7
  256 linear    400x480        4.788e-4       6
  1024 linear   400x480        3.026e-5       6
  4096 linear   400x480        1.849e-6       6
  ```

  The committed count at 400x480 is **6**. **The 256-entry table the item named moves a
  published value**, on the first fixture anyone tried — no argument required.
  Interpolating it does not rescue it: **5.0e-4 is 48 times** the worst frame's
  certified radius, and it leaves the count alone here by luck rather than by property.
  The smallest table that clears every frame is **4096 entries interpolated**, 1.9e-6
  against 1.046e-5. So the curve stays, cycle 17 was right to stop, and what is left is
  a narrower and purely-speed item: is a 4096-entry table actually faster than
  `Math.pow(., 2.4)` on a phone? Full write-up, every table, and the two limits that
  bound all of it — one synthetic face, and a radius stricter than the count —
  `docs/blemish-perturbation-tolerance.md`.

  **An asymmetry nobody was looking for, and it is pinned rather than described.**
  Dropping the most marginal counted cell by TWICE the margin that would take it under
  the floor **does not remove a count**, at any of the four frame sizes: the cell it was
  suppressing becomes the local maximum and is counted in its place. A count comes off
  only when the suppression neighbourhood goes with it. Lifting, by contrast, takes
  about **1.25 a\*** at every size, because the best noise peak on this fixture sits at
  a residual of 0.35 against a floor of 1.6.

  **The harness guards itself, because a hook that perturbs nothing reports an enormous
  tolerance and looks like good news.** With no perturbation installed the rebuilt module
  reproduces the committed counts and densities exactly; a 4.0 a* checkerboard moves the
  count to a pinned 415/421/414/418; the test's replica of the classification is asserted
  to produce the same count as `detectBlemishes` on every frame before the oracle uses it
  to pick a target; and `minResidual`, `backgroundRadius` and `suppressionRadius` are
  READ OUT of `lib/skin.ts` rather than copied into the test — which was found by
  breaking it. The first version copied them, and a `minResidual` break failed exactly
  one assertion, the achieved radius, while the twelve certified radii went on being
  computed against a floor the detector no longer used. A test that keeps measuring
  after the thing it measures has moved is the same failure as a hook that perturbs
  nothing.

  **Second item: the `roughness_ratio` parity group, which is the cheap half the backlog
  item said could land first.** `ml/index-parity.json` gains the first group whose
  `comparison` is `"divergent"` rather than exact: 10 rows, each carrying BOTH columns,
  each language asserting its own. `python: 320000.0` against `app: 0` on a forehead
  with no texture, the same pair at 1e-7 and at exactly 1e-6 (Python clamps to the
  epsilon, the app's `>` excludes it), and exact agreement above the guard — so the
  divergence is located rather than declared. The two app-only rows record the
  missing-region branch as an ABSENT Python column rather than as a zero that looks like
  a value. **Which side moves is not decided**, which is what the item asked for: that
  needs faces. `lib/skin.ts:roughnessRatio` was extracted from the object literal to make
  the app column assertable, expression byte-for-byte unchanged.

  **No published value moved, and it is checkable rather than asserted.** The
  `blemishCount` / `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` were not
  edited and stayed green; `tests/skin-index-contract.test.ts`'s `roughnessRatio`
  1.07506721426881 did not move. `fallbackVersion`, `ATTR_THRESHOLDS`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched — guardrail 8's `status` and `promotionGate` byte-identical.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented.

  **Ten new cases — nine in vitest, one in `ml/selftest.py` — and nine breaks**, each
  altering the SOURCE line the case protects, never the test, and reverted from a file
  copy:

  ```
  BLEMISH.minResidual 1.6 -> 1.55      2 fail; BLEMISH.minResidual: expected 1.55 to be
                                       1.6, and 400x480 lift: expected
                                       0.9597128738739016 to be close to 1
  BLEMISH.backgroundRadius 5 -> 4      7 fail; 400x480 committed count: expected 7 to
                                       be 6
  srgbLinear 2.4 -> 2.41               3 fail; 400x480 certified: expected
                                       0.00017903110422778923 to be
                                       0.00017859239785300574
  the hook's anchor comment reworded   6 fail; Error: perturbation hook: the astar
                                       consumer moved; the harness measures nothing
  the hook perturbs a COPY of the      2 fail; 400x480: a 4.0 a* checkerboard left the
    grid (the failure mode itself)     count alone: expected 6 not to be 6
  python epsilon 1e-6 -> 1e-5          1 fail; 31999.999999999996 !=
                                       319999.9680000032 : reference one ulp above the
                                       guard: the two still agree
  app guard > 1e-6 -> >= 1e-6          1 fail; reference exactly at 1e-6 ...:
                                       roughnessRatio(0.32, 0.000001): expected 320000
                                       to be +0
  the call site stops delegating       1 fail; expected '/**\n * Visible-signal skin
                                       analysis.…' to contain 'roughnessRatio:
                                       roughnessRatio(cheekH…'
  ```

  The fifth is the one worth having: it is the harness's own failure mode, and the guard
  case is the only thing in the file that catches it.

  **Verification before the push**, all four re-run on the final tree: vitest
  **551 passed in 84 files** (542 + 9), `python3 ml/selftest.py` **Ran 80 tests ... OK**
  (79 + 1), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .`
  **2 warnings** both in `lib/care.ts` unchanged, `npm run smoke` green —
  `Smoke test passed.`, with its own vitest 551, `ml/selftest.py` 80, and **44 mobile
  E2E specs passed in 3.4m** behind the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override the
  protocol records.

  **Rotation, per step 8.** "Recent cycles" holds cycles 18, 17 and 16; cycle 15's
  184-line entry moved to `docs/autopilot-changelog.md` and `diff` reports it
  **byte-identical**, and the one item this cycle ticked `[x]` moved to "Closed backlog
  items -> Now" with its body rewritten as its outcome. `comm -23` against a sorted
  snapshot of the pre-change pair reports **43 differing lines**, every one of them from
  the three backlog items this cycle rewrote: the closed transfer-curve item's old body,
  the `roughness_ratio` item's body (its `500000.0` example replaced by the committed
  row's `320000.0`, and the older figure still stands in cycle 17's entry), and the
  "indices still unchecked" item's recount from three covered to four. Nothing from the
  moved entry appears in that list.

  **Supervisor, same day — the method is better than the reviewer's and the verdict is
  one step too confident.** The reviewer went in with a perturbation sweep of its own and
  got a tolerance of **0.03 a\* units**, three orders of magnitude looser than this
  cycle's 1.046e-5. The cycle is right and the reviewer was answering a weaker question:
  0.03 was the *achieved* radius for one deterministic error shape, and what an
  approximation has to clear is the *certified* one, computed from the run's own margins
  and safe against an error of any shape. The cycle reports both, labels them as
  different claims, and measures `uniform -> null` — the trap where a constant offset
  cancels in the local-background subtraction and a harness built on one reports an
  unbounded tolerance. It is pinned as a case.

  **The correction.** §5 green-lights a 4096-entry interpolated table at 1.9e-6 against
  1.046e-5. That 1.9e-6 is the error on the pixel values the four fixtures happen to
  produce, because the rebuilt `lib/skin.ts` only converts the cells a real frame hands
  it. It is not the worst case over the inputs `detectBlemishes` will ACCEPT, and a
  certificate has to cover those. The gate is `L in [40, 230] && r > b` on the raw pixel
  (`lib/skin.ts:958`) with the conversion on `channel * gain`. Swept over every input
  clearing that gate at gains 0.72 / 1.0 / 1.33:

  ```
  table          whole cube    inside the gate    vs 1.046e-5
  1024 linear    3.701e-4      1.962e-4           does not certify
  4096 linear    1.621e-5      1.251e-5           does not certify
  ```

  The 4096 table's worst admissible input is around rgb(22, 35, 17) after gain — dark and
  green-leaning, which passes `r > b`. So **no table measured certifies**, the 5.5x of
  headroom is headroom on the fixture family rather than on the input domain, and the
  open question is not only the speed question §5 reduces it to. Recorded in
  `docs/blemish-perturbation-tolerance.md` §5; §2 and §3 are unaffected.

  **Checked rather than accepted.** The printer reproduces every row of §2 exactly.
  Three source lines were broken: `minResidual` 1.6 -> 1.2 fails 2 cases including the
  certified-radius one, `suppressionRadius` 2 -> 1 fails 4, and moving the Python
  `roughness_ratio` epsilon from 1e-6 to 1e-5 fails `ml/selftest.py`, so the new parity
  group holds the Python side the way cycle 16 established. The `blemishCount` /
  `blemishDensity` pins in `tests/scan-cost-benchmark.test.ts` are untouched — the diff
  against main is empty — and `fallbackVersion` and the manifest did not move, which on
  this cycle is the requirement. Rotation: 42 differing lines, all from the two items
  this cycle touched, the closed one rewritten as its outcome in the changelog.

- 2026-09-20 (cycle 19) — Branch `autopilot/2026-09-20-0039`. **An a\* difference is
  not scale-free, and that is arithmetic rather than a property of the fixture: a
  common gain takes it to g^0.8 of itself. The app's chromaticity difference wins by
  24x, 11x and 3.3x on the three nuisances the design doc names, ties on the two it
  does not, and the Python side moved. The registry audit cycles 16-18 were running is
  finished, and the last index it covered turned out to be wrong too — by 180 degrees.**

  **Baselines on arrival, counted rather than recalled, `npm ci` run first because
  `node_modules` was absent.** All four matched the brief exactly: `npx tsc --noEmit |
  grep -c "error TS"` **13**, vitest **551 passed in 84 files**, `python3
  ml/selftest.py` **Ran 80 tests ... OK**, `npx eslint .` **2 warnings** both in
  `lib/care.ts`.

  **The question, and why it needed a construction rather than a sweep.** Two indices
  on two scales cannot be compared by spread — that rewards whichever sits further
  from zero. So every sweep is reported as **nuisance / signal**: how far a capture
  change moves the index, over how far four faces of genuinely different redness move
  it at one capture. Both forms order those four, so this is not a contest between an
  index and a constant. Both columns come from the SAME two `sampleRegion` outputs of
  the SAME frame, and the rejected column goes through the shipped `labAStar`.

  ```
  nuisance                     chromaticity   a* difference   winner
  exposure, cheekL 70..170          0.0209          0.5047    chromaticity by 24.16x
  melanin tone                      0.0227          0.2545    chromaticity by 11.19x
  white balance                     0.0624          0.2071    chromaticity by  3.32x
  tone curve, gamma 0.8..1.25       0.3930          0.4076    chromaticity by  1.04x
  veiling flare, black lift 0..30   0.1878          0.1822    a*           by  1.03x
  ```

  The exposure row as values: chromaticity **1.0249x** over a 2.43x exposure range,
  a\* **2.1683x** — 1.82634 to 3.95999 on one face whose skin did not change, monotone
  in the brightness, every row unclipped.

  **The mechanism, checked against the shipped code rather than argued.** `a* = 500 *
  (f(x) - f(y))` with f a cube root above its knee, so a\* is homogeneous of degree 1/3
  in the linear signal; the linear signal is degree 2.4 in the 8-bit channel. A common
  gain g multiplies BOTH regions' a\* by `g^0.8` — and a difference of two things that
  both scale scales too. **It factors out of the difference instead of cancelling in
  it**, which is exactly what the old docstring got wrong: "both regions went through
  the same sensor and the same light" is true of an ADDITIVE common term and false of a
  multiplicative one. Under a pure 2.4 power law the prediction is exact to every
  printed digit (0.66454 / 0.83651 / 1.15703 against `g^0.8`); the shipped
  affine-then-power curve sits near it without being it (0.65561 at g = 0.6), because
  the +0.055 offset does not scale. The chromaticity form over the same scalings moves
  by at most **one ulp of 1.0**, a bound derived from two correctly-rounded divisions
  and measured at exactly half of it.

  **Two construction choices, either of which would have changed the answer, and they
  are in the file rather than in a paragraph.** The melanin sweep raises each channel
  to a different power (`s^0.75 / s^1.0 / s^1.2`) because melanin absorbs more at short
  wavelengths — a scalar darkening would make that sweep arithmetically identical to
  the exposure sweep and the second table would be the first one twice. The gamma and
  flare sweeps re-normalise the exposure, because both change the frame's brightness as
  a side effect; uncorrected, the gamma sweep's a\* column reads BETTER than it should.

  **The two ties are kept rather than trimmed, and one of them costs a published
  level.** Neither form is invariant to a camera that is not linear. Gamma 0.8 to 1.25
  with the exposure held takes this face from **0.010348 to 0.016477**, across the
  `ATTR_THRESHOLDS.redness` 0.012 cut — and **moving the cut does not help**, because
  the sweep straddles it wherever it is put and the rejected form moves by as much. It
  is a limit of reading redness off an uncalibrated camera and a cousin of the
  illuminant-correction backlog item, not an argument for either formula. Pinned as a
  case, so a later cycle claiming the chromaticity form is simply the stable one has to
  fail a test to say so. One synthetic face; the golden-set blocker is what would
  change that.

  **No published value moved**, and it is checkable rather than asserted: the app
  already computed the winner. `ATTR_THRESHOLDS`, `fallbackVersion`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched — guardrail 8's `status` and `promotionGate` byte-identical.
  `NEXT_PUBLIC_FUNNEL_FLUSH` untouched. No consent kind or flow invented. The Python
  function was never on a path that produced a value (all three pipeline scripts read
  the app's `relRedness` column) and its old inputs were a\* values no ARU export
  carries.

  **Second item, which the brief filed as the cheap half and which is not a negative
  result.** `ita` was the last index both unpinned and not known to be wrong. It is
  wrong. **Three implementations exist and only two agree**: `lib/skin.ts:itaDegrees`
  and `ml/ita.py:ita_from_lab` fall back to ±90 at `|b*| < 0.01`, the registry's uses
  `1e-6`. That would be a rounding question if the fallback were continuous, and it is
  not — **the ±90 fallback ignores the SIGN of b\***:

  ```
   L*     b*        app        registry     note
   70   0.005    90.000000    89.985676     inside the app's guard, outside the registry's
   70  -0.005    90.000000   -89.985676     +90 against -90: light against deep
   30  -0.005   -90.000000    89.985676     the same, the other way, below the L* pivot
   70    1e-06   90.000000    89.999997     the registry's guard is `<`, so it computes
   70    1e-09   90.000000    90.000000     inside both: they agree, at the fallback
   70   0.01     89.971352    89.971352     the app's guard is `<` too, so both compute
  ```

  41 is the light cut and 10 the deep one, so one column is above the first and the
  other below the second — **opposite ends of the tone stratifier from one frame.**
  Reachable rather than arithmetic: `docs/tone-ita-verification.md` §3 has a cool cast
  taking ITA from 61.8 to −87.6 on a real fixture, so a capture travels through zero.
  **Pinned divergent, not decided**, because both implementations carry the same
  discontinuity and disagree only about where it sits. `lib/skin.ts` gains
  `itaDegrees`, which existed **twice, byte for byte**, in that one file — the
  duplication the 2026-09-15 `confidenceLabel` finding is about — and
  `ml/skin_indices.py:ita` converts with `* 180 / math.pi` instead of `math.degrees`,
  the same trade-off cycle 17 recorded for the cube root: `math.degrees` rounds once
  and is MORE accurate, and over **1,186,709** (L\*, b\*) pairs the two associations
  are bit-identical on **74.5%** and differ by up to **1.42e-14** degrees, **0.71**
  units of `90 * 2^-52`. Matching the app isolates the guard as the group's only
  divergence. `ml/ita.py` keeps `math.degrees` and is held to the app's guard exactly
  and its value within `2 * 90 * 2^-52`.

  **Ten new cases — seven in vitest, three in `ml/selftest.py` — and ten breaks**, each
  altering the SOURCE line the case protects, never the test, and reverted from a file
  copy:

  ```
  redChromaticity r/(r+g+b||1)         2 fail; cheekL 80 ...: expected
    -> r/(r+g+b+1)                     0.011632146391430398 to be 0.011694677871148473
  relativeRedness operands swapped     3 fail; expected -0.011694677871148473 to be
                                       0.011694677871148473
  the relRedness call site stops       1 fail; expected '/**\n * Visible-signal skin
    delegating (values identical)      analysis.…' to contain 'relRedness:
                                       relativeRedness(cheeks, t…'
  labF Math.cbrt(t) -> Math.sqrt(t)    1 fail; shipped labAStar at gain 0.6: expected
                                       0.5451407988491981 to be close to
                                       0.664539805948974 ... but expected 0.05
  python red_chromaticity guard        1 fail; -0.4011393442622951 !=
    -> max(total, 1e-6)                0.09836065573770492 : a region summing to 1e-9
  python relative_redness swapped      2 fail; -0.011694677871148473 !=
                                       0.011694677871148473
  app itaDegrees guard 0.01 -> 1e-6    1 fail; itaDegrees(70, 0.005): expected
                                       89.98567605542014 to be 90
  one tone site stops delegating       1 fail; both tone sites must delegate: expected
                                       1 to be 2
  python ita guard 1e-6 -> 0.01        1 fail; 90.0 != 89.98567605542014
  python ita -> math.degrees           1 fail; 44.47436539354238 !=
                                       44.474365393542385
  ```

  **The fifth is the one that earned its place, and it did not fail the first time.**
  The redness group originally had two black-region rows and nothing between zero and
  an epsilon, so swapping Python's `total if total else 1.0` for `max(total, 1e-6)`
  agreed on a region of exactly zero and `ml/selftest.py` stayed green: the rows
  located the branch ON zero and located nothing about WHERE IT SITS. That is the same
  failure `tone_evenness`'s 2e-7 / 2e-6 pair was added to close, one index over, and it
  was found only because the guardrail requires breaking every new case. Two rows now
  straddle it — a region summing to 1e-9 and the same chromaticity a million times
  larger, which must read the same — and the break fails in both languages.

  **Where the registry stands now, which is the thing cycles 16-19 were for.** All
  seven indices have had their values checked; six are pinned in
  `ml/index-parity.json`. Three of the seven declarations were false — `shine_ratio`,
  `relative_redness`, `ita` — while `tests/skin-index-contract.test.ts` pinned all
  seven NAMES throughout and stayed green for every one of them. `melanin_index` is
  the seventh and is deliberately not in the table: it is the one index a value
  contract is the wrong instrument for, because there is no app-side value to compare
  against, and it keeps its own open item.

  **Verification before the push**, all four re-run on the final tree: vitest **558
  passed in 85 files** (551 + 7), `python3 ml/selftest.py` **Ran 83 tests ... OK**
  (80 + 3), `npx tsc --noEmit | grep -c "error TS"` **13** unchanged, `npx eslint .`
  **2 warnings** both in `lib/care.ts` unchanged.


  **Supervisor, same day — same verdict, reached independently, and one claim bounded.**
  The reviewer swept both forms on its own fixture before reading the branch and got the
  same answer on every axis it tried: relative spread of 31.40% against 62.39% on
  exposure, 6.02% against 37.82% on white balance, and **1.18% against 45.72% on skin
  tone**. The tone row is the one that matters for this product and it is the one where
  the gap is widest. The mechanism is that `rIdx = R/(R+G+B)` is homogeneous of degree
  zero — multiply the whole pixel by any scalar and it is unchanged exactly — while
  `a* = 500(f(x) - f(y))` with f a cube root is not, so subtracting two regions does not
  cancel the nonlinearity. The cycle's own five axes are a superset of the reviewer's
  three, and it reports the one axis where the a* form wins (veiling flare, 1.03x)
  instead of leaving it out.

  **What the review bounds is the exposure row.** It is measured over cheekL 70..170,
  but `buildSignals` passes 조명 for **70..210**, so the product publishes readings
  above that band. Re-swept in 0.02 exposure steps and split:

  ```
  band        n    chromaticity   a*        ratio
   70..170    30    3.84%         65.15%    chromaticity by 16.95x
   70..210    43   28.03%         71.64%    chromaticity by  2.56x
  170..210    13   28.29%         25.94%    a* by 1.09x
  ```

  The decision stands — over the band the product uses, chromaticity is still the more
  stable form — but the 24x is a property of stopping at 170. Over the real band it is
  2.56x, and in the top fifth alone the two are equivalent. The cause is the one cycles
  14 and 18 measured: above ~170 the cheek's channels start pinning at the 8-bit ceiling,
  and a ratio of channel sums is homogeneous only while no channel is pinned. Recorded in
  `docs/redness-formula-decision.md`; one synthetic face, so the crossover may be
  fixture-specific while the collapse of the margin is not.

  **Checked rather than accepted.** The app's expressions were extracted byte-identically
  — `rIdx` into `redChromaticity`/`relativeRedness`, and the ITA expression, which was
  duplicated inline in two places, into `itaDegrees` — so nothing published moved:
  `analyzeSkin` on this branch and on main `edbe5c9` agrees at four frame sizes on
  `blemishCount`, `blemishDensity`, `shine`, `relRedness`, `cov`, `toneIta`, `toneLstar`,
  all three levels and `confidence` to twelve decimals, with blemish counts of 7–9 so the
  detector path is exercised. `fallbackVersion` and the manifest are untouched. Three
  source lines broken: the TypeScript `redChromaticity` denominator fails 2 cases
  (`expected 0.010499683744465527 to be 0.011694677871148473`), the Python side of the
  new group fails `ml/selftest.py` with 2 errors, and moving `itaDegrees`' guard from
  0.01 to 0.5 fails with `itaDegrees(70, 0.02): expected 90 to be 89.94270423958551`.
  Rotation: 33 differing lines, all from the two items this cycle touched.

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

- 2026-09-21 (cycle 25) — Branch `autopilot/2026-09-21-1239`. **The decision-margin
  guard's blind spot is closed with the second hook cycle 23 asked for, and the break it
  recorded as "did not bite" now bites. The noise bound every margin is reported as a
  multiple of turns out to be a real upper bound with 226-816x of headroom, and ARU's
  summed-area table is 4.4-7.1x less accurate than the reference construction in a place
  where that cannot matter. And `/report`'s commerce row — the one carrying
  `placement=report_summary`, the single link the revenue arithmetic rests on — has been
  rendering both its CTAs as 24px slivers with the label cut mid-word, in every locale, at
  every width, desktop included.**

  **Baselines.** `npm ci` first (`node_modules` was absent). The arriving `npm run smoke`
  came back green with the chromium override (`Smoke test passed.`, `Ran 121 tests ... OK`),
  but it is **not quoted as a clean-tree baseline**: it was started before any edit and
  finished after the first test-file edit had landed, so its vitest leg may have read a
  modified tree. The supervisor's own main-branch measurements stand as the baseline and
  this cycle compared against those. `npx tsc --noEmit | grep -c "error TS"` **13**,
  unchanged, measured here.

  **Research: what a reference summed-area table does differently, and why it was asked.**
  The question came out of the ML work rather than being picked to fill a slot: every margin
  in `tests/blemish-perturbation-tolerance.test.ts` is reported as a multiple of
  `noiseScale = gw*gh * EPSILON * max|a*|`, and that bound was asserted in a comment and
  verified by nobody. scikit-image's `integral_image`, read from its own source on
  `raw.githubusercontent.com` — another project's implementation, not a paper and not a
  standard — says two things that bear on ARU:

  ```
  skimage/transform/integral.py @ v0.24.0  http=200 bytes=5096
  skimage/transform/integral.py @ v0.25.2  http=200 bytes=5096  (byte-identical to v0.24.0)
    sha256 ed187d23b0b47dbb8457b67d451f9aa19e39237bf322c81a92fab5a1802927d6
  ```

  It promotes float inputs to at least float64 "for better accuracy and to avoid potential
  overflow" — ARU's `sumTable` is already a `Float64Array`, so that precaution is taken. And
  it builds the table as a **separable `cumsum` along each axis**, where `lib/skin.ts` uses
  the one-pass inclusion-exclusion recurrence, which **subtracts a partial sum at every
  cell**. A cumsum never does, so the two are not obviously equally accurate and ARU's is the
  one with a mechanism to be worse. That made it a measurement rather than a reassurance.

  **ML: the guard now reads the field the detector actually classifies.** `__perturbAStar`
  is injected before the summed-area tables, so every residual this file reasoned about was
  `residualsOf`'s reconstruction from the captured a\* grid. Anything `lib/skin.ts` did
  downstream of a\* moved what the detector classifies without moving a single number in the
  margin tables — cycle 23 measured that and wrote it down as §7.4's sixth break, the one
  that did not bite. `__observeResidual` is a **second** hook, injected after the residual
  loop and before the classification loop, against the anchor `let count = 0; let validCells
  = 0;`. It is a second hook and not a widened first one because the two read different
  arrays at different points, and a replica that had quietly stopped being the detector is
  precisely the failure being guarded. Three things are asserted, in order: the two residual
  fields agree **exactly at every valid cell**; classifying the detector's own residual
  reproduces the count `detectBlemishes` returned; and the pinned margins hold when
  re-measured on the detector's own field, which is an independent surface because editing
  `residualsOf` to track a moved `lib/skin.ts` would satisfy the first and still fail here.

  **Two source-line breaks, never of a test, and the second is the one that earns the
  hook.** Break A is the exact break §7.4 recorded as passing — `residual[i] =
  Math.round((astar[i] - background) * 1000) / 1000` — and it now fails, 3 of 11 in this
  file, first assertion:

  ```
  noise 4 400x480: the detector's own residual differs from this file's replica at 11789 of
  11789 valid cells (worst |d| = 5.000e-4). Every decision margin in this file is measured
  on the replica, so a change downstream of a* moves what the detector classifies without
  moving a single number above it: expected 11789 to be +0
  ```

  But break A was already visible to two other assertions in this same file and to two other
  files, so on its own it does not show the hook adds coverage. Break B does: `residual[i] =
  Math.max(-1e-9, astar[i] - background)` clamps only residuals far below the `minResidual:
  1.6` floor, so no cell can change classification and every count pin in the tree stays
  green. Across `blemish-perturbation-tolerance`, `blemish-tie-break`,
  `blemish-density-scale`, `skin-index-contract` and `scan-cost-benchmark` — **45 tests, 2
  failed, both in this file**, one of them the new case. `lib/skin.ts` was restored
  byte-identical after each break: sha256
  `75cfb0a72728c0caa167d80cd85d8938496bf3d6322c90fa2a8b705a85b17b08` before and after, and
  `git diff lib/skin.ts` empty. It is untouched on this branch.

  **And the bound the whole guard rests on is now measured rather than asserted.** Both
  constructions were compared against an exact accumulation in a non-overlapping expansion,
  rounded once. The reference was itself checked before it was used: it returns `1` for
  `[1e16, 1, -1e16]` and `2` for `[1, 1e100, 1, -1e100]` where naive summation returns `0`
  for both, it is order-independent over 10,000 values, and on those same values it agrees
  with Python's correctly-rounded `math.fsum` to the last bit (`1790845758.191924` from both,
  against `1790845758.191915` and `1790845758.1919322` for naive summation in the two
  directions).

  Three findings. **The bound holds, with room**: ARU's worst background error is
  **4.230e-14 to 1.513e-13** a\* against a bound of **3.424e-11 to 3.820e-11**, so it uses
  0.12%-0.44% of it — 226x to 816x of headroom — and `noiseScale` means what it says. That is
  now an assertion, not a comment. **The cancellation argument is confirmed and does not
  matter**: the cumsum construction is **4.4x to 7.1x more accurate** on all sixteen frames,
  exactly as a construction with no subtraction in it should be, but ARU's error is
  **6.9e8 to 1.8e11 times smaller** than the smallest suppression gap, so switching would buy
  a factor of five on a quantity ten orders of magnitude below the decision it feeds. **No
  change was proposed and none was made** — the number is recorded so the next cycle has it
  instead of the argument. And the noiseless fixture is the worst case here too, at roughly
  2x the noisy frames. `docs/blemish-perturbation-tolerance.md` §7.6-7.7.

  **UI/UX: `/report`'s commerce row rendered both CTAs as 24px slivers, and it is the one
  row the revenue arithmetic depends on.** `reportCommerceAction` is a `display: flex` row
  with no `flexWrap`. It holds two `flex: 1` CTAs (so `flex-basis: 0`) and, since
  2026-09-15, a third child: `<CommerceDisclosure style={{ width: "100%" }} />` at
  `flex-basis: auto`. The disclosure alone claims the whole line, free space goes negative,
  `flex-grow` never applies, and both anchors collapse to their horizontal padding. Measured
  in Chromium at 360x800, not reasoned from the CSS:

  ```
  /api/out?...placement=report_product   288.0px   (three of these, inside the product cards — fine)
  /api/out?...placement=report_summary    24.0px   sw=48 cw=24   "올리브영에서 제품 보기"
  /care                                   24.0px   sw=30 cw=24   "제품과 상담 정보 보기"
  /privacy                               320.0px
  ```

  So the `report_summary` out-click — the link `lib/commerce.ts` and the revenue table are
  built around — has been a 24px tap target, 55% under `--tap-min: 44px`, with its label cut
  mid-word, in all five locales. It is not a narrow-viewport problem: the disclosure's basis
  claims the whole line at any width, so free space is negative everywhere. Measured before
  and after the fix, same probe, ko:

  ```
  width   before (buy / care)        after (buy / care)
   320    24.0 / 24.0   sw=48,30     109.2 / 134.8   no clipping
   360    24.0 / 24.0   sw=48,30     126.6 / 157.4   no clipping
   393    24.0 / 24.0   sw=48,30     141.0 / 176.0   no clipping
   430    24.0 / 24.0   sw=48,30     157.0 / 197.0   no clipping
   768    24.0 / 24.0   sw=48,30     170.1 / 213.9   no clipping
  1280    24.0 / 24.0   sw=48,30     170.1 / 213.9   no clipping
  ```

  The fix is one property, `flexWrap: "wrap"`, which is what the disclosure's own
  `marginTop: 4` always implied; at 360px all five locales read **126.6px** and **157.4px**
  with no clipping.

  **The trap in the guard, caught before it was committed.** The obvious selector,
  `main a[href^="/api/out"]).first()`, **passes against the broken build**: the same step
  carries three `report_product` links at 288px and `first()` picks one of those. The spec
  binds to `placement=report_summary` inside the section that contains it, and asserts both
  a width floor and `scrollWidth <= clientWidth` — a width check alone would pass a box wide
  enough to tap that still cuts its label, and a clipping check alone would pass a 20px box
  showing its whole label. This is cycle 24's `infoLinkBtn` regex lesson in a different
  shape: the first version of the guard measured the wrong element and looked green.

  **Bug fix: the `/studio` share button could never succeed, because the app's own CSP
  refuses the fetch it makes.** `shareCardImage` rasterized the card to a
  `data:image/png;base64,...` URL and then did `await (await fetch(dataUrl)).blob()` to build
  the `File`. `next.config.ts` emits `connect-src 'self'`; that directive governs `fetch()`
  and permits neither `data:` nor `blob:`. So the line threw `TypeError: Failed to fetch`
  for every user on every browser — no flag, no platform condition — and the user got
  "공유에 실패했어요. PNG 저장을 이용해 주세요." every time. Two consequences beyond the
  message: the throw happens **before** the `navigator.canShare` branch, so the deliberate
  download fallback at the end of the same function was unreachable too; and `onShare` never
  fired, so `recordFunnelEvent("share_clicked", { surface: "studio" })` has **never** fired,
  and any reading of the share funnel that includes `/studio` is wrong. That is
  revenue-upstream items 2 and 3 at once.

  Three E2E specs already visit `/studio` and none of them clicks the button, which is how a
  total failure of the product's only image-share path went unseen. `tests/e2e/studio-share.spec.ts`
  clicks it under the **real** header — the CSP is not stubbed, only `navigator.share`, because
  a headless Chromium has no share sheet — and asserts the File actually reaches the sheet
  (`name`, `type`, `size > 1000`), that no CSP refusal appears in the console, and that the
  failure row is absent. Against the unfixed build it fails on the user-visible symptom:
  `the share path reported failure to the user: expected 0, received 1`. The fix decodes the
  data URL in process (`atob` → `Uint8Array` → `Blob`); the CSP was **not** widened, which
  would be the wrong direction for a hardened header, and `createObjectURL` + `fetch` was
  measured and rejected because `blob:` is refused by the same directive.

  **Bug fix 2: `recordCareIntent`, and the UI half of the question answered "no".** The
  backlog item cycle 24 left open. Checked before fixing, as it asked: the function has
  exactly one caller, it is a bare `void`, and nothing on screen claims the intent was
  stored — so unlike cycle 24's check-in card this was never a lie to a user, and the
  consequence is a silently short care-intent log that nothing could detect. It now returns
  `CareIntent | null` like both siblings. `/care` deliberately surfaces **nothing**:
  `openCareLink` opens the merchant link whether or not the log write landed, so an error
  row would report a failure the user did not experience.
  `tests/care-intent-write-signal.test.ts` pins that decision as well as the signal — its
  third case asserts the ORDER (`window.open` after the record, never gated on it), so a
  reordering that leaves every statement present still fails.

  **Two findings recorded rather than swept up**, both now backlog items: `shareUrl` is a
  dead parameter, so even a working studio share sends a bare PNG with no way back to ARU
  (revenue-upstream item 3, but what a studio card should link to is a product call); and
  `lib/pilot.ts:savePilotNote` is the only store in the repo with no guard, no cap and no
  try/catch, which is research-mode only since `/pilot` 404s in production.


  **Rotation, proved rather than asserted.** Measured across the rotation step alone:
  `docs/AUTOPILOT.md` **1809 -> 1541**, `docs/autopilot-changelog.md` **4694 -> 4966**.
  (This paragraph and the verification block below it were written after that measurement,
  so the committed file is longer than 1541 — `wc -l` on the commit is the authority and
  the delta above is the rotation's, not the whole cycle's.)
  "Recent cycles" holds 25/24/23; cycle 22 moved verbatim to the bottom of the changelog
  (14,317 bytes, text unchanged), and both `[x]` items moved to "Closed backlog items"
  under their original "### Now" heading with the original wording preserved as a
  blockquote. Normalising both files' non-blank lines (strip leading whitespace and `>`,
  strip trailing whitespace, `sort -u`) and running `comm -23 before after` leaves
  **nothing at all** — **5527** unique lines before and **5527** after.

  One thing the rotation script got wrong and it was repaired rather than left: its first
  pass swept every top-level `[x]` in the file, which took the already-actioned
  `confidenceLabel` entry out of "Supervisor findings not yet actioned" — a section that is
  not the backlog and an item this cycle did not tick. It was put back verbatim and the
  changelog copy removed; `grep -c` confirms one copy in `docs/AUTOPILOT.md` and zero in the
  changelog.

  **Verification.** `npm run smoke` green (`Smoke test passed.`), vitest ****608 passed in 90 files** (603 plus 2 in the ML file and 3 in the new care-intent file)**,
  `npx tsc --noEmit | grep -c "error TS"` **13** — unchanged, and it was **15** at first:
  the new `tests/care-intent-write-signal.test.ts` fixture inferred `merchant: string`
  against `MerchantId`, caught here and fixed by typing the fixture
  `Omit<CareIntent, "id" | "ts">` rather than by casting, so a field that drifts out of
  `CareIntent` is still a compile error. `npm run lint` **0 errors, 2 warnings** — the same
  two, `'_reads'` and `'_result'` at `lib/care.ts:72`. `python3 ml/selftest.py` **Ran 121
  tests ... OK**, unchanged — nothing in `ml/` was touched. Mobile E2E ****52 passed (4.8m)** — 50 on main, plus one new spec on each of the two fixes**.

  `lib/skin.ts` is byte-identical to main (sha256
  `75cfb0a72728c0caa167d80cd85d8938496bf3d6322c90fa2a8b705a85b17b08`), and so are
  `public/models/visible-attributes/manifest.json` (`status` and `promotionGate` included),
  `ml/external_datasets.json`, `lib/consent.ts` and `next.config.ts` — the CSP was diagnosed
  and **not widened**, which is the point of that fix. `NEXT_PUBLIC_FUNNEL_FLUSH` was not
  set, no consent kind was invented and neither stream was merged, no dataset licence tier
  moved, and no face image path changed.

  **One run that is not quoted as evidence.** A full `npx vitest run` mid-cycle reported
  `1 failed | 604 passed`; the immediate re-run of the same tree reported `605 passed in 89
  files`, and the failure's identity was lost because that command was piped through
  `tail -8`. Two investigation subagents were running commands against this working tree at
  the time, which is the most likely cause and is not established. It is recorded because
  it happened, not diagnosed, and the gate above is the run that counts.

  **Supervisor review.** The CSP finding is the most consequential defect any cycle has
  turned up, so it was reproduced here rather than read.

  *The share surface really was dead, in a real browser.* Served the app's own header
  shape (`default-src 'self'; img-src 'self' data: blob:; connect-src 'self'`,
  `next.config.ts:18`) from a local server and ran both fetches in Chromium:

  ```
  fetch(data:...)  -> THREW TypeError: Failed to fetch
  fetch(blob:...)  -> THREW TypeError: Failed to fetch
  ```

  Both halves of the claim hold, including the exact error text and the part a reader
  would most want to check — that `createObjectURL` + `fetch` is no escape, because
  `blob:` is refused by the same directive. `img-src` allowing `data: blob:` is a
  different directive and does not help a `fetch()`. So `shareCardImage` threw on its
  second line for every user on every browser, before `navigator.canShare` was reached,
  which also made the download fallback unreachable and meant `share_clicked` never
  fired for this surface. The share loop is the only organic acquisition path the
  product has, and it had never worked.

  *The replacement decoder is byte-exact.* Transcribed `dataUrlToBlob` and ran it
  against a known PNG: 70 bytes in, 70 bytes out, `got.equals(want)` **true**, leading
  bytes `89504e470d0a1a0a` — a valid PNG signature. The no-parameter case its comment
  calls out behaves as claimed: `data:image/png,hello%20world` decodes with type
  `image/png` rather than a truncated type.

  *The 24px CTA reproduces, and the after-numbers match to three decimals.* Rebuilt the
  commerce row's flex structure independently — two `flex: 1` anchors and a `width: 100%`
  disclosure — and measured at 360x800 in Chromium:

  ```
  flexWrap: nowrap   buy=38x168      care=38x168
  flexWrap: wrap     buy=126.61x68   care=157.39x68
  ```

  The entry's after-fix figures at 360 are **126.6 / 157.4**. The before-figure differs —
  **38px here against the entry's 24px** — and the reason is that this reconstruction is
  not the component: its label string is shorter than the shipped one, and the entry's
  own `sw=48 cw=24` shows the real anchor clipping where this one merely narrowed. The
  mechanism, the direction and the magnitude are confirmed; the exact before-pixel is the
  entry's measurement of the real page and not this one's.

  *The `recordCareIntent` item was the one to get wrong, and the branch did not.* This
  cycle's brief flagged it: the fix is right but the justification must not claim a
  user-visible lie, because there is none. Checked before the branch arrived —
  `grep -nE "저장|saved|기록했" app/care/page.tsx` returns two hits, a code comment and
  advice copy telling the USER to save their own product names, against
  `app/checkin/page.tsx:146`'s `role="status"` "남겨주신 피드백을 저장했어요." over an
  empty store. The branch says exactly this in the code comment, unprompted, and explains
  why the failure is deliberately not surfaced: `openCareLink` cannot await before
  `window.open` without popup blockers killing the link.

  *The blind-spot guard closes what cycle 23 left open.* Quantising `residual[i]` to
  three decimals at its source line — the precise change the backlog item said the old
  margin guard could not see — now fails `the residual the detector actually classifies >
  is the field the margins are measured on, cell for cell, at every frame and noise
  level`, among 3 of 12.

  *One thing verified here that a previous cycle asserted.* Cycle 24's "the noise band
  does not change the gate" was merged on a reading of the code; it is now proved by
  execution. With `qwk_noise.clears_band` forced to return `False` for every axis — the
  worst possible verdict — on a model that beats the heuristic: `beats: True`,
  `clearsNoiseBand: False`, **`BLOCKERS: []`**, one warning. `ml/subgroups.py` appends to
  `blockers` only under `if not entry["beats"]`. The claim holds.

  *Rotation, against a pre-review snapshot of main.* 1588 → 1599 and 4694 → 4966, and
  `comm -23` finds **19 lines missing**, all 19 from the two backlog items this cycle
  closed — both present in the changelog. "Recent cycles" holds 25/24/23.

- 2026-09-21 (cycle 26) — Branch `autopilot/2026-09-21-1839`. **The "do not pool feature
  generations" rule stopped being documentation: a run that mixes two generations of the
  feature extractor now says so, and the check would never have fired even once it existed
  because `run_pipeline` hands `coverage()` a projection that had dropped both version fields.
  Whether that is a warning or a blocker was decided from scikit-learn's own source rather
  than from taste. And `/studio` — the product's only image-share surface — has been cutting
  its own prefilled text in three of five locales, at every width.**

  **Baselines, measured here on a clean tree before any edit, and they match the supervisor's
  to the number.** `npm ci` first (`node_modules` was absent). `npm run smoke` green with the
  chromium override at `/opt/pw-browsers/chromium-1194` (`Smoke test passed.`), vitest **608
  passed in 90 files**, mobile E2E **52 passed (4.1m)**, `python3 ml/selftest.py` **Ran 121
  tests ... OK**, `npm run lint` **0 errors, 2 warnings** (the same `'_reads'` / `'_result'` at
  `lib/care.ts:72`), `npx tsc --noEmit | grep -c "error TS"` **13**.

  **Research: warn or block, answered from an implementation rather than from recall.** The ML
  item below had to put a mixed-generation run somewhere, and the two places are not
  equivalent: `coverage_warnings` is read by a human and gates nothing, while
  `promotion_check`'s `blockers` stop a promotion — and writing a new promotion rule means
  editing the shipped manifest, which is hard guardrail 8 and the owner's call. scikit-learn
  draws exactly this line and draws it explicitly. Read from its own source — another
  project's implementation, not a paper and not a standard, since `scikit-learn.org` and
  `en.wikipedia.org` both refuse this network:

  ```
  sklearn/exceptions.py       @ 1.5.2  http=200 bytes=6058   sha256 635e992922c815c6b95cf11d84bd0f06d5bd1d58e4adeb335e2864d17ae61618
  sklearn/exceptions.py       @ 1.7.1  http=200 bytes=7703   sha256 09a6854b80d56ea86a52276203e70cbd33fa0d1eaa205984533ba2312e470de7
  sklearn/base.py             @ 1.5.2  http=200 bytes=53095  sha256 cd62bc6b3f5a6f16466c7eaa0ec91a83a83c91b93610d67e39c55fda85530c89
  sklearn/base.py             @ 1.7.1  http=200 bytes=47777  sha256 a2ad39c5ff6491d04c35738e942860def0e80d6800aeb1690cfd68bf46be8d91
  sklearn/utils/validation.py @ 1.7.1  http=200 bytes=108488 sha256 ae3c972e645e2d0ba00459e8f82ac540f0a670f474cc293875a95f4d63f0ccc2
  ```

  A **provenance** mismatch warns and continues: `BaseEstimator.__setstate__` (`base.py:372` in
  1.5.2, `:438` in 1.7.1, the same nine lines in both) calls `warnings.warn` — not `raise` — on
  `InconsistentVersionWarning`, a `UserWarning` subclass whose message says "This might lead to
  breaking code or invalid results. Use at your own risk." A **structural** mismatch raises:
  `_check_feature_names` (`validation.py:2697`) ends its comparison branch with
  `raise ValueError`, enumerating the unseen and missing names. And an **unstamped** artifact is
  given a name of its own rather than merged into the current one —
  `state.pop("_sklearn_version", "pre-0.18")` reads a version-less pickle as a *different*
  version and warns, not as one that matches.

  Pooling two extractor generations is the first kind: every index is present and well-formed,
  and nothing in the rows records how far apart two generations are. So it is named, counted,
  and left to the reader. `docs/feature-generation-pooling.md` §2.

  **ML: the backlog item closed, plus the reason it would not have worked.** Every clause of
  the 2026-09-16 item was re-checked against main rather than taken on trust and all of them
  still held: `model_version` and `input_schema_version` are written at
  `ml/prepare_crop_dataset.py:117-118` and `ml/run_pipeline.py:338-339` and listed in the CSV
  header at `:277-278`, and grepping the whole of `ml/` for either name returns those five
  write sites and **nothing that reads them back**. The item's own dates are its argument:
  `fallbackVersion` is `roi-calibrated-2026-09-18` today and was `-09-16` when the item was
  filed, and it moves when a feature's semantics change.

  `subgroups.feature_generation(row)` resolves a row's generation (snake_case and camelCase
  spellings of both fields, so one generation cannot split into two on spelling);
  `Coverage.generations` counts them; `coverage_warnings` emits one line naming and counting
  the pooled generations and a second for rows carrying no stamp beside stamped ones. Every
  run that already wrote `subgroup_warnings` gets it for free — `run_pipeline`,
  `train_visible_attributes` (3 call sites), `evaluate_dataset`, `external_manifest`.

  **The part the item did not know about, and it is worth more than the fix.** With the
  counting in place the warning would still never have fired on a real run.
  `run_pipeline.py:363` builds a narrow projection of each row (`decoded`) and passes *that* to
  `coverage()`, not the CSV row — and the projection carried `participant_id`, `session_id`,
  `device_id`, `toneIta`, `age_band` and `id`, neither version field. The generation of every
  row was invisible at exactly the place the check runs. The two fields are version strings,
  not identifiers, and the projection already carried three of the latter, so nothing about a
  person was widened.

  **Five source-line breaks, never of a test, and each one narrow enough to name what it
  protects.** Baseline `Ran 130 tests ... OK`; `ml/subgroups.py` restored byte-identical
  (sha256 `270cc66838e7e9bb5d1f57bcdfe5df710179010dbe235bf041ee81a1e2f9b076` before and after).

  ```
  1  if len(stamped) > 1:  ->  > 2                 FAILED (failures=2)   AssertionError: 0 != 1
  2  drop input_schema_version from the key list   FAILED (failures=1)   AssertionError: 0 != 1
  3  stamped = dict(cov.generations)  (fold in     FAILED (failures=2)   Lists differ: ['3 rows (100%) carry
     the unstamped rows)                                                 no feature generatio[112 chars]nd.'] != []
  4  remove both fields from decoded again        FAILED (failures=1)   'model_version' not found in
                                                                        'decoded.append({...' : run_pipeline's
                                                                        coverage projection dropped model_version
  5  ("model_version", "modelVersion") -> 1-tuple FAILED (failures=1)   'roi-calibrated-2026-09-18/2026-06-30.
                                                                        visible-face-crop.v1' != '/2026-06-30.
                                                                        visible-face-crop.v1'
  ```

  Break 3 is the one that shows the two clauses are independent: folding unstamped rows in with
  the stamped ones leaves every "two generations" assertion green and fails only the two cases
  about unstamped rows. Break 4 is the one that would have shipped a check that could not fire.

  **UI/UX: `/studio`'s read editor cut its own prefilled text in three of five locales.** Found
  by sweeping every public route × 5 locales for controls under 44px and for elements whose
  `scrollWidth` exceeds their `clientWidth`, then measuring the rendered text width of each
  field against the box it gets. The name field is a fixed `width: 96` — 94px of content box —
  which is wider than the Korean labels it was sized for and narrower than the translations the
  same field is prefilled with. Measured in Chromium, as needed-minus-available in px, negative
  = clipped:

  ```
  field   locale  value                  @360    @320
  name    en      "Pores/texture"        -14.7   -14.7
  name    ar      "المسام/الملمس"         -23.2   -23.2
  value   en      "Fairly comfortable"   +21.7   -18.3
  value   ja      "落ち着いている"           +23.4   -16.6
  ```

  The name box does not depend on the viewport, so en and ar cut the label at **every** width,
  desktop included. Widening the name inside one line is not available and that was measured
  rather than assumed: at 320px the en value already needs 137.3px against a 119px box, so
  taking width from the value makes the narrow viewport worse. The name takes its own line
  instead (`flex-basis: 100%` on a wrapping row). After: every field has **85.7 to 323px** of
  headroom at 320/360/393/430 in all five locales, the worst case being the en value at 320px.

  `tests/e2e/studio-label-fit.spec.ts` asserts both halves — a width floor alone would pass a
  field wide enough to tap that still cuts its label, and a clipping check alone would pass a
  20px field showing all of a one-character value. Reverting the one style to `width: 96`
  fails **5 of 10**, naming the fields: `Item 2 name="Pores/texture" sw=109 cw=94`,
  `اسم العنصر 2="المسام/الملمس" sw=117 cw=94`, `Item 4 value="Fairly comfortable" sw=137 cw=119`,
  `項目4の値="落ち着いている" sw=118 cw=101`. ko and zh pass at both widths, which is right —
  they never clipped.

  **Bug fix: `savePilotNote`, and the ordering is the fix rather than a detail of it.** The
  cycle 25 finding. It was the only device store in the repo with no `window` guard, no cap and
  no try/catch, running a bare `localStorage.setItem` from `/pilot`'s click handler. What a
  full or blocked store cost was not only the note: the `QuotaExceededError` escaped into
  React, so the next statement — `setCurrentPilotSession` — never ran, and `/scan` reads that
  scope on every consent toggle to pass `participantId` / `sessionId` into
  `recordConsentEvent`. An unestablished scope means every consent event for that participant
  lands unscoped, and participant scope is what the participant-grouped cross-validation needs.
  So the scope is now written **first**, from its own small key, and the note's failure cannot
  take it down; `setCurrentPilotSession` is guarded too, since it had the same defect.
  `savePilotNote` returns `PilotNote | null` like `recordConsentEvent` and `saveCropSample`,
  and caps at 500 like `lib/labels.ts`.

  `/pilot` now reports a refused write and **keeps the typed fields**, which is the same test
  cycle 25 applied to `recordCareIntent` and lands on the opposite answer: there, nothing on
  screen claimed the write had happened, so an error row would have reported a failure the user
  did not experience. Here the form clears and the roster re-reads, so a dropped note looks
  like a note that was never typed. Four source-line breaks, `lib/pilot.ts` restored
  byte-identical (sha256 `5ee254d2f9dbfe0795fa7002a9e7b89ec4e3d6494ef924b91502ee3a3f27633c`):

  ```
  drop the note write's try/catch     2 failed | 5 passed   expected [Function] to not throw an error
                                                            but 'QuotaExceededError: quota' was thrown
  write the scope AFTER the note      1 failed | 6 passed   expected null to match object { participantId: 'P007' }
  drop the cap                        1 failed | 6 passed   expected [ ...(501) ] to have a length of 500 but got 501
  drop setCurrentPilotSession's       1 failed | 6 passed   QuotaExceededError: quota
    try/catch
  ```

  **One break that did NOT bite, said plainly rather than dressed up.** Deleting the
  `typeof window === "undefined"` guard from `savePilotNote` leaves all 7 cases green. Under
  Node there is no `localStorage` binding at all, so the write throws a `ReferenceError` that
  the same try/catch two lines down swallows, and the function returns null by the other route.
  The SSR case is kept as a behavioural pin and the test file says so at the assertion; what
  the guard actually buys — that the SSR path returns without attempting the write, the
  convention the six sibling stores follow — is not observable from there.

  **The `shareUrl` item was worked and deliberately not implemented, which is what the brief
  asked for.** `docs/share-return-path-decision.md` lays out five options with what each costs
  and recommends one, and the item stays open because the decision is the owner's. The reason
  it is not a one-line change, stated from source rather than asserted: `moodShareUrl` needs
  `{ oil, redness, pores }` as integers 0-2 and `/studio` does not have them — its state is a
  headline string and four `{ label, value, calm }` rows filled from free-text inputs whose
  purpose is that the user rewrites them. Option C (reverse-map the edited text through
  `MOOD_LABELS`) is rejected on evidence rather than taste: the two shipped presets already
  contain strings with no mood axis to map to, so the derivation yields nothing the moment
  anyone types.

  **Rotation, proved rather than asserted.** Across the cycle-23 move alone:
  `docs/AUTOPILOT.md` **1669 -> 1621**, `docs/autopilot-changelog.md` **4966 -> 5204**; after
  the two backlog items moved as well, **1632** and **5260**. (This paragraph and the
  verification block below it were written after that measurement, so the committed file is
  longer again — `wc -l` on the commit is the authority and the deltas above are the
  rotation's, not the whole cycle's.) "Recent cycles" holds 26/25/24. Cycle 23 moved verbatim:
  **17,054 bytes, 237 lines, sha256
  `998fe4316e480280bfdd35cdab8d3197f9a23c6938af3e2763d95b1e7ed81b9d`** on both sides, `diff`
  empty. Both `[x]` items moved to "Closed backlog items" under their original headings with
  the original wording preserved as a blockquote. Normalising both files' non-blank lines
  (strip leading whitespace and `>`, strip trailing whitespace, `sort -u`) and running
  `comm -23 before after` leaves **nothing at all** — **5628** unique lines before, **5847**
  after.

  **One thing the rotation turned up that a reader should know.** The local `main` and
  `origin/main` refs in this checkout are **stale at `a243b69` (cycle 21)**, four commits
  behind the `ab23796` the brief names and the commit this branch was actually cut from. The
  first byte-identity check was run against `main` and returned an empty file rather than an
  error, which looks exactly like a failed extraction; it was re-run against `ab23796`. Any
  cycle diffing "against main" in this container is diffing against cycle 21.

  **Verification, on the finished tree.** `npm run smoke` green (`Smoke test passed.`),
  vitest **615 passed in 91 files** (608 plus the 7 in the new pilot file), mobile E2E
  **62 passed** (the 52 measured on `ab23796` at the top of this cycle, plus
  the 10 new `/studio` locale x width cases), `python3 ml/selftest.py` **Ran 130 tests ... OK** (121 plus the 9 new
  `FeatureGenerations` cases), `npm run lint` **0 errors, 2 warnings** — the same two — and
  `npx tsc --noEmit | grep -c "error TS"` **13**, unchanged.

  `lib/skin.ts` is byte-identical to `ab23796`, and so are
  `public/models/visible-attributes/manifest.json` (`status`, `promotionGate` and
  `minQwkGainOverHeuristic` included), `ml/external_datasets.json`, `lib/consent.ts` and
  `next.config.ts`. `NEXT_PUBLIC_FUNNEL_FLUSH` was not set, no consent kind was invented and
  neither stream was merged, no dataset licence tier moved, and no face-image path changed.

  **Supervisor review.** The share decision is the part worth reading, and this review's
  own pre-analysis of it was worse than the branch's.

  *A reviewer error, and it is the substantive kind.* Before the branch arrived this
  review worked the same item and recommended **A** — mood link when the card came from a
  scan — on the argument that it "never claims a reading the user did not make" and that
  it reuses a decision `/scan` already shipped. **That argument is wrong**, and
  `docs/share-return-path-decision.md` §3A says why: `/studio` is the editing surface, its
  `reads` come from free-text `<input>`s whose whole purpose is rewriting
  (`app/studio/page.tsx:140-141`), so a user can edit "유분 적음" to anything while the
  link still encodes the scan's level. It does not claim a reading they never took; it
  claims one they **edited away from**, in front of a stranger. Two more things this
  review missed and the branch did not: the card has FOUR rows against the mood link's
  THREE, so 전반 has no level at all, and a preset-prefilled session has no levels in any
  form. **Option E did not occur to this review** and is better than A — send
  `moodShareUrl(levels)` only while every value still matches its prefill, bare origin
  otherwise — because it takes B's floor and A's ceiling and makes the contradiction
  unrepresentable rather than merely unlikely. The branch's recommendation stands; this
  review's is withdrawn.

  What this review did establish and the branch confirms independently: the levels ARE
  in hand at prefill (`lib/skin.ts:13`, `Bucket` carries `level: SkinLevel`) and are
  simply dropped by the mapping, and `fromScan` already records preset-vs-real. Those
  narrow the question; they do not decide it.

  *Right call on scope.* `shareUrl` stayed OPEN — `grep -c` finds it in
  `docs/AUTOPILOT.md` and NOT in the changelog — so the decision was written up without
  the item being closed on the owner's behalf. `app/studio/page.tsx` changed for an
  unrelated locale-clipping defect, not for this.

  *The ML claim holds and its guard is narrow.* On main, `ml/run_pipeline.py` wrote
  `model_version` and `input_schema_version` into the CSV (lines 338-339, declared at
  277-278) but the `decoded` projection that `subgroups.coverage()` actually consumes did
  not carry them — so a pooling check would have had nothing to read. Removing those two
  projection lines again fails exactly one test, named for the defect:
  `FAIL: test_the_pipeline_projection_carries_the_fields_coverage_reads`, 1 of 130. One
  narrow break, one identifying failure.

  *The pilot fix bites on both halves.* Restoring the bare uncapped
  `localStorage.setItem(KEY, ...)` fails 3 of 7 with both symptoms:
  `expected [Function] to not throw an error but 'QuotaExceededError: quota' was thrown`
  and `expected [ …(501) ] to have a length of 500 but got 501`. The write-order argument
  is correct and load-bearing: the scope is written before the note because `/scan` reads
  `getCurrentPilotSession()` on every consent toggle, so a lost scope makes every
  subsequent consent event unscoped — which is what participant-grouped cross-validation
  needs.

  *Rotation, against a pre-review snapshot of main.* 1669 → 1647 and 4966 → 5260, and
  `comm -23` finds **18 lines missing**, all 18 from the two backlog items this cycle
  closed (`savePilotNote`, and the feature-generation pooling rule), both present in the
  changelog. "Recent cycles" holds 26/25/24.

- 2026-09-22 (cycle 27) — Branch `autopilot/2026-09-22-0039`. **Threshold fitting stopped
  pooling two feature generations in silence — the half cycle 26 left open, closed the way it
  said: one shared warning, from one definition, read by both `coverage()` and `ml/calibrate.py`.
  `/checkin`'s empty-state links reach the 44px tap contract in every locale, and the reason
  `ja` was the one that missed is written down: 43.0px was the height the stylesheet actually
  asked for, and the four locales that read 45.0 were the accident. And `--tap-min: 44px`, the
  number every UI cycle leans on, finally has a source: WCAG 2.5.5 AAA, verified against the W3C
  repository's own text.**

  **Baselines, measured here on a clean tree before any edit; they match the supervisor's.**
  `node_modules` was absent, so `npm ci` first. `npm run smoke` green with the chromium override
  at `/opt/pw-browsers/chromium-1194` (`Smoke test passed.`), vitest **615 passed in 91 files**,
  mobile E2E **62 passed (3.4m)**, `python3 ml/selftest.py` **Ran 130 tests ... OK**, `npm run
  lint` **0 errors, 2 warnings** (the same `_reads` / `_result` at `lib/care.ts:72`),
  `npx tsc --noEmit | grep -c "error TS"` **13**.

  **Research (자료조사): where `--tap-min: 44px` comes from.** It has been a magic number since it
  was introduced — no comment or doc named the standard behind it, though the UI track reaches for
  it every cycle. Verified against the W3C WCAG repository's own source on
  `raw.githubusercontent.com` (`w3.org` refuses this network) and Material's own `dimens.xml`:
  **WCAG 2.5.5 Target Size (Enhanced), level AAA is "at least 44 by 44 CSS pixels"**, which is the
  figure ARU uses; the AA floor (2.5.8, added in WCAG 2.2) is 24px, and Material Android is 48dp.
  So ARU holds itself to the AAA target, and a 43.0px control is a real miss against ARU's own
  bar, not against the legal minimum. Both criteria's **Inline** exception (a target constrained
  by the line-height of surrounding text) does not apply to `/checkin`'s standalone block CTAs,
  which is why the fix is a minimum-height, not a line-box tweak. Fetch URLs and sha256s in
  `docs/tap-target-provenance.md`; the value now carries a one-line citation at
  `app/globals.css:35`.

  **ML: `ml/calibrate.py` now reports a mixed-generation run, the other half of the pooling item.**
  Cycle 26 gave every run through `coverage()` a warning when it pooled two extractor generations,
  but threshold fitting never goes through `coverage()`: `ml/calibrate.py` reads its JSONL directly,
  so a pre-09-16 and a post-09-16 reading still landed in one cut-point fit with nothing said. The
  two clauses were lifted out of `coverage_warnings` into `subgroups.generation_warnings(counts,
  total)` — one definition, so the wording, the ordering and the warn-not-block decision cannot
  drift between the two readers — and `calibrate.py` calls it, reading each export row's version out
  of `meta` first (where the app nests it) and the flat row second (where `prepare_crop_dataset`
  writes it). A mixed run still produces thresholds: what to DO about pooled samples is the
  `inputSchemaVersion` decision, and is not a cycle's to make. `subgroups.py` and `calibrate.py`
  restored byte-identical after each break (sha recorded), `ml/selftest.py` now **Ran 137 tests …
  OK** (7 new), and two source-line breaks were confirmed to fail exactly the new cases and no
  others: raising the pooling clause to `> 2` failed 4 (incl. both readers' agreement test,
  `AssertionError: 1 != 2`), and dropping `meta` from `sample_generation` failed 3+1
  (`'unstamped' != 'roi-calibrated-2026-09-18/...'`). `docs/feature-generation-pooling.md` §5 named
  this as the remaining half.

  **UI/UX: `/checkin`'s empty-state links reach 44px in every locale, and the cause is recorded.**
  Cycle 26 measured `マイレポートを見る` at 155.0x43.0 against ko/en/zh/ar at 45.0 — 1px under
  `--tap-min` on the surface every re-engagement mail lands on, and covered by no test (the two
  existing cases measure the home link and seed a purchase so the empty state never renders).
  Measured in Chromium at 360x800, all five locales compute the SAME `font-size: 14px` /
  `line-height: 21px` on these links, so 21 + 2×11 padding = 43px is the height the CSS asks for;
  `ja` was the only locale that got it, because ko/en/zh/ar fall back to a font whose baseline sits
  2px off the strut's and a line box is the union of strut and inline boxes, not the taller of them.
  So the four "correct" locales were the accident. `ctaBase` now carries `minHeight:
  var(--tap-min)` + flex centring — the same shape `pill()` and `flow-steps` already use — which
  makes the height locale-independent instead of nudging a padding that would move all five and fix
  none. Re-measured: ja 155.0x**44**, all others ≥45, doc overflow 0 in every locale. Guarded by 5
  new per-locale cases in `tests/e2e/checkin-touch-target.regression-1.spec.ts`; breaking the fix at
  its source line (removing `minHeight` from `ctaBase`) failed exactly the `ja` case,
  `AssertionError: ["マイレポートを見る 155x43"] != []`, and the other 10 passed.

  **Bug fix: none this cycle, said plainly rather than dressed up.** Hunted across `/api/out`'s
  placement handling, the public funnel ingest (`redactFunnelEvent`, `originAllowed`,
  `summarizeFunnel`, `funnelDropoff`), the unsubscribe HMAC token, `lib/recommend.ts`'s scoring and
  `budgetLabel` (checked against the survey's stored band ceilings — they match), and
  `mergeVisionAnalysis`. Every candidate resolved to intended, already-tested behaviour; the one
  smell found (a redundant outer `t()` in `mood-from-link.tsx`) is a no-op that returns its input
  on a dictionary miss, so it cannot be broken into a failing test and does not meet the guard bar.
  The account is at `seven_day / allowed_warning`, so rather than manufacture a narrow break of
  sound code, this track is reported as producing nothing — which the guardrails bless over a
  dressed-up measurement.

  **Verification, pasted from the runs that produced it.** `npx vitest run` → `Test Files 91 passed
  (91) / Tests 615 passed (615)`. `npx tsc --noEmit | grep -c "error TS"` → `13`. `python3
  ml/selftest.py` → `Ran 137 tests ... OK`. `npm run lint` → `0 errors, 2 warnings` (`lib/care.ts`).
  Full `npm run smoke` with the chromium override → `Smoke test passed.`, its Playwright leg `67
  passed (3.2m)` (62 baseline + 5 new empty-state cases). One false alarm worth recording so the
  next cycle does not chase it: a backgrounded smoke run exited 144 (SIGTERM) because the command
  began with `pkill -f "next dev"`, whose pattern matched the worker's OWN shell command line and
  killed it — the product was fine; re-run in the foreground with no `pkill`, it passed.

  **Rotation.** `docs/AUTOPILOT.md` 1699 → 1485; `docs/autopilot-changelog.md` 5260 → 5588. Cycle 24
  moved verbatim to the changelog bottom, and the two backlog items this cycle ticked `[x]` — the
  `ml/calibrate.py` generation-handling item and the `/checkin` 43px item — moved to "Closed backlog
  items" under "### Next" with their original text preserved as a blockquote. Proof in the PR body:
  `wc -l` before/after both files and a `comm -23` preservation check.

  **Supervisor review.** Kept deliberately cheap — the account is at
  `seven_day / allowed_warning`, the worker was told to be economical, and so was this.

  *The fix is the right shape, and this review's framing of the defect was the wrong way
  round.* Before the branch arrived this review read `ctaPrimary` (`padding: "11px 18px"`,
  no `minHeight`, no `line-height`), concluded the height is 22px plus whatever line box
  the fallback font gives, and measured five locales under a plain `system-ui` stack:
  38–40px, varying by locale, all flattened to exactly 44.0px by `min-height` + inline-flex.
  That confirmed the mechanism and the remedy. It also framed **`ja` as the outlier**, and
  the branch shows it is the opposite: all five compute `line-height: 21px`, `21 + 22 = 43`
  is what the stylesheet asks for, and `ja` is the only locale that gets it. The other four
  are 45px because their glyphs fall back to a font whose baseline sits 2px off the strut's,
  and a line box is the UNION of the strut and the inline boxes on that baseline rather than
  the larger of the two. The four "correct" locales were the accident.

  *What this review could and could not confirm of that.* Forcing the strut explicitly
  (`line-height: 21px`, one declared family plus fallbacks) gives **43.0px in all five**
  here, with `line-height` and `font-size` computing identically across them — so the
  arithmetic and the direction hold. The 2px split does NOT reproduce in this container,
  because the fonts that cause it are not installed and every locale resolves to the same
  fallback. Stated as a limit rather than a contradiction: the branch measured the app,
  this review measured a reconstruction without the app's fonts.

  The fix itself takes the `minHeight` + flex idiom and names the two places that already
  use it (`pill()`, `app/components/flow-steps.tsx`) rather than nudging a per-locale
  number, which is what the backlog item asked for and what this review was watching for.

  *The ML guard bites narrowly.* Making `sample_generation` read only the flat spelling —
  so a row the app wrote, nesting the fields under `meta`, reads unstamped — fails 4 of 137
  with the names doing the identifying:
  `ERROR: test_calibrate_reports_two_generations_in_one_threshold_fit`,
  `FAIL: test_calibrate_finds_the_versions_the_app_export_nests_under_meta`,
  `FAIL: test_both_readers_say_it_in_the_same_words`.

  *Scope held where it mattered.* `shareUrl` is still open — `grep -c` finds it in
  `docs/AUTOPILOT.md` and not in the changelog — so three cycles running have now declined
  to guess a decision that is the owner's.

  *Rotation.* 1699 → 1485 and 5260 → 5588; `comm -23` finds **21 lines missing**, 20 from
  the two backlog items this cycle closed and the 21st the `Last updated:` date.
  "Recent cycles" holds 27/26/25.

  *One admission that belongs in this file rather than a scratchpad.* The new backlog item
  about four dead i18n keys carried by `en.ts` and `ar.ts` and by neither `ja.ts` nor
  `zh.ts` is a finding this supervisor made during cycle 21, judged "cosmetic, not worth a
  push", and left in a scratch note. Cycle 26 re-derived it from nothing. A finding that
  stays out of this file is one a later cycle pays for twice.

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

  **Supervisor review.** The ML defect is real, its guard bites narrowly, and the app-side
  twin was checked rather than assumed.

  *The mechanism, confirmed.* `nan < lo` and `nan < hi` are both false, so strictly-less
  bucketing sends NaN to level 2 — `node` prints `NaN -> 2`, `Infinity -> 2`,
  `-Infinity -> 0` for the oil cuts. Restoring a bare `float(features[feat])` at the
  grading call site in `ml/run_pipeline.py` fails 3 of 142, all in `NonFiniteFeature`:
  `test_a_non_finite_feature_is_not_graded_as_the_top_level`,
  `test_the_dropped_rows_are_reported_rather_than_skipped_in_silence`, and an ERROR in
  `test_a_missing_feature_value_does_not_take_the_run_down`.

  *The app-side twin cannot fire, and that was checked.* `lib/skin.ts` grades with the
  same expression in `bucket()` (line 408) and `levelFor()` (line 823), and the branch
  deliberately leaves both alone — "the screen belongs at the call site" — which is right,
  since changing the comparison would open a fake accuracy gap between app and heuristic.
  What decides whether the app is exposed is whether its three graded features can go
  non-finite, and they cannot on finite inputs: `shineIndex` divides by `(cheekL || 1)`,
  `redChromaticity` by `(r + g + b || 1)`, and `cov` by `(cheekL || 1)` (line 1197). The
  defect was confined to the pipeline, where CSV cells arrive as strings and `None`.

  *Scope held.* `lib/skin.ts` and the manifest are untouched; no exported column moved;
  `shareUrl` is still open, a sixth cycle running.

  *Rotation.* 1325 → 1348 and 6176 → 6312; `comm -23` finds **1 line missing**, the
  `Last updated:` date. "Recent cycles" holds 30/29/28.
