import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductUses, recordProductUse } from "@/lib/store";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

function installStorage(seed: unknown[] = []) {
  const data = new Map([[DEVICE_DATA_KEY.purchases, JSON.stringify(seed)]]);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  vi.stubGlobal("crypto", { randomUUID: () => "use-1" });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe("explicit product-use records", () => {
  it("ignores legacy merchant clicks that were stored as purchases", async () => {
    installStorage([{ id: "legacy", sku_id: "sr1", name: "세럼", price: 22000, ts: 1 }]);
    expect(await getProductUses()).toEqual([]);
  });

  it("stores only an explicit, confirmed use start without a seed price", async () => {
    const data = installStorage();
    const saved = await recordProductUse({ sku_id: "sr1", name: "세럼" });

    expect(saved).toMatchObject({ id: "use-1", sku_id: "sr1", confirmedUse: true });
    expect(saved).not.toHaveProperty("price");
    expect(JSON.parse(data.get(DEVICE_DATA_KEY.purchases) ?? "[]")).toEqual([saved]);
  });
});
