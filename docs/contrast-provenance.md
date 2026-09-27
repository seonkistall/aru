# Where the 4.5:1 and 3:1 contrast floors come from

Cycle 49, 2026-09-27.

## Why this doc exists

Cycle 49 darkened two shipped design tokens — `--plum` from `#e0382c` to `#d9362b` and
`--orange` from `#ef8a1f` to `#d57b1c` (`app/globals.css`) — because the colours failed a
contrast threshold. A token that moves for a standard's sake is only as defensible as the
standard's own text, and `--tap-min` had been a magic number for 27 cycles for exactly
that reason (see [`tap-target-provenance.md`](tap-target-provenance.md)). This records the
normative text, the formula the audit implements, and the fetches, so the next cycle
argues against the source rather than against a remembered number.

`w3.org` refuses this container (recorded across prior cycles). These are the **W3C WCAG
repository's own source files** on `raw.githubusercontent.com`, which answers — the
normative text, not a secondary summary or a contrast-checker website.

## The fetches

All `http=200`, fetched 2026-09-27 from
`https://raw.githubusercontent.com/w3c/wcag/main/<path>`:

```
path                                            bytes  sha256
guidelines/sc/20/contrast-minimum.html           1071  f1d819b44cc5ba64e962ce64889de2ab214af6911b27a119f7d24c43197b2e64
guidelines/terms/20/contrast-ratio.html          2179  c279bc2f5dd510c7bc4a7a35d52004725e0bc5261ec13ee40680aa2d4510a6a2
guidelines/terms/20/relative-luminance.html      2550  391cc0cc06fc31641e35465bb8af5cb4c861f709a1ebc0e0e490b53a0cb2eb69
guidelines/terms/20/large-scale.html             2246  0b35ef88e20f8041de04f8a804ba902d8973465fb14f6f18d2b96346dc09e45a
guidelines/sc/22/target-size-minimum.html        1737  b5cd439141c3771e69cd20596f6fbda5fadfe28967f8783559066a435a62b123
```

`understanding/20/contrast-minimum.html` also answers (`http=200`, 21170 bytes) and is not
quoted here — the `understanding/` tree is explanatory, the `guidelines/` tree is the
requirement. `understanding/22/contrast-minimum.html` is a **404**: that document lives
under `20/`, because 1.4.3 is a WCAG 2.0 criterion carried forward unchanged.

The last row is the one cycle 27 already fetched. Its **sha256 is byte-identical to the
value recorded then** (`tap-target-provenance.md`), five days later — so that citation is
still live and this fetch reproduces it rather than restating it.

## What the text says

**SC 1.4.3 Contrast (Minimum), level AA.** Verbatim from
`guidelines/sc/20/contrast-minimum.html`:

> The visual presentation of text and images of text has a contrast ratio of at least
> 4.5:1, except for the following:
>
> **Large Text** Large-scale text and images of large-scale text have a contrast ratio of
> at least 3:1;
>
> **Incidental** Text or images of text that are part of an inactive user interface
> component, that are pure decoration, that are not visible to anyone, or that are part of
> a picture that contains significant other visual content, have no contrast requirement.
>
> **Logotypes** Text that is part of a logo or brand name has no contrast requirement.

The **Incidental** exception is not a technicality here: it is why the audit does not treat
`/survey`'s submit button as a defect while the survey is incomplete. Disabled, that
button's label measures **4.166:1**, and a disabled button is an inactive user interface
component. `tests/e2e/conversion-path-accessibility.spec.ts` therefore seeds a survey and
asserts `toBeEnabled()` before measuring, so it pins the state the requirement applies to.

**"large scale" (text).** Verbatim from `guidelines/terms/20/large-scale.html`:

> with at least 18 point or 14 point bold or font size that would yield equivalent size
> for Chinese, Japanese and Korean (CJK) fonts

At the CSS default of 96 dpi that is **24px**, or **18.66px** at weight 700, which is the
test the audit and the spec both apply — and the spec reads the classification back rather
than assuming it, so dropping a numeral below 24px moves its floor from 3 to 4.5 and fails
loudly instead of silently passing.

The definition's own note is worth keeping in view for ARU specifically: the "equivalent"
size for CJK is *the minimum large print size used for those languages*, which is not
stated as a pixel number anywhere in the normative text. ARU ships Korean, Japanese and
Chinese UI, so the 24px figure is the roman reading of the term and **not a verified CJK
equivalent**. Every element this cycle classified as large is ≥24px in all five locales,
so nothing turned on the ambiguity — but a future cycle that wants to call a 20px CJK
heading "large" has no primary source for it here.

**contrast ratio.** Verbatim from `guidelines/terms/20/contrast-ratio.html`:

> (L1 + 0.05) / (L2 + 0.05), where
>
> - L1 is the relative luminance of the lighter of the colors, and
> - L2 is the relative luminance of the darker of the colors.

with the note that matters for how the audit composites backgrounds:

> For the purpose of Success Criteria 1.4.3 Contrast (Minimum) and 1.4.6 Contrast
> (Enhanced), contrast is measured with respect to the specified background over which the
> text is rendered in normal usage. If no background color is specified, then white is
> assumed.

**relative luminance.** Verbatim from `guidelines/terms/20/relative-luminance.html`:

> For the sRGB colorspace, the relative luminance of a color is defined as
> L = 0.2126 * R + 0.7152 * G + 0.0722 * B where R, G and B are defined as:
> if RsRGB <= 0.04045 then R = RsRGB/12.92 else R = ((RsRGB+0.055)/1.055) ^ 2.4

That is the function implemented in `tests/e2e/conversion-path-accessibility.spec.ts`, and
it is implemented there rather than imported because the repo has no colour dependency and
a cycle may not add one. The spec computes it from the colours the browser **resolves**,
not from the hex literals in `app/globals.css`, so a token indirection that stops applying
fails the assertion instead of passing it.

## The two thresholds this repo now holds, and which standard each belongs to

| Property | Value in the repo | Criterion | Level |
|---|---|---|---|
| Body / CTA text contrast | ≥ 4.5:1 | 1.4.3 Contrast (Minimum) | AA |
| Large text contrast (≥24px, or ≥18.66px bold) | ≥ 3:1 | 1.4.3, Large Text exception | AA |
| Target size | `--tap-min: 44px` | 2.5.5 Target Size (Enhanced) | **AAA** |
| Target size floor actually required | 24x24 CSS px, with exceptions | 2.5.8 Target Size (Minimum) | AA |

The last two rows are the distinction cycle 27 established and this cycle had to apply:
`--tap-min` is a **stricter-than-AA** internal standard. A control under 44px is not
automatically a WCAG failure, and cycle 49's one target fix is an example — `/survey`'s
re-scan link measured **18.8px** tall, which misses `--tap-min` but **meets 2.5.8**,
because the nearest other target sits **72.9px** from a 24px-diameter circle centred on it
and the Spacing exception applies. The two `/guide/` links on `/` (15px and 38.4px tall)
meet 2.5.8 a different way: they are `display: inline` inside a `<p>` whose own text is
"영문 가이드:" and "·", so the **Inline** exception covers them and they were left alone.
Calling either of those three a WCAG AA failure would have been wrong, and fixing the
guide links to 44px would have changed a sentence's line box for no standard's sake.
