import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { labAStar, rgbToLab } from "@/lib/skin";

/**
 * The measurement that set the tolerance in `ml/index-parity.json`'s `rgb_to_lab`
 * group, as a command rather than as a paragraph.
 *
 * The indices pinned in that file are compared EXACTLY, because +, -, *, / and sqrt on
 * IEEE doubles are correctly rounded and a matching implementation matches bit for bit.
 * `rgbToLab` is not in that class. Cycle 16 said so and left the number open:
 * "rgbToLab involves pow and a matrix, where exact cross-language equality is not
 * guaranteed the way it is for four arithmetic operations — a tolerance would have to
 * be chosen and justified, which is a measurement of its own."
 *
 * This is that measurement's TypeScript half. It dumps the shipped function's output
 * over a wide input set; `ml/lab_parity_sweep.py` runs the same inputs through
 * `ml/ita.py` and reports the distribution of the difference:
 *
 *   ARU_LAB_PARITY_DUMP=/tmp/ts-lab.json npx vitest run tests/lab-parity-sweep.test.ts
 *   python3 ml/lab_parity_sweep.py /tmp/ts-lab.json
 *
 * Nothing here asserts a tolerance — the tolerance is asserted by
 * tests/index-parity.test.ts and ml/selftest.py against the committed table. This file
 * only produces the evidence, and prints nothing unless asked.
 */

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Two families. `cube` is a 5-step grid over all of sRGB, so the sweep is not only
 *  skin; `skinFloat` is the shape detectBlemishes feeds — a stride-window mean times a
 *  gray-world gain, floats rather than integers. */
function sweepInputs(): { cube: number[][]; skinFloat: number[][] } {
  const axis: number[] = [];
  for (let v = 0; v <= 255; v += 5) axis.push(v);
  axis.push(255);
  const cube: number[][] = [];
  for (const r of axis) for (const g of axis) for (const b of axis) cube.push([r, g, b]);
  const rnd = lcg(20260919);
  const skinFloat: number[][] = [];
  for (let i = 0; i < 120000; i += 1) {
    const base = 40 + rnd() * 200;
    skinFloat.push([
      Math.min(255, base * (0.85 + rnd() * 0.35)),
      Math.min(255, (base - 6 - rnd() * 30) * (0.9 + rnd() * 0.2)),
      Math.min(255, (base - 18 - rnd() * 50) * (0.85 + rnd() * 0.35)),
    ]);
  }
  return { cube, skinFloat };
}

describe("rgbToLab cross-language sweep", () => {
  it("generates the same inputs every run, so two languages can be compared on them", () => {
    // A seeded generator is the whole reason the Python half can be a separate process.
    const a = sweepInputs();
    const b = sweepInputs();
    expect(a.cube.length).toBe(53 * 53 * 53);
    expect(a.skinFloat.length).toBe(120000);
    expect(b.skinFloat[0]).toEqual(a.skinFloat[0]);
    expect(b.skinFloat[119999]).toEqual(a.skinFloat[119999]);
  });

  it("agrees with the fast path on every input in the sweep, bit for bit", () => {
    // Cheap enough to run by default, and it is the claim the whole change rests on:
    // labAStar is not an approximation of a*, it is a*. Checked over 268,877 inputs
    // rather than over the 20 rows the committed table pins.
    const { cube, skinFloat } = sweepInputs();
    let checked = 0;
    for (const [r, g, b] of [...cube, ...skinFloat]) {
      if (rgbToLab(r, g, b).a !== labAStar(r, g, b)) {
        throw new Error(`labAStar disagrees with rgbToLab at ${r}, ${g}, ${b}`);
      }
      checked += 1;
    }
    expect(checked).toBe(268877);
  });

  it("dumps the sweep when asked", () => {
    const path = process.env.ARU_LAB_PARITY_DUMP;
    if (!path) return;
    const out: Record<string, number[][]> = {};
    for (const [name, inputs] of Object.entries(sweepInputs())) {
      out[name] = inputs.map(([r, g, b]) => {
        const lab = rgbToLab(r, g, b);
        return [r, g, b, lab.l, lab.a, lab.b];
      });
    }
    // The two transcendentals on their own, so the Python half can say WHERE the
    // disagreement enters rather than only how big it is. Neither language rounds
    // these correctly, and which one is closer to the true value is not the question —
    // whether they are the same double is.
    const prim = lcg(11);
    const powIn: number[] = [];
    for (let c = 0; c <= 255; c += 1) powIn.push(c / 255);
    for (let i = 0; i < 4000; i += 1) powIn.push(prim());
    const cbrtIn: number[] = [];
    for (let i = 0; i < 4000; i += 1) cbrtIn.push(prim() * 1.2);
    for (let i = 0; i < 1000; i += 1) cbrtIn.push(0.008856 + prim() * 0.05);
    out.__pow = powIn.map((c) => [c, Math.pow((c + 0.055) / 1.055, 2.4)]);
    out.__cbrt = cbrtIn.map((t) => [t, Math.cbrt(t)]);
    writeFileSync(path, JSON.stringify(out), "utf-8");
    process.stdout.write(`LAB SWEEP wrote ${out.cube.length + out.skinFloat.length} rows to ${path}\n`);
  });
});
