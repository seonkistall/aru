import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("scan orchestration seams", () => {
  it("delegates landmarker creation and cleanup to useLandmarker", () => {
    const hookPath = resolve(root, "app/scan/use-landmarker.ts");
    const page = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
    expect(existsSync(hookPath)).toBe(true);
    expect(page).toContain("useLandmarker");
    expect(page).not.toContain("createVideoLandmarker");
    expect(page).not.toContain("landmarkerRef.current?.close");

    const hook = readFileSync(hookPath, "utf8");
    expect(hook).toContain('createVideoLandmarker("GPU")');
    expect(hook).toContain('createVideoLandmarker("CPU")');
    expect(hook).toContain("landmarker.close");
  });

  it("delegates the live quality sampling loop to useQualityLoop", () => {
    const hookPath = resolve(root, "app/scan/use-quality-loop.ts");
    const page = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
    expect(existsSync(hookPath)).toBe(true);
    expect(page).toContain("useQualityLoop");
    expect(page).not.toContain("const measureQuality");
    expect(page).not.toContain("qualityTimerRef");
  });
});
