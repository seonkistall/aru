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

# No .pyc, on purpose. Python invalidates its bytecode cache on (mtime, size), both
# at one-second granularity — and this cycle's verification discipline is to edit a
# source line, re-run, and read the failure. Two edits of the same size inside one
# second (140.0 -> 139.0, then restored) are indistinguishable to that check, so the
# cached module wins and the run reports the PREVIOUS edit's result. Measured on
# 2026-09-19: a restored ml/skin_indices.py kept failing with `139.0 != 140.0` until
# ml/__pycache__ was removed by hand. A stale green would be worse than a stale red.
sys.dont_write_bytecode = True

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aru_axes  # noqa: E402
import calibrate  # noqa: E402
import external_manifest  # noqa: E402
import heuristic_baseline  # noqa: E402
import ita  # noqa: E402
import licensing  # noqa: E402
import model_contract  # noqa: E402
import ordinal_metrics  # noqa: E402
import qwk_noise  # noqa: E402
import run_pipeline  # noqa: E402
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


class FeatureGenerations(unittest.TestCase):
    """Pooling two generations of the feature extractor into one run is now reported.

    The backlog item this closes: `fallbackVersion` moved to roi-calibrated-2026-09-16
    and then to -09-18, each time because a feature's semantics changed, and the string
    was carried per row by ml/prepare_crop_dataset.py and ml/run_pipeline.py while NO ml
    script filtered, grouped or warned on it. A pre-09-16 and a post-09-16 tone reading
    landed in the same subgroup cell and the same threshold fit with nothing said.

    Warning rather than blocking is scikit-learn's own line between a provenance
    mismatch and a structural one, read from its source at v1.5.2 and v1.7.1 — see
    docs/feature-generation-pooling.md. The published promotion rule is untouched:
    coverage_warnings has never been a gate.
    """

    NEW = {"model_version": "roi-calibrated-2026-09-18", "input_schema_version": "2026-06-30.visible-face-crop.v1"}
    OLD = {"model_version": "roi-calibrated-2026-09-16", "input_schema_version": "2026-06-30.visible-face-crop.v1"}

    @staticmethod
    def _rows(*specs):
        return [{"toneIta": "50", "age": 28, "participant_id": f"P{i:03d}", **spec} for i, spec in enumerate(specs)]

    @staticmethod
    def _generation_warnings(rows):
        return [w for w in subgroups.coverage_warnings(subgroups.coverage(rows)) if "generation" in w]

    def test_reads_both_camel_and_snake_spellings_of_the_row(self):
        # prepare_crop_dataset writes snake_case rows; a manifest row read straight from
        # the app writes camelCase. Both name the same generation and must not split it.
        snake = subgroups.feature_generation(self.NEW)
        camel = subgroups.feature_generation(
            {"modelVersion": self.NEW["model_version"], "inputSchemaVersion": self.NEW["input_schema_version"]}
        )
        self.assertEqual(snake, camel)
        self.assertIn("roi-calibrated-2026-09-18", snake)

    def test_a_row_with_no_version_is_its_own_named_generation(self):
        self.assertEqual(subgroups.feature_generation({"toneIta": "50"}), subgroups.UNSTAMPED)

    def test_one_generation_warns_about_nothing(self):
        self.assertEqual(self._generation_warnings(self._rows(self.NEW, self.NEW, self.NEW)), [])

    def test_external_rows_that_carry_no_version_at_all_warn_about_nothing(self):
        # A run made entirely of external-dataset rows has no mixing to report, and must
        # not be told it does.
        self.assertEqual(self._generation_warnings(self._rows({}, {}, {})), [])

    def test_two_generations_in_one_run_are_named_and_counted(self):
        warnings = self._generation_warnings(self._rows(self.NEW, self.NEW, self.OLD))
        self.assertEqual(len(warnings), 1)
        self.assertIn("2 feature generations pooled in one run", warnings[0])
        self.assertIn("roi-calibrated-2026-09-18", warnings[0])
        self.assertIn("roi-calibrated-2026-09-16", warnings[0])
        # Counted, so the reader can see whether it is a stray row or half the dataset.
        self.assertIn("(2)", warnings[0])
        self.assertIn("(1)", warnings[0])

    def test_a_schema_change_alone_is_a_different_generation(self):
        # inputSchemaVersion has never actually moved (its own backlog item), so this is
        # the case nothing would catch if only model_version were read.
        other_schema = {**self.NEW, "input_schema_version": "2026-10-01.visible-face-crop.v2"}
        warnings = self._generation_warnings(self._rows(self.NEW, other_schema))
        self.assertEqual(len(warnings), 1)
        self.assertIn("2 feature generations", warnings[0])

    def test_unstamped_rows_beside_stamped_ones_are_reported_separately(self):
        warnings = self._generation_warnings(self._rows(self.NEW, self.NEW, self.NEW, {}))
        self.assertEqual(len(warnings), 1)
        self.assertIn("carry no feature generation", warnings[0])
        self.assertIn("1 rows (25%)", warnings[0])

    def test_the_counts_are_carried_into_the_report_every_run_writes(self):
        cov = subgroups.coverage(self._rows(self.NEW, self.OLD, {}))
        self.assertEqual(
            cov.as_dict()["featureGenerations"],
            {
                subgroups.feature_generation(self.NEW): 1,
                subgroups.feature_generation(self.OLD): 1,
                subgroups.UNSTAMPED: 1,
            },
        )

    def test_the_pipeline_projection_carries_the_fields_coverage_reads(self):
        # run_pipeline builds a narrow projection of each row and passes THAT to
        # coverage(), not the CSV row. Pinned on source because the defect is a field
        # that is absent: every assertion above would still pass with the projection
        # unchanged, and the warning would never fire on a real run.
        source = (Path(__file__).resolve().parent / "run_pipeline.py").read_text(encoding="utf-8")
        projection = source[source.index("decoded.append({"):]
        projection = projection[: projection.index("})")]
        for key in ("model_version", "input_schema_version"):
            self.assertIn(key, projection, f"run_pipeline's coverage projection dropped {key}")

    # --- the other half: threshold fitting, which never goes through coverage() ---
    #
    # ml/calibrate.py reads its JSONL directly and had no version handling at all, so a
    # pre-09-16 and a post-09-16 reading still landed in one threshold fit with nothing
    # said. docs/feature-generation-pooling.md §5 named this as the remaining half.

    @staticmethod
    def _export_rows(*metas):
        # The shape the app actually exports: features + labels at the top level and the
        # two version fields nested under `meta` (lib/labels.ts: SampleMeta).
        return [
            {"features": {"shine": 0.1 * (i + 1)}, "labels": {"oil": 0}, "meta": meta}
            for i, meta in enumerate(metas)
        ]

    CAMEL_NEW = {"modelVersion": "roi-calibrated-2026-09-18", "inputSchemaVersion": "2026-06-30.visible-face-crop.v1"}
    CAMEL_OLD = {"modelVersion": "roi-calibrated-2026-09-16", "inputSchemaVersion": "2026-06-30.visible-face-crop.v1"}

    def test_calibrate_finds_the_versions_the_app_export_nests_under_meta(self):
        # The placement, not the spelling, is what calibrate has to get right: an export
        # row carries them under `meta`, so reading the row itself finds UNSTAMPED and
        # every row in a real export pools silently.
        row = self._export_rows(self.CAMEL_NEW)[0]
        self.assertEqual(subgroups.feature_generation(row), subgroups.UNSTAMPED)
        self.assertEqual(calibrate.sample_generation(row), subgroups.feature_generation(self.NEW))

    def test_calibrate_also_reads_a_flat_row(self):
        # prepare_crop_dataset writes the two fields flat. Both shapes reach one id.
        self.assertEqual(calibrate.sample_generation(dict(self.NEW)), subgroups.feature_generation(self.NEW))

    def test_calibrate_reports_two_generations_in_one_threshold_fit(self):
        counts, warnings = calibrate.generation_report(self._export_rows(self.CAMEL_NEW, self.CAMEL_NEW, self.CAMEL_OLD))
        self.assertEqual(counts[subgroups.feature_generation(self.NEW)], 2)
        self.assertEqual(counts[subgroups.feature_generation(self.OLD)], 1)
        self.assertEqual(len(warnings), 1)
        self.assertIn("2 feature generations pooled in one run", warnings[0])

    def test_calibrate_says_nothing_when_one_generation_fits(self):
        _, warnings = calibrate.generation_report(self._export_rows(self.CAMEL_NEW, self.CAMEL_NEW))
        self.assertEqual(warnings, [])

    def test_calibrate_reports_unstamped_rows_beside_stamped_ones(self):
        _, warnings = calibrate.generation_report(self._export_rows(self.CAMEL_NEW, self.CAMEL_NEW, self.CAMEL_NEW, {}))
        self.assertEqual(len(warnings), 1)
        self.assertIn("carry no feature generation", warnings[0])
        self.assertIn("1 rows (25%)", warnings[0])

    def test_both_readers_say_it_in_the_same_words(self):
        # One definition, so the wording, the ordering and the warn-not-block decision
        # cannot drift between the run report and the threshold fit.
        _, from_calibrate = calibrate.generation_report(self._export_rows(self.CAMEL_NEW, self.CAMEL_NEW, self.CAMEL_OLD, {}))
        from_coverage = self._generation_warnings(self._rows(self.NEW, self.NEW, self.OLD, {}))
        self.assertEqual(from_calibrate, from_coverage)
        self.assertEqual(len(from_calibrate), 2)

    def test_a_threshold_fit_is_reported_and_not_refused(self):
        # The decision this does NOT make: a mixed run still produces thresholds. What to
        # do about already-collected samples is the inputSchemaVersion item's question.
        rows = self._export_rows(self.CAMEL_NEW, self.CAMEL_OLD)
        samples, _ = calibrate.collect(rows, "shine", lambda row: row["labels"]["oil"])
        self.assertEqual(len(samples), 2)


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

    def test_relative_redness_survives_a_device_change_exactly_not_up_to_scale(self):
        """The case this replaces was named `..._up_to_scale` and divided by the gain
        to recover the plain value — which concedes, in the assertion itself, that the
        index was not scale-free. It was measuring an a* difference, and an a*
        difference is not (docs/redness-formula-decision.md).

        The shipped form is, and there is nothing to divide by: red chromaticity is a
        ratio of a channel to the sum of all three, so a common multiplier cancels in
        the ratio rather than factoring out of the difference.

        The bound is DERIVED rather than a tolerance picked to pass. Each chromaticity
        is one correctly-rounded division landing in (0, 1), so each carries at most
        half an ulp of 1.0, and their difference carries at most one — 2**-52. Measured
        worst over the gains below plus 0.3/0.45/0.7/1.0/1.1/1.7/2.0/3.0/0.123/7.77:
        exactly 0.5 * 2**-52, which is that bound's own half. It is 4.4e-17 against a
        `redness` cut of 0.012, fourteen orders of magnitude below anything the product
        reads, and a genuine formula split moves this index by whole percent — the
        rejected a* form below moves it by 50% of its own range.
        """
        cheek = (200.0, 150.0, 138.0)
        tzone = (195.0, 154.0, 142.0)
        plain = skin_indices.relative_redness(cheek, tzone)
        self.assertGreater(plain, 0)
        for gain in (0.6, 0.85, 1.4, 2.5):
            scaled_cheek = tuple(channel * gain for channel in cheek)
            scaled_tzone = tuple(channel * gain for channel in tzone)
            moved = abs(skin_indices.relative_redness(scaled_cheek, scaled_tzone) - plain)
            self.assertLessEqual(
                moved, 2.0**-52, f"a gain of {gain} moved a scale-free index by {moved}"
            )
        # And a black region takes the `|| 1` branch rather than dividing by zero.
        self.assertEqual(skin_indices.red_chromaticity(0.0, 0.0, 0.0), 0.0)
        self.assertEqual(skin_indices.relative_redness((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)), 0.0)

    def test_the_rejected_a_star_difference_is_the_thing_that_was_not_scale_free(self):
        """Why the Python side moved rather than the app's, kept as arithmetic.

        a* = 500 * (f(X/Xn) - f(Y/Yn)) and f is a cube root above its knee, so a* is
        homogeneous of degree 1/3 in the linear signal; the linear signal is degree 2.4
        in the 8-bit channel. A common gain g therefore multiplies BOTH regions' a* by
        g**0.8 — and a difference of two things that both scale scales too, instead of
        cancelling the way the old docstring claimed. Under a pure 2.4 power law this
        is exact; docs/redness-formula-decision.md §D measures the shipped transfer
        curve, whose +0.055 offset moves it a little off the clean exponent.
        """

        def astar_difference(cheek, tzone, gain):
            def astar(rgb):
                linear = [(channel * gain / 255.0) ** 2.4 for channel in rgb]
                x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047
                y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
                f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
                return 500.0 * (f(x) - f(y))

            return astar(cheek) - astar(tzone)

        cheek = (200.0, 150.0, 138.0)
        tzone = (195.0, 154.0, 142.0)
        plain = astar_difference(cheek, tzone, 1.0)
        for gain in (0.6, 0.85, 1.4):
            self.assertAlmostEqual(
                astar_difference(cheek, tzone, gain) / plain, gain**0.8, places=9,
                msg=f"an a* difference at gain {gain} is not g**0.8 of itself",
            )
            # Which is the same as saying it is NOT invariant, on the same frames where
            # the shipped chromaticity form is exactly invariant above.
            self.assertNotAlmostEqual(astar_difference(cheek, tzone, gain), plain, places=2)

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
        # An index in NEITHER map is one the pipeline cannot find in an export. An index
        # in BOTH claims to be carried and derived at once, which is the state the split
        # exists to make unrepresentable: FEATURE_KEY[id] is that index's own value and
        # DERIVED_FROM[id] is its INPUT, so a reader that finds an id in both has no way
        # to know which of the two a column holds.
        for index in skin_indices.INDICES:
            carried = index.id in skin_indices.FEATURE_KEY
            derived = index.id in skin_indices.DERIVED_FROM
            self.assertTrue(carried or derived, f"{index.id} declares no feature key at all")
            self.assertFalse(carried and derived, f"{index.id} is declared both carried and derived")
        for key in skin_indices.NEW_FEATURE_KEYS:
            self.assertNotIn(key, ("shine", "relRedness", "cov"))

    def test_a_derived_index_is_not_the_column_it_is_derived_from(self):
        """Why melanin_index left FEATURE_KEY on 2026-09-20.

        FEATURE_KEY's contract is that the named column holds the index's own value.
        An index whose value is a nonlinear transform of a column cannot satisfy that
        contract by naming the column, so this asserts the transform is not the identity
        on the readings the product actually produces. If some future derived index IS
        the identity on its source, it belongs in FEATURE_KEY and not here.
        """
        derived = {
            "melanin_index": skin_indices.melanin_index,
        }
        self.assertEqual(set(skin_indices.DERIVED_FROM), set(derived))
        for index_id, source_key in skin_indices.DERIVED_FROM.items():
            # The source has to be a column something actually exports, or "derived
            # from" names nothing. toneLstar is checked against SkinRawFeatures on the
            # TypeScript side (tests/skin-index-contract.test.ts).
            self.assertTrue(source_key and source_key[0].islower(), source_key)
            self.assertNotIn(source_key, skin_indices.FEATURE_KEY.values(),
                             f"{source_key} is already some other index's own value")
            fn = derived[index_id]
            # L* 30/50/70/90: the skin band the product reads, not a constructed input.
            for lstar in (30.0, 50.0, 70.0, 90.0):
                self.assertNotAlmostEqual(
                    fn(lstar), lstar, places=6,
                    msg=f"{index_id} equals its source {source_key} at L*={lstar}; "
                        f"if that holds everywhere it belongs in FEATURE_KEY",
                )
            # The specific number the old declaration got wrong, kept as a number.
            self.assertAlmostEqual(skin_indices.melanin_index(70.0), 15.490195998574317, places=12)

    def test_shine_brightness_gap_is_relative_so_exposure_cancels(self):
        """What the old `tzone_specular / cheek_specular` form asserted, on the form
        that replaced it on 2026-09-19.

        The property moved with the formula and narrowed on the way, deliberately.
        `shine`'s brightness-gap term is Weber contrast, so an exposure gain applied
        to BOTH luminances cancels exactly — that part holds. Its specular term is a
        count of pixels above a fixed 218 cut, which an exposure gain does NOT scale,
        so it is passed through untouched here rather than asserted invariant. That
        distinction is the whole reason the old form's invariance was false on a real
        frame while true in this test's algebra: measured on a face family in
        docs/shine-formula-decision.md, the old form ran 0 -> 49,383 across an
        exposure range every capture signal accepted.
        """
        base = skin_indices.shine_ratio(0.30, 168.0, 140.0)
        for gain in (0.5, 1.7, 3.0):
            self.assertAlmostEqual(skin_indices.shine_ratio(0.30, 168.0 * gain, 140.0 * gain), base, places=12)
        # The gap term alone, with the specular term zeroed: 0.2 * (140/255).
        self.assertAlmostEqual(skin_indices.shine_ratio(0.0, 168.0, 140.0), 0.2 * (140.0 / 255.0))
        # A T-zone darker than the cheek is not negative oil.
        self.assertEqual(skin_indices.shine_ratio(0.0, 100.0, 140.0), 0.0)
        self.assertEqual(skin_indices.shine_ratio(0.25, 100.0, 140.0), 0.25)
        self.assertAlmostEqual(skin_indices.roughness_ratio(0.8 * 0.4, 0.2 * 0.4), 4.0)

    def test_indices_match_the_typescript_implementations_value_for_value(self):
        """The cross-language check that did not exist, and whose absence is why two
        implementations could be two formulas under one name with every test green.

        `tests/skin-index-contract.test.ts` pins NAMES — which feature key each index
        id maps to, which columns carry it — and that is what stayed green while the
        values diverged. ml/index-parity.json is a table of inputs and expected
        outputs generated from lib/skin.ts and asserted here and in
        tests/index-parity.test.ts, so neither language can move alone.

        Exact equality, not a tolerance: both covered expressions are +, -, *, / and
        sqrt on IEEE doubles, all correctly rounded, so a matching implementation
        matches bit for bit. If this starts failing, one of the two implementations
        changed — regenerate the table only after deciding on purpose which is right.

        All seven registry indices are covered as of 2026-09-24, and to different
        depths. The shine rows and, since 2026-09-20, the relative_redness rows pin the
        PATH as well as the formula (the TypeScript side rebuilds each frame); the
        tone_evenness, blemish_count and roughness_ratio rows pin the formula alone,
        because their inputs are not exported fields; ita got its own case and 17 rows
        from cycles 19-20, which is what retired the sentence here that still called it
        value-unchecked. melanin_index is the seventh and is NOT a parity row: it is
        ABSOLUTE and DERIVED, lib/skin.ts computes no counterpart, and no export column
        holds it, so its group is `python-only` and pins this module against itself.
        docs/shine-formula-decision.md, docs/melanin-index-verification.md.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        indices = table["indices"]
        self.assertEqual(
            set(indices),
            set(skin_indices.INDEX_BY_ID),
        )
        # Whatever is pinned has to be a real index declaring the real app field — or,
        # for a DERIVED index with no app field, the column it is derived FROM.
        for index_id, group in indices.items():
            self.assertIn(index_id, skin_indices.INDEX_BY_ID)
            if index_id in skin_indices.DERIVED_FROM:
                self.assertNotIn(index_id, skin_indices.FEATURE_KEY)
                self.assertNotIn("featureKey", group)
                self.assertEqual(skin_indices.DERIVED_FROM[index_id], group["derivedFrom"])
                self.assertEqual(group["comparison"], "python-only")
            else:
                self.assertEqual(skin_indices.FEATURE_KEY[index_id], group["featureKey"])

        # melanin_index. The seventh registry index and, until 2026-09-24, the only one
        # with no committed row in either language, so nothing here would have noticed
        # the expression or either guard moving. The rows are not a parity check and the
        # group says so: there is no app counterpart to disagree with. What they hold is
        # the two guards. The low one is shared with the benchmark this module cites and
        # flattens everything below L* 1.0 onto one value; the high one is the single
        # deliberate deviation from that benchmark, which clips to [1.0, 100.0] where
        # this returns a negative number above L* 100. docs/melanin-index-verification.md.
        melanin_rows = indices["melanin_index"]["rows"]
        self.assertGreaterEqual(len(melanin_rows), 10)
        self.assertEqual(indices["melanin_index"]["pythonFunction"], "ml/skin_indices.py :: melanin_index")
        for row in melanin_rows:
            self.assertEqual(
                skin_indices.melanin_index(row["lstar"]),
                row["value"],
                f'{row["note"]}: melanin_index({row["lstar"]})',
            )
        by_lstar = {row["lstar"]: row["value"] for row in melanin_rows}
        # The floor: three L* at or below 1.0 have to land on the same value, or the
        # rows pin an expression without pinning the guard in front of it.
        self.assertEqual(len({by_lstar[l] for l in (0.0, 0.5, 1.0)}), 1)
        # And the high end stays unclipped, which is the whole reason the deviation is
        # written down rather than fixed.
        self.assertEqual(by_lstar[100.0], 0.0)
        self.assertLess(by_lstar[120.0], 0.0)
        self.assertLess(by_lstar[100.0000001], 0.0)
        # Not a table of one value repeated.
        self.assertGreaterEqual(len(set(by_lstar.values())), 9)

        shine_rows = indices["shine_ratio"]["rows"]
        self.assertGreaterEqual(len(shine_rows), 20)
        self.assertEqual(skin_indices.SHINE_REFERENCE_CHEEK_L, 140.0)
        for row in shine_rows:
            computed = skin_indices.shine_ratio(row["tzoneSpecular"], row["tzoneL"], row["cheekL"])
            self.assertEqual(
                computed,
                row["shine"],
                f'{row["note"]}: shine_ratio({row["tzoneSpecular"]}, {row["tzoneL"]}, {row["cheekL"]})',
            )
        # Not a table of one value repeated: it has to span the axis to be worth pinning.
        shines = [row["shine"] for row in shine_rows]
        self.assertEqual(min(shines), 0.0)
        self.assertGreater(max(shines), 0.7)
        self.assertGreaterEqual(len({row["kind"] for row in shine_rows}), 2)

        # blemish_count / blemish_density. Checked 2026-09-19 (cycle 17) and it AGREES,
        # so it is pinned rather than fixed — a negative result recorded as one, the way
        # tone_evenness was. Two things the rows pin beyond the arithmetic: the two
        # (area, face width) pairs are what lib/skin.ts actually reported for ONE face at
        # two capture resolutions, so the invariance the third argument exists for is
        # checked and not asserted; and the degenerate row exercises both languages'
        # guards, which sit in different places (Python clamps faceWidthPx ** 2 at 1e-6
        # and then the relative area again; the app returns areaFace 0 outright).
        density_rows = indices["blemish_count"]["rows"]
        self.assertGreaterEqual(len(density_rows), 8)
        self.assertEqual(indices["blemish_count"]["pythonFunction"], "ml/skin_indices.py :: blemish_density")
        for row in density_rows:
            computed = skin_indices.blemish_density(row["count"], row["sampledAreaPx"], row["faceWidthPx"])
            self.assertEqual(
                computed,
                row["value"],
                f'{row["note"]}: blemish_density({row["count"]}, {row["sampledAreaPx"]}, {row["faceWidthPx"]})',
            )
        self.assertGreaterEqual(len({row["value"] for row in density_rows}), 4)

        # tone_evenness has claimed in its own docstring since 2026-09-14 to be "the
        # same formula as relativeSpread in lib/skin.ts". The shine_ratio docstring
        # made the same kind of claim and was false. This one is true, and this is
        # what keeps it true.
        spread_rows = indices["tone_evenness"]["rows"]
        self.assertGreaterEqual(len(spread_rows), 8)
        for row in spread_rows:
            computed = skin_indices.tone_evenness(list(row["lstars"]))
            self.assertEqual(computed, row["value"], f'{row["note"]}: tone_evenness({row["lstars"]})')
        self.assertGreaterEqual(len([row for row in spread_rows if row["value"] > 0]), 4)

    def test_relative_redness_matches_the_app_on_every_committed_row(self):
        """The group added when this side moved onto the app's formula (2026-09-20).

        It is `exact`, not `divergent` like roughness_ratio, because the decision was
        made rather than deferred — docs/redness-formula-decision.md is the
        measurement. Which means this case does something the roughness one cannot:
        if either language's expression moves, the rows go red in BOTH languages
        instead of in one.

        The face rows carry the two region mean RGBs `lib/skin.ts` actually fed its
        index, not the colours the fixture painted, so this asserts on the numbers the
        app's formula received. The TypeScript side additionally rebuilds each frame
        and checks that those means are what `sampleRegion` still produces — the half
        Python cannot do, and the half that would otherwise let a change to WHICH
        regions the index compares leave every row here green.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        redness = table["indices"]["relative_redness"]
        self.assertEqual(redness["comparison"], "exact")
        self.assertEqual(redness["featureKey"], skin_indices.FEATURE_KEY["relative_redness"])
        self.assertEqual(redness["pythonFunction"], "ml/skin_indices.py :: relative_redness")
        rows = redness["rows"]
        self.assertGreaterEqual(len(rows), 15)

        for row in rows:
            computed = skin_indices.relative_redness(tuple(row["cheekMean"]), tuple(row["tzoneMean"]))
            self.assertEqual(
                computed,
                row["relRedness"],
                f'{row["note"]}: relative_redness({row["cheekMean"]}, {row["tzoneMean"]})',
            )

        # A table of zeroes would satisfy the loop above and pin nothing. The rows have
        # to span the published axis, both signs and the exact zero included.
        values = [row["relRedness"] for row in rows]
        self.assertGreaterEqual(len([v for v in values if v > 0.03]), 1)
        self.assertGreaterEqual(len([v for v in values if v < 0]), 2)
        self.assertGreaterEqual(len([v for v in values if v == 0.0]), 2)

        # The property that decided which side moved, held by the rows: one face at
        # three exposures across the 조명 band reads the same redness to 5.2%, where the
        # a* difference this function used to compute reads it to 142% over the same
        # three frames. The app-side test computes the rejected column from these same
        # means; here it is enough that the committed readings do not move.
        same_face = [
            row for row in rows
            if row.get("kind") == "face" and row.get("tzoneMul") == [0.98, 1.03, 1.03]
        ]
        self.assertEqual(len(same_face), 3)
        self.assertEqual(len({row["cheekTarget"] for row in same_face}), 3)
        readings = [row["relRedness"] for row in same_face]
        self.assertLess(max(readings) / min(readings), 1.06)

        # And the pair whose inputs are exact multiples, where nothing is rounded: the
        # invariance is down to one ulp of 1.0, the bound derived in the case above.
        plain = next(row for row in rows if row["note"].startswith("non-integer means"))
        brighter = next(row for row in rows if row["note"].startswith("the same pair 2.5x brighter"))
        self.assertLessEqual(abs(brighter["relRedness"] - plain["relRedness"]), 2.0**-52)
        for index, channel in enumerate(plain["cheekMean"]):
            self.assertAlmostEqual(brighter["cheekMean"][index], channel * 2.5, places=9)

    def test_ita_guard_is_b_star_exactly_zero_in_all_three_implementations(self):
        """The seventh registry index, pinned divergent by cycle 19 and decided by 20.

        Three implementations guarded the b* ~ 0 singularity in two different places:
        `lib/skin.ts:itaDegrees` and `ml/ita.py:ita_from_lab` at `|b*| < 0.01`, this
        module at `1e-6`. Because the +-90 fallback ignores the SIGN of b* that was a
        180-degree disagreement inside the window rather than a rounding one -- `light`
        against `deep` on coarse_tone_band from one frame.

        What decided it is in the rows rather than in a paragraph: a NEUTRAL GREY sits
        inside the wider window. This module's own four-decimal sRGB->XYZ matrix gives
        r = g = b a small negative b*, so 242 of the 256 8-bit greys satisfied
        `|b*| < 0.01` against 1 of 256 for `1e-6`, and on every non-black one the
        fallback answered with sign(L* - 50) where the limit is its negation. So the
        narrow guard held the correct column, and the narrowest correct guard is no
        window at all. docs/ita-guard-decision.md.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        group = table["indices"]["ita"]
        self.assertEqual(group["comparison"], "exact")
        self.assertEqual(group["featureKey"], skin_indices.FEATURE_KEY["ita"])
        self.assertEqual(group["pythonFunction"], "ml/skin_indices.py :: ita")
        rows = group["rows"]
        self.assertGreaterEqual(len(rows), 17)

        for row in rows:
            computed = skin_indices.ita(row["lstar"], row["bstar"])
            self.assertEqual(
                computed, row["value"], f'{row["note"]}: ita({row["lstar"]}, {row["bstar"]})'
            )

        # The fallback fires where b* is zero and nowhere else. A denormal b* is in the
        # table precisely because it does NOT take the branch: the quotient overflows to
        # inf and math.atan maps that to pi/2 exactly, so 90 there is the limit rather
        # than the convention, and the two routes must not be conflated.
        branch = {row["bstar"] for row in rows if row["value"] in (90.0, -90.0)}
        self.assertEqual(branch, {0.0, 5e-324}, "only b* == 0 may reach the fallback")
        self.assertEqual(20.0 / 5e-324, float("inf"))
        self.assertEqual(skin_indices.ita(70.0, 5e-324), 90.0)

        # -0.0 cannot be a row: json.dumps(-0.0) is "-0.0" in Python but
        # JSON.stringify(-0) is "0" in the generator, so the table cannot carry the
        # distinction and the functions have to be asked directly. It matters because
        # CPython raises ZeroDivisionError on BOTH zeros while V8 divides by -0 to
        # -Infinity, so an unguarded -0 is where the two languages would part.
        with self.assertRaises(ZeroDivisionError):
            (70.0 - 50.0) / -0.0
        self.assertEqual(skin_indices.ita(70.0, -0.0), 90.0)
        self.assertEqual(skin_indices.ita(30.0, -0.0), -90.0)
        self.assertEqual(ita.ita_from_lab(70.0, -0.0), 90.0)

        # ml/ita.py is the third implementation and is held to the SAME column. Not bit
        # exact, and the gap is a different thing entirely: it converts with
        # math.degrees (one rounding) where the app and this module use `* 180 / pi`
        # (two). Over 1,186,709 (L*, b*) pairs the two associations are bit-identical on
        # 74.5% and differ by at most 1.42e-14 degrees, which is 0.71 units of
        # `90 * 2**-52`; the bound below is the next integer up. It is twelve orders of
        # magnitude under the 0.1 degree this index is rounded to before anything reads
        # it, and fifteen under the 180 the old guard cost.
        tolerance = 2 * 90 * 2.0**-52
        for row in rows:
            offline = ita.ita_from_lab(row["lstar"], row["bstar"])
            self.assertLessEqual(
                abs(offline - row["value"]),
                tolerance,
                f'{row["note"]}: ml/ita.py must agree with the committed column',
            )
            # The guard itself is not a rounding question: the branch has to fire in the
            # same place in all three, which is what `exact` on this group now means. A
            # b* of zero is the only row that may come back EXACTLY +-90 from a branch,
            # and it is asserted as an identity rather than as a closeness so that a
            # widened guard shows up here and not only in the value column.
            if row["bstar"] == 0:
                self.assertEqual(
                    offline,
                    90.0 if row["lstar"] > 50 else -90.0,
                    f'{row["note"]}: ml/ita.py must take the convention, exactly',
                )
            else:
                self.assertEqual(
                    offline,
                    math.degrees(math.atan((row["lstar"] - 50) / row["bstar"])),
                    f'{row["note"]}: ml/ita.py must compute rather than fall back',
                )

    def test_the_neutral_axis_is_why_the_old_ita_window_was_reachable(self):
        """The measurement that decided the guard, recomputed rather than quoted.

        A window of `|b*| < 0.01` sounds like a knife edge, and on a skin-coloured region
        it is one: the blue-channel gain has to be tuned to about 2e-4 to land in it, and
        over the 8-bit cube the window is 0.015% of the volume
        (docs/ita-guard-decision.md). What makes it reachable is not a tuned cast. It is
        that the NEUTRAL AXIS sits inside it -- ARU's four-decimal sRGB->XYZ matrix sends
        r = g = b to a small negative b*, monotone in level -- and 8-bit quantisation
        puts real pixel values exactly on that axis. A grayscale source is the plain
        case: PIL's convert("RGB") on an L-mode file gives r = g = b exactly, and
        ml/ita.py is the path external dataset images take.
        """
        inside_old = [level for level in range(256) if abs(ita.rgb_to_lab(level, level, level)[2]) < 0.01]
        inside_registry = [level for level in range(256) if abs(ita.rgb_to_lab(level, level, level)[2]) < 1e-6]
        self.assertEqual(len(inside_old), 242, "greys inside the old lib/skin.ts and ml/ita.py guard")
        self.assertEqual(inside_registry, [0], "only pure black has b* exactly 0 on the grey axis")
        # Monotone and negative, which is the mechanism rather than a coincidence: it is
        # the matrix's own truncation, so every grey leans the same way.
        bstars = [ita.rgb_to_lab(level, level, level)[2] for level in range(1, 256)]
        self.assertTrue(all(value < 0 for value in bstars), "a neutral grey has a NEGATIVE b*")
        self.assertEqual(bstars, sorted(bstars, reverse=True), "and it grows in magnitude with level")

        wrong_sign = 0
        for level in inside_old:
            lstar, _, bstar = ita.rgb_to_lab(level, level, level)
            if bstar == 0:
                continue
            shipped = skin_indices.ita(lstar, bstar)
            self.assertEqual(
                math.copysign(1, shipped),
                math.copysign(1, (lstar - 50.0) / bstar),
                f"grey {level}: the shipped angle must carry the limit's sign",
            )
            self.assertGreater(abs(shipped), 80.0, f"grey {level}: and still be a steep angle")
            if math.copysign(1, 90.0 if lstar > 50 else -90.0) != math.copysign(1, shipped):
                wrong_sign += 1
        self.assertEqual(
            wrong_sign, 241, "every non-black grey inside the old window had its sign inverted by the fallback"
        )

        # The least vertical grey on the whole axis, and it is on the axis rather than
        # constructed: grey 119 lands at L* 50.034, so (L* - 50) is the same size as b*
        # and the angle is 80.24 where the old fallback published exactly 90. Same band
        # here, ten degrees apart in the recorded value -- which is the ratio effect
        # showing up on real pixel values rather than in a designed row.
        lstar119, _, bstar119 = ita.rgb_to_lab(119, 119, 119)
        self.assertAlmostEqual(skin_indices.ita(lstar119, bstar119), -80.2381693436971, places=10)

        # The second defect a guard on b* alone carried, and the reason sign-awareness
        # alone would not have been enough: what diverges is the RATIO, not b*. So a
        # window on b* published a vertical angle for a face a thousandth off the pivot.
        self.assertAlmostEqual(skin_indices.ita(50.001, 0.005), 11.309932474020215, places=10)
        self.assertEqual(skin_indices.coarse_tone_band(skin_indices.ita(50.001, 0.005)), "medium")
        self.assertEqual(skin_indices.coarse_tone_band(90.0), "light")

    def test_blemish_density_guard_band_is_pinned_on_the_python_side(self):
        """The band where this function and lib/skin.ts stop agreeing about a face box.

        `blemish_density` clamps at `max(face_width_px ** 2, 1e-6)`, which only ever
        bites at exactly zero, so every positive width gets a density. `detectBlemishes`
        in lib/skin.ts returns `{ count: 0, areaFace: 0 }` for `faceW < 20`, so the app
        publishes its could-not-measure 0 across a whole 20-pixel band this function
        publishes numbers in. Same mechanism as shine_ratio (cycle 16) and
        roughness_ratio (cycle 17), one axis over.

        Measured 2026-09-24. It was invisible while the app column in
        tests/index-parity.test.ts modelled the guard as `faceWidthPx > 0`, which is not
        what lib/skin.ts:965 says and which agrees with THIS function inside the band.

        Nothing here decides which guard is right — it turns on whether a face box under
        20px is worth reading at all, and that is a question about real captures. This
        asserts the Python column only; the TypeScript case asserts the app column of
        the same rows, so neither side can move while the decision waits.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        guard = table["indices"]["blemish_count"]["guardDivergence"]
        self.assertEqual(guard["comparison"], "divergent")
        rows = guard["rows"]
        self.assertGreaterEqual(len(rows), 5)
        below = 0
        for row in rows:
            value = skin_indices.blemish_density(row["count"], row["sampledAreaPx"], row["faceWidthPx"])
            self.assertAlmostEqual(value, row["python"], places=10, msg=row["note"])
            if row["faceWidthPx"] < 20:
                below += 1
                # Python publishes a finite density exactly where the app publishes 0.
                self.assertEqual(row["app"], 0, msg=row["note"])
                self.assertGreater(row["python"], 0, msg=row["note"])
            else:
                self.assertEqual(row["app"], row["python"], msg=row["note"])
        # Both sides of the 20px floor, so the rows pin a boundary rather than one side.
        self.assertGreaterEqual(below, 3)
        self.assertGreaterEqual(len(rows) - below, 2)
        # The app guard this is measured against, quoted from the file that holds it, so
        # the band cannot silently close or move while these rows stay put.
        skin_ts = (Path(__file__).resolve().parent.parent / "lib" / "skin.ts").read_text(encoding="utf-8")
        self.assertIn(
            "if (!Number.isFinite(faceW) || faceW < 20 || faceH < 20) return { count: 0, areaFace: 0, tiedPeaks: 0 };",
            skin_ts,
        )

    def test_roughness_ratio_disagrees_with_the_app_and_the_table_records_where(self):
        """The one parity group whose two columns are NOT expected to match.

        Every other group in ml/index-parity.json pins an agreement. This one pins a
        disagreement, at the value it takes. Measured 2026-09-19 (cycle 17), pinned
        2026-09-19 (cycle 18): this function clamps the denominator at 1e-6 and
        lib/skin.ts:roughnessRatio publishes its could-not-measure 0 below the same
        1e-6, so on a forehead with no texture the two read 320000.0 and 0 — the
        mechanism that disqualified the rejected shine_ratio, one axis over
        (docs/shine-formula-decision.md).

        Nothing here decides which side is right, and the table is built so that nobody
        can decide it by accident: each language asserts its OWN column, so neither
        implementation can move unnoticed while the decision waits on the real faces it
        needs. Two further differences in the same pair are recorded in the group's
        `covers` string rather than asserted, because neither is expressible as a row:
        the app returns 0 when a region is missing, and the app's inputs are each
        region's high-frequency energy divided by that region's own mean L*.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        indices = table["indices"]
        self.assertEqual(skin_indices.FEATURE_KEY["roughness_ratio"], indices["roughness_ratio"]["featureKey"])
        roughness = indices["roughness_ratio"]
        self.assertEqual(roughness["comparison"], "divergent")
        self.assertEqual(roughness["pythonFunction"], "ml/skin_indices.py :: roughness_ratio")
        roughness_rows = roughness["rows"]
        self.assertGreaterEqual(len(roughness_rows), 8)
        divergent = 0
        for row in roughness_rows:
            if row["python"] is None:
                # The app's missing-region branch. Python has no concept of it, which is
                # why the column is absent rather than zero, and why this function is
                # not called with those inputs at all.
                self.assertTrue(row["cheekHf"] is None or row["foreheadHf"] is None, row["note"])
                self.assertEqual(row["app"], 0.0, row["note"])
                continue
            computed = skin_indices.roughness_ratio(row["cheekHf"], row["foreheadHf"])
            self.assertEqual(
                computed,
                row["python"],
                f'{row["note"]}: roughness_ratio({row["cheekHf"]}, {row["foreheadHf"]})',
            )
            if computed != row["app"]:
                divergent += 1
        # A table whose columns agreed everywhere would pin the arithmetic and lose the
        # finding, and one that disagreed everywhere would say the guard is not where
        # the difference is. Both halves are required.
        self.assertGreaterEqual(divergent, 3)
        self.assertGreaterEqual(
            len([row for row in roughness_rows if row["python"] is not None and row["python"] == row["app"]]),
            4,
        )
        # The value that makes the divergence worth a table: an epsilon clamp turns a
        # frame the app declines to grade into a reading in the hundreds of thousands.
        smooth = [row for row in roughness_rows if row["foreheadHf"] == 0][0]
        self.assertEqual(smooth["app"], 0.0)
        self.assertGreater(smooth["python"], 100000.0)

    def test_roughness_ratio_inputs_are_l_star_normalised(self):
        """What the two arguments are, which the docstring used to leave out.

        lib/skin.ts:1166-1169 divides each region's high-frequency energy by that
        region's own mean L* before the ratio is taken. Nothing in this module's
        signature says so, and the difference does not cancel: the app's form is
        `(cheekHf/cheekL) / (foreheadHf/foreheadL)`, which is the raw-energy ratio
        times `foreheadL/cheekL`, and the two regions differ in L* by construction —
        that gap is what shine_index is built on.

        Asserted rather than described for the reason the melanin_index docstring went
        stale under cycle 34: prose nobody executes stops being true quietly.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        pairs = sorted(
            {
                (row["tzoneL"], row["cheekL"])
                for row in table["indices"]["shine_ratio"]["rows"]
                if row["tzoneL"] > 0 and row["cheekL"] > 0
            }
        )
        self.assertEqual(len(pairs), 12)

        worst_residual = 0.0
        factors = []
        for tzone_l, cheek_l in pairs:
            factors.append(tzone_l / cheek_l)
            for cheek_hf, forehead_hf in ((1.0, 1.0), (0.37, 0.91), (12.5, 3.25), (1e-3, 7.0)):
                raw = skin_indices.roughness_ratio(cheek_hf, forehead_hf)
                app = skin_indices.roughness_ratio(cheek_hf / cheek_l, forehead_hf / tzone_l)
                predicted = raw * (tzone_l / cheek_l)
                worst_residual = max(worst_residual, abs(app - predicted) / abs(predicted))
        # One rounding step apart, so the factor IS the whole of the difference.
        self.assertLess(worst_residual, 1e-15, worst_residual)
        # And the factor is large enough to matter on rows this repository commits.
        self.assertAlmostEqual(min(factors), 0.7142857142857143, places=15)
        self.assertAlmostEqual(max(factors), 1.5, places=15)

        doc = (skin_indices.roughness_ratio.__doc__ or "").lower()
        for phrase in ("mean l*", "lib/skin.ts:1166-1167", "lib/skin.ts:1168-1169", "0.7142857142857143", "1.5"):
            self.assertIn(phrase, doc, phrase)


    def test_rgb_to_lab_matches_the_typescript_implementation_within_a_measured_tolerance(self):
        """The same contract as the indices above, with the one difference that matters.

        Those rows are compared EXACTLY, because +, -, *, / and sqrt on IEEE doubles are
        correctly rounded and a matching implementation matches bit for bit. rgb_to_lab
        is not in that class: it calls pow(., 2.4) three times and a cube root up to
        three times, and neither language's library rounds those correctly. Measured
        over 268,877 inputs (docs/rgb-to-lab-parity.md), V8 and CPython 3.11 agree
        exactly on 63-80% of them; where they differ, V8's Math.cbrt and this file's
        t ** (1/3) are within 1 ulp of each other and 500 * (f(x) - f(y)) amplifies
        that into a* by the 500.

        So the tolerance is `toleranceK * channelScale * 2 ** -52` per channel, with
        channelScale the literal multiplier in that channel's own expression. The
        measured worst case over the whole sweep was 1.472 of those units; k is 4.

        Two things this does NOT let through, which is why a tolerance here is still a
        contract and not a shrug. In a* it is 4.4e-13 against a BLEMISH.minResidual of
        1.6 — twelve orders of magnitude of headroom — and about 1e-14 relative on a
        skin a* of ~20. The defect this file exists to catch, one name over two
        formulas, moves a value by whole units: `shine_ratio` read 24,691 where the app
        read 0.0674, and `relative_redness` is an a* difference where the app returns a
        difference of chromaticities. Nothing of that kind fits inside 4.4e-13.

        The fast path is declared here rather than inferred: lib/skin.ts:labAStar
        computes a* alone, for the ~18,000 grid cells detectBlemishes reads per frame,
        and does not compute L* or b* at all. This file has no counterpart to it,
        because nothing in the Python pipeline wants a* without the rest.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        group = table["primitives"]["rgb_to_lab"]
        self.assertEqual(group["python"], "ml/ita.py :: rgb_to_lab")
        self.assertEqual(group["comparison"], "tolerance")
        self.assertEqual(group["toleranceK"], 4)
        self.assertEqual(group["channelScale"], {"l": 116, "a": 500, "b": 200})
        # The fast path is a PARTIAL duplicate and the table has to say so out loud.
        self.assertEqual(group["fastPath"]["computes"], ["a"])
        self.assertEqual(group["fastPath"]["doesNotCompute"], ["l", "b"])
        self.assertIsNone(group["fastPath"]["python"])

        rows = group["rows"]
        self.assertGreaterEqual(len(rows), 20)
        eps = 2.0**-52
        for row in rows:
            r, g, b = row["rgb"]
            computed = ita.rgb_to_lab(r, g, b)
            for value, channel in zip(computed, ("l", "a", "b")):
                tolerance = group["toleranceK"] * group["channelScale"][channel] * eps
                self.assertLessEqual(
                    abs(value - row[channel]),
                    tolerance,
                    f'{row["note"]}: {channel}* of rgb_to_lab({r}, {g}, {b})',
                )
        # A tolerance wide enough to pass anything would pass this loop too, so pin what
        # it is worth in the units the product reads a* in. BLEMISH.minResidual is 1.6.
        self.assertLess(group["toleranceK"] * group["channelScale"]["a"] * eps, 1e-9)
        # And the rows have to span the axis, or they pin one colour.
        self.assertEqual(min(row["l"] for row in rows), 0.0)
        self.assertEqual(max(row["l"] for row in rows), 100.0)

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

    def test_every_parity_group_declares_how_its_columns_relate(self):
        """The comparison census, asserted in both languages rather than described.

        `comparison` was introduced in cycle 18 for `roughness_ratio`, the one group
        whose two columns are NOT meant to match. The three groups that predate the key
        — shine_ratio, blemish_count, tone_evenness — carried it on neither side, so a
        reader could not tell an unlabelled group apart from one nobody had checked,
        and a comment in tests/index-parity.test.ts asserted in prose that every group
        but roughness_ratio was "exact", which the table did not support: melanin_index
        is "python-only" and three groups had no label at all. They are labelled now —
        one value column each, asserted by this file and by the TypeScript side — and
        the census is pinned here so the next drift fails a test instead of surviving
        as a sentence.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        self.assertEqual(
            {name: group.get("comparison") for name, group in table["indices"].items()},
            {
                "melanin_index": "python-only",
                "shine_ratio": "exact",
                "blemish_count": "exact",
                "roughness_ratio": "divergent",
                "relative_redness": "exact",
                "ita": "exact",
                "tone_evenness": "exact",
            },
        )
        self.assertEqual(table["primitives"]["rgb_to_lab"].get("comparison"), "tolerance")
        # Every registry index has a group, so the census covers the registry and not
        # just whatever happens to be in the file.
        self.assertEqual(sorted(table["indices"]), sorted(index.id for index in skin_indices.INDICES))
        # Exactly one group is the divergent pair, and it is the one whose rows carry
        # two columns; every "exact" group carries one.
        divergent = [name for name, group in table["indices"].items() if group.get("comparison") == "divergent"]
        self.assertEqual(divergent, ["roughness_ratio"])
        for row in table["indices"]["roughness_ratio"]["rows"]:
            self.assertIn("app", row)
            self.assertIn("python", row)

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



class _FakeRow:
    """The two fields heuristic_baseline.score reads off the trainer's Row."""

    def __init__(self, labels, meta):
        self.labels = labels
        self.meta = meta


class HeuristicBaseline(unittest.TestCase):
    """The rule a trained model has to beat before it may replace it."""

    def test_the_cut_convention_matches_lib_skin_ts(self):
        """`bucket()` is `value < lo ? 0 : value < hi ? 1 : 2`.

        A value sitting exactly ON a cut lands in the HIGHER level. Disagreeing on this
        edge would show up as a fake accuracy gap between the heuristic and the app.
        """
        lo, hi = 0.05, 0.16
        cuts = [lo, hi]
        self.assertEqual(heuristic_baseline.predict_level(lo - 1e-9, cuts), 0)
        self.assertEqual(heuristic_baseline.predict_level(lo, cuts), 1)
        self.assertEqual(heuristic_baseline.predict_level(hi - 1e-9, cuts), 1)
        self.assertEqual(heuristic_baseline.predict_level(hi, cuts), 2)
        self.assertEqual(heuristic_baseline.predict_level(1e6, cuts), 2)

    def test_it_reads_the_shipped_thresholds_rather_than_its_own(self):
        covered = heuristic_baseline.covered_axes()
        self.assertEqual(set(covered), {"oil", "redness", "pores"})
        for axis in covered:
            spec = model_contract.fallback_heuristic()["axes"][axis]
            self.assertEqual(len(spec["thresholds"]), aru_axes.levels_for(axis) - 1)
            self.assertTrue(spec["feature"])

    def test_a_perfect_heuristic_scores_one_and_a_useless_one_scores_zero(self):
        """Scored through ordinal_metrics, the same code that scores the model."""
        levels = {"oil": 3}
        # Features placed squarely inside each band, labels agreeing.
        perfect = [
            _FakeRow({"oil": 0}, {"shine": "0.01"}),
            _FakeRow({"oil": 1}, {"shine": "0.10"}),
            _FakeRow({"oil": 2}, {"shine": "0.30"}),
        ] * 10
        report = heuristic_baseline.score(perfect, ("oil",), levels)["oil"]
        self.assertEqual(report["scoredRows"], 30)
        self.assertEqual(report["accuracy"], 1.0)
        self.assertEqual(report["qwk"], 1.0)

        # Same features, labels shuffled so the rule carries nothing.
        useless = [_FakeRow({"oil": i % 3}, {"shine": "0.01"}) for i in range(30)]
        useless_report = heuristic_baseline.score(useless, ("oil",), levels)["oil"]
        self.assertEqual(useless_report["qwk"], 0.0)

    def test_rows_without_the_feature_are_reported_not_guessed(self):
        """"The heuristic scored well" and "it was scored on two rows" must differ."""
        rows = [
            _FakeRow({"oil": 0}, {"shine": "0.01"}),
            _FakeRow({"oil": 2}, {"shine": "0.30"}),
            _FakeRow({"oil": 1}, {"shine": ""}),      # unmeasured
            _FakeRow({"oil": 1}, {}),                  # column absent
            _FakeRow({"oil": 1}, {"shine": "n/a"}),   # unparseable
            _FakeRow({"oil": None}, {"shine": "0.1"}),  # unlabelled: not counted at all
        ]
        report = heuristic_baseline.score(rows, ("oil",), {"oil": 3})["oil"]
        self.assertEqual(report["labelledRows"], 5)
        self.assertEqual(report["scoredRows"], 2)
        self.assertEqual(report["skippedNoFeature"], 3)

    def test_a_malformed_threshold_list_is_rejected_not_masked(self):
        """A short list makes the heuristic WEAKER, which makes the gate easier."""
        rows = [_FakeRow({"oil": 0}, {"shine": "0.01"})]
        for bad in ([0.05], [0.05, 0.16, 0.5], [0.16, 0.05], []):
            with self.subTest(thresholds=bad):
                spec = {"axes": {"oil": {"feature": "shine", "thresholds": bad}}}
                original = heuristic_baseline.model_contract.fallback_heuristic
                heuristic_baseline.model_contract.fallback_heuristic = lambda: spec
                try:
                    with self.assertRaises(ValueError):
                        heuristic_baseline.score(rows, ("oil",), {"oil": 3})
                finally:
                    heuristic_baseline.model_contract.fallback_heuristic = original

    def test_an_out_of_range_label_is_rejected(self):
        """A negative label would index from the end of the matrix and corrupt counts."""
        for bad in (-1, 3, True, "1"):
            with self.subTest(label=bad):
                with self.assertRaises(ValueError):
                    heuristic_baseline.score(
                        [_FakeRow({"oil": bad}, {"shine": "0.01"})], ("oil",), {"oil": 3}
                    )

    def test_an_axis_the_heuristic_does_not_cover_is_absent(self):
        report = heuristic_baseline.score(
            [_FakeRow({"wrinkles": 1}, {"shine": "0.1"})], ("wrinkles",), {"wrinkles": 4}
        )
        self.assertNotIn("wrinkles", report)


class NonFiniteFeature(unittest.TestCase):
    """A feature value that is not a finite number must never become a prediction.

    Three code paths in this repository met the same situation and disagreed.
    `run_pipeline.feature_summary` drops it (`math.isfinite`). `as_feature_float`, which
    the promotion gate's baseline uses, returns None for it. And until 2026-09-23
    `run_pipeline.heuristic_baseline` graded it: `nan < lo` and `nan < hi` are both
    False, so `bucket` returned 2 -- the most severe level -- with full confidence, and
    the row counted in `n`.

    The cell it lands in is the worst one there is. An actual-0 row predicted 2 is a
    two-level miss, which quadratic weighting punishes four times as hard as a one-level
    miss, so a handful of unmeasurable rows moves the qwk the promotion gate compares a
    model against. Measured before the fix on 16 rows whose 12 measurable ones the
    shipped cuts grade perfectly: 75.0% on 16 labels, the 4 NaN rows sitting at
    actual=0/predicted=2. After: 100.0% on 12, with 4 reported as unusable.
    docs/non-finite-feature-policy.md.
    """

    ROWS = (
        [{"features": {"shine": 0.01}, "labels": {"oil": 0}}] * 4
        + [{"features": {"shine": 0.10}, "labels": {"oil": 1}}] * 4
        + [{"features": {"shine": 0.30}, "labels": {"oil": 2}}] * 4
    )

    def test_the_two_screens_agree_on_every_shape_the_export_can_carry(self):
        # feature_summary and as_feature_float are the two screens that were already
        # right; this pins them together so a change to one is a failure and not a
        # third policy.
        for value in (float("nan"), float("inf"), float("-inf"), None, "", "  ", "abc", True):
            summarised = run_pipeline.feature_summary([{"features": {"shine": value}, "labels": {}}])
            self.assertEqual(summarised, {}, f"feature_summary kept {value!r}")
            self.assertIsNone(heuristic_baseline.as_feature_float(value), f"as_feature_float kept {value!r}")
        for value in (0.0, -1.5, 12, "0.25"):
            self.assertIsNotNone(
                heuristic_baseline.as_feature_float(value), f"as_feature_float dropped the usable {value!r}"
            )

    def test_a_non_finite_feature_is_not_graded_as_the_top_level(self):
        for label, value in (("NaN", float("nan")), ("+inf", float("inf")), ("-inf", float("-inf"))):
            rows = list(self.ROWS) + [{"features": {"shine": value}, "labels": {"oil": 0}}] * 4
            oil = run_pipeline.heuristic_baseline(rows)["oil"]
            self.assertEqual(oil["n"], 12, f"{label} rows were graded")
            self.assertEqual(oil["unusable"], 4, f"{label} rows were dropped without being reported")
            self.assertEqual(oil["accuracy"], 1.0, f"{label} rows moved the accuracy")
            self.assertEqual(
                oil["confusion"]["0"],
                {"0": 4, "1": 0, "2": 0},
                f"a {label} feature reached the confusion matrix as a prediction",
            )

    def test_a_missing_feature_value_does_not_take_the_run_down(self):
        # `float(None)` raises TypeError, and this function is called once per report
        # run, so one such row ended the whole pipeline rather than one axis.
        rows = list(self.ROWS) + [{"features": {"shine": None}, "labels": {"oil": 0}}]
        oil = run_pipeline.heuristic_baseline(rows)["oil"]
        self.assertEqual((oil["n"], oil["unusable"]), (12, 1))

    def test_the_dropped_rows_are_reported_rather_than_skipped_in_silence(self):
        rows = list(self.ROWS) + [{"features": {"shine": float("nan")}, "labels": {"oil": 0}}] * 4
        summary = {
            "counts": {"labels": 40, "crops": 40},
            "labels": {"distribution": {"oil": {"0": 1, "1": 1, "2": 1}}},
            "heuristic_baseline": run_pipeline.heuristic_baseline(rows),
        }
        warnings = [w for w in run_pipeline.warnings_for(summary) if w.startswith("oil:")]
        self.assertEqual(len(warnings), 1, f"no warning names the dropped rows: {warnings}")
        self.assertIn("4 labelled row(s)", warnings[0])
        self.assertIn("12 were", warnings[0])

    def test_a_clean_run_reports_nothing_dropped(self):
        oil = run_pipeline.heuristic_baseline(list(self.ROWS))["oil"]
        self.assertEqual((oil["n"], oil["unusable"], oil["accuracy"]), (12, 0, 1.0))
        summary = {
            "counts": {"labels": 40, "crops": 40},
            "labels": {"distribution": {"oil": {"0": 1, "1": 1, "2": 1}}},
            "heuristic_baseline": run_pipeline.heuristic_baseline(list(self.ROWS)),
        }
        self.assertEqual([w for w in run_pipeline.warnings_for(summary) if w.startswith("oil:")], [])


class BeatsHeuristic(unittest.TestCase):
    DIMS = {"tone": {
        "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
        "tan": {"accuracy": 0.88, "ordinal_mae": 0.1, "n": 40},
    }}

    def gate(self, model_qwk, baseline, covered=("oil",), gain=0.0):
        # scoredRows in these fixtures matches n: the subset-equality rule is exercised
        # by its own cases below, not smuggled into every other assertion.
        overall = {"oil": {"n": 100, "accuracy": 0.90, "qwk": model_qwk, "pearson": 0.75}}
        return subgroups.promotion_check(
            overall, self.DIMS, ("oil",), 20, 0.1,
            0.4, 0.4,
            baseline=baseline, min_qwk_gain=gain, baseline_axes=covered,
        )

    def test_a_model_worse_than_the_heuristic_is_not_promotable(self):
        """Every absolute bar passes; it is still worse than what ships today."""
        gate = self.gate(0.55, {"oil": {"qwk": 0.60, "scoredRows": 100}})
        # The ordinal floor is satisfied — this axis is blocked purely for losing to
        # the rule it would replace, which is the distinction this test exists for.
        self.assertEqual(gate["ordinal"]["oil"]["qwk"], 0.55)
        self.assertNotIn("below the floor", " ".join(gate["blockers"]))
        self.assertFalse(gate["promotable"])
        self.assertIn("does not beat the shipped heuristic", " ".join(gate["blockers"]))

    def test_a_tie_does_not_count_as_beating_it(self):
        gate = self.gate(0.60, {"oil": {"qwk": 0.60, "scoredRows": 100}})
        self.assertFalse(gate["promotable"])
        self.assertEqual(gate["beatsHeuristic"]["oil"]["gain"], 0.0)

    def test_a_model_that_beats_it_passes(self):
        gate = self.gate(0.70, {"oil": {"qwk": 0.60, "scoredRows": 100}})
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertTrue(gate["beatsHeuristic"]["oil"]["beats"])
        self.assertAlmostEqual(gate["beatsHeuristic"]["oil"]["gain"], 0.10)

    def test_an_unscored_heuristic_blocks_rather_than_being_a_free_pass(self):
        """A pretrain on external data carries none of ARU's ROI features.

        "We never scored the heuristic" must not read the same as "the model won".
        """
        for baseline in (None, {}, {"oil": {"qwk": 0.5, "scoredRows": 0}}):
            with self.subTest(baseline=baseline):
                gate = self.gate(0.90, baseline)
                self.assertFalse(gate["promotable"])
                self.assertIn("was not scored on this validation split", " ".join(gate["blockers"]))

    def test_a_comparison_across_different_rows_blocks(self):
        """The load-bearing property: both qwk values must come from the same rows.

        The model is scored on every labelled row; the heuristic can only be scored on
        labelled rows that also carry its ROI feature. If even one row has a label and
        no feature, the difference between the two numbers is not attributable to the
        model, so there is nothing to conclude from it.
        """
        overall = {"oil": {"n": 100, "accuracy": 0.90, "qwk": 0.90, "pearson": 0.75}}
        base = {"oil": {"qwk": 0.10, "scoredRows": 93, "skippedNoFeature": 7}}
        gate = subgroups.promotion_check(
            overall, self.DIMS, ("oil",), 20, 0.1, 0.4, 0.4,
            baseline=base, min_qwk_gain=0.0, baseline_axes=("oil",),
        )
        # The model "wins" by 0.80 and it still must not pass.
        self.assertFalse(gate["promotable"])
        self.assertIn("do not come from the same rows", " ".join(gate["blockers"]))
        self.assertEqual(gate["beatsHeuristic"]["oil"]["modelScoredRows"], 100)

    def test_equal_row_counts_are_required_not_merely_reported(self):
        overall = {"oil": {"n": 50, "accuracy": 0.90, "qwk": 0.70, "pearson": 0.75}}
        for scored, ok in ((50, True), (49, False), (51, False)):
            with self.subTest(scored=scored):
                gate = subgroups.promotion_check(
                    overall, self.DIMS, ("oil",), 20, 0.1, 0.4, 0.4,
                    baseline={"oil": {"qwk": 0.50, "scoredRows": scored, "skippedNoFeature": 0}},
                    min_qwk_gain=0.0, baseline_axes=("oil",),
                )
                self.assertEqual(gate["promotable"], ok)

    def test_a_non_finite_qwk_on_either_side_blocks(self):
        for bad in (float("nan"), float("inf")):
            with self.subTest(bad=bad):
                self.assertFalse(self.gate(0.9, {"oil": {"qwk": bad, "scoredRows": 50}})["promotable"])
                self.assertFalse(self.gate(bad, {"oil": {"qwk": 0.5, "scoredRows": 50}})["promotable"])

    def test_an_uncovered_axis_is_asked_nothing(self):
        """No heuristic exists for it, so there is nothing to beat."""
        gate = self.gate(0.70, {}, covered=())
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertEqual(gate["beatsHeuristic"], {})

    def test_a_missing_manifest_does_not_delete_the_rule(self):
        """The gate used to fail OPEN here, in the scenario the repo already anticipates.

        fallback_heuristic() returned {} when the manifest was unreadable, so
        covered_axes() went empty, every axis was skipped, and a model was promotable
        having never been compared to the rule it would replace. Every other floor
        survived that; this one evaporated.
        """
        original = model_contract.MANIFEST_PATH
        model_contract.MANIFEST_PATH = Path("/nonexistent/manifest.json")
        try:
            self.assertIn("built-in fallback", model_contract.source())
            covered = heuristic_baseline.covered_axes()
            self.assertEqual(set(covered), {"oil", "redness", "pores"})
            gate = subgroups.promotion_check(
                {"oil": {"n": 100, "accuracy": 0.9, "qwk": 0.9, "pearson": 0.9}},
                self.DIMS, ("oil",), 20, 0.1, 0.4, 0.4,
                baseline={}, min_qwk_gain=0.0, baseline_axes=covered,
            )
            self.assertFalse(gate["promotable"])
        finally:
            model_contract.MANIFEST_PATH = original

    def test_the_fallback_heuristic_matches_the_shipped_one(self):
        """Two copies of the rule; they must not drift."""
        shipped = model_contract.load_manifest()["fallbackHeuristic"]["axes"]
        fallback = model_contract.FALLBACK_HEURISTIC["axes"]
        self.assertEqual(set(shipped), set(fallback))
        for axis, spec in shipped.items():
            self.assertEqual(spec["feature"], fallback[axis]["feature"])
            self.assertEqual(list(spec["thresholds"]), list(fallback[axis]["thresholds"]))

    def test_the_margin_comes_from_the_shipped_manifest(self):
        self.assertEqual(
            model_contract.min_qwk_gain_over_heuristic(),
            float(model_contract.promotion_gate()["minQwkGainOverHeuristic"]),
        )
        trainer = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()
        self.assertIn("model_contract.min_qwk_gain_over_heuristic()", trainer)
        self.assertIn("heuristic_baseline.score(", trainer)
        self.assertIn("heuristic_baseline.covered_axes()", trainer)


def _paired_rows(n, model_noise, heur_noise, shared, seed, levels=3):
    """(truth, model_level, heuristic_level) rows on one axis.

    `shared` in [0, 1] is how much of each scorer's error draw comes from ONE per-row
    difficulty draw that both scorers see: 0 makes their errors conditionally
    independent given the truth, 1 makes a row that fools one fool the other. That
    knob is the whole point — whether resampling the two confusion matrices separately
    over-states the band depends on it and on nothing else.
    """
    import random as _random

    rng = _random.Random(seed)
    rows = []
    for _ in range(n):
        truth = rng.randrange(levels)
        difficulty = rng.random()
        model_draw = shared * difficulty + (1 - shared) * rng.random()
        heur_draw = shared * difficulty + (1 - shared) * rng.random()
        model = truth if model_draw > model_noise else rng.randrange(levels)
        heuristic = truth if heur_draw > heur_noise else rng.randrange(levels)
        rows.append((truth, model, heuristic))
    return rows


def _confusions(rows, levels=3):
    model = [[0] * levels for _ in range(levels)]
    heuristic = [[0] * levels for _ in range(levels)]
    for truth, model_level, heuristic_level in rows:
        model[truth][model_level] += 1
        heuristic[truth][heuristic_level] += 1
    return model, heuristic


class QwkNoiseBand(unittest.TestCase):
    """The band on a qwk gain: the thing minQwkGainOverHeuristic = 0.0 lacks."""

    def test_quantile_is_the_linear_convention_and_not_an_index_into_the_sample(self):
        """scipy's percentile bootstrap calls numpy's default `linear` method.

        Pinned against values computed by hand from that definition — virtual index
        q*(n-1), linear interpolation between neighbours — because an off-by-one index
        convention changes every bound this module prints and changes nothing that
        looks wrong.
        """
        sample = [0.0, 1.0, 2.0, 3.0, 4.0]  # n = 5, so the virtual index is 4q
        self.assertAlmostEqual(qwk_noise.quantile(sample, 0.0), 0.0)
        self.assertAlmostEqual(qwk_noise.quantile(sample, 1.0), 4.0)
        self.assertAlmostEqual(qwk_noise.quantile(sample, 0.5), 2.0)
        self.assertAlmostEqual(qwk_noise.quantile(sample, 0.025), 0.1)
        self.assertAlmostEqual(qwk_noise.quantile(sample, 0.975), 3.9)
        # n=4: index 3q, so 0.25 lands three quarters of the way into the first gap.
        self.assertAlmostEqual(qwk_noise.quantile([10.0, 20.0, 30.0, 40.0], 0.25), 17.5)
        self.assertEqual(qwk_noise.quantile([7.5], 0.3), 7.5)
        with self.assertRaises(ValueError):
            qwk_noise.quantile([1.0, 2.0], 1.5)
        with self.assertRaises(ValueError):
            qwk_noise.quantile([], 0.5)

    def test_a_resample_draws_the_same_number_of_rows_with_replacement(self):
        import random as _random

        matrix = [[40, 9, 1], [8, 55, 7], [2, 11, 37]]
        total = sum(sum(row) for row in matrix)
        rng = _random.Random(3)
        differed = 0
        for _ in range(200):
            sampled = qwk_noise.resample_confusion(matrix, rng)
            self.assertEqual(len(sampled), len(matrix))
            self.assertEqual(sum(sum(row) for row in sampled), total)
            if sampled != matrix:
                differed += 1
        # Sampling WITHOUT replacement would reproduce the input every single time,
        # and every band would collapse to a point. This is what catches that.
        self.assertGreater(differed, 190, "resampling is not varying the matrix")

    def test_two_identical_scorers_get_a_band_straddling_zero(self):
        matrix = [[30, 8, 2], [6, 40, 9], [1, 9, 35]]
        band = qwk_noise.gain_band_from_confusions(matrix, matrix, resamples=400, seed=1)
        self.assertAlmostEqual(band["point"], 0.0)
        self.assertLess(band["lo"], 0.0)
        self.assertGreater(band["hi"], 0.0)
        self.assertIs(qwk_noise.clears_band(band, 0.0), False)

    def test_a_gain_smaller_than_the_band_is_not_distinguishable_from_zero(self):
        """The case the backlog item names: a model that wins by a hair on one split."""
        rows = _paired_rows(300, model_noise=0.48, heur_noise=0.50, shared=1.0, seed=2026)
        model, heuristic = _confusions(rows)
        band = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=600, seed=7)
        self.assertGreater(band["point"], 0.0, "fixture must have a positive raw gain")
        self.assertLess(band["lo"], 0.0)
        self.assertIs(qwk_noise.clears_band(band, 0.0), False)

    def test_a_clearly_better_model_does_clear_its_band(self):
        """A band that never clears would be a guard that fails everything."""
        rows = _paired_rows(300, model_noise=0.10, heur_noise=0.60, shared=1.0, seed=2026)
        model, heuristic = _confusions(rows)
        band = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=600, seed=7)
        self.assertIs(qwk_noise.clears_band(band, 0.0), True)
        self.assertGreater(band["lo"], 0.0)

    def test_the_band_is_reproducible_and_the_seed_is_doing_something(self):
        model, heuristic = _confusions(
            _paired_rows(200, 0.30, 0.55, shared=0.5, seed=11)
        )
        first = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=300, seed=5)
        again = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=300, seed=5)
        other = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=300, seed=6)
        self.assertEqual((first["lo"], first["hi"]), (again["lo"], again["hi"]))
        self.assertNotEqual((first["lo"], first["hi"]), (other["lo"], other["hi"]))

    def test_the_interval_is_two_sided_at_the_requested_confidence(self):
        """`confidence` must split the excluded mass between BOTH tails.

        Added after a break that nothing caught: changing alpha from (1-c)/2 to (1-c)
        left all 120 tests green, because every other case reads a 95% band where the
        two conventions still both produce a plausible-looking interval. At c=0.5 they
        do not — the two-sided reading gives the 25th and 75th percentiles, the
        one-sided reading gives the median twice and a band of width zero.
        """
        model, heuristic = _confusions(_paired_rows(250, 0.30, 0.55, 1.0, seed=31))
        half = qwk_noise.gain_band_from_confusions(
            model, heuristic, resamples=400, confidence=0.5, seed=5
        )
        wide = qwk_noise.gain_band_from_confusions(
            model, heuristic, resamples=400, confidence=0.95, seed=5
        )
        self.assertGreater(
            half["hi"] - half["lo"], 0.0,
            "a 50% interval collapsed to a point: alpha is not being halved",
        )
        # Narrower confidence must pull BOTH ends in, not just one.
        self.assertGreater(half["lo"], wide["lo"])
        self.assertLess(half["hi"], wide["hi"])

    def test_the_unpaired_band_is_not_narrower_than_the_paired_one(self):
        """The approximation the trainer is stuck with, bounded rather than assumed.

        `run_epoch` keeps a confusion matrix and no per-row predictions, so the gate can
        only resample the two matrices separately — which treats two scorers run on the
        SAME rows as independent. That is only safe if it does not UNDER-state the
        spread. On rows where both scorers fail together, which is the realistic case
        for a model and a threshold rule reading the same photograph, it over-states it.
        """
        rows = _paired_rows(300, 0.35, 0.50, shared=1.0, seed=404)
        model, heuristic = _confusions(rows)
        paired = qwk_noise.gain_band_paired(rows, 3, resamples=600, seed=17)
        unpaired = qwk_noise.gain_band_from_confusions(model, heuristic, resamples=600, seed=17)
        paired_width = paired["hi"] - paired["lo"]
        unpaired_width = unpaired["hi"] - unpaired["lo"]
        self.assertGreater(
            unpaired_width, paired_width,
            f"unpaired {unpaired_width:.4f} is narrower than paired {paired_width:.4f}",
        )
        # Both describe the same comparison, so their point estimates must agree
        # exactly — they are read off the same counts.
        self.assertAlmostEqual(paired["point"], unpaired["point"])

    def test_a_band_needs_rows_and_says_so_instead_of_raising(self):
        empty = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        matrix = [[30, 8, 2], [6, 40, 9], [1, 9, 35]]
        band = qwk_noise.gain_band_from_confusions(matrix, empty, resamples=50, seed=1)
        self.assertIsNone(band["lo"])
        self.assertIsNone(qwk_noise.clears_band(band, 0.0))
        with self.assertRaises(ValueError):
            qwk_noise.gain_band_from_confusions(matrix, matrix, resamples=1)
        with self.assertRaises(ValueError):
            qwk_noise.gain_band_from_confusions(matrix, matrix, confidence=1.0)

    def test_a_level_outside_the_axis_is_rejected_by_the_paired_form(self):
        with self.assertRaises(ValueError):
            qwk_noise.gain_band_paired([(0, 1, 3)], 3, resamples=10)
        with self.assertRaises(ValueError):
            qwk_noise.gain_band_paired([(0, True, 1)], 3, resamples=10)


class NoiseBandInTheGate(unittest.TestCase):
    """The band reaches the gate report, and it does not decide anything there."""

    DIMS = {"tone": {
        "light": {"accuracy": 0.90, "ordinal_mae": 0.1, "n": 40},
        "tan": {"accuracy": 0.88, "ordinal_mae": 0.1, "n": 40},
    }}

    def gate(self, rows):
        model_matrix, heuristic_matrix = _confusions(rows)
        model = ordinal_metrics.metrics_from_confusion({"oil": model_matrix})["oil"]
        heuristic = ordinal_metrics.metrics_from_confusion({"oil": heuristic_matrix})["oil"]
        overall = {"oil": {
            "n": len(rows), "accuracy": model["accuracy"],
            "qwk": model["qwk"], "pearson": 0.75,
        }}
        baseline = {"oil": {
            "qwk": heuristic["qwk"], "scoredRows": len(rows),
            "confusion": heuristic_matrix,
        }}
        return subgroups.promotion_check(
            overall, self.DIMS, ("oil",), 20, 0.1, 0.4, 0.4,
            baseline=baseline, min_qwk_gain=0.0, baseline_axes=("oil",),
            model_confusion={"oil": model_matrix},
        )

    def test_a_hair_thin_gain_still_promotes_but_the_report_says_it_is_noise(self):
        """Non-negotiable: the published rule is `gain > 0.0` and this does not move it.

        Changing that rule means editing promotionGate in the shipped manifest, which is
        the owner's decision. What this adds is that the report no longer calls a gain
        inside its own sampling error a win without saying so.
        """
        gate = self.gate(_paired_rows(300, 0.48, 0.50, shared=1.0, seed=2026))
        entry = gate["beatsHeuristic"]["oil"]
        self.assertTrue(entry["beats"])
        self.assertIs(entry["clearsNoiseBand"], False)
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertEqual(gate["blockers"], [])
        self.assertIn("does not clear its own", " ".join(gate["warnings"]))
        self.assertLess(entry["gainNoiseBand"]["lo"], 0.0)

    def test_a_real_win_carries_no_warning(self):
        gate = self.gate(_paired_rows(300, 0.10, 0.60, shared=1.0, seed=2026))
        entry = gate["beatsHeuristic"]["oil"]
        self.assertIs(entry["clearsNoiseBand"], True)
        self.assertEqual(gate["warnings"], [])
        self.assertTrue(gate["promotable"], gate["blockers"])

    def test_without_a_confusion_matrix_there_is_no_band_and_no_crash(self):
        """Every existing caller passes metrics only. None of them may start failing."""
        gate = subgroups.promotion_check(
            {"oil": {"n": 100, "accuracy": 0.9, "qwk": 0.70, "pearson": 0.75}},
            self.DIMS, ("oil",), 20, 0.1, 0.4, 0.4,
            baseline={"oil": {"qwk": 0.60, "scoredRows": 100}},
            min_qwk_gain=0.0, baseline_axes=("oil",),
        )
        self.assertTrue(gate["promotable"], gate["blockers"])
        self.assertNotIn("gainNoiseBand", gate["beatsHeuristic"]["oil"])
        self.assertEqual(gate["warnings"], [])

    def test_a_mis_shaped_matrix_is_ignored_rather_than_banded(self):
        """A 4x4 model matrix against a 3x3 heuristic is not this comparison."""
        rows = _paired_rows(200, 0.30, 0.55, shared=1.0, seed=9)
        model_matrix, heuristic_matrix = _confusions(rows)
        four = [row + [0] for row in model_matrix] + [[0, 0, 0, 0]]
        self.assertIsNone(subgroups._gain_noise_band(four, heuristic_matrix))
        self.assertIsNone(subgroups._gain_noise_band(None, heuristic_matrix))
        self.assertIsNotNone(subgroups._gain_noise_band(model_matrix, heuristic_matrix))

    def test_the_heuristic_baseline_hands_over_the_matrix_the_band_needs(self):
        """A band re-derived from a second matrix would not be a band on THIS split."""
        class Row:
            def __init__(self, label, shine):
                self.labels = {"oil": label}
                self.meta = {"shine": shine}

        rows = [Row(0, 0.01), Row(1, 0.10), Row(2, 0.30), Row(1, 0.09), Row(0, 0.02)]
        report = heuristic_baseline.score(rows, ("oil",), {"oil": 3})
        matrix = report["oil"]["confusion"]
        self.assertEqual(len(matrix), 3)
        self.assertEqual(sum(sum(r) for r in matrix), report["oil"]["scoredRows"])
        self.assertEqual(
            ordinal_metrics.metrics_from_confusion({"oil": matrix})["oil"]["qwk"],
            report["oil"]["qwk"],
        )


class PromotedCheckpointIsWhatTheGateScores(unittest.TestCase):
    """The defect PR #69 fixed had no guard, so reintroducing it was free.

    The trainer saves the BEST checkpoint by mean validation accuracy and separately
    kept `last_val_confusion`, which is always the FINAL epoch's. Feeding that to the
    gate scored weights nobody was going to ship. The fix re-runs validation after the
    best checkpoint is reloaded. These assertions are on the trainer's source text
    because the trainer imports torch at module scope and this file cannot.
    """

    SOURCE = (Path(__file__).resolve().parent / "train_visible_attributes.py").read_text()

    def test_the_gate_reads_a_validation_pass_taken_after_the_checkpoint_is_reloaded(self):
        reload_at = self.SOURCE.index('model.load_state_dict(checkpoint["model"])')
        rescore_at = self.SOURCE.index("_, promoted_val_confusion, _ = run_epoch(")
        scored_at = self.SOURCE.index(
            "final_val_metrics = metrics_from_confusion(promoted_val_confusion)"
        )
        gate_at = self.SOURCE.index("gate = promotion_check(")
        self.assertLess(
            reload_at, rescore_at,
            "the promoted checkpoint is scored BEFORE it is loaded, so the gate reads "
            "whatever weights happened to be in memory",
        )
        self.assertLess(rescore_at, scored_at)
        self.assertLess(scored_at, gate_at)

    def test_the_last_epochs_confusion_never_reaches_the_gate(self):
        self.assertNotIn(
            "final_val_metrics = metrics_from_confusion(last_val_confusion)", self.SOURCE
        )
        # Kept and reported under its own name, so the two are never confusable again.
        self.assertIn('"last_epoch_val_confusion": last_val_confusion,', self.SOURCE)
        self.assertIn('"final_val_confusion": promoted_val_confusion,', self.SOURCE)

    def test_the_band_is_computed_on_the_promoted_checkpoints_confusion(self):
        self.assertIn("model_confusion=promoted_val_confusion,", self.SOURCE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
