# NEW2 — R19. Attacking R18's 20,556, and the three rules that did not survive being read.

`HEAD` at start: `e2a298e6`. `HEAD` moved to `f4d5371d` mid-round — LCC's citation
boundary parity round and NEW3's R15 adjudication landed underneath. Re-anchored;
neither touches a NEW2 path (`git diff --name-only e2a298e6..f4d5371d` names no
`services/ingest/**` and no `scripts/n2-*`).

R18 measured the corpus and proposed 20,556 corrections. R19 was asked to attack
them until every proposed destructive change is either supported by deterministic
evidence or removed from the actionable population. **520 survive. 19,985 do
not.** The survivors are not the finding.

```
R18_POPULATION_HASH_VERIFIED   YES
POPULATION_ID                  NEW2-R18-EXISTING-9679cff06d0e6404
RECOMPUTED sha256              9679cff06d0e6404ac10481695f1ee4858f8f625755537a75086dcb981f303c9
ROWS                           20,556
STORED_VALUE_MOVED_SINCE_R18   0 of 20,556   (re-read from judgments, row by row)
```

R18 is not edited. R19 is a separate artifact set under `docs/ai/new2-r19/`.

---

## 0. The rule this round was built to obey

**The new extractor is a prediction under test, so nothing it says may be
evidence for a destructive change.** R18's classes are all `neutralCitationFrom`'s
output; adjudicating them with the same function would have measured its own
opinion back.

So `scripts/n2-r19-evidence.mts` imports **nothing** from
`services/ingest/src/harvest/hc-load.ts`. It re-reads the retained text of every
population row and records only facts that exist without the extractor:

- every byte offset at which the stored citation is printed;
- the **CNR** standing nearest to each — the sixteen-character key a court issues
  to one case, and the strongest identity a High Court document prints;
- the row's own case number from the AWS metadata record, and whether the
  document prints it anywhere;
- the damage measurements that decide whether the text can carry evidence at all.

20,556 rows, 19 seconds, `evidence.jsonl` (29.8 MB). Every rule below is built on
that file and on `judgments` lookups of the CNRs it observed.

---

## 1. The dispositions, stated before they are scored

Protective dispositions are tested FIRST, on purpose: a row whose own identity
stands beside the stored citation must not be reachable by a destructive rule.

| rule | disposition | what it asserts |
|---|---|---|
| `C1a` | `CURRENT_VALUE_PROVEN_CORRECT` | this row's own CNR is within 60 chars of the stored citation |
| `C1b` | `CURRENT_VALUE_SUPPORTED_BY_OWN_CASE_NUMBER` | its own case number is |
| `C2a` | **destructive null** | every printing is led by a foreign CNR resolving to another judgment that stores the same citation |
| `C2b` | **destructive null** | the same, uncorroborated |
| `C3` | **destructive null** | every printing is led by a citing phrase |
| `C4` | `SOURCE_DAMAGE` | the control-char / English-density screen refuses the text |
| `C5` | `TEXT_IDENTITY_MISMATCH` | the document never mentions this row's identity |
| `C6` | `NULL_AMBIGUOUS` | the document prints competing citations |
| `C7` | `NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG` | the extractor refuses and nothing disowns the value |
| `D1` | **destructive null** | the stored string carries a month name where the court series goes |
| `R1`–`R5` | replacement dispositions | §3 |

Counts over the whole population, `adjudication-summary.json`:

```
CLEAR_TO_NULL  19,132
  C7  NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG        12,027
  C2a PROVEN_FOREIGN_TO_DOCUMENT               3,696
  C1b CURRENT_VALUE_SUPPORTED_BY_OWN_CASE_NO   2,056
  C4  SOURCE_DAMAGE                              394
  C3  PROVEN_EXTRACTION_FALSE_OWN                294
  C2b PROVEN_FOREIGN_TO_DOCUMENT_UNCORROB        272
  C5  TEXT_IDENTITY_MISMATCH                     265
  C6  NULL_AMBIGUOUS                             126
  C1a CURRENT_VALUE_PROVEN_CORRECT                 2
REPLACE 207 · AMBIGUOUS 780 · DATE STAMPS 434 · SOURCE_GENUINE_FOREIGN 3
```

Every class sums to its R18 total exactly: 19,132 + 207 + 780 + 434 + 3 = 20,556.

**4,696 rows reached a destructive null disposition and 86 a destructive
replacement.** That was the population to attack.

---

## 2. The prediction-blind reading, and what it did to those rules

256 rows were read with every trace of the verdict removed — the R18 class, the
R19 rule, the proposed value, whether the row was a candidate at all. What the
reader saw was the court, the row's own case number and CNR from the metadata
record, the citation stored on the row, the text around each place it is printed,
and the other citations the document prints. That last part matters: it is shown
for **every** item, so a replacement candidate is indistinguishable from a row
that simply has two citations on its page.

Items are ordered by a hash of the id, so the strata interleave. Decoys are drawn
from the protective classes — without them, answering "foreign" to everything
would have scored 100%.

`blind-answers.jsonl` was written complete before `blind-key.json` was opened.
`n2-r19-blind-score.mts` performs the join and nothing else.

### Round 1 — 160 items

```
rule                              n   read OWN   verdict
C2a_FOREIGN_CNR_CORROBORATED     45     17       REFUTED   37.8% false null
C2b_FOREIGN_CNR_UNCORROBORATED   15     12       REFUTED   80.0% false null
C3_CITED_PRECEDENT_LEAD          20      7       REFUTED   35.0% false null
D1_MONTH_IN_SERIES_POSITION      10      0       0 false
R4a/R4b PROVEN_REPLACEMENT       17      0       0 false
C1b (decoy, protective)          10     10       correct — all read OWN
R2  (decoy, scan conflict)        5      5       correct — all read OWN

FALSE_NULL 36   FALSE_REPLACE 0   UNTESTABLE 12   GATE FAIL
```

**Thirty-six of the eighty destructive-null items were rows whose own document
prints the stored citation as its own.** That is a refutation, not a tuning
problem.

### Why C2 failed, and it is not a subtle reason

The rule reads: *the CNR printed beside the citation is not this row's, so the
citation belongs to somebody else.* The premise is false in this population.

```
rows in the C2 class whose METADATA CNR appears in the text at all:   7 of 3,968
```

The AWS metadata CNR and the CNR the document prints **routinely disagree**, so
"the adjacent CNR is not ours" is true nearly everywhere and carries no
information at all. Gauhati is the shape:

```
Page No.# 1/3 GAHC010237842025 2026:GAU-AS:3809 THE GAUHATI HIGH COURT
(HIGH COURT OF ASSAM, …) Case No. : Cont.Cas(C)/576/2025
```

A header CNR that is not the row's, and 110 characters later the row's own case
number. The rule saw the first and never reached the second. 2,749 of C2a's 3,696
rows are Gauhati and 834 are Chhattisgarh: it is a court formatting convention
wearing the costume of a proof.

### Why C3 failed

Bombay and Allahabad interleave a side stamp into running prose:

```
"...covered by judgment in case of State Of Mah. vs Kailash Shiva Rangari,
 reported in 2025:BHC-AUG:9893 2 ca 12969.24+.odt 2016 (3) Mh.L.J. 457."
```

The case is reported at **2016 (3) Mh.L.J. 457**. The 2025 neutral citation
sitting between the citing phrase and the reporter is *this document's own page
stamp*, printed with its own file name. A citing phrase standing before a
citation does not make that citation the thing cited. 23 of the 294 C3 rows carry
a document file name inside the same window.

### Round 2 — 96 items, disjoint by construction

Round 1 left the two surviving rules resting on 10 and 17 readings. A per-rule
zero that small is not yet a zero-known-harm claim, so a second pack excluded
every id already read.

```
rule                              n   read OWN   verdict
D1_MONTH_IN_SERIES_POSITION      30      0       0 false   (30/30 NOT_A_CITATION)
R4b_TWO_SIDED_CASE_NUMBER        36      0       0 false   (36/36 ANOTHER_CASE)
C1b (decoy, protective)          12     12       correct
R2  (decoy, scan conflict)        4      4       correct
R5  (decoy, withheld replace)     8      0       8 read ANOTHER_CASE — recall loss, correctly withheld

FALSE_NULL 0   FALSE_REPLACE 0   UNTESTABLE 2   GATE PASS
```

Cumulative on the surviving rules: **D1 40 items, 0 false. R4 53 items, 0 false.**
Cumulative on the refuted ones: 80 items, 36 false.

---

## 3. The 207 replacements, dispositioned one by one

R18 found four Rajasthan replacements that would install an OCR-damaged series
token over a correct one, and said so. R19 was told that one known false
destructive replacement fails the class, and it does — so every one of the 207 is
dispositioned rather than counted.

```
PROVEN_REPLACEMENT               86    two-sided: the proposal stands beside this row's
                                       own identity AND the stored value stands beside a
                                       different case that exists in the corpus
SCAN_DAMAGE_CONFLICT              9    stored and proposal differ only in the series token
REPLACE_AMBIGUOUS                99    no two-sided proof
REPLACE_UNTESTABLE               12    damage screen refuses the text
DB_SUFFIX_QUARANTINE              1    §6
                                 ---
                                 207
```

`PROVEN_REPLACEMENT` is strictly stronger than the extractor's own test. The
extractor asks one question — which occurrence does this row's identity anchor.
R19 requires both halves: the proposed value adjacent to this row's own CNR or
case number, **and** the stored value adjacent to a different matter, **and** both
series tokens placed to this court by the corpus frequency map. Punjab & Haryana
is the shape, and it is unambiguous on the page:

```
CRM-M-8829-2024 2024:PHHC:047483  CRM-M-8779-2024 2024:PHHC:047486
CRM-M-15135-2024 2024:PHHC:047488
```

Row `CRM-M/8779/2024` stores `047483`. The court printed `047486` against it.

**`SCAN_DAMAGE_CONFLICT` is 9 rows and all 9 were read blind, exhaustively.** All
nine came back `OWN` — the value stored today is this document's own citation, in
a damaged or an undamaged rendering, and the replacement would move it sideways
rather than repair it. R18's four are three quarters of the class:

```
2024:RJ-JP:10347  ->  2024:IW-JP:10347     blind reading: OWN, stamp reads
                                            [2024:RJ-JP:10347] [CMA-5957/2011]
2023:RJ-JP:39854  ->  2023:KJ-JP:39854     OWN
2023:RJ-JP:21226  ->  2023:EU-JP:21226     OWN
2023:RJ-JP:24252  ->  2023:EU-JP:24252     OWN
2024:EU-JP:5228   ->  (repair direction)   OWN — the document also prints the
                                            clean 2024:RJ-JP:5228
```

```
CURRENT_VALUE_PROVEN_CORRECT = 9    the whole SCAN_DAMAGE_CONFLICT class,
                                    adjudicated by reading, not by rule
```

The repair direction is as unsafe as the damage direction and for the same
reason: identity anchoring settles *which occurrence* is the document's own; it
cannot settle *how that occurrence was scanned*. Both leave the class.

---

## 4. Bombay, measured rather than tweaked

R17 and R18 left a concentrated Bombay withdrawal class open at the third
mechanism. R19 was told to adjudicate it, not to make a fourth blind extractor
tweak. It did not touch the extractor.

All 10,419 Bombay `CLEAR_TO_NULL` rows, stratified by what the evidence says:

```
C7  NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG          8,136   78.1%
C1b own case number BESIDE the stored value   1,708   16.4%
C4  SOURCE_DAMAGE                               358    3.4%
C5  own identity absent from the text           154    1.5%
C3  citing-phrase lead (refuted, §2)             63    0.6%
C2a foreign-CNR lead                              0    0.0%
```

Two facts decide it.

**Bombay has no foreign-CNR class at all — zero rows.** The mechanism that
produces 3,696 candidates in Gauhati and Chhattisgarh does not exist here.

**1,708 rows print this row's own case number within 60 characters of the stored
citation.** That is the opposite of absence.

And the blind reading is unanimous where it could decide: **43 of 43 decided
Bombay items came back `OWN`**, 7 more `CANNOT_TELL`, none foreign, none cited.
Every one is the same form:

```
"...this Writ Petition is disposed off. (R. M. JOSHI, J) (RAVINDRA V. GHUGE, J)
 Malani  Page 1 of 1  2024:BHC-AUG:5084-DB"
"...1/2  2025:BHC-AUG:5434-DB  15 WP NO. 291 OF 2025"
"...PAGE 1 OF 2  2025:BHC-AUG:24990  92-wp-12576-2024.odt"
```

```
BOMBAY_ROWS_REVIEWED   10,419 classified, 50 read blind
BOMBAY_ROOT_CLASS      PAGE_FURNITURE_STAMP_NOT_RECOGNISED_AS_OWN
                       the citation is printed in the side stamp with the
                       document's own file name or its own case number, and the
                       extractor's furniture tier does not reach it
BOMBAY_OWN_CITATION_GENUINELY_ABSENT   not established for any row
BOMBAY_SCAN_DAMAGE                     358 of 10,419
```

**The Bombay class is an extractor RECALL gap, not a wrong value.** Not one Bombay
row survives into the R19 candidate population, and none should: the fix belongs
in the extractor's furniture tier, in a round that can measure what widening it
does to the other 25 courts.

---

## 5. The tied own-id class

R18 found 11 of R17's 127 rows refusing because two candidates tie, and warned
that a tie must not be read as absence. R19 measures the corpus class and keeps it
whole.

```
TIED_CLASS_COUNT                739   R18 AMBIGUOUS with 2+ year-eligible citations
AMBIGUOUS_WEAK_TIER              41   R18 AMBIGUOUS for the other reason
                                 ---
                                 780
```

**A tie is never routed to a null.** By construction: `CLEAR_TO_NULL` requires
`distinctEligible <= 1`, so no tied row is in that class in the first place, and
R19 leaves all 780 as `NO_ACTION`. Nine of the 739 and **all 41** of the weak-tier
rows are also `-DB` rows, which is §6.

That the entire `AMBIGUOUS_WEAK_TIER` class of 41 is the `-DB` boundary defect is
new: R18 reported the class and the defect separately and did not join them.

---

## 6. `-DB`: the rows by id, and the quarantine

R18 counted 43 glued rows and 9 boundary rows but recorded only the counts. R19
needed the ids to account for each exactly once, so the walk was repeated with the
predicate pushed into the database — only matching rows cross the wire.

```
ROWS_SCANNED                       1,350,954   = the census, exactly
STORED_PLAIN_SUFFIX_GLUED                 43   reproduces R18 exactly
STORED_PLAIN_SUFFIX_WITH_BOUNDARY          9   reproduces R18 exactly
                                         ---
DB_SUFFIX_EXISTING_ROWS                   52
  inside the R18 population                51
  outside it                                1   efa0c025, P&H, 2023:PHHC:080381
```

Where the 51 sit in R19, each counted once and none of them destructive:

```
AMBIGUOUS_WEAK_TIER          41
TIED_OWN_ID_CANDIDATES        9
REPLACE (suffix only)         1
```

`DB_SUFFIX_QUARANTINE` is their disposition. They may be measured — they are —
and they may not enter any population described as cross-system safe.

```
DB_SUFFIX_CROSS_SYSTEM_PARITY = PENDING
```

LCC's R17 (bus 1663, `docs/ai/lcc-r17/citation-boundary-parity.json`) reports the
same conclusion independently and from the other side: `services/ingest/src/citations.ts:108`
still carries the pre-R18 rule, it is the only neutral-citation extractor the API
has, and `classifyQuery('2025:DHC:8491-DBThis Court')` returns citation
`2025:DHC:8491` with `warrantsExactLookup` TRUE at HEAD. Their
`RESOLVER_READY_FOR_INDEPENDENT_RETEST = NO` and this quarantine are the same
fact. No final cross-system falsifier was run.

---

## 7. The frozen R19 candidate

```
R19_SAFE_POPULATION_ID     NEW2-R19-EXISTING-cbb193df4e42269e
R19_SAFE_POPULATION_HASH   cbb193df4e42269e952dcc8236ebf5ff4afc0659118699b801fb3cd316400d84
CORRECTION_CANDIDATE_COUNT 571
```

`r19-candidate-population.jsonl` sha256 `b3f7ad7e72496faa…`. The population hash
is over the newline-joined identity lines `judgmentId:current>proposed` — the
construction R17 and R18 used, so the three are comparable without reading three
file formats — and the id is its first 16 hex characters.

```
DETERMINISTIC_TO_NULL         434   D1, month name in the series position
DETERMINISTIC_TO_REPLACE       86   R4a/R4b, two-sided identity
DB_SUFFIX_QUARANTINE           51   §6, measured not actionable
                              ----
                               571
NO_ACTION                  19,985
                          -------
                           20,556
```

**It is called a CANDIDATE and nothing stronger.** Not an apply population, not
authorised, not safe-to-apply. Its possible disposition is
`ELIGIBLE_FOR_SEPARATE_CORRECTION_AUDIT` and nothing beyond it.

The 19,985 that do not advance, by what the evidence actually says:

```
NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG              12,027
PROVEN_FOREIGN_TO_DOCUMENT      (REFUTED §2)   3,696
CURRENT_VALUE_SUPPORTED_BY_OWN_CASE_NUMBER     2,056
TIED_OWN_ID_CANDIDATES                           730
SOURCE_DAMAGE                                    394
PROVEN_EXTRACTION_FALSE_OWN     (REFUTED §2)     294
PROVEN_FOREIGN_UNCORROBORATED   (REFUTED §2)     272
TEXT_IDENTITY_MISMATCH                           265
NULL_AMBIGUOUS                                   126
REPLACE_AMBIGUOUS                                 99
REPLACE_UNTESTABLE                                12
SCAN_DAMAGE_CONFLICT (both directions)             9
SOURCE_GENUINE_FOREIGN_CITATION                    3
CURRENT_VALUE_PROVEN_CORRECT                       2
```

A smaller safe population is better than a larger one carrying one known false
correction. 520 actionable rows against R18's 20,556 is a 97.5% withdrawal, and it
is the correct outcome of the instruction to prefer UNKNOWN to damage.

---

## 8. Two controls that never read a document, and agree

The blind reading is one reader. Two mechanical controls were run beside it,
neither of which asks the extractor or a person anything.

### Connected-matter control — exhaustive over the C2 class

`C2` nulls a row because the CNR printed beside its citation belongs to a
different judgment storing the same citation. A **common order** looks identical
from the edge: one order disposing of several connected matters, published under
each of their case rows. The control asks a question `content_hash` can answer.

```
C2 rows tested                                          3,968   (exhaustive)
  the "foreign" CNR resolves to the SAME SOURCE DOCUMENT   2,402   60.5%
  same date, different document                            1,545
  different document                                          21
```

For 2,402 rows the rule's premise is simply false: the adjacent CNR does not name
a different document whose citation was borrowed — it names **the same PDF**,
stored under a second case row. Whether that one document carries one shared
citation or a citation per matter cannot be settled from the edge at all; the
blind reading settled it row by row and found both. Either way, "the CNR beside
it is not ours" is not evidence of theft on 60.5% of the class.

### Negative control — the destructive rules run on rows nothing disputes

A random sample of rows R18 classified `UNCHANGED_CONFIRMED` — where the rule that
WROTE the value and the rule that replaced it agree — put through the identical
destructive null rules. Sampling is on the primary key from random start points,
because a `LIMIT` after a court filter is one slab of one week, not a sample.

```
UNCHANGED_CONFIRMED rows sampled       5,722   14 courts
destructive null rules fired              59   1.03%
  C3   55   (54 Madras, 1 Bombay)
  C2a   4   (Uttarakhand)
  C2b   0
```

**Fifty-nine false nulls on rows nothing disputes**, found without reading a
single document. The two controls and the blind reading are three independent
routes to the same conclusion about C2 and C3.

The negative control tests only the three rules it implements. **`D1` and `R4`
are not covered by it** — their evidence is the 93 blind readings in §2 and
nothing else.

---

## 8. What is weak in this round, and what it does not claim

- **`NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG` is 12,027 rows and it is not a verdict.**
  It is the absence of one. Those rows may hold wrong citations; nothing here
  shows they do, and nothing here shows they do not.
- **The blind reader is one reader, and it is me.** 256 items, both rounds, no
  second adjudicator. The protective decoys are the guard against a reader who
  simply answers `OWN` — `R4b` scored 36/36 `ANOTHER_CASE` and `R5` 8/8
  `ANOTHER_CASE` in the same pack that returned 12/12 `OWN` on `C1b` — but a
  second reader would be better and there was not one.
- **12 + 2 items came back `CANNOT_TELL`** and are counted as untestable, never as
  agreement. Most are the parent-case shape: an interlocutory application whose
  header names the petition it sits in.
- **`D1` rests on a structural fact, not a reading.** `2011:NOVEMBER:18` carries a
  month name where a court series goes; no court owns such a series. The 40 blind
  readings agree, and **all 434 are Madras** despatch stamps across 20 distinct
  month tokens including `SEPTEMEBER` and `AGT`. R18 §8 records this class as
  "431 of them are Madras"; counted directly off R18's own frozen jsonl it is 434
  of 434, and the three-row difference is R18's, not a change in the data. The
  class is narrow and does not claim to have found every non-citation the old
  regex matched.
- **`PROVEN_REPLACEMENT`'s 86 rows are 81 anchored on the printed case number and
  5 on a CNR.** The case number is a weaker key than a CNR. The two-sided
  requirement is what carries it, and 53 of the 86 were read blind with 0 false.
- **Pre-2023 rows were not looked at separately**, as in R18.
- **The evidence walk read `full_text` as it stands today.** Where text has been
  re-extracted since the row was written, the evidence describes the current text
  and not what the old rule saw.

```
THREE_ATTEMPT_STOP_TRIGGERED = NO
  the C2/C3 family was built once, tested once and withdrawn once. It was not
  re-tuned and re-tested against the same blind set; a refinement gated on
  `ownIdentityInText` was measured (it leaves C2a at 21 rows and C3 at 2) and
  deliberately NOT adopted, because a rule repaired against the set that refuted
  it has not been validated by it.
```

---

## Resource safety

`HEAVY_BOX` stayed with NEW1 for the whole round and no lease was taken beyond
`GIT_COMMIT` for the commit. Its durable metric moved from
`new1_doc_vector_stage = 4,517,528` to `4,542,431` while R19 ran — progress
observed, not assumed from a process list.

Every database pass was batched and checkpointed. Two costs are recorded rather
than smoothed:

- the `-DB` corpus walk reads 1,350,954 rows and took **12 minutes**; the
  predicate is evaluated in the database so only the 52 matching rows crossed the
  wire;
- the negative control's first design used `ORDER BY id` under a court filter,
  which sorts every row of that court **including `full_text`**. The first court
  was observed at 46 seconds on IO wait; the run was stopped and the orphaned
  backend cancelled
  by matching the full statement text rather than a truncated preview. The
  replacement samples on the primary key from random start points.

---

## FINAL

```
HEAD_START   e2a298e6
HEAD_FINAL   the commit this document lands in, parent f4d5371d
COMMITS      one, NEW2 paths only

R18_POPULATION_HASH_VERIFIED   YES   9679cff06d0e6404…, 20,556 rows, 0 moved

REPLACE_TOTAL                 207
  PROVEN_REPLACEMENT           86    53 read blind, 0 false
  SCAN_DAMAGE_CONFLICT          9    all 9 read blind, all 9 CURRENT_VALUE_PROVEN_CORRECT
  CURRENT_VALUE_PROVEN_CORRECT  9    the scan-conflict class, exhaustively adjudicated
  REPLACE_AMBIGUOUS            99
  REPLACE_UNTESTABLE           12
  DB_SUFFIX_QUARANTINE          1

CLEAR_TO_NULL_TOTAL        19,132
  PROVEN_FALSE_OWN              0    every rule that reached this class was refuted
  NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG   16,289   12,027 + the 4,262 refuted candidates
  CURRENT_VALUE_PROVEN_CORRECT    2,058
  SOURCE_DAMAGE                     394
  TEXT_IDENTITY_MISMATCH            265
  NULL_AMBIGUOUS                    126
  NULL_UNTESTABLE                     0    R18 excluded untestable rows from the population

BOMBAY_ROWS_REVIEWED        10,419 classified, 50 read blind
BOMBAY_ROOT_CLASSES         PAGE_FURNITURE_STAMP_NOT_RECOGNISED 8,136 + 1,708 own-case-number
                            SOURCE_DAMAGE 358 · OWN_IDENTITY_ABSENT 154 · refuted C3 63
                            FOREIGN_CNR 0 · own citation genuinely absent: not established

TIED_CLASS_COUNT              739   (+41 AMBIGUOUS_WEAK_TIER, all of them -DB rows)

DB_SUFFIX_EXISTING_ROWS        52   43 glued + 9 boundary; 51 in population, 1 outside
DB_SUFFIX_CROSS_SYSTEM_PARITY  PENDING

R19_SAFE_POPULATION_ID       NEW2-R19-EXISTING-cbb193df4e42269e
CORRECTION_CANDIDATE_COUNT   571
SAFE_TO_NULL                 434   named DETERMINISTIC_TO_NULL
SAFE_TO_REPLACE               86   named DETERMINISTIC_TO_REPLACE
QUARANTINED                   51
NO_ACTION                 19,985

FALSE_NULL     0    on the surviving rules (D1 40 items, R4 53 items)
FALSE_REPLACE  0
AMBIGUOUS     14    CANNOT_TELL across both rounds
UNTESTABLE    14

WITHDRAWN_ON_EVIDENCE   36 false nulls in 80 destructive-null items on C2a/C2b/C3;
                        59 further false nulls on 5,722 UNCHANGED_CONFIRMED rows;
                        2,402 of 3,968 C2 rows point at the SAME SOURCE DOCUMENT;
                        all three rules removed from the actionable population

EXISTING_CORRECTION_GATE       PASS on the population that advances (D1 + R4),
                               FAIL on C2a/C2b/C3 which is why they do not advance

EXISTING_CORRECTIONS_APPLIED   NO
FINAL_CITATION_FALSIFIER_RUN   NO
CITATION_BULK_APPLY            HOLD
DB_MIGRATION                   NONE
NEW1_INTERRUPTED               NO   HEAVY_BOX stayed with NEW1; new1_doc_vector_stage
                               4,517,528 -> 4,542,431 during the round, observed
BLOCKERS                       none
```
