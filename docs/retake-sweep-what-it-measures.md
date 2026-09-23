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

**In eight of the twelve rows the degraded capture's level is pinned** — every one of
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
seed to tune on — and those splits move freely, taking every pinned row's count with
them, between 0/120 and 120/120.

**That is the whole of the 조명 discrepancy.** All four 조명 rows that failed to
reproduce are pinned rows, and the two directions the backlog noticed are the two ends
of the same readout: the count reports the clean level-0 fraction when the degraded
level pins high, and the level-1 fraction when it pins low.

Asserted rather than only printed, on the cheapest row that shows it: `tests/retake-signal-rule.test.ts`
→ "pins the degraded level while the clean level moves, which is what the count reads".

## What this does and does not change

**The retake rule is unaffected, and not merely "still standing".** A pinned row says
something stronger than its count does: on that condition the published reading is
decided entirely by the degradation, whatever the face underneath is doing. **Four of
the eight pinned rows pin at a level the clean capture never reaches at all** — 조명
dark pores, 조명 blown out oil, 반사 oil, 반사 redness, each `120/120` — so the degraded
capture publishes a reading the clean capture never publishes, on every seed. The other
four pin at a level the clean capture sometimes also reaches, and there the count is
the size of the clean bucket that disagrees. Either way the condition, not the face,
settles what gets published. That is the case for asking for a retake.

**What must stop being quoted is the fraction.** Any single pinned row's `n/120` is a
property of one noise field and one bisection, so it is not a number to compare across
re-derivations, to put in a doc, or to set a threshold against. The original 71/120 and
4/120 are not recoverable and there is nothing to recover: the quantity they measured is
not stable under a change of construction. This closes the "only a new measurement can
settle it" clause — a new measurement of a pinned row settles nothing.

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

## What this does not answer

Nothing here touches a real face. The fixtures are synthetic frames with seeded
per-pixel noise, and every statement above is about what this construction measures, not
about how often a real dark capture changes a real reading. That needs the golden set,
which is in BLOCKERS.
