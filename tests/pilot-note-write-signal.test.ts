import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentPilotSession,
  getPilotNotes,
  savePilotNote,
  type PilotNote,
} from "@/lib/pilot";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

/**
 * `savePilotNote` was the only device store in the repo with no `window` guard, no cap
 * and no try/catch, where labels.ts, consent.ts, crops.ts, store.ts, scan-history.ts and
 * funnel.ts all guard and cap. It ran a bare
 * `localStorage.setItem(KEY, JSON.stringify(all))` from /pilot's click handler.
 *
 * What a full or blocked store cost was not only the note. The `QuotaExceededError`
 * escaped into React, so the NEXT statement — `setCurrentPilotSession` — never ran, and
 * /scan reads that scope on every consent toggle
 * (`recordConsentEvent(kind, next, session ? { participantId, sessionId } : undefined)`).
 * An unestablished scope means every consent event for that participant is recorded
 * unscoped, and participant scope is what the participant-grouped cross-validation
 * needs. So the ordering below is the fix, not a detail of it: the scope is written
 * first, from its own small key, and the note's failure cannot take it down.
 *
 * Research-mode only — /pilot is in proxy.ts's matcher and 404s in production unless
 * INTERNAL_TOOLS_USER / INTERNAL_TOOLS_PASSWORD are set.
 */

const root = resolve(import.meta.dirname, "..");

function installStorage({ refuseKeys = [] as string[] } = {}) {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuseKeys.includes(key)) throw new DOMException("quota", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => data.delete(key),
  });
  let n = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `note-${(n += 1)}` });
  return data;
}

const note: Omit<PilotNote, "id" | "ts"> = {
  participant: "P007",
  browser: "ios-safari",
  lighting: "window",
  makeup: "none",
  glasses: false,
  hairCover: false,
  scanCompleted: true,
  consentAi: true,
  consentCrop: false,
  notes: "guide fit ok",
};

afterEach(() => vi.unstubAllGlobals());

describe("savePilotNote reports whether the roster row landed", () => {
  it("returns the record, stores it, and sets the participant scope", () => {
    const data = installStorage();

    const saved = savePilotNote(note);

    expect(saved).toMatchObject({ id: "note-1", participantId: "P007", status: "scanned" });
    expect(JSON.parse(data.get(DEVICE_DATA_KEY.pilotNotes) ?? "[]")).toEqual([saved]);
    expect(getCurrentPilotSession()).toMatchObject({ participantId: "P007", round: "pilot-1" });
  });

  it("returns null instead of throwing when the note write is refused", () => {
    installStorage({ refuseKeys: [DEVICE_DATA_KEY.pilotNotes] });

    // The escape this guards: before the fix this call threw QuotaExceededError out of
    // savePilotNote and into /pilot's onClick.
    expect(() => savePilotNote(note)).not.toThrow();
    expect(savePilotNote(note)).toBeNull();
    expect(getPilotNotes()).toEqual([]);
  });

  it("still establishes the participant scope when the note write is refused", () => {
    // The consequence the backlog item named, and the reason the two writes are ordered
    // the way they are. A note lost to a full store is a lost note; a scope lost to the
    // same store silently unscopes every consent event recorded afterwards.
    installStorage({ refuseKeys: [DEVICE_DATA_KEY.pilotNotes] });

    expect(savePilotNote(note)).toBeNull();

    expect(getCurrentPilotSession()).toMatchObject({ participantId: "P007" });
  });

  it("returns null rather than throwing when the scope key itself is refused", () => {
    installStorage({ refuseKeys: [DEVICE_DATA_KEY.pilotSession] });

    const saved = savePilotNote(note);

    expect(saved).toMatchObject({ participantId: "P007" });
    expect(getCurrentPilotSession()).toBeNull();
  });

  it("returns null under SSR instead of touching a localStorage that is not there", () => {
    vi.unstubAllGlobals();
    // A behavioural pin, and NOT a guard on the `typeof window` guard — said plainly
    // rather than left to look like one. Deleting `if (typeof window === "undefined")
    // return null;` from savePilotNote leaves this case green: under Node there is no
    // `localStorage` binding at all, so the write throws a ReferenceError that the same
    // try/catch two lines down swallows, and the function returns null by the other
    // route. Verified by making that exact deletion — 7 passed. What the guard actually
    // buys is that the SSR path returns without attempting the write, which is the
    // convention the six sibling stores follow, and that is not observable from here.
    expect(savePilotNote(note)).toBeNull();
  });

  it("caps the stored roster at MAX_PILOT_NOTES, keeping the newest", () => {
    const data = installStorage();
    const existing = Array.from({ length: 500 }, (_, i) => ({ ...note, id: `old-${i}`, ts: i }));
    data.set(DEVICE_DATA_KEY.pilotNotes, JSON.stringify(existing));

    const saved = savePilotNote(note);

    const stored = JSON.parse(data.get(DEVICE_DATA_KEY.pilotNotes) ?? "[]") as PilotNote[];
    expect(stored).toHaveLength(500);
    expect(stored[0].id).toBe("old-1");
    expect(stored[499]).toEqual(saved);
  });

  it("/pilot keeps the typed fields and says so when the write was refused", () => {
    // Asserted on source because the property is what does NOT happen: the early return
    // must come before the three setters that clear the form, or a dropped note looks
    // like a note that was never typed. A behavioural test that only checked for an
    // error row would pass with the return removed.
    const page = readFileSync(resolve(root, "app/pilot/page.tsx"), "utf8");
    const guard = page.indexOf("if (!saved) {");
    const clearNotes = page.indexOf('setNotes("");');
    expect(guard, "/pilot no longer reads savePilotNote's result").toBeGreaterThan(-1);
    expect(clearNotes, "/pilot no longer clears the note field").toBeGreaterThan(-1);
    expect(guard, "the refused-write guard must return before the form is cleared").toBeLessThan(clearNotes);
    expect(page.slice(guard, clearNotes)).toContain("return;");
  });
});
