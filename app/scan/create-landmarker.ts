import { MODEL, WASM } from "./landmarker-config";

export type LandmarkerDelegate = "GPU" | "CPU";

async function createLandmarker(runningMode: "VIDEO" | "IMAGE", delegate: LandmarkerDelegate) {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function createVideoLandmarker(delegate: LandmarkerDelegate) {
  return createLandmarker("VIDEO", delegate);
}

export function createImageLandmarker(delegate: LandmarkerDelegate) {
  return createLandmarker("IMAGE", delegate);
}
