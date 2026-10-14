import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A routine /ops re-sync un-deleted crops.
 *
 * /ops never clears the device, so every sync sends every stored crop again.
 * `uploadCropSamples` re-uploaded the image (a removed object is simply created again)
 * and upserted the row with `deleted_at: null` and `exclude_reason: null` hard-coded,
 * so a deletion or exclusion an operator made following docs/supabase-sync-runbook.md
 * section 6 (a participant's deletion request, a reviewer excluding a bad crop) was
 * undone by the next sync. Found by the cycle 116 bug hunt.
 *
 * Supabase is mocked: nothing here talks to a real project.
 */
const store = vi.hoisted(() => ({
  uploads: [] as string[],
  writes: [] as { table: string; rows: Record<string, unknown> }[],
  serverRows: [] as { id: string; deleted_at: number | null; exclude_reason: string | null }[],
  lookupError: null as null | { message: string },
  lookups: [] as string[][],
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasValidSyncToken: () => true,
  isSupabaseSyncConfigured: () => true,
  getSupabaseAdmin: async () => ({
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>) => {
        store.writes.push({ table, rows });
        return { error: null };
      },
      // Modelled on PostgREST: only the selected columns come back, and the filter is
      // on the column named. A lookup that selected `id` alone, or filtered on the
      // wrong column, would see no markers and skip nothing.
      select: (columns: string) => ({
        in: async (column: string, ids: string[]) => {
          store.lookups.push(ids);
          if (store.lookupError) return { data: null, error: store.lookupError };
          const keep = columns.split(",").map((name) => name.trim());
          const rows = store.serverRows.filter((row) => ids.includes(String(row[column as keyof typeof row])));
          return { data: rows.map((row) => Object.fromEntries(keep.map((name) => [name, row[name as keyof typeof row]]))), error: null };
        },
      }),
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

function crop(id: string) {
  return { id, image: IMAGE, ts: TS, features: {}, labels: {}, source: "pilot" };
}

function syncRequest(ids: string[]) {
  const payload = {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: 1,
    source: "ops-local",
    labels: [],
    pilotNotes: [],
    consentEvents: [{ id: "c1", kind: "learning_crop", granted: true, version: "v1", text: "t", ts: 1 }],
    cropSamples: ids.map(crop),
  };
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ dryRun: false, payload }),
  });
}

const cropWrites = () => store.writes.filter((write) => write.table === "crop_samples");

beforeEach(() => {
  store.uploads = [];
  store.writes = [];
  store.serverRows = [];
  store.lookupError = null;
  store.lookups = [];
  process.env.SUPABASE_CROP_BUCKET = "crops";
});

describe("a crop the server has retired", () => {
  it("is neither re-uploaded nor written back when it was deleted", async () => {
    store.serverRows = [{ id: "gone", deleted_at: Date.UTC(2026, 9, 5), exclude_reason: null }];
    const body = await (await syncPost(syncRequest(["gone", "kept"]))).json();

    expect(body.counts.cropUploads).toBe(1);
    expect(body.warnings).toContain("Skipping crop gone: deleted or excluded on the server.");
    expect(store.uploads).toEqual(["pilot-crops/2026-10-03/kept.jpg"]);
    expect(cropWrites().map((write) => write.rows.id)).toEqual(["kept"]);
  });

  it("is skipped when it was excluded without being deleted", async () => {
    store.serverRows = [{ id: "bad", deleted_at: null, exclude_reason: "blurred" }];
    const body = await (await syncPost(syncRequest(["bad"]))).json();

    expect(body.counts.cropUploads).toBe(0);
    expect(store.uploads).toEqual([]);
    expect(cropWrites()).toEqual([]);
  });

  it("does not send deleted_at or exclude_reason at all, so a row's server markers are left alone", async () => {
    store.serverRows = [{ id: "live", deleted_at: null, exclude_reason: null }];
    await syncPost(syncRequest(["live"]));

    const [write] = cropWrites();
    expect(write.rows.id).toBe("live");
    expect(write.rows).not.toHaveProperty("deleted_at");
    expect(write.rows).not.toHaveProperty("exclude_reason");
  });

  it("uploads nothing when the lookup itself fails", async () => {
    store.lookupError = { message: "boom" };
    const body = await (await syncPost(syncRequest(["a", "b"]))).json();

    expect(store.uploads).toEqual([]);
    expect(cropWrites()).toEqual([]);
    expect(JSON.stringify(body)).toContain("crop_samples lookup: boom");
  });

  it("looks ids up in chunks of 100", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `c${i}`);
    await syncPost(syncRequest(ids));
    expect(store.lookups.map((chunk) => chunk.length)).toEqual([100, 100, 5]);
  });
});
