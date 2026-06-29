"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, type RecoResult, type ScanReads, type Survey } from "@/lib/recommend";
import { recordPurchase } from "@/lib/store";

export default function Reco() {
  const router = useRouter();
  const [view] = useState<{ survey: Survey; result: RecoResult } | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("gyeol_survey");
    if (!raw) return null;
    const parsedSurvey: Survey = JSON.parse(raw);
    let scan: ScanReads = null;
    try {
      const sr = sessionStorage.getItem("gyeol_scan");
      if (sr) scan = JSON.parse(sr);
    } catch {}
    return { survey: parsedSurvey, result: recommend(parsedSurvey, scan) };
  });

  useEffect(() => {
    if (!view) router.replace("/survey");
  }, [router, view]);

  if (!view) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  const { survey, result } = view;

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>추천 결과</p>
        <h1 style={titleStyle}>{survey.category} 추천</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 28 }}>
          {survey.type} 피부와 {Math.round(survey.budget / 10000)}만원대 예산을 기준으로 골랐어요.
        </p>
        {result.picks.map((pick, i) => (
          <div key={pick.sku.id}>
            <div style={tag}>{pick.toneLabel} · {pick.sku.category}</div>
            <h2 style={productName}><span style={{ color: "var(--muted)", fontSize: 14 }}>{pick.sku.brand} </span>{pick.sku.name}</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 12 }}>{pick.reason}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontFeatureSettings: '"tnum"', color: "var(--ink)" }}>{pick.sku.price.toLocaleString()}원</strong>
              <a href={pick.sku.buyUrl} onClick={() => recordPurchase({ sku_id: pick.sku.id, name: pick.sku.name, price: pick.sku.price })} style={linkStyle}>보러가기</a>
            </div>
            {i < result.picks.length - 1 && <div style={{ height: 1, background: "var(--line)", margin: "28px 0" }} />}
          </div>
        ))}
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 30, color: "var(--ink)", margin: "8px 0 6px" };
const tag: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const productName: React.CSSProperties = { fontFamily: "var(--font-serif, serif)", fontSize: 21, fontWeight: 600, color: "var(--ink)", margin: "8px 0 9px" };
const linkStyle: React.CSSProperties = { fontSize: 13, color: "var(--plum)", textDecoration: "none", fontWeight: 700 };
