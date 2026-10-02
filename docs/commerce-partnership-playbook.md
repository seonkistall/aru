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

## Switch-on checklist, verified hosts

Researched 2026-10-01 (cycle 63). The question this answers: when the owner pastes a real
tracking link into `COMMERCE_LINK_OVERRIDES_JSON`, does `isAllowedCommerceUrl()` accept it,
or does `/api/out` discard it and keep serving the search URL? Cycle 58 proved on a
production server that an override on a non-allowlisted host is dropped, so getting the host
wrong costs the first links' earnings until someone reads the request log.

**No primary source was reachable.** Every programme's own documentation refuses this
container's fetch channel as well as its curl channel — `partners.coupang.com`,
`m.oliveyoung.co.kr`, `www.ftc.go.kr`, `www.korea.kr`, `www.kfcf.or.kr`, `www.shinkim.com`,
`www.kimchang.com`, `csafety.kakao.com` and `aisum.com` each returned
`Access to <host> is blocked by the network egress proxy.` So nothing below is **VERIFIED**
in the sense of quoted from the programme's own page; the rows say **REPORTED** where a
third-party source states it and **UNKNOWN** where none did. Nothing here is a guess.

| Programme | Link host the issued link uses | Status | Source |
|---|---|---|---|
| 쿠팡 파트너스 | `link.coupang.com` (path `/a/<code>`) | **REPORTED** | Search result for `쿠팡 파트너스 추천 링크 link.coupang.com 단축 URL 형식`: "쿠팡 파트너스에서 생성하는 단축 링크의 형식은 `link.coupang.com/a/...` 입니다" — and a live link in the wild, [`https://link.coupang.com/a/edxLBC`](https://www.threads.com/@moneysaessak/post/DWc3YvPCYLM/) |
| 쿠팡 파트너스 (after redirect) | `www.coupang.com` with `?lptag=<id>` | **REPORTED** | [tali.kr, 쿠팡 파트너스 제휴 링크와 앱 바로가기의 작동 원리](https://tali.kr/coupang-app-links): the server sets a cookie "`trac_lptag`" then "실제 상품페이지로 리다이렉트합니다", and the final URL carries "`?lptag=EXAMPLEID88`" |
| 올리브영 쇼핑 큐레이터 | **UNKNOWN** — the programme's own surfaces are on `m.oliveyoung.co.kr` (`/m/mtn/affiliate/guide`, `/dashboard`, `/withdraw`), but no source states the host of the issued 상품 링크 | **UNKNOWN** | [올리브영 쇼핑 큐레이터 활동 가이드](https://m.oliveyoung.co.kr/m/mtn/affiliate/guide) (URL returned by search; page itself unreachable). Sources describe only "[상품 링크 생성] 버튼을 통해 발급" and "개인별 고유 URL이 발급" — never the host |
| 네이버 쇼핑 커넥트 | **UNKNOWN** | **UNKNOWN** | [wplaybook.com](https://wplaybook.com/naver-shopping-connect-guide/) and others describe "링크 발급 버튼으로 나만의 고유 링크", "상품 하나당 링크는 1개만 발급", and that "상품 페이지의 URL을 그대로 복사해서 홍보하면 수익이 인정되지 않습니다" — no source names the host |

So the playbook's earlier guess table was right about Coupang and should not be trusted for
the other two: `smartstore.naver.com` for 네이버 is still nobody's observation, and
`www.oliveyoung.co.kr` is **not** established as the curator link's host either — the
curator pages themselves are on `m.oliveyoung.co.kr`, which is not on the allowlist.

### The one-line `ALLOWED_HOSTS` diff per host — a proposal, not a change

`lib/commerce.ts` is untouched by this cycle and an allowlist change is the owner's. For
each host, this is the exact edit to approve, inside `const ALLOWED_HOSTS = new Set([...])`
at `lib/commerce.ts:24`:

| Host | Approve when | Exact line to add |
|---|---|---|
| `link.coupang.com` | the owner has a real 파트너스 link and it starts with `https://link.coupang.com/` | `  "link.coupang.com",` |
| `m.oliveyoung.co.kr` | the owner generates one curator link and it is on `m.` rather than `www.` | `  "m.oliveyoung.co.kr",` |
| 네이버 커넥트 host | the owner generates one 커넥트 link and reads its host off the clipboard | `  "<the host the real link uses>",` |

`www.oliveyoung.co.kr` is already in the Set, so an Olive Young link on `www.` needs no
change at all. Each added line also needs the bullet list in **Partner Override** above
extended to match, because `tests/commerce.test.ts` pins that list against `ALLOWED_HOSTS`.

**Do not add a host nobody has seen a real link on.** The allowlist is what keeps
`/api/out` from being an open redirect, and two of the three rows above are UNKNOWN.

### A second failure mode, which the allowlist does not cover

`addCommerceTracking()` (`lib/commerce.ts:111`) appends four `utm_*` parameters to whatever
URL the override supplies. Two programmes are reported to refuse credit for a modified
link: 올리브영's guide, as quoted by third parties, says "발급된 상품 링크를 임의로 수정하면
정상 추적이 불가능하므로 수정하지 말아야 합니다", and 네이버's that a copied product URL
"수익이 인정되지 않습니다". Whether adding a query parameter counts as 수정 is **UNKNOWN** and
cannot be settled from here. If it does, the owner's links will be accepted by the gate,
redirect correctly, and still earn $0 — the same silent-zero failure as a wrong host, one
layer further in. It is in BLOCKERS in `docs/AUTOPILOT.md`; the fix would be a change to
`lib/commerce.ts`, which needs the owner.

Also reported and worth knowing before negotiating: 올리브영 credits a purchase made
"링크 클릭 후 24시간 내" ([afterwork30.com](https://afterwork30.com/affiliate/oliveyoung-shopping-curator-review)),
and 쿠팡's `trac_lptag` cookie is reported to last 24 hours too (tali.kr, above). A scan →
`/report` → merchant hop happens in one session, so neither window is a constraint on ARU's
funnel.

## Before you deploy: `npm run affiliate:check`

The dry run below proves the switch-on works on *invented* overrides. This answers the
other question, on the owner's real ones, before anything is deployed: **what will
`/api/out` actually send a visitor to, for each override in
`COMMERCE_LINK_OVERRIDES_JSON`?** Three ways that answer is "not what you pasted", and
every one of them is silent in production — the link still works, the disclosure still
says 제휴 링크, and the only trace is a line in a request log nobody reads:

- the host is not on the allowlist, so the override is dropped and the search url is served
  (cycle 58 proved this on a production server);
- the sku id or merchant key is misspelled, so the lookup never matches;
- `addCommerceTracking()` appends four `utm_*` parameters, so the visitor does not land on
  the issued tracking link — see the `utm_*` item in BLOCKERS in `docs/AUTOPILOT.md`.

`scripts/check-affiliate-overrides.mjs` imports `auditCommerceOverrides`,
`commerceOverrideUrl`, `addCommerceTracking` and `describeCommerceOverrideIssue` from
`lib/commerce.ts`, and the sku ids from `lib/skus.ts`, rather than copying the allowlist or
the tracking — a copy would pass this check and still be wrong. It reads
`COMMERCE_LINK_OVERRIDES_JSON` from the environment, or from a file path given as the first
argument. It is read-only, it exits non-zero unless every override resolves, and **it never
fetches a url**, so running it cannot register a click with any programme.

```
$ npm run affiliate:check -- overrides.json
affiliate:check — the same functions /api/out uses, no network request.
source:    overrides.json
placement: report_summary
catalogue: 22 sku ids from lib/skus.ts

What the deployed server writes to its log, verbatim:
  [commerce] override for tn1/coupang ignored: the URL is not an https URL on the allowlist (www.oliveyoung.co.kr, search.shopping.naver.com, www.coupang.com, www.google.com) (https://link.coupang.com/a/dryrun). The link is still a search URL.

tn1/oliveyoung  ACCEPTED
  supplied: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000
  redirect: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000&utm_source=kbeauty_ai_camera&utm_medium=commerce_link&utm_campaign=skin_scan_recommendation&utm_content=report_summary_tn1_oliveyoung
  WARNING:  ARU appended tracking parameters, so a visitor does NOT land on the url
            you supplied. 올리브영 and 네이버 are reported to refuse credit for a
            modified link, which would earn $0 with nothing visibly wrong. See
            the BLOCKERS item "Whether ARU's own `utm_*` parameters break affiliate attribution" in docs/AUTOPILOT.md.

tn1/coupang  IGNORED — the URL is not an https URL on the allowlist (www.oliveyoung.co.kr, search.shopping.naver.com, www.coupang.com, www.google.com)
  supplied: https://link.coupang.com/a/dryrun
  redirect: none — /api/out keeps the marketplace search url for this merchant.

1 accepted, 1 ignored, 1 with appended tracking parameters.
An ignored override is not an error at runtime: /api/out falls back to the search url
and only the server log says so. Fix every ignored row before deploying.
```

That run exits **1**. The `overrides.json` it read carried the two pairs the dry run uses,
with the same invented ids (`DRYRUN000000`, `/a/dryrun`) — so the output above is what the
owner would see after pasting a real 파트너스 link today, one sku accepted and the 쿠팡 one
dropped until `link.coupang.com` is approved onto `ALLOWED_HOSTS`.

Three exit conditions, so a pre-deploy step cannot pass by accident: non-zero if any
override is ignored, non-zero if the JSON does not parse (every override is lost, which
must not read the same as "none set"), and non-zero when nothing is configured at all —
a correct state to ship, but never a successful switch-on check. `--placement=<name>`
changes only `utm_content`; the default `report_summary` is what `/report` passes for the
top pick. `tests/affiliate-check-script.test.ts` runs the script in a child process and
asserts both the printed urls and the exit codes.

## Switch-on dry run

The two-variable deploy above is no longer something only the owner will ever run.
`tests/e2e/commerce-switch-on.spec.ts` performs it on a production server on every run of
the gate: `playwright.mobile.config.ts` starts a second `next build` + `next start` whose
environment carries both variables, with an override for `tn1`/`oliveyoung` on
`www.oliveyoung.co.kr` and a second one for `tn1`/`coupang` on `link.coupang.com`, which is
not on the allowlist. The spec then asserts what a click does. The `/report` pick's link answers **302** to
`https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000&utm_source=kbeauty_ai_camera&utm_medium=commerce_link&utm_campaign=skin_scan_recommendation&utm_content=report_product_tn1_oliveyoung`;
the 쿠팡 pair still lands on `www.coupang.com/np/search`; the server's own log carries
`[commerce] override for tn1/coupang ignored: ... (https://link.coupang.com/a/dryrun). The
link is still a search URL.`; and the disclosure reads the 제휴 sentence in `ko` and `en`
with the no-commission sentence gone from both surfaces. Both override URLs are invented —
`DRYRUN000000` is not a goods number and `/a/dryrun` is not a partner link — and no
assertion ever follows a redirect, so no request leaves the container.

It is a live check, not a formality. Dropping `NEXT_PUBLIC_COMMERCE_AFFILIATE` from that
server's environment failed **3** of the spec's **6** tests, making `/api/out` discard the
overrides it resolves failed **1**, and putting `link.coupang.com` on `ALLOWED_HOSTS`
failed **2**; each break was reverted and the allowlist is unchanged. Run it on its own
with `npx playwright test --config playwright.mobile.config.ts --project commerce-switch-on`.

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
