"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, type Survey, type ScanReads, type RecoResult } from "@/lib/recommend";
import { recordPurchase } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";

// Plain-language explanation per read (heuristic, qualitative).
function explain(attr: "oil" | "pores" | "redness", value: string): string {
  const M: Record<string, string> = {
    "oil:거의 없음": "유분기가 거의 안 보여요.",
    "oil:살짝 있음": "T존에 윤기가 살짝 도네요.",
    "oil:있는 편": "T존 유분이 도드라지는 편이에요.",
    "pores:매끈한 편": "결이 비교적 매끈해요.",
    "pores:신경 쓰이는 정도": "모공·결이 조금 신경 쓰여요.",
    "pores:도드라짐": "모공·결이 도드라져 보여요.",
    "redness:거의 없음": "붉은기는 거의 없어요.",
    "redness:약간 보임": "볼 쪽에 옅은 붉은기가 있어요.",
    "redness:붉은기 있음": "볼 붉은기가 보이는 편이에요.",
  };
  return M[`${attr}:${value}`] ?? "";
}

export default function Report() {
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [result, setResult] = useState<RecoResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("gyeol_survey");
    if (!raw) {
      router.replace("/survey");
      return;
    }
    const s: Survey = JSON.parse(raw);
    let scan: ScanReads = null;
    let full: SkinReads | null = null;
    try {
      const sr = sessionStorage.getItem("gyeol_scan");
      if (sr) scan = JSON.parse(sr);
    } catch {}
    try {
      const fr = sessionStorage.getItem("gyeol_reads");
      if (fr) full = JSON.parse(fr);
    } catch {}
    const res = recommend(s, scan);
    setSurvey(s);
    setReads(full);
    setResult(res);

    // natural-language reasons (falls back to templates if no LLM key)
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
        setResult((prev) => (prev ? { ...prev, picks: prev.picks.map((p, i) => ({ ...p, reason: d.reasons![i] ?? p.reason })) } : prev));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!survey || !result) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  const top = result.picks[0];
  const concernText = survey.concerns.slice(0, 2).join("·") || `${survey.type} 피부`;
  const analysisRows = reads
    ? ([
        ["유분", reads.oil, explain("oil", reads.oil.value)],
        ["모공", reads.pores, explain("pores", reads.pores.value)],
        ["홍조", reads.redness, explain("redness", reads.redness.value)],
        ["전반", reads.overall, ""],
      ] as const)
    : [];

  return (
    <main className="min-h-screen px-5 pt-9" style={{ background: "var(--paper)", paddingBottom: 96 }}>
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <p style={eyebrow}>당신의 피부 리포트</p>
        <h1 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 30, lineHeight: 1.18, color: "var(--ink)", margin: "8px 0 6px", whiteSpace: "pre-line" }}>
          {reads ? reads.headline : `${survey.type} 피부를 위한 리포트`}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: reads?.narrative ? 14 : 28 }}>
          {reads ? "사진과 답변을 함께 읽었어요" : "답변을 바탕으로 정리했어요"}
        </p>
        {reads?.narrative && (
          <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 28 }}>{reads.narrative}</p>
        )}

        {/* ── 1. 피부 분석 ── */}
        {reads && (
          <section style={card}>
            <p style={sectionLabel}>피부 분석</p>
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 10 }}>
              {analysisRows.map(([label, read, note]) => (
                <div key={label} style={{ padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, color: "var(--ink)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: read.calm ? "var(--text-muted)" : "var(--plum)" }}>{read.value}</span>
                  </div>
                  {note && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>{note}</p>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
              * 사진 분석은 지금 대략적 신호예요(조명·화장에 흔들림). 더 정확한 분석으로 업그레이드 예정.
            </p>
          </section>
        )}

        {/* ── 2. 그래서 골랐어요 (bridge) ── */}
        <section style={{ margin: "30px 0 24px" }}>
          <p style={sectionLabel}>그래서 골랐어요</p>
          <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 8 }}>
            {survey.type} 피부 · {concernText} 고민에 맞춰, {Math.round(survey.budget / 10000)}만원대에서
            {survey.avoid.length ? ` ${survey.avoid.join("·")} 없이 ` : " "}
            실패 없을 {survey.category} 셋을 골랐어요.
          </p>
        </section>

        {result.note && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 24 }}>{result.note}</p>
        )}

        {/* ── 3. 추천 ── */}
        {result.picks.map((p, i) => (
          <div key={p.sku.id}>
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
              {p.avoidedClear && survey.avoid.length > 0 && <span style={{ color: "var(--success)", fontSize: 12.5, fontWeight: 600 }}>회피 성분 없음 ✓</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFeatureSettings: '"tnum"', fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{p.sku.price.toLocaleString()}원</span>
              <a href={p.sku.buyUrl} onClick={() => recordPurchase({ sku_id: p.sku.id, name: p.sku.name, price: p.sku.price })} style={{ fontSize: 13, color: "var(--plum)", textDecoration: "none" }}>보러가기 →</a>
            </div>
            {i < result.picks.length - 1 && <div style={{ height: 1, background: "var(--line)", margin: "34px 0" }} />}
          </div>
        ))}
      </div>

      {/* sticky buy bar */}
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

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 600 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 600 };
const tag: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 600 };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 20px 18px" };
