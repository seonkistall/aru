/**
 * Local feedback storage for calibration.
 *
 * Each confirmed or corrected scan stores only numeric features and user labels.
 * No image is stored in this v1 path.
 */

export type Attr = "oil" | "redness" | "pores";
export type LabelConfidence = "low" | "medium" | "high";

export type CaptureQualityMeta = {
  version: "2026-06-29.quality.v1";
  score: number;
  face: boolean;
  centered: boolean;
  distance: boolean;
  brightness: boolean;
  noGlare: boolean;
  steady: boolean;
  centerOffsetX?: number;
  centerOffsetY?: number;
  faceSize?: number;
  brightnessMean?: number;
  darkRatio?: number;
  hotRatio?: number;
  movement?: number;
  rejectReason?: string;
};

export type SampleMeta = {
  schemaVersion: "2026-06-29.label.v2";
  participantId?: string;
  sessionId?: string;
  round?: string;
  deviceId?: string;
  reviewerId?: string;
  scanIndex?: number;
  captureMode?: string;
  quality?: CaptureQualityMeta;
  consentVersion?: string;
  consentEventIds?: {
    aiAnalysis?: string;
    learningCrop?: string;
  };
  labelConfidence?: LabelConfidence;
  correctionFlags?: Partial<Record<Attr, boolean>>;
  ungradable?: boolean;
};

export const SCALES: Record<Attr, [string, string, string]> = {
  oil: ["거의 없음", "조금 있음", "많은 편"],
  redness: ["거의 없음", "약간 보임", "붉은기 있음"],
  pores: ["매끈한 편", "조금 도드라짐", "도드라진 편"],
};

export function toOrdinal(attr: Attr, value: string): number {
  const i = SCALES[attr].indexOf(value);
  return i < 0 ? 1 : i;
}

export type LabeledSample = {
  id?: string;
  ts: number;
  features: { shine: number; relRedness: number; cov: number; tzoneL: number; cheekL: number };
  labels: { oil: number; redness: number; pores: number };
  source: "confirmed" | "corrected";
  meta?: SampleMeta;
};

const KEY = "gyeol_labels_v1";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function saveLabel(sample: LabeledSample) {
  if (typeof window === "undefined") return;
  const all = getLabels();
  all.push({ ...sample, id: sample.id ?? uid() });
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getLabels(): LabeledSample[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function labelCount(): number {
  return getLabels().length;
}

export function exportLabels() {
  const lines = getLabels().map((sample) => JSON.stringify(sample)).join("\n");
  const blob = new Blob([lines], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-labels-${getLabels().length}.jsonl`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearLabels() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
