"use client";

// Last-resort boundary for errors thrown in the root layout itself. It replaces
// <html>/<body>, so it must render them and cannot rely on layout styles.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", background: "#fbf8f3", color: "#2b2b2b", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontSize: 22, fontWeight: 700 }}>앗, 문제가 생겼어요</p>
        <p style={{ fontSize: 15, color: "#6b6b6b", lineHeight: 1.6, maxWidth: 320 }}>잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={reset}
          style={{ background: "#7a4a6b", color: "#fff", border: "none", borderRadius: 8, padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
