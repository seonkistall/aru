# Commerce Partnership Playbook

The recommendation screen is now wired for commerce validation and partner
deep-link replacement.

## Current Link Strategy

Every SKU exposes marketplace-ready links in this order:

1. Olive Young
2. Naver Shopping
3. Coupang
4. Global search

The app sends clicks through `/api/out?sku=...&merchant=...&placement=...`.
That route validates the target host, adds UTM tags, and redirects to the
configured seller link. This keeps the UX stable while business development
replaces search links with affiliate or partner deep links.

## Disclosure is a precondition, not a follow-up

Before any affiliate link goes live, the economic relationship has to be disclosed
where the recommendation is. 공정위 「추천·보증 등에 관한 표시·광고 심사지침」 requires it
next to the recommendation rather than on a policy page, and the programmes repeat it
in their own terms — 올리브영's 쇼핑 큐레이터 terms make a missing disclosure grounds for
withholding the payout and suspending the account. A disclosure added after the first
payout is refused is too late.

It is already in the product. `CommerceDisclosure` (`app/components/commerce-disclosure.tsx`)
renders next to every commerce link, and `tests/commerce-disclosure.test.ts` fails if a
new surface ships a buy link without it. It has two wordings and reads the switch below,
because ARU takes no commission today and claiming one would be its own false statement.

**Setting `COMMERCE_LINK_OVERRIDES_JSON` without `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` in
the same deploy is the failure this exists to prevent.** One is read on the server and
the other on the client, so nothing couples them automatically. Set both, then load
`/report` and confirm the line reads 제휴 링크.

## Partner Override

Use `COMMERCE_LINK_OVERRIDES_JSON` to replace default links without changing
the product recommendation code.

Example the gate accepts today:

```json
{
  "tn1": {
    "oliveyoung": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=PARTNER_GOODS_NO",
    "coupang": "https://www.coupang.com/vp/products/PARTNER_PRODUCT_ID"
  }
}
```

Only HTTPS links on the allowlist are accepted:

- `www.oliveyoung.co.kr`
- `search.shopping.naver.com`
- `www.coupang.com`
- `www.google.com`

`tests/commerce.test.ts` pins that list against `ALLOWED_HOSTS` in
`lib/commerce.ts`, and pins that every URL in the block above passes the gate.
Until 2026-09-15 this section's worked example for `naver-shopping` was a
`smartstore.naver.com` URL, which is **not** on that list — so following this
runbook exactly produced an override the code discarded without a word, while
`NEXT_PUBLIC_COMMERCE_AFFILIATE=on` told users the link earned a commission.

### Hosts a real affiliate link may need, which are NOT accepted yet

Not guesses to code around — decisions to make once the programme is signed and
the real link format is in hand. None of these were verifiable from the build
network (every Korean commerce host refuses the connection; see BLOCKERS in
`docs/AUTOPILOT.md`), so the allowlist was deliberately left alone:

| Programme | Link host the override will probably need | Status |
|---|---|---|
| 네이버 쇼핑 커넥트 | a smart-store or brand-store host, e.g. `smartstore.naver.com` | unverified, not on the allowlist |
| 쿠팡 파트너스 | a partner redirect host, e.g. `link.coupang.com` | unverified, not on the allowlist |
| 올리브영 쇼핑 큐레이터 | `www.oliveyoung.co.kr` product detail | already on the allowlist |

Adding one is a one-line change to `ALLOWED_HOSTS` in `lib/commerce.ts` plus the
bullet list above — do it when the deal and tracking terms are clear, and never
on a host nobody has seen a real link on. A rejected override is now logged with
the sku, the merchant and the URL — once per distinct value of the env var, from
`/api/out`, so it lands in the request log on the first out-click after a deploy
rather than in the deploy log itself. Check there once after setting the env, or
load `/report` and confirm the disclosure reads 제휴 링크.

## Deal Priorities

- Olive Young: strongest Korean offline/online credibility and a natural fit
  for product discovery after scan.
- Brand official mall: strongest margin and co-marketing potential, but needs
  brand-by-brand onboarding.
- Naver Shopping: useful for price comparison and official smart-store routing.
- Coupang: useful for delivery-sensitive conversion testing.
- Global search: useful for tourists and foreign users before international
  retail partnerships are signed.

## Metrics To Review Before Negotiation

- Product click-through rate by concern and category.
- Merchant click share by SKU.
- Retake/confidence effect on product clicks.
- Purchase-intent clicks after `/care`.
- Clinic clicks when redness or trouble concern is present.

## My BM View

Start with marketplace links to prove intent, then negotiate two deal types:

- Category sponsor: a seller or brand pays for high-intent placement inside a
  category such as toner, serum, or sunscreen.
- Performance partner: affiliate or CPA deal where scan result, confidence, and
  product click are attributable through `/api/out`.

Do not sell ranking purely by ad spend yet. The product moat depends on user
trust, so sponsored placements should still pass the skin-signal fit rules.
