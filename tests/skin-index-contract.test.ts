import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin, levelFor } from "@/lib/skin";

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

/** Text between two anchors, failing loudly rather than silently returning "" if either moves. */
function section(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + 1);
  expect(start, `anchor not found: ${from}`).toBeGreaterThanOrEqual(0);
  expect(end, `anchor not found after ${from}: ${to}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * The three axis -> feature maps in ml/calibrate.py, parsed once.
 *
 * Each body is bounded by the closing brace at its own line end, so a renamed or
 * reformatted map fails the assertion instead of letting the scan run on into the
 * rest of the file and assert against something unrelated.
 */
function calibrateFeatureMaps() {
  const calibrate = readMl("calibrate.py");
  const body = (name: string) => {
    const match = calibrate.match(new RegExp(`^${name} = \\{([\\s\\S]*?)\\}\\s*$`, "m"));
    expect(match, `${name} not found in ml/calibrate.py`).toBeTruthy();
    return match?.[1] ?? "";
  };
  const features = (name: string) => {
    const found = [...body(name).matchAll(/"[a-z_]+": "([A-Za-z]+)"/g)].map(([, feature]) => feature);
    expect(found.length, `${name} parsed to no entries`).toBeGreaterThan(0);
    return found;
  };
  // Global, so a second observation axis is checked too rather than silently skipped.
  const observation = [...body("OBSERVATION_FEATURE").matchAll(/"[a-z_]+": \("([A-Za-z]+)", "([A-Za-z]+)"\)/g)]
    .map(([, feature, label]) => ({ feature, label }));
  expect(observation.length, "OBSERVATION_FEATURE parsed to no entries").toBeGreaterThan(0);
  return { graded: features("FEATURE"), unlabelled: features("UNLABELLED_FEATURE"), observation };
}

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

  it("exports every calibratable feature from the /eval harness", () => {
    // The golden-set harness is the only path that turns real photos into cut points
    // without a pilot. If it stops writing a feature calibrate.py reads, that axis
    // silently drops out of the calibration run with no error anywhere.
    const evalPage = readFileSync(resolve(root, "app/eval/page.tsx"), "utf8");
    const exported = section(evalPage, "function exportCalibrationJsonl", "const diffCell");
    const block = section(exported, "features: {", "labels: {");
    // Key AND value: `roughnessRatio: undefined` or a key with no row field behind it
    // would satisfy a name-only check while exporting nothing.
    const written = [...block.matchAll(/^\s+([A-Za-z]+):\s*(row\.[A-Za-z]+|Number\(row\.[A-Za-z]+)/gm)].map(([, key]) => key);
    expect(written.sort()).toEqual([
      "blemishCount", "blemishDensity", "cov", "relRedness", "roughnessRatio",
      "shine", "toneIta", "toneLstar", "toneSpread",
    ]);

    const maps = calibrateFeatureMaps();
    const needed = [...maps.graded, ...maps.unlabelled, ...maps.observation.map((pair) => pair.feature)];
    expect(needed.length).toBe(6);
    for (const feature of needed) expect(written, `${feature} missing from the /eval calibration export`).toContain(feature);
  });

  it("calibrates only features the app measures", () => {
    const maps = calibrateFeatureMaps();
    const declared = [...maps.graded, ...maps.unlabelled, ...maps.observation.map((pair) => pair.feature)];
    expect(declared).toEqual(["shine", "relRedness", "cov", "toneSpread", "roughnessRatio", "blemishDensity"]);

    const rawType = section(skinTs, "export type SkinRawFeatures", "export type ConfidenceSignal");
    for (const feature of declared) expect(rawType, `${feature} is not a SkinRawFeatures field`).toContain(`${feature}: number`);

    // Every observation label must be a key the app actually records on a sample.
    const labelsTs = readFileSync(resolve(root, "lib/labels.ts"), "utf8");
    expect(maps.observation.length).toBeGreaterThan(0);
    for (const pair of maps.observation) expect(labelsTs, `${pair.label} is not recorded in SampleMeta`).toContain(`${pair.label}?: boolean`);
  });
});

describe("shipped heuristic contract", () => {
  // The promotion gate makes a trained model beat the ROI heuristic before it may
  // replace it, and the Python side scores that heuristic from the manifest. If the
  // manifest and lib/skin.ts drift, the gate measures a rule the app does not ship —
  // and a model could be promoted for beating a heuristic nobody uses.
  const manifest = JSON.parse(
    readFileSync(resolve(root, "public/models/visible-attributes/manifest.json"), "utf8")
  );

  it("publishes the same thresholds lib/skin.ts buckets with", () => {
    const declared = manifest.fallbackHeuristic.axes as Record<
      string,
      { feature: string; thresholds: [number, number] }
    >;

    const block = skinTs.slice(
      skinTs.indexOf("const ATTR_THRESHOLDS"),
      skinTs.indexOf("const ATTR_RAW_KEY")
    );
    expect(block).toBeTruthy();

    for (const [axis, spec] of Object.entries(declared)) {
      const match = block.match(new RegExp(`${axis}:\\s*\\[([\\d.eE+-]+),\\s*([\\d.eE+-]+)\\]`));
      expect(match, `${axis} missing from ATTR_THRESHOLDS in lib/skin.ts`).toBeTruthy();
      expect([Number(match![1]), Number(match![2])], axis).toEqual(spec.thresholds);
    }
  });

  it("covers exactly the axes lib/skin.ts buckets, in both directions", () => {
    // Every other check here loops over the MANIFEST's axes, so an axis added to
    // ATTR_RAW_KEY but never declared in the manifest was invisible to all of them —
    // and it would silently fall out of covered_axes(), so the gate would never ask a
    // model to beat the shipped rule for it.
    const rawKeyBlock = skinTs.slice(
      skinTs.indexOf("const ATTR_RAW_KEY"),
      skinTs.indexOf("export function levelFor")
    );
    expect(rawKeyBlock).toBeTruthy();
    const inSkinTs = [...rawKeyBlock.matchAll(/^\s{2}(\w+):\s*"\w+"/gm)].map((m) => m[1]).sort();
    const inManifest = Object.keys(manifest.fallbackHeuristic.axes).sort();
    expect(inSkinTs.length).toBeGreaterThan(0);
    expect(inManifest).toEqual(inSkinTs);
  });

  it("publishes the same raw feature key lib/skin.ts reads each axis from", () => {
    const declared = manifest.fallbackHeuristic.axes as Record<string, { feature: string }>;
    const block = skinTs.slice(
      skinTs.indexOf("const ATTR_RAW_KEY"),
      skinTs.indexOf("export function levelFor")
    );
    expect(block).toBeTruthy();

    for (const [axis, spec] of Object.entries(declared)) {
      const match = block.match(new RegExp(`${axis}:\\s*"([A-Za-z]+)"`));
      expect(match, `${axis} missing from ATTR_RAW_KEY in lib/skin.ts`).toBeTruthy();
      expect(match![1], axis).toBe(spec.feature);
    }
  });

  it("reproduces the levels analyzeSkin actually reports, edge convention included", () => {
    // The Python baseline scorer applies exactly this rule to the same recorded
    // features. If the convention here and there disagree — e.g. on whether a value
    // sitting ON a cut point rounds up — the gate would measure a fake gap between
    // the model and the heuristic it is supposed to be replacing.
    const declared = manifest.fallbackHeuristic.axes as Record<
      string,
      { feature: string; thresholds: number[] }
    >;
    const predict = (value: number, thresholds: number[]) => {
      let level = 0;
      for (const cut of thresholds) {
        if (value < cut) return level;
        level += 1;
      }
      return level;
    };

    const landmarks = faceLandmarks();
    for (const frame of [syntheticFace(), syntheticFace(1.12), syntheticFace(1, [1.12, 1, 0.92])]) {
      const reads = analyzeSkin(frame, landmarks);
      expect(reads).not.toBeNull();
      for (const [axis, spec] of Object.entries(declared)) {
        const value = (reads!.raw as unknown as Record<string, number>)[spec.feature];
        expect(typeof value, `${axis} raw.${spec.feature}`).toBe("number");
        const bucket = reads![axis as "oil" | "redness" | "pores"];
        expect(predict(value, spec.thresholds), `${axis} @ ${value}`).toBe(bucket.level);
      }
    }
  });

  it("puts a value sitting exactly on a cut point in the higher level", () => {
    // This asserts against the REAL exported bucketing rule, not a local copy of it.
    // The first version of this test defined its own `predict` and compared it with
    // itself, so flipping `<` to `<=` in lib/skin.ts left the whole suite green while
    // the Python baseline and the shipped app silently disagreed on every value
    // sitting on a cut.
    for (const [axis, spec] of Object.entries(
      manifest.fallbackHeuristic.axes as Record<string, { thresholds: [number, number] }>
    )) {
      const attr = axis as "oil" | "redness" | "pores";
      const [lo, hi] = spec.thresholds;
      expect(levelFor(attr, lo * 0.5), `${axis} below lo`).toBe(0);
      expect(levelFor(attr, lo - Math.abs(lo) * 1e-9), `${axis} just under lo`).toBe(0);
      expect(levelFor(attr, lo), `${axis} exactly on lo must round UP`).toBe(1);
      expect(levelFor(attr, (lo + hi) / 2), `${axis} mid band`).toBe(1);
      expect(levelFor(attr, hi - Math.abs(hi) * 1e-9), `${axis} just under hi`).toBe(1);
      expect(levelFor(attr, hi), `${axis} exactly on hi must round UP`).toBe(2);
      expect(levelFor(attr, hi * 10), `${axis} far above hi`).toBe(2);
    }
  });

  it("agrees with the manifest rule across a sweep, cut points included", () => {
    // Same rule ml/heuristic_baseline.predict_level applies, checked against the
    // shipped function rather than against another copy of itself.
    const predict = (value: number, thresholds: number[]) => {
      let level = 0;
      for (const cut of thresholds) {
        if (value < cut) return level;
        level += 1;
      }
      return level;
    };
    for (const [axis, spec] of Object.entries(
      manifest.fallbackHeuristic.axes as Record<string, { thresholds: [number, number] }>
    )) {
      const attr = axis as "oil" | "redness" | "pores";
      const [lo, hi] = spec.thresholds;
      const span = hi - lo;
      const probes = [lo - span, lo, hi, hi + span, (lo + hi) / 2, 0, -span, hi * 5];
      for (let i = 0; i <= 40; i += 1) probes.push(lo - span + (span * 3 * i) / 40);
      for (const value of probes) {
        expect(predict(value, spec.thresholds), `${axis} @ ${value}`).toBe(levelFor(attr, value));
      }
    }
  });

  it("keeps bucket() and levelFor() on one comparison rule", () => {
    // Two copies of the cut rule live in lib/skin.ts. levelFor is the one the tests
    // above pin; if bucket() drifted from it, the displayed level and the gate's
    // baseline would diverge with every test still green.
    const expr = /value < lo \? 0 : value < hi \? 1 : 2/g;
    expect(skinTs.match(expr)?.length, "bucket() and levelFor() must share the rule").toBe(2);
  });

  it("declares a heuristic axis only where the Python calibrator has a feature for it", () => {
    // ml/calibrate.py's FEATURE map is what turns a labelled export back into these
    // thresholds. An axis in the manifest with no entry there could never be recalibrated.
    const calibrate = readMl("calibrate.py");
    const featureBlock = calibrate.slice(
      calibrate.indexOf("FEATURE = {"),
      calibrate.indexOf("OBSERVATION_FEATURE")
    );
    for (const [axis, spec] of Object.entries(
      manifest.fallbackHeuristic.axes as Record<string, { feature: string }>
    )) {
      expect(featureBlock, axis).toContain(`"${axis}": "${spec.feature}"`);
    }
  });
});
