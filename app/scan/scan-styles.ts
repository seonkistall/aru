import type { CSSProperties } from "react";

// Presentational styles for the scan screen, split out of page.tsx (no logic).

export const eyebrow: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 700,
};

export const titleStyle: CSSProperties = {
  fontFamily: "var(--font-ko-serif)",
  fontSize: 28,
  lineHeight: 1.22,
  color: "var(--ink)",
  margin: "6px 0 8px",
};

export const leadStyle: CSSProperties = {
  fontSize: 14,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginBottom: 20,
};

export const cameraFrame: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--surface-tint)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export function videoStyle(visible: boolean): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
    display: visible ? "block" : "none",
  };
}

export const primaryBtn: CSSProperties = {
  background: "var(--plum)",
  color: "var(--on-plum)",
  border: "none",
  borderRadius: 8,
  padding: "14px 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

export const outlineBtn: CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--ink)",
  borderRadius: 8,
  padding: "13px 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

export const feedBtn: CSSProperties = {
  flex: 1,
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const stepBtn: CSSProperties = {
  background: "var(--surface-tint)",
  border: "none",
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: 15,
  color: "var(--ink)",
  cursor: "pointer",
};

export const infoLinkBtn: CSSProperties = {
  display: "block",
  width: "100%",
  background: "transparent",
  border: "none",
  marginTop: 8,
  padding: 4,
  fontSize: 12.5,
  color: "var(--text-muted)",
  textDecoration: "underline",
  cursor: "pointer",
  textAlign: "center",
};

export const consentStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  marginTop: 12,
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

export const modePanelStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--surface)",
};

export const modeButtonStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 4px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

export const resultCardStyle: CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  borderRadius: 8,
  padding: "28px 24px",
  border: "1px solid var(--line)",
  animation: "gyeol-fade-up .5s ease-out both",
};

export const debugStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--ink-soft)",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  overflowX: "auto",
};

export function confidenceBox(retake: boolean): CSSProperties {
  return {
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: retake ? "var(--plum-soft)" : "var(--surface)",
    padding: "12px 14px",
    marginBottom: 16,
  };
}

export const ghostLink: CSSProperties = { color: "var(--text-muted)", fontSize: 13, marginTop: 8, textDecoration: "underline" };
export const fallbackText: CSSProperties = { color: "var(--ink-soft)", fontSize: 14, textAlign: "center", lineHeight: 1.5 };
