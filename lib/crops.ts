import type { LabeledSample } from "./labels";
import { DEVICE_DATA_KEY } from "./device-data";

export type CropSample = {
  id: string;
  image: string;
  labels: LabeledSample["labels"];
  features: LabeledSample["features"];
  source: LabeledSample["source"];
  meta?: LabeledSample["meta"];
  ts: number;
};

const KEY = DEVICE_DATA_KEY.cropSamples;
const MAX_LOCAL_CROPS = 120;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

/**
 * `Array.isArray` at the read, for the reason given in `lib/scan-history.ts` and in
 * docs/funnel-store-shape.md: a TRUNCATED value already self-healed through the catch,
 * while a value that PARSES to the wrong shape was handed back as written. Here that
 * reaches a RENDER — `app/scan/feedback.tsx` seeds state with
 * `useState(() => cropSampleCount())`, a lazy initialiser, which runs during render and
 * has no try/catch of its own, so a stored `null` threw at `.length` there. Guarding at
 * the read is also what lets the next write repair the key.
 */
export function getCropSamples(): CropSample[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as CropSample[]) : [];
  } catch {
    return [];
  }
}

export function cropSampleCount(): number {
  return getCropSamples().length;
}

export function saveCropSample(sample: Omit<CropSample, "id">): boolean {
  if (typeof window === "undefined") return false;
  const all = getCropSamples();
  all.push({ ...sample, id: uid() });
  // Crops are base64 JPEGs; upgraded crops can cross the localStorage quota.
  // Retry with fewer oldest rows so one oversized history does not block the
  // current consented sample or hang the feedback click handler.
  for (let keep = Math.min(MAX_LOCAL_CROPS, all.length); keep > 0; keep -= 1) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(-keep)));
      return true;
    } catch {
      /* retry with one fewer old crop */
    }
  }
  return false;
}

export function exportCropSamples() {
  const lines = getCropSamples().map((sample) => JSON.stringify(sample)).join("\n");
  const blob = new Blob([lines], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-crop-samples-${getCropSamples().length}.jsonl`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearCropSamples() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
