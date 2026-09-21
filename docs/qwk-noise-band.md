# How wide is the qwk gain's own noise band?

`promotionGate.subgroup.minQwkGainOverHeuristic` in
`public/models/visible-attributes/manifest.json` is **0.0**, and its published note says
exactly why:

> It is 0.0 and not a positive margin because a margin should exceed validation noise
> and nothing here estimates that noise yet.

This is that estimate. It was measured on 2026-09-21 (cycle 24), it is reported next to
the gain in every run's `metrics.json`, and **it does not change the gate.** Turning it
into a promotion rule means editing `promotionGate`, which is the owner's decision and
not a cycle's (hard guardrail 8). Everything below is the output of a command that ran.

Implementation: `ml/qwk_noise.py`. Tests: `ml/selftest.py`, classes `QwkNoiseBand`,
`NoiseBandInTheGate` and `PromotedCheckpointIsWhatTheGateScores`.

---

## 1. Where the convention comes from

A percentile bootstrap has one detail that is easy to get wrong in a way nothing looks
wrong about: which quantiles of the resampled statistic the two bounds are. ARU's is
not invented. It is `scipy.stats.bootstrap(..., method="percentile")`, read from
scipy's own source — another project's implementation, not a paper or a standard, which
is the same evidential standing as the `scikit-image` read in cycle 23.

```
http=200 bytes=98486   https://raw.githubusercontent.com/scipy/scipy/v1.14.1/scipy/stats/_resampling.py
  sha256 cfa7d1e20adced3fe3b30f9cb29801487ce37fa603349ffa34b8fd582712123a
http=200 bytes=106090  https://raw.githubusercontent.com/scipy/scipy/v1.17.1/scipy/stats/_resampling.py
  sha256 4ef9a44edbaa2a51f83b55df26b58fe65f1936298a06559f91dd716104b2abf1
```

v1.14.1, lines 659-674:

```python
    alpha = ((1 - confidence_level)/2 if alternative == 'two-sided'
             else (1 - confidence_level))
    ...
        interval = alpha, 1-alpha

        def percentile_fun(a, q):
            return np.percentile(a=a, q=q, axis=-1)

    ci_l = percentile_fun(theta_hat_b, interval[0]*100)
    ci_u = percentile_fun(theta_hat_b, interval[1]*100)
```

v1.17.1 is the same rule through a different call — `interval = alpha, 1 - alpha` then
`stats.quantile(theta_hat_b, interval, axis=-1)` — so the convention did not move
between the version whose source was read and the version installed for §2.

Two things follow, and `ml/qwk_noise.py` implements both:

- `alpha = (1 - confidence) / 2`, split between BOTH tails.
- The quantile is numpy's default `linear` method: virtual index `q * (n - 1)`,
  interpolated between neighbours — not an index into the sorted sample.

`en.wikipedia.org` and `www.itu.int` remain unreachable from this network
(`http=000`); nothing here is attributed to a textbook.

## 2. Verified numerically against the installed scipy

`numpy` and `scipy` are not in `ml/requirements.txt` and `ml/selftest.py` is
stdlib-only by design, so they were installed into the container for this verification
and nothing in the repository depends on them. `pypi.org` answered (`http=200`), which
is what made this possible — the same route `docs/ordinal-metric-verification.md` used.

```
scipy 1.17.1 numpy 2.4.6

=== 2.1 quantile() vs np.percentile(method='linear') ===
63 (n, q) pairs; worst |mine - np.percentile| = 5.551e-17

=== 2.2 resample_confusion() preserves the total and is unbiased ===
total preserved in all 4000 resamples: True
worst |mean resampled count - original count| over 9 cells = 0.1085
(binomial sd of one cell at n=170, p=0.3 is 0.0945 on a mean of 4000 reps)

=== 2.3 gain band vs scipy.stats.bootstrap(method='percentile') ===
scipy paired-row bootstrap : lo=+0.033635 hi=+0.322228
ml/qwk_noise gain_band_paired: lo=+0.034233 hi=+0.321958 point=+0.177318
|d lo|=0.000597  |d hi|=0.000269   (independent RNGs, so this is Monte-Carlo difference, not a formula difference)
```

§2.3 runs scipy's own bootstrap over row indices with ARU's qwk as the statistic, 4000
resamples on 300 rows, against `gain_band_paired` on the same rows. The two disagree by
6.0e-4 and 2.7e-4 — the size of the Monte-Carlo spread measured independently in §4
(sd 3.8e-3 at 2000 resamples), not a difference in what is being computed.

## 3. The unpaired approximation, bounded rather than assumed

`run_epoch` in `ml/train_visible_attributes.py` aggregates predictions into a confusion
matrix and keeps no per-row output, so the gate can only resample the two matrices
separately — which treats the model and the heuristic, run on the *same* rows, as
independent. `ml/qwk_noise.py`'s first draft asserted that this is conservative. It was
measured and the claim only survives in the regime that matters.

`shared` is how much of each scorer's error draw comes from one per-row difficulty draw
both scorers see: 0 makes their errors conditionally independent given the truth, 1
makes a row that fools one fool the other.

```
 shared     n    point  paired w  unpaired w   ratio
    0.0   150  +0.1927    0.3123      0.3340   1.070
    0.0   300  +0.0788    0.2732      0.2855   1.045
    0.0   600  +0.1418    0.1959      0.1950   0.995
                                  12 trials: min 0.952 mean 1.018 max 1.103
    0.5   150  +0.1486    0.3240      0.3206   0.989
    0.5   300  +0.2793    0.2312      0.2601   1.125
    0.5   600  +0.2512    0.1783      0.1907   1.070
                                  12 trials: min 0.954 mean 1.040 max 1.182
    1.0   150  +0.2141    0.3143      0.3551   1.130
    1.0   300  +0.1421    0.2626      0.2924   1.114
    1.0   600  +0.1308    0.1592      0.1889   1.187
                                  12 trials: min 1.104 mean 1.195 max 1.269
```

Read it as stated, not more strongly: at `shared = 0` the ratio brackets 1.0 and the
spread is Monte-Carlo, so "conservative" is **not** true there — it is simply the same
width. At `shared = 1` every one of 12 trials is over 1.0, min 1.104, mean 1.195. A
trained head and a threshold rule reading the same photograph fail on the same hard
frames, so `shared` near 1 is the realistic end. The honest summary is: never materially
narrower, and up to about a quarter wider where it counts.

`gain_band_paired` is shipped alongside, ready for the day the trainer retains per-row
predictions. Making it so is not a small change — it means carrying predictions out of
`run_epoch` — and there is no training data to exercise it on yet.

## 4. Monte-Carlo error at 2000 resamples

```
=== 4 Monte-Carlo error of the bound at DEFAULT_RESAMPLES=2000 ===
20 seeds, n=300: lo sd=0.00376  hi sd=0.00378  mean width=0.27168
lo sd is 1.38% of the band width; hi sd is 1.39%
```

scipy defaults to 9999 resamples. 2000 puts the run-to-run wobble of a bound at 1.4% of
the band's own width, on a band that is computed once per training run in pure Python.
`DEFAULT_SEED` is fixed so two readers of one `metrics.json` quote the same bounds.

```
=== 5.3 cost of one band, in wall clock ===
one axis, 300 rows, 2000 resamples: 0.550s (1.651s for the three axes the heuristic covers)
```

## 5. The answer

How wide is the band, against the number of rows the model and the heuristic are both
scored on? Twelve trials per row count, model and heuristic equally good by
construction, `shared = 1`:

```
=== 5.1 band width against scored rows (model and heuristic equally good) ===
  rows  trials  median width  half-width  max |point|  clears 0.0
    60      12        0.6543      0.3272       0.2385       0/12
   150      12        0.4061      0.2030       0.1654       0/12
   300      12        0.3011      0.1506       0.0869       0/12
   600      12        0.2062      0.1031       0.0625       0/12
  1200      12        0.1442      0.0721       0.0520       0/12
  3000      12        0.0900      0.0450       0.0341       0/12
```

Two things to take from it.

**The `minTrainingCrops: 300` row is the one that matters, and the band there is ±0.15
qwk.** The gate's own floor for a promotable run is 300 training crops; the validation
split is smaller still. At 300 scored rows, two scorers that are *identical in
expectation* produced raw gains as large as **+0.0869** across twelve trials. The rule
the manifest publishes — `gain > 0.0`, strictly greater — passes every one of them. So
the concern the manifest note raised is not theoretical: a gain of 0.001, or of 0.08, is
inside the noise at the sample size the gate itself asks for.

**And the band is not cleared by accident.** In all 72 trials above, a model with no
real edge cleared its band **0 times**. The instrument is not simply wide.

At 300 rows specifically:

```
=== 5.2 at the gate's own minTrainingCrops = 300 ===
no real difference   raw gain  +0.0882   band [-0.0574, +0.2384]   width 0.2958   gain > 0.0: True   clears band: False
tiny real edge       raw gain  +0.0949   band [-0.0501, +0.2407]   width 0.2908   gain > 0.0: True   clears band: False
modest real edge     raw gain  +0.1974   band [+0.0715, +0.3254]   width 0.2539   gain > 0.0: True   clears band: True
large real edge      raw gain  +0.4825   band [+0.3746, +0.5949]   width 0.2202   gain > 0.0: True   clears band: True
```

The first two rows pass the published gate and do not clear their own band. The last two
do both. That is the whole finding in four lines.

**What this does not settle.** It says nothing about what `minQwkGainOverHeuristic`
*should* be. A fixed positive constant would be the wrong shape anyway — the band
depends on the split's size, so the honest rule is "clear your own band", not "clear
0.08". Writing that rule into `promotionGate` is an owner decision. What lands this
cycle is the measurement, the machinery, and the line in every future report.

## 6. What the gate now reports

`beats_heuristic_check` gains two reported fields per covered axis and no new blocker:

- `gainNoiseBand` — `{method, pairing, resamples, confidence, seed, point, scoredRows,
  lo, hi}`.
- `clearsNoiseBand` — whether `lo > minQwkGainOverHeuristic`, or `None` when no band
  could be computed.

`promotion_check`'s result gains a `warnings` list, separate from `blockers`.
`promotable` is still `not blockers` and nothing else. A claimed gain that does not
clear its band produces a warning whose text says so in the same breath:

> `[oil] the qwk gain of +0.095 over the shipped heuristic does not clear its own 95%
> bootstrap band [-0.050, +0.241] on 300 rows, so it is not distinguishable from 0.000.
> Not a blocker: the published gate asks only for a positive gain.`

The band is computed on `promoted_val_confusion` — the validation pass taken after the
best checkpoint is reloaded — and on the confusion matrix `heuristic_baseline.score`
now returns alongside its metrics, so both sides come from the rows the comparison was
actually made on.

## 7. Breaks

Every guard was broken at the source line it protects, never at the test. Ten breaks,
each applied alone and reverted; every file's sha256 was compared before and after and
all five matched.

Counts are against the final 121-test suite. Break 4's entry is the second run: on the
120-test suite it failed **nothing**, which is why §7's last paragraph exists and why a
121st case was added before this table was re-measured.

| # | break | fails of 121 |
|---|---|---|
| 1 | `quantile`: virtual index `q*(n-1)` → `q*n` | 1 |
| 2 | `resample_confusion`: draw cells in order instead of with replacement | 7 |
| 3 | `clears_band`: read the upper bound instead of the lower | 3 |
| 4 | `_band`: `alpha = (1-c)/2` → `(1-c)` | 1 (**0 of 120 before the guard below**) |
| 5 | `_gain_noise_band`: stop checking the two matrices have the same level count | 1 |
| 6 | `beats_heuristic_check`: never warn, whatever the band says | 1 |
| 7 | `heuristic_baseline`: stop returning the matrix it scored | 1 |
| 8 | trainer: re-score the checkpoint *before* reloading it | 1 |
| 9 | trainer: feed the gate `last_val_confusion` again (the PR #69 defect itself) | 2 |
| 10 | trainer: band the gate on the last epoch's confusion | 1 |

Assertion messages, verbatim:

```
1  2.5 != 2.0 within 7 places (0.5 difference)
2  0 not greater than 190 : resampling is not varying the matrix
   (0.3304976954377842, 0.3304976954377842) == (0.3304976954377842, 0.3304976954377842)
3  True is not False        (clears_band said a band straddling zero clears zero)
5  test_a_mis_shaped_matrix_is_ignored_rather_than_banded: expected None, got a band
6  'does not clear its own' not found in ''
7  KeyError: 'confusion'
8  34871 not less than 34619 : the promoted checkpoint is scored BEFORE it is loaded,
   so the gate reads whatever weights happened to be in memory
9  'final_val_metrics = metrics_from_confusion(last_val_confusion)' unexpectedly found
10 'model_confusion=promoted_val_confusion,' not found
```

**Break 4 is the one worth writing down.** Changing the two-sided `alpha` to a one-sided
one left all 120 tests green: every other case reads a 95% band, and at that confidence
both conventions still produce an interval that looks entirely plausible. It was caught
only because the break was tried. The fix is a case that separates them —
`test_the_interval_is_two_sided_at_the_requested_confidence` asks for a **50%** band,
where the two-sided reading gives the 25th and 75th percentiles and the one-sided
reading gives the median twice:

```
AssertionError: 0.0 not greater than 0.0 : a 50% interval collapsed to a point:
alpha is not being halved
```

With that case added the break fails 1 of 121, and the failure names what is protected.

Break 2 is the widest at 7 of 121, and that is the shape it should have: making
resampling a no-op collapses every band to a point, so everything that reads a band
fails. Breaks 1, 5, 6, 7, 8 and 10 each fail exactly one case, and that case names what
broke.

## 8. The PR #69 fix had no guard, and now it does

PR #69 (merged 2026-09-21) fixed a real defect: the trainer promoted the BEST checkpoint
by mean validation accuracy while handing the gate `last_val_confusion`, which is always
the FINAL epoch's — so the qwk floor and the heuristic comparison judged weights nobody
was going to ship. Verified present on main `0b536da`:
`ml/train_visible_attributes.py:858` reads
`final_val_metrics = metrics_from_confusion(promoted_val_confusion)`, from a validation
pass taken after `model.load_state_dict(checkpoint["model"])`, and the last epoch's is
kept under its own name at line 926.

Nothing asserted any of that. Reintroducing the defect was free, which is how it got
there the first time. Breaks 8, 9 and 10 above are the guard: the trainer's source is
read for the ORDER of reload → re-score → gate, so moving the re-score above the reload
fails even though every string is still present.
