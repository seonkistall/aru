"use client";
import Link from "next/link";
import { useState } from "react";
import { t, useLanguage } from "@/lib/i18n";

export function UnsubscribeForm({ token }: { token: string }) {
  useLanguage();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("sending");
    const response = await fetch("/api/reengage/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setState(response?.ok ? "done" : "error");
  }

  return (
    <main className="min-h-screen px-5 py-16" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={{ color: "var(--bronze)", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", marginBottom: 10 }}>ARU</p>
        <h1 style={{ color: "var(--ink)", fontFamily: "var(--font-ko-serif)", fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>
          {t("이메일 알림을 그만 받을까요?")}
        </h1>
        {state === "done" ? (
          <p role="status" style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>{t("이메일 알림을 해지했어요. 이제 2주·4주 알림을 보내지 않을게요.")}</p>
        ) : (
          <>
            <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>{t("2주·4주 루틴 확인 메일을 중단해요.")}</p>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={!token || state === "sending"}
              style={{ marginTop: 20, minHeight: 44, padding: "12px 18px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--ink)", color: "var(--paper)", fontWeight: 800, cursor: !token || state === "sending" ? "not-allowed" : "pointer", opacity: !token || state === "sending" ? 0.55 : 1 }}
            >
              {state === "sending" ? t("처리 중…") : t("이메일 알림 해지하기")}
            </button>
            {(!token || state === "error") && (
              <p role="alert" style={{ color: "var(--plum)", lineHeight: 1.55, marginTop: 12 }}>{t("이 링크는 사용할 수 없거나 유효 기간이 지났어요.")}</p>
            )}
          </>
        )}
        <nav aria-label={t("관련 링크")} style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 28 }}>
          <Link href="/" style={{ color: "var(--ink-soft)", minWidth: "var(--tap-min)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{t("홈으로")}</Link>
          <Link href="/privacy" style={{ color: "var(--ink-soft)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{t("개인정보와 동의")}</Link>
        </nav>
      </div>
    </main>
  );
}
