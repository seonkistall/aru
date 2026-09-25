"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n/core";

// Bottom sheet with capture tips + consent detail, split out of the scan page
// so the scan screen stays a single fixed viewport. Purely presentational.

function CaptureTips() {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>{t("촬영 팁")}</b>
      <span>{"  "}{t("창가의 부드러운 빛, 정면 얼굴, 닦은 렌즈, 강한 반사 없는 상태가 가장 좋아요.")}</span>
    </div>
  );
}

function PrivacyNotice({ staffMode }: { staffMode: boolean }) {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>{t("사진은 기기에서 먼저 확인해요. 전송과 저장은 선택한 경우에만 진행됩니다.")}</b>
      {/* `padding-inline-start`, not `paddingLeft`: the indent has to sit at the
          reading start, and under `dir=rtl` that is the right-hand side. */}
      <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
        <li>{t("기본 촬영은 이 기기에서 처리해요.")}</li>
        <li>{t("더 자세한 분석을 원할 때만 외부 AI 사용을 선택할 수 있어요.")}</li>
        <li>{t("연구용 저장은 파일럿 참여자에게만 별도로 안내해요.")}</li>
      </ul>
      {staffMode ? <span style={{ display: "block", marginTop: 6 }}>{t("파일럿 설정에 따라 연구용 저장 선택이 표시돼요.")}</span> : null}
      <a href="/privacy" style={{ display: "inline-block", marginTop: 8, color: "var(--plum)", fontWeight: 800, textDecoration: "none" }}>{t("사진과 데이터 사용 자세히 보기")}</a>
    </div>
  );
}

export function InfoSheet({ staffMode, onClose }: { staffMode: boolean; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("촬영 팁과 동의 안내")}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--paper)", width: "100%", maxWidth: 460, borderRadius: "14px 14px 0 0", padding: "16px 18px 22px", maxHeight: "75vh", overflowY: "auto" }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 10px" }} />
        <CaptureTips />
        <PrivacyNotice staffMode={staffMode} />
        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 14, background: "var(--ink)", color: "#fff", border: "none", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          {t("닫기")}
        </button>
      </div>
    </div>
  );
}
