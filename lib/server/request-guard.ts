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
