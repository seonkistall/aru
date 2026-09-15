import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGE_BANDS, TONE_BAND_LOWER_BOUNDS, toneBandFromIta } from "@/lib/tone-bands";

const root = resolve(import.meta.dirname, "..");
const readMl = (file: string) => readFileSync(resolve(root, "ml", file), "utf8");

describe("tone band contract", () => {
  it("maps ITA onto the documented bands", () => {
    expect(toneBandFromIta(60)).toBe("very_light");
    expect(toneBandFromIta(50)).toBe("light");
    expect(toneBandFromIta(35)).toBe("intermediate");
    expect(toneBandFromIta(20)).toBe("tan");
    expect(toneBandFromIta(-40)).toBe("brown_dark");
    expect(toneBandFromIta(Number.NaN)).toBe("unknown");
    expect(toneBandFromIta(undefined)).toBe("unknown");
  });

  it("uses the same band boundaries as the training pipeline", () => {
    // A boundary that differs between app and training puts the same face in two
    // different subgroups, which makes every per-subgroup metric wrong.
    const python = readMl("subgroups.py");
    const block = python.slice(python.indexOf("ITA_BANDS"), python.indexOf("TONE_BAND_ORDER"));
    const parsed = [...block.matchAll(/\("([a-z_]+)",\s*(-?[\d.]+|float\("-inf"\))\)/g)].map(
      ([, name, bound]) => [name, bound.includes("inf") ? Number.NEGATIVE_INFINITY : Number(bound)] as const
    );
    expect(parsed).toEqual(TONE_BAND_LOWER_BOUNDS.map(([name, bound]) => [name, bound]));
  });

  it("uses the same age bands as the training pipeline", () => {
    const python = readMl("subgroups.py");
    const line = python.match(/AGE_BANDS:[^=]*=\s*\(([^)]*)\)/);
    expect(line, "AGE_BANDS not found in ml/subgroups.py").toBeTruthy();
    const bands = [...(line?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(([, name]) => name);
    expect(bands).toEqual([...AGE_BANDS]);
  });
});

describe("visible attribute model manifest", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "public/models/visible-attributes/manifest.json"), "utf8")
  );

  it("stays inactive until a model actually exists", () => {
    expect(manifest.modelPath).toBeNull();
    expect(manifest.status).not.toBe("active");
  });

  it("only declares consumer outputs the app is allowed to show", () => {
    // dryness, moisture and sensitivity need a survey answer, so they must never
    // appear as a camera output in the shipped contract.
    expect(Object.keys(manifest.outputs)).toEqual(["oil", "redness", "pores"]);
  });

  it("declares every axis with the level count the training registry uses", () => {
    const python = readMl("aru_axes.py");
    for (const [axis, spec] of Object.entries<Record<string, unknown>>(manifest.axes)) {
      const declared = python.match(new RegExp(`id="${axis}"[\\s\\S]{0,400}?levels=(\\d+)`));
      expect(declared, `${axis} missing from ml/aru_axes.py`).toBeTruthy();
      expect(Number(declared?.[1]), axis).toBe(spec.levels);
    }
  });

  it("requires a subgroup gate before any model can be promoted", () => {
    expect(manifest.promotionGate.subgroup.minSamplesPerBand).toBeGreaterThan(0);
    expect(manifest.promotionGate.subgroup.maxAccuracyGap).toBeGreaterThan(0);
    expect(manifest.promotionGate.subgroup.dimensions).toContain("tone");
  });

  it("requires an ordinal-quality floor, not just accuracy and a subgroup gap", () => {
    // A majority-class predictor on a skewed ordinal scale scores accuracy 0.80 and
    // within_one_grade 0.95, and — being equally wrong everywhere — has almost no
    // subgroup gap, so accuracy plus gap is EASIEST to pass for a model that learned
    // nothing. qwk and pearson are what separate the two, so a zero or missing floor
    // here silently reopens that path. The floors live in promotionGate.ordinal,
    // which model_contract.ordinal_gate() reads.
    const ordinal = manifest.promotionGate.ordinal;
    expect(ordinal.minQwk).toBeGreaterThan(0);
    expect(ordinal.minPearson).toBeGreaterThan(0);
  });

  it("requires the model to beat the heuristic it would replace", () => {
    // A separate question from "is the model any good": a model can clear every
    // absolute bar and still be worse than the three threshold pairs in lib/skin.ts.
    const gate = manifest.promotionGate.subgroup;
    expect(gate.minQwkGainOverHeuristic).toBeGreaterThanOrEqual(0);
    expect(manifest.fallbackHeuristic?.axes).toBeTruthy();
  });

  it("reads every floor from the manifest rather than hardcoding it", () => {
    const trainer = readMl("train_visible_attributes.py");
    expect(trainer).toContain("model_contract.min_qwk()");
    expect(trainer).toContain("model_contract.min_pearson()");
    expect(trainer).toContain("model_contract.min_qwk_gain_over_heuristic()");
    expect(trainer).not.toMatch(/"--min-qwk",\s*type=float,\s*default=[\d.]+/);
    expect(trainer).not.toMatch(/"--min-pearson",\s*type=float,\s*default=[\d.]+/);
    expect(trainer).not.toMatch(/"--min-qwk-gain",\s*type=float,\s*default=[\d.]+/);

    // The gate itself must actually consume them.
    const gate = readMl("subgroups.py");
    expect(gate).toContain("def ordinal_check(");
    expect(gate).toContain("def beats_heuristic_check(");
    expect(gate).toContain("beatsHeuristic");

    // And the baseline must be scored on the same rows the model was.
    expect(trainer).toContain("heuristic_baseline.score(");
    expect(trainer).toContain("heuristic_baseline.covered_axes()");
  });
});

describe("ML readiness bands", () => {
  it("uses the same crop thresholds as the pipeline runner", () => {
    // /ops shows the band from lib/ml-readiness.ts while ml/run_pipeline.py prints its
    // own from the same numbers. If one side moves, the dashboard and the experiment
    // report tell the team different things about what is allowed next.
    const python = readMl("run_pipeline.py");
    const block = python.slice(python.indexOf("def readiness("), python.indexOf("def label_distribution("));
    const pythonThresholds = [...block.matchAll(/crop_count < (\d+)/g)].map(([, n]) => Number(n));
    expect(pythonThresholds.length).toBeGreaterThan(0);

    const ts = readFileSync(resolve(root, "lib/ml-readiness.ts"), "utf8");
    const tsThresholds = [...ts.matchAll(/crops < (\d+)/g)].map(([, n]) => Number(n));
    expect(tsThresholds).toEqual(pythonThresholds);
  });
});

describe("promotion gate contract", () => {
  it("is read from the manifest by the trainer rather than hardcoded", () => {
    const trainer = readMl("train_visible_attributes.py");
    expect(trainer).toContain("model_contract.min_samples_per_band()");
    expect(trainer).toContain("model_contract.max_accuracy_gap()");
    // A literal default here would silently override what the manifest promises.
    expect(trainer).not.toMatch(/"--min-cell",\s*type=int,\s*default=\d+/);
  });

  it("points the Python contract reader at the file the browser loads", () => {
    const contract = readMl("model_contract.py");
    expect(contract).toContain('"public" / "models" / "visible-attributes" / "manifest.json"');
  });
});
