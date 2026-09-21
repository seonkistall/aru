import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCareIntents, recordCareIntent, type CareIntent } from "@/lib/store";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

/**
 * The sibling of the defect cycle 24 fixed one function up, and it is a different
 * defect even though it is the same line.
 *
 * `lsPush` returns false rather than throwing when `localStorage.setItem` is refused —
 * Safari private mode, a quota-full device — because a blocked store "must not reject
 * into the caller's click handler". `recordProductUse` and `recordCheckin` both read
 * that boolean; `recordCareIntent` discarded it and returned a fully-populated
 * `CareIntent` regardless.
 *
 * What that costs is NOT a lie to a user, and this file says so rather than borrowing
 * cycle 24's framing. `openCareLink` (app/care/page.tsx) does `void
 * recordCareIntent({...})` and then opens the merchant link; nothing on screen claims
 * the intent was stored, and the user's actual action — the link opening — succeeds
 * either way. What it costs is measurement: the care-intent log goes silently short and
 * `careIntentCount` under-reports, with nothing anywhere able to detect it.
 *
 * So the fix is the signal and not a new error row, and the third case pins that
 * decision so a later cycle does not "complete" it by adding UI that would report a
 * failure the user did not experience.
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
  vi.stubGlobal("crypto", { randomUUID: () => "care-1" });
  return data;
}

const intent: Omit<CareIntent, "id" | "ts"> = {
  kind: "purchase",
  label: "올리브영",
  href: "/api/out?sku=tn1&merchant=oliveyoung&placement=care",
  locale: "ko",
  context: "top-pick",
  sku_id: "tn1",
  merchant: "oliveyoung",
  placement: "care",
  region: "KR",
};

afterEach(() => vi.unstubAllGlobals());

describe("care-intent writes report whether they landed", () => {
  it("returns the record and stores it when localStorage accepts the write", async () => {
    const data = installStorage();

    const saved = await recordCareIntent(intent);

    expect(saved).toMatchObject({ id: "care-1", kind: "purchase", sku_id: "tn1" });
    expect(JSON.parse(data.get(DEVICE_DATA_KEY.careIntents) ?? "[]")).toEqual([saved]);
    expect(getCareIntents()).toEqual([saved]);
  });

  it("returns null when the write was refused, rather than a record nobody stored", async () => {
    installStorage({ refuse: true });

    const saved = await recordCareIntent(intent);

    expect(saved).toBeNull();
    expect(getCareIntents()).toEqual([]);
  });

  it("still opens the merchant link on a refused write, and claims nothing on screen", () => {
    // The deliberate half. Asserted on source because the ORDER is the property: the
    // record must not gate window.open, or a blocked store would stop the click from
    // doing the one thing the user asked for. A behavioural test that only checked
    // "window.open was called" would pass with the two statements swapped.
    const page = readFileSync(resolve(root, "app/care/page.tsx"), "utf8");
    const record = page.indexOf("void recordCareIntent({");
    const open = page.indexOf('window.open(link.href, "_blank", "noopener,noreferrer")');
    expect(record, "openCareLink no longer records a care intent").toBeGreaterThan(-1);
    expect(open, "openCareLink no longer opens the merchant link").toBeGreaterThan(-1);
    expect(open, "the link must open whether or not the intent was stored").toBeGreaterThan(record);
    // And nothing between them reads the result into a user-visible failure state.
    expect(page.slice(record, open)).not.toMatch(/setSaveFailed|저장하지 못했어요/);
  });
});
