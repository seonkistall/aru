# Server-side funnel telemetry: the flush path, and why it stays off

2026-09-16 (autopilot cycle 6). Backlog item: *"Server-side funnel telemetry.
`lib/funnel.ts` is localStorage-only, so nobody can see where users drop off."*

Read this before setting `NEXT_PUBLIC_FUNNEL_FLUSH=on`. The flush is built and it is
**off**, and the reason it is off is a blocker, not caution.

## 1. The gap, verified rather than assumed

`lib/funnel.ts`'s header says its events "leave the device solely through the gated
`/api/sync` pipeline". Every part of that pipeline exists: `lib/sync-payload.ts` puts
`funnelEvents` in the payload, `app/api/sync/route.ts` upserts them into
`funnel_events`, `supabase/schema.sql` has the table.

Nothing ever posted it. Every `/api/sync` call site in the tree, on `main` at 8d08aad:

```
$ grep -rn 'fetch("/api/sync"' --include=*.ts --include=*.tsx . | grep -v node_modules
./app/ops/page.tsx:168:      const resp = await fetch("/api/sync", {
./app/ops/page.tsx:440:  const resp = await fetch("/api/sync", {
```

Both are `/ops`, and `/ops` is unreachable to anyone who is not the owner sitting at a
keyboard:

- `proxy.ts` matches `/ops/:path*`, and `internalAccessDecision` returns `not-found`
  in production unless `INTERNAL_TOOLS_USER` **and** `INTERNAL_TOOLS_PASSWORD` are set
  — so `/ops` is a 404, which `npm run smoke` asserts (`ok GET /ops -> 404`);
- the POST additionally needs `SUPABASE_SYNC_TOKEN` typed into the page.

So every real user's funnel data has been written to their own browser and read by
nobody, ever. Five cycles of drop-off instrumentation — `scan_opened`,
`camera_blocked`, `camera_interrupted`, `care_viewed`, `checkin_opened`,
`share_landed` — have all landed in a store with no reader.

## 2. What shipped this cycle

`lib/funnel-flush.ts`, mounted once by `app/components/funnel-flush.tsx` in the root
layout. It flushes on mount (draining an earlier visit) and on `visibilitychange` to
hidden.

`funnelFlushActive()` reads `NEXT_PUBLIC_FUNNEL_FLUSH === "on"` — exact, same shape as
`affiliateDisclosureActive()`, so `true`/`1`/whitespace cannot open an egress path by
accident. **Unset, `flushFunnelEvents` returns `disabled` before touching the
network**, so nothing about any browser changes until the owner sets it.

One trap worth recording, because the first draft of this module fell into it and every
test stayed green. The read must be the literal `process.env.NEXT_PUBLIC_FUNNEL_FLUSH`,
never `process.env[FUNNEL_FLUSH_FLAG]`. Next inlines public env through webpack's
DefinePlugin, and `getNextPublicEnvironmentVariables` in
`node_modules/next/dist/lib/static-env.js` (Next 16.2.9) builds each define key as
`` `process.env.${key}` `` — an exact expression. The dynamic form is not that
expression, so it is never replaced and reads `undefined` in every client bundle: the
flag could not have been turned on at all — and only in the browser, where no test in this repo
runs. `tests/funnel-flush.test.ts > reads the flag through a literal Next can inline`
pins the literal by source scan, which is the only way to see it from node.

## 3. What the flush must not do

The rule: **no selfies, no free text, no identifier beyond the existing anonymous
visitor/session id.** Three mechanisms hold it, because one would not.

**(a) The payload is built from scratch, not from `buildLocalSyncPayload()`.** That
helper — what `/ops` posts — reads `getCropSamples()`, i.e. consented face images as
base64 data URLs, plus labels, pilot notes and the consent audit log. Those travel on
an operator's deliberate action behind a typed token. Reusing it here would put face
crops on a path that fires automatically in a consumer browser.
`buildFunnelFlushPayload` emits `labels`, `cropSamples`, `pilotNotes` and
`consentEvents` as literal empty arrays (the route requires them to be arrays) and
`tests/funnel-flush.test.ts` seeds all four in storage first, so the assertion fails if
the builder is ever swapped.

**(b) Each event is reconstructed field by field, never spread.** A stored event is
JSON that sat in a browser ARU does not control; `{ ...event }` would forward whatever
a future version, a bug or a hand-edited localStorage entry put on it. Five fields
survive — `id`, `kind`, `visitorId`, `sessionId`, `ts` — plus `props`. That is exactly
the column set `funnel_events` has.

**(c) Prop KEYS are allowlisted per kind.** `sanitizeProps` in `lib/funnel.ts` bounds
value *types* (primitives, strings capped at 40 chars) and that is what keeps a blob or
an object out. It cannot bound keys: a future call site recording a survey completion
with a `{ note: freeText }` prop passes it intact. On-device that is a contained
mistake; on a flush it is an egress of free text. So `FUNNEL_PROP_KEYS` lists what each
kind may send and the test scans every call site in `app/` and `lib/` against it.

### The audit the item asked for: does the coercion hold for everything `FUNNEL_ORDER` now carries?

Yes. Enumerated from the tree rather than from memory — 15 call sites pass an explicit
props object:

| kind | prop keys | where |
|---|---|---|
| camera_blocked | `reason` | `app/scan/page.tsx` ×3 (`unsupported`, `busy`/`notfound`/`permission`, `attach`) |
| camera_interrupted | `reason` | `app/scan/page.tsx` (`muted`/`ended`/`backgrounded`) |
| commerce_clicked | `placement`, `merchant` | `app/care/page.tsx`, `app/components/product-card.tsx`, `app/report/page.tsx` |
| reco_viewed | `scanApplied`, `picks` | `app/report/page.tsx` |
| scan_completed | `retake`, `source` | `app/scan/use-capture-analysis.ts` |
| scan_started | `mode` | `app/scan/use-capture-analysis.ts` |
| share_clicked | `surface`, `mode` | `app/scan/page.tsx`, `app/studio/page.tsx` |
| survey_completed | `concerns`, `hasScan` | `app/survey/page.tsx` |
| survey_viewed | — | `app/survey/page.tsx` |
| share_landed | — | `app/components/mood-from-link.tsx` |

The four remaining kinds — `home_viewed`, `scan_opened`, `care_viewed`,
`checkin_opened` — go through `useFunnelPageView(kind)`, which takes no props argument
at all, so they are structurally propless.

Every value above is a closed vocabulary (`reason`, `merchant`, `source`, `mode`,
`surface`, `placement`), a boolean, or a small count. The two added last cycle —
`camera_blocked.reason` and `camera_interrupted.reason` — are string literals chosen in
the call site from a fixed set, which is what the item wanted checked. None of them is
user input, and none is derived from a device or user attribute.

`visitorId` and `sessionId` are `crypto.randomUUID()` values generated on-device and
stored in localStorage/sessionStorage. They are not derived from anything about the
person or the hardware, so they identify a browser, not a human — but they are still
pseudonymous identifiers once they reach a server, which is §5 below.

## 4. The flush cannot authenticate, and that is this cycle's finding

`POST /api/sync` requires `SUPABASE_SYNC_TOKEN` (`hasValidSyncToken`, via
`Authorization: Bearer` or `x-gyeol-sync-token`). **A browser cannot hold that token.**
Anything a page can send, a visitor can read: put it in `NEXT_PUBLIC_*` and it is
inlined into the client bundle and published to everyone; fetch it from an endpoint and
that endpoint is the unauthenticated ingest you were trying to avoid, now handing out a
service-role-adjacent secret. So the honest state is:

> **The flush as built cannot succeed against `/api/sync`. Posting a funnel-only
> payload without the token returns 401.**

Pinned, against the real route handler, so nobody discovers it in production:

```
tests/funnel-flush.test.ts > the flush cannot authenticate against /api/sync
  ✓ is refused 401 when posted without the sync token
```

`npm run smoke` asserts the same thing from the outside (`ok POST /api/sync -> 401`).

**`navigator.sendBeacon` does not rescue this, and it is worth saying why**, because it
is the obvious tool for a page-hide flush and it would fail silently. From the W3C
Beacon specification's own source (`w3c/beacon`, `gh-pages/index.html`, fetched
2026-09-16 via `raw.githubusercontent.com`, `http=200 bytes=115132` — `www.w3.org` and
MDN both refuse this network):

> "Beacon API does not provide a response callback. The server is encouraged to omit
> returning a response body for such requests (e.g. respond with 204 No Content)."

> "…since the actual data transfer happens asynchronously, this method does not provide
> any information whether the data transfer has succeeded or not."

A beacon flush therefore cannot tell 200 from 401, so it would advance the cursor over
the refusal and delete exactly the events it was meant to deliver. The transport here is
`fetch(..., { keepalive: true })` and `markFunnelEventsFlushed` runs only after a 2xx;
`tests/funnel-flush.test.ts` pins that a 401 leaves the cursor untouched.

### What the next cycle should build

A separate ingest endpoint, e.g. `POST /api/funnel`, that accepts **only** a
funnel-event array, unauthenticated, with its own rate limit — `createRateLimiter` in
`lib/server/request-guard.ts` is the existing piece — a hard body cap well under the
5 MB `/api/sync` allows, server-side re-validation of kind and prop keys (the client
allowlist is a courtesy, not a control, once the endpoint is public), and an origin
guard. It then writes `funnel_events` with `metadata.source` set to something other
than `ops-local`, so operator syncs and public ingest stay distinguishable in the
table. **Designing it is the next cycle's item.** It is not a small route: an
unauthenticated write endpoint is a new attack surface on a product that currently has
none, and rushing it to make this cycle's flush "work" would be the wrong trade.

Until it exists, `NEXT_PUBLIC_FUNNEL_FLUSH` must stay unset.

## 5. Does PIPA require consent before this is switched on?

**Stated up front: this is recalled law, not verified law.** `law.go.kr` and
`www.pipc.go.kr` both refuse this network —

```
--- https://www.law.go.kr/
curl: (56) CONNECT tunnel failed, response 403
--- https://www.pipc.go.kr/
curl: (56) CONNECT tunnel failed, response 403
```

— so no article number is cited here, because a cited article nobody could open is
worse than an honest summary. The owner or a lawyer should check it against the text.

The analysis, such as it can be given:

- A random `visitorId` stored in a browser is not by itself a name or a resident
  registration number, but PIPA's definition of 개인정보 reaches information that can
  identify a person *in combination with other information readily available*. A
  persistent pseudonymous id held next to behavioural records on ARU's own server, in a
  product that separately collects consented email addresses for re-engagement, is the
  combination case. Treating it as 개인정보 is the safe reading, and the cheap one.
- The events carry **no sensitive information** (민감정보). Skin levels are not in the
  funnel — they live in the URL fragment for sharing and in the report, and no prop
  above carries one. This matters: had `reco_viewed` carried the levels, the analysis
  would be a different and much harder one, since a facial-skin reading is at least
  arguably health-adjacent. Keep it that way.
- ARU already runs a consent model with two separate streams (`ai_analysis`,
  `learning_crop`) and an audit log, and `/privacy` already describes on-device
  analytics. An automatic server transfer is a **new purpose**, not covered by either
  existing stream, and guardrail 4 forbids merging them.

**Conclusion, and the loop stops here as instructed:** switching this on plausibly
requires either a consent step or a defensible reliance on legitimate-interest-style
grounds, and which of those applies is an owner decision informed by an actual reading
of the statute, not a loop decision. No new consent kind and no new consent flow was
invented this cycle. What the loop did do is the disclosure half, which is required
under any reading: `/privacy` gains a paragraph, rendered **only while the flag is on**,
in the same way `CommerceDisclosure` switches its wording on its own flag — a page must
state what is true at the time it is read.

The Korean line, and its four translations (`lib/i18n/{en,ja,zh,ar}.ts`, or
`tests/i18n-coverage.test.ts` fails):

> 화면 이동과 버튼 누름 같은 이용 기록이 ARU 서버로 전송돼요. 사진, 직접 입력한 내용,
> 이름이나 연락처는 보내지 않고, 이 기기에서 만든 무작위 방문자·세션 번호만 함께
> 저장돼요.

## 6. Checklist before `NEXT_PUBLIC_FUNNEL_FLUSH=on`

1. The ingest endpoint of §4 exists, with its own rate limit and server-side validation.
2. The PIPA question of §5 has an owner's answer.
3. `FUNNEL_FLUSH_ENDPOINT` points at that endpoint, not at `/api/sync`.
4. A real flush has been observed end to end against a staging Supabase.

Steps 1–3 are not yet done. That is why the flag is off.

## 7. A defect found on the same path

Hunting the route for what an ingest endpoint would inherit turned one up.
`funnelEvents` is optional (it arrived with `sync.v2`), and it is the only array in the
payload with no `Array.isArray` check. `payload.funnelEvents ?? []` accepts any truthy
value; `"abc".length` is 3, so the route passes validation, enters the upsert branch,
and calls `.map` on a string. Reproduced against the real handler with
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SYNC_TOKEN` all set, which is
the only configuration that reaches the upsert:

```
PROBE THREW TypeError funnelEvents.map is not a function
```

Uncaught, so a 500 where every other malformed array is a 400. Fixed in
`app/api/sync/route.ts` by adding the optional-array clause to the same validation
block; pinned by `tests/api-json-boundaries.test.ts > rejects a non-array funnelEvents
before it reaches the upsert`, which reports that exact TypeError when the clause is
deleted. It matters more than it looks: the ingest endpoint of §4 will hand this route
— or a sibling of it — bodies from the open internet.
