import { describe, expect, it } from "vitest";
import { analyzeSkin, analyzeSkinBurst } from "@/lib/skin";

type LM = { x: number; y: number; z?: number };

// Minimal ImageData stand-in: skin.ts only reads { data, width, height }.
function solidFrame(w: number, h: number, rgb: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

// 468 face-mesh landmarks all near center — every sampling patch lands inside a
// 200x200 frame, giving well over the 40-sample floor per region.
function centeredLandmarks(): LM[] {
  return Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

// Landmarks entirely outside the normalized frame — every patch clamps out of
// bounds, so a region collects zero pixels and analysis returns null.
function offFrameLandmarks(): LM[] {
  return Array.from({ length: 468 }, () => ({ x: 5, y: 5, z: 0 }));
}

describe("analyzeSkin", () => {
  it("returns null when the face regions fall outside the frame", () => {
    expect(analyzeSkin(solidFrame(200, 200, [150, 150, 150]), offFrameLandmarks())).toBeNull();
  });

  it("reads a flat, even-toned frame as calm (level 0 across attributes)", () => {
    const reads = analyzeSkin(solidFrame(200, 200, [150, 150, 150]), centeredLandmarks());
    expect(reads).not.toBeNull();
    expect(reads!.oil.level).toBe(0);
    expect(reads!.redness.level).toBe(0);
    expect(reads!.pores.level).toBe(0);
    expect(reads!.overall.calm).toBe(true);
  });
});

describe("analyzeSkinBurst (median fusion)", () => {
  it("agrees fully across identical frames", () => {
    const frame = { imageData: solidFrame(200, 200, [150, 150, 150]), landmarks: centeredLandmarks() };
    const reads = analyzeSkinBurst([frame, frame, frame]);
    expect(reads).not.toBeNull();
    expect(reads!.burst?.frames).toBe(3);
    expect(reads!.burst?.agreement.oil).toBe(1);
    expect(reads!.burst?.agreement.redness).toBe(1);
    expect(reads!.burst?.agreement.pores).toBe(1);
    expect(reads!.oil.level).toBe(0);
  });

  it("drops unreadable frames and still fuses the readable ones", () => {
    const good = { imageData: solidFrame(200, 200, [150, 150, 150]), landmarks: centeredLandmarks() };
    const bad = { imageData: solidFrame(200, 200, [150, 150, 150]), landmarks: offFrameLandmarks() };
    const reads = analyzeSkinBurst([good, bad, good]);
    expect(reads).not.toBeNull();
    expect(reads!.oil.level).toBe(0);
  });

  it("returns null when no frame is readable", () => {
    const bad = { imageData: solidFrame(200, 200, [150, 150, 150]), landmarks: offFrameLandmarks() };
    expect(analyzeSkinBurst([bad, bad])).toBeNull();
  });
});
