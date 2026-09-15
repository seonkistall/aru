import { afterEach, describe, expect, it } from "vitest";
import { getConsentEvents, latestConsent, recordConsentEvent } from "@/lib/consent";
import { resolveCaptureConsent } from "@/app/scan/consent-authorization";

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

describe("consent scope is matched exactly, undefined included", () => {
  // A pilot session and an ordinary scan on the same device are two different
  // consent decisions by (usually) two different people. An unscoped read that
  // matched every scope let the second one vanish: recordConsentEvent dedupes
  // against latestConsent, so the consumer's grant looked like a no-op change.
  const PILOT = { participantId: "P001", sessionId: "P001-1" };

  it("does not let a pilot-scoped grant satisfy an unscoped read", () => {
    const data = installStorage((key, value) => data.set(key, value));
    recordConsentEvent("learning_crop", true, PILOT);

    expect(latestConsent("learning_crop", PILOT)?.participantId).toBe("P001");
    expect(latestConsent("learning_crop")).toBeNull();
  });

  it("records the consumer's own grant after a pilot session on the same device", () => {
    const data = installStorage((key, value) => data.set(key, value));
    recordConsentEvent("learning_crop", true, PILOT);

    const consumer = recordConsentEvent("learning_crop", true);

    // Before the fix this returned P001's event and wrote nothing, so the audit
    // trail lost the consumer's decision entirely.
    expect(consumer?.participantId).toBeUndefined();
    expect(getConsentEvents()).toHaveLength(2);
  });

  it("authorizes the unscoped capture that grant was given for", () => {
    const data = installStorage((key, value) => data.set(key, value));
    recordConsentEvent("learning_crop", true, PILOT);
    recordConsentEvent("learning_crop", true);

    // resolveCaptureConsent always matched scope exactly; the mismatch with
    // latestConsent is what silently discarded the crop.
    const authorized = resolveCaptureConsent(getConsentEvents(), "learning_crop", true);
    expect(authorized?.granted).toBe(true);
    expect(authorized?.participantId).toBeUndefined();
  });

  it("still dedupes a repeated grant within the same scope", () => {
    const data = installStorage((key, value) => data.set(key, value));
    recordConsentEvent("learning_crop", true, PILOT);
    recordConsentEvent("learning_crop", true, PILOT);
    expect(getConsentEvents()).toHaveLength(1);
  });

  it("keeps a withdrawal in one scope out of the other", () => {
    const data = installStorage((key, value) => data.set(key, value));
    recordConsentEvent("learning_crop", true);
    recordConsentEvent("learning_crop", false, PILOT);

    expect(latestConsent("learning_crop")?.granted).toBe(true);
    expect(latestConsent("learning_crop", PILOT)?.granted).toBe(false);
  });
});
