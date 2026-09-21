#!/usr/bin/env python3
"""How much of a qwk gain over the heuristic is just validation noise?

Why this exists
---------------
`promotionGate.subgroup.minQwkGainOverHeuristic` in the shipped manifest is **0.0**,
and its own note says why: "It is 0.0 and not a positive margin because a margin should
exceed validation noise and nothing here estimates that noise yet." So a model beating
the shipped ROI heuristic by 0.001 qwk on one validation split passes a rule whose
threshold nobody could justify, and the difference may be smaller than the split's own
sampling error. This module estimates that error, so the number exists before the first
real training run needs it.

What it computes
----------------
A percentile bootstrap. The convention is scipy's, not one invented here:
`scipy.stats.bootstrap(..., method="percentile")` takes
``alpha = (1 - confidence_level) / 2`` and returns the ``alpha`` and ``1 - alpha``
quantiles of the resampled statistic under the *linear* quantile method (numpy's
default). Read from scipy's own source — see `docs/qwk-noise-band.md` §1 for the fetch
and its sha256 — and verified numerically against the installed scipy in §2.

Two entry points, because ARU can only afford one of them today:

- `gain_band_from_confusions` resamples each confusion matrix on its own. A confusion
  matrix is a sufficient statistic for ONE scorer's (truth, prediction) pairs, so
  resampling its cells multinomially is exactly resampling that scorer's rows with
  replacement. What it cannot see is that the model and the heuristic were scored on
  the SAME rows, so it treats the two qwk estimates as independent. The first draft of
  this module asserted that this is conservative; §3 measured it and the claim only
  holds in the regime that matters. When the two scorers fail on the same rows the
  unpaired band is **1.104-1.269x** the paired one over 12 trials; when their errors are
  conditionally independent given the truth it is **0.952-1.103x**, i.e. the same width
  within the ~±5% Monte-Carlo spread of the width itself. So: never materially narrower,
  and up to about a quarter wider exactly where a real model and a threshold rule on the
  same photographs would be correlated.
- `gain_band_paired` takes per-row `(truth, model_level, heuristic_level)` triples and
  resamples rows, so both scorers see the same resample. It is the correct statistic
  and the trainer cannot feed it yet: `run_epoch` aggregates predictions into a
  confusion matrix and keeps no per-row output. Shipped ready rather than written later
  from a description, and exercised by ml/selftest.py against the unpaired form.

Nothing here decides anything. The band is REPORTED next to the gain; turning it into a
promotion rule means changing `promotionGate` in the shipped manifest, which is the
owner's call and not a cycle's.

Standard library only, so ml/selftest.py can exercise all of it.
"""

from __future__ import annotations

import random
import sys
from bisect import bisect_right
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ordinal_metrics  # noqa: E402

#: Resamples per band. scipy defaults to 9999; this runs in pure Python once per
#: training run, and 2000 puts the Monte-Carlo error on a 95% bound well below the
#: width of the band itself at the sample sizes the gate asks for (see §4).
DEFAULT_RESAMPLES = 2000

#: Fixed so two readers of the same metrics.json see the same band. A bootstrap whose
#: bounds move between runs is a bound nobody can quote.
DEFAULT_SEED = 20260921


def quantile(sorted_values: list[float], q: float) -> float:
    """The `linear` quantile of an ALREADY SORTED sample, as numpy computes it.

    numpy's default (`np.percentile(..., method="linear")`, which is what
    `scipy.stats.bootstrap`'s percentile method calls) places the requested quantile at
    the virtual index ``q * (n - 1)`` and interpolates linearly between its neighbours.
    Written out because getting this wrong by one index is a silent, plausible-looking
    change to every bound this module prints.

    `q` is a fraction in [0, 1], not a percentage.
    """
    if not sorted_values:
        raise ValueError("quantile of an empty sample")
    if not 0.0 <= q <= 1.0:
        raise ValueError(f"q must be a fraction in [0, 1], got {q!r}")
    n = len(sorted_values)
    if n == 1:
        return float(sorted_values[0])
    position = q * (n - 1)
    low = int(position)
    if low >= n - 1:
        return float(sorted_values[n - 1])
    frac = position - low
    lo_value = float(sorted_values[low])
    hi_value = float(sorted_values[low + 1])
    return lo_value + frac * (hi_value - lo_value)


def _cumulative_cells(matrix: list[list[int]]) -> tuple[list[tuple[int, int]], list[int], int]:
    """Cells with a nonzero count, and the running total that indexes into them."""
    cells: list[tuple[int, int]] = []
    cumulative: list[int] = []
    running = 0
    for i, row in enumerate(matrix):
        for j, count in enumerate(row):
            if count:
                running += count
                cells.append((i, j))
                cumulative.append(running)
    return cells, cumulative, running


def resample_confusion(
    matrix: list[list[int]], rng: random.Random
) -> list[list[int]]:
    """One bootstrap resample of a confusion matrix, drawn row-by-row WITH replacement.

    A confusion matrix records, for each of `total` scored rows, which (truth,
    prediction) cell it fell in. Nothing else about a row affects qwk. So drawing
    `total` cells with replacement, each with probability count/total, is exactly a
    bootstrap over the scored rows — no per-row storage needed.

    Returns a matrix with the same shape and the same total.
    """
    levels = len(matrix)
    cells, cumulative, total = _cumulative_cells(matrix)
    out = [[0] * levels for _ in range(levels)]
    if total == 0:
        return out
    for _ in range(total):
        draw = rng.randrange(total)
        i, j = cells[bisect_right(cumulative, draw)]
        out[i][j] += 1
    return out


def _band(samples: list[float], confidence: float) -> tuple[float, float]:
    alpha = (1.0 - confidence) / 2.0
    ordered = sorted(samples)
    return quantile(ordered, alpha), quantile(ordered, 1.0 - alpha)


def gain_band_from_confusions(
    model_matrix: list[list[int]],
    heuristic_matrix: list[list[int]],
    *,
    resamples: int = DEFAULT_RESAMPLES,
    confidence: float = 0.95,
    seed: int = DEFAULT_SEED,
) -> dict:
    """Band on (model qwk - heuristic qwk), resampling the two matrices separately.

    The two scorers were run on the same rows and this cannot see that, so the band is
    the UNPAIRED one. Measured against the paired form in §3 of `docs/qwk-noise-band.md`:
    1.104-1.269x its width when the two scorers fail on the same rows, and equal to it
    within Monte-Carlo spread when they do not. Never materially narrower, which is the
    direction a gate needs.

    Returns None-valued bounds rather than raising when either matrix has nothing in it;
    a band computed from no rows is not a band, and the caller reports it as absent.
    """
    if resamples < 2:
        raise ValueError(f"a band needs at least 2 resamples, got {resamples}")
    if not 0.0 < confidence < 1.0:
        raise ValueError(f"confidence must be in (0, 1), got {confidence!r}")

    model_total = sum(sum(row) for row in model_matrix)
    heuristic_total = sum(sum(row) for row in heuristic_matrix)
    point = (
        ordinal_metrics.quadratic_weighted_kappa(model_matrix)
        - ordinal_metrics.quadratic_weighted_kappa(heuristic_matrix)
    )
    base = {
        "method": "percentile",
        "pairing": "unpaired",
        "resamples": resamples,
        "confidence": confidence,
        "seed": seed,
        "point": point,
        "scoredRows": model_total,
    }
    if model_total == 0 or heuristic_total == 0:
        return {**base, "lo": None, "hi": None, "note": "no scored rows to resample"}

    rng = random.Random(seed)
    gains = [
        ordinal_metrics.quadratic_weighted_kappa(resample_confusion(model_matrix, rng))
        - ordinal_metrics.quadratic_weighted_kappa(resample_confusion(heuristic_matrix, rng))
        for _ in range(resamples)
    ]
    lo, hi = _band(gains, confidence)
    return {**base, "lo": lo, "hi": hi}


def gain_band_paired(
    triples: list[tuple[int, int, int]],
    levels: int,
    *,
    resamples: int = DEFAULT_RESAMPLES,
    confidence: float = 0.95,
    seed: int = DEFAULT_SEED,
) -> dict:
    """Band on the gain, resampling ROWS so both scorers see the same resample.

    `triples` are `(truth, model_level, heuristic_level)` per scored row. This is the
    statistic the comparison actually wants; the trainer cannot supply it today because
    `run_epoch` returns a confusion matrix and discards per-row predictions.
    """
    if resamples < 2:
        raise ValueError(f"a band needs at least 2 resamples, got {resamples}")
    if not 0.0 < confidence < 1.0:
        raise ValueError(f"confidence must be in (0, 1), got {confidence!r}")
    for truth, model_level, heuristic_level in triples:
        for value in (truth, model_level, heuristic_level):
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < levels:
                raise ValueError(f"level {value!r} outside 0..{levels - 1}")

    def matrices(rows: list[tuple[int, int, int]]) -> tuple[list[list[int]], list[list[int]]]:
        model = [[0] * levels for _ in range(levels)]
        heuristic = [[0] * levels for _ in range(levels)]
        for truth, model_level, heuristic_level in rows:
            model[truth][model_level] += 1
            heuristic[truth][heuristic_level] += 1
        return model, heuristic

    def gain(rows: list[tuple[int, int, int]]) -> float:
        model, heuristic = matrices(rows)
        return (
            ordinal_metrics.quadratic_weighted_kappa(model)
            - ordinal_metrics.quadratic_weighted_kappa(heuristic)
        )

    base = {
        "method": "percentile",
        "pairing": "paired",
        "resamples": resamples,
        "confidence": confidence,
        "seed": seed,
        "point": gain(triples) if triples else 0.0,
        "scoredRows": len(triples),
    }
    if not triples:
        return {**base, "lo": None, "hi": None, "note": "no scored rows to resample"}

    rng = random.Random(seed)
    n = len(triples)
    gains = [
        gain([triples[rng.randrange(n)] for _ in range(n)])
        for _ in range(resamples)
    ]
    lo, hi = _band(gains, confidence)
    return {**base, "lo": lo, "hi": hi}


def clears_band(band: dict | None, min_gain: float) -> bool | None:
    """Does the claimed gain clear its own noise band? None when there is no band.

    "Clears" means the LOWER bound of the interval is above the required gain — i.e.
    the gain is distinguishable from `min_gain` at this confidence, not merely larger
    than it in the one split that was measured.
    """
    if not isinstance(band, dict):
        return None
    lo = band.get("lo")
    if not isinstance(lo, (int, float)) or lo != lo or abs(lo) == float("inf"):
        return None
    return lo > min_gain
