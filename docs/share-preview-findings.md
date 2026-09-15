# Share preview: what a shared ARU link can and cannot carry

Cycle: 2026-09-15 autopilot. Track: research (자료조사).
Backlog item this answers: *"Share surface: a scan result worth sending to a friend is
the only organic acquisition loop the product has."*

## The question

Can a shared ARU result carry its own link preview — a per-result `og:title` and
`og:image` that a messenger renders — **without** the result leaving the device?

This had to be settled before any share-card work, because the answer decides whether
the share loop is a UI problem or a privacy decision the owner has to make.

## The answer: no, and the reason is structural

`lib/share-link.ts:32` builds the share URL as `${base}/#m=${encodeMood(levels)}` — the
three skin levels live in the URL **fragment**. The module's own header comment states
why: *"a hash fragment is never sent to the server — so a shared link carries no PII
off-device."* That property is real, and it is exactly what forecloses a per-result preview.

### Evidence 1 — a fragment never reaches the server (measured here)

`node scripts/fragment-probe.mjs` — a local HTTP server logging `req.url` against
three client fetches. The probe is committed so this is re-runnable from a checkout:

```
client asked for:            http://127.0.0.1:3199/?m=210
server received request-target: /?m=210
client asked for:            http://127.0.0.1:3199/#m=210
server received request-target: /
client asked for:            http://127.0.0.1:3199/studio#m=210
server received request-target: /studio
```

The query string arrives. The fragment does not — the client strips it before the
request is made. A link scraper is a client, so it strips it too.

### Evidence 2 — Next.js resolves metadata from params and searchParams only

Primary source: the Next.js documentation shipped inside the pinned dependency,
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
(Next 16.2.9, the version in `package.json`). The documented signature is:

```tsx
type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
```

`generateMetadata` is handed the route params and the search params. There is no
fragment argument, and by Evidence 1 there could not be one. The same file, on
`metadataBase` (lines 392-429), confirms the absolute-URL mechanics ARU already relies on:

> `metadataBase` allows URL-based `metadata` fields defined in the **current route
> segment and below** to use a **relative path** instead of an otherwise required
> absolute URL.
> [...] All URL-based `metadata` fields that require absolute URLs can be configured
> with a `metadataBase` option.

`app/layout.tsx:17` sets `metadataBase: new URL("https://aru-beauty.vercel.app")`, so
`images: [{ url: "/og.png" ... }]` is emitted as an absolute `og:image`. That part is
already correct — and already **static**.

### What follows

Every ARU link shared today, whatever the sender's result, previews as the same
`public/og.png` with the same title. The preview is correct and it is generic. There is
no bug to fix in `app/layout.tsx`; there is a design fork.

## The fork, and its cost

| Option | What the recipient sees | What leaves the device |
|---|---|---|
| **A. Keep the fragment** (today) | One generic ARU card for every share | Nothing |
| **B. Move levels to a query param** (`/?m=210`) | Per-result title and image, generated server-side | The three skin levels, in the URL, to ARU's server *and to the messenger's scraper* |

Option B is what "a scan result worth sending" actually requires, and it is **not a
change the loop should make alone**. The levels are non-identifying in isolation, but
putting them in a request-target means they land in server access logs and in the log of
whatever messenger scrapes the link. That is a processing decision with PIPA
consequences, and it belongs with the owner alongside the existing
`[AI] Tone and dryness have no label source` item, which is flagged the same way.

## Sources that could NOT be verified from this network

Recorded rather than guessed, per guardrail 2.

- **`app/components/share-card.tsx` against a real KakaoTalk render.** Not done, and
  not doable here: it needs a phone. What was established is the layer above it — the
  og tags a scraper actually receives, and why they are identical for every share.
- **KakaoTalk's own scraper requirements** (`developers.kakao.com`) — the exact og tag
  set, minimum image dimensions, file-size cap and cache TTL Kakao enforces.
  `WebFetch` returned `EGRESS_BLOCKED` for `developers.kakao.com`. A web search returned
  summaries of that page, but guardrail 2 forbids recording a search snippet as a fact,
  so nothing from it is written down here. **The claim "audit share-card.tsx against what
  KakaoTalk renders" cannot be closed from this container** — it needs either an egress
  allowance for `developers.kakao.com` or an owner with a phone.
- **The Open Graph protocol specification** (`ogp.me`) — `EGRESS_BLOCKED`.
- **RFC 3986 §3.5**, the normative statement that a fragment is separated from the URI
  before dereference — `www.rfc-editor.org` `EGRESS_BLOCKED`. Evidence 1 above is a
  direct measurement of the behaviour instead of a citation of it.
- **Coupang Partners / Naver 쇼핑파트너 / Olive Young commission terms** — the `3-10%`
  band in the `docs/AUTOPILOT.md` revenue table is still unverified. `partners.coupang.com`,
  `adpartners.coupang.com`, `partner.naver.com` and `www.oliveyoung.co.kr` all return `CONNECT
  tunnel failed, response 403` from the egress proxy. That number should keep its
  "unverified" marking until the owner reads the terms.
