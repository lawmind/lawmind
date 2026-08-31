# NEW2 — R18. What the old extractor left in the corpus, and the suffix the regex threw away.

`HEAD` at start: `72b87859`. `HEAD` at the commit: `b3ca71b2` — LCC's trust-state
contract test landed mid-round; re-anchored, and nothing under this patch moved
(it touched `services/api/**` tests only). Dependencies verified present:
`8ff7083d` (the extractor fix), `3e646327` (its evidence), `f855aa55` (LCC's R16
resolver state).

```
EXTRACTOR_PATH    services/ingest/src/harvest/hc-load.ts  →  neutralCitationFrom
EXTRACTOR_OWNER   NEW2
SHARED_PATH_COLLISION   NO   (services/ingest/**, this lane's own path)
```

R17 fixed **who** a citation belongs to and changed nothing already stored.
R18 asks the question that left open: **how much of the canonical corpus was
written by the rule R17 replaced**, and what would it take to put it right.

---

## 0. Three producers, and only one of them is the rule in question

`judgments.neutral_citation` has three writers, and they are not the same risk:

```
aws_hc     1,350,954 rows   hc-load.ts neutralCitationFrom   ← the rule R17 replaced
aws_sc        38,225 rows   sci.ts, from the metadata record's case_id, not from text
sci_live          26 rows   sci-live.ts, an INSC regex over the first 12,000 chars
```

The Supreme Court rows do not come from `neutralCitationFrom` at all — `sci.ts`
copies `case_id` out of the metadata record, so the ownership defect cannot reach
them. **The population at risk is the 1,350,954 High Court rows**, and 1,350,359
of those (99.96%) are 2023 or later.

`sci-live.ts` extracts from text with no ownership test of its own. It is 26 rows,
it is a different function, and it is named here rather than folded into a number
about a different extractor.

---

## 1. The measurement is exhaustive, and here is why that was affordable

`judgments` is 22 GB and the box is shared: NEW1 holds `HEAVY_BOX` with a live
coarse walk, and this round never asked for it. What made a full pass cheap is
that `judgments_neutral_citation_key` is a btree over
`upper(regexp_replace(coalesce(neutral_citation,''),'[^A-Za-z0-9]','','g'))` on
**every** row. Rows with no citation collapse to the empty key, so a keyset walk
bounded below by `> ''` visits the 1.35M rows that carry one and never touches
the 17.3M that do not.

```
CORPUS_MEASUREMENT_SCOPE   every AWS Open Data High Court row carrying a
                           non-empty neutral_citation
EXHAUSTIVE_OR_SAMPLE       EXHAUSTIVE
```

Batched at 2,000, checkpointed after every batch, no transaction held across a
batch, no lease taken, no `judgments` row written. `scripts/n2-r18-existing-reparse.mts`.

**Two defects in the walk itself, found and fixed before the number was
believed** — both are the reason the census is compared against the walk instead
of assumed to agree with it:

- **A keyset on the key alone is not a keyset.** 207,482 of the 1,350,954 rows
  share a normalised citation key with another row, because one neutral citation
  names every connected matter decided together. `WHERE key > lastKey` therefore
  drops every remaining row of a key that straddled a batch boundary. The first
  pass returned **1,349,549 rows against a census of 1,350,954** — 1,405 short,
  0.10%, and silently. The keyset is now `(key, id)`.
- **`>= ''` is not a bound.** Adding the tie-break without keeping the strict
  `> ''` made the first page ask for every row in the index, empty keys included,
  and `ORDER BY (key, id)` then had to sort the 17.3M-row empty plateau by id.
  The batch had not returned after 15 seconds and was stopped. Both predicates
  are present now; only one of them is doing the seeking.

A 0.10% shortfall would not have changed a single conclusion in this document.
It is written down because the walk reported success either way, and the first
pass's checkpoint is kept at `walk1-superseded-keyset-defect/` so the count that
exposed it is readable rather than quoted. **Nothing in this document is derived
from that file** — it ran on the pre-§4 extractor as well as the broken keyset,
and the two are not separable in it.

---

## 2. The classification, and what each class is allowed to mean

Every evaluated row gets exactly one verdict, and each verdict is a statement
about evidence rather than about confidence:

| class | what it means | what decides it |
|---|---|---|
| `UNCHANGED_CONFIRMED` | the committed extractor returns the value already stored | equality |
| `CLEAR_TO_NULL` | the extractor refuses, and the document held at most one year-eligible citation, so the refusal is not a tie | `candidate === null` and `distinctEligible ≤ 1` |
| `AMBIGUOUS` | the document held two or more competing citations and nothing separated them; **or** the extractor answered a different value that its own tier-1 identity test did not anchor | `distinctEligible ≥ 2`, or a replacement whose tier is not `OWN_ID` |
| `REPLACE_WITH_DIFFERENT_OWN_CITATION` | the extractor answers a different citation **and** the row's own case number or CNR is the nearest signal to it | tier `OWN_ID`, nothing weaker |
| `SOURCE_GENUINE_FOREIGN_CITATION` | the extractor confirms the stored value, and that value belongs to another court's series | equality plus an off-court series token |
| `NOT_A_NEUTRAL_CITATION_DATE_STAMP` | the stored value is not a citation at all — `2011:APRIL:05` and its kind | a month name in the series position |
| `UNTESTABLE` | no year partition, no retained text, or the damage screen rejects the text | cannot be judged, so nothing is proposed |

**A replacement is never created by similarity.** The extractor's three tiers are
identity, then position, then page furniture; only tier 1 — the row's own case
number or CNR standing nearer to the citation than any foreign signal — is
allowed to produce a `REPLACE`. A different answer arrived at any other way is
recorded as `AMBIGUOUS`, which is a request for a human, not a proposal.

**A rare series token is an annotation, not a verdict.** The first cut of this
walk bypassed the extractor whenever a citation's court token was too rare to
place, and it mislabelled Sikkim's own `SHC` series — 11 rows, a real series —
as unrecognised. The token/court matrix (`token-court-matrix.json`) is now carried
on every row as evidence and decides nothing on its own.

---

## 3. R17's population, re-verified row by row

```
R17_POPULATION_REVERIFIED   YES
POPULATION_ID               NEW2-R17-EXISTING-ed780d3fdeb77514
POPULATION_HASH             recomputed from the rows and MATCHES the recorded hash
ARTIFACT                    docs/ai/new2-r18/r17-population-reverified.json
```

The recorded hash is not over the file, it is over the population's identity
lines — `judgmentId:current>proposed`, joined. `scripts/n2-r18-reverify-r17.mts`
reproduces that construction from `scripts/n2-r17-existing-corrections.mts`
rather than assuming a shape, and it matches. All 127 judgments are still in
`judgments`, and **not one row's stored citation has moved** since R17 froze it.

```
STILL_BELONGS_CLEAR_TO_NULL   122   the committed extractor refuses the document,
                                    which is exactly what R17 proposed
STILL_BELONGS_REPLACE           3   the extractor answers R17's proposed value
OUT_OF_R18_WALK_SCOPE           2   see below
CONTRADICTED                    0
STORED_VALUE_MOVED              0
```

**Additions: 0. Removals: 0. Contradictions: 0.** The two rows outside scope are
not a disagreement — R18 walks rows that CARRY a stored citation, and those two
carry none. R17 proposed *adding* a citation to them from hand-adjudicated
ground truth; that proposal stands, unapplied, and R18 simply never evaluates a
row it cannot see. The exact reason is recorded per row in the artifact.

**All 125 in-scope rows are in R18's population** — checked by joining the ids,
not asserted — and R18's population is larger: R17 drew from 550 documents, R18
from 1,350,954 rows.

One thing the verdict table above smooths over, and it should not. R17 proposed a
STATE; R18 also assigns a REASON, and the two do not partition the same way:

```
R17 proposed NO_SAFE_OWN_CITATION        122
  R18 reason CLEAR_TO_NULL               111   refused, and nothing competed
  R18 reason AMBIGUOUS                    11   refused because two candidates TIED
R17 proposed a different citation           3
  R18 reason REPLACE                       3
```

Both readings agree the stored value cannot stand on all 122. They disagree on
the **disposition** of 11 of them: a clean refusal can be applied as a NULL, a tie
is a request for a human. R17 called all 122 the same thing because its
verification only asked whether the extractor returns `null`. That is not a
contradiction and it is not an error in R17 — it is a finer class R18 can draw
and R17 could not, and it changes what an authorisation round would do with
those 11.

---

## 4. `-DB`, and a regex that answers instead of failing

R17 §7 recorded the shape and deliberately left it: Delhi prints
`…2025:DHC:8491-DBThis is a digitally signed order…` and the corpus holds
`2025:DHC:8491`. R18 reproduced it independently on a different court, from the
bytes:

```
judgment cfd18fe3-c878-4640-b070-dcf66fcb181a, Allahabad High Court
  "2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16."
```

```
DB_SUFFIX_DEFECT_REPRODUCED = YES
DB_SUFFIX_ROOT_CAUSE =
  the shared regex ends its optional suffix in a word boundary —
  /...(\d{1,6})(?:-(?:DB|FB))?\b/ . On `8491-DBThis` the `B|T` pair is not a
  boundary, so the `-DB` alternative FAILS, the optional group matches EMPTY, and
  the `\b` then succeeds against the hyphen after `8491`. The regex never errors.
  It returns a DIFFERENT CITATION KEY, silently.
```

The missing whitespace is a **source** condition — PDF text extraction closing a
line break. The **defect is ours**: a regex that cannot take the suffix should
refuse the token, not quietly hand back a shorter one. And the second-order
effect is worse than the key change. On the Allahabad document the page prints
the citation twice, glued once and cleanly once, so the old rule produced **two
distinct strings for one citation** — and `neutralCitationFrom`, correctly
refusing to choose between two survivors, returned `null` for a document whose
masthead is perfectly legible.

### How often, exhaustively

Every neutral-citation occurrence in every document carrying a stored citation —
4,575,593 occurrences, not rows:

```
VALID_SUFFIX_FORM   (a clean -DB or -FB)        914,489
NO_SUFFIX_PRINTED                             3,660,966
MISSING_BOUNDARY    (the defect)                    138     0.0030%
```

The 138 are not one phenomenon, and the continuations say which:

```
NEXT_CITATION_CONCATENATED            88   `...2026:MLHC:71-DB2026:MLHC:712...`
PAGE_OR_PARA_NUMBER_CONCATENATED      42   `2024:HHC:12854-DB2 issued by...`  a running footer
WORD_CONCATENATED                      7   `2025:DHC:8491-DBThis is a digitally signed order`
CONTROL_CHAR_OR_MOJIBAKE               1   TEXT_CONCATENATION_DAMAGE
COULD_BE_A_LONGER_SUFFIX               0   nothing the greedy suffix would eat
```

`COULD_BE_A_LONGER_SUFFIX = 0` is the one that licenses the fix: across all 138,
no continuation is a run of capitals that could make `-DB` the head of a longer
real token. 92 of the 138 are **corroborated by a clean print of the same
suffixed citation elsewhere in the same document** — the fix returns the value
the document itself prints. 46 are a single uncorroborated occurrence, where the
suffix is still printed on the page and taking it is reading, not guessing.

```
DB_SUFFIX_ROWS_FOUND      138 occurrences   (0.0030% of 4,575,593)
DB_SUFFIX_EXISTING_ROWS    43 rows
```

`DB_SUFFIX_EXISTING_ROWS` is the number that matters for the corpus: 43 rows
store the plain form while the document prints the suffixed form glued. A further
9 store the plain form while the document prints the suffixed form *with* a
boundary somewhere. 210,791 rows already carry a suffix and are untouched.

**The class delta between the two walks is NOT the fix's effect and is not quoted
as one.** The first walk carried the keyset defect above, so it is 1,405 rows
short — and short exactly on the large tie groups, which are the common orders
where the ambiguous rows live. The two walks are not comparable, and the honest
measurement of the fix's reach on existing rows is the 43, counted directly.

The controls and the full class table are in `docs/ai/new2-r18/db-suffix-defect.json`.

### The fix, and the four things it must not move

```
- const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
+ const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;
```

The boundary belongs to the **number**. The suffix follows it and does not have
to end on one. Negative controls, all unmoved:

```
2023:DHC:2073-Crl.A. 55 of 2023   → 2023:DHC:2073     a hyphen owned by the next token
2023:DHC:2073-SB before the bench → 2023:DHC:2073     a bench abbreviation that is not a suffix
Neutral Citation 2023:KHC-D:1     → 2023:KHC-D:1      a hyphenated COURT token, never a suffix
x2023:DHC:2720                    → (no match)        the leading boundary still holds
2023:DHC:11186499                 → (no match)        a number too long for the series
```

Written failure-first: the test asserting the glued form now yields
`2023:AHC:111864-DB` was added and **observed red at `72b87859`** (`actual: null`)
before the regex moved. `services/ingest/src/harvest/hc-load.test.ts`.

**`services/ingest/src/citations.ts` carries the same regex and was NOT changed.**
It extracts CITED references, so moving it changes the citation edge key space
while `CITATION_BULK_APPLY = HOLD`. It is named here with the same occurrence
census bounding its exposure, and left for the round that can measure what it
does to the edges.

---

## 5. What the existing corpus actually says

Exhaustive, 1,350,954 rows, against the extractor as it stands after §4.
`docs/ai/new2-r18/reparse-checkpoint.json`, sha256 `01670b73…`.

```
ROWS_EVALUATED                          1,350,954     ( = the census, exactly)
STORED_NEUTRAL_CITATION_ROWS_EVALUATED  1,350,954

UNCHANGED_CONFIRMED                     1,303,863     96.514%
CLEAR_TO_NULL                              19,132      1.416%
UNTESTABLE                                 26,535      1.964%
AMBIGUOUS                                     780      0.058%
NOT_A_NEUTRAL_CITATION_DATE_STAMP             434      0.032%
REPLACE_WITH_DIFFERENT_OWN_CITATION           207      0.015%
SOURCE_GENUINE_FOREIGN_CITATION                 3      0.0002%
```

Read against §6's three buckets:

```
WRONG_OR_UNSAFE_CURRENT    19,773   the value stored today should not stand:
                                    19,132 CLEAR_TO_NULL + 207 REPLACE
                                    + 434 date stamps
CURRENT_CORRECT         1,303,866   1,303,863 confirmed + 3 confirmed-and-foreign
CURRENT_UNKNOWN            27,315   26,535 UNTESTABLE + 780 AMBIGUOUS
```

**1.46% of the stored population is wrong or unsafe, and 2.02% cannot be judged.**
Neither number is extrapolated: `EXHAUSTIVE_OR_SAMPLE = EXHAUSTIVE`, proven by
the walk returning the census count exactly.

### The rule that wrote it, re-run

The pre-R17 rule — first regex match in 3,000 characters, year test only — was
re-run beside the committed one on every row. It **reproduces the stored value
on 1,323,984 of 1,350,954 rows, 98.00%.** That is the check that the population
being measured really is the old rule's output rather than something else's. The
2% it no longer reproduces is text that has been re-extracted since the row was
written, and it is stated rather than assumed away.

### Where it is, and the sample that predicted it

`CLEAR_TO_NULL` is not spread evenly. It is a property of how four courts print:

```
Bombay          10,419 of 60,873   17.12%
Meghalaya          410 of  1,711   23.96%
Delhi              466 of  2,514   18.54%
Gauhati          3,103 of 22,171   14.00%
Madras              98 of    702   13.96%
Chhattisgarh     1,226 of 110,239   1.11%
Allahabad        1,912 of 558,076   0.34%
Rajasthan          647 of 198,196   0.33%
```

**R17 predicted this from a blind draw of 59,434 documents and the exhaustive
walk confirms it**: R17 measured Bombay 18.4%, Gauhati 13.8%; R18 measures 17.12%
and 14.00% over the whole corpus. Meghalaya's R17 figure (50% of 14) was a small
sample and lands at 23.96% of 1,711. The mechanism is R17's, unchanged: Bombay,
Meghalaya and Gauhati do not print the citation in the masthead, so the refusal
is a recall gap in those courts and not a wrong value anywhere.

### The `REPLACE` class, audited rather than counted

207 rows, and every one is tier `OWN_ID` — the row's own case number or CNR is
the nearest signal to the citation being proposed. `replace-audit.json`:

```
SAME_SERIES_DIFFERENT_NUMBER                     195
SERIES_TOKEN_CHANGED_PLACED_TO_DAMAGED             4
SERIES_TOKEN_CHANGED_DAMAGED_TO_PLACED             3
SERIES_TOKEN_CHANGED_PLACED_TO_PLACED              3
SERIES_TOKEN_CHANGED_DAMAGED_TO_DAMAGED            1
SUFFIX_ONLY_the_-DB_boundary_defect                1
```

The 195 are the R17 defect, caught at scale. Punjab & Haryana
`CRM-M/53843/2022` is the shape:

```
CRM-M-51880-2022 2023:PHHC:054188 CRM-M-53843-2022 2023:PHHC:054190 -1- IN THE
HIGH COURT OF PUNJAB AND HARYANA AT CHANDIGARH 296 (2 cases) ...
```

A common order heading two matters. The stored value `054188` is the OTHER
matter's citation; the row is `CRM-M-53843-2022`, whose citation is `054190`,
and the row's own number stands directly in front of it. Deterministic identity,
nothing weaker.

**And then the four that go the wrong way, which are the finding here.**
Rajasthan prints `RJ-JP` and the scan reads it as `EU-JP`, `IU-JP`, `IW-JP`,
`KJ-JP`. Three rows are the OCR repair you would hope for — a stored token no
court owns, replaced by this court's real series. **Four are the reverse:**

```
2024:RJ-JP:10347  →  2024:IW-JP:10347
2023:RJ-JP:39854  →  2023:KJ-JP:39854
2023:RJ-JP:21226  →  2023:EU-JP:21226
2023:RJ-JP:24252  →  2023:EU-JP:24252
```

Every one of them is tier `OWN_ID`. The row's own case number really does stand
nearest to the damaged occurrence, and the extractor really does answer
correctly to the question it was asked. **Identity anchoring settles WHICH
occurrence belongs to this document; it cannot tell a clean scan of that
occurrence from a damaged one**, because both occurrences are the document's own.
Applying these four unread would make four rows worse than they are today.

That is the single strongest argument in this document for
`EXISTING_CORRECTIONS_APPLIED = NO`. A class that is 195/207 obviously right
still contains 4 rows that a bulk apply would damage, and only opening the class
finds them. `bySeriesDirection` in `replace-audit.json` is the field to read.

### `SOURCE_GENUINE_FOREIGN_CITATION` is 3, and thin

Only 33 rows in the whole corpus carry a series token whose home is another
court. Three of them survive the ownership test — a Delhi row printing
`2025:KER:21383`, a Bombay row printing `2025:PHHC:092344`, an Andhra row
printing `2025:AHC:103497-DB`. Two are tier `OWN_ID`; **one is tier `UNMARKED`**,
which is the weakest evidence the extractor has, and it is recorded as such on
the row rather than rounded up into the class name.

---

## 6. The frozen population

```
NEW_CORRECTION_POPULATION_ID     NEW2-R18-EXISTING-9679cff06d0e6404
NEW_CORRECTION_POPULATION_HASH   9679cff06d0e6404ac10481695f1ee4858f8f625755537a75086dcb981f303c9
CORRECTION_POPULATION_COUNT      20,556
EXISTING_CORRECTIONS_APPLIED     NO
```

```
CLEAR_TO_NULL                         19,132
AMBIGUOUS                                780
NOT_A_NEUTRAL_CITATION_DATE_STAMP        434
REPLACE_WITH_DIFFERENT_OWN_CITATION      207
SOURCE_GENUINE_FOREIGN_CITATION            3
UNTESTABLE  (not in the population)   26,535
```

Two files, because a 20,556-row pretty-printed object is a blob and not a
document: `existing-correction-population.jsonl` holds the rows and IS the hashed
population; `existing-correction-population.json` holds the id, the hash, the
scope, the counts, the extractor version and 20 quoted rows per class.

Every row carries: judgment id · court, case number, CNR and date · the retained
source object key and its `content_hash` (the primary evidence pointer) · the
value stored today · the proposed state and value · the reason class · whether
the stored citation occurs in the text at all and what verdict each of its
occurrences drew · the tier that produced the candidate · how many year-eligible
citations the document holds · the series token, its home court and whether it is
another court's.

**`UNTESTABLE` is deliberately not in the population.** Nothing can be *proposed*
for a document the damage screen rejects, and a file whose every row claims a
proposal must not contain 26,535 rows that do not. They are listed separately and
addressably in `untestable-rows.jsonl` (sha256 `93d268f3…`) so the OCR recovery
lane can pick them up, and they are counted as `CURRENT_UNKNOWN`.

**Nothing was applied.** No `judgments` row was written in this round.

---

## 7. Hard stops, kept

```
FINAL_FALSIFIER_RUN            NO
CITATION_BULK_APPLY            HOLD
EXISTING_CORRECTIONS_APPLIED   NO
DB_MIGRATION                   NONE
FINAL_APPLY_AUTHORIZATION      NOT_IN_THIS_ROUND
```

No `judgments` row was written. No citation edge was applied. The final citation
falsifier was not run, and the reason is the same one this round was called for:
a falsifier scored against a canonical corpus that still carries an unmeasured
correction population measures the population, not the resolver.

### Resource safety

```
NEW1_INTERRUPTED   NO
```

`HEAVY_BOX` stayed with NEW1 for the whole round. Its durable metric moved from
`new1_doc_vector_stage = 4,179,701` at the start to `4,199,215` at the end, with
`zeroDeltaWindows = 0` throughout — progress observed, not assumed from a process
list. No GPU lock was taken, no second GPU writer started, no lease acquired
beyond `GIT_COMMIT` for the commit itself, and every database pass was a batched
keyset walk with a durable checkpoint after each batch.

One measured cost, recorded rather than smoothed: the token/court census took
**23 seconds on a quiet box and 3 minutes 13 seconds while five concurrent
`judgment_citation_*` queries were running**, waiting on `DataFileRead`
throughout. It is cached to `token-court-matrix.json` so the walk pays it once.

---

## 8. What this round did not measure, and what is weak in it

- **`services/ingest/src/citations.ts` was not changed.** It carries the same
  regex for CITED references, and moving it moves the citation edge key space
  while `CITATION_BULK_APPLY = HOLD`. The 138-occurrence census bounds its
  exposure but does not decide it; it belongs in a round that can measure edges.
- **4 `REPLACE` proposals would replace a correct series token with an
  OCR-damaged one** (§5). Flagged in `replace-audit.json` under
  `bySeriesDirection`, not resolved. A damaged-token screen on the PROPOSED value
  would catch them mechanically; it was not built here because it belongs with
  the OCR recovery work, not with an extractor patch.
- **`SOURCE_GENUINE_FOREIGN_CITATION` rests on 3 rows and one of them is tier
  `UNMARKED`.** Too small to generalise from, and it is a class name rather than a
  finding.
- **`CLEAR_TO_NULL` is a proposal, not a proof of absence.** For a document that
  prints no citation of its own the refusal is right; the R17 Bombay recall class
  — where the page stamp exists and something before it disowns the citation —
  is still open and still unexplained at the third mechanism. 10,419 Bombay rows
  sit in this population and some fraction of them is that class, not a defect.
- **Pre-2023 rows are 595 of 1,350,954** and several courts retro-stamped
  citations onto old judgments. They are inside the population and were not
  looked at separately.
- **`sci-live.ts` extracts an INSC citation from text with no ownership test.**
  26 rows. Named, not measured.
- **`NOT_A_NEUTRAL_CITATION_DATE_STAMP` is 434 rows and 431 of them are Madras**,
  matching the despatch-stamp defect already noted in `citation-keys-cli.ts`.
  The class is structural (a month name in the series position) and does not
  claim to have found every non-citation the old regex matched.

```
THREE_ATTEMPT_STOP_TRIGGERED = NO
  two defects in the walk were found and each was fixed once, on evidence (a
  count that did not match the census, and a query that did not return). Neither
  was a repeated attempt at the same failure.
```

---

## FINAL

```
HEAD_START   72b87859
HEAD_FINAL   the commit this document lands in, parent b3ca71b2
COMMITS      one, NEW2 paths only

R17_POPULATION_REVERIFIED              YES, hash matches, 0 additions, 0 removals,
                                       0 contradictions, 0 stored values moved

CORPUS_MEASUREMENT_SCOPE   every AWS High Court row carrying a neutral_citation
ROWS_EVALUATED                         1,350,954
EXHAUSTIVE_OR_SAMPLE                   EXHAUSTIVE  (walk count = census count)

UNCHANGED_CONFIRMED                    1,303,863
CLEAR_TO_NULL                             19,132
REPLACE_WITH_DIFFERENT_OWN_CITATION          207
AMBIGUOUS                                    780
UNTESTABLE                                26,535
SOURCE_GENUINE_FOREIGN_CITATION                3
OTHER_EXACT_CLASS
  NOT_A_NEUTRAL_CITATION_DATE_STAMP          434

WRONG_OR_UNSAFE_CURRENT                   19,773     1.464%
CURRENT_CORRECT                        1,303,866    96.514%
CURRENT_UNKNOWN                           27,315     2.022%

DB_SUFFIX_DEFECT_REPRODUCED            YES
DB_SUFFIX_ROWS_FOUND                   138 occurrences of 4,575,593 (0.0030%)
DB_SUFFIX_ROOT_CAUSE                   the optional suffix group ended in \b, so a
                                       suffix with no boundary after it fails and
                                       the group matches EMPTY — the regex returns
                                       a different citation key instead of failing
DB_SUFFIX_FUTURE_FIX                   SHIPPED. hc-load.ts NEUTRAL_G: the boundary
                                       moved onto the number. Failure-first test,
                                       observed red at 72b87859. 0 negative
                                       controls moved. citations.ts NOT changed.
DB_SUFFIX_EXISTING_ROWS                43 (candidate only, nothing applied)

NEW_CORRECTION_POPULATION_ID           NEW2-R18-EXISTING-9679cff06d0e6404
NEW_CORRECTION_POPULATION_HASH         9679cff06d0e6404ac10481695f1ee4858f8f625755537a75086dcb981f303c9
CORRECTION_POPULATION_COUNT            20,556

EXISTING_CORRECTIONS_APPLIED           NO
FINAL_FALSIFIER_RUN                    NO
CITATION_BULK_APPLY                    HOLD
NEW1_INTERRUPTED                       NO   (4,179,701 → 4,199,215, zeroDeltaWindows 0)
BLOCKERS                               none
```
