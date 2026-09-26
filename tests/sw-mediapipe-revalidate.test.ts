import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * `public/sw.js`, driven directly.
 *
 * The worker is registered on every production page (`ServiceWorkerRegistration`,
 * `app/components/service-worker-registration.tsx`) and nothing else in the suite
 * touches it, because the registration is gated on `NODE_ENV === "production"` and the
 * E2E suite runs `npm run dev`.
 *
 * What it got wrong: `/vendor/mediapipe/` — the ~33 MB MediaPipe runtime and face model,
 * at six URLs with no content hash in them — was cache-first with no revalidation and a
 * cache name that only rotates when the worker's own bytes change. Measured on two
 * production builds at the same origin: after the second deploy the server was serving
 * **322064** bytes of `wasm/vision_wasm_internal.js` and the returning visitor's worker
 * kept answering with the **322044** it had cached on the first, including for a page
 * `fetch(url, { cache: "no-store" })`. A deploy that fixed the capture runtime would
 * never have reached anyone whose cache was warm.
 *
 * These cases are the FAILURE paths as much as the happy one: a worker that rejects
 * `respondWith` for the runtime or the model is a dead capture screen, so every way the
 * revalidation can fail has to end with the cached copy served and nothing thrown.
 */

const SOURCE = readFileSync("public/sw.js", "utf8");
const ORIGIN = "https://aru.example";

type FakeRequest = { url: string; method: string; mode: string };

function request(path: string, init: Partial<FakeRequest> = {}): FakeRequest {
  return { url: ORIGIN + path, method: "GET", mode: "no-cors", ...init };
}

type Harness = {
  fire: (req: FakeRequest) => { responded: Promise<Response> | null; waits: Promise<unknown>[] };
  activate: () => Promise<void>;
  install: () => Promise<void>;
  cacheBodies: (name: string) => Promise<Record<string, string>>;
  cacheNames: () => string[];
  setServer: (fn: (req: FakeRequest) => Promise<Response>) => void;
  fetchCount: () => number;
};

function load(seed: Record<string, Record<string, string>> = {}): Harness {
  const stores = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(seed)) {
    const store = new Map<string, Response>();
    for (const [url, body] of Object.entries(entries)) store.set(url, new Response(body, { status: 200 }));
    stores.set(name, store);
  }

  const makeCache = (store: Map<string, Response>) => ({
    match: async (req: FakeRequest | string) => {
      const hit = store.get(typeof req === "string" ? ORIGIN + req : req.url);
      return hit ? hit.clone() : undefined;
    },
    put: async (req: FakeRequest | string, res: Response) => {
      // The real Cache API rejects a 206 outright. Model that, since avoiding it is one
      // of the things the worker is supposed to do.
      if (res.status === 206) throw new TypeError("Partial response (status code 206) is unsupported");
      store.set(typeof req === "string" ? ORIGIN + req : req.url, res);
    },
    add: async (path: string) => {
      const res = await server(request(path));
      if (!res.ok) throw new TypeError("Request failed");
      store.set(ORIGIN + path, res);
    },
    keys: async () => [...store.keys()].map((url) => ({ url })),
  });

  let server: (req: FakeRequest) => Promise<Response> = async () => new Response("default", { status: 200 });
  let fetchCount = 0;

  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return makeCache(stores.get(name)!);
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (path: string) => {
      for (const store of stores.values()) {
        const hit = store.get(ORIGIN + path);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };

  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => void (listeners[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    location: { origin: ORIGIN },
  };

  const sandbox = {
    self,
    caches,
    fetch: (req: FakeRequest) => {
      fetchCount += 1;
      return server(req);
    },
    Response,
    URL,
    Set,
    Map,
    Promise,
    TypeError,
    console,
  };
  runInContext(SOURCE, createContext(sandbox));

  const drive = (type: string, req?: FakeRequest) => {
    let responded: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    listeners[type]({
      request: req,
      respondWith: (value: Promise<Response>) => void (responded = value),
      waitUntil: (value: Promise<unknown>) => void waits.push(value),
    });
    return { responded: responded as Promise<Response> | null, waits };
  };

  return {
    fire: (req) => drive("fetch", req),
    install: async () => void (await Promise.all(drive("install").waits)),
    activate: async () => void (await Promise.all(drive("activate").waits)),
    cacheBodies: async (name) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      const out: Record<string, string> = {};
      for (const [url, res] of store) out[url] = await res.clone().text();
      return out;
    },
    cacheNames: () => [...stores.keys()],
    setServer: (fn) => void (server = fn),
    fetchCount: () => fetchCount,
  };
}

const WASM = "/vendor/mediapipe/wasm/vision_wasm_internal.js";
const MODEL = "/vendor/mediapipe/face_landmarker.task";
const MP_CACHE = "aru-mediapipe-v1";
const SHELL_CACHE = "aru-shell-v1";

describe("the MediaPipe cache against a new deploy", () => {
  let h: Harness;
  beforeEach(() => {
    h = load({ [MP_CACHE]: { [ORIGIN + WASM]: "deploy-1" } });
  });

  it("serves the cached copy immediately and replaces it behind the visitor", async () => {
    h.setServer(async () => new Response("deploy-2", { status: 200 }));

    const first = h.fire(request(WASM));
    expect(await (await first.responded!).text(), "the visitor waited on the network").toBe("deploy-1");
    // The revalidation is handed to waitUntil, not awaited in front of the response.
    expect(first.waits.length).toBe(1);
    await Promise.all(first.waits);
    expect((await h.cacheBodies(MP_CACHE))[ORIGIN + WASM]).toBe("deploy-2");

    // The next visit is the new bytes. This is the whole defect: before the fix this
    // second read was still "deploy-1", forever.
    const second = h.fire(request(WASM));
    expect(await (await second.responded!).text()).toBe("deploy-2");
  });

  it("keeps serving the cached copy when the revalidation fails offline", async () => {
    h.setServer(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { responded, waits } = h.fire(request(WASM));
    expect(await (await responded!).text()).toBe("deploy-1");
    // The failure must be swallowed: an unhandled rejection here is a failed
    // subresource, which for the runtime is a dead capture screen.
    await expect(Promise.all(waits)).resolves.toBeDefined();
    expect((await h.cacheBodies(MP_CACHE))[ORIGIN + WASM]).toBe("deploy-1");
  });

  it("does not overwrite the cache when the deploy no longer has the file", async () => {
    h.setServer(async () => new Response("<!doctype html>not found", { status: 404 }));
    const { responded, waits } = h.fire(request(WASM));
    expect(await (await responded!).text()).toBe("deploy-1");
    await Promise.all(waits);
    expect((await h.cacheBodies(MP_CACHE))[ORIGIN + WASM]).toBe("deploy-1");
  });

  it("does not try to cache a 206, which the Cache API rejects outright", async () => {
    // `response.ok` is true for a 206 and these files are served with
    // `Accept-Ranges: bytes`. Pins the behaviour, not the mechanism: the worker has two
    // layers (`status === 200` and a `.catch` on the put), and the supervisor's cycle 44
    // review found that swapping the first for `.ok` alone still passes this file.
    h.setServer(async () => new Response("partial", { status: 206 }));
    const { responded, waits } = h.fire(request(WASM));
    expect(await (await responded!).text()).toBe("deploy-1");
    await expect(Promise.all(waits)).resolves.toBeDefined();
    expect((await h.cacheBodies(MP_CACHE))[ORIGIN + WASM]).toBe("deploy-1");
  });
});

describe("the MediaPipe cache with nothing in it", () => {
  it("waits for the network and stores what it gets", async () => {
    const h = load();
    h.setServer(async () => new Response("first-download", { status: 200 }));
    const { responded } = h.fire(request(MODEL));
    expect(await (await responded!).text()).toBe("first-download");
    expect((await h.cacheBodies(MP_CACHE))[ORIGIN + MODEL]).toBe("first-download");
  });

  it("hands a 206 straight to the page instead of turning it into a network error", async () => {
    // The cold-cache half of the 206 case: the partial content must reach the page and
    // must not be stored. Both layers in the worker (`status === 200`, and the `.catch` on
    // the put) keep it working on their own; removing both is what this catches.
    const h = load();
    h.setServer(async () => new Response("partial", { status: 206 }));
    const { responded } = h.fire(request(WASM));
    const response = await responded!;
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("partial");
    expect(await h.cacheBodies(MP_CACHE)).toEqual({});
  });

  it("returns a network error rather than rejecting when there is nothing to fall back to", async () => {
    const h = load();
    h.setServer(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { responded } = h.fire(request(MODEL));
    const response = await responded!;
    expect(response.type).toBe("error");
  });
});

describe("what the worker does not touch, which is most of the app", () => {
  it("leaves a non-GET request alone", async () => {
    const h = load();
    expect(h.fire(request(WASM, { method: "POST" })).responded).toBeNull();
  });

  it("leaves /api/ alone, so nothing consented or measured is ever answered from a cache", async () => {
    const h = load();
    expect(h.fire(request("/api/sync")).responded).toBeNull();
    expect(h.fire(request("/api/out?sku=sr1")).responded).toBeNull();
  });

  it("leaves the Next.js chunks alone, so a new build's dictionary chunk is always fetched", async () => {
    // The ja/zh/ar dictionaries have been a dynamic import() since cycle 40. Their chunk
    // URLs carry a content hash and the worker never caches them, which is why a
    // returning ja visitor on a new deploy gets the new chunk and not a stale page.
    const h = load();
    expect(h.fire(request("/_next/static/chunks/0sdh970j0a0j2.js")).responded).toBeNull();
    expect(h.fetchCount()).toBe(0);
  });
});

describe("navigation and the offline page", () => {
  it("is network-first, so a new deploy's HTML is never served from a cache", async () => {
    const h = load({ [SHELL_CACHE]: { [ORIGIN + "/offline.html"]: "offline page" } });
    h.setServer(async () => new Response("fresh page", { status: 200 }));
    const { responded } = h.fire(request("/report", { mode: "navigate" }));
    expect(await (await responded!).text()).toBe("fresh page");
  });

  it("falls back to the cached offline page when the network is gone", async () => {
    const h = load({ [SHELL_CACHE]: { [ORIGIN + "/offline.html"]: "offline page" } });
    h.setServer(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { responded } = h.fire(request("/report", { mode: "navigate" }));
    expect(await (await responded!).text()).toBe("offline page");
  });

  it("returns a network error, not a rejection, when even the offline page is missing", async () => {
    const h = load();
    h.setServer(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { responded } = h.fire(request("/report", { mode: "navigate" }));
    expect((await responded!).type).toBe("error");
  });
});

describe("install", () => {
  it("puts the offline page in the shell cache", async () => {
    const h = load();
    h.setServer(async () => new Response("offline page", { status: 200 }));
    await h.install();
    expect((await h.cacheBodies(SHELL_CACHE))[ORIGIN + "/offline.html"]).toBe("offline page");
  });

  it("fails install when the offline page cannot be fetched, which leaves no worker at all", async () => {
    // Recorded rather than fixed: `cache.add` rejects on a failed or non-ok response and
    // the rejection is inside `waitUntil`, so the worker is discarded and the browser
    // retries the registration on the next navigation. The cost of getting this wrong is
    // one visit with no offline fallback, not a broken page.
    const h = load();
    h.setServer(async () => new Response("nope", { status: 503 }));
    await expect(h.install()).rejects.toThrow();
    expect(h.cacheNames()).toEqual([SHELL_CACHE]);
    expect(await h.cacheBodies(SHELL_CACHE)).toEqual({});
  });
});

describe("activate", () => {
  it("drops a cache the worker no longer uses and keeps the two it does", async () => {
    const h = load({
      [SHELL_CACHE]: { [ORIGIN + "/offline.html"]: "offline page" },
      [MP_CACHE]: { [ORIGIN + WASM]: "deploy-1" },
      "aru-shell-v0": { [ORIGIN + "/old.html"]: "old" },
    });
    await h.activate();
    expect(h.cacheNames().sort()).toEqual([MP_CACHE, SHELL_CACHE]);
  });
});
