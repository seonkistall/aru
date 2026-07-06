"use client";

// Side-by-side comparison of the recommended products (price / rating / texture
// / key ingredients / avoid-clear). Horizontal-scrolls on narrow screens. Helps
// the user decide between picks without leaving the report.
import type { Recommendation } from "@/lib/recommend";
import { ProductVisual } from "./product-visual";

export function ProductCompare({ picks }: { picks: Recommendation[] }) {
  if (picks.length < 2) return null;

  const minPrice = Math.min(...picks.map((p) => p.sku.price));
  const maxRating = Math.max(...picks.map((p) => p.sku.rating ?? 0));

  const rows: { label: string; render: (p: Recommendation) => React.ReactNode }[] = [
    {
      label: "가격",
      render: (p) => (
        <span style={{ fontWeight: 800, color: p.sku.price === minPrice ? "var(--success)" : "var(--ink)" }}>
          {p.sku.price.toLocaleString()}원{p.sku.price === minPrice && picks.length > 1 ? " ↓" : ""}
        </span>
      ),
    },
    {
      label: "평점",
      render: (p) =>
        p.sku.rating ? (
          <span style={{ color: p.sku.rating === maxRating ? "var(--bronze)" : "var(--ink-soft)", fontWeight: p.sku.rating === maxRating ? 800 : 500 }}>
            ★ {p.sku.rating.toFixed(1)}
          </span>
        ) : (
          <span style={{ color: "var(--faint)" }}>—</span>
        ),
    },
    { label: "제형", render: (p) => <span style={{ color: "var(--ink-soft)" }}>{p.sku.texture ?? "—"}</span> },
    {
      label: "핵심 성분",
      render: (p) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {p.ingredientTags.slice(0, 3).map((t) => (
            <span key={t.name} style={miniTag}>{t.name}</span>
          ))}
        </div>
      ),
    },
    {
      label: "제외 성분 반영",
      render: (p) =>
        p.avoidedClear ? (
          <span style={{ color: "var(--success)", fontWeight: 700 }} aria-label="반영됨">✓ 반영</span>
        ) : (
          <span style={{ color: "var(--text-muted)" }} aria-label="미반영">— 확인 필요</span>
        ),
    },
  ];

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 340, fontSize: 12.5 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...cell, ...stickyCol, textAlign: "left" }} />
            {picks.map((p, i) => (
              <th scope="col" key={p.sku.id} style={{ ...cell, textAlign: "center", verticalAlign: "top" }}>
                <div style={{ width: 40, height: 40, margin: "0 auto 6px" }}>
                  <ProductVisual category={p.sku.category} brand={p.sku.brand} />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{i + 1}순위 · {p.sku.brand}</div>
                <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.25, marginTop: 2 }}>{p.sku.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" style={{ ...cell, ...stickyCol, textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>{row.label}</th>
              {picks.map((p) => (
                <td key={p.sku.id} style={{ ...cell, textAlign: "center" }}>{row.render(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cell: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
const stickyCol: React.CSSProperties = { position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, whiteSpace: "nowrap" };
const miniTag: React.CSSProperties = { fontSize: 10.5, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 5px" };
