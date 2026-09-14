import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin } from "@/lib/skin";

const root = resolve(import.meta.dirname, "..");
const readMl = (file: string) => readFileSync(resolve(root, "ml", file), "utf8");
const skinTs = readFileSync(resolve(root, "lib/skin.ts"), "utf8");

type LM = { x: number; y: number; z?: number };

/**
 * A synthetic face: four regions at different lightness, fine per-pixel texture,
 * and a handful of redder discs standing in for blemishes. Enough structure that
 * the within-image indices have something to measure, built from a seeded PRNG so
 * the same frame comes back every run.
 */
function syntheticFace(scale = 1, channelGain: [number, number, number] = [1, 1, 1], spots = true): ImageData {
  const w = 400;
  const h = 480;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 20260914;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const blemishes = [
    { x: 120, y: 260 }, { x: 150, y: 300 }, { x: 280, y: 265 },
    { x: 300, y: 310 }, { x: 200, y: 380 },
  ];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Forehead brighter than cheeks, chin darker: an uneven but plausible face.
      const base = y < 200 ? 186 : y < 340 ? 170 : 158;
      const noise = (rand() - 0.5) * 9;
      let r = base + 22 + noise;
      let g = base - 4 + noise;
      let b = base - 18 + noise;
      if (spots) for (const blemish of blemishes) {
        const dx = x - blemish.x;
        const dy = y - blemish.y;
        if (dx * dx + dy * dy < 25) {
          r += 26;
          g -= 6;
          b -= 6;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = Math.max(0, Math.min(255, r * scale * channelGain[0]));
      data[o + 1] = Math.max(0, Math.min(255, g * scale * channelGain[1]));
      data[o + 2] = Math.max(0, Math.min(255, b * scale * channelGain[2]));
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

// Landmarks spread over the synthetic face so forehead, both cheeks and chin land
// in the three lightness zones; indices outside those sets sit on the cheeks.
function faceLandmarks(): LM[] {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks: LM[] = Array.from({ length: 468 }, () => at(0.5, 0.58));
  const place = (indices: number[], x: number, y: number) => {
    for (const index of indices) landmarks[index] = at(x, y);
  };
  place([9, 8, 107, 336, 151, 10, 67, 297], 0.5, 0.22); // forehead
  place([1, 4, 5, 195, 197], 0.5, 0.48); // nose
  place([50, 101, 118, 117, 116, 205, 36], 0.32, 0.58); // left cheek
  place([280, 330, 347, 346, 345, 425, 266], 0.68, 0.58); // right cheek
  place([18, 200, 199, 175, 152, 83, 313], 0.5, 0.82); // chin
  return landmarks;
}

describe("within-image indices", () => {
  const landmarks = faceLandmarks();
  const baseline = analyzeSkin(syntheticFace(), landmarks);

  it("measures all four new indices on a synthetic face", () => {
    expect(baseline).not.toBeNull();
    expect(baseline!.raw.toneSpread).toBeGreaterThan(0);
    expect(baseline!.raw.roughnessRatio).toBeGreaterThan(0);
    expect(baseline!.raw.blemishCount).toBeGreaterThan(0);
    expect(baseline!.raw.blemishDensity).toBeGreaterThan(0);
  });

  // The property the whole label-free path rests on: a device or exposure change
  // moves absolute colour a lot and the within-image indices very little. Measured
  // ground for the claim is in docs/label-free-axes.md.
  it("survives an exposure change that moves the absolute tone", () => {
    const brighter = analyzeSkin(syntheticFace(1.12), landmarks);
    expect(brighter).not.toBeNull();

    // Absolute: L* of the dominant cheek tone moves well beyond rounding.
    expect(Math.abs(brighter!.raw.toneLstar - baseline!.raw.toneLstar)).toBeGreaterThan(2);

    // Within-image: evenness and blemish count are unmoved.
    expect(brighter!.raw.toneSpread).toBeCloseTo(baseline!.raw.toneSpread, 2);
    expect(brighter!.raw.blemishCount).toBe(baseline!.raw.blemishCount);
  });

  it("survives a per-channel gain change", () => {
    const warmer = analyzeSkin(syntheticFace(1, [1.12, 1, 0.92]), landmarks);
    expect(warmer).not.toBeNull();
    expect(warmer!.raw.toneSpread).toBeCloseTo(baseline!.raw.toneSpread, 2);
    expect(warmer!.raw.blemishCount).toBe(baseline!.raw.blemishCount);
  });

  it("finds nothing on the same face with the spots removed", () => {
    // Identical frame and identical per-pixel noise, discs gone. Anything counted
    // here is the detector firing on sensor noise, which is what the local
    // background subtraction and the residual floor exist to prevent.
    const clean = analyzeSkin(syntheticFace(1, [1, 1, 1], false), landmarks);
    expect(clean).not.toBeNull();
    expect(clean!.raw.blemishCount).toBe(0);
    expect(clean!.raw.blemishDensity).toBe(0);
    expect(baseline!.raw.blemishCount).toBeGreaterThan(0);
  });
});

describe("index registry contract", () => {
  const python = readMl("skin_indices.py");

  it("names feature keys that lib/skin.ts actually writes", () => {
    const block = python.slice(python.indexOf("FEATURE_KEY = {"), python.indexOf("#: Feature keys added"));
    const keys = [...block.matchAll(/"[a-z_]+": "([A-Za-z]+)"/g)].map(([, key]) => key);
    expect(keys.length).toBeGreaterThan(4);
    const rawType = skinTs.slice(skinTs.indexOf("export type SkinRawFeatures"), skinTs.indexOf("export type ConfidenceSignal"));
    for (const key of keys) expect(rawType, `${key} missing from SkinRawFeatures`).toContain(`${key}: number`);
  });

  it("keeps the pipeline's new-feature column list in step with the app", () => {
    const line = python.match(/NEW_FEATURE_KEYS = \(([^)]*)\)/);
    expect(line, "NEW_FEATURE_KEYS not found in ml/skin_indices.py").toBeTruthy();
    const keys = [...(line?.[1] ?? "").matchAll(/"([A-Za-z]+)"/g)].map(([, key]) => key);
    expect(keys).toEqual(["toneSpread", "roughnessRatio", "blemishCount", "blemishDensity"]);
    const rawType = skinTs.slice(skinTs.indexOf("export type SkinRawFeatures"), skinTs.indexOf("export type ConfidenceSignal"));
    for (const key of keys) expect(rawType).toContain(`${key}: number`);
  });

  it("calibrates only features the app measures", () => {
    const calibrate = readMl("calibrate.py");
    const bodies = [
      calibrate.match(/^FEATURE = \{(.*)\}$/m)?.[1],
      calibrate.match(/^UNLABELLED_FEATURE = \{([\s\S]*?)\}$/m)?.[1],
    ];
    expect(bodies.every(Boolean), "feature maps not found in ml/calibrate.py").toBe(true);
    const declared = bodies.flatMap((body) => [...(body ?? "").matchAll(/"[a-z]+": "([A-Za-z]+)"/g)].map(([, feature]) => feature));
    const observation = calibrate.match(/^OBSERVATION_FEATURE = \{[\s\S]*?"([A-Za-z]+)", "([A-Za-z]+)"\)/m);
    expect(declared.length).toBeGreaterThan(3);
    const rawType = skinTs.slice(skinTs.indexOf("export type SkinRawFeatures"), skinTs.indexOf("export type ConfidenceSignal"));
    for (const feature of declared) expect(rawType, `${feature} is not a SkinRawFeatures field`).toContain(`${feature}: number`);
    expect(observation?.[1]).toBe("blemishDensity");
    // The observation label must be a key the app actually records.
    expect(readFileSync(resolve(root, "lib/labels.ts"), "utf8")).toContain(`${observation?.[2]}?: boolean`);
  });
});
