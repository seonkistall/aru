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
import skin_indices  # noqa: E402
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
        # One non-shipping source anywhere in the chain is enough. Asserting the exact
        # set would tie this test to whichever tier the registry currently carries;
        # what must hold is that acne04 (academic_only) blocks and the first-party
        # fine-tune does not launder it.
        self.assertIn("acne04", [d.source_id for d in blocked])
        self.assertNotIn(licensing.FIRST_PARTY_SOURCE, [d.source_id for d in blocked])

    def test_a_commercial_ok_pretrain_does_not_block_shipping(self):
        # The path the runbook describes: pretrain on a commercially licensed source,
        # fine-tune on ARU's own crops, ship the result.
        lineage = {"stages": [
            {"purpose": "shipping_pretrain", "sources": ["aihub_korean_skin"]},
            {"purpose": "product_training", "sources": [licensing.FIRST_PARTY_SOURCE]},
        ]}
        decisions = licensing.check_lineage(lineage, "product_training")
        tier = licensing.check("aihub_korean_skin", "product_training").tier
        if tier == "commercial_ok":
            self.assertTrue(all(d.allowed for d in decisions))
        else:
            # The tier rests on an owner attestation and may be revoked; if it is,
            # the chain must close again rather than keep shipping.
            self.assertFalse(all(d.allowed for d in decisions))

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


class SkinIndices(unittest.TestCase):
    """The claim these indices rest on: a device or illuminant change moves absolute
    numbers and leaves within-image comparisons alone. If that fails, nothing built on
    top of it transfers between phones."""

    @staticmethod
    def _lab_under_gain(lstar, astar, bstar, gain):
        """Crude stand-in for a different sensor or a warmer room: everything in the
        frame scales together, which is exactly what makes a relative index survive."""
        return lstar * gain, astar * gain, bstar * gain

    def test_relative_redness_survives_a_device_change_up_to_scale(self):
        cheek_a, forehead_a = 18.0, 12.0
        plain = skin_indices.relative_redness(cheek_a, forehead_a)
        for gain in (0.6, 0.85, 1.4):
            _, cheek_g, _ = self._lab_under_gain(60, cheek_a, 20, gain)
            _, fore_g, _ = self._lab_under_gain(60, forehead_a, 20, gain)
            # The sign and the ordering are what the product reads, and they hold.
            self.assertGreater(skin_indices.relative_redness(cheek_g, fore_g), 0)
            self.assertAlmostEqual(
                skin_indices.relative_redness(cheek_g, fore_g) / gain, plain, places=6
            )

    def test_absolute_indices_do_not_survive_it(self):
        # The same face through a device that renders 15% darker: both absolute indices
        # move, which is why neither may carry a user-facing reading on its own.
        lstar, _, bstar = self._lab_under_gain(60.0, 12.0, 20.0, 0.85)
        self.assertNotAlmostEqual(skin_indices.ita(60.0, 20.0), skin_indices.ita(lstar, bstar), places=1)
        self.assertNotAlmostEqual(
            skin_indices.melanin_index(60.0), skin_indices.melanin_index(lstar), places=2
        )

    def test_tone_evenness_ignores_how_light_the_face_is(self):
        even_dark = skin_indices.tone_evenness([40.0, 40.0, 40.0, 40.0])
        even_light = skin_indices.tone_evenness([70.0, 70.0, 70.0, 70.0])
        uneven = skin_indices.tone_evenness([40.0, 55.0, 48.0, 62.0])
        self.assertEqual(even_dark, even_light)
        self.assertGreater(uneven, even_light)

    def test_tone_evenness_is_a_ratio_so_exposure_cancels(self):
        # The reason it is divided by the mean: a plain standard deviation of L*
        # grows when the frame gets brighter, which would read as a less even face.
        regions = [62.0, 66.0, 59.0, 71.0]
        brighter = [value * 1.15 for value in regions]
        self.assertAlmostEqual(skin_indices.tone_evenness(regions), skin_indices.tone_evenness(brighter))

    def test_every_index_declares_the_feature_key_the_app_writes(self):
        # An index with no feature key is one the pipeline cannot find in an export.
        for index in skin_indices.INDICES:
            self.assertIn(index.id, skin_indices.FEATURE_KEY)
        for key in skin_indices.NEW_FEATURE_KEYS:
            self.assertNotIn(key, ("shine", "relRedness", "cov"))

    def test_shine_and_roughness_are_ratios_so_exposure_cancels(self):
        self.assertAlmostEqual(skin_indices.shine_ratio(0.30, 0.10), 3.0)
        self.assertAlmostEqual(skin_indices.shine_ratio(0.30 * 1.7, 0.10 * 1.7), 3.0)
        self.assertAlmostEqual(skin_indices.roughness_ratio(0.8 * 0.4, 0.2 * 0.4), 4.0)

    def test_blemish_density_is_normalised_by_face_size(self):
        near = skin_indices.blemish_density(12, 4_000_000)
        far = skin_indices.blemish_density(3, 1_000_000)
        self.assertAlmostEqual(near, far)

    def test_coarse_bands_merge_the_pairs_that_disagree_across_devices(self):
        self.assertEqual(skin_indices.coarse_tone_band(60), "light")
        self.assertEqual(skin_indices.coarse_tone_band(45), "light")
        self.assertEqual(skin_indices.coarse_tone_band(35), "medium")
        self.assertEqual(skin_indices.coarse_tone_band(15), "medium")
        self.assertEqual(skin_indices.coarse_tone_band(0), "deep")
        self.assertEqual(skin_indices.coarse_tone_band(-45), "deep")

    def test_only_within_image_indices_may_ship_alone(self):
        for index_id in ("melanin_index", "ita"):
            self.assertEqual(skin_indices.transfer_class(index_id), skin_indices.ABSOLUTE)
            self.assertNotIn(index_id, skin_indices.shippable_indices())
        self.assertIn("relative_redness", skin_indices.shippable_indices())

    def test_subgroup_bands_are_the_del_bino_cutpoints_with_the_last_two_merged(self):
        # subgroups.py reports five bands, not the canonical six: it merges Brown and
        # Dark into brown_dark. Its cutpoints must still be a subset of Del Bino's, or
        # the stratifier and the published convention stop describing the same thing.
        paper = set(skin_indices.ITA_BIN_EDGES)
        ours = {bound for _, bound in subgroups.ITA_BANDS if bound != float("-inf")}
        self.assertTrue(ours <= paper, f"{ours - paper} are not Del Bino cutpoints")
        self.assertEqual(paper - ours, {-30.0}, "only the Brown/Dark split should be merged")


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


class PromotionGate(unittest.TestCase):
    """The gate that decides whether a model may replace the heuristic.

    It used to live in train_visible_attributes.py, which imports torch at module
    scope, so none of this could be reached from here.
    """

    #: Three axes at 100 samples each, comfortably accurate AND genuinely ordinal.
    #: qwk/pearson are carried here because the gate fails closed on a missing metric.
    OVERALL = {
        axis: {"accuracy": 0.90, "n": 100, "qwk": 0.72, "pearson": 0.75}
        for axis in ("oil", "redness", "pores")
    }

    def check(self, by_dimension, min_cell=20, max_gap=0.1, overall=None,
              min_qwk=0.4, min_pearson=0.4):
        return subgroups.promotion_check(
            overall if overall is not None else self.OVERALL,
            by_dimension,
            ("oil", "redness", "pores"),
            min_cell,
            max_gap,
            min_qwk=min_qwk,
            min_pearson=min_pearson,
        )

    #: One healthy subgroup map, so a test about ordinal quality is not also
    #: accidentally testing the gap rule.
    GOOD_DIMS = {"tone": {
        "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
        "tan": {"accuracy": 0.88, "ordinal_mae": 0.1, "n": 40},
    }}

    def test_an_evaluable_dimension_within_the_gap_passes(self):
        gate = self.check({"tone": {
            "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
            "tan": {"accuracy": 0.86, "ordinal_mae": 0.1, "n": 40},
        }})
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertTrue(gate["dimensions"]["tone"]["evaluated"])

    def test_a_subgroup_gap_blocks(self):
        gate = self.check({"tone": {
            "light": {"accuracy": 0.95, "ordinal_mae": 0.1, "n": 40},
            "brown_dark": {"accuracy": 0.60, "ordinal_mae": 0.4, "n": 40},
        }})
        self.assertFalse(gate["promotable"])
        self.assertIn("brown_dark", " ".join(gate["blockers"]))

    def test_an_unevaluated_joint_cell_blocks_rather_than_passing_silently(self):
        """The hole this class exists for.

        tone_x_age is declared by public/models/visible-attributes/manifest.json, and
        on consumer scans every joint cell is "<tone>/unknown", which worst_group
        excludes by design. The old branch named only "tone" and "age", so this
        dimension appended no blocker and the run reported promotable: True with a
        declared fairness dimension never actually checked.
        """
        gate = self.check({
            "tone": {
                "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
                "tan": {"accuracy": 0.88, "ordinal_mae": 0.1, "n": 40},
            },
            "tone_x_age": {
                "light/unknown": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 400},
                "tan/unknown": {"accuracy": 0.88, "ordinal_mae": 0.1, "n": 400},
            },
        })
        self.assertFalse(gate["dimensions"]["tone_x_age"]["evaluated"])
        self.assertFalse(gate["promotable"], "an unevaluated declared dimension must block")
        self.assertIn("tone_x_age", " ".join(gate["blockers"]))

    def test_a_dimension_nobody_named_still_blocks_when_unevaluated(self):
        """No literal-name branch: a dimension added later must block too."""
        gate = self.check({"device": {"pixel/unknown": {"accuracy": 0.9, "ordinal_mae": 0.1, "n": 9}}})
        self.assertFalse(gate["promotable"])
        self.assertIn("device", " ".join(gate["blockers"]))

    def test_every_manifest_dimension_blocks_when_it_cannot_be_evaluated(self):
        """Walk the dimensions the shipped manifest actually declares."""
        declared = model_contract.promotion_gate().get("dimensions") or []
        self.assertTrue(declared, "manifest declares no subgroup dimensions")
        for dimension in declared:
            with self.subTest(dimension=dimension):
                gate = self.check({dimension: {"a/unknown": {"accuracy": 0.9, "ordinal_mae": 0.1, "n": 5}}})
                self.assertFalse(gate["promotable"])
                self.assertFalse(gate["dimensions"][dimension]["evaluated"])

    def test_a_majority_class_predictor_is_not_promotable(self):
        """The case accuracy and the subgroup gap both wave through.

        These six numbers are what the repo's own metrics_from_confusion returns for
        a head that always predicts level 0 on a skewed 80/15/5 ordinal scale. It is
        not merely that the gap test misses it — a constant predictor is equally
        wrong in every cell, so it has almost NO gap, which makes the old gate
        easiest to pass for a model that learned nothing.
        """
        degenerate = {axis: {
            "n": 100, "accuracy": 0.80, "macro_f1": 0.2963, "ordinal_mae": 0.25,
            "within_one_grade": 0.95, "qwk": 0.0, "pearson": 0.0,
        } for axis in ("oil", "redness", "pores")}

        # It clears accuracy and it clears the gap.
        gap_only = self.check(self.GOOD_DIMS, overall=degenerate, min_qwk=0.0, min_pearson=0.0)
        self.assertTrue(gap_only["promotable"], "precondition: the gap rule alone lets this through")

        # The manifest's floors stop it.
        gate = self.check(self.GOOD_DIMS, overall=degenerate)
        self.assertFalse(gate["promotable"])
        self.assertIn("qwk", " ".join(gate["blockers"]))
        self.assertIn("pearson", " ".join(gate["blockers"]))

    def test_a_missing_metric_blocks_rather_than_passing(self):
        """Fails closed: "not measured" must never look like "fine"."""
        for missing in ("qwk", "pearson"):
            with self.subTest(missing=missing):
                overall = {axis: {k: v for k, v in self.OVERALL[axis].items() if k != missing}
                           for axis in self.OVERALL}
                gate = self.check(self.GOOD_DIMS, overall=overall)
                self.assertFalse(gate["promotable"])
                self.assertIn(f"{missing} is missing", " ".join(gate["blockers"]))
                self.assertFalse(gate["ordinalQuality"]["oil"]["evaluated"])

    def test_a_nan_or_infinite_metric_blocks(self):
        """Every comparison against NaN is False, so `value < floor` alone waves it through."""
        for bad in (float("nan"), float("inf"), float("-inf")):
            for metric in ("qwk", "pearson"):
                with self.subTest(bad=bad, metric=metric):
                    overall = {axis: dict(self.OVERALL[axis]) for axis in self.OVERALL}
                    overall["oil"][metric] = bad
                    gate = self.check(self.GOOD_DIMS, overall=overall)
                    self.assertFalse(gate["promotable"])
                    self.assertIn("not a usable number", " ".join(gate["blockers"]))
                    self.assertFalse(gate["ordinalQuality"]["oil"]["evaluated"])

    def test_an_axis_with_no_validation_samples_blocks(self):
        overall = dict(self.OVERALL)
        overall["pores"] = {"accuracy": 0.0, "n": 0, "qwk": 0.0, "pearson": 0.0}
        gate = self.check(self.GOOD_DIMS, overall=overall)
        self.assertFalse(gate["promotable"])
        self.assertIn("[pores] no labelled validation samples", " ".join(gate["blockers"]))

    def test_one_weak_axis_blocks_even_when_the_others_are_strong(self):
        """The floor is per axis, so a strong mean cannot hide a dead head."""
        overall = dict(self.OVERALL)
        overall["redness"] = {"accuracy": 0.90, "n": 100, "qwk": 0.31, "pearson": 0.80}
        gate = self.check(self.GOOD_DIMS, overall=overall)
        self.assertFalse(gate["promotable"])
        blockers = " ".join(gate["blockers"])
        self.assertIn("[redness] qwk 0.310", blockers)
        self.assertNotIn("[oil] qwk", blockers)

    def test_a_genuinely_ordinal_model_still_passes(self):
        gate = self.check(self.GOOD_DIMS)
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertTrue(gate["ordinalQuality"]["oil"]["evaluated"])
        self.assertEqual(gate["minQwk"], 0.4)
        self.assertEqual(gate["minPearson"], 0.4)

    def test_every_malformed_axis_blocks_instead_of_crashing(self):
        """The docstring promises these BLOCK. They used to raise.

        promotion_check computed meanAccuracy straight off overall[axis]["accuracy"]
        before the ordinal check ran, so a missing axis, n or accuracy raised KeyError
        and an entry of None raised TypeError. A crash is fail-closed in effect, but it
        throws away the whole run's report and it is not what the function documents.
        """
        good = {"n": 100, "accuracy": 0.90, "qwk": 0.72, "pearson": 0.75}
        cases = {
            "axis absent from overall": ({"oil": good}, ("oil", "redness")),
            "entry is not a dict": ({"oil": None}, ("oil",)),
            "n missing": ({"oil": {k: v for k, v in good.items() if k != "n"}}, ("oil",)),
            "accuracy missing": ({"oil": {k: v for k, v in good.items() if k != "accuracy"}}, ("oil",)),
            "accuracy is NaN": ({"oil": dict(good, accuracy=float("nan"))}, ("oil",)),
            "accuracy is a bool": ({"oil": dict(good, accuracy=True)}, ("oil",)),
        }
        for name, (overall, axes) in cases.items():
            with self.subTest(case=name):
                gate = subgroups.promotion_check(
                    overall, self.GOOD_DIMS, axes, 20, 0.1, min_qwk=0.4, min_pearson=0.4
                )
                self.assertFalse(gate["promotable"], name)

    def test_accuracy_missing_does_not_quietly_lower_the_mean(self):
        """Reading the mean through .get must not turn a hole into a free pass.

        Defaulting a missing accuracy to 0.0 would drag meanAccuracy down, which makes
        the gap test EASIER — the opposite of failing closed.
        """
        overall = {axis: dict(self.OVERALL[axis]) for axis in self.OVERALL}
        del overall["oil"]["accuracy"]
        gate = self.check(self.GOOD_DIMS, overall=overall)
        self.assertFalse(gate["promotable"])
        self.assertIn("[oil] accuracy is missing", " ".join(gate["blockers"]))

    def test_every_ordinal_quality_entry_has_the_same_keys(self):
        """With zero consented crops the unevaluated shape is what ships first."""
        healthy = self.check(self.GOOD_DIMS)["ordinalQuality"]["oil"]
        empty = subgroups.promotion_check(
            {"oil": {"n": 0, "accuracy": 0.0, "qwk": 0.0, "pearson": 0.0}},
            self.GOOD_DIMS, ("oil",), 20, 0.1, min_qwk=0.4, min_pearson=0.4,
        )["ordinalQuality"]["oil"]
        self.assertEqual(sorted(healthy), sorted(empty))
        for shape in (healthy, empty):
            self.assertEqual(shape["minQwk"], 0.4)
            self.assertEqual(shape["minPearson"], 0.4)

    def test_the_gate_cannot_be_called_without_the_floors(self):
        """A default would let a forgetful caller silently disable the whole rule."""
        with self.assertRaises(TypeError):
            subgroups.promotion_check(self.OVERALL, self.GOOD_DIMS, ("oil",), 20, 0.1)

    def test_the_floors_come_from_the_shipped_manifest(self):
        """A floor the trainer invents is a floor the app never promised."""
        gate = model_contract.promotion_gate()
        self.assertGreater(gate["minQwk"], 0.0)
        self.assertGreater(gate["minPearson"], 0.0)
        self.assertEqual(model_contract.min_qwk(), float(gate["minQwk"]))
        self.assertEqual(model_contract.min_pearson(), float(gate["minPearson"]))
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertIn("model_contract.min_qwk()", trainer)
        self.assertIn("model_contract.min_pearson()", trainer)

    def test_the_trainer_does_not_keep_a_second_copy_of_the_gate(self):
        """Two copies would drift, and only one of them is reachable from here."""
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertNotIn("def promotion_check(", trainer)
        self.assertIn("promotion_check = subgroups.promotion_check", trainer)



if __name__ == "__main__":
    unittest.main(verbosity=2)
