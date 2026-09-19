#!/usr/bin/env python3
"""The Python half of the rgbToLab cross-language measurement.

`tests/lab-parity-sweep.test.ts` dumps the shipped TypeScript function's output over a
wide, seeded input set; this reads that dump, runs the same inputs through
`ml/ita.py`'s `rgb_to_lab`, and reports the distribution of the difference.

    ARU_LAB_PARITY_DUMP=/tmp/ts-lab.json npx vitest run tests/lab-parity-sweep.test.ts
    python3 ml/lab_parity_sweep.py /tmp/ts-lab.json

Why a tolerance at all. Every index in `ml/index-parity.json`'s `indices` section is
compared EXACTLY, because +, -, *, / and sqrt on IEEE doubles are correctly rounded and
a matching implementation matches bit for bit. `rgb_to_lab` calls pow(., 2.4) three
times and a cube root up to three times, and neither language's library rounds those
correctly, so exact equality is not available and asserting it would make the table a
tripwire for the libm rather than for ARU.

The unit this reports in is `channelScale * 2 ** -52`, where channelScale is the literal
multiplier in that channel's own expression — 116 for L*, 500 for a*, 200 for b*. That
is the natural unit because the disagreement enters as a last-place error in f() and
leaves multiplied by exactly that number: `a* = 500 * (f(x) - f(y))` is a subtraction of
two quantities of order 1, so a 1-ulp difference in either f() arrives in a* scaled by
500 and by nothing else.

Nothing here asserts. `tests/index-parity.test.ts` and `ml/selftest.py` hold the
contract against the committed 20-row table; this produces the evidence behind the
number in it.
"""

from __future__ import annotations

import json
import math
import statistics
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ita  # noqa: E402

EPS = 2.0**-52
CHANNEL_SCALE = {"L*": 116.0, "a*": 500.0, "b*": 200.0}


def _ulps(a: float, b: float) -> int:
    """Distance in representable doubles. Only meaningful for the primitives below:
    a* passes through zero, where an ulp is vanishingly small and the count explodes
    while the absolute difference stays a fraction of a thousandth of nothing."""
    if a == b:
        return 0
    ia = struct.unpack("<q", struct.pack("<d", a))[0]
    ib = struct.unpack("<q", struct.pack("<d", b))[0]
    return abs(ia - ib)


def main(dump_path: str) -> int:
    groups = json.loads(Path(dump_path).read_text(encoding="utf-8"))
    print(f"python {sys.version.split()[0]}   dump {dump_path}")
    print(
        "unit = channelScale * 2**-52, channelScale = 116 (L*), 500 (a*), 200 (b*):\n"
        "the literal multiplier each channel's expression applies to f()."
    )
    primitives = {name: groups.pop(name) for name in ("__pow", "__cbrt") if name in groups}
    total = 0
    worst_overall = 0.0
    for name, rows in groups.items():
        total += len(rows)
        print(f"\n== {name} ({len(rows)} inputs) ==")
        print(f"{'':4s}{'exact':>18s}{'max':>14s}{'max/unit':>11s}{'median':>11s}{'p99/unit':>10s}")
        for index, label in enumerate(("L*", "a*", "b*")):
            scale = CHANNEL_SCALE[label]
            deltas = []
            worst = (0.0, None)
            for row in rows:
                r, g, b = row[0], row[1], row[2]
                value = ita.rgb_to_lab(r, g, b)[index]
                delta = abs(value - row[3 + index])
                deltas.append(delta)
                if delta > worst[0]:
                    worst = (delta, (r, g, b, row[3 + index], value))
            exact = sum(1 for d in deltas if d == 0.0)
            ordered = sorted(deltas)
            p99 = ordered[min(len(ordered) - 1, int(0.99 * len(ordered)))]
            biggest = max(deltas)
            worst_overall = max(worst_overall, biggest / (scale * EPS))
            print(
                f"{label:4s}{f'{exact}/{len(rows)}':>10s}{f'{100 * exact / len(rows):5.1f}%':>8s}"
                f"{biggest:14.4e}{biggest / (scale * EPS):11.4f}"
                f"{statistics.median(deltas):11.1e}{p99 / (scale * EPS):10.4f}"
            )
            if worst[1] is not None and biggest > 0:
                r, g, b, ts, py = worst[1]
                print(f"      worst at rgb=({r:.6f}, {g:.6f}, {b:.6f})  ts={ts!r}  py={py!r}")
    print(f"\n{total} inputs. Worst disagreement anywhere: {worst_overall:.4f} units.")
    print("The committed toleranceK in ml/index-parity.json is the headroom over that.")

    if primitives:
        print("\n== where it enters: the two transcendentals on their own ==")
        for name, rows in primitives.items():
            if name == "__pow":
                candidates = {"c ** 2.4 (as shipped)": lambda c: ((c + 0.055) / 1.055) ** 2.4}
            else:
                candidates = {"t ** (1/3) (as shipped)": lambda t: t ** (1 / 3)}
                if hasattr(math, "cbrt"):
                    candidates["math.cbrt"] = math.cbrt
            for label, fn in candidates.items():
                exact = sum(1 for arg, ts in rows if fn(arg) == ts)
                worst_ulp = max(_ulps(fn(arg), ts) for arg, ts in rows)
                print(
                    f"   {name[2:]:5s} V8 vs {label:24s} exact {exact}/{len(rows)} "
                    f"({100 * exact / len(rows):5.1f}%)  worst {worst_ulp} ulp"
                )
        print(
            "   Read the cbrt rows together: math.cbrt is the better cube root and\n"
            "   agrees with V8 LESS often, which is the point. Neither library is\n"
            "   correctly rounded, so 'exact' here is a coincidence of two roundings,\n"
            "   not a property either side can promise."
        )
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
