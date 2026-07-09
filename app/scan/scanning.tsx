import { t } from "@/lib/i18n/core";
import { ANALYSIS_STEPS } from "./types";

// Overlay shown during the ~3.3s analysis: a sweeping scan line plus the four
// paced analysis stages. `step` is the current stage index (0-based).
export function Scanning({ step }: { step: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.22)" }} />
      <div style={{ position: "absolute", left: "8%", right: "8%", height: 2, background: "var(--blue)", animation: "gyeol-scan 1.1s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 14 }}>
        <div style={{ background: "rgba(255,255,255,.95)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "11px 16px 12px", minWidth: 230 }}>
          <p style={{ fontFamily: "var(--font-hand)", fontSize: 19, color: "var(--ink)", margin: "0 0 7px" }}>{t("피부 신호를 읽는 중")}</p>
          <div style={{ height: 2, background: "var(--line)", borderRadius: 2, overflow: "hidden", margin: "0 0 8px" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (step / ANALYSIS_STEPS.length) * 100)}%`, background: "var(--blue)", transition: "width .5s ease" }} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {ANALYSIS_STEPS.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 11.5,
                    color: done ? "var(--success)" : active ? "var(--ink)" : "var(--muted)",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span style={{ width: 12, textAlign: "center", animation: active ? "gyeol-bob 1.1s ease-in-out infinite" : undefined }}>
                    {done ? "✓" : active ? "●" : "○"}
                  </span>
                  <span>{t(label)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
