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
import hashlib
import json
import math
import platform
import subprocess
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


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
        for key in ("shine", "relRedness", "cov", "tzoneL", "cheekL"):
            value = features.get(key)
            if isinstance(value, (int, float)) and math.isfinite(value):
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
    if value < lo:
        return 0
    return 1 if value < hi else 2


def heuristic_baseline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for attr in ATTRS:
        feat = FEATURE_FOR_ATTR[attr]
        lo, hi = HEURISTIC_THRESHOLDS[attr]
        total = 0
        correct = 0
        confusion = {str(actual): {str(pred): 0 for pred in range(3)} for actual in range(3)}
        for row in rows:
            features = row.get("features", {})
            labels = row.get("labels", {})
            if feat not in features or attr not in labels:
                continue
            pred = bucket(float(features[feat]), lo, hi)
            actual = int(labels[attr])
            if actual in (0, 1, 2):
                confusion[str(actual)][str(pred)] += 1
                correct += int(pred == actual)
                total += 1
        out[attr] = {
            "feature": feat,
            "thresholds": {"lo": lo, "hi": hi},
            "n": total,
            "accuracy": round(correct / total, 4) if total else None,
            "confusion": confusion,
        }
    return out


def summarize_pilot(rows: list[dict[str, str]]) -> dict[str, Any]:
    if not rows:
        return {"total": 0}
    total = len(rows)
    completed = sum(parse_bool(row.get("scanCompleted")) for row in rows)
    return {
        "total": total,
        "completed": completed,
        "completion_rate": round(completed / total, 4),
        "by_browser": dict(Counter(row.get("browser", "unknown") for row in rows)),
        "by_lighting": dict(Counter(row.get("lighting", "unknown") for row in rows)),
        "by_makeup": dict(Counter(row.get("makeup", "unknown") for row in rows)),
        "crop_consent_rate": round(sum(parse_bool(row.get("consentCrop")) for row in rows) / total, 4),
        "ai_consent_rate": round(sum(parse_bool(row.get("consentAi")) for row in rows) / total, 4),
    }


def summarize_consent(rows: list[dict[str, str]]) -> dict[str, Any]:
    by_kind: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_kind[row.get("kind", "unknown")].append(row)
    return {
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
        return {"manifest": None, "valid": 0, "failures": []}
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
        "shine",
        "relRedness",
        "cov",
        "tzoneL",
        "cheekL",
        "cheekTexture",
        "tzoneSpecular",
        "cheekSamples",
        "tzoneSamples",
    ]
    failures: list[str] = []
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
                "shine": features.get("shine", ""),
                "relRedness": features.get("relRedness", ""),
                "cov": features.get("cov", ""),
                "tzoneL": features.get("tzoneL", ""),
                "cheekL": features.get("cheekL", ""),
                "cheekTexture": features.get("cheekTexture", ""),
                "tzoneSpecular": features.get("tzoneSpecular", ""),
                "cheekSamples": features.get("cheekSamples", ""),
                "tzoneSamples": features.get("tzoneSamples", ""),
            })
            valid += 1
    return {"manifest": str(manifest), "valid": valid, "failures": failures}


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
    pilot = summary.get("pilot", {})
    if pilot.get("total", 0) and pilot.get("completion_rate", 0) < 0.8:
        warnings.append("Pilot scan completion rate is below 80%; fix capture UX before collecting more data.")
    consent = summary.get("consent", {})
    crop_latest = consent.get("latest", {}).get("learning_crop", {})
    if crops_n and crop_latest.get("granted") is not True:
        warnings.append("Crop data exists but latest learning_crop consent is not granted in the consent export.")
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
        f"- Pilot notes: {summary['counts']['pilot_notes']}",
        f"- Consent events: {summary['counts']['consent_events']}",
        "",
        "## Heuristic Baseline",
        "",
    ]
    for attr, rec in summary["heuristic_baseline"].items():
        acc = rec["accuracy"]
        acc_text = "n/a" if acc is None else f"{acc:.1%}"
        lines.append(f"- {attr}: {acc_text} on {rec['n']} labels using {rec['feature']}")
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
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--crops", type=Path)
    parser.add_argument("--pilot", type=Path)
    parser.add_argument("--consent", type=Path)
    parser.add_argument("--name", type=str)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--decode-crops", action="store_true")
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--train-min-crops", type=int, default=300)
    parser.add_argument("--export-onnx", action="store_true")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    labels = read_jsonl(args.labels)
    crops = read_jsonl(args.crops)
    pilot = read_csv(args.pilot)
    consent = read_csv(args.consent)
    out_dir = args.out or named_out_dir(args.name)
    out_dir.mkdir(parents=True, exist_ok=True)

    decode = decode_crops(crops, out_dir) if (crops or args.decode_crops or args.train) else {"manifest": None, "valid": 0, "failures": []}
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
            "labels": str(args.labels),
            "crops": str(args.crops) if args.crops else None,
            "pilot": str(args.pilot) if args.pilot else None,
            "consent": str(args.consent) if args.consent else None,
        },
        "input_files": file_metadata({"labels": args.labels, "crops": args.crops, "pilot": args.pilot, "consent": args.consent}),
        "counts": {
            "labels": len(labels),
            "crops": len(crops),
            "pilot_notes": len(pilot),
            "consent_events": len(consent),
        },
        "readiness": readiness(len(crops)),
        "labels": {
            "distribution": label_distribution(labels),
            "sources": source_distribution(labels),
            "features": feature_summary(labels),
        },
        "crops": crop_summary(crops),
        "pilot": summarize_pilot(pilot),
        "consent": summarize_consent(consent),
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
