#!/usr/bin/env python3
"""Score the shipped ROI heuristic on the same rows the model is evaluated on.

Why this exists
---------------
The promotion gate used to ask "is this model good in absolute terms?" — accuracy,
a subgroup gap, and since 2026-09-15 a qwk/pearson floor. None of that answers the
question the gate is actually for: *should this model REPLACE the rule the app
already ships?* A model can clear every absolute bar and still be worse than the
three thresholds in lib/skin.ts, and promoting it would make the product worse
while every number in the report looked fine.

So the heuristic gets scored too, on the same validation rows, through the same
confusion-matrix code (ml/ordinal_metrics.py). A baseline computed by a second
implementation, or on a different split, is a baseline nobody can trust.

What the heuristic is
---------------------
Per axis, one scalar ROI feature and ascending cut points: level 0 below the first
cut, 1 between, 2 above. Identical to `bucket()` in lib/skin.ts. The thresholds and
feature keys come from the shipped manifest's `fallbackHeuristic` block, which
tests/skin-index-contract.test.ts pins against lib/skin.ts — this module never
re-declares them, because a baseline drifting from the rule it claims to represent
is the whole failure mode.

Only the three axes with a scalar ROI feature are covered. The rest have no
heuristic to beat, and the gate asks nothing of them.

Standard library only, so ml/selftest.py can exercise all of it.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import model_contract  # noqa: E402
import ordinal_metrics  # noqa: E402


def predict_level(value: float, thresholds: list[float]) -> int:
    """Level for a feature value given ascending cut points.

    Mirrors `bucket()` in lib/skin.ts: strictly-less-than against each cut, in order,
    so a value sitting exactly ON a cut point lands in the HIGHER level. Matching that
    edge convention matters — disagreeing on it would show up as a fake accuracy gap
    between the heuristic and the app.
    """
    level = 0
    for cut in thresholds:
        if value < cut:
            return level
        level += 1
    return level


def _as_float(value: object) -> float | None:
    """Manifest CSV cells are strings, and an unmeasured feature is an empty one."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if value == value and abs(value) != float("inf") else None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    if parsed != parsed or abs(parsed) == float("inf"):
        return None
    return parsed


def covered_axes() -> tuple[str, ...]:
    """Axes the shipped heuristic actually predicts."""
    return tuple((model_contract.fallback_heuristic().get("axes") or {}).keys())


def score(
    rows: list,
    axes: tuple[str, ...],
    levels_for: dict[str, int],
) -> dict[str, dict]:
    """Per-axis metrics for the heuristic over `rows`.

    `rows` are the trainer's Row objects: `.labels[axis]` is the ground-truth level
    (None when unlabelled) and `.meta[<feature>]` is the recorded ROI feature, as
    written into the manifest by ml/prepare_crop_dataset.py.

    A row counts only when it has BOTH a label and a usable feature. `skipped` records
    how many were dropped for want of a feature, so "the heuristic scored well" and
    "the heuristic was scored on nine rows" cannot look the same.
    """
    spec_by_axis = model_contract.fallback_heuristic().get("axes") or {}
    report: dict[str, dict] = {}

    for axis in axes:
        spec = spec_by_axis.get(axis)
        if not spec:
            continue  # no heuristic for this axis; nothing to beat.

        feature_key = spec.get("feature")
        thresholds = list(spec.get("thresholds") or [])
        levels = levels_for[axis]
        matrix = [[0] * levels for _ in range(levels)]
        labelled = 0
        skipped = 0

        for row in rows:
            truth = row.labels.get(axis)
            if truth is None:
                continue
            labelled += 1
            value = _as_float((row.meta or {}).get(feature_key))
            if value is None:
                skipped += 1
                continue
            predicted = min(predict_level(value, thresholds), levels - 1)
            matrix[int(truth)][predicted] += 1

        scored = labelled - skipped
        entry = {
            "feature": feature_key,
            "thresholds": thresholds,
            "labelledRows": labelled,
            "scoredRows": scored,
            "skippedNoFeature": skipped,
        }
        if scored:
            entry.update(ordinal_metrics.metrics_from_confusion({axis: matrix})[axis])
        report[axis] = entry

    return report


def describe() -> dict:
    """What the baseline is, for the experiment report."""
    heuristic = model_contract.fallback_heuristic()
    return {
        "version": heuristic.get("version"),
        "source": model_contract.source(),
        "axes": heuristic.get("axes") or {},
    }


if __name__ == "__main__":
    import json

    print(json.dumps(describe(), ensure_ascii=False, indent=2))
