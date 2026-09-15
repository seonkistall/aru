// One runtime list, with the type derived from it, so the override audit can check
// a merchant key against the same source the type comes from.
export const MERCHANT_IDS = ["oliveyoung", "naver-shopping", "coupang", "global-search"] as const;
export type MerchantId = (typeof MERCHANT_IDS)[number];
export type CommerceKind = "marketplace" | "global";

export type CommerceLink = {
  merchant: MerchantId;
  label: string;
  href: string;
  note: string;
  noteEn: string;
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
      note: "오늘 매장이나 온라인 재고를 바로 볼 수 있어요",
      noteEn: "Korea's biggest beauty retailer — check stock online.",
      kind: "marketplace",
      region: "KR",
      priority: 1,
      partnerReady: true,
    },
    {
      merchant: "naver-shopping",
      label: "네이버 쇼핑",
      href: naverShoppingSearchUrl(query),
      note: "가격 비교와 공식몰을 한눈에 봐요",
      noteEn: "Compare prices and official brand stores.",
      kind: "marketplace",
      region: "KR",
      priority: 2,
      partnerReady: true,
    },
    {
      merchant: "coupang",
      label: "쿠팡",
      href: coupangSearchUrl(query),
      note: "빠른 배송으로 받고 싶을 때 좋아요",
      noteEn: "Fastest delivery option in Korea.",
      kind: "marketplace",
      region: "KR",
      priority: 3,
      partnerReady: true,
    },
    {
      merchant: "global-search",
      label: "Global search",
      href: globalSearchUrl(query),
      note: "해외에서 구매 가능한지 확인해요",
      noteEn: "Check overseas availability.",
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

/**
 * Whether the out-links currently earn ARU a commission.
 *
 * Drives the wording of `CommerceDisclosure`. It is a separate switch from
 * `COMMERCE_LINK_OVERRIDES_JSON` only because that one is read on the server and the
 * product cards render on the client — so **set both in the same deploy**. Affiliate
 * URLs live with this off is precisely the state the disclosure exists to prevent,
 * and under 올리브영's curator terms a missing disclosure forfeits the payout.
 */
export function affiliateDisclosureActive(): boolean {
  return process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE === "on";
}

export type CommerceOverrideIssue = {
  sku: string;
  merchant: string;
  value: string;
  reason: "not-https-or-allowlisted" | "unknown-merchant";
};

export type CommerceOverrideAudit = {
  configured: boolean;
  /** False when the env var is set but is not parseable JSON — every override is lost. */
  parsed: boolean;
  accepted: { sku: string; merchant: string; value: string }[];
  issues: CommerceOverrideIssue[];
};

/**
 * What `COMMERCE_LINK_OVERRIDES_JSON` actually resolves to, rejections included.
 *
 * This exists because the rejections used to be invisible. `commerceOverrideUrl`
 * returned null for a malformed blob, an unknown sku and a blocked host alike, and
 * the caller falls back to the search URL, so a wrong affiliate link looked exactly
 * like no affiliate link at all. That is the one misconfiguration that costs money
 * silently: `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` is a separate switch, so the product
 * can be telling users it earns a commission on links that are still plain search
 * URLs because the gate dropped every override without a word.
 *
 * `docs/commerce-partnership-playbook.md` walked straight into it — its worked
 * example for `naver-shopping` is a `smartstore.naver.com` URL, which is not on
 * ALLOWED_HOSTS, so following the runbook exactly produced a silent no-op.
 */
export function auditCommerceOverrides(
  raw: string | undefined = process.env.COMMERCE_LINK_OVERRIDES_JSON
): CommerceOverrideAudit {
  if (!raw) return { configured: false, parsed: true, accepted: [], issues: [] };
  let parsed: Record<string, Partial<Record<MerchantId, string>>>;
  try {
    parsed = JSON.parse(raw) as Record<string, Partial<Record<MerchantId, string>>>;
  } catch {
    return { configured: true, parsed: false, accepted: [], issues: [] };
  }
  const accepted: CommerceOverrideAudit["accepted"] = [];
  const issues: CommerceOverrideIssue[] = [];
  const known = new Set<string>(MERCHANT_IDS);
  for (const [sku, byMerchant] of Object.entries(parsed || {})) {
    for (const [merchant, value] of Object.entries(byMerchant || {})) {
      if (typeof value !== "string" || !value) continue;
      // A misspelled merchant key never matches a lookup, so the override is a no-op
      // that looks exactly like a missing one — the same silent failure as a blocked
      // host. Note the sku half is NOT checked here: this module cannot import the
      // catalogue without a cycle (lib/skus.ts imports this file), so a typo'd sku id
      // is still a silent no-op. Recorded in docs/AUTOPILOT.md.
      if (!known.has(merchant)) issues.push({ sku, merchant, value, reason: "unknown-merchant" });
      else if (isAllowedCommerceUrl(value)) accepted.push({ sku, merchant, value });
      else issues.push({ sku, merchant, value, reason: "not-https-or-allowlisted" });
    }
  }
  return { configured: true, parsed: true, accepted, issues };
}

// Warn once per distinct env value, not once per click: /api/out reads the override
// on every out-link and a per-request warning would bury the log it belongs in. A Set
// rather than a last-seen string so flipping back to an earlier value stays quiet too.
const warnedFor = new Set<string>();

function warnOnce(raw: string | undefined) {
  if (raw === undefined || warnedFor.has(raw)) return;
  warnedFor.add(raw);
  const audit = auditCommerceOverrides(raw);
  if (!audit.parsed) {
    console.warn("[commerce] COMMERCE_LINK_OVERRIDES_JSON is not valid JSON — every override is being ignored.");
    return;
  }
  for (const issue of audit.issues) {
    const why =
      issue.reason === "unknown-merchant"
        ? `"${issue.merchant}" is not a merchant id (${MERCHANT_IDS.join(", ")})`
        : `${issue.value} is not an https URL on the allowlist (${[...ALLOWED_HOSTS].join(", ")})`;
    console.warn(`[commerce] override for ${issue.sku}/${issue.merchant} ignored: ${why}. The link is still a search URL.`);
  }
}

export function commerceOverrideUrl(skuId: string, merchant: MerchantId): string | null {
  try {
    const raw = process.env.COMMERCE_LINK_OVERRIDES_JSON;
    if (!raw) return null;
    warnOnce(raw);
    const parsed = JSON.parse(raw) as Record<string, Partial<Record<MerchantId, string>>>;
    const value = parsed[skuId]?.[merchant];
    return value && isAllowedCommerceUrl(value) ? value : null;
  } catch {
    return null;
  }
}
