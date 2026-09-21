# How far a* can move before blemishCount changes

Measured 2026-09-19 (cycle 18). Re-derive everything here with:

```
ARU_PRINT_BLEMISH_TOLERANCE=1 npx vitest run tests/blemish-perturbation-tolerance.test.ts
```

Every number below is that command's output. Nothing in `lib/` was changed to produce
it, and nothing in `lib/` is changed by it.

## 0. The question, and why it was the blocking one

Cycle 17 measured where a scan's time goes and found the sRGB transfer curve: ablating
`Math.pow(., 2.4)` takes **37-61%** out of `detectBlemishes`, against the **1.4-7.8%**
the `a*`-only fast path buys (`C5` and `C4` in `tests/scan-cost-benchmark.test.ts`,
`docs/scan-cost-measurement.md` §5). The obvious way to take that is a lookup table.

The objection is that a table is an approximation and `blemishCount` is a published
value. `detectBlemishes` picks local maxima of a* against a local background and
suppresses neighbours, so an error far below any threshold can still flip which cells
survive. The backlog item that came out of cycle 17 put it this way: the missing number
is not "is the error small" but **"is the error smaller than the gap between the cells
that survive and the cells that do not"**.

## 1. What is measured, and how

`detectBlemishes` classifies each grid cell: a cell is counted when its residual
(`a*` minus the mean `a*` of the valid cells within 5 cells of it) clears
`BLEMISH.minResidual = 1.6` **and** it is the maximum residual in its 5x5
neighbourhood. The count changes only when some cell changes its classification.

A copy of `lib/skin.ts` is rebuilt with one hook, inserted at the point where
`labAStar`'s results are consumed and before anything reads them — the same
source-rewriting machinery `tests/scan-cost-benchmark.test.ts` uses for its ablations.
The hook receives the a* grid and can add whatever error field the caller wants.

Two numbers bracket the answer and they are different claims:

- The **certified radius**. Below it, *no* per-cell error bounded by delta can change
  the count, whatever its shape, because no cell can change its classification. It is
  computed from the margins of the run itself. A cell's residual moves by at most
  `2*delta` (its own a* by delta, its background by at most delta the other way) and a
  *difference* of two residuals by at most `4*delta`, so each cell's own safe radius is
  its distance to the floor over 2, or to its best neighbour over 4, and the radius is
  the minimum over every valid cell.
- The **achieved radius**. The smallest delta at which a perturbation this file
  actually applies *does* change the count. It is an upper bound on the worst case: a
  cleverer assignment might manage it with less.

## 2. The certified radius, over the fixture family

One frame is an anecdote, so the same synthetic face is rendered at three noise
amplitudes either side of the committed 9 — noise is what puts cells near the floor,
so it is the knob that moves the margins — and read at all four frame sizes.

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

**The smallest is the number that matters** — an approximation has to beat the worst
frame it will ever see, not the median one — and it is `1.046e-5` a* units. The spread
across twelve frames is two and a half orders of magnitude, which is why reporting one
number without the distribution would have been misleading.

## 3. The achieved radius, and an asymmetry worth knowing

On the committed fixture (noise 9), searched by doubling from 1e-9 and halving inside
the rung that moves the count:

```
frame        certified   lift one  drop 5x5
400x480       1.786e-4   1.254e+0   4.552e+0
720x960       4.588e-4   1.237e+0   8.175e-3
1080x1440     2.332e-3   1.264e+0   9.978e-3
1440x1920     2.625e-4   1.272e+0   8.766e+0
```

`lift one` is a single cell pushed up: the uncounted local maximum closest to the
floor. It takes about **1.25 a\* units** at every frame size, because on this fixture
the best noise peak sits around a residual of 0.35 and the floor is 1.6.

**Removing a count is not the mirror image of adding one.** Dropping the most marginal
counted cell by *twice* the margin that would take it under the floor leaves the count
exactly where it was, at all four sizes: the cell it was suppressing becomes the local
maximum and is counted in its place. A count comes off only when the suppression
neighbourhood goes with it, which is what the `drop 5x5` column does. That is pinned as
a case, not described here and left unchecked.

Shapes that know nothing about the frame need about the same order:

```
frame        checkerboard  random(1)  random(2)    uniform
400x480        1.254e+0    2.258e-3    1.096e+0        null
720x960        1.250e+0    1.150e+0    4.156e-3        null
1080x1440      1.305e+0    8.228e-1    4.908e-1        null
1440x1920      1.272e+0    1.154e+0    3.903e-1        null
```

Two things to read out of that table. The random rows vary by three orders of magnitude
between two seeds, which is what a bound built on "we tried some error fields" is worth.
And `uniform` never moves the count at all, to 64 a* units: the detector subtracts a
local background precisely so that a device shifting every a* in the frame by the same
amount reads the same, and that property is the control this harness is checked against.

## 4. So what does a lookup table actually cost?

The same machinery builds `lib/skin.ts` with `srgbLinear` replaced by a table over the
0-255 channel domain and nothing else changed, so the a* difference it produces **is**
the approximation error on the inputs `detectBlemishes` feeds — stride-window means
times a gray-world gain, which are floats and not integers, which is the whole reason a
table is an approximation here.

```
table          frame        worst |da*|   count
256 nearest   400x480        4.703e-1       7
256 nearest   720x960        4.619e-1       5
256 nearest   1080x1440      4.658e-1       5
256 nearest   1440x1920      4.610e-1       5
256 linear    400x480        4.788e-4       6
256 linear    720x960        5.037e-4       5
256 linear    1080x1440      5.090e-4       5
256 linear    1440x1920      5.156e-4       5
1024 linear   400x480        3.026e-5       6
1024 linear   720x960        2.944e-5       5
1024 linear   1080x1440      3.068e-5       5
1024 linear   1440x1920      2.908e-5       5
4096 linear   400x480        1.849e-6       6
4096 linear   720x960        1.917e-6       5
4096 linear   1080x1440      1.865e-6       5
4096 linear   1440x1920      1.910e-6       5
```

The committed count at 400x480 is **6**, and the `256 nearest` row reads **7**. The
four frames here are the committed fixture at noise 9; the certified radii in §2 cover
the wider family.

## 5. The verdict: red light, and the number that would change it

**The 256-entry table the backlog item names is disqualified, and not by an argument.**
Read at its nearest entry it is off by **0.47 a\*** and it **moves `blemishCount` from
6 to 7** at 400x480 — a published value, changed, on the first fixture anyone tried.

**Interpolating it does not rescue it.** A 256-entry table read linearly is off by
**5.0e-4**, which is **48 times** the certified radius of the worst frame measured
(1.046e-5). It happens to leave the count alone on all four frames measured, and that is
luck rather than a property: the error is an order of magnitude above the margin at
which a cell of this fixture family can change its classification, and the one
approximation that was big enough to be checked against reality — the nearest-entry
table — moved the count at a magnitude (0.47) where the single-cell adversary still
needed 1.25. A real error field, correlated across neighbouring cells, is *more*
dangerous than an adversarial single cell of the same magnitude, not less.

So the curve stays as it is, and cycle 17 was right to stop where it did.

**What would change the answer is on the table above.** The smallest table measured
whose error clears the certified radius of every frame in the family is **4096 entries,
interpolated: 1.9e-6 against 1.046e-5**, a factor of 5.5 of headroom. 1024 entries
(2.9e-5) is still 2.8 times over the worst-frame radius and would be a
not-provably-safe table, the same objection one size down. A future cycle that wants
the 37-61% back should measure whether a 4096-entry interpolated table — 32KB of
doubles, a floor, two loads and a multiply-add — is actually faster than
`Math.pow(., 2.4)` on the phone profile that matters.

**That last paragraph is one step too confident, and the correction is the supervisor's**
(2026-09-19). The table's `worst |da*|` column is the error on the pixel values *these
four fixtures happen to produce*, because the rebuilt `lib/skin.ts` only ever converts
the cells a real frame hands it. It is not the worst case over the inputs
`detectBlemishes` will *accept*, and those are the ones a certificate has to cover: the
gate at `lib/skin.ts:958` is `L in [40, 230] && r > b` on the raw pixel, and the
conversion then runs on `channel * gain`. Swept over every input that clears that gate,
at gains 0.72 / 1.0 / 1.33:

| table | worst over the whole cube | worst inside the detector's gate | against 1.046e-5 |
|---|---|---|---|
| 1024 linear | 3.701e-4 | 1.962e-4 | does not certify |
| 4096 linear | 1.621e-5 | **1.251e-5** | **does not certify** |

The 4096 table's worst admissible input is around rgb(22, 35, 17) after gain — dark and
green-leaning, which passes `r > b` — and it is off by 1.251e-5 against a certified
radius of 1.046e-5. So **no table measured here certifies**, and the 5.5x of headroom
above is headroom on this fixture family rather than on the input domain. The §2 and §3
measurements are unaffected; what changes is that the open question is not only a speed
question. A table that wanted to certify would have to either go finer than 4096 or
carry an argument that the inputs near its worst case cannot reach the detector, and
neither is free.

Reproduce: the sweep is small enough to state in full — build the table over the 0-255
channel domain, interpolate linearly, and compare `labAStar` through it against
`labAStar` through `Math.pow`, filtering on the gate above.

Two limits on all of this, stated rather than implied:

- **One synthetic face.** The fixture family is three noise amplitudes of the same
  construction. Real faces are the golden-set blocker, and the certified radius is a
  minimum over ~18,000 cells, so a fixture with more cells near the floor would report
  a smaller one. Every number here is therefore an upper bound on what a real capture
  would allow, which is the conservative direction for a red light and the wrong
  direction for a green one.
- **The certified radius is stricter than the count.** It bounds "no cell changes
  classification", which is stronger than "the count does not change" — two cells can
  flip in opposite directions and leave the total alone, and on this fixture they
  evidently do, which is most of the gap between 1.0e-5 and 1.25. It is the right
  bound to hold an approximation to anyway: a table that relies on flips cancelling is
  not a table anyone should ship.

## 6. What guards the measurement

A harness that silently perturbs nothing would report an enormous tolerance and look
like good news, so the file checks itself before it reports anything:

- the rebuilt module with no perturbation installed reproduces the committed counts and
  densities at all four frame sizes, exactly;
- a 4.0 a* checkerboard moves the count at all four sizes, to a pinned 415/421/414/418;
- the test's replica of the detector's classification is asserted to produce the same
  count as `detectBlemishes` itself, on every frame it measures, before the oracle uses
  it to choose a target cell;
- `BLEMISH.minResidual`, `backgroundRadius` and `suppressionRadius` are read out of
  `lib/skin.ts` rather than copied into the test, and pinned, so moving one fails by
  name instead of re-measuring a different detector;
- the hook's anchor is pinned: rewording the line it is inserted in front of throws
  `perturbation hook: the astar consumer moved; the harness measures nothing`.

Checked by breaking, in that order (each break applied to the source line, never to the
test, and reverted):

```
BLEMISH.minResidual 1.6 -> 1.55      2 fail; BLEMISH.minResidual: expected 1.55 to be
                                     1.6, and 400x480 lift: expected 0.9597128738739016
                                     to be close to 1
BLEMISH.backgroundRadius 5 -> 4      7 fail; 400x480 committed count: expected 7 to be 6
srgbLinear 2.4 -> 2.41               3 fail; 400x480 certified: expected
                                     0.00017903110422778923 to be
                                     0.00017859239785300574
the hook's anchor comment reworded   6 fail; Error: perturbation hook: the astar
                                     consumer moved; the harness measures nothing
the hook perturbs a COPY of the      2 fail; 400x480: a 4.0 a* checkerboard left the
  grid (the failure mode itself)     count alone: expected 6 not to be 6
the "256 nearest" build silently     1 fail; expected [] to deeply equal
  interpolates (the verdict itself)  [ '256 nearest 400x480 -> 7' ]
```

The fifth is the one the file exists to rule out, and it fires. The sixth is the
verdict in §5 held as an assertion rather than as a sentence: of the four candidate
tables, exactly one moves a published count, and if it ever stopped doing so the file
would say so instead of the document quietly going stale.

## 7. The decision margin, and the guard the tolerance work could not produce

Added 2026-09-21 (cycle 23). Everything in §0–§6 asks how large an error the count can
absorb. This section asks the question one level down, which turns out to be the one
that catches things: **how much daylight is there under each count in the first place?**

### 7.1 Why the obvious guard was vacuous

Cycle 22 tried to assert that a realistic frame's `blemishCount` does not move under a
1e-16 perturbation of a\*. It does not move — but **seven source-line breaks of
`lib/skin.ts` were tried against that assertion and none made it fail**, so it shipped as
a printed measurement in `tests/blemish-tie-break.test.ts` rather than as a case. The
reason is structural: a uniform nudge cancels in `astar[i] - background`, so the
assertion is true of almost any detector, broken or not.

`certifiedRadius` (§2) contained the ingredient for a real guard and was not pointed at
it. It takes the minimum over EVERY valid cell, divides the two margins by the
amplification factors 2 and 4, and combines a counted cell's margins with `min` and an
uncounted cell's with `max` — the right input to a question about an approximation, and
the wrong one to a question about the count. It cannot tell a suppression tie from a
floor graze, it was only ever computed on the noisy fixture family, and it was pinned to
exact values rather than asserted to be **above** anything.

### 7.2 What is measured instead

Over the cells that actually survived, the raw distances, undivided:

- `peakGap` — the smallest `residual[i] - max(residual over i's suppression window)`.
  Zero exactly when a counted cell is tied with a neighbour and won on `j < i`.
- `floorGap` — the smallest `residual[i] - BLEMISH.minResidual`.
- `tiedPeaks` — how many counted cells have `peakGap === 0`. The census nobody took.

`noiseScale` is computed, not recalled: the local background is four reads of a
summed-area table over `gw*gh` cells, so `gw*gh * EPSILON * max|a*|` bounds the rounding
error one residual can carry, with room to spare.

### 7.3 The measurement

`ARU_PRINT_BLEMISH_MARGIN=1 npx vitest run tests/blemish-perturbation-tolerance.test.ts`:

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

Two things fall out of that pair of tables.

**The noiseless fixture's suppression margin is exactly zero, at every frame size.** One
tied count at the two smaller sizes, three at the two larger. That is the whole of cycle
22's blocked lookup table, stated as a property of the fixture rather than as a mystery
about the table: `tests/blemish-density-scale.test.ts` asserts agreement across
resolutions on a frame where one to three of its five counts are settled by scan order,
so the assertion holds for one bit pattern and a 1e-16 nudge moves it.

**The realistic frames clear their own noise by 1.2e6 to 3.2e8.** `MARGIN_RATIO` is set
to **1e4** and not to 1e6 for a reason that is in the table: the tightest row, noise 4 at
400x480, has a margin of 4.185e-5 a\* against a noise bound of 3.435e-11, a ratio of
1.218e6. A threshold of 1e6 would be "cleared" by 1.22x, which is a coin flip dressed as
a guard. At 1e4 the tightest row clears by 122x and the noiseless fixture still fails
with a margin of exactly zero, which is the comparison the guard exists to make.

### 7.4 Proving it bites: six source-line breaks, five of which fail it

Each break is one line of `lib/skin.ts`, never of the test. `lib/skin.ts` was restored to
byte-identical with HEAD afterwards and the restoration verified with `git diff`.

| break in `lib/skin.ts` | outcome | first assertion message |
|---|---|---|
| round the stride-window channel averages to integers | **FAILS** | `noise 4 720x960: the smallest suppression margin is 1.066e-14 a*, only 2.798e-4x the detector's own rounding error: expected 0.0002798453713286699 to be greater than 10000` |
| quantise the channel averages to steps of 8 | **FAILS** | `noise 4 400x480: 3 of 67 counts are settled by scan order, not by the image: expected 3 to be +0` |
| round the per-cell a\* to 3 decimals | **FAILS** | `noise 4 400 peak gap: expected 0.000041322314050518116 to be 0.000041849469386789906` |
| point-sample the stride window instead of averaging it | **FAILS** | `noise 4 400 counted: expected 8 to be 5` |
| dither a\* by cell index (the "fix" that hides a tie) | **FAILS** | `noise 4 400 peak gap: expected 0.0000418481966590889 to be 0.000041849469386789906` |
| quantise the residual to 3 decimals | **PASSES — did not bite** | — |

The first two are the ones that matter, because they fail on the **new** assertions: the
ratio against the noise bound, and the tie census. Rounding the channel averages to
integers collapses the smallest suppression margin from 4.185e-5 a\* to **1.066e-14** —
four orders of magnitude BELOW the detector's own rounding error — while leaving the
count unchanged, so nothing else in the suite notices. That is precisely the failure mode
the guard was added for. The other three fail on the pinned table, which any pin would
have caught.

**And the sixth is a real limitation, stated rather than hidden.** Quantising
`residual[i]` to 3 decimals inside `lib/skin.ts` leaves both margin cases green. The
cause is the harness: the replica recomputes the residual from the captured a\* grid, so
anything `lib/skin.ts` does downstream of a\* is invisible to these margins. The guard
covers the a\*-production path — which is where an approximation to the transfer curve
lands, i.e. the thing it was built for — and not the residual arithmetic. That break is
caught elsewhere, by three assertions in two other files:

```
tests/blemish-tie-break.test.ts     AssertionError: counts across resolutions: 2, 3, 2, 2, 2: expected 2 to be 1
tests/blemish-density-scale.test.ts AssertionError: the shipped build is supposed to agree: 2, 3, 2, 2, 2: expected 2 to be 1
tests/blemish-perturbation-tolerance.test.ts
                                    AssertionError: expected [ 413, 422, 415, 421 ] to deeply equal [ 415, 421, 414, 418 ]
                                    AssertionError: 400x480 lift: expected 0.9995971288583281 to be close to 1
```

### 7.5 How a reference implementation handles the same plateau

Read 2026-09-21 from another project's source, which is what this network can reach — not
from a paper and not from a standard. `scikit-image`'s `peak_local_max`, fetched from
`raw.githubusercontent.com`:

```
skimage/feature/peak.py @ v0.24.0   http=200 bytes=14427
  sha256 8d65f9a973a128a86c0d7a2689166bfa9768471e071c0fcb43f73e2863d3d85b
skimage/feature/peak.py @ v0.25.2   http=200 bytes=14478  (_get_peak_mask byte-identical to v0.24.0)
skimage/feature/peak.py @ v0.22.0   http=200 bytes=14970  (_get_peak_mask differs only in line wrapping)
skimage/_shared/coord.py @ v0.24.0  http=200 bytes=4337
  sha256 5d44f698e581e6f8b11c789489b91d638a363805964b8967c2e50bdcea65edbd
```

Two findings, and the first one is the reassuring one.

**ARU's tie convention is the conventional one.** `_get_high_intensity_peaks` sorts
candidates with `np.argsort(-intensities, kind="stable")` over `np.nonzero(mask)`
coordinates, then `_ensure_spacing` walks that order greedily and rejects anything within
`min_distance` of an already-accepted peak. A stable sort over row-major coordinates means
that among equal intensities the earlier index wins — which is exactly
`residual[j] === residual[i] && j < i`. So `lib/skin.ts:1091` is not an idiosyncrasy to
be fixed; what cycle 22 found is a property of the input, not of the rule.

**What ARU lacks is a degenerate-input branch.** `_get_peak_mask` carries one:

```python
    out = image == image_max

    # no peak for a trivial image
    image_is_trivial = np.all(out) if mask is None else np.all(out[mask])
    if image_is_trivial:
        out[:] = False
```

When every cell in the mask is a local maximum, it reports **no peaks at all** rather
than letting index order manufacture them. Stated plainly, because the distance matters:
that branch fires only when the field is ENTIRELY flat, and ARU's noiseless fixture is
plateau-dominated but not entirely flat, so a transplanted copy of it would not fire
there. It is not a drop-in fix and is not proposed as one. What it supports is the
principle the margin guard implements: a plateau-dominated field is a degenerate input
that a peak detector should NOTICE, and reporting a count from one without saying so is
the part ARU was missing.

### 7.6 The blind spot in §7.4 is closed: the margins now read the detector's own residual

Cycle 25. §7.4's sixth break — quantising `residual[i]` to 3 decimals inside
`lib/skin.ts` — was the one that **did not bite**, and the cause was the harness rather
than the product. `__perturbAStar` is injected before the summed-area tables, so every
residual this file reasons about is `residualsOf`'s reconstruction from the captured a\*
grid. Anything `lib/skin.ts` does downstream of a\* moves what the detector classifies
without moving a single number in the margin tables.

A **second hook** now reads the field the detector actually classifies.
`__observeResidual` is injected after the residual loop and before the classification
loop, against the anchor `let count = 0; let validCells = 0;`. It is a second hook and
not a widening of the first because the two read different arrays at different points,
and a replica that had silently stopped being the detector is precisely the failure being
guarded against. The new case asserts three things, in this order:

1. The detector's own residual equals `residualsOf`'s at **every valid cell, exactly**.
2. Classifying the detector's own residual reproduces the count `detectBlemishes`
   returned.
3. The pinned margins (`EXPECTED_MARGINS`, `EXPECTED_FLAT_MARGINS`) hold when re-measured
   on the detector's own field — an independent surface, since editing `residualsOf` to
   track a moved `lib/skin.ts` would satisfy (1) and still fail here.

**Break A — the one §7.4 recorded as passing.** `residual[i] = Math.round((astar[i] -
background) * 1000) / 1000` in `lib/skin.ts`. It now **fails**, first assertion:

```
AssertionError: noise 4 400x480: the detector's own residual differs from this file's
replica at 11789 of 11789 valid cells (worst |d| = 5.000e-4). Every decision margin in
this file is measured on the replica, so a change downstream of a* moves what the
detector classifies without moving a single number above it: expected 11789 to be +0
```

3 of 11 cases in this file fail; the other two are the certified-radius and lift
assertions §7.4 already listed.

**Break B — one nothing else in the tree catches.** Break A was already visible to two
other assertions in this file and to two other files, so it does not by itself show the
new hook adds coverage. `residual[i] = Math.max(-1e-9, astar[i] - background)` clamps
only residuals far below the `minResidual: 1.6` floor, so no cell can change
classification and every count pin stays green. Run across
`blemish-perturbation-tolerance`, `blemish-tie-break`, `blemish-density-scale`,
`skin-index-contract` and `scan-cost-benchmark` — **45 tests, 2 failed, both in this
file**, one of them the new case:

```
AssertionError: noise 4 400x480: the detector's own residual differs from this file's
replica at 6254 of 11789 valid cells (worst |d| = 1.588e+0): expected 6254 to be +0
```

`lib/skin.ts` was restored byte-identical after each break: sha256
`75cfb0a72728c0caa167d80cd85d8938496bf3d6322c90fa2a8b705a85b17b08` before and after, and
`git diff lib/skin.ts` empty.

### 7.7 `noiseScale` is a real upper bound, measured — and ARU's table is the less accurate of the two constructions

Every margin above is reported as a multiple of `noiseScale = gw*gh * EPSILON * max|a*|`,
and the guard `peakGap / noiseScale > 1e4` is what turns a margin into the claim that a
count is decided by the image. That bound was asserted in a comment and verified by
nobody. It is now measured.

**The reference, read 2026-09-21.** scikit-image's `integral_image`, from its own source
on `raw.githubusercontent.com` — another project's implementation, not a paper and not a
standard:

```
skimage/transform/integral.py @ v0.24.0  http=200 bytes=5096
skimage/transform/integral.py @ v0.25.2  http=200 bytes=5096  (byte-identical to v0.24.0)
  sha256 ed187d23b0b47dbb8457b67d451f9aa19e39237bf322c81a92fab5a1802927d6
```

Two things in it bear on ARU. It promotes float inputs to at least float64 "for better
accuracy and to avoid potential overflow" — ARU's `sumTable` is already a `Float64Array`,
so that precaution is already taken. And it builds the table as a **separable `cumsum`
along each axis**, where `lib/skin.ts` uses the one-pass inclusion-exclusion recurrence
`S = x + S[left] + S[up] - S[up-left]`. The recurrence **subtracts a partial sum at every
cell**; a cumsum never does. So the two are not obviously equally accurate, and ARU's is
the one with a mechanism to be worse.

**Measured**, both against `exactSum` over the window itself (an exact accumulation in a
non-overlapping expansion, rounded once, so the numbers below are the constructions' error
and not the reference's). The reference was checked before it was used rather than
assumed: `exactSum` returns `1` for `[1e16, 1, -1e16]` and `2` for `[1, 1e100, 1, -1e100]`
where naive summation returns `0` for both, it is order-independent over 10,000 values
(`exactSum(v) === exactSum(v.reverse())`), and on those same 10,000 values it agrees with
Python's correctly-rounded `math.fsum` to the last bit — `1790845758.191924` from both,
against `1790845758.191915` and `1790845758.1919322` for naive summation in the two
directions. `ARU_PRINT_BLEMISH_MARGIN=1 npx vitest run
tests/blemish-perturbation-tolerance.test.ts`:

```
frame               cells   aru (incl-excl)   skimage (cumsum)    noise bound   aru/bound   peak gap/aru
noise 4 400x480      11789        6.030e-14         1.069e-14      3.435e-11   1.755e-3       6.940e+8
noise 4 720x960      13227        6.523e-14         1.188e-14      3.803e-11   1.715e-3       5.206e+9
noise 4 1080x1440    13232        8.213e-14         1.130e-14      3.794e-11   2.165e-3      1.592e+10
noise 4 1440x1920    13230        7.905e-14         1.188e-14      3.796e-11   2.082e-3       2.092e+9
noise 9 400x480      11789        4.230e-14         1.192e-14      3.447e-11   1.227e-3      1.689e+10
noise 9 720x960      13227        7.622e-14         1.227e-14      3.813e-11   1.999e-3      2.408e+10
noise 9 1080x1440    13232        5.225e-14         1.106e-14      3.798e-11   1.376e-3      1.785e+11
noise 9 1440x1920    13230        5.573e-14         1.335e-14      3.801e-11   1.466e-3      1.884e+10
noise 14 400x480     11789        6.950e-14         9.881e-15      3.463e-11   2.007e-3       8.530e+9
noise 14 720x960     13227        8.180e-14         9.770e-15      3.820e-11   2.141e-3      9.960e+10
noise 14 1080x1440   13232        7.033e-14         1.324e-14      3.799e-11   1.851e-3      1.713e+11
noise 14 1440x1920   13230        6.645e-14         1.177e-14      3.808e-11   1.745e-3      5.672e+10
noise 0 400x480      11789        1.513e-13         2.724e-14      3.424e-11   4.418e-3              0
noise 0 720x960      13227        1.182e-13         2.347e-14      3.791e-11   3.118e-3              0
noise 0 1080x1440    13232        1.050e-13         2.347e-14      3.791e-11   2.771e-3              0
noise 0 1440x1920    13230        1.121e-13         2.347e-14      3.791e-11   2.956e-3              0
```

Three findings, and the order matters.

**The bound holds, with room.** ARU's worst background error is **4.230e-14 to 1.513e-13**
a\*, against a bound of **3.424e-11 to 3.820e-11**. It uses **0.12% to 0.44%** of the
bound — a headroom of 226x to 816x — so `noiseScale` is an upper bound on every frame
measured and the ratios the margin guard reports are multiples of a number that means what
it says. That is now an assertion (`aruWorst < noiseScale`) rather than a comment.

**The prediction from the cancellation argument is confirmed, and it does not matter
here.** The cumsum construction is **4.4x to 7.1x more accurate** than the
inclusion-exclusion one on every one of the sixteen frames, which is what a construction
with no subtraction in it should be. But ARU's error is **6.940e+8 to 1.785e+11 times
smaller** than the smallest suppression gap on the realistic frames, so the difference
between the two constructions is nowhere near able to change a count. Switching
`lib/skin.ts` to a separable cumsum would buy a factor of five on a quantity already ten
orders of magnitude below the decision it feeds. **No change is proposed and none was
made.** The number is recorded so the next cycle to look at this has it instead of the
argument.

**The noiseless fixture is the worst case here too**, at 1.050e-13 to 1.513e-13 against
4.230e-14 to 8.213e-14 for the noisy frames — roughly 2x. Its `peak gap/aru` column reads
0 because its peak gap is exactly zero, which is §7.3's finding and not a property of the
table; those four rows are excluded from the peak-gap assertion for that reason rather
than asserted against.

The count side of `windowMean` is deliberately not measured: `countTable` accumulates 0/1
into partial sums bounded by `gw*gh` (at most 13,232 here), every one an exactly
representable integer in float64, so the divisor carries no error.
