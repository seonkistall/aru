"use client";

import Link from "next/link";
import { t } from "@/lib/i18n/core";
import { Xiaohei } from "./components/sketch";
import { ReturnBanner } from "./components/return-banner";
import { MoodFromLink } from "./components/mood-from-link";
import { useFunnelPageView } from "./use-funnel-page-view";

function Arrow() {
  return (
    <svg className="aru-dir-arrow" width="30" height="16" viewBox="0 0 30 16" aria-hidden style={{ width: "clamp(20px, 6vw, 30px)", flexShrink: 1, filter: "url(#sketch)" }}>
      <path d="M2 8 L23 8" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 8 L17 4 M23 8 L17 12" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Home() {
  // Top of the funnel. Without it the first countable step was the shutter, so
  // everyone who arrived and never opened the camera was invisible.
  useFunnelPageView("home_viewed");
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="flex items-center justify-between px-6 pt-7" style={{ paddingInlineEnd: 118 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1 }}>{t("아루")}</span>
        <span data-testid="header-tagline" style={{ fontFamily: "var(--font-display)", fontSize: 19, lineHeight: 1.5, color: "var(--muted)", textAlign: "end" }}>{t("아름다움을, 매일의 루틴으로")}</span>
      </header>

      <MoodFromLink />

      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* 小黑 reading skin through a magnifier, with a red hand annotation.
            The callout stays in normal flow so its rotated box (taller in sans
            locales) pushes the mascot down instead of bleeding up into the
            header tagline. */}
        <div style={{ marginBottom: 8, paddingTop: 20 }}>
          <span
            data-testid="hero-callout"
            style={{
              display: "block",
              margin: "0 auto",
              width: "min(240px, calc(100vw - 48px))",
              fontFamily: "var(--font-display)",
              fontSize: 19,
              color: "var(--plum)",
              lineHeight: 1.18,
              transform: "rotate(-4deg)",
              textAlign: "center",
              whiteSpace: "normal",
            }}
          >
            {t("나에게 맞는 화장품 찾기,")}<br />{t("30초면 충분해요.")}
          </span>
          <div style={{ position: "relative", width: 156, margin: "6px auto 0" }}>
            <Xiaohei size={156} pose="magnify" bob />
            <svg width="42" height="26" viewBox="0 0 42 26" aria-hidden style={{ position: "absolute", left: -8, top: 34, filter: "url(#sketch)" }}>
              <path d="M3 20 C14 6 28 4 38 11" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M38 11 L31 10 M38 11 L34 17" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h1 className="locale-display" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(34px, 10vw, 48px)", margin: "4px 0 2px", overflowWrap: "break-word", maxWidth: "100%" }}>
          {t("오늘의 내 피부,")}
          <br />
          {t("어떤 스킨케어가 좋을까요?")}
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--text-muted)", maxWidth: "var(--hero-sub-max, 270px)", lineHeight: 1.6, marginTop: 12 }}>
          {t("AI 카메라로 지금 피부에 맞는 제품과 루틴을 함께 찾아봐요.")}
        </p>

        <div className="flex items-center justify-center" style={{ width: "100%", gap: "clamp(4px, 2vw, 11px)", marginTop: 26, fontFamily: "var(--font-display)", fontSize: "clamp(18px, 5.5vw, 24px)", lineHeight: 1.5, color: "var(--ink)" }}>
          <span>{t("카메라")}</span>
          <Arrow />
          <span>{t("설문")}</span>
          <Arrow />
          <span>{t("리포트")}</span>
        </div>

        <div style={{ width: "100%", maxWidth: 420, paddingTop: 24 }}>
          <Link href="/scan" data-primary-action="scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", minHeight: "var(--tap-min)", padding: "17px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span className="locale-display" style={{ fontFamily: "var(--font-display)", fontSize: 27, lineHeight: 1.25, color: "var(--ink)" }}>{t("내 피부 살펴보기")}</span>
                <span className="aru-dir-arrow" aria-hidden style={{ fontFamily: "var(--font-display)", fontSize: 27, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link
            href="/survey"
            style={{ minHeight: "var(--tap-min)", padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1.25, color: "var(--text-muted)", textDecoration: "none", marginTop: 8 }}
          >
            {t("카메라 없이 설문으로 시작하기")}
          </Link>
          <p style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 17, color: "var(--text-muted)", marginTop: 4 }}>
            {t("사진은 기기에서 확인하고, 동의 없이 저장하지 않아요.")}
          </p>
        </div>

        <ReturnBanner />
      </section>

      <section className="px-6" style={{ paddingBottom: 6, width: "100%", maxWidth: 720, marginInline: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 27, lineHeight: 1.5, color: "var(--ink)", textAlign: "center", margin: "2px 0 14px" }}>{t("이렇게 진행돼요")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <HowCard
            index={1}
            pose="magnify"
            title={t("30초면 충분해요")}
            body={t("얼굴을 가이드에 맞추면 촬영 조건을 확인한 뒤 자동으로 촬영해요.")}
          />
          <HowCard
            index={2}
            pose="funnel"
            title={t("취향을 조금 더 알려주세요")}
            body={t("피부 타입, 고민, 예산을 더하면 지금 나에게 맞는 선택을 찾기 쉬워져요.")}
          />
          <HowCard
            index={3}
            pose="carry"
            title={t("제품과 루틴을 함께 확인해요")}
            body={t("오늘 살펴본 피부와 설문 답변을 바탕으로 제품 후보와 가벼운 루틴을 정리해요.")}
          />
        </div>
      </section>

    </main>
  );
}

function HowCard({ index, pose, title, body }: { index: number; pose: "magnify" | "funnel" | "carry"; title: string; body: string }) {
  return (
    <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
      <div style={{ position: "relative", padding: "13px 14px" }}>
        <div style={{ position: "absolute", inset: 0, border: "1.8px solid var(--ink)", borderRadius: 4, filter: "url(#sketch-soft)" }} aria-hidden />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--orange)", width: 18, textAlign: "center", flexShrink: 0 }}>{index}</span>
          <span style={{ flexShrink: 0, marginLeft: -6 }}>
            <Xiaohei size={46} pose={pose} />
          </span>
          <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
            <h3 className="locale-display" style={{ margin: 0, display: "block", fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}>{title}</h3>
            <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", marginTop: 3 }}>{body}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
