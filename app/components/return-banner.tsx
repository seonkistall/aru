"use client";

// Returning-visitor re-entry (MAU lever). Renders nothing until it confirms a
// saved result on the device, so there's no SSR/hydration mismatch — it starts
// empty on the server and reveals after mount.
import Link from "next/link";
import { useEffect, useState } from "react";
import { hasLastResult } from "@/lib/last-result";
import { t } from "@/lib/i18n/core";

export function ReturnBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setShow(hasLastResult());
  }, []);

  if (!show) return null;

  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
      <Link href="/report" style={primary}>
        {t("지난 결과 이어보기 →")}
      </Link>
      <Link href="/scan" style={ghost}>
        {t("다시 스캔하기")}
      </Link>
    </div>
  );
}

const primary: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 19,
  color: "var(--plum)",
  textDecoration: "none",
  borderBottom: "2px solid var(--plum)",
  paddingBottom: 1,
};

const ghost: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 19,
  color: "var(--text-muted)",
  textDecoration: "none",
};
