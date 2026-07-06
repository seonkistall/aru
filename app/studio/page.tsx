"use client";

import { useEffect, useRef, useState } from "react";
import { recordFunnelEvent } from "@/lib/funnel";
import { downloadCardImage, ShareCard, shareCardImage, type CardRead as Read } from "@/app/components/share-card";
import { loadLastResult } from "@/lib/last-result";
import type { SkinReads } from "@/lib/skin";

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
  const [err, setErr] = useState("");
  const [fromScan, setFromScan] = useState(false);

  useEffect(() => {
    // Prefill with the user's real scan — this tab's session first, then the
    // saved last result (returning visitor), so a returning user still shares
    // their real card. Presets stay as the fallback. Loaded after mount
    // (sessionStorage is client-only; render-time reads break hydration).
    let scan: SkinReads | null = null;
    try {
      const raw = sessionStorage.getItem("gyeol_reads");
      if (raw) scan = JSON.parse(raw) as SkinReads;
    } catch {
      /* ignore */
    }
    if (!scan?.oil?.value) scan = loadLastResult()?.reads ?? null;
    if (!scan?.oil?.value) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setHeadline(scan.headline || PRESETS[0].headline);
    setReads([
      { label: "유분", value: scan.oil.value, calm: scan.oil.calm },
      { label: "모공/결", value: scan.pores.value, calm: scan.pores.calm },
      { label: "붉은기", value: scan.redness.value, calm: scan.redness.calm },
      { label: "전반", value: scan.overall.value, calm: scan.overall.calm },
    ]);
    setFromScan(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
    setErr("");
    try {
      await downloadCardImage(cardRef.current);
    } catch {
      setErr("이미지를 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!cardRef.current) return;
    setBusy(true);
    setErr("");
    try {
      await shareCardImage(cardRef.current, {
        onShare: (mode) => recordFunnelEvent("share_clicked", { surface: "studio", mode }),
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr("공유에 실패했어요. PNG 저장을 이용해 주세요.");
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
          <ShareCard ref={cardRef} headline={headline} reads={reads} />
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

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={share} disabled={busy} style={{ ...downloadBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>
            {busy ? "생성 중..." : "공유하기"}
          </button>
          <button
            onClick={download}
            disabled={busy}
            style={{ ...downloadBtn, flex: 1, background: "transparent", color: "var(--ink)", border: "1px solid var(--ink)", opacity: busy ? 0.6 : 1 }}
          >
            PNG 저장
          </button>
        </div>
        {fromScan && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, textAlign: "center" }}>오늘 스캔 결과를 불러왔어요. 문구는 자유롭게 고쳐도 돼요.</p>}
        {err && <p style={{ fontSize: 13, color: "var(--plum)", marginTop: 10, textAlign: "center" }}>{err}</p>}
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 26, color: "var(--ink)", margin: "6px 0 4px" };
const presetBtn: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", background: "var(--surface-tint)", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 };
const textareaStyle: React.CSSProperties = { width: "100%", fontFamily: "var(--font-ko-serif)", fontSize: 18, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "11px 13px", marginBottom: 18, resize: "vertical" };
const inputStyle: React.CSSProperties = { fontSize: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" };
const downloadBtn: React.CSSProperties = { width: "100%", marginTop: 18, background: "var(--plum)", color: "var(--on-plum)", border: "none", borderRadius: 8, padding: "15px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" };

function toggleBtn(calm?: boolean): React.CSSProperties {
  return { fontSize: 11, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", background: calm ? "var(--surface-tint)" : "transparent", color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" };
}
