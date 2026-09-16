import { describe, expect, it } from "vitest";
import { analyzeSkin } from "@/lib/skin";
import { toneBandFromIta } from "@/lib/tone-bands";

/**
 * `raw.toneIta` is the only input to tone-band assignment on both first-party ingest
 * paths, and `ml/subgroups.py` blocks promotion per tone band. Until this file existed
 * nothing measured it: a radians/degrees slip, a wrong white point, or a scene-dependent
 * preprocessing step would put every sample in one band, and the fairness gate would
 * then pass by being blind rather than by being fair — with every other check still green.
 *
 * The expected values below are not this repository agreeing with itself. They come from
 * `ml/tools/verify_tone_ita.py`, which checks ARU's conversion against scikit-image and
 * colour-science; the six swatch angles agree with both references to 1.815e-02 and
 * 1.672e-02 degrees respectively. The run is in docs/tone-ita-verification.md.
 */

type LM = { x: number; y: number; z?: number };

// Bands come from lib/tone-bands.ts, which tests/subgroup-contract.test.ts already
// holds against ITA_BANDS in ml/subgroups.py. Re-parsing the Python here would add a
// second, stricter pin on its formatting and could disagree with the check that
// already exists.
const bandFor = toneBandFromIta;

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

/** A frame of one flat colour: every cheek pixel is that colour, so the k-means in
 *  `dominantTone` converges on it exactly and the ITA is the swatch's own, not an
 *  artefact of the synthetic texture. */
function flatFrame(rgb: readonly [number, number, number]): ImageData {
  const w = 400;
  const h = 480;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 255;
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

/** One face, held byte-for-byte identical, in front of a wall the caller chooses. */
function faceOnWall(wall: readonly [number, number, number]): ImageData {
  const w = 400;
  const h = 480;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 20260916;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inFace = x >= 0.18 * w && x <= 0.82 * w && y >= 0.1 * h && y <= 0.94 * h;
      const noise = (rand() - 0.5) * 9;
      const base = y < 0.42 * h ? 186 : y < 0.72 * h ? 170 : 158;
      const px = inFace
        ? [base + 22 + noise, base - 4 + noise, base - 18 + noise]
        : [wall[0] + noise, wall[1] + noise, wall[2] + noise];
      const o = (y * w + x) * 4;
      data[o] = Math.max(0, Math.min(255, px[0]));
      data[o + 1] = Math.max(0, Math.min(255, px[1]));
      data[o + 2] = Math.max(0, Math.min(255, px[2]));
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

const landmarks = faceLandmarks();

// sRGB, L*, b*, ITA and band, all produced by ml/tools/verify_tone_ita.py.
const SWATCHES: { rgb: [number, number, number]; lstar: number; ita: number; band: string }[] = [
  { rgb: [242, 223, 211], lstar: 90.0, ita: 78.4, band: "very_light" },
  { rgb: [226, 195, 176], lstar: 80.9, ita: 66.3, band: "very_light" },
  { rgb: [205, 168, 144], lstar: 71.6, ita: 50.9, band: "light" },
  { rgb: [181, 139, 110], lstar: 61.1, ita: 27.2, band: "tan" },
  { rgb: [140, 100, 74], lstar: 45.9, ita: -11.0, band: "brown_dark" },
  { rgb: [86, 58, 42], lstar: 27.2, ita: -56.8, band: "brown_dark" },
];

describe("toneIta", () => {
  it("matches the reference-verified angle for every swatch", () => {
    for (const { rgb, lstar, ita } of SWATCHES) {
      const reads = analyzeSkin(flatFrame(rgb), landmarks);
      expect(reads, `analyzeSkin returned null for ${rgb}`).not.toBeNull();
      // 0.1 is the rounding both implementations apply, so this is equality.
      expect(reads!.raw.toneIta, `toneIta for ${rgb}`).toBe(ita);
      expect(reads!.raw.toneLstar, `toneLstar for ${rgb}`).toBe(lstar);
    }
  });

  // The failure this exists for. atan() returns radians; every ARU value has to be
  // degrees, and the slip is silent because a radian value is still a number and
  // tone_band_from_ita still returns a band for it — one band, for everyone.
  it("is in degrees, so the swatches do not collapse into one band", () => {
    const angles = SWATCHES.map(({ rgb }) => analyzeSkin(flatFrame(rgb), landmarks)!.raw.toneIta);
    expect(Math.max(...angles.map(Math.abs))).toBeGreaterThan(Math.PI / 2);
    const bands = new Set(angles.map(bandFor));
    expect(bands.size).toBeGreaterThanOrEqual(3);
    // The same six angles read as radians would be one cell, which is what makes
    // a subgroup gate that never blocks look exactly like a fair model.
    expect(new Set(angles.map((a) => bandFor((a * Math.PI) / 180))).size).toBe(1);
  });

  it("orders light to deep", () => {
    const angles = SWATCHES.map(({ rgb }) => analyzeSkin(flatFrame(rgb), landmarks)!.raw.toneIta);
    for (let i = 1; i < angles.length; i += 1) expect(angles[i]).toBeLessThan(angles[i - 1]);
  });

  it("assigns the band lib/tone-bands.ts assigns", () => {
    for (const { rgb, band } of SWATCHES) {
      expect(bandFor(analyzeSkin(flatFrame(rgb), landmarks)!.raw.toneIta), `band for ${rgb}`).toBe(band);
    }
  });

  /**
   * Gray-world white balance estimates the illuminant from the whole frame, so a
   * coloured wall is read as coloured light and divided out of the face in front of
   * it. It used to be applied to the tone estimate, and one face read as `very_light`,
   * `light` or `brown_dark` depending on the wall — three of the five bands, spanning
   * the full width of the scale, from a face that never changed. A stratifier that
   * answers "what colour is the room" cannot stratify people, and `ml/ita.py` applies no such gain offline, so
   * a dataset image and a live scan of one face landed in different cells.
   */
  it("does not change when only the background changes", () => {
    const walls: [string, [number, number, number]][] = [
      ["grey", [180, 180, 180]],
      ["warm wood", [200, 150, 105]],
      ["cool blue", [120, 150, 205]],
      ["white", [235, 235, 235]],
      ["dark", [60, 60, 60]],
    ];
    const readings = walls.map(([name, wall]) => {
      const reads = analyzeSkin(faceOnWall(wall), landmarks);
      expect(reads, `analyzeSkin returned null for the ${name} wall`).not.toBeNull();
      return { name, ita: reads!.raw.toneIta, lstar: reads!.raw.toneLstar, band: bandFor(reads!.raw.toneIta) };
    });
    const first = readings[0];
    for (const reading of readings) {
      expect(reading.ita, `toneIta behind a ${reading.name} wall`).toBe(first.ita);
      expect(reading.lstar, `toneLstar behind a ${reading.name} wall`).toBe(first.lstar);
      expect(reading.band, `tone band behind a ${reading.name} wall`).toBe(first.band);
    }
  });
});
