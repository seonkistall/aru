"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, type Survey, type ScanReads, type RecoResult } from "@/lib/recommend";
import { recordPurchase } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";
import { Xiaohei, SketchBox } from "../components/sketch";

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

  if (!survey || !result) return <main style={{ minHeight: "100vh", background: "#fff" }} />;

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
    <main className="min-h-screen px-5 pt-9" style={{ background: "#fff", color: "var(--ink)", paddingBottom: 96 }}>
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
          <SketchBox style={{ padding: "20px 20px 18px", marginBottom: 30 }}>
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
          </SketchBox>
        )}

        {/* ── 2. 그래서 골랐어요 (bridge) ── */}
        <section style={{ margin: "30px 0 24px" }}>
          <div className="flex items-center justify-between">
            <p style={sectionLabel}>그래서 골랐어요</p>
            <Xiaohei size={58} pose="funnel" />
          </div>
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
            <SketchBox style={{ height: 178, marginBottom: 16 }}>
              <div className="flex flex-col items-center justify-center" style={{ height: 178 }}>
                <Xiaohei size={98} pose="carry" />
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 18, color: "var(--muted)", marginTop: 2 }}>{p.sku.brand}</span>
              </div>
            </SketchBox>
            <div style={tag}>{p.toneLabel} · {p.sku.category}</div>
            <div style={{ fontFamily: "var(--font-ko-serif)", fontSize: 25, color: "var(--ink)", margin: "4px 0 9px", lineHeight: 1.15 }}>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>{p.sku.brand} </span>
              {p.sku.name}
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.55 }}>{p.reason}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginBottom: 14 }}>
              {p.matchedIngredients.map((ing) => (
                <span key={ing} style={{ fontFamily: "var(--font-hand)", fontSize: 17, lineHeight: 1.1, color: "var(--ink)", border: "1.6px solid var(--ink)", borderRadius: 4, padding: "2px 11px" }}>{ing} 함유</span>
              ))}
              {p.avoidedClear && survey.avoid.length > 0 && <span style={{ fontFamily: "var(--font-hand)", fontSize: 18, color: "var(--success)" }}>회피 성분 없음 ✓</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 25, color: "var(--ink)" }}>{p.sku.price.toLocaleString()}원</span>
              <a href={p.sku.buyUrl} onClick={() => recordPurchase({ sku_id: p.sku.id, name: p.sku.name, price: p.sku.price })} style={{ fontFamily: "var(--font-hand)", fontSize: 21, color: "var(--ink)", textDecoration: "none" }}>보러가기 <span style={{ color: "var(--orange)" }}>→</span></a>
            </div>
            {i < result.picks.length - 1 && <div style={{ height: 1, background: "var(--line)", margin: "34px 0" }} />}
          </div>
        ))}
      </div>

      {/* sticky buy bar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1.5px solid var(--ink)", padding: "11px 16px" }}>
        <div className="mx-auto" style={{ maxWidth: 400, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--ink)", lineHeight: 1 }}>
            {top.sku.price.toLocaleString()}원
            <span style={{ display: "block", fontSize: 16, color: "var(--muted)" }}>{top.sku.name}</span>
          </div>
          <a href={top.sku.buyUrl} onClick={() => recordPurchase({ sku_id: top.sku.id, name: top.sku.name, price: top.sku.price })} style={{ textDecoration: "none" }}>
            <SketchBox filled color="var(--ink)" style={{ padding: "11px 22px" }}>
              <span className="flex items-center" style={{ gap: 8 }}>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 23, color: "#fff" }}>구매하러 가기</span>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 23, color: "var(--orange)" }}>→</span>
              </span>
            </SketchBox>
          </a>
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontFamily: "var(--font-hand)", fontSize: 20, color: "var(--muted)" };
const sectionLabel: React.CSSProperties = { fontFamily: "var(--font-hand)", fontSize: 23, color: "var(--ink)" };
const tag: React.CSSProperties = { fontFamily: "var(--font-hand)", fontSize: 18, color: "var(--plum)" };
