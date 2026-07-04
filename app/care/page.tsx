"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { careSummary, clinicLinks, productSearchLinks, type CareLink, type CareLocale } from "@/lib/care";
import { recommend, type RecoResult, type ScanReads, type Survey } from "@/lib/recommend";
import { recordFunnelEvent } from "@/lib/funnel";
import { loadLastResult } from "@/lib/last-result";
import { recordCareIntent } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";
import { FlowSteps } from "@/app/components/flow-steps";

type CareView = { survey: Survey; reads: SkinReads | null; result: RecoResult };

function loadCareView(): CareView | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("gyeol_survey");
  if (!raw) {
    // Returning visitor in a fresh tab (no sessionStorage): fall back to the
    // saved result, mirroring /report, so report's care CTA doesn't dead-end.
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

  return { survey, reads, result: recommend(survey, scan) };
}

export default function CarePage() {
  const [locale, setLocale] = useState<CareLocale>("ko");
  const [view, setView] = useState<CareView | null>(null);
  const [viewLoaded, setViewLoaded] = useState(false);

  useEffect(() => {
    // sessionStorage is client-only; reading it during the first render caused
    // an SSR hydration mismatch (React #418), so load after mount instead.
    /* eslint-disable react-hooks/set-state-in-effect */
    setView(loadCareView());
    setViewLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const summary = useMemo(() => careSummary(view?.survey ?? null, view?.reads ?? null, view?.result ?? null, locale), [locale, view]);
  const topPicks = view?.result.picks.slice(0, 3) ?? [];
  const clinics = clinicLinks(locale);

  function openCareLink(link: CareLink, context?: string) {
    // Open synchronously inside the click gesture — awaiting the record first
    // pushes window.open past the user-gesture window and popup blockers kill it.
    void recordCareIntent({
      kind: link.kind,
      label: link.label,
      href: link.href,
      locale,
      context,
      sku_id: link.skuId,
      merchant: link.merchant,
      placement: link.placement,
      partner_ready: link.partnerReady,
      region: link.region,
    });
    if (link.kind === "purchase") {
      recordFunnelEvent("commerce_clicked", { placement: link.placement ?? "care", merchant: link.merchant ?? "search" });
    }
    window.open(link.href, "_blank", "noopener,noreferrer");
  }

  if (!viewLoaded) return <main className="min-h-screen" style={{ background: "var(--paper)" }} />;

  if (!view) {
    return (
      <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
        <div className="mx-auto" style={{ maxWidth: 420 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <p style={eyebrow}>care path</p>
            <div role="group" aria-label="언어 선택" style={segmented}>
              <button type="button" onClick={() => setLocale("ko")} aria-pressed={locale === "ko"} aria-label="한국어" style={segBtn(locale === "ko")}>KO</button>
              <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"} aria-label="English" style={segBtn(locale === "en")}>EN</button>
            </div>
          </div>
          <h1 style={titleStyle}>
            {locale === "ko" ? "먼저 피부 스캔이나 설문을 진행해주세요" : "Start with a skin scan or the survey"}
          </h1>
          <p style={leadStyle}>
            {locale === "ko"
              ? "분석 결과와 설문 답변이 있어야 구매처와 상담 연결을 자연스럽게 안내할 수 있어요."
              : "Once we have your scan or survey answers, we can point you to the right products and consultations."}
          </p>
          <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", padding: "15px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>{locale === "ko" ? "스캔 시작" : "Start scan"}</span>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link href="/survey" style={{ ...outlineBtn, display: "block", textAlign: "center", marginTop: 12 }}>
            {locale === "ko" ? "설문만 하기" : "Survey only"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={eyebrow}>care path</p>
          <div role="group" aria-label="언어 선택" style={segmented}>
            <button type="button" onClick={() => setLocale("ko")} aria-pressed={locale === "ko"} aria-label="한국어" style={segBtn(locale === "ko")}>KO</button>
            <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"} aria-label="English" style={segBtn(locale === "en")}>EN</button>
          </div>
        </div>
        <FlowSteps current="care" />

        <h1 style={titleStyle}>{summary.title}</h1>
        <p style={leadStyle}>{summary.body}</p>

        <section style={sectionStyle}>
          <div style={sectionHead}>
            <p style={sectionLabel}>{locale === "ko" ? "제품 구매 연결" : "Product links"}</p>
            <span style={badge}>{view.survey.category}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <p style={{ ...commerceIntro, flex: 1, marginBottom: 0 }}>
              {locale === "ko"
                ? "추천 제품은 올리브영·네이버 쇼핑·쿠팡·글로벌 검색에서 바로 찾아볼 수 있어요."
                : "Open each product on Olive Young, Naver Shopping, Coupang, or global search."}
            </p>
            <span style={{ marginLeft: -12 }}>
              <Xiaohei size={54} pose="carry" />
            </span>
          </div>
          {topPicks.map((pick) => (
            <div key={pick.sku.id} style={productRow}>
              <div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{pick.sku.brand}</p>
                <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>{pick.sku.name}</h2>
                <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.45 }}>{pick.reason}</p>
              </div>
              <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
                {productSearchLinks(pick.sku, `care_${locale}`).map((link) => (
                  <button key={`${pick.sku.id}-${link.label}`} onClick={() => openCareLink(link, pick.sku.id)} style={linkBtn}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {link.label}
                      {link.partnerReady && <small style={dealBadge}>{locale === "ko" ? "제휴 후보" : "Partner-ready"}</small>}
                    </span>
                    <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{locale === "ko" ? link.note : link.noteEn ?? link.note}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section style={sectionStyle}>
          <div style={sectionHead}>
            <p style={sectionLabel}>{locale === "ko" ? "피부과 · 상담 연결" : "Clinic support"}</p>
            {summary.clinicPriority && <span style={warnBadge}>{locale === "ko" ? "상담 우선 고려" : "Consider first"}</span>}
          </div>

          <div style={safetyCard}>
            <span style={safetyMark} aria-hidden>!</span>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
              {locale === "ko"
                ? "이 분석은 미용 참고용이에요. 통증·급격한 변화·지속되는 트러블이 있다면 앱보다 전문 진료를 먼저 받아보세요."
                : "This scan is cosmetic guidance only. For pain, sudden changes, or persistent breakouts, see a professional first."}
            </p>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {clinics.map((link) => (
              <button key={link.label} onClick={() => openCareLink(link, view.survey.type)} style={clinicBtn}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{link.label}</span>
                  <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{link.note}</small>
                </span>
                <span aria-hidden style={{ color: "var(--plum)", fontSize: 18 }}>→</span>
              </button>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{locale === "ko" ? "외국인 사용자 안내" : "For international users"}</p>
          <ul style={tipList}>
            <li>{locale === "ko" ? "Global search는 해외 구매 가능성과 영문 제품명을 확인하는 데 좋아요." : "Use Global search to check overseas availability and English product names."}</li>
            <li>{locale === "ko" ? "상담 전 사용 중인 제품명과 스캔 결과를 저장해두면 설명이 쉬워요." : "Save your product list and scan result before a clinic visit."}</li>
            <li>{locale === "ko" ? "시술이나 처방 판단은 앱이 아니라 병원 상담에서 결정해야 해요." : "Procedures and prescriptions should be decided by a clinician, not the app."}</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, margin: 0 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.2, color: "var(--ink)", margin: "12px 0 8px" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 24 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 16 };
const sectionHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, margin: 0 };
const commerceIntro: React.CSSProperties = { fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 14 };
const productRow: React.CSSProperties = { borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 14 };
const badge: React.CSSProperties = { fontSize: 12, background: "transparent", color: "var(--bronze)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontWeight: 700 };
const dealBadge: React.CSSProperties = { fontSize: 10.5, background: "transparent", color: "var(--bronze)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 6px", fontWeight: 900 };
const warnBadge: React.CSSProperties = { fontSize: 12, background: "var(--plum-soft)", color: "var(--plum)", borderRadius: 8, padding: "5px 8px", fontWeight: 700 };
const segmented: React.CSSProperties = { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" };
const outlineBtn: React.CSSProperties = { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const linkBtn: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "10px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const clinicBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line)", borderRadius: 10, background: "var(--paper)", padding: "12px 14px", cursor: "pointer", width: "100%" };
const safetyCard: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", background: "color-mix(in srgb, var(--plum) 6%, var(--paper))", border: "1px solid color-mix(in srgb, var(--plum) 28%, var(--line))", borderLeft: "3px solid var(--plum)", borderRadius: 10, padding: "12px 13px" };
const safetyMark: React.CSSProperties = { flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: "var(--plum)", color: "var(--on-plum)", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 };
const tipList: React.CSSProperties = { margin: "12px 0 0", paddingLeft: 18, color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.65 };

function segBtn(active: boolean): React.CSSProperties {
  return {
    border: "none",
    background: active ? "var(--ink)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}
