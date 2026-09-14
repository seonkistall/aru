/**
 * Skin-tone bands used to stratify and audit camera model performance.
 *
 * ARU does not predict ethnicity. What the camera can measure is melanin level,
 * as the Individual Typology Angle already computed in lib/skin.ts, and that is
 * what actually shifts the baseline every redness and texture read is compared
 * against. Bands are Chardon's, and they must stay identical to `ITA_BANDS` in
 * ml/subgroups.py — tests/subgroup-contract.test.ts fails the build if they drift,
 * because a band boundary that differs between app and training silently reassigns
 * samples to the wrong subgroup.
 *
 * These values are recorded with a sample, never shown to a user.
 */

export type ToneBand = "very_light" | "light" | "intermediate" | "tan" | "brown_dark" | "unknown";

/** Lower bound of each band in ITA degrees, light to dark. Upper bound is the previous entry. */
export const TONE_BAND_LOWER_BOUNDS: ReadonlyArray<readonly [Exclude<ToneBand, "unknown">, number]> = [
  ["very_light", 55],
  ["light", 41],
  ["intermediate", 28],
  ["tan", 10],
  ["brown_dark", Number.NEGATIVE_INFINITY],
] as const;

export const AGE_BANDS = ["teens", "20s", "30s", "40s", "50s", "60plus"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function toneBandFromIta(ita: number | null | undefined): ToneBand {
  if (typeof ita !== "number" || !Number.isFinite(ita)) return "unknown";
  for (const [band, lower] of TONE_BAND_LOWER_BOUNDS) {
    if (ita > lower) return band;
  }
  return "brown_dark";
}
