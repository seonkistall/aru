#!/usr/bin/env python3
"""Skin indices computed from pixels, and which of them survive a change of phone.

Why this exists
---------------
Five ARU axes — 유분, 홍조, 건조, 트러블, 색감 — have no public labelled dataset that
permits shipping (docs/skin-dataset-survey.md). The way out is to stop treating four of
them as classification problems. Redness, oil, tone evenness and blemish count are
measurements, and a measurement needs a formula and a reference, not a training set.

The catch, measured
-------------------
A benchmark on 965 Korean subjects photographed on a DSLR, a tablet and a smartphone
in the same session (AI-Hub 028; https://github.com/hpicsk/regional-ccm, manuscript
srt_submission/main.tex and the auto-generated parameters.tex) reports:

  * mean a* per device on the same faces: DSLR 17.9, tablet 10.5, smartphone 10.1
  * CIEDE2000 between devices before calibration: 13.27 (tablet-DSLR), 10.63 (phone-DSLR)
  * a linear colour-correction matrix removes 61-74% of that, leaving dE 3.46 / 4.14
  * inter-device ICC after global CCM: melanin 0.797, ITA 0.776, L* 0.783,
    a* 0.725, b* 0.713 — a* and b* only "moderate" on the Koo & Li bands
  * ITA-based skin-type assignment disagrees across devices for 39.2% (tablet) and
    45.0% (smartphone) of samples under global calibration, 19.9% / 27.5% with
    region-specific calibration, and 98.3% of those errors land in an adjacent band
  * factorial ANOVA on pre-calibration colour: device explains eta^2 = 0.1165 and
    region eta^2 = 0.1772, while the subject's own skin condition explains
    eta^2 = 0.0006 and is not significant (p = 0.115)

Read the last line twice. On uncalibrated consumer photos, which phone took the picture
matters roughly 200x more for colour than what the person's skin is actually like. A
model trained to predict skin type from absolute colour would mostly learn the camera.

The design that follows from it
-------------------------------
Every index below declares its transfer class:

  WITHIN_IMAGE  compares two regions of the same photo. Whatever the device and the
                illuminant did, they did it to both regions, so the difference carries
                the skin signal and cancels most of the hardware term. Shippable.
  ABSOLUTE      a single number off one patch. Carries the device and the illuminant
                with it. Usable as a stratifier or a recorded covariate; never as a
                product-facing severity on its own.

ARU already computed relative shine and relative redness this way. This module makes
that property explicit, testable, and extends it to the axes that had no feature at all.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

WITHIN_IMAGE = "within_image"
ABSOLUTE = "absolute"

#: Del Bino & Bernerd cutpoints, same edges as ml/subgroups.py and lib/tone-bands.ts.
ITA_BIN_EDGES = (-30.0, 10.0, 28.0, 41.0, 55.0)

#: Measured inter-device disagreement for 6-band ITA typing, worst device, global CCM.
ITA_SIXBAND_CROSS_DEVICE_DISAGREEMENT = 0.450
#: Share of those disagreements that land one band away rather than further.
ITA_DISAGREEMENT_ADJACENT_SHARE = 0.983


@dataclass(frozen=True)
class Index:
    id: str
    transfer: str
    axis: str
    note: str

    @property
    def shippable_alone(self) -> bool:
        """Whether this index may drive a user-facing reading with no other evidence."""
        return self.transfer == WITHIN_IMAGE


INDICES: tuple[Index, ...] = (
    Index("relative_redness", WITHIN_IMAGE, "redness",
          "Red chromaticity R/(R+G+B) of the target region minus that of a reference "
          "region in the same frame. An a* difference until 2026-09-20; it is not "
          "scale-free, and relative_redness() says what replaced it and why."),
    Index("tone_evenness", WITHIN_IMAGE, "tone",
          "Spread of L* across facial regions of one frame. Uniformity, not lightness."),
    Index("shine_ratio", WITHIN_IMAGE, "oil",
          "T-zone specular pixel fraction plus the T-zone/cheek Weber contrast, same frame."),
    Index("blemish_count", WITHIN_IMAGE, "trouble",
          "Count of local a* maxima per face-width-squared of sampled skin. Morphology, not colour level."),
    Index("roughness_ratio", WITHIN_IMAGE, "dryness",
          "High-frequency energy of a region over a smooth reference region. The weakest "
          "of the five: phone denoising and sharpening differ, so it needs a survey answer "
          "alongside it before it says anything."),
    Index("melanin_index", ABSOLUTE, "stratifier",
          "100*log10(100/L*), Takiwaki via Yamamoto. Inter-device ICC 0.797 after CCM."),
    Index("ita", ABSOLUTE, "stratifier",
          "arctan((L*-50)/b*) in degrees. Inter-device ICC 0.776 after CCM; 6-band typing "
          "disagrees across devices for up to 45% of samples."),
)

INDEX_BY_ID = {index.id: index for index in INDICES}

#: Index id -> the feature key lib/skin.ts writes into every exported sample, for the
#: indices the app CARRIES. The column named here holds that index's own value.
#: tests/skin-index-contract.test.ts fails if the two sides drift apart.
FEATURE_KEY = {
    "relative_redness": "relRedness",
    "tone_evenness": "toneSpread",
    "shine_ratio": "shine",
    "blemish_count": "blemishDensity",
    "roughness_ratio": "roughnessRatio",
    "ita": "toneIta",
}

#: Index id -> the exported feature key it is computed FROM. An index listed here is
#: DERIVED OFFLINE: no column of any export holds its value, and the function of the
#: same name in this module is the only thing that produces it.
#:
#: The second kind of entry exists because `melanin_index` was in FEATURE_KEY against
#: "toneLstar" until 2026-09-20 and the declaration was false. FEATURE_KEY's contract
#: is "the feature key lib/skin.ts writes into every exported sample", so a reader
#: resolving melanin_index through it got L* itself: at L* = 70 the index is 15.49 and
#: the declared column holds 70. It is not a rounding gap or a units gap — the index is
#: 100*log10(100/L*), a nonlinear transform of the column that was named as its value.
#:
#: Which side moves was settled by looking at the benchmark this module cites rather
#: than by preference. hpicsk/regional-ccm computes the melanin index from CIELAB L*
#: too (src/clinical.py:compute_melanin_index) — it is a quantity derived from a
#: lightness reading, not a separate measurement a camera path would make — so adding
#: an app-side field would invent an export column with no reader. Verified against
#: that source 2026-09-20: docs/melanin-index-verification.md.
#:
#: Nothing in the pipeline reads this map yet: `melanin_index()` has no caller outside
#: ml/selftest.py. That is the point — the declaration was wrong in the one place a
#: first caller would have looked.
DERIVED_FROM = {
    "melanin_index": "toneLstar",
}

#: Feature keys added by the within-image indices, in export column order. The
#: pipeline scripts read this instead of each repeating the list.
NEW_FEATURE_KEYS = ("toneSpread", "roughnessRatio", "blemishCount", "blemishDensity")


def melanin_index(lstar: float) -> float:
    """Takiwaki's melanin index on the CIELAB substitution. ABSOLUTE.

    DERIVED, not carried: `DERIVED_FROM` names the export column this reads (toneLstar)
    and there is no column holding the result. Checked against the benchmark this module
    cites, hpicsk/regional-ccm `src/clinical.py:compute_melanin_index`, on 2026-09-20:
    the expression is the same `100 * log10(100 / L*)` and the low guard is the same
    value (`MI_L_STAR_FLOOR = 1.0` there, `max(lstar, 1.0)` here).

    The one deviation is the UPPER end: the reference clips to `[1.0, 100.0]` and this
    does not, so above L* = 100 the reference returns 0.0 and this returns a negative
    number. It is unreachable from a photo — L* from an 8-bit sRGB triple tops out at
    exactly 100.0 (measured over all 16,777,216 of them, docs/melanin-index-verification.md)
    — and it is left alone rather than "fixed", because clamping would make the function
    silently report pure white and a physically impossible L* as the same skin.
    """
    return 100.0 * math.log10(100.0 / max(lstar, 1.0))


def ita(lstar: float, bstar: float) -> float:
    """Individual Typology Angle in degrees. ABSOLUTE.

    `* 180 / math.pi` rather than `math.degrees`, and the reason is the one cycle 17
    recorded for `ml/ita.py`'s cube root: the more accurate expression is not the one
    that agrees with the app. `math.degrees(x)` multiplies by a single precomputed
    180/pi and rounds once; `lib/skin.ts:itaDegrees` computes `(x * 180) / Math.PI`
    and rounds twice. Over 1,186,709 (L*, b*) pairs the two associations are
    bit-identical on 74.5% and differ by up to 1.42e-14 degrees on the rest, which is
    0.71 units of `90 * 2**-52`. With this association CPython and V8 agree bit for
    bit on every row `ml/index-parity.json` commits, so the ita group's only remaining
    divergence is the one that matters.

    The guard, which cycle 19 pinned as divergent and did not decide, was decided
    2026-09-20: it is `bstar == 0` in all three implementations. This module used 1e-6
    where lib/skin.ts and ml/ita.py used 0.01, and because the +-90 fallback ignores the
    SIGN of b* the disagreement inside that window was 180 degrees rather than a
    rounding difference — `light` against `deep` on coarse_tone_band, from one frame.
    What settled which side moves is that a neutral grey is inside the wider window:
    r = g = b has a small negative b* under this matrix, 242 of the 256 8-bit greys
    satisfied `|b*| < 0.01` against 1 of 256 for `1e-6`, and on all 241 non-black ones
    the fallback returned the sign the limit does not have — so the narrow guard was
    the correct column and the narrowest correct guard is no window at all.
    docs/ita-guard-decision.md is the measurement. `== 0` rather than `abs(...) < eps`
    also covers -0.0, which CPython cannot divide by and V8 can.
    """
    if bstar == 0:
        return 90.0 if lstar > 50 else -90.0
    return math.atan((lstar - 50.0) / bstar) * 180 / math.pi


def red_chromaticity(r: float, g: float, b: float) -> float:
    """The red channel's share of a region's total signal. Mirrors `redChromaticity`
    in lib/skin.ts exactly, `|| 1` black-region branch included."""
    total = r + g + b
    return r / (total if total else 1.0)


def relative_redness(
    target_rgb: tuple[float, float, float],
    reference_rgb: tuple[float, float, float],
) -> float:
    """Redness of one region against another in the SAME frame. WITHIN_IMAGE.
    Mirrors `relativeRedness` in lib/skin.ts exactly.

    THIS SIGNATURE CHANGED ON 2026-09-20, and the reason is the same one that moved
    `shine_ratio` the day before.

    Until then this function was `target_astar - reference_astar` — a CIELAB a*
    difference — while the app returned a difference of RED CHROMATICITIES, with
    FEATURE_KEY declaring the two to be one field. Different colour space, different
    scale, one declared name, and nothing compared their values.

    Which one is right is a measurement, not a preference, and the measurement is not
    close. The docstring this replaces claimed that "the difference between two regions
    of one photo does not [move with the device], because both regions went through the
    same sensor and the same light". That is true of an ADDITIVE common term and false
    of a multiplicative one, and a device or an exposure is multiplicative. a* is
    homogeneous of degree 1/3 in the linear signal (the cube root in f()) and the linear
    signal is homogeneous of degree 2.4 in the 8-bit channel, so a common gain g takes
    a* — and therefore any DIFFERENCE of two a* values — to g**0.8 times itself. It
    factors out of the difference instead of cancelling in it. Verified against the
    shipped code to five decimals at four gains: docs/redness-formula-decision.md §D.

    Measured on one synthetic face, drift as a fraction of the index's own range over
    four faces of genuinely different redness (lower is better):

        nuisance              chromaticity      a* difference
        exposure 70..170            0.0209             0.5047
        melanin tone                0.0227             0.2545
        white balance               0.0624             0.2071
        tone curve                  0.3930             0.4076
        veiling flare               0.1878             0.1822

    The chromaticity difference wins by 24x, 11x and 3.3x on the three nuisances
    docs/label-free-axes.md names, and ties on the two transfer-function ones where
    neither form is invariant. There is no sweep on which the a* difference wins by a
    margin that matters.

    NO PUBLISHED VALUE MOVED when this changed: the app already computed this form,
    nothing in the pipeline ever called this function (run_pipeline.py, calibrate.py
    and prepare_crop_dataset.py all read the app's `relRedness` column straight out of
    the export), and its old inputs were a* values that no ARU export carries.

    ml/index-parity.json -> relative_redness is the committed table this and
    lib/skin.ts BOTH assert against, so the two cannot drift apart again in silence.
    """
    return red_chromaticity(*target_rgb) - red_chromaticity(*reference_rgb)


def tone_evenness(region_lstars: list[float]) -> float:
    """Spread of L* across regions of one frame, lower is more even. WITHIN_IMAGE.

    Divided by the mean, because a raw standard deviation of L* still moves with
    exposure: brighten the whole frame and the spread grows with it. The ratio does
    not, which is the property that makes this shippable. Same formula as
    `relativeSpread` in lib/skin.ts.

    Deliberately not a measure of how light the face is. ARU never grades that.
    """
    values = [value for value in region_lstars if isinstance(value, (int, float))]
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    if abs(mean) < 1e-6:
        return 0.0
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return math.sqrt(variance) / abs(mean)


#: Cheek luminance the brightness-gap term is normalised to. Mirrors
#: SHINE_REFERENCE_CHEEK_L in lib/skin.ts, which is where the choice of 140 is argued.
SHINE_REFERENCE_CHEEK_L = 140.0


def shine_ratio(tzone_specular: float, tzone_luminance: float, cheek_luminance: float) -> float:
    """The oil index. WITHIN_IMAGE. Mirrors `shineIndex` in lib/skin.ts exactly.

    Both terms are within-image. The first is the share of the untrimmed T-zone patch
    above the 218 luminance cut; the second is Weber contrast of the T-zone against the
    cheek, scaled so ATTR_THRESHOLDS.oil keeps meaning what it meant on a correctly
    exposed capture. Luminances are 0-255 frame luminance, not CIELAB L*.

    THIS SIGNATURE CHANGED ON 2026-09-19, and the reason is worth keeping.

    Until then this function was `tzone_specular / max(cheek_specular, 1e-6)` — a
    different formula from the app's under the same name, with FEATURE_KEY declaring
    the two to be one field. Nothing in the pipeline ever called it (run_pipeline.py
    and calibrate.py read the app's `shine` column straight out of the export), its
    second argument was never an exported ARU field, and measured on real frames it
    was degenerate: on a matte cheek `cheek_specular` is exactly 0, so the epsilon set
    the scale, and one glint pixel in 81 moved the index by a factor of 12,345.7. It was
    also not exposure-invariant on a face, which is the one property selftest asserted
    of it — a specular ratio is a threshold count fraction, so an exposure gain does
    not scale it. Full measurement and both tables: docs/shine-formula-decision.md.

    ml/index-parity.json is a committed table of inputs and outputs that this function
    and lib/skin.ts BOTH assert against, so a future divergence fails a test instead of
    living in the tree until somebody reads both files side by side, which is how this
    one was found.
    """
    denominator = cheek_luminance if cheek_luminance else 1.0
    gap = max(0.0, (tzone_luminance - cheek_luminance) / denominator)
    return tzone_specular + gap * (SHINE_REFERENCE_CHEEK_L / 255.0)


def roughness_ratio(region_highfreq: float, reference_highfreq: float) -> float:
    """Texture energy against a smooth reference region. WITHIN_IMAGE but weak.

    BOTH arguments are a region's high-frequency energy ALREADY DIVIDED BY THAT
    REGION'S OWN MEAN L*, which is what lib/skin.ts hands its counterpart:
    `normalizedHf = (region, meanL) => region && meanL > 1 ? region.highFreq / meanL
    : null` at lib/skin.ts:1166-1167, called with the cheeks at `cheekL` and the
    forehead at its own mean luminance at lib/skin.ts:1168-1169. The docstring used
    to say only "texture energy", and a caller who read that and passed raw energies
    would not get the app's number.

    It does not cancel. Writing the app's form out,
    `(cheekHf/cheekL) / (foreheadHf/foreheadL) == (cheekHf/foreheadHf) *
    (foreheadL/cheekL)`, so the raw-energy ratio is the published one divided by the
    two regions' L* ratio — and the regions differ in L* by construction, because the
    T-zone/cheek brightness gap is the very thing `shine_index` is built on. Over the
    12 distinct positive (tzoneL, cheekL) pairs ml/index-parity.json commits under
    `shine_ratio`, that factor runs 0.7142857142857143 to 1.5, so raw energies move
    this index by -28.6% to +50% on rows this repository already holds. Measured, with
    the identity's worst relative residual over those pairs at 2.27e-16: see
    selftest.test_roughness_ratio_inputs_are_l_star_normalised.

    Separate from that, and unchanged: the epsilon clamp below still disagrees with
    lib/skin.ts:roughnessRatio's could-not-measure 0. Which side moves is not decided
    here; ml/index-parity.json holds both columns.
    """
    return region_highfreq / max(reference_highfreq, 1e-6)


def blemish_density(count: int, sampled_area_px: float, face_width_px: float) -> float:
    """Blemishes per face-width-squared of sampled skin. WITHIN_IMAGE, scale-free.

    Mirrors detectBlemishes in lib/skin.ts — change one, change both.

    The denominator used to be `sampled_area_px / 1e6`, which is a real-pixel area, so
    the index scaled as roughly 1/face_width**2 and two captures of one face at
    different resolutions landed on different scales. Measured over a 7.2x range of
    face width on one synthetic face (docs/capture-resolution-invariance.md): the pixel
    area moves 50.8x, `sampled_area_px / face_width_px**2` moves 1.9%. So the
    face-relative area is the invariant denominator.
    """
    relative_area = sampled_area_px / max(face_width_px * face_width_px, 1e-6)
    return count / max(relative_area, 1e-6)


def coarse_tone_band(ita_degrees: float) -> str:
    """Three-band tone grouping for subgroup reporting.

    The six Del Bino bands disagree across devices for up to 45% of samples, and 98.3%
    of those disagreements are one band out. Merging adjacent bands converts most of
    that noise into agreement, at the cost of resolution ARU does not need: the point
    of the stratifier is to catch a model that fails on darker skin, not to type it.
    """
    if ita_degrees > 41:
        return "light"
    if ita_degrees > 10:
        return "medium"
    return "deep"


def transfer_class(index_id: str) -> str:
    return INDEX_BY_ID[index_id].transfer


def shippable_indices() -> tuple[str, ...]:
    return tuple(index.id for index in INDICES if index.shippable_alone)


def describe() -> list[dict]:
    return [
        {"id": index.id, "axis": index.axis, "transfer": index.transfer,
         "shippableAlone": index.shippable_alone, "note": index.note}
        for index in INDICES
    ]


if __name__ == "__main__":
    import json

    print(json.dumps({
        "shippableAlone": list(shippable_indices()),
        "indices": describe(),
    }, ensure_ascii=False, indent=2))
