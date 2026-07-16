/**
 * Curated product catalog (structured like an olive young / 화해 feed so a real
 * partner integration can drop in). Copy describes cosmetic fit only — no
 * medical/guaranteed-efficacy claims (efficacyClean-safe). Ingredients are
 * referenced by key into lib/ingredients.ts so the UI can render tags and the
 * engine can match ingredient roles to concerns.
 *
 * NOTE: prices are representative seed values used only for broad budget
 * filtering. They are not current merchant prices and must never be rendered
 * as live sale data.
 */

import { buildCommerceLinks, primaryCommerceLink, type CommerceLink } from "./commerce";
import { ingredientNames, type IngredientRole } from "./ingredients";

export type SkinType = "지성" | "건성" | "복합성" | "민감성" | "중성";
export type Concern =
  | "모공"
  | "블랙헤드"
  | "붉은기"
  | "건조"
  | "수분부족"
  | "유분"
  | "트러블"
  | "잡티"
  | "칙칙함"
  | "각질"
  | "탄력"
  | "민감";
export type Avoid = "향료" | "알코올" | "에센셜오일" | "파라벤" | "실리콘" | "인공색소" | "광물성오일";
export type Category = "클렌저" | "토너" | "에센스" | "세럼" | "크림" | "선크림" | "마스크팩" | "아이크림";
export type Tone = "safe" | "value" | "gentle";

export type Sku = {
  id: string;
  brand: string;
  name: string;
  category: Category;
  price: number;
  volume?: string;
  forTypes: SkinType[];
  concerns: Concern[];
  ingredientKeys: string[];
  keyIngredients: string[]; // derived display names (kept for existing readers)
  freeOf: Avoid[];
  highlights: string[];
  texture?: string;
  image?: string;
  tone: Tone;
  buyUrl: string;
  commerceLinks: CommerceLink[];
};

type SkuInput = Omit<Sku, "buyUrl" | "commerceLinks" | "keyIngredients">;

function sku(input: SkuInput): Sku {
  const commerceLinks = buildCommerceLinks(input);
  return {
    ...input,
    keyIngredients: ingredientNames(input.ingredientKeys).slice(0, 3),
    commerceLinks,
    buyUrl: primaryCommerceLink({ commerceLinks }).href,
  };
}

// Which ingredient roles help each concern — powers ingredient-aware scoring so
// the recommendation reads as "chosen for your concern", not a random match.
export const CONCERN_ROLES: Record<Concern, IngredientRole[]> = {
  모공: ["피지밸런스", "결케어", "각질케어"],
  블랙헤드: ["각질케어", "피지밸런스"],
  붉은기: ["진정", "장벽"],
  건조: ["보습", "장벽"],
  수분부족: ["수분", "보습"],
  유분: ["피지밸런스"],
  트러블: ["진정", "피지밸런스"],
  잡티: ["톤케어"],
  칙칙함: ["톤케어"],
  각질: ["각질케어", "수분"],
  탄력: ["탄력케어"],
  민감: ["진정", "장벽"],
};

export function budgetBand(price: number): string {
  if (price < 10000) return "1만원 미만";
  if (price < 20000) return "1만원대";
  if (price < 30000) return "2만원대";
  if (price < 40000) return "3만원대";
  return "4만원 이상";
}

export const SKUS: Sku[] = [
  // ── 클렌저 ──────────────────────────────────────────────
  sku({
    id: "cl1", brand: "라운드랩", name: "자작나무 수분 클렌저", category: "클렌저",
    price: 13500, volume: "150ml",
    forTypes: ["지성", "복합성", "건성", "중성"], concerns: ["유분", "건조", "민감"],
    ingredientKeys: ["birch", "glycerin", "panthenol"], freeOf: ["에센셜오일", "인공색소"],
    highlights: ["약산성", "촉촉 세정", "저자극"], texture: "젤", tone: "safe",
  }),
  sku({
    id: "cl2", brand: "이즈앤트리", name: "히알루론산 약산성 클렌저", category: "클렌저",
    price: 12000, volume: "150ml",
    forTypes: ["민감성", "건성", "중성"], concerns: ["건조", "붉은기", "수분부족"],
    ingredientKeys: ["hyaluronic", "panthenol", "glycerin"], freeOf: ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "광물성오일"],
    highlights: ["약산성", "무향", "히알루론산"], texture: "젤", tone: "gentle",
  }),
  sku({
    id: "cl3", brand: "닥터지", name: "레드 블레미쉬 클리어링 폼", category: "클렌저",
    price: 15000, volume: "150ml",
    forTypes: ["지성", "복합성", "민감성"], concerns: ["트러블", "붉은기", "유분"],
    ingredientKeys: ["centella", "greentea"], freeOf: ["알코올", "인공색소"],
    highlights: ["시카", "번들거림 케어"], texture: "폼", tone: "value",
  }),

  // ── 토너 ────────────────────────────────────────────────
  sku({
    id: "tn1", brand: "아누아", name: "어성초 77 토너", category: "토너",
    price: 19000, volume: "250ml",
    forTypes: ["지성", "복합성", "민감성"], concerns: ["트러블", "붉은기", "모공"],
    ingredientKeys: ["houttuynia", "betaine", "panthenol"], freeOf: ["향료", "알코올", "파라벤"],
    highlights: ["어성초 77%", "진정", "무알콜"], texture: "워터리", tone: "value",
  }),
  sku({
    id: "tn2", brand: "라운드랩", name: "독도 토너", category: "토너",
    price: 18000, volume: "200ml",
    forTypes: ["지성", "복합성", "건성", "중성"], concerns: ["유분", "모공", "건조", "각질"],
    ingredientKeys: ["deepsea", "panthenol", "pha"], freeOf: ["향료", "에센셜오일", "인공색소"],
    highlights: ["해양심층수", "순한 각질케어"], texture: "워터리", tone: "safe",
  }),
  sku({
    id: "tn3", brand: "브링그린", name: "티트리 시카 수딩 토너", category: "토너",
    price: 16000, volume: "300ml",
    forTypes: ["지성", "복합성", "민감성"], concerns: ["트러블", "붉은기", "민감"],
    ingredientKeys: ["centella", "madecassoside", "betaine"], freeOf: ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "광물성오일"],
    highlights: ["티트리 시카", "대용량"], texture: "워터리", tone: "gentle",
  }),

  // ── 에센스 ──────────────────────────────────────────────
  sku({
    id: "es1", brand: "코스알엑스", name: "어드밴스드 스네일 96 에센스", category: "에센스",
    price: 21000, volume: "100ml",
    forTypes: ["건성", "복합성", "중성"], concerns: ["수분부족", "탄력", "칙칙함"],
    ingredientKeys: ["hyaluronic", "panthenol", "allantoin"], freeOf: ["향료", "인공색소"],
    highlights: ["스네일 96%", "결 정돈"], texture: "에센스", tone: "value",
  }),
  sku({
    id: "es2", brand: "아이소이", name: "불가리안 로즈 에센스", category: "에센스",
    price: 38000, volume: "50ml",
    forTypes: ["건성", "민감성", "중성"], concerns: ["칙칙함", "탄력", "수분부족"],
    ingredientKeys: ["peptide", "collagen", "glycerin"], freeOf: ["파라벤", "인공색소", "광물성오일", "실리콘"],
    highlights: ["로즈", "탄력 결 케어"], texture: "에센스", tone: "gentle",
  }),

  // ── 세럼 ────────────────────────────────────────────────
  sku({
    id: "sr1", brand: "아누아", name: "어성초 80 세럼", category: "세럼",
    price: 22000, volume: "30ml",
    forTypes: ["지성", "복합성", "민감성"], concerns: ["트러블", "붉은기", "모공", "유분"],
    ingredientKeys: ["heartleaf", "panthenol", "niacinamide"], freeOf: ["향료", "알코올", "파라벤"],
    highlights: ["어성초 80%", "피지·진정"], texture: "세럼", tone: "value",
  }),
  sku({
    id: "sr2", brand: "토리든", name: "다이브인 저분자 히알루론산 세럼", category: "세럼",
    price: 24000, volume: "50ml",
    forTypes: ["건성", "민감성", "복합성", "중성"], concerns: ["건조", "수분부족", "붉은기"],
    ingredientKeys: ["hyaluronic", "allantoin", "betaine"], freeOf: ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "광물성오일"],
    highlights: ["5D 히알루론산", "속당김 케어"], texture: "세럼", tone: "gentle",
  }),
  sku({
    id: "sr3", brand: "넘버즈인", name: "5번 비타민C 잡티 세럼", category: "세럼",
    price: 25000, volume: "32ml",
    forTypes: ["복합성", "중성", "지성"], concerns: ["잡티", "칙칙함", "모공"],
    ingredientKeys: ["vitc_derivative", "niacinamide", "tranexamic"], freeOf: ["향료", "에센셜오일", "인공색소"],
    highlights: ["비타민C 유도체", "톤 정돈"], texture: "세럼", tone: "value",
  }),
  sku({
    id: "sr4", brand: "메디큐브", name: "제로 모공 PHA 세럼", category: "세럼",
    price: 29000, volume: "30ml",
    forTypes: ["지성", "복합성"], concerns: ["모공", "블랙헤드", "각질", "유분"],
    ingredientKeys: ["pha", "lha", "niacinamide"], freeOf: ["향료", "알코올", "파라벤"],
    highlights: ["PHA·LHA", "모공 결"], texture: "세럼", tone: "value",
  }),

  // ── 크림 ────────────────────────────────────────────────
  sku({
    id: "cr1", brand: "에스트라", name: "아토베리어 365 크림", category: "크림",
    price: 27000, volume: "80ml",
    forTypes: ["민감성", "건성", "중성"], concerns: ["건조", "붉은기", "민감", "수분부족"],
    ingredientKeys: ["ceramide", "panthenol", "allantoin"], freeOf: ["향료", "알코올", "에센셜오일", "파라벤", "인공색소"],
    highlights: ["세라마이드", "장벽 케어", "저자극"], texture: "크림", tone: "gentle",
  }),
  sku({
    id: "cr2", brand: "일리윤", name: "세라마이드 아토 크림", category: "크림",
    price: 14000, volume: "200ml",
    forTypes: ["건성", "민감성", "중성"], concerns: ["건조", "수분부족"],
    ingredientKeys: ["ceramide", "shea", "glycerin"], freeOf: ["향료", "인공색소", "실리콘", "광물성오일"],
    highlights: ["세라마이드", "대용량", "가성비"], texture: "크림", tone: "value",
  }),
  sku({
    id: "cr3", brand: "닥터지", name: "레드 블레미쉬 수분 크림", category: "크림",
    price: 24000, volume: "70ml",
    forTypes: ["복합성", "민감성", "지성"], concerns: ["붉은기", "트러블", "수분부족"],
    ingredientKeys: ["cica_complex", "panthenol", "niacinamide"], freeOf: ["에센셜오일", "인공색소"],
    highlights: ["시카", "산뜻 수분"], texture: "젤크림", tone: "safe",
  }),

  // ── 선크림 ──────────────────────────────────────────────
  sku({
    id: "su1", brand: "라운드랩", name: "자작나무 수분 선크림", category: "선크림",
    price: 20000, volume: "50ml",
    forTypes: ["지성", "복합성", "건성", "중성"], concerns: ["유분", "건조", "수분부족"],
    ingredientKeys: ["birch", "niacinamide", "panthenol"], freeOf: ["에센셜오일", "인공색소"],
    highlights: ["SPF50+ PA++++", "촉촉", "백탁 적음"], texture: "로션", tone: "safe",
  }),
  sku({
    id: "su2", brand: "닥터지", name: "그린 마일드 업 선", category: "선크림",
    price: 18000, volume: "50ml",
    forTypes: ["민감성", "복합성", "중성"], concerns: ["붉은기", "민감"],
    ingredientKeys: ["cica_complex", "panthenol", "zinc"], freeOf: ["향료", "에센셜오일", "파라벤", "실리콘", "광물성오일"],
    highlights: ["SPF50+ PA++++", "시카", "톤업"], texture: "로션", tone: "gentle",
  }),
  sku({
    id: "su3", brand: "뷰티오브조선", name: "리프 선스틱 어성초", category: "선크림",
    price: 17000, volume: "18g",
    forTypes: ["지성", "복합성"], concerns: ["유분", "트러블"],
    ingredientKeys: ["heartleaf", "greentea"], freeOf: ["인공색소"],
    highlights: ["스틱형", "산뜻", "덧바르기"], texture: "스틱", tone: "value",
  }),

  // ── 마스크팩 ────────────────────────────────────────────
  sku({
    id: "mk1", brand: "메디힐", name: "티트리 카밍 마스크", category: "마스크팩",
    price: 1800, volume: "1매",
    forTypes: ["지성", "복합성", "민감성"], concerns: ["트러블", "붉은기", "유분"],
    ingredientKeys: ["greentea", "centella", "panthenol"], freeOf: ["인공색소"],
    highlights: ["티트리", "데일리팩"], texture: "시트", tone: "value",
  }),
  sku({
    id: "mk2", brand: "아비브", name: "어성초 카밍 개러멘트 마스크", category: "마스크팩",
    price: 3000, volume: "1매",
    forTypes: ["민감성", "복합성", "건성"], concerns: ["붉은기", "민감", "수분부족"],
    ingredientKeys: ["houttuynia", "panthenol", "hyaluronic"], freeOf: ["향료", "알코올", "파라벤", "실리콘", "광물성오일"],
    highlights: ["어성초", "밀착 시트"], texture: "시트", tone: "gentle",
  }),

  // ── 아이크림 ────────────────────────────────────────────
  sku({
    id: "ey1", brand: "에스트라", name: "리제덤365 아이크림", category: "아이크림",
    price: 30000, volume: "25ml",
    forTypes: ["건성", "중성", "복합성"], concerns: ["탄력", "건조", "칙칙함"],
    ingredientKeys: ["peptide", "adenosine", "ceramide"], freeOf: ["향료", "인공색소"],
    highlights: ["펩타이드", "탄력 결"], texture: "크림", tone: "safe",
  }),
  sku({
    id: "ey2", brand: "구달", name: "청귤 비타C 잡티 아이크림", category: "아이크림",
    price: 22000, volume: "30ml",
    forTypes: ["복합성", "중성", "지성"], concerns: ["칙칙함", "잡티", "수분부족"],
    ingredientKeys: ["vitc_derivative", "niacinamide", "glycerin"], freeOf: ["파라벤", "인공색소", "실리콘", "광물성오일"],
    highlights: ["비타민C", "눈가 톤"], texture: "크림", tone: "value",
  }),
];
