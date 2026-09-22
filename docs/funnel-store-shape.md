# What a browser analytics store does with a value that is not its own

Written 2026-09-22, to answer one question the funnel fix in `lib/funnel.ts` needed:

> When a browser analytics SDK reads its persisted event queue back out of
> `localStorage`, does it check the shape of what parsed — and if not, what happens to
> the events?

It matters because a `localStorage` key is not private to the code that wrote it. Any
script on the origin, and every past version of the app, can put anything there, and the
value survives deploys. ARU's own `/api/sync` already learned this on the server side:
`tests/api-json-boundaries.test.ts` records a non-array `funnelEvents` reaching
`funnelEvents.map(...)` and throwing, and the route now rejects the shape before the
upsert. The device-side read had the same hole.

## What was read, and where from

Two shipped SDKs whose device store is the same thing — a persisted array of pending
analytics events. Both fetched on 2026-09-22 from a source the build network can reach
(`raw.githubusercontent.com` and `registry.npmjs.org`; every vendor documentation host in
BLOCKERS still refuses).

| artifact | sha256 |
|---|---|
| `@amplitude/analytics-core` **2.57.0** tarball, `registry.npmjs.org` | `1cb97d68cf7956a8b9599450848a2a1c5b27199665a80dcddd99ef1e31cab28e` |
| `Amplitude-TypeScript@main` `packages/analytics-core/src/storage/browser-storage.ts` | `443276463f76d7379c199b6bd11e046c9fae4529c28615ade1728a0950332d48` |
| `posthog-js@main` `packages/browser/src/storage.ts` | `d2406cdae37bea297adae34eaa2c63594e41f9485a8eea2a90a1e6b0d361f546` |

These are the libraries' own source, not documentation about them, and they are pinned by
digest so the quotes below can be checked. A published version is cited where one exists
(Amplitude 2.57.0); `main` is cited where the published build would only obscure the
source, and is labelled as `main`.

## What they do

**Amplitude — no shape check at the read.** `BrowserStorage.get()` is a try/catch around
`JSON.parse` that returns whatever came out:

```js
value = await this.getRaw(key);
if (!value) { return undefined; }
return JSON.parse(value);
```

The catch covers a parse throw, not a wrong shape. That is byte-for-byte the shape ARU's
`getFunnelEvents` had.

**Amplitude — a duck-type guard at the consumer.** `Destination.prototype.setup`, which
replays the pending queue on start (`package/lib/cjs/plugins/destination.js` in 2.57.0):

```js
unsent = _b.sent();
if (unsent && unsent.length > 0) {
    void Promise.all(unsent.map(function (event) { return _this.execute(event); })).catch();
}
```

`unsent && unsent.length > 0` is truthiness plus a `.length`, not `Array.isArray`. Run
against the five shapes that parse (verified in node, 2026-09-22):

| stored value | `v && v.length > 0` | `.map` reached |
|---|---|---|
| `null` | falsy | skipped |
| `5` | `undefined > 0` → false | skipped |
| `{}` | `undefined > 0` → false | skipped |
| `"abc"` | `3 > 0` → **true** | **`TypeError: v.map is not a function`** |
| `[1]` | true | mapped |

So the guard neutralises four of the five and lets a JSON string through.

**PostHog — truthiness too, at every read.** `packages/browser/src/storage.ts` (`main`),
the localStorage and cookie parsers, lines 258 and 148:

```js
return JSON.parse(localStore._get(name)) || {}
```

`|| {}` turns `null` and `false` into an empty object; a number or a string passes
through unchanged. Again no `Array.isArray`, and again nothing rewrites the key.

## What it settles for ARU

Three things, in the order they changed the fix.

1. **Nobody validates the shape at the read.** Two mature SDKs both leave `JSON.parse`'s
   output untyped and guard, loosely, at the consumer. So ARU's original `getFunnelEvents`
   was not unusually careless — but it had *neither* guard: no shape check at the read and
   no truthiness check at the `.push`. It was strictly weaker than both references.
2. **A duck-type guard is not the right one.** The table above is the argument:
   `v && v.length > 0` is four-fifths of a check and its failing case is the one a
   half-written string produces. `Array.isArray` costs the same and has no hole.
3. **Where the guard sits decides whether the store repairs itself.** This is the part
   neither reference does, and it is the reason the defect was permanent rather than
   momentary. Guard at the consumer and the bad value stays in the key; guard at the read
   and return `[]`, and the very next write — `recordFunnelEvent` serialises
   `getFunnelEvents()` plus the new event — overwrites it with a valid array. One line
   turns "this device never reports again" into "this device loses the events that were
   already unreadable".

That is what `lib/funnel.ts` now does, and `tests/funnel-store-shape.test.ts` holds it,
including the repair and the contrast case (a value that does not parse at all, which
already self-healed and is what made the inconsistency visible).

## What this does not answer

Nothing here says how a wrong-shaped value gets into the key in the first place. No
occurrence has been observed in the wild — the product has no traffic, which is the
standing BLOCKER — so the fix is written against a mechanism, not against a report, and
this document should not be cited as evidence that it has happened.
