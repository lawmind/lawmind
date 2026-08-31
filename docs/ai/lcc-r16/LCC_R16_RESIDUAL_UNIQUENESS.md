# LCC R16 — the residual uniqueness audit, and the check that could never fire

**Measured 31 August 2026. Implementation commit `29241ef6` (`f95ba723` for the
cohort gate itself), working tree clean on `services/api/src/citations/**`.
MEASUREMENT ONLY — no citation edge written, deleted or rewritten.
`CITATION_BULK_APPLY` stays `HOLD`.**

No resolver behaviour changed in this round. One candidate correction was built,
measured and **refused on its numbers**; the reasoning is in §4 so the next round
does not pay to rediscover it.

---

## 1. The reprove, and it reproduces byte for byte

`scripts/lcc-r15f1-remeasure.mts` re-run unchanged at `29241ef6`:

```
COHORT_TITLES_SCANNED            2295
COHORT_TITLES_RECOGNIZED         1247 -> 1772  (54.3% -> 77.2%)
REACHABLE_FALSE_UNIQUE_CLOSED    97 -> 101  of 180
RECALL_COST_KEYS                 34 -> 39  of 2295
UNREADABLE_FAIL_CLOSED           0
```

The regenerated artifact differs from the committed one in the `measuredAt`
timestamp and in nothing else. On NEW2's own R15 blind package the mixed-case
regression is closed: `declaredMatters` pre-fix `{"0": 472}`, post-fix
`{"0": 294, "1": 178}` — 178 rows now read a matter where the pre-fix grammar
read zero, and none of the 472 is a real cohort, which is NEW2's own zero.

**`POST_FIX_F1 = PASS`.**

### The population, re-derived live instead of restated

`lcc_r15_falseunique` is frozen and cannot grow, so the same question was asked
of the live index (`scripts/lcc-r16-population.mts`, same T0 2026-08-18):

| | |
|---|---|
| `CONNECTED_FALSE_UNIQUES_TOTAL` | **226** — set-identical to the frozen table, 0 in one and not the other |
| `REACHABLE_BY_CURRENT_GATE` | **180** |
| `CLOSED_BY_CURRENT_GATE` | **101** |
| `REMAINING_UNREACHABLE` | **79** — 78 no connector, 1 line-wrapped year, 0 unreadable |

Thirteen further days of NEW2 ingestion added **zero** new false uniques to the
971,879-key T0 population.

**One definition is load-bearing and is recorded here because getting it wrong
costs two orders of magnitude.** A false unique is a key that now covers more
than one distinct normalised `case_title` (`n_title > 1`). Substituting "more
than one distinct `judgment_id`" moves the population from 226 to **33,344**: the
other **33,118** keys gained a second row carrying the *same* case title. Those
are ingest duplicates, not wrong pins — the same authority is reached by either
row. It is a deduplication observation for NEW2, and it is not a resolver defect.

---

## 2. The 78 are not evidence-free. The check that said so could not return true.

R15-F1 concluded the 78 "carry no trace of the sibling at all … UNREACHABLE,
confirmed and now stronger evidence than before". That conclusion came from
`scripts/lcc-r15f1-residue.mts`, whose no-connector branch builds its pattern
from a **template literal with single backslashes**:

```js
new RegExp(`\b${serial}\s*/\s*${year}\b|\bNos?\.?\s*...`, 'i')
```

In a template literal `\b` is **U+0008 BACKSPACE** and `\s` is the letter `s`.
The compiled source is `"\b134s*\\/s*2018\b|…"` — it requires literal backspace
bytes in judgment text, so it returns `false` for every input ever given to it.
The *other* branch in the same file, used for the connector arm, doubles its
backslashes correctly. The two halves of that round's residue were measured with
different instruments and only one of them worked.

A check that cannot fire confirms whatever you hoped. Re-asked with a working
pattern, excluding any sibling that shares the bearer's own serial exactly as
R15-F1 intended to (`scripts/lcc-r16-residue.mts`, 79 keys):

| evidence, readable from the BEARER ALONE | keys |
|---|---|
| sibling's number in the bearer's **cause title** | **13** |
| sibling's number **anywhere in the bearer's body** | **22** |
| bearer's `case_number` names the sibling | 0 |
| bearer body prints common-order language | 9 |

| evidence needing BOTH rows — can never drive the gate | keys |
|---|---|
| shared `content_hash` | 19 |
| same `cnr` | 6 |
| shared `storage_key` / `source_url` | 0 / 0 |

All 22 positives were hand-read. Every one is an explicit, machine-readable
reference the court printed — not a resemblance:

```
In view of the compromise entered into in RSA No.100145/2023, the above appeal…
connected application i.e. Application under Section 482 Cr.P.C. No. 7155 of 2023
For orders, see order passed today in Criminal Appeal No. 210 of 1991
"1. Connect with Application U/S 482 No. - 40456 of 2023
AND Case :- APPLICATION U/S 482 No. - 2283 of 2023
AND FIRST APPEAL NO.884 OF 2023            (filename: FA-3594-19andFA884-2023.odt)
```

**`EXISTING_AUTHORITATIVE_SIGNAL_AVAILABLE = 22` ·
`RETROSPECTIVE_SIGNAL_ONLY = 11` · `NO_AUTHORITATIVE_SIGNAL_AVAILABLE = 46` ·
`AMBIGUOUS_SOURCE = 0`.**

The 46 survive as genuinely unreachable, and that half of R15-F1's conclusion
stands. The 78 figure does not.

---

## 3. Two shapes, and only one of them is a cohort

The 22 split into two populations that want opposite treatment:

- **A second cause title opened by `AND`** — `AND Case :- …`, `AND CIVIL
  APPLICATION NO.738 OF 2021`. A genuine cohort declaration the gate cannot see
  because `AND` is not a connector it knows.
- **A follow-on order** — `For orders, see order passed today in Criminal Appeal
  No. 210 of 1991`. Not a cohort at all: a two-page order citing the judgment it
  follows. This is the class NEW2-R16 already classified, and it is **not** in
  this round's numerator.

---

## 4. `AND` was built, measured, and refused

`AND` was never censused. R15-F1 removed `ANALOGOUS` and `TAGGED WITH` for
firing zero times in 14,452 cause titles and added nothing, so this is a gap
rather than a rejected candidate. It is also the most dangerous word available,
because `and` joins ordinary prose — so it was swept in three named **shapes**
rather than as one widened bound (`scripts/lcc-r16-connector-sweep.mts`, the
R15-F1 instrument extended, same 180 positives and 2,295 controls):

| arm | recall | false refusals |
|---|---|---|
| `V3` shipped grammar, this instrument's proxy | 98/180 (54.4%) | 35/2,295 (1.53%) |
| `V6` + `AND` anywhere | 107/180 (59.4%) | **167/2,295 (7.28%)** |
| `V7` + `AND` at line start | 105/180 (58.3%) | 78/2,295 (3.40%) |
| `V8` + `AND` at line start, capitals only | 104/180 (57.8%) | 67/2,295 (2.92%) |

The best shape buys **+6 true refusals for +32 false ones — 1 : 5.3**. The trade
R15-F1 accepted when it shipped the registry type forms was +4 for +5, **1 :
1.25**. `AND` is four times worse than the worst trade already taken, in its most
conservative shape, and every shape that gains recall costs about five times as
much.

**`ADDITIONAL_RESOLVER_MUTATION = NO.`** Refused on the measurement, not on
taste. Sweeping further shapes was stopped deliberately: the three arms answer
the shape question monotonically, and a narrower rule tuned until the number
improved would be a phrase list scored on the documents it was written from.

Per `LCC-B`, bounded before broadening: `AFFECTED_CANDIDATES` = 2,295 controls +
180 positives · `FALSE_UNIQUE_PREVENTED` = +6 · `TRUE_UNIQUE_WITHHELD` = +32.
Nothing was globalised; no single-candidate citation became unverified.

---

## 5. `serial|year` — the collision is real, and collapsing it is still right

R15-F1 shipped the collapse on 623 events over **2,521** documents, all 25 type
pairs an abbreviation beside its own expansion. That is a thin denominator on
which to clear a fail-**open** risk. Re-attacked over a deterministic 1-in-10
sample of every key-bearing judgment (`scripts/lcc-r16-key-collision.mts`):

```
SERIAL_YEAR_COLLISION_SAMPLE                  138908   (55x the prior denominator)
DOCUMENTS_WITH_COLLISION                       23494
COLLISION_EVENTS                               26196
SAFE_ABBREVIATION_EVENTS                       25538
SERIAL_YEAR_REAL_COLLISIONS (upper bound)        658
  of those that could change the gate             94
```

The 94 — those the shipped parser actually collapsed *and* where a connector was
printed — were **all hand-read**. Ninety-one are one matter under two spellings
(`CCC` / `CIVIL CONTEMPT PETITION`, `MFA` / `MISCELLANEOUS FIRST APPEAL`) or a
prose recital of the document's own number.

**Three are genuinely different registers sharing a serial and a year, so the
collision exists in this corpus and is not hypothetical:**

| judgment | collision | reading |
|---|---|---|
| `6050fe92` Allahabad | `Spl. S.T. No 209 of 2023` vs `Case Crime No 209/2023` | sessions trial and police crime number — both the proceeding *below*, neither a sibling |
| `69fa62d4` Himachal | `Review Petition No.37 of 2020` vs `CR No.37 of 2020` | the review and the civil revision it arises from — a *parent*, not a sibling |
| `748319d2` Bombay | `CIVIL APPLICATION NO. 13134 OF 2025` vs `Criminal Application No.13134 of 2025` | the court's own typo, two sentences apart, for one application |

In all three the colliding partner is a parent or lower-court proceeding, never
a sibling disposed of by the common order — so collapsing them is the **correct**
answer, and `TYPE|serial|year` would have produced a false refusal in each. On
`69fa62d4` the shipped parser reads exactly 2 matters (`RP 37/2020 a/w RP
101/2021`), which is what the court declared; type-keying would have invented a
third.

**`SERIAL_YEAR_REAL_COLLISIONS = 3` confirmed by hand (658 upper bound before
reading) · `SERIAL_YEAR_RULE_SAFE = YES`** — and now safe for a stated reason
rather than for an absence of counterexamples. Matter type is **not** thrown
away: it is still tested whole against `NOT_A_MATTER`, and still reported for
audit.

---

## 6. Fail-closed, and what it does not mean

`LCC-E` verified by test rather than by reading: `cohort.test.ts`,
`cohort-case.test.ts` and `resolver-cohort.test.ts` — 32/32 green — assert both
directions. An unreadable cause title yields `INSUFFICIENT_TO_PROVE_UNIQUE` and
never `UNIQUE`; a readable title that declares nothing is *not* treated as the
unreadable case.

The gate withholds the word "unique". It does not withhold the citation:
`UNIQUE_UNCONFIRMED_COHORT` returns the full `candidates` list, `heldCandidates`,
and `refusedReason: null`. Citation identity evidence, cohort uniqueness
evidence and retrieval evidence stay three separate things.

`UNIQUE_UNCONFIRMED_COHORT` is an already-contracted state.
**`CONTRACT_CHANGE_REQUIRED = NO`** — no new status, reason, enum, field or wire
meaning. No CCR filed.

---

## 7. Two caveats, and a test that is not this round's to fix

**The `AND` sweep is measured on the instrument's V3 proxy, not on the shipped
grammar.** `scripts/lcc-r16-connector-sweep.mts` inherits R15-F1's approximation,
which reads 98/180 at 35/2,295 where the shipped module reads 101/180 at
39/2,295 — it lacks the registry `TYPE_WORD` forms and the `PARENT_MATTER`
before-segment logic. The arms are therefore comparable *to each other* and to
V3, which is what the decision needed; they are not the shipped module's absolute
numbers. Given the 1:5.3 margin this does not change the verdict, but a round
that wanted to ship `AND` would have to re-measure against the module itself.

**The safe/unsafe split in §5 rests on a deliberately generous abbreviation
test** (word containment, or letters-as-subsequence). Generous is the correct
direction — it makes 658 an upper bound — but the 25,538 "safe" events were not
individually read, only the 94 that could change the gate.

**Two citation-suite tests fail in a full-suite run and pass in isolation.**
`old-row-backfill-falsifier.test.ts` — `FIFTH exact shape…` and `mutation of an
already-walked row…` — assert `beforeState === 'UNIQUE'` on a row chosen by
`pickUniqueNeutral`, which is `LIMIT 1` with **no `ORDER BY`** over a corpus
NEW2 is actively writing. Whichever row the planner yields must merely *exist*;
nothing requires it to resolve `UNIQUE`, so it can land on one of the 39 keys the
cohort gate legitimately refuses. Observed: `actual: 'UNIQUE_UNCONFIRMED_COHORT',
expected: 'UNIQUE'`. Run alone the file is **9/9 green**; the full suite is
**101/104**. This is a fixture-selection fragility in a FIFTH-owned falsifier,
not a resolver defect and not a regression from `f95ba723` — and it was left
alone rather than fixed opportunistically inside a resolver-truth round.

---

## 8. State handed to NEW2

```
POST_FIX_F1                              PASS
CONNECTED_FALSE_UNIQUES_TOTAL            226   (live re-derivation, set-identical to frozen)
REACHABLE_BY_CURRENT_GATE                180
CLOSED_BY_CURRENT_GATE                   101
REMAINING_UNREACHABLE                     79

EXISTING_AUTHORITATIVE_SIGNAL_AVAILABLE   22
RETROSPECTIVE_SIGNAL_ONLY                 11
NO_AUTHORITATIVE_SIGNAL_AVAILABLE         46
AMBIGUOUS_SOURCE                           0

SERIAL_YEAR_COLLISION_SAMPLE          138908
SERIAL_YEAR_REAL_COLLISIONS                3   (658 upper bound before hand-reading)
SERIAL_YEAR_RULE_SAFE                    YES

ADDITIONAL_RESOLVER_MUTATION              NO
CONTRACT_CHANGE_REQUIRED                  NO
STRUCTURED_SEARCH_SAME_UNIQUENESS_DEFECT  NO   (unchanged; nothing here disproves it)
NON_COHORT_46_UNTOUCHED                  YES

RESOLVER_READY_FOR_INDEPENDENT_RETEST    YES
CITATION_BULK_APPLY                     HOLD
FINAL_APPLY_AUTHORIZATION                 NO
```

`DATA_CONTRACT_GAP` — **none for the 46.** For the 22 the evidence is already in
`judgments.full_text`; what is missing is not a field but a connector the gate
can afford, and §4 measures why `AND` is not it. No schema change is proposed and
none was made.
