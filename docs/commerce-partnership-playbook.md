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

Example:

```json
{
  "tn1": {
    "oliveyoung": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=PARTNER_GOODS_NO"
  },
  "sr2": {
    "naver-shopping": "https://smartstore.naver.com/PARTNER/products/PARTNER_PRODUCT_ID"
  }
}
```

Only HTTPS links on the allowlist are accepted:

- `www.oliveyoung.co.kr`
- `search.shopping.naver.com`
- `www.coupang.com`
- `www.google.com`

Add new partner domains to `lib/commerce.ts` only after the deal and tracking
terms are clear.

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
