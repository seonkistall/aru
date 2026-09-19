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
`Math.pow(., 2.4)` on the phone profile that matters, because that is now the only
open question, and it is a speed question rather than a correctness one.

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
