import { afterEach, describe, expect, test, vi } from "vitest";
import { getCropSamples, saveCropSample, type CropSample } from "@/lib/crops";

const sample = (ts: number): Omit<CropSample, "id"> => ({
  image: `data:image/jpeg;base64,${ts}`,
  labels: { oil: 1, redness: 1, pores: 1 },
  features: { shine: 0.1, relRedness: 0.02, cov: 0.1, tzoneL: 120, cheekL: 118 },
  source: "confirmed",
  ts,
});

describe("crop local storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("drops oldest crops until an upgraded crop batch fits localStorage quota", () => {
    let stored = JSON.stringify([
      { ...sample(1), id: "old-1" },
      { ...sample(2), id: "old-2" },
      { ...sample(3), id: "old-3" },
    ]);
    const localStorage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn((_key: string, value: string) => {
        const rows = JSON.parse(value) as CropSample[];
        if (rows.length > 2) throw new DOMException("Quota exceeded", "QuotaExceededError");
        stored = value;
      }),
      removeItem: vi.fn(),
    };

    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("crypto", { randomUUID: () => "new-crop" });

    expect(saveCropSample(sample(4))).toBe(true);
    expect(getCropSamples().map((crop) => crop.ts)).toEqual([3, 4]);
    expect(localStorage.setItem).toHaveBeenCalledTimes(3);
  });
});

