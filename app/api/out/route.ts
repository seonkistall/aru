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

  const override = commerceOverrideUrl(sku.id, merchant);
  const target = override || link.href;
  if (!isAllowedCommerceUrl(target)) {
    return NextResponse.json({ ok: false, reason: "blocked target" }, { status: 400 });
  }

  return NextResponse.redirect(addCommerceTracking(target, { sku: sku.id, merchant, placement }), { status: 302 });
}
