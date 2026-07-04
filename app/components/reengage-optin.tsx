"use client";

import { useState } from "react";

// Opt-in for the 2/4-week routine reminder (the daily-routine re-entry hook).
// Explicit consent, minimal PII, no dark patterns. Sending is owner-gated
// server-side; this only records the opt-in.

export function ReengageOptIn({ context }: { context?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    if (!consent || !email.trim()) return;
    setState("sending");
    try {
      const res = await fetch("/api/reengage/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), consent: true, context }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div style={box}>
        <p style={{ fontSize: 13.5, color: "var(--success)", margin: 0 }}>좋아요. 2주 뒤 피부가 어떤지 살짝 리마인드해 드릴게요.</p>
      </div>
    );
  }

  return (
    <div style={box}>
      <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 700, margin: "0 0 4px" }}>2주 뒤 피부 변화, 리마인드 받기</p>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 10px" }}>
        루틴이 잘 맞았는지 2·4주 뒤 이메일로 딱 한 번씩만 알려드려요. 언제든 그만둘 수 있어요.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label="이메일 주소"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, minWidth: 0, fontSize: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" }}
        />
        <button
          onClick={submit}
          disabled={!consent || !email.trim() || state === "sending"}
          style={{ flexShrink: 0, background: "var(--ink)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: !consent || !email.trim() || state === "sending" ? 0.5 : 1 }}
        >
          {state === "sending" ? "…" : "신청"}
        </button>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: "var(--ink)", width: 15, height: 15 }} />
        <span>리마인드 발송을 위해 이메일 저장에 동의해요</span>
      </label>
      {state === "error" && <p style={{ fontSize: 12, color: "var(--plum)", marginTop: 8 }}>지금은 신청이 어려워요. 잠시 후 다시 시도해 주세요.</p>}
    </div>
  );
}

const box: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "14px 16px",
  marginTop: 14,
  background: "var(--surface)",
};
