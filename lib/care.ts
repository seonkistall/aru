import type { RecoResult, Survey } from "./recommend";
import type { SkinReads } from "./skin";
import type { Sku } from "./skus";
import { commerceOutHref, type MerchantId } from "./commerce";
import { t } from "./i18n/core";

export type CareLocale = "ko" | "en";
export type CareIntentKind = "purchase" | "clinic" | "tourist";

export type CareLink = {
  label: string;
  href: string;
  note: string;
  noteEn?: string;
  kind: CareIntentKind;
  partnerReady?: boolean;
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
      partnerReady: link.partnerReady,
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
          label: t("근처 피부과 찾기"),
          href: "https://www.google.com/maps/search/%ED%94%BC%EB%B6%80%EA%B3%BC",
          note: t("현재 위치 주변 피부과를 지도에서 찾아요."),
          kind: "clinic",
        },
        {
          label: t("피부 상담 검색"),
          href: "https://search.naver.com/search.naver?query=%ED%94%BC%EB%B6%80%EA%B3%BC%20%EC%83%81%EB%8B%B4",
          note: t("상담 가능한 병원과 정보를 검색해요."),
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
  const needsClinic = Boolean(hasVisibleRedness || hasTroubleConcern);

  if (locale === "en") {
    return {
      title: top ? `Next step for ${top.name}` : "Your next K-beauty step",
      body: needsClinic
        ? "You can compare products first, and consider a clinic consultation if sensitivity or breakouts continue."
        : "Start with the recommended product search, then save a check-in after trying it.",
      clinicPriority: needsClinic,
    };
  }

  return {
    title: top ? t("{name} 다음 단계", { name: top.name }) : t("다음 케어 단계"),
    body: needsClinic
      ? t("제품 비교와 함께, 붉은기나 트러블이 계속되면 피부과 상담 연결도 열어둘게요.")
      : t("추천 제품을 먼저 비교하고, 사용 후 체크인으로 다음 추천을 더 정확하게 만들 수 있어요."),
    clinicPriority: needsClinic,
  };
}
