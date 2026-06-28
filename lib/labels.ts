/**
 * The data flywheel (the real moat).
 *
 * Every scan + user feedback ("정확해요 / 조금 달라요") becomes a LABELED sample:
 * the self-calibrated heuristic features + the user-confirmed/corrected buckets.
 * Accumulate these and you own a proprietary Korean-selfie skin dataset nobody
 * else has — which `ml/calibrate.py` turns into LEARNED thresholds (and later a
 * trained model). The generic ACNE04 model is commodity; THIS data is the moat.
 *
 * v1 stores feature vectors only (no images) in localStorage — privacy-max, no
 * consent needed for biometric storage. Image-crop collection is the opt-in
 * Tier-2 path (design decision D3, path B) wired to Supabase later.
 */

export type Attr = "oil" | "redness" | "pores";

// Ordinal label scales (0 = least, 2 = most), matching lib/skin.ts buckets.
export const SCALES: Record<Attr, [string, string, string]> = {
  oil: ["거의 없음", "살짝 있음", "있는 편"],
  redness: ["거의 없음", "약간 보임", "붉은기 있음"],
  pores: ["매끈한 편", "신경 쓰이는 정도", "도드라짐"],
};

export function toOrdinal(attr: Attr, value: string): number {
  const i = SCALES[attr].indexOf(value);
  return i < 0 ? 1 : i;
}

export type LabeledSample = {
  ts: number;
  features: { shine: number; relRedness: number; cov: number; tzoneL: number; cheekL: number };
  labels: { oil: number; redness: number; pores: number }; // user-confirmed ordinals
  source: "confirmed" | "corrected";
};

const KEY = "gyeol_labels_v1";

export function saveLabel(s: LabeledSample) {
  if (typeof window === "undefined") return;
  const all = getLabels();
  all.push(s);
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

/** Download accumulated labels as JSONL — feed this to ml/calibrate.py. */
export function exportLabels() {
  const lines = getLabels().map((s) => JSON.stringify(s)).join("\n");
  const blob = new Blob([lines], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-labels-${getLabels().length}.jsonl`;
  a.click();
  URL.revokeObjectURL(url);
}
