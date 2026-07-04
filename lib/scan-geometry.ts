// Pure geometry for the camera scan gate + zone overlay. Extracted from
// app/scan/page.tsx so the aspect-ratio math (the part that repeatedly
// regressed) is unit-testable in isolation.

export type Point2D = { x: number; y: number; z?: number };
export type FaceBox = { minX: number; minY: number; maxX: number; maxY: number };

// The camera preview is a portrait 3:4 frame.
export const FRAME_RATIO = 3 / 4;

// Visible fraction of a stream shown with object-fit:cover inside the 3:4
// frame. fx/fy are the horizontal/vertical fractions of the video that remain
// visible after the cover crop. Shared by the live gate, capture verification,
// and the zone overlay so all three stay in lockstep.
export function coverCropFractions(width: number, height: number): { fx: number; fy: number } {
  const ratio = width > 0 && height > 0 ? width / height : FRAME_RATIO;
  return { fx: Math.min(1, FRAME_RATIO / ratio), fy: Math.min(1, ratio / FRAME_RATIO) };
}

// Axis-aligned bounding box of normalized landmarks. Plain loop (no per-point
// allocation) — runs every quality tick and 4x per capture.
export function faceBox(landmarks: Point2D[]): FaceBox {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Larger normalized dimension of the face box — the aspect-independent
// distance proxy the gate uses (a real, reasonably-close face spans a good
// fraction of the frame in at least one axis, regardless of stream orientation).
export function rawFaceSize(box: FaceBox): number {
  return Math.max(box.maxX - box.minX, box.maxY - box.minY);
}

// A face box is a valid normalized detection only if it sits within [0,1]
// (with a little slack). Corrupt mobile-GPU delegate output is ~1e34, which
// this rejects so the caller can fall back to the CPU delegate.
export function isNormalizedBox(box: FaceBox): boolean {
  return (
    Number.isFinite(box.maxX) &&
    box.maxX <= 1.5 &&
    box.minX >= -0.5 &&
    box.maxY <= 1.5 &&
    box.minY >= -0.5
  );
}
