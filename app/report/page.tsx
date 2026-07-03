"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { budgetLabel, recommend, type RecoResult, type RoutineStep, type ScanReads, type Survey } from "@/lib/recommend";
import { recordPurchase } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";
import { FlowSteps } from "@/app/components/flow-steps";

function explain(attr: "oil" | "pores" | "redness", value: string): string {
  const messages: Record<string, string> = {
    "oil:유분 적음": "T존의 번들거림은 차분한 편이에요.",
    "oil:유분 약간": "T존에 은은한 유분감이 보여요.",
    "oil:유분 많음": "T존의 윤기가 비교적 도드라져 보여요.",
    "pores:결 매끈": "볼 쪽 결은 비교적 매끈해 보여요.",
    "pores:결 약간 보임": "볼 쪽 결이 조금 보이는 편이에요.",
    "pores:결 뚜렷": "볼 쪽 모공과 결이 도드라져 보여요.",
    "redness:붉은기 낮음": "붉은기는 낮게 보여요.",
    "redness:붉은기 약간": "볼 쪽에 옅은 붉은기가 있어요.",
    "redness:붉은기 뚜렷": "볼 쪽 붉은기가 눈에 띄는 편이에요.",
  };
  return messages[`${attr}:${value}`] ?? "";
}

type InitialView = { survey: Survey; reads: SkinReads | null; result: RecoResult };

function loadInitialView(): InitialView | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("gyeol_survey");
  if (!raw) return null;

  const survey: Survey = JSON.parse(raw);
  let scan: ScanReads = null;
  let reads: SkinReads | null = null;
  try {
    const scanRaw = sessionStorage.getItem("gyeol_scan");
    if (scanRaw) scan = JSON.parse(scanRaw);
  } catch {}
  try {
    const readsRaw = sessionStorage.getItem("gyeol_reads");
    if (readsRaw) reads = JSON.parse(readsRaw);
  } catch {}

  return { survey, reads, result: recommend(survey, scan) };
}

export default function Report() {
  const router = useRouter();
  const [initial, setInitial] = useState<InitialView | null>(null);
  const [result, setResult] = useState<RecoResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // sessionStorage is client-only; reading it during the first render caused
    // an SSR hydration mismatch (React #418), so load after mount instead.
    /* eslint-disable react-hooks/set-state-in-effect */
    const next = loadInitialView();
    setInitial(next);
    setResult(next?.result ?? null);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!initial) {
      router.replace("/survey");
      return;
    }

    let cancelled = false;
    const items = initial.result.picks.map((pick) => ({
      brand: pick.sku.brand,
      name: pick.sku.name,
      category: pick.sku.category,
      type: initial.survey.type,
      matched: initial.survey.concerns.filter((concern) => pick.sku.concerns.includes(concern)),
      budgetText: budgetLabel(initial.survey.budget),
      freeOf: pick.sku.freeOf,
      fallback: pick.reason,
    }));

    fetch("/api/reason", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) })
      .then((response) => response.json())
      .then((data: { reasons?: string[] }) => {
        if (cancelled || !data?.reasons) return;
        setResult((prev) =>
          prev ? { ...prev, picks: prev.picks.map((pick, i) => ({ ...pick, reason: data.reasons?.[i] ?? pick.reason })) } : prev
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [loaded, initial, router]);

  if (!initial || !result) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  const { survey, reads } = initial;
  const top = result.picks[0];
  const topCommerce = top ? primaryCommerceLink(top.sku) : null;
  const concernText = survey.concerns.slice(0, 2).join("·") || `${survey.type} 피부`;
  const analysisRows = reads
    ? ([
        ["유분", reads.oil, explain("oil", reads.oil.value)] as [string, { value: string; calm?: boolean }, string],
        ["모공/결", reads.pores, explain("pores", reads.pores.value)] as [string, { value: string; calm?: boolean }, string],
        ["붉은기", reads.redness, explain("redness", reads.redness.value)] as [string, { value: string; calm?: boolean }, string],
        ["전반", reads.overall, ""] as [string, { value: string; calm?: boolean }, string],
        ...(reads.extras ?? []).map(
          (extra) => [extra.label, { value: extra.value, calm: extra.calm }, extra.note] as [string, { value: string; calm?: boolean }, string]
        ),
      ])
    : [];

  return (
    <main className="min-h-screen px-5 pt-9" style={{ background: "var(--paper)", paddingBottom: 112 }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p style={eyebrow}>피부 리포트</p>
            <FlowSteps current="report" />
            <h1 style={headlineStyle}>{reads ? reads.headline : `${survey.type} 피부를 위한 리포트`}</h1>
          </div>
          <Xiaohei size={60} pose="magnify" />
        </div>
        <p style={subStyle}>{reads ? "사진과 설문을 함께 읽었어요." : "설문 답변을 바탕으로 정리했어요."}</p>
        {reads?.narrative && <p style={narrativeStyle}>{reads.narrative}</p>}
        {reads && <ConfidenceBridge reads={reads} scanApplied={result.scanApplied} />}

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
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>참고용 분석이며 조명과 각도에 따라 달라질 수 있어요.</p>
          </section>
        )}

        <section style={{ margin: "30px 0 24px" }}>
          <p style={sectionLabel}>추천 기준</p>
          <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 8 }}>
            {survey.type} 피부, {concernText} 고민, {budgetLabel(survey.budget)} 예산에 맞춰 {survey.category}를 골랐어요.
          </p>
        </section>

        <section style={card}>
          <p style={sectionLabel}>오늘의 루틴</p>
          <RoutineHalf label="아침" steps={result.routine.am} />
          <RoutineHalf label="저녁" steps={result.routine.pm} />
        </section>

        <section style={careCard}>
          <p style={sectionLabel}>후속 연결</p>
          <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 21, color: "var(--ink)", margin: "8px 0 6px" }}>
            구매와 상담까지 이어볼까요?
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            추천 제품 검색, 국내 구매처, 외국인용 검색, 근처 피부과 찾기를 한 화면에서 연결해요.
          </p>
          <Link href="/care" style={careBtn}>구매/상담 연결 보기</Link>
        </section>

        {result.note && <p style={noteStyle}>{result.note}</p>}
        <p style={{ ...sectionLabel, marginBottom: 14 }}>추천 제품</p>
        {result.picks.map((pick, i) => (
          <ProductBlock key={pick.sku.id} pick={pick} last={i === result.picks.length - 1} />
        ))}
      </div>

      {top && (
        <div style={stickyBar}>
          <div className="mx-auto" style={{ maxWidth: 420, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <a
              href={topCommerce ? commerceOutHref(top.sku.id, topCommerce.merchant, "report_sticky") : top.sku.buyUrl}
              onClick={() => recordPurchase({ sku_id: top.sku.id, name: top.sku.name, price: top.sku.price })}
              style={buyBtn}
            >
              {topCommerce ? `${topCommerce.label} 보기` : "바로 검색"}
            </a>
            <Link href="/care" style={stickyCareBtn}>구매/상담 연결</Link>
          </div>
        </div>
      )}
    </main>
  );
}

function RoutineHalf({ label, steps }: { label: string; steps: RoutineStep[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <p style={routineHalfLabel}>{label}</p>
      <div style={{ display: "grid", gap: 12 }}>
        {steps.map((step, index) => (
          <div key={step.id} style={routineStep}>
            <span style={routineIndex}>{index + 1}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={routineTitle}>{step.title}</h2>
                {step.cadence && <span style={cadenceChip}>{step.cadence}</span>}
              </div>
              <p style={routineBody}>{step.body}</p>
              <p style={routineWhy}>{step.why}</p>
              {step.heroSku && <p style={routineProduct}>{step.heroSku.brand} {step.heroSku.name}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductBlock({ pick, last }: { pick: RecoResult["picks"][number]; last: boolean }) {
  const commerce = primaryCommerceLink(pick.sku);
  return (
    <div>
      <div style={imageBox}><span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 13, color: "var(--faint)" }}>{pick.sku.category}</span></div>
      <div style={tag}>{pick.toneLabel} · {pick.sku.category}</div>
      <div style={{ fontFamily: "var(--font-ko-serif)", fontSize: 21, color: "var(--ink)", margin: "8px 0 9px" }}>
        <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 500 }}>{pick.sku.brand} </span>
        {pick.sku.name}
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.55 }}>{pick.reason}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginBottom: 14 }}>
        {pick.matchedIngredients.map((ingredient) => (
          <span key={ingredient} style={pill}>{ingredient}</span>
        ))}
        {pick.avoidedClear && <span style={{ color: "var(--success)", fontSize: 12.5, fontWeight: 700 }}>피하고 싶은 성분 반영</span>}
      </div>
      {pick.watchOut && <p style={watchOutStyle}>{pick.watchOut}</p>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFeatureSettings: '"tnum"', fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{pick.sku.price.toLocaleString()}원</span>
        <a
          href={commerceOutHref(pick.sku.id, commerce.merchant, "report_product")}
          onClick={() => recordPurchase({ sku_id: pick.sku.id, name: pick.sku.name, price: pick.sku.price })}
          style={{ fontSize: 13, color: "var(--plum)", textDecoration: "none", fontWeight: 700 }}
        >
          {commerce.label}에서 보기
        </a>
      </div>
      {!last && <div style={{ height: 1, background: "var(--line)", margin: "34px 0" }} />}
    </div>
  );
}

function ConfidenceBridge({ reads, scanApplied }: { reads: SkinReads; scanApplied: boolean }) {
  const pct = Math.round(reads.confidence * 100);
  return (
    <section style={confidenceCard(reads.retakeRecommended)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <p style={sectionLabel}>분석 신뢰도</p>
        <strong style={{ fontFeatureSettings: '"tnum"', fontSize: 20, color: "var(--ink)" }}>{pct}%</strong>
      </div>
      <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 20, color: "var(--ink)", margin: "6px 0" }}>
        {scanApplied ? "스캔 신호를 추천에 반영했어요" : "이번 추천은 설문을 더 크게 반영했어요"}
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
        {scanApplied
          ? "조명과 얼굴 위치가 충분해서 유분, 붉은기, 피부결 신호를 제품 선택에 함께 사용했어요."
          : "촬영 조건이 애매한 부분이 있어 스캔 결과는 참고만 하고, 사용자가 답한 고민과 예산을 우선했어요."}
      </p>
      {reads.retakeReasons.length > 0 && (
        <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
          {reads.retakeReasons.map((reason) => (
            <span key={reason} style={{ fontSize: 12.5, color: "var(--plum-press)" }}>{reason}</span>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 10 }}>
        의료 진단이 아니라 사진에서 보이는 피부 신호 기반의 화장품 추천입니다.
      </p>
    </section>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const tag: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const headlineStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 30, lineHeight: 1.18, color: "var(--ink)", margin: "8px 0 6px", whiteSpace: "pre-line" };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: "var(--text-muted)", marginBottom: 14 };
const narrativeStyle: React.CSSProperties = { fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 28 };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "20px 20px 18px" };
const careCard: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "20px 20px 18px", margin: "24px 0 28px" };
const careBtn: React.CSSProperties = { display: "block", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const noteStyle: React.CSSProperties = { fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 24 };
const imageBox: React.CSSProperties = { width: "100%", height: 150, borderRadius: 8, background: "var(--surface-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 };
const pill: React.CSSProperties = { background: "transparent", border: "1px solid var(--line)", color: "var(--ink-soft)", fontSize: 12, borderRadius: 8, padding: "4px 10px", fontWeight: 700 };
const watchOutStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--plum-press)", background: "var(--plum-soft)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 10px", lineHeight: 1.45, marginBottom: 12 };
const routineHalfLabel: React.CSSProperties = { fontFamily: "var(--font-hand)", fontSize: 21, lineHeight: 1, color: "var(--ink)", marginBottom: 10 };
const routineStep: React.CSSProperties = { display: "grid", gridTemplateColumns: "30px 1fr", gap: 12, alignItems: "start", borderTop: "1px solid var(--line)", paddingTop: 12 };
const routineWhy: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4 };
const cadenceChip: React.CSSProperties = { fontSize: 11, border: "1px solid var(--line)", color: "var(--bronze)", borderRadius: 999, padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap" };
const routineIndex: React.CSSProperties = { width: 28, height: 28, borderRadius: 999, background: "var(--paper)", border: "1.5px solid var(--ink)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 };
const routineTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 };
const routineBody: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 };
const routineProduct: React.CSSProperties = { fontSize: 12.5, color: "var(--ink)", fontWeight: 800, marginTop: 6 };
const stickyBar: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "12px 16px" };
const buyBtn: React.CSSProperties = { flex: 1, background: "var(--surface-tint)", color: "var(--ink)", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", whiteSpace: "nowrap" };
const stickyCareBtn: React.CSSProperties = { flex: 1.3, background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", whiteSpace: "nowrap" };

function confidenceCard(retake: boolean): React.CSSProperties {
  return {
    background: retake ? "var(--plum-soft)" : "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "18px 18px 16px",
    marginBottom: 18,
  };
}
