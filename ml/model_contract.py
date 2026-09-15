#!/usr/bin/env python3
"""Read the shipped model contract so training enforces what the app promises.

public/models/visible-attributes/manifest.json is what the browser reads to decide
whether a model may run and under what confidence rule. Its promotionGate block also
states the subgroup bar a model must clear. That bar was duplicated as argparse
defaults in the trainer, so the gate the manifest advertised and the gate training
actually applied could drift apart without anything failing.

The manifest wins. This module is the only place that reads it on the Python side.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "public" / "models" / "visible-attributes" / "manifest.json"

#: Used only when the manifest is missing or unreadable, e.g. running the trainer
#: from a checkout without the web app. Kept deliberately strict.
FALLBACK_GATE = {
    "minSamplesPerBand": 20,
    "maxAccuracyGap": 0.10,
    "minQwk": 0.40,
    "minPearson": 0.40,
    "dimensions": ["tone", "age", "tone_x_age"],
}


def load_manifest() -> dict:
    """Parsed manifest, or {} when it is missing or malformed."""
    try:
        with MANIFEST_PATH.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def promotion_gate() -> dict:
    """Subgroup bar a model must clear before it may replace the heuristic."""
    gate = (load_manifest().get("promotionGate") or {}).get("subgroup") or {}
    merged = dict(FALLBACK_GATE)
    for key, value in gate.items():
        if value not in (None, ""):
            merged[key] = value
    return merged


def min_samples_per_band() -> int:
    return int(promotion_gate()["minSamplesPerBand"])


def max_accuracy_gap() -> float:
    return float(promotion_gate()["maxAccuracyGap"])


def min_qwk() -> float:
    """Ordinal-agreement floor, per axis, on the final validation confusion.

    Accuracy and the subgroup gap cannot carry the gate on their own: a majority-class
    predictor on a skewed ordinal scale scores well on both and has qwk exactly 0.
    """
    return float(promotion_gate()["minQwk"])


def min_pearson() -> float:
    """Correlation floor, per axis. Zero for a predictor whose output never varies."""
    return float(promotion_gate()["minPearson"])


def declared_dimensions() -> list[str]:
    """Subgroup dimensions the manifest says the gate covers."""
    declared = promotion_gate().get("dimensions") or []
    return [str(name) for name in declared]


def declared_axes() -> dict:
    """Axis table the manifest publishes, keyed by axis id."""
    return load_manifest().get("axes") or {}


def source() -> str:
    """Where the gate actually came from, recorded in metrics.json.

    A corrupt manifest parses to {} and the gate falls back, so reporting the path
    just because the file exists would claim the manifest supplied a bar it did not —
    the precise drift this module exists to prevent.
    """
    if not MANIFEST_PATH.exists():
        return "built-in fallback (manifest not found)"
    if not load_manifest():
        return f"built-in fallback ({MANIFEST_PATH} unreadable or malformed)"
    if not (load_manifest().get("promotionGate") or {}).get("subgroup"):
        return f"built-in fallback ({MANIFEST_PATH} declares no promotionGate.subgroup)"
    return str(MANIFEST_PATH)
