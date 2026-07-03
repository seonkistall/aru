import Link from "next/link";

// The product journey in the xiaohei voice: 촬영 → 분석 → 추천 → 케어.
// Past steps stay tappable links; the current one is inked; future ones quiet.

type FlowKey = "scan" | "survey" | "report" | "care";

const STEPS: Array<{ key: FlowKey; label: string; href: string }> = [
  { key: "scan", label: "촬영", href: "/scan" },
  { key: "survey", label: "설문", href: "/survey" },
  { key: "report", label: "추천", href: "/report" },
  { key: "care", label: "케어", href: "/care" },
];

export function FlowSteps({ current }: { current: FlowKey }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <nav aria-label="진행 단계" style={{ display: "flex", alignItems: "center", gap: 7, margin: "2px 0 14px" }}>
      <Link href="/" aria-label="홈으로" style={{ fontFamily: "var(--font-hand)", fontSize: 22, lineHeight: 1, color: "var(--ink)", textDecoration: "none", paddingBottom: 2 }}>
        결
      </Link>
      <span aria-hidden style={{ width: 1, height: 14, background: "var(--line)", marginRight: 2 }} />
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "next";
        const label = (
          <span
            style={{
              fontFamily: "var(--font-hand)",
              fontSize: 18,
              lineHeight: 1,
              color: state === "current" ? "var(--ink)" : state === "done" ? "var(--ink-soft)" : "var(--muted)",
              borderBottom: state === "current" ? "2px solid var(--ink)" : "2px solid transparent",
              paddingBottom: 2,
            }}
          >
            {step.label}
          </span>
        );
        return (
          <span key={step.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {index > 0 && (
              <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden style={{ filter: "url(#sketch-soft)" }}>
                <path d="M1 5 L12 5 M12 5 L8.5 2.2 M12 5 L8.5 7.8" stroke="var(--orange)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
            )}
            {state === "done" ? (
              <Link href={step.href} style={{ textDecoration: "none" }}>
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        );
      })}
    </nav>
  );
}
