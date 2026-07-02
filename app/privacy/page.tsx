"use client";

import Link from "next/link";
import { useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";
import { careIntentCount, clearCareIntents } from "@/lib/store";

export default function PrivacyPage() {
  const [labelTotal, setLabelTotal] = useState(() => labelCount());
  const [cropTotal, setCropTotal] = useState(() => cropSampleCount());
  const [consentTotal, setConsentTotal] = useState(() => consentEventCount());
  const [careTotal, setCareTotal] = useState(() => careIntentCount());

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

  function clearCommerceLog() {
    clearCareIntents();
    setCareTotal(careIntentCount());
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 430 }}>
        <p style={eyebrow}>privacy & consent</p>
        <h1 style={titleStyle}>사진 데이터는 목적별로 나눠서 다룹니다</h1>
        <p style={leadStyle}>
          기본 스캔은 이 기기에서 먼저 처리돼요. AI 분석용 전송과 학습용 크롭 저장은 서로 다른 선택이며, 언제든 이 기기에서 내보내거나 지울 수 있어요.
        </p>

        <section style={sectionStyle}>
          <p style={sectionLabel}>기본 스캔</p>
          <h2 style={sectionTitle}>기기 안에서 먼저 분석</h2>
          <p style={bodyText}>카메라 프레임과 얼굴 랜드마크로 보이는 피부 신호를 읽습니다. 이 기본 경로에서는 원본 전체 사진을 저장하지 않아요.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>AI 분석용 전송</p>
          <h2 style={sectionTitle}>선택한 경우에만 얼굴 크롭 전송</h2>
          <p style={bodyText}>체크하면 얼굴 크롭을 분석 API로 보내 보조 설명을 받아요. 이 선택은 학습용 저장 동의와 분리됩니다.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>학습용 크롭 저장</p>
          <h2 style={sectionTitle}>연구 동의 샘플만 로컬 보관</h2>
          <p style={bodyText}>
            동의한 경우 얼굴 크롭, 라벨, 촬영 품질 메타데이터를 이 브라우저에 저장합니다. 최근 120개까지만 보관되며, 내보내기 전에는 서버로 자동 업로드되지 않아요.
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>내보내기와 삭제</p>
          <h2 style={sectionTitle}>이 기기에 저장된 데이터</h2>
          <p style={bodyText}>현재 라벨 {labelTotal}개, 학습용 크롭 {cropTotal}개가 이 브라우저에 있어요.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} style={outlineBtn}>라벨 JSONL 내보내기</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>크롭 JSONL 내보내기</button>
            <button onClick={clearLearningData} style={dangerBtn}>로컬 학습 데이터 삭제</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>동의 기록</p>
          <h2 style={sectionTitle}>분리된 동의 이력</h2>
          <p style={bodyText}>
            현재 동의 문구 버전은 {CONSENT_VERSION}입니다. 이 기기에 동의 이벤트 {consentTotal}개가 저장되어 있어요. 이벤트에는 선택, 문구 버전, 시각, 파일럿 세션 정보가 포함됩니다.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportConsentEvents} disabled={consentTotal === 0} style={{ ...outlineBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>동의 기록 CSV 내보내기</button>
            <button onClick={clearConsentLog} disabled={consentTotal === 0} style={{ ...dangerBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>동의 기록 삭제</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>구매/상담 클릭 기록</p>
          <h2 style={sectionTitle}>제휴 검증용 클릭 신호</h2>
          <p style={bodyText}>
            제품 구매처나 상담 링크를 누르면 링크 종류, 판매처, 언어, 연결 위치가 이 브라우저에 기록됩니다. 실제 구매 여부나 결제 정보는 저장하지 않아요. 현재 클릭 기록은 {careTotal}개입니다.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={clearCommerceLog} disabled={careTotal === 0} style={{ ...dangerBtn, opacity: careTotal === 0 ? 0.5 : 1 }}>구매/상담 클릭 기록 삭제</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>의료적 경계</p>
          <p style={bodyText}>
            이 앱은 진단, 치료, 처방을 하지 않습니다. 사진에서 보이는 피부 신호를 바탕으로 화장품 선택을 돕는 서비스예요. 통증, 급격한 변화, 심한 염증, 오래 지속되는 증상은 전문 상담을 우선해 주세요.
          </p>
        </section>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Link href="/scan" style={{ ...primaryBtn, flex: 1, textAlign: "center" }}>스캔으로 돌아가기</Link>
          <Link href="/care" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>구매/상담 연결</Link>
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
