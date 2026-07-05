"use client";

// Production-level product card (olive young / 화해 style): image (or branded
// fallback), rating, highlight chips, and key-ingredient tags that call out WHY
// each ingredient is here for the user's concern. Reused by /report and /care.
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { recordFunnelEvent } from "@/lib/funnel";
import { recordPurchase } from "@/lib/store";
import type { Recommendation } from "@/lib/recommend";
import { ProductVisual } from "./product-visual";

function formatReviews(n?: number): string | null {
  if (!n) return null;
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`;
  return `${n}`;
}

export function ProductCard({ pick, placement, rank }: { pick: Recommendation; placement: string; rank?: number }) {
  const { sku } = pick;
  const commerce = primaryCommerceLink(sku);
  const reviews = formatReviews(sku.reviewCount);

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 13 }}>
        <div style={thumb}>
          {sku.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sku.image} alt={`${sku.brand} ${sku.name}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
          ) : (
            <ProductVisual category={sku.category} brand={sku.brand} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {rank ? <span style={rankBadge}>{rank}순위</span> : null}
            <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>{sku.brand}</span>
          </div>
          <p style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16.5, color: "var(--ink)", lineHeight: 1.25, margin: "3px 0 4px" }}>{sku.name}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            {sku.volume && <span>{sku.volume}</span>}
            {sku.rating && (
              <span style={{ color: "var(--bronze)", fontWeight: 700 }}>
                ★ {sku.rating.toFixed(1)}
                {reviews && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> · 리뷰 {reviews}</span>}
              </span>
            )}
            <span style={{ marginLeft: "auto", fontFeatureSettings: '"tnum"', fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{sku.price.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      {sku.highlights.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 11 }}>
          {sku.highlights.map((h) => (
            <span key={h} style={highlightChip}>{h}</span>
          ))}
        </div>
      )}

      {pick.ingredientTags.length > 0 && (
        <div style={{ marginTop: 11 }}>
          <p style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 6 }}>핵심 성분</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pick.ingredientTags.map((tag) => (
              <span key={tag.name} style={tag.forConcern ? ingTagMatch : ingTag}>
                <b style={{ fontWeight: 700 }}>{tag.name}</b>
                <span style={{ opacity: 0.75 }}> · {tag.forConcern ? `${tag.forConcern} 케어` : tag.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5, marginTop: 11 }}>{pick.reason}</p>
      {pick.watchOut && <p style={watchOutStyle}>{pick.watchOut}</p>}

      <a
        href={commerceOutHref(sku.id, commerce.merchant, placement)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          recordPurchase({ sku_id: sku.id, name: sku.name, price: sku.price });
          recordFunnelEvent("commerce_clicked", { placement, merchant: commerce.merchant });
        }}
        style={buyBtn}
      >
        {commerce.label}에서 보기 →
      </a>
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
const buyBtn: React.CSSProperties = { display: "block", textAlign: "center", marginTop: 13, background: "var(--plum)", color: "var(--on-plum)", borderRadius: 9, padding: "12px 16px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
