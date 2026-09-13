#!/usr/bin/env python3
"""ARU camera axis registry: the single source of truth for what the scan predicts.

Three rules are encoded here, and every other ML script reads them from here
instead of re-declaring its own tuple of attribute names.

1. An axis gets a camera head only when an RGB selfie physically carries the
   signal. Hydration is a corneometer measurement and sensitivity is a reaction
   history; neither is visible in a photo. They stay composite axes that require
   a survey answer, so the product can never present them as camera readings.
2. Levels are ordinal. The distance between level 0 and level 2 is larger than
   between 0 and 1, so training uses ordinal-aware loss and reports MAE next to
   accuracy.
3. Nothing here is a diagnosis. Every name describes what the photo shows.
"""

from __future__ import annotations

from dataclasses import dataclass, field


HeadKind = str  # "camera" | "composite" | "instrument_only"
Evidence = str  # "direct" | "weak" | "none"


@dataclass(frozen=True)
class Axis:
    """One predicted skin axis.

    head:
      camera          - a model head reads it straight off the crop.
      composite       - camera signals alone are insufficient; a survey answer is
                        required before the axis may be shown at all.
      instrument_only - no camera path exists; only device measurement supervises it.
    evidence:
      how well an 8-bit RGB front-camera frame carries the signal. "weak" axes are
      allowed to train but must clear a higher confidence bar before display.
    """

    id: str
    ko: str
    en: str
    levels: int
    level_labels_ko: tuple[str, ...]
    head: HeadKind
    evidence: Evidence
    regions: tuple[str, ...]
    product_facing: bool
    requires_survey: bool = False
    derived_from: tuple[str, ...] = ()
    medical_boundary: str = ""
    notes: str = ""
    external_label_hints: dict[str, str] = field(default_factory=dict)

    @property
    def trainable(self) -> bool:
        """Whether a supervised image head is defined for this axis."""
        return self.head == "camera"


AXES: tuple[Axis, ...] = (
    Axis(
        id="oil",
        ko="유분",
        en="Oil / shine",
        levels=3,
        level_labels_ko=("유분 적음", "유분 약간", "유분 많음"),
        head="camera",
        evidence="direct",
        regions=("t_zone", "forehead", "nose"),
        product_facing=True,
        notes="Specular ratio and T-zone minus cheek luminance carry this well.",
        external_label_hints={
            "aihub_korean_skin": "sebum / 유분 measurement per region",
            "oily_dry_normal_kaggle": "3-class skin type, no stated annotation protocol",
        },
    ),
    Axis(
        id="redness",
        ko="홍조",
        en="Visible redness",
        levels=3,
        level_labels_ko=("붉은기 낮음", "붉은기 약간", "붉은기 뚜렷"),
        head="camera",
        evidence="direct",
        regions=("cheeks", "nose_side", "chin"),
        product_facing=True,
        medical_boundary="Describe visible redness only. Persistent burning or swelling routes to a clinician.",
        external_label_hints={
            "skincon": "erythema concept annotation",
            "aihub_korean_skin": "홍조 / erythema grade",
        },
    ),
    Axis(
        id="pores",
        ko="모공",
        en="Visible pores / texture",
        levels=3,
        level_labels_ko=("결 매끈", "결 약간 보임", "결 뚜렷"),
        head="camera",
        evidence="direct",
        regions=("cheeks", "nose_side"),
        product_facing=True,
        notes="Needs adequate face scale; small faces and blur must be excluded, not guessed.",
        external_label_hints={"aihub_korean_skin": "모공 grade per region"},
    ),
    Axis(
        id="tone",
        ko="색감",
        en="Tone evenness",
        levels=4,
        level_labels_ko=("톤 균일", "약간 불균일", "불균일", "매우 불균일"),
        head="camera",
        evidence="direct",
        regions=("forehead", "cheeks", "chin"),
        product_facing=False,
        notes=(
            "Evenness, not tone lightness. ARU never grades how light a face is; "
            "absolute tone is used only as a fairness stratifier, never as a product output."
        ),
        external_label_hints={
            "aihub_korean_skin": "색소침착 / 톤 grade",
            "scin": "estimated Fitzpatrick and Monk labels (stratifier only, not an output)",
        },
    ),
    Axis(
        id="trouble",
        ko="트러블",
        en="Blemish / acne-like lesions",
        levels=4,
        level_labels_ko=("트러블 없음", "약간", "보통", "많음"),
        head="camera",
        evidence="direct",
        regions=("forehead", "cheeks", "chin", "jawline"),
        product_facing=False,
        medical_boundary=(
            "Count visible blemishes. Never name an acne subtype, never grade severity "
            "on a clinical scale, and route persistent or painful cases to a dermatologist."
        ),
        external_label_hints={
            "acne04": "Hayashi severity 0-3 with lesion counts",
            "aihub_korean_skin": "트러블 grade",
        },
    ),
    Axis(
        id="dryness",
        ko="건조",
        en="Dryness / flaking",
        levels=4,
        level_labels_ko=("건조하지 않음", "약간 건조", "건조", "매우 건조"),
        head="camera",
        evidence="weak",
        regions=("cheeks", "mouth_corner", "forehead"),
        product_facing=False,
        requires_survey=True,
        notes=(
            "Only visible flaking and roughness are photographable. Mild dryness with no "
            "flaking looks identical to normal skin, so the survey answer breaks the tie."
        ),
        external_label_hints={"aihub_korean_skin": "건조 / 수분 grade paired with instrument reading"},
    ),
    Axis(
        id="wrinkles",
        ko="주름",
        en="Fine lines",
        levels=4,
        level_labels_ko=("주름 옅음", "약간", "보통", "뚜렷"),
        head="camera",
        evidence="direct",
        regions=("forehead", "crow_feet", "under_eye", "nasolabial"),
        product_facing=False,
        notes="Strongly age-correlated, so subgroup evaluation by age band is mandatory before display.",
        external_label_hints={
            "ffhq_wrinkle": "manual and weak wrinkle masks",
            "aihub_korean_skin": "주름 grade per region",
        },
    ),
    Axis(
        id="moisture",
        ko="수분",
        en="Hydration",
        levels=4,
        level_labels_ko=("수분 충분", "약간 부족", "부족", "많이 부족"),
        head="instrument_only",
        evidence="none",
        regions=("cheeks", "forehead"),
        product_facing=False,
        requires_survey=True,
        derived_from=("dryness", "oil"),
        notes=(
            "Corneometer capacitance. An RGB frame does not contain it. ARU may only infer a "
            "hydration HINT from visible dryness plus the survey, and must label it as an "
            "inference. Supervising a camera head on instrument hydration is allowed only for "
            "research on an instrument-paired dataset, never for a product claim."
        ),
    ),
    Axis(
        id="sensitivity",
        ko="민감",
        en="Sensitivity / barrier risk",
        levels=3,
        level_labels_ko=("민감하지 않음", "약간 민감", "민감"),
        head="composite",
        evidence="weak",
        regions=("cheeks", "nose_side"),
        product_facing=False,
        requires_survey=True,
        derived_from=("redness", "dryness"),
        medical_boundary="Camera signal alone is never enough. Requires a reported reaction history.",
        notes="Sensitivity is a reaction history, not an appearance. Redness is a symptom, not the axis.",
    ),
)


AXIS_BY_ID: dict[str, Axis] = {axis.id: axis for axis in AXES}

#: Axes with a supervised image head. This is what the network actually predicts.
CAMERA_AXES: tuple[str, ...] = tuple(axis.id for axis in AXES if axis.trainable)

#: Axes shipped to consumers today. Everything else stays research-only.
PRODUCT_AXES: tuple[str, ...] = tuple(axis.id for axis in AXES if axis.product_facing)

#: Axes that must never be displayed without a survey answer backing them.
SURVEY_GATED_AXES: tuple[str, ...] = tuple(axis.id for axis in AXES if axis.requires_survey)

#: The three axes the shipped heuristic already produces; kept for backwards compatibility
#: with manifests and label exports written before the registry existed.
LEGACY_ATTRS: tuple[str, ...] = ("oil", "redness", "pores")


def axis(axis_id: str) -> Axis:
    try:
        return AXIS_BY_ID[axis_id]
    except KeyError as exc:
        raise KeyError(f"unknown ARU axis: {axis_id!r}. Known: {sorted(AXIS_BY_ID)}") from exc


def levels_for(axis_id: str) -> int:
    return axis(axis_id).levels


def validate_level(axis_id: str, value: int) -> int:
    """Reject out-of-range labels loudly instead of training on silent garbage."""
    spec = axis(axis_id)
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError(f"{axis_id} level must be int, got {type(value).__name__}")
    if not 0 <= value < spec.levels:
        raise ValueError(f"{axis_id} level {value} outside 0..{spec.levels - 1}")
    return value


def resolve_axes(requested: list[str] | tuple[str, ...] | None) -> tuple[str, ...]:
    """Normalize a CLI --axes selection into trainable axis ids.

    None means "every camera axis". Passing a composite or instrument-only axis is a
    hard error: it would train a head the product is forbidden from showing.
    """
    if not requested:
        return CAMERA_AXES
    resolved: list[str] = []
    for raw in requested:
        for token in str(raw).split(","):
            token = token.strip()
            if not token:
                continue
            spec = axis(token)
            if not spec.trainable:
                raise ValueError(
                    f"axis {token!r} has head={spec.head!r} and cannot be trained from images. "
                    f"{spec.notes or spec.medical_boundary}"
                )
            if token not in resolved:
                resolved.append(token)
    return tuple(resolved)


def describe() -> list[dict[str, object]]:
    """Serializable axis table for experiment summaries and model manifests."""
    return [
        {
            "id": a.id,
            "ko": a.ko,
            "en": a.en,
            "levels": a.levels,
            "head": a.head,
            "evidence": a.evidence,
            "productFacing": a.product_facing,
            "requiresSurvey": a.requires_survey,
            "derivedFrom": list(a.derived_from),
            "regions": list(a.regions),
            "medicalBoundary": a.medical_boundary,
        }
        for a in AXES
    ]


if __name__ == "__main__":
    import json

    print(json.dumps({"cameraAxes": list(CAMERA_AXES), "axes": describe()}, ensure_ascii=False, indent=2))
