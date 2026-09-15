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

ITA (Individual Typology Angle) bands follow the Chardon convention and match
`ita_bucket` in evaluate_dataset.py, which shipped first.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass

#: Chardon ITA bands, ordered light to dark. Upper bound is exclusive of the next band.
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
    """Human-readable reasons this dataset cannot yet support a subgroup claim."""
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


def worst_group(metrics_by_cell: dict[str, dict], key: str, min_n: int = 20) -> dict:
    """Worst evaluated cell for one metric, and what was skipped for being too small.

    Returns "evaluated": False when nothing clears min_n — a model with no evaluable
    subgroup has not passed a fairness check, it has skipped one.
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


#: Ordinal-quality metrics every axis must clear, and why each one is here.
#: Both are read off the final validation confusion, per axis, never per subgroup
#: cell — at minSamplesPerBand a per-cell qwk is mostly noise.
ORDINAL_QUALITY_METRICS: tuple[tuple[str, str], ...] = (
    ("qwk", "quadratic weighted kappa: agreement corrected for chance, 0 for a constant predictor"),
    ("pearson", "correlation between predicted and true level, 0 when the output never varies"),
)


def ordinal_quality_check(
    overall: dict,
    axes: tuple[str, ...],
    min_qwk: float,
    min_pearson: float,
) -> tuple[dict, list[str]]:
    """Per-axis floor on qwk and pearson. Returns (per-axis report, blockers).

    Why this exists, in one example that the repo's own metrics_from_confusion
    produces: a head that always predicts level 0 on a skewed 80/15/5 scale scores
    accuracy 0.80, within_one_grade 0.95, ordinal_mae 0.25 — and qwk 0.0, pearson 0.0.
    The subgroup gap test does not catch it either, because a constant predictor is
    equally wrong everywhere and so has almost no gap between its mean and its worst
    cell. Accuracy plus gap is therefore EASIEST to pass for a model that learned
    nothing, which is the opposite of what a promotion gate is for.

    Fails closed, and the list is exhaustive: an axis missing from `overall`, one whose
    entry is not a dict, one with no labelled validation samples, one whose metric is
    absent or a non-number, and one whose metric is NaN or infinite ALL block. "The
    number is missing" and "the number is fine" must never look the same here.
    """
    floors = {"qwk": min_qwk, "pearson": min_pearson}
    report: dict[str, dict] = {}
    blockers: list[str] = []

    def _blank(n: object, reason: str) -> dict:
        """Every branch returns the SAME keys.

        An unevaluated axis used to ship a short dict with no floors in it, and with
        zero consented crops that short shape is what the FIRST real metrics.json
        would contain — so the first consumer written against the evaluated shape
        would break on the common case, not the rare one.
        """
        entry = {"evaluated": False, "reason": reason, "n": n}
        for key, _ in ORDINAL_QUALITY_METRICS:
            entry[key] = None
            entry[f"min{key[:1].upper()}{key[1:]}"] = floors[key]
        return entry

    for axis in axes:
        metrics = overall.get(axis)
        if not isinstance(metrics, dict):
            report[axis] = _blank(None, "no validation metrics for this axis")
            blockers.append(f"[{axis}] no validation metrics, so ordinal quality is unverified")
            continue
        if not metrics.get("n"):
            report[axis] = _blank(metrics.get("n"), "no labelled validation samples")
            blockers.append(f"[{axis}] no labelled validation samples, so ordinal quality is unverified")
            continue
        # `accuracy` is not floor-checked here — the subgroup gap rule owns it — but it
        # must EXIST and be a real number, because promotion_check folds it into
        # meanAccuracy, which is the baseline the gap is measured against. Letting a
        # missing accuracy default to 0.0 there would quietly drag the mean down and
        # make the gap test easier to pass, so an axis that cannot supply it is
        # unevaluated, not zero.
        accuracy = metrics.get("accuracy")
        if (
            not isinstance(accuracy, (int, float))
            or isinstance(accuracy, bool)
            or not math.isfinite(accuracy)
        ):
            report[axis] = _blank(metrics.get("n"), "accuracy is missing or not a usable number")
            blockers.append(
                f"[{axis}] accuracy is missing or not a usable number, so the subgroup mean it "
                "feeds cannot be trusted"
            )
            continue

        entry: dict = {"evaluated": True, "reason": "", "n": metrics.get("n")}
        for key, meaning in ORDINAL_QUALITY_METRICS:
            value = metrics.get(key)
            floor = floors[key]
            entry[key] = value
            entry[f"min{key[:1].upper()}{key[1:]}"] = floor
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                entry["evaluated"] = False
                blockers.append(f"[{axis}] {key} is missing, so ordinal quality is unverified ({meaning})")
            elif not math.isfinite(value):
                # NaN and inf are checked BEFORE the floor on purpose: every comparison
                # against NaN is False, so `value < floor` would wave a NaN straight
                # through the gate — the one direction this check must never fail in.
                entry["evaluated"] = False
                blockers.append(f"[{axis}] {key} is {value}, not a usable number ({meaning})")
            elif value < floor:
                blockers.append(f"[{axis}] {key} {value:.3f} is below the {floor:.3f} floor ({meaning})")
        report[axis] = entry
    return report, blockers


def _usable_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def beats_heuristic_check(
    overall: dict,
    axes: tuple[str, ...],
    baseline: dict | None,
    min_qwk_gain: float,
    baseline_axes: tuple[str, ...] = (),
) -> tuple[dict, list[str]]:
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
    covered = set(baseline_axes)
    baseline = baseline or {}

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
        report[axis] = entry
        if not entry["beats"]:
            blockers.append(
                f"[{axis}] model qwk {model_qwk:.3f} does not beat the shipped heuristic's "
                f"{base_qwk:.3f} by more than {min_qwk_gain:.3f} (gain {gain:+.3f}, scored on "
                f"{scored_rows} rows). Replacing the heuristic would not improve this axis."
            )

    return report, blockers


def promotion_check(
    overall: dict,
    by_dimension: dict,
    axes: tuple[str, ...],
    min_cell: int,
    max_gap: float,
    *,
    min_qwk: float,
    min_pearson: float,
    baseline: dict | None = None,
    min_qwk_gain: float = 0.0,
    baseline_axes: tuple[str, ...] = (),
) -> dict:
    """Can this model replace the heuristic? Subgroup gaps decide, not the mean.

    Each dimension is judged on its own so that missing age data blocks an
    age-robustness claim without hiding a tone gap that IS measurable.

    Lives here rather than in train_visible_attributes.py because that module imports
    torch at module scope, which put the single highest-consequence rule in the repo
    out of reach of ml/selftest.py. It is pure dict arithmetic over worst_group and
    needs nothing the trainer has.

    Two independent bars, both of which must hold: the subgroup gap test below, and
    ordinal_quality_check above. The gap test alone rewards a degenerate predictor,
    so neither can carry the gate by itself.

    min_qwk and min_pearson are keyword-only and have NO defaults, deliberately. A
    default of 0.0 would mean a caller that forgot them silently got a gate with no
    ordinal-quality rule at all, which is the failure this whole change exists to
    remove; keyword-only means a later parameter cannot quietly capture a positional
    argument meant for something else. The values belong to the shipped manifest —
    ml/model_contract.min_qwk() / min_pearson() — not to this module.

    An unevaluated dimension is a BLOCKER, for every dimension. It used to be one only
    for "tone" and "age", named literally; "tone_x_age" — which the shipped manifest
    declares, and which is structurally unevaluable on consumer scans because every
    joint cell is "<tone>/unknown" and worst_group excludes those — fell through the
    branch and appended nothing, so a run could report `promotable: True` with that
    dimension silently unchecked. That contradicted the manifest's own note: "A
    subgroup with too few samples counts as unevaluated, which blocks promotion rather
    than passing silently."
    """
    # Read through .get so a malformed `overall` is REPORTED by ordinal_quality_check
    # below rather than raising here. A crash is fail-closed in effect — no metrics.json,
    # no promotion — but it throws away the whole run's report and it is not what this
    # function documents, so the two must not disagree.
    def _metric(axis: str, key: str, fallback: float = 0.0) -> float:
        entry = overall.get(axis)
        value = entry.get(key, fallback) if isinstance(entry, dict) else fallback
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) else fallback

    total_n = sum(_metric(axis, "n") for axis in axes)
    mean_acc = sum(_metric(axis, "accuracy") * _metric(axis, "n") for axis in axes) / max(1, total_n)
    results = {}
    reasons = []
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
    quality, quality_blockers = ordinal_quality_check(overall, axes, min_qwk, min_pearson)
    beats, beat_blockers = beats_heuristic_check(
        overall, axes, baseline, min_qwk_gain, baseline_axes
    )
    reasons = quality_blockers + beat_blockers + reasons
    return {
        "meanAccuracy": mean_acc,
        "maxAllowedGap": max_gap,
        "minSamplesPerGroup": min_cell,
        "minQwk": min_qwk,
        "minPearson": min_pearson,
        "minQwkGainOverHeuristic": min_qwk_gain,
        "ordinalQuality": quality,
        "beatsHeuristic": beats,
        "dimensions": results,
        "promotable": not reasons,
        "blockers": reasons,
    }
