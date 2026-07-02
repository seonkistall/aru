export type MerchantId = "oliveyoung" | "naver-shopping" | "coupang" | "global-search";
export type CommerceKind = "marketplace" | "global";

export type CommerceLink = {
  merchant: MerchantId;
  label: string;
  href: string;
  note: string;
  kind: CommerceKind;
  region: "KR" | "GLOBAL";
  priority: number;
  partnerReady: boolean;
};

export type CommerceProduct = {
  id: string;
  brand: string;
  name: string;
};

const ALLOWED_HOSTS = new Set([
  "www.oliveyoung.co.kr",
  "search.shopping.naver.com",
  "www.coupang.com",
  "www.google.com",
]);

export function oliveYoungSearchUrl(query: string) {
  return `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(query)}`;
}

export function naverShoppingSearchUrl(query: string) {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`;
}

export function coupangSearchUrl(query: string) {
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
}

export function globalSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} Korean skincare buy`)}`;
}

export function buildCommerceLinks(product: CommerceProduct): CommerceLink[] {
  const query = `${product.brand} ${product.name}`;
  return [
    {
      merchant: "oliveyoung",
      label: "올리브영",
      href: oliveYoungSearchUrl(query),
      note: "국내 오프라인/온라인 전환을 함께 보기 좋은 핵심 제휴 후보예요.",
      kind: "marketplace",
      region: "KR",
      priority: 1,
      partnerReady: true,
    },
    {
      merchant: "naver-shopping",
      label: "네이버 쇼핑",
      href: naverShoppingSearchUrl(query),
      note: "가격 비교와 브랜드 공식몰 노출을 확인해요.",
      kind: "marketplace",
      region: "KR",
      priority: 2,
      partnerReady: true,
    },
    {
      merchant: "coupang",
      label: "쿠팡",
      href: coupangSearchUrl(query),
      note: "빠른 배송 수요와 전환 가격대를 확인해요.",
      kind: "marketplace",
      region: "KR",
      priority: 3,
      partnerReady: true,
    },
    {
      merchant: "global-search",
      label: "Global search",
      href: globalSearchUrl(query),
      note: "외국인 사용자의 해외 구매 가능성을 확인해요.",
      kind: "global",
      region: "GLOBAL",
      priority: 4,
      partnerReady: false,
    },
  ];
}

export function primaryCommerceLink<T extends { commerceLinks: CommerceLink[] }>(product: T): CommerceLink {
  return [...product.commerceLinks].sort((a, b) => a.priority - b.priority)[0];
}

export function commerceOutHref(skuId: string, merchant: MerchantId, placement: string) {
  const params = new URLSearchParams({ sku: skuId, merchant, placement });
  return `/api/out?${params.toString()}`;
}

export function isAllowedCommerceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function addCommerceTracking(value: string, input: { sku: string; merchant: string; placement: string }) {
  const url = new URL(value);
  url.searchParams.set("utm_source", "kbeauty_ai_camera");
  url.searchParams.set("utm_medium", "commerce_link");
  url.searchParams.set("utm_campaign", "skin_scan_recommendation");
  url.searchParams.set("utm_content", `${input.placement}_${input.sku}_${input.merchant}`);
  return url.toString();
}

export function commerceOverrideUrl(skuId: string, merchant: MerchantId): string | null {
  try {
    const raw = process.env.COMMERCE_LINK_OVERRIDES_JSON;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, Partial<Record<MerchantId, string>>>;
    const value = parsed[skuId]?.[merchant];
    return value && isAllowedCommerceUrl(value) ? value : null;
  } catch {
    return null;
  }
}
