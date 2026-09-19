# `rgbToLab` across two languages: how far apart they are, and what the fast path buys

Cycle 17, 2026-09-19. Two questions, in the order the brief set them.

1. How closely do `rgbToLab` in `lib/skin.ts` and `rgb_to_lab` in `ml/ita.py` actually
   agree today, before anything changes? This is what sets the tolerance in
   `ml/index-parity.json`, and it had to come from a measurement rather than from a
   round number.
2. With that in hand, is the `a*`-only fast path worth taking?

The answer to the second one is **yes, and for about a tenth of what the backlog item
promised**. That correction is the more useful half of this cycle.

Everything below is the output of two committed commands. Nothing was typed by hand.

```
ARU_LAB_PARITY_DUMP=/tmp/ts-lab.json npx vitest run tests/lab-parity-sweep.test.ts
python3 ml/lab_parity_sweep.py /tmp/ts-lab.json
ARU_PRINT_SCAN_COST=1 npx vitest run tests/scan-cost-benchmark.test.ts
```

## 1. The cross-language measurement

Cycle 16 left this open in exactly these words, in `docs/shine-formula-decision.md`:

> `rgbToLab` involves `pow` and a matrix, where exact cross-language equality is **not**
> guaranteed the way it is for four arithmetic operations — a tolerance would have to be
> chosen and justified, which is a measurement of its own.

It is not guaranteed, and it does not hold. 268,877 inputs — a 5-step grid over the
whole sRGB cube, plus 120,000 floats of the shape `detectBlemishes` actually feeds
(a stride-window mean times a gray-world gain, clamped):

```
== cube (148877 inputs) ==
                 exact           max   max/unit     median  p99/unit
L*  119084/148877   80.0%    2.8422e-14     1.1034    0.0e+00    0.5517
      worst at rgb=(250.000000, 165.000000, 190.000000)  ts=76.64990352956195  py=76.64990352956198
a*  101507/148877   68.2%    1.6342e-13     1.4720    0.0e+00    0.5120
      worst at rgb=(240.000000, 170.000000, 145.000000)  ts=22.67573567256148  py=22.675735672561316
b*  95530/148877   64.2%    5.6843e-14     1.2800    0.0e+00    0.6400
      worst at rgb=(20.000000, 15.000000, 240.000000)  ts=-101.0614680806361  py=-101.06146808063605

== skinFloat (120000 inputs) ==
                 exact           max   max/unit     median  p99/unit
L*  93547/120000   78.0%    2.8422e-14     1.1034    0.0e+00    0.5517
      worst at rgb=(177.213544, 212.629315, 141.672776)  ts=81.1361283959853  py=81.13612839598532
a*  79412/120000   66.2%    1.1369e-13     1.0240    0.0e+00    0.5120
      worst at rgb=(255.000000, 189.871197, 213.591294)  ts=26.857507534116586  py=26.8575075341167
b*  75606/120000   63.0%    4.9738e-14     1.1200    0.0e+00    0.5600
      worst at rgb=(138.212246, 156.235773, 89.894846)  ts=32.572507270168785  py=32.572507270168735

268877 inputs. Worst disagreement anywhere: 1.4720 units.
```

**The median disagreement is exactly zero in every channel and every family.** Most
inputs agree bit for bit — 63% to 80%, depending on the channel. The rest do not, and
the amount they differ by is small and bounded.

### The unit, and why it is not an arbitrary scaling

`max/unit` above is in multiples of `channelScale * 2^-52`, where `channelScale` is the
literal multiplier that channel's own expression applies to `f()`: 116 for `L*`, 500 for
`a*`, 200 for `b*`. That is not a convenience; it is where the number comes from.
`a* = 500 * (f(x) - f(y))` subtracts two quantities of order 1 and multiplies by 500, so
a last-place error in either `f()` arrives in `a*` scaled by 500 and by nothing else.

In those units the worst disagreement anywhere in 268,877 inputs is **1.472**, and the
99th percentile is **0.51 to 0.64**. In other words: where the two languages differ at
all, they differ by about one last place of the `f()` values, amplified by the channel's
own multiplier. That is the whole effect, and there is no tail beyond it.

### Where it enters: one of the two transcendentals, not both equally

```
   pow   V8 vs c ** 2.4 (as shipped)    exact 3820/4256 ( 89.8%)  worst 1 ulp
   cbrt  V8 vs t ** (1/3) (as shipped)  exact 4027/5000 ( 80.5%)  worst 2 ulp
   cbrt  V8 vs math.cbrt                exact 2289/5000 ( 45.8%)  worst 3 ulp
```

Neither library rounds `pow` or a cube root correctly, so both rows are two roundings
being compared, not one being checked against the truth.

The third row is the one worth pausing on. `math.cbrt` is the better cube root —
CPython 3.11 added it precisely because `t ** (1/3)` is not one — and swapping
`ml/ita.py` to it would make the two languages agree **less** often, 45.8% against
80.5%. So "make the Python side more correct" and "make the two sides agree" are
different goals here, and this file's contract is the second one. `ml/ita.py` keeps
`t ** (1 / 3)`, and now for a measured reason rather than by inheritance.

### The tolerance that follows

`ml/index-parity.json`'s `primitives.rgb_to_lab` group carries
`toleranceK: 4` and `channelScale: {l: 116, a: 500, b: 200}`. Both sides compute the
tolerance as `toleranceK * channelScale * 2^-52` rather than reading a float, so it
cannot be widened by editing a digit.

Why 4 and not the observed 1.472:

- The mechanism bounds the error at roughly **3 units** — one last place from each of
  the two `f()` calls, plus the `pow` errors on `rl`, `gl` and `bl` propagated through
  a cube root, which attenuates them by its derivative. 1.472 observed sits inside that.
- 4 is the smallest integer above the mechanism's bound, so it is headroom for a
  different libm rather than headroom for a different formula.

**A second, independent sampling says 1.024, not 1.472 — which is the argument for
preferring the mechanism bound** (supervisor, 2026-09-19). The same comparison run over
a different grid — 8,956 inputs, the whole cube at stride 17 plus a float grid at five
gains in [0.6, 1.6], which is the range `frameChannelGains` produces and therefore the
float inputs `detectBlemishes` really feeds — gives:

| | max | median | p99 | agree exactly |
|---|---|---|---|---|
| L* | 1.421e-14 | 0 | 1.421e-14 | 79.97% |
| a* | **1.137e-13** | 0 | 5.684e-14 | 68.78% |
| b* | 5.684e-14 | 0 | 2.842e-14 | 65.10% |

Worst a* case there: rgb(102, 238, 221), TypeScript −41.03720723193105 against Python
−41.037207231930935 — the 14th significant digit. In ULPs of the a* output scale
(`500 * 2^-52` = 1.110e-13) that worst case is **1.024**, where the sweep above found
1.472 on its own inputs.

Two different grids, two different observed maxima, both well inside the mechanism's
~3. That spread is the reason `toleranceK` is set from the mechanism and not from
`max observed × a safety factor`: the observed maximum is a property of which inputs you
happened to sample, and a tolerance derived from it would have been 44% tighter or
looser depending on the grid. The mechanism's bound does not move.

And what it still cannot hide. In `a*` the tolerance is **4.44e-13**, against a
`BLEMISH.minResidual` of **1.6** — twelve orders of magnitude — and about 1e-14 relative
on a skin `a*` of ~20. The defect this parity file exists to catch moves values by whole
units: `shine_ratio` read **24,691** where the app read **0.0674**, and
`relative_redness` returns an `a*` difference where the app returns a difference of red
chromaticities. Nothing of that kind fits inside 4.44e-13.

The committed table exercises it rather than declaring it. Of its 20 rows, **11 have at
least one channel where the two languages disagree**, and three rows are the worst
inputs this sweep found, one per channel — so the table reproduces 1.1034, 1.4720 and
1.2800 units, not a set of colours that happen to agree.

## 2. The fast path, and the correction it forces

`detectBlemishes` reads only `lab.a`. `labAStar` computes `a*` and skips `z`, the third
`f()` and the object literal. It is **not a second formula**: `rgbToLab` calls it, so
`a*` has one implementation in `lib/skin.ts` and the two cannot drift.

```ts
export function labAStar(r: number, g: number, b: number): number { ... }

export function rgbToLab(r, g, b) {
  ...
  return { l: 116 * fy - 16, a: labAStar(r, g, b), b: 200 * (fy - fz) };
}
```

`rgbToLab` now recomputes `rl`, `gl`, `bl` and `y` to do that. It is called about ten
times per scan against `labAStar`'s ~18,000, so the waste is bounded and the guarantee
is not. `tests/lab-parity-sweep.test.ts` checks the identity
`rgbToLab(r, g, b).a === labAStar(r, g, b)` over all 268,877 sweep inputs, by default.

One thing that identity does **not** pin, found by trying to break it. Rewriting
`a: labAStar(r, g, b)` as the inline `500 * (labF(x) - fy)` with the same white point
leaves all 268,877 inputs passing — the inline expression is the identical sequence of
doubles and therefore the identical double. The case pins that the two agree, not that
one calls the other. Perturbing the inline copy (white point 0.95048) does fire it,
`Error: labAStar disagrees with rgbToLab at 0, 0, 5`. What pins the delegation is the
source-text assertion in `tests/index-parity.test.ts`, and that is why it is there.

### What it saves

`C4` in `tests/scan-cost-benchmark.test.ts` builds two copies of `lib/skin.ts` — one
unchanged, one with the pre-cycle-17 `rgbToLab` and call site restored — and times them
alternately within each repeat. Both are freshly loaded modules, which matters: measured
the asymmetric way first, with the shipped build compared against one fresh module, the
"saving" changed sign between frame sizes and between runs, because the statically
imported `detectBlemishes` had already been driven through V8's tiers by four earlier
sections. That arrangement is a way to measure your own benchmark's history.

Both builds are asserted to return the same count and the same area before either is
timed, so this is a duration difference and nothing else.

One run of eight, verbatim:

```
   frame          labAStar   rgbToLab   saved(paired)   min..max        %
   400x480        3.319     3.560     0.202    0.162..   0.493    5.7%
   720x960        4.299     4.286     0.206   -1.031..   0.259    4.8%
   1080x1440      4.107     4.338     0.152   -0.208..   0.264    3.5%
   1440x1920      4.898     4.858     0.064   -0.181..   0.172    1.3%
```

Over eight runs x four frame sizes — 32 paired medians:

| frame | saved, ms/frame | % of detectBlemishes | positive |
|---|---|---|---|
| 400x480 | +0.048 .. +0.274 | +1.4 .. +7.6% | 8/8 |
| 720x960 | +0.082 .. +0.317 | +2.1 .. +7.8% | 8/8 |
| 1080x1440 | +0.115 .. +0.319 | +2.5 .. +6.3% | 8/8 |
| 1440x1920 | −0.075 .. +0.174 | −1.3 .. +3.3% | 6/8 |

Read that as it is. **At the three smaller frame sizes the saving is positive in every
one of 24 measurements, and it is small: 0.05 to 0.32 ms a frame, 1.4% to 7.8% of
`detectBlemishes`.** At 1440x1920 two of eight runs came out negative, so on this box
the change is **not resolvable there** and no saving is claimed for it — the grid is the
same 18,291 cells at all three of the larger sizes, so `labAStar` runs the same number
of times and the growing pixel-averaging pass dilutes it until it disappears into the
noise.

Per scan, which is three burst frames: roughly 0.15 to 0.95 ms off a scan that costs
6.6 to 11.6 ms. Real, and nothing like what the backlog item implied.

### What it does not save, which is most of it

`labAStar` still calls `Math.pow(., 2.4)` three times. `C5` ablates that line — the
sRGB transfer curve — and times the same way:

One run of eight, verbatim:

```
   frame          shipped   pow -> c*c   removed(paired)   min..max        %
   400x480        2.716       1.075     1.645    1.633..   1.649   60.6%
   720x960        3.653       1.695     2.028    1.674..   2.113   55.5%
   1080x1440      3.942       2.107     1.828    1.823..   1.971   46.4%
   1440x1920      4.973       3.487     1.987    1.294..   2.466   40.0%
```

Over the same eight runs, **32 of 32 positive** and never inside its own spread:

| frame | removed, ms/frame | % of detectBlemishes |
|---|---|---|
| 400x480 | +1.645 .. +2.054 | 59.4 .. 61.0% |
| 720x960 | +1.917 .. +2.312 | 51.6 .. 55.5% |
| 1080x1440 | +1.828 .. +2.303 | 41.7 .. 47.1% |
| 1440x1920 | +1.843 .. +2.376 | 37.3 .. 41.4% |

**The transfer curve is 37-61% of `detectBlemishes`, and no `a*`-only fast path can
reach any of it.** That is the number cycle 15 measured as "`rgbToLab` is 53-59% of a
scan", and the backlog item that followed it —

> `rgbToLab` is 53-59% of a scan and the fast path is still not taken

— read that as though a fast path could capture it. It cannot. Cycle 15's ablation
replaced the whole call with `{ l: L, a: r - g, b: g - b }`, which removes the three
`pow` calls; an `a*`-only path keeps all three and drops only `z`, one `f()` and an
object. The measured saving is what is left after that, and it is an order of magnitude
smaller than the figure it was filed under.

This is an upper bound too, in the same way §4 of `docs/scan-cost-measurement.md` is:
dropping the curve also changes which cells survive suppression, so it moves the inner
loop's work as well as its own cost. The ablated build's counts are not a reading and
are never read.

## 3. No published value moved, and that is checkable rather than asserted

`labAStar` computes `a*` with the identical sequence of doubles: same `srgbLinear`
calls, same `x` and `y`, same `labF`, same `500 * (fx - fy)`. IEEE 754 double arithmetic
is deterministic, so the result is not close to the old one, it **is** the old one.

The proof is that the pins did not have to move. `tests/scan-cost-benchmark.test.ts`
holds `blemishCount` and `blemishDensity` at four frame sizes against the pre-change
build. Applying the change and running the suite gave **one** failure in 535 —
`tests/scan-cost-benchmark.test.ts:232`, `expect(source).toContain(LAB_CALL)`, the source
text of the ablation needle, which the change necessarily reworded. The count and
density pins stayed green untouched, and so did every absolute-value pin in
`tests/skin-index-contract.test.ts`, `tests/shine-exposure-scale.test.ts` and
`tests/axis-exposure-scale.test.ts`.

`fallbackVersion`, `ATTR_THRESHOLDS`, `inputSchemaVersion` and
`public/models/visible-attributes/manifest.json` are untouched; `status` and
`promotionGate` are byte-identical. `NEXT_PUBLIC_FUNNEL_FLUSH` was not set anywhere.

## 4. What the next cycle should take from this

The remaining win in a scan is the sRGB transfer curve, and it is **not** a free one.
The inputs are `Math.min(255, channel * gain)` — floats — so a 256-entry table is an
approximation, and an approximation moves `a*`, and `detectBlemishes` picks local maxima
in `a*` and suppresses neighbours, so a change far below any threshold can still flip
which cells survive.

What would make that decision possible is a measurement nobody has done: **how far can
`a*` move before `blemishCount` changes?** Not "is the error small" but "is it smaller
than the gap between the cells that survive and the cells that do not", which is a
property of the fixture and of `BLEMISH.minResidual`, and is measurable with the
machinery already here. Until that number exists, any approximation of the curve is a
guess about a published value, and a performance change that alters a reading is not a
performance change.
