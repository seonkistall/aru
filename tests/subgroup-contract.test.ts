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
});
