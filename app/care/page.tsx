"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { careSummary, clinicLinks, productSearchLinks, type CareLink, type CareLocale } from "@/lib/care";
import { recommend, type RecoResult, type ScanReads, type Survey } from "@/lib/recommend";
import { recordCareIntent } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";

type CareView = { survey: Survey; reads: SkinReads | null; result: RecoResult };

function loadCareView(): CareView | null {
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

export default function CarePage() {
  const [locale, setLocale] = useState<CareLocale>("ko");
  const [view] = useState<CareView | null>(() => loadCareView());
  const summary = useMemo(() => careSummary(view?.survey ?? null, view?.reads ?? null, view?.result ?? null, locale), [locale, view]);
  const topPicks = view?.result.picks.slice(0, 3) ?? [];
  const clinics = clinicLinks(locale);

  async function openCareLink(link: CareLink, context?: string) {
    await recordCareIntent({
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
    window.open(link.href, "_blank", "noopener,noreferrer");
  }

  if (!view) {
    return (
      <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
        <div className="mx-auto" style={{ maxWidth: 420 }}>
          <p style={eyebrow}>care path</p>
          <h1 style={titleStyle}>먼저 피부 스캔이나 설문을 진행해주세요</h1>
          <p style={leadStyle}>분석 결과와 설문 답변이 있어야 구매처와 상담 연결을 자연스럽게 안내할 수 있어요.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/scan" style={{ ...primaryBtn, flex: 1, textAlign: "center" }}>스캔 시작</Link>
            <Link href="/survey" style={{ ...outlineBtn, flex: 1, textAlign: "center" }}>설문만 하기</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={eyebrow}>care path</p>
          <div style={segmented}>
            <button onClick={() => setLocale("ko")} style={segBtn(locale === "ko")}>KO</button>
            <button onClick={() => setLocale("en")} style={segBtn(locale === "en")}>EN</button>
          </div>
        </div>

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
            <p style={sectionLabel}>{locale === "ko" ? "피부과/상담 연결" : "Clinic support"}</p>
            {summary.clinicPriority && <span style={warnBadge}>{locale === "ko" ? "상담 고려" : "Consider"}</span>}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 12 }}>
            {locale === "ko"
              ? "분석은 미용 참고용이에요. 통증, 급격한 변화, 지속되는 트러블이 있으면 전문 진료를 우선하세요."
              : "This scan is cosmetic guidance only. For pain, sudden changes, or persistent breakouts, choose a professional consultation."}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {clinics.map((link) => (
              <button key={link.label} onClick={() => openCareLink(link, view.survey.type)} style={linkBtn}>
                <span>{link.label}</span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{link.note}</small>
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
const primaryBtn: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineBtn: React.CSSProperties = { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const linkBtn: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "10px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", textAlign: "left" };
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
