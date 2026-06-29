"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CONSENT_VERSION, consentEventCount, exportConsentEvents, latestConsent } from "@/lib/consent";
import { cropSampleCount, exportCropSamples } from "@/lib/crops";
import { exportLabels, labelCount } from "@/lib/labels";
import { getMlReadiness } from "@/lib/ml-readiness";
import { exportPilotNotes, summarizePilotNotes } from "@/lib/pilot";
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
  completed: 0,
  aiConsent: 0,
  cropConsent: 0,
  blockedByMakeupOrObstruction: 0,
  byBrowser: {},
  byLighting: {},
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
  const readiness = useMemo(() => getMlReadiness({ labels: snapshot.labels, crops: snapshot.crops }), [snapshot.crops, snapshot.labels]);

  function refresh() {
    setSnapshot(readSnapshot());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSnapshot(readSnapshot());
      void fetchSyncStatus().then(setSyncStatus).catch(() => setSyncStatus(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const completionRate = snapshot.pilot.total ? Math.round((snapshot.pilot.completed / snapshot.pilot.total) * 100) : 0;
  const cropConsentRate = snapshot.pilot.total ? Math.round((snapshot.pilot.cropConsent / snapshot.pilot.total) * 100) : 0;

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
      <div className="mx-auto" style={{ maxWidth: 920 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <p style={eyebrow}>ops dashboard</p>
            <h1 style={titleStyle}>파일럿과 ML 준비도를 한 화면에서 봅니다</h1>
            <p style={leadStyle}>실기기 QA, 동의 로그, 라벨, 학습용 크롭 수를 기준으로 다음 작업을 결정합니다.</p>
          </div>
          <button type="button" onClick={refresh} style={smallButton}>새로고침</button>
        </div>

        <section style={metricGrid}>
          <Metric label="피드백 라벨" value={`${snapshot.labels}`} detail="gyeol-labels" />
          <Metric label="학습용 크롭" value={`${snapshot.crops}`} detail="opt-in only" />
          <Metric label="파일럿 기록" value={`${snapshot.pilot.total}`} detail={`${completionRate}% scan complete`} />
          <Metric label="동의 변경" value={`${snapshot.consentEvents}`} detail={CONSENT_VERSION} />
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>ML readiness</p>
          <h2 style={sectionTitle}>{readiness.title}</h2>
          <p style={bodyText}>{readiness.detail}</p>
          <p style={{ ...bodyText, marginTop: 10, color: "var(--ink)" }}>{readiness.nextAction}</p>
          {readiness.minCropsForNextBand !== null && (
            <p style={mutedText}>다음 단계까지 학습용 크롭 {Math.max(0, readiness.minCropsForNextBand - snapshot.crops)}개가 더 필요합니다.</p>
          )}
        </section>

        <section style={twoColumnGrid}>
          <div style={sectionStyle}>
            <p style={sectionLabel}>pilot quality</p>
            <h2 style={sectionTitle}>실기기 편차 확인</h2>
            <div style={rowStyle}><span>스캔 완료</span><b>{snapshot.pilot.completed}/{snapshot.pilot.total}</b></div>
            <div style={rowStyle}><span>학습 크롭 동의율</span><b>{cropConsentRate}%</b></div>
            <div style={rowStyle}><span>안경/머리/진한 메이크업</span><b>{snapshot.pilot.blockedByMakeupOrObstruction}</b></div>
            <MiniBreakdown title="브라우저" rows={snapshot.pilot.byBrowser} />
            <MiniBreakdown title="조명" rows={snapshot.pilot.byLighting} />
          </div>

          <div style={sectionStyle}>
            <p style={sectionLabel}>consent state</p>
            <h2 style={sectionTitle}>최근 선택 상태</h2>
            <div style={rowStyle}><span>AI 분석용 전송</span><b>{toConsentText(snapshot.aiGranted)}</b></div>
            <div style={rowStyle}><span>학습용 크롭 저장</span><b>{toConsentText(snapshot.cropGranted)}</b></div>
            <p style={mutedText}>동의 기록은 로컬 감사 로그입니다. 원본 사진 없이 종류, 허용 여부, 문구 버전, 시간만 보관합니다.</p>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>exports</p>
          <h2 style={sectionTitle}>파일럿 종료 시 내보낼 데이터</h2>
          <div style={actionGrid}>
            <button onClick={exportLabels} disabled={snapshot.labels === 0} style={actionButton(snapshot.labels > 0)}>라벨 JSONL</button>
            <button onClick={exportCropSamples} disabled={snapshot.crops === 0} style={actionButton(snapshot.crops > 0)}>크롭 JSONL</button>
            <button onClick={exportPilotNotes} disabled={snapshot.pilot.total === 0} style={actionButton(snapshot.pilot.total > 0)}>파일럿 CSV</button>
            <button onClick={exportConsentEvents} disabled={snapshot.consentEvents === 0} style={actionButton(snapshot.consentEvents > 0)}>동의 CSV</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={sectionLabel}>supabase sync</p>
          <h2 style={sectionTitle}>로컬 파일럿 데이터를 백엔드로 올리기</h2>
          {syncStatus && (
            <div style={{ ...statusPill, color: syncStatus.configured ? "var(--success)" : "#8f3f3b" }}>
              {syncStatus.configured ? "Supabase sync configured" : "Supabase sync env missing"}
              {" · "}
              {syncStatus.cropBucketConfigured ? "crop bucket ready" : "crop bucket not set"}
            </div>
          )}
          <p style={bodyText}>
            운영자 토큰이 있을 때만 서버 route가 Supabase로 업로드합니다. 기본값은 dry-run이라 실제 저장 전 라벨, 크롭, 동의, 파일럿 수와 경고를 먼저 확인합니다.
          </p>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input
              value={syncToken}
              onChange={(event) => setSyncToken(event.target.value)}
              placeholder="SUPABASE_SYNC_TOKEN"
              type="password"
              style={inputStyle}
            />
            <label style={checkStyle}>
              <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} style={{ accentColor: "var(--plum)", width: 16, height: 16 }} />
              dry-run으로 먼저 검증
            </label>
            <button
              onClick={syncToSupabase}
              disabled={syncing || !syncToken.trim()}
              style={{ ...primaryButton, opacity: syncing || !syncToken.trim() ? 0.55 : 1 }}
            >
              {syncing ? "동기화 확인 중" : dryRun ? "Supabase dry-run" : "Supabase 업로드"}
            </button>
          </div>
          {syncResult && <SyncResultPanel result={syncResult} />}
        </section>

        <nav style={navStyle} aria-label="운영 바로가기">
          <Link href="/scan" style={navLink}>스캔 QA</Link>
          <Link href="/pilot" style={navLink}>파일럿 기록</Link>
          <Link href="/privacy" style={navLink}>동의 문구</Link>
          <Link href="/care" style={navLink}>상담 연결</Link>
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

function MiniBreakdown({ title, rows }: { title: string; rows: Partial<Record<string, number>> }) {
  const entries = Object.entries(rows);
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ ...sectionLabel, marginBottom: 6 }}>{title}</p>
      {entries.length === 0 ? (
        <p style={mutedText}>기록 없음</p>
      ) : (
        entries.map(([key, value]) => (
          <div key={key} style={rowStyle}>
            <span>{key}</span>
            <b>{value ?? 0}</b>
          </div>
        ))
      )}
    </div>
  );
}

function SyncResultPanel({ result }: { result: SyncResult }) {
  return (
    <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: result.ok ? "var(--plum-soft)" : "var(--paper)" }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: result.ok ? "var(--plum)" : "#8f3f3b" }}>
        {result.ok ? "Sync ready" : "Sync needs attention"}{result.dryRun ? " · dry-run" : ""}
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
  if (value === null) return "기록 없음";
  return value ? "동의" : "철회";
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
const smallButton: React.CSSProperties = { border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const statusPill: React.CSSProperties = { display: "inline-block", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 10px", margin: "4px 0 10px", fontSize: 12, fontWeight: 800, background: "var(--paper)" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", padding: "12px 13px", fontSize: 14 };
const checkStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, color: "var(--ink-soft)", fontSize: 13.5 };
const primaryButton: React.CSSProperties = { border: "none", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "13px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" };
const navStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8, marginTop: 4 };
const navLink: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", textDecoration: "none", textAlign: "center", borderRadius: 8, padding: "13px 12px", fontSize: 14, fontWeight: 800 };
