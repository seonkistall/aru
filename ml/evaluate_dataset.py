#!/usr/bin/env python3
"""
Summarize the crop manifest and print the next ML action.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402
import subgroups  # noqa: E402


ATTRS = aru_axes.LEGACY_ATTRS


def ita_bucket(value: str) -> str:
    """Kept as a thin alias so older call sites still work; bands live in subgroups.py."""
    return subgroups.tone_band_from_ita(value)


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
    participants = {row.get("participant_id", "").strip() for row in rows if row.get("participant_id", "").strip()}
    sessions = {row.get("session_id", "").strip() for row in rows if row.get("session_id", "").strip()}
    print(f"participants: {len(participants)}")
    print(f"sessions: {len(sessions)}")
    print(f"next: {next_action(len(rows))}\n")

    present = [axis for axis in aru_axes.CAMERA_AXES if axis in (rows[0] if rows else {})]
    for attr in present:
        counts = Counter(row.get(attr, "") for row in rows)
        labelled = ", ".join(
            f"{label}={counts[str(label)]}" for label in range(aru_axes.levels_for(attr))
        )
        unlabeled = counts.get("", 0)
        print(f"{attr}: {labelled}" + (f", unlabeled={unlabeled}" if unlabeled else ""))

    cov = subgroups.coverage(rows)
    print("\nTone bands:")
    for band, count in sorted(cov.tone.items(), key=lambda kv: -kv[1]):
        print(f"  {band}: {count}")
    print("\nAge bands:")
    for band, count in sorted(cov.age.items(), key=lambda kv: -kv[1]):
        print(f"  {band}: {count}")
    warnings = subgroups.coverage_warnings(cov)
    if warnings:
        print("\nSubgroup warnings:")
        for warning in warnings:
            print(f"  - {warning}")

    by_source = Counter(row.get("source", "unknown") for row in rows)
    print("\nSources:")
    for source, count in by_source.most_common():
        print(f"  {source}: {count}")

    by_device = Counter(row.get("device_id", "unknown") or "unknown" for row in rows)
    print("\nDevices:")
    for device, count in by_device.most_common():
        print(f"  {device}: {count}")

    by_mode = Counter(row.get("capture_mode", "unknown") or "unknown" for row in rows)
    print("\nCapture modes:")
    for mode, count in by_mode.most_common():
        print(f"  {mode}: {count}")

    missing = defaultdict(int)
    for attr in present:
        for label in range(aru_axes.levels_for(attr)):
            if not any(row.get(attr) == str(label) for row in rows):
                missing[attr] += 1
    if any(missing.values()):
        print("\nLabel gaps:")
        for attr, count in missing.items():
            if count:
                print(f"  {attr}: missing {count} label bucket(s)")


if __name__ == "__main__":
    main()
