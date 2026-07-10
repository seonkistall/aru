// Viral deep link. Encodes the three skin levels (0-2) into a URL HASH
// fragment (#m=NNN). Levels are non-identifying aggregate signals, and a hash
// fragment is never sent to the server — so a shared link carries no PII
// off-device. Opening the link lets a friend land on a "skin mood" preview with
// a scan CTA (the viral entry).

import { t } from "./i18n/core";

export type MoodLevels = { oil: number; redness: number; pores: number };

function asLevel(n: number): number | null {
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
}

export function encodeMood(levels: MoodLevels): string {
  return `${levels.oil}${levels.redness}${levels.pores}`;
}

export function decodeMood(code: string | null | undefined): MoodLevels | null {
  if (!code || code.length !== 3) return null;
  const oil = asLevel(Number(code[0]));
  const redness = asLevel(Number(code[1]));
  const pores = asLevel(Number(code[2]));
  if (oil === null || redness === null || pores === null) return null;
  return { oil, redness, pores };
}

const FALLBACK_ORIGIN = "https://aru-beauty.vercel.app";

export function moodShareUrl(levels: MoodLevels, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN);
  return `${base}/#m=${encodeMood(levels)}`;
}

export function readMoodFromHash(hash: string): MoodLevels | null {
  const match = /[#&]m=([0-2]{3})/.exec(hash);
  return match ? decodeMood(match[1]) : null;
}

const LABELS: Record<keyof MoodLevels, [string, string, string]> = {
  oil: ["유분 적음", "유분 약간", "유분 많음"],
  redness: ["붉은기 낮음", "붉은기 약간", "붉은기 뚜렷"],
  pores: ["결 매끈", "결 약간", "결 뚜렷"],
};

export function moodSummary(levels: MoodLevels): string {
  return [t(LABELS.oil[levels.oil]), t(LABELS.redness[levels.redness]), t(LABELS.pores[levels.pores])].join(" · ");
}
