#!/usr/bin/env python3
"""
calibrate.py — Tier 1 of the moat: LEARN the bucket thresholds from YOUR data.

The web app's /scan emits self-calibrated features (shine, relRedness, cov) and,
via the feedback loop, the user-confirmed ordinal label (0/1/2) for each of
oil / redness / pores. Export those as JSONL ("데이터 내보내기").

This script reads that JSONL and, per attribute, grid-searches the two decision
thresholds (lo < hi) that best reproduce the human labels. The output thresholds
get pasted back into lib/skin.ts — so the product's reads are now tuned by REAL
Korean-selfie labels that only you have. That is the moat: not the model, the data.

Pure standard library — no pip install, runs on any Python 3.

Usage:
    python ml/calibrate.py gyeol-labels-42.jsonl
"""
import json
import sys

# attribute -> feature key it is computed from (see lib/skin.ts)
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


def predict(x, lo, hi):
    return 0 if x < lo else (1 if x < hi else 2)


def best_thresholds(samples):
    """Grid-search (lo, hi) maximizing label agreement for one attribute."""
    xs = sorted({s[0] for s in samples})
    if len(xs) < 2:
        return None
    # candidate cut points = midpoints between sorted feature values
    cuts = [(xs[i] + xs[i + 1]) / 2 for i in range(len(xs) - 1)]
    best = (-1.0, None, None)
    for i in range(len(cuts)):
        for j in range(i, len(cuts)):
            lo, hi = cuts[i], cuts[j]
            correct = sum(1 for x, y in samples if predict(x, lo, hi) == y)
            acc = correct / len(samples)
            if acc > best[0]:
                best = (acc, lo, hi)
    return best


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
        samples = [(r["features"][feat], r["labels"][attr]) for r in rows]
        res = best_thresholds(samples)
        if not res:
            print(f"{attr:8s}: not enough distinct values yet")
            continue
        acc, lo, hi = res
        print(f"{attr:8s}  feature={feat:11s}  lo={lo:.4f}  hi={hi:.4f}  agreement={acc:.0%}")

    print("\nPaste the lo/hi back into lib/skin.ts bucket() calls.")
    print("As you collect more labels, re-run — the thresholds keep getting truer to")
    print("real Korean skin. This is the data flywheel.\n")
    print("Tier 2 (bigger moat): once you opt-in to store skin CROPS (design D3 path B),")
    print("train a CNN on the crops — see README.md.")


if __name__ == "__main__":
    main()
