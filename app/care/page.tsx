"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { careSummary, clinicLinks, productSearchLinks, type CareLink } from "@/lib/care";
import { recommend, type RecoResult, type ScanReads, type Survey } from "@/lib/recommend";
import { recordFunnelEvent } from "@/lib/funnel";
import { loadLastResult } from "@/lib/last-result";
import { recordCareIntent } from "@/lib/store";
import type { SkinReads } from "@/lib/skin";
import { Xiaohei } from "@/app/components/sketch";
import { FlowSteps } from "@/app/components/flow-steps";
import { ProductVisual } from "@/app/components/product-visual";
import { t, useLanguage } from "@/lib/i18n";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

type CareView = { survey: Survey; reads: SkinReads | null; result: RecoResult };

function loadCareView(): CareView | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(DEVICE_DATA_KEY.survey);
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
    const scanRaw = sessionStorage.getItem(DEVICE_DATA_KEY.scan);
    if (scanRaw) scan = JSON.parse(scanRaw);
  } catch {}
  try {
    const readsRaw = sessionStorage.getItem(DEVICE_DATA_KEY.reads);
    if (readsRaw) reads = JSON.parse(readsRaw);
  } catch {}

  return { survey, reads, result: recommend(survey, scan) };
}

export default function CarePage() {
  const { lang } = useLanguage();
  const [view, setView] = useState<CareView | null>(null);
  const [viewLoaded, setViewLoaded] = useState(false);
  const [expandedMerchants, setExpandedMerchants] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // sessionStorage is client-only; reading it during the first render caused
    // an SSR hydration mismatch (React #418), so load after mount instead.
    /* eslint-disable react-hooks/set-state-in-effect */
    setView(loadCareView());
    setViewLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const summary = careSummary(view?.survey ?? null, view?.reads ?? null, view?.result ?? null);
  const topPicks = view?.result.picks.slice(0, 3) ?? [];
  const clinics = clinicLinks(lang);

  function openCareLink(link: CareLink, context?: string) {
    // Open synchronously inside the click gesture — awaiting the record first
    // pushes window.open past the user-gesture window and popup blockers kill it.
    void recordCareIntent({
      kind: link.kind,
      label: link.label,
      href: link.href,
      locale: lang,
      context,
      sku_id: link.skuId,
      merchant: link.merchant,
      placement: link.placement,
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
          <p style={eyebrow}>{t("제품과 루틴")}</p>
          <h1 style={titleStyle}>
            {t("아직 이어서 볼 리포트가 없어요.")}
          </h1>
          <p style={leadStyle}>
            {t("먼저 피부를 살펴보거나 설문을 완료하면 제품 정보와 루틴을 이어서 볼 수 있어요.")}
          </p>
          <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", padding: "15px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)" }}>{t("내 피부 살펴보기")}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link href="/survey" style={{ ...outlineBtn, display: "block", textAlign: "center", marginTop: 12 }}>
            {t("설문으로 시작하기")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>{t("제품과 루틴")}</p>
        <FlowSteps current="care" />

        <h1 style={titleStyle}>{t(summary.title)}</h1>
        <p style={leadStyle}>{t(summary.body)}</p>

        <section style={sectionStyle}>
          <div style={sectionHead}>
            <p style={sectionLabel}>{t("추천 제품 더 알아보기")}</p>
            <span style={badge}>{t(view.survey.category)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <p style={{ ...commerceIntro, flex: 1, marginBottom: 0 }}>
              {t("궁금한 제품의 정보와 판매처를 한눈에 비교해 보세요.")}
            </p>
            <span style={{ marginLeft: -12 }}>
              <Xiaohei size={54} pose="carry" />
            </span>
          </div>
          {topPicks.map((pick) => {
            const links = productSearchLinks(pick.sku, `care_${lang}`);
            const expanded = Boolean(expandedMerchants[pick.sku.id]);
            const visibleLinks = expanded ? links : links.slice(0, 1);
            const merchantPanelId = `care-merchants-${pick.sku.id}`;

            return (
            <div key={pick.sku.id} style={productRow}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 54, height: 54, flexShrink: 0 }}>
                  <ProductVisual category={pick.sku.category} brand={pick.sku.brand} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t(pick.sku.brand)}</p>
                  <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>{t(pick.sku.name)}</h2>
                  <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.45 }}>{t(pick.reason)}</p>
                </div>
              </div>
              <div id={merchantPanelId} style={{ display: "grid", gap: 7, marginTop: 12 }}>
                {visibleLinks.map((link) => (
                  <button key={`${pick.sku.id}-${link.label}`} onClick={() => openCareLink(link, pick.sku.id)} style={linkBtn}>
                    <span>{t(link.label)}</span>
                    <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{t(link.note)}</small>
                  </button>
                ))}
                {links.length > 1 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={merchantPanelId}
                    onClick={() => setExpandedMerchants((current) => ({ ...current, [pick.sku.id]: !expanded }))}
                    style={otherMerchantsBtn}
                  >
                    {expanded ? t("다른 판매처 닫기") : t("다른 판매처 보기")}
                    <span aria-hidden>{expanded ? "↑" : "↓"}</span>
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </section>

        <section style={sectionStyle}>
          <div style={sectionHead}>
            <p style={sectionLabel}>{t("피부 고민이 계속 신경 쓰인다면")}</p>
            {summary.clinicPriority && <span style={warnBadge}>{t("상담 우선 고려")}</span>}
          </div>

          <div style={safetyCard}>
            <span style={safetyMark} aria-hidden>!</span>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
              {t("이 분석은 미용 참고용이에요. 통증·급격한 변화·지속되는 트러블이 있다면 앱보다 전문 진료를 먼저 받아보세요.")}
            </p>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {clinics.map((link) => (
              <button key={link.label} onClick={() => openCareLink(link, view.survey.type)} style={clinicBtn}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{t(link.label)}</span>
                  <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{t(link.note)}</small>
                </span>
                <span aria-hidden style={{ color: "var(--plum)", fontSize: 18 }}>→</span>
              </button>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("외국인 사용자 안내")}</p>
          <ul style={tipList}>
            <li>{t("Global search는 해외 구매 가능성과 영문 제품명을 확인하는 데 좋아요.")}</li>
            <li>{t("상담 전 사용 중인 제품명과 스캔 결과를 저장해두면 설명이 쉬워요.")}</li>
            <li>{t("시술이나 처방 판단은 앱이 아니라 병원 상담에서 결정해야 해요.")}</li>
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
const warnBadge: React.CSSProperties = { fontSize: 12, background: "var(--plum-soft)", color: "var(--plum-press)", borderRadius: 8, padding: "5px 8px", fontWeight: 700 };
const outlineBtn: React.CSSProperties = { minHeight: "var(--tap-min)", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const linkBtn: React.CSSProperties = { minHeight: "var(--tap-min)", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "9px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const otherMerchantsBtn: React.CSSProperties = { minHeight: "var(--tap-min)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "none", background: "transparent", color: "var(--ink-soft)", padding: "8px 2px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" };
const clinicBtn: React.CSSProperties = { minHeight: "var(--tap-min)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line)", borderRadius: 10, background: "var(--paper)", padding: "12px 14px", cursor: "pointer", width: "100%" };
const safetyCard: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", background: "color-mix(in srgb, var(--plum) 6%, var(--paper))", border: "1px solid color-mix(in srgb, var(--plum) 28%, var(--line))", borderLeft: "3px solid var(--plum)", borderRadius: 10, padding: "12px 13px" };
const safetyMark: React.CSSProperties = { flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: "var(--plum)", color: "var(--on-plum)", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 };
const tipList: React.CSSProperties = { margin: "12px 0 0", paddingLeft: 18, color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.65 };
