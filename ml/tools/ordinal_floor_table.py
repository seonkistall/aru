#!/usr/bin/env python3
"""What qwk and pearson concrete predictors actually score, to choose a floor from.

A tool, not a test. `promotionGate.ordinal` in the shipped model manifest was set from
this table rather than from a published benchmark band, because no page stating those
bands is reachable from the build network. Standard library only — unlike its sibling
this one needs nothing installed.

    python3 ml/tools/ordinal_floor_table.py

See docs/ordinal-metric-verification.md for the run this was written from, and for
what the table does and does not justify.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ordinal_metrics  # noqa: E402

SEED = 20260915
#: The skewed 3-level prior a majority-class predictor scores 0.80 accuracy on.
TRUTH = [80, 15, 5]
LEVELS = 3
DRAWS = 400


def confusion_for(predict, rng) -> list[list[int]]:
    matrix = [[0] * LEVELS for _ in range(LEVELS)]
    for _ in range(DRAWS):
        for level, count in enumerate(TRUTH):
            for _ in range(count):
                matrix[level][predict(level)] += 1
    return matrix


def main() -> int:
    rng = random.Random(SEED)

    def noisy(p):
        return lambda level: level if rng.random() < p else rng.randrange(LEVELS)

    def off_by_one(p):
        return lambda level: (
            level if rng.random() < p else max(0, min(LEVELS - 1, level + rng.choice([-1, 1])))
        )

    cases = [
        ("always the majority level", lambda _: 0),
        ("uniform random", lambda _: rng.randrange(LEVELS)),
        ("random from the truth prior", lambda _: rng.choices(range(LEVELS), weights=TRUTH)[0]),
        ("correct 40% of the time, else uniform", noisy(0.40)),
        ("correct 60% of the time, else uniform", noisy(0.60)),
        ("correct 80% of the time, else uniform", noisy(0.80)),
        ("correct 60%, else off by exactly one", off_by_one(0.60)),
        ("correct 80%, else off by exactly one", off_by_one(0.80)),
        ("perfect", lambda level: level),
    ]

    print(f"{'predictor':42s} {'accuracy':>9s} {'w/in 1':>8s} {'qwk':>8s} {'pearson':>8s}")
    for name, predict in cases:
        matrix = confusion_for(predict, rng)
        metrics = ordinal_metrics.metrics_from_confusion({"axis": matrix})["axis"]
        print(
            f"{name:42s} {metrics['accuracy']:9.4f} {metrics['within_one_grade']:8.4f} "
            f"{metrics['qwk']:8.4f} {metrics['pearson']:8.4f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
