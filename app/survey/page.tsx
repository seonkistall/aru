"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Avoid, Category, Concern, SkinType } from "@/lib/skus";
import type { Survey as SurveyT } from "@/lib/recommend";

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

export default function Survey() {
  const router = useRouter();
  const [type, setType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [avoid, setAvoid] = useState<Avoid[]>([]);
  const ready = type && category && budget;

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
        <h1 style={titleStyle}>어떤 제품을 찾고 있나요?</h1>

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

        <button onClick={submit} disabled={!ready} style={submitStyle(Boolean(ready))}>추천 받기</button>
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
          <button key={option} onClick={() => onPick(option)} style={chipStyle(on)}>
            {option}
          </button>
        );
      })}
    </div>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 22px" };

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
