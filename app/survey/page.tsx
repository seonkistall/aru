"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SkinType, Concern, Avoid, Category } from "@/lib/skus";
import type { Survey as SurveyT } from "@/lib/recommend";
import { Xiaohei, SketchBox } from "../components/sketch";

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
    <main className="min-h-screen px-6 py-9" style={{ background: "#fff", color: "var(--ink)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div className="flex items-start justify-between" style={{ marginBottom: 22 }}>
          <div>
            <p style={{ fontFamily: "var(--font-hand)", fontSize: 21, color: "var(--muted)" }}>결 · 몇 가지만</p>
            <h1 style={{ fontFamily: "var(--font-hand)", fontSize: 40, lineHeight: 1.05, margin: "2px 0 0" }}>
              무엇을 찾고 있어요?
            </h1>
          </div>
          <Xiaohei size={66} pose="stand" />
        </div>

        <Section title="어떤 걸 찾아요?" required>
          <Chips options={CATEGORIES} selected={category ? [category] : []} onPick={(v) => setCategory(v)} />
        </Section>

        <Section title="피부 타입" required>
          <Chips options={TYPES} selected={type ? [type] : []} onPick={(v) => setType(v)} />
        </Section>

        <Section title="고민 (여러 개)">
          <Chips options={CONCERNS} selected={concerns} onPick={(v) => toggle(concerns, v, setConcerns)} />
        </Section>

        <Section title="예산" required>
          <Chips options={BUDGETS.map((b) => b.label)} selected={budget ? [BUDGETS.find((b) => b.won === budget)!.label] : []} onPick={(label) => setBudget(BUDGETS.find((b) => b.label === label)!.won)} />
        </Section>

        <Section title="피하고 싶은 성분 (여러 개)">
          <Chips options={AVOIDS} selected={avoid} onPick={(v) => toggle(avoid, v, setAvoid)} />
        </Section>

        <SketchBox filled={!!ready} color={ready ? "var(--ink)" : "var(--line)"} style={{ marginTop: 18 }}>
          <button
            onClick={submit}
            disabled={!ready}
            className="flex items-center justify-center"
            style={{ width: "100%", background: "transparent", border: "none", padding: "15px", gap: 10, cursor: ready ? "pointer" : "default" }}
          >
            <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: ready ? "#fff" : "var(--muted)" }}>추천 받기</span>
            <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: ready ? "var(--orange)" : "var(--muted)" }}>→</span>
          </button>
        </SketchBox>
        <p style={{ fontFamily: "var(--font-hand)", fontSize: 17, color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
          과장 없이, 너한테 맞는 셋을 골라드려요.
        </p>
      </div>
    </main>
  );
}

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontFamily: "var(--font-hand)", fontSize: 22, color: "var(--ink)", marginBottom: 9 }}>
        {title}
        {required && <span style={{ color: "var(--plum)" }}> *</span>}
      </p>
      {children}
    </div>
  );
}

function Chips<T extends string>({ options, selected, onPick }: { options: T[]; selected: T[]; onPick: (v: T) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            onClick={() => onPick(o)}
            style={{
              fontFamily: "var(--font-hand)",
              fontSize: 20,
              lineHeight: 1.2,
              padding: "5px 15px",
              border: `2px solid ${on ? "var(--ink)" : "var(--line)"}`,
              borderRadius: 4,
              background: on ? "var(--ink)" : "#fff",
              color: on ? "#fff" : "var(--ink)",
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
