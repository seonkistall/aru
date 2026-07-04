"use client";

// Compact "my history" strip (MAU re-engagement) — shows recent scans as small
// bars so a returning user sees their skin trend. Reads on-device history after
// mount; renders nothing until there are at least 2 scans to compare.
import { useEffect, useState } from "react";
import { getScanHistory, type ScanHistoryEntry } from "@/lib/scan-history";

const LEVEL_COLOR = ["var(--success)", "var(--bronze)", "var(--plum)"];

export function ScanHistoryStrip() {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setHistory(getScanHistory());
  }, []);

  if (history.length < 2) return null;
  const recent = history.slice(-6);

  // Label from the stored timestamp, not the array index — a same-day scan reads
  // "오늘" and a stale newest scan ages correctly.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayLabel = (ts: number) => {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    const days = Math.round((startOfToday.getTime() - day.getTime()) / 86400000);
    return days <= 0 ? "오늘" : `${days}일 전`;
  };

  return (
    <section style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <p style={label}>내 기록</p>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>최근 {history.length}회 스캔</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 44 }}>
        {recent.map((entry) => {
          const overall = Math.max(entry.oil, entry.redness, entry.pores); // 0-2
          const h = 14 + overall * 13;
          return (
            <div key={entry.ts} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", maxWidth: 26, height: h, borderRadius: 5, background: LEVEL_COLOR[overall] }} />
              <span style={{ fontSize: 10, color: "var(--faint)" }}>{dayLabel(entry.ts)}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>막대가 낮을수록 신호가 잔잔해요 · 참고용 흐름이에요</p>
    </section>
  );
}

const wrap: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "16px 18px", marginBottom: 20 };
const label: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
