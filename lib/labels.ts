/**
 * Local feedback storage for calibration.
 *
 * Confirmed/corrected scans store numeric features, visible-attribute labels,
 * and optional capture metadata. Full-frame photos are never stored here.
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
  predictionSource?: string;
  modelVersion?: string;
  inputSchemaVersion?: string;
  analysisConfidence?: number;
  retakeRecommended?: boolean;
  initialPrediction?: Record<string, unknown>;
  finalPrediction?: Record<string, unknown>;
  labelConfidence?: LabelConfidence;
  correctionFlags?: Partial<Record<Attr, boolean>>;
  ungradable?: boolean;
  burst?: { frames: number; agreement: Partial<Record<Attr, number>> };
  /** Optional user observations outside the graded attrs (observation only — never severity grades). */
  observations?: { troubleSeen?: boolean };
};

export const SCALES: Record<Attr, [string, string, string]> = {
  oil: ["유분 적음", "유분 약간", "유분 많음"],
  redness: ["붉은기 낮음", "붉은기 약간", "붉은기 뚜렷"],
  pores: ["결 매끈", "결 약간 보임", "결 뚜렷"],
};

export function toOrdinal(attr: Attr, value: string): number {
  const i = SCALES[attr].indexOf(value);
  return i < 0 ? 1 : i;
}

export type LabeledSample = {
  id?: string;
  ts: number;
  features: {
    shine: number;
    relRedness: number;
    cov: number;
    tzoneL: number;
    cheekL: number;
    cheekTexture?: number;
    tzoneSpecular?: number;
    cheekSamples?: number;
    tzoneSamples?: number;
    toneLstar?: number;
    toneIta?: number;
  };
  labels: { oil: number; redness: number; pores: number };
  source: "confirmed" | "corrected";
  meta?: SampleMeta;
};

const KEY = "gyeol_labels_v1";
const MAX_LOCAL_LABELS = 500;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function saveLabel(sample: LabeledSample): boolean {
  if (typeof window === "undefined") return false;
  const all = getLabels();
  all.push({ ...sample, id: sample.id ?? uid() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_LOCAL_LABELS)));
    return true;
  } catch {
    return false;
  }
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
