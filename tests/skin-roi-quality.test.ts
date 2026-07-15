import { describe, expect, test } from "vitest";
import {
  evaluateSkinRoiQuality,
  type SkinRoiRegions,
} from "../app/scan/skin-roi-quality";

type PixelFrame = { data: Uint8ClampedArray; width: number; height: number };

const regions: SkinRoiRegions = {
  tzone: { x: 0.35, y: 0.1, width: 0.3, height: 0.25 },
  leftCheek: { x: 0.08, y: 0.55, width: 0.3, height: 0.3 },
  rightCheek: { x: 0.62, y: 0.55, width: 0.3, height: 0.3 },
};

function frame(base: number, variation = 0): PixelFrame {
  const width = 80;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = Math.max(0, Math.min(255, base + ((x + y) % 2 === 0 ? variation : -variation)));
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

function paint(frameData: PixelFrame, region: SkinRoiRegions["tzone"], value: number, variation = 0) {
  const left = Math.floor(region.x * frameData.width);
  const top = Math.floor(region.y * frameData.height);
  const right = Math.ceil((region.x + region.width) * frameData.width);
  const bottom = Math.ceil((region.y + region.height) * frameData.height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = Math.max(0, Math.min(255, value + ((x + y) % 2 === 0 ? variation : -variation)));
      const offset = (y * frameData.width + x) * 4;
      frameData.data[offset] = pixel;
      frameData.data[offset + 1] = pixel;
      frameData.data[offset + 2] = pixel;
    }
  }
}

describe("skin ROI quality", () => {
  test("passes three measurable, well-lit, sharp skin regions", () => {
    expect(evaluateSkinRoiQuality(frame(132, 14), regions)).toMatchObject({
      regionsReady: true,
      exposure: true,
      noGlare: true,
      sharp: true,
      passed: true,
      reason: null,
    });
  });

  test("fails closed when a required region is missing or undersized", () => {
    expect(evaluateSkinRoiQuality(frame(132, 14), { ...regions, rightCheek: null })).toMatchObject({ passed: false, reason: "regions" });
    expect(
      evaluateSkinRoiQuality(frame(132, 14), {
        ...regions,
        rightCheek: { x: 0.8, y: 0.8, width: 0.02, height: 0.02 },
      })
    ).toMatchObject({ passed: false, reason: "regions" });
  });

  test("reports dark when one cheek lacks usable exposure", () => {
    const image = frame(132, 14);
    paint(image, regions.leftCheek!, 28, 2);
    expect(evaluateSkinRoiQuality(image, regions)).toMatchObject({ exposure: false, passed: false, reason: "dark" });
  });

  test("reports glare when one skin region contains clipped highlights", () => {
    const image = frame(132, 14);
    paint(image, regions.tzone!, 252, 2);
    expect(evaluateSkinRoiQuality(image, regions)).toMatchObject({ noGlare: false, passed: false, reason: "glare" });
  });

  test("reports soft when skin regions have no local detail", () => {
    expect(evaluateSkinRoiQuality(frame(132), regions)).toMatchObject({ sharp: false, passed: false, reason: "soft" });
  });

  test("uses stable regions, dark, glare, soft failure precedence", () => {
    const image = frame(132);
    paint(image, regions.leftCheek!, 20);
    paint(image, regions.tzone!, 254);
    expect(evaluateSkinRoiQuality(image, regions)).toMatchObject({ reason: "dark" });
    expect(evaluateSkinRoiQuality(image, { ...regions, tzone: null })).toMatchObject({ reason: "regions" });
  });
});
