"use client";

/**
 * Golden-set evaluation harness (staff only — not linked from consumer pages).
 * Upload the fixed golden images, run the CURRENT on-device pipeline on them,
 * compare levels against a baseline JSONL, and export this run as the next
 * baseline. See docs/golden-set.md for the protocol.
 */

import { useRef, useState } from "react";
import { analyzeSkin, VISIBLE_MODEL_CONTRACT, type SkinReads } from "@/lib/skin";
import { createImageLandmarker } from "@/app/scan/create-landmarker";

type Landmark = { x: number; y: number; z?: number };
type ImageLandmarker = {
  detect: (source: HTMLCanvasElement) => { faceLandmarks?: Landmark[][] };
};

type EvalRow = {
  file: string;
  ok: boolean;
  oil?: number;
  redness?: number;
  pores?: number;
  confidence?: number;
  retake?: boolean;
  shine?: number;
  relRedness?: number;
  cov?: number;
  toneIta?: number;
  toneLstar?: number;
  // Within-image indices for the axes with no public dataset. Their cut points are
  // provisional (docs/label-free-axes.md); this harness is where real photos replace
  // them, which is why the numbers are shown raw rather than graded.
  toneSpread?: number;
  roughnessRatio?: number;
  blemishCount?: number;
  blemishDensity?: number;
  /** Operator observation, read from golden-labels.jsonl — the only trouble label that exists. */
  troubleSeen?: boolean;
};

export default function EvalPage() {
  const landmarkerRef = useRef<ImageLandmarker | null>(null);
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [baseline, setBaseline] = useState<Record<string, EvalRow>>({});
  const [labels, setLabels] = useState<Record<string, EvalRow>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function ensureLandmarker(): Promise<ImageLandmarker> {
    if (landmarkerRef.current) return landmarkerRef.current;
    landmarkerRef.current = await createImageLandmarker("GPU");
    return landmarkerRef.current;
  }

  async function analyzeFile(file: File, landmarker: ImageLandmarker): Promise<EvalRow> {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { file: file.name, ok: false };
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const face = landmarker.detect(canvas).faceLandmarks?.[0];
      if (!face?.length) return { file: file.name, ok: false };
      const reads: SkinReads | null = analyzeSkin(ctx.getImageData(0, 0, canvas.width, canvas.height), face);
      if (!reads) return { file: file.name, ok: false };
      return {
        file: file.name,
        ok: true,
        oil: reads.oil.level,
        redness: reads.redness.level,
        pores: reads.pores.level,
        confidence: Number(reads.confidence.toFixed(3)),
        retake: reads.retakeRecommended,
        shine: Number(reads.raw.shine.toFixed(4)),
        relRedness: Number(reads.raw.relRedness.toFixed(4)),
        cov: Number(reads.raw.cov.toFixed(4)),
        toneIta: reads.raw.toneIta,
        toneLstar: reads.raw.toneLstar,
        toneSpread: Number(reads.raw.toneSpread.toFixed(4)),
        roughnessRatio: Number(reads.raw.roughnessRatio.toFixed(4)),
        blemishCount: reads.raw.blemishCount,
        blemishDensity: Number(reads.raw.blemishDensity.toFixed(1)),
      };
    } catch {
      return { file: file.name, ok: false };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function runFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setStatus(`0 / ${list.length}`);
    try {
      const landmarker = await ensureLandmarker();
      const next: EvalRow[] = [];
      for (let i = 0; i < list.length; i += 1) {
        next.push(await analyzeFile(list[i], landmarker));
        setStatus(`${i + 1} / ${list.length}`);
        setRows([...next]);
      }
    } catch {
      setStatus("랜드마커 로드 실패 — 네트워크 또는 로컬 모델 파일을 확인해 주세요");
    } finally {
      setBusy(false);
    }
  }

  function parseJsonl(text: string): Record<string, EvalRow> {
    const map: Record<string, EvalRow> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as EvalRow;
        if (row.file) map[row.file] = row;
      } catch {
        /* skip bad line */
      }
    }
    return map;
  }

  function loadBaseline(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    void file.text().then((text) => setBaseline(parseJsonl(text)));
  }

  // golden-labels.jsonl: operator-consensus ground truth ({file, oil, redness,
  // pores}) — lets /eval measure ACCURACY (agreement with truth), not just drift.
  function loadLabels(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    void file.text().then((text) => setLabels(parseJsonl(text)));
  }

  function exportJsonl() {
    const meta = { featureVersion: VISIBLE_MODEL_CONTRACT.fallbackVersion, exportedFrom: "eval-harness" };
    const lines = rows.filter((row) => row.ok).map((row) => JSON.stringify({ ...row, ...meta }));
    const blob = new Blob([lines.join("\n")], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `golden-eval-${VISIBLE_MODEL_CONTRACT.fallbackVersion}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Second export, in the shape ml/calibrate.py reads: {features, labels, meta}.
   * The flat rows above stay as they are because a previous run is loaded back as a
   * baseline. This one turns a golden set into cut points without a pilot — which is
   * the only way the new indices get boundaries that came from real faces.
   */
  function exportCalibrationJsonl() {
    const ts = Date.now();
    const lines = rows
      .filter((row) => row.ok && labels[row.file])
      .map((row) => {
        const truth = labels[row.file];
        // The file name is deliberately NOT carried over. docs/golden-set.md names
        // golden images `golden-{인물ID}-…`, so exporting it would put a person's id
        // next to their measured tone in a file that leaves this machine. calibrate.py
        // needs neither.
        return JSON.stringify({
          ts,
          features: {
            shine: row.shine,
            relRedness: row.relRedness,
            cov: row.cov,
            toneLstar: row.toneLstar,
            toneIta: row.toneIta,
            toneSpread: row.toneSpread,
            roughnessRatio: row.roughnessRatio,
            blemishCount: row.blemishCount,
            blemishDensity: row.blemishDensity,
          },
          labels: { oil: truth.oil, redness: truth.redness, pores: truth.pores },
          source: "corrected",
          meta: {
            labelConfidence: "high",
            inputSchemaVersion: VISIBLE_MODEL_CONTRACT.inputSchemaVersion,
            featureVersion: VISIBLE_MODEL_CONTRACT.fallbackVersion,
            exportedFrom: "eval-harness",
            // Strict: a golden-labels file is hand-written, and "false" or "no" in it
            // is a no, not a yes. Only a real boolean true records the observation.
            ...(truth.troubleSeen === true ? { observations: { troubleSeen: true } } : {}),
            // /eval analyses a downscaled still (maxSide 720) while /scan analyses the
            // camera frame at its native size. Texture-scale features do not transfer
            // between those two without care, so the size travels with the row.
            analyzedMaxSide: 720,
          },
        });
      });
    const blob = new Blob([lines.join("\n")], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `golden-calibration-${VISIBLE_MODEL_CONTRACT.fallbackVersion}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const diffCell = (row: EvalRow, key: "oil" | "redness" | "pores") => {
    const base = baseline[row.file];
    const changed = base && base[key] !== undefined && row[key] !== undefined && base[key] !== row[key];
    return (
      <td style={{ ...cell, color: changed ? "var(--plum)" : "var(--ink)", fontWeight: changed ? 800 : 500 }}>
        {row[key] ?? "—"}{changed ? ` (←${base?.[key]})` : ""}
      </td>
    );
  };

  const changedCount = rows.filter((row) => {
    const base = baseline[row.file];
    return base && (base.oil !== row.oil || base.redness !== row.redness || base.pores !== row.pores);
  }).length;

  const ATTR_KEYS = ["oil", "redness", "pores"] as const;
  const agreement = (() => {
    const per = { oil: { m: 0, t: 0 }, redness: { m: 0, t: 0 }, pores: { m: 0, t: 0 } };
    for (const row of rows) {
      if (!row.ok) continue;
      const label = labels[row.file];
      if (!label) continue;
      for (const key of ATTR_KEYS) {
        if (label[key] === undefined || row[key] === undefined) continue;
        per[key].t += 1;
        if (label[key] === row[key]) per[key].m += 1;
      }
    }
    const t = per.oil.t + per.redness.t + per.pores.t;
    const m = per.oil.m + per.redness.m + per.pores.m;
    return { per, t, m };
  })();
  const pct = (m: number, t: number) => (t ? Math.round((m / t) * 100) : 0);
  const hasLabels = Object.keys(labels).length > 0 && agreement.t > 0;

  const labelCell = (row: EvalRow) => {
    const label = labels[row.file];
    if (!row.ok || !label) return <td style={cell}>—</td>;
    return (
      <td style={cell}>
        {ATTR_KEYS.map((key, i) => {
          if (label[key] === undefined) return <span key={key} style={{ color: "var(--faint)" }}>{i > 0 ? "·" : ""}—</span>;
          const match = row[key] === label[key];
          return (
            <span key={key} style={{ color: match ? "var(--success)" : "var(--plum)", fontWeight: match ? 500 : 800 }}>
              {i > 0 ? " · " : ""}{label[key]}{match ? "✓" : "✗"}
            </span>
          );
        })}
      </td>
    );
  };

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        <p style={eyebrow}>golden-set eval</p>
        <h1 style={titleStyle}>골든셋 회귀 평가</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 18 }}>
          스태프 전용. 골든셋 이미지를 올리면 현재 파이프라인({VISIBLE_MODEL_CONTRACT.fallbackVersion})으로 판독하고,
          이전 실행 JSONL과 레벨 차이를 표시해요. 이미지는 업로드되지 않고 이 브라우저에서만 처리됩니다.
        </p>

        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          <label style={fileLabel}>
            골든셋 이미지 선택 (여러 장)
            <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => void runFiles(e.target.files)} style={{ display: "block", marginTop: 6 }} />
          </label>
          <label style={fileLabel}>
            베이스라인 JSONL (선택 — 이전 실행과 비교)
            <input type="file" accept=".jsonl,.txt,application/json" onChange={(e) => loadBaseline(e.target.files)} style={{ display: "block", marginTop: 6 }} />
          </label>
          <label style={fileLabel}>
            정답 라벨 JSONL (선택 — golden-labels.jsonl, 일치율 측정)
            <input type="file" accept=".jsonl,.txt,application/json" onChange={(e) => loadLabels(e.target.files)} style={{ display: "block", marginTop: 6 }} />
          </label>
        </div>

        {status && <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>진행: {status}{Object.keys(baseline).length > 0 ? ` · 레벨 변화 ${changedCount}건` : ""}</p>}

        {hasLabels && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 12, background: "var(--surface-tint)" }}>
            <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 800 }}>
              라벨 일치율 {pct(agreement.m, agreement.t)}% <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({agreement.m}/{agreement.t})</span>
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
              유분 {pct(agreement.per.oil.m, agreement.per.oil.t)}% · 붉은기 {pct(agreement.per.redness.m, agreement.per.redness.t)}% · 결 {pct(agreement.per.pores.m, agreement.per.pores.t)}%
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--surface-tint)" }}>
                  {["파일", "유분", "붉은기", "결", ...(hasLabels ? ["정답(유·붉·결)"] : []), "conf", "retake", "shine", "relRed", "cov", "ITA", "톤편차", "거칠기", "트러블수", "트러블밀도"].map((h) => (
                    <th key={h} style={{ ...cell, fontWeight: 700, textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.file} style={{ borderTop: "1px solid var(--line)", opacity: row.ok ? 1 : 0.5 }}>
                    <td style={{ ...cell, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{row.file}{row.ok ? "" : " (얼굴 인식 실패)"}</td>
                    {diffCell(row, "oil")}
                    {diffCell(row, "redness")}
                    {diffCell(row, "pores")}
                    {hasLabels && labelCell(row)}
                    <td style={cell}>{row.confidence ?? "—"}</td>
                    <td style={cell}>{row.retake === undefined ? "—" : row.retake ? "Y" : "N"}</td>
                    <td style={cell}>{row.shine ?? "—"}</td>
                    <td style={cell}>{row.relRedness ?? "—"}</td>
                    <td style={cell}>{row.cov ?? "—"}</td>
                    <td style={cell}>{row.toneIta ?? "—"}</td>
                    <td style={cell}>{row.toneSpread ?? "—"}</td>
                    <td style={cell}>{row.roughnessRatio ?? "—"}</td>
                    <td style={cell}>{row.blemishCount ?? "—"}</td>
                    <td style={cell}>{row.blemishDensity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.some((row) => row.ok) && (
          <button onClick={exportJsonl} style={exportBtn}>이번 실행을 JSONL로 내보내기 (다음 베이스라인)</button>
        )}

        {/* Deliberately not gated on hasLabels: that also requires a graded oil/redness/
            pores label, which would block a labels file carrying only the trouble
            observation — the one axis this export uniquely unlocks. */}
        {rows.some((row) => row.ok && labels[row.file]) && (
          <>
            <button onClick={exportCalibrationJsonl} style={exportBtn}>calibrate.py 형식으로 내보내기 (정답 라벨 있는 행만)</button>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
              내려받은 파일로 <code>python ml/calibrate.py golden-calibration-…jsonl</code> 을 실행하면
              유분·붉은기·결의 임계값이 나옵니다. 톤편차·거칠기는 라벨 출처가 없어 측정만 되고,
              트러블은 정답 라벨에 <code>troubleSeen: true</code>가 하나라도 있어야 컷을 잡습니다.
              파일명(인물 ID)은 내보내지 않습니다. 여기서 나온 임계값은 <strong>출발점</strong>이에요 —
              이 화면은 720px로 줄인 정지 이미지를 읽고 /scan은 카메라 원본 프레임을 읽기 때문에,
              결·거칠기처럼 텍스처를 보는 값은 실제 스캔 피드백으로 다시 확인해야 합니다.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 28, lineHeight: 1.22, color: "var(--ink)", margin: "6px 0 8px" };
const fileLabel: React.CSSProperties = { fontSize: 13, color: "var(--ink-soft)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", background: "var(--surface)" };
const cell: React.CSSProperties = { padding: "8px 9px", whiteSpace: "nowrap" };
const exportBtn: React.CSSProperties = { width: "100%", marginTop: 14, background: "var(--plum)", color: "var(--on-plum)", border: "none", borderRadius: 8, padding: "13px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
