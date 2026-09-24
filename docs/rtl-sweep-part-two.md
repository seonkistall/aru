# RTL sweep, part two: the six screens cycle 34 did not measure

Cycle 35, 2026-09-24. Cycle 34 measured `/report`, `/care` and `/checkin` under
`en` / `ja` / `zh` / `ar` at 360x800 and opened a backlog item for the rest. This
is the rest: `/` (landing), `/survey`, `/scan`, `/studio`, `/privacy` and
`/unsubscribe`. `/scan` is the pre-camera `init` screen only — this container has
no camera, so `phase === "ready"` and everything behind it was not reachable.

Every number below is a viewport x-coordinate in Chromium at 360x800 with
`localStorage["aru.lang"]` set, read off `getBoundingClientRect()` or a `Range`
over the element's text, on the unchanged code first and again after the fix.

## 1. Primary source

The fix keyword and the decision to leave the camera overlay alone both come from
one document: CSS Logical Properties and Values Level 1, read from the CSS Working
Group's own repository, which is the closest this network gets to the spec
(`www.w3.org` refuses — see BLOCKERS in `AUTOPILOT.md`).

```
https://raw.githubusercontent.com/w3c/csswg-drafts/main/css-logical-1/Overview.bs
http=200 bytes=39421
sha256 9b4a85569bcacff752f797fb6214a9eb04fca7173b93a160bcf8a47e39ed2b41
```

Fetched twice in the same session; the second fetch was byte-identical (`cmp`).

Line 105-107, the Arabic worked example — what `start` and `inline-start` mean:

```
            text-align: start; /* left in latin, right in arabic */
            margin-inline-start: 0px; /* margin-left in latin, margin-right in arabic */
            border-inline-start: 5px solid gray; /* border-left in latin, border-right in arabic */
```

Line 443, on which box's direction decides the mapping — the question a flex item
raises, because in a `dir=rtl` row the container also reverses the ORDER:

```
  For example, although the [=inline-start=] margin of an''direction/rtl'' box is its right margin,
```

So the mapping is a property of the box itself, not of how its parent laid it out.
That is what makes `marginInlineStart: -6` on the landing card's mascot correct: the
mascot's own direction is `rtl`, so its inline start is its right edge, which is the
side the step number is on after the row reverses. Confirmed by measurement in §3.

Line 112-115, on when a physical property is the right answer:

```
    Documents might need both logical and physical properties. For instance
      the drop shadows on buttons on a page must remain consistent throughout,
      so their offset will be chosen based on visual considerations and physical directions,
      and not vary by writing system.
```

That is the rule under which `app/scan/guide.tsx` keeps every `left` and `right` it
has — see §5.

## 2. `/privacy` — every export and delete button put its Arabic label at the far end

`outlineBtn` and `dangerBtn` (`app/privacy/page.tsx:222-223`) both carried
`textAlign: "left"`. A bare `<button>` appended to each of these pages computes
`text-align: center` in this Chromium, so the keyword is a deliberate left-align, and
under `dir=rtl` it is the reading END.

Seven buttons on the page compute a non-`center` `text-align`. Content box is the
`ar` one, padding and border excluded; the `en` column is where each visual line
actually sat (Arabic lays one visual line out as several client rects, one per bidi
run, so rects are grouped by their top edge before the extent is read):

| button | `ar` content box | `ar` before | `ar` after | `en` before = after |
|---|---|---|---|---|
| تصدير التصنيفات | 54…306 | 54…198 | **162…306** | 54…190 |
| تصدير صور البحث | 54…306 | 54…242 | **118…306** | 54…280 |
| حذف بيانات البحث | 54…306 | 54…160 | **200…306** | 54…193 |
| تصدير سجل الموافقات | 54…306 | 54…218 | **142…306** | 54…213 |
| حذف سجل الموافقات | 54…306 | 54…181 | **179…306** | 54…179 |
| حذف سجل روابط المنتجات | 54…306 | 54…280 | **80…306** | 54…297 / 54…102 |
| حذف جميع بيانات ARU | 87…306 | 87…306 | 87…306 | 54…278 |

The last row is the one button whose width is content-sized rather than grid-sized,
so its box differs by locale: 72…321 in `ar` (content 87…306) against 39…293 in `en`
(content 54…278).

Six of the seven moved; the seventh already filled its line, so there was nothing
for the wrong keyword to show. The worst was 146px of empty space on the side an
Arabic reader starts from — حذف بيانات البحث, whose label ran 54…160 inside a
54…306 box.

## 3. `/` — the landing cards' titles and the mascot's negative gutter

`HowCard` (`app/page.tsx:133-151`) is a flex row: step number, mascot, text column.
Two separate defects in one row.

**The text column** carried `textAlign: "left"`. Box 38…240 in `ar`; the titles'
visual lines ended at 161 (card 1), 194 (card 2) and 172 then 148 (card 3, which
wraps) instead of at 240. After the fix every one of them ends at 240, and the body
lines with them.

**The mascot** carried `marginLeft: -6`, which tightens the number→mascot gap in LTR
and, in RTL, lands on the side away from the number. The two gutters swapped:

| gap | `en` before | `en` after | `ar` before | `ar` after |
|---|---|---|---|---|
| number → mascot | 6 | 6 | **12** | **6** |
| mascot → text column | 12 | 12 | **6** | **12** |

The mascot's own box moved from 246…292 to 252…298. `en`, `ja` and `zh` did not move
at all — see §6.

## 4. `/scan` pre-camera, and the step rail on every screen that has one

**The intro list** (`app/scan/page.tsx:380`), the three lines a user reads before
opening the camera, carried `textAlign: "left"`. Box 62…273 in `ar`; every visual
line started at 62 and stopped short of 273. After the fix every line ends at 273.

**`FlowSteps`' hairline divider** (`app/components/flow-steps.tsx:25`) carried
`marginRight: 2` inside a `gap: 7` flex row, so its two gutters read 7 then 9 in LTR
and 9 then 7 in RTL. Divider x-position in `ar` moved 287 → 289; the gaps now read 7
then 9 in both directions. Two pixels, and the only reason it is worth a line is that
it is on `/scan`, `/survey`, `/report` and `/care`.

## 5. What was deliberately left physical

`app/scan/guide.tsx` in full. It draws over the camera's image of a face: the zone
boxes (`이마/T존` at `left: 36%`, `왼볼 결` at `left: 21%`, `오른볼 결` at
`right: 21%`), the four corner marks, the landmark dots at `left: ${point.x}%`, the
ROI rectangle at `left: ${rect.left}%`, the centre line and the zone label at
`left: 50%`, and the mode pill at `top: 14; right: 14`. These are positions on a
photograph. Mirroring them would put the "왼볼" (left cheek) label on the right
cheek, which is the spec's own "visual considerations and physical directions" case
quoted in §1. Nothing in `tests/e2e/rtl-logical-inset.regression-19.spec.ts` asserts
anything about that file.

Also left alone, each for its own reason:

- `app/page.tsx:57` — the hand-drawn annotation arrow at `left: -8; top: 34`. It is
  anchored to the mascot illustration, which is not mirrored, and it points up and to
  the right at the magnifier. Moving it to `insetInlineStart` without mirroring the
  path would point it away from the thing it annotates. It carries no
  `aru-dir-arrow` class, unlike the decorative forward arrows that `app/globals.css`
  DOES mirror under `html[dir="rtl"]` (lines 120-124).
- `app/scan/scanning.tsx:10` and `app/scan/page.tsx:401` — symmetric `left`/`right`
  insets. There is no start or end to pick.
- `app/scan/result-card.tsx:78` — symmetric `borderLeft` + `borderRight`, and it is
  after capture, not pre-camera.
- `app/scan/info-sheet.tsx:22` — `<ul style={{ paddingLeft: 18 }}>`. Grepped, NOT
  measured: `InfoSheet` is only reachable from `ScanControls`, which renders only at
  `phase === "ready"`, which needs a camera. Left unchanged and recorded in the
  backlog rather than fixed on reasoning alone.
- `app/scan/scan-controls.tsx:111` — `privacyPill`'s `textAlign: "right"`. Same
  reason: `phase === "ready"` only, so unmeasurable here.
- `app/components/product-card.tsx:46` — `marginLeft: "auto"` in a flex row pushes to
  the inline END in both directions, so it is not a defect; and it is not on any of
  these six screens.

## 6. What did not move

`/survey`, `/studio` and `/unsubscribe` have no physical `left` / `right` /
`paddingLeft` / `paddingRight` / `marginLeft` / `marginRight` / `borderLeft` /
`borderRight` / `textAlign: "left"|"right"` in their own `.tsx` at all — the grep
over `app/survey/page.tsx`, `app/studio/page.tsx`, `app/unsubscribe/page.tsx` and
`app/unsubscribe/unsubscribe-form.tsx` exits 1. What `/survey` does inherit is
`FlowSteps`, which is §4.

All six screens were rendered under all four non-Korean locales — 24 renders — and
every one showed 0 Korean characters, 0 un-interpolated `{placeholders}` and
`scrollWidth === clientWidth === 360`, `ar` included.

The whole `en` / `ja` / `zh` half of the measurement is byte-identical before and
after. Diffing the two probe runs with only the `text-align` keyword itself
normalised away, the ONLY lines that differ are `ar` lines: the three landing cards,
the five privacy buttons, the three scan intro rows and the flow divider. That is
what makes these logical properties a fix rather than a re-layout.
