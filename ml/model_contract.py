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
#: The shipped ROI rule, mirrored for the same reason as FALLBACK_GATE: running the
#: trainer from a checkout without the web app must not silently DELETE a gate rule.
#: An empty heuristic block means "cannot score", never "nothing to beat" — and the
#: difference decides whether a model is promoted without ever being compared to what
#: it would replace. Kept in step with lib/skin.ts by tests/skin-index-contract.test.ts.
FALLBACK_HEURISTIC = {
    # Only used when the manifest is unreadable; the live value is its fallbackVersion,
    # and tests/skin-index-contract.test.ts asserts the two agree there.
    "version": "roi-calibrated-2026-09-18",
    "axes": {
        "oil": {"feature": "shine", "thresholds": [0.05, 0.16]},
        "redness": {"feature": "relRedness", "thresholds": [0.012, 0.03]},
        "pores": {"feature": "cov", "thresholds": [0.085, 0.14]},
    },
}

FALLBACK_GATE = {
    "minSamplesPerBand": 20,
    "maxAccuracyGap": 0.10,
    "minQwk": 0.40,
    "minPearson": 0.40,
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


def min_qwk_gain_over_heuristic() -> float:
    """How far a model must beat the shipped heuristic's qwk before it may replace it.

    0.0 means strictly greater: a model that merely ties the rule it would replace has
    not earned the swap. A positive margin should exceed validation noise, and nothing
    in the pipeline estimates that noise yet, so inventing one would be a fake number.
    """
    return float(promotion_gate().get("minQwkGainOverHeuristic", 0.0))


def fallback_heuristic() -> dict:
    """The ROI rule the app ships, as the manifest publishes it.

    Thresholds live in lib/skin.ts; the manifest mirrors them so the Python side can
    score the same rule, and tests/skin-index-contract.test.ts fails on drift.

    Falls back to FALLBACK_HEURISTIC rather than to {} when the manifest is missing or
    declares no block. Returning {} here made the gate fail OPEN: covered_axes() went
    empty, the beats-the-heuristic rule skipped every axis, and a model was promotable
    having never been compared to the rule it would replace — in exactly the scenario
    FALLBACK_GATE's comment already anticipates, a checkout without the web app. Every
    other floor survived that; this one evaporated.
    """
    declared = load_manifest().get("fallbackHeuristic")
    if isinstance(declared, dict) and declared.get("axes"):
        return declared
    return FALLBACK_HEURISTIC


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
