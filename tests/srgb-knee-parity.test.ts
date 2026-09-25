import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Cycle 39, ML track. The backlog item "ARU's sRGB breakpoint is the rounded one,
 * in both languages, and moving it is a decision rather than a fix" (cycle 22)
 * ends with a requirement that nothing named: "if it moves it has to move in
 * BOTH files in one change or it reintroduces exactly the split cycle 18 closed."
 *
 * What the suite already does, measured before this file was written rather than
 * assumed — and it is more than expected. Moving the knee in `lib/skin.ts` alone
 * fails `tests/index-parity.test.ts` (2 of 12); moving it in `ml/ita.py` alone
 * fails `python3 ml/selftest.py` (1 failure); changing the 1.055 scale in
 * `ml/ita.py` alone fails selftest (3 failures) while `index-parity` stays 12
 * passed. So no move of these constants ships silently today.
 *
 * What is still missing, and what this file adds: both of those compare ONE
 * language against `ml/index-parity.json`, a committed artifact, in two separate
 * runners. Neither compares the two implementations to each other, so a failure
 * reads as a fixture row that moved rather than as the two languages disagreeing
 * at the knee, and a regenerated fixture is the obvious thing to reach for. This
 * reads the four constants out of each source and requires them to agree, so the
 * failure names the constant.
 *
 * It needs no labelled export and no real photo, which is why it is this cycle's
 * ML item. The question the backlog item leaves open — where the knee BELONGS —
 * is not settled here: it needs IEC 61966-2-1, which this network cannot reach.
 * The item stays open.
 */

const TS_LINE = /return c <= ([\d.]+) \? c \/ ([\d.]+) : Math\.pow\(\(c \+ ([\d.]+)\) \/ ([\d.]+), 2\.4\);/;
const PY_LINE = /return c \/ ([\d.]+) if c <= ([\d.]+) else \(\(c \+ ([\d.]+)\) \/ ([\d.]+)\) \*\* 2\.4/;

function typescriptConstants() {
  const match = readFileSync("lib/skin.ts", "utf8").match(TS_LINE);
  if (!match) throw new Error("lib/skin.ts no longer contains a recognisable srgbLinear body");
  const [, knee, slope, offset, scale] = match;
  return { knee: Number(knee), slope: Number(slope), offset: Number(offset), scale: Number(scale) };
}

function pythonConstants() {
  const match = readFileSync("ml/ita.py", "utf8").match(PY_LINE);
  if (!match) throw new Error("ml/ita.py no longer contains a recognisable _linearize body");
  const [, slope, knee, offset, scale] = match;
  return { knee: Number(knee), slope: Number(slope), offset: Number(offset), scale: Number(scale) };
}

/** The shipped curve, rebuilt from whatever constants the sources actually hold. */
function linearize(c: number, k: { knee: number; slope: number; offset: number; scale: number }) {
  return c <= k.knee ? c / k.slope : Math.pow((c + k.offset) / k.scale, 2.4);
}

describe("the sRGB knee is the same in both languages", () => {
  const ts = typescriptConstants();
  const py = pythonConstants();

  it("lib/skin.ts and ml/ita.py hold identical transfer constants", () => {
    expect(ts).toEqual(py);
  });

  it("the knee is the rounded 0.04045 that cycle 22 recorded, in both", () => {
    expect(ts.knee).toBe(0.04045);
    expect(py.knee).toBe(0.04045);
  });

  it("the multiplicative constants are the standard ones, in both", () => {
    expect(ts).toMatchObject({ slope: 12.92, offset: 0.055, scale: 1.055 });
    expect(py).toMatchObject({ slope: 12.92, offset: 0.055, scale: 1.055 });
  });

  /**
   * Both implementations divide the same channel by 255 before branching, so the
   * knee is compared in the same units on both sides.
   */
  it("both normalise a 0-255 channel by 255 before the branch", () => {
    expect(readFileSync("lib/skin.ts", "utf8")).toContain("const c = channel / 255;");
    expect(readFileSync("ml/ita.py", "utf8")).toContain("c = channel / 255.0");
  });
});

describe("what a breakpoint move would and would not disturb", () => {
  const ts = typescriptConstants();
  /** colour-science's `eotf_sRGB` branches on 12.92 * 0.0031308, not on a literal. */
  const COLOUR_SCIENCE_KNEE = 12.92 * 0.0031308;

  it("re-derives colour-science's breakpoint and ARU's distance from it", () => {
    expect(COLOUR_SCIENCE_KNEE).toBeCloseTo(0.040449936, 12);
    expect(ts.knee - COLOUR_SCIENCE_KNEE).toBeLessThan(1e-7);
    expect(ts.knee - COLOUR_SCIENCE_KNEE).toBeGreaterThan(0);
  });

  /**
   * This is why an integer-channel parity sweep cannot see a move of this size,
   * and therefore why the constants have to be compared directly.
   */
  it("finds 0 of 256 integer channels between the two breakpoints", () => {
    const between = [];
    for (let channel = 0; channel <= 255; channel += 1) {
      const c = channel / 255;
      if (c > COLOUR_SCIENCE_KNEE && c <= ts.knee) between.push(channel);
    }
    expect(between).toEqual([]);
  });

  /** The detector's inputs are continuous, so the window is reachable in principle. */
  it("still disagrees on a channel inside the window", () => {
    const inside = ((COLOUR_SCIENCE_KNEE + ts.knee) / 2) * 255;
    const c = inside / 255;
    const aru = linearize(c, ts);
    const other = linearize(c, { ...ts, knee: COLOUR_SCIENCE_KNEE });
    expect(aru).not.toBe(other);
    expect(Math.abs(aru - other)).toBeLessThan(1e-8);
  });

  /** ARU's own curve is not continuous at its knee, by the amount cycle 22 recorded. */
  it("leaves ARU's curve discontinuous at its knee by under 1e-8", () => {
    const below = ts.knee / ts.slope;
    const above = Math.pow((ts.knee + ts.offset) / ts.scale, 2.4);
    const gap = Math.abs(above - below);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1e-8);
  });
});
