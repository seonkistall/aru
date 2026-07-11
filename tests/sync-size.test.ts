import { describe, expect, test } from "vitest";
import { buildSyncRequestBody, syncRequestByteSize } from "@/lib/sync-size";

describe("sync request sizing", () => {
  test("measures the exact UTF-8 body that ops will post", () => {
    const payload = {
      schemaVersion: "2026-06-29.sync.v1" as const,
      clientGeneratedAt: 1750000000000,
      source: "ops-local" as const,
      labels: [],
      cropSamples: [],
      pilotNotes: [],
      consentEvents: [],
      funnelEvents: [],
    };
    const body = buildSyncRequestBody({ dryRun: false, payload });

    expect(body).toBe(JSON.stringify({ dryRun: false, payload }));
    expect(syncRequestByteSize(body)).toBe(new TextEncoder().encode(body).length);
  });

  test("counts non-ASCII bytes correctly", () => {
    const body = JSON.stringify({ message: "아루" });

    expect(syncRequestByteSize(body)).toBeGreaterThan(body.length);
  });
});

