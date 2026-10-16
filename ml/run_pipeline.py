#!/usr/bin/env python3
"""
Create a reproducible ML experiment package from exported Gyeol pilot data.

This is the research-lab entrypoint. It does not train by default. It reads the
local exports, checks whether a learned model is justified, records subgroup
coverage, computes a heuristic baseline, and writes both JSON and Markdown
reports for review.

Examples:
  python ml/run_pipeline.py --labels gyeol-labels-42.jsonl
  python ml/run_pipeline.py --labels gyeol-labels-120.jsonl --crops gyeol-crop-samples-120.jsonl --pilot gyeol-pilot-notes.csv --consent gyeol-consent-events.csv --decode-crops
"""

from __future__ import annotations

import argparse
import base64
import csv
import glob
import hashlib
import json
import math
import os
import platform
import re
import subprocess
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import heuristic_baseline as shipped_heuristic  # noqa: E402
import skin_indices  # noqa: E402
import subgroups  # noqa: E402


ATTRS = ("oil", "redness", "pores")
FEATURE_FOR_ATTR = {"oil": "shine", "redness": "relRedness", "pores": "cov"}
HEURISTIC_THRESHOLDS = {
    "oil": (0.05, 0.16),
    "redness": (0.012, 0.03),
    "pores": (0.085, 0.14),
}


def read_jsonl(path: Path | None) -> list[dict[str, Any]]:
    if not path:
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no}: invalid JSONL row: {exc}") from exc
    return rows


def read_csv(path: Path | None) -> list[dict[str, str]]:
    if not path:
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def expand_patterns(paths: list[Path] | None) -> list[Path] | None:
    """bash expands `gyeol-labels-*.jsonl` before Python sees it; PowerShell and cmd pass
    it through as written. A path that does not exist and holds a wildcard is expanded
    here, sorted by name; one that matches nothing is left for open() to refuse. A file
    named twice (a pattern and one of its matches) is kept once, at its first place.
    """
    if not paths:
        return paths
    out: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        matches = sorted(glob.glob(str(path))) if not path.exists() and any(ch in str(path) for ch in "*?[") else []
        for candidate in [Path(match) for match in matches] or [path]:
            key = os.path.normcase(os.path.abspath(candidate))
            if key not in seen:
                seen.add(key)
                out.append(candidate)
    return out


def _dedupe_by_id(batches: list[list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], int]:
    """Concatenate exports in the order given, keeping the first row seen for each id.

    /ops exports are cumulative up to each store's cap (each day's file repeats the
    earlier rows still on that device) and a pilot that compares devices has one file
    per device, so the documented `gyeol-labels-*.jsonl` glob matches overlapping files.
    Crops, pilot notes and consent events always carry a string `id`, normally a UUID; a
    label saved before saveLabel assigned one may not (lib/sync-payload.ts names those
    `legacy-label-...`). A row without an id is kept as it is, once per file it is in.
    """
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    dropped = 0
    for batch in batches:
        for row in batch:
            row_id = row.get("id") if isinstance(row, dict) else None
            if isinstance(row_id, str) and row_id:
                if row_id in seen:
                    dropped += 1
                    continue
                seen.add(row_id)
            rows.append(row)
    return rows, dropped


def read_jsonl_many(paths: list[Path] | None) -> tuple[list[dict[str, Any]], int]:
    return _dedupe_by_id([read_jsonl(path) for path in paths or []])


def read_csv_many(paths: list[Path] | None) -> tuple[list[dict[str, str]], int]:
    return _dedupe_by_id([read_csv(path) for path in paths or []])


def read_consent_many(paths: list[Path] | None) -> tuple[list[dict[str, str]], int]:
    """Consent events from every file, in the order "latest" is read from.

    The consent checks below take the last event as the latest. One device's export is
    already in the order its events were recorded, which is the order the app reads.
    Several files arrive in glob order, which follows neither time nor device (/ops names
    them by row count), so an older grant could follow a newer revoke; merged files are
    put in `ts` order, file order breaking ties.
    """
    rows, dropped = read_csv_many(paths)
    if len(paths or []) > 1:
        rows = [row for _, _, row in sorted(
            ((ts if ts is not None else -math.inf, index, row)
             for index, row in enumerate(rows)
             for ts in [shipped_heuristic.as_feature_float(row.get("ts"))]),
            key=lambda entry: (entry[0], entry[1]),
        )]
    return rows, dropped


def is_truthy(value: Any) -> bool:
    return value is True or str(value).strip().lower() in {"1", "true", "yes", "y"}


def is_usable_sample(row: dict[str, Any]) -> bool:
    meta = row.get("meta") or {}
    return not (
        is_truthy(row.get("ungradable")) or
        is_truthy(meta.get("ungradable")) or
        row.get("label_confidence") == "low" or
        meta.get("labelConfidence") == "low"
    )


def usable_samples(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if is_usable_sample(row)]


def readiness(crop_count: int) -> dict[str, Any]:
    if crop_count < 30:
        return {
            "band": "calibrate",
            "title": "Threshold calibration only",
            "next_action": "Run calibration on gyeol-labels. Do not train a CNN.",
            "min_next": 30,
        }
    if crop_count < 100:
        return {
            "band": "pipeline",
            "title": "Pipeline dry-run only",
            "next_action": "Decode crops, inspect labels, and smoke-test train script. Do not judge product performance.",
            "min_next": 100,
        }
    if crop_count < 300:
        return {
            "band": "dry_run",
            "title": "MobileNetV3 dry-run",
            "next_action": "Run training for diagnostics and inspect confusion by label/device/lighting.",
            "min_next": 300,
        }
    if crop_count < 500:
        return {
            "band": "train_candidate",
            "title": "First ML v1 candidate",
            "next_action": "Train MobileNetV3-small, export ONNX, and compare against the calibrated heuristic.",
            "min_next": 500,
        }
    return {
        "band": "subgroup",
        "title": "Subgroup evaluation",
        "next_action": "Track skin-tone proxy, lighting, device, and makeup gaps before product rollout.",
        "min_next": None,
    }


def label_distribution(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, int]]:
    dist: dict[str, Counter[str]] = {attr: Counter() for attr in ATTRS}
    for row in rows:
        labels = row.get("labels", {})
        for attr in ATTRS:
            dist[attr][str(labels.get(attr, "missing"))] += 1
    return {attr: dict(counter) for attr, counter in dist.items()}


def source_distribution(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    return dict(Counter(str(row.get("source", "unknown")) for row in rows))


def feature_summary(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, float | int | None]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        features = row.get("features", {})
        for key in ("shine", "relRedness", "cov", "tzoneL", "cheekL", *skin_indices.NEW_FEATURE_KEYS):
            value = features.get(key)
            # `not isinstance(value, bool)` because `isinstance(True, int)` is True in
            # Python, so a JSON `true` in a feature column was being summarised as the
            # number 1.0 here while `as_feature_float` — the screen the promotion
            # gate's baseline uses — rejects a bool outright. Found by the selftest
            # case that pins the two screens together, not by reading either one.
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                buckets[key].append(float(value))

    summary: dict[str, dict[str, float | int | None]] = {}
    for key, values in buckets.items():
        if not values:
            continue
        summary[key] = {
            "count": len(values),
            "min": min(values),
            "max": max(values),
            "mean": statistics.fmean(values),
            "median": statistics.median(values),
        }
    return summary


def bucket(value: float, lo: float, hi: float) -> int:
    """Level for a FINITE feature value. Callers must screen the value first.

    `nan < lo` and `nan < hi` are both False, so this returns 2 — the most severe
    level — for a value that has no value at all. That is not a bug in the comparison
    and it is not fixable here: strictly-less-than against each cut in order is the
    shipped rule (`bucket()` in lib/skin.ts, `predict_level` in ml/heuristic_baseline.py)
    and it must not drift. Screening belongs at the call site, which is what
    `shipped_heuristic.as_feature_float` is.
    """
    if value < lo:
        return 0
    return 1 if value < hi else 2


def heuristic_baseline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """The report's own baseline accuracy per axis, plus what it could not grade.

    Until 2026-09-23 this read `float(features[feat])` with no screen, and three code
    paths in this repository disagreed about one situation. `feature_summary`, twenty
    lines up, drops a non-finite value with `math.isfinite`. `as_feature_float` in the
    sibling module — the baseline the PROMOTION GATE scores — returns None for it. And
    this function graded it: NaN and +inf both came out of `bucket` as level 2, entered
    the confusion matrix as a confident maximum-severity prediction, and counted in `n`,
    so the accuracy an operator reads was computed partly from rows with no measurement
    in them. A `None` feature was worse still — `float(None)` raises TypeError and took
    the whole pipeline run down.

    Now it uses the sibling's policy and REPORTS the residue as `unusable` rather than
    skipping in silence, which is the shape cycle 28's research settled on (scipy's
    `find_peaks` makes a plateau's extent an output and leaves the filter to the
    caller). docs/non-finite-feature-policy.md.
    """
    out: dict[str, Any] = {}
    for attr in ATTRS:
        feat = FEATURE_FOR_ATTR[attr]
        lo, hi = HEURISTIC_THRESHOLDS[attr]
        total = 0
        correct = 0
        unusable = 0
        confusion = {str(actual): {str(pred): 0 for pred in range(3)} for actual in range(3)}
        for row in rows:
            features = row.get("features", {})
            labels = row.get("labels", {})
            if feat not in features or attr not in labels:
                continue
            actual_raw = labels[attr]
            value = shipped_heuristic.as_feature_float(features[feat])
            if value is None:
                if str(actual_raw) in confusion:
                    unusable += 1
                continue
            pred = bucket(value, lo, hi)
            actual = int(actual_raw)
            if actual in (0, 1, 2):
                confusion[str(actual)][str(pred)] += 1
                correct += int(pred == actual)
                total += 1
        out[attr] = {
            "feature": feat,
            "thresholds": {"lo": lo, "hi": hi},
            "n": total,
            "unusable": unusable,
            "accuracy": round(correct / total, 4) if total else None,
            "confusion": confusion,
        }
    return out


def normalize_participant_id(value: str) -> str:
    """lib/pilot.ts normalizeParticipantId: "1", "p1" and "P001" are one participant."""
    clean = re.sub(r"[^A-Z0-9]", "", value.strip().upper())
    if re.fullmatch(r"\d{1,2}", clean):
        return f"P{clean.zfill(3)}"
    if re.fullmatch(r"P\d{1,2}", clean):
        return f"P{clean[1:].zfill(3)}"
    return clean


def summarize_pilot(rows: list[dict[str, str]]) -> dict[str, Any]:
    """Pilot completion and consent, per participant.

    /pilot is append-only and its Save is what links a participant before /scan, so a
    participant's first note is written before the scan and, unless the form still holds
    the previous participant's ticks, says scanCompleted false; completion takes a second
    note. Counting rows counted each of those pre-scan notes as a scan that did not
    complete, so a pilot in which everyone scanned could read below 80% and fire the "fix
    capture UX" warning. A participant is complete when any of their notes says so, and
    their consent is their latest note's (by `ts`, then export order, since files from
    two devices arrive in glob order). `total` stays the record count.
    """
    if not rows:
        return {"total": 0}
    by_participant: dict[str, list[tuple[float, int, dict[str, str]]]] = {}
    for index, row in enumerate(rows):
        key = normalize_participant_id(str(row.get("participantId") or row.get("participant") or "")) or f"row:{row.get('id') or index}"
        ts = shipped_heuristic.as_feature_float(row.get("ts"))
        by_participant.setdefault(key, []).append((ts if ts is not None else -math.inf, index, row))
    participants = len(by_participant)
    completed = sum(any(parse_bool(note.get("scanCompleted")) for _, _, note in notes) for notes in by_participant.values())
    latest = [max(notes, key=lambda entry: (entry[0], entry[1]))[2] for notes in by_participant.values()]
    return {
        "total": len(rows),
        "participants": participants,
        "completed": completed,
        "completion_rate": round(completed / participants, 4),
        "by_browser": dict(Counter(row.get("browser", "unknown") for row in rows)),
        "by_lighting": dict(Counter(row.get("lighting", "unknown") for row in rows)),
        "by_makeup": dict(Counter(row.get("makeup", "unknown") for row in rows)),
        "crop_consent_rate": round(sum(parse_bool(note.get("consentCrop")) for note in latest) / participants, 4),
        "ai_consent_rate": round(sum(parse_bool(note.get("consentAi")) for note in latest) / participants, 4),
    }


def _consent_scope(participant: Any, session: Any) -> tuple[str, str]:
    return (str(participant or "").strip(), str(session or "").strip())


def crops_without_scoped_consent(crops: list[dict[str, Any]], rows: list[dict[str, str]]) -> list[str]:
    """Ids of crops whose OWN scope's latest learning_crop event is not a grant.

    A pilot runs many participants on one device and /scan records each learning_crop
    toggle under (participantId, sessionId). The device-wide "latest" below reads one
    event for the whole export, so P001 revoking and P002 granting afterwards left
    P001's crops looking consented. This uses the exact-scope rule of
    latestConsentGranted (lib/sync-payload.ts): an unscoped event covers only an
    unscoped crop, and the last event wins (export order, or `ts` order when several
    files are merged: read_consent_many).
    """
    latest: dict[tuple[str, str], bool] = {}
    for row in rows:
        if row.get("kind") != "learning_crop":
            continue
        latest[_consent_scope(row.get("participantId"), row.get("sessionId"))] = parse_bool(row.get("granted"))
    missing: list[str] = []
    for crop in crops:
        meta = crop.get("meta") or {}
        if not latest.get(_consent_scope(meta.get("participantId"), meta.get("sessionId")), False):
            missing.append(str(crop.get("id", "")))
    return missing


def summarize_consent(rows: list[dict[str, str]], crops: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    by_kind: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_kind[row.get("kind", "unknown")].append(row)
    summary: dict[str, Any] = {
        "total": len(rows),
        "latest": {
            kind: {
                "granted": parse_bool(events[-1].get("granted")),
                "version": events[-1].get("version", ""),
                "ts": events[-1].get("ts", ""),
            }
            for kind, events in by_kind.items()
            if events
        },
    }
    if crops is not None:
        missing = crops_without_scoped_consent(crops, rows)
        summary["crops_without_scoped_consent"] = len(missing)
        summary["unconsented_crop_ids"] = missing[:20]
        summary["unscoped_crops"] = sum(
            _consent_scope((crop.get("meta") or {}).get("participantId"), (crop.get("meta") or {}).get("sessionId")) == ("", "")
            for crop in crops
        )
    return summary


def crop_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    bytes_total = 0
    invalid = 0
    for row in rows:
        image = row.get("image", "")
        try:
            bytes_total += len(parse_data_url(image))
        except ValueError:
            invalid += 1
    return {
        "total": len(rows),
        "invalid_images": invalid,
        "approx_mb": round(bytes_total / (1024 * 1024), 3),
        "labels": label_distribution(rows),
        "sources": source_distribution(rows),
    }


def decode_crops(rows: list[dict[str, Any]], out_dir: Path) -> dict[str, Any]:
    if not rows:
        return {"manifest": None, "valid": 0, "failures": [], "subgroup_coverage": None, "subgroup_warnings": []}
    dataset = out_dir / "dataset"
    images = dataset / "images"
    images.mkdir(parents=True, exist_ok=True)
    manifest = dataset / "manifest.csv"
    fieldnames = [
        "image",
        "id",
        "oil",
        "redness",
        "pores",
        "source",
        "ts",
        "participant_id",
        "session_id",
        "round",
        "device_id",
        "reviewer_id",
        "capture_mode",
        "quality_score",
        "quality_reject",
        "face_size",
        "brightness_mean",
        "hot_ratio",
        "dark_ratio",
        "prediction_source",
        "model_version",
        "input_schema_version",
        "analysis_confidence",
        "retake_recommended",
        "label_confidence",
        "ungradable",
        "toneLstar",
        "toneIta",
        "tone_band",
        "age_band",
        "shine",
        "relRedness",
        "cov",
        "tzoneL",
        "cheekL",
        "cheekTexture",
        "tzoneSpecular",
        "cheekSamples",
        "tzoneSamples",
        *skin_indices.NEW_FEATURE_KEYS,
        "trouble_seen",
    ]
    failures: list[str] = []
    decoded: list[dict[str, Any]] = []
    valid = 0
    with manifest.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for index, row in enumerate(rows):
            image_id = str(row.get("id") or f"crop_{index:06d}")
            image_rel = Path("images") / f"{image_id}.jpg"
            try:
                (images / image_rel.name).write_bytes(parse_data_url(str(row.get("image", ""))))
            except ValueError as exc:
                failures.append(f"{image_id}: {exc}")
                continue
            labels = row.get("labels", {})
            features = row.get("features", {})
            meta = row.get("meta") or {}
            quality = meta.get("quality") or {}
            writer.writerow({
                "image": image_rel.as_posix(),
                "id": image_id,
                "oil": labels.get("oil", ""),
                "redness": labels.get("redness", ""),
                "pores": labels.get("pores", ""),
                "source": row.get("source", "unknown"),
                "ts": row.get("ts", ""),
                "participant_id": meta.get("participantId", ""),
                "session_id": meta.get("sessionId", ""),
                "round": meta.get("round", ""),
                "device_id": meta.get("deviceId", ""),
                "reviewer_id": meta.get("reviewerId", ""),
                "capture_mode": meta.get("captureMode", ""),
                "quality_score": quality.get("score", ""),
                "quality_reject": quality.get("rejectReason", ""),
                "face_size": quality.get("faceSize", ""),
                "brightness_mean": quality.get("brightnessMean", ""),
                "hot_ratio": quality.get("hotRatio", ""),
                "dark_ratio": quality.get("darkRatio", ""),
                "prediction_source": meta.get("predictionSource", ""),
                "model_version": meta.get("modelVersion", ""),
                "input_schema_version": meta.get("inputSchemaVersion", ""),
                "analysis_confidence": meta.get("analysisConfidence", ""),
                "retake_recommended": meta.get("retakeRecommended", ""),
                "label_confidence": meta.get("labelConfidence", ""),
                "ungradable": meta.get("ungradable", ""),
                "toneLstar": features.get("toneLstar", ""),
                "toneIta": features.get("toneIta", ""),
                "tone_band": subgroups.tone_band_from_ita(features.get("toneIta", "")),
                "age_band": subgroups.resolve_age_band(meta),
                "shine": features.get("shine", ""),
                "relRedness": features.get("relRedness", ""),
                "cov": features.get("cov", ""),
                "tzoneL": features.get("tzoneL", ""),
                "cheekL": features.get("cheekL", ""),
                "cheekTexture": features.get("cheekTexture", ""),
                "tzoneSpecular": features.get("tzoneSpecular", ""),
                "cheekSamples": features.get("cheekSamples", ""),
                "tzoneSamples": features.get("tzoneSamples", ""),
                **{key: features.get(key, "") for key in skin_indices.NEW_FEATURE_KEYS},
                # The one label already collected for an axis outside the graded
                # three: the optional "트러블 흔적도 보였어요" checkbox in /scan.
                "trouble_seen": (meta.get("observations") or {}).get("troubleSeen", ""),
            })
            valid += 1
            decoded.append({
                "participant_id": meta.get("participantId", ""),
                "session_id": meta.get("sessionId", ""),
                "device_id": meta.get("deviceId", ""),
                "toneIta": features.get("toneIta", ""),
                "age_band": subgroups.resolve_age_band(meta),
                # The CSV row above has carried these two since they were added and
                # nothing read them back, so subgroups.coverage() — which runs on this
                # projection, not on the CSV row — could not see that a run pooled two
                # feature generations. Version strings, not identifiers: this adds
                # nothing to what the projection already carries about a person.
                "model_version": meta.get("modelVersion", ""),
                "input_schema_version": meta.get("inputSchemaVersion", ""),
                "id": image_id,
            })
    coverage = subgroups.coverage(decoded)
    return {
        "manifest": str(manifest),
        "valid": valid,
        "failures": failures,
        "subgroup_coverage": coverage.as_dict(),
        "subgroup_warnings": subgroups.coverage_warnings(coverage),
    }


def warnings_for(summary: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    labels_n = summary["counts"]["labels"]
    crops_n = summary["counts"]["crops"]
    if labels_n < 30:
        warnings.append("Fewer than 30 labels: threshold calibration will be unstable.")
    if crops_n < 30:
        warnings.append("Fewer than 30 crops: CNN training is blocked.")
    for attr, counts in summary["labels"]["distribution"].items():
        missing = [label for label in ("0", "1", "2") if counts.get(label, 0) == 0]
        if missing:
            warnings.append(f"{attr} is missing label bucket(s): {', '.join(missing)}.")
    for attr, rec in (summary.get("heuristic_baseline") or {}).items():
        dropped = rec.get("unusable", 0)
        graded = rec.get("n", 0)
        if dropped:
            warnings.append(
                f"{attr}: {dropped} labelled row(s) carry a {rec.get('feature')} that is not a finite number "
                f"and were not graded ({graded} were). Before 2026-09-23 they were graded as level 2."
            )
    for warning in summary.get("decode", {}).get("subgroup_warnings", []) or []:
        warnings.append(f"Subgroup coverage: {warning}")
    pilot = summary.get("pilot", {})
    if pilot.get("total", 0) and pilot.get("completion_rate", 0) < 0.8:
        warnings.append("Pilot scan completion rate is below 80%; fix capture UX before collecting more data.")
    consent = summary.get("consent", {})
    crop_latest = consent.get("latest", {}).get("learning_crop", {})
    if crops_n and crop_latest.get("granted") is not True:
        warnings.append("Crop data exists but latest learning_crop consent is not granted in the consent export.")
    unscoped = consent.get("crops_without_scoped_consent", 0)
    if unscoped:
        warnings.append(
            f"{unscoped} crop(s) have no granted learning_crop consent in their own participant/session scope; "
            "see consent.unconsented_crop_ids before training on them."
        )
    # An unscoped consent event names no device, so with several consent files one
    # device's grant can stand for another device's unscoped crops.
    consent_files = len((summary.get("inputs") or {}).get("consent") or [])
    if consent_files > 1 and consent.get("unscoped_crops", 0):
        warnings.append(
            f"{consent['unscoped_crops']} crop(s) have no participant/session scope and were checked against "
            f"{consent_files} consent files; an unscoped event does not say which device it came from, "
            "so check these with one device's exports at a time."
        )
    return warnings


def write_markdown(path: Path, summary: dict[str, Any]) -> None:
    lines = [
        "# Gyeol ML Experiment Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Command: `{' '.join(summary['run']['argv'])}`",
        f"- Git commit: `{summary['run']['git'].get('commit', 'unknown')}`",
        f"- Readiness: **{summary['readiness']['title']}**",
        f"- Next action: {summary['readiness']['next_action']}",
        "",
        "## Counts",
        "",
        f"- Labels: {summary['counts']['labels']}",
        f"- Crops: {summary['counts']['crops']}",
        f"- Excluded low-quality labels/crops: {summary['counts'].get('excluded_labels', 0)} / {summary['counts'].get('excluded_crops', 0)}",
        f"- Pilot notes: {summary['counts']['pilot_notes']}",
        f"- Consent events: {summary['counts']['consent_events']}",
        "",
        "## Heuristic Baseline",
        "",
    ]
    for attr, rec in summary["heuristic_baseline"].items():
        acc = rec["accuracy"]
        acc_text = "n/a" if acc is None else f"{acc:.1%}"
        # The dropped rows are printed next to the accuracy, not left to the JSON: an
        # accuracy over 40 of 300 labelled rows reads the same as one over 300 unless
        # the line says what the other 260 were.
        dropped = rec.get("unusable", 0)
        skipped = f", {dropped} unusable" if dropped else ""
        lines.append(f"- {attr}: {acc_text} on {rec['n']} labels using {rec['feature']}{skipped}")
    lines.extend(["", "## Label Distribution", ""])
    for attr, counts in summary["labels"]["distribution"].items():
        lines.append(f"- {attr}: " + ", ".join(f"{label}={counts.get(label, 0)}" for label in ("0", "1", "2")))
    lines.extend(["", "## Pilot Subgroups", ""])
    pilot = summary.get("pilot", {})
    if pilot.get("total"):
        lines.append(f"- Completion rate: {pilot.get('completion_rate', 0):.1%}")
        lines.append(f"- Browser: {pilot.get('by_browser', {})}")
        lines.append(f"- Lighting: {pilot.get('by_lighting', {})}")
        lines.append(f"- Makeup: {pilot.get('by_makeup', {})}")
    else:
        lines.append("- No pilot notes supplied.")
    lines.extend(["", "## Warnings", ""])
    if summary["warnings"]:
        lines.extend(f"- {warning}" for warning in summary["warnings"])
    else:
        lines.append("- None")
    lines.extend(["", "## Recommended Commands", ""])
    lines.append("```bash")
    lines.append("python ml/calibrate.py <gyeol-labels.jsonl>")
    if summary["counts"]["crops"] >= 30:
        lines.append("python ml/train_visible_attributes.py --data <experiment>/dataset --epochs 12 --export-onnx")
    lines.append("```")
    train = summary.get("training", {})
    if train:
        lines.extend(["", "## Training", ""])
        lines.append(f"- Requested: {train.get('requested')}")
        lines.append(f"- Ran: {train.get('ran')}")
        if train.get("reason"):
            lines.append(f"- Reason: {train['reason']}")
        if train.get("log"):
            lines.append(f"- Log: `{train['log']}`")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_data_url(value: str) -> bytes:
    if not value.startswith("data:") or "," not in value:
        raise ValueError("expected image data URL")
    return base64.b64decode(value.split(",", 1)[1])


def parse_bool(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def default_out_dir() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return Path("ml") / "experiments" / stamp


def named_out_dir(name: str | None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = slugify(name) if name else stamp
    return Path("ml") / "experiments" / f"{stamp}-{slug}" if name else default_out_dir()


def slugify(value: str) -> str:
    keep = []
    for char in value.strip().lower():
        if char.isalnum():
            keep.append(char)
        elif char in {"-", "_", " ", "."}:
            keep.append("-")
    slug = "".join(keep).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "experiment"


def file_metadata(paths: dict[str, Path | None]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, path in paths.items():
        if not path:
            out[name] = None
            continue
        out[name] = {
            "path": str(path),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
    return out


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_command(args: list[str]) -> tuple[int, str]:
    proc = subprocess.run(args, cwd=Path.cwd(), text=True, capture_output=True, check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def git_metadata() -> dict[str, Any]:
    commit_code, commit = run_command(["git", "rev-parse", "HEAD"])
    status_code, status = run_command(["git", "status", "--short"])
    return {
        "commit": commit if commit_code == 0 else "unknown",
        "dirty": bool(status.strip()) if status_code == 0 else None,
        "status_short": status.splitlines() if status_code == 0 else [],
    }


def run_training_if_requested(args: argparse.Namespace, crops: list[dict[str, Any]], decode: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    info: dict[str, Any] = {
        "requested": bool(args.train),
        "ran": False,
        "reason": "",
        "log": None,
        "returncode": None,
    }
    if not args.train:
        info["reason"] = "Training not requested."
        return info
    if decode.get("valid", 0) < args.train_min_crops:
        info["reason"] = f"Only {decode.get('valid', 0)} valid decoded crops; minimum is {args.train_min_crops}."
        return info
    manifest = decode.get("manifest")
    if not manifest:
        info["reason"] = "No decoded manifest available. Pass --crops or --decode-crops."
        return info

    artifacts = out_dir / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "ml/train_visible_attributes.py",
        "--data",
        str(Path(manifest).parent),
        "--out-dir",
        str(artifacts),
        "--seed",
        str(args.seed),
    ]
    if args.export_onnx:
        command.append("--export-onnx")
    code, output = run_command(command)
    log_path = out_dir / "train.log"
    log_path.write_text(output + "\n", encoding="utf-8")
    info.update({
        "ran": code == 0,
        "returncode": code,
        "reason": "Training completed." if code == 0 else "Training command failed; inspect train.log.",
        "log": str(log_path),
        "command": command,
    })
    return info


def main() -> None:
    parser = argparse.ArgumentParser()
    # One or more files each: the documented `gyeol-labels-*.jsonl` glob matches every
    # day's export and every device's, and rows repeated across them are read once when
    # they carry an id.
    parser.add_argument("--labels", type=Path, nargs="+", required=True)
    parser.add_argument("--crops", type=Path, nargs="+")
    parser.add_argument("--pilot", type=Path, nargs="+")
    parser.add_argument("--consent", type=Path, nargs="+")
    parser.add_argument("--name", type=str)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--decode-crops", action="store_true")
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--train-min-crops", type=int, default=300)
    parser.add_argument("--export-onnx", action="store_true")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    for name in ("labels", "crops", "pilot", "consent"):
        setattr(args, name, expand_patterns(getattr(args, name)))
    raw_labels, dup_labels = read_jsonl_many(args.labels)
    raw_crops, dup_crops = read_jsonl_many(args.crops)
    labels = usable_samples(raw_labels)
    crops = usable_samples(raw_crops)
    pilot, dup_pilot = read_csv_many(args.pilot)
    consent, dup_consent = read_consent_many(args.consent)
    out_dir = args.out or named_out_dir(args.name)
    out_dir.mkdir(parents=True, exist_ok=True)

    decode = (
        decode_crops(crops, out_dir)
        if (crops or args.decode_crops or args.train)
        else {"manifest": None, "valid": 0, "failures": [], "subgroup_coverage": None, "subgroup_warnings": []}
    )
    training = run_training_if_requested(args, crops, decode, out_dir)
    summary: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run": {
            "argv": sys.argv,
            "python": sys.version,
            "platform": platform.platform(),
            "cwd": str(Path.cwd()),
            "git": git_metadata(),
            "seed": args.seed,
        },
        "inputs": {
            name: [str(path) for path in paths] if paths else None
            for name, paths in {"labels": args.labels, "crops": args.crops, "pilot": args.pilot, "consent": args.consent}.items()
        },
        "input_files": {
            name: [file_metadata({name: path})[name] for path in paths] if paths else None
            for name, paths in {"labels": args.labels, "crops": args.crops, "pilot": args.pilot, "consent": args.consent}.items()
        },
        "counts": {
            "raw_labels": len(raw_labels),
            "raw_crops": len(raw_crops),
            "labels": len(labels),
            "crops": len(crops),
            "excluded_labels": len(raw_labels) - len(labels),
            "excluded_crops": len(raw_crops) - len(crops),
            "pilot_notes": len(pilot),
            "consent_events": len(consent),
            "duplicate_ids_dropped": {"labels": dup_labels, "crops": dup_crops, "pilot_notes": dup_pilot, "consent_events": dup_consent},
        },
        "readiness": readiness(int(decode.get("valid", len(crops)) or 0)),
        "labels": {
            "distribution": label_distribution(labels),
            "sources": source_distribution(labels),
            "features": feature_summary(labels),
        },
        "crops": crop_summary(crops),
        "pilot": summarize_pilot(pilot),
        "consent": summarize_consent(consent, crops),
        "heuristic_baseline": heuristic_baseline(labels),
        "decode": decode,
        "decoded_manifest": decode.get("manifest"),
        "training": training,
    }
    summary["warnings"] = warnings_for(summary)
    summary["warnings"].extend(f"Crop decode failed: {failure}" for failure in decode.get("failures", []))

    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(out_dir / "report.md", summary)

    print(f"experiment: {out_dir}")
    print(f"readiness: {summary['readiness']['title']}")
    print(f"report: {out_dir / 'report.md'}")
    if summary["warnings"]:
        print("warnings:")
        for warning in summary["warnings"]:
            print(f"  - {warning}")


if __name__ == "__main__":
    main()
