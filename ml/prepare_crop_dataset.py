#!/usr/bin/env python3
"""
Decode opt-in crop JSONL exported from the app into image files + manifest.csv.

Input rows are exported by /scan when the user opts into local training-crop
storage. Each row contains a JPEG data URL, ordinal labels, heuristic features,
and feedback source.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ita as ita_module  # noqa: E402
import skin_indices  # noqa: E402
import subgroups  # noqa: E402


def parse_data_url(value: str) -> bytes:
    if "," not in value:
        raise ValueError("expected data URL")
    return base64.b64decode(value.split(",", 1)[1])


def ita_for_row(path: Path, features: dict) -> str:
    """ITA for one crop, preferring the value the app already measured.

    The browser computes ITA on the live frame from the trimmed cheek pixels, with
    landmarks and before JPEG compression, so its reading beats anything recomputed
    from the stored crop. Recomputation is the fallback, and it goes through ml/ita.py
    so both paths use the same dominant-cluster definition. An earlier version of this
    script averaged the whole crop instead, which put the same face in a different
    tone band depending on which path produced the number.
    """
    recorded = str(features.get("toneIta", "") or "").strip()
    if recorded:
        return recorded
    reading = ita_module.tone_from_image_path(path)
    return f"{reading.ita:.3f}" if reading else ""


def read_jsonl(path: Path) -> Iterable[dict]:
    with path.open(encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def is_true(value: object) -> bool:
    return value is True or str(value).strip().lower() in {"1", "true", "yes", "y"}


def is_usable_sample(row: dict) -> bool:
    meta = row.get("meta") or {}
    return not (
        is_true(row.get("ungradable")) or
        is_true(meta.get("ungradable")) or
        row.get("label_confidence") == "low" or
        meta.get("labelConfidence") == "low"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--out", type=Path, default=Path("ml/data/crops"))
    args = parser.parse_args()

    images_dir = args.out / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.csv"

    rows = []
    for idx, row in enumerate(read_jsonl(args.jsonl)):
        if not is_usable_sample(row):
            continue
        image_id = row.get("id") or f"crop_{idx:06d}"
        image_path = images_dir / f"{image_id}.jpg"
        image_path.write_bytes(parse_data_url(row["image"]))
        labels = row["labels"]
        features = row.get("features", {})
        meta = row.get("meta") or {}
        quality = meta.get("quality") or {}
        ita_value = ita_for_row(image_path, features)
        rows.append({
            "id": image_id,
            "image": str(image_path.relative_to(args.out)),
            "oil": labels["oil"],
            "redness": labels["redness"],
            "pores": labels["pores"],
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
            "ita": ita_value,
            "ita_source": "app_measured" if str(features.get("toneIta", "") or "").strip() else "recomputed_from_crop",
            "tone_band": subgroups.tone_band_from_ita(ita_value),
            "age_band": subgroups.resolve_age_band(meta),
            "toneLstar": features.get("toneLstar", ""),
            "toneIta": features.get("toneIta", ""),
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
            "trouble_seen": (meta.get("observations") or {}).get("troubleSeen", ""),
        })

    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else ["image", "oil", "redness", "pores"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} images")
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
