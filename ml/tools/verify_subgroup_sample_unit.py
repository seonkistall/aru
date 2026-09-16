#!/usr/bin/env python3
"""What unit is the manifest's minSamplesPerBand counted in?

Reproduces the backlog item "minSamplesPerBand is compared against the wrong unit".
Standard library only; run it from anywhere:

    python3 ml/tools/verify_subgroup_sample_unit.py

aggregate_by_cell now reports BOTH numbers, so the defect and the fix can be printed
side by side from one run of the real code rather than from a reimplementation of the
old body:

  * "observations" is the sum of the per-axis label counts. That is what the pre-fix
    `_aggregate` put in "n" and what worst_group therefore compared against the floor.
  * "n" is the labelled-sample count on the thinnest axis carrying any label in the
    cell — the unit fit_tone_calibration already gates on, and the one the floor is
    now read in.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import model_contract  # noqa: E402
import subgroups  # noqa: E402

AXES = ("oil", "redness", "pores")
LEVELS = 3


def diagonal(n: int) -> list[list[int]]:
    matrix = [[0] * LEVELS for _ in range(LEVELS)]
    for i in range(n):
        matrix[i % LEVELS][i % LEVELS] += 1
    return matrix


def main() -> int:
    floor = model_contract.min_samples_per_band()
    cell = "light/30s"
    for real_samples in (10, floor):
        agg = subgroups.aggregate_by_cell({cell: {a: diagonal(real_samples) for a in AXES}})
        entry = agg[cell]
        print(f"--- a cell of {real_samples} real samples labelled on {len(AXES)} axes ---")
        print(f"  observations (summed across axes, the pre-fix 'n'): {entry['observations']}")
        print(f"  n (labelled samples on the thinnest axis)         : {entry['n']}")
        print(f"  manifest minSamplesPerBand                        : {floor}")
        for unit, value in (("observations", entry["observations"]), ("n", entry["n"])):
            verdict = "clears the floor" if value >= floor else "refused"
            print(f"  gating on {unit:<12}: {value} >= {floor} -> {verdict}")
        print(f"  worst_group evaluated?                            : "
              f"{subgroups.worst_group(agg, 'accuracy', min_n=floor).get('evaluated')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
