/// <reference lib="webworker" />
// Off-main-thread face landmark detection. Uses the CPU delegate deliberately:
// it is slower than GPU but "always correct" — it sidesteps the corrupt
// non-normalized landmark output some mobile GPU delegates emit (the Samsung
// bug the main thread self-heals from), so the worker path needs no self-heal.
//
// Opt-in only (?worker=1). The main thread stays the default and the fallback.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { MODEL, WASM } from "./landmarker-config";

type DetectRequest = { id: number; bitmap: ImageBitmap; ts: number };

let landmarkerPromise: ReturnType<typeof createLandmarker> | null = null;

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

function getLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = createLandmarker();
  return landmarkerPromise;
}

self.onmessage = async (event: MessageEvent<DetectRequest>) => {
  const { id, bitmap, ts } = event.data;
  try {
    const landmarker = await getLandmarker();
    const result = landmarker.detectForVideo(bitmap, ts);
    bitmap.close();
    (self as unknown as Worker).postMessage({ id, face: result.faceLandmarks?.[0] ?? null });
  } catch (error) {
    bitmap.close();
    (self as unknown as Worker).postMessage({ id, error: error instanceof Error ? error.message : "detect failed" });
  }
};
