# Should a POST to /api/reengage/subscribe be able to undo an unsubscribe?

Cycle 37, 2026-09-24. **A decision for the owner. Nothing in this cycle changed what
re-subscribing means, deliberately.** Two neighbouring defects in the same files were
measured in the same session and one of them was fixed; §6 says why that fix does not
touch consent.

## 1. What was measured, and how

`tests/reengage-revoked-resubscribe.regression-22.test.ts` drives the real route
handlers — `POST /api/reengage/subscribe`, `POST /api/reengage/unsubscribe` and
`GET /api/reengage/run` — against a fake `reengage_contacts` table that applies each
filter the way Postgres would, including that a comparison against NULL is not true.
It passes on the tree as it stands, which is the point: it records current behaviour
rather than asking for different behaviour.

It is `4 passed` on the unchanged tree. The behaviour it pins:

1. Subscribe `person@example.com` → unsubscribe with a valid token → the row reads
   `consent: false`, `revoked_at` set, `retention_until` set.
2. POST the same address again → the row reads `consent: true`, `revoked_at: null`,
   `retention_until: null`, and it is still **one** row.
3. Age the new `consented_at` past two weeks and run the cron → the runner selects it
   and the week-2 mail goes out.

So: **yes, a POST for a previously-unsubscribed address silently undoes the
unsubscribe**, and it is not merely a flag flip — the address becomes a live mailing
row again.

There is no double opt-in anywhere in the path. `parseSubscribeInput`
(`lib/server/reengage-input.ts:19`) asks for a syntactically valid address and
`consent === true` in the same JSON body, and nothing ever proves the sender controls
the address. The rate limiter is 5 per minute per client key
(`app/api/reengage/subscribe/route.ts:13`), which slows a bulk run and stops nobody
targeting one address.

## 2. Why the loop did not fix it

It is a consent decision, and the guardrail is "never invent a consent flow". Every
repair here is a product promise the owner has not made: double opt-in changes what
the form means, a revoked-address block changes what the button does for a person who
genuinely wants back in, and a revocation-history column changes what the table keeps
about people. None of those is a bug fix; each is a decision about what ARU tells
someone about their own address.

## 3. What this is NOT

`reengage_contacts.consent` is a **third** consent stream, separate from the two in
`lib/consent.ts` (`ai_analysis` and `learning_crop`,
[`lib/consent.ts:5`](../lib/consent.ts)). No file in the re-engagement path imports
`lib/consent.ts` — `grep -rn "lib/consent" app/api/reengage/ app/components/reengage-optin.tsx app/unsubscribe/ lib/reengage.ts`
returns **0** lines. Nothing here merges the streams and nothing below proposes to.
This is the email-reminder stream alone.

## 4. What the row keeps after the overwrite

The upsert payload is ten columns
(`app/api/reengage/subscribe/route.ts:37-46`); after the second POST the ones that
mattered read `consent: true`, `revoked_at: null`, `retention_until: null`. PostgREST's
`ON CONFLICT DO UPDATE` touches only the columns in the payload, so in the real table
`email` and `created_at` (`supabase/schema.sql:187,191`) survive it — and neither
records that a revocation ever happened. The schema has no column that could:
`revoked_at` is a single nullable timestamp, not a log.

The practical consequence: after the overwrite there is **nothing in the database** that
distinguishes a person who has never unsubscribed from a person who unsubscribed and
was re-added by someone else. A complaint about unwanted mail cannot be answered from
the row.

## 5. The options

Korean statutory text could not be fetched from this container — `law.go.kr` is not on
the egress allowlist and quoting PIPA or 정보통신망법 wording from memory is exactly
the kind of fabricated citation the guardrails forbid. So the notes below name the
*obligation in general terms* and flag what has to be checked against the actual
article before anything ships. Treat the legal column as "what to ask counsel", not as
advice.

| | What it does | Cost | The thing to check |
|---|---|---|---|
| **A. Leave it** | Any POST re-consents. | A third party can put a withdrawn address back on the list, and the row cannot show it happened. | Both PIPA and 정보통신망법's rules on advertising email turn on a *verifiable* record of the data subject's own consent, and on a withdrawal being effective. An overwrite that erases the withdrawal is the weakest possible position if anyone complains. |
| **B. Double opt-in** | The POST stores a pending row; a confirmation link makes it live. | The strongest evidence, and the biggest change: a new token kind, a new page, a new email that is sent before the owner has ever enabled sending, and a drop in completed sign-ups. | The confirmation mail itself is arguably a commercial message; whether it is depends on its content, which needs the actual article read. |
| **C. Refuse to resurrect a revoked row** | `subscribe` leaves a row with `revoked_at` set alone, returns 200. | Cheapest and safe against third parties. But a person who genuinely wants back in cannot, from the form, ever again — which is its own problem, and silently returning 200 lies to them. | A permanent block on re-consent is not obviously what the law wants either; withdrawal is meant to be reversible by the person. |
| **D. Keep the withdrawal, stop erasing it** | Add a revocation log (or simply stop nulling `revoked_at` and add `resubscribed_at`), keep the current behaviour otherwise. | Small. Does not stop the third-party POST; makes it *visible*. | The audit-trail half of the obligation, without touching what the button means. Closest to a pure defect fix, which is why it is listed even though it is still a consent decision. |

**The loop's read, offered as a read and not a change:** D then B. D is the piece that
is indefensible to leave — the system currently destroys the record of a withdrawal —
and it changes no promise made to any user. B is the real answer and is a product
decision with a conversion cost the owner should price. C looks cheap and is a trap.
A is only tenable while the table is empty, which it is exactly until
`RESEND_API_KEY` is set.

## 6. The two neighbouring findings, and why one of them was fixed here

**Re-subscribing and the sent markers — measured, not changed.** The same upsert writes
`week2_sent_at: null` and `week4_sent_at: null`. The question was whether that makes the
runner re-send a mail the address already received. Measured: the markers are cleared,
**and no mail goes out on the next tick**, because `consented_at` is replaced by the
current time in the same upsert and the runner gates on
`consented_at <= now - 2 weeks` (`app/api/reengage/run/route.ts:48`). The repeat mail
arrives only once the *new* consent is itself two weeks old. That is ISSUE-008's
deliberate "a renewed consent starts a fresh cycle", already pinned by
`tests/reengage-resubscribe.regression-8.test.ts`. Changing it would change what
re-subscribing means, so it was measured and left alone; both halves — the silence
inside two weeks and the send after — are now pinned.

**The CRON bearer — fixed, and it does not touch consent.** `/api/reengage/run` and
`/api/reengage` each carried a byte-identical `authorized()` comparing the header with
`===`, which returns on the first differing byte. Both now call `cronAuthorized`
(`lib/server/cron-auth.ts`), which hashes each side to a 32-byte SHA-256 digest and
compares with `crypto.timingSafeEqual`.

Why the hashing, from the primary source rather than from habit: Node's own
documentation for `crypto.timingSafeEqual` says its arguments "must have the same byte
length. An error is thrown if `a` and `b` have different byte lengths"
(`https://raw.githubusercontent.com/nodejs/node/v22.11.0/doc/api/crypto.md`, HTTP 200,
197047 bytes, sha256
`57101386b505d8e574cf522b551edc91dd125ac5140b2738d56f320ac8868dfc`, lines 5449-5451).
Feeding it the raw header would turn every wrong-length header into a thrown error and
a 500 instead of a 401, and pre-checking the lengths to avoid that would leak the
secret's length. Digests are always 32 bytes, so neither problem arises.

This does not touch consent, in the strict sense that it changes **which callers are
authorised: none**. The same header is accepted and the same headers are rejected; only
the timing changes. It is a gate on the *owner's* sending key, not on any user's
consent record — it cannot subscribe, unsubscribe, or alter `consent`, `revoked_at` or
`consented_at`. `tests/cron-bearer-constant-time.test.ts` asserts the accept case still
passes on both routes, which is what makes "no caller changed" a measurement rather
than a claim.

## 7. What is still not established

- Whether any of this is *currently* reachable in production. `reengageSecretsConfigured`
  requires `RESEND_API_KEY`, `REENGAGE_FROM`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET` and
  `REENGAGE_LINK_BASE` (`lib/reengage.ts:16-23`); the subscribe route needs none of
  them and has been storing rows the whole time. So §1 is reachable today and the
  mailing half is not, until the owner sets the keys.
- The actual statutory wording. See §5.
- Whether the rate limiter's client key is the right granularity for an
  address-targeted abuse case rather than a volume one. Not measured here.
