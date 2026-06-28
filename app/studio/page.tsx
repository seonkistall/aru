"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";

type Read = { label: string; value: string; calm?: boolean };

const PRESETS: { name: string; headline: string; reads: Read[] }[] = [
  {
    name: "차분·건강",
    headline: "차분하고\n건강한 결",
    reads: [
      { label: "유분", value: "살짝 있음" },
      { label: "모공", value: "신경 쓰이는 정도" },
      { label: "홍조", value: "거의 없음", calm: true },
      { label: "전반", value: "건강한 편", calm: true },
    ],
  },
  {
    name: "건조·예민",
    headline: "조금은\n목마른 결",
    reads: [
      { label: "수분", value: "부족 신호" },
      { label: "각질", value: "군데군데" },
      { label: "홍조", value: "약간 보임" },
      { label: "전반", value: "진정이 필요", calm: true },
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
    setReads(PRESETS[i].reads.map((r) => ({ ...r })));
  }

  function setRead(i: number, patch: Partial<Read>) {
    setReads((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function download() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3, // 360x640 -> 1080x1920 (Shorts/Reels/TikTok)
        cacheBust: true,
        backgroundColor: "#f7f3ec",
      });
      const a = document.createElement("a");
      a.download = "gyeol-card.png";
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error(e);
      alert("이미지 생성 실패. 콘솔 확인.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--bronze)",
            fontWeight: 600,
          }}
        >
          결 · 카드 스튜디오
        </p>
        <h1
          className="font-serif"
          style={{ fontSize: 26, color: "var(--ink)", margin: "6px 0 4px", letterSpacing: "-0.01em" }}
        >
          내 결 카드 만들기
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 22 }}>
          스캔 결과를 적고 PNG로 받아 숏폼에 올려보세요. (정량 수치 없이 정성 표현만 — 가짜 숫자 금지)
        </p>

        {/* ── The shareable card (360x640, exported at 3x = 1080x1920) ── */}
        <div className="flex justify-center mb-7">
          <div
            ref={cardRef}
            style={{
              width: 360,
              height: 640,
              background: "var(--paper)",
              padding: "34px 30px",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 18px 50px rgba(40,30,20,.18)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="font-serif" style={{ fontSize: 22, color: "var(--ink)" }}>
                결<span style={{ color: "var(--plum)" }}>.</span>
              </span>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--bronze)",
                  fontWeight: 600,
                }}
              >
                오늘의 피부 무드
              </span>
            </div>

            <h2
              style={{
                fontFamily: "var(--font-ko-serif)",
                fontSize: 40,
                lineHeight: 1.2,
                color: "var(--ink)",
                margin: "30px 0 6px",
                whiteSpace: "pre-line",
              }}
            >
              {headline}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}>
              정직하게, 보이는 것만 읽었어요
            </p>

            <div style={{ borderTop: "1px solid var(--line)" }}>
              {reads.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "13px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>{r.label}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-ko-serif)",
                      fontSize: 15,
                      color: r.calm ? "var(--text-muted)" : "var(--plum)",
                    }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ flex: 1 }} />
            <div style={{ height: 1, width: 34, background: "var(--bronze)", margin: "0 auto 16px", opacity: 0.75 }} />
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
              결 · 30초면 내 피부 결을 안다
            </p>
          </div>
        </div>

        {/* ── Controls ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(i)}
              style={{
                fontSize: 12,
                color: "var(--muted)",
                background: "var(--surface-tint)",
                border: "none",
                borderRadius: 9999,
                padding: "6px 13px",
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
          헤드라인 (줄바꿈 가능)
        </label>
        <textarea
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            fontFamily: "var(--font-ko-serif)",
            fontSize: 18,
            color: "var(--ink)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "11px 13px",
            marginBottom: 18,
            resize: "vertical",
          }}
        />

        {reads.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <input
              value={r.label}
              onChange={(e) => setRead(i, { label: e.target.value })}
              style={{ width: 96, fontSize: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" }}
            />
            <input
              value={r.value}
              onChange={(e) => setRead(i, { value: e.target.value })}
              style={{ flex: 1, fontSize: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" }}
            />
            <button
              onClick={() => setRead(i, { calm: !r.calm })}
              title="차분 톤(muted) 토글"
              style={{ fontSize: 11, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: r.calm ? "var(--surface-tint)" : "transparent", color: "var(--muted)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {r.calm ? "차분" : "강조"}
            </button>
          </div>
        ))}

        <button
          onClick={download}
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 18,
            background: "var(--plum)",
            color: "var(--on-plum)",
            border: "none",
            borderRadius: 8,
            padding: "15px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "생성 중…" : "PNG 다운로드 (1080×1920)"}
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 10 }}>
          숏폼(릴스·쇼츠·틱톡) 세로 규격. 손으로 올려 저장·공유율을 측정하세요.
        </p>
      </div>
    </main>
  );
}
