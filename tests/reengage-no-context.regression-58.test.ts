import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reminder opt-in stored the visitor's skin type and product category next to
 * their email.
 *
 * /report rendered `<ReengageOptIn context={`${survey.type}·${survey.category}`} />`,
 * the opt-in POSTed that string as `context`, and /api/reengage/subscribe upserted it
 * into `reengage_contacts` keyed by the email. Nothing read the column back, the only
 * consent the visitor gives is the checkbox "리마인드 발송을 위해 이메일 저장에 동의해요",
 * and /privacy lists what an email reminder record holds without it. The opt-in now
 * sends no `context`, and the route writes `context: null` whatever the body carries,
 * so an older cached page that still sends one stores nothing and a re-subscribe clears
 * a value stored before.
 *
 * There is no DOM here: useState is replaced by a slot store, the component is called
 * as a function, and its form's onSubmit is invoked with fetch stubbed. Supabase is
 * mocked; nothing here talks to a real project.
 *
 * Found by the cycle 122 bug hunt.
 */

const rt = vi.hoisted(() => {
  const state = { slots: [] as unknown[], cursor: 0 };
  function useState<T>(init: T | (() => T)) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { value: typeof init === "function" ? (init as () => T)() : init };
    const slot = state.slots[i] as { value: T };
    return [slot.value, (next: T) => { slot.value = next; }] as const;
  }
  return { state, useState };
});

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: rt.useState };
});

const db = vi.hoisted(() => ({ upserts: [] as Array<{ table: string; row: Record<string, unknown> }> }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: async () => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        db.upserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));

const { POST: subscribe } = await import("@/app/api/reengage/subscribe/route");

// What /report passed before: `${survey.type}·${survey.category}` for a 민감성 visitor
// who chose 세럼.
const SURVEY_CONTEXT = "민감성·세럼";

type Element = { type: unknown; props: Record<string, unknown> };

function* walk(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const child of value) yield* walk(child);
    return;
  }
  if (!value || typeof value !== "object" || !("props" in value)) return;
  const element = value as Element;
  yield element;
  yield* walk(element.props.children);
}

/** Renders the opt-in, fills the address and ticks the one checkbox, submits, and returns the request body it sent. */
async function submitOptIn(props: Record<string, unknown>): Promise<string> {
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
  // A fresh module each time: the component remembers a successful opt-in for the
  // rest of the tab in module scope, and would render its confirmation instead.
  vi.resetModules();
  const { ReengageOptIn } = await import("@/app/components/reengage-optin");
  // Called the way a caller that still passes the old prop would call it, so this
  // fails if the component ever forwards a survey answer again.
  const render = ReengageOptIn as unknown as (props: Record<string, unknown>) => unknown;
  rt.state.slots = [];
  rt.state.cursor = 0;
  render(props);
  (rt.state.slots[0] as { value: string }).value = "kim@example.com";
  (rt.state.slots[1] as { value: boolean }).value = true;
  rt.state.cursor = 0;
  const form = [...walk(render(props))].find((element) => element.type === "form");
  expect(form).toBeDefined();
  (form!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  return sent[0];
}

let client = 0;

function subscribeRequest(body: string) {
  // A fresh client key per call: the route rate-limits per client.
  client += 1;
  return new Request("https://aru.test/api/reengage/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://aru.test",
      host: "aru.test",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": `198.51.100.${client}`,
    },
    body,
  });
}

beforeEach(() => {
  db.upserts = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the reminder opt-in stores no survey answer", () => {
  it("sends the email, consent and locale, and no context key", async () => {
    const body = JSON.parse(await submitOptIn({ context: SURVEY_CONTEXT })) as Record<string, unknown>;
    expect(body).not.toHaveProperty("context");
    expect(body).toEqual({ email: "kim@example.com", consent: true, locale: "ko" });
  });

  it("writes context null when an older page's body still carries one, and keeps every other column", async () => {
    const response = await subscribe(subscribeRequest(JSON.stringify({
      email: "kim@example.com",
      consent: true,
      context: SURVEY_CONTEXT,
      locale: "ko",
    })));
    expect(response.status).toBe(200);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].table).toBe("reengage_contacts");
    // The key is present and null, so the upsert also clears a value an earlier
    // opt-in stored for the same address.
    expect(db.upserts[0].row).toHaveProperty("context", null);
    expect(db.upserts[0].row).toEqual({
      email: "kim@example.com",
      context: null,
      consent: true,
      consent_version: "2026-07-15.v1",
      consented_at: expect.any(String),
      locale: "ko",
      revoked_at: null,
      retention_until: null,
      week2_sent_at: null,
      week4_sent_at: null,
    });
  });

  it("stores no skin type or category from the opt-in's own submit, end to end", async () => {
    const body = await submitOptIn({ context: SURVEY_CONTEXT });
    vi.unstubAllGlobals();
    const response = await subscribe(subscribeRequest(body));
    expect(response.status).toBe(200);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].row.context).toBeNull();
    expect(JSON.stringify(db.upserts)).not.toContain("민감성");
    expect(JSON.stringify(db.upserts)).not.toContain("세럼");
  });
});
