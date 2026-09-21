#!/usr/bin/env python3
"""Skin-tone and age stratification for ARU camera models.

Why tone band and not ethnicity
-------------------------------
ARU does not predict, store, or condition on race. Two reasons, in order:

1. What changes the camera physics is melanin level, not ancestry. Redness is read
   as a red-channel ratio against the local baseline, and that baseline shifts with
   melanin; a label like "Korean" tells the model nothing the pixels do not already
   carry, while ITA tells it exactly what it needs.
2. Under Korean 개인정보보호법 a race or ethnicity field is 민감정보, which raises the
   consent bar for every scan. An ITA value computed on-device from the crop is a
   derived measurement of the image ARU already has consent to analyse.

So the stratifier is a two-axis cell: measured tone band x self-reported age band.
Every model report is computed per cell, and a cell with too few samples is reported
as UNEVALUATED rather than quietly folded into the average.

ITA (Individual Typology Angle) bands match `ita_bucket` in evaluate_dataset.py, which
shipped first. On their attribution, corrected 2026-09-20: this file and
lib/tone-bands.ts credited "the Chardon convention" while ml/skin_indices.py credited
Del Bino & Bernerd — three files describing the same five edges with two different
citations. The benchmark this project already cites (hpicsk/regional-ccm) separates
them: `src/clinical.py` attributes the FORMULA arctan((L*-50)/b*) to Chardon et al.
(1991) and Del Bino et al. (2006), and the six-category CUTPOINTS -30/10/28/41/55 to
Del Bino & Bernerd (2013). ARU uses those cutpoints, so Del Bino & Bernerd is the
citation the edges belong to.

That resolves an internal inconsistency, not the open question. regional-ccm is another
project's source code, not either paper, and no primary source for the cutpoints is
reachable from this network. docs/melanin-index-verification.md records what was checked
and against what.
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from math import isfinite
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ordinal_metrics  # noqa: E402
import qwk_noise  # noqa: E402

#: Del Bino & Bernerd ITA bands, ordered light to dark, with Brown and Dark merged
#: into brown_dark (ml/selftest.py pins that merge as the only difference).
#: Upper bound is exclusive of the next band.
ITA_BANDS: tuple[tuple[str, float], ...] = (
    ("very_light", 55.0),
    ("light", 41.0),
    ("intermediate", 28.0),
    ("tan", 10.0),
    ("brown_dark", float("-inf")),
)

TONE_BAND_ORDER: tuple[str, ...] = tuple(name for name, _ in ITA_BANDS)

AGE_BANDS: tuple[str, ...] = ("teens", "20s", "30s", "40s", "50s", "60plus")

UNKNOWN = "unknown"

#: Fitzpatrick phototype -> tone band. Approximate: phototype is a sun-reaction
#: questionnaire, not a colorimetric measurement, and the two disagree most in the
#: III-IV range. Used only to place external datasets on the same axis, never to
#: relabel ARU's own ITA measurements.
FITZPATRICK_TO_TONE: dict[str, str] = {
    "1": "very_light", "i": "very_light",
    "2": "light", "ii": "light",
    "3": "intermediate", "iii": "intermediate",
    "4": "tan", "iv": "tan",
    "5": "brown_dark", "v": "brown_dark",
    "6": "brown_dark", "vi": "brown_dark",
}

#: Monk Skin Tone 1-10 -> tone band. Also approximate; Monk is a perceptual swatch scale.
MONK_TO_TONE: dict[int, str] = {
    1: "very_light", 2: "very_light",
    3: "light", 4: "light",
    5: "intermediate", 6: "intermediate",
    7: "tan",
    8: "brown_dark", 9: "brown_dark", 10: "brown_dark",
}


def tone_band_from_ita(value: object) -> str:
    """Map an ITA degree value to a band. Non-numeric input yields "unknown"."""
    try:
        ita = float(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return UNKNOWN
    if ita != ita or ita in (float("inf"), float("-inf")):  # NaN / inf guard
        return UNKNOWN
    for name, lower in ITA_BANDS:
        if ita > lower:
            return name
    return "brown_dark"


def tone_band_from_fitzpatrick(value: object) -> str:
    token = str(value or "").strip().lower().replace("type", "").replace("fitzpatrick", "").strip()
    return FITZPATRICK_TO_TONE.get(token, UNKNOWN)


def tone_band_from_monk(value: object) -> str:
    try:
        return MONK_TO_TONE.get(int(float(str(value).strip())), UNKNOWN)
    except (TypeError, ValueError):
        return UNKNOWN


def age_band(value: object) -> str:
    """Normalize an age, an age band string, or a Korean 연령대 label to one band."""
    raw = str(value or "").strip().lower()
    if not raw:
        return UNKNOWN
    direct = {
        "teens": "teens", "10s": "teens", "10대": "teens",
        "20s": "20s", "20대": "20s",
        "30s": "30s", "30대": "30s",
        "40s": "40s", "40대": "40s",
        "50s": "50s", "50대": "50s",
        "60plus": "60plus", "60+": "60plus", "60s": "60plus", "60대": "60plus", "65+": "60plus",
    }
    if raw in direct:
        return direct[raw]
    try:
        age = float(raw.rstrip("세").rstrip("y").strip())
    except (TypeError, ValueError):
        return UNKNOWN
    if age < 13 or age > 120:
        # Under 13 is out of scope: ARU has no guardian-consent flow, so those samples
        # must be excluded from training rather than bucketed.
        return UNKNOWN
    if age < 20:
        return "teens"
    if age < 30:
        return "20s"
    if age < 40:
        return "30s"
    if age < 50:
        return "40s"
    if age < 60:
        return "50s"
    return "60plus"


def resolve_tone_band(row: dict) -> str:
    """Pick a tone band from whatever the row carries, best evidence first."""
    for key in ("tone_band", "toneBand"):
        candidate = str(row.get(key) or "").strip()
        if candidate in TONE_BAND_ORDER:
            return candidate
    # "toneIta" is the key the app itself writes into the feature block, and it is what
    # run_pipeline.py carries into its manifest. Omitting it made every row from that
    # path read as tone-unknown, which blocked promotion for the wrong reason.
    for key in ("ita", "toneIta", "tone_ita", "skin_tone_proxy_ita", "skinToneProxyIta", "ita_proxy"):
        if row.get(key) not in (None, ""):
            band = tone_band_from_ita(row.get(key))
            if band != UNKNOWN:
                return band
    for key in ("fitzpatrick", "fitzpatrick_scale", "skin_type"):
        if row.get(key) not in (None, ""):
            band = tone_band_from_fitzpatrick(row.get(key))
            if band != UNKNOWN:
                return band
    for key in ("monk", "monk_skin_tone", "mst"):
        if row.get(key) not in (None, ""):
            band = tone_band_from_monk(row.get(key))
            if band != UNKNOWN:
                return band
    return UNKNOWN


def resolve_age_band(row: dict) -> str:
    for key in ("age_band", "ageBand", "age", "age_group", "연령대"):
        if row.get(key) not in (None, ""):
            band = age_band(row.get(key))
            if band != UNKNOWN:
                return band
    return UNKNOWN


def subgroup_key(row: dict) -> str:
    """Stable "<tone>/<age>" cell id used by every report and split."""
    return f"{resolve_tone_band(row)}/{resolve_age_band(row)}"


def group_key(row: dict) -> str:
    """Identity used to prevent leakage across folds.

    Two crops of the same face must never straddle a train/val boundary, or the model
    is scored on memorized faces. Participant id wins; session and device are fallbacks.
    """
    for key in ("participant_id", "participantId", "subject_id", "subjectId"):
        value = str(row.get(key) or "").strip()
        if value:
            return f"p:{value}"
    for key in ("session_id", "sessionId"):
        value = str(row.get(key) or "").strip()
        if value:
            return f"s:{value}"
    for key in ("device_id", "deviceId"):
        value = str(row.get(key) or "").strip()
        if value:
            return f"d:{value}"
    for key in ("id", "image"):
        value = str(row.get(key) or "").strip()
        if value:
            return f"row:{value}"
    return "row:unknown"


@dataclass
class Coverage:
    cells: dict[str, int]
    tone: dict[str, int]
    age: dict[str, int]
    groups_per_cell: dict[str, int]
    unknown_tone: int
    unknown_age: int
    total: int

    def thin_cells(self, minimum: int) -> list[str]:
        """Cells present but below the evaluation floor, worst first."""
        return [
            cell for cell, count in sorted(self.cells.items(), key=lambda kv: (kv[1], kv[0]))
            if count < minimum and not cell.startswith(UNKNOWN) and not cell.endswith(UNKNOWN)
        ]

    def as_dict(self) -> dict:
        return {
            "total": self.total,
            "cells": self.cells,
            "toneBands": self.tone,
            "ageBands": self.age,
            "groupsPerCell": self.groups_per_cell,
            "unknownTone": self.unknown_tone,
            "unknownAge": self.unknown_age,
        }


def coverage(rows: list[dict]) -> Coverage:
    cells: Counter = Counter()
    tone: Counter = Counter()
    age: Counter = Counter()
    groups: defaultdict = defaultdict(set)
    unknown_tone = 0
    unknown_age = 0
    for row in rows:
        t = resolve_tone_band(row)
        a = resolve_age_band(row)
        cell = f"{t}/{a}"
        cells[cell] += 1
        tone[t] += 1
        age[a] += 1
        groups[cell].add(group_key(row))
        unknown_tone += t == UNKNOWN
        unknown_age += a == UNKNOWN
    return Coverage(
        cells=dict(cells),
        tone=dict(tone),
        age=dict(age),
        groups_per_cell={cell: len(ids) for cell, ids in groups.items()},
        unknown_tone=unknown_tone,
        unknown_age=unknown_age,
        total=len(rows),
    )


def coverage_warnings(cov: Coverage, min_cell: int = 20, min_groups_per_cell: int = 3) -> list[str]:
    """Human-readable reasons this dataset cannot yet support a subgroup claim.

    min_cell is the same manifest number aggregate_by_cell and fit_tone_calibration
    read, but counted here in ROWS, because coverage runs on metadata before any label
    is read and cannot see which axes a row carries. A row count is an UPPER bound on
    the per-axis count the gate actually applies: a cell of 30 rows labelled on one
    axis each passes here and is still refused by worst_group. So a silent coverage
    report is not a promise that the gate will find the cell evaluable — it is the
    weaker claim that the cell is not thin on rows.
    """
    out: list[str] = []
    if cov.total == 0:
        return ["No rows to evaluate."]
    if cov.unknown_tone:
        pct = 100 * cov.unknown_tone / cov.total
        out.append(f"{cov.unknown_tone} rows ({pct:.0f}%) have no tone band; ITA proxy is missing from the manifest.")
    if cov.unknown_age:
        pct = 100 * cov.unknown_age / cov.total
        out.append(f"{cov.unknown_age} rows ({pct:.0f}%) have no age band; age is not collected for these sessions.")
    missing_tone = [band for band in TONE_BAND_ORDER if not cov.tone.get(band)]
    if missing_tone:
        out.append(f"Tone bands with zero samples: {', '.join(missing_tone)}. No fairness claim covers them.")
    missing_age = [band for band in AGE_BANDS if not cov.age.get(band)]
    if missing_age:
        out.append(f"Age bands with zero samples: {', '.join(missing_age)}.")
    thin = cov.thin_cells(min_cell)
    if thin:
        out.append(f"{len(thin)} cells below {min_cell} samples: {', '.join(thin[:6])}{' ...' if len(thin) > 6 else ''}.")
    thin_groups = [
        cell for cell, count in cov.groups_per_cell.items()
        if count < min_groups_per_cell and cov.cells.get(cell, 0) >= min_cell
    ]
    if thin_groups:
        out.append(
            f"Cells carried by fewer than {min_groups_per_cell} distinct people: {', '.join(sorted(thin_groups)[:6])}. "
            "Per-cell metrics there describe individuals, not the subgroup."
        )
    return out


def stratified_group_folds(rows: list[dict], n_folds: int = 5) -> list[int]:
    """Assign each row a fold index, keeping a person whole and cells balanced.

    Deterministic greedy bin packing: groups are visited largest first, and each goes
    to the fold whose subgroup histogram is furthest below target. Plain GroupKFold
    keeps people whole but happily puts every darker-skin sample in one fold, which
    makes per-cell validation numbers meaningless.
    """
    if n_folds < 2:
        raise ValueError("n_folds must be >= 2")

    by_group: defaultdict = defaultdict(list)
    for idx, row in enumerate(rows):
        by_group[group_key(row)].append(idx)

    cell_of: dict[int, str] = {idx: subgroup_key(rows[idx]) for idx in range(len(rows))}
    fold_cell_counts: list[Counter] = [Counter() for _ in range(n_folds)]
    fold_sizes = [0] * n_folds
    assignment = [0] * len(rows)

    ordered = sorted(by_group.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    for _, indices in ordered:
        want: Counter = Counter(cell_of[i] for i in indices)
        best_fold = 0
        best_cost = None
        for fold in range(n_folds):
            # Cost prefers the fold that is most short of these cells, then the smallest fold.
            cost = sum(fold_cell_counts[fold][cell] * count for cell, count in want.items())
            cost = (cost, fold_sizes[fold], fold)
            if best_cost is None or cost < best_cost:
                best_cost = cost
                best_fold = fold
        for idx in indices:
            assignment[idx] = best_fold
            fold_cell_counts[best_fold][cell_of[idx]] += 1
        fold_sizes[best_fold] += len(indices)

    return assignment


def aggregate_by_cell(confusion_by_group: dict) -> dict:
    """Per-cell metrics from per-cell, per-axis confusion matrices.

    Lives here rather than in train_visible_attributes.py for the reason
    promotion_check and the ordinal scorers moved: that module imports torch at module
    scope, which put the arithmetic feeding the fairness gate out of reach of
    ml/selftest.py. It is pure dict arithmetic over metrics_from_confusion.

    What "n" means, and why it changed
    ----------------------------------
    "n" is the sample count worst_group compares against the manifest's
    `promotionGate.subgroup.minSamplesPerBand`, so the unit it is counted in decides
    what that published number promises. It used to be the sum of the per-axis label
    counts, which is neither samples nor anything a floor can be written about: one
    cell of 10 real samples labelled on the three default axes reported n=30 and
    cleared a floor of 20, so a subgroup a third the documented size was evaluated as
    if it met it.

    **One meaning, chosen: n is a count of labelled samples on ONE axis** — the
    smallest count among the axes that carry any label in this cell. That is the unit
    fit_tone_calibration already gates on (it fits a band's offset per axis, on that
    axis's own count), so the manifest number now means the same thing in both places:
    "at least this many labelled samples behind every axis of this claim".

    The minimum rather than the mean or the max, because the cell's accuracy is a
    label-weighted average ACROSS axes: a cell whose pores head saw 3 samples and
    whose oil head saw 200 has an aggregate number that says nothing trustworthy
    about pores, and the floor exists to refuse exactly that. Axes with no label at
    all in the cell are skipped rather than counted as zero — they contribute nothing
    to the average, so the cell's number makes no claim about them, and counting them
    would make every cell permanently unevaluable on any axis the dataset does not
    label everywhere. A cell with no labels on any axis reports 0 and cannot clear a
    positive floor.

    "observations" keeps the old sum under a name that says what it is: the
    denominator of the weighted averages below. Nothing gates on it.
    """
    out = {}
    for group, confusion in confusion_by_group.items():
        per_axis = ordinal_metrics.metrics_from_confusion(confusion)
        observations = sum(values["n"] for values in per_axis.values())
        labelled_axes = [values["n"] for values in per_axis.values() if values["n"] > 0]
        out[group] = {
            "n": min(labelled_axes) if labelled_axes else 0,
            "observations": observations,
            "labelledAxes": len(labelled_axes),
            "accuracy": (
                sum(values["accuracy"] * values["n"] for values in per_axis.values()) / observations
                if observations else 0.0
            ),
            "ordinal_mae": (
                sum(values["ordinal_mae"] * values["n"] for values in per_axis.values()) / observations
                if observations else 0.0
            ),
            "qwk": (
                sum(values["qwk"] * values["n"] for values in per_axis.values()) / observations
                if observations else 0.0
            ),
            "perAxis": per_axis,
        }
    return out


def worst_group(metrics_by_cell: dict[str, dict], key: str, min_n: int = 20) -> dict:
    """Worst evaluated cell for one metric, and what was skipped for being too small.

    Returns "evaluated": False when nothing clears min_n — a model with no evaluable
    subgroup has not passed a fairness check, it has skipped one.

    min_n is read in the unit aggregate_by_cell writes into "n": labelled samples on
    the thinnest axis of the cell, NOT the total across axes. See that docstring.
    """
    eligible = {
        cell: values for cell, values in metrics_by_cell.items()
        if values.get("n", 0) >= min_n and key in values
        and not cell.startswith(UNKNOWN) and not cell.endswith(UNKNOWN)
    }
    skipped = sorted(set(metrics_by_cell) - set(eligible))
    if not eligible:
        return {"evaluated": False, "reason": f"no cell reached n>={min_n}", "skippedCells": skipped}
    higher_is_better = key not in {"ordinal_mae", "mae", "loss"}
    cell = (min if higher_is_better else max)(eligible, key=lambda c: eligible[c][key])
    return {
        "evaluated": True,
        "metric": key,
        "worstCell": cell,
        "worstValue": eligible[cell][key],
        "worstN": eligible[cell]["n"],
        "evaluatedCells": len(eligible),
        "skippedCells": skipped,
    }


#: Why a dimension could not be evaluated, in the terms of how that data is collected.
#: Anything not named here gets the generic sentence — a new dimension must still block.
_UNEVALUATED_NOTE: dict[str, str] = {
    "tone": (
        "Tone is measured on every scan, so this means too little data, not missing metadata."
    ),
    "age": (
        "Age is only collected in consented pilot sessions; without it the model may not be "
        "claimed to hold across age groups."
    ),
    "tone_x_age": (
        "The joint cell needs both a measured tone band and a reported age band. On consumer "
        "scans every cell is '<tone>/unknown' and is excluded by design, so this dimension is "
        "evaluable only on pilot data."
    ),
}


def ordinal_check(overall: dict, axes: tuple[str, ...], min_qwk: float, min_pearson: float) -> tuple[dict, list[str]]:
    """Did each head learn anything at all? Returns (per-axis report, blockers).

    The subgroup gap cannot answer this and never could: it asks whether the model is
    even-handed across tone and age, and a head that always predicts the majority
    grade is perfectly even-handed. Fed the repo's own `metrics_from_confusion` a
    constant predictor on a skewed 3-level scale, accuracy reads 0.80 and
    within-one-grade 0.95 while qwk and pearson are exactly 0. Those two are the only
    reported metrics that collapse for that predictor, so they are what this floor
    reads, per axis, on the overall validation confusion.

    A missing metric BLOCKS rather than passes, for the same reason an unevaluated
    subgroup does: a bar nothing was measured against was not cleared.
    """
    report: dict[str, dict] = {}
    reasons: list[str] = []
    if not axes:
        return report, ["no axis was evaluated, so the ordinal floor was never checked"]
    for axis in axes:
        metrics = overall.get(axis) or {}
        qwk = metrics.get("qwk")
        pearson = metrics.get("pearson")
        report[axis] = {"qwk": qwk, "pearson": pearson}
        # NaN must block, and it will not block by itself: `float("nan") < 0.4` is
        # False, so a NaN would sail through the comparisons below. It is the likely
        # value too — the reference implementations this floor was verified against
        # return NaN for the degenerate matrices where ARU's own scorers return 0.0,
        # so any scorer swapped in here brings NaN with it.
        if qwk is None or pearson is None or not isfinite(qwk) or not isfinite(pearson):
            reasons.append(
                f"[{axis}] qwk/pearson missing or not a finite number ({qwk!r}, {pearson!r}), "
                f"so the ordinal floor (qwk>={min_qwk:.3f}, pearson>={min_pearson:.3f}) "
                f"was never checked"
            )
            continue
        if qwk < min_qwk:
            reasons.append(f"[{axis}] qwk {qwk:.3f} is below the floor {min_qwk:.3f}")
        if pearson < min_pearson:
            reasons.append(f"[{axis}] pearson {pearson:.3f} is below the floor {min_pearson:.3f}")
    return report, reasons


def _usable_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def _gain_noise_band(model_matrix: object, heuristic_matrix: object) -> dict | None:
    """The bootstrap band on this axis's qwk gain, or None when it cannot be computed.

    Both matrices have to be present and the same shape: a band computed from a matrix
    of a different level count is not a band on this comparison. Returns None rather
    than raising, because a missing matrix must not turn a gate run into a crash.
    """
    if not isinstance(model_matrix, list) or not isinstance(heuristic_matrix, list):
        return None
    if not model_matrix or len(model_matrix) != len(heuristic_matrix):
        return None
    for matrix in (model_matrix, heuristic_matrix):
        if any(not isinstance(row, list) or len(row) != len(matrix) for row in matrix):
            return None
    return qwk_noise.gain_band_from_confusions(model_matrix, heuristic_matrix)


def beats_heuristic_check(
    overall: dict,
    axes: tuple[str, ...],
    baseline: dict | None,
    min_qwk_gain: float,
    baseline_axes: tuple[str, ...] = (),
    *,
    model_confusion: dict | None = None,
) -> tuple[dict, list[str], list[str]]:
    """Does the model actually beat the rule it would replace? Per axis, on qwk.

    Every other rule in this gate asks whether the model is good in absolute terms.
    None of them asks the question the gate exists for: *should this model REPLACE the
    heuristic the app already ships?* A model can clear the subgroup gap, clear the qwk
    floor, and still be worse than the three thresholds in lib/skin.ts — and promoting
    it would make the product worse with every number in the report looking healthy.

    `baseline_axes` names the axes the shipped heuristic actually covers. For an axis
    outside it there is no rule to beat and nothing is asked. For an axis INSIDE it, a
    missing or unscored baseline is a blocker: "we never scored the heuristic" must not
    read the same as "the model won". That is what makes a pretrain on external data,
    which carries none of ARU's ROI features, correctly unpromotable.

    Compared on qwk rather than accuracy because accuracy is exactly the metric a
    degenerate predictor wins on, and a threshold heuristic on skewed data is itself
    close to degenerate.
    """
    report: dict[str, dict] = {}
    blockers: list[str] = []
    warnings: list[str] = []
    covered = set(baseline_axes)
    baseline = baseline or {}
    model_confusion = model_confusion or {}

    for axis in axes:
        if axis not in covered:
            continue

        entry: dict = {"minQwkGain": min_qwk_gain}
        base = baseline.get(axis)
        base_qwk = base.get("qwk") if isinstance(base, dict) else None
        model_qwk = overall.get(axis, {}).get("qwk") if isinstance(overall.get(axis), dict) else None
        scored_rows = base.get("scoredRows") if isinstance(base, dict) else None

        entry["heuristicQwk"] = base_qwk if _usable_number(base_qwk) else None
        entry["modelQwk"] = model_qwk if _usable_number(model_qwk) else None
        entry["scoredRows"] = scored_rows

        if not isinstance(base, dict) or not scored_rows:
            entry["beats"] = False
            entry["reason"] = "the heuristic was never scored on this split"
            report[axis] = entry
            labelled = base.get("labelledRows") if isinstance(base, dict) else None
            cause = (
                "no labelled validation rows for this axis"
                if labelled == 0
                else "its ROI feature is missing from the data"
            )
            blockers.append(
                f"[{axis}] the shipped heuristic was not scored on this validation split, so "
                f"there is nothing to show the model beats: {cause}."
            )
            continue

        # The two qwk values must come from the SAME rows or the comparison is
        # meaningless. The model is scored on every labelled row; the heuristic can only
        # be scored on labelled rows that also carry its ROI feature. If any row has a
        # label but no feature, the heuristic was measured on a strict subset and the
        # difference is not attributable to the model. Block rather than compare across
        # unequal footing — the operator can see skippedNoFeature and fix the export.
        model_n = overall.get(axis, {}).get("n") if isinstance(overall.get(axis), dict) else None
        entry["modelScoredRows"] = model_n
        if not isinstance(model_n, int) or scored_rows != model_n:
            entry["beats"] = False
            entry["reason"] = "model and heuristic were scored on different rows"
            report[axis] = entry
            skipped = base.get("skippedNoFeature")
            blockers.append(
                f"[{axis}] the heuristic was scored on {scored_rows} rows but the model on "
                f"{model_n} ({skipped} labelled rows had no ROI feature), so the two qwk values "
                "do not come from the same rows and cannot be compared"
            )
            continue

        if not _usable_number(base_qwk) or not _usable_number(model_qwk):
            entry["beats"] = False
            entry["reason"] = "model or heuristic qwk is not a usable number"
            report[axis] = entry
            blockers.append(
                f"[{axis}] model or heuristic qwk is missing or not a usable number, so the "
                "comparison against the shipped rule is unverified"
            )
            continue

        gain = model_qwk - base_qwk
        entry["gain"] = gain
        entry["beats"] = gain > min_qwk_gain

        # How much of that gain is the split's own sampling noise? REPORTED, never
        # decisive: the rule the manifest publishes is `gain > minQwkGainOverHeuristic`
        # and this does not change it. It exists because that constant is 0.0 and the
        # manifest's own note says it is 0.0 only because nothing estimated the noise.
        band = _gain_noise_band(model_confusion.get(axis), base.get("confusion"))
        if band is not None:
            entry["gainNoiseBand"] = band
            clears = qwk_noise.clears_band(band, min_qwk_gain)
            entry["clearsNoiseBand"] = clears
            if entry["beats"] and clears is False:
                warnings.append(
                    f"[{axis}] the qwk gain of {gain:+.3f} over the shipped heuristic does not "
                    f"clear its own {band['confidence']:.0%} bootstrap band "
                    f"[{band['lo']:+.3f}, {band['hi']:+.3f}] on {scored_rows} rows, so it is "
                    f"not distinguishable from {min_qwk_gain:.3f}. Not a blocker: the published "
                    f"gate asks only for a positive gain."
                )

        report[axis] = entry
        if not entry["beats"]:
            blockers.append(
                f"[{axis}] model qwk {model_qwk:.3f} does not beat the shipped heuristic's "
                f"{base_qwk:.3f} by more than {min_qwk_gain:.3f} (gain {gain:+.3f}, scored on "
                f"{scored_rows} rows). Replacing the heuristic would not improve this axis."
            )

    return report, blockers, warnings


def promotion_check(
    overall: dict,
    by_dimension: dict,
    axes: tuple[str, ...],
    min_cell: int,
    max_gap: float,
    min_qwk: float,
    min_pearson: float,
    *,
    baseline: dict | None = None,
    min_qwk_gain: float = 0.0,
    baseline_axes: tuple[str, ...] = (),
    model_confusion: dict | None = None,
) -> dict:
    """Can this model replace the heuristic? Subgroup gaps decide, not the mean.

    Each dimension is judged on its own so that missing age data blocks an
    age-robustness claim without hiding a tone gap that IS measurable.

    Lives here rather than in train_visible_attributes.py because that module imports
    torch at module scope, which put the single highest-consequence rule in the repo
    out of reach of ml/selftest.py. It is pure dict arithmetic over worst_group and
    needs nothing the trainer has.

    An unevaluated dimension is a BLOCKER, for every dimension. It used to be one only
    for "tone" and "age", named literally; "tone_x_age" — which the shipped manifest
    declares, and which is structurally unevaluable on consumer scans because every
    joint cell is "<tone>/unknown" and worst_group excludes those — fell through the
    branch and appended nothing, so a run could report `promotable: True` with that
    dimension silently unchecked. That contradicted the manifest's own note: "A
    subgroup with too few samples counts as unevaluated, which blocks promotion rather
    than passing silently."
    """
    mean_acc = sum(overall[axis]["accuracy"] * overall[axis]["n"] for axis in axes) / max(
        1, sum(overall[axis]["n"] for axis in axes)
    )
    ordinal, reasons = ordinal_check(overall, axes, min_qwk, min_pearson)
    # Whether the model is any good and whether it should REPLACE the shipped rule are
    # different questions. ordinal_check answers the first; this answers the second.
    beats, beat_blockers, beat_warnings = beats_heuristic_check(
        overall, axes, baseline, min_qwk_gain, baseline_axes,
        model_confusion=model_confusion,
    )
    reasons = reasons + beat_blockers
    results = {}
    for dimension, groups in by_dimension.items():
        worst_acc = worst_group(groups, "accuracy", min_n=min_cell)
        worst_mae = worst_group(groups, "ordinal_mae", min_n=min_cell)
        gap = None
        if worst_acc.get("evaluated"):
            gap = mean_acc - worst_acc["worstValue"]
            if gap > max_gap:
                reasons.append(
                    f"[{dimension}] worst group {worst_acc['worstCell']} is {gap:.3f} below the "
                    f"mean (limit {max_gap:.3f})"
                )
        else:
            note = _UNEVALUATED_NOTE.get(
                dimension, "No cell in this dimension carried enough samples to evaluate."
            )
            reasons.append(f"[{dimension}] no cell reached n>={min_cell}. {note}")
        results[dimension] = {
            "worstAccuracy": worst_acc,
            "worstOrdinalMae": worst_mae,
            "gapToMean": gap,
            "evaluated": bool(worst_acc.get("evaluated")),
        }
    return {
        "meanAccuracy": mean_acc,
        "maxAllowedGap": max_gap,
        "minSamplesPerGroup": min_cell,
        "minQwk": min_qwk,
        "minPearson": min_pearson,
        "minQwkGainOverHeuristic": min_qwk_gain,
        "ordinal": ordinal,
        "beatsHeuristic": beats,
        "dimensions": results,
        "promotable": not reasons,
        "blockers": reasons,
        # Reported, never decisive. A warning here means a rule the manifest DOES NOT
        # publish would have caught something; promotability is `blockers` alone.
        "warnings": beat_warnings,
    }
