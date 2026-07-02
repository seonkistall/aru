"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlowSteps } from "@/app/components/flow-steps";
import type { Avoid, Category, Concern, SkinType } from "@/lib/skus";
import type { ScanReads, Survey as SurveyT } from "@/lib/recommend";

const TYPES: SkinType[] = ["지성", "건성", "복합성", "민감성"];
const CONCERNS: Concern[] = ["모공", "붉은기", "건조", "트러블", "유분", "탄력"];
const CATEGORIES: Category[] = ["클렌저", "토너", "세럼", "크림", "선크림"];
const AVOIDS: Avoid[] = ["향료", "알코올", "에센셜오일"];
const BUDGETS = [
  { label: "1만원대", won: 15000 },
  { label: "2만원대", won: 25000 },
  { label: "3만원대", won: 35000 },
  { label: "4만원 이상", won: 60000 },
];

type ScanHint = { concerns: Concern[]; text: string } | null;

function loadScanHint(): ScanHint {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("gyeol_scan");
    if (!raw) return null;
    const scan = JSON.parse(raw) as ScanReads;
    if (!scan || scan.retakeRecommended || (scan.confidence ?? 0) < 0.58) {
      return { concerns: [], text: "촬영 조건이 애매해서 설문 답변을 중심으로 추천할게요." };
    }
    const concerns: Concern[] = [];
    if (scan.oil >= 2) concerns.push("유분");
    if (scan.redness >= 1) concerns.push("붉은기");
    if (scan.pores >= 1) concerns.push("모공");
    return concerns.length
      ? { concerns, text: `스캔에서 ${concerns.join("·")} 신호가 보여 고민에 미리 담았어요.` }
      : { concerns: [], text: "스캔에서는 크게 도드라진 신호가 적어 기본 설문을 중심으로 볼게요." };
  } catch {
    return null;
  }
}

export default function Survey() {
  const router = useRouter();
  const [scanHint, setScanHint] = useState<ScanHint>(null);
  const [type, setType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [avoid, setAvoid] = useState<Avoid[]>([]);
  const ready = type && category && budget;

  useEffect(() => {
    // sessionStorage is client-only; reading it in the initial render caused an
    // SSR hydration mismatch, so the one-time post-mount cascade is intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    const hint = loadScanHint();
    if (!hint) return;
    setScanHint(hint);
    if (hint.concerns.length) setConcerns((prev) => (prev.length ? prev : hint.concerns));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function submit() {
    if (!ready) return;
    const survey: SurveyT = { type, concerns, category, budget, avoid };
    sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
    router.push("/report");
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>몇 가지만 더 알려주세요</p>
        <FlowSteps current="survey" />
        <h1 style={titleStyle}>추천을 더 정확하게 맞춰볼게요</h1>
        {scanHint && (
          <div style={scanHintStyle}>
            <p style={{ margin: 0 }}>{scanHint.text}</p>
            <Link href="/scan" style={retakeLinkStyle}>스캔 다시 하기</Link>
          </div>
        )}

        <Section title="제품 종류" required>
          <Chips options={CATEGORIES} selected={category ? [category] : []} onPick={setCategory} />
        </Section>
        <Section title="피부 타입" required>
          <Chips options={TYPES} selected={type ? [type] : []} onPick={setType} />
        </Section>
        <Section title="고민">
          <Chips options={CONCERNS} selected={concerns} onPick={(v) => toggle(concerns, v, setConcerns)} />
        </Section>
        <Section title="예산" required>
          <Chips
            options={BUDGETS.map((b) => b.label)}
            selected={budget ? [BUDGETS.find((b) => b.won === budget)?.label ?? ""] : []}
            onPick={(label) => setBudget(BUDGETS.find((b) => b.label === label)?.won ?? null)}
          />
        </Section>
        <Section title="피하고 싶은 성분">
          <Chips options={AVOIDS} selected={avoid} onPick={(v) => toggle(avoid, v, setAvoid)} />
        </Section>

        <button onClick={submit} disabled={!ready} style={submitStyle(Boolean(ready))}>내 추천 보기</button>
        {!ready && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
            제품 종류·피부 타입·예산을 고르면 리포트를 볼 수 있어요
          </p>
        )}
      </div>
    </main>
  );
}

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
        {title}{required && <span style={{ color: "var(--plum)" }}> *</span>}
      </p>
      {children}
    </section>
  );
}

function Chips<T extends string>({ options, selected, onPick }: { options: T[]; selected: T[]; onPick: (value: T) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button key={option} onClick={() => onPick(option)} aria-pressed={on} style={chipStyle(on)}>
            {option}
          </button>
        );
      })}
    </div>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 12px" };
const scanHintStyle: React.CSSProperties = { fontSize: 13.5, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "11px 12px", lineHeight: 1.5, marginBottom: 22 };
const retakeLinkStyle: React.CSSProperties = { display: "inline-block", marginTop: 6, fontSize: 12.5, color: "var(--text-muted)", textDecoration: "underline" };

function chipStyle(on: boolean): React.CSSProperties {
  return {
    fontSize: 14,
    padding: "9px 15px",
    borderRadius: 8,
    border: on ? "1px solid var(--plum)" : "1px solid var(--line)",
    background: on ? "var(--plum-soft)" : "var(--surface)",
    color: on ? "var(--plum)" : "var(--ink)",
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
  };
}

function submitStyle(ready: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 12,
    background: ready ? "var(--plum)" : "var(--surface-tint)",
    color: ready ? "var(--on-plum)" : "var(--muted)",
    border: "none",
    borderRadius: 8,
    padding: "15px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
  };
}
