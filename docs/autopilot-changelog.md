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

### Next

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
