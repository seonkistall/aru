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
    "dimensions": ["tone", "age", "tone_x_age"],
}

#: The overall per-axis quality floor, a sibling of the subgroup bar rather than part
#: of it: a subgroup gap asks "is the model even-handed", these ask "did it learn
#: anything at all". A model can be perfectly even-handed by being uniformly useless —
#: a constant predictor has almost no subgroup gap — so the subgroup block alone lets
#: a head that learned nothing through. Same fallback rule: manifest wins.
FALLBACK_ORDINAL_GATE = {
    "minQwk": 0.40,
    "minPearson": 0.40,
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


def ordinal_gate() -> dict:
    """Per-axis floor on how much a head must actually have learned."""
    gate = (load_manifest().get("promotionGate") or {}).get("ordinal") or {}
    merged = dict(FALLBACK_ORDINAL_GATE)
    for key, value in gate.items():
        if value not in (None, ""):
            merged[key] = value
    return merged


def min_qwk() -> float:
    return float(ordinal_gate()["minQwk"])


def min_pearson() -> float:
    return float(ordinal_gate()["minPearson"])


def min_samples_per_band() -> int:
    return int(promotion_gate()["minSamplesPerBand"])


def max_accuracy_gap() -> float:
    return float(promotion_gate()["maxAccuracyGap"])


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
