# First-load JavaScript on the path to the first merchant link

Measured 2026-09-30 (cycle 60) on `ba67ed0`, `next build` with Next.js 16.2.9 and
Turbopack. The path cycle 50 measured at 4 screens and 6 taps is `/` → `/survey` →
`/report` → `/care`, plus `/scan`; every figure below is for one of those five routes.

Turbopack prints no first-load column, so the numbers come from the prerendered HTML,
which is the method cycle 40 used when it moved ja/zh/ar behind a dynamic `import()`.
Two things this cycle adds to that method: the `noModule` tag, and a browser run that
checks the HTML-derived set against what Chromium actually fetches.

## The commands

Run from the repository root. Both read `.next`, so `npm run build` first.

```sh
npm run build

# (1) Cycle 40's method: every <script src> in the prerendered HTML, raw bytes
#     summed and each file gzipped at level 9 and summed.
for page in index survey scan report care; do
  h=".next/server/app/$page.html"
  files=$(grep -o 'src="/_next/static/[^"]*\.js"' "$h" \
    | sed 's|src="/_next/|.next/|; s|"$||' | sort -u)
  n=$(printf '%s\n' "$files" | wc -l)
  raw=$(cat $files | wc -c)
  gz=0; for f in $files; do gz=$((gz + $(gzip -9 -c "$f" | wc -c))); done
  echo "$page scripts=$n raw=$raw gzip=$gz"
done

# (2) The same set with every noModule tag dropped, which is what a browser
#     that supports ES modules actually downloads.
for page in index survey scan report care; do
  h=".next/server/app/$page.html"
  files=$(grep -o '<script src="/_next/static/[^"]*\.js"[^>]*>' "$h" \
    | grep -v noModule \
    | sed 's|.*src="/_next/|.next/|; s|\.js".*|.js|' | sort -u)
  n=$(printf '%s\n' "$files" | wc -l)
  raw=$(cat $files | wc -c)
  gz=0; for f in $files; do gz=$((gz + $(gzip -9 -c "$f" | wc -c))); done
  echo "$page scripts=$n raw=$raw gzip=$gz"
done

# (3) Per-route chunk listing, largest first, with the noModule one marked.
for page in index survey scan report care; do
  echo "=== $page ==="
  grep -o '<script src="/_next/static/[^"]*\.js"[^>]*>' ".next/server/app/$page.html" \
  | while read -r tag; do
      f=$(echo "$tag" | sed 's|.*src="/_next/|.next/|; s|\.js".*|.js|')
      nm=""; echo "$tag" | grep -q noModule && nm=" NOMODULE"
      printf "%7s %7s %s%s\n" "$(wc -c < "$f")" "$(gzip -9 -c "$f" | wc -c)" \
        "$(basename $f)" "$nm"
    done | sort -rn
done
```

## What the browser downloads

Command (2). `scripts` counts files, `raw` is their summed bytes, `gzip` is each
gzipped at level 9 and summed.

```
index scripts=12 raw=672119 gzip=201102
survey scripts=12 raw=667597 gzip=200355
scan scripts=13 raw=720028 gzip=218841
report scripts=13 raw=714373 gzip=215103
care scripts=12 raw=678806 gzip=203251
```

Command (1), cycle 40's figures for comparison against its **783030** raw /
**240097** gzipped for `/`:

```
index scripts=13 raw=784713 gzip=240494
survey scripts=13 raw=780191 gzip=239747
scan scripts=14 raw=832622 gzip=258233
report scripts=14 raw=826967 gzip=254495
care scripts=13 raw=791400 gzip=242643
```

`/` reads **784713** raw / **240494** gzipped on cycle 40's method against its
**783030** / **240097**, so twenty cycles of product work moved `/` by **1683** raw
bytes. The split cycle 40 made still holds: the ja, zh and ar dictionary chunks
(`2ju8yzfndwcag.js` **91733** raw / **29230** gzip, `1v0h5r-biq8qi.js` **77159** /
**27187**, `3v8lhb0_stdmj.js` **100349** / **29691**) are referenced from no
prerendered HTML at all.

### The gap between the two tables is one `noModule` chunk

`0cz1d0mv5g_q7.js`, **112594** raw / **39392** gzipped, is tagged `noModule` in every
one of the five documents, so a browser that supports ES modules skips it. The
container's Chromium did skip it on all ten rows of the run below; that is the only
browser this was measured in. Cycle 40's method counted it, so cycle 40's **1050358** →
**783030** raw and **322373** → **240097** gzipped for `/` are each **112594** raw and
**39392** gzip larger than what that browser fetched. The saving cycle 40 measured is
unaffected: the chunk is on both sides of it.

This is a correction to the measurement, not to the product, and there is nothing here
to fix. Dropping the chunk would save a modern browser nothing, because it never asks
for it, and would take away the only thing it is there for.

### Checked against Chromium, not only against the HTML

A throwaway Playwright run at 360x800 loaded each route on `npx next start`, recorded
every script response, and split them into the ones the document itself references and
the ones that arrive later. Two storage states: `empty` (a first-time visitor) and
`aru.lang=ko`.

```
[first-load] empty / url=/ lang=en docScripts=13 downloadedFromDoc=12 raw=672119 gzip=201102 | extraAfter=3 extraRaw=138027 extraGzip=46986
[first-load] empty /survey url=/survey lang=en docScripts=13 downloadedFromDoc=12 raw=667597 gzip=200355 | extraAfter=3 extraRaw=142549 extraGzip=47733
[first-load] empty /scan url=/scan lang=en docScripts=14 downloadedFromDoc=13 raw=720028 gzip=218841 | extraAfter=1 extraRaw=47320 extraGzip=14997
[first-load] empty /report url=/survey lang=en docScripts=14 downloadedFromDoc=13 raw=714373 gzip=215103 | extraAfter=4 extraRaw=185347 extraGzip=61983
[first-load] empty /care url=/care lang=en docScripts=13 downloadedFromDoc=12 raw=678806 gzip=203251 | extraAfter=3 extraRaw=138027 extraGzip=46986
[first-load] ko / url=/ lang=ko docScripts=13 downloadedFromDoc=12 raw=672119 gzip=201102 | extraAfter=3 extraRaw=138027 extraGzip=46986
[first-load] ko /survey url=/survey lang=ko docScripts=13 downloadedFromDoc=12 raw=667597 gzip=200355 | extraAfter=3 extraRaw=142549 extraGzip=47733
[first-load] ko /scan url=/scan lang=ko docScripts=14 downloadedFromDoc=13 raw=720028 gzip=218841 | extraAfter=1 extraRaw=47320 extraGzip=14997
[first-load] ko /report url=/survey lang=ko docScripts=14 downloadedFromDoc=13 raw=714373 gzip=215103 | extraAfter=4 extraRaw=185347 extraGzip=61983
[first-load] ko /care url=/care lang=ko docScripts=13 downloadedFromDoc=12 raw=678806 gzip=203251 | extraAfter=3 extraRaw=138027 extraGzip=46986
```

Three readings out of that:

- `downloadedFromDoc` is `docScripts` minus **1** on all ten rows, and the `raw` /
  `gzip` pairs are byte-identical to command (2)'s table. The one file skipped every
  time is the `noModule` chunk. So command (2) is the number, and command (1) is not.
- `ko` and `empty` download the same bytes on every route. Korean needs no dictionary
  and English is a static import, so the product's own market pays the English
  dictionary and gains nothing for its own language. `lang=en` under `empty` and
  `lang=ko` under `ko` confirm the two states really differed.
- `/report` on an empty storage state reports `url=/survey`: with no stored result it
  redirects. The bytes above are `/report`'s own document, fetched before the redirect,
  which is what a visitor who lands on `/report` pays. `extraAfter` is the app router
  prefetching linked routes after hydration, not first-load weight, which is why it is
  reported separately.

## The three largest chunks, and what is in them

The top three are the same three files on all five routes, and they are the shared
framework plus the English dictionary. Ranked by what the browser downloads, so the
`noModule` chunk is excluded:

| Rank | Chunk | Raw | Gzip -9 | What is in it |
|---|---|---|---|---|
| 1 | `0i7h8_tk58lvw.js` | 232787 | 72373 | React and react-dom. `grep -o -F react-dom` **1** hit, `createRoot` **2**, `useMemo` **13**, `Fragment` **8**. |
| 2 | `11oof8oxnxiv9.js` | 141598 | 38480 | The Next.js app-router client. `Router` **33** hits, `prefetch` **49**. |
| 3 | `39680g4crf4zr.js` | 82569 | 28307 | The English dictionary. `Turn camera back on` **1** hit; the ja, zh and ar equivalents **0** each. |

Excluded from the ranking, for the reason above: `0cz1d0mv5g_q7.js`, **112594** raw /
**39392** gzip, `noModule`, the legacy-browser polyfill bundle.

Full listing from command (3). The first four rows repeat on every route; the rest is
route-specific.

```
=== index ===
 232787   72373 0i7h8_tk58lvw.js
 141598   38480 11oof8oxnxiv9.js
 112594   39392 0cz1d0mv5g_q7.js NOMODULE
  82569   28307 39680g4crf4zr.js
  54646   12790 14mrh2-p_w84d.js
  47320   14997 0o58hq7nka77u.js
  44839    9251 1_0v6exngdege.js
  26822    7679 0sdh970j0a0j2.js
  16297    6253 09oqqu326ru_y.js
  10580    4184 turbopack-1c5574_5xd1nf.js
   6985    3119 3cf7fe4q3-pqz.js
   6645    2995 24bbyjt67nb7l.js
   1031     674 1iduk616orw9g.js
=== survey ===
 232787   72373 0i7h8_tk58lvw.js
 141598   38480 11oof8oxnxiv9.js
 112594   39392 0cz1d0mv5g_q7.js NOMODULE
  82569   28307 39680g4crf4zr.js
  54646   12790 14mrh2-p_w84d.js
  44839    9251 1_0v6exngdege.js
  42798   14250 10ajzjvbtk999.js
  26822    7679 0sdh970j0a0j2.js
  16297    6253 09oqqu326ru_y.js
  10580    4184 turbopack-1c5574_5xd1nf.js
   6985    3119 3cf7fe4q3-pqz.js
   6645    2995 24bbyjt67nb7l.js
   1031     674 1iduk616orw9g.js
=== scan ===
 232787   72373 0i7h8_tk58lvw.js
 141598   38480 11oof8oxnxiv9.js
 112594   39392 0cz1d0mv5g_q7.js NOMODULE
  82569   28307 39680g4crf4zr.js
  62927   20105 0nbqz_u5xt-55.js
  54646   12790 14mrh2-p_w84d.js
  44839    9251 1_0v6exngdege.js
  32302   12631 2rkq86eu5t2oh.js
  26822    7679 0sdh970j0a0j2.js
  16297    6253 09oqqu326ru_y.js
  10580    4184 turbopack-1c5574_5xd1nf.js
   6985    3119 3cf7fe4q3-pqz.js
   6645    2995 24bbyjt67nb7l.js
   1031     674 1iduk616orw9g.js
=== report ===
 232787   72373 0i7h8_tk58lvw.js
 141598   38480 11oof8oxnxiv9.js
 112594   39392 0cz1d0mv5g_q7.js NOMODULE
  82569   28307 39680g4crf4zr.js
  55225   19345 05nl_w77jzrvo.js
  54646   12790 14mrh2-p_w84d.js
  44839    9251 1_0v6exngdege.js
  34349    9653 0wlj7989kv-6o.js
  26822    7679 0sdh970j0a0j2.js
  16297    6253 09oqqu326ru_y.js
  10580    4184 turbopack-1c5574_5xd1nf.js
   6985    3119 3cf7fe4q3-pqz.js
   6645    2995 24bbyjt67nb7l.js
   1031     674 1iduk616orw9g.js
=== care ===
 232787   72373 0i7h8_tk58lvw.js
 141598   38480 11oof8oxnxiv9.js
 112594   39392 0cz1d0mv5g_q7.js NOMODULE
  82569   28307 39680g4crf4zr.js
  54646   12790 14mrh2-p_w84d.js
  54007   17146 1lid53sf9e4no.js
  44839    9251 1_0v6exngdege.js
  26822    7679 0sdh970j0a0j2.js
  16297    6253 09oqqu326ru_y.js
  10580    4184 turbopack-1c5574_5xd1nf.js
   6985    3119 3cf7fe4q3-pqz.js
   6645    2995 24bbyjt67nb7l.js
   1031     674 1iduk616orw9g.js
```

## Is anything worth moving behind a dynamic `import()`

The bar this cycle was given: a module a route ships on first load but does not render
or run before the first user action, and **≥ 20 KB gzipped** — 20480 bytes — on one of
the five routes. Nothing clears it. No product code changed this cycle.

Reading the listing above, exactly four first-load files anywhere on the path are
≥ 20480 bytes gzipped, and every one of them is accounted for:

- **`0i7h8_tk58lvw.js`, 72373 gzip — React and react-dom.** Runs at hydration, before
  any user action. Not movable.
- **`11oof8oxnxiv9.js`, 38480 gzip — the app-router client.** Same.
- **`0cz1d0mv5g_q7.js`, 39392 gzip — the `noModule` polyfill.** Not downloaded by the
  browser that was measured, so moving it saves nothing. See above.
- **`39680g4crf4zr.js`, 28307 gzip — the English dictionary.** It *is* rendered before
  the first action: `getServerSnapshot()` in `lib/i18n.tsx` returns `"en"`, so the
  server HTML is English and the hydration render has to match it. Out of scope by
  instruction as well: it needs the per-locale URL decision, which is the owner's.

The largest route-specific file on the whole path is `/scan`'s `0nbqz_u5xt-55.js` at
**62927** raw / **20105** gzipped, which is **375** bytes short of the 20480-byte bar as
a *whole chunk*, and it holds several modules (`getUserMedia` **2** hits, `landmark`
**8**, `consent` **4**), so no single module inside it is close. Next after that is
`/report`'s `05nl_w77jzrvo.js` at **19345** gzip, then `/care`'s `1lid53sf9e4no.js` at
**17146**.

Two candidates were checked by name because they are the obvious ones and both turned
out to be handled already:

- **`html-to-image`** is already lazy. `app/components/share-card.tsx:62` is
  `const { toPng } = await import("html-to-image");`, inside the share handler.
- **`@mediapipe/tasks-vision`** is already lazy. `app/scan/create-landmarker.ts:6` is
  `const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");`.

One genuine "ships but does not run until a tap" module exists and is too small to
qualify: **`lib/skin.ts`**, the analysis runtime, **67485** bytes of source. It reaches
`/scan` through `app/scan/use-capture-analysis.ts:13`-`18` and `/report` through
`app/report/page.tsx:14`, and nothing in it runs until the visitor captures a frame.
Grepping its `CHEEKS` landmark array
(`50,101,118,117,116,205,36,280,330,347,346,345,425,266`) across the build puts it in
`2rkq86eu5t2oh.js` on `/scan` and `05nl_w77jzrvo.js` on `/report` — chunks whose
**whole** gzipped size is **12631** and **19345** bytes. So `lib/skin.ts` is under the
bar on both routes even counting the rest of its chunk as if it were all `lib/skin.ts`.
Moving it would also sit inside `/scan`'s capture path, which this cycle was told not
to disturb.

## What this does not establish

- **No bytes-over-the-wire figure.** Every `gzip` number here is `gzip -9` over the
  file on disk, summed per route, which is cycle 40's method and is comparable with it.
  It is not what `next start` puts on the socket, and it is not Brotli, which a real
  CDN would serve.
- **No time.** Nothing here measures parse, compile, or time-to-interactive, on this
  container or on the mid-range phone the backlog item is about. Weight is a proxy.
- **One run each.** Command (1)–(3) are deterministic over a fixed `.next`, but the
  build behind them ran once, and the Playwright run ran once per route per state. No
  figure carries a variance estimate.
- **Five routes, one viewport, one browser.** 360x800, the container's Chromium. Only
  the five routes named at the top were measured; every other prerendered route —
  `/checkin`, `/privacy`, `/reco`, `/studio`, the two `/guide/*` pages, and the
  research-mode `/eval`, `/ops` and `/pilot` — was not, and neither was any route under
  a real network profile.
- **No per-module attribution inside a chunk.** The chunk totals are exact; the claim
  "no single module in this chunk is ≥ 20 KB gzipped" is bounded by the chunk total
  rather than measured module by module. Turbopack emits no module ids into the output
  (`grep -o '\[project\]/[^ "]*'` over the four largest chunks returns nothing), so a
  per-module breakdown would need a different tool than this cycle had.
- **No regression test.** There is no ceiling pinned in the gate, because nothing
  changed and a ceiling on a number nobody moved would be a new contract rather than a
  guard on this cycle's work. That is left open in the backlog.
