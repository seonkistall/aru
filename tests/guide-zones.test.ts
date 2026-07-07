import { describe, expect, it } from "vitest";
import { computeGuideZones } from "@/app/scan/guide";
import { SAMPLING_LANDMARKS } from "@/lib/skin";
import type { Landmark } from "@/app/scan/types";

const LEFT_CHEEK = SAMPLING_LANDMARKS.cheeks.slice(0, 7);
const RIGHT_CHEEK = SAMPLING_LANDMARKS.cheeks.slice(7);

function landmarksForFace(scale: number): Landmark[] {
  const landmarks: Landmark[] = [];
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y };
  };
  const around = (center: number, offsets: number[]) => offsets.map((offset) => center + offset * scale);

  SAMPLING_LANDMARKS.tzone.forEach((index, i) => {
    const xs = around(0.5, [-0.055, -0.035, -0.02, 0, 0.02, 0.035, 0.055]);
    const ys = around(0.34, [-0.07, -0.045, -0.025, 0, 0.02, 0.045, 0.07]);
    set(index, xs[i % xs.length], ys[i % ys.length]);
  });

  LEFT_CHEEK.forEach((index, i) => {
    const xs = around(0.39, [-0.035, -0.022, -0.012, 0.004, 0.016, 0.028, 0.04]);
    const ys = around(0.55, [-0.045, -0.028, -0.012, 0.004, 0.018, 0.032, 0.048]);
    set(index, xs[i], ys[i]);
  });

  RIGHT_CHEEK.forEach((index, i) => {
    const xs = around(0.61, [-0.04, -0.028, -0.016, -0.004, 0.012, 0.022, 0.035]);
    const ys = around(0.55, [-0.048, -0.032, -0.018, -0.004, 0.012, 0.028, 0.045]);
    set(index, xs[i], ys[i]);
  });

  return landmarks;
}

describe("computeGuideZones", () => {
  it("scales forehead and cheek guide windows with the detected face size", () => {
    const small = computeGuideZones(landmarksForFace(0.7), 720, 960);
    const large = computeGuideZones(landmarksForFace(2.1), 720, 960);

    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large!.tzone.width / small!.tzone.width).toBeGreaterThan(2.45);
    expect(large!.leftCheek.width / small!.leftCheek.width).toBeGreaterThan(2.45);
    expect(large!.rightCheek.height / small!.rightCheek.height).toBeGreaterThan(2.45);
  });
});
