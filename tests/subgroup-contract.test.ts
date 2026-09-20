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

  /**
   * The first-party tone band is DERIVED, never recorded — added 2026-09-20 with the
   * `SampleMeta.toneBand` field it replaces.
   *
   * `resolve_tone_band` in ml/subgroups.py reads a recorded band BEFORE it reads
   * `toneIta`, so a stored band outranks the current definition of the stratifier. That
   * preference is right for an external manifest, where the band comes from a
   * Fitzpatrick or Monk column and there is no ITA to recompute from. It is wrong for an
   * ARU scan, which records the ITA itself: a band stored by one generation of
   * `itaDegrees` would keep winning after the formula moved, which is precisely the
   * drift docs/ita-guard-decision.md closed inside the formula. `SampleMeta` declared
   * such a field and nothing ever wrote it; this holds it deleted.
   */
  it("records no tone band on the first-party path, so ITA is the only source", () => {
    const labels = readFileSync(resolve(root, "lib/labels.ts"), "utf8");
    const meta = labels.slice(labels.indexOf("export type SampleMeta"), labels.indexOf("export const SCALES"));
    expect(meta.length, "SampleMeta not found in lib/labels.ts").toBeGreaterThan(200);
    expect(meta, "SampleMeta must not declare a stored tone band").not.toMatch(/^\s*toneBand\?:/m);
    // The age band next to it is a genuine recorded field and must stay, or this case
    // would pass by having found the wrong block.
    expect(meta).toMatch(/^\s*ageBand\?: AgeBand;/m);

    // And nothing in the app writes one under either spelling, which is what makes the
    // deletion a deletion rather than a rename.
    for (const file of ["lib/labels.ts", "lib/skin.ts", "lib/pilot.ts", "lib/consent.ts"]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} must not assign a tone band into a sample`).not.toMatch(
        /(toneBand|tone_band)\s*[:=]\s*(toneBandFromIta|"|')/
      );
    }

    // The Python side keeps both spellings on purpose — that is the external-manifest
    // path — and `toneIta` has to stay in its ITA list or every consumer scan reads as
    // tone-unknown, which blocks promotion for the wrong reason.
    const python = readMl("subgroups.py");
    const resolver = python.slice(python.indexOf("def resolve_tone_band"), python.indexOf("def resolve_age_band"));
    expect(resolver).toContain('for key in ("tone_band", "toneBand")');
    // Matched out of the key TUPLE and not out of the function text, which is how this
    // was found: the docstring above that line names "toneIta" too, so a `toContain`
    // stayed green with the key deleted from the code.
    const itaKeys = resolver.match(/for key in \((\s*"(?:ita|toneIta|tone_ita|[a-zA-Z_]+)",?)+\s*\):[\s\S]{0,80}tone_band_from_ita/);
    expect(itaKeys, "the ITA key tuple was not found in resolve_tone_band").toBeTruthy();
    expect(itaKeys![0], 'resolve_tone_band must read the "toneIta" the app writes').toContain('"toneIta"');
    expect(resolver.indexOf('for key in ("tone_band"')).toBeLessThan(resolver.indexOf(itaKeys![0]));
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
