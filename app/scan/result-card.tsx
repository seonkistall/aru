import { getLang, t } from "@/lib/i18n/core";
import { localizedNarrative, type SkinReads } from "@/lib/skin";
import { eyebrow } from "./scan-styles";

const LOCALES: Record<string, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN", ar: "ar" };

// Hand-drawn zigzag tear line for the receipt edges (stretched to card width).
function TearEdge({ flip = false }: { flip?: boolean }) {
  const points: string[] = [];
  for (let x = 0; x <= 340; x += 14) points.push(`${x},${x % 28 === 0 ? 9 : 1}`);
  return (
    <svg
      width="100%"
      height="10"
      viewBox="0 0 340 10"
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", transform: flip ? "scaleY(-1)" : undefined }}
    >
      <polyline points={points.join(" ")} fill="none" stroke="var(--ink)" strokeWidth="1.6" filter="url(#sketch-soft)" />
    </svg>
  );
}

// Decorative sketch barcode — fixed pattern, purely visual.
const BAR_WIDTHS = [3, 1, 2, 1, 4, 2, 1, 3, 1, 1, 2, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 4, 1, 2];
const BARS = BAR_WIDTHS.reduce<{ x: number; w: number }[]>((acc, w) => {
  const prev = acc[acc.length - 1];
  acc.push({ x: prev ? prev.x + prev.w + 2.4 : 0, w: w * 1.6 });
  return acc;
}, []);
function Barcode() {
  return (
    <svg width="132" height="26" viewBox="0 0 132 26" aria-hidden style={{ filter: "url(#sketch-soft)" }}>
      {BARS.map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.w} height={26} fill="var(--ink)" />
      ))}
    </svg>
  );
}

function DotRow({ label, value, calm, delay }: { label: string; value: string; calm?: boolean; delay: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        padding: "9px 0",
        animation: "gyeol-fade-up .45s ease-out both",
        animationDelay: `${delay}ms`,
      }}
    >
      <span style={{ fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{label}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: "2px dotted var(--line)", margin: "0 8px", transform: "translateY(-4px)" }} />
      <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: calm ? "var(--text-muted)" : "var(--plum)", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// The on-screen skin report shown after a successful scan (result phase),
// styled as a light-hearted receipt: tear edges, dot-leader line items, the
// confidence as the "total" line, a sketch barcode, and a tilted stamp.
export function ResultCard({ reads }: { reads: SkinReads }) {
  const confidencePct = Math.round(reads.confidence * 100);
  const now = new Date();
  const dateLine = now.toLocaleDateString(LOCALES[getLang()] ?? "ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  const timeLine = now.toLocaleTimeString(LOCALES[getLang()] ?? "ko-KR", { hour: "2-digit", minute: "2-digit" });
  const rows = [
    { label: "유분", ...reads.oil },
    { label: "모공/결", ...reads.pores },
    { label: "붉은기", ...reads.redness },
    { label: "전반", ...reads.overall },
  ];

  return (
    <div style={{ width: "100%", animation: "gyeol-fade-up .5s ease-out both" }}>
      <TearEdge flip />
      <div style={{ background: "var(--surface)", borderLeft: "1.6px solid var(--ink)", borderRight: "1.6px solid var(--ink)", padding: "20px 22px 16px", position: "relative" }}>
        {/* receipt header */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: "var(--ink)", margin: 0 }}>{t("아루")}</p>
          <p style={{ ...eyebrow, marginTop: 6 }}>{t("오늘의 피부 리포트")}</p>
          <p style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.06em" }}>
            {dateLine} · {timeLine}
          </p>
        </div>

        <div style={{ borderTop: "2px dashed var(--line)", margin: "14px 0 12px" }} />

        <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 28, lineHeight: 1.25, color: "var(--ink)", margin: "0 0 6px", whiteSpace: "pre-line", textAlign: "center" }}>
          {t(reads.headline)}
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, textAlign: "center", margin: "0 0 4px" }}>{localizedNarrative(reads)}</p>

        <div style={{ borderTop: "2px dashed var(--line)", margin: "14px 0 4px" }} />

        {/* line items */}
        {rows.map((row, index) => (
          <DotRow key={row.label} label={t(row.label)} value={t(row.value)} calm={row.calm} delay={160 + index * 110} />
        ))}
        {reads.extras?.map((extra, index) => (
          <div key={extra.label} style={{ animation: "gyeol-fade-up .45s ease-out both", animationDelay: `${600 + index * 110}ms` }}>
            <DotRow label={t(extra.label)} value={t(extra.value)} calm={extra.calm} delay={0} />
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "-4px 0 4px" }}>{t(extra.note)}</p>
          </div>
        ))}

        {/* total line: analysis confidence */}
        <div style={{ borderTop: "2px solid var(--ink)", marginTop: 10, paddingTop: 10, animation: "gyeol-fade-up .45s ease-out both", animationDelay: "760ms" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: reads.retakeRecommended ? "var(--plum-press)" : "var(--ink)" }}>
              {t("분석 신뢰도 {level}", { level: t(reads.confidenceLabel) })}
            </span>
            <span style={{ fontFeatureSettings: '"tnum"', fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: reads.retakeRecommended ? "var(--plum)" : "var(--ink)" }}>
              {confidencePct}%
            </span>
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

        <div style={{ borderTop: "2px dashed var(--line)", margin: "12px 0 10px" }} />

        {/* capture environment checklist */}
        <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 6 }}>{t("측정 환경")}</p>
        <div style={{ display: "grid", gap: 4 }}>
          {reads.signals.map((signal) => (
            <div key={signal.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-muted)" }}>
              <span style={{ width: 12, textAlign: "center", color: signal.ok ? "var(--success)" : "var(--plum)" }}>{signal.ok ? "✓" : "!"}</span>
              <span>{t(signal.label)} · {t(signal.detail)}</span>
            </div>
          ))}
        </div>

        {/* barcode footer + tilted stamp */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16, animation: "gyeol-fade-up .45s ease-out both", animationDelay: "880ms" }}>
          <Barcode />
          <p style={{ fontFeatureSettings: '"tnum"', fontSize: 10.5, letterSpacing: "0.18em", color: "var(--text-muted)", marginTop: 4 }}>
            ARU·SKIN·{now.getFullYear()}{String(now.getMonth() + 1).padStart(2, "0")}{String(now.getDate()).padStart(2, "0")}
          </p>
        </div>
      </div>
      <TearEdge />
    </div>
  );
}
