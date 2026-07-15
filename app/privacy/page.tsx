"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";
import { careIntentCount, clearCareIntents } from "@/lib/store";
import { t, useLanguage } from "@/lib/i18n";
import { clearAllDeviceData } from "@/lib/device-data";

export default function PrivacyPage() {
  useLanguage();
  const [labelTotal, setLabelTotal] = useState(0);
  const [cropTotal, setCropTotal] = useState(0);
  const [consentTotal, setConsentTotal] = useState(0);
  const [careTotal, setCareTotal] = useState(0);
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "done" | "error">("idle");

  useEffect(() => {
    // localStorage counts are client-only; reading them during the first
    // render caused an SSR hydration mismatch (React #418) once data existed.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLabelTotal(labelCount());
    setCropTotal(cropSampleCount());
    setConsentTotal(consentEventCount());
    setCareTotal(careIntentCount());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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

  function clearDeviceData() {
    const remaining = clearAllDeviceData({ local: window.localStorage, session: window.sessionStorage });
    if (remaining.length === 0) {
      setLabelTotal(0);
      setCropTotal(0);
      setConsentTotal(0);
      setCareTotal(0);
      setDeleteState("done");
      return;
    }
    setDeleteState("error");
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 430 }}>
        <p style={eyebrow}>privacy & consent</p>
        <h1 style={titleStyle}>{t("사진 데이터는 목적별로 나눠서 다룹니다")}</h1>
        <p style={leadStyle}>
          {t("기본 스캔은 이 기기에서 먼저 처리돼요. AI 분석용 전송과 학습용 크롭 저장은 서로 다른 선택이며, 언제든 이 기기에서 내보내거나 지울 수 있어요.")}
        </p>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("기본 스캔")}</p>
          <h2 style={sectionTitle}>{t("기기 안에서 먼저 분석")}</h2>
          <p style={bodyText}>
            {t("카메라 프레임과 얼굴 랜드마크로 보이는 피부 신호를 읽습니다. 이 기본 경로에서는 원본 전체 사진을 저장하지 않아요.")}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("AI 분석용 전송")}</p>
          <h2 style={sectionTitle}>{t("선택한 경우에만 얼굴 크롭 전송")}</h2>
          <p style={bodyText}>
            {t("체크하면 얼굴 크롭이 외부 AI 제공사(Google Gemini 또는 OpenAI)의 분석 API로 전송되고, 추천 생성에만 사용돼요. 이 선택은 학습용 저장 동의와 분리됩니다.")}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("학습용 크롭 저장")}</p>
          <h2 style={sectionTitle}>{t("연구 동의 샘플만 로컬 보관")}</h2>
          <p style={bodyText}>
            {t("동의한 경우 얼굴 크롭, 라벨, 촬영 품질 메타데이터를 이 브라우저에 저장합니다. 최근 120개까지만 보관되며, 내보내기 전에는 서버로 자동 업로드되지 않아요. 파일럿 연구에 참여해 동의한 경우, 동의된 샘플만 운영자가 연구용 서버로 옮길 수 있어요.")}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("내보내기와 삭제")}</p>
          <h2 style={sectionTitle}>{t("이 기기에 저장된 데이터")}</h2>
          <p style={bodyText}>
            {t("현재 라벨 {labelTotal}개, 학습용 크롭 {cropTotal}개가 이 브라우저에 있어요.", { labelTotal, cropTotal })}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} disabled={labelTotal === 0} style={{ ...outlineBtn, opacity: labelTotal === 0 ? 0.5 : 1 }}>{t("라벨 JSONL 내보내기")}</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>{t("크롭 JSONL 내보내기")}</button>
            <button onClick={clearLearningData} style={dangerBtn}>{t("로컬 학습 데이터 삭제")}</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("동의 기록")}</p>
          <h2 style={sectionTitle}>{t("분리된 동의 이력")}</h2>
          <p style={bodyText}>
            {t("현재 동의 문구 버전은 {CONSENT_VERSION}입니다. 이 기기에 동의 이벤트 {consentTotal}개가 저장되어 있어요. 이벤트에는 선택, 문구 버전, 시각, 파일럿 세션 정보가 포함됩니다.", { CONSENT_VERSION, consentTotal })}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportConsentEvents} disabled={consentTotal === 0} style={{ ...outlineBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>{t("동의 기록 CSV 내보내기")}</button>
            <button onClick={clearConsentLog} disabled={consentTotal === 0} style={{ ...dangerBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>{t("동의 기록 삭제")}</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("구매/상담 클릭 기록")}</p>
          <h2 style={sectionTitle}>{t("제휴 검증용 클릭 신호")}</h2>
          <p style={bodyText}>
            {t("제품 구매처나 상담 링크를 누르면 링크 종류, 판매처, 언어, 연결 위치가 이 브라우저에 기록됩니다. 실제 구매 여부나 결제 정보는 저장하지 않아요. 현재 클릭 기록은 {careTotal}개입니다.", { careTotal })}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={clearCommerceLog} disabled={careTotal === 0} style={{ ...dangerBtn, opacity: careTotal === 0 ? 0.5 : 1 }}>{t("구매/상담 클릭 기록 삭제")}</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>{t("전체 기기 데이터")}</p>
          <h2 style={sectionTitle}>{t("ARU 기기 데이터 전체 삭제")}</h2>
          <p style={bodyText}>
            {t("이 브라우저에 저장된 ARU 데이터를 한 번에 지울 수 있어요. 리마인더 이메일과 파일럿 서버 데이터는 포함되지 않습니다.")}
          </p>
          {deleteState === "idle" && (
            <button type="button" onClick={() => setDeleteState("confirm")} style={{ ...dangerBtn, marginTop: 14 }}>
              {t("모든 기기 데이터 삭제")}
            </button>
          )}
          {deleteState === "confirm" && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <p style={{ ...bodyText, color: "var(--ink)" }}>
                {t("스캔·리포트, 설문, 연구·동의, 활동·체크인, 언어 설정 데이터가 이 기기에서 삭제됩니다. 서버 데이터는 지워지지 않아요.")}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setDeleteState("idle")} style={outlineBtn}>{t("취소")}</button>
                <button type="button" onClick={clearDeviceData} style={dangerBtn}>{t("기기 데이터 삭제 확인")}</button>
              </div>
            </div>
          )}
          {deleteState === "done" && <p role="status" style={{ ...bodyText, color: "var(--ink)", marginTop: 14 }}>{t("이 기기의 ARU 데이터를 모두 삭제했어요.")}</p>}
          {deleteState === "error" && (
            <div style={{ marginTop: 14 }}>
              <p role="alert" style={{ ...bodyText, color: "var(--plum)" }}>{t("일부 데이터를 삭제하지 못했어요. 브라우저 저장공간 권한을 확인한 뒤 다시 시도해 주세요.")}</p>
              <button type="button" onClick={clearDeviceData} style={{ ...dangerBtn, marginTop: 10 }}>{t("다시 삭제 시도")}</button>
            </div>
          )}
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("서버 보관과 삭제")}</p>
          <h2 style={sectionTitle}>{t("선택한 기능만 서버를 사용합니다")}</h2>
          <ul style={{ ...bodyText, margin: "8px 0 0", paddingLeft: 18 }}>
            <li>{t("AI 분석에 동의한 촬영에서만 얼굴 크롭이 Gemini 또는 OpenAI로 전송되며 추천 응답을 만드는 데 사용됩니다.")}</li>
            <li>{t("파일럿에서는 동의한 해당 세션의 연구 데이터만 비공개 Supabase로 동기화될 수 있고, 크롭 보존 기한은 기본 180일입니다.")}</li>
            <li>{t("리마인더 이메일 기록에는 이메일, 동의 버전, 발송 시각이 저장됩니다. 해지하면 즉시 발송 대상에서 제외되고 기록은 30일 안에 삭제됩니다.")}</li>
          </ul>
          <p style={{ ...bodyText, marginTop: 10 }}>
            {t("기기 데이터 삭제는 이 서버 기록을 삭제하지 않습니다. 리마인더는 받은 이메일의 해지 링크로, 연구 데이터는 파일럿 운영자에게 참여자·세션 ID로 요청해 주세요.")}
          </p>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>{t("의료적 경계")}</p>
          <p style={bodyText}>
            {t("이 앱은 진단, 치료, 처방을 하지 않습니다. 사진에서 보이는 피부 신호를 바탕으로 화장품 선택을 돕는 서비스예요. 통증, 급격한 변화, 심한 염증, 오래 지속되는 증상은 전문 상담을 우선해 주세요.")}
          </p>
        </section>

        <div style={{ marginTop: 18 }}>
          <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", padding: "15px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>{t("스캔으로 돌아가기")}</span>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link href="/care" style={{ ...outlineLink, display: "block", textAlign: "center", marginTop: 10 }}>{t("구매/상담 연결")}</Link>
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, margin: 0 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.22, color: "var(--ink)", margin: "8px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 22 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const noticeStyle: React.CSSProperties = { background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 7 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 19, color: "var(--ink)", marginBottom: 7 };
const bodyText: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineBtn: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "var(--plum)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
