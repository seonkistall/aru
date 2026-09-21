import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCheckins, recordCheckin } from "@/lib/store";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

/**
 * A refused write must not come back looking like a stored one.
 *
 * `lsPush` swallows a `localStorage.setItem` throw and returns false on purpose — its
 * own comment says a blocked or full store "must not reject into the caller's click
 * handler". `recordProductUse` honours that signal; `recordCheckin` used to discard it
 * and return a fully-populated `Checkin`, so `/checkin`'s card called `onDone()` and
 * rendered "남겨주신 피드백을 저장했어요." over an empty store. The user answers three
 * questions, is told it was saved, finds the card un-answered on the next visit, and
 * the week-2/week-4 mail keeps asking for the same thing.
 *
 * The trigger is an ordinary one: Safari private mode and a quota-full device both make
 * `setItem` throw, which is the case every other store in this repo already guards.
 */

const root = resolve(import.meta.dirname, "..");

function installStorage({ refuse = false }: { refuse?: boolean } = {}) {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuse) throw new DOMException("quota", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => data.delete(key),
  });
  vi.stubGlobal("crypto", { randomUUID: () => "checkin-1" });
  return data;
}

const answers = {
  sku_id: "sr1",
  week: 2 as const,
  satisfaction: 2,
  trouble: false,
  repurchase: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("check-in writes report whether they landed", () => {
  it("returns the record and stores it when localStorage accepts the write", async () => {
    const data = installStorage();

    const saved = await recordCheckin(answers);

    expect(saved).toMatchObject({ id: "checkin-1", sku_id: "sr1", week: 2 });
    expect(JSON.parse(data.get(DEVICE_DATA_KEY.checkins) ?? "[]")).toEqual([saved]);
    expect(await getCheckins()).toEqual([saved]);
  });

  it("returns null when the write was refused, rather than a record nobody stored", async () => {
    installStorage({ refuse: true });

    const saved = await recordCheckin(answers);

    expect(saved).toBeNull();
    expect(await getCheckins()).toEqual([]);
  });

  it("makes the card show an error instead of the saved confirmation", () => {
    // The store's signal is only worth anything if the screen reads it. Asserted on
    // source because the confirmation and the error live in one branch of one
    // component, and rendering /checkin needs a seeded product use two weeks old —
    // which tests/e2e/checkin-schedule.regression-7.spec.ts already does.
    const page = readFileSync(resolve(root, "app/checkin/page.tsx"), "utf8");
    expect(page).toContain("const saved = await recordCheckin(");
    expect(page).toMatch(/if \(!saved\) \{\s*setSaveFailed\(true\);\s*return;/);
    expect(page).toContain(
      't("저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.")',
    );
  });
});
