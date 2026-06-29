"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPurchases, recordCheckin, type Purchase } from "@/lib/store";

export default function Checkin() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getPurchases().then(setPurchases);
  }, []);

  if (purchases === null) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>사용 후 체크인</p>
        <h1 style={titleStyle}>써보니 어땠나요?</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 26, lineHeight: 1.55 }}>
          구매 후 피드백을 남기면 다음 추천이 더 정확해져요.
        </p>

        {purchases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>아직 기록된 구매가 없어요.</p>
            <Link href="/scan" style={{ color: "var(--plum)", fontSize: 14, textDecoration: "none", fontWeight: 700 }}>피부 스캔하러 가기</Link>
          </div>
        ) : (
          purchases.map((purchase) => (
            <CheckinCard key={purchase.id} purchase={purchase} done={Boolean(done[purchase.id])} onDone={() => setDone((d) => ({ ...d, [purchase.id]: true }))} />
          ))
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

  async function save() {
    if (!ready) return;
    await recordCheckin({ sku_id: purchase.sku_id, week: 2, satisfaction: sat, trouble, repurchase });
    onDone();
  }

  return (
    <div style={card}>
      <p style={{ fontFamily: "var(--font-ko-serif)", fontSize: 17, color: "var(--ink)", marginBottom: done ? 0 : 14 }}>{purchase.name}</p>
      {done ? (
        <p style={{ fontSize: 13, color: "var(--success)", marginTop: 6 }}>고마워요. 피드백이 저장됐어요.</p>
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
  return <div style={{ display: "flex", gap: 6 }}>{options.map((option, i) => <button key={option} onClick={() => onPick(i + 1)} style={pill(value === i + 1)}>{option}</button>)}</div>;
}

function Toggle({ value, onPick, yes, no }: { value: boolean | null; onPick: (value: boolean) => void; yes: string; no: string }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => onPick(true)} style={pill(value === true)}>{yes}</button>
      <button onClick={() => onPick(false)} style={pill(value === false)}>{no}</button>
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
    color: on ? "var(--plum)" : "var(--ink)",
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
