import type { LabeledSample } from "./labels";

export type CropSample = {
  id: string;
  image: string;
  labels: LabeledSample["labels"];
  features: LabeledSample["features"];
  source: LabeledSample["source"];
  meta?: LabeledSample["meta"];
  ts: number;
};

const KEY = "gyeol_crop_samples_v1";
const MAX_LOCAL_CROPS = 120;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function getCropSamples(): CropSample[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
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
  try {
    // Crops are base64 JPEGs; ~120 of them can cross the localStorage quota.
    // Guard the write (like funnel/last-result) so QuotaExceededError never
    // escapes into the capture-feedback click handler and hangs the UI.
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_LOCAL_CROPS)));
    return true;
  } catch {
    return false;
  }
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
