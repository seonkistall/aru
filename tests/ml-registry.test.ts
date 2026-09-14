import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_MODEL_CONTRACT } from "@/lib/skin";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;
}

type TargetSchema = {
  currentTargets: Array<{ id: string; aruAxisId: string | null }>;
  nextTargets: Array<{ id: string; aruAxisId: string | null }>;
  requiredMetadata: string[];
};

type SourceCandidates = {
  policy: { licenseBypass: boolean; privateManifest: string };
  prioritySources: Array<{
    id: string;
    tier: string;
    mapsToTargets: string[];
    commercialTraining: string;
  }>;
};

type VisibleManifest = {
  inputSchemaVersion: string;
  fallbackVersion: string;
  targetModel: string;
  promotionGate: { validation: string; minTrainingCrops: number };
};

describe("ARU ML registries", () => {
  it("defines commerce and clinic targets beyond the initial scan attrs", () => {
    const schema = readJson<TargetSchema>("ml/aru_target_schema.json");
    const targetIds = [...schema.currentTargets, ...schema.nextTargets].map((target) => target.id);

    expect(targetIds).toContain("cosmetic_oil");
    expect(targetIds).toContain("pore_visibility");
    expect(targetIds).toContain("visible_redness");
    expect(targetIds).toContain("fine_lines_wrinkles");
    expect(targetIds).toContain("blemish_acne_like");
    expect(targetIds).toContain("pigmentation_spots");
    expect(schema.requiredMetadata).toContain("consentEventIds");
    expect(schema.requiredMetadata).toContain("labelConfidence");
  });

  it("keeps the commerce target schema and the trainable axis registry in step", () => {
    // These are two views of the same skin signals: the schema carries commerce and
    // clinic handling, ml/aru_axes.py carries what the model predicts. Without this
    // check they drift silently, and a target can quietly lose the axis behind it.
    const schema = readJson<TargetSchema>("ml/aru_target_schema.json");
    const registry = readFileSync(join(process.cwd(), "ml/aru_axes.py"), "utf8");
    const axisIds = [...registry.matchAll(/^\s{8}id="([a-z_]+)",$/gm)].map(([, id]) => id);
    expect(axisIds.length).toBeGreaterThan(0);

    const targets = [...schema.currentTargets, ...schema.nextTargets];
    const claimed = targets.map((target) => target.aruAxisId).filter((id): id is string => Boolean(id));

    for (const target of targets) {
      expect(target, `${target.id} must declare aruAxisId (use null when it is not an axis)`).toHaveProperty("aruAxisId");
      if (target.aruAxisId) {
        expect(axisIds, `${target.id} -> ${target.aruAxisId}`).toContain(target.aruAxisId);
      }
    }
    expect(new Set(claimed).size, "two targets claim the same axis").toBe(claimed.length);
    expect([...axisIds].sort(), "every axis needs exactly one target").toEqual([...claimed].sort());
  });

  it("keeps source provenance and license policy explicit", () => {
    const sources = readJson<SourceCandidates>("ml/source_candidates.json");

    expect(sources.policy.licenseBypass).toBe(false);
    expect(sources.policy.privateManifest).toContain("private_sources.json");
    expect(sources.prioritySources.find((source) => source.id === "aru_opt_in_camera_panel")?.tier).toBe("primary");
    expect(sources.prioritySources.find((source) => source.id === "licensed_cosmetic_skin_panel")?.commercialTraining).toBe("contract_required");
    expect(sources.prioritySources.every((source) => source.mapsToTargets.length > 0)).toBe(true);
  });

  it("keeps the public visible model manifest aligned with the runtime contract", () => {
    const manifest = readJson<VisibleManifest>("public/models/visible-attributes/manifest.json");

    expect(manifest.inputSchemaVersion).toBe(VISIBLE_MODEL_CONTRACT.inputSchemaVersion);
    expect(manifest.fallbackVersion).toBe(VISIBLE_MODEL_CONTRACT.fallbackVersion);
    expect(manifest.targetModel).toBe(VISIBLE_MODEL_CONTRACT.targetModel);
    // Participant grouping is the invariant; the validation strategy may strengthen
    // beyond it (it is now also stratified by subgroup) but may never drop it.
    expect(manifest.promotionGate.validation).toContain("grouped_by_participant");
    expect(manifest.promotionGate.minTrainingCrops).toBeGreaterThanOrEqual(300);
  });
});
