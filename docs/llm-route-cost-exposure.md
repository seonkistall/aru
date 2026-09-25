# What it costs to leave `/api/analyze` and `/api/reason` open

Measured 2026-09-25 (autopilot cycle 38) against the real route handlers with the
upstream `fetch` stubbed. No request in this work reached api.openai.com or
generativelanguage.googleapis.com; the stub in
`tests/llm-route-cost-exposure.regression-24.test.ts` throws on any URL it does not
recognise, which is what enforces that. No key appears in this document, in the tests,
or in any output quoted here.

These are the only two routes in ARU that spend the owner's money. `/api/analyze` posts
a base64 face crop to a vision model and accepts a body of up to 2,100,000 bytes;
`/api/reason` posts up to eight product rows to a chat model. Neither charges anything
today because no key is set — `/api/analyze` answers `503 {"reason":"no key"}` and
`/api/reason` serves template copy — so every number below is about what happens on the
day a key is added.

## 1. Did either route accept a caller that plainly was not one of ARU's pages?

Yes, all of them, and that is the defect this cycle fixed. On the tree before the fix,
each of the following reached the upstream call on both routes:

| the caller sent | before | now |
|---|---|---|
| no `Origin` at all (curl's default) | upstream call | `403` |
| `Origin: https://evil.example` | upstream call | `403` |
| `Sec-Fetch-Site: cross-site` | upstream call | `403` |
| `Sec-Fetch-Site: cross-site` with ARU's own `Origin` | upstream call | `403` |
| `Sec-Fetch-Site: same-site` from a sibling subdomain | upstream call | `403` |
| an `Origin` whose host merely *contains* ARU's | upstream call | `403` |
| an `Origin` that is not a URL | upstream call | `403` |

The "before" column is measured, not inferred. With the `isForeignOriginRequest` call
deleted from both handlers and the same seven header sets replayed against both routes,
the stub recorded **`status=200 upstreamCalls=1`** for **14 of 14** cases — seven on
`/api/analyze`, each reaching `generativelanguage.googleapis.com`, and seven on
`/api/reason`, each reaching `api.openai.com/v1/chat/completions`. On the committed
tree the same 14 cases are `403` with `upstreamCalls=0`.

`isForeignOriginRequest` (`lib/server/request-guard.ts`) is the guard, and it runs
before the rate limiter and before the body is read, so a refused caller costs the
route no work and no limiter bucket.

ARU's own pages still get through, measured in a real browser rather than only in the
route tests: Chromium at 360x800 loading `/report` sends
`origin=http://127.0.0.1:3102` on its `POST /api/reason` and the handler answers
`status=200`. Playwright's interception reports `sec-fetch-site` and `host` as `(none)`
— it does not surface `Sec-` headers or `Host`, which the network stack sets after
interception — so that probe exercises the `Origin` arm of the guard, not both.

**It is a CSRF boundary, not authentication.** `curl` can send `Origin: https://aru.test`
and `Sec-Fetch-Site: same-origin` and get through, exactly as it could before. What the
guard removes is the case a browser enforces: some other site's page driving ARU's
paid routes out of a visitor's browser. That distinction rests on the `Sec-` prefix,
which the spec says makes these headers "unmodifiable from JavaScript" (see §4).

## 2. What does the limiter actually bound?

`createRateLimiter` in `lib/server/request-guard.ts`, measured directly:

- **10 calls per key per 60,000 ms.** 40 calls on one key at one instant: `10` allowed.
- **Per key, and the key is a header the caller sends.** 40 calls at the same instant
  on 40 different keys: `40` allowed. `requestClientKey` reads
  `x-vercel-forwarded-for`, then `x-forwarded-for`, then falls back to `"unknown"`.
- **Per module instance.** Two limiters built from the same policy are two independent
  budgets for the same key: 10 + 10 = `20` allowed before either refuses. A second
  serverless instance of the same route is that second limiter.

So the bound **the code** provides is *10 requests per client key per minute per running
instance*, not a global cap on spend. Two of those three qualifiers are the ones that
matter to a bill.

**The code is not the only layer, and the other one is better.** A Vercel Firewall rule
sits in front of it, recorded in
[`docs/qa/2026-07-17-post-deploy-security.md`](qa/2026-07-17-post-deploy-security.md)
§"Vercel Firewall": `Provider request budget`, enabled and published, matching the exact
POST paths `/api/analyze`, `/api/reason` and `/api/reengage/subscribe`, fixed window,
**keyed on client IP**, **20 matching requests per 60 seconds**. The same record shows
it verified against production on 2026-07-17 with `{}` bodies so no provider was called:
analyze 1-10 returned 400, 11-20 were stopped by the app limiter, 21-22 by the Firewall
with 429, and `/api/reason` "shared the exhausted global window and returned 429".

That layer is not keyed on a header the caller sends and is not per-instance, so it
answers both of the app limiter's weaknesses. What it still is not is a cap on spend: it
bounds the *rate* from one IP, not the *total*, and it does not bound how many distinct
IPs call. And this cycle did not re-verify it — the rule's live state cannot be read
from this worker, so the 2026-07-17 record is the whole evidence for it being on today.

One consequence worth recording: the same document says the rule's first draft used the
exceeded action `deny`, which returned 403, and was changed "to preserve the public 429
API contract". The 403 this cycle adds is a different condition — a forbidden origin,
not an exhausted budget — and matches what `/api/funnel` already returns for the same
reason. Rate limiting on these routes is still 429.

**What is NOT established.** Whether a deployed edge overwrites, appends to, or strips
`x-vercel-forwarded-for` and `x-forwarded-for` before a route handler sees them. No
primary source for that was reachable from this network on 2026-09-25:
`https://vercel.com/docs/headers/request-headers` returned `http=000` and so did
`https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For`. The one
Vercel source file that did fetch — `https://raw.githubusercontent.com/vercel/vercel/main/packages/next/src/index.ts`,
**HTTP 200**, **101605 bytes**, sha256
`334d55f4fbff4ee4ab2bf9b86fc20fb6a9a7b6126ed5dde31dbec93f69693c25` — contains **0**
lines matching either header name. So how the key behaves in production is unknown, and
nothing in this repository should claim otherwise.

## 3. Could a caller make the route spend on work ARU never asks for?

Yes, on `/api/analyze`, and that is now closed too. Before this cycle
`parseAnalyzeInput` checked that the string matched
`data:image/(jpeg|png);base64,<base64>` and that it decoded to at most 1,500,000 bytes,
and nothing else. It never looked at the bytes. So:

- 1 MB of `AAAA…` under `data:image/jpeg;base64,` was accepted and paid for.
- A PNG labelled `image/jpeg`, and a JPEG labelled `image/png`, were both accepted —
  and the label is what the upstream request tells the model it is sending.

`parseAnalyzeInput` now also requires the declared media type's signature bytes at
offset 0: `/9j/` for `image/jpeg` (`FF D8 FF`) and `iVBORw0K` for `image/png`
(`89 50 4E 47 0D 0A`). Both prefixes are whole base64 groups, so the encoding is exact
and not dependent on the bytes that follow, and both were derived with
`Buffer.from([...]).toString("base64")`.

This does not make the image a *face*. Any real JPEG still passes, and nothing in this
repository can tell a face from a photograph of a wall without running a detector
server-side, which would cost the owner the compute it is trying to save. It removes
the free cases: filler, a wrong-format payload, and a non-image.

The two size ceilings were already there and are now pinned: the 2,100,000-byte body
cap (`413` on `content-length`, then again on real bytes) and the 1,500,000-byte
decoded-image cap (`413`).

## 4. Primary source

`https://raw.githubusercontent.com/w3c/webappsec-fetch-metadata/main/index.bs`,
**HTTP 200**, **22801 bytes**, sha256
`529f0cff7812e53ddd6ba67a7d9b359db4ffff4e744ce7561e36e6a31965b55c`. Fetched
2026-09-25. (`index.src.html` in the same repository is **HTTP 404**, 14 bytes; the
repository's `README.md` is **HTTP 200**, **10128 bytes**, sha256
`ebc8211a4a305d71331680a9da4b63275814b599fc664ae9b180667cccae36b1`.)

Lines 205-207:

> Valid `Sec-Fetch-Site` values include "`cross-site`", "`same-origin`", "`same-site`",
> and "`none`". In order to support forward-compatibility with as-yet-unknown request
> types, servers SHOULD ignore this header if it contains an invalid value.

That sentence is why an unrecognised value is allowed through rather than refused.

The `set-site` algorithm, lines 209-238, sets the value to `same-origin`, then to
`none` "if |r| is a navigation request that was explicitly caused by a user's
interaction with the user agent", then walks the URL list downgrading to `cross-site`
or `same-site`. `none` is therefore never set for a page's own `fetch()`, which is why
allowing it costs nothing.

"The `Sec-` Prefix", lines 340-345:

> Each of the headers defined in this document is prefixed with `Sec-`, which makes
> them all forbidden response-header names, and therefore unmodifiable from JavaScript.
> This will prevent malicious websites from convincing user agents to send forged
> metadata along with requests, which should give sites a bit more confidence in their
> ability to respond reasonably to the advertised information.

That is the whole basis for trusting `Sec-Fetch-Site` from a browser and not trusting
it from anything else.

## 5. Owner decision: a real cap on spend needs infrastructure

Neither layer above bounds what ARU can be *billed*. The in-memory limiter cannot
express "no more than N vision calls per day, ever" — a caller that rotates
`x-forwarded-for` gets a fresh bucket per request, and each running instance has its own
map. The Firewall rule fixes the key and the scope but is still a rate per IP, so N
distinct IPs at 20 requests a minute each is N × 20 a minute, indefinitely.

A global cap needs shared state. The options, none of which this loop may take on its
own — each adds a paid service or a dependency, which the cycle's guardrails forbid:

1. **The provider's own spend cap.** Both OpenAI and Google let an account or project
   set a hard monthly limit. Costs nothing, adds no dependency, and is the only option
   here that caps the *bill* rather than the *request rate*. Its failure mode is that
   ARU's own users hit the ceiling at the same moment an abuser does. Recommended as
   the first thing the owner does on the day a key is set; it needs no code.
2. **A shared counter** (Vercel KV, Upstash, or the Supabase table this repository
   already has a client for). Bounds calls per day across instances. Costs a service,
   or a write per LLM call against the existing Postgres, and puts a database round
   trip in front of a user-facing request.
3. **Require something the caller has to earn** — a signed token minted by a page load,
   a proof-of-work, or a captcha. Changes the product and adds a dependency.

Until one of those exists, the honest statement is: the guard stops other people's
pages, the two limiters shape what one client can do per minute, and none of the three
caps the bill.
