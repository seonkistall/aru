import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;
}

type TargetSchema = {
  currentTargets: Array<{ id: string }>;
  nextTargets: Array<{ id: string }>;
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

  it("keeps source provenance and license policy explicit", () => {
    const sources = readJson<SourceCandidates>("ml/source_candidates.json");

    expect(sources.policy.licenseBypass).toBe(false);
    expect(sources.policy.privateManifest).toContain("private_sources.json");
    expect(sources.prioritySources.find((source) => source.id === "aru_opt_in_camera_panel")?.tier).toBe("primary");
    expect(sources.prioritySources.find((source) => source.id === "licensed_cosmetic_skin_panel")?.commercialTraining).toBe("contract_required");
    expect(sources.prioritySources.every((source) => source.mapsToTargets.length > 0)).toBe(true);
  });
});
