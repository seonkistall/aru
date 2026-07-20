# User research note

This note records the demand evidence behind ARU's positioning, and is
deliberately explicit about what the evidence does **not** show.

## Method

- **Format:** moderated interviews (researcher present, walking each person
  through the flow and asking follow-up questions).
- **Sample:** 10 people.
- **Date:** the findings were consolidated in the 2026-07-08 strategy review.
- **Task:** run a real skin scan, read the resulting report, and react to the
  specific products it recommended.

## Findings

1. **4–5 of 10 said they would buy a recommended product** through the ARU
   link after scanning — roughly 40–50% stated purchase intent.
2. The intent attached to **the specific product the analysis picked**, not to
   the idea of skincare recommendations in general. That is the part we treat
   as signal: it means the pick itself, not just the novelty of a face scan,
   is doing work.
3. **Value captured: zero.** No affiliate or retail partnership existed, so
   every one of those intents left through an outbound link and earned nothing.
   This gap is what drove the strategy change described below.

## What this evidence is not

- **Stated intent is not a purchase.** Moderated interviews carry demand bias:
  a person answering a researcher in the room over-reports willingness to buy.
  The real conversion rate is lower than 40–50% and remains unmeasured.
- **n = 10 is small.** These numbers indicate a direction to test, not a rate
  to forecast from.
- **No retention data.** Whether a user returns for a second scan, or keeps a
  routine for four weeks, is not yet measured — the 2-/4-week email check-in
  exists to start collecting exactly that.

## What changed because of it

The interviews reframed the product. The scan is the hook; the **purchase
moment** is the product. Consequences now visible in the codebase:

- Retailer outlinks and click logging (`/api/out`), kept strictly separate from
  any claim about price, stock, or reviews we cannot verify.
- The 2-/4-week check-in loop (`/checkin`, `/api/reengage/*`), which turns a
  one-shot tool into something with a reason to return.
- Prioritising international users — higher willingness to pay, and curation
  plus logistics act as a moat — which is why the app now defaults to English
  and added Arabic alongside Korean, Japanese and Chinese.

## Next measurement

The honest next step is not a bigger interview round; it is a real transaction.
The plan is a manual concierge round — sourcing and ordering for a small number
of users by hand — to capture actual payment, average order value, margin,
repeat rate and stated objections. Only that converts "stated intent" into
evidence.
