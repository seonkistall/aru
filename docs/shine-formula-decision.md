# `shine` had two formulas. Which one the product keeps, measured.

Backlog item: *"`shine_ratio` in `ml/skin_indices.py` and `shine` in `lib/skin.ts` are
two different formulas under one name."* Noted 2026-09-18, settled 2026-09-19 (cycle 16).

The item said deciding between them is a measurement, not a rename. It is, and the
measurement is not close. Everything below is the output of
`tests/shine-formula-decision.test.ts`, which is committed and re-runnable:

```
ARU_PRINT_SHINE_DECISION=1 npx vitest run tests/shine-formula-decision.test.ts
```

## The two formulas

```
rejected  (ml/skin_indices.py, until 2026-09-19)
          shine_ratio = tzone_specular / max(cheek_specular, 1e-6)

kept      (lib/skin.ts, and now ml/skin_indices.py)
          shine = tzoneSpecular + max(0, (tzoneL - cheekL) / cheekL) * (140 / 255)
```

`tzoneSpecular` is the share of the untrimmed T-zone patch above the 218 luminance
cut — a count fraction. `tzoneL` and `cheekL` are 0-255 frame luminance, not CIELAB L*.
`140` is `SHINE_REFERENCE_CHEEK_L`, argued at its definition in `lib/skin.ts`.

## The decision: the app's form, and the Python side moves to it

Five findings, each measured below. Any one of them settles it.

1. **The rejected form had no second input.** `cheek_specular` is not a field of
   `SkinRawFeatures` and never has been. `tzoneSpecular` is exported; there is no cheek
   counterpart. So the rejected form could not be computed from an ARU export at all —
   the measurement below had to reach for `sampleRegion` directly to obtain it.
2. **Nothing ever called it.** `ml/run_pipeline.py`, `ml/calibrate.py` and
   `ml/prepare_crop_dataset.py` all read the app's `shine` column straight out of the
   export. `shine_ratio()` was called only by `ml/selftest.py`. It was a declaration of
   what the index is, and the declaration was what was wrong.
3. **It is degenerate on a matte cheek**, which is the cheek a correct capture has.
4. **It has the wrong sign**: adding oil to the cheek lowers it.
5. **It cannot see the brightness gap**, which is most of the oil signal on skin that
   is not actively glinting.

And the property it was asserted to have — exposure invariance, the one thing
`ml/selftest.py` checked about it — is false on an actual frame.

## A. The oil range, cheek correctly exposed at cheekL 140

`tzGlint` and `ckGlint` are how many of each region's 81 sampled pixels are painted
above the specular cut, so the region's specular ratio is exactly `n / 81`. `lvl` is the
published oil level under `ATTR_THRESHOLDS.oil = [0.05, 0.16]`. Sixty rows print; the
ones that carry the argument:

```
tzoneL/cheekL  tzGlint  ckGlint   tzSpec    ckSpec     app shine  lvl      rejected  lvl
       1.08        0        0  0.000000  0.000000    0.042666  0     0.0000e+0  0
       1.08        2        0  0.024691  0.000000    0.067357  1     2.4691e+4  2
       1.08        2        1  0.024691  0.012346    0.067357  1     2.0000e+0  2
       1.08        2        2  0.024691  0.024691    0.067357  1     1.0000e+0  2
       1.08        2        5  0.024691  0.061728    0.067357  1     4.0000e-1  2
       1.08        8        0  0.098765  0.000000    0.141431  1     9.8765e+4  2
       1.08        8        5  0.098765  0.061728    0.141431  1     1.6000e+0  2
       1.00        0        0  0.000000  0.000000    0.000000  0     0.0000e+0  0
       1.20        0        0  0.000000  0.000000    0.110272  1     0.0000e+0  0
```

**The degeneracy, numerically.** Row 2 is a barely oily T-zone on a matte cheek. A matte
cheek has not "few" pixels above the cut but exactly **zero**, so the division is by the
epsilon and the reading is `tzoneSpecular × 1e6` — **24,691** where the app reads
**0.0674**. The face sets the numerator and `1e-6` sets everything else.

**The cliff.** Rows 2 and 3 are the same face one pixel apart. One cheek pixel in 81
crossing the cut takes the rejected form from 24,691 to 2.0, a factor of
`(1 / 1e-6) / 81 = 12,345.7`. That is not a sensitivity that could be calibrated out;
it is a discontinuity sitting at the only cheek state a good capture has. The app's
index does not move at all, because one cheek pixel is not oil.

**The sign.** Rows 2 through 5 hold the T-zone and add oil to the cheek: the rejected
form falls 24,691 → 2.0 → 1.0 → 0.4. An all-over-oily face reads matte. A
T-zone-against-cheek ratio measures where the oil is, not how much of it there is, and
the axis the product publishes is how much.

**The blindness.** Rows 8, 1 and 9 are three faces with no glint anywhere, differing
only in how much brighter the T-zone is than the cheek — the ordinary way an oily
forehead presents. The app separates them (0.0000 / 0.0427 / 0.1103) and publishes two
different levels. The rejected form returns **exactly 0 for all three**, because
`0 / 1e-6` is 0.

**The cuts do not apply to it.** Over all 60 rows the rejected form publishes only
levels 0 and 2, never 1: its middle band `[0.05, 0.16)` requires the cheek to be 6 to 20
times oilier than the T-zone. The app uses all three levels over the same sweep. Pinned
as a case.

## B. The exposure invariance it was asserted to have

`ml/selftest.py` asserted `shine_ratio(0.30, 0.10) == shine_ratio(0.30×1.7, 0.10×1.7)`.
That identity is true — of two numbers that both scale. **A specular ratio does not
scale.** It is the share of a patch above a *fixed* 218 cut, so an exposure gain moves
it by however many pixels happen to cross, a different number in each region.

One face, T-zone 10% brighter than the cheek, both regions carrying a ramp of highlight
brightness so the specular fraction responds to exposure the way a real capture does
rather than being painted on or off:

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
rejected form runs **0 → 49,383**. The app's index holds at 0.0943 / 0.0942 / 0.0943
over the three that share a specular state, **within 0.12% across a 1.5× exposure
range**, and then moves at cheekL 161 because the T-zone genuinely started to glint,
which is oil.

The rows the signals refuse are shown rather than trimmed, and the last one is worth
naming: at cheekL 206 the cheek itself starts to glint, the denominator becomes real,
and the rejected form drops from 444,444 to 2.86. The capture is refused for other
reasons, so this never reached a user — but it is the same cliff as row 2-3 of table A,
reached by over-exposure instead of by one painted pixel.

## What changed, and what did not

- `ml/skin_indices.py`: `shine_ratio(tzone_specular, cheek_specular)` becomes
  `shine_ratio(tzone_specular, tzone_luminance, cheek_luminance)`, computing the app's
  expression. `SHINE_REFERENCE_CHEEK_L = 140.0` is added, mirroring `lib/skin.ts`.
- `ml/selftest.py`: the invariance case moves with the formula and narrows on the way.
  The gap term is Weber contrast and cancels an exposure gain applied to both
  luminances, exactly, at three gains; the specular term is passed through rather than
  asserted invariant, because table B is what happens when you assert that it is.
- `lib/skin.ts`: the expression moves out of `extractRawFeatures` into an exported
  `shineIndex(tzoneSpecular, tzoneL, cheekL)`, **byte-for-byte unchanged**, so there is
  one formula for both languages to agree with. The absolute-value pins in
  `tests/shine-exposure-scale.test.ts`, `tests/axis-exposure-scale.test.ts` and
  `tests/skin-index-contract.test.ts` are what prove nothing moved.
- **No published value moved.** `ATTR_THRESHOLDS`, `fallbackVersion`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched. The Python function was never on a path that produced one — finding 2
  above is what makes that checkable rather than asserted.

## The contract that would have caught this

`tests/skin-index-contract.test.ts` pins NAMES: which feature key each index id maps
to, which columns carry it, that every calibrated feature is a field the app writes.
All of it stayed green from 2026-09-14, when `ml/skin_indices.py` was added, to
2026-09-19, while the two implementations computed different numbers. Five days, and
only because a cycle read both files side by side — not because anything checked. Names
were never the thing that could drift.

Python and TypeScript cannot call each other in this repository's test setup — vitest
in node, `unittest` in `python3`, no bridge and no network. So the cheapest honest
cross-language value check is a committed table: **`ml/index-parity.json`**, inputs and
one expected output each, asserted by `tests/index-parity.test.ts` and by
`ml/selftest.py`. Neither language can move alone. Two of the seven registry indices are
in it — 22 rows for `shine_ratio`, 11 for `tone_evenness` — and the mechanism takes
another index as a new group, not as a new file.

Three properties make it a contract rather than a snapshot:

- **The expected values are literals in the file**, recomputed by each side and compared
  **exactly** — not `toBeCloseTo`. The expression is `+`, `-`, `*` and `/` on IEEE
  doubles, all exact operations, so a matching implementation matches bit for bit.
- **Sixteen of the rows are real readings**, carrying the recipe of the frame that
  produced them, and `tests/index-parity.test.ts` rebuilds each frame and checks the
  whole path through `analyzeSkin` — not just the leaf function. Without that, moving
  which patch `tzoneSpecular` is measured over would leave every row green.
- **Six rows are edge cases the face family cannot reach**: the `cheekL || 1` branch, a
  T-zone darker than the cheek (the gap clamps at 0), a fully specular T-zone.

Regenerating it is a deliberate act, never a way to make a red test green:

```
ARU_PRINT_INDEX_PARITY=1 npx vitest run tests/index-parity.test.ts
```

## The same defect is still in the registry, once, and it is now dated

Checking finding 2 properly turned up something wider than the finding. **None of the
seven index functions in `ml/skin_indices.py` is called by any pipeline script.**
`run_pipeline.py`, `calibrate.py` and `prepare_crop_dataset.py` all read the columns the
app exported; the only caller of `melanin_index`, `ita`, `relative_redness`,
`tone_evenness`, `shine_ratio`, `roughness_ratio` and `blemish_density` is
`ml/selftest.py`.

So the registry is not executing code that could be checked against its output. It is a
**declaration of what each index is**, and the only thing that can catch a false
declaration is a contract that compares values. After this cycle there is one, covering
one of the seven.

One of the other six is the same defect. `FEATURE_KEY` declares
`relative_redness -> relRedness`, and the two compute different quantities: Python
returns an **a\* difference**, the app returns `rIdx(cheeks) - rIdx(tzone)`, a
difference of **red chromaticities** (`meanR / (meanR + meanG + meanB)`). Different
colour space, different scale, one declared field. Cycle 13 looked at this and recorded
"nothing to keep in step" — right about `cov`, which has no Python index at all and so
no declaration to be wrong, and wrong about this one.

Not fixed here, for the reason this cycle exists: deciding which is right is another
measurement — whether an a\* difference or a chromaticity difference is the more stable
within-image quantity — and `shine` is the worked example of what happens when you pick
a side without making it. Dated backlog item.

Of the remaining four, one is now checked and three are not.

`tone_evenness` claimed in its own docstring, since 2026-09-14, to be "the same formula
as `relativeSpread` in `lib/skin.ts`" — exactly the kind of claim this cycle found to be
false for `shine_ratio`, and equally untested. **It is true.** Both compute
`sqrt(variance) / abs(mean)` over the region L* values, return 0 below two values and 0
when `abs(mean) < 1e-6`, and the only difference is a non-numeric filter Python needs
and TypeScript's types make unnecessary. So it is pinned rather than fixed: 11 rows in
`ml/index-parity.json`, `relativeSpread` exported from `lib/skin.ts` for the test, and a
negative result recorded as a negative result.

It is pinned less deeply than `shine_ratio`, and the difference is worth naming.
`tone_evenness`'s inputs are the four region L* values, which `SkinRawFeatures` does not
export — only the result. So the rows pin that the two implementations agree on the same
inputs, and do not pin what reaches them. Adding a field to close that gap would be
adding a field because a test would like one, which is not a reason;
`tests/skin-index-contract.test.ts` already pins the value the path produces.

`roughness_ratio`, `blemish_density` and `melanin_index` have their names pinned and
their values unchecked.

## What this changes for the `rgbToLab` decision

Cycle 15 measured `rgbToLab` at 53-75% of `detectBlemishes` and did not take the win,
because `detectBlemishes` reads only `lab.a`, so a fast path would mean a second
near-duplicate of a function that has a cross-language twin in `ml/ita.py` — "which is
exactly how `shine_ratio` and `shine` became two formulas under one name"
(`docs/scan-cost-measurement.md` §5).

That reasoning was right about the risk and is now weaker about the remedy. What made
the `shine` split possible was not that two implementations existed; it was that
**nothing compared their values**, and the test that looked like it did compared
names. `ml/index-parity.json` is a worked example of the missing piece, and it cost one
JSON file, four TypeScript cases and one Python case.

So the honest position: a committed input/output table over `rgbToLab` — the same shape,
asserted in `tests/` and in `ml/selftest.py` — would remove the specific failure mode
cycle 15 named. It does not remove all of them. A fast path that returns only `a` is a
*partial* duplicate, so a parity table would have to cover the shared inputs and say
plainly which outputs the fast path does not compute, and `rgbToLab` involves `pow` and
a matrix, where exact cross-language equality is **not** guaranteed the way it is for
four arithmetic operations — a tolerance would have to be chosen and justified, which is
a measurement of its own.

Not taken this cycle, and not recommended as a one-liner. It is a smaller item than it
was, and the backlog entry now says why.

## The shape that made the old invariance case vacuous (supervisor, 2026-09-19)

`ml/selftest.py` asserted `shine_ratio(0.30, 0.10) == shine_ratio(0.30 * 1.7, 0.10 * 1.7) == 3.0`
— it scaled both **specular ratios** by an exposure gain. The decision above is right that
this is not what an exposure change does to a count fraction. The shape is worth having as
a measurement rather than as an argument.

On a face with a graded highlight (`rampCapture`, T-zone contrast 1.08), swept across the
exposure range:

| cheekL | tzoneSpecular |
|---|---|
| 92.0 | 0.00000 |
| 115.0 | 0.00000 |
| 138.0 | 0.00000 |
| 161.0 | 0.00000 |
| 184.0 | 0.39506 |
| 206.0 | 0.70370 |
| 223.7 | 0.95062 |

It is **exactly zero across the whole correctly-exposed part of the range** — the 조명
signal passes cheekL 70..210 and the first four rows are all inside it — then climbs
steeply and approaches the ceiling a fraction cannot exceed. So the deleted case's
transformation cannot even be applied where the product actually reads faces: every
multiple of zero is zero. Where the quantity does move, cheekL 184.0 to 206.0 is an
exposure ratio of 1.12 while the specular ratio moves by 1.78, and 206.0 to 223.7 is 1.09
against 1.35. A quantity that scaled with exposure would match them.

Pinned as a case in `tests/shine-formula-decision.test.ts`; printed by
`ARU_PRINT_SHINE_DECISION=1 npx vitest run tests/shine-formula-decision.test.ts`. Moving
the specular cut from 218 to 150 fails it (`expected 1 to be greater than or equal to 4`).
