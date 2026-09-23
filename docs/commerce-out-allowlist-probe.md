# `/api/out` was hunted for an open redirect and did not have one

2026-09-23, cycle 32. Written down because a negative result that is not recorded gets
re-hunted every few cycles, and because the two inputs that DO reach the redirect are
worth naming so a later change does not quietly widen them.

## What was tried

`app/api/out/route.ts` resolves a click to a target and redirects:

```
const override = commerceOverrideUrl(sku.id, merchant, { knownSkus: SKUS.map((item) => item.id) });
const target = override || link.href;
if (!isAllowedCommerceUrl(target)) {
  return NextResponse.json({ ok: false, reason: "blocked target" }, { status: 400 });
}
return NextResponse.redirect(addCommerceTracking(target, { sku: sku.id, merchant, placement }), { status: 302 });
```

`isAllowedCommerceUrl` is `new URL(value)`, then `url.protocol === "https:"` and
`ALLOWED_HOSTS.has(url.hostname)`. Thirty inputs were run against exactly that
predicate in node v22.22.2 — userinfo `@`, backslashes, trailing dots, ideographic full
stop, Cyrillic look-alikes, protocol-relative, `javascript:`, `data:`, tab and newline in
the host, an IPv6-shaped host, a port, and a fullwidth `ｗ`. Ten came back ALLOW and
twenty BLOCK, and every ALLOW resolved to a hostname that is genuinely on the allowlist.
Twelve of the thirty lines, chosen for the ones worth seeing:

```
BLOCK  proto=https:       host=evil.example                 "https://www.oliveyoung.co.kr@evil.example/"
BLOCK  proto=https:       host=evil.example                 "https://evil.example\\@www.oliveyoung.co.kr/"
ALLOW  proto=https:       host=www.oliveyoung.co.kr         "https://www.oliveyoung.co.kr\\@evil.example/"
BLOCK  proto=https:       host=www.oliveyoung.co.kr.evil.example "https://www.oliveyoung.co.kr.evil.example/"
BLOCK  proto=https:       host=www.oliveyoung.co.kr.        "https://www.oliveyoung.co.kr./x"
BLOCK  proto=https:       host=www.xn--liveyoung-z2h.co.kr  "https://www.оliveyoung.co.kr/x"
BLOCK  proto=-            host=(parse error)                "//www.oliveyoung.co.kr/x"
BLOCK  proto=javascript:  host=                             "javascript:alert(1)//https://www.oliveyoung.co.kr"
BLOCK  proto=http:        host=www.oliveyoung.co.kr         "http://www.oliveyoung.co.kr/x"
ALLOW  proto=https:       host=www.google.com               "https://www.google.com/search?q=a#@evil.example"
BLOCK  proto=https:       host=www.google.com.evil.example  "https://www.google.com\t.evil.example/"
ALLOW  proto=https:       host=www.google.com               "https://ｗww.google.com/"
```

No bypass. Three ALLOWs are worth knowing about and none of them is a redirect to
somebody else's host: a fullwidth `ｗ` normalises INTO `www.google.com` (IDNA, correct),
`https://user:pass@www.google.com/x` keeps credentials in a `Location` header, and
`https://www.coupang.com:8443/...` passes because the check reads `hostname` and not
`host`, so any port on an allowed host is allowed. All three can only come from
`COMMERCE_LINK_OVERRIDES_JSON`, which is a server env var the owner sets, never from a
request.

## Why the backslash case goes the safe way, from the primary source

`https://www.oliveyoung.co.kr@evil.example/` is blocked and
`https://www.oliveyoung.co.kr\@evil.example/` is allowed, and the difference is not a
node quirk. Read from the standard's own source rather than from documentation or recall
(`developer.mozilla.org` and `en.wikipedia.org` refuse this network;
`raw.githubusercontent.com` answers):

```
--- https://raw.githubusercontent.com/whatwg/url/main/url.bs
http=200 bytes=166059
sha256 eb85ab4551eec91ca0f28367ff81eabed020cebac87f98eaac7ecbba629fa5d1
```

In **host state**, the host ends at a backslash when the scheme is special, and `https`
is special:

```
     <li>
      <p>Otherwise, if one of the following is true:

      <ul class=brief>
       <li><p><a>c</a> is the <a>EOF code point</a>, U+002F (/), U+003F (?), or U+0023 (#)
       <li><p><var>url</var> <a>is special</a> and <a>c</a> is U+005C (\)
      </ul>
```

So in `...co.kr\@evil.example/` the backslash terminates the host before the `@` is ever
read, and `@evil.example` is path. In **authority state**, which runs BEFORE host state,
`@` is what ends the userinfo:

```
   <dt><dfn export for="basic URL parser" id=authority-state>authority state</dfn>
   <dd>
    <ol>
     <li>
      <p>If <a>c</a> is U+0040 (@), then:
```

so in `...co.kr@evil.example/` everything left of the `@` is credentials and the host is
`evil.example`. Both outcomes are the safe one for an exact-match allowlist, and both are
properties of the parser rather than of this code — which is the reason the check is
written against `url.hostname` and not against the string.

## The one user-controlled value that reaches the redirect

`placement` is a query parameter, is not validated, and is echoed into `utm_content` on
the outbound URL. It cannot break out, because `URLSearchParams.set` percent-encodes on
serialisation:

```
"a\r\nSet-Cookie: x=1" -> https://www.coupang.com/np/search?q=a&utm_content=a%0D%0ASet-Cookie%3A+x%3D1_sku_merchant
"a b&utm_source=evil"  -> https://www.coupang.com/np/search?q=a&utm_content=a+b%26utm_source%3Devil_sku_merchant
```

No CRLF into the header, no extra parameter, no fragment. `sku` and `merchant` never
reach the target at all: both are looked up in `SKUS` first and an unknown value is a 404
before any URL is built.

## What this does not cover

Only the predicate and the parameters. It says nothing about whether the allowlisted
hosts are the right ones, nothing about the 404 and 400 JSON bodies a click can land on
(they are dead ends for a user, and neither is reachable from a link the app renders,
since every href is built from the same catalogue the route resolves against), and
nothing about what a merchant does with the URL after the redirect.
