/// <reference lib="webworker" />
// Off-main-thread face landmark detection. Uses the CPU delegate deliberately:
// it is slower than GPU but "always correct" — it sidesteps the corrupt
// non-normalized landmark output some mobile GPU delegates emit (the Samsung
// bug the main thread self-heals from), so the worker path needs no self-heal.
//
// Opt-in only (?worker=1). The main thread stays the default and the fallback.
import { createVideoLandmarker } from "./create-landmarker";

type DetectRequest = { id: number; bitmap: ImageBitmap; ts: number };

let landmarkerPromise: ReturnType<typeof createVideoLandmarker> | null = null;

function getLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = createVideoLandmarker("CPU");
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
