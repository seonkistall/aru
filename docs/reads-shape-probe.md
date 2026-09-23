# What a wrong-shaped `gyeol_reads` / `gyeol_scan` actually does

Cycle 33, 2026-09-23. Cycle 32 shape-checked `gyeol_survey` at its three reads. The
same functions (`loadInitialView` in `app/report/page.tsx`, `loadCareView` in
`app/care/page.tsx`) still `JSON.parse` `gyeol_reads` and `gyeol_scan` with no shape
check, and so do `app/survey/page.tsx` and `app/studio/page.tsx`. This file records
what each wrong shape does on each screen, **measured before anything was guarded**,
so that the screens that do not break are on record as not breaking rather than
guarded on suspicion.

Method: `tests/e2e/reads-shape.regression-17.spec.ts` under
`playwright.mobile.config.ts` (Chromium, 360x800), against the unchanged tree, with a
valid `gyeol_survey` in place so the survey guard never fires. Every value is valid
JSON, so the `try { JSON.parse } catch` at each read never sees it.

## 1. The result table

`✘` = the screen fell into `app/error.tsx` (`앗, 잠깐 멈췄어요`). `✓` = the screen
rendered. Run: **13 failed | 39 passed (52)**.

| `gyeol_reads` holds | /report | /care | /studio |
|---|---|---|---|
| `5` | ✘ | ✓ | ✓ |
| `"abcdef"` | ✘ | ✓ | ✓ |
| `{}` | ✘ | ✓ | ✓ |
| `true` | ✘ | ✓ | ✓ |
| `[]` | ✘ | ✓ | ✓ |
| buckets that are strings | ✘ | ✓ | ✓ |
| an oil bucket and nothing else | ✘ | ✓ | **✘** |
| everything but `overall` | ✘ | ✓ | **✘** |
| `signals: [5]` | ✘ | ✓ | ✓ |
| `extras: [5]` | ✓ | ✓ | ✓ |
| `retakeReasons: [5]` | ✓ | ✓ | ✓ |
| `source: "made-up"` | ✓ | ✓ | ✓ |

Plus two cases outside the loop, both `✘` before the fix: `/report` reached
`app/error.tsx` on a `reads: 5` already sitting in `localStorage["aru_last_result"]`,
and `/report` mirrored a wrong-shaped `reads` into that key on the way past
(`saveLastResult` runs before the render that throws).

`gyeol_scan`, the same six wrong shapes on `/report` and `/survey`: **twelve cases,
all ✓**. `5`, `"abcdef"`, `{}`, `true`, `[]` and `{"oil":"x","redness":0,"pores":0}`
each left both screens rendering. This matches the supervisor's measurement that
`recommend(survey, scan)` does not throw on a wrong-shaped scan, and extends it to
`loadScanHint` in `app/survey/page.tsx`, whose reads (`scan.retakeRecommended`,
`scan.confidence`, `scan.oil >= 2`) are property reads and comparisons rather than
method calls, and whose own `try/catch` returns `null` if one ever does throw. **No
scan guard was added**, on the strength of these twelve cases.

## 2. Why each column looks the way it does

**`/report` throws during RENDER, not in the effect.** `analysisRows` is guarded by
`reads` being truthy and then indexes `reads.oil.value` — so `5`, `"abcdef"` and `{}`
are all truthy and all reach `undefined.value`:

```
TypeError: Cannot read properties of undefined (reading 'value')
    at Report (app/report/page.tsx:200:55)
> 200 | ..."유분"), reads.oil, explain("oil", reads.oil.value)] as [string, { value: string; calm...
```

`signals: [5]` throws one layer down instead, in `signalCheck`
(`lib/report-trust.ts`), which calls `signal.label.includes(...)`. `extras: [5]` and
`retakeReasons: [5]` do NOT throw, because their elements are only read for
properties (`extra.label`, `extra.value`) and `t(undefined)` returns `undefined`,
which React renders as nothing. `source: "made-up"` does not throw either:
`SOURCE_LABEL[reads.source]` is `undefined` and the source chip comes out empty.

**`/care` does not break on any of the twelve.** `loadCareView` parses `reads` and
hands it to `careSummary`, whose signature is
`careSummary(survey, _reads, _result)` — the two underscored parameters are the
eslint warnings the baseline already reports at `lib/care.ts:70`. Nothing on `/care`
renders a field of `reads`. **No `/care` reads guard was added.** The inputs tried are
the twelve rows above; if `/care` ever starts rendering a `reads` field, the twelve
e2e cases already there are what will say so.

**`/studio` breaks on partial objects only.** Its `if (!scan?.oil?.value)` test
already rejects `5`, `"abcdef"`, `{}`, `true`, `[]` and a string oil. What it lets
through is a reading with an oil bucket and no `pores` bucket, which then throws at
`scan.pores.value` inside the mount effect.

## 3. The guard, and where it does not go

`isSkinReads` in `lib/last-result.ts`, at three reads: `/report`'s parse, `/studio`'s
parse, and `loadLastResult`. Structural only, the same rule `isSurvey` follows —
`source` and `confidenceLabel` are checked for `typeof === "string"` and not for
membership, because a reading whose source string this build no longer knows still
renders. Each of the four buckets is checked (`/report` renders all four). `signals`
is checked element by element; `extras` and `retakeReasons` are checked only for
`Array.isArray`, because their elements were measured not to break anything.

It lives in `lib/last-result.ts` rather than beside the type in `lib/skin.ts` so that
`/care` and `/studio`, which import `SkinReads` as a type only today, do not pull
67,485 bytes of image analysis into their client bundles for a shape check.

`loadLastResult` drops a wrong-shaped `reads` and keeps the record, rather than
rejecting the whole thing: the survey is still good and the report still renders
without a reading.

*Break-the-line*, three guards, three separate runs of the same 52-case spec:

| guard removed | result | what failed |
|---|---|---|
| `app/report/page.tsx` | **10 failed \| 42 passed** | the nine `/report` reads cases and the mirror check |
| `app/studio/page.tsx` | **2 failed \| 50 passed** | the two partial-object `/studio` cases only |
| `lib/last-result.ts` | **1 failed \| 51 passed** | the mirrored-copy case only |

The third one also fails named cases in `tests/skin-reads-shape.test.ts` — `drops a
wrong-shaped reads and still returns the survey` and `drops a partial reads that the old
optional-chain test let through`. *Supervisor correction at review:* re-run against the
committed file, replacing the ternary with `return parsed as LastResult;`, it fails
**three** — `3 failed | 28 passed (31)` — the third being `leaves Object.prototype alone
when the stored record carries __proto__`, whose first assertion is that a stored
`reads: 5` comes back `null`. That case is in the committed file; the draft's count of
two did not include it.

## 4. Primary source: why the new spread cannot be turned into a pollution vector

`loadLastResult` now builds `{ ...record, reads: null }` from a `JSON.parse`d value,
and `isSkinReads` uses `Number.isFinite` on a field that arrives out of a store.
Both were read from the specification's own source rather than reasoned about.

```
--- https://raw.githubusercontent.com/tc39/ecma262/main/spec.html
http=200 bytes=3087902
sha256 17e1fe359da75a82ae164014e1c862287cbe2ffdc8297d45bcf6068c007a69af
```

**`Number.isFinite` rejects a non-Number outright**, which is why a `confidence` that
arrives as the string `"0.82"` is rejected rather than coerced — the global `isFinite`
would accept it. Same reasoning as `isSurvey`'s `Number.isFinite(survey.budget)`:

> 1. If _number_ is not a Number, return *false*.
> 1. If _number_ is not finite, return *false*.
> 1. Return *true*.

**`"__proto__"` inside a JSON text is an ordinary own property, not a prototype
assignment.** PropertyDefinitionEvaluation has a ParseJSON branch that turns the
`__proto__` setter off:

> 1. If this |PropertyDefinition| is contained within a |Script| that is being
>    evaluated for ParseJSON …, then
>    1. Let _isProtoSetter_ be *false*.
> 1. Else if _propertyKey_ is *"__proto__"* and IsComputedPropertyKey of |PropertyName|
>    is *false*, then
>    1. Let _isProtoSetter_ be *true*.

**Object spread copies with CreateDataProperty, not with Set**, so copying that own
`"__proto__"` key into the new object does not invoke `Object.prototype.__proto__`'s
setter either. CopyDataProperties, the operation spread runs:

> 1. Let _propertyValue_ be ? Get(_from_, _nextKey_).
> 1. Perform ! CreateDataPropertyOrThrow(_target_, _nextKey_, _propertyValue_).

Checked against the engine as well as the text, node v22.22.2:

```
proto own key present: true
prototype unchanged: true
({}).polluted after parse: undefined
spread prototype unchanged: true
({}).polluted after spread: undefined
spread own __proto__ copied: true
Number.isFinite("0.82"): false  isFinite("0.82"): true
Number.isFinite(true): false  isFinite(true): true
```

The copy does carry an own `"__proto__"` data property forward, which is harmless
here — nothing reads that key — and is pinned in `tests/skin-reads-shape.test.ts` so
that a later change to how the record is rebuilt has to face it.

*Not established:* whether any other spec-relevant behaviour of the record's
round-trip matters; only these three clauses were read. The sha256 is of the file as
served on 2026-09-23 from `main`, which is a moving ref.
