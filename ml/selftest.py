#!/usr/bin/env python3
"""Standard-library self-check for the ML support modules.

Why this exists: `npm run smoke` only byte-compiled the Python side, so every rule
these modules enforce — licence tiers, tone bands, fold leakage, spec validation —
was unverified. Two real defects had already shipped past py_compile: a tone lookup
that ignored the key the app actually writes, and a licence gate that read a feedback
provenance column as a dataset id and blocked ARU's own data.

Standard library only, no torch, so it runs anywhere `py_compile` does.

    python ml/selftest.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402
import calibrate  # noqa: E402
import external_manifest  # noqa: E402
import ita  # noqa: E402
import licensing  # noqa: E402
import model_contract  # noqa: E402
import subgroups  # noqa: E402


class AxisRegistry(unittest.TestCase):
    def test_only_camera_axes_are_trainable(self):
        self.assertEqual(aru_axes.resolve_axes(None), aru_axes.CAMERA_AXES)
        for axis_id in ("moisture", "sensitivity"):
            with self.assertRaises(ValueError, msg=f"{axis_id} must not be trainable"):
                aru_axes.resolve_axes([axis_id])

    def test_level_bounds_are_enforced(self):
        self.assertEqual(aru_axes.validate_level("oil", 2), 2)
        with self.assertRaises(ValueError):
            aru_axes.validate_level("oil", 3)  # oil is a 3-level axis
        with self.assertRaises(TypeError):
            aru_axes.validate_level("oil", True)

    def test_shipped_axes_are_a_subset_of_camera_axes(self):
        self.assertTrue(set(aru_axes.PRODUCT_AXES) <= set(aru_axes.CAMERA_AXES))


class ToneAndAge(unittest.TestCase):
    def test_ita_bands(self):
        cases = {60: "very_light", 50: "light", 35: "intermediate", 20: "tan", -40: "brown_dark"}
        for value, expected in cases.items():
            self.assertEqual(subgroups.tone_band_from_ita(value), expected, value)
        for junk in ("", None, "abc", float("nan")):
            self.assertEqual(subgroups.tone_band_from_ita(junk), subgroups.UNKNOWN)

    def test_resolves_the_key_the_app_actually_writes(self):
        # lib/skin.ts records the measurement as toneIta; run_pipeline.py carries it
        # through under that name. Missing it made every such row tone-unknown.
        self.assertEqual(subgroups.resolve_tone_band({"toneIta": "44.2"}), "light")
        self.assertEqual(subgroups.resolve_tone_band({"ita": "20"}), "tan")
        self.assertEqual(subgroups.resolve_tone_band({"fitzpatrick": "V"}), "brown_dark")
        self.assertEqual(subgroups.resolve_tone_band({"shine": "0.2"}), subgroups.UNKNOWN)

    def test_age_bands_and_under_13_exclusion(self):
        self.assertEqual(subgroups.age_band(27), "20s")
        self.assertEqual(subgroups.age_band("30대"), "30s")
        self.assertEqual(subgroups.age_band("60+"), "60plus")
        # No guardian-consent flow exists, so under-13 is excluded rather than bucketed.
        self.assertEqual(subgroups.age_band(9), subgroups.UNKNOWN)

    def test_ita_matches_the_browser_formula(self):
        lstar, _, bstar = ita.rgb_to_lab(200, 160, 140)
        self.assertAlmostEqual(lstar, 69.0, delta=0.5)
        self.assertGreater(ita.ita_from_lab(lstar, bstar), 41)  # light band


class Folds(unittest.TestCase):
    def _rows(self):
        return [
            {"participant_id": f"P{i // 4:03d}", "ita": 50 if i % 3 else 20, "age": 25 + i % 40}
            for i in range(40)
        ]

    def test_a_person_never_straddles_two_folds(self):
        rows = self._rows()
        folds = subgroups.stratified_group_folds(rows, 5)
        by_group: dict[str, set[int]] = {}
        for row, fold in zip(rows, folds):
            by_group.setdefault(subgroups.group_key(row), set()).add(fold)
        leaked = [group for group, used in by_group.items() if len(used) > 1]
        self.assertEqual(leaked, [], "a participant appeared in more than one fold")

    def test_every_fold_is_used(self):
        self.assertEqual(sorted(set(subgroups.stratified_group_folds(self._rows(), 5))), [0, 1, 2, 3, 4])

    def test_worst_group_skips_cells_too_small_to_judge(self):
        result = subgroups.worst_group(
            {
                "light/20s": {"n": 30, "accuracy": 0.8},
                "tan/30s": {"n": 25, "accuracy": 0.6},
                "light/40s": {"n": 3, "accuracy": 0.0},
            },
            "accuracy",
            min_n=20,
        )
        self.assertTrue(result["evaluated"])
        self.assertEqual(result["worstCell"], "tan/30s")
        self.assertIn("light/40s", result["skippedCells"])

    def test_no_evaluable_cell_is_not_a_pass(self):
        result = subgroups.worst_group({"light/20s": {"n": 2, "accuracy": 1.0}}, "accuracy", min_n=20)
        self.assertFalse(result["evaluated"])


class Calibration(unittest.TestCase):
    def test_thresholds_reproduce_the_reported_agreement(self):
        samples = [(0.1, 0), (0.2, 0), (0.5, 1), (0.6, 1), (0.9, 2), (0.95, 2)]
        accuracy, cuts = calibrate.best_thresholds(samples, 3)
        replayed = sum(1 for x, y in samples if calibrate.predict(x, cuts) == y) / len(samples)
        self.assertAlmostEqual(accuracy, replayed)
        self.assertEqual(accuracy, 1.0)
        self.assertEqual(cuts, sorted(cuts))

    def test_handles_an_axis_with_more_than_three_levels(self):
        # The grid search this replaced could only ever place two cuts.
        samples = [(0.1, 0), (0.3, 1), (0.5, 2), (0.7, 3)]
        accuracy, cuts = calibrate.best_thresholds(samples, 4)
        self.assertEqual(len(cuts), 3)
        self.assertEqual(accuracy, 1.0)

    def test_a_single_distinct_value_has_no_threshold(self):
        self.assertIsNone(calibrate.best_thresholds([(0.5, 0), (0.5, 1)], 3))
        self.assertIsNone(calibrate.best_thresholds([], 3))

    def test_every_calibratable_axis_is_a_real_axis(self):
        for axis_id in calibrate.FEATURE:
            self.assertTrue(aru_axes.axis(axis_id).trainable, axis_id)


class LicenceGate(unittest.TestCase):
    def test_first_party_rows_are_not_read_as_a_dataset_id(self):
        # `source` means feedback provenance in ARU's own export and a registry id in
        # an external one. Only the tier column distinguishes them.
        self.assertEqual(licensing.dataset_source_for_row({"source": "user"}), licensing.FIRST_PARTY_SOURCE)
        self.assertEqual(licensing.dataset_source_for_row({}), licensing.FIRST_PARTY_SOURCE)
        self.assertEqual(
            licensing.dataset_source_for_row({"source": "acne04", "license_tier": "academic_only"}),
            "acne04",
        )

    def test_non_commercial_sources_cannot_ship(self):
        for source in ("acne04", "fitzpatrick17k"):
            self.assertFalse(licensing.check(source, "product_training").allowed, source)
            self.assertTrue(licensing.check(source, "eval_audit").allowed, source)

    def test_first_party_may_ship(self):
        self.assertTrue(licensing.check(licensing.FIRST_PARTY_SOURCE, "product_training").allowed)

    def test_unregistered_sources_are_refused(self):
        self.assertFalse(licensing.check("some-dataset-nobody-registered", "camera_qa").allowed)

    def test_unknown_purpose_is_an_error(self):
        with self.assertRaises(licensing.LicenseError):
            licensing.check("acne04", "world_domination")

    def test_every_registry_entry_resolves_to_a_known_tier(self):
        for row in licensing.audit()["sources"]:
            self.assertIn(row["tier"], licensing.TIERS, row["id"])


class ModelContract(unittest.TestCase):
    def test_the_shipped_manifest_supplies_the_gate(self):
        self.assertEqual(model_contract.source(), str(model_contract.MANIFEST_PATH))
        self.assertGreater(model_contract.min_samples_per_band(), 0)
        self.assertGreater(model_contract.max_accuracy_gap(), 0)

    def test_manifest_axes_match_the_registry(self):
        declared = set(model_contract.declared_axes())
        self.assertEqual(declared, set(aru_axes.CAMERA_AXES))
        for axis_id, spec in model_contract.declared_axes().items():
            self.assertEqual(spec["levels"], aru_axes.levels_for(axis_id), axis_id)

    def test_declared_dimensions_are_all_implemented(self):
        # Imported here so the check runs without torch present.
        implemented = {"tone", "age", "tone_x_age"}
        self.assertTrue(set(model_contract.declared_dimensions()) <= implemented)


class WeightLineage(unittest.TestCase):
    """Fine-tuning on clean data must not launder a non-commercial pretrain."""

    TAINTED = {"stages": [
        {"purpose": "research_pretrain", "sources": ["acne04", "aihub_korean_skin"]},
        {"purpose": "product_training", "sources": [licensing.FIRST_PARTY_SOURCE]},
    ]}

    def test_inherited_sources_are_collected_in_order(self):
        self.assertEqual(
            licensing.lineage_sources(self.TAINTED),
            ["acne04", "aihub_korean_skin", licensing.FIRST_PARTY_SOURCE],
        )
        self.assertEqual(licensing.lineage_sources(None), [])
        self.assertEqual(licensing.lineage_sources({"stages": []}), [])

    def test_a_tainted_pretrain_blocks_shipping_however_clean_the_finetune(self):
        blocked = [d for d in licensing.check_lineage(self.TAINTED, "product_training") if not d.allowed]
        self.assertEqual(sorted(d.source_id for d in blocked), ["acne04", "aihub_korean_skin"])

    def test_the_same_lineage_is_fine_for_research(self):
        decisions = licensing.check_lineage(self.TAINTED, "research_pretrain")
        self.assertTrue(all(d.allowed for d in decisions))

    def test_first_party_only_lineage_may_ship(self):
        clean = {"stages": [{"purpose": "product_training", "sources": [licensing.FIRST_PARTY_SOURCE]}]}
        self.assertTrue(all(d.allowed for d in licensing.check_lineage(clean, "product_training")))

    def test_strictest_tier_wins(self):
        self.assertEqual(licensing.strictest_tier(["commercial_ok", "non_commercial"]), "non_commercial")
        self.assertEqual(licensing.strictest_tier(["commercial_ok"]), "commercial_ok")
        self.assertEqual(licensing.strictest_tier(["nonsense"]), "unknown")
        self.assertEqual(licensing.strictest_tier([]), "unknown")


class AdapterSpecs(unittest.TestCase):
    def _write_spec(self, spec: dict) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(spec, handle)
        handle.close()
        return Path(handle.name)

    def test_shipped_specs_parse_and_map_known_axes(self):
        for path in sorted(external_manifest.SPEC_DIR.glob("*.json")):
            spec = json.loads(path.read_text(encoding="utf-8"))
            for axis_id, rule in (spec.get("axes") or {}).items():
                if not isinstance(rule, dict):
                    continue
                axis = aru_axes.axis(axis_id)
                self.assertTrue(axis.trainable, f"{path.name} maps non-trainable {axis_id}")
                if "bins" in rule:
                    self.assertEqual(len(rule["bins"]), axis.levels - 1, f"{path.name}:{axis_id}")
                if "map" in rule:
                    for value in rule["map"].values():
                        self.assertTrue(0 <= value < axis.levels, f"{path.name}:{axis_id} -> {value}")

    def test_a_mis_sized_bin_list_is_rejected_at_load(self):
        spec = self._write_spec({
            "source": "aru_opt_in_camera_panel",
            "index": {"path": "labels.csv", "format": "csv"},
            "axes": {"oil": {"from": "x", "bins": [1, 2, 3]}},  # oil has 3 levels -> 2 edges
        })
        with self.assertRaises(external_manifest.SpecError):
            external_manifest.build(Path("/nonexistent"), json.loads(spec.read_text()), "research_pretrain")

    def test_an_out_of_range_map_is_rejected_at_load(self):
        spec = self._write_spec({
            "source": "aru_opt_in_camera_panel",
            "index": {"path": "labels.csv", "format": "csv"},
            "axes": {"oil": {"from": "x", "map": {"a": 0, "b": 7}}},
        })
        with self.assertRaises(external_manifest.SpecError):
            external_manifest.build(Path("/nonexistent"), json.loads(spec.read_text()), "research_pretrain")

    def test_a_blocked_licence_stops_the_build_before_reading_data(self):
        spec = {"source": "acne04", "index": {"path": "labels.csv", "format": "csv"}, "axes": {}}
        with self.assertRaises(licensing.LicenseError):
            external_manifest.build(Path("/nonexistent"), spec, "product_training")


if __name__ == "__main__":
    unittest.main(verbosity=2)
