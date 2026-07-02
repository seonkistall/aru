/**
 * Demo product set.
 *
 * Copy describes cosmetic fit only. Avoid medical/guaranteed efficacy claims.
 */

import { buildCommerceLinks, primaryCommerceLink, type CommerceLink } from "./commerce";

export type SkinType = "지성" | "건성" | "복합성" | "민감성";
export type Concern = "모공" | "붉은기" | "건조" | "트러블" | "유분" | "탄력";
export type Avoid = "향료" | "알코올" | "에센셜오일";
export type Category = "클렌저" | "토너" | "세럼" | "크림" | "선크림";
export type Tone = "safe" | "value" | "gentle";

export type Sku = {
  id: string;
  brand: string;
  name: string;
  category: Category;
  price: number;
  forTypes: SkinType[];
  concerns: Concern[];
  keyIngredients: string[];
  freeOf: Avoid[];
  tone: Tone;
  buyUrl: string;
  commerceLinks: CommerceLink[];
};

type SkuInput = Omit<Sku, "buyUrl" | "commerceLinks">;

function sku(input: SkuInput): Sku {
  const commerceLinks = buildCommerceLinks(input);
  return {
    ...input,
    commerceLinks,
    buyUrl: primaryCommerceLink({ commerceLinks }).href,
  };
}

export const SKUS: Sku[] = [
  sku({
    id: "cl1",
    brand: "라운드랩",
    name: "자작나무 수분 클렌저",
    category: "클렌저",
    price: 13500,
    forTypes: ["지성", "복합성", "건성"],
    concerns: ["유분", "건조"],
    keyIngredients: ["자작나무 수액", "글리세린"],
    freeOf: ["에센셜오일"],
    tone: "safe",
  }),
  sku({
    id: "cl2",
    brand: "이즈앤트리",
    name: "히알루론산 약산성 클렌저",
    category: "클렌저",
    price: 12000,
    forTypes: ["민감성", "건성"],
    concerns: ["건조", "붉은기"],
    keyIngredients: ["히알루론산", "판테놀"],
    freeOf: ["향료", "알코올", "에센셜오일"],
    tone: "gentle",
  }),
  sku({
    id: "tn1",
    brand: "아누아",
    name: "어성초 77 토너",
    category: "토너",
    price: 19000,
    forTypes: ["지성", "복합성", "민감성"],
    concerns: ["트러블", "붉은기", "모공"],
    keyIngredients: ["어성초 추출물", "베타인"],
    freeOf: ["향료", "알코올"],
    tone: "value",
  }),
  sku({
    id: "tn2",
    brand: "라운드랩",
    name: "독도 토너",
    category: "토너",
    price: 18000,
    forTypes: ["지성", "복합성", "건성"],
    concerns: ["유분", "모공", "건조"],
    keyIngredients: ["해양심층수", "판테놀"],
    freeOf: ["향료", "에센셜오일"],
    tone: "safe",
  }),
  sku({
    id: "sr1",
    brand: "아누아",
    name: "어성초 80 세럼",
    category: "세럼",
    price: 22000,
    forTypes: ["지성", "복합성", "민감성"],
    concerns: ["트러블", "붉은기", "모공"],
    keyIngredients: ["어성초 80%", "판테놀"],
    freeOf: ["향료", "알코올"],
    tone: "value",
  }),
  sku({
    id: "sr2",
    brand: "토리든",
    name: "다이브인 저분자 히알루론산 세럼",
    category: "세럼",
    price: 24000,
    forTypes: ["건성", "민감성", "복합성"],
    concerns: ["건조", "붉은기"],
    keyIngredients: ["히알루론산", "알란토인"],
    freeOf: ["향료", "알코올", "에센셜오일"],
    tone: "gentle",
  }),
  sku({
    id: "cr1",
    brand: "에스트라",
    name: "아토베리어 365 크림",
    category: "크림",
    price: 27000,
    forTypes: ["민감성", "건성"],
    concerns: ["건조", "붉은기"],
    keyIngredients: ["세라마이드", "판테놀"],
    freeOf: ["향료", "알코올", "에센셜오일"],
    tone: "gentle",
  }),
  sku({
    id: "cr2",
    brand: "일리윤",
    name: "세라마이드 아토 크림",
    category: "크림",
    price: 14000,
    forTypes: ["건성", "민감성"],
    concerns: ["건조"],
    keyIngredients: ["세라마이드"],
    freeOf: ["향료"],
    tone: "value",
  }),
  sku({
    id: "su1",
    brand: "라운드랩",
    name: "자작나무 수분 선크림",
    category: "선크림",
    price: 20000,
    forTypes: ["지성", "복합성", "건성"],
    concerns: ["유분", "건조"],
    keyIngredients: ["자작나무 수액", "나이아신아마이드"],
    freeOf: ["에센셜오일"],
    tone: "safe",
  }),
  sku({
    id: "su2",
    brand: "닥터지",
    name: "그린 마일드 업 선",
    category: "선크림",
    price: 18000,
    forTypes: ["민감성", "복합성"],
    concerns: ["붉은기"],
    keyIngredients: ["시카", "판테놀"],
    freeOf: ["향료", "에센셜오일"],
    tone: "gentle",
  }),
];
