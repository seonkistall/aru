"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { budgetLabel, recommend, type RecoResult, type RoutineStep, type ScanReads, type Survey } from "@/lib/recommend";
import { recordFunnelEvent } from "@/lib/funnel";
import { loadLastResult, saveLastResult } from "@/lib/last-result";
import { recordPurchase } from "@/lib/store";
import { ProductCard } from "@/app/components/product-card";
import { ProductCompare } from "@/app/components/product-compare";
import { RoutineReminder } from "@/app/components/routine-reminder";
import { ScanHistoryStrip } from "@/app/components/scan-history-strip";
import { localizedNarrative, type SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";
import { FlowSteps } from "@/app/components/flow-steps";
import { ReengageOptIn } from "@/app/components/reengage-optin";
import { buildReportTrust } from "@/lib/report-trust";
import { getLang, t } from "@/lib/i18n/core";

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

function scanSignalText(reads: SkinReads): string {
  const parts: string[] = [];
  if (reads.oil.level >= 1) parts.push(t("T존 유분"));
  if (reads.redness.level >= 1) parts.push(t("볼 붉은기"));
  if (reads.pores.level >= 1) parts.push(t("모공·결"));
  return parts.length ? parts.join("·") : t("전반적으로 안정적인");
}

function Block({ h, w = "100%", r = 8, mt = 0 }: { h: number; w?: number | string; r?: number; mt?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: "var(--surface-tint)", marginTop: mt }} />;
}

function ReportSkeleton() {
  return (
    <main className="px-5 pt-9" style={{ background: "var(--paper)", minHeight: "100dvh" }}>
      <div className="mx-auto" style={{ maxWidth: 420, opacity: 0.7 }}>
        <Block h={12} w={80} />
        <Block h={34} w="85%" mt={14} />
        <Block h={16} w="60%" mt={12} />
        <Block h={92} r={12} mt={22} />
        <Block h={150} r={8} mt={22} />
        <Block h={120} r={8} mt={22} />
        <Block h={88} r={12} mt={22} />
        <Block h={88} r={12} mt={12} />
      </div>
    </main>
  );
}

type InitialView = { survey: Survey; reads: SkinReads | null; result: RecoResult };

function loadInitialView(): InitialView | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("gyeol_survey");
  if (!raw) {
    // Fresh tab session: fall back to the last saved result so a returning
    // visitor re-enters their report instead of being bounced to the survey.
    const saved = loadLastResult();
    if (!saved) return null;
    return { survey: saved.survey, reads: saved.reads ?? null, result: recommend(saved.survey, saved.scan ?? null) };
  }

  let survey: Survey;
  try {
    survey = JSON.parse(raw);
  } catch {
    return null;
  }
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

  // Mirror the inputs so this report survives the tab session (MAU re-entry).
  saveLastResult({ survey, scan, reads, ts: Date.now() });
  return { survey, reads, result: recommend(survey, scan) };
}

type ReportStep = "analysis" | "picks" | "routine";

export default function Report() {
  const router = useRouter();
  const [initial, setInitial] = useState<InitialView | null>(null);
  const [result, setResult] = useState<RecoResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // sessionStorage is client-only; reading it during the first render caused
    // an SSR hydration mismatch (React #418), so load after mount instead.
    /* eslint-disable react-hooks/set-state-in-effect */
    const next = loadInitialView();
    setInitial(next);
    setResult(next?.result ?? null);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (next) recordFunnelEvent("reco_viewed", { scanApplied: next.result.scanApplied, picks: next.result.picks.length });
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

    fetch("/api/reason", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, lang: getLang() }) })
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

  if (!loaded) return <ReportSkeleton />;
  if (!initial || !result) return <main style={{ minHeight: "100dvh", background: "var(--paper)" }} />;

  const { survey, reads } = initial;
  // One screen per stage instead of one long page: analysis → picks → routine
  // & follow-up. Survey-only visitors (no scan) start at picks.
  const steps: ReportStep[] = reads ? ["analysis", "picks", "routine"] : ["picks", "routine"];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const stepTitles: Record<ReportStep, string> = {
    analysis: t("피부 분석"),
    picks: t("추천 제품"),
    routine: t("오늘의 루틴"),
  };
  const goStep = (next: number) => {
    setStepIndex(Math.max(0, Math.min(steps.length - 1, next)));
    window.scrollTo({ top: 0 });
  };
  const top = result.picks[0];
  const topCommerce = top ? primaryCommerceLink(top.sku) : null;
  const concernText = survey.concerns.slice(0, 2).map((concern) => t(concern)).join("·") || t("{type} 피부", { type: t(survey.type) });
  const analysisRows = reads
    ? ([
        [t("유분"), reads.oil, explain("oil", reads.oil.value)] as [string, { value: string; calm?: boolean }, string],
        [t("모공/결"), reads.pores, explain("pores", reads.pores.value)] as [string, { value: string; calm?: boolean }, string],
        [t("붉은기"), reads.redness, explain("redness", reads.redness.value)] as [string, { value: string; calm?: boolean }, string],
        [t("전반"), reads.overall, ""] as [string, { value: string; calm?: boolean }, string],
        ...(reads.extras ?? []).map(
          (extra) => [t(extra.label), { value: extra.value, calm: extra.calm }, extra.note] as [string, { value: string; calm?: boolean }, string]
        ),
      ])
    : [];

  return (
    <main className="px-5 pt-9" style={{ background: "var(--paper)", minHeight: "100dvh", paddingBottom: 112 }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p style={eyebrow}>{t("피부 리포트")}</p>
            <FlowSteps current="report" />
            <h1 style={headlineStyle}>
              {stepIndex === 0 ? (reads ? t(reads.headline) : t("{type} 피부를 위한 리포트", { type: t(survey.type) })) : stepTitles[step]}
            </h1>
          </div>
          <Xiaohei size={60} pose="magnify" />
        </div>
        <div style={stepTabs} role="tablist" aria-label={t("진행 단계")}>
          {steps.map((s, i) => (
            <button key={s} type="button" role="tab" aria-selected={i === stepIndex} onClick={() => goStep(i)} style={stepTab(i === stepIndex, i < stepIndex)}>
              {i + 1}. {stepTitles[s]}
            </button>
          ))}
        </div>
        {stepIndex === 0 && (
          <p style={subStyle}>{reads ? t("사진과 설문을 함께 읽었어요.") : t("설문 답변을 바탕으로 정리했어요.")}</p>
        )}
        {step === "analysis" && reads?.narrative && <p style={narrativeStyle}>{localizedNarrative(reads)}</p>}
        {step === "analysis" && reads && <ConfidenceBridge reads={reads} scanApplied={result.scanApplied} />}

        {step === "analysis" && <ScanHistoryStrip />}

        {step === "analysis" && reads && (
          <section style={card}>
            <h2 style={sectionLabel}>{t("피부 분석")}</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
              {result.scanApplied
                ? t("촬영한 사진의 T존·양볼 신호를 설문 답변과 함께 읽었어요. 아래는 당신의 스캔 결과예요.")
                : t("촬영 신뢰도가 낮아 스캔은 참고만 하고, 설문 답변을 중심으로 정리했어요.")}
            </p>
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12 }}>
              {analysisRows.map(([label, read, note]) => (
                <div key={label} style={{ padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, color: "var(--ink)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: read.calm ? "var(--text-muted)" : "var(--plum)" }}>{t(read.value)}</span>
                  </div>
                  {note && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>{t(note)}</p>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>{t("참고용 분석이며 조명과 각도에 따라 달라질 수 있어요.")}</p>
          </section>
        )}

        {step === "picks" && (
        <section style={{ margin: "30px 0 24px" }}>
          <h2 style={sectionLabel}>{t("추천 기준")}</h2>
          <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 8 }}>
            {t("{type} 피부, {concerns} 고민, {budget} 예산에 맞춰 {category}를 골랐어요.", {
              type: t(survey.type),
              concerns: concernText,
              budget: t(budgetLabel(survey.budget)),
              category: t(survey.category),
            })}
            {result.scanApplied && reads ? ` ${t("스캔에서 보인 {signals} 신호도 함께 반영했어요.", { signals: scanSignalText(reads) })}` : ""}
          </p>
          {survey.avoid.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{t("제외 요청: {list}", { list: survey.avoid.map((item) => t(item)).join(" · ") })}</p>
          )}
        </section>
        )}

        {step === "routine" && (
        <details open style={card}>
          <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", listStyle: "none" }}>
            <h2 style={sectionLabel}>{t("오늘의 루틴")}</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("아침 {am} · 저녁 {pm}단계", { am: result.routine.am.length, pm: result.routine.pm.length })}</span>
          </summary>
          <div style={{ marginTop: 6 }}>
            <RoutineHalf label={t("아침")} steps={result.routine.am} />
            <RoutineHalf label={t("저녁")} steps={result.routine.pm} />
            <RoutineReminder label={t("{type} · {category} 루틴", { type: t(survey.type), category: t(survey.category) })} />
          </div>
        </details>
        )}

        {step === "routine" && (
        <section style={careCard}>
          <p style={sectionLabel}>{t("후속 연결")}</p>
          <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 21, color: "var(--ink)", margin: "8px 0 6px" }}>
            {t("구매와 상담까지 이어볼까요?")}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            {t("추천 제품 검색, 국내 구매처, 외국인용 검색, 근처 피부과 찾기를 한 화면에서 연결해요.")}
          </p>
          <Link href="/care" style={careBtn}>{t("구매/상담 연결 보기")}</Link>
          <Link
            href="/studio"
            style={{ display: "block", marginTop: 10, fontSize: 13, color: "var(--text-muted)", textDecoration: "underline", textAlign: "center" }}
          >
            {t("내 피부 카드 만들어 공유하기")}
          </Link>
          <ReengageOptIn context={`${t(survey.type)}·${t(survey.category)}`} />
        </section>
        )}

        {step === "picks" && (
          <>
            {result.note && <p style={noteStyle}>{t(result.note)}</p>}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ ...sectionLabel, marginBottom: 0 }}>{t("추천 제품")}</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("{category} · {n}개", { category: t(survey.category), n: result.picks.length })}</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {result.picks.map((pick, i) => (
                <ProductCard key={pick.sku.id} pick={pick} placement="report_product" rank={i + 1} />
              ))}
            </div>

            {result.picks.length >= 2 && (
              <details style={{ ...card, marginTop: 16 }}>
                <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", listStyle: "none" }}>
                  <span style={sectionLabel}>{t("추천 제품 비교")}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("가격·평점·성분 한눈에")}</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <ProductCompare picks={result.picks} />
                </div>
              </details>
            )}
          </>
        )}

        <div style={stepNav}>
          {stepIndex > 0 ? (
            <button type="button" onClick={() => goStep(stepIndex - 1)} style={stepNavBtn(false)}>
              ← {t("이전")}
            </button>
          ) : (
            <span />
          )}
          {stepIndex < steps.length - 1 && (
            <button type="button" onClick={() => goStep(stepIndex + 1)} style={stepNavBtn(true)}>
              {t("다음")}: {stepTitles[steps[stepIndex + 1]]} →
            </button>
          )}
        </div>
      </div>

      {top && step === "picks" && (
        <div style={stickyBar}>
          <div className="mx-auto" style={{ maxWidth: 420, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <a
              href={topCommerce ? commerceOutHref(top.sku.id, topCommerce.merchant, "report_sticky") : top.sku.buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                recordPurchase({ sku_id: top.sku.id, name: top.sku.name, price: top.sku.price });
                recordFunnelEvent("commerce_clicked", { placement: "report_sticky", merchant: topCommerce?.merchant ?? "search" });
              }}
              style={buyBtn}
            >
              {topCommerce ? t("{label} 보기", { label: t(topCommerce.label) }) : t("바로 검색")}
            </a>
            <Link href="/care" style={stickyCareBtn}>{t("구매/상담 연결")}</Link>
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
                <h3 style={routineTitle}>{t(step.title)}</h3>
                {step.cadence && <span style={cadenceChip}>{t(step.cadence)}</span>}
              </div>
              <p style={routineBody}>{t(step.body)}</p>
              <p style={routineWhy}>{t(step.why)}</p>
              {step.heroSku && (
                <div style={routineProduct}>
                  <span style={{ fontWeight: 700 }}>{t(step.heroSku.brand)} {t(step.heroSku.name)}</span>
                  {step.heroNote && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {t(step.heroNote)}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceBridge({ reads, scanApplied }: { reads: SkinReads; scanApplied: boolean }) {
  const pct = Math.round(reads.confidence * 100);
  const trust = buildReportTrust(reads, scanApplied);
  return (
    <section style={confidenceCard(reads.retakeRecommended)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <p style={sectionLabel}>{t("분석 신뢰도")}</p>
        <strong style={{ fontFeatureSettings: '"tnum"', fontSize: 20, color: "var(--ink)" }}>{pct}%</strong>
      </div>
      <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 20, color: "var(--ink)", margin: "6px 0" }}>
        {t(trust.title)}
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
        {t(trust.body)}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <span style={trustChip}>{t(trust.sourceLabel)}</span>
        <span style={trustChip}>{t("신뢰도 {label}", { label: t(reads.confidenceLabel) })}</span>
        {trust.checks.slice(0, 3).map((check) => (
          <span key={check} style={trustChip}>{t(check)}</span>
        ))}
      </div>
      {trust.reasons.length > 0 && (
        <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
          {trust.reasons.map((reason) => (
            <span key={reason} style={{ fontSize: 12.5, color: "var(--plum-press)" }}>{t(reason)}</span>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 10 }}>
        {t("의료 진단이 아니라 사진에서 보이는 피부 신호 기반의 화장품 추천입니다.")}
      </p>
    </section>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const headlineStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 30, lineHeight: 1.18, color: "var(--ink)", margin: "8px 0 6px", whiteSpace: "pre-line" };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: "var(--text-muted)", marginBottom: 14 };
const narrativeStyle: React.CSSProperties = { fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 28 };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "20px 20px 18px" };
const careCard: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "20px 20px 18px", margin: "24px 0 28px" };
const careBtn: React.CSSProperties = { display: "block", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const noteStyle: React.CSSProperties = { fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 24 };
const routineHalfLabel: React.CSSProperties = { fontFamily: "var(--font-hand)", fontSize: 21, lineHeight: 1, color: "var(--ink)", marginBottom: 10 };
const routineStep: React.CSSProperties = { display: "grid", gridTemplateColumns: "30px 1fr", gap: 12, alignItems: "start", borderTop: "1px solid var(--line)", paddingTop: 12 };
const routineWhy: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4 };
const cadenceChip: React.CSSProperties = { fontSize: 11, border: "1px solid var(--line)", color: "var(--bronze)", borderRadius: 999, padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap" };
const routineIndex: React.CSSProperties = { width: 28, height: 28, borderRadius: 999, background: "var(--paper)", border: "1.5px solid var(--ink)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 };
const routineTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 };
const routineBody: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 };
const routineProduct: React.CSSProperties = { fontSize: 12.5, color: "var(--ink)", fontWeight: 800, marginTop: 6 };
const trustChip: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 999, padding: "4px 8px", color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 };
const stickyBar: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "12px 16px" };
const buyBtn: React.CSSProperties = { flex: 1, background: "var(--surface-tint)", color: "var(--ink)", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", whiteSpace: "nowrap" };
const stickyCareBtn: React.CSSProperties = { flex: 1.3, background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", whiteSpace: "nowrap" };

const stepTabs: React.CSSProperties = { display: "flex", gap: 6, marginTop: 12, marginBottom: 4 };
function stepTab(active: boolean, done: boolean): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
    background: active ? "var(--surface-tint)" : "var(--surface)",
    color: active ? "var(--ink)" : done ? "var(--ink-soft)" : "var(--text-muted)",
    borderRadius: 999,
    padding: "7px 4px",
    fontSize: 12,
    fontWeight: active ? 800 : 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
const stepNav: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 28 };
function stepNavBtn(primary: boolean): React.CSSProperties {
  return {
    border: primary ? "none" : "1.5px solid var(--line)",
    background: primary ? "var(--ink)" : "var(--surface)",
    color: primary ? "var(--paper)" : "var(--ink-soft)",
    borderRadius: 10,
    padding: "13px 18px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function confidenceCard(retake: boolean): React.CSSProperties {
  return {
    background: retake ? "var(--plum-soft)" : "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "18px 18px 16px",
    marginBottom: 18,
  };
}
