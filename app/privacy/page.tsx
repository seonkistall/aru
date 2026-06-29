"use client";

import Link from "next/link";
import { useState } from "react";
import { clearConsentEvents, CONSENT_VERSION, consentEventCount, exportConsentEvents } from "@/lib/consent";
import { clearCropSamples, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { clearLabels, exportLabels, labelCount } from "@/lib/labels";

export default function PrivacyPage() {
  const [labelTotal, setLabelTotal] = useState(() => labelCount());
  const [cropTotal, setCropTotal] = useState(() => cropSampleCount());
  const [consentTotal, setConsentTotal] = useState(() => consentEventCount());

  function clearLearningData() {
    clearCropSamples();
    clearLabels();
    setCropTotal(cropSampleCount());
    setLabelTotal(labelCount());
  }

  function clearConsentLog() {
    clearConsentEvents();
    setConsentTotal(consentEventCount());
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 430 }}>
        <p style={eyebrow}>privacy & consent</p>
        <h1 style={titleStyle}>Camera data stays separated by purpose</h1>
        <p style={leadStyle}>
          The default scan runs on this device. AI analysis transfer and learning-crop storage are separate choices and can be exported or cleared locally.
        </p>

        <section style={sectionStyle}>
          <p style={sectionLabel}>default scan</p>
          <h2 style={sectionTitle}>On-device first</h2>
          <p style={bodyText}>The browser reads camera frames and face landmarks for visible-signal cosmetic guidance. Original full photos are not stored in this path.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>AI analysis transfer</p>
          <h2 style={sectionTitle}>Optional face crop analysis</h2>
          <p style={bodyText}>When enabled, a face crop is sent to the analysis API. This is separate from training-use crop storage.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>learning crop storage</p>
          <h2 style={sectionTitle}>Opt-in local training sample</h2>
          <p style={bodyText}>
            When enabled, the face crop, visible-signal labels, and capture quality metadata are stored in this browser. Local storage keeps the latest 120 opt-in crops until export or deletion.
          </p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>export & delete</p>
          <h2 style={sectionTitle}>Current local data</h2>
          <p style={bodyText}>This device has {labelTotal} labels and {cropTotal} learning crops.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportLabels} style={outlineBtn}>Export labels JSONL</button>
            <button onClick={exportCropSamples} disabled={cropTotal === 0} style={{ ...outlineBtn, opacity: cropTotal === 0 ? 0.5 : 1 }}>Export crop JSONL</button>
            <button onClick={clearLearningData} style={dangerBtn}>Delete local learning data</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>consent audit log</p>
          <h2 style={sectionTitle}>Separated consent history</h2>
          <p style={bodyText}>
            Current consent copy version is {CONSENT_VERSION}. This device has {consentTotal} consent events. Events include the choice, text version, time, and pilot session when available.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button onClick={exportConsentEvents} disabled={consentTotal === 0} style={{ ...outlineBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>Export consent CSV</button>
            <button onClick={clearConsentLog} disabled={consentTotal === 0} style={{ ...dangerBtn, opacity: consentTotal === 0 ? 0.5 : 1 }}>Clear consent log</button>
          </div>
        </section>

        <section style={noticeStyle}>
          <p style={sectionLabel}>medical boundary</p>
          <p style={bodyText}>
            This app does not diagnose, treat, cure, or prescribe. It recommends cosmetics from visible skin signals. Pain, sudden changes, severe inflammation, or persistent symptoms should route to professional consultation.
          </p>
        </section>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Link href="/scan" style={{ ...primaryBtn, flex: 1, textAlign: "center" }}>Back to scan</Link>
          <Link href="/care" style={{ ...outlineLink, flex: 1, textAlign: "center" }}>Care links</Link>
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 29, lineHeight: 1.22, color: "var(--ink)", margin: "8px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 22 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const noticeStyle: React.CSSProperties = { background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 7 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 19, color: "var(--ink)", marginBottom: 7 };
const bodyText: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 };
const primaryBtn: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, textDecoration: "none" };
const outlineBtn: React.CSSProperties = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
const dangerBtn: React.CSSProperties = { background: "transparent", color: "#8f3f3b", border: "1px solid #d8b8b3", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" };
