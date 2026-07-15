"use client";

import { useState } from "react";
// Product card with stable catalog facts and ingredient-fit context. Seed
// prices are shown only as broad budget bands; current sale information stays
// with the merchant.
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { recordFunnelEvent } from "@/lib/funnel";
import { recordProductUse } from "@/lib/store";
import type { Recommendation } from "@/lib/recommend";
import { budgetBand } from "@/lib/skus";
import { ProductVisual } from "./product-visual";
import { t } from "@/lib/i18n/core";

export function ProductCard({ pick, placement, rank }: { pick: Recommendation; placement: string; rank?: number }) {
  const { sku } = pick;
  const commerce = primaryCommerceLink(sku);
  const [useStatus, setUseStatus] = useState<"idle" | "saved" | "error">("idle");

  async function confirmProductUse() {
    const saved = await recordProductUse({ sku_id: sku.id, name: sku.name });
    setUseStatus(saved ? "saved" : "error");
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 13 }}>
        <div style={thumb}>
          {sku.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sku.image} alt={`${t(sku.brand)} ${t(sku.name)}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
          ) : (
            <ProductVisual category={sku.category} brand={sku.brand} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {rank ? <span style={rankBadge}>{t("{rank}순위", { rank })}</span> : null}
            <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>{t(sku.brand)}</span>
          </div>
          <p style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16.5, color: "var(--ink)", lineHeight: 1.25, margin: "3px 0 4px" }}>{t(sku.name)}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            {sku.volume && <span>{sku.volume}</span>}
            {sku.texture && <span>{t(sku.texture)}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: "var(--ink)" }}>
              {t("예산대")} · {t(budgetBand(sku.price))}
            </span>
          </div>
        </div>
      </div>

      {sku.highlights.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 11 }}>
          {sku.highlights.map((h) => (
            <span key={h} style={highlightChip}>{t(h)}</span>
          ))}
        </div>
      )}

      {pick.ingredientTags.length > 0 && (
        <div style={{ marginTop: 11 }}>
          <p style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 6 }}>{t("핵심 성분")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pick.ingredientTags.map((tag) => (
              <span key={tag.name} style={tag.forConcern ? ingTagMatch : ingTag}>
                <b style={{ fontWeight: 700 }}>{t(tag.name)}</b>
                <span style={{ opacity: 0.75 }}> · {tag.forConcern ? t("{concern} 케어", { concern: t(tag.forConcern) }) : t(tag.role)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5, marginTop: 11 }}>{pick.reason}</p>
      {pick.watchOut && <p style={watchOutStyle}>{t(pick.watchOut)}</p>}
      <p style={merchantNote}>{t("예산대는 추천 필터용 참고값이에요. 판매처에서 현재 가격·옵션·성분 확인")}</p>

      <a
        href={commerceOutHref(sku.id, commerce.merchant, placement)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          recordFunnelEvent("commerce_clicked", { placement, merchant: commerce.merchant });
        }}
        style={buyBtn}
      >
        {t("{label}에서 보기 →", { label: t(commerce.label) })}
      </a>
      <button type="button" onClick={confirmProductUse} disabled={useStatus === "saved"} style={useBtn(useStatus === "saved")}>
        {useStatus === "saved" ? t("사용 시작일이 기록됐어요") : t("이 제품을 사용하기 시작했어요")}
      </button>
      {useStatus === "error" && (
        <p role="status" style={{ fontSize: 11.5, color: "var(--danger)", lineHeight: 1.45, marginTop: 7 }}>
          {t("저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.")}
        </p>
      )}
    </div>
  );
}

const card: React.CSSProperties = { padding: 15, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" };
const thumb: React.CSSProperties = { width: 68, height: 68, borderRadius: 10, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" };
const rankBadge: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: "var(--on-plum)", background: "var(--plum)", borderRadius: 999, padding: "2px 7px" };
const highlightChip: React.CSSProperties = { fontSize: 11.5, color: "var(--ink-soft)", background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 9px" };
const ingTag: React.CSSProperties = { fontSize: 11.5, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px" };
const ingTagMatch: React.CSSProperties = { fontSize: 11.5, color: "var(--plum)", background: "color-mix(in srgb, var(--plum) 8%, var(--paper))", border: "1px solid color-mix(in srgb, var(--plum) 35%, var(--line))", borderRadius: 7, padding: "4px 8px" };
const watchOutStyle: React.CSSProperties = { fontSize: 12, color: "var(--plum-press)", background: "color-mix(in srgb, var(--plum) 6%, transparent)", borderRadius: 7, padding: "8px 10px", marginTop: 9, lineHeight: 1.45 };
const merchantNote: React.CSSProperties = { fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45, marginTop: 10 };
const buyBtn: React.CSSProperties = { display: "block", textAlign: "center", marginTop: 13, background: "var(--plum)", color: "var(--on-plum)", borderRadius: 9, padding: "12px 16px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const useBtn = (saved: boolean): React.CSSProperties => ({ width: "100%", marginTop: 8, border: "1px solid var(--line)", borderRadius: 9, background: saved ? "var(--surface-tint)" : "transparent", color: saved ? "var(--success)" : "var(--ink-soft)", padding: "10px 12px", fontSize: 12.5, fontWeight: 700, cursor: saved ? "default" : "pointer" });
