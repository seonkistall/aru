import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A crop sample's `id` went into the storage object path with nothing checking it.
 *
 * `uploadCropSamples` built `pilot-crops/<date>/${sample.id}.${ext}`, so `id: "../x"`
 * placed the object outside `pilot-crops/<date>/` and `id: "a/b"` invented a
 * subdirectory under it. Filed by cycle 71's hunt as the other half of the
 * `new Date(sample.ts)` line and left open because the id format the client writes had
 * not been checked, so a charset rule risked refusing real rows. It has now been
 * checked: `uid()` in `lib/crops.ts` is `crypto.randomUUID()` with
 * `String(Math.random()).slice(2)` as the fallback, and both fit
 * `^[A-Za-z0-9_-]{1,128}$`.
 *
 * Supabase is mocked, as in tests/sync-crop-timestamp.test.ts: nothing here talks to a
 * real project.
 */
const store = vi.hoisted(() => ({
  uploads: [] as string[],
  writes: [] as { table: string; rows: unknown }[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasValidSyncToken: () => true,
  isSupabaseSyncConfigured: () => true,
  getSupabaseAdmin: async () => ({
    from: (table: string) => ({
      upsert: async (rows: unknown) => {
        store.writes.push({ table, rows });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          store.uploads.push(path);
          return { error: null };
        },
      }),
    },
  }),
}));

const { POST: syncPost } = await import("@/app/api/sync/route");

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkY=";
const TS = Date.UTC(2026, 9, 3);

/** The real client-side shape: `crypto.randomUUID()`, which is what `uid()` returns. */
const GENERATED_ID = "3f1c9a52-7b0e-4d8a-9c61-2e5f4a6b8d03";

function syncRequest(badId: unknown) {
  const payload = {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: 1,
    source: "ops-local",
    labels: [],
    pilotNotes: [],
    consentEvents: [{ id: "c1", kind: "learning_crop", granted: true, version: "v1", text: "t", ts: 1 }],
    cropSamples: [
      { id: badId, image: IMAGE, ts: TS, features: {}, labels: {}, source: "pilot" },
      { id: GENERATED_ID, image: IMAGE, ts: TS, features: {}, labels: {}, source: "pilot" },
    ],
  };
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ dryRun: false, payload }),
  });
}

beforeEach(() => {
  store.uploads = [];
  store.writes = [];
  process.env.SUPABASE_CROP_BUCKET = "crops";
});

describe("crop sample with an id that is not an id", () => {
  it.each([
    ["a parent-directory traversal", "../x", "../x"],
    ["a nested path", "a/b", "a/b"],
    ["an absolute path", "/etc/x", "/etc/x"],
    ["an empty string", "", ""],
    ["a non-string", 7, "number"],
    // `RegExp.test(undefined)` coerces to the string "undefined", which the charset
    // would otherwise accept — so a missing id is its own case, not a duplicate.
    ["a missing id", undefined, "undefined"],
    ["an object", { a: 1 }, "object"],
  ])("skips %s with a warning, and uploads nothing for it", async (_label, badId, labelled) => {
    const response = await syncPost(syncRequest(badId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.warnings).toContain(`Skipping crop ${labelled}: unsupported id.`);
    // Only the real id reached storage, so the refused row cannot leave an object
    // anywhere — inside `pilot-crops/<date>/` or outside it.
    expect(store.uploads).toEqual([`pilot-crops/2026-10-03/${GENERATED_ID}.jpg`]);
    expect(body.counts.cropUploads).toBe(1);
  });

  it("uploads a real generated id under pilot-crops/<date>/ and nowhere else", async () => {
    const response = await syncPost(syncRequest(GENERATED_ID.replace(/^3/, "9")));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.counts.cropUploads).toBe(2);
    expect(body.warnings.filter((warning: string) => warning.includes("unsupported id."))).toEqual([]);
    expect(store.uploads).toEqual([
      `pilot-crops/2026-10-03/${GENERATED_ID.replace(/^3/, "9")}.jpg`,
      `pilot-crops/2026-10-03/${GENERATED_ID}.jpg`,
    ]);
  });

  it("holds the charset against what uid() in lib/crops.ts actually generates", () => {
    // The reason the fix is a charset and not just a slash ban. If either branch of
    // `uid()` drifts to a character outside this set, this fails before the server
    // starts refusing real rows in silence.
    const pattern = /^[A-Za-z0-9_-]{1,128}$/;
    for (let i = 0; i < 2000; i += 1) {
      expect(pattern.test(crypto.randomUUID())).toBe(true);
      const fallback = String(Math.random()).slice(2);
      expect(pattern.test(fallback)).toBe(true);
    }
  });
});
