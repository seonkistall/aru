import { NextResponse } from "next/server";
import { addCommerceTracking, commerceOverrideUrl, isAllowedCommerceUrl, type MerchantId } from "@/lib/commerce";
import { SKUS } from "@/lib/skus";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const skuId = url.searchParams.get("sku") || "";
  const merchant = url.searchParams.get("merchant") as MerchantId | null;
  const placement = url.searchParams.get("placement") || "unknown";
  const sku = SKUS.find((item) => item.id === skuId);
  const link = merchant ? sku?.commerceLinks.find((item) => item.merchant === merchant) : null;

  if (!sku || !merchant || !link) {
    return NextResponse.json({ ok: false, reason: "unknown commerce link" }, { status: 404 });
  }

  // SKUS is already loaded to resolve the click, so the override audit can check the
  // sku half of every override key here without lib/commerce.ts importing the catalogue.
  const override = commerceOverrideUrl(sku.id, merchant, { knownSkus: SKUS.map((item) => item.id) });
  const target = override || link.href;
  if (!isAllowedCommerceUrl(target)) {
    return NextResponse.json({ ok: false, reason: "blocked target" }, { status: 400 });
  }

  return NextResponse.redirect(addCommerceTracking(target, { sku: sku.id, merchant, placement }), { status: 302 });
}
