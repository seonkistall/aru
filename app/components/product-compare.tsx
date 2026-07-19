"use client";

// Side-by-side comparison of stable catalog facts. Horizontal-scrolls on narrow
// screens; live price, option, and ingredient changes are verified at merchant.
import type { Recommendation } from "@/lib/recommend";
import { budgetBand } from "@/lib/skus";
import { ProductVisual } from "./product-visual";
import { t } from "@/lib/i18n/core";

export function ProductCompare({ picks }: { picks: Recommendation[] }) {
  if (picks.length < 2) return null;

  const rows: { label: string; render: (p: Recommendation) => React.ReactNode }[] = [
    {
      label: t("예산대"),
      render: (p) => <span style={{ fontWeight: 800, color: "var(--ink)" }}>{t(budgetBand(p.sku.price))}</span>,
    },
    {
      label: t("용량"),
      render: (p) => <span style={{ color: "var(--ink-soft)" }}>{p.sku.volume ?? "—"}</span>,
    },
    { label: t("제형"), render: (p) => <span style={{ color: "var(--ink-soft)" }}>{p.sku.texture ? t(p.sku.texture) : "—"}</span> },
    {
      label: t("핵심 성분"),
      render: (p) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {p.ingredientTags.slice(0, 3).map((tag) => (
            <span key={tag.name} style={miniTag}>{t(tag.name)}</span>
          ))}
        </div>
      ),
    },
    {
      label: t("제외 성분 반영"),
      render: (p) =>
        p.avoidedClear ? (
          <span style={{ color: "var(--success)", fontWeight: 700 }} aria-label={t("반영됨")}>{t("✓ 반영")}</span>
        ) : (
          <span style={{ color: "var(--text-muted)" }} aria-label={t("미반영")}>{t("— 확인 필요")}</span>
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
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{t("{rank}순위", { rank: i + 1 })} · {t(p.sku.brand)}</div>
                <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.25, marginTop: 2 }}>{t(p.sku.name)}</div>
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
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45, margin: "10px 8px 0" }}>
        {t("현재 가격, 옵션, 전성분은 판매처에서 다시 확인해 주세요.")}
      </p>
    </div>
  );
}

const cell: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
const stickyCol: React.CSSProperties = { position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, whiteSpace: "nowrap" };
const miniTag: React.CSSProperties = { fontSize: 10.5, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 5px" };
