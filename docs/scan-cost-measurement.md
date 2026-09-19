# What a scan costs, and where the time goes

Backlog item: *"Measure the real per-scan cost of the new within-image indices on a
mid-range phone profile, not on the build container."* Cycle 15, 2026-09-19.

Everything below is output of
`ARU_PRINT_SCAN_COST=1 npx vitest run tests/scan-cost-benchmark.test.ts`, which is
committed. Four independent runs of the final code were taken; each figure is the
median of 7 repeats within a run, and where a range is given it spans all four runs.
No number here was typed by hand.

## 0. What a container measurement is and is not

This box is not a mid-range phone and nothing here turns it into one. **No device
multiplier is applied anywhere**, and none should be invented from these numbers: a
phone differs in clock, memory bandwidth, cache size, thermal headroom and JIT tier,
and those do not compose into one factor. The phone-shaped half of the question stays
where it already sits, in the physical-device blocker.

What a container *can* establish, and what this document therefore claims:

- the work per frame in pixels, exactly, by counting rather than timing;
- how each phase scales with frame size;
- the split between phases, and the share each takes of a scan **on this box**;
- whether a particular line is resolvable at all against the measurement's own noise.

One more caveat, from this cycle's own experience. An earlier arrangement of this same
benchmark could not resolve §3's clipped-channel branch — its deltas were ±15µs and
changed sign between frame sizes. The committed arrangement resolves it consistently
across four runs. A difference this small is sensitive to how the benchmark itself is
laid out, so the number to trust is the one the committed file reproduces, and the
right way to check it is to run it again rather than to quote this page.

## 1. The two structural facts

Both are counted, not timed, and both are pinned as default cases in
`tests/scan-cost-benchmark.test.ts`.

**`sampleRegion` does not scale with frame size.** It reads a fixed 9x9 patch around
each landmark in six lists — 13 + 14 + 8 + 7 + 7 + 7 = 56 patches, 81 pixels each,
**4,536 pixels per frame**, identical at 400x480 and at 1440x1920. Only
`detectBlemishes` reads pixels in proportion to the face, and even it walks a grid of a
fixed ~90 cells across the face width.

**The 650ms tick does not run any of this.** `app/scan/use-quality-loop.ts` calls
`evaluateCapturedQuality` -> `evaluateSkinRoiQuality` in
`app/scan/skin-roi-quality.ts`, which takes only the `SAMPLING_LANDMARKS` constant from
`lib/skin.ts`. `analyzeSkinBurst` runs **once per scan**, over **at most three** burst
frames (`app/scan/use-capture-analysis.ts`, `for (let i = 1; i < 3; i += 1)`). So the
clipped-channel branch runs 6 regions x 3 frames per scan, not per preview tick. The
cycle brief that asked for this measurement assumed the per-tick reading; it is not
what the code does, which changes the budget the answer is measured against.

## 2. Where a scan's time goes, on this box

`analyzeSkin`, one frame, ms per call:

| frame | analyzeSkin | analyzeSkinBurst (3 frames) |
|---|---|---|
| 400x480 | 6.60 – 6.86 | 19.68 – 20.43 |
| 720x960 | 8.03 – 8.35 | 24.25 – 24.74 |
| 1080x1440 | 9.53 – 10.02 | 28.67 – 28.96 |
| 1440x1920 | 11.39 – 11.63 | 34.38 – 35.31 |

By phase, one frame. `frameGains` is `frameChannelGains`; `rest` is `analyzeSkin` minus
the other three and is a difference of independently timed medians, so it carries all
of their noise and should be read as "small", not as a figure:

| frame | 6x sampleRegion | frameGains | detectBlemishes | rest | face box px | grid cells |
|---|---|---|---|---|---|---|
| 400x480 | 1000 – 1025 µs | 22 µs | 5.21 – 5.34 ms | 0.26 – 0.52 ms | 41,472 | 16,290 |
| 720x960 | 1007 – 1015 µs | 20 µs | 6.81 – 6.86 ms | 0.26 – 0.39 ms | 149,299 | 18,291 |
| 1080x1440 | 1003 – 1020 µs | 20 µs | 8.12 – 8.27 ms | 0.26 – 0.51 ms | 335,923 | 18,291 |
| 1440x1920 | 978 – 995 µs | 20 µs | 9.92 – 10.17 ms | 0.48 – 0.84 ms | 597,197 | 18,291 |

**`detectBlemishes` is 79–87% of a scan**, and it is mostly not the pixels. Over the
three frame sizes that share a grid of 18,291 cells, its cost fits
**5.8 ms fixed + 6.9 ns per face-box pixel** — so at 720x960 the whole pixel pass is
about 1.0 ms of 6.8, and the other 5.8 ms is per-cell work at roughly **315 ns a cell**.
The face box grows 14.4x from the first row to the last; `detectBlemishes` grows 1.9x.

`sampleRegion` is flat within 4.8% across that same 14.4x range, which is the timed form
of §1's counted claim.

## 3. Cycle 14's clipped-channel branch, isolated

`sampleRegion` gained `if (r >= 255 || g >= 255 || b >= 255) clipped += 1;` per sampled
pixel. It is isolated by rebuilding `lib/skin.ts` with exactly that line removed and
timing both builds — the shipped function, not a copy of it. If the line is ever
reworded the sweep throws rather than silently measuring nothing, and a default case
pins the text it looks for.

Sixteen measurements, four runs x four frame sizes, all of them positive:

```
delta per frame   44.1 .. 72.5 µs, median 58.4 µs
delta per pixel   9.7 .. 16.0 ns, median 12.9 ns
```

So, stated as the scan's own budget: **about 58 µs a frame and about 175 µs a scan** —
**0.7% of `analyzeSkinBurst` at 720x960**, and **constant in frame size**, because the
4,536 pixels it runs over are constant.

Read that as an **upper bound on the branch itself**, not as its exact price. Deleting
the line also deletes the `clipped` accumulator and shrinks the function body, which
moves V8's inlining decisions; the ablation measures the branch plus whatever the
smaller body unlocks. 12.9 ns for three integer comparisons is well above what the
comparisons alone can cost, which is the visible sign of that.

The honest summary is that the branch is real, resolvable, and small: it costs under a
thousandth of the analysis it sits in, and the burst path multiplies it by three rather
than by a frame count.

## 4. What the measurement found instead, and what was done about it

**`rgbToLab`, called once per valid grid cell, is the single largest thing in a scan.**
Replacing the call with a cheap expression takes `detectBlemishes` from 5.21 ms to
1.27 ms at 400x480 and from 9.92 ms to 3.86 ms at 1440x1920:

| frame | rgbToLab, ms | share of detectBlemishes | share of analyzeSkin |
|---|---|---|---|
| 400x480 | 3.91 – 3.97 | 75% | 59% |
| 720x960 | 4.75 – 4.80 | 70% | 59% |
| 1080x1440 | 5.27 – 5.41 | 65% | 55% |
| 1440x1920 | 6.07 – 6.20 | 61% | 53% |

That ablation changes the `a*` values and therefore which cells survive suppression, so
it over-attributes somewhat and is an upper bound too. It is **not fixed here** — see
§5.

**The non-skin exclusion test was 2.7–3.0 ms per frame and is now nearly free.** It ran
all ~42 `NON_SKIN` points against each of ~18,000 grid cells. `cy` depends only on the
row, so a point further than `excludeR` in y alone can never be within `excludeR`, and
the predicate is a plain OR over the points: dropping those points once per row is
**exactly the same test**. Eyes, brows, lips and nostrils each occupy a narrow y band,
so most rows keep a handful of points or none.

Measured by rebuilding `lib/skin.ts` with the point-by-point loop restored, after
asserting both builds return the same count and the same area:

| frame | row-filtered | point-by-point | saved per frame | saved per scan (3 frames) |
|---|---|---|---|---|
| 400x480 | 5.18 – 5.43 ms | 7.47 – 8.43 ms | 2.19 – 3.00 ms | 6.6 – 9.0 ms |
| 720x960 | 6.61 – 6.83 ms | 8.93 – 9.75 ms | 2.33 – 2.92 ms | 7.0 – 8.8 ms |
| 1080x1440 | 7.99 – 8.22 ms | 9.84 – 10.64 ms | 1.86 – 2.41 ms | 5.6 – 7.2 ms |
| 1440x1920 | 9.99 – 10.21 ms | 11.01 – 11.83 ms | 0.99 – 1.62 ms | 3.0 – 4.9 ms |

**Independently corroborated on a fixture chosen against the change** (supervisor,
2026-09-19). The row filter wins by dropping points that sit outside a row's y band, so
a face whose `NON_SKIN` points are SPREAD in y rather than clustered is the unfavourable
case for it. Re-measured on exactly that — 468 landmarks placed around an ellipse, so
eyes, brows and lips do not cluster — `detectBlemishes` goes 5.592 / 5.583 ms
point-by-point to 3.640 ms row-filtered at 400x480, and 6.602 / 6.915 to 4.833 at
720x960: **1.95 ms and 1.94 ms saved, 35% and 29%.** Lower than the table above, which
is what an adversarial geometry should give, and it is the floor the change is worth
even when the face works against it. (At 1440x1920 the same fixture spreads 0.12 to
2.05 ms across two runs — too noisy there to bound anything, and reported as such.)

**No published value moves**, which is the condition a performance change has to meet
here. `fallbackVersion`, `ATTR_THRESHOLDS` and `inputSchemaVersion` are untouched, and
so is the manifest. Two guards, both default cases: `blemishCount` and `blemishDensity`
are pinned to the values the pre-change build produced on a fixture whose discs sit
inside the nostril group's exclusion band in y, and the row-filtered and point-by-point
predicates are re-derived over the real grid at five radii and asserted to mark the same
cells. Reverting the row filter leaves the count pin green — which is the proof — and
fails only the source pin.

## 5. What was not done, and why

**`rgbToLab` is left alone.** The obvious win, a 256-entry lookup for the sRGB transfer
curve, is not available: the inputs are `Math.min(255, channel * gain)`, floats rather
than integers, so a table is an approximation and an approximation moves `blemishCount`.
The other available win — `detectBlemishes` reads only `lab.a`, so `fz` and the `z` dot
product are dead — means either a second entry point beside `rgbToLab` or a branch
inside it, and `ml/ita.py` mirrors this function. Adding a near-duplicate of a function
that already has a cross-language twin is how `shine_ratio` and `shine` became two
formulas under one name, which is an open backlog item. It needs a deliberate decision
about which side owns the fast path, not a quiet third copy. Filed, not taken.

> **Taken 2026-09-19, cycle 17, and the table above needs reading with care because of
> it.** `lib/skin.ts` now has `labAStar`, an `a*`-only entry point that `rgbToLab`
> itself calls, so there is one implementation of `a*` and not two; the cross-language
> declaration and the tolerance it needs are `ml/index-parity.json`'s
> `primitives.rgb_to_lab` group. **The 53-75% in the table above does not transfer to
> that fast path.** This ablation replaces the whole call with `{ l: L, a: r - g,
> b: g - b }`, which removes the three `Math.pow(., 2.4)` calls; an `a*`-only path
> keeps all three and drops only `z`, one `f()` and the object. Measured directly
> (`C4`, eight runs), the fast path saves **1.4-7.8% of `detectBlemishes`** at the
> three smaller frame sizes and is not resolvable at 1440x1920. The transfer curve
> itself, ablated on its own (`C5`), is **37-61%** — that is where the rest of this
> table's number lives, and taking it needs a measurement of how far `a*` can move
> before `blemishCount` does. `docs/rgb-to-lab-parity.md`.

> **Answered 2026-09-19, cycle 18, and the answer is no.** The measurement the
> paragraph above asks for is `docs/blemish-perturbation-tolerance.md`
> (`ARU_PRINT_BLEMISH_TOLERANCE=1 npx vitest run
> tests/blemish-perturbation-tolerance.test.ts`). Below **1.046e-5** a* units no
> per-cell error can change `blemishCount` on the worst of twelve frames measured, and
> a 256-entry table is nowhere near that: read at its nearest entry it is off by
> **0.470** and moves the count from **6 to 7** at 400x480, and read with linear
> interpolation it is off by **5.0e-4**, 48 times the radius, passing on this fixture
> by luck rather than by property. The curve stays. The smallest table measured that
> clears every frame is **4096 entries interpolated (1.9e-6)**, and whether that is
> faster than `Math.pow(., 2.4)` is now the only open question — a speed question, not
> a correctness one.

**No timing assertion runs by default.** A duration threshold fails on a loaded CI box
while nothing in the product is broken. The default cases count pixels, pin source
lines and pin values; every timing lives behind `ARU_PRINT_SCAN_COST`.

## 6. For completeness: what the 650ms tick does cost

`evaluateSkinRoiQuality`, the reader the preview loop actually runs, reads three ROI
rectangles in full and so scales with pixels the way `detectBlemishes` does not:

| frame | evaluateSkinRoiQuality | share of the 650ms tick |
|---|---|---|
| 400x480 | 0.88 – 0.90 ms | 0.14% |
| 720x960 | 3.15 – 3.18 ms | 0.49% |
| 1080x1440 | 7.06 – 7.14 ms | 1.09% |
| 1440x1920 | 12.76 – 12.94 ms | 1.96 – 1.99% |

On this box that is comfortable at every size. It is the number a phone measurement
should be taken against first, because it is the one on a repeating budget; a scan's own
analysis happens once, behind pacing that already spends two 140 ms waits and an 825 ms
step.
