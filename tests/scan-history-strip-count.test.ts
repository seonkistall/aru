import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * The /report history strip's count described a different set from its chart.
 *
 * The header said 최근 {n}회 스캔 with n = every stored scan (the history keeps up to 30)
 * while the bars under it are the last 6, so a visitor with 10 scans read "Last 10
 * scans" over 6 bars. The count is now what is drawn. Found by the cycle 118 bug hunt.
 *
 * The strip reads the history in a mount effect; a slot-based stand-in for useState and
 * useEffect runs that effect once and renders again, as React would.
 */
const runtime = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as Array<() => void> }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) runtime.slots[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [runtime.slots[slot], (value: unknown) => void (runtime.slots[slot] = value)];
    },
    useEffect: (fn: () => void) => void runtime.effects.push(fn),
  };
});

const { ScanHistoryStrip } = await import("@/app/components/scan-history-strip");
const { DEVICE_DATA_KEY } = await import("@/lib/device-data");

function mount() {
  runtime.slots = [];
  runtime.effects = [];
  runtime.index = 0;
  ScanHistoryStrip();
  for (const effect of runtime.effects.splice(0)) effect();
  runtime.index = 0;
  return renderToStaticMarkup(ScanHistoryStrip() as ReactElement);
}

function seed(count: number) {
  const day = 86_400_000;
  const entries = Array.from({ length: count }, (_, i) => ({ ts: Date.now() - (count - 1 - i) * day, oil: i % 3, redness: 0, pores: 0 }));
  const data = new Map<string, string>([[DEVICE_DATA_KEY.scanHistory, JSON.stringify(entries)]]);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: () => {}, removeItem: () => {} });
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("the history strip's count", () => {
  it("counts the six bars it draws, not all ten stored scans", () => {
    seed(10);
    const html = mount();
    expect(html.match(/role="img"/g)).toHaveLength(6);
    expect(html).toContain("최근 6회 스캔");
    expect(html).not.toContain("최근 10회 스캔");
  });

  it("counts two when two are stored", () => {
    seed(2);
    const html = mount();
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html).toContain("최근 2회 스캔");
  });
});
