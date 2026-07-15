# ARU Security and Data Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining public-request, internal-tool, email, database-reproducibility, header, and dependency risks without changing ARU's consumer recommendation behavior.

**Architecture:** Reuse the existing server-only bounded reader and rate limiter, add pure parsers that are easy to test, and put internal-route authorization in the Next.js 16 `proxy.ts` boundary. Keep Supabase access service-role-only and make schema security reproducible from source.

**Tech Stack:** Next.js 16.2.9 App Router and Proxy, TypeScript, Vitest, Supabase PostgreSQL/Storage, Resend HTTP API, Vercel.

## Global Constraints

- Public errors expose no secret, provider payload, database detail, or raw email address.
- `/ops`, `/pilot`, and `/eval` default to denied in production when credentials are absent.
- JSON byte limits apply to the actual UTF-8 body even without `Content-Length`.
- `CRON_SECRET` and `UNSUBSCRIBE_SECRET` are distinct production secrets.
- Browser roles receive no application table, sequence, function, or research-bucket access.
- Every behavior change starts with a failing test and ends with an independently reviewable commit.

---

### Task 1: Bound and validate every remaining JSON endpoint

**Files:**
- Create: `lib/server/reengage-input.ts`
- Modify: `app/api/sync/route.ts`
- Modify: `app/api/reengage/route.ts`
- Modify: `app/api/reengage/subscribe/route.ts`
- Modify: `app/api/reengage/unsubscribe/route.ts`
- Modify: `app/api/analyze/route.ts`
- Modify: `app/api/reason/route.ts`
- Test: `tests/request-guard.test.ts`
- Create: `tests/reengage-input.test.ts`

**Interfaces:**
- Consumes: `readBoundedJson(request, maxBytes)` and `requestClientKey(request)` from `lib/server/request-guard.ts`.
- Produces: `parseSubscribeInput(value)`, `parseManualReengageInput(value)`, and `parseUnsubscribeInput(value)` returning `{ ok: true; value: ... } | { ok: false; reason: string }`.

- [ ] **Step 1: Write failing body and parser tests**

```ts
it("counts actual UTF-8 bytes when content-length is absent", async () => {
  const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ value: "가".repeat(40) }) });
  await expect(readBoundedJson(req, 64)).rejects.toMatchObject({ status: 413 });
});

it("rejects unexpected subscribe fields and oversized context", () => {
  expect(parseSubscribeInput({ email: "a@example.com", consent: true, context: "x".repeat(201) }).ok).toBe(false);
  expect(parseSubscribeInput({ email: "a@example.com", consent: true, admin: true }).ok).toBe(false);
});

it("caps provider output", () => {
  expect(readFileSync("app/api/analyze/route.ts", "utf8")).toMatch(/maxOutputTokens|max_tokens/);
  expect(readFileSync("app/api/reason/route.ts", "utf8")).toContain("max_tokens");
});
```

- [ ] **Step 2: Run tests and verify the intended failure**

Run: `npm test -- tests/request-guard.test.ts tests/reengage-input.test.ts`

Expected: the UTF-8 test passes against the existing reader; the new parser test fails because `lib/server/reengage-input.ts` does not exist.

- [ ] **Step 3: Implement strict pure parsers**

```ts
type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSubscribeInput(input: unknown): ParseResult<{ email: string; consent: true; context: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "invalid body" };
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["email", "consent", "context"].includes(key))) return { ok: false, reason: "invalid body" };
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const context = typeof row.context === "string" ? row.context.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, reason: "invalid email" };
  if (row.consent !== true) return { ok: false, reason: "consent required" };
  if (context.length > 200) return { ok: false, reason: "context too long" };
  return { ok: true, value: { email, consent: true, context } };
}
```

Implement the two smaller parsers with exact key allow-lists: manual `{ email, week }`, week exactly `2 | 4`; unsubscribe `{ token }`, token a non-empty string no longer than 2048 characters.

Add `maxOutputTokens: 256` to Gemini analysis generation and `max_tokens: 256` to both OpenAI calls. These limits bound provider work without truncating the required three-label JSON or three one-sentence reasons.

- [ ] **Step 4: Replace unbounded route parsing**

Use these exact maximums: sync `5 * 1024 * 1024`, subscribe `2048`, manual send `1024`, unsubscribe `4096`. Convert `RequestGuardError.status` to the same response status and use `requestClientKey()` plus `createRateLimiter()` for the public subscribe route.

```ts
try {
  const parsed = parseSubscribeInput(await readBoundedJson(request, 2048));
  if (!parsed.ok) return Response.json({ ok: false, reason: parsed.reason }, { status: 400 });
  body = parsed.value;
} catch (error) {
  const status = error instanceof RequestGuardError ? error.status : 400;
  return Response.json({ ok: false, reason: status === 413 ? "request too large" : "invalid json" }, { status });
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/request-guard.test.ts tests/reengage-input.test.ts tests/sync-size.test.ts tests/reengage-policy.test.ts`

Expected: all focused tests pass.

Commit: `fix: bound remaining JSON endpoints`

### Task 2: Default-deny internal production routes

**Files:**
- Create: `lib/server/internal-access.ts`
- Create: `proxy.ts`
- Create: `app/ops/layout.tsx`
- Create: `app/pilot/layout.tsx`
- Create: `app/eval/layout.tsx`
- Create: `tests/internal-access.test.ts`

**Interfaces:**
- Produces: `internalAccessDecision(request, env)` returning `"allow" | "challenge" | "not-found"`.
- Produces: a Next.js 16 Proxy matcher for `/ops/:path*`, `/pilot/:path*`, and `/eval/:path*`.

- [ ] **Step 1: Write default-deny tests**

```ts
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const request = (authorization?: string) => new Request("https://aru-beauty.vercel.app/ops", { headers: authorization ? { authorization } : {} });
const prodEnv = { NODE_ENV: "production", INTERNAL_TOOLS_USER: "aru", INTERNAL_TOOLS_PASSWORD: "secret" };

expect(internalAccessDecision(request(), { NODE_ENV: "production" })).toBe("not-found");
expect(internalAccessDecision(request("Basic bad"), prodEnv)).toBe("challenge");
expect(internalAccessDecision(request(basic("aru", "secret")), prodEnv)).toBe("allow");
expect(internalAccessDecision(request(), { NODE_ENV: "development" })).toBe("allow");
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/internal-access.test.ts`

Expected: FAIL because the access module is missing.

- [ ] **Step 3: Implement constant-time credential comparison and Proxy**

Decode Basic credentials, compare fixed-length SHA-256 digests with `timingSafeEqual`, return not-found when either `INTERNAL_TOOLS_USER` or `INTERNAL_TOOLS_PASSWORD` is absent in production, and never accept query parameters.

```ts
export const config = { matcher: ["/ops/:path*", "/pilot/:path*", "/eval/:path*"] };

export function proxy(request: NextRequest) {
  const decision = internalAccessDecision(request, process.env);
  if (decision === "allow") return NextResponse.next();
  if (decision === "not-found") return new NextResponse("Not Found", { status: 404 });
  return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ARU internal", charset="UTF-8"' } });
}
```

Add `robots: { index: false, follow: false }` metadata through a small server layout under each internal route rather than converting client pages.

- [ ] **Step 4: Verify routes and commit**

Run: `npm test -- tests/internal-access.test.ts && npm run build`

Expected: tests and Next production build pass; a production-mode route probe without credentials returns 404.

Commit: `fix: default deny internal tools`

### Task 3: Make email delivery bounded and auditable

**Files:**
- Modify: `lib/reengage.ts`
- Modify: `app/api/reengage/run/route.ts`
- Modify: `app/api/reengage/unsubscribe/route.ts`
- Modify: `.env.local.example`
- Modify: `docs/reengage-setup.md`
- Test: `tests/reengage-policy.test.ts`

**Interfaces:**
- Produces: `reengageSecretsConfigured()` requiring Resend, cron, unsubscribe, from-address and link-base values.
- Produces: `sendReengageEmail({ email, week, link, unsubscribeLink, idempotencyKey })` with a 10-second timeout.

- [ ] **Step 1: Add failing policy tests**

```ts
it("does not reuse the cron secret for unsubscribe", () => {
  expect(readFileSync("app/api/reengage/run/route.ts", "utf8")).not.toContain("UNSUBSCRIBE_SECRET || process.env.CRON_SECRET");
});

it("uses deterministic idempotency and reports database update failures", () => {
  const route = readFileSync("app/api/reengage/run/route.ts", "utf8");
  expect(route).toContain("idempotencyKey");
  expect(route).toContain("updateFailed");
});
```

- [ ] **Step 2: Confirm failure**

Run: `npm test -- tests/reengage-policy.test.ts`

Expected: FAIL on the secret fallback and missing update-failure counter.

- [ ] **Step 3: Implement safe delivery semantics**

Require all five production values, use `fetchWithTimeout(..., 10_000)`, send Resend's `Idempotency-Key` header as `aru-reengage:${week}:${sha256(email)}`, reduce each run to `BATCH = 50`, stop scheduling more sends after 45 seconds, and return `{ sent, failed, updateFailed, deleted }` counters. Treat an unsuccessful post-send update as `updateFailed += 1` and log only the contact hash.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/reengage-policy.test.ts tests/unsubscribe-token.test.ts && npm run build`

Expected: all focused tests and build pass; missing distinct secrets produces a safe no-op.

Commit: `fix: make reminder delivery auditable`

### Task 4: Encode database security and browser headers

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `tests/supabase-security.test.ts`
- Modify: `next.config.ts`
- Create: `tests/security-headers.test.ts`
- Delete after import proof: `lib/supabase.ts`
- Delete after import proof: `lib/rate-limit.ts`

**Interfaces:**
- Produces: reproducible RLS, grants, default privileges, storage policies, and static security headers.

- [ ] **Step 1: Add failing source-contract tests**

Require `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ... FROM anon, authenticated` for tables, sequences, and functions; require HSTS, nosniff, strict referrer, same-origin framing and least-privilege camera policy; require no tracked imports of the two dead modules.

- [ ] **Step 2: Run and capture failure**

Run: `npm test -- tests/supabase-security.test.ts tests/security-headers.test.ts`

Expected: FAIL on missing default privileges and headers.

- [ ] **Step 3: Apply the minimum schema and header changes**

```ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.resend.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'" },
];
```

Delete the dead modules only after `git grep -n "@/lib/supabase\|@/lib/rate-limit" -- app lib tests` returns no imports.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/supabase-security.test.ts tests/security-headers.test.ts && npm run build`

Expected: focused tests and build pass.

Commit: `fix: reproduce database and browser security`

### Task 5: Patch dependencies without accepting a downgrade

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/production-release-checklist.md`

**Interfaces:**
- Produces: a lockfile with no known high/critical production advisory and a documented decision for any unresolved upstream moderate advisory.

- [ ] **Step 1: Capture the baseline**

Run: `npm audit --omit=dev`

Expected baseline: two moderate findings through Next.js's nested PostCSS 8.4.31; no high or critical finding.

- [ ] **Step 2: Test a compatible lockfile override**

Add only this override if `npm view postcss@8.5.10 version` confirms availability:

```json
"overrides": {
  "next": { "postcss": "^8.5.10" }
}
```

Run `npm install` and inspect `npm ls postcss` before keeping it. Never run `npm audit fix --force` because it proposes a destructive Next.js downgrade.

- [ ] **Step 3: Verify and commit**

Run: `npm run smoke && npm audit --omit=dev`

Expected: smoke passes and the production audit has zero high/critical; retain the override only if the full smoke also passes.

Commit: `chore: patch production dependency advisory`
