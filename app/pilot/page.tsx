"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  PILOT_PARTICIPANT_IDS,
  clearPilotNotes,
  exportPilotNotes,
  getCurrentPilotSession,
  getPilotNotes,
  isPilotParticipantId,
  normalizeParticipantId,
  savePilotNote,
  type PilotBrowser,
  type PilotLighting,
  type PilotStatus,
} from "@/lib/pilot";

export default function PilotPage() {
  const current = getCurrentPilotSession();
  const [participant, setParticipant] = useState(current?.participantId || "P001");
  const [round, setRound] = useState(current?.round || "pilot-1");
  const [deviceId, setDeviceId] = useState(current?.deviceId || "");
  const [reviewerId, setReviewerId] = useState(current?.reviewerId || "");
  const [status, setStatus] = useState<PilotStatus>("planned");
  const [browser, setBrowser] = useState<PilotBrowser>("ios-safari");
  const [lighting, setLighting] = useState<PilotLighting>("window");
  const [makeup, setMakeup] = useState<"none" | "light" | "heavy">("none");
  const [glasses, setGlasses] = useState(false);
  const [hairCover, setHairCover] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [labelComplete, setLabelComplete] = useState(false);
  const [secondReviewNeeded, setSecondReviewNeeded] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  const [consentCrop, setConsentCrop] = useState(false);
  const [excludedReason, setExcludedReason] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ReturnType<typeof getPilotNotes>>([]);

  useEffect(() => {
    // localStorage is client-only; reading it during the first render caused
    // an SSR hydration mismatch (React #418) once notes existed.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setRows(getPilotNotes());
  }, []);

  const participantId = normalizeParticipantId(participant);
  const validParticipant = isPilotParticipantId(participantId);
  const duplicateCount = rows.filter((row) => (row.participantId || normalizeParticipantId(row.participant)) === participantId).length;
  const roster = useMemo(
    () =>
      PILOT_PARTICIPANT_IDS.map((id) => ({
        id,
        latest: [...rows].reverse().find((row) => (row.participantId || normalizeParticipantId(row.participant)) === id),
      })),
    [rows]
  );

  function refresh() {
    setRows(getPilotNotes());
  }

  function save() {
    if (!validParticipant) return;

    savePilotNote({
      participant: participantId,
      participantId,
      round,
      deviceId,
      reviewerId,
      status: excludedReason.trim() ? "excluded" : status,
      browser,
      lighting,
      makeup,
      glasses,
      hairCover,
      scanCompleted,
      labelComplete,
      secondReviewNeeded,
      excludedReason,
      consentAi,
      consentCrop,
      notes,
    });

    setStatus(scanCompleted ? "scanned" : consentAi || consentCrop ? "consented" : "planned");
    setNotes("");
    setExcludedReason("");
    refresh();
  }

  function clear() {
    clearPilotNotes();
    setRows([]);
  }

  return (
    <main className="min-h-screen px-5 py-8" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrow}>pilot lab</p>
            <h1 style={titleStyle}>30-person capture roster</h1>
            <p style={leadStyle}>
              Create a participant/session link before scanning. Labels, crops, consent, and ML reports will use this ID.
            </p>
          </div>
          <Link href="/ops" style={outlineLink}>Ops</Link>
        </div>

        <section style={gridStyle}>
          <div style={sectionStyle}>
            <p style={sectionLabel}>session</p>
            <label style={labelStyle}>Participant ID</label>
            <input value={participant} onChange={(event) => setParticipant(event.target.value)} placeholder="P001" style={inputStyle} />
            {!validParticipant && <p style={errorText}>Use P001 through P030.</p>}
            {validParticipant && duplicateCount > 0 && <p style={mutedText}>Existing records for this participant: {duplicateCount}</p>}

            <label style={labelStyle}>Round</label>
            <input value={round} onChange={(event) => setRound(event.target.value)} placeholder="pilot-1" style={inputStyle} />

            <label style={labelStyle}>Device ID</label>
            <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="iphone15pro-01" style={inputStyle} />

            <label style={labelStyle}>Reviewer ID</label>
            <input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} placeholder="reviewer-a" style={inputStyle} />

            <label style={labelStyle}>Status</label>
            <Select value={status} onChange={(value) => setStatus(value as PilotStatus)} options={[
              ["planned", "planned"],
              ["consented", "consented"],
              ["scanned", "scanned"],
              ["labeled", "labeled"],
              ["excluded", "excluded"],
            ]} />
          </div>

          <div style={sectionStyle}>
            <p style={sectionLabel}>capture context</p>
            <label style={labelStyle}>Browser/device</label>
            <Select value={browser} onChange={(value) => setBrowser(value as PilotBrowser)} options={[
              ["ios-safari", "iPhone Safari"],
              ["android-chrome", "Android Chrome"],
              ["desktop", "Desktop check"],
              ["other", "Other"],
            ]} />

            <label style={labelStyle}>Lighting</label>
            <Select value={lighting} onChange={(value) => setLighting(value as PilotLighting)} options={[
              ["window", "window soft light"],
              ["ceiling", "ceiling light"],
              ["dim", "dim indoor"],
              ["backlight", "backlight"],
              ["direct", "direct strong light"],
            ]} />

            <label style={labelStyle}>Makeup</label>
            <Select value={makeup} onChange={(value) => setMakeup(value as "none" | "light" | "heavy")} options={[
              ["none", "none"],
              ["light", "light"],
              ["heavy", "heavy"],
            ]} />

            <Check label="Glasses" checked={glasses} onChange={setGlasses} />
            <Check label="Hair covers forehead or cheeks" checked={hairCover} onChange={setHairCover} />
            <Check label="Scan completed" checked={scanCompleted} onChange={setScanCompleted} />
            <Check label="Label review complete" checked={labelComplete} onChange={setLabelComplete} />
            <Check label="Second review needed" checked={secondReviewNeeded} onChange={setSecondReviewNeeded} />
            <Check label="AI analysis consent" checked={consentAi} onChange={setConsentAi} />
            <Check label="Learning crop consent" checked={consentCrop} onChange={setConsentCrop} />
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>review notes</p>
          <label style={labelStyle}>Exclude reason</label>
          <input value={excludedReason} onChange={(event) => setExcludedReason(event.target.value)} placeholder="optional: glare, occlusion, withdrawal, duplicate" style={inputStyle} />

          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Face guide fit, glare, crop eligibility, label uncertainty..." style={textareaStyle} />

          <button onClick={save} disabled={!validParticipant} style={{ ...primaryBtn, opacity: validParticipant ? 1 : 0.55 }}>
            Save session and set active participant
          </button>
        </section>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionLabel}>roster</p>
              <h2 style={sectionTitle}>{rows.length} records across {new Set(rows.map((row) => row.participantId || normalizeParticipantId(row.participant))).size} participants</h2>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportPilotNotes} disabled={rows.length === 0} style={smallButton}>Export CSV</button>
              <button onClick={clear} disabled={rows.length === 0} style={dangerBtn}>Clear local</button>
            </div>
          </div>

          <div style={rosterGridStyle}>
            {roster.map(({ id, latest }) => (
              <button key={id} onClick={() => setParticipant(id)} style={rosterButtonStyle(Boolean(latest), latest?.status)}>
                <b>{id}</b>
                <span>{latest?.status || "open"}</span>
              </button>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/scan" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>Open scan</Link>
          <Link href="/privacy" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>Consent copy</Link>
        </div>
      </div>
    </main>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={checkStyle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ accentColor: "var(--plum)", width: 18, height: 18 }} />
      {label}
    </label>
  );
}

function rosterButtonStyle(active: boolean, status?: PilotStatus): React.CSSProperties {
  const excluded = status === "excluded";
  const color = excluded ? "var(--plum)" : active ? "var(--ink)" : "var(--ink-soft)";
  return {
    minHeight: 48,
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: excluded ? "var(--plum-soft)" : active ? "var(--surface-tint)" : "var(--paper)",
    color,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-start",
    cursor: "pointer",
    fontSize: 12,
  };
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 18 };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 30, lineHeight: 1.18, color: "var(--ink)", margin: "7px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 640 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 14 };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 800 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 20, color: "var(--ink)", margin: "7px 0" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 700, margin: "12px 0 6px" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "11px 12px", fontSize: 14 };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };
const checkStyle: React.CSSProperties = { minHeight: 44, display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--ink-soft)", cursor: "pointer" };
const primaryBtn: React.CSSProperties = { width: "100%", background: "var(--plum)", color: "var(--on-plum)", border: "none", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 12 };
const smallButton: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "var(--plum)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const mutedText: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 7 };
const errorText: React.CSSProperties = { fontSize: 12.5, color: "var(--plum)", lineHeight: 1.5, marginTop: 7 };
const rosterGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 8 };
