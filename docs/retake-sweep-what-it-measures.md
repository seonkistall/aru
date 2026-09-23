# What a 120-seed retake disagreement count actually measures

Written 2026-09-23 (cycle 31), to close one open question on the retake sweep and to
stop the next cycle re-opening it.

## The question

`tests/retake-signal-rule.test.ts` carries a re-derivation of the 120-seed disagreement
table cycle 11 chose the retake rule from. The original script was not kept. Cycle 18
recorded what happened when it was re-derived:

> 반사 and 피부 영역 came back within a handful of seeds; 조명 did not, in both
> directions (dark oil 21/120 against 71/120, dark pores 120/120 against 4/120), because
> the fixture construction is a re-derivation and not the original script.

A re-derivation differing from the original is expected. Differing by that much, in
opposite directions, on one condition only, is a question — and "the construction is
different" is a restatement of the failure rather than an account of it.

## The answer, measured

`ARU_PRINT_RETAKE_SPLIT=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
clean and degraded level distributions behind each count. Verbatim:

```
SPLIT condition	attr	clean levels	degraded levels	degraded pinned	disagreements
SPLIT 조명 dark	oil	0:103 1:17 2:0	0:82 1:38 2:0	no	21/120
SPLIT 조명 dark	redness	0:29 1:91 2:0	0:0 1:120 2:0	yes	29/120
SPLIT 조명 dark	pores	0:59 1:61 2:0	0:0 1:0 2:120	yes	120/120
SPLIT 조명 blown out	oil	0:103 1:17 2:0	0:0 1:0 2:120	yes	120/120
SPLIT 조명 blown out	redness	0:29 1:91 2:0	0:120 1:0 2:0	yes	91/120
SPLIT 조명 blown out	pores	0:59 1:61 2:0	0:120 1:0 2:0	yes	61/120
SPLIT 반사	oil	0:103 1:17 2:0	0:0 1:0 2:120	yes	120/120
SPLIT 반사	redness	0:29 1:91 2:0	0:0 1:0 2:120	yes	120/120
SPLIT 반사	pores	0:59 1:61 2:0	0:59 1:61 2:0	no	0/120
SPLIT 피부 영역	oil	0:103 1:17 2:0	0:78 1:42 2:0	no	37/120
SPLIT 피부 영역	redness	0:29 1:91 2:0	0:30 1:90 2:0	no	33/120
SPLIT 피부 영역	pores	0:59 1:61 2:0	0:60 1:60 2:0	no	49/120
```

**In seven of the twelve rows the degraded capture's level is pinned** — every one of
the 120 seeds publishes the same level, because the degradation is far enough past the
cut that a noise field cannot move it. In those rows the disagreement count is not a
measurement of the condition at all. It is a readout of the CLEAN capture's split:

| row | degraded pinned at | clean split | count | identity |
|---|---|---|---|---|
| 조명 dark, redness | 1 | 0:29 1:91 | 29/120 | = clean level-0 count |
| 조명 blown out, redness | 0 | 0:29 1:91 | 91/120 | = clean level-1 count |
| 조명 blown out, pores | 0 | 0:59 1:61 | 61/120 | = clean level-1 count |
| 조명 dark, pores | 2 | 0:59 1:61 (no 2s) | 120/120 | = all of them |
| 조명 blown out, oil | 2 | 0:103 1:17 (no 2s) | 120/120 | = all of them |
| 반사, oil | 2 | 0:103 1:17 (no 2s) | 120/120 | = all of them |
| 반사, redness | 2 | 0:29 1:91 (no 2s) | 120/120 | = all of them |

Exact in every row, not approximate.

And the clean split is an artefact of the fixture, not of anything physical. `tuned()`
bisects each fixture until the clean capture's raw value sits on that attribute's cut
point **at seed 1, the only seed it looks at**. Every other seed draws a different noise
field and lands wherever that field puts it. Seed 1's field is not the median one, which
is why the splits are 103/17, 29/91 and 59/61 rather than anything near even. Change the
construction — a different bisection target, a different noise generator, a different
seed to tune on — and those splits would move, taking every pinned row's count with
them. That last step is an inference from the identity below; no alternative
construction was run.

**That accounts for half of the 조명 discrepancy, not all of it.** The backlog named two
rows. 조명 dark pores (120/120 against a written 4/120) is pinned at 2, a level the clean
capture never reaches, so its count is fully a readout of the construction. **조명 dark
oil (21/120 against a written 71/120) is NOT pinned** — its degraded split is
`0:82 1:38` — so the identity does not explain it. Its clean split `0:103 1:17` comes
from the same seed-1 bisection, which is a reason to expect that count to depend on the
construction too, not a measurement that it does. Where a row IS pinned, the count
reports the clean level-0 fraction when the degraded level pins high, and the level-1
fraction when it pins low.

*Supervisor correction, cycle 31 review:* the worker's draft of this file said eight
rows were pinned and that every 조명 row that failed to reproduce was a pinned one. The
printed table above has seven `yes` rows, and dark oil — one of the two rows the
backlog named — is `no`. Corrected against the table, not re-derived.

Asserted rather than only printed, on the cheapest row that shows it: `tests/retake-signal-rule.test.ts`
→ "pins the degraded level while the clean level moves, which is what the count reads".

## What this does and does not change

**The retake rule is unaffected, and not merely "still standing".** A pinned row says
something stronger than its count does: on that condition the published reading is
decided entirely by the degradation, whatever the face underneath is doing. **Four of
the seven pinned rows pin at a level the clean capture never reaches at all** — 조명
dark pores, 조명 blown out oil, 반사 oil, 반사 redness, each `120/120` — so the degraded
capture publishes a reading the clean capture never publishes, on every seed. The other
three pin at a level the clean capture sometimes also reaches, and there the count is
the size of the clean bucket that disagrees. Either way the condition, not the face,
settles what gets published. That is the case for asking for a retake.

**What must stop being quoted is the fraction.** Any single pinned row's `n/120` is a
property of one noise field and one bisection, so it is not a number to compare across
re-derivations, to put in a doc, or to set a threshold against. The original 4/120
(dark pores, pinned) is not recoverable and there is nothing to recover: the quantity it measured is
not stable under a change of construction. This closes the "only a new measurement can
settle it" clause for pinned rows — a new measurement of a pinned row settles nothing.
It does not close it for 조명 dark oil, which is unpinned; that row's 21 against 71
remains unexplained.

**Four rows are genuine per-seed measurements**, where the degraded level moves too:
피부 영역 on all three attributes (37, 33, 49 of 120) and 조명 dark on oil (21/120).
These are the rows worth quoting and the rows a future construction change should be
checked against.

**One row is a real per-attribute zero and was not noticed before:** 반사 pores,
`0/120`, with the degraded distribution `0:59 1:61` identical to the clean one. The
glint condition costs the pores reading nothing on any seed. The rule's premise holds
per CONDITION — 반사 costs oil and redness on every seed — but "every condition costs a
published reading on a sixth of the seeds or more" is not true per attribute, and this
doc is where that exception is written down.

## 조명 dark + oil: 71 is not reachable from these two splits (2026-09-23, cycle 32)

The one row the section above leaves open. It is not pinned (`0:82 1:38`), so cycle 31's
identity does not apply to it and its 21/120 is a real per-seed count. What 71 could have
been is now answered as far as this construction can answer it.

`ARU_PRINT_RETAKE_OIL=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
2x2 over the 120 seeds at the committed construction (tuning seed 1, cheekL 60):

```
OIL contingency tuneSeed=1 cheekL=60	c00=82 c01=21 c10=0 c11=17
```

**The clean-1 / degraded-0 cell is empty.** No seed that reads level 1 on the clean
capture drops to level 0 when the capture is darkened, so the count is not two
independent splits colliding — it is exactly the difference of the marginals,
`38 - 17 = 21`, which is the number the sweep reports.

**That puts 71 out of reach, by arithmetic on measured numbers.** With `a` clean level-1
seeds and `b` degraded level-1 seeds over the same 120 seeds, disagreements are
`c01 + c10`, and `c01 <= min(120 - a, b)`, `c10 <= min(a, 120 - b)`. At the measured
`a = 17, b = 38` the largest any rearrangement of those seeds could give is
`38 + 17 = 55`. A different noise field cannot produce 71 from these splits; a different
fixture, cut point or analyzer is required. Asserted in
`tests/retake-signal-rule.test.ts` → "has an empty clean-1/degraded-0 cell, so its count
is the difference of the two splits", so a construction change that moves any of it fails
a named test rather than quietly re-opening the question.

**Two sweeps say how far the count moves under the two knobs it could depend on**, and
they behave in opposite ways to a pinned row:

```
OIL tuneSeed	clean level-1	degraded level-1	disagreements
OIL 1	17	38	21/120
OIL 2	65	65	12/120
OIL 3	87	76	13/120
OIL 5	63	65	12/120
OIL 8	89	79	12/120
OIL 13	8	24	16/120
OIL 21	34	49	17/120
OIL 34	101	83	18/120
OIL cheekL	clean level-1	degraded level-1	disagreements
OIL 40	17	43	26/120
OIL 50	17	41	24/120
OIL 60	17	38	21/120
OIL 70	17	34	17/120
OIL 80	17	31	16/120
OIL 90	17	31	14/120
OIL 100	17	32	15/120
OIL 120	17	24	9/120
```

Re-seeding the bisection swings the CLEAN split by an order of magnitude (17 to 101
level-1 seeds) while the disagreement count stays between 12 and 21. In a pinned row the
count *is* the clean split, so it would have swung with it. Darkening the capture nearly
trebles the count (9 at cheekL 120 to 26 at cheekL 40, with one reversal, 14 then 15,
between cheekL 90 and 100), which is the condition the row is supposed to be reading.

*Measured:* every number in the three blocks above, and the 55 bound, which is arithmetic
on the measured marginals. *Inferred:* that cycle 11's 71/120 came from a different
construction rather than a different arrangement of seeds. At tuning seed 1 the bound
rules out every arrangement of the 120 seeds. **It does not rule out a different tuning
seed:** the same bound computed from the tuning-seed table above is 110, 77, 112, 72 and
83 at tuning seeds 2, 3, 5, 8 and 21 — five of the eight — so 71 is arithmetically
reachable there. What argues against the tuning seed is the measured count, 12 to 21 at
all eight, not the bound. *Supervisor correction, cycle 32 review:* the worker's draft
said "the bound rules out the seed". Nothing here identifies what else differed. *Not established:* which of fixture, cut point or
analyzer changed, and whether some construction not tried here reaches 71. Both need
cycle 11's fixture, which was never committed.

## What this does not answer

Nothing here touches a real face. The fixtures are synthetic frames with seeded
per-pixel noise, and every statement above is about what this construction measures, not
about how often a real dark capture changes a real reading. That needs the golden set,
which is in BLOCKERS.
