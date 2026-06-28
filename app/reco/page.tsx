"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, type Survey, type ScanReads, type RecoResult } from "@/lib/recommend";
import { recordPurchase } from "@/lib/store";

export default function Reco() {
  const router = useRouter();
  const [result, setResult] = useState<RecoResult | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("gyeol_survey");
    if (!raw) {
      router.replace("/survey");
      return;
    }
    const s: Survey = JSON.parse(raw);
    let scan: ScanReads = null;
    try {
      const sr = sessionStorage.getItem("gyeol_scan");
      if (sr) scan = JSON.parse(sr);
    } catch {}
    const res = recommend(s, scan);
    setSurvey(s);
    setResult(res);

    // ① natural-language reasons (falls back to templates if no LLM key)
    let cancelled = false;
    const items = res.picks.map((p) => ({
      brand: p.sku.brand,
      name: p.sku.name,
      category: p.sku.category,
      type: s.type,
      matched: s.concerns.filter((c) => p.sku.concerns.includes(c)),
      budgetText: `${Math.round(s.budget / 10000)}만원대`,
      freeOf: p.sku.freeOf,
      fallback: p.reason,
    }));
    fetch("/api/reason", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) })
      .then((r) => r.json())
      .then((d: { reasons?: string[] }) => {
        if (cancelled || !d?.reasons) return;
        setResult((prev) =>
          prev ? { ...prev, picks: prev.picks.map((p, i) => ({ ...p, reason: d.reasons![i] ?? p.reason })) } : prev
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!result || !survey) {
    return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;
  }

  const top = result.picks[0];
  const criteria = [survey.type, ...survey.concerns.slice(0, 2), `${Math.round(survey.budget / 10000)}만원대`].join(" · ");

  return (
    <main className="min-h-screen px-5 pt-9" style={{ background: "var(--paper)", paddingBottom: 92 }}>
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <p style={eyebrow}>당신을 위해 고른 셋</p>
        <h1 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.2, color: "var(--ink)", margin: "8px 0 6px" }}>
          실패 없는 {survey.category} 한 줄
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 30 }}>{criteria} 기준</p>

        {result.note && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 24 }}>
            {result.note}
          </p>
        )}

        {result.picks.map((p, i) => (
          <div key={p.sku.id}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ width: "100%", height: 150, borderRadius: 12, background: "var(--surface-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 13, color: "var(--faint)" }}>{p.sku.category} 이미지</span>
              </div>
              <div style={tag}>{p.toneLabel} · {p.sku.category}</div>
              <div style={{ fontFamily: "var(--font-serif, serif)", fontSize: 21, fontWeight: 500, color: "var(--ink)", margin: "8px 0 9px" }}>
                <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 400 }}>{p.sku.brand} </span>
                {p.sku.name}
              </div>
              <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.55 }}>{p.reason}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginBottom: 14 }}>
                {p.matchedIngredients.map((ing) => (
                  <span key={ing} style={{ background: "var(--plum-soft)", color: "var(--plum)", fontSize: 12, borderRadius: 9999, padding: "4px 11px" }}>{ing} 함유</span>
                ))}
                {p.avoidedClear && survey.avoid.length > 0 && (
                  <span style={{ color: "var(--success)", fontSize: 12.5, fontWeight: 600 }}>회피 성분 없음 ✓</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFeatureSettings: '"tnum"', fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                  {p.sku.price.toLocaleString()}원
                </span>
                <a href={p.sku.buyUrl} onClick={() => recordPurchase({ sku_id: p.sku.id, name: p.sku.name, price: p.sku.price })} style={{ fontSize: 13, color: "var(--plum)", textDecoration: "none" }}>보러가기 →</a>
              </div>
            </div>
            {i < result.picks.length - 1 && <div style={{ height: 1, background: "var(--line)", margin: "34px 0" }} />}
          </div>
        ))}
      </div>

      {/* sticky buy bar — 올리브영's front-and-center CTA lesson */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "12px 16px", boxShadow: "0 -8px 24px rgba(40,30,20,.06)" }}>
        <div className="mx-auto" style={{ maxWidth: 400, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
            {top.sku.price.toLocaleString()}원
            <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>{top.sku.name}</span>
          </div>
          <a href={top.sku.buyUrl} onClick={() => recordPurchase({ sku_id: top.sku.id, name: top.sku.name, price: top.sku.price })} style={{ background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "14px 22px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
            구매하러 가기
          </a>
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 600,
};
const tag: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 600,
};
