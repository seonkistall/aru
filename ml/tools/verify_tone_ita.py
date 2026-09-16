#!/usr/bin/env python3
"""Check ARU's sRGB->CIELAB conversion and ITA against reference implementations.

A tool, not a test. `ml/selftest.py` and `tests/tone-ita-contract.test.ts` pin the
resulting values as constants so the repository keeps the guarantee without taking on
the dependency; this script is what re-establishes that guarantee if either side of
the conversion is ever changed.

ITA is what stands between "the model works" and "the model works for people who look
like the training set": `ml/subgroups.py` derives every tone band from it and the
promotion gate blocks on those bands. A radians/degrees slip, or a wrong white point,
would put every sample in one band and the fairness check would then pass by being
blind rather than by being fair.

colour-science and scikit-image are NOT dependencies of this repository — the ML rule
modules are standard-library-only so `ml/selftest.py` runs anywhere `py_compile` does.
They are imported inside main() so importing or byte-compiling this file needs neither.

    python3 -m venv /tmp/refvenv && /tmp/refvenv/bin/pip install colour-science scikit-image
    /tmp/refvenv/bin/python ml/tools/verify_tone_ita.py

See docs/tone-ita-verification.md for the run this was written from.
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ita  # noqa: E402
import subgroups  # noqa: E402

SEED = 20260916
TRIALS = 4000

#: Six sRGB triples from light to deep. The names are descriptions of the swatch, not
#: claims about anyone's skin; what they are for is to give both test suites the same
#: fixed inputs so the numbers below can be pinned and re-derived here.
FIXTURES: tuple[tuple[str, tuple[int, int, int]], ...] = (
    ("swatch-1", (242, 223, 211)),
    ("swatch-2", (226, 195, 176)),
    ("swatch-3", (205, 168, 144)),
    ("swatch-4", (181, 139, 110)),
    ("swatch-5", (140, 100, 74)),
    ("swatch-6", (86, 58, 42)),
)


def main() -> int:
    import numpy as np
    from skimage import color as skcolour
    import colour

    rng = random.Random(SEED)
    triples = [(rng.randrange(256), rng.randrange(256), rng.randrange(256)) for _ in range(TRIALS)]
    arr = np.array(triples, dtype=float).reshape(-1, 1, 3) / 255.0

    sk = skcolour.rgb2lab(arr).reshape(-1, 3)
    # colour-science: sRGB EOTF -> XYZ (D65) -> Lab against the same D65 white.
    cs = colour.XYZ_to_Lab(
        colour.sRGB_to_XYZ(arr.reshape(-1, 3)),
        colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"],
    )
    mine = np.array([ita.rgb_to_lab(*rgb) for rgb in triples], dtype=float)

    print(f"sRGB -> CIELAB over {TRIALS} random triples (seed {SEED}), max abs deviation:")
    print(f"{'reference':<16}{'dL*':>12}{'da*':>12}{'db*':>12}")
    refs = (("scikit-image", sk), ("colour-science", cs))
    for name, ref in refs:
        d = np.abs(mine - ref)
        print(f"{name:<16}{d[:, 0].max():>12.3e}{d[:, 1].max():>12.3e}{d[:, 2].max():>12.3e}")
    print("  ARU carries the sRGB->XYZ matrix to four decimals (0.4124, 0.3576, ...) where both")
    print("  references carry more, so the residual above is that truncation, not a different model.")

    def ref_ita(lab: np.ndarray) -> np.ndarray:
        return np.degrees(np.arctan((lab[:, 0] - 50.0) / lab[:, 2]))

    mine_ita = np.array([ita.ita_from_lab(l, b) for l, _, b in mine])
    outside_guard = np.abs(mine[:, 2]) >= 0.01  # the b*~0 guard has no reference to match
    # ITA divides by b*, so near b*=0 a 0.02 difference in b* is a large difference in
    # angle. That is the formula's own conditioning, not a disagreement about colour, so
    # the skin-plausible subset is reported next to the whole range rather than instead.
    skinlike = outside_guard & (np.abs(mine[:, 2]) > 5.0)
    print(f"\nITA, max abs deviation in degrees:")
    print(f"{'reference':<16}{'all b* (n=' + str(int(outside_guard.sum())) + ')':>22}{'|b*|>5 (n=' + str(int(skinlike.sum())) + ')':>22}")
    for name, ref in refs:
        d = np.abs(mine_ita - ref_ita(ref))
        print(f"{name:<16}{d[outside_guard].max():>22.3e}{d[skinlike].max():>22.3e}")

    # A radians slip is the failure this is really guarding against: it is silent,
    # because atan still returns a number and the band lookup still returns a band.
    rad = np.arctan((mine[:, 0] - 50.0) / np.where(outside_guard, mine[:, 2], np.nan))
    bands_deg = {subgroups.tone_band_from_ita(v) for v in mine_ita[outside_guard]}
    bands_rad = {subgroups.tone_band_from_ita(v) for v in rad[outside_guard]}
    print(f"\nIf ITA came back in radians instead of degrees, every value would sit in")
    print(f"  [{rad[outside_guard].min():.4f}, {rad[outside_guard].max():.4f}] rather than "
          f"[{mine_ita[outside_guard].min():.1f}, {mine_ita[outside_guard].max():.1f}], so")
    print(f"  tone_band_from_ita would return {sorted(bands_rad)} instead of {sorted(bands_deg)}.")

    print("\nFixtures pinned by ml/selftest.py and tests/tone-ita-contract.test.ts:")
    print(f"{'name':<11}{'sRGB':<18}{'L*':>7}{'b*':>8}{'ITA':>8}{'band':>13}{'ITA(skimage)':>15}{'ITA(colour)':>14}")
    fx = np.array([rgb for _, rgb in FIXTURES], dtype=float).reshape(-1, 1, 3) / 255.0
    fx_sk = ref_ita(skcolour.rgb2lab(fx).reshape(-1, 3))
    fx_cs = ref_ita(colour.XYZ_to_Lab(
        colour.sRGB_to_XYZ(fx.reshape(-1, 3)),
        colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"],
    ))
    for (name, rgb), a_sk, a_cs in zip(FIXTURES, fx_sk, fx_cs):
        lstar, _, bstar = ita.rgb_to_lab(*rgb)
        angle = ita.ita_from_lab(lstar, bstar)
        band = subgroups.tone_band_from_ita(round(angle * 10) / 10)
        print(f"{name:<11}{str(rgb):<18}{lstar:>7.1f}{bstar:>8.2f}{angle:>8.1f}{band:>13}{a_sk:>15.2f}{a_cs:>14.2f}")
    mine_fx = np.array([ita.ita_from_lab(ita.rgb_to_lab(*rgb)[0], ita.rgb_to_lab(*rgb)[2]) for _, rgb in FIXTURES])
    print(f"  max |ARU - scikit-image| = {np.abs(mine_fx - fx_sk).max():.3e} deg, "
          f"max |ARU - colour-science| = {np.abs(mine_fx - fx_cs).max():.3e} deg")
    print(f"  every fixture lands in the same band under all three: "
          f"{all(subgroups.tone_band_from_ita(round(a * 10) / 10) == subgroups.tone_band_from_ita(round(b * 10) / 10) == subgroups.tone_band_from_ita(round(c * 10) / 10) for a, b, c in zip(mine_fx, fx_sk, fx_cs))}")

    print(f"\nmath.degrees sanity: atan(1) = {math.degrees(math.atan(1)):.1f} degrees")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
