"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SkinType, Concern, Avoid, Category } from "@/lib/skus";
import type { Survey as SurveyT } from "@/lib/recommend";

const TYPES: SkinType[] = ["지성", "건성", "복합", "민감"];
const CONCERNS: Concern[] = ["모공", "홍조", "건조", "트러블", "유분", "탄력"];
const CATEGORIES: Category[] = ["클렌저", "토너", "세럼", "크림", "선크림"];
const AVOIDS: Avoid[] = ["향료", "알코올", "에센셜오일"];
const BUDGETS: { label: string; won: number }[] = [
  { label: "1만원대", won: 15000 },
  { label: "2만원대", won: 25000 },
  { label: "3만원대", won: 35000 },
  { label: "4만원+", won: 60000 },
];

export default function Survey() {
  const router = useRouter();
  const [type, setType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [avoid, setAvoid] = useState<Avoid[]>([]);

  const ready = type && category && budget;

  function toggle<T>(list: T[], v: T, set: (l: T[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function submit() {
    if (!ready) return;
    const survey: SurveyT = { type: type!, concerns, category: category!, budget: budget!, avoid };
    sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
    router.push("/report");
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <p style={eyebrow}>결 · 몇 가지만</p>
        <h1 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 22px" }}>
          무엇을 찾고 있어요?
        </h1>

        <Section title="어떤 걸 찾아요?" required>
          <Chips options={CATEGORIES} selected={category ? [category] : []} onPick={(v) => setCategory(v)} />
        </Section>

        <Section title="피부 타입" required>
          <Chips options={TYPES} selected={type ? [type] : []} onPick={(v) => setType(v)} />
        </Section>

        <Section title="고민 (여러 개)">
          <Chips options={CONCERNS} selected={concerns} onPick={(v) => toggle(concerns, v, setConcerns)} multi />
        </Section>

        <Section title="예산" required>
          <Chips options={BUDGETS.map((b) => b.label)} selected={budget ? [BUDGETS.find((b) => b.won === budget)!.label] : []} onPick={(label) => setBudget(BUDGETS.find((b) => b.label === label)!.won)} />
        </Section>

        <Section title="피하고 싶은 성분 (여러 개)">
          <Chips options={AVOIDS} selected={avoid} onPick={(v) => toggle(avoid, v, setAvoid)} multi />
        </Section>

        <button
          onClick={submit}
          disabled={!ready}
          style={{
            width: "100%",
            marginTop: 12,
            background: ready ? "var(--plum)" : "var(--surface-tint)",
            color: ready ? "var(--on-plum)" : "var(--muted)",
            border: "none",
            borderRadius: 8,
            padding: "15px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: ready ? "pointer" : "default",
          }}
        >
          추천 받기 →
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 10 }}>
          과장 없이, 너한테 맞는 셋을 골라드려요.
        </p>
      </div>
    </main>
  );
}

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
        {title}
        {required && <span style={{ color: "var(--plum)" }}> *</span>}
      </p>
      {children}
    </div>
  );
}

function Chips<T extends string>({ options, selected, onPick, multi }: { options: T[]; selected: T[]; onPick: (v: T) => void; multi?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            onClick={() => onPick(o)}
            style={{
              fontSize: 14,
              padding: "9px 15px",
              borderRadius: 9999,
              border: on ? "1px solid var(--plum)" : "1px solid var(--line)",
              background: on ? "var(--plum-soft)" : "var(--surface)",
              color: on ? "var(--plum)" : "var(--ink)",
              fontWeight: on ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 600,
};
