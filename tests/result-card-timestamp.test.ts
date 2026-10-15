import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { SkinReads } from "@/lib/skin";

/**
 * The /scan receipt re-dated itself.
 *
 * ResultCard read `new Date()` in its render body for the receipt's date, time and its
 * ARU·SKIN·YYYYMMDD id. /scan re-renders it on unrelated state changes (a share tap
 * sets and later clears a "copied" flag), so a reading taken at 23:59 and shared at
 * 00:00 showed the next day's date and id under the same reading. The moment is now
 * taken once, when the card first renders. Found by the cycle 118 bug hunt.
 *
 * A slot-based stand-in for useState keeps state across the two renders, as React does
 * for a card that stays mounted.
 */
const runtime = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) runtime.slots[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [runtime.slots[slot], (value: unknown) => void (runtime.slots[slot] = value)];
    },
  };
});

const { ResultCard } = await import("@/app/scan/result-card");

const bucket = (value: string, level: number) => ({ value, level, calm: level === 0, confidence: 0.82 });
const READS = {
  oil: bucket("유분 많음", 2),
  pores: bucket("결 약간 보임", 1),
  redness: bucket("붉은기 낮음", 0),
  overall: bucket("균형 관리 필요", 2),
  headline: "T존 유분이 도드라져 보여요",
  narrative: "",
  confidence: 0.82,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "조명", ok: true, detail: "분석하기 좋은 밝기예요" }],
  source: "roi-calibrated",
  extras: [],
} as unknown as SkinReads;

function render() {
  runtime.index = 0;
  return renderToStaticMarkup(ResultCard({ reads: READS }) as ReactElement);
}

afterEach(() => {
  vi.useRealTimers();
  runtime.slots = [];
});

describe("the /scan receipt's date", () => {
  it("stays the scan's date when the card re-renders after midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 40));
    const atScan = render();
    expect(atScan).toContain("ARU·SKIN·20261015");

    vi.setSystemTime(new Date(2026, 9, 16, 0, 0, 5));
    const afterShareTap = render();
    expect(afterShareTap).toContain("ARU·SKIN·20261015");
    expect(afterShareTap).toBe(atScan);
  });

  it("takes the moment of a new card's first render", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0, 0));
    expect(render()).toContain("ARU·SKIN·20261016");
  });
});
