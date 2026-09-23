# What a feature value that is not a number should do

Cycle 30, 2026-09-23.

Every number here is the literal output of a command run in this container on that
date. Where a run was not done, this file says so.

## 1. The question the ML track needed answered

`ml/run_pipeline.py` grades every labelled row against the shipped heuristic so the
readiness report can say how good the rule ARU already ships actually is. That grading
reads one scalar feature per axis out of the exported row. Nothing between the device
and that line guarantees the value is a finite number: the export is JSON written by a
browser, `features.get(key, "")` in the same file writes whatever it finds into the
manifest CSV, and `docs/scan-cost-measurement.md` and the index docs are full of guards
that return `0` rather than a measurement when a region is missing.

So: **what should a pipeline do with a feature value that is not a finite number —
refuse the run, drop the row, or substitute something?** ARU had three answers in three
places and had never picked one.

## 2. The primary source: scikit-learn refuses, and never substitutes

Read from scikit-learn's own source rather than from documentation or recall.
`developer.mozilla.org`, `en.wikipedia.org` and `scikit-learn.org` all refuse this
network (see BLOCKERS in [`AUTOPILOT.md`](AUTOPILOT.md)); `raw.githubusercontent.com`
answers, which is what made this readable.

```
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.5.2/sklearn/utils/validation.py
http=200 bytes=92307
sha256 a6beb3a250e4ad7065f3c14dcfa8368d78ec93c59f800ce332734cea3b8249dc
```

`check_array`, the function every estimator's `fit` and `predict` puts its input
through, takes `force_all_finite` and its default is to refuse (line 784 of that file):

```
    force_all_finite : bool or 'allow-nan', default=True
        Whether to raise an error on np.inf, np.nan, pd.NA in array. The
        possibilities are:

        - True: Force all values of X to be finite.
        - False: accepts np.inf, np.nan, pd.NA in X.
        - 'allow-nan': accepts only np.nan and pd.NA values in X. Values cannot
          be infinite.
```

Three options, and **none of them is "substitute a value"**. The check itself
(`_assert_all_finite`, line 93) raises `ValueError("Input contains NaN")`, and when the
input is an estimator's `X` the message names the two things the caller is expected to
do instead (lines 158-166):

```
                f"\n{estimator_name} does not accept missing values"
                " encoded as NaN natively. For supervised learning, you might want"
                " to consider sklearn.ensemble.HistGradientBoostingClassifier and"
                " Regressor which accept missing values encoded as NaNs natively."
                " Alternatively, it is possible to preprocess the data, for"
                " instance by using an imputer transformer in a pipeline or drop"
                " samples with missing values."
```

Impute, or drop the sample. Never quietly turn it into a class.

What this reference does **not** settle, said plainly rather than glossed: it is about
an estimator's input matrix, not about a report's accuracy figure, and it has no view
on what to do once you have dropped a row. ARU cannot raise the way an estimator can —
one unmeasurable row must not end a pipeline run over 300 good ones — so the answer it
gives ARU is the second half: drop, and because a silent drop is its own failure, the
caller says how many it dropped. That reporting shape is the one cycle 28 took from
`scipy.signal.find_peaks`, which makes a plateau's extent an output and leaves the
filter to the caller (`docs/blemish-perturbation-tolerance.md` §7.6).

## 3. What ARU had: three policies, one situation

Measured before any change, on `af00c7c`:

```
== run_pipeline.bucket on non-finite and boundary ==
  bucket(nan, 0.25, 0.45) = 2
  bucket(inf, 0.25, 0.45) = 2
  bucket(-inf, 0.25, 0.45) = 0
  bucket(0.0, 0.25, 0.45) = 0
== ml/heuristic_baseline._as_float on the same ==
  _as_float(nan) = None
  _as_float(inf) = None
  _as_float(-inf) = None
  _as_float(None) = None
  _as_float('') = None
  _as_float('nan') = None
  _as_float(0.0) = 0.0
== run_pipeline.feature_summary keeps? ==
   {'shine': {'count': 1, 'min': 0.5, 'max': 0.5, 'mean': 0.5, 'median': 0.5}}
== run_pipeline.heuristic_baseline with one NaN shine row ==
   oil: {'feature': 'shine', 'thresholds': {'lo': 0.05, 'hi': 0.16}, 'n': 1,
         'accuracy': 0.0, 'confusion': {'0': {'0': 0, '1': 0, '2': 1}, ...}}
== run_pipeline.heuristic_baseline with a None shine row ==
   raised TypeError float() argument must be a string or a real number, not 'NoneType'
```

Three policies:

1. `run_pipeline.feature_summary` **drops** it — `math.isfinite`, two rows in, `count: 1`.
2. `ml/heuristic_baseline._as_float` **refuses** it — `None`, and that module is the
   baseline the promotion gate scores a model against.
3. `run_pipeline.heuristic_baseline` **graded** it. `nan < lo` and `nan < hi` are both
   False, so `bucket` returned **2** — the most severe of the three levels — and the row
   counted in `n` and entered the confusion matrix as a prediction. A `None` value was
   worse: `float(None)` raises, and that call runs once per report, so one such row
   ended the whole run rather than one axis.

`bucket` returning 2 on NaN is not a bug in the comparison and must not be "fixed"
there: strictly-less-than against each cut in order is the shipped rule, identical in
`bucket()` in `lib/skin.ts` and `predict_level` in `ml/heuristic_baseline.py`, and a
divergence in it would show up as a fake accuracy gap between the heuristic and the
app. The screen belongs at the call site.

### The cell it lands in is the worst one there is

An unmeasurable row is not noise spread evenly. It is always predicted 2, so on a row
labelled 0 it lands at actual=0/predicted=2 — a two-level miss, which quadratic
weighting punishes **four times** as hard as a one-level miss. Measured on 16 rows whose
12 measurable ones the shipped cuts grade perfectly, against the pre-change function
copied verbatim from `git show HEAD:ml/run_pipeline.py`:

```
BEFORE  n=16 accuracy=0.75 unusable=n/a
        confusion actual=0 -> {'0': 4, '1': 0, '2': 4}
AFTER   n=12 accuracy=1.0 unusable=4
        confusion actual=0 -> {'0': 4, '1': 0, '2': 0}
```

A heuristic that is right about every row it can actually measure was being reported at
75.0%.

### A fourth disagreement, found by the test rather than by reading

`as_feature_float` rejects a `bool` outright. `feature_summary` did not, because
`isinstance(True, int)` is True in Python and `math.isfinite(True)` is True — so a JSON
`true` in a feature column was summarised as the number **1.0** by the report and
refused by the baseline. That was not predicted; the selftest case that pins the two
screens against each other failed on `True` the first time it ran:

```
AssertionError: {'shine': {'count': 1, 'min': 1.0, 'max': 1.0, 'mean': 1.0, 'median': 1.0}} != {}
- {'shine': {'count': 1, 'max': 1.0, 'mean': 1.0, 'median': 1.0, 'min': 1.0}}
+ {} : feature_summary kept True
```

No export in this repository is known to carry a boolean in a feature column, and this
file does not claim one does. The point is that the two screens were not the same
screen, and now they are checked against each other on every shape.

## 4. What changed

- `ml/heuristic_baseline.py`: `_as_float` is now `as_feature_float`, public, because it
  is the repository's one answer to the question and a second implementation of it is
  how the two sides drifted in the first place. One internal call site moved with it;
  nothing else referenced the old name.
- `ml/run_pipeline.py`: `heuristic_baseline` screens through `as_feature_float`, counts
  what it could not grade as `unusable`, and reports it. `feature_summary` excludes
  `bool`. `bucket`'s docstring now says what it requires of its caller.
- The report line prints the dropped rows next to the accuracy, and `warnings_for`
  raises one warning per axis that dropped any — because an accuracy over 40 of 300
  labelled rows reads exactly like one over 300 unless something says otherwise.

Nothing in `public/models/visible-attributes/manifest.json` was touched: not `status`,
not `promotionGate`, not `minQwkGainOverHeuristic`. This changes what the readiness
report *says*, not what the gate *requires*.

## 5. The guards, broken at their source lines

Both breaks were applied to the shipped file, run, and reverted.

**Break 1 — the screen at the grading call site, back to `float(features[feat])`:**

```
ERROR: test_a_missing_feature_value_does_not_take_the_run_down
TypeError: float() argument must be a string or a real number, not 'NoneType'
FAIL: test_a_non_finite_feature_is_not_graded_as_the_top_level
AssertionError: 16 != 12 : NaN rows were graded
FAIL: test_the_dropped_rows_are_reported_rather_than_skipped_in_silence
AssertionError: 0 != 1 : no warning names the dropped rows: []
Ran 142 tests in 2.136s
FAILED (failures=2, errors=1)
```

The TypeError is the original defect reproduced, not a test artefact.

**Break 2 — the `bool` exclusion in `feature_summary`:**

```
FAIL: test_the_two_screens_agree_on_every_shape_the_export_can_carry
AssertionError: {'shine': {'count': 1, 'min': 1.0, 'max': 1.0, 'mean': 1.0, 'median': 1.0}} != {}
Ran 142 tests in 2.051s
FAILED (failures=1)
```

Each break fails only the cases that name what it broke, and `test_a_clean_run_reports_nothing_dropped`
stays green under both — which is what makes this a correction rather than a preference.

Restored: `Ran 142 tests in 2.172s ... OK` (from 137 on `af00c7c`).

## 6. What this does not establish

- No real export was run through the changed code. There is no labelled ARU dataset in
  this repository — that is the golden-set blocker — so every number above is from
  synthetic rows constructed in the measurement itself.
- Whether any real export has ever carried a non-finite feature is **unknown**. This is
  a hole in a path, closed before it was observed, exactly like
  `docs/funnel-store-shape.md`. It must not be cited as if an occurrence had been seen.
- The scikit-learn read settles what a mature library does. It does not settle what
  ARU's *threshold* for refusing a whole run should be — at some fraction of unusable
  rows the report's accuracy stops meaning anything, and no number for that was
  invented here. The warning says how many; a cycle with real data can decide where a
  warning should become a blocker.
