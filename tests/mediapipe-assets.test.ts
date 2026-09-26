import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL, WASM } from "@/app/scan/landmarker-config";
import { MEDIAPIPE_VERSION } from "@/app/scan/mediapipe-version";

const root = resolve(import.meta.dirname, "..");
const installed = JSON.parse(
  readFileSync(resolve(root, "node_modules/@mediapipe/tasks-vision/package.json"), "utf8"),
).version as string;

/**
 * The bundled JS API and the WASM runtime under /public have to be the same version of
 * @mediapipe/tasks-vision, and nothing at runtime checks that they are: the bundle
 * looks up `self.ModuleFactory` from the runtime's loader script and then calls
 * Emscripten exports off the module it returns. Before the runtime directory was named
 * after the version, a warm visitor's first capture after an upgrade paired the new
 * bundle with the copy of the old runtime their service worker was still holding at the
 * same URL.
 *
 * `scripts/copy-mediapipe-assets.mjs` writes both halves — the directory and
 * `app/scan/mediapipe-version.ts`, which `landmarker-config.ts` builds the URL from —
 * from one read of the installed package. These cases are the drift alarm on that: they
 * fail if the generated version, the URL, the directory on disk and the installed
 * package stop agreeing, whichever one of the four moved.
 */
describe("MediaPipe production assets", () => {
  it("uses same-origin runtime URLs, versioned by the installed package", () => {
    expect(MEDIAPIPE_VERSION).toBe(installed);
    expect(WASM).toBe(`/vendor/mediapipe/${installed}/wasm`);
    expect(MODEL).toBe("/vendor/mediapipe/face_landmarker.task");
  });

  it("ships the configured model and wasm files", () => {
    expect(existsSync(resolve(root, `public${MODEL}`))).toBe(true);
    const wasm = resolve(root, `public${WASM}`);
    for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
      expect(existsSync(resolve(wasm, file)), file).toBe(true);
    }
  });

  it("keeps exactly one runtime directory, so upgrades do not accumulate in public/", () => {
    const dirs = readdirSync(resolve(root, "public/vendor/mediapipe"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(dirs).toEqual([installed]);
  });

  it("serves the runtime the installed package ships, byte for byte", () => {
    const shipped = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js");
    const served = resolve(root, `public${WASM}/vision_wasm_internal.js`);
    expect(readFileSync(served)).toEqual(readFileSync(shipped));
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
