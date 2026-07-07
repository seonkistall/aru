import { afterEach, describe, expect, it } from "vitest";
import { getConsentEvents, recordConsentEvent } from "@/lib/consent";

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

describe("recordConsentEvent", () => {
  it("returns the stored event when the consent audit write succeeds", () => {
    const data = installStorage((key, value) => data.set(key, value));

    const event = recordConsentEvent("ai_analysis", true);

    expect(event?.granted).toBe(true);
    expect(getConsentEvents()).toHaveLength(1);
  });

  it("returns null when localStorage is blocked so callers cannot treat consent as audited", () => {
    installStorage(() => {
      throw new Error("quota exceeded");
    });

    expect(recordConsentEvent("learning_crop", true)).toBeNull();
    expect(getConsentEvents()).toHaveLength(0);
  });
});
