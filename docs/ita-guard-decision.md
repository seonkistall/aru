# What ITA reads when b\* is near zero — decided

**Question this cycle set out to answer:** `itaDegrees` computes `atan((L* - 50) / b*)`, which
has a singularity at `b* = 0`. Three implementations guarded it in two different places.
Which guard is right?

Cycle 19 found the split and deliberately did not choose:

| implementation | guard | role |
|---|---|---|
| `lib/skin.ts:itaDegrees` | `\|b*\| < 0.01` | live scans, the only producer of `toneIta` |
| `ml/ita.py:ita_from_lab` | `\|b*\| < 0.01` | offline mirror, external datasets and crops |
| `ml/skin_indices.py:ita` | `\|b*\| < 1e-6` | the registry's declaration of what the index IS |

That would be a rounding question if the fallback were continuous. It is not: **the ±90
fallback ignores the sign of b\***, so between the two guards the three did not round
differently, they landed 180 degrees apart — `light` against `deep` on
`coarse_tone_band`, from one frame, at cut points 41 and 10.

**Decision: the guard is `b* == 0` and nothing wider, in all three.** The ±90 fallback
survives only at exactly zero, where the quotient genuinely has no value, and is
documented there as a convention rather than an approximation. `ml/index-parity.json`'s
`ita` group moves from `divergent` to `exact` and carries one column.

Everything below is the output of a command in this repository. Reproduce with:

```bash
ARU_PRINT_ITA_GUARD=1 npx vitest run tests/ita-guard-decision.test.ts
```

## 1. How reachable the window is — and the answer is two answers

The brief asked for this first, because a defect that needs `|b*| < 0.01` on a real
capture may be vanishingly rare. It is, and it is not, and the two halves point at
different fixes.

### On a skin-coloured region: a knife edge, and the capture steps over it

The blue-channel gain that takes each committed fixture through `b* = 0`, and the width
of the gain interval around it where `|b*| < 0.01`, by bisection on the shipped
`rgbToLab`:

```
fixture              b* at gain 1   crossing gain   |b*|<0.01 window
synthetic-face cheek       10.7383        1.136741           2.561e-4
swatch-1                    8.2152        1.079614           1.945e-4
swatch-3                   17.4931        1.235578           2.714e-4
swatch-6                   14.8922        1.573947           7.784e-4
```

So landing in the window needs the illuminant tuned to between **0.02% and 0.08%** of a
gain unit. Over the whole 8-bit cube, sampled uniformly at n = 2,000,000, `|b*| < 0.01`
holds on **300 triples (0.0150%)** and `|b*| < 1e-6` on **0**. In 8-bit units the window
is a shell **0.031 to 0.043** of one level thick around the neutral axis, widening with
brightness.

And the shipped path confirms it rather than being argued about. 121 blue gains from
1.000 to 1.600 in 0.005 steps, through `analyzeSkin` on the committed synthetic face —
the fixture `docs/tone-ita-verification.md` §3 measures:

```
gb=1.130 toneIta=88.5
gb=1.135 toneIta=89.6
gb=1.140 toneIta=-89.2      <- b* crossed zero between these two steps
gb=1.145 toneIta=-88.4
```

`toneIta` flips the full width of the scale in one step of the gain, which is ITA being
ITA. **Not one of the 121 captures produced a reading the old guard would have clamped**:
the largest `|toneIta|` in the sweep is 89.6, and the whole sweep is byte-identical
before and after this cycle's change.

**Which corrects cycle 19's reachability argument.** It read §3's cool cast — ITA 61.8 to
−87.6 on a real fixture — as evidence that a capture reaches the window. It is evidence
that a capture **crosses** it. Passing through a 2.6e-4-wide interval is not landing in
it, and the sweep above is what the difference looks like.

### On the neutral axis: the axis is inside the window

This is the half nobody was looking for, and it is what decided the cycle.

ARU carries the sRGB→XYZ matrix to four decimals, so for `r = g = b` the z row sums to
`1.089 / 1.08883 = 1.00016` of the y row, and `b* = 200 * (f(y) − f(z))` comes out small
and **negative**, growing in magnitude with level. So a neutral grey does not merely come
close to the window — it sits inside it, and 8-bit quantisation puts real pixel values
exactly on the axis:

```
greys inside |b*|<0.01: 242/256, inside |b*|<1e-6: 1/256

grey       L*             b*     shipped ITA   rejected wide   true limit
   0   0.00000    0.000000000    -90.000000           -90.0        -90.0
  32  12.25003   -0.002534755     89.996153           -90.0         90.0
  64  27.09341   -0.003866588     89.990329           -90.0         90.0
  96  40.73055   -0.005090190     89.968537           -90.0         90.0
 119  50.03444   -0.005924988    -80.238169            90.0        -90.0
 128  53.58501   -0.006243566    -89.900215            90.0        -90.0
 160  65.86781   -0.007345649    -89.973476            90.0        -90.0
 192  77.70436   -0.008407692    -89.982612            90.0        -90.0
 224  89.17728   -0.009437108    -89.986198            90.0        -90.0
 240  94.79625   -0.009941274    -89.987285            90.0        -90.0
```

Read the last two columns. On **all 241 non-black greys inside the old window the
rejected fallback returned the sign the limit does not have** — it answers
`sign(L* − 50)` where the limit is `sign((L* − 50) / b*)`, and b\* is negative there, so
the two are opposites everywhere. The registry's narrower guard was the correct column.

The path this reaches is `ml/ita.py`, not the browser. `tone_from_image_path` is called
from `ml/external_manifest.py:374` and `ml/prepare_crop_dataset.py:48`, both through
PIL's `convert("RGB")` — and on an L-mode file that yields `r = g = b` exactly. This
cycle did not audit which of the datasets in `ml/external_datasets.json` ship greyscale
images, so the claim here is about the path and not about a particular corpus.

## 2. Why not the other two options

The backlog named three. Each is rejected on something measured.

**Make the fallback sign-aware and keep the window.** It fixes the 180 degrees and leaves
the second defect, which is that **a guard on b\* alone cannot be right: what diverges is
the ratio.** `|b*| < 0.01` asserts a vertical angle however small `|L* − 50|` is. At
L\* 50.001 and b\* 0.005 the old guard published **90** (`very_light`) where the angle is
**11.31** (`tan`) — and a sign-aware fallback publishes 90 there too, because the sign is
right and the value is still wrong by 79 degrees. Nor is that a constructed input: grey
119 lands at L\* **50.03444** on the real 8-bit axis, where the angle is **−80.238169**
against the rejected **90**. It is also pinned as a break: making the fallback sign-aware
at 0.01 instead of narrowing the guard fails 4 assertions, including
`expected 90 to be close to 11.309932474020215, received difference is 78.69006752597979`.

**Return no band — `coarse_tone_band` gains an "undetermined" state.** This is the option
cycle 19 hinted at, and the measurement argues against it. An undetermined state has to
fire on a condition, and "b\* is small" is the wrong condition: the angle is
*well conditioned* for small b\* whenever `|L* − 50|` is not also small — every grey in
the table above except 119 reads within 0.04 degrees of vertical. The one genuinely
ill-conditioned input is `0/0`: b\* exactly zero **and** L\* exactly 50, an achromatic
mid-grey, which is not a face and which the scan already refuses on other grounds
(`n >= 40`, `meanL > 1`, ROI quality). So the state would cost a new value threaded
through `resolve_tone_band`, `aggregate_by_cell`, `worst_group` and `promotion_check` to
describe one point, and would leave the sign wrong at every other point in the window.
Rejected.

**Drop the guard entirely.** Nearly right, and checked rather than assumed: it is unsafe
in Python and the exact reason is asymmetric between the languages.

```
20.0/0.0     -> ZeroDivisionError: float division by zero
20.0/-0.0    -> ZeroDivisionError: float division by zero
0.0/0.0      -> ZeroDivisionError: float division by zero
20.0/1e-320  = inf
20.0/5e-324  = inf
math.atan(inf)  = 1.5707963267948966  -> degrees 90.0
math.atan(-inf) = -1.5707963267948966 -> degrees -90.0
```

CPython raises on both zeros; V8 divides by `+0` to `Infinity`, by `-0` to `-Infinity`,
and by `0/0` to `NaN`. Denormals are fine in both — `20.0/5e-324` is `inf` and
`math.atan(inf)` is exactly π/2 — so **`b* == 0` is the only input that needs a branch at
all**, and it needs one in both languages or they part company on `-0`. Removing it from
`ml/skin_indices.py` fails `ml/selftest.py` with
`ZeroDivisionError: float division by zero`.

At `b* == 0` with `L* != 50` the two one-sided limits are `±90` and the value is a choice
of side; at `L* == 50` it is `0/0` and there is no limit at all. The convention kept is
`L* > 50 ? 90 : -90` — the `b* → 0⁺` limit — because it is what all three already did and
because a number matters more than which number: `toneBandFromIta` maps a NaN to
`"unknown"`, and a tone-unknown row blocks promotion.

## 3. What it costs downstream

**Nothing, and that is checkable rather than asserted.**

`ml/subgroups.py`, `coarse_tone_band`, `resolve_tone_band` and the promotion gate are
**untouched**, which is only true because the third option was rejected. Had
`coarse_tone_band` gained an "undetermined" state, `aggregate_by_cell`'s per-cell
arithmetic and `worst_group`'s `min_n` floor would both have needed a meaning for a
sample with no band, and the gate would have needed to decide whether such a sample
blocks, is skipped, or is folded into `unknown` — which is exactly the kind of dangling
half a cycle should not leave.

No published value moved. Twenty readings — five capture conditions (neutral wall, warm
wood wall, a warm cast, a cool cast, and a strong `[0.8, 1.0, 1.3]` cool cast) at each of
the four frame sizes — were run through `analyzeSkin` on this branch and on main
`eb527e9`, printing every field of `SkinRawFeatures` plus all three levels and all three
confidences. **All 20 rows are byte-for-byte identical**, as is the 121-step blue-gain
sweep above. `ATTR_THRESHOLDS`, `inputSchemaVersion` and
`public/models/visible-attributes/manifest.json` are untouched.

### `fallbackVersion` is not bumped, and the reason is the byte-identity

`fallbackVersion` exists so that two feature generations are not pooled in one subgroup
cell or one threshold fit. A bump is warranted when the *semantics* of a recorded field
change, and here they did not change anywhere a face can reach: the fixture family, the
swatch table and the cast sweep all produce the same `toneIta` to the last digit. The
only inputs whose reading moved are within 0.043 of an 8-bit unit of the neutral axis,
where no cheek centroid has ever landed on either path.

Bumping it would therefore partition samples that carry identical values, and it would do
real damage rather than none: `coverage_warnings` is the place a mixed-generation run is
meant to surface, so a spurious boundary would make every run spanning today report a
generation mix that does not exist. Not bumped. `oil`, `redness` and `pores` are
untouched — verified in the 20-row comparison, where all three levels and all three
confidences are identical.

## 4. Limits

One synthetic face and six reference-verified swatches, which is the golden-set blocker
again. What that bounds: the *shell* measurements (242/256 greys, the 0.0150% cube
fraction, the 0.031–0.043 unit thickness) are properties of `rgbToLab` and hold for every
input, not just these fixtures. The *reachability* claim — that a capture steps over the
window rather than into it — is measured on one face's cheek across 121 gains, and a real
corpus could in principle contain a cheek centroid that lands inside. What would settle
it is the same 20–30 consented photos everything else is waiting on.

The band cut points (55 / 41 / 28 / 10) are still unverified against a primary source;
that is a separate open item and nothing here depends on it.
