"use client";

// Route-segment error boundary. Catches render/runtime errors in any page so a
// single broken screen never leaves the user on a blank white page. `reset()`
// re-renders the segment; the home link is the always-available escape hatch.
import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--paper)", color: "var(--ink)", gap: 14 }}
    >
      <p style={{ fontFamily: "var(--font-hand)", fontSize: 40, lineHeight: 1.1 }}>앗, 잠깐 멈췄어요</p>
      <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 320 }}>
        일시적인 문제가 생겼어요. 다시 시도하면 대부분 해결돼요.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button type="button" onClick={reset} style={btn}>
          다시 시도
        </button>
        <Link href="/" style={{ ...btn, background: "transparent", color: "var(--ink)", border: "1px solid var(--ink)", textDecoration: "none" }}>
          처음으로
        </Link>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  background: "var(--plum)",
  color: "var(--on-plum)",
  border: "none",
  borderRadius: 8,
  padding: "13px 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
