# ARU

**A 30-second, on-device skin scan that honestly picks your K-beauty routine.**

ARU is a mobile-first web app. It combines an optional on-device camera reading
with a short questionnaire, then proposes up to three K-beauty product
candidates and a morning/evening routine that fit the user's preferences,
budget and context — no account required.

The camera result describes cosmetic tendencies visible in the current photo.
It is **not** a medical diagnosis, treatment, or condition monitor. The whole
recommendation flow can also be completed with the questionnaire alone.

- **Live:** <https://aru-beauty.vercel.app>
- **Demo video (3 min):** <https://youtu.be/oc-ccLo-yn0>
- **OpenAI Build Week (Apps for Your Life):** [submission pack](docs/buildweek/SUBMISSION.md) · [build log](BUILDLOG.md) · [user research](docs/buildweek/user-research.md) · demo scripts ([EN](docs/buildweek/DEMO-SCRIPT.md) / [KO](docs/buildweek/DEMO-SCRIPT-KO.md))
- **한국어 문서:** [README.ko.md](README.ko.md) (full Korean documentation)
- Product contract and KPIs: [docs/PRD.md](docs/PRD.md)
- Current verified state: [docs/STATUS.md](docs/STATUS.md)
- System architecture: [docs/architecture.md](docs/architecture.md)
- Release procedure: [docs/production-release-checklist.md](docs/production-release-checklist.md)
- Continuous improvement loop: [docs/AUTOPILOT.md](docs/AUTOPILOT.md) (cycle protocol, guardrails, backlog)
  — closed history is split out into [docs/autopilot-changelog.md](docs/autopilot-changelog.md)
- Tone / ITA, checked against outside references: [docs/tone-ita-verification.md](docs/tone-ita-verification.md)
  (what `toneIta` is worth, and what it is not — it is the only tone stratifier the
  fairness gate uses)
- What ITA reads when b\* is near zero: [docs/ita-guard-decision.md](docs/ita-guard-decision.md)
  (three implementations guarded the singularity in two places and the ±90 fallback
  ignored the sign of b\*; the guard is now `b* == 0` in all three)
- Capture-resolution invariance of the ROI indices:
  [docs/capture-resolution-invariance.md](docs/capture-resolution-invariance.md)
  (`blemishDensity` was resolution-dependent; the blemish *count* still is)
- What a scan costs and where the time goes:
  [docs/scan-cost-measurement.md](docs/scan-cost-measurement.md)
  (`detectBlemishes` is 79-87% of it; measured on the build container, which is not a
  phone, and the document says so at length)
- `rgbToLab` across the language boundary, and what the `a*` fast path actually buys:
  [docs/rgb-to-lab-parity.md](docs/rgb-to-lab-parity.md)
  (the two languages agree bit for bit on 63-80% of 268,877 inputs and differ by at most
  1.47 units of `channelScale * 2^-52`, which is where the parity table's first
  tolerance comes from; the sRGB transfer curve, not the rest of Lab, is 37-61% of
  `detectBlemishes`)
- How far `a*` can move before `blemishCount` does, and what that rules out:
  [docs/blemish-perturbation-tolerance.md](docs/blemish-perturbation-tolerance.md)
  (below 1.046e-5 a\* units nothing can change the count; a 256-entry lookup table for
  the transfer curve is off by 0.470 and moves it from 6 to 7, so the curve stays. §7:
  the margin each count is actually decided by — 1.2e6 to 3.2e8 times the detector's own
  rounding error on a realistic frame, and exactly zero on a noiseless one)
- Why `/checkin`'s answer controls are 44px both ways, measured in a browser at 360px:
  [docs/checkin-tap-target-measurement.md](docs/checkin-tap-target-measurement.md)
  (32 of 45 controls were under the contract in five locales; every pill was 35.5px high)
- Why a run that pools two generations of the feature extractor warns instead of blocking:
  [docs/feature-generation-pooling.md](docs/feature-generation-pooling.md)
  (scikit-learn warns on a provenance mismatch and raises on a structural one, read from
  its own source; `coverage_warnings` names and counts the pooled generations, and the
  published promotion rule is untouched)
- What a card shared from `/studio` should link back to, and why no cycle picked:
  [docs/share-return-path-decision.md](docs/share-return-path-decision.md)
  (five options with what each costs; `shareUrl` is still unused because `/studio` holds
  edited copy rather than the levels `moodShareUrl` needs — an owner decision)
- Whether a returning iPhone visitor still has a saved result to return to:
  [docs/webkit-script-storage-cap.md](docs/webkit-script-storage-cap.md)
  (read from WebKit's own source, because `webkit.org` is blocked here — the widely
  quoted 7-day cap on script-writable storage is the SHORT window and a plain
  first-party site gets the 30-day one; what reaches the short window is a
  link-decorated navigation from a prevalent resource, i.e. the kind of link a paid
  campaign uses)
- Server-side funnel telemetry:
  [docs/funnel-flush-design.md](docs/funnel-flush-design.md)
  (the flush path exists and is off — `NEXT_PUBLIC_FUNNEL_FLUSH`; §8 is the ingest
  endpoint and its attacker table; read §5 before
  setting it, because a browser cannot hold the sync token)

## Current release state

This table separates finished code from external owner work. The single source
of truth for the latest detail is [STATUS](docs/STATUS.md).

| Area | Current state | Verified evidence | Next gate |
|---|---|---|---|
| Consumer Web | Product-polish production deploy + canary complete | PR #55, merge `024784c`, deployment `dpl_FCKydr4QKpM5Zh28aGrkxev6Ad8U`, full smoke and post-deploy mobile/API canary | Repeat the same gate on any code or env change |
| Security & data boundary | Production verified | RLS on 9 app tables, direct `anon`/`authenticated` privileges revoked, private crop bucket, CSP, Firewall, runtime secret validation | Re-verify on any schema or secret change |
| Mobile UI/UX | Copy regression green across locales and viewports | 9 core routes × 5 locales × 4 viewports — a 180-combination text-fit matrix plus 320px manual browser QA | Extend the same matrix for new screens or translations |
| Android camera | Galaxy S25 Edge basic flow PASS | Permission, front-camera mirroring, quality gate, capture, retake | Lighting/reflection/occlusion/background-resume plus the iPhone Safari matrix |
| iPhone Safari camera | Production WebKit lifecycle PASS, physical device PENDING | PR #60, merge `ece4617`, deployment `dpl_EZK8pi9EHAC75bZ2YwFKCBRZtLY9`; 5 lifecycle regressions (background, `mute`, `ended`, `pagehide`, explicit resume) green on public production | Permission/lens/rotation/capture matrix on current and previous iOS Safari hardware |
| Email | Code complete; one consent question open | Explicit opt-in, signed expiring unsubscribe, withdrawal exclusion from the send query, retention-cleanup tests | Real delivery, unsubscribe and cron verification on a verified domain — and an owner decision on whether a repeat opt-in POST may re-consent an address that unsubscribed, which today it does ([decision doc](docs/reengage-resubscribe-consent-decision.md)) |
| Android TWA | API 36 signed AAB verified | Package, permissions, signing, lint `No issues found`, Gradle clean bundle, Digital Asset Links | Internal-track physical-device QA after the Play distribution certificate lands |
| Google Play | Submission pack ready, Console blocked | ko/en listings, Data safety, content rating, reviewer docs, real UI assets | Developer identity, payment account, support email, App Signing, tester track |

> A finished Web production deploy does not mean a finished Google Play launch.
> Identity, payment, distribution-certificate and test-track evidence exists
> only in the Play Console and is never guessed from this repository.

## The problem this product solves

K-beauty buyers struggle to narrow candidates quickly because of the sheer
number of products and the exaggerated language around them. ARU reduces that
problem with these principles:

- Start immediately on mobile, with no account creation.
- The camera is optional; a failure or a denial always continues into the
  questionnaire flow.
- Prioritise the quality of the T-zone and cheek skin ROIs over "is a face
  visible" checks.
- Cap recommendations at three candidates, each with its selection rationale
  and a morning/evening routine.
- Record "opened a retailer" and "actually started using" as different events.
- Never display unverified prices, stock, star ratings, review counts or
  affiliate badges.
- Block diagnosis/treatment/improvement-guarantee language; describe only
  "tendencies visible in the current photo" and questionnaire answers.

### Out of scope

- Diagnosing, treating, prescribing for, or monitoring skin conditions
- Definitive skin typing or quantitative clinical scores from a photo alone
- Funnel interpretations that appear to prove purchases or efficacy
- Uploading face/skin images or retaining training data without consent
- Commerce that directly handles accounts, payment, orders or delivery
- Unverified real-time price/stock/review aggregation

## Core user flows

### 1. Camera journey

`Home → scan permission / optional consent → skin-ROI quality gate → auto or
manual capture → review/retake → survey → report → retailers · care · share →
optional usage start / check-in`

1. Entering `/scan`, the user first confirms the camera's purpose and the
   storage/transmission choices.
2. Face landmarks from the front camera align the T-zone and both cheek ROIs.
3. Continuous quality ticks grade face size, centering, frontal angle,
   brightness, steadiness and skin-ROI state.
4. Auto-capture starts its countdown only after two consecutive passing ticks
   and cancels if conditions drift.
5. Right after capture the frame is re-validated at original resolution, and
   two extra frames are analysed to reduce transient noise.
6. On insufficient quality, the app shows the reason and how to adjust, and
   offers a retake or questionnaire-only continuation.
7. On iPhone Safari, if a tab switch or camera-track interruption occurs, the
   existing stream is released and a recovery screen lets the user explicitly
   turn the camera back on.
8. AI cross-checking and training crops each run only under their own separate,
   explicit consent.

### 2. Questionnaire-only journey

`Home → survey → report → retailers · care · share → optional usage start /
check-in`

- Camera denial, an unsupported browser, model-loading failure, low light, or
  the user's own choice all land on the same questionnaire fallback.
- With no camera result, the report uses questionnaire answers only and never
  fabricates scan evidence.
- Without an AI provider key — or if the provider fails — the flow completes
  with local recommendations and template copy.

### 3. Research / pilot journey

`Internal pilot session → participant/session match check → per-purpose consent
→ capture & feedback → local review/export → authenticated server sync →
offline evaluation`

- `/pilot`, `/ops` and `/eval` return 404 in production by default.
- Pilot scope requires an exact match of both participant and session.
- There is no fallback that treats ordinary user consent as pilot consent.
- Model promotion is never automated; a human reviews the defined data and
  fairness gates.

### 4. Reminder journey

`Explicit email subscription → 2-week / 4-week cron → check-in → signed
unsubscribe → cleanup 30 days after unsubscribe or the 4-week send`

- Email is stored only when a user who started a recommendation separately
  opts in.
- Unsubscribe tokens are signature- and expiry-checked.
- Withdrawn contacts are excluded from subsequent sends.
- Code tests and real Resend delivery verification are separate release gates.

## Screen and route map

| Route | Role | Failure / protection behaviour |
|---|---|---|
| `/` | Product intro, language switcher, camera/survey entry | Core CTAs keep 44px touch targets at 360px |
| `/scan` | Camera quality gate, capture, on-device analysis | Permission/model/quality failure → retry or `/survey`; the live-camera `ready` phase is measured at 360x800 in all five locales, capture button above the fold |
| `/survey` | Skin concerns, preferences, budget, exclusions | View and completion events recorded separately per session |
| `/report` | Up to 3 candidates, selection reasons, trust notes | Verified local templates on AI failure |
| `/care` | Morning/evening routine, usage start, retailers | Retailer clicks separated from usage start |
| `/reco` | Candidate comparison and follow-up exploration | No unverified price/stock/review display |
| `/studio` | Share-card editing, Web Share | Safely prefilled when a real scan result exists |
| `/checkin` | 2- and 4-week post-usage check-in | Safe guidance when no local/subscription state exists; answer pills keep 44px touch targets in all five locales |
| `/privacy` | Data purpose, transmission, retention, deletion | Used as the public production URL |
| `/guide/serum-for-combination-skin`, `/guide/toner-for-oily-skin` | Catalogue-built English guides that hand a searcher into `/scan` or `/survey` | Server-rendered: body is in the first HTML response, checked with JavaScript disabled |
| `/unsubscribe` | Signed email unsubscribe | Rejects missing/tampered/expired tokens |
| `/pilot`, `/ops`, `/eval` | Research participation, ops, evaluation | 404 in production unless explicitly enabled |

Screenshots: [`docs/buildweek/assets`](docs/buildweek/assets) (English,
1080×2160).

### What a search engine and a link preview see

`/robots.txt` and `/sitemap.xml` are generated by `app/robots.ts` and
`app/sitemap.ts` from one route table, `SEO_ROUTES` in
[`lib/seo.ts`](lib/seo.ts), which is also the source for every page's title,
description, canonical and `og:*`.

Six URLs are indexable — `/`, `/scan`, `/survey`, `/privacy` and the two guide
pages below — and the rule is measured rather than stylistic: those are the pages
that render real content for a first-time visitor with empty device storage. Everything else renders from
device storage, so a crawler arriving cold gets an empty state or a redirect —
those pages are `noindex` but still carry their own title and description,
because people share them. `/api/` is the only `Disallow`; a page that relies on
a `noindex` tag must stay crawlable or the crawler never reads the tag.

`/guide/serum-for-combination-skin` and `/guide/toner-for-oily-skin` are a
search experiment, not a content plan: server-rendered English pages built from
the catalogue by [`lib/guides.ts`](lib/guides.ts), with the kill criterion
written down in "Backlog > Now" of
[`docs/AUTOPILOT.md`](docs/AUTOPILOT.md) — 0 Search Console impressions four
weeks after the owner submits the sitemap and both pages come out again.
`public/offline.html` is a page too, and now says `noindex`: the route-table
guard walks `app/`, so nothing there could ever have seen it.

Language is chosen client-side on these same URLs, so metadata is English and
there is no `hreflang` — see §4 of
[`docs/discovery-metadata.md`](docs/discovery-metadata.md) for the measurements
and for what per-locale URLs would take.

Each visitor downloads one locale dictionary, not five. Korean needs none — the
Korean source strings are the message ids — and Japanese, Chinese and Arabic are a
dynamic `import()` each in [`lib/i18n/core.ts`](lib/i18n/core.ts), resolved before
`LanguageProvider` renders that language so no wrong-language text paints on the way.
English stays a static import because the server renders English and the hydration
render has to match it. Measured on a production build at `382c59f`: the four
dictionaries shared one chunk of 350267 bytes that `/` loaded, and `/`'s initial
JavaScript was 1050358 bytes raw / 322373 gzipped against 783030 / 240097 after.
Getting English out too needs per-locale URLs, the same decision as above.

While that one chunk is in flight a ja/zh/ar visitor sees English, and the subtree is
remounted when the dictionary lands, so any state created in between would be discarded.
Measured at 360x800 on a production build, the interval runs from about 350ms unthrottled
to about 4.1s under an emulated latency-562.5ms / 180000-B/s profile. For exactly that
interval the page is held: `<body>` carries `inert`, `aria-busy` and a
`data-aru-lang-pending` attribute that dims the controls, so a tap is refused rather than
accepted and thrown away. Korean and English visitors never enter it and their first paint
and geometry are unchanged. If the dictionary chunk fails to load, the hold lets go and the
page stays usable in English rather than staying inert.

## System architecture

```mermaid
flowchart LR
    U["Mobile user"] --> W["Next.js App Router"]
    W --> C["Camera + MediaPipe<br/>same-origin model/WASM"]
    C --> L["On-device ROI reading"]
    W --> R["Survey · recommend · routine"]
    L --> R
    L -. "separate AI consent" .-> A["/api/analyze"]
    R -. "optional copy phrasing" .-> X["/api/reason"]
    A & X --> P["Gemini / OpenAI"]
    W --> D["Browser-local data"]
    D -. "pilot scope + sync token" .-> S["/api/sync"]
    S --> B["Private Supabase"]
    W -. "explicit opt-in" .-> E["/api/reengage/*"]
    E --> B
    E --> M["Resend"]
    W --> O["/api/out"]
    O --> Q["Allow-listed retailers"]
```

The default camera reading and recommendation run in the browser. Server APIs
exist only for AI cross-checking, authenticated pilot sync, email operations
and allow-listed retailer redirects. See
[Architecture](docs/architecture.md) for detailed data flow and the ML
promotion structure.

## Camera and skin-ROI pipeline

ARU prioritises "is the skin region good enough to analyse" over "is a face
visible".

1. `getUserMedia` requests the 1080×1440 front camera first, retrying with a
   720×960 profile on failure.
2. MediaPipe FaceLandmarker runs in VIDEO mode on a 650ms cycle.
3. Face size, centering and frontal angle are computed together with the
   T-zone and both cheek ROIs.
4. Exposure that is too dark or too bright, glare, shake, ROI occlusion and
   the count of valid samples are checked.
5. Auto-capture requires two consecutive passing ticks before entering the
   3→2→1 countdown.
6. Quality is re-checked at original resolution at the moment of capture.
7. Two extra frames at 140ms intervals and a median consensus reduce transient
   shake and reflections.
8. Small patches are sampled at 13 T-zone points and 14 cheek points,
   excluding the top and bottom 10% by luminance.
9. Shine, region-relative redness, texture variation, brightness and specular
   signals are converted into buckets.
10. Four environment signals are checked — lighting, T-zone glare, skin-region
    size, and exposure headroom (the share of the cheek patch with any channel at
    the 8-bit ceiling, which is what the redness and texture readings are computed
    from). Any one failing recommends a retake.
11. Attribute confidence and environment signals combine into an overall
    confidence. The user-facing confidence label reports how far the three
    readings sit from their cut points; capture quality is shown separately, as a
    per-signal checklist.

Camera orchestration is split so no single page owns every responsibility:

- `camera-stream.ts`: permission and MediaStream lifecycle
- `create-landmarker.ts`, `use-landmarker.ts`: model creation/teardown — this
  is also where a GPU delegate emitting corrupted landmarks is detected by its
  invalid coordinate range and self-healed by a one-time switch to the CPU
  delegate
- `camera-quality.ts`, `skin-roi-quality.ts`: frame and skin-ROI quality
  contracts
- `use-quality-loop.ts`: repeated quality grading and auto-capture state
- `capture-analysis.ts`, `use-capture-analysis.ts`: post-capture burst
  analysis
- `consent-authorization.ts`: per-purpose transmission/storage scope checks
- `page.tsx`: user flow and screen-state coordination

The model and WASM are served same-origin from `public/vendor/mediapipe/` with
no runtime CDN dependency. `postinstall` and `npm run assets:mediapipe` copy
the package assets, and tests plus smoke checks guard against missing files,
wrong paths and bad responses.

The WASM runtime goes into a directory named after the installed
`@mediapipe/tasks-vision` version, and the same script writes
`app/scan/mediapipe-version.ts`, which `app/scan/landmarker-config.ts` builds
the URL from — one read of the package for both, so an upgrade moves the URL
and a warm cache cannot answer the new JS bundle with the old runtime. The two
halves have no version handshake to fall back on: the bundle calls Emscripten
exports straight off whatever module the loader hands it. Old versions are
removed from `public/` by the copy script and from a visitor's cache by
`public/sw.js`.

The model URL carries no version (the model is not shipped by the package), so
the service worker caches it by name and serves it stale-while-revalidate: a
returning visitor gets the cached copy immediately and a replaced file on their
next visit, rather than never, which is what cache-first with no revalidation
gave them. Behaviour and the failure paths are pinned by
`tests/sw-mediapipe-revalidate.test.ts` and `tests/mediapipe-assets.test.ts`.

`npm run test:ios-safari` checks the inline/muted/autoplay contract, KO/EN/JA/ZH
recovery copy, background, `mute`, `ended`, `pagehide`, explicit restart,
overflow and touch targets on Playwright WebKit 26.5 with an iPhone 17 Pro
device profile. This is a WebKit engine regression — it does not replace
physical-device verification of the real lens or the iOS permission UI.

Physical-device camera changes must fill in the Android Chrome and iOS Safari
rows of [Mobile camera QA](docs/mobile-camera-qa.md). Automated tests do not
substitute for the real lens, OS permission UI, thermals/memory, or
background/resume behaviour.

## Data, consent and retention

| Data | Default location | Purpose | Retention / deletion | Transmission condition |
|---|---|---|---|---|
| Current scan/survey state | Browser session/local | Restore the recommendation flow | User can delete everything | No transmission by default |
| Recent results, usage starts, check-ins | `localStorage` | Return visits and routine tracking | Removed via the registered device-data deletion path | No transmission by default |
| Anonymous funnel events | `localStorage` | Product funnel diagnostics | Max 1,000 entries, included in full deletion | No transmission by default. When synced or flushed, readable on `/ops` as per-source aggregate counts only — the read never selects `visitor_id` |
| Training skin crops | Local and private Storage | Consented pilot calibration | 180-day default; deleted/excluded on expiry or withdrawal | `learning_crop` consent + exact pilot scope |
| Skin crops for AI analysis | Processing memory and the chosen provider | Optional cross-checking | Never stored permanently by ARU | `ai_analysis` consent |
| Email, consent and send metadata | Private Supabase | 2- and 4-week reminders | Cleanup target 30 days after the 4-week send or unsubscribe | Explicit email opt-in |

Every new local data key must be registered in
[lib/device-data.ts](lib/device-data.ts) and covered by the full-deletion test.
No new data is collected before its purpose, location, transmission condition,
retention period and deletion path are decided.

## Security and privacy invariants

- Supabase app tables run with RLS on, and direct `SELECT`, `INSERT`,
  `UPDATE`, `DELETE` privileges are revoked from `anon`/`authenticated`.
- `SUPABASE_SERVICE_ROLE_KEY`, the sync token, cron/unsubscribe secrets, the
  Resend key and AI provider keys are used server-side only.
- No secret ever gets a `NEXT_PUBLIC_` prefix.
- The Supabase runtime accepts only a valid HTTPS/loopback URL, a
  service-role-shaped key and a 32+ character sync token as "configured", and
  rejects Vercel's masked placeholder strings.
- `/api/analyze`, `/api/reason`, subscribe and sync must pass byte, schema and
  rate boundaries before any external work starts.
- External AI provider requests use a 15-second timeout and end in a safe
  error or a local template on failure.
- The Vercel Firewall puts a global limit on POST paths that can call
  providers, with per-route limiters as a second layer.
- CSP enforces same-origin script, worker, media and connections by default;
  `'unsafe-eval'` is development-only and production keeps only
  `'wasm-unsafe-eval'` for MediaPipe.
- `Permissions-Policy` allows the camera for same-origin only and denies
  microphone, geolocation, payment, USB and interest-cohort-class features.
- Internal `/pilot`, `/ops`, `/eval` routes are 404 outside explicitly allowed
  environments.
- Camera, storage or network errors must never block the questionnaire
  recommendation path.
- Retailer redirects validate SKU and merchant allowlists and never accept
  arbitrary URLs.
- Recommendation copy must pass the medical/efficacy-claim filter.

### Server API boundaries

| API | Purpose | Main defences | Safe failure |
|---|---|---|---|
| `POST /api/analyze` | Optional vision cross-check of consented skin ROIs | Same-origin guard (`Sec-Fetch-Site` / `Origin`) run before anything else, 2,100,000 bytes, JSON/schema, declared media type's signature bytes at offset 0, 1,500,000-byte decoded image ceiling, 10/60s per client key per running instance, 15s provider timeout | 400/403/413/429/502/503; on-device reading kept |
| `POST /api/reason` | Optional LLM phrasing of recommendation reasons | Same-origin guard run before anything else, 32,768 bytes, JSON/schema, 10/60s per client key per running instance, 15s provider timeout, output claim filter | 403 for a cross-site caller; otherwise verified template fallback |
| `GET/POST /api/sync` | Pilot status check and authenticated batch sync | Sync token, origin allowlist, 5 MiB, 12/60s per IP after auth, consent/scope validation | Rejects unauthenticated, disallowed-origin and oversized bodies |
| `GET/POST /api/funnel` | Public funnel-event ingest (the flush's endpoint; flush is off), and — behind the sync token on `GET` — the aggregate read of `funnel_events`, split by source | POST is unauthenticated by design: own 20/60s per-IP bucket run first, 32 KiB body cap, same-origin guard, 100 events max, server-side kind/prop re-validation, `metadata.source = public-funnel`, insert-only. The `GET` aggregate needs `SUPABASE_SYNC_TOKEN` and selects `kind, session_id, ts` only — never `visitor_id` | Rejects other origins, oversized and malformed bodies; drops unknown kinds and undeclared prop keys; omits the aggregate without a valid token |
| `POST /api/reengage/subscribe` | Explicit email opt-in | Email/schema/body validation, 5/60s per IP, private DB | Feature disabled or safe error when unconfigured |
| `POST /api/reengage/unsubscribe` | Signed unsubscribe | Token signature, expiry and state validation | Rejects tampered/expired tokens |
| `GET /api/reengage/run` | 2-/4-week sends and retention cleanup | Cron secret compared in constant time, batch of 50, 45s max, withdrawal exclusion | Rejects failed auth; re-runnable within limits |
| `GET /api/out` | Allow-listed retailer redirect and click logging | SKU/merchant/placement allowlist, UTM composition | Rejects invalid input |

Operational setup and real verification steps follow the
[Supabase sync runbook](docs/supabase-sync-runbook.md) and
[Re-engagement setup](docs/reengage-setup.md).

## Product KPI contract

Every rate is computed over the intersection of unique `sessionId`s in the
reporting period, counting duplicate events in a session once. The camera
journey and the questionnaire-only journey are never forced into a single
linear funnel.

That session-set rule is also what contained a defect found on 2026-09-24: until
then a page-view event was recorded TWICE on every hard page load for any visitor
whose saved language was not English, and once for English. `LanguageProvider`
remounts its subtree when the saved language resolves after hydration — deliberately,
so plain `t()` calls pick up the language — and the remount recreated the mount guards
that were supposed to make each view fire once. Because every rate above counts
distinct sessions, none of them moved; the raw counts did, which means
`funnelEventCount()`, the event CSV export, anything ingested through `/api/funnel`
and the rate at which the 1,000-entry ring buffer evicts old events were all inflated
for non-English visitors and not for English ones. Page views now go through
`recordPageView` (`lib/funnel.ts`), which admits one event per kind per path visit
while still counting a genuine re-view after a reload, a back/forward, or a detour
through a page that records no view of its own (`/report` → `/privacy` → back);
`app/components/page-view-scope.tsx` tells the guard about every navigation for that
last case. `tests/e2e/funnel-page-view-once.regression-20.spec.ts` holds all of it.

| Metric | Definition | Target |
|---|---|---|
| Scan completion | Completed sessions among scan-started sessions | ≥ 70% |
| Capture failure | Sessions not completing within 3 minutes of starting | ≤ 20% |
| Survey completion | Completed sessions among survey-viewed sessions | ≥ 65% |
| Report reach | Sessions seeing recommendations after survey completion | ≥ 95% |
| Retake recommendation | Completed scans with `retake=true` | ≤ 25% |
| Recommendation action | Sessions opening a retailer after viewing recommendations | ≥ 15% |
| Share rate | Sessions sharing after scan completion | Observational |
| Share activation | Sessions arriving on a shared `#m=` link that reached a capture | Observational |
| 2-week check-in | Check-ins among subscribers reaching the 2-week mark | ≥ 20% |

AI transmission/training consent rates are safety KPIs, not growth-optimisation
targets. Internal diagnostic names like `failurePreventionConversion` are never
used externally as if they proved purchases, efficacy or failure prevention.

## Tech stack

| Area | Technology | Why |
|---|---|---|
| Web | Next.js 16.2.9 App Router, React 19.2.4, TypeScript | Mobile Web/PWA and server routes in one repository |
| UI | Tailwind CSS 4, CSS design tokens | Consistent handling of small screens and multilingual states |
| Vision | MediaPipe Tasks Vision 0.10.35 | Face landmarks and ROI computation in the browser |
| Data | Supabase JS 2.108.2, Postgres, private Storage | Server-only operational data and pilot crops |
| Optional AI | OpenAI (GPT-5.6 reasons) or Gemini | Consented analysis cross-checks and recommendation phrasing |
| Email | Resend | Explicit 2- and 4-week reminders |
| Android | TWA generated with Bubblewrap 1.24.1, Gradle 8.11.1, target/compile SDK 36 | Generator kept out of release dependencies; AAB built by the reviewed Gradle wrapper |
| Quality | Vitest 4.1.9, Playwright 1.61.1, ESLint 9 | Contract, security, mobile UI and production-route regressions |

### Fonts and languages

- Body text and the KO/EN/JA/ZH UI use Pretendard Variable, self-hosted as an
  npm package.
- Only short Korean brand display text uses Nanum Pen Script 5.2.7 (OFL-1.1).
- EN/JA/ZH headings switch automatically to Pretendard for readability.
- There are no runtime font CDN requests.
- Supported languages: **English (default)**, Korean, Japanese, Simplified
  Chinese and Arabic with a right-to-left layout. Korean source strings
  are the message ids; stored values stay Korean-canonical and are translated
  at render time, so switching languages never rewrites data. Translation-key
  coverage is tested.
- RTL layout is built on CSS logical properties (`inset-inline-start`,
  `padding-inline-start`, `border-inline-start`, `margin-inline-start`,
  `margin-inline-end`, `text-align: start`). The one per-direction rule is the
  arrow-glyph mirror in `app/globals.css`
  (`html[dir="rtl"] .aru-dir-arrow, .aru-flow-steps__arrow`), because a glyph has no
  logical form. A physical `left` / `paddingLeft` / `marginLeft` / `borderLeft` /
  `textAlign: "left"` is the failure mode to look for: it does not follow `dir`, and
  `tests/e2e/rtl-logical-inset.regression-18.spec.ts` (`/report`) and
  `…regression-19.spec.ts` (`/`, `/scan`, `/privacy` and the shared step rail) measure
  the seven blocks that did not.
- Nine screens have now been measured under `ar` at 360x800: `/report`, `/care` and
  `/checkin` (cycle 34) and `/`, `/survey`, `/scan`, `/studio`, `/privacy` and
  `/unsubscribe` (cycle 35, `docs/rtl-sweep-part-two.md`). `/scan` is the pre-camera
  screen only — the two blocks behind `phase === "ready"` need a camera and are open
  in `docs/AUTOPILOT.md`, as are mid-session language switching and a real phone.
- The two `/guide/*` pages are the one exception to all of this, and they declare it
  rather than inherit it. Their body is English in every locale, but they render inside
  `LanguageProvider`, which writes `html[lang]`/`dir` from the visitor's SAVED language —
  so a returning visitor who had picked `ar` got `html[dir=rtl]` around Latin prose (the
  list indent moved to the far side, the CTA's `→` crossed to the wrong side of its
  label, the "Another guide:" sentence reversed) and one who had picked `ko` got the
  Korean hand-drawn display face on an English `h1`. `app/guide/guide-view.tsx` sets
  `lang="en" dir="ltr"` and `data-guide-root` on its own `<main>`, with a companion rule
  in `app/globals.css` for the font token, which is anchored to `html[lang]` and cannot
  be reached from an inner element.
  `tests/e2e/guide-ltr-in-rtl-chrome.regression-34.spec.ts` asserts the invariant rather
  than the pixels: the pages' measured geometry is identical under all five saved
  languages.
- Position over the camera image stays PHYSICAL on purpose. `app/scan/guide.tsx` puts
  the 이마/T존, 왼볼 and 오른볼 zone boxes, the corner marks, the landmark dots and the
  ROI rectangle on a photograph of a face; mirroring them under `ar` would move a
  label to the wrong cheek.

### Accessibility

Audited for the first time in cycle 49 over the conversion path, and extended in cycle 50
to every screen a visitor reaches: 360x800 on a production build, `en` and `ko`, over `/`,
`/scan`, `/survey`, `/report`'s three steps, `/care`, `/checkin`, `/studio`, `/privacy` and
`/unsubscribe` — 22 screen x locale pairs. What holds today, measured rather than asserted:

- **Accessible names.** 284 visible interactive controls across the 22 pairs, 0 without an
  accessible name; cycle 49's narrower sweep found 0 of 68 visible `img`/`svg` elements
  reaching the accessibility tree unnamed. Cycle 50 re-checked `img` alone (0 of 6 without
  `alt` or `aria-hidden`) and found 0 `input`/`select`/`textarea` controls without a
  programmatic label — no denominator is claimed for that last one, only the zero.
- **Keyboard focus.** Every Tab stop on `/`, `/scan`, `/survey`, `/care`, `/checkin`,
  `/studio`, `/privacy` and `/unsubscribe` has a visible indicator. `/report`'s picks and
  routine steps are the one gap: cycle 50's script-driven `.focus()` harness and a
  `Tab`-driven probe disagreed there, so neither result is reported as fact.
- **Text contrast (WCAG 2.2 SC 1.4.3, level AA).** 0 of 1078 visible leaf text nodes are
  under their floor: 4.5:1 for body text, 3:1 at 24px or 18.66px bold. (Cycle 50's
  equivalent number, 904, was measured with a rig that could not read a `color-mix()`
  background — see the matrix bullet below — so it did not cover every surface it
  appeared to.) This has moved
  three shipped tokens. `--plum` was `#e0382c` at 4.401:1 and is now `#d9362b` at 4.653:1;
  `--orange` was `#ef8a1f` at 2.522:1 against the large-text floor and is now `#d57b1c` at
  3.144:1 (both cycle 49). `--bronze` was `#767676` and is now `#6e6e6e` (cycle 50).
- **A ratio is a property of a colour PAIR, not of a token.** Cycle 49 computed every token
  against `#ffffff`, and that is not where all of them render. On `--surface-tint`
  `#f5f5f5` every ratio drops by about 8%: `--bronze` `#767676` was 4.542:1 on white and
  4.166:1 on the tint, and `--plum` `#d9362b` is 4.653:1 on white and 4.268:1 on it. Both
  rendered on `/privacy`'s notice cards. So a new colour has to clear its floor against the
  surface it actually sits on, and `dangerBtn` there takes `--plum-press` `#c22e23`
  (5.193:1 on the tint) rather than the brand red. Both
  `tests/e2e/conversion-path-accessibility.spec.ts` and
  `tests/e2e/tinted-surface-contrast.regression-35.spec.ts` compute the ratio from the
  colours the browser resolves, walking the ancestor chain for the background, not from the
  hex literals.
- **The pair table is in one place now (cycle 51).** `tests/contrast-matrix.test.ts` reads
  every colour token out of `app/globals.css` and computes all 102 (text token x
  background token) ratios, 53 of which are under 4.5. It asserts the 16 pairs established
  by rendering to be text, carries the 1 pair that renders under its floor and is exempt
  (a disabled submit: SC 1.4.3's Incidental exception for an inactive user interface
  component), and snapshots the 53 so a palette edit cannot quietly create a failing pair.
  Two source guards go with it: every token used as a `color:` or as a background in
  `app/` must be defined in `app/globals.css` and listed in the matrix. The first guard
  exists because `color: var(--danger)` was live at two sites with `--danger` defined
  nowhere, which made the declaration invalid at computed-value time and rendered both
  save-failure messages in the inherited `--ink` rgb(26, 26, 26) instead of a red.
- **A `color-mix()` background is not an `rgb()` string, and a measuring rig that assumes
  it is will report a false green.** Chromium serialises `color-mix(in srgb, var(--plum)
  8%, var(--paper))` as `color(srgb 0.988078 0.936941 0.93349)`. The shared `parse()` in
  the specs above matched `rgb()`/`rgba()` only, so it returned null and the background
  walk skipped that layer and measured against the ancestor — which is how the
  concern-matched ingredient tag on `/report`'s picks step sat at 4.145877021275885:1 on
  the money screen through three contrast sweeps. The parser now understands `color(srgb
  ...)`, and the tag takes `--plum-press` at 5.044548164305988:1.
- **Target size.** `--tap-min: 44px` is the repo's contract and it is **WCAG 2.5.5, level
  AAA** — stricter than the AA floor, which is 2.5.8's 24x24 with Spacing, Equivalent,
  Inline, User Agent Control and Essential exceptions. A control under 44px is therefore
  not automatically a WCAG failure, and two of the three found under it were correctly
  left alone: the `/guide/` links on `/` are inline in a sentence, and the `/scan` consent
  checkboxes are 18x18 inputs inside 290x57.2 labels, which is the real target. One control
  found in cycle 50 is still open and filed in `docs/AUTOPILOT.md`: `/report`'s routine step
  puts the reengage checkbox at 15x15 (`ko`) / 13x15 (`en`), which needs the same
  is-the-label-the-target judgement made and measured before anything is resized.
  Provenance for every threshold above, with the normative quotes and fetch hashes:
  [docs/contrast-provenance.md](docs/contrast-provenance.md) and
  [docs/tap-target-provenance.md](docs/tap-target-provenance.md).

Not yet established, and not to be read as passing: `ja`/`zh`/`ar` were not audited (a
contrast result carries over only where the same colour pair renders — cycle 50 is what
made that qualification necessary; wrapped geometry does not carry over at all), no screen
reader was run, and zoom and `prefers-reduced-motion` are untested. SC 1.4.11 Non-text
Contrast is only partly measured: `--blue` `#2f6de0`, the scan bars and one icon stroke,
is 4.789395592096463:1 on `--paper` and 4.393009940622331:1 on `--surface-tint`, both over
the 3:1 floor, while `--line` `#dcdcdc` — the border of the outlined buttons and cards —
is 1.3713058806238527:1 on `--paper`; whether those borders count as "required to identify"
the control is an open question filed in `docs/AUTOPILOT.md`, and the rest of the SVG line
art is still untested. The two guide pages have not been audited at all, and
`/report`'s focus visibility is unresolved (above). Open items are in `docs/AUTOPILOT.md`.

## Repository layout

```text
app/
├─ api/                       analyze, reason, sync, reengage, out routes
├─ scan/                      camera stream, landmarker, quality, analysis, UI orchestration
├─ survey/ report/ care/      core recommendation funnel
├─ studio/ checkin/           sharing and post-usage check-in
├─ privacy/ unsubscribe/      privacy and email unsubscribe
└─ pilot/ ops/ eval/          research tools, blocked in production by default
lib/
├─ server/                    request guards, input validation, internal access, unsubscribe tokens, cron auth
├─ i18n/                      Korean-canonical ids + EN/JA/ZH/AR translations
├─ consent/crops/device-data  consent, retention and device-data contracts
└─ recommend/commerce/funnel  recommendation, retailer and funnel domain logic
public/
├─ vendor/mediapipe/          self-hosted model; WASM under <version>/wasm
├─ .well-known/assetlinks.json
└─ sw.js                      PWA offline fallback; MediaPipe stale-while-revalidate
android/                      com.seonkistall.aru Bubblewrap TWA
supabase/schema.sql           tables, RLS, privileges, Storage baseline
ml/                           offline calibration/training/evaluation
scripts/                      smoke, asset, Android and Supabase verification
tests/                        unit, contract, security and mobile-browser regressions
docs/                         PRD, design, QA evidence, ops and Play runbooks
```

Read the root [AGENTS.md](AGENTS.md) and the relevant product/ops documents
before changing code.

## Local development

### Requirements

- Node.js 20+ and npm
- Python 3 — used by smoke's ML script compile check
- Git
- Chromium for Playwright (`npx playwright install chromium`)

Android release builds additionally need JDK 17, the Android SDK/Build Tools
and a signing environment. The checked-in wrapper build does not need
Bubblewrap; regenerating the wrapper is a separate reviewed task. Plain Web
development needs no Android toolchain.

### Install and run

```bash
git clone https://github.com/seonkistall/aru-buildweek.git
cd aru-buildweek
npm install
npx playwright install chromium
npm run dev
```

The default address is <http://localhost:3000>.

**No environment variables are required to run the app.** With no keys set,
the on-device camera reading, questionnaire, recommendations and local storage
all work end to end using pre-approved template copy. The camera works on
`localhost` and over HTTPS. No sample data or seeding step is needed — the
product catalogue and routine rules ship in `lib/skus.ts` and
`lib/recommend.ts`. Optional AI cross-checking, Supabase sync and email
delivery activate only when their server environment variables exist.

### Main commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Full Vitest contract and security regressions |
| `npm run test:mobile-ui` | Playwright Chromium mobile feature, i18n and text-fit regressions |
| `npm run test:ios-safari` | Playwright WebKit iPhone-profile camera-lifecycle and recovery regressions |
| `npm run lint` | ESLint |
| `npm run build` | Next.js production build |
| `npm run smoke` | lint, unit, mobile browser, build, ML compile and core route/auth checks in one run |
| `npm run openai:check` | One real call verifying the configured reason model id is usable |
| `npm run supabase:check` | Production Supabase privilege and Storage audit |
| `npm run android:check` | TWA package/origin/API/permission/version/toolchain/secret audit |
| `npm run assets:mediapipe` | Copy MediaPipe same-origin assets |
| `npm audit` | Full production and development dependency audit |
| `git diff --check` | Whitespace and conflict-marker check |

## Server environment variables

Never commit environment values in `.env` files; register them in Vercel
Production/Preview or an approved secret store. Copy
[`.env.local.example`](.env.local.example) to `.env.local` for local work.
All variables are optional and **server-only** — never prefix any of them with
`NEXT_PUBLIC_`.

| Variable | Needed for | Scope | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | optional reason/vision | server-only | Enables LLM phrasing of recommendation reasons |
| `OPENAI_REASON_MODEL` | optional reason | server-only | Defaults to `gpt-5.6-luna` |
| `OPENAI_VISION_MODEL` | optional vision | server-only | Defaults to `gpt-4o-mini` |
| `GEMINI_API_KEY` | optional vision | server-only | `/api/analyze` Gemini provider |
| `GEMINI_MODEL` | optional vision | server-only | Defaults to `gemini-2.0-flash` |
| `VISION_PROVIDER` | optional vision | server-only | `gemini` or `openai` |
| `SUPABASE_URL` | sync/email | server-only | HTTPS Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | sync/email | server-only | Modern `sb_secret_*` or legacy service-role key |
| `SUPABASE_SYNC_TOKEN` | pilot sync | server-only | 32+ character operator token |
| `SUPABASE_CROP_BUCKET` | pilot crops | server-only | Private Storage bucket |
| `SUPABASE_CROP_RETENTION_DAYS` | pilot crops | server-only | 180-day default retention |
| `SUPABASE_SYNC_ALLOWED_ORIGINS` | pilot sync | server-only | Comma-separated origin allowlist |
| `RESEND_API_KEY` | email | server-only | Verified Resend account key |
| `REENGAGE_FROM` | email | server-only | Sender address on a verified domain |
| `REENGAGE_LINK_BASE` | email | server-only | Production unsubscribe/check-in base URL |
| `UNSUBSCRIBE_SECRET` | email | server-only | Signing/verification secret |
| `CRON_SECRET` | email cron | server-only | Send-route authentication; must differ from `UNSUBSCRIBE_SECRET` |
| `INTERNAL_TOOLS_USER` / `INTERNAL_TOOLS_PASSWORD` | `/ops`, `/pilot`, `/eval` | server-only | Absent ⇒ those routes 404 in production |

If a provider key is missing the corresponding route degrades to a documented
fallback rather than failing: `/api/reason` returns template copy with
`source: "template"`, and `/api/analyze` keeps the on-device reading.

After changing environment variables, always create a new production
deployment and re-check `/api/sync`'s public status response and the
unauthenticated/disallowed-origin boundaries. Never leave secret values in
logs, issues, PRs, screenshots or chat.

## Tests and quality gates

### Fast development loop

```bash
npm test
npm run lint
```

### Full Web smoke

```bash
npm run smoke
npm audit
git diff --check
```

`npm run smoke` currently bundles:

- ESLint and the TypeScript/Next.js production build
- Vitest: 80 files, 518 tests
- Playwright Chromium mobile E2E: 44 tests in 12 files
- `ml/selftest.py`: 121 tests, standard library only (no torch install needed)
- Home and core callouts across locales
- 9 core routes × 5 locales × 4 viewports (320/360/393/768px) — a
  180-combination text-fit matrix
- Camera permission-denial fallback
- Studio, reminder and privacy screens
- Clipped copy, broken characters, leaked translation keys, horizontal
  overflow and sub-44px core touch targets
- MediaPipe model/WASM same-origin assets
- Public production routes and internal-route 404s
- API JSON/body/auth/origin boundaries
- ML Python script compilation (`py_compile`)

**Not bundled:** the Playwright WebKit 26.5 iPhone-profile camera-lifecycle E2E
(5 tests in 1 file) runs on its own, via `npm run test:ios-safari`.
`scripts/smoke-test.mjs` calls `lint`, `test`, `test:mobile-ui`, `build`,
`py_compile`, `ml/selftest.py` and the HTTP route checks — and not that config.

**Running the gate so its answer means something.** The e2e phase starts its own server
and refuses to borrow one. As of 2026-09-29 (cycle 56) that server is a production build:
`webServer.command` is `npm run build && npm run start`. Before that it was `next dev`,
which put the dev-tools portal, on-demand route compilation, Fast Refresh and dev-mode
React into every page the gate measured. `reuseExistingServer` is off unless you are on the
dev opt-in AND set `ARU_REUSE_DEV_SERVER=1`; on the dev path `webServer.command` also
clears Turbopack's persistent `.next/dev` cache first (`scripts/clear-dev-cache.mjs`).
Before that clear existed, a dev server left alive from an earlier run was silently reused:
with a CSS rule deleted, `guide-ltr-in-rtl-chrome.regression-34` reported `8 passed` where
the tree's true result was `4 failed | 4 passed`. So:

- **The e2e phase measures `next build` + `next start`, and it is the cheaper of the two.**
  One run each on the same tree, 2026-09-29 (cycle 56), this container: `next dev`
  `300 passed (19.6m)`; production `4 failed | 296 passed (16.9m)` **including its own
  build**, where all 4 failures were `discovery-metadata.regression-26` asking for what only
  a dev server serves — `/ops`, `/pilot` and `/eval` render outside `NODE_ENV=production`
  and 404 inside it, so three route tests spent 30 s each timing out on a `<head>` tag that
  a 404 has not got, and the title-uniqueness test read `Expected length: 14 / Received
  length: 11`. That spec now asserts what each server actually serves, and the
  production suite reads `300 passed (14.8m)` inside a `npm run smoke` that took 945 s
  end to end. The build is not an added cost: the gate needed a production
  build anyway for its HTTP phase, so `scripts/smoke-test.mjs` no longer runs a second one —
  `.next/BUILD_ID` was written 25 s after the run started (`✓ Compiled successfully in
  7.7s`, `Finished TypeScript in 14.0s`, `✓ Generating static pages using 3 workers (27/27)
  in 501ms`).
- **`ARU_E2E_SERVER=dev` runs the suite against `next dev` instead**, for an interactive
  debugging loop where a rebuild per edit is the wrong trade. It is the only var that
  changes the gate's shape: `scripts/smoke-test.mjs` then runs `npm run build` itself,
  because the e2e phase no longer did. Nothing in the gate sets it, and a result measured
  under it is a dev-mode result — say so if you quote a number from one.
- **Nothing else may be listening on `MOBILE_UI_PORT` (3102).** `npm run smoke` now checks
  this before the e2e phase and stops with a named error rather than hanging; a wedged
  `next dev` — what killing a smoke run mid-suite leaves behind — used to hang the run
  with no verdict at all.
- **Do not kill a smoke run with a `pkill -f` pattern** that also matches your own shell.
  That is how the orphan gets created; kill by PID. And after killing one, check the new
  server actually BOUND before believing a number off it. Cycle 50 lost a whole measurement
  run to this: `npx next start` failed with `EADDRINUSE`, the old process kept serving HTML
  that named a CSS chunk the new `npm run build` had replaced, and every page rendered
  unstyled — `curl` on the chunk gave `404`, `--bronze` resolved to the empty string,
  `body` had the UA's 8px margin, and `/studio` showed a phantom `scrollWidth` of 412
  against a `clientWidth` of 360. Nothing was wrong with the tree.
- `ARU_REUSE_DEV_SERVER=1` is for an interactive edit loop only, and only alongside
  `ARU_E2E_SERVER=dev` — the production path ignores it, because reusing a listener there
  would hand the run to a server started from some other build. It costs roughly 3-4 s of
  cold Turbopack compile to leave it unset (measured: 4930 / 5247 / 6072 ms to the first
  200 on `/` cold, 1958 ms warm), which is the price of the run meaning what it says.
- **`vitest.config.ts` sets `testTimeout: 60_000`, and that is a correctness setting, not a
  convenience.** Vitest's Node default is 5000ms. Three tests in this suite carry no timeout
  of their own and run long enough that a loaded box makes the CLOCK the assertion: measured
  2026-09-28 (cycle 52), `npx vitest run --testTimeout=5000` under twelve busy-loops on a
  4-core container gives `Test Files 3 failed | 117 passed (120)` with three `Test timed out
  in 5000ms` and zero assertion failures, while the same load with 60_000 in place is
  `120 passed (120) / 1089 passed (1089)`. A red vitest run from a timeout looks exactly like
  a broken measurement and is not one. `tests/vitest-timeout-budget.test.ts` fails if the
  line is removed or set under 20_000.
- **Two sweeps in the e2e phase are slow on purpose, and one of them decides whether a new
  composed string is safe.** `tests/e2e/hangul-leak-sweep.regression-37.spec.ts` renders 43
  states in each of `en`, `ja`, `zh` and `ar` — 172 renders — and fails on
  any Hangul a non-Korean reader can see that is not in its commented allowlist. Read it before
  adding a string that is COMPOSED or interpolated at runtime rather than written as a
  `t("…")` literal: `tests/i18n-coverage.test.ts` scans literals and cannot see a composed one,
  which is how `노출 여유 확인` shipped in four locales (cycle 43). Its fixtures are derived
  from `lib/skin.ts` and `lib/skus.ts` rather than written out, so a new signal detail, bucket
  label or SKU name is swept without editing the spec — and a hand-written fixture is exactly
  how the first two passes of that sweep reported 8 and then 192 hits that the product
  cannot produce.
  **Do not put a `waitForLoadState("networkidle")` or a flat `waitForTimeout` into it.**
  Both were there and both came out on 2026-09-29 (cycle 54): timed phase by phase across
  the 172 renders they cost 110,395 ms and 53,060 ms of a 306,244 ms state loop, more than
  the 60,229 ms of `page.goto` they were waiting behind. `settle()` replaces them — the
  page's non-empty text-node count has to hold still for 250 ms, `html[lang]` has to be
  the locale under test and the fonts have to be in — and it is the stricter wait, because
  a render still adding nodes never satisfies it. The two specs went from 9 passed (5.8m)
  to 9 passed (3.6m) with all 172 renders reporting byte-identical node, character and hit
  counts, and `npm run smoke` on this container from 300 passed (17.7m) on the merge base to
  300 passed (15.8m). Sweeping the four locales CONCURRENTLY was measured and rejected in the same
  cycle: four MediaPipe runtimes on four cores drop `/scan ready` from 41 rendered text
  nodes to 23, so it sweeps less.
- **A Playwright wait and a `document.querySelectorAll` read do not see the same page, and
  under `next dev` that difference has a button in it.** (The gate stopped running `next
  dev` in cycle 56, so this is now a hazard of the `ARU_E2E_SERVER=dev` opt-in — and of any
  future dev-only measurement.) CSS selectors given to
  `page.locator()` pierce open shadow DOM; `document.querySelectorAll` inside
  `page.evaluate` does not. `next dev` mounts `<nextjs-portal>`, whose shadow root holds
  exactly one button and it carries `aria-controls`
  (`#next-logo[aria-controls="nextjs-dev-tools-menu"]`) — measured on `/`, `/care`, `/scan`
  and `/report`. It is on the page ~100 ms before a route paints (95–448 ms over 14 loads of
  `/care`), so `page.locator("button[aria-controls]").first().waitFor()` can pass while the
  light DOM holds none: on `/care` with no survey, which renders no toggles at all, that wait
  resolves in 203 ms against the overlay's button. That is what failed
  `care-merchant-disclosure.regression-12` once in cycle 54's smoke and was reproduced 3
  times in 120 loads on 2026-09-29 (cycle 55). **Wait on the DOM your assertions read** — one
  `page.waitForFunction` over `document.querySelectorAll`, requiring every `aria-controls`
  target to exist and the count to hold still — rather than on a locator that can match
  something the assertion cannot see.
- `eslint` ignores `test-results/**` and `playwright-report/**`. It did not before, and
  because `smoke` runs `lint` first, one earlier failing e2e run turned `0 errors, 2
  warnings` into `215 errors, 4020 warnings` over 6366 files of captured trace JS.

Test counts grow with features; the latest run evidence in
[STATUS](docs/STATUS.md) and `docs/qa/` takes precedence over the numbers
here. The counts above were last re-derived by running each suite on
2026-09-18 (cycle 13).

### Extra verification by change type

| Changed area | Minimum extra verification |
|---|---|
| Camera / ROI | Related Vitest + `test:mobile-ui` + `test:ios-safari` + the Android/iOS physical-device matrix |
| Supabase schema | `npm run supabase:check`, anon/auth denial, service-role rollback, private bucket |
| Email | subscribe/unsubscribe/retention tests + a 2-/4-week dry-run to a real address |
| Security headers / CSP | Security tests + Chromium hydration/service worker/MediaPipe |
| Recommendation / commerce | Claim and product-trust tests + allow-listed retailer redirects |
| Product copy / translation | Copy contract + i18n coverage + the locale/viewport text-fit matrix |
| Android | `npm run android:check`, signed-artifact verification, TWA on a physical device |
| Play materials | `npm test -- tests/play-store-pack.test.ts`, cross-check against Console declarations |

### Definition of done

1. Pin the problem with a failing test or reproduction evidence.
2. Pass the target test with the smallest in-scope implementation.
3. Pass the full smoke, the production dependency audit and
   `git diff --check`.
4. Check the core flows, console, network, overflow and touch targets in a
   mobile browser.
5. Repeat the same canary on the new production deployment after merge.
6. Never mark physical-device, external-provider or Console items complete
   without separate evidence.

## Web production deployment

1. Pass a clean install and `npm run smoke` on `main`.
2. Apply [supabase/schema.sql](supabase/schema.sql) to production Supabase.
3. Reproduce RLS on the 9 app tables and the `anon`/`authenticated` CRUD
   denial.
4. Verify the private crop bucket, service-role rollback and retention
   policy.
5. Verify Vercel production secrets, allowed origins, provider spend limits
   and Firewall rules.
6. Verify real Resend delivery, signed unsubscribe, withdrawal exclusion and
   the 30-day cleanup.
7. Deploy to Vercel production and confirm the canonical domain points at the
   new deployment.
8. Run the `/`, `/scan`, `/survey`, `/report`, `/privacy`, core API and
   MediaPipe asset canary.
9. Check Vercel runtime error logs, browser console/network and mobile
   rendering.
10. Record the deployment ID, merge SHA, test results and remaining external
    gates in `docs/qa/`.

The 2026-07-19 product polish shipped as [PR #55](https://github.com/seonkistall/aru/pull/55),
merge `024784c`, Vercel production deployment
`dpl_FCKydr4QKpM5Zh28aGrkxev6Ad8U`. Post-deploy, 16 mobile route cases, the
locale set, email/camera/redirect focused flows, CSP, RLS wiring, API auth
boundaries and MediaPipe assets were re-checked with zero failures and zero
recent 5xx/runtime errors. Exact commands, numbers and remaining external
gates are recorded in the
[verification report](docs/qa/2026-07-19-product-polish-loop.md).

## Android TWA

`android/` is a Bubblewrap-generated TWA project in which
`com.seonkistall.aru` opens only `https://aru-beauty.vercel.app`. The current
release builds the checked-in Gradle wrapper directly and keeps the Bubblewrap
CLI out of the npm release graph.

| Item | Value |
|---|---|
| Package | `com.seonkistall.aru` |
| Version | `1.1.0 (11000)` |
| Web origin | `https://aru-beauty.vercel.app` |
| Min SDK | 23 |
| Compile/target SDK | 36 |
| Orientation | adaptive/any |
| Android permissions | No camera, storage, media, location, microphone, contacts or `AD_ID` |
| Signing | Ignored keystore + process environment only |
| Artifacts | Ignored `app-release.aab`, `app-release.apk` |

```bash
npm run android:check
```

The release keystore and `.env.android.local` are excluded from Git. Only the
public upload-certificate fingerprint is recorded — identically — in
`public/.well-known/assetlinks.json` and `android/twa-manifest.json`.

Once Play App Signing is enabled, the Console-issued distribution-certificate
SHA-256 must be added to `assetlinks.json` alongside the existing upload
fingerprint and the Web redeployed. Then re-verify on a Galaxy internal-track
install that the address bar disappears and camera/back/external links/rotation
behave.

Reproducible setup, build and verification: [Android build
runbook](docs/android-build-runbook.md). Latest artifact hashes and signing
evidence: [Android artifact QA](docs/qa/2026-07-16-android-artifact.md).

## Google Play submission

`docs/play-store/` holds the submission materials:

- ko-KR/en-US app name and short/full descriptions
- Data safety worksheet
- Privacy-policy review sheet
- Content-rating answer rationale
- Reviewer instructions
- 1.1.0 release notes
- Internal-testing checklist
- 512×512 app icon and 1024×500 feature graphic
- Four 1080×2160 phone screenshots of the real questionnaire flow

```bash
npm test -- tests/play-store-pack.test.ts
node scripts/generate-play-assets.mjs
```

### External owner gates before Console submission

- Resolve Play Console developer identity verification and the payment
  account warning
- Enter the real developer/entity name and a public support email
- Encrypted external backup of the upload key and environment files
- Reflect the Play App Signing distribution certificate in Digital Asset
  Links
- Upload the AAB and create an internal testing release
- Galaxy S25 Edge internal-track TWA physical QA
- Finalise the pre-launch report, Data safety, content rating and privacy
  policy URL
- Confirm account type and creation date; new personal accounts (post
  2023-11-13) additionally need mobile device verification and a 12-tester,
  14-day closed test

Detailed order: [Google Play internal test
checklist](docs/play-store/internal-test-checklist.md) and [Reviewer
instructions](docs/play-store/reviewer-instructions.md).

## How this foundation was hardened

The base this README describes was strengthened in this order:

1. Enabled Supabase RLS and revoked direct browser `anon`/`authenticated`
   privileges.
2. Added body limits, schema validation, per-IP limits and provider timeouts
   to `/api/analyze` and `/api/reason`.
3. Removed the pilot participant/session scoped-consent fallback and pinned
   it with regression tests.
4. Verified the Galaxy S25 Edge permission/mirroring/quality-gate/capture/
   retake basic flow.
5. Self-hosted the MediaPipe model/WASM/JS same-origin and added asset smoke
   checks.
6. Consolidated product scope, the medical boundary, data retention, KPIs and
   the Web/TWA/Play gates into a single PRD.
7. Progressively split the stream, landmarker, quality-loop, capture-analysis
   and consent responsibilities out of `scan/page.tsx`.
8. Implemented explicit email opt-in, signed expiring unsubscribe, withdrawal
   exclusion and retention cleanup.
9. Added the enforced CSP, security headers, Vercel Firewall and production
   Supabase runtime validation.
10. Pinned the multilingual UI from 320px to 768px, 44px touch targets, the
    camera fallback and the Studio/Privacy flows with real Chromium
    regressions.
11. Prepared the API 36 Android TWA, release signing, Digital Asset Links,
    signed AAB/APK and the Play submission pack.
12. Rewrote the consumer copy from home to check-in in one friendly product
    voice, authoring EN/JA/ZH separately for each locale's own word order and
    service conventions rather than translating literally.
13. Hardened the iPhone Safari background/`mute`/`ended`/`pagehide` camera
    lifecycle with an explicit resume flow and WebKit 26.5 multilingual
    regressions.
14. Added the Arabic locale with a full right-to-left layout, made English the
    default, and promoted the reason model to GPT-5.6 with a pre-deploy model
    check (`npm run openai:check`).

### Recent release commits

| Commit | Change |
|---|---|
| `b9d3030` | `openai:check` — verify the reason model id before deploying |
| `e415f34` | Reason model promoted to GPT-5.6; Build Week submission pack |
| `07fc321` | PR #62 Arabic locale (RTL), English default, language switcher |
| `ece4617` | PR #60 iPhone Safari camera lifecycle, WebKit regressions, production deploy |
| `1d2738b` | Supabase runtime secret shape and masked-value defence |
| `ba9053f` | Android adaptive orientation |
| `83e7700` | Returning-home core touch-target restoration |
| `1e884e6` | Mobile QA and Play-readiness gap fixes |
| `72de855`–`f4bce3e` | Product QA ISSUE-001–009 Web/copy/email regression fixes |
| `024784c` | PR #55 product polish: 10 issues, docs and regression tests merged to production |

The full change history — including every `codex/` session branch — is public
at <https://github.com/seonkistall/aru-buildweek>.

## Operational troubleshooting

### The camera does not open

- Confirm an HTTPS or loopback origin.
- Check browser/OS camera permission and whether another app holds the
  camera.
- Confirm `Permissions-Policy` is `camera=(self)`.
- Confirm the questionnaire-only fallback stays visible to the user.
- On iPhone Safari, after visiting another tab or app, press "Turn the camera
  back on" to start a fresh stream. A black preview is never analysed as-is.

### A face is visible but the quality gate will not pass

- Move to soft frontal lighting; avoid direct reflections and backlight.
- Clean the lens and keep the T-zone and cheeks clear of hair, hands and
  masks.
- Match the on-screen distance and centering guidance.
- Before loosening any threshold, check for regressions against the
  [golden set](docs/golden-set.md) and the physical-device matrix.

### MediaPipe fails to load

```bash
npm run assets:mediapipe
npm test -- tests/mediapipe-assets.test.ts
```

Confirm the model/WASM/JS under `public/vendor/mediapipe/` return same-origin
200s and that the CSP and service-worker cache allow those paths.

### `/api/sync` reports `configured: false`

- Check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, a 32+ character
  `SUPABASE_SYNC_TOKEN`, the private bucket and allowed origins.
- Create a new production deployment after changing Vercel environment
  variables.
- Never print real secrets to logs.
- Run the unauthenticated/disallowed-origin/rollback checks of the
  [Supabase sync runbook](docs/supabase-sync-runbook.md) in order.

### Emails are not delivered

- Verify the Resend domain and that `REENGAGE_FROM` matches it.
- Check the production scope of `RESEND_API_KEY`, `REENGAGE_LINK_BASE`,
  `UNSUBSCRIBE_SECRET` and `CRON_SECRET`.
- Confirm the subscriber is in an explicit opt-in state and not withdrawn or
  past the 4-week completion.
- Check the real inbox, the spam folder, Resend events and Vercel runtime
  logs together.

### The TWA shows an address bar

- Determine whether the installed build is signed with the upload key or the
  Play distribution key.
- Confirm that SHA-256 exists in the production
  `/.well-known/assetlinks.json`.
- Confirm the package name and origin exactly match `com.seonkistall.aru` and
  `https://aru-beauty.vercel.app`.
- Redeploy the Web app, reinstall the app and re-verify the association.

## Documentation guide

### Build Week

- [Submission pack](docs/buildweek/SUBMISSION.md) — description,
  judging-criteria mapping, checklist state
- [Build log](BUILDLOG.md) — how it was built, Codex usage and key decisions
- [User research](docs/buildweek/user-research.md) — moderated-interview
  findings, stated plainly
- Demo scripts — [English](docs/buildweek/DEMO-SCRIPT.md) ·
  [Korean](docs/buildweek/DEMO-SCRIPT-KO.md)

### Product / UX

- [PRD](docs/PRD.md) — product promises, users, data, KPIs, release gates
- [i18n PRD](docs/i18n-prd.md) — multilingual product requirements
- [i18n UX flow](docs/i18n-ux-flow.md) — per-language user flows
- [Consumer product copy design](docs/superpowers/specs/2026-07-19-product-copy-design.md) — voice, per-screen copy, locale and text-fit contracts
- [Commerce partnership playbook](docs/commerce-partnership-playbook.md) — retailer and partner operating principles

### System / ML

- [Architecture](docs/architecture.md) — browser, API, data and ML structure
- [Analysis performance roadmap](docs/analysis-performance-roadmap.md)
- [ML camera upgrade plan](docs/ml-camera-upgrade-plan.md)
- [ML inference architecture](docs/ml-inference-architecture.md)
- [Pilot ML loop](docs/pilot-ml-loop.md) — consented pilot collection and evaluation
- [Golden set](docs/golden-set.md) — camera-reading regression protocol
- [iPhone Safari camera QA](docs/qa/2026-07-20-ios-safari-camera.md) — WebKit lifecycle regressions and the remaining physical gate
- [Worker offload](docs/worker-offload.md) — browser worker separation plan

### QA / operations

- [Status](docs/STATUS.md) — evidence-based current state and blockers
- [Production release checklist](docs/production-release-checklist.md)
- [Multilingual product copy QA](docs/qa/2026-07-19-product-copy-polish.md)
- [Release completion canary](docs/qa/2026-07-19-release-completion-canary.md)
- [Post-deploy security](docs/qa/2026-07-17-post-deploy-security.md) — CSP and Firewall verification
- [Supabase production QA](docs/qa/2026-07-18-supabase-production.md) — RLS, role and bucket evidence
- [Mobile camera QA](docs/mobile-camera-qa.md) — Android/iOS physical-device matrix
- [Supabase sync runbook](docs/supabase-sync-runbook.md) — RLS, sync and deletion operations
- [Re-engagement setup](docs/reengage-setup.md) — Resend, unsubscribe and retention

### Android / Google Play

- [Android build runbook](docs/android-build-runbook.md) — signed TWA build and verification
- [Android artifact QA](docs/qa/2026-07-16-android-artifact.md) — AAB/APK hash, signing and permission evidence
- [Internal test checklist](docs/play-store/internal-test-checklist.md) — Console and test-track gates
- [Data safety](docs/play-store/data-safety.md) — Play declaration worksheet
- [Privacy policy review](docs/play-store/privacy-policy-review.md)
- [Reviewer instructions](docs/play-store/reviewer-instructions.md)

## License and contributing

This repository is currently managed as a `private: true` application package.
Check the repository owner's policy before external reuse or redistribution.
Licenses of dependent assets follow each package's and artifact's notices.

Change PRs must consider the product boundary, the consent/retention
contracts, the mobile fallbacks and the production gates together. Passing
tests alone never marks physical-device, provider, Supabase, Resend or Play
Console verification as complete.
