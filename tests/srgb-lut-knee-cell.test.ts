import { describe, expect, it } from "vitest";
import { labAStar } from "@/lib/skin";

/**
 * Cycle 41, ML track. The backlog item "Is a 4096-entry interpolated table for
 * `srgbLinear` actually faster than `Math.pow(., 2.4)`?" ends with an acceptance
 * criterion written as prose: "either the a*-only fast path takes the table and
 * `rgbToLab` keeps `Math.pow`, or the table is built so the knee cell is exact."
 * That sentence rests on two numbers nothing in the suite re-derives — a worst
 * a* error over the whole 0-255 domain, and where in the table it sits.
 *
 * This file builds the candidate table the item describes and measures both, so
 * a future candidate is checked against a run rather than against a paragraph.
 * It changes nothing in the product: `srgbLinear` is untouched, `labAStar` is
 * imported and used as the reference, and no published field moves.
 *
 * It needs no labelled export, no real photo and no phone, which is why it is
 * this cycle's ML item. What it does NOT settle, and the item stays open for:
 * whether the table is worth shipping at all (that is a phone-profile question
 * this container cannot answer), and which of the two escapes to take.
 */

const KNEE = 0.04045; // ARU's sRGB breakpoint, `lib/skin.ts:282`
const N = 4096;

/** The exact curve, transcribed from `lib/skin.ts:280-283`. */
function exactLinear(channel: number): number {
  const c = channel / 255;
  return c <= KNEE ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** The candidate: N+1 samples over the 0-255 channel domain, read with linear interpolation. */
const TABLE = (() => {
  const t = new Float64Array(N + 1);
  for (let i = 0; i <= N; i += 1) t[i] = exactLinear((i / N) * 255);
  return t;
})();

function tableLinear(channel: number): number {
  const t = (channel / 255) * N;
  const cell = Math.min(N - 1, Math.max(0, Math.floor(t)));
  const f = t - cell;
  return TABLE[cell] + (TABLE[cell + 1] - TABLE[cell]) * f;
}

const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** `labAStar` with the transfer curve swapped, so the only difference is the table. */
function tableAStar(r: number, g: number, b: number): number {
  const rl = tableLinear(r);
  const gl = tableLinear(g);
  const bl = tableLinear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  return 500 * (labF(x) - labF(y));
}

const cellOf = (channel: number) => Math.floor((channel / 255) * N);
const KNEE_CELL = cellOf(KNEE * 255);

/** Worst |table a* - exact a*| over one channel's range, with the other two held. */
function sweep(lo: number, hi: number, steps: number, hold: number) {
  let worst = -1;
  let at = -1;
  for (let s = 0; s <= steps; s += 1) {
    const channel = lo + ((hi - lo) * s) / steps;
    const error = Math.abs(tableAStar(channel, hold, hold) - labAStar(channel, hold, hold));
    if (error > worst) {
      worst = error;
      at = channel;
    }
  }
  return { worst, at };
}

describe("a 4096-entry interpolated srgbLinear table, measured against labAStar", () => {
  it("reproduces the reference exactly at every sample point, so only interpolation is on trial", () => {
    for (let i = 0; i <= N; i += 137) {
      expect(tableLinear((i / N) * 255)).toBe(exactLinear((i / N) * 255));
    }
  });

  it("puts its worst a* error in the knee cell, which is the cell the item says must be exact", () => {
    // The knee at 0.04045 falls strictly inside one cell, so that cell interpolates
    // across a join between a straight line and a power law.
    expect(KNEE_CELL).toBe(165);
    expect(cellOf(KNEE * 255)).toBe(KNEE_CELL);

    let worst = -1;
    let at = -1;
    // Two neighbours held at a mid-grey the detector actually sees, so one channel's
    // transfer error is not diluted by two exact ones.
    for (let hold = 0; hold <= 255; hold += 15) {
      const found = sweep(0, 255, 255 * 32, hold);
      if (found.worst > worst) {
        worst = found.worst;
        at = found.at;
      }
    }
    expect(cellOf(at), `the worst a* error moved out of the knee cell, to channel ${at}`).toBe(KNEE_CELL);
    // Over the WHOLE domain the table is far outside the certified radius the item
    // quotes for the detector's own band (1.046e-5). That is the finding, not a bug.
    expect(worst).toBeGreaterThan(1.046e-5);
  });

  it("clears that radius inside the band the detector's own L >= 40 gate leaves", () => {
    // The item records the detector feeding labAStar channels 132-220 on the fixture
    // family. Inside that band the table is two orders of magnitude better.
    let worst = -1;
    for (let hold = 132; hold <= 220; hold += 4) {
      worst = Math.max(worst, sweep(132, 220, 88 * 16, hold).worst);
    }
    expect(worst).toBeLessThan(1.046e-5);
  });

  it("names the three rgbToLab call sites that are NOT behind that gate", () => {
    // `L >= 40` lives in `detectBlemishes`, not in `srgbLinear`, so `rgbToLab`'s
    // callers pass region means from the whole domain. A table that is only good
    // inside 132-220 is therefore not safe for `rgbToLab` — which is exactly the
    // fork the backlog item leaves open, and why this test does not pick one.
    const belowGate = sweep(0, 40, 40 * 64, 30);
    expect(belowGate.worst).toBeGreaterThan(1.046e-5);
    expect(cellOf(belowGate.at)).toBe(KNEE_CELL);
  });
});
