import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, isForeignOriginRequest, requestClientKey } from "@/lib/server/request-guard";

/**
 * `/api/analyze` and `/api/reason` are the only two routes in ARU that spend the
 * owner's money, and both did it for anyone who asked. This file is written as the
 * bill rather than as the happy path: every test that reaches an upstream call
 * asserts on `upstream`, the list of URLs the stubbed `fetch` was handed, because a
 * status code alone cannot tell a refusal from a paid call that failed.
 *
 * `globalThis.fetch` is replaced for the whole file. Nothing here may ever reach
 * api.openai.com or generativelanguage.googleapis.com, and the stub throwing on any
 * URL it does not recognise is what enforces that.
 */
const upstream: { url: string; bodyBytes: number }[] = [];

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const { POST: analyzePost } = await import("@/app/api/analyze/route");
const { POST: reasonPost } = await import("@/app/api/reason/route");

const HOST = "aru.test";
const ORIGIN = "https://aru.test";

/** Each test gets its own client key so the routes' module-level limiters cannot leak between them. */
let clientSeq = 0;

beforeEach(() => {
  upstream.length = 0;
  clientSeq += 1;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? init.body : "";
    upstream.push({ url, bodyBytes: new TextEncoder().encode(body).byteLength });
    if (url.startsWith("https://api.openai.com/")) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reasons: ["스텁 응답"], oil: 0, redness: 0, pores: 0 }) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ labels: { oil: 0, redness: 0, pores: 0 } }) }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`test stub refused an unexpected upstream call: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

/** A real JPEG signature (`FF D8 FF`), padded out with base64 filler. */
function jpegDataUrl(base64Length = 64) {
  const filler = "A".repeat(Math.max(0, base64Length - 4));
  return `data:image/jpeg;base64,/9j/${filler}${"=".repeat((4 - ((4 + filler.length) % 4)) % 4)}`;
}

function headers(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    host: HOST,
    "x-forwarded-for": `198.51.100.${clientSeq}`,
    ...extra,
  };
}

/** Shaped the way ARU's own pages send it: same-origin `Origin`, `Sec-Fetch-Site: same-origin`. */
function samePage(extra: Record<string, string> = {}) {
  return headers({ origin: ORIGIN, "sec-fetch-site": "same-origin", ...extra });
}

function analyzeReq(body: unknown, hdrs: Record<string, string>) {
  return new Request(`${ORIGIN}/api/analyze`, { method: "POST", headers: hdrs, body: JSON.stringify(body) });
}

function reasonReq(hdrs: Record<string, string>, itemCount = 1) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    brand: `브랜드${i}`,
    name: `제품${i}`,
    category: "토너",
    type: "복합성",
    matched: ["유분"],
    budgetText: "2만원대",
    freeOf: [],
    fallback: "성분 구성을 한번 살펴보세요.",
  }));
  return new Request(`${ORIGIN}/api/reason`, { method: "POST", headers: hdrs, body: JSON.stringify({ items, lang: "ko" }) });
}

/**
 * Question 1 — does either route accept a caller that plainly is not one of ARU's pages?
 *
 * The supervisor predicted yes from reading, and on the unguarded tree that is what
 * these cases measured: every one of them reached the upstream call. They are kept as
 * the refusal contract.
 */
describe("a caller that is not one of ARU's own pages cannot spend the API budget", () => {
  const foreign: [string, Record<string, string>][] = [
    ["no Origin at all (curl's default)", headers()],
    ["a foreign Origin", headers({ origin: "https://evil.example" })],
    ["Sec-Fetch-Site: cross-site", headers({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })],
    ["Sec-Fetch-Site: cross-site with ARU's own Origin spoofed", headers({ origin: ORIGIN, "sec-fetch-site": "cross-site" })],
    ["Sec-Fetch-Site: same-site (a sibling subdomain)", headers({ origin: "https://other.aru.test", "sec-fetch-site": "same-site" })],
    ["an Origin whose host merely CONTAINS ARU's", headers({ origin: "https://aru.test.evil.example" })],
    ["an Origin that is not a URL", headers({ origin: "null" })],
  ];

  for (const [label, hdrs] of foreign) {
    it(`/api/analyze refuses ${label} and calls no model`, async () => {
      process.env.GEMINI_API_KEY = "test-key-not-a-real-one";
      const response = await analyzePost(analyzeReq({ image: jpegDataUrl() }, hdrs));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, reason: "forbidden origin" });
      expect(upstream).toEqual([]);
    });

    it(`/api/reason refuses ${label} and calls no model`, async () => {
      process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
      const response = await reasonPost(reasonReq(hdrs));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ reasons: [], reason: "forbidden origin" });
      expect(upstream).toEqual([]);
    });
  }
});

/**
 * The other half of the same guard: ARU's own pages must still get through. A guard
 * that refused everything would pass every test above and ship a dead product.
 */
describe("ARU's own same-origin fetches still reach the model", () => {
  it("/api/analyze calls the vision provider for a same-origin request", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-a-real-one";
    delete process.env.VISION_PROVIDER;
    const response = await analyzePost(analyzeReq({ image: jpegDataUrl() }, samePage()));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url.startsWith("https://generativelanguage.googleapis.com/")).toBe(true);
  });

  it("/api/reason calls the chat model for a same-origin request", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
    const response = await reasonPost(reasonReq(samePage()));
    expect(response.status).toBe(200);
    expect(upstream.map((call) => call.url)).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });

  it("a request with no Sec-Fetch-Site at all is judged on Origin alone", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
    const response = await reasonPost(reasonReq(headers({ origin: ORIGIN })));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });

  it("an unrecognised Sec-Fetch-Site value is ignored, per the spec's own instruction", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
    const response = await reasonPost(reasonReq(samePage({ "sec-fetch-site": "some-future-value" })));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });

  it("x-forwarded-host is what the host is compared against behind the edge", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
    const hdrs = headers({ origin: "https://www.aru.example", host: "internal-1", "x-forwarded-host": "www.aru.example" });
    const response = await reasonPost(reasonReq(hdrs));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });
});

/**
 * Question 2 — what does the limiter in `lib/server/request-guard.ts` actually bound?
 *
 * Measured against the exported limiter itself rather than reasoned about, because the
 * answer is narrower than "10 requests a minute" in two ways that matter to a bill.
 * What is NOT established here, and is not claimed anywhere: how Vercel, or any other
 * host, sets or strips `x-vercel-forwarded-for` and `x-forwarded-for`. No primary
 * source for that was reachable from this network, so the shape of the bound in
 * production is unknown; what follows is what the code in this repository does.
 */
describe("what the rate limiter bounds, measured", () => {
  it("bounds requests per client KEY, and the key is a header the caller sends", () => {
    const limit = createRateLimiter({ max: 10, windowMs: 60_000, maxKeys: 10_000 });
    const now = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 40; i += 1) if (limit("198.51.100.7", now)) allowed += 1;
    expect(allowed).toBe(10);

    // The same wall-clock instant, 40 more calls, one fresh key each: all allowed.
    let allowedRotating = 0;
    for (let i = 0; i < 40; i += 1) if (limit(`203.0.113.${i}`, now)) allowedRotating += 1;
    expect(allowedRotating).toBe(40);
  });

  it("takes its key from headers the caller controls, in a fixed order", () => {
    const req = (h: Record<string, string>) => new Request(`${ORIGIN}/api/reason`, { method: "POST", headers: h });
    expect(requestClientKey(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(requestClientKey(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(requestClientKey(req({}))).toBe("unknown");
  });

  it("is one Map per module instance, so two instances do not share a budget", () => {
    // `createRateLimiter` closes over its own `Map`. Two limiters built from the same
    // policy are two independent budgets for the same key — which is exactly what a
    // second serverless instance of the same route is.
    const a = createRateLimiter({ max: 10, windowMs: 60_000, maxKeys: 10_000 });
    const b = createRateLimiter({ max: 10, windowMs: 60_000, maxKeys: 10_000 });
    const now = 2_000_000;
    let total = 0;
    for (let i = 0; i < 10; i += 1) if (a("198.51.100.9", now)) total += 1;
    for (let i = 0; i < 10; i += 1) if (b("198.51.100.9", now)) total += 1;
    expect(total).toBe(20);
    expect(a("198.51.100.9", now)).toBe(false);
  });

  it("the window is per key and resets, so the bound is 10 per key per minute per instance", () => {
    const limit = createRateLimiter({ max: 10, windowMs: 60_000, maxKeys: 10_000 });
    for (let i = 0; i < 10; i += 1) expect(limit("198.51.100.11", 3_000_000)).toBe(true);
    expect(limit("198.51.100.11", 3_000_000)).toBe(false);
    expect(limit("198.51.100.11", 3_000_000 + 60_000)).toBe(true);
  });

  it("the route limiter runs after the origin guard, so a refused caller never fills a bucket", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-one";
    const key = `198.51.100.${clientSeq}`;
    for (let i = 0; i < 30; i += 1) {
      const response = await reasonPost(reasonReq(headers({ "x-forwarded-for": key, origin: "https://evil.example" })));
      expect(response.status).toBe(403);
    }
    // 30 refusals later the same key is still unspent from the route's point of view.
    const ok = await reasonPost(reasonReq(samePage({ "x-forwarded-for": key })));
    expect(ok.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });
});

/**
 * Question 3 — can a caller make the route spend on work ARU never asks for?
 *
 * Before this cycle `parseAnalyzeInput` checked the data-URL shape and the decoded
 * size and nothing else, so any bytes at all under an `image/jpeg` label were paid
 * for. The magic-byte check is what closes that; the size ceiling was already there
 * and is pinned here so it cannot be lost.
 */
describe("what /api/analyze will and will not pay a vision model to look at", () => {
  const refusedBodies: [string, unknown, number][] = [
    ["1 MB of base64 filler labelled image/jpeg", { image: `data:image/jpeg;base64,${"A".repeat(1_400_000)}` }, 400],
    ["a PNG relabelled image/jpeg", { image: "data:image/jpeg;base64,iVBORw0KGgoAAA==" }, 400],
    ["a JPEG relabelled image/png", { image: "data:image/png;base64,/9j/4AAQSkY=" }, 400],
    ["a GIF", { image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }, 400],
    // The signature has to be AT offset 0. These bytes are `00 00 00 FF D8 FF 00 00 00`:
    // filler that merely contains the JPEG marker further in, which is not a JPEG.
    ["filler containing the JPEG marker at a non-zero offset", { image: "data:image/jpeg;base64,AAAA/9j/AAAA" }, 400],
    ["a bare string", { image: "hello" }, 400],
    ["no image field", { notAnImage: 1 }, 400],
    ["2 MB of base64 over the 1.5 MB decoded ceiling", { image: `data:image/jpeg;base64,/9j/${"A".repeat(2_000_000)}` }, 413],
  ];

  for (const [label, body, status] of refusedBodies) {
    it(`refuses ${label} without calling a model`, async () => {
      process.env.GEMINI_API_KEY = "test-key-not-a-real-one";
      const response = await analyzePost(analyzeReq(body, samePage()));
      expect(response.status).toBe(status);
      expect(upstream).toEqual([]);
    });
  }

  it("a body over the 2.1 MB cap is refused before it is parsed", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-a-real-one";
    const request = new Request(`${ORIGIN}/api/analyze`, {
      method: "POST",
      headers: samePage({ "content-length": "3000000" }),
      body: JSON.stringify({ image: jpegDataUrl() }),
    });
    const response = await analyzePost(request);
    expect(response.status).toBe(413);
    expect(upstream).toEqual([]);
  });

  it("still accepts a real JPEG signature, which is what the scan crop produces", async () => {
    // `cropPlanForPurpose("ai-analysis")` is `mimeType: "image/jpeg"`
    // (app/scan/camera-quality.ts:55), so the bytes the product sends start `FF D8 FF`.
    process.env.GEMINI_API_KEY = "test-key-not-a-real-one";
    delete process.env.VISION_PROVIDER;
    const response = await analyzePost(analyzeReq({ image: jpegDataUrl(2048) }, samePage()));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });
});

/**
 * The guard as a unit, including the two cases the route tests cannot reach: a request
 * with neither Origin nor Host, and the `none` value a browser only ever sets on a
 * user-initiated navigation.
 */
describe("isForeignOriginRequest", () => {
  const req = (h: Record<string, string>) => new Request(`${ORIGIN}/api/analyze`, { method: "POST", headers: h });

  it("accepts same-origin and none, refuses cross-site and same-site", () => {
    expect(isForeignOriginRequest(req({ host: HOST, origin: ORIGIN, "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isForeignOriginRequest(req({ host: HOST, origin: ORIGIN, "sec-fetch-site": "none" }))).toBe(false);
    expect(isForeignOriginRequest(req({ host: HOST, origin: ORIGIN, "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isForeignOriginRequest(req({ host: HOST, origin: ORIGIN, "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("matches the Sec-Fetch-Site value case-insensitively and past surrounding space", () => {
    expect(isForeignOriginRequest(req({ host: HOST, origin: ORIGIN, "sec-fetch-site": " CROSS-SITE " }))).toBe(true);
  });

  it("refuses a request carrying no Host to compare an Origin against", () => {
    const bare = new Request(`${ORIGIN}/api/analyze`, { method: "POST" });
    bare.headers.delete("host");
    expect(isForeignOriginRequest(bare)).toBe(true);
  });
});
