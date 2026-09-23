// Cross-session persistence of the user's most recent result, so a returning
// visitor can re-enter their report instead of starting over. On-device only
// (localStorage) — same privacy posture as the other local stores; nothing is
// transmitted. Stores the INPUTS (survey + scan levels + the read snapshot),
// which is enough to reconstruct the report via recommend().
import { isSurvey, type ScanReads, type Survey } from "./recommend";
import type { SkinReads } from "./skin";
import { DEVICE_DATA_KEY } from "./device-data";

const KEY = DEVICE_DATA_KEY.lastResult;

export type LastResult = { survey: Survey; scan: ScanReads; reads: SkinReads | null; ts: number };

// A SkinReads out of a device store, checked for the shape the pages INDEX it with and
// nothing more — the same rule as `isSurvey`: structural only, no membership test on
// `source` or `confidenceLabel`, because a reading whose source string this build no
// longer knows is still a usable reading (`SOURCE_LABEL[source]` is undefined and the
// chip renders empty; measured, it does not throw).
//
// `/report` renders `reads.oil.value`, `reads.pores.value`, `reads.redness.value` and
// `reads.overall.value` directly, so each of the four buckets is checked; `signals` is
// the one array whose ELEMENTS are indexed with a method (`signal.label.includes` in
// `report-trust.ts`), so its elements are checked and `extras` / `retakeReasons`, whose
// elements are only read for properties, are not. Lives here rather than beside the type
// in `lib/skin.ts` so that /care and /studio, which today import `SkinReads` as a type
// only, do not pull lib/skin.ts's 67,485 bytes into their client bundles for a shape check.
function isBucket(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const bucket = value as Record<string, unknown>;
  return typeof bucket.value === "string" && Number.isFinite(bucket.level);
}

function isConfidenceSignal(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const signal = value as Record<string, unknown>;
  return typeof signal.label === "string" && typeof signal.detail === "string" && typeof signal.ok === "boolean";
}

export function isSkinReads(value: unknown): value is SkinReads {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const reads = value as Record<string, unknown>;
  return (
    isBucket(reads.oil) &&
    isBucket(reads.pores) &&
    isBucket(reads.redness) &&
    isBucket(reads.overall) &&
    typeof reads.headline === "string" &&
    Number.isFinite(reads.confidence) &&
    typeof reads.confidenceLabel === "string" &&
    typeof reads.retakeRecommended === "boolean" &&
    Array.isArray(reads.retakeReasons) &&
    Array.isArray(reads.signals) &&
    reads.signals.every(isConfidenceSignal) &&
    typeof reads.source === "string"
  );
}

export function saveLastResult(value: LastResult): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; never break the report flow on quota/private mode.
  }
}

export function loadLastResult(): LastResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // `parsed.survey` used to be a truthiness check, which `5`, `"abcdef"` and `{}` all
    // pass — and this value is what BOTH revenue screens fall back to in a fresh tab, so
    // a truthy non-survey here is a dead /report and a dead /care on every future visit.
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { survey?: unknown; reads?: unknown };
    if (!isSurvey(record.survey)) return null;
    // `reads` is rendered field by field on /report and /studio. A wrong-shaped one that
    // an older build mirrored in here would take /report on every future visit, so it is
    // dropped and the record is handed on without it — both pages already have a
    // no-reads path (the survey-only headline and the presets respectively).
    return isSkinReads(record.reads) ? (parsed as LastResult) : ({ ...record, reads: null } as LastResult);
  } catch {
    return null;
  }
}

export function hasLastResult(): boolean {
  return loadLastResult() !== null;
}

export function clearLastResult(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
