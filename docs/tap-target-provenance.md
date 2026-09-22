# Where `--tap-min: 44px` comes from

Cycle 27, 2026-09-22.

## Why this doc exists

`--tap-min: 44px` (`app/globals.css:35`) is the touch-target contract every UI cycle
reaches for: `pill()` and `saveBtn` in `/checkin`, the CTAs this cycle fixed there, the
buttons in `product-card`, `flow-steps`, `reengage-optin`, `language-switcher`,
`return-banner`, and the `/report` and `/scan` controls all assert it. It has been a
magic number since it was introduced — no comment or doc said which standard `44`
belongs to, or why not `24` or `48`. A regression spec that reads "1px under `--tap-min`"
is only as meaningful as the number it defends. This records the provenance so the next
cycle does not re-derive it, and so a proposal to move it argues against the right source.

The number is **not** verified against a page ARU can open on this network — `w3.org`
and `wikipedia.org` refuse it (recorded across prior cycles). It is verified against the
**W3C WCAG repository's own source** on `raw.githubusercontent.com`, which answers, and
against **Material Components for Android's** own `dimens.xml`. Those are the normative
text (WCAG) and a reference implementation (Material), not a secondary summary.

## What the sources say

Fetched 2026-09-22 via `raw.githubusercontent.com`:

```
--- https://raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/21/target-size-enhanced.html
    http=200 bytes=798    sha256 b8699a5f872b8064478cb97cc9a11feeb958f429de3ec826f5f9ce392912c506
--- https://raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/22/target-size-minimum.html
    http=200 bytes=1737   sha256 b5cd439141c3771e69cd20596f6fbda5fadfe28967f8783559066a435a62b123
--- https://raw.githubusercontent.com/w3c/wcag/main/understanding/22/target-size-minimum.html
    http=200 bytes=22971  sha256 9fe6cee56ef43c2d414ed984c0e801b2ed66ede1b3bd487d148f6d95e8581b8f
--- https://raw.githubusercontent.com/material-components/material-components-android/master/lib/java/com/google/android/material/resources/res/values/dimens.xml
    http=200 bytes=3786   sha256 849e9c92c6358bfb1233b4413461a2575035139c63799ced69cbab6504d6166b
```

**WCAG 2.5.5 Target Size (Enhanced), level AAA — 44 by 44 CSS pixels.** Verbatim from
`guidelines/sc/21/target-size-enhanced.html`:

> The size of the target for pointer inputs is at least 44 by 44 CSS pixels except when:
> [Equivalent / Inline / User Agent Control / Essential]

That is the figure ARU uses. `44` is the WCAG **AAA** target, not a rounded phone number
and not the AA one below it.

**WCAG 2.5.8 Target Size (Minimum), level AA — 24 by 24 CSS pixels.** Verbatim from
`guidelines/sc/22/target-size-minimum.html` (added in WCAG 2.2, `class="sc new"`):

> The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:
> [Spacing / Equivalent / Inline / User Agent Control / Essential]

So the floor an AA audit would enforce is **24px**, and ARU holds itself to the stricter
AAA **44px**. A control measuring 43.0px — what this cycle found on `/checkin`'s
empty-state link in `ja` — clears AA with room to spare and misses AAA by 1px. The
contract ARU asserts is the AAA one, so 43.0px is a real miss against ARU's own bar,
which is the right way to read it: it is a self-imposed AAA target, not a legal minimum.

**Material Components for Android — 48dp.** From its `dimens.xml`:

```xml
<dimen name="mtrl_min_touch_target_size">48dp</dimen>
```

48dp on a baseline mdpi screen is 48px, which is why some codebases use 48 rather than
44. ARU's 44 is the WCAG AAA figure, not Material's; the two are different lineages and
the 4px gap is not an error in either.

### One thing these sources settle about the exception clauses

Both WCAG criteria carve out an **Inline** exception: a target "in a sentence or [whose]
size is otherwise constrained by the line-height of non-target text" is exempt. The
`/checkin` empty-state links are **not** inline — they are standalone block CTAs in a
centred row — so the exception does not apply and the 44px contract is the one that
governs them. That is why raising them to `minHeight: var(--tap-min)` is the correct fix
rather than leaving them at the line box: they are not text-flow targets.

## What this does not settle

- It does not verify the figures against the published Recommendation at `w3.org`, which
  this network cannot reach. The WCAG repository source is the drafting text behind that
  Recommendation, which is the closest a network without `w3.org` can get, and the SC
  wording quoted above is normative-form, not an editor's paraphrase.
- It does not argue that `44` should move. Nothing here proposes a change; the value is
  correct against the AAA criterion and stays put. This doc exists so that the number has
  a source the next cycle can see, not to reopen it.
