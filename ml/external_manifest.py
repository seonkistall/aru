#!/usr/bin/env python3
"""Convert an external skin dataset into ARU's unified training manifest.

Why a spec engine instead of one adapter per dataset
----------------------------------------------------
Every candidate dataset is laid out differently, and the set of candidates changes
every time a licence clears or a new one is published. Hard-coding a parser per
dataset means new code, a new review and a new bug for each one. Instead each
dataset gets a declarative spec in ml/adapter_specs/*.json describing where the
index lives, which column carries which native label, and how native values map
onto ARU's ordinal levels. Adding a dataset is then a spec file, not a patch.

Three things this refuses to do
-------------------------------
1. Emit rows for a purpose the dataset's licence does not permit. The licence gate
   runs before a single row is read.
2. Invent a label. An axis the dataset does not annotate stays empty, and the
   trainer masks it per sample rather than guessing a middle value.
3. Silently drop samples. Every skip is counted and reported with its reason.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402
import ita as ita_module  # noqa: E402
import licensing  # noqa: E402
import subgroups  # noqa: E402

SPEC_DIR = Path(__file__).resolve().parent / "adapter_specs"

#: Fixed column order so downstream tools can rely on it.
BASE_COLUMNS = (
    "image", "id", "source", "license_tier", "purpose", "subject_id",
    "capture", "tone_band", "age_band", "ita", "ita_source", "fitzpatrick", "monk", "sex",
)
TAIL_COLUMNS = ("label_confidence", "ungradable", "notes")

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass
class BuildReport:
    source: str
    purpose: str
    rows: list[dict] = field(default_factory=list)
    skipped: Counter = field(default_factory=Counter)
    axis_counts: Counter = field(default_factory=Counter)

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "purpose": self.purpose,
            "rows": len(self.rows),
            "skipped": dict(self.skipped),
            "labeledPerAxis": dict(self.axis_counts),
        }


class SpecError(RuntimeError):
    pass


def load_spec(source: str, override: Path | None = None) -> dict:
    path = override or (SPEC_DIR / f"{source}.json")
    if not path.exists():
        available = ", ".join(sorted(p.stem for p in SPEC_DIR.glob("*.json"))) or "none"
        raise SpecError(f"no adapter spec at {path}. Available: {available}")
    with path.open(encoding="utf-8") as handle:
        spec = json.load(handle)
    if spec.get("source") != source and not override:
        raise SpecError(f"spec {path} declares source {spec.get('source')!r}, expected {source!r}")
    return spec


def _read_index(root: Path, spec: dict) -> list[dict]:
    """Enumerate raw records from whichever index layout the dataset ships."""
    index = spec.get("index") or {}
    mode = str(index.get("format") or "csv").lower()

    if mode in {"csv", "tsv"}:
        path = root / index["path"]
        if not path.exists():
            raise SpecError(f"index not found: {path}")
        delimiter = "\t" if mode == "tsv" else ","
        with path.open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle, delimiter=delimiter))

    if mode in {"space", "whitespace"}:
        path = root / index["path"]
        if not path.exists():
            raise SpecError(f"index not found: {path}")
        columns = index.get("columns") or []
        if not columns:
            raise SpecError("space-delimited index needs 'columns'")
        records = []
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                if not parts:
                    continue
                records.append({name: (parts[i] if i < len(parts) else "") for i, name in enumerate(columns)})
        return records

    if mode == "jsonl":
        path = root / index["path"]
        if not path.exists():
            raise SpecError(f"index not found: {path}")
        records = []
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records

    if mode == "json_dir":
        # One JSON annotation file per image, the common Korean public-data layout.
        anno_root = root / index.get("path", ".")
        if not anno_root.exists():
            raise SpecError(f"annotation directory not found: {anno_root}")
        records = []
        for path in sorted(anno_root.rglob("*.json")):
            with path.open(encoding="utf-8") as handle:
                payload = json.load(handle)
            flat = _flatten(payload)
            flat.setdefault("__anno_path", str(path.relative_to(root)))
            flat.setdefault("__anno_rel", str(path.relative_to(anno_root)))
            records.append(flat)
        return records

    if mode == "filename":
        image_root = root / (spec.get("images") or {}).get("root", ".")
        if not image_root.exists():
            raise SpecError(f"image directory not found: {image_root}")
        return [
            {"image": str(path.relative_to(image_root)), "__stem": path.stem}
            for path in sorted(image_root.rglob("*"))
            if path.suffix.lower() in IMAGE_SUFFIXES
        ]

    raise SpecError(f"unknown index format {mode!r}")


def _flatten(payload: object, prefix: str = "") -> dict:
    """Flatten nested annotation JSON to dotted keys so specs can address any field."""
    out: dict = {}
    if isinstance(payload, dict):
        for key, value in payload.items():
            out.update(_flatten(value, f"{prefix}{key}."))
    elif isinstance(payload, list):
        out[prefix.rstrip(".")] = json.dumps(payload, ensure_ascii=False)
        for idx, value in enumerate(payload[:8]):
            out.update(_flatten(value, f"{prefix}{idx}."))
    else:
        out[prefix.rstrip(".")] = payload
    return out


def _lookup(record: dict, key: object) -> object:
    if key in (None, ""):
        return ""
    if isinstance(key, list):
        for candidate in key:
            value = record.get(candidate)
            if value not in (None, ""):
                return value
        return ""
    return record.get(key, "")


def _lookup_contains(record: dict, needle: str, scope: str = "") -> object:
    """First flattened key containing `needle`, optionally within one block.

    Region-specific annotation keys are not spelled identically across a dataset
    (forehead_wrinkle, glabellus_wrinkle, perocular_wrinkle), so a spec addresses
    them by the part that is stable. `scope` restricts the search to one branch of
    the annotation JSON, which matters when the same word appears in two blocks —
    an expert grade under "annotations." and an instrument reading under "equipment."
    are different numbers on different scales.
    """
    for key in sorted(record):
        if scope and not key.startswith(scope):
            continue
        if needle in key and record[key] not in (None, ""):
            return record[key]
    return ""


def _apply_regex(value: str, pattern: str, group: int) -> str:
    match = re.search(pattern, str(value))
    if not match:
        return ""
    try:
        return match.group(group)
    except IndexError:
        return ""


def _map_axis_value(raw: object, rule: dict, axis_id: str) -> int | None:
    """Turn one native label into an ARU ordinal level, or None when unlabeled."""
    if raw in (None, ""):
        return None

    if "regex" in rule:
        raw = _apply_regex(str(raw), rule["regex"], int(rule.get("regex_group", 1)))
        if raw == "":
            return None

    if "map" in rule:
        table = {str(key).strip().lower(): value for key, value in rule["map"].items()}
        key = str(raw).strip().lower()
        if key not in table:
            return None
        return aru_axes.validate_level(axis_id, int(table[key]))

    if "bins" in rule:
        # Continuous instrument reading -> ordinal band. Edges are inclusive-upper.
        try:
            number = float(str(raw).strip())
        except (TypeError, ValueError):
            return None
        edges = [float(edge) for edge in rule["bins"]]
        level = 0
        for edge in edges:
            if number > edge:
                level += 1
        if rule.get("invert"):
            level = len(edges) - level
        return aru_axes.validate_level(axis_id, level)

    try:
        return aru_axes.validate_level(axis_id, int(float(str(raw).strip())))
    except (TypeError, ValueError):
        return None


def _resolve_image(root: Path, record: dict, spec: dict) -> Path | None:
    images = spec.get("images") or {}
    column = images.get("column", "image")
    value = str(_lookup(record, column) or "").strip()
    if images.get("from_annotation_path"):
        # The label tree and the image tree mirror each other in the Korean public-data
        # layout ({device}/{subject}/{stem}.json next to {device}/{subject}/{stem}.jpg),
        # so keep the directories and swap only the extension.
        anno_rel = str(record.get("__anno_rel") or record.get("__anno_path") or "")
        if anno_rel:
            mirrored = Path(anno_rel).with_suffix(images.get("suffix", ".jpg"))
            value = str(mirrored) if images.get("mirror_dirs", True) else mirrored.name
    if not value:
        return None
    if images.get("strip_prefix"):
        value = value.replace(images["strip_prefix"], "", 1)
    candidate = root / images.get("root", ".") / value
    if candidate.exists():
        return candidate
    if candidate.suffix.lower() not in IMAGE_SUFFIXES:
        for suffix in (".jpg", ".png", ".jpeg"):
            alt = candidate.with_suffix(suffix)
            if alt.exists():
                return alt
    return None


def build(root: Path, spec: dict, purpose: str, strict_images: bool = True, compute_ita: bool = False) -> BuildReport:
    source = spec["source"]
    decision = licensing.check(source, purpose)
    if not decision.allowed:
        raise licensing.LicenseError(
            f"{source} cannot be used for {purpose}: {decision.reason}\n"
            f"  licence evidence: {decision.evidence or 'none recorded'}"
        )

    report = BuildReport(source=source, purpose=purpose)
    axis_rules: dict = {
        axis_id: rule for axis_id, rule in (spec.get("axes") or {}).items() if isinstance(rule, dict)
    }
    for axis_id, rule in axis_rules.items():
        if not rule.get("from") and not rule.get("fromContains"):
            raise SpecError(f"axis {axis_id!r} needs either 'from' or 'fromContains'")
    for axis_id, rule in axis_rules.items():
        spec_axis = aru_axes.axis(axis_id)  # fail fast on a typo in the spec
        if not spec_axis.trainable:
            raise SpecError(
                f"spec maps {axis_id!r}, which has head={spec_axis.head!r} and gets no image head. "
                f"{spec_axis.notes}"
            )
        # Catch a mis-sized mapping here, at spec load, rather than on some row deep
        # into a long ingest run.
        if "bins" in rule and len(rule["bins"]) != spec_axis.levels - 1:
            raise SpecError(
                f"axis {axis_id!r} has {spec_axis.levels} levels and needs "
                f"{spec_axis.levels - 1} bin edges, spec gives {len(rule['bins'])}"
            )
        if "map" in rule:
            bad = sorted({
                str(value) for value in rule["map"].values()
                if not isinstance(value, int) or not 0 <= value < spec_axis.levels
            })
            if bad:
                raise SpecError(
                    f"axis {axis_id!r} map targets {', '.join(bad)} outside 0..{spec_axis.levels - 1}"
                )

    demographics = spec.get("demographics") or {}
    subject_spec = spec.get("subject") or {}
    records = _read_index(root, spec)

    for position, record in enumerate(records):
        image_path = _resolve_image(root, record, spec)
        if image_path is None:
            report.skipped["image_missing"] += 1
            if strict_images:
                continue
        labels: dict[str, int | None] = {}
        for axis_id, rule in axis_rules.items():
            raw = (
                _lookup_contains(record, rule["fromContains"], rule.get("scope", ""))
                if rule.get("fromContains")
                else _lookup(record, rule.get("from"))
            )
            level = _map_axis_value(raw, rule, axis_id)
            labels[axis_id] = level
            if level is not None:
                report.axis_counts[axis_id] += 1

        if not any(value is not None for value in labels.values()) and spec.get("require_label", True):
            report.skipped["no_axis_label"] += 1
            continue

        subject_rule = subject_spec.get("column")
        subject = str(
            (_lookup_contains(record, subject_rule["contains"], subject_rule.get("scope", ""))
             if isinstance(subject_rule, dict) and subject_rule.get("contains")
             else _lookup(record, subject_rule)) or ""
        ).strip()
        if not subject:
            fallback = subject_spec.get("fallback", "image_stem")
            if fallback == "image_stem" and image_path is not None:
                subject = image_path.stem
            elif fallback == "row_index":
                subject = f"{source}_{position:06d}"
            else:
                subject = f"{source}_{position:06d}"

        def demo_value(field: str) -> object:
            rule = demographics.get(field)
            if isinstance(rule, dict) and rule.get("contains"):
                return _lookup_contains(record, rule["contains"], rule.get("scope", ""))
            return _lookup(record, rule)

        demo = {
            "ita": demo_value("ita"),
            "fitzpatrick": demo_value("fitzpatrick"),
            "monk": demo_value("monk"),
            "sex": demo_value("sex"),
            "age": demo_value("age"),
        }
        if compute_ita and not str(demo["ita"] or "").strip() and image_path is not None:
            # Most external datasets ship no tone field at all. Measuring ITA off the
            # pixels is the only way they enter the subgroup report instead of landing
            # in an "unknown" bucket that hides coverage gaps.
            try:
                reading = ita_module.tone_from_image_path(image_path)
            except (OSError, ValueError, RuntimeError):
                reading = None
                report.skipped["ita_unreadable"] += 1
            if reading is not None:
                demo["ita"] = reading.ita

        tone_band = subgroups.resolve_tone_band(demo)
        age_value = subgroups.resolve_age_band({"age": demo["age"]})

        row = {
            "image": str(image_path.relative_to(root)) if image_path else "",
            "id": f"{source}:{subject}:{position:06d}",
            "source": source,
            "license_tier": decision.tier,
            "purpose": purpose,
            "subject_id": f"{source}:{subject}",
            "capture": spec.get("capture", "unknown"),
            "tone_band": tone_band,
            "age_band": age_value,
            "ita": demo["ita"],
            "ita_source": "measured_from_image" if compute_ita and demo["ita"] not in (None, "") else "dataset_field",
            "fitzpatrick": demo["fitzpatrick"],
            "monk": demo["monk"],
            "sex": demo["sex"],
            "label_confidence": spec.get("labelConfidence", "external"),
            "ungradable": "",
            "notes": spec.get("notes", ""),
        }
        for axis_id in aru_axes.CAMERA_AXES:
            row[axis_id] = "" if labels.get(axis_id) is None else int(labels[axis_id])
        report.rows.append(row)

    return report


def write_manifest(report: BuildReport, out_dir: Path, spec: dict, root: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.csv"
    columns = list(BASE_COLUMNS) + list(aru_axes.CAMERA_AXES) + list(TAIL_COLUMNS)
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in report.rows:
            writer.writerow({key: row.get(key, "") for key in columns})

    cov = subgroups.coverage(report.rows)
    provenance = {
        "schemaVersion": "2026-09-13.aru-external-manifest.v1",
        "specVerified": bool(spec.get("verified")),
        "verifyNote": spec.get("verifyNote", ""),
        "source": report.source,
        "purpose": report.purpose,
        "datasetRoot": str(root),
        "spec": {key: spec.get(key) for key in ("source", "name", "capture", "notes", "paper", "url")},
        "build": report.as_dict(),
        "subgroupCoverage": cov.as_dict(),
        "subgroupWarnings": subgroups.coverage_warnings(cov),
        "licence": licensing.check(report.source, report.purpose).as_dict(),
        "manifest": str(manifest_path),
    }
    with (out_dir / "provenance.json").open("w", encoding="utf-8") as handle:
        json.dump(provenance, handle, ensure_ascii=False, indent=2)
    return provenance


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an ARU manifest from an external dataset")
    parser.add_argument("--source", required=True, help="registry id, e.g. acne04")
    parser.add_argument("--root", required=True, type=Path, help="local dataset root (never committed)")
    parser.add_argument("--purpose", default="research_pretrain", choices=sorted(licensing.PURPOSES))
    parser.add_argument("--spec", type=Path, help="override spec path")
    parser.add_argument("--out", type=Path, default=Path("ml/data/external"))
    parser.add_argument("--keep-missing-images", action="store_true")
    parser.add_argument(
        "--compute-ita",
        action="store_true",
        help="measure ITA from each image when the dataset ships no tone field (needs pillow)",
    )
    args = parser.parse_args()

    spec = load_spec(args.source, args.spec)
    report = build(
        args.root, spec, args.purpose,
        strict_images=not args.keep_missing_images,
        compute_ita=args.compute_ita,
    )
    provenance = write_manifest(report, args.out / args.source, spec, args.root)
    print(json.dumps(provenance, ensure_ascii=False, indent=2))
    if not provenance["specVerified"]:
        print(
            f"WARNING: adapter spec for {args.source} is marked unverified. {provenance['verifyNote']}",
            file=sys.stderr,
        )
    for warning in provenance["subgroupWarnings"]:
        print(f"WARNING: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
