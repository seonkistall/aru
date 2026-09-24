"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { CommerceDisclosure } from "@/app/components/commerce-disclosure";
import { budgetLabel, isSurvey, recommend, type RecoResult, type RoutineStep, type ScanReads, type Survey } from "@/lib/recommend";
import { recordFunnelEvent } from "@/lib/funnel";
import { isSkinReads, loadLastResult, saveLastResult } from "@/lib/last-result";
import { ProductCard } from "@/app/components/product-card";
import { ProductCompare } from "@/app/components/product-compare";
import { ScanHistoryStrip } from "@/app/components/scan-history-strip";
import { localizedNarrative, type SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";
import { FlowSteps } from "@/app/components/flow-steps";
import { ReengageOptIn } from "@/app/components/reengage-optin";
import { buildReportTrust } from "@/lib/report-trust";
import { getLang, t } from "@/lib/i18n/core";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

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
  const raw = sessionStorage.getItem(DEVICE_DATA_KEY.survey);
  if (!raw) {
    // Fresh tab session: fall back to the last saved result so a returning
    // visitor re-enters their report instead of being bounced to the survey.
    const saved = loadLastResult();
    if (!saved) return null;
    return { survey: saved.survey, reads: saved.reads ?? null, result: recommend(saved.survey, saved.scan ?? null) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // The catch above only covers the parse. A value that PARSES to the wrong shape used
  // to go straight into recommend(), which throws at survey.concerns / survey.avoid
  // inside this mount effect — app/error.tsx then takes the page, commerce links and
  // all. Falling through to null lands on the path this page already has for "no survey".
  if (!isSurvey(parsed)) return null;
  const survey: Survey = parsed;
  let scan: ScanReads = null;
  let reads: SkinReads | null = null;
  try {
    const scanRaw = sessionStorage.getItem(DEVICE_DATA_KEY.scan);
    if (scanRaw) scan = JSON.parse(scanRaw);
  } catch {}
  try {
    const readsRaw = sessionStorage.getItem(DEVICE_DATA_KEY.reads);
    // Same hole the survey read had, one key over: the catch covers the parse only, and
    // this page renders reads.oil.value / .pores / .redness / .overall and reads.signals
    // straight out of the store, so a value that PARSES to the wrong shape throws during
    // render and app/error.tsx takes the page — commerce links and all. A wrong shape
    // falls back to no-reads, which is the survey-only report this page already renders.
    if (readsRaw) {
      const parsedReads: unknown = JSON.parse(readsRaw);
      if (isSkinReads(parsedReads)) reads = parsedReads;
    }
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
      // Only send the user's real avoid list when this pick actually satisfies
      // all of it — otherwise the LLM frames the SKU's generic freeOf as honored
      // avoid conditions, a false compliance claim the template path guards against.
      freeOf: pick.avoidedClear && initial.survey.avoid.length ? initial.survey.avoid : [],
      fallback: pick.reason,
    }));

    // Template fallbacks are already on screen; a slow LLM upgrade that lands
    // late (or after unmount) is worse than none, so cap it at 8s and abort
    // on cleanup.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    fetch("/api/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, lang: getLang() }),
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { reasons?: string[] }) => {
        if (cancelled || !data?.reasons) return;
        setResult((prev) =>
          prev ? { ...prev, picks: prev.picks.map((pick, i) => ({ ...pick, reason: data.reasons?.[i] ?? pick.reason })) } : prev
        );
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loaded, initial, router]);

  if (!loaded) return <ReportSkeleton />;
  if (!initial || !result) return <main style={{ minHeight: "100dvh", background: "var(--paper)" }} />;

  const { survey, reads } = initial;
  // One screen per stage instead of one long page: analysis → picks → routine
  // & follow-up. Always three steps — survey-only visitors get a survey
  // summary plus a scan nudge on the analysis step instead of losing it.
  const steps: ReportStep[] = ["analysis", "picks", "routine"];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const stepTitles: Record<ReportStep, string> = {
    analysis: t("피부 분석"),
    picks: t("살펴볼 제품 후보"),
    routine: t("오늘부터 가볍게 시작할 루틴"),
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
    <main className="px-5 pt-9" style={{ background: "var(--paper)", minHeight: "100dvh", paddingBottom: 48 }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p style={eyebrow}>{t("오늘의 피부 리포트")}</p>
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
          <p style={subStyle}>
            {reads
              ? t("카메라에서 확인한 피부 특징을 설문 답변과 함께 정리했어요.")
              : t("설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.")}
          </p>
        )}
        {step === "analysis" && reads?.narrative && <p style={narrativeStyle}>{localizedNarrative(reads)}</p>}
        {step === "analysis" && reads && <ConfidenceBridge reads={reads} scanApplied={result.scanApplied} />}

        {step === "analysis" && <ScanHistoryStrip />}

        {step === "analysis" && reads && (
          <section style={card}>
            <h2 style={sectionLabel}>{t("피부 분석")}</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
              {result.scanApplied
                ? t("카메라에서 확인한 피부 특징을 항목별로 살펴볼 수 있어요.")
                : t("촬영 조건이 충족되지 않아 사진은 참고만 하고, 설문 답변을 중심으로 정리했어요.")}
            </p>
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12 }}>
              {analysisRows.map(([label, read, note]) => (
                <div key={label} style={{ padding: "12px 0" }}>
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{label}</span>
                    <span aria-hidden style={{ flex: 1, borderBottom: "2px dotted var(--line)", margin: "0 8px", transform: "translateY(-4px)" }} />
                    <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: read.calm ? "var(--text-muted)" : "var(--plum)", flexShrink: 0 }}>{t(read.value)}</span>
                  </div>
                  {note && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>{t(note)}</p>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>{t("참고용 분석이며 조명과 각도에 따라 달라질 수 있어요.")}</p>
          </section>
        )}

        {/* Survey-only visitors keep the analysis step: their answers as the
            "reads", plus a nudge to scan for a real skin analysis. */}
        {step === "analysis" && !reads && (
          <section style={card}>
            <h2 style={sectionLabel}>{t("피부 분석")}</h2>
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12 }}>
              {(
                [
                  [t("피부 타입"), t(survey.type)],
                  [t("고민"), survey.concerns.map((concern) => t(concern)).join(" · ")],
                  [t("예산"), t(budgetLabel(survey.budget))],
                  [t("피하고 싶은 성분"), survey.avoid.map((item) => t(item)).join(" · ")],
                ] as [string, string][]
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} style={{ display: "flex", alignItems: "baseline", padding: "12px 0" }}>
                    <span style={{ fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{label}</span>
                    <span aria-hidden style={{ flex: 1, borderBottom: "2px dotted var(--line)", margin: "0 8px", transform: "translateY(-4px)" }} />
                    <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: "var(--plum)", flexShrink: 0, textAlign: "right" }}>{value}</span>
                  </div>
                ))}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
              {t("카메라를 사용하면 유분, 붉은기, 피부결처럼 눈에 보이는 특징도 함께 살펴볼 수 있어요.")}
            </p>
            <Link href="/scan" style={{ ...careBtn, marginTop: 12 }}>{t("30초 피부 스캔")}</Link>
          </section>
        )}

        {step === "picks" && (
        <section style={{ margin: "30px 0 24px" }}>
           <h2 style={sectionLabel}>{t("추천 기준")}</h2>
           <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 8 }}>
             {t(
               "피부 타입 {type}, 고민 {concerns}, 예산 {budget}을 함께 고려했어요. 이 조건에 가까운 {category} 제품을 최대 세 개 보여드릴게요.",
               {
                 type: t(survey.type),
                 concerns: concernText,
                 budget: t(budgetLabel(survey.budget)),
                 category: t(survey.category),
               },
             )}
             {result.scanApplied && reads ? ` ${t("카메라에서 확인한 {signals}도 함께 참고했어요.", { signals: scanSignalText(reads) })}` : ""}
          </p>
          {survey.avoid.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{t("제외 요청: {list}", { list: survey.avoid.map((item) => t(item)).join(" · ") })}</p>
          )}
        </section>
        )}

        {step === "routine" && (
        <details open style={card}>
          <summary style={{ minHeight: "var(--tap-min)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", listStyle: "none" }}>
             <h2 style={sectionLabel}>{t("오늘부터 가볍게 시작할 루틴")}</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("아침 {am} · 저녁 {pm}단계", { am: result.routine.am.length, pm: result.routine.pm.length })}</span>
          </summary>
          <div style={{ marginTop: 6 }}>
            <RoutineHalf label={t("아침")} steps={result.routine.am} half="am" />
            <RoutineHalf label={t("저녁")} steps={result.routine.pm} half="pm" />
          </div>
        </details>
        )}

        {step === "routine" && (
        <section style={careCard}>
           <p style={sectionLabel}>{t("다음 단계")}</p>
           <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 21, color: "var(--ink)", margin: "8px 0 6px" }}>
             {t("제품 정보나 전문가 상담이 더 궁금한가요?")}
           </h2>
           <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
             {t("추천 제품의 판매처를 확인하거나, 피부 고민이 계속되면 상담 정보를 찾아볼 수 있어요.")}
           </p>
           <Link href="/care" style={careBtn}>{t("제품과 상담 정보 보기")}</Link>
          {/* context is persisted (Supabase reengage_contacts) — keep Korean canonical, no t() */}
          <ReengageOptIn context={`${survey.type}·${survey.category}`} />
        </section>
        )}

        {step === "picks" && (
          <>
            {result.note && <p style={noteStyle}>{t(result.note)}</p>}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
               <h2 style={{ ...sectionLabel, marginBottom: 0 }}>{t("살펴볼 제품 후보")}</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("{category} · {n}개", { category: t(survey.category), n: result.picks.length })}</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {result.picks.map((pick, i) => (
                <ProductCard key={pick.sku.id} pick={pick} placement="report_product" rank={i + 1} />
              ))}
            </div>

            {result.picks.length >= 2 && (
              <details style={{ ...card, marginTop: 16 }}>
                <summary style={{ minHeight: "var(--tap-min)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", listStyle: "none" }}>
                  <span style={sectionLabel}>{t("추천 제품 비교")}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("예산대, 용량, 주요 성분을 비교해 보세요.")}</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <ProductCompare picks={result.picks} />
                </div>
              </details>
            )}

            {top && (
              <section style={reportCommerceAction}>
                <a
                  href={topCommerce ? commerceOutHref(top.sku.id, topCommerce.merchant, "report_summary") : top.sku.buyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    recordFunnelEvent("commerce_clicked", { placement: "report_summary", merchant: topCommerce?.merchant ?? "search" });
                  }}
                  style={buyBtn}
                >
                  {topCommerce ? t("{label}에서 제품 보기", { label: t(topCommerce.label) }) : t("제품 검색하기")}
                </a>
                <Link href="/care" style={commerceCareBtn}>{t("제품과 상담 정보 보기")}</Link>
                <CommerceDisclosure style={{ width: "100%", marginTop: 4 }} />
              </section>
            )}
          </>
        )}

        <div style={stepNav}>
          {stepIndex > 0 ? (
            <button type="button" onClick={() => goStep(stepIndex - 1)} style={stepNavBtn(false)}>
              <span className="aru-dir-arrow" aria-hidden>←</span> {t("이전")}
            </button>
          ) : (
            <span />
          )}
          {stepIndex < steps.length - 1 && (
            <button type="button" onClick={() => goStep(stepIndex + 1)} style={stepNavBtn(true)}>
              {t("다음")}: {stepTitles[steps[stepIndex + 1]]} <span className="aru-dir-arrow" aria-hidden>→</span>
            </button>
          )}
        </div>
        <Link href="/privacy" style={privacyLink}>{t("개인정보와 동의")}</Link>
      </div>

    </main>
  );
}

// Hand-drawn sun/moon markers for the AM/PM halves of the routine timeline.
function HalfIcon({ half }: { half: "am" | "pm" }) {
  return half === "am" ? (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ filter: "url(#sketch-soft)" }}>
      <circle cx="11" cy="11" r="4.6" fill="none" stroke="var(--orange)" strokeWidth="1.8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1={11 + 7 * Math.cos((deg * Math.PI) / 180)}
          y1={11 + 7 * Math.sin((deg * Math.PI) / 180)}
          x2={11 + 9.6 * Math.cos((deg * Math.PI) / 180)}
          y2={11 + 9.6 * Math.sin((deg * Math.PI) / 180)}
          stroke="var(--orange)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ filter: "url(#sketch-soft)" }}>
      <path d="M15.5 3.5 A8.6 8.6 0 1 0 18.5 14.5 A7 7 0 0 1 15.5 3.5 Z" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// Vertical timeline: sketch node circles on a dotted rail, one lane per step.
function RoutineHalf({ label, steps, half }: { label: string; steps: RoutineStep[]; half: "am" | "pm" }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <HalfIcon half={half} />
        <p style={{ ...routineHalfLabel, marginBottom: 0 }}>{label}</p>
      </div>
      {/* Logical, not physical: under Arabic (dir=rtl) the lane reads from the
          right, so a rail and numbers pinned to the physical left land at the far
          end of each line instead of in front of the step they number. */}
      <div style={{ position: "relative", paddingInlineStart: 40 }}>
        {/* dotted rail connecting the step nodes */}
        <span aria-hidden style={{ position: "absolute", insetInlineStart: 13, top: 10, bottom: 14, borderInlineStart: "2px dotted var(--line)" }} />
        {steps.map((step, index) => (
          <div key={step.id} style={{ position: "relative", paddingBottom: index === steps.length - 1 ? 4 : 18 }}>
            <span style={{ ...routineIndex, position: "absolute", insetInlineStart: -40, top: 0, fontFamily: "var(--font-display)", fontSize: 16, filter: "url(#sketch-soft)" }}>
              {index + 1}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ ...routineTitle, marginBottom: 0 }}>{t(step.title)}</h3>
              {step.cadence && <span style={cadenceChip}>{t(step.cadence)}</span>}
            </div>
            <p style={{ ...routineBody, marginTop: 4 }}>{t(step.body)}</p>
            <p style={routineWhy}>{t(step.why)}</p>
            {step.heroSku && (
              <div style={{ ...routineProduct, display: "inline-block", border: "1.5px solid var(--line)", borderRadius: 8, padding: "6px 10px", filter: "url(#sketch-soft)", background: "var(--paper)" }}>
                <span style={{ fontWeight: 700 }}>{t(step.heroSku.brand)} {t(step.heroSku.name)}</span>
                {step.heroNote && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {t(step.heroNote)}</span>}
              </div>
            )}
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
const routineHalfLabel: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1, color: "var(--ink)", marginBottom: 10 };
const routineWhy: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4 };
const cadenceChip: React.CSSProperties = { fontSize: 11, border: "1px solid var(--line)", color: "var(--bronze)", borderRadius: 999, padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap" };
const routineIndex: React.CSSProperties = { width: 28, height: 28, borderRadius: 999, background: "var(--paper)", border: "1.5px solid var(--ink)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 };
const routineTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 };
const routineBody: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 };
const routineProduct: React.CSSProperties = { fontSize: 12.5, color: "var(--ink)", fontWeight: 800, marginTop: 6 };
const trustChip: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 999, padding: "4px 8px", color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 };
// `flexWrap: "wrap"` is load-bearing, not cosmetic. The row holds two `flex: 1` CTAs
// (flex-basis 0) and a CommerceDisclosure that asks for `width: 100%` at
// flex-basis auto. Without wrapping, the disclosure alone claims the whole line,
// free space goes negative, flex-grow never applies, and both CTAs collapse to
// their horizontal padding — 24px, label cut mid-word, in every locale and at every
// width. The disclosure's own `marginTop: 4` only makes sense on a row of its own.
const reportCommerceAction: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 10, marginTop: 18, padding: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 };
// The out-link carries the filled treatment and the wider share of the row, and the
// /care hand-off next to it the quiet one. It was the other way round: the only link on
// this page that can earn anything was pale and on `flex: 1` while an internal
// navigation took `--plum` and `flex: 1.3` — so at 360px "올리브영에서 제품 보기" wrapped
// onto two lines inside the narrower box while "제품과 상담 정보 보기" sat on one line in
// the filled one, and the row read as if /care were the action being offered. The
// product cards' merchant CTA on this same page (`app/components/product-card.tsx`) is
// already `--plum` on `--on-plum`; this row now matches it. (/care's merchant buttons
// are `--paper` outlined, not filled — a different screen, left as it is.)
const buyBtn: React.CSSProperties = { minHeight: "var(--tap-min)", flex: 1.3, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const commerceCareBtn: React.CSSProperties = { minHeight: "var(--tap-min)", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-tint)", color: "var(--ink)", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const privacyLink: React.CSSProperties = { minHeight: "var(--tap-min)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 12, color: "var(--text-muted)", fontSize: 13, textDecoration: "underline" };

const stepTabs: React.CSSProperties = { display: "flex", alignItems: "stretch", gap: 6, marginTop: 12, marginBottom: 4 };
function stepTab(active: boolean, done: boolean): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
    background: active ? "var(--surface-tint)" : "var(--surface)",
    color: active ? "var(--ink)" : done ? "var(--ink-soft)" : "var(--text-muted)",
    borderRadius: 12,
    minHeight: "var(--tap-min)",
    padding: "8px 5px",
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: active ? 800 : 600,
    cursor: "pointer",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  };
}
const stepNav: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 28 };
function stepNavBtn(primary: boolean): React.CSSProperties {
  return {
    border: primary ? "none" : "1.5px solid var(--line)",
    background: primary ? "var(--ink)" : "var(--surface)",
    color: primary ? "var(--paper)" : "var(--ink-soft)",
    borderRadius: 10,
    minHeight: "var(--tap-min)",
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
