"use client";

import { useEffect } from "react";

// Bottom sheet with capture tips + consent detail, split out of the scan page
// so the scan screen stays a single fixed viewport. Purely presentational.

function CaptureTips() {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>촬영 팁</b>
      <span>  창가의 부드러운 빛, 정면 얼굴, 닦은 렌즈, 강한 반사 없는 상태가 가장 좋아요.</span>
    </div>
  );
}

function PrivacyNotice({ staffMode }: { staffMode: boolean }) {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>동의는 2가지로 분리돼요.</b>
      <span>
        {" "}AI 분석용 전송은 얼굴 크롭을 외부 AI(Gemini/OpenAI) 분석 API에 보내는 선택이에요.{" "}
        {staffMode
          ? "학습용 크롭 저장은 동의한 연구 샘플을 이 기기에 최대 120개까지 보관하는 선택입니다. "
          : "학습용 크롭 저장은 파일럿 연구 세션에서만 별도 동의로 진행돼요. "}
      </span>
      <a href="/privacy" style={{ color: "var(--plum)", fontWeight: 800, textDecoration: "none" }}>자세히 보기</a>
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
      aria-label="촬영 팁과 동의 안내"
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
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55, marginTop: 12 }}>
          체크박스의 <b style={{ color: "var(--ink)" }}>AI 분석 전송(선택)</b>은 얼굴 크롭만 외부 AI(Google Gemini/OpenAI) 분석 API로 보내 추천 정확도를 높이는 선택이에요. 학습용 저장과는 분리되며, 동의하지 않아도 기기 안 분석만으로 진행돼요.
        </p>
        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 14, background: "var(--ink)", color: "#fff", border: "none", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
