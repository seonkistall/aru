"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCheckins, getPurchases, recordCheckin, type Purchase } from "@/lib/store";
import { SKUS } from "@/lib/skus";
import { ProductVisual } from "@/app/components/product-visual";
import { Xiaohei } from "@/app/components/sketch";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// The check-in round from REAL elapsed time. 0 = not yet due — a purchase.ts is
// stamped on a commerce-link click, so a just-clicked product must not claim
// "2주차" / "써보니 어땠나요?" before any time has passed.
const roundFor = (ts: number) => {
  const weeks = (Date.now() - ts) / WEEK_MS;
  return weeks >= 3 ? 4 : weeks >= 2 ? 2 : 0;
};

export default function Checkin() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getPurchases(), getCheckins()]).then(([nextPurchases, checkins]) => {
      // Done is per round (2주/4주): a week-2 checkin must not block the
      // week-4 one the re-engagement email brings the user back for.
      const initial: Record<string, boolean> = {};
      for (const p of nextPurchases) {
        const round = roundFor(p.ts);
        if (checkins.some((c) => c.sku_id === p.sku_id && c.week === round)) initial[p.id] = true;
      }
      setDone(initial);
      setPurchases(nextPurchases);
    });
  }, []);

  if (purchases === null) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  const duePurchases = purchases.filter((p) => roundFor(p.ts) > 0);
  const allDone = duePurchases.length > 0 && duePurchases.every((p) => done[p.id]);

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <Link href="/" style={{ fontFamily: "var(--font-hand)", fontSize: 22, color: "var(--ink)", textDecoration: "none" }}>아루</Link>
            <p style={{ ...eyebrow, marginTop: 8 }}>사용 후 체크인</p>
            <h1 style={titleStyle}>써보니 어땠나요?</h1>
          </div>
          <Xiaohei size={54} pose="carry" />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "6px 0 26px", lineHeight: 1.55 }}>
          구매 후 피드백을 남기면 다음 추천이 더 정확해져요.
        </p>

        {purchases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "22px 18px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }}>
            <p style={{ fontSize: 14.5, color: "var(--ink)", marginBottom: 6, fontWeight: 700 }}>아직 기록된 구매가 없어요</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.55 }}>
              추천 리포트에서 제품을 열어보면 여기에서 2·4주 후 사용감을 남길 수 있어요.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/report" style={ctaPrimary}>내 리포트 보기</Link>
              <Link href="/scan" style={ctaGhost}>피부 스캔하기</Link>
            </div>
          </div>
        ) : (
          <>
            {purchases.map((purchase) => (
              <CheckinCard key={purchase.id} purchase={purchase} done={Boolean(done[purchase.id])} onDone={() => setDone((d) => ({ ...d, [purchase.id]: true }))} />
            ))}
            {allDone && (
              <div style={{ textAlign: "center", padding: "18px", marginTop: 6 }}>
                <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>모든 피드백 완료! 다음 스캔에 더 정확히 반영할게요.</p>
                <Link href="/scan" style={ctaPrimary}>새로 스캔하기 →</Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CheckinCard({ purchase, done, onDone }: { purchase: Purchase; done: boolean; onDone: () => void }) {
  const [sat, setSat] = useState<number | null>(null);
  const [trouble, setTrouble] = useState<boolean | null>(null);
  const [repurchase, setRepurchase] = useState<boolean | null>(null);
  const ready = sat !== null && trouble !== null && repurchase !== null;

  const sku = SKUS.find((s) => s.id === purchase.sku_id);
  const round = roundFor(purchase.ts);
  const due = round > 0;

  async function save() {
    if (!ready || !due) return;
    await recordCheckin({ sku_id: purchase.sku_id, week: round === 4 ? 4 : 2, satisfaction: sat, trouble, repurchase });
    onDone();
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: done || !due ? 0 : 14 }}>
        <div style={{ width: 46, height: 46, flexShrink: 0 }}>
          <ProductVisual category={sku?.category ?? "세럼"} brand={sku?.brand ?? purchase.name} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
            <span style={due ? weekBadge : softBadge}>{due ? `${round}주차` : "사용 중"}</span>
          </div>
          <p style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16, color: "var(--ink)" }}>{purchase.name}</p>
        </div>
      </div>
      {!due ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>2주쯤 써본 뒤에 사용감을 여쭤볼게요. 그때 사용감을 남기면 다음 추천이 더 정확해져요.</p>
      ) : done ? (
        <p role="status" style={{ fontSize: 13, color: "var(--success)", marginTop: 6 }}>고마워요. 피드백이 저장됐어요.</p>
      ) : (
        <>
          <Row label="만족도"><Seg options={["별로", "보통", "좋음"]} value={sat} onPick={setSat} /></Row>
          <Row label="트러블"><Toggle value={trouble} onPick={setTrouble} yes="있었어요" no="없었어요" /></Row>
          <Row label="재구매"><Toggle value={repurchase} onPick={setRepurchase} yes="할래요" no="아니요" /></Row>
          <button onClick={save} disabled={!ready} style={saveBtn(ready)}>기록하기</button>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", gap: 12 }}>
      <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>{label}</span>
      {children}
    </div>
  );
}

function Seg({ options, value, onPick }: { options: string[]; value: number | null; onPick: (value: number) => void }) {
  return <div style={{ display: "flex", gap: 6 }}>{options.map((option, i) => <button key={option} onClick={() => onPick(i + 1)} aria-pressed={value === i + 1} style={pill(value === i + 1)}>{option}</button>)}</div>;
}

function Toggle({ value, onPick, yes, no }: { value: boolean | null; onPick: (value: boolean) => void; yes: string; no: string }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => onPick(true)} aria-pressed={value === true} style={pill(value === true)}>{yes}</button>
      <button onClick={() => onPick(false)} aria-pressed={value === false} style={pill(value === false)}>{no}</button>
    </div>
  );
}

function pill(on: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    padding: "7px 11px",
    borderRadius: 8,
    border: on ? "1px solid var(--plum)" : "1px solid var(--line)",
    background: on ? "var(--plum-soft)" : "var(--surface)",
    color: on ? "var(--plum-press)" : "var(--ink)",
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
  };
}

function saveBtn(ready: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 12,
    background: ready ? "var(--plum)" : "var(--surface-tint)",
    color: ready ? "var(--on-plum)" : "var(--muted)",
    border: "none",
    borderRadius: 8,
    padding: "12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
  };
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 6px" };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 14 };
const weekBadge: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--on-plum)", background: "var(--plum)", borderRadius: 999, padding: "2px 8px" };
const softBadge: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" };
const ctaPrimary: React.CSSProperties = { display: "inline-block", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const ctaGhost: React.CSSProperties = { display: "inline-block", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
