#!/usr/bin/env python3
"""License gate for every dataset that touches an ARU model.

The failure this prevents
-------------------------
Almost every public facial-skin dataset is CC BY-NC, "academic use only", or gated
behind an application. Training shippable weights on those is a licence breach that
surfaces years later, in diligence or a takedown, long after the model is in the app.
So the gate is mechanical: a dataset may only be used for a purpose its tier permits,
and a dataset with no explicit tier is treated as the most restrictive one rather than
waved through.

Weights are derivative works
----------------------------
A non-commercial licence blocks pretraining whose weights ship inside ARU, not just
the final fine-tune. The purposes below therefore split on whether the artifact ships,
not on which training stage it belongs to.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent

REGISTRY_PATH = ML_DIR / "external_datasets.json"
CANDIDATES_PATH = ML_DIR / "source_candidates.json"
PRIVATE_PATH = ML_DIR / "private_sources.json"  # gitignored contract manifest

#: What the data is used for, and whether the resulting artifact reaches a user.
PURPOSES: dict[str, bool] = {
    "product_training": True,     # weights that ship in the app
    "shipping_pretrain": True,    # pretraining whose weights ship after fine-tuning
    "research_pretrain": False,   # experiments that never leave the lab
    "eval_audit": False,          # fairness audit, subgroup stress test, benchmarking
    "camera_qa": False,           # capture/quality engineering, no label supervision
}

#: Licence tiers, ordered permissive to restrictive.
TIERS: dict[str, tuple[str, ...]] = {
    "commercial_ok": tuple(PURPOSES),
    "contract_required": tuple(PURPOSES),  # additionally requires a private contract entry
    "non_commercial": ("research_pretrain", "eval_audit", "camera_qa"),
    "academic_only": ("research_pretrain", "eval_audit", "camera_qa"),
    "gated_application": ("research_pretrain", "eval_audit", "camera_qa"),
    "unknown": ("camera_qa",),
}

#: Tiers that only clear a shipping purpose once a signed contract says so.
CONTRACT_TIERS = {"contract_required"}


@dataclass
class Decision:
    source_id: str
    purpose: str
    tier: str
    allowed: bool
    reason: str
    evidence: str = ""

    def as_dict(self) -> dict:
        return {
            "sourceId": self.source_id,
            "purpose": self.purpose,
            "tier": self.tier,
            "allowed": self.allowed,
            "reason": self.reason,
            "evidence": self.evidence,
        }


class LicenseError(RuntimeError):
    """Raised when a dataset is used for a purpose its licence does not permit."""


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise LicenseError(f"cannot read licence registry {path}: {exc}") from exc


def _normalize_tier(entry: dict) -> str:
    """Prefer the explicit tier; otherwise map the older free-text fields conservatively."""
    explicit = str(entry.get("licenseTier") or "").strip()
    if explicit in TIERS:
        return explicit

    commercial = str(entry.get("commercialTraining") or entry.get("commercial_training") or "").strip().lower()
    mapping = {
        "yes": "commercial_ok",
        "allowed": "commercial_ok",
        "allowed_with_user_consent_and_retention_policy": "commercial_ok",
        "contract_required": "contract_required",
        "code_mit_dataset_separate": "unknown",
        "code_mit_dataset_terms_separate": "unknown",
        "code_apache_2_runtime_ok_check_model_terms": "unknown",
        "license_review_required": "unknown",
        "eula_required": "gated_application",
        "not_without_author_permission": "academic_only",
        "prohibited_without_author_permission": "non_commercial",
        "no": "non_commercial",
    }
    if commercial in mapping:
        return mapping[commercial]

    text = " ".join(
        str(entry.get(key) or "") for key in ("license", "access", "policy", "risks")
    ).lower()
    if "cc by-nc" in text or "non-commercial" in text or "noncommercial" in text:
        return "non_commercial"
    if "academic use" in text:
        return "academic_only"
    if "eula" in text or "credentialed" in text or "application" in text:
        return "gated_application"
    return "unknown"


def load_registry() -> dict[str, dict]:
    """Merge the dataset registry and the source-candidate registry by id."""
    merged: dict[str, dict] = {}
    for entry in _load_json(REGISTRY_PATH).get("datasets", []):
        source_id = str(entry.get("id") or "").strip()
        if source_id:
            merged[source_id] = dict(entry)
    for entry in _load_json(CANDIDATES_PATH).get("prioritySources", []):
        source_id = str(entry.get("id") or "").strip()
        if not source_id:
            continue
        merged.setdefault(source_id, {}).update(
            {key: value for key, value in entry.items() if key not in merged.get(source_id, {})}
        )
    return merged


def _contract_allows(source_id: str, purpose: str) -> tuple[bool, str]:
    private = _load_json(PRIVATE_PATH)
    for entry in private.get("sources", []) if isinstance(private, dict) else []:
        if str(entry.get("id") or "") != source_id:
            continue
        permitted = entry.get("permittedPurposes") or entry.get("allowedPurposes") or []
        if purpose in permitted:
            return True, f"private contract manifest lists {purpose}"
        return False, (
            f"private contract manifest for {source_id} does not list {purpose} "
            f"(lists: {', '.join(permitted) or 'nothing'})"
        )
    return False, (
        f"{source_id} needs a signed contract for {purpose}; add it to ml/private_sources.json "
        "(template: ml/private_sources.example.json)"
    )


def check(source_id: str, purpose: str) -> Decision:
    """Decide whether source_id may be used for purpose. Never raises on unknown sources."""
    if purpose not in PURPOSES:
        raise LicenseError(f"unknown purpose {purpose!r}. Known: {sorted(PURPOSES)}")

    registry = load_registry()
    entry = registry.get(source_id)
    if entry is None:
        return Decision(
            source_id, purpose, "unknown", False,
            f"{source_id} is not in ml/external_datasets.json. Register it with its licence before use.",
        )

    tier = _normalize_tier(entry)
    evidence = str(entry.get("license") or entry.get("access") or entry.get("url") or "")
    permitted = TIERS.get(tier, ())

    if purpose not in permitted:
        ships = " Shipping weights count as commercial use." if PURPOSES[purpose] else ""
        return Decision(
            source_id, purpose, tier, False,
            f"tier {tier!r} permits only {', '.join(permitted) or 'nothing'}.{ships}",
            evidence,
        )

    if tier in CONTRACT_TIERS and PURPOSES[purpose]:
        ok, reason = _contract_allows(source_id, purpose)
        return Decision(source_id, purpose, tier, ok, reason, evidence)

    return Decision(source_id, purpose, tier, True, f"tier {tier!r} permits {purpose}", evidence)


def enforce(source_ids: list[str], purpose: str) -> list[Decision]:
    """Check every source and raise on the first blocked one, listing all blockers."""
    decisions = [check(source_id, purpose) for source_id in source_ids]
    blocked = [d for d in decisions if not d.allowed]
    if blocked:
        lines = "\n".join(f"  - {d.source_id} [{d.tier}]: {d.reason}" for d in blocked)
        raise LicenseError(f"{len(blocked)} source(s) may not be used for {purpose}:\n{lines}")
    return decisions


def audit() -> dict:
    """Registry health: which entries still lack an explicit, reviewed tier."""
    registry = load_registry()
    rows = []
    for source_id, entry in sorted(registry.items()):
        tier = _normalize_tier(entry)
        rows.append({
            "id": source_id,
            "tier": tier,
            "explicit": bool(str(entry.get("licenseTier") or "").strip() in TIERS),
            "productTrainingAllowed": check(source_id, "product_training").allowed,
            "url": entry.get("url", ""),
        })
    return {
        "total": len(rows),
        "explicitTier": sum(1 for row in rows if row["explicit"]),
        "productTrainingAllowed": [row["id"] for row in rows if row["productTrainingAllowed"]],
        "sources": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="ARU dataset licence gate")
    parser.add_argument("--source", help="source id to check")
    parser.add_argument("--purpose", default="product_training", choices=sorted(PURPOSES))
    parser.add_argument("--audit", action="store_true", help="print registry licence audit")
    args = parser.parse_args()

    if args.audit or not args.source:
        print(json.dumps(audit(), ensure_ascii=False, indent=2))
        return
    print(json.dumps(check(args.source, args.purpose).as_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
