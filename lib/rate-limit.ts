// In-memory per-IP fixed-window limiter for public API routes. Best-effort:
// serverless instances don't share the map, but it blunts single-instance abuse
// of the paid vision/LLM endpoints (which otherwise call the provider on every
// request with no cap). Keyed on the first x-forwarded-for hop, which is
// spoofable — this is a cost/DoS speed bump, not an auth boundary.

export type RateBucket = { count: number; resetAt: number };

const MAX_KEYS = 10_000;

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimit(
  store: Map<string, RateBucket>,
  ip: string,
  { windowMs = 60_000, max = 20 }: { windowMs?: number; max?: number } = {}
): boolean {
  const now = Date.now();
  // Sweep expired buckets so a long-lived instance's map can't grow unbounded.
  if (store.size > MAX_KEYS) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }
  const rec = store.get(ip);
  if (rec && now < rec.resetAt) {
    if (rec.count >= max) return false;
    rec.count += 1;
    return true;
  }
  store.set(ip, { count: 1, resetAt: now + windowMs });
  return true;
}
