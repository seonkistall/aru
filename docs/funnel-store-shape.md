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

## 2026-09-23 (cycle 30): the same read idiom, one level worse

The funnel was not the only store reading `JSON.parse(localStorage.getItem(KEY) || "[]")`
and handing the result straight back. `lib/scan-history.ts` did the same, and there the
consequence is not a store that switches itself off — it is a page that dies.

`ScanHistoryStrip` renders on `/report`'s first step and calls `getScanHistory()` in a
mount effect. On a value that parses to the wrong shape the component's own guards do
not catch it: `history.length < 2` is `undefined < 2` on an object, which is **false**,
so the early return does not fire, and `history.slice(-6)` then throws inside render.
React unmounts the segment and `app/error.tsx` replaces the whole report — the analysis,
the product cards, and both `/api/out` links with them. The crash is deterministic in
the stored value, so the boundary's own "다시 시도" re-renders and throws again.

Proved in Chromium before the fix, five wrong shapes, five failures
(`tests/e2e/report-device-store-shape.regression-13.spec.ts`), with the browser console
naming both throw sites:

```
TypeError: history.slice is not a function
    at ScanHistoryStrip (app/components/scan-history-strip.tsx:21:26)
TypeError: recent.map is not a function
    at ScanHistoryStrip (app/components/scan-history-strip.tsx:41:17)
```

The second one is why `"abcdef"` is in the shape list: a string survives BOTH of the
component's guards — `.length` is 6 and `.slice(-6)` returns a string — and dies one
call later. `Array.isArray` at the read covers it; a `.length` check would not.

`scanHistoryCount()` had a second problem the funnel's did not: no try/catch of its
own, so `getScanHistory().length` on a stored `null` threw in whatever called it. The
read guard closes that too.

Same fix, same argument, same place: `Array.isArray` at the read, which is also what
makes the next `pushScanHistory` repair the key instead of leaving the device broken
for the life of the install. `tests/device-store-shape.test.ts` breaks at the source
line — dropping the guard fails **10 of 12** scan-history cases with
`AssertionError: getScanHistory() on null: expected null to deeply equal []` first,
while the two controls (an unparseable value, which already self-healed, and a real
array, which was never affected) stay green.

### Two more reads, guarded on a weaker grade of evidence

`lib/crops.ts` and `lib/labels.ts` got the same guard, and what is known about them is
less than what is known about the scan history. `app/scan/feedback.tsx` seeds state with
`useState(() => labelCount())` and `useState(() => cropSampleCount())`. A lazy
`useState` initialiser runs DURING render, and neither count function has a try/catch of
its own — both are `getX().length` — so a stored `null` threw a TypeError there.

The throw is measured (`tests/device-store-shape.test.ts`, 5 of 18 cases fail with the
guards dropped). **The page-level consequence is not.** An attempt to reproduce it in
Chromium the way `/report` was reproduced passed on all five shapes, and the reason is
that the `Feedback` panel mounts only after a capture produces reads — there is no
camera in this container, so the initialisers never ran. That spec was deleted rather
than kept, because a test that passes for the wrong reason would tell the next cycle
this path is covered. So: the mechanism is demonstrated at the call, the crash is
reasoned from the call site, and it is not claimed as observed.

The four device stores reading the same idiom and **not** changed — `lib/consent.ts`,
`lib/store.ts`, `lib/pilot.ts`, `lib/funnel-flush.ts` — are not claimed to be safe.
`lib/store.ts` is the closest to biting: its `lsPush` calls `all.push(value)` OUTSIDE
the try, so a wrong shape rejects into `recordCareIntent`'s caller on `/care`. It was
left because that is a different failure (an unhandled rejection, not a render throw)
and it deserves its own measurement. The consent store must not be given this guard
casually at all: "read as empty" there means "no consent event in the audit trail",
which is guardrail 4 territory and a decision rather than a one-line change.
