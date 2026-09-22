# Designing ARU to earn $10,000/month

**Date:** 2026-09-21
**Model:** `scripts/revenue-model.mjs` — run it rather than quoting this page.

Every number below is either MEASURED from the repository or ASSUMED and labelled.
The conversion rates have never been measured for this product, because this product
has never had traffic. Ranking architectures against each other survives the
assumptions being off by a factor; forecasting a month's revenue does not.

## The short version

**The revenue architecture that ships today reaches $10,000/month only at traffic ARU
has no path to.** Not because it converts badly — because each acquired user is worth
one purchase, once, at about a dollar. At the catalogue's own prices that is 10,110
purchases a month, which at the optimistic end of the assumed band is **202,198 new
scans a month**, and at the pessimistic end 505,495. For a free skincare scanner with no marketing budget,
those are not targets, they are a description of a different company.

Three levers change the arithmetic. Only the first is code.

| Lever | Effect on required traffic | Who can pull it |
|---|---|---|
| Repeat purchase (replenishment) | **3x fewer new scans** — 67,399-168,498/mo | the loop. Landed 2026-09-21 |
| Larger basket (routine, not one item) | proportional; 2 items ~halves it | the loop, with a product decision |
| Brand-side revenue | a handful of deals, not 10,000 purchases | owner only |

## What the model says, verbatim

`node scripts/revenue-model.mjs`, 2026-09-21:

```
## MEASURED: the catalogue basket (lib/skus.ts)

  SKUs                 : 22
  price range          : ₩1,800 - ₩38,000
  mean                 : ₩19,514
  median               : ₩19,500

  docs/AUTOPILOT.md states ~₩30,000 and cites "catalogue price band in lib/skus.ts".
  The median of that band is ₩19,500. A ₩30,000 basket needs ~1.5 items, which is a
  different assumption than the one the table credits. Both are modelled below.

## Revenue per converted click (ASSUMED rates x MEASURED basket)

  basket                             programme                per conversion
  ---------------------------------- ---------------------- ----------------
  1 item at the catalogue median     올리브영 쇼핑 큐레이터             ₩1,365 / $0.99
  1 item at the catalogue median     네이버 쇼핑 커넥트                 ₩975 / $0.71
  1 item at the catalogue median     쿠팡 파트너스                    ₩585 / $0.42
  the figure docs/AUTOPILOT.md carries 올리브영 쇼핑 큐레이터             ₩2,100 / $1.52
  the figure docs/AUTOPILOT.md carries 네이버 쇼핑 커넥트               ₩1,500 / $1.09
  the figure docs/AUTOPILOT.md carries 쿠팡 파트너스                    ₩900 / $0.65

## What $10,000/month requires, per architecture

  Steady state, so the arithmetic is: a cohort of A new buyers acquired each
  month yields p purchases each over a year, and twelve overlapping cohorts
  make monthly purchases = A x p. So A = purchases needed / p, and new scans
  = A / scan->buyer rate. Architecture B reuses buyers, so it needs fewer
  new scans for the same revenue — that is the whole point of it.
  Steady state is not month one. A's purchase happens at the scan, so month 1
  already earns the steady-state figure; B's first purchase does too and its
  replenishments arrive over the following year, so B's month 1 is ~1/p of
  steady state and the tail takes a year to fill in.

  올리브영 쇼핑 큐레이터 — $0.99 per conversion, basket ₩19,500
     A  purchases/mo  10,110   new buyers/mo  10,110   new scans/mo  202,198 -  505,495
     B  purchases/mo  10,110   new buyers/mo   3,370   new scans/mo   67,399 -  168,498

  네이버 쇼핑 커넥트 — $0.71 per conversion, basket ₩19,500
     A  purchases/mo  14,154   new buyers/mo  14,154   new scans/mo  283,077 -  707,692
     B  purchases/mo  14,154   new buyers/mo   4,718   new scans/mo   94,359 -  235,897

  쿠팡 파트너스 — $0.42 per conversion, basket ₩19,500
     A  purchases/mo  23,590   new buyers/mo  23,590   new scans/mo  471,795 - 1,179,487
     B  purchases/mo  23,590   new buyers/mo   7,863   new scans/mo  157,265 -  393,162
```

And backwards, which is the more useful direction:

```
    scans/mo        A: one purchase       B: replenishment
  ---------- ---------------------- ----------------------
       1,000        $19.78 - $49.46       $59.35 - $148.37
      10,000      $197.83 - $494.57     $593.48 - $1483.70
      50,000     $989.13 - $2472.83    $2967.39 - $7418.48
     100,000    $1978.26 - $4945.65   $5934.78 - $14836.96
     500,000   $9891.30 - $24728.26  $29673.91 - $74184.78
```

Read the 10,000-scan row. A month with ten thousand scans — which would be a real
success for a product with no users today — earns **two to five hundred dollars** under
the architecture that shipped, and six hundred to fifteen hundred under the one that
ships now. Neither is $10,000. That is the honest shape of the problem and no amount of
funnel optimisation changes it.

## Correction: the basket figure in docs/AUTOPILOT.md was credited to a source that does not support it

`docs/AUTOPILOT.md` has carried `~₩30,000` as the "typical Korean skincare basket"
since 2026-09-15, citing "catalogue price band in `lib/skus.ts`". The median of that
band is **₩19,500** and the mean **₩19,514**. ₩30,000 is 1.54x the median and is not in
the catalogue's central range at all. Twenty cycles read past it.

Note what is and is not wrong here. **₩30,000 is a perfectly defensible basket** if a
user buys more than one item — the recommendation shows up to three, and a two-item
basket is ₩39,000. The defect is the attribution: a behavioural assumption was credited
to a price band that does not support it, which made it look like a measurement and put
it beyond re-examination.

The consequence is not cosmetic either way. Read as one item, the table's $1.5 per
conversion is really $0.99 and its ~6,700 conversions are 10,110 — **the target is
~1.5x harder than the file implied**, in the direction that flatters the plan. Read as
1.5 items, the figure stands and the basket assumption should be stated. The model now
carries both as separate labelled rows, so which one is being claimed is visible.

## Gap 1 — the product asked for a repeat purchase and threw the answer away

`/checkin` asks 재구매 할래요? A user who taps 할래요 has declared purchase intent at
the highest-intent moment the product has. Before 2026-09-21 the product wrote a
boolean to `localStorage` and rendered "남겨주신 피드백을 저장했어요."

No link. No `/api/out`. The single most valuable event in the funnel earned nothing and
was not even counted, because `repurchase` lived only inside a `Checkin` row that
nothing aggregates.

**Fixed.** A 할래요 answer now renders the product's buy link through `/api/out` with
placement `checkin_repurchase`, under the `CommerceDisclosure` every commerce surface
owes, and fires a `repurchase_intent` funnel event carrying `week` and `satisfaction`
and nothing else. `tests/repurchase-loop.test.ts` — all 8 cases fail against the
previous `main`, and the two that assert the offer is mounted also fail against a build
where the link is left in the file but never rendered.

Why this is the highest-value change available to a code cycle: it is the whole
difference between architecture A and B in the table above, and the machinery it needs
— product-use tracking, the 2-week and 4-week rounds, the reminder email, the
unsubscribe token — was already built. The loop had constructed a retention engine and
left the last link out.

### What it does not fix

The offer appears only to an answer given in the same session. A user who answered on a
previous visit sees nothing, because all that was stored is the boolean, and re-offering
a purchase to someone who may already have made it is worse than staying quiet. Storing
"offered, not yet clicked" would fix that and is a state decision, not a UI one.

The reminder email still links to `/checkin` and not to the product. That is the next
increment and it is deliberately not in this change: the email is the surface where an
unwanted commercial link costs the most.

## Gap 2 — no acquisition channel exists at all

Traffic is the binding constraint in every row of the model. ARU had, before
2026-09-21: no `robots.txt`, no sitemap, and no page a search engine could rank.

**Partly fixed.** `app/robots.ts`, `app/sitemap.ts` and `lib/site.ts` now exist, with
`tests/seo-surface.test.ts` holding the two files in agreement and keeping `/ops`,
`/pilot` and `/eval` out of the crawl at request time rather than only at response
time.

**The sitemap has three urls, and that is the finding.** `/report`, `/care`,
`/checkin` and `/studio` all read `sessionStorage` an earlier step wrote, so a crawler
sees each one's empty state. ARU is a session app with essentially no indexable
surface. Configuration cannot fix that; content can, and the plan is in
[`docs/marketing-plan.md`](marketing-plan.md).

There is a second, structural limit that this change does not touch: **five languages,
one url each.** `LanguageProvider` switches language client-side, so there is no
`/ko/...` or `?lang=ko` for `hreflang` to point at, and the server-rendered copy a
Korean-language crawler sees is English. A Korean search query cannot rank a page whose
crawlable text is in another language. Fixing it is a routing change.

## Gap 3 — the basket is one item, and the product knows the routine

Not fixed here; recorded because the model makes it the second-largest lever.

`recommend()` returns up to three picks and `/care` already presents a routine. The
funnel drives one click at one product. Two items at the catalogue median is ₩39,000
and halves every traffic requirement in the table above; a cleanser + toner + cream
routine is ~₩58,500 and cuts it by two thirds.

This is a product decision and not a mechanical one — a bundle that exists to raise the
basket rather than to suit the skin is the kind of thing `efficacyClean()` cannot
catch and users can feel. It belongs to whoever owns the recommendation's integrity.

## What no code cycle can do

Stated plainly so the next cycle does not spend itself here.

- **Sign up for the affiliate programmes.** Every out-click still earns exactly $0.
  `COMMERCE_LINK_OVERRIDES_JSON` is ready and empty. This remains the single
  highest-leverage item in the repository and it is an owner action.
- **Bring traffic.** The loop can build the surfaces a channel needs. It cannot post,
  buy ads, or be interviewed.
- **Negotiate brand-side revenue**, which is the only architecture on this page that
  reaches $10,000/month at traffic ARU could plausibly have.

## An honest reading of the target

$10,000/month from affiliate commission on a free K-beauty scanner requires, after the
replenishment fix and assuming the affiliate accounts exist, something like **70,000 to
170,000 new scans every month**. That is a mid-sized consumer app.

Worth saying because the standing objective is "run until $10,000/month" and a loop can
run for a very long time against a number its architecture cannot reach. The three
options are the usual ones: change the architecture (brand-side revenue), change the
target, or accept a long horizon. That is an owner's decision and this document exists
to make it one that gets taken deliberately rather than by default.
