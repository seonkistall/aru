import { describe, expect, it } from "vitest";
import { coverCropFractions, faceBox, isNormalizedBox, rawFaceSize } from "@/lib/scan-geometry";

describe("coverCropFractions", () => {
  it("is identity for a 3:4 stream (matches the frame)", () => {
    const { fx, fy } = coverCropFractions(720, 960);
    expect(fx).toBeCloseTo(1, 6);
    expect(fy).toBeCloseTo(1, 6);
  });

  it("crops vertically for a 9:16 portrait stream (fx=1, fy=0.75)", () => {
    const { fx, fy } = coverCropFractions(720, 1280);
    expect(fx).toBeCloseTo(1, 6);
    expect(fy).toBeCloseTo(0.75, 6);
  });

  it("crops horizontally for a 4:3 landscape stream (fx=0.5625, fy=1)", () => {
    const { fx, fy } = coverCropFractions(960, 720);
    expect(fx).toBeCloseTo(0.5625, 6);
    expect(fy).toBeCloseTo(1, 6);
  });

  it("maps a centered landmark to the visible center on 9:16", () => {
    const { fy } = coverCropFractions(720, 1280);
    const visY = (0.5 - (1 - fy) / 2) / fy; // same transform as measureQuality
    expect(visY).toBeCloseTo(0.5, 6);
  });

  it("falls back to the frame ratio when dimensions are zero", () => {
    const { fx, fy } = coverCropFractions(0, 0);
    expect(fx).toBeCloseTo(1, 6);
    expect(fy).toBeCloseTo(1, 6);
  });
});

describe("faceBox + rawFaceSize", () => {
  it("computes the bounding box of normalized points", () => {
    const box = faceBox([
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.7 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(box).toEqual({ minX: 0.4, minY: 0.3, maxX: 0.6, maxY: 0.7 });
    expect(rawFaceSize(box)).toBeCloseTo(0.4, 6); // height 0.4 > width 0.2
  });
});

describe("isNormalizedBox (GPU corruption guard)", () => {
  it("accepts a normal in-frame face", () => {
    expect(isNormalizedBox({ minX: 0.3, minY: 0.25, maxX: 0.7, maxY: 0.8 })).toBe(true);
  });

  it("rejects the corrupt ~1e34 landmark output seen on some Android GPUs", () => {
    expect(isNormalizedBox({ minX: -7.6e33, minY: 2.4e34, maxX: 1.3e34, maxY: 2.4e34 })).toBe(false);
  });

  it("rejects NaN/Infinity", () => {
    expect(isNormalizedBox({ minX: 0, minY: 0, maxX: NaN, maxY: 1 })).toBe(false);
  });
});
