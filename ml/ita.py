#!/usr/bin/env python3
"""Individual Typology Angle from an image, matching the browser implementation.

ITA is ARU's tone stratifier. It has to be computed identically in two places —
`dominantTone` in lib/skin.ts for live scans, and here for offline datasets — or
the training subgroups will not be the same subgroups the app reports. The sRGB
to CIELAB constants, the k=3 / 5-iteration k-means, and the rounding below are
deliberately the same as the TypeScript version. Change one, change both.

What ITA is not
---------------
It is a measurement of the pixels, under whatever light the photo was taken in.
Warm indoor light or a strong white balance shift moves it. It is a usable
stratifier for grouping samples and for catching a model that fails on darker
skin; it is not a colorimetric skin-tone reading, and ARU never shows it to a user.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class ToneReading:
    lstar: float
    ita: float
    pixels: int

    def as_dict(self) -> dict:
        return {"lstar": self.lstar, "ita": self.ita, "pixels": self.pixels}


def _linearize(channel: float) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab(r: float, g: float, b: float) -> tuple[float, float, float]:
    """sRGB (0-255) to CIELAB under D65. Mirrors rgbToLab in lib/skin.ts."""
    rl, gl, bl = _linearize(r), _linearize(g), _linearize(b)
    x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047
    y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722
    z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def ita_from_lab(lstar: float, bstar: float) -> float:
    """ITA in degrees. The b* == 0 guard mirrors the browser's.

    It was `abs(bstar) < 0.01` until 2026-09-20, here and in lib/skin.ts, against 1e-6
    in the registry's ml/skin_indices.py:ita. Since the +-90 fallback ignores the SIGN
    of b*, inside that window the three implementations landed 180 degrees apart, and a
    neutral grey is inside it: this module's own four-decimal matrix gives r = g = b a
    small negative b*, so 242 of the 256 8-bit greys satisfied the old guard and on all
    241 non-black ones the fallback returned the sign the limit does not have. The
    measurement and the decision are docs/ita-guard-decision.md. Now the fallback fires
    only where the quotient has no value at all, and `== 0` covers -0.0 as well because
    CPython raises ZeroDivisionError on both zeros while V8 divides to -Infinity.
    """
    if bstar == 0:
        return 90.0 if lstar > 50 else -90.0
    return math.degrees(math.atan((lstar - 50) / bstar))


def dominant_tone(pixels: list[tuple[int, int, int]]) -> ToneReading | None:
    """Largest of three colour clusters, so residual blush or shadow cannot win.

    Deterministic on purpose: seeds are the first, middle and last pixel, exactly
    as in the browser. A random init would make the same crop yield a different
    subgroup between runs.
    """
    if len(pixels) < 30:
        return None
    sample = pixels[::2]
    seeds = [sample[0], sample[len(sample) // 2], sample[-1]]
    centroids = [(float(r), float(g), float(b)) for r, g, b in seeds]
    assignment = [0] * len(sample)

    for _ in range(5):
        for i, (r, g, b) in enumerate(sample):
            best, best_dist = 0, float("inf")
            for c, (cr, cg, cb) in enumerate(centroids):
                dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
                if dist < best_dist:
                    best_dist, best = dist, c
            assignment[i] = best
        for c in range(len(centroids)):
            members = [sample[i] for i in range(len(sample)) if assignment[i] == c]
            if members:
                centroids[c] = (
                    sum(p[0] for p in members) / len(members),
                    sum(p[1] for p in members) / len(members),
                    sum(p[2] for p in members) / len(members),
                )

    counts = [assignment.count(c) for c in range(len(centroids))]
    r, g, b = centroids[counts.index(max(counts))]
    lstar, _, bstar = rgb_to_lab(r, g, b)
    return ToneReading(
        lstar=round(lstar * 10) / 10,
        ita=round(ita_from_lab(lstar, bstar) * 10) / 10,
        pixels=len(sample),
    )


def central_skin_pixels(image, box_ratio: float = 0.4, max_side: int = 96) -> list[tuple[int, int, int]]:
    """Sample the central box of a face image, where cheeks and nose usually sit.

    External datasets ship no landmarks, so this is the honest approximation: a
    centred box, downsampled, with the brightest and darkest deciles trimmed to
    drop specular highlights and shadowed edges.
    """
    width, height = image.size
    side_w, side_h = int(width * box_ratio), int(height * box_ratio)
    left, top = (width - side_w) // 2, (height - side_h) // 2
    crop = image.convert("RGB").crop((left, top, left + side_w, top + side_h))
    if max(crop.size) > max_side:
        scale = max_side / max(crop.size)
        crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))))

    pixels = list(crop.getdata())
    if len(pixels) < 30:
        return pixels
    ranked = sorted(pixels, key=lambda p: 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2])
    trim = max(1, len(ranked) // 10)
    return ranked[trim:-trim]


def tone_from_image_path(path) -> ToneReading | None:
    """Read one image file and return its tone. Requires pillow."""
    try:
        from PIL import Image  # imported lazily so stdlib-only tools still import this module
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("pillow is required for image ITA; pip install -r ml/requirements.txt") from exc

    with Image.open(path) as image:
        image.load()
        return dominant_tone(central_skin_pixels(image))
