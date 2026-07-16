import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL, WASM } from "@/app/scan/landmarker-config";

const mediaPipe = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mediaPipe.forVisionTasks },
  FaceLandmarker: { createFromOptions: mediaPipe.createFromOptions },
}));

import { createImageLandmarker, createVideoLandmarker } from "@/app/scan/create-landmarker";

describe("shared MediaPipe landmarker factory", () => {
  beforeEach(() => {
    mediaPipe.forVisionTasks.mockReset().mockResolvedValue({ fileset: true });
    mediaPipe.createFromOptions.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it.each([
    ["VIDEO", createVideoLandmarker],
    ["IMAGE", createImageLandmarker],
  ] as const)("creates a %s landmarker from same-origin assets", async (runningMode, create) => {
    await create("CPU");

    expect(mediaPipe.forVisionTasks).toHaveBeenCalledWith(WASM);
    expect(mediaPipe.createFromOptions).toHaveBeenCalledWith(
      { fileset: true },
      {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode,
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      },
    );
  });
});
