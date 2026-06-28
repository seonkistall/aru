/**
 * Hand-curated SKU set (v0 demo).
 *
 * Tags are conservative match metadata, NOT efficacy claims. Recommendation copy
 * states FIT ("지성·향료 회피에 맞음"), never effect ("미백/개선") — D4 + 화장품
 * 표시광고 규제.
 *
 * TODO (eng-review): define curation authority + criteria (성분 기준 / 제외 기준 /
 * 책임자 / 업데이트 주기). This is the trust basis, not the CV. For now these are
 * reasonable placeholders and MUST be reviewed before any real launch.
 */

export type SkinType = "지성" | "건성" | "복합" | "민감";
export type Concern = "모공" | "홍조" | "건조" | "트러블" | "유분" | "탄력";
export type Avoid = "향료" | "알코올" | "에센셜오일";
export type Category = "클렌저" | "토너" | "세럼" | "크림" | "선크림";
export type Tone = "safe" | "value" | "gentle"; // 무난 / 가성비 / 민감 보수적

export type Sku = {
  id: string;
  brand: string;
  name: string;
  category: Category;
  price: number;
  forTypes: SkinType[];
  concerns: Concern[];
  keyIngredients: string[]; // shown as ingredient-chips
  freeOf: Avoid[]; // avoided ingredients this product does NOT contain
  tone: Tone;
  buyUrl: string;
};

export const SKUS: Sku[] = [
  // ── 클렌저 ──
  { id: "cl1", brand: "세타필", name: "젠틀 스킨 클렌저", category: "클렌저", price: 12000, forTypes: ["민감", "건성"], concerns: ["건조"], keyIngredients: ["판테놀", "글리세린"], freeOf: ["향료", "알코올", "에센셜오일"], tone: "gentle", buyUrl: "#" },
  { id: "cl2", brand: "라운드랩", name: "자작나무 수분 클렌징폼", category: "클렌저", price: 13500, forTypes: ["지성", "복합", "건성"], concerns: ["유분", "건조"], keyIngredients: ["자작나무 수액"], freeOf: ["에센셜오일"], tone: "safe", buyUrl: "#" },

  // ── 토너 ──
  { id: "tn1", brand: "라운드랩", name: "독도 토너", category: "토너", price: 18000, forTypes: ["지성", "복합"], concerns: ["유분", "모공"], keyIngredients: ["판테놀", "울릉도 해양심층수"], freeOf: ["향료", "에센셜오일"], tone: "safe", buyUrl: "#" },
  { id: "tn2", brand: "아누아", name: "어성초 77 토너", category: "토너", price: 19000, forTypes: ["지성", "복합", "민감"], concerns: ["트러블", "홍조", "모공"], keyIngredients: ["어성초 추출물"], freeOf: ["향료", "알코올"], tone: "value", buyUrl: "#" },
  { id: "tn3", brand: "토리든", name: "다이브인 저분자 히알루론산 토너", category: "토너", price: 16000, forTypes: ["건성", "민감"], concerns: ["건조"], keyIngredients: ["저분자 히알루론산"], freeOf: ["향료", "알코올", "에센셜오일"], tone: "gentle", buyUrl: "#" },

  // ── 세럼 ──
  { id: "sr1", brand: "아누아", name: "어성초 80 세럼", category: "세럼", price: 22000, forTypes: ["지성", "복합", "민감"], concerns: ["트러블", "홍조", "모공"], keyIngredients: ["어성초 80%", "판테놀"], freeOf: ["향료", "알코올"], tone: "value", buyUrl: "#" },
  { id: "sr2", brand: "토리든", name: "다이브인 세럼", category: "세럼", price: 24000, forTypes: ["건성", "민감", "복합"], concerns: ["건조"], keyIngredients: ["5종 히알루론산"], freeOf: ["향료", "알코올", "에센셜오일"], tone: "gentle", buyUrl: "#" },
  { id: "sr3", brand: "넘버즈인", name: "3번 결광 세럼", category: "세럼", price: 21000, forTypes: ["복합", "건성"], concerns: ["모공", "건조"], keyIngredients: ["나이아신아마이드", "갈락토미세스"], freeOf: ["에센셜오일"], tone: "safe", buyUrl: "#" },

  // ── 크림 ──
  { id: "cr1", brand: "에스트라", name: "아토베리어 365 크림", category: "크림", price: 27000, forTypes: ["민감", "건성"], concerns: ["건조", "홍조"], keyIngredients: ["세라마이드", "판테놀"], freeOf: ["향료", "알코올", "에센셜오일"], tone: "gentle", buyUrl: "#" },
  { id: "cr2", brand: "일리윤", name: "세라마이드 아토 크림", category: "크림", price: 14000, forTypes: ["건성", "민감"], concerns: ["건조"], keyIngredients: ["세라마이드"], freeOf: ["향료"], tone: "value", buyUrl: "#" },
  { id: "cr3", brand: "닥터지", name: "레드 블레미쉬 수분 크림", category: "크림", price: 23000, forTypes: ["복합", "민감"], concerns: ["홍조", "트러블"], keyIngredients: ["시카", "판테놀"], freeOf: ["향료", "에센셜오일"], tone: "safe", buyUrl: "#" },

  // ── 선크림 ──
  { id: "su1", brand: "라운드랩", name: "자작나무 수분 선크림", category: "선크림", price: 20000, forTypes: ["지성", "복합", "건성"], concerns: ["유분"], keyIngredients: ["자작나무 수액"], freeOf: ["에센셜오일"], tone: "safe", buyUrl: "#" },
  { id: "su2", brand: "닥터지", name: "그린 마일드 업 선", category: "선크림", price: 18000, forTypes: ["민감", "복합"], concerns: ["홍조"], keyIngredients: ["시카", "판테놀"], freeOf: ["향료", "에센셜오일"], tone: "gentle", buyUrl: "#" },
  { id: "su3", brand: "토니모리", name: "더 촉촉한 그린티 선크림", category: "선크림", price: 12000, forTypes: ["지성", "복합"], concerns: ["유분", "모공"], keyIngredients: ["그린티"], freeOf: [], tone: "value", buyUrl: "#" },
];
