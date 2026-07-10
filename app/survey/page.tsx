"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlowSteps } from "@/app/components/flow-steps";
import { recordFunnelEvent } from "@/lib/funnel";
import type { Avoid, Category, Concern, SkinType } from "@/lib/skus";
import type { ScanReads, Survey as SurveyT } from "@/lib/recommend";
import { t } from "@/lib/i18n/core";

const TYPES: SkinType[] = ["지성", "건성", "복합성", "민감성", "중성"];
const CONCERNS: Concern[] = ["모공", "블랙헤드", "붉은기", "건조", "수분부족", "유분", "트러블", "잡티", "칙칙함", "각질", "탄력", "민감"];
const CATEGORIES: Category[] = ["클렌저", "토너", "에센스", "세럼", "크림", "선크림", "마스크팩", "아이크림"];
const AVOIDS: Avoid[] = ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "인공색소", "광물성오일"];
// Store each chip's band CEILING (not its midpoint) so the recommend price
// filter (price <= budget) matches what budgetLabel calls the band — else a
// product at 16,000 is "1만원대" by label yet over a 15,000 cap, producing a
// false "budget stretched" note.
const BUDGETS = [
  { label: "1만원대", won: 19000 },
  { label: "2만원대", won: 29000 },
  { label: "3만원대", won: 39000 },
  { label: "4만원 이상", won: 999999 },
];
const BUDGET_LABELS = BUDGETS.map((b) => b.label);

type ScanHint = { concerns: Concern[]; text: string } | null;

function loadScanHint(): ScanHint {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("gyeol_scan");
    if (!raw) return null;
    const scan = JSON.parse(raw) as ScanReads;
    if (!scan || scan.retakeRecommended || (scan.confidence ?? 0) < 0.58) {
      return { concerns: [], text: t("촬영 조건이 애매해서 설문 답변을 중심으로 추천할게요.") };
    }
    const concerns: Concern[] = [];
    if (scan.oil >= 2) concerns.push("유분");
    if (scan.redness >= 1) concerns.push("붉은기");
    if (scan.pores >= 1) concerns.push("모공");
    return concerns.length
      ? { concerns, text: t("스캔에서 {signals} 신호가 보여 고민에 미리 담았어요.", { signals: concerns.map((c) => t(c)).join("·") }) }
      : { concerns: [], text: t("스캔에서는 크게 도드라진 신호가 적어 기본 설문을 중심으로 볼게요.") };
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
  const [saveErr, setSaveErr] = useState("");
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
    setSaveErr("");
    const survey: SurveyT = { type, concerns, category, budget, avoid };
    try {
      sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
    } catch {
      setSaveErr(t("설문을 저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요."));
      return;
    }
    recordFunnelEvent("survey_completed", { concerns: concerns.length, hasScan: Boolean(scanHint?.concerns.length) });
    router.push("/report");
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>{t("몇 가지만 더 알려주세요")}</p>
        <FlowSteps current="survey" />
        <h1 style={titleStyle}>{t("추천을 더 정확하게 맞춰볼게요")}</h1>

        {(() => {
          const done = [Boolean(category), Boolean(type), Boolean(budget)].filter(Boolean).length;
          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
                <span>{t("필수 항목 {done}/3", { done })}</span>
                <span>{done === 3 ? t("리포트를 볼 수 있어요") : t("제품·타입·예산을 골라주세요")}</span>
              </div>
              <div style={{ height: 6, background: "var(--surface-tint)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(done / 3) * 100}%`, background: "var(--plum)", borderRadius: 3, transition: "width .3s ease" }} />
              </div>
            </div>
          );
        })()}

        {scanHint && (
          <div style={scanHintStyle}>
            <p style={{ margin: 0 }}>{scanHint.text}</p>
            <Link href="/scan" style={retakeLinkStyle}>{t("스캔 다시 하기")}</Link>
          </div>
        )}

        <Section title="제품 종류" required>
          <Chips options={CATEGORIES} selected={category ? [category] : []} onPick={setCategory} />
        </Section>
        <Section title="피부 타입" required>
          <Chips options={TYPES} selected={type ? [type] : []} onPick={setType} />
        </Section>
        <Section title="고민" hint="여러 개 선택할수록 정교해져요">
          <Chips options={CONCERNS} selected={concerns} onPick={(v) => toggle(concerns, v, setConcerns)} />
        </Section>
        <Section title="예산" required>
          <Chips
            options={BUDGET_LABELS}
            selected={budget ? [BUDGETS.find((b) => b.won === budget)?.label ?? ""] : []}
            onPick={(label) => setBudget(BUDGETS.find((b) => b.label === label)?.won ?? null)}
          />
        </Section>
        <Section title="피하고 싶은 성분" hint="화해 주의 성분 기준">
          <Chips options={AVOIDS} selected={avoid} onPick={(v) => toggle(avoid, v, setAvoid)} />
        </Section>

        <button onClick={submit} disabled={!ready} style={submitStyle(Boolean(ready))}>{t("내 추천 보기")}</button>
        {saveErr && <p role="alert" style={{ fontSize: 12.5, color: "var(--plum-press)", textAlign: "center", marginTop: 8 }}>{saveErr}</p>}
        {!ready && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
            {t("제품 종류·피부 타입·예산을 고르면 리포트를 볼 수 있어요")}
          </p>
        )}
      </div>
    </main>
  );
}

function Section({ title, required, hint, children }: { title: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
        {t(title)}{required && <span style={{ color: "var(--plum)" }}> *</span>}
        {hint && <span style={{ color: "var(--faint)", fontWeight: 400 }}> · {t(hint)}</span>}
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
            {t(option)}
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
    color: on ? "var(--plum-press)" : "var(--ink)",
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
