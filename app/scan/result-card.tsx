import { t } from "@/lib/i18n/core";
import type { SkinReads } from "@/lib/skin";
import { confidenceBox, eyebrow, resultCardStyle } from "./scan-styles";

// The on-screen skin report shown after a successful scan (result phase).
export function ResultCard({ reads }: { reads: SkinReads }) {
  const confidencePct = Math.round(reads.confidence * 100);
  const rows = [
    { label: "유분", ...reads.oil },
    { label: "모공/결", ...reads.pores },
    { label: "붉은기", ...reads.redness },
    { label: "전반", ...reads.overall },
  ];
  return (
    <div style={resultCardStyle}>
      <p style={eyebrow}>{t("오늘의 피부 리포트")}</p>
      <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 34, lineHeight: 1.2, color: "var(--ink)", margin: "10px 0 8px", whiteSpace: "pre-line" }}>
        {t(reads.headline)}
      </h2>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 18 }}>{t(reads.narrative)}</p>
      <div style={confidenceBox(reads.retakeRecommended)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: reads.retakeRecommended ? "var(--plum-press)" : "var(--success)" }}>
            {t("분석 신뢰도 {level}", { level: t(reads.confidenceLabel) })}
          </span>
          <span style={{ fontFeatureSettings: '"tnum"', fontSize: 18, fontWeight: 900, color: "var(--ink)" }}>{confidencePct}%</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5, marginTop: 6 }}>
          {reads.retakeRecommended
            ? t("이 결과는 추천에서 참고만 하고, 설문 답변을 더 크게 반영할게요.")
            : t("촬영 품질이 충분해서 추천 기준에 스캔 신호를 함께 반영할게요.")}
        </p>
        {reads.retakeReasons.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {reads.retakeReasons.map((reason) => (
              <span key={reason} style={{ fontSize: 12, color: "var(--plum-press)" }}>{t(reason)}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        {rows.map((row, index) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "13px 0",
              borderBottom: "1px solid var(--line)",
              animation: "gyeol-fade-up .45s ease-out both",
              animationDelay: `${160 + index * 110}ms`,
            }}
          >
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{t(row.label)}</span>
            <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: row.calm ? "var(--text-muted)" : "var(--plum)" }}>{t(row.value)}</span>
          </div>
        ))}
      </div>
      {reads.extras && reads.extras.length > 0 && (
        <div>
          {reads.extras.map((extra, index) => (
            <div
              key={extra.label}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--line)",
                animation: "gyeol-fade-up .45s ease-out both",
                animationDelay: `${620 + index * 110}ms`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, color: "var(--ink)" }}>{t(extra.label)}</span>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: extra.calm ? "var(--text-muted)" : "var(--plum)" }}>{t(extra.value)}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{t(extra.note)}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, animation: "gyeol-fade-up .45s ease-out both", animationDelay: "880ms" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 6 }}>{t("측정 환경")}</p>
        <div style={{ display: "grid", gap: 4 }}>
          {reads.signals.map((signal) => (
            <div key={signal.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-muted)" }}>
              <span style={{ width: 12, textAlign: "center", color: signal.ok ? "var(--success)" : "var(--plum)" }}>{signal.ok ? "✓" : "!"}</span>
              <span>{t(signal.label)} · {t(signal.detail)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
