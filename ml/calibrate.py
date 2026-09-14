#!/usr/bin/env python3
"""
calibrate.py — Tier 1 of the moat: LEARN the bucket thresholds from YOUR data.

The web app's /scan emits self-calibrated features (shine, relRedness, cov) and,
via the feedback loop, the user-confirmed ordinal label for each of
oil / redness / pores. Export those as JSONL ("데이터 내보내기").

This script reads that JSONL and, per axis, finds the decision thresholds that best
reproduce the human labels. The level count comes from ml/aru_axes.py rather than
being hardcoded. The three graded axes are 3-level, so each emits two thresholds —
matching ATTR_THRESHOLDS in lib/skin.ts, which is where the output goes. `trouble`
is calibrated from the optional observation checkbox instead, which is binary and so
places one cut; `tone` and `dryness` are measured but have no label source anywhere
in the app, and the run says so rather than omitting them. The output thresholds
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

# Axes whose feature exists but whose only label is the optional observation
# checkbox in /scan. A boolean supports exactly one cut — "trouble seen" against
# "not" — which is not a grade for a 4-level axis but is a real, already-collected
# decision boundary, obtained without collecting anything new.
OBSERVATION_FEATURE = {"trouble": ("blemishDensity", "troubleSeen")}

# Axes lib/skin.ts now measures with no label source anywhere in the app yet.
# Listed so a run says so out loud instead of the axis quietly not appearing.
# tone    - needs a graded evenness label; nothing collects one.
# dryness - the registry requires a survey answer; the consumer survey's 건조
#           concern lives on the survey record, not on the scan sample.
UNLABELLED_FEATURE = {"tone": "toneSpread", "dryness": "roughnessRatio"}


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


def graded_label(attr, levels):
    """Reader for the ordinal label the /scan feedback step writes."""
    def read(row):
        label = (row.get("labels") or {}).get(attr)
        if not isinstance(label, int) or isinstance(label, bool) or not 0 <= label < levels:
            return None
        return label
    return read


def observation_label(key):
    """Reader for an optional boolean observation in the sample's meta."""
    def read(row):
        observations = ((row.get("meta") or {}).get("observations")) or {}
        value = observations.get(key)
        if value is True:
            return 1
        # An absent key is the checkbox left unticked, which the app does not
        # record. Treating it as 0 is the whole reason this label exists at all;
        # it is also why the boundary it finds is weaker than a graded one.
        if value is False or value is None:
            return 0
        return None
    return read


def collect(rows, feat, read_label):
    """(value, label) pairs plus the count of rows neither side could supply."""
    samples = []
    skipped = 0
    for row in rows:
        value = (row.get("features") or {}).get(feat)
        # An export row missing the feature or the label used to raise KeyError and
        # abandon the whole run. One malformed row is not a reason to lose the rest.
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            skipped += 1
            continue
        label = read_label(row)
        if label is None:
            skipped += 1
            continue
        samples.append((float(value), label))
    return samples, skipped


def report(attr, feat, levels, collected, suffix=""):
    samples, skipped = collected
    note = f"  (skipped {skipped} unusable)" if skipped else ""
    res = best_thresholds(samples, levels)
    if not res:
        print(f"{attr:8s}: not enough distinct values yet{note}")
        return
    acc, cuts = res
    printed = "  ".join(f"t{i}={cut:.4f}" for i, cut in enumerate(cuts))
    print(f"{attr:8s}  feature={feat:16s}  {printed}  agreement={acc:.0%}  n={len(samples)}{note}{suffix}")


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
        report(attr, feat, spec.levels, collect(rows, feat, graded_label(attr, spec.levels)))

    for attr, (feat, observation) in OBSERVATION_FEATURE.items():
        aru_axes.axis(attr)
        samples = collect(rows, feat, observation_label(observation))
        report(attr, feat, 2, samples, suffix="  (binary observation label)")

    for attr, feat in UNLABELLED_FEATURE.items():
        aru_axes.axis(attr)
        measured = sum(1 for row in rows if isinstance((row.get("features") or {}).get(feat), (int, float)))
        print(f"{attr:8s}  feature={feat:16s}  measured on {measured}/{len(rows)} samples, no label source - not calibrated")

    print("\nPaste the oil / redness / pores thresholds above into ATTR_THRESHOLDS in lib/skin.ts.")
    print("trouble's single cut belongs nowhere yet: the axis has no display path, and a")
    print("checkbox is not a grade. Record it, watch whether it moves with more labels.")
    print("As you collect more labels, re-run — the thresholds keep getting truer to")
    print("real Korean skin. This is the data flywheel.\n")
    print("Tier 2 (bigger moat): once you opt-in to store skin CROPS (design D3 path B),")
    print("train a CNN on the crops — see README.md.")


if __name__ == "__main__":
    main()
