export class RequestGuardError extends Error {
  constructor(public status: 400 | 413, message: string) { super(message); }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new RequestGuardError(413, "request too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RequestGuardError(413, "request too large");
  try { return JSON.parse(text); } catch { throw new RequestGuardError(400, "invalid JSON"); }
}

export function createRateLimiter(policy: { max: number; windowMs: number; maxKeys: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()) => {
    if (buckets.size >= policy.maxKeys && !buckets.has(key)) {
      for (const [k, value] of buckets) if (value.resetAt <= now) buckets.delete(k);
      if (buckets.size >= policy.maxKeys) return false;
    }
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= policy.max;
  };
}

export function requestClientKey(request: Request) {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

/**
 * `Sec-Fetch-Site` values that mean the caller is not one of ARU's own pages.
 *
 * `same-site` is refused alongside `cross-site`: ARU serves its pages from one host,
 * so a sibling subdomain posting to `/api/analyze` is not the scan screen either.
 *
 * `none` is allowed. Per the Fetch Metadata spec's `set-site` algorithm, that value is
 * only ever set for "a navigation request that was explicitly caused by a user's
 * interaction with the user agent" — never for a page's own `fetch()` — so allowing it
 * costs nothing a caller could not already get by sending no header at all.
 * An unrecognised value is also allowed, which is the spec's own instruction: "servers
 * SHOULD ignore this header if it contains an invalid value."
 * (w3c/webappsec-fetch-metadata `index.bs`, lines 205-207 and 209-238.)
 */
const FOREIGN_FETCH_SITES = new Set(["cross-site", "same-site"]);

/**
 * True when the request demonstrably did not come from one of ARU's own pages.
 *
 * This exists because `/api/analyze` and `/api/reason` both spend the owner's money on
 * every call: the first ships a base64 face crop to a vision model, the second a batch
 * of product rows to a chat model. Before this guard, neither looked at where the call
 * came from, so any page anywhere could drive both from a visitor's browser.
 *
 * Two independent signals, either of which is enough to refuse:
 *
 * 1. `Sec-Fetch-Site`. The `Sec-` prefix makes it a forbidden header name, so — quoting
 *    the spec — it is "unmodifiable from JavaScript. This will prevent malicious
 *    websites from convincing user agents to send forged metadata along with requests"
 *    (`index.bs`, "The `Sec-` Prefix"). A page on another site cannot suppress it or
 *    lie about it; a browser that predates it simply does not send it, which is what
 *    the second signal is for.
 * 2. `Origin`. The Fetch Standard appends it to every request whose method is neither
 *    `GET` nor `HEAD`, same-origin included, so a POST that carries none did not come
 *    from a page's `fetch()`. Compared by host rather than by full origin because TLS
 *    terminates at the edge and the scheme the handler sees need not be the browser's.
 *    This is the same rule `app/api/funnel/route.ts` already applies, and the citation
 *    for it lives on that route's `originAllowed`; that route keeps its own copy
 *    because it also reads an allowlist env var, which these two routes do not have.
 *
 * What this is NOT: authentication. `curl` sets any header it likes, including none of
 * these, and nothing here changes that — a non-browser caller is still the rate
 * limiter's problem, and the limiter's own bound is what `docs/llm-route-cost-exposure.md`
 * measures. This is a CSRF boundary: it stops some other site's page from spending the
 * owner's API budget out of a visitor's browser.
 */
export function isForeignOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && FOREIGN_FETCH_SITES.has(fetchSite)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
