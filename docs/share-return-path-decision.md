# What should a shared /studio card link back to?

Cycle 26, 2026-09-21. **A decision for the owner. Nothing in this cycle implemented any of
it, deliberately.**

## 1. Why this is written down instead of fixed

`shareCardImage` (`app/components/share-card.tsx:79`) takes an optional `shareUrl` and, only
when it is set, adds `text` and `url` to the `navigator.share` payload:

```ts
...(opts?.shareUrl ? { text: t("친구도 링크에서 30초 만에 자신의 피부를 살펴볼 수 있어요."), url: opts.shareUrl } : {}),
```

under a comment that says "Include the deep link so the shared post carries a way back to aru
(viral loop)". Its one call site, `app/studio/page.tsx:95`, does not pass it. `grep -rn
shareUrl` over the tree returns those two lines and three references in `docs/AUTOPILOT.md` —
no test, no other caller. So every card shared from `/studio` is a bare PNG with no route
back, and `share_landed` / `viralActivation` can never be driven from that surface.

It looks like a one-line fix and it is not, which is why cycle 25 did not make it and why
this cycle did not either. `lib/share-link.ts:moodShareUrl(levels)` — the only link builder
that exists — needs `{ oil, redness, pores }` as integers 0-2, and **`/studio` does not have
them**. Its state is `headline: string` and `reads: { label, value, calm }[]`, both filled
from free-text `<input>`s whose entire purpose is that the user rewrites them
(`app/studio/page.tsx:140-141`). What a studio card should point at is a product question
about what the product is claiming, and a cycle that guessed it would be putting words in
the owner's mouth on the one surface that talks to strangers.

## 2. What the pieces actually do

| Piece | Behaviour, read from source |
|---|---|
| `moodShareUrl(levels, origin?)` | `${origin}/#m=${oil}${redness}${pores}`. Hash fragment, so the levels never reach a server — that is the whole privacy design of the link. |
| `MoodFromLink` (`app/components/mood-from-link.tsx`) | Renders the friend's mood card **only** when `readMoodFromHash` finds `#m=NNN`, and fires `share_landed` in the same branch. |
| `viralActivation` | Divides by `share_landed` (`app/ops/page.tsx:595`). No `#m=`, no landing, no denominator. |
| `/scan`'s share | `moodShareUrl` from the live reads, copied to the clipboard (`app/scan/page.tsx:311`). Unedited by construction. |
| `/studio` prefill | `sessionStorage[DEVICE_DATA_KEY.reads]`, then `loadLastResult()?.reads`, else a preset. `SkinReads` carries `.level` per axis, so the levels **are** available at prefill — they are simply not kept. `fromScan` already records which of the two happened. |

Two mismatches to hold in mind for the options below. The card has **four** rows (유분,
모공/결, 붉은기, 전반) and a mood link has **three** axes; 전반 has no level. And the two
presets are not scans at all, so a preset-prefilled session has no levels in any form.

## 3. The options, and what each one costs

### A — mood link when the card came from a scan, nothing otherwise

Capture the three levels at prefill, pass `moodShareUrl(levels)` when `fromScan`.

- Receiver gets the friend's-mood landing; `share_landed` fires; the loop becomes measurable
  from `/studio`.
- **The card and the link can disagree.** The user edits "유분 적음" to anything they like and
  the link still encodes the scan's level 0. This is the page whose job is editing, so that is
  the expected case, not the edge case. Not a medical claim in either half, but the product
  contradicting itself in front of a stranger.
- Preset-prefilled shares still carry no return path, so the original defect survives for an
  unknown share of sessions. Nothing in the repo measures how many `/studio` visits are
  preset-only — the flush is off (PIPA blocker), so nobody can know today.

### B — a bare origin link on every share

Pass `window.location.origin` (or the deployed origin) with no fragment.

- Every shared card carries a route back, including preset sessions. Cannot ever contradict
  the card, because it claims nothing.
- **Buys nothing for measurement.** No `#m=`, so `MoodFromLink` renders nothing and
  `share_landed` never fires. This is revenue-upstream item 3's acquisition value without item
  2's; the aggregate landings-per-send stays as uncomputable from `/studio` as it is today.
- Making it measurable later means putting something else in the URL, which is a fresh
  privacy decision, not an extension of this one.

### C — derive the levels back out of the edited card text

Reverse-map the value strings through `MOOD_LABELS`.

- **Rejected on the evidence, not on taste.** The values are free text, and the two shipped
  presets already contain strings that are not in `MOOD_LABELS` at all — the 전반 row's
  "편안한 편" and "균형 조절 필요" have no mood axis to map to. So the derivation silently
  yields nothing the moment anyone types, which is the same defect as today with more code.
  Listed so the next cycle does not re-derive it.

### D — leave it as it is

- Studio shares stay bare PNGs; the loop stays unmeasurable there; the dead parameter stays,
  which is itself a trap — it reads like an oversight and invites exactly the guess this
  document exists to prevent.

### E — mood link while the card still says what the scan said, bare link once it does not

Keep the levels **and** the prefilled strings at prefill. Send `moodShareUrl(levels)` while
every value still matches its prefill; send the bare origin as soon as any of them differs, or
when the card came from a preset.

- Every share carries a return path (B's floor), and an unedited share is measurable (A's
  ceiling), and the two halves can never contradict each other.
- Costs a little more state in `/studio` and one comparison; no new field in any URL, no new
  identifier, no change to what leaves the device.
- The honest catch: it makes the link's behaviour depend on something invisible to the user —
  two people tapping the same button get different payloads. Whether that is acceptable is a
  product judgement, which is why this is still the owner's call and not a default.

## 4. What is not on this list

**A share id in the URL.** It would make per-share attribution possible where `#m=NNN` cannot
(`docs/AUTOPILOT.md`'s revenue-upstream item 3 says so). It is excluded here because it puts a
new identifier into a link people paste to each other, which is a privacy decision of a
different kind and sits behind the same owner call as the share-preview fork in
`docs/share-preview-findings.md`. Naming it, not proposing it.

## 5. Recommendation, and what would change it

**E**, with **B** as the fallback if the conditional payload is judged too clever. Both give
the property the comment in `share-card.tsx` has been promising since it was written: a shared
post that carries a way back. A is the one to avoid on its own, because it takes the surface
that exists for editing and makes the edit break the link's truthfulness.

What would change the recommendation: a measurement of how many `/studio` sessions are
preset-only. If it is near zero, A and E converge and A is simpler. That measurement needs the
funnel flush, which is owner-blocked on the PIPA question — so the recommendation stands on
what can be known today, and this sentence records what would settle it.
