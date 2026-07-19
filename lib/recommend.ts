import { CONCERN_ROLES, SKUS, type Avoid, type Category, type Concern, type SkinType, type Sku } from "./skus";
import { INGREDIENTS } from "./ingredients";
import { t } from "./i18n/core";

export type Survey = {
  type: SkinType;
  concerns: Concern[];
  budget: number;
  avoid: Avoid[];
  category: Category;
};

// An ingredient tag surfaced on the card: the ingredient and why it's here
// (which of the user's concerns its role addresses), so the match reads as
// "chosen for you", not generic. `forConcern` is undefined for a base benefit.
export type IngredientTag = { name: string; role: string; forConcern?: Concern };

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
  matchedConcerns: Concern[];
  ingredientTags: IngredientTag[];
  avoidedClear: boolean;
  watchOut?: string;
};

export type RoutineStep = {
  id: string;
  title: string;
  body: string;
  category: Category;
  heroSku?: Sku;
  heroNote?: string; // the hero product's specific ingredients, tied to the step
  why: string;
  cadence?: string;
};

export type Routine = { am: RoutineStep[]; pm: RoutineStep[] };

export type RecoResult = {
  picks: Recommendation[];
  routine: Routine;
  relaxed: null | "budget" | "avoid" | "both";
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

function skuRoles(sku: Sku): Set<string> {
  const set = new Set<string>();
  for (const key of sku.ingredientKeys) for (const role of INGREDIENTS[key]?.roles ?? []) set.add(role);
  return set;
}

function scoreSku(sku: Sku, survey: Survey, concerns: Concern[]): number {
  let score = 0;
  if (sku.forTypes.includes(survey.type)) score += 3;
  const roles = skuRoles(sku);
  for (const concern of concerns) {
    if (sku.concerns.includes(concern)) score += 2;
    // Ingredient-aware: reward products whose ACTUAL ingredients carry a role
    // that addresses the concern — this is what makes the pick feel deliberate.
    if (CONCERN_ROLES[concern]?.some((role) => roles.has(role))) score += 1.2;
  }
  if (survey.avoid.every((avoid) => sku.freeOf.includes(avoid))) score += 1.5;
  if (sku.category === survey.category) score += 2;
  return score;
}

// Up to 3 key-ingredient tags, prioritising ingredients whose role addresses one
// of the user's concerns (so the tag reads "여기 있는 이유").
function ingredientTagsFor(sku: Sku, concerns: Concern[]): IngredientTag[] {
  const tags: IngredientTag[] = [];
  for (const key of sku.ingredientKeys) {
    const ing = INGREDIENTS[key];
    if (!ing) continue;
    const hitConcern = concerns.find((concern) => CONCERN_ROLES[concern]?.some((role) => ing.roles.includes(role as never)));
    tags.push({ name: ing.name, role: ing.roles[0] ?? "", forConcern: hitConcern });
  }
  // Concern-matching tags first, then the rest; cap at 3.
  return tags.sort((a, b) => Number(Boolean(b.forConcern)) - Number(Boolean(a.forConcern))).slice(0, 3);
}

// Survey stores each chip's band ceiling (19000/29000/39000/49000/999999 for
// 1/2/3/4만원·5만원 이상) — rounding won values mislabels every bucket, so
// floor back to the chip label.
export function budgetLabel(won: number): string {
  if (won >= 50000) return t("5만원 이상");
  return t("{n}만원", { n: Math.max(1, Math.floor(won / 10000)) });
}

function reasonFor(sku: Sku, survey: Survey, concerns: Concern[], scanApplied: boolean, avoidedClear: boolean, budgetRelaxed: boolean): string {
  const matched = concerns.filter((concern) => sku.concerns.includes(concern)).slice(0, 2);
  const budgetText = budgetLabel(survey.budget);
  const head = matched.length
    ? t("{concerns} 고민", { concerns: matched.map((concern) => t(concern)).join(", ") })
    : t("{type} 피부", { type: t(survey.type) });
  // When the budget was relaxed to fill the category, the pick is over budget —
  // don't claim it fits the budget; describe it as the closest candidate.
  let reason = budgetRelaxed
    ? scanApplied
      ? t("카메라에서 확인한 피부 특징과 설문 답변을 함께 살펴봤어요. {budget} 예산에 가장 가까운 {category} 제품 후보예요. {head}도 참고했어요.", { head, budget: budgetText, category: t(sku.category) })
      : t("설문 답변을 살펴보고 {budget} 예산에 가장 가까운 {category} 제품 후보로 정리했어요. {head}도 참고했어요.", { head, budget: budgetText, category: t(sku.category) })
    : scanApplied
      ? t("카메라에서 확인한 피부 특징과 {head}, {budget} 예산을 함께 고려한 {category} 제품 후보예요.", { head, budget: budgetText, category: t(sku.category) })
      : t("{head}, {budget} 예산을 함께 고려한 {category} 제품 후보예요.", { head, budget: budgetText, category: t(sku.category) });
  if (avoidedClear && survey.avoid.length) reason += ` ${t("요청한 제외 성분 조건도 반영했어요.")}`;
  if (!efficacyClean(reason).ok) reason = t("{type} 피부와 {budget} 예산을 함께 고려한 {category} 제품 후보예요.", { type: t(survey.type), budget: budgetText, category: t(sku.category) });
  return reason;
}

function toRec(sku: Sku, survey: Survey, concerns: Concern[], scanApplied: boolean, budgetRelaxed: boolean): Recommendation {
  const avoidedClear = survey.avoid.every((avoid) => sku.freeOf.includes(avoid));
  return {
    sku,
    toneLabel: TONE_LABEL[sku.tone],
    reason: reasonFor(sku, survey, concerns, scanApplied, avoidedClear, budgetRelaxed),
    matchedIngredients: sku.keyIngredients.slice(0, 2),
    matchedConcerns: concerns.filter((concern) => sku.concerns.includes(concern)),
    ingredientTags: ingredientTagsFor(sku, concerns),
    avoidedClear,
    watchOut: avoidedClear ? undefined : t("선택한 제외 성분 조건을 모두 만족하지 않을 수 있어요. 구매 전 전성분을 확인해 주세요."),
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

function routineFor(survey: Survey, concerns: Concern[], picks: Recommendation[], scan: ScanReads, scanApplied: boolean): Routine {
  const reads = scanApplied && scan ? scan : null;
  const scanOil = reads !== null && reads.oil >= 2;
  const scanRedness = reads !== null && reads.redness >= 2;
  const scanPores = reads !== null && reads.pores >= 1;
  const saidOil = survey.concerns.includes("유분");
  const saidRedness = survey.concerns.includes("붉은기");
  const hasOil = scanOil || saidOil || survey.type === "지성" || survey.type === "복합성";
  const hasRedness = scanRedness || saidRedness || survey.type === "민감성";
  const hasPores = scanPores || survey.concerns.includes("모공");
  const dry = survey.concerns.includes("건조") || survey.type === "건성";
  const budgetText = budgetLabel(survey.budget);

  const am: RoutineStep[] = [
    {
      id: "am-cleanse",
      category: "클렌저",
      title: hasRedness ? t("미지근한 물로 부드럽게 씻기") : hasOil ? t("가볍게 씻고 번들거림 줄이기") : t("피부가 당기지 않게 씻기"),
      body: hasRedness
        ? t("문지르는 시간을 줄이고, 미지근한 물로 짧게 세안하는 편이 좋아요.")
        : hasOil
          ? t("아침에는 과하게 뽀득한 마무리보다 산뜻한 세안을 권장해요.")
          : t("세안 후 당김이 적은 제품을 먼저 보는 흐름이 좋아요."),
      why: scanRedness
        ? t("오늘 카메라에서 볼 쪽 붉은기가 보여 아침은 자극이 덜한 순서로 정리했어요.")
        : saidRedness
          ? t("설문에서 답해주신 붉은기·민감 고민에 맞춰 아침 세안을 부드럽게 잡았어요.")
          : scanOil
            ? t("오늘 카메라에서 T존 번들거림이 보여 가벼운 세안부터 시작해요.")
            : saidOil
              ? t("설문에서 답해주신 유분 고민에 맞춰 아침을 산뜻하게 시작해요.")
              : t("{type} 피부라고 답해주셔서 당김 없는 세안부터 순서를 잡았어요.", { type: t(survey.type) }),
    },
    {
      id: "am-hydrate",
      category: survey.category,
      title: hasRedness ? t("순한 수분층 만들기") : hasOil ? t("수분은 얇게, 가벼운 제형으로") : t("수분감을 얇게 채우기"),
      body: hasRedness
        ? t("향이 강한 제품보다 순한 수분 제품부터 얇게 맞춰보세요.")
        : hasOil
          ? t("아침에는 무거운 마무리보다 가벼운 수분 한 겹이면 충분해요.")
          : t("가벼운 수분 단계를 아침 루틴의 중심에 두는 흐름이에요."),
      why: scanRedness
        ? t("카메라에서 붉은기가 보여 순한 선택부터 살펴보도록 구성했어요.")
        : scanOil
          ? t("카메라에서 확인한 T존 유분을 참고해 아침 제형은 가볍게 정리했어요.")
          : saidRedness
            ? t("민감·붉은기 답변에 맞춰 순한 수분 제품을 가운데 뒀어요.")
            : saidOil
              ? t("유분 고민 답변에 맞춰 아침에는 가벼운 제형을 골랐어요.")
              : t("{budget} 예산 안에서 매일 쓰기 부담 없는 제품으로 맞췄어요.", { budget: budgetText }),
    },
    {
      id: "am-protect",
      category: "선크림",
      title: hasRedness ? t("선케어는 오늘 아침의 핵심") : t("낮에는 선케어로 마무리"),
      body: scanRedness
        ? t("붉은기가 보이는 날일수록 외출 전 자외선 차단을 더 꼼꼼히 챙기는 편이 좋아요.")
        : saidRedness
          ? t("붉은기 고민이 있을수록 낮 자외선 차단을 더 꼼꼼히 챙기는 편이 좋아요.")
          : t("피부 컨디션과 관계없이 낮 루틴은 자외선 차단제를 마지막 단계로 두는 편이 좋아요."),
      why: scanRedness
        ? t("오늘 카메라에서 붉은기가 보여 아침 선케어를 먼저 챙겼어요.")
        : saidRedness
          ? t("붉은기 고민을 답해주셔서 아침 선케어를 강조했어요.")
          : t("계절과 상관없이 낮의 마지막 단계는 선케어로 두는 걸 권해요."),
      cadence: t("매일"),
    },
  ];

  const pm: RoutineStep[] = [
    {
      id: "pm-cleanse",
      category: "클렌저",
      title: hasOil ? t("저녁 세안은 조금 더 꼼꼼하게") : hasRedness ? t("저녁에도 부드럽게 씻기") : t("하루를 씻어내는 저녁 세안"),
      body: hasOil
        ? t("하루 동안 쌓인 유분과 자외선 차단제를 저녁에 충분히 씻어내는 게 좋아요.")
        : hasRedness
          ? t("이중 세안이 필요 없는 날은 순한 세안 한 번으로 충분해요.")
          : t("선크림이나 메이크업을 썼다면 저녁에 씻어내고 자는 흐름을 권해요."),
      why: scanOil
        ? t("오늘 카메라에서 유분이 뚜렷하게 보여 저녁 세안을 조금 더 꼼꼼하게 잡았어요.")
        : saidOil
          ? t("유분 고민 답변에 맞춰 저녁 세안에 비중을 뒀어요.")
          : scanRedness
            ? t("붉은기 신호가 있어서 저녁에도 부드러운 세안을 권해요.")
            : saidRedness
              ? t("민감 고민 답변에 맞춰 저녁 세안도 순하게 잡았어요.")
              : t("하루 마무리 세안은 피부 타입과 상관없이 기본이 되는 단계예요."),
    },
    ...(hasPores
      ? [
          {
            id: "pm-texture",
            category: "세럼" as Category,
            title: t("피부결 돌보기는 저녁에 나눠서"),
            body: hasRedness
              ? t("붉은기가 신경 쓰이는 날은 건너뛰고, 컨디션 좋은 저녁에만 가볍게 써보세요.")
              : t("결 케어 제품은 매일보다 저녁에만, 간격을 두고 쓰는 편이 부담이 적어요."),
            why: scanPores
              ? t("카메라에서 볼 쪽 피부결이 보여 저녁 결 케어 단계를 넣었어요.")
              : t("모공 고민을 답해주셔서 저녁 결 케어 단계를 넣었어요."),
            cadence: t("주 2-3회"),
          },
        ]
      : []),
    {
      id: "pm-hydrate",
      category: survey.category,
      title: hasRedness ? t("순한 수분으로 하루 마무리") : t("수분을 채우고 하루 마무리"),
      body: hasRedness
        ? t("저녁에는 순한 수분 제품을 얇게 두 번 나눠 발라도 좋아요.")
        : t("세안 직후 물기가 마르기 전에 수분 단계를 이어주는 흐름이 좋아요."),
      why: survey.avoid.length && picks.some((pick) => pick.avoidedClear)
        ? t("피하고 싶다고 답한 성분이 없는 제품을 우선 살펴봤어요.")
        : t("{budget} 예산과 {type} 피부 답변을 함께 보고 고른 단계예요.", { budget: budgetText, type: t(survey.type) }),
    },
    {
      id: "pm-seal",
      category: "크림",
      title: hasOil ? t("마무리는 가볍게 잠그기") : dry ? t("마지막은 크림으로 덮기") : t("크림으로 하루 마무리"),
      body: hasOil
        ? t("번들거림이 고민이면 크림 대신 가벼운 젤 제형을 얇게 발라도 좋아요.")
        : dry
          ? t("수분 단계가 마르기 전에 크림을 얇게 덮어 밤사이 당김을 줄여보세요.")
          : t("저녁 마지막 단계는 크림을 얇게 발라 수분을 잠그는 흐름이에요."),
      why: survey.concerns.includes("건조")
        ? t("건조 고민을 답해주셔서 밤 마무리 단계를 챙겼어요.")
        : scanOil
          ? t("카메라에서 확인한 유분을 참고해 밤 마무리도 가벼운 제형으로 정리했어요.")
          : saidOil
            ? t("유분 고민 답변에 맞춰 밤 마무리도 가볍게 잡았어요.")
            : t("{type} 피부 답변에 맞춰 밤 마무리 단계를 잡았어요.", { type: t(survey.type) }),
    },
  ];

  // Categories that already own a dedicated step (선크림→am-protect, 크림→pm-seal).
  // The am-/pm-hydrate steps borrow survey.category; when it is one of these, the
  // hydrate step must NOT claim the product, or the sunscreen/cream lands on a
  // "수분" step (mislabeled) and the real sun/seal step shows nothing.
  const dedicatedCategories = new Set<Category>(["선크림", "크림"]);
  const attach = (steps: RoutineStep[]): RoutineStep[] => {
    const seen = new Set<string>();
    return steps.map((step) => {
      const isHydrate = step.id === "am-hydrate" || step.id === "pm-hydrate";
      // pm-texture is interval-use guidance; attaching a daily product there
      // would contradict its own cadence, so it stays product-free.
      const hero =
        step.id === "pm-texture" || (isHydrate && dedicatedCategories.has(survey.category))
          ? undefined
          : picks.find((pick) => pick.sku.category === step.category)?.sku;
      if (!hero || seen.has(hero.id)) return step;
      seen.add(hero.id);
      // Tie the step to the hero product's actual ingredients (from the catalog),
      // so the routine reads product-specific rather than a template.
      const ings = hero.keyIngredients.slice(0, 2);
      const rawNote = ings.length ? t("{ingredients} 성분이 담겨 있어요.", { ingredients: ings.map((ing) => t(ing)).join("·") }) : undefined;
      // Runtime compliance guard (like reasonFor): drop the note if a future
      // ingredient name ever trips efficacyClean, so nothing leaks to the UI.
      const heroNote = rawNote && efficacyClean(rawNote).ok ? rawNote : undefined;
      return { ...step, heroSku: hero, heroNote };
    });
  };

  return { am: attach(am), pm: attach(pm) };
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

  if (pool.length === 0) {
    // Neither budget-only nor avoid-only could be satisfied: fall back to the
    // whole category and disclose that BOTH constraints were stretched (else
    // the report would claim the budget was honored over over-budget picks).
    pool = inCategory;
    if (pool.length) relaxed = "both";
  }

  const budgetRelaxed = relaxed === "budget" || relaxed === "both";
  const picks = diversify(rank(pool)).map((sku) => toRec(sku, survey, concerns, scanApplied, budgetRelaxed));
  // Compose the note from every applicable signal — a low-confidence scan must
  // NOT suppress the budget/avoid relaxation disclosure (they can co-occur).
  const noteParts: string[] = [];
  if (!scanApplied && scan) {
    noteParts.push(t("촬영 조건이 충족되지 않아 사진은 참고만 하고, 설문 답변을 중심으로 정리했어요."));
  }
  if (relaxed === "budget" || relaxed === "both") {
    noteParts.push(t("예산 안에서 조건을 모두 만족하는 제품이 적어, 가장 가까운 선택까지 함께 봤어요."));
  }
  if (relaxed === "avoid" || relaxed === "both") {
    noteParts.push(t("선택한 제외 성분을 모두 피한 제품이 적어 기준을 조금 넓혔어요. 구매 전 전성분을 확인해 주세요."));
  }
  const note = noteParts.length ? noteParts.join(" ") : undefined;

  return { picks, routine: routineFor(survey, concerns, picks, scan, scanApplied), relaxed, scanApplied, note };
}
