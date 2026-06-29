#!/usr/bin/env python3
"""
Decode opt-in crop JSONL exported from the app into image files + manifest.csv.

Input rows are exported by /scan when the user opts into local training-crop
storage. Each row contains a JPEG data URL, ordinal labels, heuristic features,
and feedback source.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageStat


def parse_data_url(value: str) -> bytes:
    if "," not in value:
        raise ValueError("expected data URL")
    return base64.b64decode(value.split(",", 1)[1])


def srgb_to_linear(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab_l_b(r: float, g: float, b: float) -> tuple[float, float]:
    rl, gl, bl = srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)
    x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047
    y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl
    z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fy = f(y)
    l = 116 * fy - 16
    b_lab = 200 * (fy - f(z))
    return l, b_lab


def ita_from_image(path: Path) -> float:
    img = Image.open(path).convert("RGB").resize((64, 64))
    r, g, b = ImageStat.Stat(img).mean
    l, b_lab = rgb_to_lab_l_b(r, g, b)
    return math.degrees(math.atan2(l - 50, b_lab if abs(b_lab) > 1e-6 else 1e-6))


def read_jsonl(path: Path) -> Iterable[dict]:
    with path.open(encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--out", type=Path, default=Path("ml/data/crops"))
    args = parser.parse_args()

    images_dir = args.out / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.csv"

    rows = []
    for idx, row in enumerate(read_jsonl(args.jsonl)):
        image_id = row.get("id") or f"crop_{idx:06d}"
        image_path = images_dir / f"{image_id}.jpg"
        image_path.write_bytes(parse_data_url(row["image"]))
        labels = row["labels"]
        features = row.get("features", {})
        rows.append({
            "image": str(image_path.relative_to(args.out)),
            "oil": labels["oil"],
            "redness": labels["redness"],
            "pores": labels["pores"],
            "source": row.get("source", "unknown"),
            "ts": row.get("ts", ""),
            "ita": f"{ita_from_image(image_path):.3f}",
            "shine": features.get("shine", ""),
            "relRedness": features.get("relRedness", ""),
            "cov": features.get("cov", ""),
        })

    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else ["image", "oil", "redness", "pores"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} images")
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
