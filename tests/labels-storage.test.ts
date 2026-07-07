import { afterEach, describe, expect, it } from "vitest";
import { getLabels, saveLabel, type LabeledSample } from "@/lib/labels";

const sample: LabeledSample = {
  ts: 1,
  features: {
    shine: 0.1,
    relRedness: 0.02,
    cov: 0.1,
    tzoneL: 120,
    cheekL: 118,
  },
  labels: { oil: 1, redness: 1, pores: 1 },
  source: "confirmed",
};

function installStorage(setItem: (key: string, value: string) => void) {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem,
      removeItem: (key: string) => data.delete(key),
    },
    configurable: true,
  });
  return data;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("saveLabel", () => {
  it("returns true and stores a label with a generated id", () => {
    const data = installStorage((key, value) => data.set(key, value));

    expect(saveLabel(sample)).toBe(true);
    expect(getLabels()).toHaveLength(1);
    expect(getLabels()[0].id).toBeTruthy();
  });

  it("returns false instead of throwing when localStorage is blocked or full", () => {
    installStorage(() => {
      throw new Error("quota exceeded");
    });

    expect(() => saveLabel(sample)).not.toThrow();
    expect(saveLabel(sample)).toBe(false);
  });
});
