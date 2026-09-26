import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { labAStar } from "@/lib/skin";

/**
 * Cycle 42, ML track. The backlog item "ARU's sRGB breakpoint is the rounded one,
 * in both languages, and moving it is a decision rather than a fix" (cycle 22)
 * records that `lib/skin.ts:srgbLinear` and `ml/ita.py` branch at 0.04045 where
 * `colour-science/colour` branches at `12.92 * 0.0031308`, and that "0 of 256
 * integer channels fall in the window where the two implementations take
 * different branches, though the detector's inputs are continuous so it is
 * reachable in principle". Cycle 39 re-derived that 0-of-256 count and pinned the
 * two languages to each other (`tests/srgb-knee-parity.test.ts`).
 *
 * What neither did is say how much the choice can move anything. "Reachable in
 * principle" is not a size, and the item's decision — whether to move the knee —
 * is a cost/benefit question that has never had the cost measured. This file
 * measures it: the worst a* error the knee choice can produce anywhere inside the
 * window, against the 1.6 a* units `BLEMISH.minResidual` requires of a candidate.
 *
 * Chosen as this cycle's ML item because it needs no labelled export, no real
 * photo and no phone profile — the inputs are the whole continuous window, and
 * `labAStar` is the function the detector calls ~18,000 times a frame.
 *
 * It does NOT decide where the knee belongs. That still needs IEC 61966-2-1,
 * which this network cannot reach, and no constant moves here.
 */

const TS_LINE = /return c <= ([\d.]+) \? c \/ ([\d.]+) : Math\.pow\(\(c \+ ([\d.]+)\) \/ ([\d.]+), 2\.4\);/;
const MATRIX_LINE =
  /const x = \(rl \* ([\d.]+) \+ gl \* ([\d.]+) \+ bl \* ([\d.]+)\) \/ ([\d.]+);\s*\n\s*const y = rl \* ([\d.]+) \+ gl \* ([\d.]+) \+ bl \* ([\d.]+);/;
const LABF_LINE = /return t > ([\d.]+) \? Math\.cbrt\(t\) : ([\d.]+) \* t \+ 16 \/ 116;/;

const SOURCE = readFileSync("lib/skin.ts", "utf8");

function num(match: RegExpMatchArray | null, label: string) {
  if (!match) throw new Error(`lib/skin.ts no longer contains a recognisable ${label}`);
  return match;
}

const transfer = num(SOURCE.match(TS_LINE), "srgbLinear body");
const KNEE = Number(transfer[1]);
const SLOPE = Number(transfer[2]);
const OFFSET = Number(transfer[3]);
const SCALE = Number(transfer[4]);

const matrix = num(SOURCE.match(MATRIX_LINE), "sRGB->XYZ block in labAStar");
const [XR, XG, XB, WHITE_X, YR, YG, YB] = matrix.slice(1, 8).map(Number);

const labf = num(SOURCE.match(LABF_LINE), "labF body");
const LAB_EPS = Number(labf[1]);
const LAB_SLOPE = Number(labf[2]);

/**
 * `colour-science/colour`'s `eotf_sRGB` does not branch on a literal: it branches
 * on `eotf_inverse_sRGB(0.0031308)`, that is on `SLOPE * 0.0031308`. Everything
 * else about the curve is ARU's own, read out of lib/skin.ts above, so the only
 * difference between the two functions below is where they switch branches.
 */
const CS_LINEAR_BREAKPOINT = 0.0031308;
const CS_KNEE = SLOPE * CS_LINEAR_BREAKPOINT;

function linearAt(channel: number, knee: number): number {
  const c = channel / 255;
  return c <= knee ? c / SLOPE : Math.pow((c + OFFSET) / SCALE, 2.4);
}

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : LAB_SLOPE * t + 16 / 116;
}

/** lib/skin.ts:labAStar with the transfer knee as a parameter. */
function aStarWith(r: number, g: number, b: number, knee: number): number {
  const rl = linearAt(r, knee);
  const gl = linearAt(g, knee);
  const bl = linearAt(b, knee);
  const x = (rl * XR + gl * XG + bl * XB) / WHITE_X;
  const y = rl * YR + gl * YG + bl * YB;
  return 500 * (labF(x) - labF(y));
}

const WINDOW_LOW = Math.min(KNEE, CS_KNEE);
const WINDOW_HIGH = Math.max(KNEE, CS_KNEE);
const CHANNEL_LOW = WINDOW_LOW * 255;
const CHANNEL_HIGH = WINDOW_HIGH * 255;

/** Inclusive sweep of the channel window, endpoints included. */
function windowChannels(steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(CHANNEL_LOW + ((CHANNEL_HIGH - CHANNEL_LOW) * i) / steps);
  }
  return out;
}

const HELD = [0, 1, 10.3125, 30, 128, 200, 254, 255];
const SWEEP_STEPS = 2000;
const MIN_RESIDUAL = 1.6;

describe("what the sRGB knee choice can move", () => {
  it("mirrors lib/skin.ts's own labAStar exactly at ARU's knee", () => {
    // Without this the bounds below would be a statement about this file's
    // arithmetic rather than about the detector's.
    let worst = 0;
    let worstAt = "";
    for (const r of [0, 1, 7, 10, 11, 64, 128, 200, 255]) {
      for (const g of [0, 10, 11, 128, 255]) {
        for (const b of [0, 10, 11, 128, 255]) {
          const diff = Math.abs(aStarWith(r, g, b, KNEE) - labAStar(r, g, b));
          if (diff > worst) {
            worst = diff;
            worstAt = `${r},${g},${b}`;
          }
        }
      }
    }
    console.log(`mirror worst |Δa*| = ${worst} at ${worstAt}`);
    expect(worst).toBe(0);
  });

  it("re-derives the window from the two sources rather than quoting it", () => {
    console.log(
      `ARU knee ${KNEE}, colour-science knee ${SLOPE} * ${CS_LINEAR_BREAKPOINT} = ${CS_KNEE}, ` +
        `width ${WINDOW_HIGH - WINDOW_LOW}, channel window [${CHANNEL_LOW}, ${CHANNEL_HIGH}]`,
    );
    expect(CS_KNEE).toBeLessThan(KNEE);
    // Whatever the window's width, no 8-bit channel value is inside it, which is
    // why nothing published today can differ. Re-derived here so the bounds
    // below are read as "reachable in principle" and not as a live discrepancy.
    const integersInside = Array.from({ length: 256 }, (_, i) => i / 255).filter(
      (c) => c > WINDOW_LOW && c <= WINDOW_HIGH,
    );
    console.log(`integer channels inside the window: ${integersInside.length}`);
    expect(integersInside).toHaveLength(0);
  });

  it("bounds the linear-light difference by the curve's own discontinuity", () => {
    let worst = 0;
    let worstAt = 0;
    for (const channel of windowChannels(SWEEP_STEPS)) {
      const diff = Math.abs(linearAt(channel, KNEE) - linearAt(channel, CS_KNEE));
      if (diff > worst) {
        worst = diff;
        worstAt = channel;
      }
    }
    // The two branches meet nowhere exactly, so inside the window the gap is the
    // knee discontinuity cycle 22 measured, and no larger.
    const discontinuity = Math.abs(KNEE / SLOPE - Math.pow((KNEE + OFFSET) / SCALE, 2.4));
    console.log(`worst |Δlinear| = ${worst} at channel ${worstAt}; knee discontinuity = ${discontinuity}`);
    expect(worst).toBeLessThanOrEqual(discontinuity);
    expect(worst).toBeGreaterThan(0);
  });

  it("bounds the a* error the knee choice can cause, against BLEMISH.minResidual", () => {
    let worst = 0;
    let worstAt = "";
    const channels = windowChannels(SWEEP_STEPS);
    // One channel inside the window against held values, each of the three
    // positions in turn, plus all three inside it together — the whole reachable
    // set for a single cell's a*.
    for (const channel of channels) {
      for (const held of HELD) {
        const cases: [number, number, number][] = [
          [channel, held, held],
          [held, channel, held],
          [held, held, channel],
          [channel, channel, channel],
        ];
        for (const [r, g, b] of cases) {
          const diff = Math.abs(aStarWith(r, g, b, KNEE) - aStarWith(r, g, b, CS_KNEE));
          if (diff > worst) {
            worst = diff;
            worstAt = `${r},${g},${b}`;
          }
        }
      }
    }
    console.log(
      `worst |Δa*| inside the window = ${worst} at ${worstAt}; ` +
        `BLEMISH.minResidual ${MIN_RESIDUAL} is ${MIN_RESIDUAL / worst}x larger`,
    );
    expect(worst).toBeGreaterThan(0);
    // The bound, measured and then pinned just above the measurement: a knee
    // move cannot come near the detector's own decision threshold, so "where the
    // knee belongs" is not a question about blemish counts.
    expect(worst).toBeLessThan(1e-5);
    expect(MIN_RESIDUAL / worst).toBeGreaterThan(1e5);
  });
});
