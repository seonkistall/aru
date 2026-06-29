#!/usr/bin/env python3
"""
Train a mobile-friendly multi-task skin attribute model.

Inputs:
  ml/data/crops/manifest.csv produced by prepare_crop_dataset.py

Targets:
  oil, redness, pores as 3-class ordinal labels. The model uses shared
  MobileNetV3-small features with one head per visible attribute.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import torch
from PIL import Image
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


ATTRS = ("oil", "redness", "pores")


@dataclass
class Row:
    image: Path
    image_rel: str
    row_id: str
    labels: dict[str, int]
    meta: dict[str, str]


class CropDataset(Dataset):
    def __init__(self, rows: list[Row], transform):
        self.rows = rows
        self.transform = transform

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        image = Image.open(row.image).convert("RGB")
        target = {attr: torch.tensor(row.labels[attr], dtype=torch.long) for attr in ATTRS}
        return self.transform(image), target


class MultiHeadMobileNet(nn.Module):
    def __init__(self):
        super().__init__()
        weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
        backbone = models.mobilenet_v3_small(weights=weights)
        in_features = backbone.classifier[0].in_features
        backbone.classifier = nn.Identity()
        self.features = backbone
        self.heads = nn.ModuleDict({attr: nn.Linear(in_features, 3) for attr in ATTRS})

    def forward(self, x):
        z = self.features(x)
        return {attr: head(z) for attr, head in self.heads.items()}


def load_rows(root: Path, manifest: Path) -> list[Row]:
    rows: list[Row] = []
    with manifest.open(encoding="utf-8-sig", newline="") as handle:
        for idx, rec in enumerate(csv.DictReader(handle)):
            image_rel = rec["image"]
            rows.append(Row(
                image=root / image_rel,
                image_rel=image_rel,
                row_id=rec.get("id") or Path(image_rel).stem or f"row_{idx:06d}",
                labels={attr: int(rec[attr]) for attr in ATTRS},
                meta={key: value for key, value in rec.items() if key not in {"image", *ATTRS}},
            ))
    return rows


def accuracy(outputs: dict[str, torch.Tensor], targets: dict[str, torch.Tensor]) -> dict[str, float]:
    return {
        attr: (outputs[attr].argmax(dim=1) == targets[attr]).float().mean().item()
        for attr in ATTRS
    }


def batch_confusion(outputs: dict[str, torch.Tensor], targets: dict[str, torch.Tensor]) -> dict[str, list[list[int]]]:
    out = {attr: [[0, 0, 0] for _ in range(3)] for attr in ATTRS}
    for attr in ATTRS:
        pred = outputs[attr].argmax(dim=1).detach().cpu().tolist()
        actual = targets[attr].detach().cpu().tolist()
        for y_true, y_pred in zip(actual, pred):
            out[attr][int(y_true)][int(y_pred)] += 1
    return out


def merge_confusion(left: dict[str, list[list[int]]], right: dict[str, list[list[int]]]) -> dict[str, list[list[int]]]:
    for attr in ATTRS:
        for y_true in range(3):
            for y_pred in range(3):
                left[attr][y_true][y_pred] += right[attr][y_true][y_pred]
    return left


def metrics_from_confusion(confusion: dict[str, list[list[int]]]) -> dict[str, dict[str, float]]:
    metrics: dict[str, dict[str, float]] = {}
    for attr, matrix in confusion.items():
        total = sum(sum(row) for row in matrix)
        correct = sum(matrix[i][i] for i in range(3))
        f1s = []
        ordinal_abs = 0
        for cls in range(3):
            tp = matrix[cls][cls]
            fp = sum(matrix[row][cls] for row in range(3) if row != cls)
            fn = sum(matrix[cls][col] for col in range(3) if col != cls)
            precision = tp / max(1, tp + fp)
            recall = tp / max(1, tp + fn)
            f1s.append(0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall))
        for y_true in range(3):
            for y_pred in range(3):
                ordinal_abs += abs(y_true - y_pred) * matrix[y_true][y_pred]
        metrics[attr] = {
            "accuracy": correct / max(1, total),
            "macro_f1": sum(f1s) / len(f1s),
            "ordinal_mae": ordinal_abs / max(1, total),
        }
    return metrics


def run_epoch(model, loader, optimizer, device: torch.device) -> tuple[float, dict[str, float], dict[str, list[list[int]]]]:
    training = optimizer is not None
    model.train(training)
    total_loss = 0.0
    total_acc = {attr: 0.0 for attr in ATTRS}
    confusion = {attr: [[0, 0, 0] for _ in range(3)] for attr in ATTRS}
    batches = 0
    loss_fn = nn.CrossEntropyLoss()

    for images, targets in loader:
        images = images.to(device)
        targets = {attr: value.to(device) for attr, value in targets.items()}
        with torch.set_grad_enabled(training):
            outputs = model(images)
            loss = sum(loss_fn(outputs[attr], targets[attr]) for attr in ATTRS) / len(ATTRS)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        acc = accuracy(outputs, targets)
        confusion = merge_confusion(confusion, batch_confusion(outputs, targets))
        total_loss += loss.item()
        for attr in ATTRS:
            total_acc[attr] += acc[attr]
        batches += 1

    return total_loss / max(1, batches), {attr: total_acc[attr] / max(1, batches) for attr in ATTRS}, confusion


def export_onnx(model: nn.Module, out_path: Path, device: torch.device) -> None:
    model.eval()
    dummy = torch.randn(1, 3, 224, 224, device=device)

    class Wrapper(nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, x):
            out = self.inner(x)
            return out["oil"], out["redness"], out["pores"]

    torch.onnx.export(
        Wrapper(model),
        dummy,
        out_path,
        input_names=["image"],
        output_names=["oil", "redness", "pores"],
        opset_version=17,
        dynamic_axes={"image": {0: "batch"}, "oil": {0: "batch"}, "redness": {0: "batch"}, "pores": {0: "batch"}},
    )


def write_split(path: Path, rows: list[Row]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["id", "image", *ATTRS]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "id": row.row_id,
                "image": row.image_rel,
                **row.labels,
            })


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def label_distribution(rows: list[Row]) -> dict[str, dict[str, int]]:
    dist = {attr: {str(label): 0 for label in range(3)} for attr in ATTRS}
    for row in rows:
        for attr in ATTRS:
            dist[attr][str(row.labels[attr])] += 1
    return dist


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("ml/data/crops"))
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--export-onnx", action="store_true")
    parser.add_argument("--out-dir", type=Path, default=Path("ml/artifacts"))
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    rows = load_rows(args.data, args.data / "manifest.csv")
    if len(rows) < 30:
        raise SystemExit("Need at least ~30 opt-in crop samples to start. Collect more scans first.")

    train_rows, val_rows = train_test_split(rows, test_size=0.2, random_state=args.seed)
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
    model = MultiHeadMobileNet().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    train_loader = DataLoader(CropDataset(train_rows, train_tf), batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(CropDataset(val_rows, val_tf), batch_size=args.batch_size, shuffle=False, num_workers=2)

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    write_split(out_dir / "split_train.csv", train_rows)
    write_split(out_dir / "split_val.csv", val_rows)

    best = -1.0
    best_path = out_dir / "visible_attr_mobilenetv3.pt"
    history = []
    best_epoch = None
    last_val_confusion = {attr: [[0, 0, 0] for _ in range(3)] for attr in ATTRS}

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc, train_confusion = run_epoch(model, train_loader, optimizer, device)
        val_loss, val_acc, val_confusion = run_epoch(model, val_loader, None, device)
        mean_val = sum(val_acc.values()) / len(ATTRS)
        last_val_confusion = val_confusion
        epoch_record = {
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "train_accuracy": train_acc,
            "val_accuracy": val_acc,
            "train_metrics": metrics_from_confusion(train_confusion),
            "val_metrics": metrics_from_confusion(val_confusion),
        }
        history.append(epoch_record)
        print(
            f"epoch={epoch:02d} train_loss={train_loss:.4f} val_loss={val_loss:.4f} "
            f"val_oil={val_acc['oil']:.3f} val_redness={val_acc['redness']:.3f} val_pores={val_acc['pores']:.3f}"
        )
        if mean_val > best:
            best = mean_val
            best_epoch = epoch
            torch.save({"model": model.state_dict(), "attrs": ATTRS, "args": vars(args), "epoch": epoch}, best_path)

    print(f"best checkpoint: {best_path} mean_val_acc={best:.3f}")
    artifacts = {
        "checkpoint": {"path": str(best_path), "sha256": sha256(best_path)} if best_path.exists() else None,
        "onnx": None,
    }
    if args.export_onnx:
        onnx_path = out_dir / "visible_attr_mobilenetv3.onnx"
        export_onnx(model, onnx_path, device)
        artifacts["onnx"] = {"path": str(onnx_path), "sha256": sha256(onnx_path)}
        print(f"onnx: {onnx_path}")

    metrics = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "args": vars(args),
        "device": str(device),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "n_total": len(rows),
        "n_train": len(train_rows),
        "n_val": len(val_rows),
        "label_distribution": {
            "all": label_distribution(rows),
            "train": label_distribution(train_rows),
            "val": label_distribution(val_rows),
        },
        "best_epoch": best_epoch,
        "best_mean_val_accuracy": best,
        "final_val_confusion": last_val_confusion,
        "final_val_metrics": metrics_from_confusion(last_val_confusion),
        "history": history,
        "artifacts": artifacts,
    }
    metrics_path = out_dir / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"metrics: {metrics_path}")


if __name__ == "__main__":
    main()
