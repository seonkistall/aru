import { describe, expect, it } from "vitest";
import { analyzeSkin, analyzeSkinBurst } from "@/lib/skin";

type LM = { x: number; y: number; z?: number };

// Deterministic (non-random) textured frame so analyzeSkin produces non-trivial
// stats — the point is to catch any nondeterminism (Math.random, Date, unstable
// iteration/sort) by asserting repeated runs are byte-identical.
function patternedFrame(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const v = 120 + ((x * 7 + y * 13) % 60);
      data[i] = Math.min(255, v + 20);
      data[i + 1] = v;
      data[i + 2] = Math.max(0, v - 10);
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

function centeredLandmarks(): LM[] {
  return Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

describe("analyzeSkin determinism", () => {
  it("returns byte-identical reads for the same input across runs", () => {
    const frame = patternedFrame(200, 200);
    const lm = centeredLandmarks();
    const a = analyzeSkin(frame, lm);
    const b = analyzeSkin(patternedFrame(200, 200), centeredLandmarks());
    expect(a).not.toBeNull();
    // Full structural equality — levels, confidence, raw floats, narrative.
    expect(b).toEqual(a);
  });
});

describe("analyzeSkinBurst determinism", () => {
  it("is stable and fully self-consistent across identical frames", () => {
    const frame = () => ({ imageData: patternedFrame(200, 200), landmarks: centeredLandmarks() });
    const first = analyzeSkinBurst([frame(), frame(), frame()]);
    const second = analyzeSkinBurst([frame(), frame(), frame()]);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    // Identical frames must agree perfectly on every attribute.
    expect(first!.burst?.agreement.oil).toBe(1);
    expect(first!.burst?.agreement.redness).toBe(1);
    expect(first!.burst?.agreement.pores).toBe(1);
  });

  it("median-fuses identical frames to the single-frame reading", () => {
    const single = analyzeSkin(patternedFrame(200, 200), centeredLandmarks());
    const burst = analyzeSkinBurst([
      { imageData: patternedFrame(200, 200), landmarks: centeredLandmarks() },
      { imageData: patternedFrame(200, 200), landmarks: centeredLandmarks() },
      { imageData: patternedFrame(200, 200), landmarks: centeredLandmarks() },
    ]);
    expect(burst!.oil.level).toBe(single!.oil.level);
    expect(burst!.redness.level).toBe(single!.redness.level);
    expect(burst!.pores.level).toBe(single!.pores.level);
  });
});
