# ARU demo video — English narration script (for recording)

Target length **2:52** (hard limit 3:00). Pace assumption: ~150 words per
minute, an unhurried explaining tone. The "Narration" lines are read **verbatim**;
text in brackets is not read.

Total ≈ 400 words. With half-second gaps between segments this lands near 2:50.

Korean-language version: [DEMO-SCRIPT-KO.md](DEMO-SCRIPT-KO.md).

---

## S1 · 0:00–0:16 · The problem

**Screen**: a beauty store shelf, or a fast scroll through product reviews.

**Narration** (38 words / ~16s)

> You have probably stood in a beauty store for ten minutes and walked out
> with nothing. There are thousands of products, and nothing tells you what
> actually suits your skin in thirty seconds.

---

## S2 · 0:16–0:30 · What it is, and who it is for

**Screen**: ARU home in English. The language pill visible top-right.

**Narration** (34 words / ~14s)

> ARU does that in one selfie. English is the default language, because our
> core users are people visiting Korea who cannot read a Korean ingredient
> list.

---

## S3 · 0:30–1:10 · The scan (core demo)

**Screen**: **real device, real capture.** Face aligns, quality chips turn green
one by one, 3-2-1 countdown, auto-capture, analysis animation. No cuts.

**Narration** (60 words / ~25s — leave the remaining ~15s as screen only)

> Line your face up with the guide, and it checks light, distance, steadiness
> and glare on every frame. It only counts down and captures when all four hold
> at once. The basic scan runs entirely on your device — the original photo is
> never uploaded and never stored.

---

## S4 · 1:10–1:45 · The report, and what the model is allowed to say

**Screen**: report steps — analysis, three picks, morning/evening routine. Zoom
briefly on a "why this product" line.

**Narration** (66 words / ~28s)

> It reads three things only: oil, redness, and texture. GPT-5.6 writes the
> reason each product was picked — but every sentence has to pass a banned-claim
> filter built for each of the five languages, and anything that fails is
> replaced with a pre-approved template. This app structurally cannot tell you
> something will improve or whiten your skin.

---

## S5 · 1:45–2:02 · Closing the loop

**Screen**: care screen retailer cards → check-in screen with the week-2 badge.

**Narration** (40 words / ~17s)

> Three product options, a morning and evening routine, and links to where you
> can buy them. Then, two and four weeks later, an email asks how it went — and
> that answer feeds the next recommendation.

---

## S6 · 2:02–2:18 · Five languages, including RTL

**Screen**: open the language picker → Korean → Japanese → **Arabic**. The
left-to-right flip must be on screen.

**Narration** (30 words / ~13s)

> Five languages. In Arabic the entire layout mirrors — including the direction
> of every progress arrow, which we had to fix after seeing them point backwards.

---

## S7 · 2:18–2:44 · How Codex was used, and what went wrong

**Screen**: terminal running `npm run smoke` to a green result → GitHub branch
list showing the `codex/` branches → `lib/scan-geometry.ts` and its test file.

**Narration** (86 words / ~36s)

> We built this with Codex, one branch per working session. Auto-capture failed
> twice on Android. Instead of guessing at thresholds a third time, we pulled
> debug data off a real phone — and found the GPU delegate was emitting
> corrupted landmark coordinates around ten to the thirty-fourth. It was never a
> threshold bug; the input was poisoned. Codex implemented a CPU-delegate
> fallback that self-heals, and we pinned the coordinate maths in unit tests.
> Three hundred and thirty-nine tests guard it now.

---

## S8 · 2:44–2:52 · Impact and close

**Screen**: one slide with the research finding → ARU logo and URL.

**Narration** (30 words / ~12s)

> In moderated interviews, four to five people out of ten said they would buy
> the product ARU picked for them. That is the loop we are building for.

---

# Recording guide

## Order of work

1. **Record the screen first.** Capture S2–S6 in one continuous take on a real
   phone. The scan must be a real face and a real capture — the countdown
   actually running is the only evidence that the core flow works.
2. **Record the terminal** for S7: a full green `npm run smoke` and the branch
   list.
3. **Record narration** segment by segment. A mistake only costs one sentence.
4. **Edit last**, fitting the screen to the narration. Doing it the other way
   round will not fit in three minutes.

## Delivery notes

- Say "GPT five point six", and "three hundred and thirty-nine tests".
- Pause briefly at each full stop. Reading fast makes S3 and S7 end before the
  footage does.
- S3 and S7 carry the Technological Implementation score. Keep those two clear
  and unhurried; the rest can be conversational.

## If it runs over 3:00, cut in this order

1. S6 down to 8 seconds (keep only the Arabic flip).
2. S1 down to 9 seconds (second sentence only).
3. S5 down to 10 seconds (check-in screen only).

**Never cut S3 or S7.** They are the evidence for the two hardest judging
criteria.

## Accuracy — this product's whole positioning is honesty

- S3: "the basic scan" is load-bearing. Sending crops for AI analysis is a
  separate opt-in that does upload. Do not drop those two words.
- S4: this line is only true once `OPENAI_API_KEY` is set in production.
  Verify `/api/reason` returns `source: "llm"` before recording, or change the
  line to describe the filter without claiming live LLM output.
- S8: it is **stated purchase intent**, not purchases. Do not say "bought".
- S7: use the real test count at recording time (`npm test` plus
  `npm run test:mobile-ui`).

## Publishing

- YouTube, **public** (not unlisted, not private).
- Suggested title: `ARU — a 30-second on-device K-beauty skin scan | OpenAI Build Week`
- Put the repository link (<https://github.com/seonkistall/aru-buildweek>) and
  the live URL (<https://aru-beauty.vercel.app>) in the description.
- Add English captions. If you narrate in Korean instead, English captions are
  mandatory rather than optional.
