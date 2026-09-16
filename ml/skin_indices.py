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
          "a* of the target region minus a* of a reference region in the same frame."),
    Index("tone_evenness", WITHIN_IMAGE, "tone",
          "Spread of L* across facial regions of one frame. Uniformity, not lightness."),
    Index("shine_ratio", WITHIN_IMAGE, "oil",
          "Specular-to-diffuse luminance of the T-zone against the cheeks, same frame."),
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

#: Index id -> the feature key lib/skin.ts writes into every exported sample.
#: tests/skin-index-contract.test.ts fails if the two sides drift apart.
FEATURE_KEY = {
    "relative_redness": "relRedness",
    "tone_evenness": "toneSpread",
    "shine_ratio": "shine",
    "blemish_count": "blemishDensity",
    "roughness_ratio": "roughnessRatio",
    "melanin_index": "toneLstar",
    "ita": "toneIta",
}

#: Feature keys added by the within-image indices, in export column order. The
#: pipeline scripts read this instead of each repeating the list.
NEW_FEATURE_KEYS = ("toneSpread", "roughnessRatio", "blemishCount", "blemishDensity")


def melanin_index(lstar: float) -> float:
    """Takiwaki's melanin index on the CIELAB substitution. ABSOLUTE."""
    return 100.0 * math.log10(100.0 / max(lstar, 1.0))


def ita(lstar: float, bstar: float) -> float:
    """Individual Typology Angle in degrees. ABSOLUTE."""
    if abs(bstar) < 1e-6:
        return 90.0 if lstar > 50 else -90.0
    return math.degrees(math.atan((lstar - 50.0) / bstar))


def relative_redness(target_astar: float, reference_astar: float) -> float:
    """Redness of one region against another in the SAME frame. WITHIN_IMAGE.

    An absolute a* moves by roughly 8 units between a DSLR and a phone on the same
    face. The difference between two regions of one photo does not, because both
    regions went through the same sensor and the same light.
    """
    return target_astar - reference_astar


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


def shine_ratio(tzone_specular: float, cheek_specular: float) -> float:
    """T-zone shine against cheek shine in one frame. WITHIN_IMAGE."""
    denominator = max(cheek_specular, 1e-6)
    return tzone_specular / denominator


def roughness_ratio(region_highfreq: float, reference_highfreq: float) -> float:
    """Texture energy against a smooth reference region. WITHIN_IMAGE but weak."""
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
