import { SKUS, type Avoid, type Category, type Concern, type SkinType, type Sku } from "./skus";

export type Survey = {
  type: SkinType;
  concerns: Concern[];
  budget: number;
  avoid: Avoid[];
  category: Category;
};

export type ScanReads = {
  oil: number;
  redness: number;
  pores: number;
  confidence?: number;
  retakeRecommended?: boolean;
  source?: string;
} | null;

export type Recommendation = {
  sku: Sku;
  toneLabel: string;
  reason: string;
  matchedIngredients: string[];
  avoidedClear: boolean;
  watchOut?: string;
};

export type RoutineStep = {
  id: string;
  title: string;
  body: string;
  category: Category;
  heroSku?: Sku;
};

export type RecoResult = {
  picks: Recommendation[];
  routine: RoutineStep[];
  relaxed: null | "budget" | "avoid";
  scanApplied: boolean;
  note?: string;
};

const TONE_LABEL: Record<Sku["tone"], string> = {
  safe: "기본 추천",
  value: "예산 맞춤",
  gentle: "순한 선택",
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

function shouldApplyScan(scan: ScanReads): scan is NonNullable<ScanReads> {
  return Boolean(scan && !scan.retakeRecommended && (scan.confidence ?? 0.7) >= 0.58);
}

function effectiveConcerns(survey: Survey, scan: ScanReads): Concern[] {
  const set = new Set<Concern>(survey.concerns);
  if (shouldApplyScan(scan)) {
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
  if (survey.avoid.every((avoid) => sku.freeOf.includes(avoid))) score += 1.5;
  if (sku.category === survey.category) score += 2;
  return score;
}

function reasonFor(sku: Sku, survey: Survey, concerns: Concern[], scanApplied: boolean, avoidedClear: boolean): string {
  const matched = concerns.filter((concern) => sku.concerns.includes(concern)).slice(0, 2);
  const budgetText = `${Math.round(survey.budget / 10000)}만원대`;
  const scanText = scanApplied ? "오늘 스캔에서 보인 신호와 " : "";
  const head = matched.length ? `${matched.join(", ")} 고민` : `${survey.type} 피부`;
  let reason = `${scanText}${head}, ${budgetText} 예산을 함께 보고 고른 ${sku.category}예요.`;
  if (avoidedClear && survey.avoid.length) reason += ` 요청한 제외 성분 조건도 반영했어요.`;
  if (!efficacyClean(reason).ok) reason = `${survey.type} 피부와 ${budgetText} 예산에 맞춰 고른 ${sku.category}예요.`;
  return reason;
}

function toRec(sku: Sku, survey: Survey, concerns: Concern[], scanApplied: boolean): Recommendation {
  const avoidedClear = survey.avoid.every((avoid) => sku.freeOf.includes(avoid));
  return {
    sku,
    toneLabel: TONE_LABEL[sku.tone],
    reason: reasonFor(sku, survey, concerns, scanApplied, avoidedClear),
    matchedIngredients: sku.keyIngredients.slice(0, 2),
    avoidedClear,
    watchOut: avoidedClear ? undefined : "선택한 제외 성분 조건을 모두 만족하지 않을 수 있어요. 구매 전 전성분을 확인해 주세요.",
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

function routineFor(survey: Survey, concerns: Concern[], picks: Recommendation[]): RoutineStep[] {
  const hasRedness = concerns.includes("붉은기") || concerns.includes("트러블");
  const hasOil = concerns.includes("유분") || concerns.includes("모공");
  const steps: RoutineStep[] = [
    {
      id: "cleanse",
      title: hasOil ? "가볍게 씻고 번들거림 줄이기" : "피부가 당기지 않게 씻기",
      body: hasOil ? "아침에는 과하게 뽀득한 마무리보다 산뜻한 세안을 권장해요." : "세안 후 당김이 적은 제품을 먼저 보는 흐름이 좋아요.",
      category: "클렌저",
    },
    {
      id: "hydrate",
      title: hasRedness ? "순한 수분층 만들기" : "수분감을 얇게 채우기",
      body: hasRedness ? "붉어 보이는 날은 향이 강한 제품보다 순한 수분 제품부터 맞춰보세요." : "스캔 결과와 설문을 보면 가벼운 수분 단계가 루틴의 중심이에요.",
      category: survey.category,
    },
    {
      id: "protect",
      title: "낮에는 선케어로 마무리",
      body: "피부 컨디션과 관계없이 낮 루틴은 자외선 차단제를 마지막 단계로 두는 편이 좋아요.",
      category: "선크림",
    },
  ];

  return steps.map((step) => ({
    ...step,
    heroSku: picks.find((pick) => pick.sku.category === step.category)?.sku,
  }));
}

export function recommend(survey: Survey, scan: ScanReads = null): RecoResult {
  const scanApplied = shouldApplyScan(scan);
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

  const picks = diversify(rank(pool)).map((sku) => toRec(sku, survey, concerns, scanApplied));
  const note =
    !scanApplied && scan
      ? "촬영 상태가 애매해서 이번 추천은 설문 답변을 중심으로 골랐어요. 스캔 결과는 참고만 했습니다."
      : relaxed === "budget"
        ? "예산 안에서 조건을 모두 만족하는 제품이 적어, 가장 가까운 선택까지 함께 봤어요."
        : relaxed === "avoid"
          ? "선택한 제외 성분을 모두 피한 제품이 적어 기준을 조금 넓혔어요. 구매 전 전성분을 확인해 주세요."
          : undefined;

  return { picks, routine: routineFor(survey, concerns, picks), relaxed, scanApplied, note };
}
