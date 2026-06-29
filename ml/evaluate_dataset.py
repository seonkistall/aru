#!/usr/bin/env python3
"""
Summarize the crop manifest and print the next ML action.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path


ATTRS = ("oil", "redness", "pores")


def ita_bucket(value: str) -> str:
    try:
        ita = float(value)
    except (TypeError, ValueError):
        return "unknown"
    if ita > 55:
        return "very_light"
    if ita > 41:
        return "light"
    if ita > 28:
        return "intermediate"
    if ita > 10:
        return "tan"
    return "brown_dark"


def next_action(n: int) -> str:
    if n < 30:
        return "Do not train CNN yet. Use threshold calibration only."
    if n < 100:
        return "Pipeline dry-run only. Model metrics are not product quality."
    if n < 300:
        return "Train dry-run and inspect confusion by label/device/lighting."
    if n < 500:
        return "First meaningful MobileNetV3-small training + ONNX export."
    return "Run subgroup evaluation and compare against calibrated heuristic."


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path, default=Path("ml/data/crops/manifest.csv"), nargs="?")
    args = parser.parse_args()

    with args.manifest.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    print(f"samples: {len(rows)}")
    print(f"next: {next_action(len(rows))}\n")

    for attr in ATTRS:
        counts = Counter(row[attr] for row in rows)
        print(f"{attr}: " + ", ".join(f"{label}={counts[str(label)]}" for label in range(3)))

    ita_counts = Counter(ita_bucket(row.get("ita", "")) for row in rows)
    print("\nITA buckets:")
    for bucket, count in ita_counts.most_common():
        print(f"  {bucket}: {count}")

    by_source = Counter(row.get("source", "unknown") for row in rows)
    print("\nSources:")
    for source, count in by_source.most_common():
        print(f"  {source}: {count}")

    missing = defaultdict(int)
    for attr in ATTRS:
        for label in ("0", "1", "2"):
            if not any(row[attr] == label for row in rows):
                missing[attr] += 1
    if any(missing.values()):
        print("\nLabel gaps:")
        for attr, count in missing.items():
            if count:
                print(f"  {attr}: missing {count} label bucket(s)")


if __name__ == "__main__":
    main()
