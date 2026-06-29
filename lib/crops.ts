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

export function saveCropSample(sample: Omit<CropSample, "id">) {
  if (typeof window === "undefined") return;
  const all = getCropSamples();
  all.push({ ...sample, id: uid() });
  localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_LOCAL_CROPS)));
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
