/**
 * Rule-based recommendation engine (deterministic = trustworthy).
 *
 * Recommendation TRUST rests on survey + transparent curation (D6: survey >> CV).
 * The scan reads are a light supplementary boost, not the basis.
 *
 * Copy states FIT, never efficacy. `efficacyClean` is the T1 (P1) guardrail.
 */

import { SKUS, type Sku, type SkinType, type Concern, type Avoid, type Category } from "./skus";

export type Survey = {
  type: SkinType;
  concerns: Concern[];
  budget: number; // max won
  avoid: Avoid[];
  category: Category;
};

// scan ordinals 0..2 for oil/redness/pores (optional, supplementary)
export type ScanReads = { oil: number; redness: number; pores: number } | null;

export type Recommendation = {
  sku: Sku;
  toneLabel: string;
  reason: string;
  matchedIngredients: string[];
  avoidedClear: boolean;
};

export type RecoResult = {
  picks: Recommendation[];
  relaxed: null | "budget" | "avoid";
  note?: string;
};

const TONE_LABEL: Record<Sku["tone"], string> = {
  safe: "무난한 선택",
  value: "가성비",
  gentle: "민감 보수적",
};

// ── T1 (P1): efficacy / medical claim guardrail ──────────────────────────────
const BANNED = [
  "미백", "주름개선", "주름 개선", "개선", "완화", "치료", "재생", "항노화",
  "리프팅", "노화방지", "여드름 치료", "흉터 제거", "제거", "효능", "효과",
];
export function efficacyClean(text: string): { ok: boolean; flagged: string[] } {
  const flagged = BANNED.filter((w) => text.includes(w));
  return { ok: flagged.length === 0, flagged };
}

function effectiveConcerns(s: Survey, scan: ScanReads): Concern[] {
  const set = new Set<Concern>(s.concerns);
  if (scan) {
    if (scan.oil >= 2) set.add("유분");
    if (scan.redness >= 1) set.add("홍조");
    if (scan.pores >= 1) set.add("모공");
  }
  return [...set];
}

function scoreSku(sku: Sku, s: Survey, concerns: Concern[]): number {
  let score = 0;
  if (sku.forTypes.includes(s.type)) score += 3;
  for (const c of concerns) if (sku.concerns.includes(c)) score += 2;
  // bonus for covering the user's avoid prefs cleanly
  if (s.avoid.every((a) => sku.freeOf.includes(a))) score += 1;
  return score;
}

function reasonFor(sku: Sku, s: Survey, concerns: Concern[], avoidedClear: boolean): string {
  const matched = concerns.filter((c) => sku.concerns.includes(c)).slice(0, 2);
  const budgetText = `${Math.round(s.budget / 10000)}만원대`;
  const head = matched.length
    ? `${s.type}·${matched.join("·")} 고민`
    : `${s.type} 피부`;
  let reason = `${head} + ${budgetText}에 맞춘 선택이에요.`;
  if (avoidedClear && s.avoid.length) reason += ` ${s.avoid.join("·")}는 없어요.`;
  // guardrail: templated copy is already fit-only, but verify.
  if (!efficacyClean(reason).ok) reason = `${s.type} 피부 · ${budgetText}에 맞춘 선택이에요.`;
  return reason;
}

function toRec(sku: Sku, s: Survey, concerns: Concern[]): Recommendation {
  const avoidedClear = s.avoid.every((a) => sku.freeOf.includes(a));
  return {
    sku,
    toneLabel: TONE_LABEL[sku.tone],
    reason: reasonFor(sku, s, concerns, avoidedClear),
    matchedIngredients: sku.keyIngredients.slice(0, 2),
    avoidedClear,
  };
}

/** Pick up to 3, preferring tone diversity (무난/가성비/민감) and distinct brands. */
function diversify(sorted: Sku[]): Sku[] {
  const picks: Sku[] = [];
  const tonesSeen = new Set<string>();
  const brandsSeen = new Set<string>();
  for (const sku of sorted) {
    if (picks.length >= 3) break;
    if (tonesSeen.has(sku.tone) || brandsSeen.has(sku.brand)) continue;
    picks.push(sku);
    tonesSeen.add(sku.tone);
    brandsSeen.add(sku.brand);
  }
  // backfill if fewer than 3
  for (const sku of sorted) {
    if (picks.length >= 3) break;
    if (!picks.includes(sku)) picks.push(sku);
  }
  return picks;
}

export function recommend(s: Survey, scan: ScanReads = null): RecoResult {
  const concerns = effectiveConcerns(s, scan);
  const inCat = SKUS.filter((k) => k.category === s.category);

  const passes = (k: Sku, useBudget: boolean, useAvoid: boolean) =>
    (!useBudget || k.price <= s.budget) &&
    (!useAvoid || s.avoid.every((a) => k.freeOf.includes(a)));

  const rank = (list: Sku[]) =>
    [...list].sort((a, b) => scoreSku(b, s, concerns) - scoreSku(a, s, concerns) || a.price - b.price);

  // strict → relax avoid → relax budget
  let relaxed: RecoResult["relaxed"] = null;
  let pool = inCat.filter((k) => passes(k, true, true));
  if (pool.length === 0) {
    pool = inCat.filter((k) => passes(k, true, false));
    if (pool.length) relaxed = "avoid";
  }
  if (pool.length === 0) {
    pool = inCat.filter((k) => passes(k, false, true));
    if (pool.length) relaxed = "budget";
  }
  if (pool.length === 0) pool = inCat;

  const picks = diversify(rank(pool)).map((sku) => toRec(sku, s, concerns));
  const note =
    relaxed === "budget"
      ? "예산에 딱 맞는 게 없어서 가장 가까운 걸 골랐어요."
      : relaxed === "avoid"
      ? "회피 성분을 모두 만족하는 게 없어서 가장 가까운 걸 골랐어요."
      : undefined;

  return { picks, relaxed, note };
}
