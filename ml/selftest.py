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
import math
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
import ordinal_metrics  # noqa: E402
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

    #: sRGB -> (L*, ITA, band), produced by ml/tools/verify_tone_ita.py and agreeing
    #: with scikit-image to 1.815e-02 and colour-science to 1.672e-02 degrees. The same
    #: six rows are pinned in tests/tone-ita-contract.test.ts against lib/skin.ts, so
    #: this is also what keeps the offline and browser tone readings on one scale.
    ITA_FIXTURES = (
        ((242, 223, 211), 90.0, 78.4, "very_light"),
        ((226, 195, 176), 80.9, 66.3, "very_light"),
        ((205, 168, 144), 71.6, 50.9, "light"),
        ((181, 139, 110), 61.1, 27.2, "tan"),
        ((140, 100, 74), 45.9, -11.0, "brown_dark"),
        ((86, 58, 42), 27.2, -56.8, "brown_dark"),
    )

    def test_ita_reproduces_the_reference_verified_fixture_table(self):
        for rgb, lstar, angle, band in self.ITA_FIXTURES:
            got_l, _, got_b = ita.rgb_to_lab(*rgb)
            got_ita = ita.ita_from_lab(got_l, got_b)
            self.assertAlmostEqual(round(got_l * 10) / 10, lstar, places=6, msg=str(rgb))
            self.assertAlmostEqual(round(got_ita * 10) / 10, angle, places=6, msg=str(rgb))
            self.assertEqual(subgroups.tone_band_from_ita(round(got_ita * 10) / 10), band, rgb)

    def test_ita_is_in_degrees(self):
        # atan() returns radians and the slip is silent: a radian value is still a
        # number, tone_band_from_ita still returns a band for it, and every sample
        # lands in that one band — a subgroup gate that never blocks looks exactly
        # like a model that is fair to everyone.
        angles = [ita.ita_from_lab(ita.rgb_to_lab(*rgb)[0], ita.rgb_to_lab(*rgb)[2]) for rgb, *_ in self.ITA_FIXTURES]
        self.assertGreater(max(abs(a) for a in angles), math.pi / 2)
        self.assertGreaterEqual(len({subgroups.tone_band_from_ita(a) for a in angles}), 3)
        radians = [math.radians(a) for a in angles]
        self.assertEqual(len({subgroups.tone_band_from_ita(r) for r in radians}), 1)


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

    def test_blemish_density_does_not_move_with_capture_resolution(self):
        """The defect the third argument exists for.

        The two (area, face width) pairs are what lib/skin.ts actually reported for
        ONE synthetic face rendered at 400x480 and at 1440x1728 — the sweep in
        docs/capture-resolution-invariance.md. Held at the same count, the density
        must not care which of the two frames it came from.

        The old signature took only the pixel area, so it did: the same face at 3.6x
        the capture width read 12.8x lower.
        """
        small = skin_indices.blemish_density(6, 42_032, 144.0)
        large = skin_indices.blemish_density(6, 537_804, 518.4)
        self.assertAlmostEqual(small, large, delta=0.02 * small)

        old_small = 6 / (42_032 / 1e6)
        old_large = 6 / (537_804 / 1e6)
        self.assertGreater(old_small / old_large, 10.0)

    def test_blemish_density_is_linear_in_the_count(self):
        one = skin_indices.blemish_density(1, 42_032, 144.0)
        four = skin_indices.blemish_density(4, 42_032, 144.0)
        self.assertAlmostEqual(four, 4 * one, places=9)

    def test_blemish_density_survives_a_degenerate_face_width(self):
        self.assertEqual(skin_indices.blemish_density(0, 0.0, 0.0), 0.0)

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

    #: Three axes at 100 samples each, all comfortably accurate AND carrying real
    #: ordinal signal. Both halves matter: the accuracy clears the subgroup bar, the
    #: qwk/pearson clear the ordinal floor, and a fixture missing either is blocked.
    OVERALL = {
        "oil": {"accuracy": 0.90, "n": 100, "qwk": 0.80, "pearson": 0.82},
        "redness": {"accuracy": 0.90, "n": 100, "qwk": 0.80, "pearson": 0.82},
        "pores": {"accuracy": 0.90, "n": 100, "qwk": 0.80, "pearson": 0.82},
    }

    def check(self, by_dimension, min_cell=20, max_gap=0.1, overall=None, min_qwk=0.4, min_pearson=0.4):
        return subgroups.promotion_check(
            overall if overall is not None else self.OVERALL,
            by_dimension,
            ("oil", "redness", "pores"),
            min_cell,
            max_gap,
            min_qwk,
            min_pearson,
        )

    #: A subgroup layout that passes on its own, so an ordinal blocker is the only
    #: thing a test using it can be failing on.
    CLEAN_TONE = {"tone": {
        "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
        "tan": {"accuracy": 0.86, "ordinal_mae": 0.1, "n": 40},
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

    def test_the_trainer_does_not_keep_a_second_copy_of_the_gate(self):
        """Two copies would drift, and only one of them is reachable from here."""
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertNotIn("def promotion_check(", trainer)
        self.assertIn("promotion_check = subgroups.promotion_check", trainer)

    def test_a_head_that_learned_nothing_is_blocked_even_with_no_subgroup_gap(self):
        """The gap says 'even-handed'. A constant predictor is perfectly even-handed.

        These are the metrics the repo's own metrics_from_confusion returns for a
        majority-class predictor on a skewed 3-level scale — accuracy 0.8,
        within-one-grade 0.95, qwk and pearson exactly 0.
        """
        constant = ordinal_metrics.metrics_from_confusion({
            axis: [[80, 0, 0], [15, 0, 0], [5, 0, 0]] for axis in ("oil", "redness", "pores")
        })
        self.assertAlmostEqual(constant["oil"]["accuracy"], 0.80)
        self.assertAlmostEqual(constant["oil"]["within_one_grade"], 0.95)
        gate = self.check(self.CLEAN_TONE, overall=constant)
        self.assertFalse(gate["promotable"], "a constant predictor must not be promotable")
        self.assertTrue(gate["dimensions"]["tone"]["evaluated"], "the subgroup half must still pass")
        self.assertIn("qwk", " ".join(gate["blockers"]))
        self.assertIn("pearson", " ".join(gate["blockers"]))

    def test_each_floor_blocks_on_its_own(self):
        for metric, failing in (("qwk", {"qwk": 0.39, "pearson": 0.82}), ("pearson", {"qwk": 0.80, "pearson": 0.39})):
            with self.subTest(metric=metric):
                overall = {axis: {"accuracy": 0.90, "n": 100, **failing} for axis in ("oil", "redness", "pores")}
                gate = self.check(self.CLEAN_TONE, overall=overall)
                self.assertFalse(gate["promotable"])
                self.assertIn(metric, " ".join(gate["blockers"]))

    def test_one_bad_axis_blocks_the_whole_model(self):
        overall = dict(self.OVERALL)
        overall["pores"] = {"accuracy": 0.90, "n": 100, "qwk": 0.05, "pearson": 0.06}
        gate = self.check(self.CLEAN_TONE, overall=overall)
        self.assertFalse(gate["promotable"])
        self.assertIn("pores", " ".join(gate["blockers"]))

    def test_an_unreported_ordinal_metric_blocks_rather_than_passing(self):
        """Same rule as an unevaluated subgroup: a bar nothing was measured against
        was not cleared."""
        overall = {axis: {"accuracy": 0.90, "n": 100} for axis in ("oil", "redness", "pores")}
        gate = self.check(self.CLEAN_TONE, overall=overall)
        self.assertFalse(gate["promotable"])
        self.assertIn("never checked", " ".join(gate["blockers"]))

    def test_the_shipped_manifest_declares_the_ordinal_floor(self):
        """The floor must come from the manifest, not from the fallback.

        Asserting the value alone proves nothing: FALLBACK_ORDINAL_GATE carries the
        same numbers, so deleting promotionGate.ordinal from the shipped manifest
        would leave this green while the app advertised no floor at all.
        """
        manifest = model_contract.load_manifest()
        declared = (manifest.get("promotionGate") or {}).get("ordinal") or {}
        self.assertIn("minQwk", declared, "the shipped manifest must declare the floor")
        self.assertIn("minPearson", declared)
        self.assertEqual(model_contract.min_qwk(), declared["minQwk"])
        self.assertEqual(model_contract.min_pearson(), declared["minPearson"])

    def test_the_manifest_beats_the_fallback_when_the_two_disagree(self):
        original = dict(model_contract.FALLBACK_ORDINAL_GATE)
        try:
            model_contract.FALLBACK_ORDINAL_GATE["minQwk"] = 0.99
            self.assertEqual(
                model_contract.min_qwk(),
                (model_contract.load_manifest()["promotionGate"]["ordinal"])["minQwk"],
                "a manifest value must override the built-in fallback",
            )
        finally:
            model_contract.FALLBACK_ORDINAL_GATE.clear()
            model_contract.FALLBACK_ORDINAL_GATE.update(original)

    def test_a_non_finite_score_blocks_rather_than_slipping_past_the_comparison(self):
        """`float("nan") < 0.4` is False, so NaN would otherwise clear the floor.

        And NaN is the likely value: the reference implementations this floor was
        verified against return it for the degenerate matrices where ARU's own
        scorers return 0.0.
        """
        for bad in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=bad):
                overall = {axis: {"accuracy": 0.90, "n": 100, "qwk": bad, "pearson": bad}
                           for axis in ("oil", "redness", "pores")}
                gate = self.check(self.CLEAN_TONE, overall=overall)
                self.assertFalse(gate["promotable"])
                self.assertIn("never checked", " ".join(gate["blockers"]))

    def test_evaluating_no_axis_at_all_blocks(self):
        gate = subgroups.promotion_check(self.OVERALL, self.CLEAN_TONE, (), 20, 0.1, 0.4, 0.4)
        self.assertFalse(gate["promotable"])

    def test_the_trainer_passes_the_manifest_floor_through_to_the_gate(self):
        """A floor the trainer never forwards is a floor in name only."""
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertIn("default=model_contract.min_qwk()", trainer)
        self.assertIn("default=model_contract.min_pearson()", trainer)
        self.assertIn("args.min_qwk, args.min_pearson", trainer)

    def test_the_ordinal_floor_falls_back_when_the_manifest_omits_it(self):
        original = model_contract.MANIFEST_PATH
        try:
            model_contract.MANIFEST_PATH = Path(tempfile.gettempdir()) / "aru-no-such-manifest.json"
            self.assertEqual(model_contract.min_qwk(), model_contract.FALLBACK_ORDINAL_GATE["minQwk"])
            self.assertEqual(model_contract.min_pearson(), model_contract.FALLBACK_ORDINAL_GATE["minPearson"])
        finally:
            model_contract.MANIFEST_PATH = original


class SubgroupSampleUnit(unittest.TestCase):
    """What the manifest's minSamplesPerBand is counted in.

    The number is published in public/models/visible-attributes/manifest.json and read
    in three places. aggregate_by_cell used to hand worst_group the SUM of the per-axis
    label counts, so one cell of 10 real samples labelled on the three default axes
    reported n=30 and cleared a floor of 20 — a subgroup a third the documented size
    evaluated as if it met it. These pin the unit, not the floor's value.
    """

    AXES = ("oil", "redness", "pores")

    @staticmethod
    def diagonal(n: int, levels: int = 3) -> list[list[int]]:
        """A perfect-prediction confusion matrix carrying exactly n samples."""
        matrix = [[0] * levels for _ in range(levels)]
        for i in range(n):
            matrix[i % levels][i % levels] += 1
        return matrix

    def cell(self, **per_axis_n: int) -> dict:
        return {axis: self.diagonal(count) for axis, count in per_axis_n.items()}

    def test_n_counts_labelled_samples_on_one_axis_not_the_sum_across_axes(self):
        """The reproduction from the backlog, run against the real aggregator."""
        agg = subgroups.aggregate_by_cell(
            {"light/30s": self.cell(oil=10, redness=10, pores=10)}
        )["light/30s"]
        self.assertEqual(agg["n"], 10, "10 real samples must not be reported as 30")
        self.assertEqual(agg["observations"], 30)
        self.assertEqual(agg["labelledAxes"], 3)

    def test_a_cell_of_ten_does_not_clear_the_manifest_floor(self):
        floor = model_contract.min_samples_per_band()
        self.assertGreater(floor, 10, "fixture assumes the shipped floor is above 10")
        agg = subgroups.aggregate_by_cell(
            {"light/30s": self.cell(oil=10, redness=10, pores=10)}
        )
        self.assertFalse(subgroups.worst_group(agg, "accuracy", min_n=floor)["evaluated"])
        enough = subgroups.aggregate_by_cell(
            {"light/30s": self.cell(oil=floor, redness=floor, pores=floor)}
        )
        evaluated = subgroups.worst_group(enough, "accuracy", min_n=floor)
        self.assertTrue(evaluated["evaluated"])
        self.assertEqual(evaluated["worstN"], floor)

    def test_the_thinnest_labelled_axis_decides(self):
        """The cell's accuracy is an average ACROSS axes, so the weakest one governs."""
        agg = subgroups.aggregate_by_cell(
            {"tan/40s": self.cell(oil=40, redness=30, pores=6)}
        )["tan/40s"]
        self.assertEqual(agg["n"], 6)
        self.assertEqual(agg["observations"], 76)

    def test_an_axis_with_no_label_in_the_cell_is_skipped_not_counted_as_zero(self):
        """Otherwise any axis the dataset does not label everywhere zeroes every cell."""
        agg = subgroups.aggregate_by_cell(
            {"light/20s": self.cell(oil=30, redness=30, pores=0)}
        )["light/20s"]
        self.assertEqual(agg["n"], 30)
        self.assertEqual(agg["labelledAxes"], 2)
        self.assertTrue(
            subgroups.worst_group({"light/20s": agg}, "accuracy", min_n=20)["evaluated"]
        )

    def test_a_cell_with_no_labels_at_all_reports_zero_and_is_unevaluable(self):
        agg = subgroups.aggregate_by_cell(
            {"light/20s": self.cell(oil=0, redness=0, pores=0)}
        )
        self.assertEqual(agg["light/20s"]["n"], 0)
        self.assertEqual(agg["light/20s"]["labelledAxes"], 0)
        self.assertFalse(subgroups.worst_group(agg, "accuracy", min_n=1)["evaluated"])

    def test_the_averages_still_weight_by_label_count_over_all_observations(self):
        """Changing the gating unit must not change the numbers being gated."""
        wrong_by_one = [[0, 5, 0], [0, 0, 0], [0, 0, 0]]
        agg = subgroups.aggregate_by_cell(
            {"light/20s": {"oil": self.diagonal(10), "redness": wrong_by_one}}
        )["light/20s"]
        self.assertEqual(agg["observations"], 15)
        self.assertEqual(agg["n"], 5)
        self.assertAlmostEqual(agg["accuracy"], (1.0 * 10 + 0.0 * 5) / 15, places=12)
        self.assertAlmostEqual(agg["ordinal_mae"], (0.0 * 10 + 1.0 * 5) / 15, places=12)

    def test_the_trainer_does_not_keep_a_second_copy_of_the_aggregator(self):
        """Same guard the ordinal scorers carry: one body, reachable from here."""
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertNotIn("def _aggregate(", trainer)
        self.assertIn("_aggregate = subgroups.aggregate_by_cell", trainer)


class OrdinalMetrics(unittest.TestCase):
    """The arithmetic the ordinal floor reads.

    Verified against sklearn.metrics.cohen_kappa_score(weights="quadratic") and
    scipy.stats.pearsonr on 2026-09-15 — see docs/ordinal-metric-verification.md.
    Those libraries are not dependencies of this repo, so the values that run
    reported are pinned here.
    """

    MAJORITY = [[80, 0, 0], [15, 0, 0], [5, 0, 0]]
    PERFECT = [[40, 0, 0], [0, 30, 0], [0, 0, 30]]
    INVERTED = [[0, 0, 40], [0, 30, 0], [30, 0, 0]]

    def test_a_constant_predictor_scores_zero(self):
        self.assertEqual(ordinal_metrics.quadratic_weighted_kappa(self.MAJORITY), 0.0)
        self.assertEqual(ordinal_metrics.pearson_from_confusion(self.MAJORITY), 0.0)

    def test_a_perfect_predictor_scores_one(self):
        self.assertAlmostEqual(ordinal_metrics.quadratic_weighted_kappa(self.PERFECT), 1.0)
        self.assertAlmostEqual(ordinal_metrics.pearson_from_confusion(self.PERFECT), 1.0)

    def test_worse_than_chance_goes_negative(self):
        """A floor that only ever saw non-negative values would not be a floor."""
        self.assertAlmostEqual(ordinal_metrics.quadratic_weighted_kappa(self.INVERTED), -0.971831, places=6)
        self.assertAlmostEqual(ordinal_metrics.pearson_from_confusion(self.INVERTED), -1.0)

    def test_all_mass_on_one_cell_reads_zero_not_one(self):
        """Chance agreement is zero here, so kappa is undefined; 0.0 blocks, 1.0 would
        promote a model evaluated on a single-grade validation set."""
        self.assertEqual(ordinal_metrics.quadratic_weighted_kappa([[80, 0], [0, 0]]), 0.0)
        self.assertEqual(ordinal_metrics.pearson_from_confusion([[80, 0], [0, 0]]), 0.0)

    def test_an_empty_or_degenerate_matrix_does_not_raise(self):
        for matrix in ([], [[0]], [[0, 0], [0, 0]], [[1]]):
            with self.subTest(matrix=matrix):
                self.assertEqual(ordinal_metrics.quadratic_weighted_kappa(matrix), 0.0)
                self.assertEqual(ordinal_metrics.pearson_from_confusion(matrix), 0.0)

    def test_the_trainer_does_not_keep_a_second_copy_of_the_scorers(self):
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        for name in ("quadratic_weighted_kappa", "pearson_from_confusion", "metrics_from_confusion"):
            self.assertNotIn(f"def {name}(", trainer)
            self.assertIn(f"{name} = ordinal_metrics.{name}", trainer)



if __name__ == "__main__":
    unittest.main(verbosity=2)
