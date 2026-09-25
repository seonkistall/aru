# The 0.86 vision-confidence cap was also doing input validation

Measured 2026-09-25 (autopilot cycle 38). This advances the open backlog item "The 0.86
vision-confidence cap and the 0.8614 confidence gate are 0.0014 apart and were chosen
independently"; it does **not** close it. Where the cap *should* sit still needs the
vision path's confidences measured against real readings, and no export in this
repository has them. What follows needed no labelled data, which is why it could be done
this cycle.

## What was measured

`mergeVisionAnalysis` (`app/scan/capture-analysis.ts`) publishes

```
next.confidence = Math.max(base.confidence, Math.min(0.86, mean(vision confidences) * 0.9))
```

It clamped each vision confidence to `[0,1]` where it read the *per-attribute* value,
and did not clamp the values it summed into that mean. `/api/analyze`'s `readConfidence`
clamps every attribute before the payload leaves the route. So the same payload
published one number through the function and another through the route, and the
published confidence label and the retake recommendation both moved with it.

Measured with `mergeVisionAnalysis` on a base reading of `confidence: 0.2`, the function
against the route's own clamp (literal `vitest` output, 2026-09-25):

| payload `confidence` | through `mergeVisionAnalysis` | through `/api/analyze` |
|---|---|---|
| `{oil: 2, redness: 0, pores: 0}` | 0.600000 · 보통 · retake false | 0.300000 · 낮음 · retake true |
| `{oil: 3, redness: 0, pores: 0}` | 0.860000 · 보통 · retake false | 0.300000 · 낮음 · retake true |
| `{oil: 10, redness: 0, pores: 0}` | 0.860000 · 보통 · retake false | 0.300000 · 낮음 · retake true |
| `{oil: 1.5, redness: 0, pores: 0}` | 0.450000 · 낮음 · retake true | 0.300000 · 낮음 · retake true |
| `{oil: -2, redness: 1, pores: 1}` | 0.200000 · 낮음 · retake true | 0.600000 · 보통 · retake false |
| `{oil: 5, redness: 5, pores: 5}` | 0.860000 · 보통 · retake false | 0.860000 · 보통 · retake false |
| `{oil: 1, redness: 1, pores: 1}` | 0.860000 · 보통 · retake false | 0.860000 · 보통 · retake false |

The negative row diverges the other way: an unclamped `-2` drags the mean below the base
reading, and `Math.max(base.confidence, …)` then restores 0.200 — a *lower* published
confidence than the route's, from the same payload.

## Why it stayed invisible

The cap. `Math.min(0.86, mean * 0.9)` saturates from `0.86 / 0.9 = 0.95555…` upward, so
every mean at or above that publishes exactly 0.860000 whatever it was. The two payloads
anybody would reach for first — every attribute at 5, every attribute at 1 — are both on
the absorbed side and read 0.860000 on both paths. The divergence only shows in the band
*below* saturation, which is where a partially out-of-range payload lands.

That is the finding worth writing down: the cap was standing in for input validation
that `mergeVisionAnalysis` was not doing, on top of the over-confidence job it was
designed for. Anyone moving the cap upward would have been moving a bound on adversarial
input at the same time, without knowing it.

## What changed

One value, clamped once, before it is used for anything:

```ts
const confidence = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : null;
if (confidence !== null) confidenceValues.push(confidence);
```

Both columns above now read the route's number. **Nothing on the production path
changes**: `/api/analyze` already clamps, so every value that reaches this function from
the route is already in range and the new clamp is a no-op there. Non-numbers, `NaN` and
`Infinity` are still excluded from the aggregate entirely rather than clamped, which was
already the behaviour and is now pinned.

`tests/vision-confidence-clamp.test.ts` is **12 passed**. Broken two ways on the
committed tree: pushing the raw value again gives **5 failed | 7 passed**, and clamping
only the lower bound (`Math.max(0, raw)`) gives **4 failed | 8 passed**.

## What this does not establish

Where the cap should be. 0.86 is 0.0014 below the 0.8614 높음 gate, so the vision term
alone still never publishes 높음 — pinned here and in
`tests/confidence-label-contract.test.ts` — and whether that is the right relationship
is the same open question it was before this cycle. Nor does it say which of the two
columns above was the *better* number for an out-of-range payload; it says they are now
the same number, and that the one they agree on is the one that shipped.
