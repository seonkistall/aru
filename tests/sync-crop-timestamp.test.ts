import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A crop sample whose `ts` is not a valid Date time used to take the whole sync down.
 *
 * `uploadCropSamples` built the storage key from `new Date(sample.ts).toISOString()`,
 * and `toISOString()` throws a RangeError on an Invalid Date. Nothing caught it, so the
 * request answered 500 AFTER `consent_events`, `funnel_events`, `pilot_notes` and
 * `labels` had already been upserted, and the operator saw no per-row error saying
 * which crop it was. `retentionUntil` five lines further down already guarded the same
 * field. Filed by cycle 71's hunt as unreproduced (it needs a storage client); the
 * cycle 71 supervisor review reproduced it with the client mocked, which is what this
 * file does.
 *
 * Supabase is mocked: nothing here talks to a real project.
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

function syncRequest(cropTs: unknown) {
  const payload = {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: 1,
    source: "ops-local",
    labels: [],
    pilotNotes: [],
    consentEvents: [{ id: "c1", kind: "learning_crop", granted: true, version: "v1", text: "t", ts: 1 }],
    cropSamples: [
      { id: "bad", image: IMAGE, ts: cropTs, features: {}, labels: {}, source: "pilot" },
      { id: "good", image: IMAGE, ts: Date.UTC(2026, 9, 3), features: {}, labels: {}, source: "pilot" },
    ],
  };
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ dryRun: false, payload }),
  });
}

beforeEach(() => {
  store.uploads = [];
  store.writes = [];
  process.env.SUPABASE_CROP_BUCKET = "crops";
});

describe("crop sample with an invalid timestamp", () => {
  it.each([
    ["a string", "x"],
    ["an object", {}],
    ["a number past the Date range", 1e20],
  ])("skips %s ts with a warning instead of answering 500", async (_label, ts) => {
    const response = await syncPost(syncRequest(ts));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.counts.cropUploads).toBe(1);
    expect(body.warnings).toContain("Skipping crop bad: invalid timestamp.");
    // The bad sample never reached storage, so it cannot leave an orphan object behind.
    expect(store.uploads).toEqual(["pilot-crops/2026-10-03/good.jpg"]);
  });
});
