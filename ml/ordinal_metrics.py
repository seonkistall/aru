#!/usr/bin/env python3
"""Ordinal metrics for a confusion matrix, with no torch in sight.

These three functions decide whether a model is any good, and they used to live in
train_visible_attributes.py — which imports torch, PIL and torchvision at module
scope. That put them out of reach of ml/selftest.py, and out of reach of anything
that wants to score a NON-model predictor on the same footing: notably the shipped
heuristic in lib/skin.ts, which the promotion gate now has to beat.

Scoring the model and the heuristic through the same code is the point. A baseline
computed by a second implementation is a baseline nobody can trust.

Read qwk and pearson, never accuracy alone. On a skewed ordinal scale a model that
always answers the majority grade takes accuracy 0.80 and within_one_grade 0.95 while
carrying no information at all; qwk and pearson are 0 for exactly that model.
"""

from __future__ import annotations


def quadratic_weighted_kappa(matrix: list[list[int]]) -> float:
    """Agreement corrected for chance, weighted by how far off the grade is.

    This is the metric that catches the trap accuracy and MAE walk into on a skewed
    ordinal scale: a head that always predicts the majority grade can score high
    "within one grade" agreement while carrying no information. QWK goes to 0 for
    exactly that predictor.
    """
    levels = len(matrix)
    total = sum(sum(row) for row in matrix)
    if total == 0 or levels < 2:
        return 0.0
    actual = [sum(row) for row in matrix]
    predicted = [sum(matrix[i][j] for i in range(levels)) for j in range(levels)]
    denom = (levels - 1) ** 2
    observed = 0.0
    expected = 0.0
    for i in range(levels):
        for j in range(levels):
            weight = ((i - j) ** 2) / denom
            observed += weight * matrix[i][j] / total
            expected += weight * (actual[i] / total) * (predicted[j] / total)
    if expected == 0:
        return 0.0
    return 1.0 - observed / expected


def pearson_from_confusion(matrix: list[list[int]]) -> float:
    """Correlation between true and predicted grade, read off the joint counts.

    Reported because a low-variance target makes MAE look excellent while the model
    explains almost nothing. Correlation is what exposes that; MAE hides it.
    """
    levels = len(matrix)
    total = sum(sum(row) for row in matrix)
    if total < 2:
        return 0.0
    mean_true = sum(i * sum(matrix[i]) for i in range(levels)) / total
    mean_pred = sum(j * sum(matrix[i][j] for i in range(levels)) for j in range(levels)) / total
    cov = var_true = var_pred = 0.0
    for i in range(levels):
        for j in range(levels):
            count = matrix[i][j]
            if not count:
                continue
            cov += count * (i - mean_true) * (j - mean_pred)
            var_true += count * (i - mean_true) ** 2
            var_pred += count * (j - mean_pred) ** 2
    if var_true <= 0 or var_pred <= 0:
        # A constant column or row: no variance to correlate. Report 0 rather than
        # a divide-by-zero that would read as "no result" downstream.
        return 0.0
    return cov / (var_true ** 0.5 * var_pred ** 0.5)


def metrics_from_confusion(confusion: dict[str, list[list[int]]]) -> dict[str, dict[str, float]]:
    metrics: dict[str, dict[str, float]] = {}
    for axis, matrix in confusion.items():
        levels = len(matrix)
        total = sum(sum(row) for row in matrix)
        correct = sum(matrix[i][i] for i in range(levels))
        f1s = []
        ordinal_abs = 0
        within_one = 0
        for cls in range(levels):
            tp = matrix[cls][cls]
            fp = sum(matrix[row][cls] for row in range(levels) if row != cls)
            fn = sum(matrix[cls][col] for col in range(levels) if col != cls)
            precision = tp / max(1, tp + fp)
            recall = tp / max(1, tp + fn)
            f1s.append(0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall))
        for y_true in range(levels):
            for y_pred in range(levels):
                ordinal_abs += abs(y_true - y_pred) * matrix[y_true][y_pred]
                if abs(y_true - y_pred) <= 1:
                    within_one += matrix[y_true][y_pred]
        metrics[axis] = {
            "n": total,
            "accuracy": correct / max(1, total),
            "macro_f1": sum(f1s) / len(f1s),
            "ordinal_mae": ordinal_abs / max(1, total),
            # within_one_grade is recorded but is NOT a promotion signal on its own:
            # on a skewed scale it reaches 90%+ for a model that learned nothing.
            # Read it next to qwk and pearson, never instead of them.
            "within_one_grade": within_one / max(1, total),
            "qwk": quadratic_weighted_kappa(matrix),
            "pearson": pearson_from_confusion(matrix),
        }
    return metrics
