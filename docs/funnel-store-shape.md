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

## 2026-09-23 (cycle 31): the commerce stores, the pilot roster, and the one that is not an array

Cycle 30 left four stores unguarded and said so. Three of them are now measured and
fixed — `lib/store.ts` and `lib/pilot.ts` — and one turned out not to need it.

### `lib/funnel-flush.ts` was already guarded; the backlog was wrong about it

`readCursor` (`lib/funnel-flush.ts:104-112`) is the only `JSON.parse(localStorage…)` in
that file and it already checks:

```ts
const parsed = JSON.parse(localStorage.getItem(CURSOR_KEY) || "[]");
return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
```

That is `Array.isArray` plus a per-element type filter, which is stricter than the guard
cycles 29 and 30 added. No code changed here; the backlog text was corrected instead.

### What the wrong shapes actually did, before any guard

`tests/commerce-store-shape.test.ts` was written against the UNCHANGED `lib/store.ts`
and `lib/pilot.ts` first. **40 of its 49 cases failed.** The distinct throws, counted
from that run:

```
      4 AssertionError: promise rejected "TypeError: Cannot read properties of null…" instead of resolving
      3 AssertionError: promise rejected "TypeError: all.push is not a function" instead of resolving
      1 TypeError: lsGet(...).reverse is not a function
      1 TypeError: all.push is not a function
      1 TypeError: Cannot read properties of null (reading 'reverse')
      1 TypeError: Cannot read properties of null (reading 'push')
      1 AssertionError: promise rejected "TypeError: lsGet(...).filter is not a fun…" instead of resolving
      1 AssertionError: careIntentCount() on null: expected [Function] to not throw an error but 'TypeError: Cannot read properties of …' was thrown
```

Four consequences, each traced to a call site rather than asserted:

- **`/care` opens the merchant link and logs nothing.** `openCareLink`
  (`app/care/page.tsx:78`) calls `void recordCareIntent(...)` and then navigates. The
  rejection has no handler, so the commerce click looks like it worked and the care
  intent — the only record that the click happened — is dropped. This is the failure
  the backlog called "closest to biting", and it is the one that costs revenue data.
- **`/privacy` loses the whole page, delete controls included.** Its mount effect runs
  `setCareTotal(careIntentCount())` with no try/catch (`app/privacy/page.tsx:22-30`), and
  `careIntentCount()` on a stored `null` threw at `.length`. `app/error.tsx` then replaces
  the page a user went there to delete their data from.
- **`/checkin` stays blank forever.** Its effect is
  `Promise.all([getProductUses(), getCheckins()]).then(...)` with no `.catch`
  (`app/checkin/page.tsx:29`), so a rejection leaves `productUses` at `null` and the
  component's `if (productUses === null) return <main …/>` renders an empty page for the
  life of the install. This is the landing page for every re-engagement email.
- **`/pilot` drops a roster row from the operator's click handler.** `savePilotNote`
  reached `all.push` on all five shapes.

The page-level consequences above are reasoned from the call sites, as cycle 30's crops
and labels were. They are not claimed as observed in a browser.

### `getCurrentPilotSession` is not an array, and `Array.isArray` is the wrong guard

The store the backlog said to think about. It returns an object, its three call sites
(`app/scan/page.tsx:323,334,510`, `app/scan/use-capture-analysis.ts:168`,
`app/pilot/page.tsx:20`) read `session.participantId` / `session.sessionId` behind a
truthiness check, and so `null`, `false` and `0` were already neutralised **by the
callers** — nothing crashed on those. What was not neutralised is a truthy non-session:
on `5`, `"abcdef"` or `{"a":1}` the truthiness check passes, `participantId` is
`undefined`, and every consent event captured in that session lands unscoped. Participant
scope is what the participant-grouped cross-validation needs, so that is a silent loss
in the research stream, not a crash — the harder failure to notice, and the reason the
guard checks the two fields the callers read rather than merely "is an object".

**Primary source read for this decision** — does a shipped store that persists an
*object* (not an array) shape-check what it reads back?

```
--- https://raw.githubusercontent.com/pmndrs/zustand/main/src/middleware/persist.ts
http=200 bytes=11972
sha256 db7c4f7f6ce2a54defac2212f6b0f348fa0a5323fb83f40f321d1d2ffd3fe909
```

`createJSONStorage`'s read is a bare parse plus a cast — no shape check, exactly the
idiom ARU had:

```ts
const parse = (str: string | null) => {
  if (str === null) {
    return null
  }
  return JSON.parse(str, options?.reviver) as StorageValue<S>
}
```

and the hydrate path checks truthiness plus one field's type, then spreads:

```ts
if (deserializedStorageValue) {
  if (
    typeof deserializedStorageValue.version === 'number' &&
    deserializedStorageValue.version !== options.version
  ) { … } else {
    return [false, deserializedStorageValue.state] as const
  }
}
```

```ts
merge: (persistedState: unknown, currentState: S) => ({
  ...currentState,
  ...(persistedState as object),
}),
```

So zustand does not shape-check either. It survives the five naked wrong shapes only
because of its `{state, version}` envelope: a bare `5` or `"abcdef"` has no `.state`, so
`merge` spreads `undefined` and the current state is returned unchanged. Run against that
exact idiom in node v22.22.2, current state `{participantId:"P007",sessionId:"P007-1"}`:

```
null                         -> {"participantId":"P007","sessionId":"P007-1"}
5                            -> {"participantId":"P007","sessionId":"P007-1"}
{}                           -> {"participantId":"P007","sessionId":"P007-1"}
"abcdef"                     -> {"participantId":"P007","sessionId":"P007-1"}
false                        -> {"participantId":"P007","sessionId":"P007-1"}
{"state":"abcdef","version":0} -> {"0":"a","1":"b","2":"c","3":"d","4":"e","5":"f","participantId":"P007","sessionId":"P007-1"}
{"state":5,"version":0}      -> {"participantId":"P007","sessionId":"P007-1"}
```

The last two rows are the finding. A *well-formed* envelope carrying a wrong `state`
spreads straight into the store — a JSON string becomes six numeric keys on application
state — because nothing between the parse and the spread asks what `state` is. ARU's
pilot session has no envelope at all, so the truthiness check at each call site was the
only thing standing there. That is what the field check replaces, and it is why copying
`Array.isArray` across all four reads without looking would have left this one open.

### Break-the-line

Recorded in the cycle 31 entry of `docs/AUTOPILOT.md`.
