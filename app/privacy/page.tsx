"use client";

import Link from "next/link";
import { useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";

export default function PrivacyPage() {
  const [labelTotal, setLabelTotal] = useState(() => labelCount());
  const [cropTotal, setCropTotal] = useState(() => cropSampleCount());
  const [consentTotal, setConsentTotal] = useState(() => consentEventCount());

  function clearLearningData() {
    clearCropSamples();
    clearLabels();
    setCropTotal(cropSampleCount());
    setLabelTotal(labelCount());
  }

  function clearConsentLog() {
    clearConsentEvents();
    setConsentTotal(consentEventCount());
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>privacy & consent</p>
        <h1 style={titleStyle}>사진과 피부 데이터는 이렇게 다룹니다</h1>
        <p style={leadStyle}>
          기본 스캔은 기기 안에서 처리됩니다. 추가 AI 분석과 학습용 크롭 저장은 서로 다른 선택이며, 사용자가 직접 켜야 합니다.
        </p>

        <section style={sectionStyle}>
          <p style={sectionLabel}>기본 스캔</p>
          <h2 style={sectionTitle}>기기 안에서 분석</h2>
          <p style={bodyText}>카메라 프레임과 얼굴 랜드마크를 브라우저 안에서 읽고, 사진 원본은 저장하지 않습니다.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>AI 분석용 전송</p>
          <h2 style={sectionTitle}>선택 시 얼굴 크롭만 전송</h2>
          <p style={bodyText}>더 정교한 분석을 선택하면 얼굴 주변 크롭 이미지가 분석 API로 전송됩니다. 이 선택은 학습용 저장과 별개입니다.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>학습용 크롭 저장</p>
          <h2 style={sectionTitle}>이 기기에만 임시 저장</h2>
          <p style={bodyText}>
            학습용 저장을 선택하면 얼굴 크롭, 유분/붉은기/모공 라벨, 밝기/결 신호가 이 브라우저의 로컬 저장소에 보관됩니다.
            현재 로컬 보관 한도는 최근 25개이며, 내보내기 전까지 서버로 보내지 않습니다.
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>삭제와 내보내기</p>
          <h2 style={sectionTitle}>언제든 지울 수 있어요</h2>
          <p style={bodyText}>현재 이 기기에 저장된 라벨 {labelTotal}개, 학습용 크롭 {cropTotal}개가 있습니다.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} style={outlineBtn}>라벨 데이터 내보내기</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>크롭 데이터 내보내기</button>
            <button onClick={clearLearningData} style={dangerBtn}>이 기기의 학습 데이터 삭제</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>동의 감사 로그</p>
          <h2 style={sectionTitle}>AI 전송과 학습 저장을 별도로 기록해요</h2>
          <p style={bodyText}>
            현재 동의 문구 버전은 {CONSENT_VERSION}이고, 이 기기에 남아 있는 동의 변경 기록은 {consentTotal}개입니다.
            이 기록은 체크박스를 켜거나 끌 때마다 남고, 원본 사진은 포함하지 않습니다.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportConsentEvents} disabled={consentTotal === 0} style={{ ...outlineBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>동의 기록 내보내기</button>
            <button onClick={clearConsentLog} disabled={consentTotal === 0} style={{ ...dangerBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>동의 기록 삭제</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>의료 고지</p>
          <p style={bodyText}>
            이 앱은 의료 진단, 치료, 처방을 제공하지 않습니다. 보이는 피부 신호를 바탕으로 화장품 선택을 돕는 참고 도구입니다.
            통증, 급격한 변화, 지속되는 트러블이 있으면 피부과 상담을 우선하세요.
          </p>
        </section>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Link href="/scan" style={{ ...primaryBtn, flex: 1, textAlign: "center" }}>스캔으로 돌아가기</Link>
          <Link href="/care" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>상담 연결 보기</Link>
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.22, color: "var(--ink)", margin: "8px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 22 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const noticeStyle: React.CSSProperties = { background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 7 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 19, color: "var(--ink)", marginBottom: 7 };
const bodyText: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 };
const primaryBtn: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineBtn: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "#8f3f3b", border: "1px solid #d8b8b3", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
