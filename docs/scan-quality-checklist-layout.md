# The camera quality checklist clipped its own labels

Cycle 22, 2026-09-20. `QualityPanel` in `app/scan/guide.tsx` is the row of checks the
user reads while the camera is live — 얼굴 / 측정영역 / 거리 / 밝기 / 반사 없음 /
피부 선명도, plus 흔들림 없음 in texture mode. It is the only thing on the screen that
tells them what to fix before the shutter fires.

It laid itself out as one grid track per check:

```tsx
gridTemplateColumns: `repeat(${checks.length}, 1fr)`
...
padding: "7px 2px", textAlign: "center", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden"
```

`<main className="px-5 py-9">` gives a 320px content box at the 360px viewport
`playwright.mobile.config.ts` targets. Six tracks and a 5px gap is 47px per cell, and
`overflow: hidden` is what let it get that narrow: per CSS Grid §6.6 it zeroes a grid
item's automatic minimum size, so the `1fr` tracks were free to shrink below
min-content instead of widening the grid. With `whiteSpace: "nowrap"` the label was
then hard-clipped, and because `textAlign: "center"` it was clipped at **both** ends,
with no ellipsis. `app/globals.css:86` sets `body { overflow-x: hidden }`, so nothing
scrolled into view either.

## Measured, not reasoned about

In chromium at a 360px viewport, on the real `/scan` page so the app's own stylesheet
and font stack decide the metrics, with the shipped cell styles and every check passing
(the `✓ ` prefix is on):

```
locale  label            cellPx   textPx   clipped  renders as
ko      ✓ 얼굴              47.00    35.55       no
ko      ✓ 측정영역            47.00    57.55      YES loses 10.5px of 57.5px
ko      ✓ 거리              47.00    34.06       no
ko      ✓ 밝기              47.00    34.06       no
ko      ✓ 반사 없음           47.00    58.59      YES loses 11.6px of 58.6px
ko      ✓ 피부 선명도          47.00    71.09      YES loses 24.1px of 71.1px
en      ✓ Face            47.00    38.31       no
en      ✓ Capture area    47.00    80.59      YES loses 33.6px of 80.6px
en      ✓ Distance        47.00    59.30      YES loses 12.3px of 59.3px
en      ✓ Brightness      47.00    69.78      YES loses 22.8px of 69.8px
en      ✓ No glare        47.00    56.45      YES loses 9.5px of 56.5px
en      ✓ Skin clarity    47.00    71.09      YES loses 24.1px of 71.1px
ja      ✓ 顔               47.00    24.55       no
ja      ✓ 測定エリア           47.00    69.33      YES loses 22.3px of 69.3px
ja      ✓ 距離              47.00    35.55       no
ja      ✓ 明るさ             47.00    47.06      YES loses 0.1px of 47.1px
ja      ✓ 反射なし            47.00    58.06      YES loses 11.1px of 58.1px
ja      ✓ 肌の鮮明さ           47.00    69.06      YES loses 22.1px of 69.1px
zh      ✓ 面部              47.00    35.55       no
zh      ✓ 测量区域            47.00    57.55      YES loses 10.5px of 57.5px
zh      ✓ 距离              47.00    35.55       no
zh      ✓ 亮度              47.00    35.55       no
zh      ✓ 无反光             47.00    46.55       no
zh      ✓ 肌肤清晰度           47.00    68.55      YES loses 21.5px of 68.5px
ar      ✓ الوجه           47.00    36.55       no
ar      ✓ منطقة القياس    47.00    76.08      YES loses 29.1px of 76.1px
ar      ✓ المسافة         47.00    48.86      YES loses 1.9px of 48.9px
ar      ✓ السطوع          47.00    49.25      YES loses 2.3px of 49.3px
ar      ✓ بلا وهج         47.00    42.14       no
ar      ✓ وضوح البشرة     47.00    73.11      YES loses 26.1px of 73.1px
```

**20 of 30 cells clipped, every one of the five locales affected.** The worst is
English `Capture area`, which loses 42% of its width. This is not a translation
problem: `tests/i18n-coverage.test.ts` already proves all seven labels are translated
in all four dictionaries. They are translated and then cut in half.

## The fix, and the same measurement after it

```tsx
gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))"
```

and the cell drops `whiteSpace: "nowrap"` and `overflow: "hidden"`, so a label that
does not fit wraps instead of being cut. `app/globals.css:88` already sets
`overflow-wrap: break-word` globally, `word-break: keep-all` keeps Korean wrapping at
phrase level, and lines 93-97 restore normal breaking for ja/zh/ar.

96px is the smallest round floor above the widest label actually rendered (`✓ Capture
area`, 80.59px). At 360px it gives three columns of 101px; on a wider screen `auto-fit`
goes back to six or seven across.

Re-measured the same way, same page, same fonts:

```
locale  label            cellPx   textPx   clipped
ko      ✓ 피부 선명도         101.00    71.09       no
en      ✓ Capture area   101.00    80.59       no
ja      ✓ 測定エリア          101.00    69.33       no
zh      ✓ 肌肤清晰度          101.00    68.55       no
ar      ✓ منطقة القياس   101.00    76.08       no
```

**0 of 30 clipped**, in all five locales. Every row of the after-table is in the cycle
22 entry in `docs/AUTOPILOT.md`; the five above are the widest label per locale.

## What pins it

`tests/mobile-layout-contract.test.ts`, case *"lets the camera quality checklist wrap
instead of clipping its localized labels"*. It asserts the grid no longer declares one
track per check, that it declares the `auto-fit` floor, that the floor is at least 84px
(above the widest measured label), and that the **cell's own style line** carries
neither `whiteSpace: "nowrap"` nor `overflow: "hidden"`.

That last one is sliced to the single line that carries the cell style, not to the
function and not to the file, and the reason is a trap this cycle walked into on the
first attempt: both spellings appear elsewhere in `app/scan/guide.tsx` — on the zone
badge at line 223, and inside the comment that explains this very fix — so the check
over a wider slice failed on its own prose. A guard that reads a docstring instead of
the code is a false negative and looks exactly like coverage.

Broken at the source line, three ways, each message the real one:

| break in `app/scan/guide.tsx` | what failed |
|---|---|
| one track per check restored | `AssertionError: expected 'import { useMemo } from "react";\nimp…' not to contain 'gridTemplateColumns: \`repeat(${checks…'` |
| `whiteSpace: "nowrap", overflow: "hidden"` put back on the cell | `AssertionError: expected '        <div key={label} style={{ bac…' not to contain 'whiteSpace: "nowrap"'` |
| floor lowered to 48px | `AssertionError: expected 'import { useMemo } from "react";\nimp…' to contain 'gridTemplateColumns: "repeat(auto-fit…'` |

## What is not covered

A true pixel assertion belongs in `tests/e2e/mobile-layout.spec.ts`, which today only
checks overflow on `/` and `/studio` and visits `/scan` solely for the camera-denied
tap-target case. Reaching `phase === "ready"` there needs a fake media stream that
suite does not set up, so the browser measurement above was taken by hand and the
committed guard is a source contract. That gap is real and is on the backlog.
