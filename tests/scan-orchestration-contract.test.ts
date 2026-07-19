import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("scan orchestration seams", () => {
  it("keeps the page focused on UI orchestration", () => {
    const page = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
    expect(page.split(/\r?\n/).length).toBeLessThan(800);
    expect(page).not.toContain("FilesetResolver");
  });

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

  it("delegates the verified capture and persistence flow to useCaptureAnalysis", () => {
    const hookPath = resolve(root, "app/scan/use-capture-analysis.ts");
    const page = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
    expect(existsSync(hookPath)).toBe(true);
    expect(page).toContain("useCaptureAnalysis");
    expect(page).not.toContain("async function capture()");
  });

  it("cancels interrupted Safari capture sessions before offering an explicit restart", () => {
    const hook = readFileSync(resolve(root, "app/scan/use-capture-analysis.ts"), "utf8");
    const page = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");

    expect(hook).toContain("cancelCapture");
    expect(hook).toContain("return { capture, cancelCapture }");
    expect(page).toContain("watchCameraStream");
    expect(page).toContain("cancelCapture();");
    expect(page).toContain('"interrupted"');
    expect(page).toContain("visibilitychange");
    expect(page).toContain("pagehide");
    expect(page).toContain("autoPlay");
    expect(page).toContain("playsInline");
    expect(page).toContain("muted");
  });
});
