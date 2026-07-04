// Thin main-thread client for the landmarker Web Worker. Returns null when the
// environment can't support the offload, so callers cleanly fall back to
// main-thread inference. Every detect() also rejects on failure so the caller
// can fall back per-frame.
export type Landmark = { x: number; y: number; z?: number };

export type LandmarkerWorker = {
  detect: (bitmap: ImageBitmap, ts: number) => Promise<Landmark[] | null>;
  close: () => void;
};

type WorkerReply = { id: number; face?: Landmark[] | null; error?: string };

export function createLandmarkerWorker(): LandmarkerWorker | null {
  if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL("./landmarker.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }

  const pending = new Map<number, { resolve: (face: Landmark[] | null) => void; reject: (reason?: unknown) => void }>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const { id, face, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(face ?? null);
  };

  worker.onerror = () => {
    for (const entry of pending.values()) entry.reject(new Error("worker error"));
    pending.clear();
  };

  return {
    detect(bitmap, ts) {
      const id = nextId++;
      return new Promise<Landmark[] | null>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, bitmap, ts }, [bitmap]);
      });
    },
    close() {
      for (const entry of pending.values()) entry.reject(new Error("worker closed"));
      pending.clear();
      worker.terminate();
    },
  };
}
