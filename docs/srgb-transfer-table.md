# The sRGB transfer table: measured, and not landed

Cycle 22, 2026-09-20. What the backlog item "Is a 4096-entry interpolated table for
`srgbLinear` actually faster than `Math.pow(., 2.4)`?" turned into. The table was
built, measured, and then taken back out, and the reason it came out is not the reason
anyone expected. **`lib/skin.ts` is unchanged by this cycle** — `git diff` against main
is empty for that file.

Short version, and every part of it is measured below:

- **It is faster**, by 42.0–61.2% of `detectBlemishes` and 37.6–48.9% of the whole
  `analyzeSkin`, at four frame sizes, 9/9 paired reps at every size.
- **The table the item named would not have been safe.** A 4096-entry table read with
  linear interpolation has an a\* error of 1.9e-6 on the synthetic fixture, whose
  channels are 132–220, and **1.783e-4** over the whole domain `detectBlemishes` can
  reach. The certified radius is 1.046e-5. The fixture was not the domain.
- **A better table exists**: a per-cell quadratic over the power branch only, 512
  cells, 12,288 bytes, worst case 5.485e-7, a **19.08x** margin — a third the size of
  the table that would not have cleared it and 24x more accurate.
- **It still changed a published value**, and that is why it is not shipped.
  `blemishCount` on the noiseless fixture in `tests/blemish-density-scale.test.ts` went
  from `3, 3, 3, 3, 3` to `2, 3, 3, 2, 3`.
- **And the table was not the cause.** A nudge of **1e-16** to a\* — below one ulp of
  the values involved, and eleven orders of magnitude under the certified radius — does
  the same thing, while making the table eight times more accurate changes the counts
  differently again. That fixture has no margin at all: its count is settled by an
  exact float equality in the suppression loop. §7.

So the speed question is answered and the safety question turned out to be a different
question, about a detector behaviour nobody had measured. The item stays open with
these numbers attached, and what landed instead is a guard on the behaviour
(`tests/blemish-tie-break.test.ts`).

## 1. Research: are ARU's transfer constants the right ones, and where is the knee?

The table's whole design turns on where the curve stops being a straight line, so the
first question was whether ARU's breakpoint is the one the rest of the world uses.

**No primary source is reachable from this network.** Probed 2026-09-20:

```
https://webstore.iec.ch/publication/6169                                         http=000
https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.709-6-201506-I!!PDF-E.pdf   http=000
https://www.w3.org/Graphics/Color/sRGB.html                                      http=000
https://en.wikipedia.org/wiki/SRGB                                               http=000
```

So IEC 61966-2-1 itself was not read, and nothing here is attributed to it. What could
be read is a reference implementation's source, through the one host that answers:

```
https://raw.githubusercontent.com/colour-science/colour/develop/colour/models/rgb/transfer_functions/srgb.py
http=200 bytes=4308
sha256 520ba88acb642628ee2d99f3d4802ea1e0725f946ece49f725b581fdcfb9f973
```

Re-fetched in the same session and the sha256 matched byte for byte. This is
`colour-science/colour`'s source code — another project's implementation, not the
standard — and this document says so in those words.

**The multiplicative constants agree exactly.** Its `eotf_sRGB` is
`spow((V + 0.055) / 1.055, 2.4)` above the break and `V / 12.92` below it, which is
`lib/skin.ts:srgbLinear` and `ml/ita.py:36` character for character.

**The breakpoint does not, and the difference is a rounding.** It does not branch on a
literal `0.04045`. It branches on `eotf_inverse_sRGB(0.0031308) >= V`, that is on
`12.92 * 0.0031308`:

```
reference breakpoint  12.92 * 0.0031308 = 0.040449935999999999
ARU breakpoint (lib/skin.ts and ml/ita.py) = 0.04045
difference in c        = 6.4000e-8
difference in 8-bit channel levels = 1.6320e-5

the window where the two implementations take DIFFERENT branches: c in (0.04044993600, 0.04045]
  worst |linear - power| inside it:
    2.3295e-9 at c = 0.04045000000 (channel 10.314750)

how many 8-bit integer channels fall in the disagreement window:
    0 of 256
```

Two consequences, and both decided something.

*ARU's curve is very slightly discontinuous at its own knee*, because 0.04045 is a
rounding of the real breakpoint and the two branches no longer meet there:

```
  linear(0.04045) = 0.0031308049535603713
  power (0.04045) = 0.0031308072830676845
  jump            = 2.3295e-9
```

*So the table is aligned to ARU's breakpoint, not to the reference's.* Aligning it to
`12.92 * 0.0031308` would have been "more correct" and would have silently changed the
shipped curve, and with it the exact agreement between `lib/skin.ts` and `ml/ita.py`,
which both use `0.04045`. The table reproduces ARU's branch including its 2.3295e-9
jump. Whether ARU should move to the unrounded breakpoint in BOTH languages is a real
question and it is not this cycle's; it is now on the backlog with this measurement
attached.

## 2. Why not the 4096-entry linear table the item named

The item's acceptance criterion was the certified radius: the largest per-cell a\*
error below which no cell can change its classification, and so below which
`blemishCount` cannot move. Re-derived this session by
`tests/blemish-perturbation-tolerance.test.ts` over its whole fixture family:

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

The same file already reports each candidate table's error **on that fixture**, and on
that fixture the 4096-entry linear table looks comfortable:

```
4096 linear   400x480        1.849e-6       6
4096 linear   720x960        1.917e-6       5
4096 linear   1080x1440      1.865e-6       5
4096 linear   1440x1920      1.910e-6       5
```

That is where the item's **1.9e-6** comes from, and it is a measurement of the fixture,
not of the function. The fixture is one synthetic light face: the channels it feeds
`labAStar` are 132–220. `detectBlemishes` will feed much darker channels on a real
face, and a dark channel is exactly where a transfer-curve error is amplified, because
`labF`'s cube root multiplies it by `1/(3*y^(2/3))` and the result is then multiplied
by 500.

Worst `|delta a*|` over the domain `detectBlemishes` can actually reach — `lum` in
[40, 230], `r > b`, each channel then scaled by a gray-world gain `frameChannelGains`
clamps to [0.6, 1.6] and by `Math.min(255, .)` — found by a coarse six-parameter grid
followed by a shrinking-step local refinement:

```
table                    bytes    worst |da*| reachable   margin vs certified 1.046e-5   worst input (r,g,b after gain)
whole-domain linear 4096  32776    1.7826e-4                  0.06x                      18.334, 31.750, 13.540
knee-aligned linear 4096  32776    1.2970e-5                  0.81x                      43.111, 17.872, 36.121
knee-aligned quad 256      6144    4.2691e-6                  2.45x                      12.024, 30.588, 12.024
knee-aligned quad 512     12288    5.4847e-7                 19.08x                      10.416, 30.285, 10.894
knee-aligned quad 1024    24576    6.6954e-8                156.26x                      17.911, 27.092, 11.698
```

Every worst case sits at a low channel, which is the amplification above and not a
coincidence. Two things follow.

**Knee alignment is worth a factor of 13.7 on its own** (1.783e-4 to 1.297e-5, same
size, same interpolation). A table indexed straight off the 0–255 channel puts the kink
between the linear segment and the power law *inside* one cell, and a straight line
through a kinked function is wrong in the middle of it. Its worst transfer error sits
at channel 10.31470, which is the knee exactly:

```
N      variant        max|transfer err|  at channel
4096   knee-aligned   2.0708e-8          254.97010
4096   whole-domain   7.3710e-8          10.31470
```

**And the interpolation order is worth far more than the table size.** Linear error
falls as `h^2` and a per-cell quadratic's as `h^3`, so buying accuracy with entries is
the expensive way to buy it:

```
interp  N      bytes    max|a*err| full      max|a*err| gated
linear 256    2048     3.7124e-3             2.8303e-3
linear 512    4096     9.2475e-4             7.4586e-4
linear 1024   8192     2.3417e-4             1.7294e-4
linear 2048   16384    5.8031e-5             4.9915e-5
linear 4096   32768    1.4719e-5             1.1002e-5
quad   256    6144     4.9805e-6             3.3200e-6
quad   512    12288    6.1781e-7             4.1666e-7
quad   1024   24576    7.1590e-8             5.4935e-8
quad   2048   49152    9.3239e-9             6.5940e-9
quad   4096   98304    1.2145e-9             8.9227e-10
```

512 quadratic cells is what shipped. 1024 buys another factor of 8 for another 12KB,
and 19x is already more margin than any other approximation in `lib/skin.ts` carries.

## 3. Scope: the table would be for the detector and for nothing else

`labAStar` has exactly two production callers: `rgbToLab` (line 353) and
`detectBlemishes`'s grid loop. The grid loop runs it about 18,000 times a frame;
`rgbToLab` runs three times. So all of the win is in one of them and none is in the
other, while `rgbToLab` produces `toneLstar`, `toneIta` and every region L\* behind
`toneSpread`, and `labAStar`'s output is pinned **exactly** against `ml/ita.py` through
`ml/index-parity.json`.

So in the branch that was measured, `labAStar` kept `Math.pow` and a second entry
point, `labAStarTabulated`, took the table. They shared an extracted `aStarFromLinear`,
so there was still one a\* formula in the file and the two could not drift in the XYZ
matrix, the white point or `f()`. The only difference between them was which transfer
curve they called.

This is what the cycle-21 review asked for, and it is why `toneSpread` — which moved at
all four frame sizes when the review replaced `srgbLinear` wholesale — did not move at
all here. It is worth keeping written down because the obvious simplification, putting
the table behind `labAStar` itself, breaks `ml/index-parity.json`'s exact `rgb_to_lab`
rows: measured, that break fails `tests/index-parity.test.ts` with
`cube: mid gray: a*: expected 0.003155620347528032 to be 0.003155620347972121`.

## 4. On the fixture family it was checked against, nothing published moved

Every field `analyzeSkin` publishes, table build against a build differing in the one
line that picks the entry point, four frame sizes, a light fixture and a dark one (the
light fixture's channels scaled by `[0.30, 0.26, 0.24]`, so the comparison happens
where the table's error is largest), compared with `Object.is` rather than a rounded
equality:

```
=== every published field of analyzeSkin, table build vs Math.pow build ===
light  400x480   blemishCount=5  fields moved: NONE
light  720x960   blemishCount=5  fields moved: NONE
light 1080x1440  blemishCount=5  fields moved: NONE
light 1440x1920  blemishCount=4  fields moved: NONE
dark   400x480   blemishCount=6  fields moved: NONE
dark   720x960   blemishCount=8  fields moved: NONE
dark  1080x1440  blemishCount=5  fields moved: NONE
dark  1440x1920  blemishCount=6  fields moved: NONE
```

That looked like the acceptance criterion met. It was not, and §7 is what it missed:
this fixture family has pixel noise, and the fixture that broke does not.

## 5. What it would buy

In situ, both builds loaded fresh so neither gets V8's tiers for free, alternating
paired repeats. `analyzeSkin` end to end, 9 reps:

```
frame          pow(ms)   table(ms)   faster   reps won
400x480          6.664       3.588     46.2%        9/9
720x960          7.472       3.821     48.9%        9/9
1080x1440        8.242       4.568     44.6%        9/9
1440x1920       10.075       6.286     37.6%        9/9
```

And `detectBlemishes` alone, from `ARU_PRINT_SCAN_COST=1 npx vitest run
tests/scan-cost-benchmark.test.ts`, which now re-derives it rather than quoting it:

```
   C5a. shipped (table) against a build whose ONLY difference is that the
        detector calls labAStar, i.e. three Math.pow(., 2.4) per cell.
   frame          table     Math.pow   saved(paired)   min..max        %
   400x480        1.907     4.911     3.007    2.938..   3.255   61.2%
   720x960        2.623     5.939     3.308    3.289..   3.332   55.7%
   1080x1440      3.428     6.793     3.364    3.348..   3.391   49.5%
   1440x1920      4.590     7.945     3.335    3.255..   3.409   42.0%

   C5b. shipped against a build whose tabulated curve is replaced by c*c —
        an ablation, so its counts are not a reading and are never read.
   frame          shipped   table -> c*c   removed(paired)   min..max        %
   400x480        1.868         1.743     0.122    0.119..   0.138    6.5%
   720x960        2.589         2.465     0.113    0.023..   0.215    4.3%
   1080x1440      3.449         3.298     0.149    0.129..   0.392    4.3%
   1440x1920      4.601         4.444     0.160    0.121..   0.190    3.5%
```

C5b is the part that says the job would be finished. The transfer curve is 37–61% of
`detectBlemishes` today; with the table it would be **3.5–6.5%**, and that remainder is
a table lookup that no cheaper transfer could beat without changing the answer.

Both of those sections were written against the table build and then reverted with it,
so `tests/scan-cost-benchmark.test.ts` on this branch is byte-identical to main. Whoever
lands the table has to update `C5` as part of landing it: it ablates `srgbLinear`'s own
`Math.pow` line today to bound what a fast path can never reach, and once the detector
stops running that line, ablating it measures nothing on the detector's path and prints
a number that looks like a result.

## 6. Every guard in the reverted branch, broken at its source line

Recorded because whoever lands the table should not have to re-derive them. Each break
edits `lib/skin.ts`, never the test, and the assertion message is the real one. These
ran against `tests/srgb-transfer-table.test.ts`, which came out with the table and is
not on this branch:

| break at the source line | what failed |
|---|---|
| B1 each cell a straight line instead of a quadratic (512 cells) | `AssertionError: the worst input an offline search found gives \|da*\| = 3.5790e-5, against the certified radius 1.0462e-5 — margin 0.29x, required 4x` |
| B2 table shrunk to 256 cells | `AssertionError: a table this small cannot clear the certified radius: expected 256 to be greater than or equal to 512` and `AssertionError: a 400,000-sample sweep of the reachable domain found \|da*\| = 2.7162e-6 at (27.239, 31.487, 30.169) ... margin 3.85x, required 4x` |
| B3 the knee guard removed, so the linear segment is extrapolated from cell 0 | `AssertionError: cell boundaries are supposed to be the exact curve: expected 2.8628488468740443e-10 to be less than 1e-12` and `AssertionError: a 400,000-sample sweep ... found \|da*\| = 6.6146e-4 at (91.737, 10.047, 43.785) ... margin 0.02x` |
| B4 `labAStar` itself pointed at the table (the scoping guard) | `AssertionError: cube: mid gray: a*: expected 0.003155620347528032 to be 0.003155620347972121` — from `tests/index-parity.test.ts`, i.e. the **cross-language** pin catches it independently |
| B5 the detector silently reverted to the `Math.pow` entry point | `AssertionError: labAStarTabulated is declared once and called once: expected 1 to be 2` and `Error: the detector's call site moved; this case compares nothing` |

B4 is the one worth reading twice. Putting the table behind `labAStar` is the obvious
simplification, it costs nothing measurable, and `ml/index-parity.json`'s exact
`rgb_to_lab` rows stop holding the moment anyone does it. The scoping is not tidiness.

## 7. Why it is not shipped: the fixture that broke has no margin at all

`npm run smoke` went red on the branch, and the failure that mattered is
`tests/blemish-density-scale.test.ts` > *"finds the same spots on one face at every
realistic capture resolution"*:

```
AssertionError: counts across resolutions: 2, 3, 3, 2, 3: expected 2 to be 1
```

That case runs the five-spot synthetic face with **`noiseAmplitude = 0`** at five
resolutions and asserts every frame reads the same `blemishCount`. On main it does. With
the table it reads `2, 3, 3, 2, 3`.

**The first instinct — the table is not accurate enough — is wrong, and it is
measurable.** Making the table 2x, 4x and 8x finer does not converge on main's answer;
it gives three more different answers:

```
N=512   counts across resolutions: 2, 3, 3, 2, 3
N=1024  counts across resolutions: 2, 3, 2, 3, 4
N=2048  counts across resolutions: 2, 5, 4, 3, 3
N=4096  counts across resolutions: 2, 3, 2, 3, 2
```

**What is actually going on**: a nudge far below any approximation does the same thing.
Builds of `lib/skin.ts` differing only by a constant added where a\* is consumed, on the
same fixture and landmarks, `blemishCount` at the five realistic frames:

```
blemishCount on the NOISELESS fixture (noiseAmplitude 0)
build                counts across the five realistic resolutions
m-exact              3, 3, 3, 3, 3   distinct=1
m-table              2, 3, 3, 2, 3   distinct=2
m-e15  (+1e-15)      4, 3, 2, 4, 4   distinct=3
m-e16  (+1e-16)      2, 4, 4, 4, 3   distinct=3

and the same builds on the NOISY fixture (noiseAmplitude 9), for contrast
m-exact              5, 4, 2, 4, 2   distinct=3
m-table              5, 4, 2, 4, 2   distinct=3
m-e15  (+1e-15)      5, 4, 2, 4, 2   distinct=3
m-e16  (+1e-16)      5, 4, 2, 4, 2   distinct=3
```

**1e-16** moves it. That is below one ulp of a\* at these magnitudes and eleven orders
of magnitude under the certified radius of 1.046e-5. The assertion holds for exactly one
bit pattern — the one `Math.pow` produces today — and for no other arithmetic.

**The mechanism is one line**, in `detectBlemishes`'s non-maximum suppression:

```ts
// Ties go to the cell scanned first, so a plateau counts once.
if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {
```

That clause is correct and it is there for a reason: a flat plateau should count once,
not once per cell. But a face built with `noiseAmplitude = 0` is nothing but plateaus —
whole runs of stride windows average to bit-identical channel triples, so whole runs of
cells carry bit-identical residuals — and which of them survives is then settled by
`j < i` rather than by the image. Change the arithmetic by anything at all and the runs
stop being exactly tied.

Note the second block above: on the noisy fixture every build agrees, the table
included. The detector is robust where it is fed something that resembles a photograph.
It is the noiseless fixture that is the knife edge.

**So three things are true at once**, and the cycle did not have standing to trade them
off against each other:

1. The table is accurate enough by the criterion the backlog item set, by 19x.
2. It still changes a published value on a committed fixture.
3. The reason it does is a property of that fixture, not of the table — and deciding
   whether `tests/blemish-density-scale.test.ts`'s "every frame must agree" should be
   relaxed is a decision about what `blemishCount` guarantees across resolutions, which
   is a bigger question than a speed item. It is made harder by a fourth measurement:
   the same file's noisy fixture does not satisfy that assertion on **main** either
   (`5, 4, 2, 4, 2`), so resolution-invariance of the count is already a property of the
   noiseless path alone.

The table came back out, the item stays open with these numbers on it, and the finding
got a guard instead.

## 8. What landed: a guard on the tie-break

`tests/blemish-tie-break.test.ts`. It pins the tie-break line and its comment as source,
and it asserts that the noiseless fixture's agreement really does rest on that line — a
1e-16 nudge must move it. So the next person who reads
`tests/blemish-density-scale.test.ts`'s "every frame must agree" finds out from the
suite, not from a red build six months later, that it is a statement about one bit
pattern.

Broken at its source line, in `lib/skin.ts`, never at the test:

| break | what failed |
|---|---|
| T1 the tie-break clause removed, so a plateau counts once per cell | `AssertionError: the suppression tie-break moved` — and the noiseless fixture reads `12, 4, 7, 4, 4` |
| T2 the tie-break comment reworded | `AssertionError: expected '/**\n * Visible-signal skin analysis.…' to contain '      // Ties go to the cell scanned …'` |
| T3 averaged channels rounded to integers | `AssertionError: the shipped build is supposed to agree: 2, 4, 3, 4, 3: expected 3 to be 1` |
| T4 residual quantised to 3 decimals | `AssertionError: the shipped build is supposed to agree: 2, 3, 2, 2, 2: expected 2 to be 1` |
| T6 averaged channels quantised to steps of 8 | `AssertionError: the shipped build is supposed to agree: 14, 8, 11, 15, 13: expected 5 to be 1` |

**And one thing that is deliberately NOT asserted.** The reassuring half — that a noisy
face's counts do not move under the nudge — is printed
(`ARU_PRINT_TIE_BREAK=1 npx vitest run tests/blemish-tie-break.test.ts`) and asserted
nowhere:

```
TIE noise=9 shipped=[5, 4, 2, 4, 2] nudged=[5, 4, 2, 4, 2]
TIE noise=0 shipped=[3, 3, 3, 3, 3] nudged=[2, 4, 4, 4, 3]
```

Seven source-line breaks were tried against an assertion of it and **none of them made
it fail**. The reason is structural: the nudge adds the same 1e-16 to every cell, a
uniform shift cancels in `astar[i] - background`, and what moves the noiseless fixture
is that the addition ROUNDS differently at different magnitudes. Quantising the residual
absorbs the nudge; quantising the channel averages into plateaus leaves the ties exactly
tied. An assertion nothing can break is not coverage, it is a green line that looks like
coverage, so it stays a measurement. A real guard on that property has to measure the
margin between competing cells directly rather than nudge and look, and that is on the
backlog.
