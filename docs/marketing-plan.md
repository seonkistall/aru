# ARU acquisition plan

**Date:** 2026-09-21
**Depends on:** [`docs/revenue-design.md`](revenue-design.md), `scripts/revenue-model.mjs`

This is the marketing half of the $10,000/month design. It starts from a number
rather than from a channel list, because the number rules most of the list out.

## The number that decides everything: $0.06-$0.15

`node scripts/revenue-model.mjs`, 2026-09-21:

```
  architecture                                 per scan    per 1,000 scans
  ---------------------------------- ------------------ ------------------
  A: 1 purchase/user/yr                   $0.02 - $0.05    $19.78 - $49.46
  B: 3 purchase/user/yr                   $0.06 - $0.15   $59.35 - $148.37
```

That is revenue per new scan after the replenishment fix, and it is the **absolute
ceiling on acquisition cost** — at 100% margin, ignoring hosting, the vision API bill,
and the owner's time. A channel that delivers a scanning user for more than about
fifteen cents loses money on every one.

Judgement, not measurement: no mainstream paid channel — Korean search ads, Meta,
TikTok, influencer CPM, app-install campaigns — is likely to deliver an engaged user
for fifteen cents, and the shortfall reads like a large multiple rather than a margin
better creative could close. **No CPC or CPI figure was available to check that from**:
the ad platforms' own rate pages are among the hosts this network refuses. So this is
the conclusion I would act on, not a number I can show.

**So: treat paid acquisition as closed, and plan on organic and referral.** Two
qualifiers that matter. The ceiling is computed from inputs that are entirely ASSUMED,
and the model says of itself that its outputs are "useless as a forecast". And the
ceiling is not fixed: the three-item routine proposed below roughly triples it, which
would still not open a paid channel but changes how far away it is. Re-derive before
re-arguing.

One consequence worth stating: this also means **ARU cannot buy its way to the $10,000
target**, so the traffic has to come from surfaces that compound — search and sharing —
or from changing the revenue architecture so a user is worth enough to pay for.

## Channel 1 — Search. Cheapest, slowest, and currently unbuilt

### The demand looks real, and the product cannot receive it either way

Korean search demand for self-diagnosis beauty queries — 피부 타입 테스트, 모공 자가진단,
지성 건성 구분, 피부 진단 앱 — is exactly ARU's product. **No volume data was checked:**
every Korean keyword tool is on a host this network refuses, so treat the query list as
a hypothesis to validate in Search Console rather than as a sized market. It is worth
building for regardless, because the problem below is on ARU's side and holds at any
volume.

**What shipped 2026-09-21:** `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts`,
`tests/seo-surface.test.ts`. ARU previously had no `robots.txt` and no sitemap at all.

**What that did not fix, and is the real work:**

1. **Three indexable urls.** `/`, `/scan`, `/privacy`. Every other page reads
   `sessionStorage` an earlier step wrote, so a crawler sees an empty state. There is
   essentially nothing to rank.
2. **Five languages, one url each.** `LanguageProvider` switches language in the
   browser. There is no `/ko/…` path and no `?lang=` parameter, so `hreflang` has
   nothing to point at and the copy a Korean-language crawler reads is **English**.
   A Korean query cannot rank an English page. My judgement is that this is the
   binding one of the three — items 1 and 3 are worth nothing while it holds, since
   content and urls would both be in the wrong language — and it is a routing change,
   not a metadata one.
3. **No content.** Nothing answers a question someone searched for.

### The smallest testable experiment

Not a blog. One route — `/guide/[topic]` — server-rendered in Korean, 6-8 pages, each
answering one query the product already has an opinion about, each ending at `/scan`:

| Page | Query people type | What ARU already knows |
|---|---|---|
| 지성·건성·복합성 구분 | "내 피부 타입" | `lib/recommend.ts` skin-type logic |
| 모공이 넓어 보이는 이유 | "모공 줄이는 법" | the pores axis and its honest limits |
| 붉은기와 홍조의 차이 | "얼굴 붉은기 없애기" | the redness axis, and where the product refuses to claim |
| 성분 읽는 법 | "화장품 성분 순서" | `lib/ingredients.ts` roles |
| 2주 뒤 확인하기 | "스킨케어 효과 기간" | the check-in loop's own premise |

**The middle column is what a person types, not what the page may promise.** Two of
those queries ask for a treatment outcome, and the page titles deliberately do not
answer them in those terms: 모공이 넓어 보이는 이유 explains what the camera can and
cannot see, it does not teach 모공 줄이는 법. A guide page that answered the query as
asked would be a 의료기기법 problem on an indexed url, which is worse than the same
sentence on a screen nobody found. Every page passes `efficacyClean()`, and a page that
cannot be written without failing it does not get written.

**Cost:** ~2 days to build the route + 1 day per page of honest copy.
**Time to signal:** 8-12 weeks. Search is slow and that is the trade for it being free.
**Kill criteria:** if after 12 weeks with pages indexed (confirm in Search Console, not
by assuming) the guide route brings fewer than 200 sessions/month, the language defect
(item 2) is the cause rather than the copy, and the decision is to fix routing or to
stop spending on search.
**Opportunity cost:** this is 5-8 days that do not go into the ML gate or the model.
Given the revenue line reads $0 and the ML work has been the last twenty cycles, that
trade is worth making.

## Channel 2 — Referral. Already built, never measured

The share loop exists: `share_clicked` on the sending side, `share_landed` on the
receiving side, `viralActivation` as the ratio.

**It cannot currently be computed, and that is not a bug in the metric.** The sender's
event is in the sender's browser and the receiver's is in the receiver's, both in
`localStorage`, and `/ops` reads one browser. No store anywhere has ever held both
halves. Server-side collection exists (`/api/funnel`) but the flush flag
`NEXT_PUBLIC_FUNNEL_FLUSH` is off pending an owner decision recorded in
`docs/funnel-flush-design.md` §5.

So the referral channel's only instrument is waiting on a privacy decision. **Until
that decision is made, every change to the share surface is unmeasurable**, and the
correct thing is to make no more of them rather than to make them blind.

**The owner decision, stated so it can be taken:** turning on `NEXT_PUBLIC_FUNNEL_FLUSH`
sends already-collected, redacted, non-identifying funnel events to ARU's own server.
It adds no new field. Until it is on, ARU is a product whose owner cannot see whether
anyone uses it.

## Channel 3 — App store. Copy exists, keywords do not

`docs/play-store/listing-ko.md` and `listing-en.md` already hold the listing copy, and
the release checklist is in the same directory. What is missing is the keyword decision,
which is different from the description:

- Play ranks on the **title and short description** far more than the long one, so
  the title should carry the query rather than only the brand.
- **진단 must not be the word.** Guardrail 3 rules out a diagnosis claim in any
  language, and a store title is the most public place ARU could make one. Something
  like `아루 ARU - 카메라로 보는 피부 기록` keeps the query intent without the claim.
  의료기기법 and Play's separate health policy both need reading before any title
  ships; `docs/play-store/content-rating.md` is where that answer belongs.
- Store listing is **blocked on the owner account** anyway (Play Console identity,
  payment profile, App Signing — see BLOCKERS in `docs/AUTOPILOT.md`).

## What the loop can do next, in order

1. **Per-language urls.** First, because it is the binding constraint: Korean
   content at a url whose server-rendered copy is English cannot rank for a Korean
   query, so building the guide route ahead of this would be building it twice.
   Bigger than it looks — routing, metadata, the language switcher, every internal
   link.
2. **The `/guide/[topic]` route.** The largest unbuilt surface once there is a
   Korean url to put it at. Entirely code, no owner dependency.
3. **Raise the basket.** Two items instead of one halves every traffic requirement in
   the model. A product decision about the recommendation's integrity, not a
   mechanical change — see Gap 3 in `docs/revenue-design.md`.
4. **The reminder email's link.** It goes to `/checkin`. After the repurchase fix,
   `/checkin` can convert — but the email is the surface where an unwanted commercial
   link costs the most trust, so this one is worth doing carefully or not at all.

## What only the owner can do

Unchanged from `docs/AUTOPILOT.md`, repeated because the plan above is worth nothing
without the first item:

- **Sign up for the affiliate programmes.** Every out-click earns exactly $0 today,
  including every one the repurchase fix will now generate. Nothing else in this
  document matters until this is done.
- **Decide `NEXT_PUBLIC_FUNNEL_FLUSH`**, or accept that the funnel stays invisible.
- **Brand-side revenue**, which is the only architecture that reaches $10,000/month at
  traffic ARU could plausibly have.
- **Post anything.** The loop can build the surfaces. It cannot be a person on
  Instagram, and a K-beauty product with no human voice in Korean beauty communities
  is missing the channel most like its actual audience.
