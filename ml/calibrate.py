#!/usr/bin/env python3
"""
calibrate.py — Tier 1 of the moat: LEARN the bucket thresholds from YOUR data.

The web app's /scan emits self-calibrated features (shine, relRedness, cov) and,
via the feedback loop, the user-confirmed ordinal label for each of
oil / redness / pores. Export those as JSONL ("데이터 내보내기").

This script reads that JSONL and, per axis, finds the decision thresholds that best
reproduce the human labels. The level count comes from ml/aru_axes.py rather than
being hardcoded. Only axes listed in FEATURE below can be calibrated at all, and all
of those are 3-level today, so in practice it emits two thresholds per axis — matching
ATTR_THRESHOLDS in lib/skin.ts, which is where the output goes. The output thresholds
get pasted back into lib/skin.ts — so the product's reads are now tuned by REAL
Korean-selfie labels that only you have. That is the moat: not the model, the data.

Pure standard library — no pip install, runs on any Python 3.

Usage:
    python ml/calibrate.py gyeol-labels-42.jsonl
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402

# Axis -> the ROI feature lib/skin.ts computes it from. Only axes with a heuristic
# feature can be threshold-calibrated; the rest have no scalar to cut on and wait
# for a trained model instead.
FEATURE = {"oil": "shine", "redness": "relRedness", "pores": "cov"}


def is_true(value):
    return value is True or str(value).strip().lower() in {"1", "true", "yes", "y"}


def is_usable(row):
    meta = row.get("meta") or {}
    return not (
        is_true(row.get("ungradable")) or
        is_true(meta.get("ungradable")) or
        row.get("label_confidence") == "low" or
        meta.get("labelConfidence") == "low"
    )


def load(path):
    rows = []
    with open(path, encoding="utf-8-sig") as f:  # tolerate BOM
        for line in f:
            line = line.strip()
            if line:
                row = json.loads(line)
                if is_usable(row):
                    rows.append(row)
    return rows


def predict(x, thresholds):
    """Level for a feature value given ascending cut points."""
    level = 0
    for cut in thresholds:
        if x < cut:
            return level
        level += 1
    return level


def best_thresholds(samples, levels=3):
    """Thresholds maximizing label agreement, by dynamic programming.

    The previous version scored every ordered pair of cut points against every sample,
    which is cubic in the sample count and hardcoded to exactly two cuts. The weekly
    re-run the README asks for gets slow well before the pilot ends, and the number of
    cuts could not follow the axis level count.

    This is O(n^2 * levels) instead: best[i][L] is the most labels reproducible by
    covering the first i samples with levels 0..L, so the answer is best[n][levels-1]
    and the cuts fall out of the back-pointers. Measured on this machine: 2,000 samples
    in about half a second, where the old search would not have finished.

    Cuts are only allowed where the feature value actually changes — a boundary in the
    middle of a run of equal values is not a threshold any input could land on.
    """
    if not samples or levels < 2:
        return None
    ordered = sorted(samples, key=lambda pair: pair[0])
    values = [value for value, _ in ordered]
    if values[0] == values[-1]:
        return None  # one distinct value: nothing to cut on

    n = len(ordered)
    # prefix[L][i] = how many of the first i samples carry label L
    prefix = [[0] * (n + 1) for _ in range(levels)]
    for i, (_, label) in enumerate(ordered, start=1):
        for level in range(levels):
            prefix[level][i] = prefix[level][i - 1] + (1 if label == level else 0)

    # A split is legal only between two different feature values.
    legal_splits = {i for i in range(1, n) if values[i] != values[i - 1]}

    NEG = float("-inf")
    best = [[NEG] * levels for _ in range(n + 1)]
    back = [[0] * levels for _ in range(n + 1)]
    for i in range(n + 1):
        best[i][0] = prefix[0][i]  # everything so far called level 0
    for level in range(1, levels):
        for i in range(n + 1):
            # level `level` covers samples (split, i]
            top = NEG
            arg = 0
            for split in range(0, i + 1):
                if split not in legal_splits and split not in (0, i):
                    continue
                if best[split][level - 1] == NEG:
                    continue
                score = best[split][level - 1] + (prefix[level][i] - prefix[level][split])
                if score > top:
                    top = score
                    arg = split
            best[i][level] = top
            back[i][level] = arg

    if best[n][levels - 1] == NEG:
        return None

    splits = []
    index, level = n, levels - 1
    while level > 0:
        split = back[index][level]
        splits.append(split)
        index, level = split, level - 1
    splits.reverse()

    cuts = []
    for split in splits:
        if split <= 0:
            cuts.append(values[0])          # level is empty: cut below every value
        elif split >= n:
            cuts.append(values[-1] + 1e-9)  # level is empty: cut above every value
        else:
            cuts.append((values[split - 1] + values[split]) / 2)
    accuracy = best[n][levels - 1] / n
    return (accuracy, cuts)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 console safety
    except Exception:
        pass
    if len(sys.argv) < 2:
        print("usage: python ml/calibrate.py <labels.jsonl>")
        sys.exit(1)
    rows = load(sys.argv[1])
    print(f"loaded {len(rows)} labeled samples\n")
    if len(rows) < 12:
        print("! very few samples - collect more scans+feedback before trusting these.\n")

    for attr, feat in FEATURE.items():
        spec = aru_axes.axis(attr)  # fail loudly if the axis id ever drifts
        samples = []
        skipped = 0
        for row in rows:
            features = row.get("features") or {}
            labels = row.get("labels") or {}
            value, label = features.get(feat), labels.get(attr)
            # An export row missing the feature or the label used to raise KeyError and
            # abandon the whole run. One malformed row is not a reason to lose the rest.
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                skipped += 1
                continue
            if not isinstance(label, int) or isinstance(label, bool) or not 0 <= label < spec.levels:
                skipped += 1
                continue
            samples.append((float(value), label))

        note = f"  (skipped {skipped} unusable)" if skipped else ""
        res = best_thresholds(samples, spec.levels)
        if not res:
            print(f"{attr:8s}: not enough distinct values yet{note}")
            continue
        acc, cuts = res
        printed = "  ".join(f"t{i}={cut:.4f}" for i, cut in enumerate(cuts))
        print(f"{attr:8s}  feature={feat:11s}  {printed}  agreement={acc:.0%}  n={len(samples)}{note}")

    print("\nPaste the thresholds above into ATTR_THRESHOLDS in lib/skin.ts.")
    print("As you collect more labels, re-run — the thresholds keep getting truer to")
    print("real Korean skin. This is the data flywheel.\n")
    print("Tier 2 (bigger moat): once you opt-in to store skin CROPS (design D3 path B),")
    print("train a CNN on the crops — see README.md.")


if __name__ == "__main__":
    main()
