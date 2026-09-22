# Tone / ITA verification

**Question this cycle set out to answer:** is `toneIta` the thing ARU thinks it is?

It matters because ITA is the only tone stratifier in the system. `ml/subgroups.py`
derives every tone band from it, `subgroups.ordinal_check` blocks promotion per band,
and `lib/skin.ts` is the sole producer on both first-party ingest paths. Nothing in the
repository measured it. A metric that gates fairness and is itself unmeasured is the
worst kind: a slip does not show up as a failure, it shows up as every sample landing in
one band, and a subgroup gate with one cell passes every time — a model that is blind
looks exactly like a model that is fair.

Two separate things were checked, and they came back differently. The conversion is
correct. What ARU was feeding into it was not.

Everything below is the output of a command in this repository. Reproduce with:

```bash
python3 -m venv /tmp/refvenv && /tmp/refvenv/bin/pip install colour-science scikit-image
/tmp/refvenv/bin/python ml/tools/verify_tone_ita.py
```

## 1. The conversion, against two independent references

colour-science 0.4.7 and scikit-image 0.26.0. Neither is or becomes a dependency —
`ml/tools/verify_tone_ita.py` imports them inside `main()`, exactly as
`ml/tools/verify_ordinal_metrics.py` does with scikit-learn and SciPy, so the ML modules
stay standard-library-only and `ml/selftest.py` still runs anywhere `py_compile` does.
`pypi.org` reachability is what made this possible at all; see the egress note below.

```
sRGB -> CIELAB over 4000 random triples (seed 20260916), max abs deviation:
reference                dL*         da*         db*
scikit-image       7.502e-03   2.062e-02   2.129e-02
colour-science     3.717e-05   2.412e-03   1.381e-02
```

ARU carries the sRGB→XYZ matrix to four decimals (`0.4124`, `0.3576`, …) where both
references carry more. That truncation is the whole of the residual; it is not a
different colour model. Judgement: irrelevant at the scale ITA is used — the narrowest
band boundary is 13 degrees wide and this moves an angle by hundredths.

```
ITA, max abs deviation in degrees:
reference              all b* (n=3999)       |b*|>5 (n=3685)
scikit-image                 3.343e-01             1.208e-01
colour-science               2.985e-01             4.844e-02
```

The whole-range figure is the formula's own conditioning, not a disagreement about
colour: ITA divides by `b*`, so near `b*=0` a 0.02 difference in `b*` is a large
difference in angle. Skin has `b*` well away from zero, which is the `|b*|>5` column.
It is reported next to the whole range rather than instead of it.

The degrees check, which is the failure actually worth guarding against:

```
If ITA came back in radians instead of degrees, every value would sit in
  [-1.5687, 1.5702] rather than [-89.9, 90.0], so
  tone_band_from_ita would return ['brown_dark'] instead of
  ['brown_dark', 'intermediate', 'light', 'tan', 'very_light'].
```

Six fixed swatches, now pinned in both test suites:

```
name       sRGB                   L*      b*     ITA         band   ITA(skimage)   ITA(colour)
swatch-1   (242, 223, 211)      90.0    8.22    78.4   very_light          78.38         78.38
swatch-2   (226, 195, 176)      80.9   13.60    66.3   very_light          66.25         66.25
swatch-3   (205, 168, 144)      71.6   17.49    50.9        light          50.92         50.92
swatch-4   (181, 139, 110)      61.1   21.66    27.2          tan          27.22         27.22
swatch-5   (140, 100, 74)       45.9   21.11   -11.0   brown_dark         -11.02        -11.03
swatch-6   (86, 58, 42)         27.2   14.89   -56.8   brown_dark         -56.82        -56.82
  max |ARU - scikit-image| = 1.815e-02 deg, max |ARU - colour-science| = 1.672e-02 deg
  every fixture lands in the same band under all three: True
```

`ml/selftest.py` pins these rows for `ml/ita.py`, and
`tests/tone-ita-contract.test.ts` pins the same six for `lib/skin.ts` by running
`analyzeSkin` on a flat frame of each colour. That is the first thing anywhere that ties
the browser's tone reading to a number checked outside this repository.

**What is not verified.** The band cut points themselves (55 / 41 / 28 / 10) still have
no primary source that can be opened from this network — see the egress list in
`docs/AUTOPILOT.md`; the run above establishes that ARU computes the *angle* correctly,
not that these are the right places to cut it. Both agree the cut points are unchanged
from what shipped, so nothing here depends on settling it, but it stays unverified and
should not be written down as though it were.

**Their attribution moved on 2026-09-20, and that is a different thing from verifying
them.** This file and `ml/subgroups.py` credited the cut points to "the Chardon
convention" while `ml/skin_indices.py` credited Del Bino & Bernerd — three files, one set
of edges, two citations. The benchmark ARU already cites separates them: `src/clinical.py`
in hpicsk/regional-ccm attributes the arctan FORMULA to Chardon et al. (1991) and Del Bino
et al. (2006), and the six-category CUTPOINTS −30/10/28/41/55 to Del Bino & Bernerd (2013).
ARU uses those cut points, so the files now all say Del Bino & Bernerd for the edges and
name Chardon for the formula. That is another project's source code, not either paper,
so the item above is unaffected: the repository stopped contradicting itself, and nothing
became verified. [`docs/melanin-index-verification.md`](melanin-index-verification.md) §4.

## 2. What was being fed in — the defect

`lib/skin.ts` applied gray-world white-balance gains to the cheek pixels before
computing tone. `ml/ita.py` applies none. Gray-world estimates the illuminant from the
**whole frame**, so a coloured wall behind the user is read as coloured light and
divided out of their face.

Measured by holding one synthetic face byte-for-byte identical and changing only the
wall behind it (`tests/tone-ita-contract.test.ts`, "does not change when only the
background changes"):

| wall | toneIta before | band before | toneIta after |
|---|---|---|---|
| grey (180,180,180) | 75.2 | very_light | 61.7 |
| white (235,235,235) | 73.3 | very_light | 61.7 |
| dark (60,60,60) | 82.3 | very_light | 61.7 |
| cool blue (120,150,205) | 49.2 | light | 61.7 |
| warm wood (200,150,105) | **-60.5** | **brown_dark** | 61.7 |

One face, three of the five tone bands — `very_light`, `light` and `brown_dark`, the
full width of the scale — decided by the room. `relRedness` (0.00243) and
`shine` (0.03973) were identical across all five, before and after — the within-image
indices were never affected, which is why nothing else caught this.

The warm-wood row is the formula's conditioning again, now as a failure rather than a
footnote: the gains drag `b*` through zero and the angle changes sign. The
`[0.6, 1.6]` clamp on each gain bounds the gain, not the angle, so the comment claiming
"extreme scenes cannot invent a tone shift" was wrong about what it bounded.

**Fix:** tone is computed on the pixels as captured. Three reasons rather than a
preference:

1. A stratifier that answers "what colour is the room" cannot stratify people. Two
   scans of one person in two rooms belonged in two cells.
2. `ml/ita.py`'s module docstring already states the contract — "Change one, change
   both" — and already says what ITA is: "a measurement of the pixels, under whatever
   light the photo was taken in". The browser was the side that had drifted.
3. Training subgroups come from dataset images through `ml/ita.py` and app subgroups
   from live scans through `lib/skin.ts`. They were pooled into the same bands while
   being computed from differently preprocessed pixels — and not only across datasets.
   `ita_for_row` in `ml/prepare_crop_dataset.py` takes the app's recorded `toneIta`
   when there is one and recomputes through `ml/ita.py` when there is not, tagging each
   row `ita_source: app_measured` or `recomputed_from_crop`. So the two scales sat in
   the same file, row by row. That function's own docstring records the same failure
   being fixed once already at the other end: "An earlier version of this script
   averaged the whole crop instead, which put the same face in a different tone band
   depending on which path produced the number."

## 3. What this does NOT fix, with the number

An uncorrected illuminant still moves the reading, and the honest way to report that is
to measure it rather than to wave at it. Same casts, three starting colours, through
`ml/ita.py`:

| starting colour | cast | b* | ITA | band |
|---|---|---|---|---|
| synthetic-face cheek | neutral | 10.74 | 61.8 | very_light |
| | warm `[1.12, 1.00, 0.92]` | 20.49 | 47.0 | light |
| | cool `[0.92, 1.00, 1.12]` | **-0.82** | **-87.6** | **brown_dark** |
| swatch-3 (205,168,144) | neutral | 17.49 | 50.9 | light |
| | warm | 27.25 | 41.2 | light |
| | cool | 6.19 | 73.1 | very_light |
| swatch-5 (140,100,74) | neutral | 21.11 | -11.0 | brown_dark |
| | warm | 27.48 | -4.5 | brown_dark |
| | cool | 14.15 | -20.2 | brown_dark |

Read it this way. A ±12% / −8% channel cast — an ordinary warm bulb, or one phone's
white balance against another's — moves a mid-tone face about one band. On a face whose
`b*` is already low it does much worse, because ITA divides by `b*` and a cast that
pushes it through zero flips the angle to the far end of the scale: the synthetic
fixture sits at `b* = 10.74`, lower than any of the six swatches except the lightest,
and the cool cast takes it to `brown_dark`. Deep tones are the most stable, having the
largest `b*`.

**What this section does NOT establish, added 2026-09-20.** Cycle 19 read the cool-cast
row — b\* taken to −0.82 and ITA to −87.6 — as evidence that a capture reaches the
`|b*| < 0.01` window the ITA guard used to carry. It is evidence that a capture
*crosses* it. A 121-step blue-gain sweep of this same fixture through `analyzeSkin`
steps from ITA 89.6 to −89.2 in one 0.005 step of the gain and never once produces a
clamped reading, because the window is 2.6e-4 gain units wide on this cheek. The guard
was still wrong, and for a different reason — a neutral grey sits inside the window,
where the ±90 fallback had the sign backwards — which is
[`docs/ita-guard-decision.md`](ita-guard-decision.md).

None of this is caused by the change in §2 and none of it is fixed by it. It is a
property of ITA-from-a-photo, `ml/ita.py` has always had it, and what §2 removed is a
*second*, avoidable dependence on top of it — the wall, which is not the person. The
comparison that matters: before, one face spanned three bands with the illuminant held
constant and only the background moving. That was noise with no signal in it at all.

What it means for the fairness gate, said plainly: tone bands are reliable enough to
catch a model that fails badly on darker skin, and are not reliable enough to treat a
single scan's band as that person's tone. The promotion gate aggregates over a subgroup,
which is the use that survives this; anything per-sample does not. Fixing it properly
needs a face-region illuminant estimate rather than a frame-mean one, applied identically
in `lib/skin.ts` and `ml/ita.py` or it reintroduces the split §2 just closed. That is a
larger piece of work and it is in the backlog rather than smuggled in here.

`toneLstar` moved for the same reason and is fixed by the same change.

## 4. The half the gains still hold: `toneSpread`, measured 2026-09-22

§2 took the frame-mean gray-world gains off `toneIta` and `toneLstar`. It did not take
them off `toneSpread`, and nothing measured what that costs until this section. The
claim on record was a note — "background-coupled at about 2%", 2026-09-16, with two
numbers and no test behind either.

Re-measured here through `analyzeSkin`, on the `faceOnWall` fixture in
`tests/tone-ita-contract.test.ts` — one face held byte-for-byte identical, only the wall
behind it changing — every published field of `SkinReads.raw`:

| wall | gray-world gains (r, g, b) | `toneSpread` | vs grey |
|---|---|---|---|
| grey `[180,180,180]` | 0.93626, 1.01253, 1.05898 | 0.052903635205415585 | — |
| warm wood `[200,150,105]` | 0.82791, 1.01832, 1.23438 | **0.05350370949189595** | +1.134% |
| cool blue `[120,150,205]` | 1.03366, 1.03720, 0.93595 | **0.0523705964019627** | −1.008% |
| white `[235,235,235]` | 0.94373, 1.01096, 1.05128 | 0.05286602230161696 | −0.071% |
| dark `[60,60,60]` | 0.91027, 1.01825, 1.08772 | 0.05303399943360612 | +0.246% |

Widest ratio, warm wood over cool blue: **2.1636%** (`max/min - 1 = 0.021636436622493482`).

Two things this establishes that the note did not.

**It is exactly one field.** `roughnessRatio`, `blemishCount`, `blemishDensity`, `shine`,
`relRedness`, `cov`, `toneIta`, `toneLstar`, `tzoneL` and `cheekL` are **bit-identical**
across all five walls — asserted, not spot-checked. So the background dependence is
confined to `toneSpread` and a future change that starts moving any of the others is a
new coupling rather than a wider version of this one. One caveat stated rather than
implied: `blemishCount` is **0** on this fixture, which carries no discs, so these rows
say nothing about `detectBlemishes`'s own use of the same gains.

**The note reproduces, to five decimal places.** It gave 0.053504 for warm wood, which is
this measurement rounded; and 0.052372 for blue against the 0.0523706 measured here, a
1e-6 difference. The measured values are the ones now pinned.

What it bounds. `toneSpread` is in `NEW_FEATURE_KEYS` (`ml/skin_indices.py`) and is
exported into every ML sample, and it is compared against cut points drawn *across*
frames — so "within one frame" understates it, and a 2.2% band is the noise floor under
any threshold sitting on this axis. It is second-order next to what §3 records for ITA (a
sign flip, three bands from one face) because `toneSpread` is a ratio of region L\* values
and a cast that scales all four regions together largely cancels; the residual is the part
that does not, the gains being per-channel while the regions differ in hue as well as
lightness.

**What would fix it, and why this cycle did not do it.** Break the gains out of the region
L\* computation in `lib/skin.ts` and the coupling goes to **exactly zero** — measured, as
one of the two source-line breaks below. That is not a free change: it moves every
`toneSpread` value the product will ever compute, the field is published, and
`VISIBLE_MODEL_CONTRACT.inputSchemaVersion` has never moved under three previous
"Bumped" comments, so already-collected samples could not be told apart from new ones.
That is the open backlog item about the schema version, not a line to slip in here.

*Source-line breaks, both run 2026-09-22, both against `tests/tone-ita-contract.test.ts`
and both reverted:*

- `frameChannelGains`'s sub-sampling divisor 60 → 30, so the gains are estimated from a
  different grid: `AssertionError: toneSpread behind a grey wall — a published ML column
  moving with the room: expected 0.05291142788884354 to be 0.052903635205415585`
  (1 failed | 6 passed).
- the region L\* helper stops applying the gains
  (`rgbToLab(m.meanR * gains.r, …)` → `rgbToLab(m.meanR, …)`): the same assertion at
  `expected 0.0525811307190166`, **plus** `expected 0 to be greater than 0.02` — the
  coupling vanishing is what names the mechanism (2 failed | 5 passed).

## Egress, re-probed 2026-09-16

The blocked list in `docs/AUTOPILOT.md` was accurate and is now narrower in one place
that matters. Probed this cycle:

```
https://pypi.org/simple/                      http=200
https://files.pythonhosted.org/               http=404
https://registry.npmjs.org/                   http=200
https://api.github.com/                       http=200
https://raw.githubusercontent.com/            http=301
https://github.com/python/cpython             http=403
https://developer.mozilla.org/                http=000
https://en.wikipedia.org/                     http=000
https://law.go.kr/                            http=000
https://www.kcs.go.kr/                        http=000
https://doi.org/                              http=000
https://www.ncbi.nlm.nih.gov/                 http=000
https://www.w3.org/                           http=000
```

`raw.githubusercontent.com` answers with content — a real fetch of
`colour-science/colour/develop/README.rst` returned `http=200 bytes=75536` — and
`api.github.com` answers too, while `github.com`'s own HTML pages return 403. So a
future cycle can read a file out of a public repository, which was not true last cycle.
That is useful for reading a library's source; it is not a primary source for a paper,
a statute, or a merchant's affiliate terms, and none of those became reachable.
`http=000` and `CONNECT tunnel failed, response 403` are the same refusal seen through
two curl invocations, as `docs/AUTOPILOT.md` already records.
