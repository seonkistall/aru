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

**What is not verified.** The band cut points themselves (55 / 41 / 28 / 10) are
attributed in `ml/subgroups.py` to the Chardon convention. No primary source for them
could be opened from this network — see the egress list in `docs/AUTOPILOT.md`; the
run above establishes that ARU computes the *angle* correctly, not that these are the
right places to cut it. Both agree the cut points are unchanged from what shipped, so
nothing here depends on settling it, but it stays unverified and should not be written
down as though it were.

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
