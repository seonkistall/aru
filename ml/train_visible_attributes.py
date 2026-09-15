#!/usr/bin/env python3
"""Train a mobile-friendly multi-task skin attribute model.

Inputs:
  a manifest.csv produced by prepare_crop_dataset.py (ARU opt-in crops) or by
  external_manifest.py (a licensed external dataset), or a concatenation of both.

What changed from the three-head version
----------------------------------------
* Axes come from ml/aru_axes.py, so a head exists only where an RGB selfie can
  carry the signal, and each axis keeps its own level count. The default axis set
  is still oil/redness/pores, so existing commands train the same model as before.
* Labels may be partial. An external dataset that only grades acne leaves every
  other column empty, and those cells are masked out of the loss instead of being
  filled with a guess.
* Validation is grouped by person AND stratified by subgroup cell, because a split
  that puts every darker-skin sample in one fold produces per-cell numbers that
  describe noise.
* Metrics are reported per tone band x age band, with an explicit worst-cell line
  and an explicit list of cells too small to evaluate. A model that cannot be
  evaluated on a subgroup has not passed a fairness check.
* Per-tone-band calibration offsets are fitted on validation and exported next to
  the weights, so the runtime can correct a head that reads systematically high or
  low on darker skin instead of shipping that bias to users.
* The licence of every source in the manifest is checked before training starts.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import random
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402
import licensing  # noqa: E402
import heuristic_baseline  # noqa: E402
import model_contract  # noqa: E402
import ordinal_metrics  # noqa: E402
import subgroups  # noqa: E402

#: Backwards-compatible default: the three axes the app already ships.
ATTRS = aru_axes.LEGACY_ATTRS

IGNORE_INDEX = -100

AUX_HEADS = {
    "tone_band": subgroups.TONE_BAND_ORDER,
    "age_band": subgroups.AGE_BANDS,
}


@dataclass
class Row:
    image: Path
    image_rel: str
    row_id: str
    labels: dict[str, int | None]
    meta: dict[str, str]
    aux: dict[str, int] = field(default_factory=dict)

    @property
    def source(self) -> str:
        """Registered dataset id for the licence gate; see licensing.dataset_source_for_row."""
        return licensing.dataset_source_for_row(self.meta)

    @property
    def cell(self) -> str:
        return subgroups.subgroup_key(self.meta)


class CropDataset(Dataset):
    def __init__(self, rows: list[Row], transform, axes: tuple[str, ...], aux_heads: tuple[str, ...]):
        self.rows = rows
        self.transform = transform
        self.axes = axes
        self.aux_heads = aux_heads

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        image = Image.open(row.image).convert("RGB")
        target = {
            axis: torch.tensor(
                row.labels.get(axis) if row.labels.get(axis) is not None else IGNORE_INDEX,
                dtype=torch.long,
            )
            for axis in self.axes
        }
        for head in self.aux_heads:
            target[f"aux_{head}"] = torch.tensor(row.aux.get(head, IGNORE_INDEX), dtype=torch.long)
        return self.transform(image), target


class MultiHeadNet(nn.Module):
    """Multi-head visible-attribute classifier over a swappable backbone.

    mobilenetv3_small stays the on-device default; efficientnet_b0 is the
    bake-off candidate (transfer learning reaches ~80% on small facial-skin
    datasets in prior art, so both should be trained at the 300+ crop gate
    and compared under participant-grouped CV before ONNX promotion).

    Auxiliary heads predict the subgroup cell itself. They never reach the product;
    they exist so the shared trunk has to encode melanin level and age explicitly
    rather than entangling them with redness and texture.
    """

    def __init__(
        self,
        arch: str = "mobilenetv3_small",
        axes: tuple[str, ...] = ATTRS,
        aux_heads: tuple[str, ...] = (),
        pretrained: bool = True,
    ):
        super().__init__()
        # weights=None trains from scratch. Needed on an air-gapped or proxied machine
        # where the torchvision weight download is blocked, and for a reproducibility
        # run that must not depend on a remote checkpoint. Accuracy will be far lower
        # on a small dataset, so a from-scratch run is never promotion evidence.
        if arch == "efficientnet_b0":
            weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
            backbone = models.efficientnet_b0(weights=weights)
            in_features = backbone.classifier[1].in_features
            backbone.classifier = nn.Identity()
        elif arch == "mobilenetv3_small":
            weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
            backbone = models.mobilenet_v3_small(weights=weights)
            in_features = backbone.classifier[0].in_features
            backbone.classifier = nn.Identity()
        else:
            raise ValueError(f"unknown arch: {arch}")
        self.arch = arch
        self.pretrained = pretrained
        self.axes = tuple(axes)
        self.aux_heads = tuple(aux_heads)
        self.features = backbone
        heads = {axis: nn.Linear(in_features, aru_axes.levels_for(axis)) for axis in self.axes}
        for head in self.aux_heads:
            heads[f"aux_{head}"] = nn.Linear(in_features, len(AUX_HEADS[head]))
        self.heads = nn.ModuleDict(heads)

    def forward(self, x):
        z = self.features(x)
        return {name: head(z) for name, head in self.heads.items()}


def is_truthy(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def is_excluded_manifest_row(rec: dict[str, str]) -> bool:
    return is_truthy(rec.get("ungradable", "")) or rec.get("label_confidence", "") == "low"


def parse_level(value: object, axis: str) -> int | None:
    text = str(value if value is not None else "").strip()
    if text == "":
        return None
    try:
        return aru_axes.validate_level(axis, int(float(text)))
    except (TypeError, ValueError):
        return None


def load_pretrained(path: Path, model: nn.Module, device) -> dict:
    """Initialise from an earlier stage's checkpoint and return its lineage.

    Heads whose shape does not match are dropped rather than forced: a pretrain over
    a dataset that only grades pores and wrinkles has no head for oil, and reusing a
    differently sized classifier would be silent garbage. The trunk is what transfers.
    """
    checkpoint = torch.load(path, map_location=device, weights_only=False)
    state = checkpoint.get("model") or {}
    current = model.state_dict()
    kept, dropped = {}, []
    for key, value in state.items():
        if key in current and current[key].shape == value.shape:
            kept[key] = value
        else:
            dropped.append(key)
    missing = [key for key in current if key not in kept]
    model.load_state_dict(kept, strict=False)
    print(
        f"init-from {path}: loaded {len(kept)} tensors, "
        f"skipped {len(dropped)} shape-mismatched, {len(missing)} left at init"
    )
    return {
        "path": str(path),
        "sha256": sha256(path),
        "axes": list(checkpoint.get("axes") or []),
        "loaded_tensors": len(kept),
        "skipped_tensors": dropped,
        "lineage": checkpoint.get("lineage") or {"stages": []},
    }


def image_root_for(manifest: Path, fallback: Path) -> Path:
    """Where a manifest's relative image paths resolve from.

    Manifests from different datasets are concatenated for a combined pretrain, and
    each one's paths are relative to its own dataset root, not to a shared --data.
    external_manifest.py already records that root in the provenance file it writes
    beside the manifest, so read it rather than making the caller repeat it.
    """
    provenance = manifest.parent / "provenance.json"
    if provenance.exists():
        try:
            with provenance.open(encoding="utf-8") as handle:
                recorded = json.load(handle).get("datasetRoot")
            if recorded and Path(recorded).exists():
                return Path(recorded)
        except (OSError, json.JSONDecodeError):
            pass
    return fallback


def load_rows(root: Path, manifest: Path, axes: tuple[str, ...], aux_heads: tuple[str, ...]) -> list[Row]:
    rows: list[Row] = []
    with manifest.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = [axis for axis in axes if axis not in columns]
        if missing:
            raise SystemExit(
                f"manifest {manifest} has no column(s) for: {', '.join(missing)}. "
                f"Available: {', '.join(sorted(columns))}"
            )
        for idx, rec in enumerate(reader):
            if is_excluded_manifest_row(rec):
                continue
            labels = {axis: parse_level(rec.get(axis), axis) for axis in axes}
            if not any(value is not None for value in labels.values()):
                continue
            image_rel = rec["image"]
            meta = {key: value for key, value in rec.items() if key not in {"image", *axes}}
            aux = {}
            if "tone_band" in aux_heads:
                band = subgroups.resolve_tone_band(rec)
                if band in subgroups.TONE_BAND_ORDER:
                    aux["tone_band"] = subgroups.TONE_BAND_ORDER.index(band)
            if "age_band" in aux_heads:
                band = subgroups.resolve_age_band(rec)
                if band in subgroups.AGE_BANDS:
                    aux["age_band"] = subgroups.AGE_BANDS.index(band)
            rows.append(Row(
                image=root / image_rel,
                image_rel=image_rel,
                row_id=rec.get("id") or Path(image_rel).stem or f"row_{idx:06d}",
                labels=labels,
                meta=meta,
                aux=aux,
            ))
    return rows


def enforce_source_licences(rows: list[Row], purpose: str, lineage: dict | None = None) -> dict:
    """Refuse to start when this data, or the weights we start from, forbid this purpose.

    The lineage half is what makes pretrain-then-finetune honest. Fine-tuning on clean
    first-party crops does not wash out a pretrain on a non-commercial corpus, because
    the resulting weights are a derivative of both.
    """
    counts = Counter(row.source for row in rows)
    decisions = [licensing.check(source, purpose) for source in sorted(counts)]
    inherited = licensing.check_lineage(lineage, purpose)

    blocked = [d for d in decisions if not d.allowed]
    blocked_inherited = [d for d in inherited if not d.allowed]
    if blocked or blocked_inherited:
        lines = [
            f"  - {d.source_id} ({counts[d.source_id]} rows in this manifest) [{d.tier}]: {d.reason}"
            for d in blocked
        ]
        lines += [
            f"  - {d.source_id} (inherited from --init-from weights) [{d.tier}]: {d.reason}"
            for d in blocked_inherited
        ]
        raise SystemExit(
            f"Refusing to train for purpose={purpose!r}. Blocked:\n" + "\n".join(lines) + "\n"
            f"Re-run with --purpose research_pretrain for a non-shipping experiment, drop those rows, "
            f"or start from weights without that lineage."
        )
    return {
        "purpose": purpose,
        "sources": {source: counts[source] for source in sorted(counts)},
        "decisions": [d.as_dict() for d in decisions],
        "inherited": [d.as_dict() for d in inherited],
        "lineage": licensing.describe_lineage(lineage),
    }


# ---------------------------------------------------------------- metrics ----

def new_confusion(axes: tuple[str, ...]) -> dict[str, list[list[int]]]:
    return {
        axis: [[0] * aru_axes.levels_for(axis) for _ in range(aru_axes.levels_for(axis))]
        for axis in axes
    }


def merge_confusion(left: dict[str, list[list[int]]], right: dict[str, list[list[int]]]):
    for axis, matrix in right.items():
        for y_true, row in enumerate(matrix):
            for y_pred, count in enumerate(row):
                left[axis][y_true][y_pred] += count
    return left


def batch_confusion(outputs, targets, axes: tuple[str, ...]) -> dict[str, list[list[int]]]:
    out = new_confusion(axes)
    for axis in axes:
        pred = outputs[axis].argmax(dim=1).detach().cpu().tolist()
        actual = targets[axis].detach().cpu().tolist()
        for y_true, y_pred in zip(actual, pred):
            if y_true == IGNORE_INDEX:
                continue
            out[axis][int(y_true)][int(y_pred)] += 1
    return out


# The three ordinal scorers live in ml/ordinal_metrics.py: this module imports torch
# at module scope, which would put the arithmetic behind the promotion gate out of
# reach of ml/selftest.py. Same reason promotion_check moved to ml/subgroups.py.
quadratic_weighted_kappa = ordinal_metrics.quadratic_weighted_kappa
pearson_from_confusion = ordinal_metrics.pearson_from_confusion
metrics_from_confusion = ordinal_metrics.metrics_from_confusion


def expected_level(logits: torch.Tensor) -> torch.Tensor:
    """Softmax expectation over ordinal levels: a continuous severity estimate."""
    probs = torch.softmax(logits, dim=1)
    levels = torch.arange(logits.shape[1], device=logits.device, dtype=probs.dtype)
    return (probs * levels).sum(dim=1)


def masked_loss(outputs, targets, axes: tuple[str, ...], aux_heads: tuple[str, ...], kind: str, aux_weight: float):
    """Cross-entropy over labeled cells only, optionally with an ordinal penalty.

    Plain CE scores a level-0 sample predicted as level 2 exactly as harshly as one
    predicted as level 1, which is wrong for an ordered scale. The ordinal term adds
    the distance between the expected level and the truth.
    """
    ce = nn.CrossEntropyLoss(ignore_index=IGNORE_INDEX)
    total = None
    counted = 0
    for axis in axes:
        target = targets[axis]
        if (target != IGNORE_INDEX).sum() == 0:
            continue
        loss = ce(outputs[axis], target)
        if kind == "ordinal":
            mask = target != IGNORE_INDEX
            if mask.any():
                exp = expected_level(outputs[axis][mask])
                loss = loss + (exp - target[mask].to(exp.dtype)).abs().mean()
        total = loss if total is None else total + loss
        counted += 1
    if total is None:
        # Every axis masked out in this batch: return a zero that still carries grad.
        any_axis = axes[0]
        return outputs[any_axis].sum() * 0.0
    total = total / counted

    for head in aux_heads:
        key = f"aux_{head}"
        target = targets.get(key)
        if target is None or (target != IGNORE_INDEX).sum() == 0:
            continue
        total = total + aux_weight * ce(outputs[key], target)
    return total


def run_epoch(model, loader, optimizer, device, axes, aux_heads, loss_kind, aux_weight):
    training = optimizer is not None
    model.train(training)
    total_loss = 0.0
    confusion = new_confusion(axes)
    batches = 0
    per_cell: dict[str, dict[str, list[list[int]]]] = {}

    for images, targets in loader:
        images = images.to(device)
        targets = {key: value.to(device) for key, value in targets.items()}
        with torch.set_grad_enabled(training):
            outputs = model(images)
            loss = masked_loss(outputs, targets, axes, aux_heads, loss_kind, aux_weight)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        confusion = merge_confusion(confusion, batch_confusion(outputs, targets, axes))
        total_loss += float(loss.item())
        batches += 1

    return total_loss / max(1, batches), confusion, per_cell


#: Subgroup dimensions a model is scored on. Tone and age are also scored on their own,
#: because ARU collects tone for every scan but age only in consented pilot sessions —
#: scoring the joint cell alone would leave every model permanently unevaluated.
SUBGROUP_DIMENSIONS = {
    "tone": lambda meta: subgroups.resolve_tone_band(meta),
    "age": lambda meta: subgroups.resolve_age_band(meta),
    "tone_x_age": lambda meta: subgroups.subgroup_key(meta),
}


def check_declared_dimensions() -> list[str]:
    """Refuse to run if the manifest promises a subgroup dimension nobody implements.

    The manifest is the published contract, so a dimension listed there that the
    trainer cannot compute would be a gate the app advertises and no run applies.
    A name is only ever selected from the table above; the manifest cannot invent one.
    """
    declared = model_contract.declared_dimensions()
    unknown = [name for name in declared if name not in SUBGROUP_DIMENSIONS]
    if unknown:
        raise SystemExit(
            f"Model manifest declares subgroup dimension(s) this trainer cannot compute: "
            f"{', '.join(unknown)}. Implement them in SUBGROUP_DIMENSIONS or correct "
            f"{model_contract.MANIFEST_PATH}."
        )
    return declared or list(SUBGROUP_DIMENSIONS)


def _aggregate(confusion_by_group: dict) -> dict:
    out = {}
    for group, confusion in confusion_by_group.items():
        per_axis = metrics_from_confusion(confusion)
        n = sum(values["n"] for values in per_axis.values())
        out[group] = {
            "n": n,
            "accuracy": (
                sum(values["accuracy"] * values["n"] for values in per_axis.values()) / n if n else 0.0
            ),
            "ordinal_mae": (
                sum(values["ordinal_mae"] * values["n"] for values in per_axis.values()) / n if n else 0.0
            ),
            "qwk": (
                sum(values["qwk"] * values["n"] for values in per_axis.values()) / n if n else 0.0
            ),
            "perAxis": per_axis,
        }
    return out


@torch.no_grad()
def evaluate_by_cell(model, rows: list[Row], transform, device, axes, aux_heads, batch_size: int):
    """Per-dimension subgroup confusion plus the expected-level sums used for calibration."""
    model.eval()
    confusion: dict[str, dict[str, dict]] = {
        dimension: defaultdict(lambda: new_confusion(axes)) for dimension in SUBGROUP_DIMENSIONS
    }
    tone_stats: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0]))

    for start in range(0, len(rows), batch_size):
        chunk = rows[start:start + batch_size]
        images = torch.stack([transform(Image.open(row.image).convert("RGB")) for row in chunk]).to(device)
        outputs = model(images)
        keys = [
            {dimension: fn(row.meta) for dimension, fn in SUBGROUP_DIMENSIONS.items()}
            for row in chunk
        ]
        for axis in axes:
            logits = outputs[axis]
            preds = logits.argmax(dim=1).cpu().tolist()
            exps = expected_level(logits).cpu().tolist()
            for row, key, pred, exp in zip(chunk, keys, preds, exps):
                truth = row.labels.get(axis)
                if truth is None:
                    continue
                for dimension, group in key.items():
                    confusion[dimension][group][axis][int(truth)][int(pred)] += 1
                bucket = tone_stats[key["tone"]][axis]
                bucket[0] += float(truth)
                bucket[1] += float(exp)
                bucket[2] += 1

    metrics = {dimension: _aggregate(dict(groups)) for dimension, groups in confusion.items()}
    return metrics, tone_stats


def fit_tone_calibration(tone_stats, axes: tuple[str, ...], min_n: int) -> dict:
    """Per-tone-band additive offsets on the expected level.

    Redness is read against a local baseline that shifts with melanin, so a head
    trained on a light-skinned majority tends to under-read redness on darker skin.
    The offset is the mean residual on validation. Bands with too little data get
    0.0 and are marked uncalibrated rather than fitted on noise.
    """
    calibration = {"minSamplesPerBand": min_n, "bands": {}}
    for tone in subgroups.TONE_BAND_ORDER:
        entry = {"axes": {}, "calibrated": False}
        stats = tone_stats.get(tone, {})
        for axis in axes:
            truth_sum, exp_sum, count = stats.get(axis, [0.0, 0.0, 0])
            if count >= min_n:
                entry["axes"][axis] = {
                    "offset": round((truth_sum - exp_sum) / count, 4),
                    "n": count,
                }
                entry["calibrated"] = True
            else:
                entry["axes"][axis] = {"offset": 0.0, "n": count, "note": "insufficient samples"}
        calibration["bands"][tone] = entry
    return calibration


# ------------------------------------------------------------------ split ----

def split_rows(rows: list[Row], seed: int, n_folds: int, val_fold: int) -> tuple[list[Row], list[Row], dict]:
    """Group-safe, subgroup-stratified split with an honest description of itself."""
    meta_rows = [dict(row.meta) for row in rows]
    groups = {subgroups.group_key(meta) for meta in meta_rows}
    cov = subgroups.coverage(meta_rows)

    if len(groups) >= n_folds:
        assignment = subgroups.stratified_group_folds(meta_rows, n_folds=n_folds)
        fold = val_fold % n_folds
        train_rows = [row for row, f in zip(rows, assignment) if f != fold]
        val_rows = [row for row, f in zip(rows, assignment) if f == fold]
        if train_rows and val_rows:
            return train_rows, val_rows, {
                "strategy": "stratified_group_folds",
                "folds": n_folds,
                "val_fold": fold,
                "group_count": len(groups),
                "subgroup_cells": len(cov.cells),
                "warnings": subgroups.coverage_warnings(cov),
            }

    rng = random.Random(seed)
    shuffled = list(rows)
    rng.shuffle(shuffled)
    cut = max(1, round(len(shuffled) * 0.2))
    return shuffled[cut:], shuffled[:cut], {
        "strategy": "random_row_split",
        "group_count": len(groups),
        "warning": (
            "fewer distinct people than folds; validation may leak person identity and "
            "per-subgroup numbers are not trustworthy"
        ),
        "warnings": subgroups.coverage_warnings(cov),
    }


# ------------------------------------------------------------------ output ---

def export_onnx(model: nn.Module, out_path: Path, device: torch.device, axes: tuple[str, ...]) -> None:
    model.eval()
    dummy = torch.randn(1, 3, 224, 224, device=device)
    ordered = tuple(axes)

    class Wrapper(nn.Module):
        def __init__(self, inner, names):
            super().__init__()
            self.inner = inner
            self.names = names

        def forward(self, x):
            out = self.inner(x)
            return tuple(out[name] for name in self.names)

    torch.onnx.export(
        Wrapper(model, ordered),
        dummy,
        out_path,
        input_names=["image"],
        output_names=list(ordered),
        opset_version=17,
        dynamic_axes={"image": {0: "batch"}, **{name: {0: "batch"} for name in ordered}},
    )


def write_split(path: Path, rows: list[Row], axes: tuple[str, ...]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        meta_keys = sorted({key for row in rows for key in row.meta.keys()})
        fieldnames = ["id", "image", *axes, "subgroup_cell", *meta_keys]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "id": row.row_id,
                "image": row.image_rel,
                **{axis: "" if row.labels.get(axis) is None else row.labels[axis] for axis in axes},
                "subgroup_cell": row.cell,
                **row.meta,
            })


def jsonable(value):
    """Make argparse values JSON-safe. --manifest is a LIST of Paths, so a flat
    isinstance check on the value misses them and metrics.json fails to write at the
    very end of a run, after all the training work is already spent."""
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def label_distribution(rows: list[Row], axes: tuple[str, ...]) -> dict[str, dict[str, int]]:
    dist = {
        axis: {str(level): 0 for level in range(aru_axes.levels_for(axis))} | {"unlabeled": 0}
        for axis in axes
    }
    for row in rows:
        for axis in axes:
            value = row.labels.get(axis)
            dist[axis]["unlabeled" if value is None else str(value)] += 1
    return dist


# promotion_check lives in ml/subgroups.py: this module imports torch at module
# scope, which kept the repo's highest-consequence rule out of reach of
# ml/selftest.py. Re-exported here so the call site and any existing caller are
# unchanged.
promotion_check = subgroups.promotion_check


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("ml/data/crops"))
    parser.add_argument(
        "--manifest",
        type=Path,
        nargs="*",
        help="one or more manifests to concatenate (default <data>/manifest.csv). "
             "Several external datasets can pretrain together; unlabeled axes are masked per row.",
    )
    parser.add_argument(
        "--init-from",
        type=Path,
        help="start from an earlier stage's .pt checkpoint. Its source lineage is inherited "
             "and re-checked against --purpose, because weights are a derivative work.",
    )
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--arch", choices=["mobilenetv3_small", "efficientnet_b0"], default="mobilenetv3_small")
    parser.add_argument(
        "--weights",
        choices=["imagenet", "none"],
        default="imagenet",
        help="backbone init; 'none' trains from scratch for offline or reproducibility runs",
    )
    parser.add_argument(
        "--axes",
        nargs="*",
        default=list(ATTRS),
        help=f"axes to train; default {','.join(ATTRS)}. Known camera axes: {','.join(aru_axes.CAMERA_AXES)}",
    )
    parser.add_argument("--aux-heads", nargs="*", default=[], choices=sorted(AUX_HEADS), help="auxiliary subgroup heads")
    parser.add_argument("--aux-weight", type=float, default=0.2)
    parser.add_argument("--loss", choices=["ce", "ordinal"], default="ordinal")
    parser.add_argument("--purpose", default="research_pretrain", choices=sorted(licensing.PURPOSES))
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--val-fold", type=int, default=0)
    # Defaults come from the shipped model manifest, so the bar training enforces is
    # the same one the app advertises. Passing these explicitly overrides it for an
    # experiment, and the value used is recorded in metrics.json either way.
    parser.add_argument(
        "--min-cell",
        type=int,
        default=model_contract.min_samples_per_band(),
        help="samples needed before a subgroup cell is evaluated (default from the model manifest)",
    )
    parser.add_argument(
        "--max-subgroup-gap",
        type=float,
        default=model_contract.max_accuracy_gap(),
        help="worst-group accuracy may trail the mean by at most this (default from the model manifest)",
    )
    parser.add_argument(
        "--min-qwk",
        type=float,
        default=model_contract.min_qwk(),
        help="per-axis quadratic weighted kappa floor (default from the model manifest)",
    )
    parser.add_argument(
        "--min-pearson",
        type=float,
        default=model_contract.min_pearson(),
        help="per-axis true/predicted correlation floor (default from the model manifest)",
    )
    parser.add_argument(
        "--min-qwk-gain",
        type=float,
        default=model_contract.min_qwk_gain_over_heuristic(),
        help=(
            "how far the model's qwk must exceed the shipped ROI heuristic's, per axis "
            "(default from the model manifest; 0.0 means strictly greater)"
        ),
    )
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--export-onnx", action="store_true")
    parser.add_argument("--out-dir", type=Path, default=Path("ml/artifacts"))
    args = parser.parse_args()

    axes = aru_axes.resolve_axes(args.axes)
    aux_heads = tuple(args.aux_heads)
    declared_dimensions = check_declared_dimensions()
    pretrained = None

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    manifests = [Path(m) for m in (args.manifest or [args.data / "manifest.csv"])]
    rows: list[Row] = []
    per_manifest = {}
    for manifest in manifests:
        image_root = image_root_for(manifest, args.data)
        loaded = load_rows(image_root, manifest, axes, aux_heads)
        per_manifest[str(manifest)] = {"rows": len(loaded), "imageRoot": str(image_root)}
        rows.extend(loaded)
    if len(rows) < args.min_samples:
        raise SystemExit(
            f"Need at least ~{args.min_samples} labeled samples to start; "
            f"{len(manifests)} manifest(s) gave {len(rows)}."
        )

    pretrained = None
    if args.init_from:
        if not args.init_from.exists():
            raise SystemExit(f"--init-from checkpoint not found: {args.init_from}")
        # Peek at the lineage before building the model so the licence check runs first.
        peek = torch.load(args.init_from, map_location="cpu", weights_only=False)
        inherited_lineage = peek.get("lineage") or {"stages": []}
        del peek
    else:
        inherited_lineage = {"stages": []}

    licence_report = enforce_source_licences(rows, args.purpose, inherited_lineage)
    if args.export_onnx and not licensing.PURPOSES[args.purpose]:
        print(
            f"NOTE: --purpose {args.purpose} is a non-shipping purpose. The exported ONNX is a "
            "research artifact and must not be promoted into the app.",
            file=sys.stderr,
        )

    train_rows, val_rows, split_info = split_rows(rows, args.seed, args.folds, args.val_fold)
    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.08, contrast=0.08, saturation=0.06),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MultiHeadNet(
        args.arch, axes=axes, aux_heads=aux_heads, pretrained=args.weights == "imagenet"
    ).to(device)
    if args.init_from:
        pretrained = load_pretrained(args.init_from, model, device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    train_loader = DataLoader(
        CropDataset(train_rows, train_tf, axes, aux_heads),
        batch_size=args.batch_size, shuffle=True, num_workers=2,
    )
    val_loader = DataLoader(
        CropDataset(val_rows, val_tf, axes, aux_heads),
        batch_size=args.batch_size, shuffle=False, num_workers=2,
    )

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    write_split(out_dir / "split_train.csv", train_rows, axes)
    write_split(out_dir / "split_val.csv", val_rows, axes)

    # Lineage chains this run onto whatever the starting weights carried, so the next
    # stage inherits the full history rather than just this stage's sources.
    run_lineage = {
        "stages": list(inherited_lineage.get("stages", []))
        + [{
            "purpose": args.purpose,
            "sources": sorted({row.source for row in rows}),
            "axes": list(axes),
            "manifests": {name: info["rows"] for name, info in per_manifest.items()},
        }]
    }

    best = -1.0
    best_path = out_dir / f"visible_attr_{args.arch}.pt"
    history = []
    best_epoch = None
    last_val_confusion = new_confusion(axes)

    for epoch in range(1, args.epochs + 1):
        train_loss, train_confusion, _ = run_epoch(
            model, train_loader, optimizer, device, axes, aux_heads, args.loss, args.aux_weight
        )
        val_loss, val_confusion, _ = run_epoch(
            model, val_loader, None, device, axes, aux_heads, args.loss, args.aux_weight
        )
        val_metrics = metrics_from_confusion(val_confusion)
        labeled = sum(values["n"] for values in val_metrics.values())
        mean_val = (
            sum(values["accuracy"] * values["n"] for values in val_metrics.values()) / labeled
            if labeled else 0.0
        )
        last_val_confusion = val_confusion
        history.append({
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "train_metrics": metrics_from_confusion(train_confusion),
            "val_metrics": val_metrics,
            "val_mean_accuracy": mean_val,
        })
        per_axis = " ".join(f"{axis}={val_metrics[axis]['accuracy']:.3f}" for axis in axes)
        print(f"epoch={epoch:02d} train_loss={train_loss:.4f} val_loss={val_loss:.4f} {per_axis}")
        if mean_val > best:
            best = mean_val
            best_epoch = epoch
            torch.save(
                {"model": model.state_dict(), "axes": axes, "aux_heads": aux_heads,
                 "args": {k: str(v) for k, v in vars(args).items()}, "epoch": epoch,
                 "lineage": run_lineage},
                best_path,
            )

    print(f"best checkpoint: {best_path} mean_val_acc={best:.3f}")

    if best_path.exists():
        checkpoint = torch.load(best_path, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint["model"])
    subgroup_metrics, tone_stats = evaluate_by_cell(
        model, val_rows, val_tf, device, axes, aux_heads, args.batch_size
    )
    calibration = fit_tone_calibration(tone_stats, axes, args.min_cell)
    # Score the checkpoint that is actually being promoted, not whatever the last epoch
    # happened to produce. `model` carries the best checkpoint's weights by this point
    # (reloaded above), but last_val_confusion is the FINAL epoch's — so every number
    # the gate judges would belong to weights nobody was going to ship. One extra
    # validation pass is cheap next to being wrong about which model was judged.
    _, promoted_val_confusion, _ = run_epoch(
        model, val_loader, None, device, axes, aux_heads, args.loss, args.aux_weight
    )
    final_val_metrics = metrics_from_confusion(promoted_val_confusion)
    # The rule the model wants to replace, scored on the SAME validation rows through
    # the SAME confusion-matrix code. A baseline on a different split, or from a second
    # implementation, would not be a baseline.
    baseline_metrics = heuristic_baseline.score(
        val_rows, axes, {axis: aru_axes.levels_for(axis) for axis in axes}
    )
    gate = promotion_check(
        final_val_metrics, subgroup_metrics, axes, args.min_cell, args.max_subgroup_gap,
        args.min_qwk, args.min_pearson,
        baseline=baseline_metrics,
        min_qwk_gain=args.min_qwk_gain,
        baseline_axes=heuristic_baseline.covered_axes(),
    )

    calibration_path = out_dir / "tone_calibration.json"
    calibration_path.write_text(
        json.dumps({"axes": list(axes), **calibration}, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    artifacts = {
        "checkpoint": {"path": str(best_path), "sha256": sha256(best_path)} if best_path.exists() else None,
        "arch": args.arch,
        "onnx": None,
        "calibration": {"path": str(calibration_path), "sha256": sha256(calibration_path)},
    }
    if args.export_onnx:
        onnx_path = out_dir / f"visible_attr_{args.arch}.onnx"
        export_onnx(model, onnx_path, device, axes)
        artifacts["onnx"] = {"path": str(onnx_path), "sha256": sha256(onnx_path), "outputs": list(axes)}
        print(f"onnx: {onnx_path}")

    cov = subgroups.coverage([dict(row.meta) for row in rows])
    metrics = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "args": {key: jsonable(value) for key, value in vars(args).items()},
        "axes": list(axes),
        "aux_heads": list(aux_heads),
        "device": str(device),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "n_total": len(rows),
        "n_train": len(train_rows),
        "n_val": len(val_rows),
        "licence": licence_report,
        "promotion_gate_source": model_contract.source(),
        "promotion_gate_dimensions": declared_dimensions,
        "manifests": per_manifest,
        "init_from": pretrained,
        "lineage": run_lineage,
        "label_distribution": {
            "all": label_distribution(rows, axes),
            "train": label_distribution(train_rows, axes),
            "val": label_distribution(val_rows, axes),
        },
        "subgroup_coverage": cov.as_dict(),
        "subgroup_warnings": subgroups.coverage_warnings(cov, min_cell=args.min_cell),
        "subgroup_metrics": subgroup_metrics,
        "tone_calibration": calibration,
        "promotion_gate": gate,
        "split": split_info,
        "best_epoch": best_epoch,
        "best_mean_val_accuracy": best,
        # Both describe the PROMOTED checkpoint; the last epoch's is kept beside them
        # because that is what `history` reports, and the two are different things.
        "final_val_confusion": promoted_val_confusion,
        "final_val_scored": "best_checkpoint",
        "last_epoch_val_confusion": last_val_confusion,
        "final_val_metrics": final_val_metrics,
        "heuristic_baseline": {"spec": heuristic_baseline.describe(), "metrics": baseline_metrics},
        "history": history,
        "artifacts": artifacts,
    }
    metrics_path = out_dir / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"metrics: {metrics_path}")
    if gate["promotable"]:
        print("promotion gate: PASS")
    else:
        print("promotion gate: BLOCKED")
        for reason in gate["blockers"]:
            print(f"  - {reason}")


if __name__ == "__main__":
    main()
