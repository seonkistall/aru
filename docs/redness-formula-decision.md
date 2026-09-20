# `relative_redness` had two formulas. Which one the product keeps, measured.

Backlog item: *"`relative_redness` in `ml/skin_indices.py` and `relRedness` in
`lib/skin.ts` are two different formulas under one declared name."* Noted 2026-09-19,
settled 2026-09-20 (cycle 19). The fourth index of this kind and the last one with a
genuine measurement behind it.

The item stated the question precisely and this is the answer to that question:
**which of an a\* difference and a chromaticity difference is the more stable
within-image quantity?** Not which is more standard, and not which one the app already
ships — `docs/shine-formula-decision.md` exists because picking a side without
measuring is what created the `shine` split.

Everything below is the output of `tests/redness-formula-decision.test.ts`, which is
committed and re-runnable:

```
ARU_PRINT_REDNESS_DECISION=1 npx vitest run tests/redness-formula-decision.test.ts
```

## The two formulas

```
rejected  (ml/skin_indices.py, until 2026-09-20)
          relative_redness = a*(target) - a*(reference)

kept      (lib/skin.ts, and now ml/skin_indices.py)
          relRedness = redChromaticity(cheeks) - redChromaticity(tzone)
          redChromaticity(r, g, b) = r / (r + g + b || 1)
```

Both are computed from the **same two `sampleRegion` outputs of the same frame**, so
nothing between them differs but the formula. The rejected column goes through the
shipped `labAStar`, not a paraphrase of it.

## The decision: the app's form, and the Python side moves to it

### A. An a\* difference is not scale-free

One face, exposure swept across the unsaturated part of the 조명 band. No channel
clips on any row.

| cheekL | chromaticity | a\* difference |
|---|---|---|
| 70.0 | 0.013064 | 1.82634 |
| 90.0 | 0.013144 | 2.29654 |
| 110.0 | 0.013155 | 2.73730 |
| 130.0 | 0.013079 | 3.10689 |
| 150.0 | 0.013390 | 3.61453 |
| 170.0 | 0.013363 | 3.95999 |
| **spread** | **1.0249** | **2.1683** |

The a\* difference **more than doubles** on one face whose skin did not change, and it
is monotone in the exposure: every step up in brightness reads as a redder face. What
is left of the chromaticity form's 2.5% is 8-bit rounding of the painted channel
values — the same residue `tests/axis-exposure-scale.test.ts` measured at 1.0587 on a
coarser sweep.

### B. Why, and it is arithmetic rather than an accident of the fixture

`a* = 500 * (f(x) - f(y))` with `f` a cube root above its knee, so a\* is homogeneous
of degree **1/3** in the linear signal; the linear signal is homogeneous of degree
**2.4** in the 8-bit channel. A common gain `g` therefore multiplies *both* regions'
a\* by `g^0.8` — and a difference of two things that both scale scales too. **It
factors out of the difference instead of cancelling in it.**

The docstring this replaces claimed the opposite: *"the difference between two regions
of one photo does not [move], because both regions went through the same sensor and
the same light."* That is true of an **additive** common term. A device or an exposure
is **multiplicative**, and only a degree-0 quantity survives one. Red chromaticity is
degree 0 by construction.

Checked against the shipped code rather than asserted:

| gain | shipped `labAStar` ratio | pure 2.4 power law | `gain^0.8` |
|---|---|---|---|
| 0.60 | 0.65561 | 0.66454 | 0.66454 |
| 0.80 | 0.83222 | 0.83651 | 0.83651 |
| 1.00 | 1.00000 | 1.00000 | 1.00000 |
| 1.20 | 1.16107 | 1.15703 | 1.15703 |

Under a pure power law the prediction is **exact to every printed digit**. The shipped
sRGB curve is affine-then-power, `((c + 0.055) / 1.055)^2.4`, and the offset does not
scale — which is why the shipped column sits *near* `g^0.8` without being it, and never
near 1.

The chromaticity form over the same scalings moves by at most **one ulp of 1.0**
(2^-52): each `redChromaticity` is one correctly-rounded division landing in (0, 1),
so each carries at most half an ulp and their difference at most one. Measured worst
over fourteen gains: exactly `0.5 * 2^-52`, that bound's own half.

### C. The comparison that decides it, across two different scales

A raw spread cannot compare two indices on different scales — it rewards whichever sits
further from zero. The comparable quantity is how far a **nuisance** moves an index
against how far a **real difference between faces** moves it. The denominator is four
faces of genuinely different redness at one capture; both forms order them, so this is
not a contest between an index and a constant.

**Nuisance / signal, lower is better:**

| nuisance | chromaticity | a\* difference | winner |
|---|---|---|---|
| exposure, cheekL 70..170 | **0.0209** | 0.5047 | chromaticity by 24.16x |
| melanin tone | **0.0227** | 0.2545 | chromaticity by 11.19x |
| white balance | **0.0624** | 0.2071 | chromaticity by 3.32x |
| tone curve (gamma 0.8..1.25) | 0.3930 | 0.4076 | chromaticity by 1.04x |
| veiling flare (black lift 0..30) | 0.1878 | **0.1822** | a\* by 1.03x |

The same rows as max/min spread: exposure 1.0249 / 2.1683, melanin 1.0266 / 1.4552,
white balance 1.0763 / 1.2956, tone curve 1.5922 / 1.6731, flare 1.2840 / 1.2977.

The chromaticity difference wins by an order of magnitude on the three nuisances
`docs/label-free-axes.md` names, and there is no sweep on which the a\* difference wins
by a margin that matters. **The app's form is kept.**

Two construction notes, because either would have changed the answer:

- The **melanin sweep is not a scalar darkening.** Melanin absorbs more at short
  wavelengths, so the model raises each channel to a different power
  (`s^0.75 / s^1.0 / s^1.2`). A scalar model would make this sweep arithmetically
  identical to the exposure sweep and the second table would be the first one twice.
- The **gamma and flare sweeps re-normalise the exposure**, because both change the
  frame's brightness as a side effect. Without that, a gamma sweep measures exposure as
  well and the comparison is between two confounded numbers. Uncorrected, the gamma
  sweep's a\* column reads *better* than it should, because the exposure term runs
  opposite to and smaller than the gamma term.

## What the measurement does NOT show, kept rather than trimmed

**On the two transfer-function nuisances it is a tie, in both directions.** A device
contrast curve costs both forms about 0.40 of their range and veiling flare about 0.18,
with a\* ahead by 3% on flare and behind by 4% on the curve. Neither form is invariant
to a camera that is not linear, and nothing in this cycle makes one so.

This is not free. On the shipped scale, gamma 0.8 to 1.25 with the exposure held takes
this face from **0.010348 to 0.016477** — across the `ATTR_THRESHOLDS.redness` 낮음/보통
cut of 0.012. **Moving the cut does not help**: the sweep straddles it wherever it is
put, and the same curve moves the rejected form by as much. It is a limit of reading
redness off an uncalibrated camera, and it is a cousin of the illuminant-correction item
already in the backlog — a face-region illuminant estimate is the remedy that would
address it, not a different redness formula. Pinned as a case so a later cycle claiming
the chromaticity form is simply the stable one has to fail a test to say so.

One face. Synthetic. The tables above are a property of `lib/skin.ts` on a fixture, not
a measurement of anyone's skin; the golden-set blocker is what would change that.

## What changed, and what did not

- `ml/skin_indices.py`: `relative_redness(target_astar, reference_astar)` becomes
  `relative_redness(target_rgb, reference_rgb)`, computing the app's expression.
  `red_chromaticity(r, g, b)` is added, mirroring `lib/skin.ts` including the
  `|| 1` black-region branch.
- `ml/selftest.py`: the invariance case moves with the formula and **stops conceding
  the defect in its own assertion.** It was named `..._up_to_scale` and divided by the
  gain to recover the plain value — which says, in the assertion, that the index was
  not scale-free. The replacement asserts invariance with nothing to divide by, to the
  derived one-ulp bound. A second case pins `g^0.8` on the rejected form, so the reason
  the Python side moved is arithmetic in the test suite rather than prose here.
- `lib/skin.ts`: the expression moves out of `extractRawFeatures` into an exported
  `relativeRedness(cheek, tzone)` and `redChromaticity(r, g, b)`, **byte-for-byte
  unchanged**, so there is one formula for both languages to agree with.
- `ml/index-parity.json` gains a `relative_redness` group: 8 `face` rows read through
  `analyzeSkin`, each carrying the frame recipe AND the two region mean RGBs
  `sampleRegion` produced, plus 9 `edge` rows. `covers: "formula and path"`.
- **No published value moved.** `ATTR_THRESHOLDS`, `fallbackVersion`,
  `inputSchemaVersion` and `public/models/visible-attributes/manifest.json` are
  untouched, because the app was already computing the form that won. The Python
  function was never on a path that produced a value: `run_pipeline.py`,
  `calibrate.py` and `prepare_crop_dataset.py` all read the app's `relRedness` column
  straight out of the export, and its old inputs were a\* values no ARU export carries.

## The rows had to be broken before they were worth anything

Six source lines altered, never the test, each reverted from a file copy:

```
redChromaticity  r/(r+g+b||1) -> r/(r+g+b+1)
    2 fail; cheekL 80 ...: expected 0.011632146391430398 to be 0.011694677871148473,
    and chromaticity at gain 0.6: expected 0.000020517273769837807 to be less than
    or equal to 2.220446049250313e-16
relativeRedness operands swapped
    3 fail; expected -0.011694677871148473 to be 0.011694677871148473
the call site stops delegating (values identical)
    1 fail; expected '/**\n * Visible-signal skin analysis.…' to contain
    'relRedness: relativeRedness(cheeks, t…'
labF Math.cbrt(t) -> Math.sqrt(t)
    1 fail; shipped labAStar at gain 0.6: expected 0.5451407988491981 to be close to
    0.664539805948974, received difference is 0.11939900709977591, but expected 0.05
python red_chromaticity (total if total else 1.0) -> max(total, 1e-6)
    1 fail; -0.4011393442622951 != 0.09836065573770492 : a region summing to 1e-9
python relative_redness operands swapped
    2 fail; -0.011694677871148473 != 0.011694677871148473
```

**The fifth is the one that earned its place, and it did not fail the first time.** The
group originally had two black-region rows and no row between zero and an epsilon, so
swapping Python's `total if total else 1.0` for `max(total, 1e-6)` agreed on a region of
exactly zero and `ml/selftest.py` stayed green: the rows located the branch *on* zero
and located nothing about *where it sits*. This is the same failure `tone_evenness`'s
2e-7 / 2e-6 pair was added to close, one index over. Two rows now straddle it — a region
summing to 1e-9 and the same chromaticity a million times larger, which must read the
same — and the break fails in both languages.

## The registry audit is finished, and `ita` is wrong too

`ita` was the last of the seven indices that was both unpinned and not yet known to be
wrong. Adding its parity group was filed as the cheap half of this cycle. It is cheap,
and it is not a negative result.

**Three implementations exist and only two agree.** `lib/skin.ts:itaDegrees` and
`ml/ita.py:ita_from_lab` both fall back to ±90 when `|b*| < 0.01`;
`ml/skin_indices.py:ita` — the registry's declaration of what the index *is* — used
`1e-6`, four orders of magnitude tighter.

That would be a rounding question if the fallback were continuous. It is not: **the ±90
fallback ignores the sign of b\***. So between the two guards the columns do not round
differently, they land 180 degrees apart:

```
 L*     b*        app        registry     note
 70   0.005    90.000000    89.985676     inside the app's guard, outside the registry's
 70  -0.005    90.000000   -89.985676     +90 against -90: light against deep
 30  -0.005   -90.000000    89.985676     the same, the other way, below the L* pivot
 70    1e-06   90.000000    89.999997     the registry's guard is `<`, so it computes here
 70    1e-09   90.000000    90.000000     inside both: they agree, at the fallback
 70   0.01     89.971352    89.971352     the app's guard is `<` too, so both compute
```

41 is the light cut and 10 the deep one (`ITA_BIN_EDGES`), so one column is above the
first and the other below the second — **opposite ends of the tone stratifier from one
frame.** `docs/tone-ita-verification.md` §3 is why the window is reachable rather than
arithmetic: a cool cast takes b\* through zero on a real fixture, from ITA 61.8 to
−87.6, so a capture travels through it.

**Neither column is pinned as correct.** Both implementations put the same
discontinuity in the same place in the formula and disagree only about where it sits;
deciding it means deciding what ITA should read when b\* is near zero, which is a
question about the stratifier and not about a guard. The group is `divergent`, like
`roughness_ratio`, and the backlog carries the decision.

Two things did change:

- `lib/skin.ts` gains `itaDegrees(lstar, bstar)` and both tone sites delegate to it.
  The expression was written out **twice, byte for byte**, in one file — the
  duplication the 2026-09-15 `confidenceLabel` finding is about. Byte-for-byte
  unchanged, so no published value moved; `tests/tone-ita-contract.test.ts`'s six
  reference-verified rows are what prove it.
- `ml/skin_indices.py:ita` converts with `* 180 / math.pi` instead of `math.degrees`,
  and this is the trade-off cycle 17 recorded for `ml/ita.py`'s cube root, in the same
  direction. `math.degrees` rounds **once** and is the more accurate expression;
  `lib/skin.ts` computes `(x * 180) / Math.PI` and rounds twice. Over **1,186,709**
  (L\*, b\*) pairs the two associations are bit-identical on **74.5%** and differ by up
  to **1.42e-14** degrees on the rest, which is **0.71** units of `90 * 2^-52`. With
  the app's association CPython and V8 agree bit for bit on every committed row, so the
  group's only remaining divergence is the one that matters. `ml/ita.py` keeps
  `math.degrees` — it is on the offline path and its outputs are pinned in a
  reference-verified fixture table — so `ml/selftest.py` holds it to the app's *guard*
  exactly and to the app's *value* within `2 * 90 * 2^-52`, the next integer above the
  measured worst.

Broken on purpose, both languages:

```
app itaDegrees guard 0.01 -> 1e-6
    1 fail; b* inside the app's guard and outside the registry's:
    itaDegrees(70, 0.005): expected 89.98567605542014 to be 90
one tone site stops delegating (values identical)
    1 fail; both tone sites must delegate: expected 1 to be 2
python ita guard 1e-6 -> 0.01
    1 fail; 90.0 != 89.98567605542014 : b* inside the app's guard and outside the
    registry's: ita(70, 0.005)
python ita back to math.degrees
    1 fail; 44.47436539354238 != 44.474365393542385 : ordinary light skin: ita(71.6, 22)
```

## Where the registry stands now

All seven indices in `ml/skin_indices.py` have their values checked, which is what
cycles 16 to 19 were for. `ml/index-parity.json` covers six of them; `melanin_index` is
the seventh and is the one index for which a value contract is the wrong instrument.

| index | pinned | outcome |
|---|---|---|
| `shine_ratio` | formula and path | **was wrong**, fixed cycle 16 |
| `tone_evenness` | formula | agrees; pinned as a negative result |
| `blemish_count` | formula | agrees; pinned as a negative result |
| `roughness_ratio` | formula, `divergent` | **disagrees**; which side moves needs faces |
| `relative_redness` | formula and path | **was wrong**, fixed this cycle |
| `ita` | formula, `divergent` | **disagrees**; 180° in the guard window |
| `melanin_index` | name only | **declaration is wrong**; no app-side value exists to declare |

`melanin_index` is not a gap this mechanism can close and the backlog says why:
`FEATURE_KEY` declares it to be `toneLstar` and it is a nonlinear transform of it
(`100 * log10(100 / L*)`, so 15.49 where the declared column holds 70), and no
TypeScript counterpart exists anywhere. There is no second column to pin. Closing it is
a decision about what `FEATURE_KEY` means — either the app computes and exports a
melanin index, which needs a reason beyond a test wanting one, or the registry gains a
second kind of entry for an index derived offline. Not a parity row.
