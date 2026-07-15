import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL, WASM } from "@/app/scan/landmarker-config";

const root = resolve(import.meta.dirname, "..");

describe("MediaPipe production assets", () => {
  it("uses same-origin runtime URLs", () => {
    expect(WASM).toBe("/vendor/mediapipe/wasm");
    expect(MODEL).toBe("/vendor/mediapipe/face_landmarker.task");
  });

  it("ships the configured model and wasm files", () => {
    expect(existsSync(resolve(root, `public${MODEL}`))).toBe(true);
    const wasm = resolve(root, `public${WASM}`);
    for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
      expect(existsSync(resolve(wasm, file)), file).toBe(true);
    }
  });

  it("keeps every landmarker consumer on the shared same-origin path", () => {
    for (const file of ["app/scan/page.tsx", "app/eval/page.tsx", "app/scan/landmarker.worker.ts"]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, file).not.toContain("cdn.jsdelivr.net");
      expect(source, file).not.toContain("storage.googleapis.com/mediapipe-models");
    }
    expect(readFileSync(resolve(root, "app/eval/page.tsx"), "utf8")).toContain("createImageLandmarker");
  });
});
