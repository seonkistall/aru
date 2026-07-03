"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";
import { careIntentCount, clearCareIntents } from "@/lib/store";

export default function PrivacyPage() {
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const [labelTotal, setLabelTotal] = useState(0);
  const [cropTotal, setCropTotal] = useState(0);
  const [consentTotal, setConsentTotal] = useState(0);
  const [careTotal, setCareTotal] = useState(0);

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

  const t = (ko: string, en: string) => (locale === "ko" ? ko : en);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={eyebrow}>privacy & consent</p>
          <div style={segmented}>
            <button onClick={() => setLocale("ko")} style={segBtn(locale === "ko")}>KO</button>
            <button onClick={() => setLocale("en")} style={segBtn(locale === "en")}>EN</button>
          </div>
        </div>
        <h1 style={titleStyle}>{t("사진 데이터는 목적별로 나눠서 다룹니다", "We handle photo data separately, by purpose")}</h1>
        <p style={leadStyle}>
          {t(
            "기본 스캔은 이 기기에서 먼저 처리돼요. AI 분석용 전송과 학습용 크롭 저장은 서로 다른 선택이며, 언제든 이 기기에서 내보내거나 지울 수 있어요.",
            "The default scan is processed on this device first. Sending crops for AI analysis and storing crops for learning are separate choices, and you can export or delete them from this device at any time.",
          )}
        </p>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("기본 스캔", "Default scan")}</p>
          <h2 style={sectionTitle}>{t("기기 안에서 먼저 분석", "Analyzed on your device first")}</h2>
          <p style={bodyText}>
            {t(
              "카메라 프레임과 얼굴 랜드마크로 보이는 피부 신호를 읽습니다. 이 기본 경로에서는 원본 전체 사진을 저장하지 않아요.",
              "We read visible skin signals from camera frames and facial landmarks. On this default path, the full original photo is not stored.",
            )}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("AI 분석용 전송", "AI analysis transfer")}</p>
          <h2 style={sectionTitle}>{t("선택한 경우에만 얼굴 크롭 전송", "Face crops sent only if you opt in")}</h2>
          <p style={bodyText}>
            {t(
              "체크하면 얼굴 크롭이 외부 AI 제공사(Google Gemini 또는 OpenAI)의 분석 API로 전송되고, 추천 생성에만 사용돼요. 이 선택은 학습용 저장 동의와 분리됩니다.",
              "If you check the box, your face crop is sent to an external AI provider's analysis API (Google Gemini or OpenAI) and used only to generate recommendations. This choice is separate from the learning-storage consent.",
            )}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("학습용 크롭 저장", "Learning crop storage")}</p>
          <h2 style={sectionTitle}>{t("연구 동의 샘플만 로컬 보관", "Only research-consented samples, kept locally")}</h2>
          <p style={bodyText}>
            {t(
              "동의한 경우 얼굴 크롭, 라벨, 촬영 품질 메타데이터를 이 브라우저에 저장합니다. 최근 120개까지만 보관되며, 내보내기 전에는 서버로 자동 업로드되지 않아요. 파일럿 연구에 참여해 동의한 경우, 동의된 샘플만 운영자가 연구용 서버로 옮길 수 있어요.",
              "With your consent, face crops, labels, and capture-quality metadata are stored in this browser. Only the 120 most recent samples are kept, and nothing is auto-uploaded to a server before you export. If you joined the pilot study, only consented samples may be moved by the operator to the research server.",
            )}
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("내보내기와 삭제", "Export & delete")}</p>
          <h2 style={sectionTitle}>{t("이 기기에 저장된 데이터", "Data stored on this device")}</h2>
          <p style={bodyText}>
            {locale === "ko"
              ? `현재 라벨 ${labelTotal}개, 학습용 크롭 ${cropTotal}개가 이 브라우저에 있어요.`
              : `This browser currently holds ${labelTotal} labels and ${cropTotal} learning crops.`}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} disabled={labelTotal === 0} style={{ ...outlineBtn, opacity: labelTotal === 0 ? 0.5 : 1 }}>{t("라벨 JSONL 내보내기", "Export labels (JSONL)")}</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>{t("크롭 JSONL 내보내기", "Export crops (JSONL)")}</button>
            <button onClick={clearLearningData} style={dangerBtn}>{t("로컬 학습 데이터 삭제", "Delete local learning data")}</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("동의 기록", "Consent log")}</p>
          <h2 style={sectionTitle}>{t("분리된 동의 이력", "Separate consent history")}</h2>
          <p style={bodyText}>
            {locale === "ko"
              ? `현재 동의 문구 버전은 ${CONSENT_VERSION}입니다. 이 기기에 동의 이벤트 ${consentTotal}개가 저장되어 있어요. 이벤트에는 선택, 문구 버전, 시각, 파일럿 세션 정보가 포함됩니다.`
              : `The current consent copy version is ${CONSENT_VERSION}. This device holds ${consentTotal} consent events. Each event includes your choice, the copy version, a timestamp, and pilot session info.`}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportConsentEvents} disabled={consentTotal === 0} style={{ ...outlineBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>{t("동의 기록 CSV 내보내기", "Export consent log (CSV)")}</button>
            <button onClick={clearConsentLog} disabled={consentTotal === 0} style={{ ...dangerBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>{t("동의 기록 삭제", "Delete consent log")}</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("구매/상담 클릭 기록", "Shopping & clinic click log")}</p>
          <h2 style={sectionTitle}>{t("제휴 검증용 클릭 신호", "Click signals for partnership validation")}</h2>
          <p style={bodyText}>
            {locale === "ko"
              ? `제품 구매처나 상담 링크를 누르면 링크 종류, 판매처, 언어, 연결 위치가 이 브라우저에 기록됩니다. 실제 구매 여부나 결제 정보는 저장하지 않아요. 현재 클릭 기록은 ${careTotal}개입니다.`
              : `When you tap a product or clinic link, the link type, merchant, language, and placement are recorded in this browser. Whether you actually bought anything, and any payment details, are not stored. There are currently ${careTotal} click records.`}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={clearCommerceLog} disabled={careTotal === 0} style={{ ...dangerBtn, opacity: careTotal === 0 ? 0.5 : 1 }}>{t("구매/상담 클릭 기록 삭제", "Delete click log")}</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>{t("의료적 경계", "Medical boundary")}</p>
          <p style={bodyText}>
            {t(
              "이 앱은 진단, 치료, 처방을 하지 않습니다. 사진에서 보이는 피부 신호를 바탕으로 화장품 선택을 돕는 서비스예요. 통증, 급격한 변화, 심한 염증, 오래 지속되는 증상은 전문 상담을 우선해 주세요.",
              "This app does not diagnose, treat, or prescribe. It helps you choose cosmetics based on skin signals visible in your photo. For pain, sudden changes, severe inflammation, or symptoms that persist, please see a professional first.",
            )}
          </p>
        </section>

        <div style={{ marginTop: 18 }}>
          <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", padding: "15px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>{t("스캔으로 돌아가기", "Back to scan")}</span>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link href="/care" style={{ ...outlineLink, display: "block", textAlign: "center", marginTop: 10 }}>{t("구매/상담 연결", "Shopping & clinic links")}</Link>
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
const segmented: React.CSSProperties = { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" };

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
