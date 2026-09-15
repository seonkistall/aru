# Verifying the ordinal metrics behind the promotion gate

**Date:** 2026-09-15
**Question:** the promotion gate is about to refuse a model on `qwk` and `pearson`.
Are ARU's two hand-written implementations of those metrics actually the published
metrics, or just functions with those names?

This mattered before the gate changed, not after. A floor read off a subtly wrong
scorer is worse than no floor: it rejects good models and, if the error runs the
other way, waves through exactly the head the floor exists to catch.

## What was checked, and against what

`quadratic_weighted_kappa` and `pearson_from_confusion` (now in `ml/ordinal_metrics.py`,
previously inline in `ml/train_visible_attributes.py`) against:

| ARU function | Reference |
|---|---|
| `quadratic_weighted_kappa` | `sklearn.metrics.cohen_kappa_score(y1, y2, weights="quadratic")`, scikit-learn 1.9.1 |
| `pearson_from_confusion` | `scipy.stats.pearsonr`, SciPy 1.17.1 |

Neither library is a dependency of this repository and neither should become one —
the ML rule modules are standard-library-only on purpose, so `ml/selftest.py` runs
anywhere `py_compile` does. They were installed into a throwaway virtualenv outside
the repo for this check only; the scripts that use them are committed under
`ml/tools/` and import them inside `main()`, so nothing in `npm run smoke` or
`ml/selftest.py` touches either library.

ARU reads a confusion matrix; the reference implementations read two label vectors.
The comparison expands each matrix back into the `(y_true, y_pred)` pairs that produce
it, which is the identity the matrix is a summary of.

Note on reachability: this is a *computational* verification against an independent
implementation, not a reading of Cohen (1968) or Landis & Koch (1977). Neither paper,
nor any general reference page for them, is reachable from the build network — see
"What could not be verified" below.

## Result

Verbatim output of `ml/tools/verify_ordinal_metrics.py`, 2,000 random matrices at 2,
3 and 4 levels with counts drawn from `{0, 0, 1, 2, 5, 20, 80}`, seed 20260915:

```
random confusion matrices compared: 1982
  skipped (sklearn returns nan, no chance-corrected value defined): 18
  max |aru_qwk - sklearn cohen_kappa_score(weights='quadratic')| = 6.661e-16
  max |aru_pearson - scipy pearsonr|                             = 1.110e-15

-- majority-class predictor, skewed 3-level scale --
  matrix                : [[80, 0, 0], [15, 0, 0], [5, 0, 0]]
  aru qwk               : 0.0
  sklearn qwk           : 0.0
  aru pearson           : 0.0
  scipy pearson         : undefined (predicted column is constant, std=0)

-- a perfect predictor --
  aru qwk     : 1.0
  sklearn qwk : 1.0
  aru pearson : 1.0
  scipy r     : 1.0

-- a worse-than-chance predictor --
  aru qwk     : -0.9718309859154926
  sklearn qwk : -0.971830985915493
  aru pearson : -1.0
  scipy r     : -1.0
```

The script asserts `quadratic_weighted_kappa(matrix) == 0.0` for every one of the 18
matrices the reference calls undefined, so that divergence is checked rather than
assumed.

Agreement to floating-point noise: **6.7e-16 for kappa, 1.1e-15 for correlation**,
over 1,982 comparable matrices. Both implementations are the published metrics.

Two places where ARU deliberately differs, both where the reference is undefined:

- 18 of the 2,000 matrices tripped scikit-learn's own condition, reported verbatim in
  its warning as "`y1`, `y2` and `labels` have only one label in common" — all the
  mass in one cell, on or off the diagonal. It calls kappa undefined there and returns
  `nan`; ARU returns `0.0`. For a gate, `0.0` is the conservative reading — it blocks
  a model whose validation set carried one grade, where `nan` would slip past a `<`
  comparison and `1.0` would promote it. Pinned by
  `OrdinalMetrics.test_all_mass_on_one_cell_reads_zero_not_one`, and the gate itself
  now rejects any non-finite score
  (`PromotionGate.test_a_non_finite_score_blocks_rather_than_slipping_past_the_comparison`).
- `pearson_from_confusion` returns `0.0` when either margin has no variance, which
  is exactly the constant-predictor case; SciPy raises there instead.

## Choosing the floor

The gate needed a number, and the honest way to pick one was to measure what
concrete predictors score rather than to quote a benchmark table nobody here can
open. Ground truth is the skewed 3-level prior the backlog uses (80/15/5 of 100),
400 draws per predictor. Verbatim output of `ml/tools/ordinal_floor_table.py`
(standard library only — this one needs nothing installed):

```
predictor                                   accuracy   w/in 1      qwk  pearson
always the majority level                     0.8000   0.9500   0.0000   0.0000
uniform random                                0.3330   0.7192  -0.0012  -0.0020
random from the truth prior                   0.6661   0.9210   0.0033   0.0033
correct 40% of the time, else uniform         0.5992   0.8286   0.1999   0.2640
correct 60% of the time, else uniform         0.7376   0.8878   0.3673   0.4291
correct 80% of the time, else uniform         0.8653   0.9425   0.6003   0.6361
correct 60%, else off by exactly one          0.7696   1.0000   0.6657   0.6941
correct 80%, else off by exactly one          0.8839   1.0000   0.8172   0.8278
perfect                                       1.0000   1.0000   1.0000   1.0000
```

Read the first three rows next to the last: a predictor carrying no information at
all reaches **accuracy 0.80 and within-one-grade agreement 0.95**, which is why none
of accuracy, ordinal MAE or within-one-grade can be a promotion signal on this scale.
`qwk` and `pearson` are the only reported metrics that collapse for it.

**`minQwk = 0.40`, `minPearson = 0.40`**, set in
`public/models/visible-attributes/manifest.json` under `promotionGate.ordinal`, with
the same values as `model_contract.FALLBACK_ORDINAL_GATE` for a checkout without the
web app.

What the table supports, stated no more strongly than that:

- Every information-free predictor scores **≤ 0.0033** in absolute value. 0.40 is
  about 120x that, so the floor is nowhere near a coin flip and rejects the whole
  class the gate exists to catch.
- It also rejects "correct 40% of the time, else uniform" (0.1999) and "correct 60%
  of the time, else uniform" (0.3673), and accepts every predictor at 0.6003 and
  above.
- Nothing in the table lands between **0.3673 and 0.6003**, so where exactly the line
  falls inside that gap is not determined by this evidence. 0.40 is the conservative
  end of it.

What the table does **not** support, and an earlier draft of this file wrongly
claimed: that 0.40 separates predictors which beat the trivial baseline from those
which do not. It does not. "Correct 60%, else off by exactly one" scores accuracy
0.7696 — below always-majority's 0.8000 — at qwk **0.6657**, so it clears the floor
comfortably while being less accurate than always guessing the majority grade. That
predictor is in fact the better one (perfect within-one-grade agreement, real ordinal
signal); the lesson is that exact-match accuracy is a bad baseline to rank against on
a skewed scale, which is the same reason this floor exists. The floor is a floor on
information content, not a guarantee of beating any particular baseline.

It is provisional, and the manifest says so. It was chosen from synthetic predictors
because no labelled ARU validation set exists yet; the first real training run should
report its own numbers and the floor should be revisited against them, not against
this table.

## What could not be verified

The published benchmark bands for kappa — "substantial agreement" and so on — could
not be read from any source. `en.wikipedia.org`, `scikit-learn.org`,
`developer.mozilla.org`, `arxiv.org` and `developers.google.com` all refuse the
CONNECT from this network (`http=000`, `CONNECT tunnel failed, response 403`);
`pypi.org` is the only one of the eight hosts probed that answered (`http=200`),
which is what made the reference implementations available at all. So the 0.40 floor
rests on the measured table above and on nothing else. Anyone who can reach the
literature should check it against the conventional bands and adjust.

## Reproducing

Both scripts are committed under `ml/tools/`, seeded, and import the optional
libraries lazily so nothing in `npm run smoke` or `ml/selftest.py` depends on them:

```bash
python3 -m venv /tmp/refvenv && /tmp/refvenv/bin/pip install scikit-learn scipy
/tmp/refvenv/bin/python ml/tools/verify_ordinal_metrics.py
/tmp/refvenv/bin/python ml/tools/ordinal_floor_table.py
```

They are tools, not tests: `selftest.py` pins the resulting values as constants
(`OrdinalMetrics`) so the repository keeps the guarantee without the dependency.
