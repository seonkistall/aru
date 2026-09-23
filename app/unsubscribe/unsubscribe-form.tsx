"use client";
import Link from "next/link";
import { useState } from "react";
import { t, useLanguage } from "@/lib/i18n";

/**
 * Why this screen distinguishes "this link is dead" from "we could not do it".
 *
 * `POST /api/reengage/unsubscribe` has four outcomes and only one of them means the
 * link is finished: 400 (the token does not verify), 503 (UNSUBSCRIBE_SECRET or the
 * Supabase admin client is not configured), 500 (the consent write failed), and a
 * request that never arrives at all, which `.catch(() => null)` turns into the same
 * `null` as a rejection. Until 2026-09-23 every one of them rendered
 * "이 링크는 사용할 수 없거나 유효 기간이 지났어요."
 *
 * That is the wrong thing to say to three of the four. A person told their unsubscribe
 * link has expired stops trying — and then keeps receiving the mail they asked to stop,
 * because what actually happened was ARU's own server being misconfigured or their
 * request not landing. Revoking consent is the one action in the product that must not
 * fail quietly, so a retryable failure now says so and points at the mail itself as the
 * fallback route.
 *
 * The missing-token case is also no longer an alert. `role="alert"` is a live region,
 * and content present in it on the FIRST render is not an announcement of anything —
 * it is the page's own explanation of why the button is disabled, so it is plain text
 * tied to the button with `aria-describedby`. The alert is kept for what genuinely
 * arrives later: the outcome of a request the person made.
 */
type State = "idle" | "sending" | "done" | "expired" | "unavailable";

const NO_TOKEN_NOTE_ID = "unsubscribe-no-token";

export function UnsubscribeForm({ token }: { token: string }) {
  useLanguage();
  const [state, setState] = useState<State>("idle");

  async function unsubscribe() {
    setState("sending");
    const response = await fetch("/api/reengage/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (response?.ok) {
      setState("done");
      return;
    }
    // 400 is the only status that means the link itself is finished — the route
    // returns it for a token that does not verify and for a malformed body. 500, 503
    // and a request that never arrived are ARU's problem, and trying again can fix them.
    setState(response?.status === 400 ? "expired" : "unavailable");
  }

  const busy = !token || state === "sending";

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
              disabled={busy}
              aria-describedby={!token ? NO_TOKEN_NOTE_ID : undefined}
              style={{ marginTop: 20, minHeight: 44, padding: "12px 18px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--ink)", color: "var(--paper)", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}
            >
              {state === "sending" ? t("처리 중…") : t("이메일 알림 해지하기")}
            </button>
            {!token && (
              <p id={NO_TOKEN_NOTE_ID} style={{ color: "var(--plum)", lineHeight: 1.55, marginTop: 12 }}>
                {t("이 링크는 사용할 수 없거나 유효 기간이 지났어요.")}
              </p>
            )}
            {token && state === "expired" && (
              <p role="alert" style={{ color: "var(--plum)", lineHeight: 1.55, marginTop: 12 }}>
                {t("이 링크는 사용할 수 없거나 유효 기간이 지났어요.")}
              </p>
            )}
            {token && state === "unavailable" && (
              <p role="alert" style={{ color: "var(--plum)", lineHeight: 1.55, marginTop: 12 }}>
                {t("지금은 해지를 처리하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 받은 메일에 회신해 주세요.")}
              </p>
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
