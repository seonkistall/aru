import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import {
  careIntentCount,
  getCareIntents,
  getCheckins,
  getProductUses,
  recordCareIntent,
  recordCheckin,
  recordProductUse,
} from "@/lib/store";
import { getCurrentPilotSession, getPilotNotes, pilotNoteCount, savePilotNote } from "@/lib/pilot";

/**
 * The commerce and pilot half of `tests/device-store-shape.test.ts`.
 *
 * Cycle 29 guarded `lib/funnel.ts`; cycle 30 guarded `lib/scan-history.ts`,
 * `lib/crops.ts` and `lib/labels.ts`. `lib/store.ts` and `lib/pilot.ts` read the same
 * `JSON.parse(localStorage.getItem(KEY) || "[]")` idiom and were NOT claimed to be
 * safe — this file measures what each wrong shape actually does before it is guarded.
 *
 * `lib/store.ts` fails DIFFERENTLY from the three already fixed, and that is why it
 * was called the closest to biting: `lsPush` runs `all.push(value)` OUTSIDE its
 * try/catch, so a wrong shape throws on the push rather than on the read, and because
 * `recordCareIntent` / `recordProductUse` / `recordCheckin` are `async` the throw
 * arrives at the caller as a REJECTED PROMISE rather than as a render error. On
 * `/care` the commerce out-link still opens (`openCareLink` records with `void` and
 * then navigates), so the user sees a working click while nothing is logged.
 *
 * `lib/consent.ts` is deliberately NOT in this file. "Read as empty" there means "no
 * consent event in the audit trail", which is hard guardrail 4 and a decision rather
 * than a line. It stays in the backlog with that reason.
 */

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function installStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  return data;
}

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["an object", '{"a":1}'],
  ["a string", '"abcdef"'],
  ["a boolean", "false"],
];

const CARE = DEVICE_DATA_KEY.careIntents;
const USES = DEVICE_DATA_KEY.purchases;
const CHECKINS = DEVICE_DATA_KEY.checkins;
const NOTES = DEVICE_DATA_KEY.pilotNotes;
const SESSION = DEVICE_DATA_KEY.pilotSession;

const INTENT = { kind: "purchase" as const, label: "x", href: "https://example.com", locale: "ko" as const };

describe("the care-intent store holding something that is not a list of intents", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    it(`reads as no intents, and counts zero, when the store holds ${name}`, () => {
      installStorage({ [CARE]: raw });
      expect(getCareIntents(), `getCareIntents() on ${name}`).toEqual([]);
      expect(careIntentCount(), `careIntentCount() on ${name}`).toBe(0);
    });

    // /privacy's effect calls careIntentCount() with no try/catch, so a throw here is
    // a throw inside a React effect and app/error.tsx takes the page.
    it(`does not throw in /privacy's effect when the store holds ${name}`, () => {
      installStorage({ [CARE]: raw });
      expect(() => careIntentCount(), `careIntentCount() on ${name}`).not.toThrow();
    });

    it(`still records the care intent, and repairs the store, when it holds ${name}`, async () => {
      const store = installStorage({ [CARE]: raw });
      await expect(recordCareIntent(INTENT), `recordCareIntent on ${name}`).resolves.not.toBeNull();
      expect(JSON.parse(store.get(CARE) ?? "null"), `the store was not rewritten over ${name}`).toHaveLength(1);
      expect(careIntentCount(), `careIntentCount() after repairing over ${name}`).toBe(1);
    });
  }

  it("leaves a real care-intent log alone", async () => {
    installStorage({ [CARE]: "[]" });
    await recordCareIntent(INTENT);
    await recordCareIntent({ ...INTENT, label: "y" });
    expect(careIntentCount()).toBe(2);
    // getCareIntents reverses: newest first.
    expect(getCareIntents().map((row) => row.label)).toEqual(["y", "x"]);
  });
});

describe("the /checkin stores holding something that is not a list", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    // /checkin's effect is `Promise.all([getProductUses(), getCheckins()]).then(...)`
    // with no `.catch`, so a rejection leaves `productUses` null forever and the page
    // renders its blank loading <main> for the life of the install.
    it(`resolves to empty lists rather than rejecting /checkin's effect on ${name}`, async () => {
      installStorage({ [USES]: raw, [CHECKINS]: raw });
      await expect(
        Promise.all([getProductUses(), getCheckins()]),
        `/checkin's effect on ${name}`,
      ).resolves.toEqual([[], []]);
    });

    it(`still records a product use, and repairs the store, when it holds ${name}`, async () => {
      const store = installStorage({ [USES]: raw });
      await expect(recordProductUse({ sku_id: "s1", name: "n" }), `recordProductUse on ${name}`).resolves.not.toBeNull();
      expect(JSON.parse(store.get(USES) ?? "null"), `the store was not rewritten over ${name}`).toHaveLength(1);
    });

    it(`still records a checkin, and repairs the store, when it holds ${name}`, async () => {
      const store = installStorage({ [CHECKINS]: raw });
      await expect(
        recordCheckin({ sku_id: "s1", week: 2, satisfaction: 4, trouble: false, repurchase: true }),
        `recordCheckin on ${name}`,
      ).resolves.not.toBeNull();
      expect(JSON.parse(store.get(CHECKINS) ?? "null"), `the store was not rewritten over ${name}`).toHaveLength(1);
    });
  }

  it("leaves real /checkin rows alone", async () => {
    installStorage({ [USES]: "[]", [CHECKINS]: "[]" });
    await recordProductUse({ sku_id: "s1", name: "n" });
    await recordCheckin({ sku_id: "s1", week: 2, satisfaction: 4, trouble: false, repurchase: true });
    const [uses, checkins] = await Promise.all([getProductUses(), getCheckins()]);
    expect(uses).toHaveLength(1);
    expect(checkins).toHaveLength(1);
  });
});

const NOTE = {
  participant: "7",
  browser: "android-chrome" as const,
  lighting: "window" as const,
  makeup: "none" as const,
  glasses: false,
  hairCover: false,
  scanCompleted: true,
  consentAi: false,
  consentCrop: false,
  notes: "",
};

describe("the pilot note store holding something that is not a list of notes", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    it(`reads as no notes, and counts zero, when the store holds ${name}`, () => {
      installStorage({ [NOTES]: raw });
      expect(getPilotNotes(), `getPilotNotes() on ${name}`).toEqual([]);
      expect(() => pilotNoteCount(), `pilotNoteCount() on ${name}`).not.toThrow();
      expect(pilotNoteCount(), `pilotNoteCount() on ${name}`).toBe(0);
    });

    it(`still saves the note, and repairs the store, when it holds ${name}`, () => {
      const store = installStorage({ [NOTES]: raw });
      expect(savePilotNote(NOTE), `savePilotNote on ${name}`).not.toBeNull();
      expect(JSON.parse(store.get(NOTES) ?? "null"), `the store was not rewritten over ${name}`).toHaveLength(1);
      expect(pilotNoteCount(), `pilotNoteCount() after repairing over ${name}`).toBe(1);
    });
  }

  it("leaves a real roster alone", () => {
    installStorage({ [NOTES]: "[]" });
    savePilotNote(NOTE);
    savePilotNote({ ...NOTE, participant: "8" });
    expect(pilotNoteCount()).toBe(2);
  });
});

/**
 * `getCurrentPilotSession` returns an OBJECT, not an array, so `Array.isArray` is the
 * wrong guard for it and a blanket "same fix everywhere" would have been wrong here.
 * Its three call sites read `session.participantId` / `session.sessionId`
 * (`app/scan/page.tsx`, `app/scan/use-capture-analysis.ts`, `app/pilot/page.tsx`) after
 * a truthiness check, so `null`, `false` and `0` were already neutralised by the
 * callers. What was NOT neutralised is a truthy non-object: on `5` or `"abcdef"` the
 * truthiness check passes, `session.participantId` is `undefined`, and every consent
 * event for that participant lands UNSCOPED — a silent data loss in the research
 * stream rather than a crash, which is the harder failure to notice.
 */
describe("the current pilot session holding something that is not a session", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    it(`reads as no session when the store holds ${name}`, () => {
      installStorage({ [SESSION]: raw });
      expect(getCurrentPilotSession(), `getCurrentPilotSession() on ${name}`).toBeNull();
    });
  }

  it("leaves a real session alone", () => {
    installStorage({ [NOTES]: "[]" });
    savePilotNote(NOTE);
    expect(getCurrentPilotSession()).toMatchObject({ participantId: "P007" });
  });
});
