import type { RecoResult, Survey } from "./recommend";
import type { SkinReads } from "./skin";
import type { Sku } from "./skus";
import { commerceOutHref, type MerchantId } from "./commerce";
import { t, type Lang } from "./i18n/core";

export type CareLocale = Lang;
export type CareIntentKind = "purchase" | "clinic" | "tourist";

export type CareLink = {
  label: string;
  href: string;
  note: string;
  noteEn?: string;
  kind: CareIntentKind;
  merchant?: MerchantId;
  placement?: string;
  skuId?: string;
  region?: string;
};

export function productSearchLinks(sku: Sku, placement = "care"): CareLink[] {
  return [...sku.commerceLinks]
    .sort((a, b) => a.priority - b.priority)
    .map((link) => ({
      label: link.label,
      href: commerceOutHref(sku.id, link.merchant, placement),
      note: link.note,
      noteEn: link.noteEn,
      kind: "purchase",
      merchant: link.merchant,
      placement,
      skuId: sku.id,
      region: link.region,
    }));
}

export function clinicLinks(locale: CareLocale): CareLink[] {
  return locale === "ko"
    ? [
        {
          // Korean canonical — consumers translate at render (t(link.label));
          // recordCareIntent persists these labels, so no t() here.
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
          label: "근처 피부과 찾기",
          href: "https://www.google.com/maps/search/dermatology+clinic+near+me",
          note: "현재 위치 주변 피부과를 지도에서 찾아요.",
          kind: "clinic",
        },
        {
          label: "영어 상담 가능한 피부과 찾기",
          href: "https://www.google.com/search?q=English-speaking+dermatology+clinic+Korea",
          note: "영어 상담이 필요한 여행자에게 유용해요.",
          kind: "tourist",
        },
      ];
}

export function careSummary(survey: Survey | null, _reads: SkinReads | null, result: RecoResult | null) {
  const top = result?.picks[0]?.sku;
  const hasTroubleConcern = survey?.concerns.includes("트러블");
  const needsClinic = Boolean(hasTroubleConcern);

  return {
    title: top ? t("{name} 다음 단계", { name: t(top.name) }) : t("다음 케어 단계"),
    body: needsClinic
      ? t("제품 비교와 함께, 붉은기나 트러블이 계속되면 피부과 상담 연결도 열어둘게요.")
      : t("추천 제품을 먼저 비교하고, 사용 후 체크인으로 다음 추천을 더 정확하게 만들 수 있어요."),
    clinicPriority: needsClinic,
  };
}
