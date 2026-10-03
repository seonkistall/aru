import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { clearAllDeviceData, DEVICE_DATA_KEY, type DeviceStorage } from "@/lib/device-data";
import { clearSessionFallback, sessionGet, sessionRemove, sessionSet } from "@/lib/session-store";

// The vitest environment is `node` (vitest.config.ts), so there is no global
// `sessionStorage` unless a test installs one — which is itself one of the browsers
// this module is for: the bare identifier throws a ReferenceError, exactly as a
// blocked store throws a SecurityError.
type Global = typeof globalThis & { sessionStorage?: Storage };

function install(storage: Partial<Storage> | undefined) {
  if (storage === undefined) {
    Reflect.deleteProperty(globalThis, "sessionStorage");
    return;
  }
  (globalThis as Global).sessionStorage = storage as Storage;
}

/** A store that works, so the "storage first" half of each read is exercised too. */
function workingStorage() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    } as Partial<Storage>,
  };
}

/** Chrome with "block all cookies", an in-app browser, or a full quota. */
function throwingStorage(only?: "set") {
  const blocked = () => {
    const error = new Error("blocked");
    error.name = "SecurityError";
    throw error;
  };
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: only === "set" ? (key: string) => values.get(key) ?? null : blocked,
      setItem: blocked,
      removeItem: only === "set" ? (key: string) => void values.delete(key) : blocked,
    } as Partial<Storage>,
  };
}

const SURVEY = JSON.stringify({ type: "건성", concerns: [], budget: 29000, avoid: [], category: "세럼" });

beforeEach(() => {
  clearSessionFallback();
  install(undefined);
});

afterEach(() => {
  clearSessionFallback();
  install(undefined);
});

describe("session store", () => {
  it("reads back what it wrote when the store throws on both getItem and setItem", () => {
    install(throwingStorage().storage);
    sessionSet(DEVICE_DATA_KEY.survey, SURVEY);
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBe(SURVEY);
  });

  it("reads back what it wrote when only setItem throws", () => {
    install(throwingStorage("set").storage);
    sessionSet(DEVICE_DATA_KEY.survey, SURVEY);
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBe(SURVEY);
  });

  it("reads back what it wrote when there is no sessionStorage at all", () => {
    sessionSet(DEVICE_DATA_KEY.scan, "{}");
    expect(sessionGet(DEVICE_DATA_KEY.scan)).toBe("{}");
  });

  it("returns null for a key nothing wrote", () => {
    install(throwingStorage().storage);
    expect(sessionGet(DEVICE_DATA_KEY.reads)).toBeNull();
  });

  it("uses the real store when it works, and keeps nothing in memory", () => {
    const { values, storage } = workingStorage();
    install(storage);
    sessionSet(DEVICE_DATA_KEY.survey, SURVEY);
    expect(values.get(DEVICE_DATA_KEY.survey)).toBe(SURVEY);
    // Nothing was held back: with the store taken away, the read finds nothing.
    install(throwingStorage().storage);
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBeNull();
  });

  it("prefers the real store over a memory copy of the same key", () => {
    install(throwingStorage().storage);
    sessionSet(DEVICE_DATA_KEY.survey, "memory");
    const { storage } = workingStorage();
    install(storage);
    sessionSet(DEVICE_DATA_KEY.survey, "stored");
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBe("stored");
    // And the stale memory copy is gone, not merely shadowed.
    install(throwingStorage().storage);
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBeNull();
  });

  it("removes from memory as well as from the store", () => {
    install(throwingStorage().storage);
    sessionSet(DEVICE_DATA_KEY.reportStep, "2");
    sessionRemove(DEVICE_DATA_KEY.reportStep);
    expect(sessionGet(DEVICE_DATA_KEY.reportStep)).toBeNull();
  });

  it("keeps the funnel's keys apart", () => {
    install(throwingStorage().storage);
    sessionSet(DEVICE_DATA_KEY.survey, SURVEY);
    sessionSet(DEVICE_DATA_KEY.scan, "{}");
    sessionRemove(DEVICE_DATA_KEY.scan);
    expect(sessionGet(DEVICE_DATA_KEY.survey)).toBe(SURVEY);
    expect(sessionGet(DEVICE_DATA_KEY.scan)).toBeNull();
  });
});

describe("delete my device data", () => {
  // The point of this one: an in-memory fallback is device data. A deletion that
  // walked localStorage and sessionStorage alone would leave the submitted survey
  // and the scan reads answering /report for the rest of the tab session.
  function noopDeviceStorage(): DeviceStorage {
    const area = { getItem: () => null, removeItem: () => {} };
    return { local: area, session: area };
  }

  it("clears the in-memory fallback", () => {
    install(throwingStorage().storage);
    sessionSet(DEVICE_DATA_KEY.survey, SURVEY);
    sessionSet(DEVICE_DATA_KEY.scan, "{}");
    sessionSet(DEVICE_DATA_KEY.reads, "{}");
    sessionSet(DEVICE_DATA_KEY.surveyDraft, "{}");
    sessionSet(DEVICE_DATA_KEY.reportStep, "1");

    expect(clearAllDeviceData(noopDeviceStorage())).toEqual([]);

    for (const key of [
      DEVICE_DATA_KEY.survey,
      DEVICE_DATA_KEY.scan,
      DEVICE_DATA_KEY.reads,
      DEVICE_DATA_KEY.surveyDraft,
      DEVICE_DATA_KEY.reportStep,
    ]) {
      expect(sessionGet(key), `${key} survived the deletion`).toBeNull();
    }
  });
});
