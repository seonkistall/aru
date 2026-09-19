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

        Two of the seven registry indices are covered, and to different depths. Only
        the shine rows pin the PATH as well as the formula (the TypeScript side
        rebuilds each frame); the tone_evenness rows pin the formula alone, because
        its inputs — the four region L* values — are not an exported field. The other
        five are name-pinned and value-unchecked: docs/shine-formula-decision.md.
        """
        table = json.loads((Path(__file__).resolve().parent / "index-parity.json").read_text(encoding="utf-8"))
        indices = table["indices"]
        self.assertEqual(set(indices), {"shine_ratio", "tone_evenness", "blemish_count"})
        # Whatever is pinned has to be a real index declaring the real app field.
        for index_id, group in indices.items():
            self.assertIn(index_id, skin_indices.INDEX_BY_ID)
            self.assertEqual(skin_indices.FEATURE_KEY[index_id], group["featureKey"])

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
