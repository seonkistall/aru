#!/usr/bin/env python3
"""Check ARU's ordinal scorers against independent reference implementations.

A tool, not a test. `ml/selftest.py` pins the resulting values as constants so the
repository keeps the guarantee without taking on the dependency; this script is what
re-establishes that guarantee if either scorer is ever changed.

scikit-learn and SciPy are NOT dependencies of this repository — the ML rule modules
are standard-library-only so `ml/selftest.py` runs anywhere `py_compile` does. They
are imported inside main() so importing or byte-compiling this file needs neither.

    python3 -m venv /tmp/refvenv && /tmp/refvenv/bin/pip install scikit-learn scipy
    /tmp/refvenv/bin/python ml/tools/verify_ordinal_metrics.py

See docs/ordinal-metric-verification.md for the run this was written from.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ordinal_metrics  # noqa: E402

SEED = 20260915
TRIALS = 2000
COUNTS = [0, 0, 1, 2, 5, 20, 80]

MAJORITY = [[80, 0, 0], [15, 0, 0], [5, 0, 0]]
PERFECT = [[40, 0, 0], [0, 30, 0], [0, 0, 30]]
INVERTED = [[0, 0, 40], [0, 30, 0], [30, 0, 0]]


def expand(matrix: list[list[int]]) -> tuple[list[int], list[int]]:
    """The (y_true, y_pred) pairs the confusion matrix is a summary of."""
    y_true: list[int] = []
    y_pred: list[int] = []
    for i, row in enumerate(matrix):
        for j, count in enumerate(row):
            y_true += [i] * count
            y_pred += [j] * count
    return y_true, y_pred


def main() -> int:
    import warnings

    import numpy as np
    from scipy.stats import pearsonr
    from sklearn.metrics import cohen_kappa_score

    def reference_kappa(matrix, levels):
        y_true, y_pred = expand(matrix)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return cohen_kappa_score(
                np.array(y_true), np.array(y_pred), weights="quadratic", labels=list(range(levels))
            )

    rng = random.Random(SEED)
    worst_kappa = worst_pearson = 0.0
    compared = skipped = 0
    for _ in range(TRIALS):
        levels = rng.choice([2, 3, 4])
        matrix = [[rng.choice(COUNTS) for _ in range(levels)] for _ in range(levels)]
        if sum(sum(row) for row in matrix) < 2:
            continue
        compared += 1
        ref_k = reference_kappa(matrix, levels)
        if np.isnan(ref_k):
            # sklearn: "`y1`, `y2` and `labels` have only one label in common".
            # ARU returns 0.0 there on purpose — a gate must block, not promote.
            skipped += 1
            assert ordinal_metrics.quadratic_weighted_kappa(matrix) == 0.0
        else:
            worst_kappa = max(worst_kappa, abs(ref_k - ordinal_metrics.quadratic_weighted_kappa(matrix)))
        y_true, y_pred = expand(matrix)
        if np.std(y_true) > 0 and np.std(y_pred) > 0:
            ref_r = pearsonr(np.array(y_true), np.array(y_pred)).statistic
            worst_pearson = max(worst_pearson, abs(ref_r - ordinal_metrics.pearson_from_confusion(matrix)))

    print(f"random confusion matrices compared: {compared}")
    print(f"  skipped (sklearn returns nan, no chance-corrected value defined): {skipped}")
    print(f"  max |aru_qwk - sklearn cohen_kappa_score(weights='quadratic')| = {worst_kappa:.3e}")
    print(f"  max |aru_pearson - scipy pearsonr|                             = {worst_pearson:.3e}")

    print("\n-- majority-class predictor, skewed 3-level scale --")
    print("  matrix                :", MAJORITY)
    print("  aru qwk               :", ordinal_metrics.quadratic_weighted_kappa(MAJORITY))
    print("  sklearn qwk           :", reference_kappa(MAJORITY, 3))
    print("  aru pearson           :", ordinal_metrics.pearson_from_confusion(MAJORITY))
    print("  scipy pearson         : undefined (predicted column is constant, std=0)")

    for name, matrix in (("a perfect predictor", PERFECT), ("a worse-than-chance predictor", INVERTED)):
        y_true, y_pred = expand(matrix)
        print(f"\n-- {name} --")
        print("  aru qwk     :", ordinal_metrics.quadratic_weighted_kappa(matrix))
        print("  sklearn qwk :", reference_kappa(matrix, 3))
        print("  aru pearson :", ordinal_metrics.pearson_from_confusion(matrix))
        print("  scipy r     :", pearsonr(np.array(y_true), np.array(y_pred)).statistic)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
