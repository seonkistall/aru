import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as syncPost } from "@/app/api/sync/route";
import {
  buildFunnelFlushBody,
  flushFunnelEvents,
  FUNNEL_FLUSH_FLAG,
  FUNNEL_PROP_KEYS,
  funnelFlushActive,
  redactFunnelEvent,
} from "@/lib/funnel-flush";
import { FUNNEL_ORDER, type FunnelEvent } from "@/lib/funnel";

const root = resolve(import.meta.dirname, "..");
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function event(overrides: Partial<FunnelEvent> = {}): FunnelEvent {
  return {
    id: "evt-1",
    kind: "scan_completed",
    visitorId: "visitor-1",
    sessionId: "session-1",
    props: { retake: false, source: "roi-calibrated" },
    ts: 1_760_000_000_000,
    ...overrides,
  };
}

/** Minimal localStorage so the cursor can be exercised in the node environment. */
function installStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return data;
}

describe("funnel flush gate", () => {
  // Nothing about any user's browser may change until the owner sets the flag, and
  // an exact "on" is what keeps a stray "true" or "1" from opening an egress path.
  it("is off unless the deploy turns it on", () => {
    delete process.env[FUNNEL_FLUSH_FLAG];
    expect(funnelFlushActive()).toBe(false);
    process.env[FUNNEL_FLUSH_FLAG] = "off";
    expect(funnelFlushActive()).toBe(false);
    process.env[FUNNEL_FLUSH_FLAG] = "true";
    expect(funnelFlushActive()).toBe(false);
    process.env[FUNNEL_FLUSH_FLAG] = "on";
    expect(funnelFlushActive()).toBe(true);
  });

  // A green flag test proves nothing about the browser if the read is never inlined.
  // Next replaces public env through webpack's DefinePlugin, keyed on the literal
  // expression `process.env.NEXT_PUBLIC_*` (next/dist/lib/static-env.js builds the key
  // as `process.env.${key}`), so `process.env[FUNNEL_FLUSH_FLAG]` — which reads
  // correctly here, in node — would be undefined in every browser and the flag could
  // never be turned on. The test above cannot see that; this one can.
  it("reads the flag through a literal Next can inline", () => {
    const source = readFileSync(resolve(root, "lib/funnel-flush.ts"), "utf8");
    const body = source.slice(source.indexOf("export function funnelFlushActive"));
    expect(body).toContain('process.env.NEXT_PUBLIC_FUNNEL_FLUSH === "on"');
    expect(body).not.toContain("process.env[");
  });

  it("makes no request at all while the flag is off", async () => {
    delete process.env[FUNNEL_FLUSH_FLAG];
    let calls = 0;
    const result = await flushFunnelEvents({
      events: [event()],
      fetchImpl: (async () => {
        calls++;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("disabled");
    expect(calls).toBe(0);
  });
});

describe("what the flush is allowed to carry", () => {
  // The load-bearing assertion of this file. buildLocalSyncPayload() — what /ops
  // posts — reads getCropSamples(), i.e. consented face images as data URLs, plus
  // labels, pilot notes and the consent audit log. Those travel on an operator's
  // deliberate action behind a typed token. If this builder is ever replaced by that
  // one, an automatic consumer-browser path starts shipping face crops.
  it("carries funnel events and nothing else", () => {
    // Seeded, and that is the point of the test rather than decoration: every
    // device-data getter returns [] when `window` is undefined, so an assertion
    // written against a bare node environment would stay green even if this builder
    // were replaced by buildLocalSyncPayload().
    installStorage({
      gyeol_crop_samples_v1: JSON.stringify([{ id: "crop-1", image: "data:image/png;base64,AAAA", ts: 1 }]),
      gyeol_labels_v1: JSON.stringify([{ id: "label-1", ts: 1 }]),
      gyeol_consent_events_v1: JSON.stringify([{ id: "consent-1", kind: "learning_crop", granted: true, ts: 1 }]),
      gyeol_pilot_notes_v1: JSON.stringify([{ id: "note-1", participant: "P1", ts: 1 }]),
    });
    const body = buildFunnelFlushBody([event()]);
    // Cycle 6 kept the GyeolSyncPayload shape here with the four arrays pinned empty.
    // The body has no field for them at all now, so a swap to buildLocalSyncPayload()
    // is a type error rather than a silently larger payload.
    expect(Object.keys(body).sort()).toEqual(["clientGeneratedAt", "events", "schemaVersion"]);
    expect(body.events).toHaveLength(1);
    // No field anywhere in the body may carry an image, whatever route it took in.
    expect(JSON.stringify(body)).not.toContain("data:image");
  });

  // A stored event is JSON that sat in a browser ARU does not control. Spreading it
  // would forward whatever a future version, a bug or a hand edit put on it.
  it("rebuilds each event from an allowlist instead of spreading it", () => {
    const dirty = {
      ...event(),
      email: "someone@example.com",
      note: "내 피부가 너무 건조해요",
      crop: "data:image/png;base64,AAAA",
    } as unknown as FunnelEvent;
    const clean = redactFunnelEvent(dirty);
    expect(Object.keys(clean ?? {}).sort()).toEqual(["id", "kind", "props", "sessionId", "ts", "visitorId"]);
    expect(JSON.stringify(clean)).not.toContain("example.com");
    expect(JSON.stringify(clean)).not.toContain("data:image");
  });

  // sanitizeProps bounds value TYPES; it cannot bound keys. On-device an accidental
  // free-text prop was a contained mistake. On a flush it is an egress of free text.
  it("drops prop keys the kind does not declare, and non-primitive values", () => {
    const clean = redactFunnelEvent(event({
      kind: "camera_blocked",
      props: { reason: "permission", freeText: "사용자가 입력한 문장", nested: { a: 1 } } as never,
    }));
    expect(clean?.props).toEqual({ reason: "permission" });
  });

  it("drops an event whose kind is not a funnel kind", () => {
    expect(redactFunnelEvent(event({ kind: "email_entered" as never }))).toBeNull();
  });

  // Mechanical, so a new call site cannot quietly widen what leaves the device.
  it("declares a prop key allowlist covering every recordFunnelEvent call site", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) files.push(rel);
      }
    };
    walk("app");
    walk("lib");

    const found: { file: string; kind: string; key: string }[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const match of source.matchAll(/recordFunnelEvent\(\s*"([a-z_]+)"\s*,\s*\{([^}]*)\}/g)) {
        const [, kind, body] = match;
        for (const part of body.split(",")) {
          const key = part.trim().split(":")[0].trim();
          if (key) found.push({ file, kind, key });
        }
      }
    }
    // The anchor: if the regex stops matching because the call shape moved, this
    // test must fail loudly rather than pass on an empty scan.
    expect(found.length).toBeGreaterThanOrEqual(12);

    const undeclared = found.filter(({ kind, key }) => !(FUNNEL_PROP_KEYS[kind as keyof typeof FUNNEL_PROP_KEYS] ?? []).includes(key));
    expect(undeclared, `undeclared funnel props: ${JSON.stringify(undeclared)}`).toEqual([]);
    expect(Object.keys(FUNNEL_PROP_KEYS).sort()).toEqual([...FUNNEL_ORDER].sort());
  });
});

describe("the flush cannot authenticate against /api/sync", () => {
  // Cycle 6's finding, still true and still pinned — it is the whole reason
  // /api/funnel exists. POST /api/sync requires SUPABASE_SYNC_TOKEN, and a browser
  // cannot hold that secret: putting it in client JS publishes it to every visitor.
  // The flush now posts to /api/funnel instead; tests/funnel-ingest.test.ts runs the
  // same flush against that handler and gets a 202.
  it("is refused 401 when posted without the sync token", async () => {
    // >= 32 chars, or getSyncToken() rejects it and the 401 would be "no token is
    // configured" rather than "this request did not present the token".
    process.env.SUPABASE_SYNC_TOKEN = "test-sync-token-that-no-browser-can-ever-hold";
    const response = await syncPost(new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildFunnelFlushBody([event()])),
    }));
    expect(response.status).toBe(401);
  });
});

describe("the flush cursor", () => {
  it("does not re-send events a server already acknowledged", async () => {
    installStorage({ aru_funnel_flushed_v1: JSON.stringify(["evt-1"]) });
    process.env[FUNNEL_FLUSH_FLAG] = "on";
    const bodies: string[] = [];
    const result = await flushFunnelEvents({
      events: [event({ id: "evt-1" }), event({ id: "evt-2" })],
      fetchImpl: (async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("sent");
    expect(result.attempted).toBe(1);
    expect(bodies[0]).toContain("evt-2");
    expect(bodies[0]).not.toContain("evt-1");
  });

  // Defect found hunting this path for what the ingest endpoint would inherit. The
  // cursor was written from the REDACTED ids, and redactFunnelEvent truncates an id to
  // FUNNEL_ID_MAX. An id longer than that was acknowledged under its prefix, which
  // pendingFunnelEvents never matches, so the device re-POSTed the same event on every
  // page-hide for the life of the browser profile — and now against a public endpoint
  // with a rate limit, so the device eventually spends its whole budget on one event.
  it("records the id as this device stores it, not as the wire truncates it", async () => {
    const data = installStorage();
    process.env[FUNNEL_FLUSH_FLAG] = "on";
    const longId = `evt-${"x".repeat(120)}`;
    const send = (async () => new Response("{}", { status: 202 })) as unknown as typeof fetch;

    const first = await flushFunnelEvents({ events: [event({ id: longId })], fetchImpl: send });
    expect(first.outcome).toBe("sent");
    const [recorded] = JSON.parse(data.get("aru_funnel_flushed_v1") ?? "[]") as string[];
    expect(recorded).toHaveLength(longId.length);
    expect(recorded).toBe(longId);

    let calls = 0;
    const second = await flushFunnelEvents({
      events: [event({ id: longId })],
      fetchImpl: (async () => {
        calls++;
        return new Response("{}", { status: 202 });
      }) as unknown as typeof fetch,
    });
    expect(second.outcome).toBe("empty");
    expect(calls).toBe(0);
  });

  // The same defect's other half. An event the redactor drops outright never reached
  // the cursor, so it was offered, dropped, and offered again on the next flush
  // forever — and while it was the only thing pending, the flush returned "empty" and
  // the device's real events behind it never moved either.
  it("retires an event no server could ever accept", async () => {
    const data = installStorage();
    process.env[FUNNEL_FLUSH_FLAG] = "on";
    let calls = 0;
    const result = await flushFunnelEvents({
      events: [event({ id: "retired-kind", kind: "email_entered" as never })],
      fetchImpl: (async () => {
        calls++;
        return new Response("{}", { status: 202 });
      }) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("empty");
    expect(calls).toBe(0);
    expect(JSON.parse(data.get("aru_funnel_flushed_v1") ?? "[]")).toEqual(["retired-kind"]);
  });

  // The reason the transport is fetch and not navigator.sendBeacon: a beacon reports
  // only that the request was queued, so a beacon flush would advance the cursor over
  // the 401 above and delete exactly the events it was meant to deliver.
  it("does not advance over a refusal", async () => {
    const data = installStorage();
    process.env[FUNNEL_FLUSH_FLAG] = "on";
    const result = await flushFunnelEvents({
      events: [event({ id: "evt-9" })],
      fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("rejected");
    expect(result.status).toBe(401);
    expect(data.get("aru_funnel_flushed_v1")).toBeUndefined();
  });
});
