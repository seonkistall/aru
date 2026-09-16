"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";
import { careIntentCount, clearCareIntents } from "@/lib/store";
import { t, useLanguage } from "@/lib/i18n";
import { clearAllDeviceData } from "@/lib/device-data";
import { funnelFlushActive } from "@/lib/funnel-flush";

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
        <p style={eyebrow}>{t("개인정보와 동의")}</p>
        <h1 style={titleStyle}>{t("사진과 데이터는 이렇게 사용해요")}</h1>
        <p style={leadStyle}>{t("기본 촬영은 기기에서 처리하고, 필요한 기능만 직접 선택할 수 있어요.")}</p>

        <PrivacySummary
          title={t("기기에서 먼저 확인해요")}
          body={t("기본 촬영에서는 원본 사진을 외부로 보내거나 저장하지 않아요.")}
        />
        <PrivacySummary
          title={t("선택한 기능만 사용해요")}
          body={t("AI 분석, 연구용 저장과 이메일 알림은 각각 따로 선택할 수 있어요.")}
        />
        <PrivacySummary
          title={t("언제든 관리할 수 있어요")}
          body={t("이 기기에 저장된 결과와 활동 기록을 확인하거나 삭제할 수 있어요.")}
        />

        <details style={detailsStyle}>
          <summary style={detailsSummary}>{t("데이터 처리 기준 자세히 보기")}</summary>
          <div style={{ marginTop: 14 }}>
            <h2 style={detailTitle}>{t("기본 촬영")}</h2>
            <p style={bodyText}>{t("기본 촬영은 이 기기에서 처리하고, 원본 전체 사진을 외부로 보내거나 저장하지 않아요.")}</p>

            <h2 style={detailTitle}>{t("선택한 AI 분석")}</h2>
            <p style={bodyText}>{t("AI 분석을 선택한 촬영에서만 얼굴 부분 이미지가 Google Gemini 또는 OpenAI로 전송되며, 현재 추천을 만드는 데 사용돼요.")}</p>

            <h2 style={detailTitle}>{t("연구용 저장")}</h2>
            <p style={bodyText}>{t("연구용 저장을 선택하면 얼굴 부분 이미지, 라벨과 촬영 품질 정보를 이 브라우저에 최대 120개까지 보관해요. 파일럿에서 별도로 동의한 연구 데이터의 서버 보존 기간은 기본 180일이에요.")}</p>

            <h2 style={detailTitle}>{t("이메일 알림")}</h2>
            <p style={bodyText}>{t("이메일 알림 기록에는 이메일, 동의 문구 버전과 발송 시각이 저장돼요. 해지하거나 마지막 알림을 보낸 뒤 30일 안에 삭제 대상이 됩니다.")}</p>

            <h2 style={detailTitle}>{t("제품·상담 링크")}</h2>
            <p style={bodyText}>{t("제품 판매처나 상담 링크를 누르면 링크 종류, 판매처, 언어와 위치가 이 기기에 기록돼요. 링크 클릭은 구매를 뜻하지 않으며, ARU는 결제나 주문 정보를 저장하지 않아요.")}</p>
            <p style={{ ...bodyText, marginTop: 8 }}>{t("제품 사용 시작을 직접 기록하면 제품 ID, 이름과 시작 시각이 2주·4주 체크인을 위해 이 기기에 저장돼요.")}</p>

            {funnelFlushActive() && (
              <>
                {/* Rendered only while NEXT_PUBLIC_FUNNEL_FLUSH is on, for the same
                    reason CommerceDisclosure switches wording on its own flag: the
                    page must state what is true at the time it is read, and with the
                    flush off this transfer does not happen. */}
                <h2 style={detailTitle}>{t("이용 기록 전송")}</h2>
                <p style={bodyText}>{t("화면 이동과 버튼 누름 같은 이용 기록이 ARU 서버로 전송돼요. 사진, 직접 입력한 내용, 이름이나 연락처는 보내지 않고, 이 기기에서 만든 무작위 방문자·세션 번호만 함께 저장돼요.")}</p>
              </>
            )}

            <h2 style={detailTitle}>{t("서버 기록 삭제")}</h2>
            <p style={bodyText}>{t("이 기기의 데이터를 지워도 이메일 알림과 연구 서버 기록은 삭제되지 않아요. 이메일은 받은 메일의 해지 링크로, 연구 데이터는 파일럿 운영자에게 참여자·세션 ID로 요청해 주세요.")}</p>
          </div>
        </details>

        <section style={sectionStyle}>
          <p style={sectionLabel}>{t("내보내기와 삭제")}</p>
          <h2 style={sectionTitle}>{t("이 기기에 저장된 데이터")}</h2>
          <p style={bodyText}>
            {t("현재 라벨 {labelTotal}개, 연구용 이미지 {imageTotal}개가 이 브라우저에 있어요.", { labelTotal, imageTotal: cropTotal })}
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} disabled={labelTotal === 0} style={{ ...outlineBtn, opacity: labelTotal === 0 ? 0.5 : 1 }}>{t("라벨 JSONL 내보내기")}</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>{t("연구용 이미지 JSONL 내보내기")}</button>
            <button onClick={clearLearningData} style={dangerBtn}>{t("연구용 데이터 삭제")}</button>
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
          <p style={sectionLabel}>{t("제품·상담 링크 기록")}</p>
          <h2 style={sectionTitle}>{t("이 기기에 저장된 활동 기록")}</h2>
          <p style={bodyText}>{t("현재 제품·상담 링크 기록은 {careTotal}개예요.", { careTotal })}</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={clearCommerceLog} disabled={careTotal === 0} style={{ ...dangerBtn, opacity: careTotal === 0 ? 0.5 : 1 }}>{t("제품·상담 링크 기록 삭제")}</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>{t("전체 기기 데이터")}</p>
          <h2 style={sectionTitle}>{t("언제든 관리할 수 있어요")}</h2>
          <p style={bodyText}>{t("이 기기에 저장된 결과와 활동 기록을 한 번에 지울 수 있어요.")}</p>
          {deleteState === "idle" && (
            <button type="button" onClick={() => setDeleteState("confirm")} style={{ ...dangerBtn, marginTop: 14 }}>
              {t("이 기기의 ARU 데이터 모두 지우기")}
            </button>
          )}
          {deleteState === "confirm" && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <h3 style={sectionTitle}>{t("이 기기의 데이터를 모두 지울까요?")}</h3>
              <p style={{ ...bodyText, color: "var(--ink)" }}>{t("스캔 결과, 설문, 체크인과 설정이 삭제돼요. 이메일 알림과 연구 서버 데이터는 포함되지 않아요.")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setDeleteState("idle")} style={outlineBtn}>{t("취소")}</button>
                <button type="button" onClick={clearDeviceData} style={dangerBtn}>{t("모두 지우기")}</button>
              </div>
            </div>
          )}
          {deleteState === "done" && <p role="status" style={{ ...bodyText, color: "var(--ink)", marginTop: 14 }}>{t("이 기기에 저장된 ARU 데이터를 모두 지웠어요.")}</p>}
          {deleteState === "error" && (
            <div style={{ marginTop: 14 }}>
              <p role="alert" style={{ ...bodyText, color: "var(--plum)" }}>{t("일부 데이터를 삭제하지 못했어요. 브라우저 저장공간 권한을 확인한 뒤 다시 시도해 주세요.")}</p>
              <button type="button" onClick={clearDeviceData} style={{ ...dangerBtn, marginTop: 10 }}>{t("다시 삭제 시도")}</button>
            </div>
          )}
        </section>

        <section style={noticeStyle}>
          <h2 style={sectionTitle}>{t("ARU는 화장품 선택을 도와드려요")}</h2>
          <p style={bodyText}>{t("의료 진단이나 치료를 제공하지 않아요. 피부가 불편하거나 변화가 오래 이어지면 전문가와 상담해 주세요.")}</p>
        </section>

        <div style={{ marginTop: 18 }}>
          <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
            <div style={{ position: "relative", padding: "15px 16px" }}>
              <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
              <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)" }}>{t("내 피부 살펴보기")}</span>
                <span className="aru-dir-arrow" aria-hidden style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--orange)" }}>→</span>
              </div>
            </div>
          </Link>
          <Link href="/care" style={{ ...outlineLink, display: "block", textAlign: "center", marginTop: 10 }}>{t("제품과 상담 정보 보기")}</Link>
        </div>
      </div>
    </main>
  );
}

function PrivacySummary({ title, body }: { title: string; body: string }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={bodyText}>{body}</p>
    </section>
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
const detailsStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", marginBottom: 12 };
const detailsSummary: React.CSSProperties = { minHeight: "var(--tap-min)", display: "flex", alignItems: "center", color: "var(--ink)", fontSize: 14, fontWeight: 800, cursor: "pointer" };
const detailTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 17, color: "var(--ink)", margin: "16px 0 5px" };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineBtn: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "var(--plum)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
