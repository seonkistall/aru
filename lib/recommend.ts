import { SKUS, type Avoid, type Category, type Concern, type SkinType, type Sku } from "./skus";

export type Survey = {
  type: SkinType;
  concerns: Concern[];
  budget: number;
  avoid: Avoid[];
  category: Category;
};

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
  gentle: "민감 보수파",
};

const BANNED = [
  "미백",
  "주름개선",
  "주름 개선",
  "개선",
  "완화",
  "치료",
  "재생",
  "항노화",
  "리프팅",
  "피부과",
  "트러블 제거",
  "여드름 치료",
  "흉터 제거",
  "제거",
  "효능",
  "효과",
];

export function efficacyClean(text: string): { ok: boolean; flagged: string[] } {
  const flagged = BANNED.filter((word) => text.includes(word));
  return { ok: flagged.length === 0, flagged };
}

function effectiveConcerns(survey: Survey, scan: ScanReads): Concern[] {
  const set = new Set<Concern>(survey.concerns);
  if (scan) {
    if (scan.oil >= 2) set.add("유분");
    if (scan.redness >= 1) set.add("붉은기");
    if (scan.pores >= 1) set.add("모공");
  }
  return [...set];
}

function scoreSku(sku: Sku, survey: Survey, concerns: Concern[]): number {
  let score = 0;
  if (sku.forTypes.includes(survey.type)) score += 3;
  for (const concern of concerns) if (sku.concerns.includes(concern)) score += 2;
  if (survey.avoid.every((avoid) => sku.freeOf.includes(avoid))) score += 1;
  return score;
}

function reasonFor(sku: Sku, survey: Survey, concerns: Concern[], avoidedClear: boolean): string {
  const matched = concerns.filter((concern) => sku.concerns.includes(concern)).slice(0, 2);
  const budgetText = `${Math.round(survey.budget / 10000)}만원대`;
  const head = matched.length ? `${survey.type}, ${matched.join("·")} 고민` : `${survey.type} 피부`;
  let reason = `${head}과 ${budgetText} 예산에 맞춰 고른 ${sku.category}예요.`;
  if (avoidedClear && survey.avoid.length) reason += ` ${survey.avoid.join("·")} 성분을 피하고 싶은 조건도 반영했어요.`;
  if (!efficacyClean(reason).ok) reason = `${survey.type} 피부와 ${budgetText} 예산에 맞춰 고른 선택이에요.`;
  return reason;
}

function toRec(sku: Sku, survey: Survey, concerns: Concern[]): Recommendation {
  const avoidedClear = survey.avoid.every((avoid) => sku.freeOf.includes(avoid));
  return {
    sku,
    toneLabel: TONE_LABEL[sku.tone],
    reason: reasonFor(sku, survey, concerns, avoidedClear),
    matchedIngredients: sku.keyIngredients.slice(0, 2),
    avoidedClear,
  };
}

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

  for (const sku of sorted) {
    if (picks.length >= 3) break;
    if (!picks.includes(sku)) picks.push(sku);
  }

  return picks;
}

export function recommend(survey: Survey, scan: ScanReads = null): RecoResult {
  const concerns = effectiveConcerns(survey, scan);
  const inCategory = SKUS.filter((sku) => sku.category === survey.category);

  const passes = (sku: Sku, useBudget: boolean, useAvoid: boolean) =>
    (!useBudget || sku.price <= survey.budget) &&
    (!useAvoid || survey.avoid.every((avoid) => sku.freeOf.includes(avoid)));

  const rank = (list: Sku[]) =>
    [...list].sort((a, b) => scoreSku(b, survey, concerns) - scoreSku(a, survey, concerns) || a.price - b.price);

  let relaxed: RecoResult["relaxed"] = null;
  let pool = inCategory.filter((sku) => passes(sku, true, true));

  if (pool.length === 0) {
    pool = inCategory.filter((sku) => passes(sku, true, false));
    if (pool.length) relaxed = "avoid";
  }

  if (pool.length === 0) {
    pool = inCategory.filter((sku) => passes(sku, false, true));
    if (pool.length) relaxed = "budget";
  }

  if (pool.length === 0) pool = inCategory;

  const picks = diversify(rank(pool)).map((sku) => toRec(sku, survey, concerns));
  const note =
    relaxed === "budget"
      ? "예산 안에서 조건을 모두 만족하는 제품이 적어, 가장 가까운 선택까지 함께 봤어요."
      : relaxed === "avoid"
        ? "피하고 싶은 성분 조건을 모두 만족하는 제품이 적어, 가장 가까운 선택까지 함께 봤어요."
        : undefined;

  return { picks, relaxed, note };
}
