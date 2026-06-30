import type { RecoResult, Survey } from "./recommend";
import type { SkinReads } from "./skin";
import type { Sku } from "./skus";

export type CareLocale = "ko" | "en";
export type CareIntentKind = "purchase" | "clinic" | "tourist";

export type CareLink = {
  label: string;
  href: string;
  note: string;
  kind: CareIntentKind;
};

export function productSearchLinks(sku: Sku): CareLink[] {
  const q = encodeURIComponent(`${sku.brand} ${sku.name}`);
  return [
    {
      label: "네이버 쇼핑",
      href: `https://search.shopping.naver.com/search/all?query=${q}`,
      note: "국내 가격 비교와 구매처를 확인해요.",
      kind: "purchase",
    },
    {
      label: "올리브영 검색",
      href: `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${q}`,
      note: "국내 드럭스토어 재고와 리뷰를 확인해요.",
      kind: "purchase",
    },
    {
      label: "Global search",
      href: `https://www.google.com/search?q=${encodeURIComponent(`${sku.brand} ${sku.name} Korean skincare`)}`,
      note: "For international users and overseas availability.",
      kind: "purchase",
    },
  ];
}

export function clinicLinks(locale: CareLocale): CareLink[] {
  return locale === "ko"
    ? [
        {
          label: "근처 피부과 찾기",
          href: "https://www.google.com/maps/search/%ED%94%BC%EB%B6%80%EA%B3%BC",
          note: "현재 위치 주변 피부과를 지도에서 찾아요.",
          kind: "clinic",
        },
        {
          label: "피부 상담 검색",
          href: "https://search.naver.com/search.naver?query=%ED%94%BC%EB%B6%80%EA%B3%BC%20%EC%83%81%EB%8B%B4",
          note: "상담 가능한 병원과 정보를 검색해요.",
          kind: "clinic",
        },
      ]
    : [
        {
          label: "Dermatology near me",
          href: "https://www.google.com/maps/search/dermatology+clinic+near+me",
          note: "Find clinics near your current location.",
          kind: "clinic",
        },
        {
          label: "English-speaking dermatology",
          href: "https://www.google.com/search?q=English-speaking+dermatology+clinic+Korea",
          note: "Useful for travelers looking for English support.",
          kind: "tourist",
        },
      ];
}

export function careSummary(survey: Survey | null, reads: SkinReads | null, result: RecoResult | null, locale: CareLocale) {
  const top = result?.picks[0]?.sku;
  const hasVisibleRedness = (reads?.redness.level ?? 0) >= 1 || survey?.concerns.includes("붉은기");
  const hasTroubleConcern = survey?.concerns.includes("트러블");

  if (locale === "en") {
    return {
      title: top ? `Next step for ${top.name}` : "Your next K-beauty step",
      body:
        hasVisibleRedness || hasTroubleConcern
          ? "You can compare products first, and consider a clinic consultation if sensitivity or breakouts continue."
          : "Start with the recommended product search, then save a check-in after trying it.",
      clinicPriority: Boolean(hasVisibleRedness || hasTroubleConcern),
    };
  }

  return {
    title: top ? `${top.name} 다음 단계` : "다음 케어 단계",
    body:
      hasVisibleRedness || hasTroubleConcern
        ? "제품 비교와 함께, 붉은기나 트러블이 계속되면 피부과 상담 연결도 열어둘게요."
        : "추천 제품을 먼저 비교하고, 사용 후 체크인으로 다음 추천을 더 정확하게 만들 수 있어요.",
    clinicPriority: Boolean(hasVisibleRedness || hasTroubleConcern),
  };
}
