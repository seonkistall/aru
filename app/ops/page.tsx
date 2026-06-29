"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CONSENT_VERSION, consentEventCount, exportConsentEvents, latestConsent } from "@/lib/consent";
import { cropSampleCount, exportCropSamples } from "@/lib/crops";
import { exportLabels, labelCount } from "@/lib/labels";
import { getMlReadiness } from "@/lib/ml-readiness";
import { exportPilotNotes, getPilotNotes, normalizeParticipantId, PILOT_PARTICIPANT_IDS, summarizePilotNotes } from "@/lib/pilot";
import { buildLocalSyncPayload, type SyncResult } from "@/lib/sync-payload";

type PilotSummary = ReturnType<typeof summarizePilotNotes>;

type OpsSnapshot = {
  labels: number;
  crops: number;
  consentEvents: number;
  aiGranted: boolean | null;
  cropGranted: boolean | null;
  pilot: PilotSummary;
};

type SyncStatus = {
  configured: boolean;
  cropBucketConfigured: boolean;
  originGuardConfigured: boolean;
  maxBytes: number;
  rateLimit: { windowMs: number; max: number };
};

const emptyPilot: PilotSummary = {
  total: 0,
  participants: 0,
  completed: 0,
  labelComplete: 0,
  secondReviewNeeded: 0,
  excluded: 0,
  aiConsent: 0,
  cropConsent: 0,
  blockedByMakeupOrObstruction: 0,
  byBrowser: {},
  byLighting: {},
  byStatus: {},
};

const emptySnapshot: OpsSnapshot = {
  labels: 0,
  crops: 0,
  consentEvents: 0,
  aiGranted: null,
  cropGranted: null,
  pilot: emptyPilot,
};

export default function OpsPage() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot>(emptySnapshot);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncToken, setSyncToken] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const readiness = useMemo(
    () => getMlReadiness({ labels: snapshot.labels, crops: snapshot.crops, participants: snapshot.pilot.participants }),
    [snapshot.crops, snapshot.labels, snapshot.pilot.participants]
  );

  function refresh() {
    setSnapshot(readSnapshot());
    void fetchSyncStatus().then(setSyncStatus).catch(() => setSyncStatus(null));
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const completionRate = snapshot.pilot.total ? Math.round((snapshot.pilot.completed / snapshot.pilot.total) * 100) : 0;
  const cropConsentRate = snapshot.pilot.total ? Math.round((snapshot.pilot.cropConsent / snapshot.pilot.total) * 100) : 0;
  const roster = buildRoster();

  async function syncToSupabase() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const resp = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncToken.trim()}`,
        },
        body: JSON.stringify({ dryRun, payload: buildLocalSyncPayload() }),
      });
      const body = (await resp.json()) as SyncResult;
      setSyncResult(body);
      refresh();
    } catch (error) {
      setSyncResult({
        ok: false,
        counts: { labels: 0, cropSamples: 0, cropUploads: 0, pilotNotes: 0, consentEvents: 0 },
        warnings: [],
        errors: [error instanceof Error ? error.message : "Sync request failed."],
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrow}>ops dashboard</p>
            <h1 style={titleStyle}>Pilot, consent, sync, and ML readiness</h1>
            <p style={leadStyle}>Use this before every export or backend sync. The goal is traceable data, not just higher sample counts.</p>
          </div>
          <button type="button" onClick={refresh} style={smallButton}>Refresh</button>
        </div>

        <section style={metricGrid}>
          <Metric label="labels" value={`${snapshot.labels}`} detail="gyeol-labels" />
          <Metric label="learning crops" value={`${snapshot.crops}`} detail="local opt-in crops" />
          <Metric label="participants" value={`${snapshot.pilot.participants}`} detail={`${snapshot.pilot.total} records, ${completionRate}% complete`} />
          <Metric label="consent events" value={`${snapshot.consentEvents}`} detail={CONSENT_VERSION} />
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>ML readiness</p>
          <h2 style={sectionTitle}>{readiness.title}</h2>
          <p style={bodyText}>{readiness.detail}</p>
          <p style={{ ...bodyText, marginTop: 10, color: "var(--ink)" }}>{readiness.nextAction}</p>
          {readiness.minCropsForNextBand !== null && (
            <p style={mutedText}>Crops needed for next band: {Math.max(0, readiness.minCropsForNextBand - snapshot.crops)}</p>
          )}
        </section>

        <section style={twoColumnGrid}>
          <div style={sectionStyle}>
            <p style={sectionLabel}>pilot quality</p>
            <h2 style={sectionTitle}>Research-lab counters</h2>
            <Row label="Scan complete" value={`${snapshot.pilot.completed}/${snapshot.pilot.total}`} />
            <Row label="Label complete" value={`${snapshot.pilot.labelComplete}`} />
            <Row label="Second review" value={`${snapshot.pilot.secondReviewNeeded}`} />
            <Row label="Excluded" value={`${snapshot.pilot.excluded}`} />
            <Row label="Crop consent rate" value={`${cropConsentRate}%`} />
            <Row label="Makeup/obstruction flags" value={`${snapshot.pilot.blockedByMakeupOrObstruction}`} />
            <MiniBreakdown title="Status" rows={snapshot.pilot.byStatus} />
            <MiniBreakdown title="Browser" rows={snapshot.pilot.byBrowser} />
            <MiniBreakdown title="Lighting" rows={snapshot.pilot.byLighting} />
          </div>

          <div style={sectionStyle}>
            <p style={sectionLabel}>consent state</p>
            <h2 style={sectionTitle}>Latest local choices</h2>
            <Row label="AI analysis transfer" value={toConsentText(snapshot.aiGranted)} />
            <Row label="Learning crop storage" value={toConsentText(snapshot.cropGranted)} />
            <p style={mutedText}>Consent events now include participant/session scope when a pilot session is active.</p>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>participant board</p>
          <h2 style={sectionTitle}>P001-P030 lab board</h2>
          <div style={rosterGridStyle}>
            {roster.map((item) => (
              <div key={item.id} style={rosterCellStyle(item.status)}>
                <b>{item.id}</b>
                <span>{item.status || "open"}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>exports</p>
          <h2 style={sectionTitle}>Local pilot files</h2>
          <div style={actionGrid}>
            <button onClick={exportLabels} disabled={snapshot.labels === 0} style={actionButton(snapshot.labels > 0)}>Labels JSONL</button>
            <button onClick={exportCropSamples} disabled={snapshot.crops === 0} style={actionButton(snapshot.crops > 0)}>Crops JSONL</button>
            <button onClick={exportPilotNotes} disabled={snapshot.pilot.total === 0} style={actionButton(snapshot.pilot.total > 0)}>Pilot CSV</button>
            <button onClick={exportConsentEvents} disabled={snapshot.consentEvents === 0} style={actionButton(snapshot.consentEvents > 0)}>Consent CSV</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>supabase sync</p>
          <h2 style={sectionTitle}>Backend upload gate</h2>
          {syncStatus && (
            <div style={{ ...statusPill, color: syncStatus.configured ? "var(--success)" : "#8f3f3b" }}>
              {syncStatus.configured ? "Supabase env configured" : "Supabase env missing"}
              {" | "}
              {syncStatus.cropBucketConfigured ? "crop bucket configured" : "crop bucket missing"}
            </div>
          )}
          <p style={bodyText}>Run dry-run first. Crop uploads are skipped unless each crop has matching learning-crop consent when participant/session metadata exists.</p>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input value={syncToken} onChange={(event) => setSyncToken(event.target.value)} placeholder="SUPABASE_SYNC_TOKEN" type="password" style={inputStyle} />
            <label style={checkStyle}>
              <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} style={{ accentColor: "var(--plum)", width: 18, height: 18 }} />
              Dry-run only
            </label>
            <button onClick={syncToSupabase} disabled={syncing || !syncToken.trim()} style={{ ...primaryButton, opacity: syncing || !syncToken.trim() ? 0.55 : 1 }}>
              {syncing ? "Syncing..." : dryRun ? "Run Supabase dry-run" : "Upload to Supabase"}
            </button>
          </div>
          {syncResult && <SyncResultPanel result={syncResult} />}
        </section>

        <nav style={navStyle} aria-label="Ops navigation">
          <Link href="/scan" style={navLink}>Scan QA</Link>
          <Link href="/pilot" style={navLink}>Pilot roster</Link>
          <Link href="/privacy" style={navLink}>Privacy</Link>
          <Link href="/care" style={navLink}>Care links</Link>
        </nav>
      </div>
    </main>
  );
}

function readSnapshot(): OpsSnapshot {
  return {
    labels: labelCount(),
    crops: cropSampleCount(),
    consentEvents: consentEventCount(),
    aiGranted: latestConsent("ai_analysis")?.granted ?? null,
    cropGranted: latestConsent("learning_crop")?.granted ?? null,
    pilot: summarizePilotNotes(),
  };
}

function buildRoster() {
  const rows = getPilotNotes();
  return PILOT_PARTICIPANT_IDS.map((id) => {
    const latest = [...rows].reverse().find((row) => (row.participantId || normalizeParticipantId(row.participant)) === id);
    return { id, status: latest?.status };
  });
}

async function fetchSyncStatus(): Promise<SyncStatus> {
  const resp = await fetch("/api/sync", { method: "GET" });
  if (!resp.ok) throw new Error("Sync status unavailable.");
  return (await resp.json()) as SyncStatus;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={metricStyle}>
      <p style={metricLabel}>{label}</p>
      <strong style={metricValue}>{value}</strong>
      <p style={metricDetail}>{detail}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function MiniBreakdown({ title, rows }: { title: string; rows: Partial<Record<string, number>> }) {
  const entries = Object.entries(rows);
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ ...sectionLabel, marginBottom: 6 }}>{title}</p>
      {entries.length === 0 ? <p style={mutedText}>No records</p> : entries.map(([key, value]) => <Row key={key} label={key} value={`${value ?? 0}`} />)}
    </div>
  );
}

function SyncResultPanel({ result }: { result: SyncResult }) {
  return (
    <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: result.ok ? "var(--plum-soft)" : "var(--paper)" }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: result.ok ? "var(--plum)" : "#8f3f3b" }}>
        {result.ok ? "Sync ready" : "Sync needs attention"}{result.dryRun ? " | dry-run" : ""}
      </p>
      <p style={mutedText}>
        labels {result.counts.labels}, crops {result.counts.cropSamples}, crop uploads {result.counts.cropUploads}, pilot {result.counts.pilotNotes}, consent {result.counts.consentEvents}
      </p>
      {[...result.warnings, ...result.errors].length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 18, color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.45 }}>
          {[...result.warnings, ...result.errors].map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function toConsentText(value: boolean | null) {
  if (value === null) return "No record";
  return value ? "Granted" : "Withdrawn";
}

function actionButton(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--surface)" : "var(--paper)",
    color: active ? "var(--ink)" : "var(--muted)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: active ? "pointer" : "default",
    textAlign: "left",
  };
}

function rosterCellStyle(status?: string): React.CSSProperties {
  const active = Boolean(status);
  const color = status === "excluded" ? "#8f3f3b" : active ? "var(--plum)" : "var(--ink-soft)";
  return {
    minHeight: 48,
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: active ? "var(--plum-soft)" : "var(--paper)",
    color,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 12,
  };
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 20 };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 30, lineHeight: 1.18, color: "var(--ink)", margin: "7px 0" };
const leadStyle: React.CSSProperties = { fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 620 };
const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 14 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 800 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 20, color: "var(--ink)", margin: "7px 0" };
const bodyText: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 };
const mutedText: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 9 };
const metricGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 };
const metricStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 };
const metricLabel: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", fontWeight: 700 };
const metricValue: React.CSSProperties = { display: "block", fontFamily: "var(--font-ko-serif)", fontSize: 34, color: "var(--plum)", lineHeight: 1.1, marginTop: 5 };
const metricDetail: React.CSSProperties = { fontSize: 12, color: "var(--muted)", marginTop: 3 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--line)", padding: "9px 0", fontSize: 13.5, color: "var(--ink-soft)" };
const twoColumnGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 };
const actionGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 12 };
const rosterGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 8, marginTop: 12 };
const smallButton: React.CSSProperties = { border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const statusPill: React.CSSProperties = { display: "inline-block", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 10px", margin: "4px 0 10px", fontSize: 12, fontWeight: 800, background: "var(--paper)" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "12px 13px", fontSize: 14 };
const checkStyle: React.CSSProperties = { minHeight: 44, display: "flex", alignItems: "center", gap: 9, color: "var(--ink-soft)", fontSize: 13.5 };
const primaryButton: React.CSSProperties = { border: "none", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" };
const navStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8, marginTop: 4 };
const navLink: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", textDecoration: "none", textAlign: "center", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800 };
