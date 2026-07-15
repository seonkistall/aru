"use client";

import Link from "next/link";
import { t } from "@/lib/i18n/core";
import { Xiaohei } from "./components/sketch";
import { ReturnBanner } from "./components/return-banner";
import { MoodFromLink } from "./components/mood-from-link";

function Arrow() {
  return (
    <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden style={{ filter: "url(#sketch)" }}>
      <path d="M2 8 L23 8" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 8 L17 4 M23 8 L17 12" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="flex items-center justify-between px-6 pt-7" style={{ paddingRight: 118 }}>
        <span style={{ fontFamily: "var(--font-hand)", fontSize: 32, lineHeight: 1 }}>{t("아루")}</span>
        <span style={{ fontFamily: "var(--font-hand)", fontSize: 19, color: "var(--muted)", textAlign: "right" }}>{t("아름다움을, 매일의 루틴으로")}</span>
      </header>

      <MoodFromLink />

      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* 小黑 reading skin through a magnifier, with a red hand annotation */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Xiaohei size={156} pose="magnify" bob />
          {/* Anchored to the character's left edge and growing leftward, so
              longer EN/JA/ZH strings never overlap the character. */}
          <span
            style={{
              position: "absolute",
              right: "calc(100% - 14px)",
              top: 28,
              fontFamily: "var(--font-hand)",
              fontSize: 21,
              color: "var(--plum)",
              lineHeight: 1.1,
              transform: "rotate(-7deg)",
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            {t("30초면")}<br />{t("읽어요")}
          </span>
          <svg width="42" height="26" viewBox="0 0 42 26" aria-hidden style={{ position: "absolute", left: -8, top: 60, filter: "url(#sketch)" }}>
            <path d="M3 20 C14 6 28 4 38 11" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M38 11 L31 10 M38 11 L34 17" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        <h1 style={{ fontFamily: "var(--font-hand)", fontSize: "clamp(30px, 12vw, 54px)", lineHeight: 1.1, margin: "4px 0 2px", overflowWrap: "break-word", maxWidth: "100%" }}>
          {t("과장 없이,")}
          <br />
          {t("너한테 맞는 최대 셋")}
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--text-muted)", maxWidth: 270, lineHeight: 1.6, marginTop: 12 }}>
          {t("4만원짜리 실패는 그만. 카메라로 피부를 읽고 솔직하게 골라드려요.")}
        </p>

        <div className="flex items-center justify-center" style={{ gap: 11, marginTop: 26, fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>
          <span>{t("촬영")}</span>
          <Arrow />
          <span>{t("분석")}</span>
          <Arrow />
          <span>{t("추천")}</span>
        </div>

        <ReturnBanner />
      </section>

      <section className="px-6" style={{ paddingBottom: 6 }}>
        <h2 style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--ink)", textAlign: "center", margin: "2px 0 14px" }}>{t("이렇게 진행돼요")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <HowCard
            index={1}
            pose="magnify"
            title={t("30초 피부 스캔")}
            body={t("가이드에 얼굴을 맞추면 조건이 갖춰졌을 때 자동으로 찍혀요. 기본 스캔은 기기 안에서만 처리돼요.")}
          />
          <HowCard
            index={2}
            pose="funnel"
            title={t("보이는 신호만 정직하게")}
            body={t("유분·붉은기·결처럼 눈에 보이는 신호를 여러 프레임으로 읽고, 신뢰도가 낮으면 다시 찍자고 말해줘요.")}
          />
          <HowCard
            index={3}
            pose="carry"
            title={t("아침·저녁 루틴과 제품")}
            body={t("스캔과 설문을 함께 보고, 과장 없는 이유와 함께 최대 세 가지 선택과 루틴을 골라드려요.")}
          />
        </div>
      </section>

      <div className="px-6" style={{ paddingBottom: 32, paddingTop: 18 }}>
        <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
          <div style={{ position: "relative", padding: "17px 16px" }}>
            <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
            <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--ink)" }}>{t("내 피부 결, 보러 가기")}</span>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--orange)" }}>→</span>
            </div>
          </div>
        </Link>
        <Link
          href="/survey"
          style={{ display: "block", textAlign: "center", fontFamily: "var(--font-hand)", fontSize: 20, color: "var(--text-muted)", textDecoration: "none", marginTop: 14 }}
        >
          {t("카메라 없이 설문만 할래요 →")}
        </Link>
        <p style={{ textAlign: "center", fontFamily: "var(--font-hand)", fontSize: 17, color: "var(--text-muted)", marginTop: 11 }}>
          {t("기본 스캔은 기기 안에서 처리 · 동의 없인 전송·저장 안 해요")}
        </p>
      </div>
    </main>
  );
}

function HowCard({ index, pose, title, body }: { index: number; pose: "magnify" | "funnel" | "carry"; title: string; body: string }) {
  return (
    <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
      <div style={{ position: "relative", padding: "13px 14px" }}>
        <div style={{ position: "absolute", inset: 0, border: "1.8px solid var(--ink)", borderRadius: 4, filter: "url(#sketch-soft)" }} aria-hidden />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-hand)", fontSize: 26, color: "var(--orange)", width: 18, textAlign: "center", flexShrink: 0 }}>{index}</span>
          <span style={{ flexShrink: 0, marginLeft: -6 }}>
            <Xiaohei size={46} pose={pose} />
          </span>
          <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, display: "block", fontFamily: "var(--font-hand)", fontSize: 22, lineHeight: 1.1, color: "var(--ink)" }}>{title}</h3>
            <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", marginTop: 3 }}>{body}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
