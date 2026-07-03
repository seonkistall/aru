"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";

type Read = { label: string; value: string; calm?: boolean };

const PRESETS: { name: string; headline: string; reads: Read[] }[] = [
  {
    name: "차분한 결",
    headline: "차분하고\n편안한 결",
    reads: [
      { label: "유분", value: "유분 적음", calm: true },
      { label: "모공/결", value: "결 매끈", calm: true },
      { label: "붉은기", value: "붉은기 낮음", calm: true },
      { label: "전반", value: "편안한 편", calm: true },
    ],
  },
  {
    name: "유분 케어",
    headline: "윤기가\n도드라지는 결",
    reads: [
      { label: "유분", value: "유분 많음" },
      { label: "모공/결", value: "결 약간 보임" },
      { label: "붉은기", value: "붉은기 약간" },
      { label: "전반", value: "균형 조절 필요", calm: true },
    ],
  },
];

export default function Studio() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [headline, setHeadline] = useState(PRESETS[0].headline);
  const [reads, setReads] = useState<Read[]>(PRESETS[0].reads);
  const [busy, setBusy] = useState(false);

  function applyPreset(i: number) {
    setHeadline(PRESETS[i].headline);
    setReads(PRESETS[i].reads.map((read) => ({ ...read })));
  }

  function setRead(i: number, patch: Partial<Read>) {
    setReads((list) => list.map((read, idx) => (idx === i ? { ...read, ...patch } : read)));
  }

  async function download() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.download = "kbeauty-skin-card.png";
      a.href = dataUrl;
      a.click();
    } catch {
      alert("이미지를 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>카드 스튜디오</p>
        <h1 style={titleStyle}>피부 리포트 카드 만들기</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 22, lineHeight: 1.55 }}>
          스캔 결과를 숏폼이나 상담 공유용 이미지로 저장할 수 있어요.
        </p>

        <div className="flex justify-center mb-7">
          <div ref={cardRef} style={cardPreview}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>아루</span>
              <span style={miniLabel}>skin mood</span>
            </div>
            <h2 style={cardHeadline}>{headline}</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}>보이는 특징만 정직하게 읽었어요.</p>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              {reads.map((read) => (
                <div key={read.label} style={rowStyle}>
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>{read.label}</span>
                  <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: read.calm ? "var(--text-muted)" : "var(--plum)" }}>{read.value}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ height: 1, width: 34, background: "var(--bronze)", margin: "0 auto 16px", opacity: 0.75 }} />
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>30초 피부 스캔</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PRESETS.map((preset, i) => (
            <button key={preset.name} onClick={() => applyPreset(i)} style={presetBtn}>{preset.name}</button>
          ))}
        </div>

        <label style={labelStyle}>헤드라인</label>
        <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={2} style={textareaStyle} />

        {reads.map((read, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <input value={read.label} onChange={(e) => setRead(i, { label: e.target.value })} style={{ ...inputStyle, width: 96 }} />
            <input value={read.value} onChange={(e) => setRead(i, { value: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => setRead(i, { calm: !read.calm })} style={toggleBtn(read.calm)}>{read.calm ? "차분" : "강조"}</button>
          </div>
        ))}

        <button onClick={download} disabled={busy} style={{ ...downloadBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "생성 중..." : "PNG 다운로드"}
        </button>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 26, color: "var(--ink)", margin: "6px 0 4px" };
const miniLabel: React.CSSProperties = { fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const cardPreview: React.CSSProperties = { width: 360, height: 640, background: "var(--paper)", padding: "34px 30px", display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" };
const cardHeadline: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 40, lineHeight: 1.2, color: "var(--ink)", margin: "30px 0 6px", whiteSpace: "pre-line" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "13px 0", borderBottom: "1px solid var(--line)" };
const presetBtn: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", background: "var(--surface-tint)", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 };
const textareaStyle: React.CSSProperties = { width: "100%", fontFamily: "var(--font-ko-serif)", fontSize: 18, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "11px 13px", marginBottom: 18, resize: "vertical" };
const inputStyle: React.CSSProperties = { fontSize: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" };
const downloadBtn: React.CSSProperties = { width: "100%", marginTop: 18, background: "var(--plum)", color: "var(--on-plum)", border: "none", borderRadius: 8, padding: "15px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" };

function toggleBtn(calm?: boolean): React.CSSProperties {
  return { fontSize: 11, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", background: calm ? "var(--surface-tint)" : "transparent", color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" };
}
