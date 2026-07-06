"use client";

// Local routine reminder button: downloads a daily AM/PM .ics the user adds to
// their own calendar (no backend/push) and marks the routine saved on-device.
import { useState } from "react";
import { downloadRoutineIcs, markRoutineSaved } from "@/lib/routine-reminder";

export function RoutineReminder({ label }: { label: string }) {
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ marginTop: 14, display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => {
          downloadRoutineIcs(label);
          markRoutineSaved(label);
          setSaved(true);
        }}
        style={btn}
      >
        📅 아침·저녁 리마인더 추가
      </button>
      <span style={{ fontSize: 12.5, color: saved ? "var(--success)" : "var(--text-muted)" }}>
        {saved ? "캘린더에 매일 알림을 추가했어요" : "내 캘린더에 매일 알림으로 저장돼요"}
      </span>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "var(--surface-tint)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
};
