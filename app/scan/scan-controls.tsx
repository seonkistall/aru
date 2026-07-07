import type { CSSProperties } from "react";
import { infoLinkBtn } from "./scan-styles";

type ScanControlsProps = {
  aiConsent: boolean;
  datasetConsent: boolean;
  autoCapture: boolean;
  onAiConsentChange: (value: boolean) => void;
  onDatasetConsentChange: (value: boolean) => void;
  onAutoCaptureChange: (value: boolean) => void;
  onInfoOpen: () => void;
};

export function ScanControls({
  aiConsent,
  datasetConsent,
  autoCapture,
  onAiConsentChange,
  onDatasetConsentChange,
  onAutoCaptureChange,
  onInfoOpen,
}: ScanControlsProps) {
  return (
    <section style={panelStyle} aria-labelledby="scan-options-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2 id="scan-options-title" style={titleStyle}>촬영 옵션</h2>
        <span style={privacyPill}>기본값: 기기 안에서 처리</span>
      </div>
      <div style={optionGrid}>
        <ToggleRow
          label="자동 촬영"
          detail="조건이 맞으면 3초 카운트다운 후 촬영"
          checked={autoCapture}
          accent="var(--ink)"
          onChange={onAutoCaptureChange}
        />
        <ToggleRow
          label="AI 분석 전송"
          detail="선택 시 crop을 서버 분석에 사용"
          checked={aiConsent}
          accent="var(--blue)"
          onChange={onAiConsentChange}
        />
      </div>
      <ToggleRow
        label="연구용 학습 crop 저장"
        detail="동의한 파일만 이 기기에 최대 120개 보관"
        checked={datasetConsent}
        accent="var(--blue)"
        onChange={onDatasetConsentChange}
      />
      <button type="button" onClick={onInfoOpen} style={infoLinkBtn}>
        촬영 팁 · 동의 안내 보기
      </button>
    </section>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  accent,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  accent: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={toggleStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: accent, width: 18, height: 18, flexShrink: 0 }}
      />
      <span>
        <span style={toggleLabel}>{label}</span>
        <span style={toggleDetail}>{detail}</span>
      </span>
    </label>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--surface)",
  padding: "13px 14px 10px",
  marginTop: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 800,
};

const privacyPill: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "3px 8px",
  color: "var(--text-muted)",
  fontSize: 11.5,
  whiteSpace: "nowrap",
};

const optionGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const toggleStyle: CSSProperties = {
  minHeight: 52,
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--paper)",
  padding: "10px 11px",
  marginTop: 8,
  cursor: "pointer",
};

const toggleLabel: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 800,
  color: "var(--ink)",
  lineHeight: 1.25,
};

const toggleDetail: CSSProperties = {
  display: "block",
  marginTop: 3,
  fontSize: 11.8,
  color: "var(--text-muted)",
  lineHeight: 1.35,
};
