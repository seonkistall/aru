"use client";

import Link from "next/link";
import { useState } from "react";
import { clearPilotNotes, exportPilotNotes, getPilotNotes, savePilotNote, type PilotBrowser, type PilotLighting } from "@/lib/pilot";

export default function PilotPage() {
  const [participant, setParticipant] = useState("");
  const [browser, setBrowser] = useState<PilotBrowser>("ios-safari");
  const [lighting, setLighting] = useState<PilotLighting>("window");
  const [makeup, setMakeup] = useState<"none" | "light" | "heavy">("none");
  const [glasses, setGlasses] = useState(false);
  const [hairCover, setHairCover] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(true);
  const [consentAi, setConsentAi] = useState(false);
  const [consentCrop, setConsentCrop] = useState(false);
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(() => getPilotNotes().length);

  function save() {
    savePilotNote({ participant, browser, lighting, makeup, glasses, hairCover, scanCompleted, consentAi, consentCrop, notes });
    setParticipant("");
    setNotes("");
    setGlasses(false);
    setHairCover(false);
    setConsentAi(false);
    setConsentCrop(false);
    setCount(getPilotNotes().length);
  }

  function clear() {
    clearPilotNotes();
    setCount(0);
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>pilot qa</p>
        <h1 style={titleStyle}>30명 파일럿 기록</h1>
        <p style={leadStyle}>스캔 결과와 별도로 디바이스, 조명, 메이크업 상태를 남겨 카메라 품질과 ML 편차를 볼 수 있게 합니다.</p>

        <section style={sectionStyle}>
          <label style={labelStyle}>참가자 코드</label>
          <input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="P001" style={inputStyle} />

          <label style={labelStyle}>브라우저/기기</label>
          <Select value={browser} onChange={(v) => setBrowser(v as PilotBrowser)} options={[
            ["ios-safari", "iPhone Safari"],
            ["android-chrome", "Android Chrome"],
            ["desktop", "Desktop check"],
            ["other", "Other"],
          ]} />

          <label style={labelStyle}>조명</label>
          <Select value={lighting} onChange={(v) => setLighting(v as PilotLighting)} options={[
            ["window", "창가 부드러운 빛"],
            ["ceiling", "천장 조명"],
            ["dim", "어두운 실내"],
            ["backlight", "역광"],
            ["direct", "직접/강한 조명"],
          ]} />

          <label style={labelStyle}>메이크업</label>
          <Select value={makeup} onChange={(v) => setMakeup(v as "none" | "light" | "heavy")} options={[
            ["none", "없음"],
            ["light", "가벼움"],
            ["heavy", "진함"],
          ]} />

          <Check label="안경 착용" checked={glasses} onChange={setGlasses} />
          <Check label="머리카락이 이마/볼을 가림" checked={hairCover} onChange={setHairCover} />
          <Check label="스캔 완료" checked={scanCompleted} onChange={setScanCompleted} />
          <Check label="AI 분석 전송 동의" checked={consentAi} onChange={setConsentAi} />
          <Check label="학습용 크롭 저장 동의" checked={consentCrop} onChange={setConsentCrop} />

          <label style={labelStyle}>메모</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="윤곽선 위치, 반사 판단, 촬영 버튼 조건 등을 적어주세요." style={textareaStyle} />

          <button onClick={save} disabled={!participant.trim()} style={{ ...primaryBtn, width: "100%", opacity: participant.trim() ? 1 : 0.55 }}>
            기록 저장
          </button>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>현재 기록 {count}개</p>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <button onClick={exportPilotNotes} style={outlineBtn}>파일럿 CSV 내보내기</button>
            <button onClick={clear} style={dangerBtn}>파일럿 기록 삭제</button>
          </div>
        </section>

        <Link href="/ops" style={{ ...outlineLink, display: "block", textAlign: "center", marginBottom: 10 }}>운영 대시보드 보기</Link>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/scan" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>스캔 테스트</Link>
          <Link href="/privacy" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>동의 문구 확인</Link>
        </div>
      </div>
    </main>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "var(--ink-soft)", margin: "10px 0", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--plum)", width: 16, height: 16 }} />
      {label}
    </label>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.2, color: "var(--ink)", margin: "8px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 22 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 14 };
const sectionLabel: React.CSSProperties = { fontSize: 12, color: "var(--ink)", fontWeight: 800 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "12px 0 6px" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "11px 12px", fontSize: 14 };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };
const primaryBtn: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", border: "none", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 10 };
const outlineBtn: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "#8f3f3b", border: "1px solid #d8b8b3", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
