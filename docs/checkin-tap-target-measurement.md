# /checkin answer controls against the 44px tap contract

Measured 2026-09-21 (cycle 23) in chromium at 360x800 — the viewport
`playwright.mobile.config.ts` already uses — on the real `/checkin` page, so the app's own
stylesheet and fonts decided every number below. Nothing here is computed from CSS.

## 1. What was wrong

`pill()` (`app/checkin/page.tsx`) is the style for every control a user answers with:
만족도 (3 answers), 트러블 (2), 재구매 (2) — seven buttons per product card, in three rows.
It set `fontSize: 13` and `padding: "7px 11px"` and **no minimum size**, against
`--tap-min: 44px` in `app/globals.css:35`.

`app/checkin/page.tsx` was the only consumer page in the repository with **zero**
references to `var(--tap-min)`. Its near-twin `chipStyle()` in `app/survey/page.tsx` has
carried `minHeight: "var(--tap-min)"` since the survey chips were raised from 41px, and
`app/studio/page.tsx:163` carries both dimensions on the same pill shape. /checkin was
missed, and `tests/mobile-layout-contract.test.ts`'s file list is where it was missed —
the page is absent from it.

This matters more than its size suggests: `/checkin` is where every re-engagement mail
lands (`app/api/reengage/run/route.ts` builds `base + "/checkin"`), so these are the
primary controls of the one surface the product has for bringing a user back.

**Why an earlier audit reported /checkin clean.** The pills only render once a confirmed
product use is at least two weeks old (`roundFor`, `app/checkin/page.tsx`). Against an
empty `gyeol_purchases` the page shows two empty-state links and nothing else, so an audit
that did not seed a due product use never rendered the controls at all.

## 2. Before

Every control inside `main`, seeded with one confirmed use 3.5 weeks old:

```
[ko] 9 controls in main, 7 under 44px      [ja] 9 controls in main, 7 under 44px
  UNDER   46.5 x   35.5  별로               UNDER   72.8 x   35.5  いまいち
  UNDER   46.5 x   35.5  보통               UNDER   60.6 x   35.5  ふつう
  UNDER   46.5 x   35.5  좋음               UNDER   49.2 x   35.5  良い
  UNDER     69 x   35.5  있었어요            UNDER   60.6 x   35.5  あった
  UNDER     69 x   35.5  없었어요            UNDER   72.8 x   35.5  なかった
  UNDER   57.7 x   35.5  할래요              UNDER   60.6 x   35.5  したい
  UNDER   57.7 x   35.5  아니요              UNDER   60.6 x   35.5  いいえ

[en] 9 controls in main, 4 under 44px      [zh] 9 controls in main, 7 under 44px
  UNDER   45.3 x   35.5  Yes                UNDER     63 x   35.5  不太好
  UNDER   55.5 x   35.5  None               UNDER     50 x   35.5  中等
  UNDER   45.3 x   35.5  Yes                UNDER     37 x   35.5  好
  UNDER   40.8 x   35.5  No                 UNDER     37 x   35.5  有
                                            UNDER     50 x   35.5  没有
[ar] 9 controls in main, 7 under 44px       UNDER     50 x   35.5  愿意
  UNDER     74 x   35.5  ليس جيدًا            UNDER     37 x   35.5  否
  UNDER   64.8 x   35.5  متوسط
  UNDER   42.8 x   35.5  جيد
  UNDER   42.5 x   35.5  نعم
  UNDER   62.4 x   35.5  لا شيء
  UNDER   42.5 x   35.5  نعم
  UNDER   31.4 x   35.5  لا
```

**32 of 45 controls under the contract**, across five locales. Every pill is 35.5px high,
and the short answers are narrow as well as short — zh `好`/`有`/`否` at 37px, ar `لا` at
**31.4px**, en `No` at 40.8px. So the fix needs both dimensions, which is why it follows
`app/studio/page.tsx:163` rather than `app/survey/page.tsx`'s height-only chip.

## 3. After

`minHeight` and `minWidth` of `var(--tap-min)` plus `inline-flex` centering on `pill()`:

```
[ko] 9 controls in main, 0 under 44px
[en] 9 controls in main, 0 under 44px
[ja] 9 controls in main, 0 under 44px
[zh] 9 controls in main, 0 under 44px
[ar] 9 controls in main, 0 under 44px
```

Raising them widened the three rows, so the other half was measured rather than assumed —
horizontal overflow at 360px, before declaring it fixed:

```
[ko] doc scrollWidth=360 clientWidth=360 overflowing=0
[en] doc scrollWidth=360 clientWidth=360 overflowing=0
[ja] doc scrollWidth=360 clientWidth=360 overflowing=0
[zh] doc scrollWidth=360 clientWidth=360 overflowing=0
[ar] doc scrollWidth=360 clientWidth=360 overflowing=0
```

## 4. What guards it

`tests/e2e/checkin-touch-target.regression-1.spec.ts` gained five cases, one per locale,
which seed the due product use, assert the card renders all eight buttons (so an empty
card cannot pass by emptiness), assert nothing in `main` is under 44px either way, and
assert nothing overflows 360px. Reverting `pill()` to its shipped-before state fails all
five, at the assertion that names the problem:

```
Error: ko: controls under 44px
Error: en: controls under 44px
Error: ja: controls under 44px
Error: zh: controls under 44px
Error: ar: controls under 44px
  5 failed
  1 passed
```

`tests/mobile-layout-contract.test.ts` gained the cheap half — `app/checkin/page.tsx` is
now in the file list that must contain `var(--tap-min)`, for both dimensions. A source
contract cannot see a pixel, which is why the E2E cases above are the real guard; the list
is what stops the next page being missed the same way.
