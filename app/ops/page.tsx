"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeCommerceOverrideIssue, type CommerceOverrideIssue } from "@/lib/commerce";
import { CONSENT_VERSION, consentEventCount, exportConsentEvents, latestConsent } from "@/lib/consent";
import { cropSampleCount, exportCropSamples } from "@/lib/crops";
import { exportFunnelEvents, funnelDropoff, summarizeFunnel, type FunnelStage, type FunnelSummary } from "@/lib/funnel";
import type { FunnelAggregate, FunnelSourceAggregate } from "@/lib/funnel-aggregate";
import { exportLabels, labelCount } from "@/lib/labels";
import { getMlReadiness } from "@/lib/ml-readiness";
import { exportPilotNotes, getPilotNotes, normalizeParticipantId, PILOT_PARTICIPANT_IDS, summarizePilotNotes } from "@/lib/pilot";
import { buildSyncRequestBody, syncRequestByteSize } from "@/lib/sync-size";
import { buildLocalSyncPayload, type SyncResult, type SyncSource } from "@/lib/sync-payload";

type PilotSummary = ReturnType<typeof summarizePilotNotes>;

type OpsSnapshot = {
  labels: number;
  crops: number;
  consentEvents: number;
  aiGranted: boolean | null;
  cropGranted: boolean | null;
  pilot: PilotSummary;
  funnel: FunnelSummary;
  funnelStages: FunnelStage[];
};

type SyncStatus = {
  configured: boolean;
  cropBucketConfigured: boolean;
  originGuardConfigured: boolean;
  maxBytes: number;
  rateLimit: { windowMs: number; max: number };
  commerceOverrides?: {
    configured: boolean;
    parsed: boolean;
    accepted: number;
    // sku/merchant are absent on the unknown-* rows — see the comment in
    // app/api/sync/route.ts for why that route will not name them.
    issues: { sku?: string; merchant?: string; reason: CommerceOverrideIssue["reason"] }[];
  };
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

const emptyFunnel: FunnelSummary = {
  events: 0,
  sessions: 0,
  steps: {
    home_viewed: 0,
    scan_opened: 0,
    camera_blocked: 0,
    camera_interrupted: 0,
    scan_started: 0,
    scan_completed: 0,
    survey_viewed: 0,
    survey_completed: 0,
    reco_viewed: 0,
    care_viewed: 0,
    checkin_opened: 0,
    share_clicked: 0,
    commerce_clicked: 0,
    share_landed: 0,
  },
  failurePreventionConversion: 0,
  surveyCompletion: 0,
  shareRate: 0,
  viralActivation: 0,
  captureStart: 0,
  cameraBlockRate: 0,
};

const emptySnapshot: OpsSnapshot = {
  labels: 0,
  crops: 0,
  consentEvents: 0,
  aiGranted: null,
  cropGranted: null,
  pilot: emptyPilot,
  funnel: emptyFunnel,
  funnelStages: [],
};

export default function OpsPage() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot>(emptySnapshot);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(true);
  // The server-side read of funnel_events. Separate from syncStatus because it comes
  // from a different route (/api/funnel owns the table) and can be slow or unavailable
  // while the env-status fields above are fine.
  const [funnelAggregate, setFunnelAggregate] = useState<FunnelAggregate | null>(null);
  const [funnelAggregateLoading, setFunnelAggregateLoading] = useState(true);
  const syncTokenRef = useRef("");
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
    setSyncStatusLoading(true);
    void fetchSyncStatus(syncTokenRef.current)
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null))
      .finally(() => setSyncStatusLoading(false));
    setFunnelAggregateLoading(true);
    void fetchFunnelAggregate(syncTokenRef.current)
      .then(setFunnelAggregate)
      .catch(() => setFunnelAggregate(null))
      .finally(() => setFunnelAggregateLoading(false));
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Re-read the status once a token is typed, so the override audit appears without a
  // page reload. Debounced because this fires on every keystroke of a pasted token.
  useEffect(() => {
    syncTokenRef.current = syncToken.trim();
    if (!syncToken.trim()) return;
    const timer = window.setTimeout(() => {
      setSyncStatusLoading(true);
      void fetchSyncStatus(syncToken.trim())
        .then(setSyncStatus)
        .catch(() => setSyncStatus(null))
        .finally(() => setSyncStatusLoading(false));
      setFunnelAggregateLoading(true);
      void fetchFunnelAggregate(syncToken.trim())
        .then(setFunnelAggregate)
        .catch(() => setFunnelAggregate(null))
        .finally(() => setFunnelAggregateLoading(false));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [syncToken]);

  const completionRate = snapshot.pilot.total ? Math.round((snapshot.pilot.completed / snapshot.pilot.total) * 100) : 0;
  const cropConsentRate = snapshot.pilot.total ? Math.round((snapshot.pilot.cropConsent / snapshot.pilot.total) * 100) : 0;
  const roster = buildRoster();

  async function syncToSupabase() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const payload = buildLocalSyncPayload();
      const requestBody = buildSyncRequestBody({ dryRun, payload });
      const maxBytes = syncStatus?.maxBytes;
      const bodyBytes = syncRequestByteSize(requestBody);
      if (maxBytes && bodyBytes > maxBytes) {
        setSyncResult({
          ok: false,
          counts: {
            labels: payload.labels.length,
            cropSamples: payload.cropSamples.length,
            cropUploads: 0,
            pilotNotes: payload.pilotNotes.length,
            consentEvents: payload.consentEvents.length,
            funnelEvents: payload.funnelEvents?.length ?? 0,
          },
          warnings: [],
          errors: [`Sync payload is ${(bodyBytes / 1024 / 1024).toFixed(2)}MB, above the ${(maxBytes / 1024 / 1024).toFixed(2)}MB upload limit. Export locally or clear old crops before syncing.`],
        });
        return;
      }
      const resp = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncToken.trim()}`,
        },
        body: requestBody,
      });
      const responseBody = (await resp.json()) as SyncResult;
      setSyncResult(responseBody);
      refresh();
    } catch (error) {
      setSyncResult({
        ok: false,
        counts: { labels: 0, cropSamples: 0, cropUploads: 0, pilotNotes: 0, consentEvents: 0, funnelEvents: 0 },
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
          <p style={sectionLabel}>scan journey diagnostic · this device</p>
          <h2 style={sectionTitle}>Scan-to-commerce action (on-device log)</h2>
          {/* localStorage on the machine you are reading this on. Still the right
              screen for an operator testing their own flow end to end — which is why
              the server-side panel below sits NEXT TO it rather than replacing it. */}
          <p style={bodyText}>
            Of {snapshot.funnel.steps.scan_completed} completed scans, {snapshot.funnel.steps.commerce_clicked} reached an
            informed purchase intent.
          </p>
          <strong style={{ ...sectionTitle, fontSize: 30, color: "var(--plum)" }}>
            {Math.round(snapshot.funnel.failurePreventionConversion * 100)}%
          </strong>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {snapshot.funnelStages.map((stage, index) => (
              <div key={stage.kind}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink)", marginBottom: 3 }}>
                  <span>{stage.label} · {stage.count}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {Math.round(stage.ofStart * 100)}%{index > 0 && stage.dropFromPrev > 0 ? ` · -${Math.round(stage.dropFromPrev * 100)}%` : ""}
                  </span>
                </div>
                <div style={{ height: 8, background: "var(--surface-tint)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(stage.ofStart * 100)}%`, background: "var(--plum)", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Row label="Sessions" value={`${snapshot.funnel.sessions}`} />
            <Row label="Home viewed" value={`${snapshot.funnel.steps.home_viewed}`} />
            <Row label="Scan opened" value={`${snapshot.funnel.steps.scan_opened}`} />
            {/* Both rates divide by scan_opened sessions. Every log recorded before
                scan_opened existed has none, and printing that as "0%" would read as
                a measurement of total failure rather than as no data. */}
            <Row
              label="Reached the shutter"
              value={
                snapshot.funnel.steps.scan_opened
                  ? `${Math.round(snapshot.funnel.captureStart * 100)}% of scan opens`
                  : "— (no scan opens recorded)"
              }
            />
            <Row
              label="Camera blocked"
              value={
                snapshot.funnel.steps.scan_opened
                  ? `${snapshot.funnel.steps.camera_blocked} (${Math.round(snapshot.funnel.cameraBlockRate * 100)}% of scan opens)`
                  : `${snapshot.funnel.steps.camera_blocked} (no scan opens recorded)`
              }
            />
            <Row label="Survey viewed" value={`${snapshot.funnel.steps.survey_viewed}`} />
            <Row label="Survey completion" value={`${Math.round(snapshot.funnel.surveyCompletion * 100)}%`} />
            <Row label="Share clicked" value={`${snapshot.funnel.steps.share_clicked}`} />
            <Row label="Share rate" value={`${Math.round(snapshot.funnel.shareRate * 100)}%`} />
            <Row label="Care viewed" value={`${snapshot.funnel.steps.care_viewed}`} />
            <Row label="Check-in opened" value={`${snapshot.funnel.steps.checkin_opened}`} />
            <Row label="Share landed" value={`${snapshot.funnel.steps.share_landed}`} />
            <Row label="Share activation" value={`${Math.round(snapshot.funnel.viralActivation * 100)}%`} />
          </div>
          <p style={mutedText}>Local device only until a Supabase sync flows these events to funnel_events. The panel below reads that table.</p>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>funnel_events · server side</p>
          <h2 style={sectionTitle}>What the table holds, per source</h2>
          {/* Two populations, never one number. `ops-local` is an operator uploading
              their own device's log behind a typed token; `public-funnel` is an
              unauthenticated browser write whose visitor_id nobody can vouch for.
              supabase/schema.sql says on the column itself not to pool them, so this
              screen does not offer a total — there is no row here that adds them. */}
          <ServerFunnelPanel aggregate={funnelAggregate} loading={funnelAggregateLoading} />
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
            <button onClick={exportFunnelEvents} disabled={snapshot.funnel.events === 0} style={actionButton(snapshot.funnel.events > 0)}>Funnel CSV</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>commerce</p>
          <h2 style={sectionTitle}>Affiliate link overrides</h2>
          {/* A rejected override is indistinguishable from no override at the link
              itself — both fall back to the merchant search URL — while
              NEXT_PUBLIC_COMMERCE_AFFILIATE may separately be telling users the link
              earns a commission. This is the only screen that shows the difference. */}
          <CommerceOverridePanel status={syncStatus?.commerceOverrides} loading={syncStatusLoading} />
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>supabase sync</p>
          <h2 style={sectionTitle}>Backend upload gate</h2>
          {syncStatus && (
            <div style={{ ...statusPill, color: syncStatus.configured ? "var(--success)" : "var(--plum)" }}>
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
    funnel: summarizeFunnel(),
    funnelStages: funnelDropoff(),
  };
}

function buildRoster() {
  const rows = getPilotNotes();
  return PILOT_PARTICIPANT_IDS.map((id) => {
    const latest = [...rows].reverse().find((row) => (row.participantId || normalizeParticipantId(row.participant)) === id);
    return { id, status: latest?.status };
  });
}

function CommerceOverridePanel({ status, loading }: { status: SyncStatus["commerceOverrides"]; loading: boolean }) {
  if (loading) return <p style={bodyText}>Reading /api/sync…</p>;
  // Absent rather than failed: the audit only comes back with a valid sync token.
  if (!status) return <p style={bodyText}>Enter the SUPABASE_SYNC_TOKEN below to read the override audit.</p>;
  if (!status.configured) {
    return (
      <>
        <div style={{ ...statusPill, color: "var(--ink-soft)" }}>COMMERCE_LINK_OVERRIDES_JSON not set</div>
        <p style={bodyText}>Every out-link is a merchant search URL and earns nothing. Set the env with real affiliate URLs, and set NEXT_PUBLIC_COMMERCE_AFFILIATE=on in the same deploy.</p>
      </>
    );
  }
  if (!status.parsed) {
    return (
      <>
        <div style={{ ...statusPill, color: "var(--plum)" }}>unparseable JSON — every override lost</div>
        <p style={bodyText}>COMMERCE_LINK_OVERRIDES_JSON is set but is not valid JSON, so not one override is in effect.</p>
      </>
    );
  }
  // Defensive: an older deploy's cached response may carry commerceOverrides without
  // issues, and reading .length off it would take the whole page down inside render.
  const issues = status.issues ?? [];
  return (
    <>
      <div style={{ ...statusPill, color: issues.length ? "var(--plum)" : "var(--success)" }}>
        {status.accepted ?? 0} accepted | {issues.length} rejected
      </div>
      {issues.length > 0 && (
        <ul style={{ ...bodyText, paddingLeft: 18, margin: "0 0 8px" }}>
          {issues.map((issue, index) => (
            <li key={`${issue.sku ?? ""}/${issue.merchant ?? ""}/${issue.reason}/${index}`}>
              {issue.sku && issue.merchant ? <><strong>{issue.sku}</strong>/{issue.merchant} — </> : null}
              {describeCommerceOverrideIssue(issue)}. Still a search URL.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * What each source marker means, in the words an operator needs before reading a number.
 *
 * Not decoration. The two panels look alike and the counts are computed by the same
 * code, which is exactly why each needs its provenance stated next to it: a
 * `public-funnel` session count is a count of claims made by unauthenticated browsers.
 */
const SOURCE_NOTES: Record<SyncSource, { title: string; note: string }> = {
  "ops-local": {
    title: "ops-local",
    note: "An operator uploaded their own device's log through POST /api/sync behind the typed token. Few sessions, and every one of them is someone testing.",
  },
  "public-funnel": {
    title: "public-funnel",
    note: "Unauthenticated browser writes to POST /api/funnel. visitor_id, session_id and ts are device-generated and unverifiable — a population, not evidence about any one visitor.",
  },
};

function ServerFunnelPanel({ aggregate, loading }: { aggregate: FunnelAggregate | null; loading: boolean }) {
  if (loading) return <p style={bodyText}>Reading /api/funnel…</p>;
  // Absent rather than failed, same as the commerce audit: the aggregate only comes
  // back with a valid sync token.
  if (!aggregate) return <p style={bodyText}>Enter the SUPABASE_SYNC_TOKEN below to read funnel_events.</p>;

  if (!aggregate.available) {
    const notConfigured = aggregate.reason === "not-configured";
    return (
      <>
        <div style={{ ...statusPill, color: notConfigured ? "var(--ink-soft)" : "var(--plum)" }}>
          {notConfigured ? "Supabase is not configured — funnel_events cannot be read" : "The funnel_events read failed"}
        </div>
        {/* The distinction the screen exists to make. An empty panel here would read
            as "nobody used the product", which is a different and much worse claim
            than "this deploy has no database". */}
        <p style={bodyText}>
          {notConfigured
            ? "This is not a count of zero. No Supabase env is set on this deploy, so there is no table to read — and NEXT_PUBLIC_FUNNEL_FLUSH is unset, so no browser is writing to one either."
            : "Supabase env is set but the query errored. Check the service role key and that supabase/schema.sql has been applied to this project."}
        </p>
      </>
    );
  }

  const empty = aggregate.sources.every((source) => source.totalRows === 0);
  return (
    <>
      <div style={{ ...statusPill, color: empty ? "var(--ink-soft)" : "var(--success)" }}>
        {aggregate.tableRows} rows in funnel_events
        {aggregate.unattributedRows !== null && aggregate.unattributedRows > 0
          ? ` · ${aggregate.unattributedRows} carry no source marker and are in neither panel`
          : ""}
        {aggregate.unattributedRows === null ? " · unmarked rows not countable while a source is truncated" : ""}
      </div>
      {empty && (
        <p style={bodyText}>
          The table is reachable and empty. Nothing has been written yet: NEXT_PUBLIC_FUNNEL_FLUSH is unset, so no
          browser posts to /api/funnel, and no operator has run a non-dry-run sync from this screen.
        </p>
      )}
      <div style={{ ...twoColumnGrid, marginTop: 12 }}>
        {aggregate.sources.map((source) => (
          <SourceCard key={source.source} source={source} />
        ))}
      </div>
      <p style={mutedText}>
        Counted per source and never added together — see the comment on funnel_events.metadata in supabase/schema.sql.
        Aggregate counts only: this read never selects visitor_id, so no per-visitor timeline can be built from it.
        Read at {new Date(aggregate.readAt).toLocaleString()}; at most {aggregate.rowCap} rows per source.
      </p>
    </>
  );
}

function SourceCard({ source }: { source: FunnelSourceAggregate }) {
  const notes = SOURCE_NOTES[source.source];
  const steps = source.summary.steps;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, background: "var(--paper)" }}>
      <p style={{ ...sectionLabel, marginBottom: 4 }}>{notes.title}</p>
      <p style={{ ...mutedText, marginTop: 0 }}>{notes.note}</p>
      {source.totalRows === 0 ? (
        // Rendered rather than hidden. One source having rows and the other having
        // none is the expected state today, and an absent panel would let the panel
        // that IS there be read as the whole table.
        <p style={{ ...bodyText, marginTop: 10 }}>No rows from this source.</p>
      ) : (
        <>
          {source.truncated && (
            <p style={{ ...bodyText, marginTop: 10, color: "var(--plum)" }}>
              Showing the most recent {source.rows} of {source.totalRows} rows. Session counts undercount any session
              whose events straddle that cut.
            </p>
          )}
          <div style={{ marginTop: 8 }}>
            <Row label="Rows read" value={`${source.rows}${source.truncated ? ` of ${source.totalRows}` : ""}`} />
            <Row label="Sessions" value={`${source.summary.sessions}`} />
            <Row label="Window" value={describeWindow(source.firstTs, source.lastTs)} />
            <Row label="Home viewed" value={`${steps.home_viewed}`} />
            <Row label="Scan opened" value={`${steps.scan_opened}`} />
            <Row label="Reached the shutter" value={ratioOf(source.summary.captureStart, steps.scan_opened, "of scan opens")} />
            <Row
              label="Camera blocked"
              value={
                steps.scan_opened
                  ? `${steps.camera_blocked} (${Math.round(source.summary.cameraBlockRate * 100)}% of scan opens)`
                  : `${steps.camera_blocked} (no scan opens recorded)`
              }
            />
            <Row label="Scan completed" value={`${steps.scan_completed}`} />
            <Row label="Survey completion" value={ratioOf(source.summary.surveyCompletion, steps.survey_viewed, "of survey views")} />
            <Row label="Reco viewed" value={`${steps.reco_viewed}`} />
            <Row label="Commerce clicked" value={`${steps.commerce_clicked}`} />
            <Row label="Scan-to-commerce" value={ratioOf(source.summary.failurePreventionConversion, steps.scan_completed, "of completed scans")} />
            <Row label="Share landed" value={`${steps.share_landed}`} />
            <Row label="Share activation" value={ratioOf(source.summary.viralActivation, steps.share_landed, "of share arrivals")} />
          </div>
          {source.unusableRows > 0 && (
            <p style={mutedText}>{source.unusableRows} rows had no usable kind or session id and were not counted.</p>
          )}
          {source.unknownKinds.length > 0 && (
            <p style={mutedText}>
              Kinds this build has no step for, counted in rows and sessions only: {source.unknownKinds.join(", ")}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A ratio with a zero denominator is not zero.
 *
 * `summarizeFunnel` returns 0 for every ratio whose denominator is empty, which is the
 * right value for arithmetic and the wrong string for a screen: "0% of scan opens
 * reached the shutter" is a measurement of total failure, and "no scan opens recorded"
 * is no measurement at all. The existing on-device panel already makes this
 * distinction for its two camera rows; every ratio in this panel makes it.
 */
function ratioOf(value: number, denominator: number, unit: string) {
  if (!denominator) return `— (no ${unit.replace(/^of /, "")} recorded)`;
  return `${Math.round(value * 100)}% ${unit}`;
}

function describeWindow(firstTs: number | null, lastTs: number | null) {
  if (firstTs === null || lastTs === null) return "—";
  const first = new Date(firstTs).toISOString().slice(0, 10);
  const last = new Date(lastTs).toISOString().slice(0, 10);
  return first === last ? first : `${first} → ${last}`;
}

/**
 * The aggregate is only in the response when the token is valid — same shape as the
 * commerce audit on /api/sync. `null` means "no aggregate came back", which is the
 * no-token case; a failed fetch throws and the caller renders nothing.
 */
async function fetchFunnelAggregate(token?: string): Promise<FunnelAggregate | null> {
  const resp = await fetch("/api/funnel", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!resp.ok) throw new Error("Funnel status unavailable.");
  const body = (await resp.json()) as { aggregate?: FunnelAggregate };
  return body.aggregate ?? null;
}

async function fetchSyncStatus(token?: string): Promise<SyncStatus> {
  // The override audit is only in the response when the token is valid — see the
  // comment on GET in app/api/sync/route.ts. Everything else comes back either way.
  const resp = await fetch("/api/sync", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
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
    <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: result.ok ? "var(--surface-tint)" : "var(--paper)" }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: result.ok ? "var(--success)" : "var(--plum)" }}>
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
const metricValue: React.CSSProperties = { display: "block", fontFamily: "var(--font-ko-serif)", fontSize: 34, color: "var(--ink)", lineHeight: 1.1, marginTop: 5 };
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
const navLink: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", textDecoration: "none", textAlign: "center", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800 };
