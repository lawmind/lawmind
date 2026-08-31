# NEW2 — R17. Whose citation is this? The extractor never asked.

`HEAD` at start: `29241ef6`. `HEAD` at the extractor commit: `f855aa55` (LCC's
R16 landed mid-round; re-anchored, nothing underneath this patch moved — LCC
touched only `docs/ai/lcc-r16/**` and `scripts/lcc-r16-*.mts`).

Extractor commit: **`8ff7083d`**.

```
EXTRACTOR_PATH    services/ingest/src/harvest/hc-load.ts  →  neutralCitationFrom
EXTRACTOR_OWNER   NEW2
```

`services/ingest/**` is ingestion, which is this lane's own path, and every
commit that has ever touched this function is a corpus/ingest commit. It is not
`services/api/src/citations/**` — the path LCC is mutating in the concurrent
round — so there is no collision. `SHARED_PATH_COLLISION = NO`.

---

## 1. The 30 keys are 109 rows, and all 109 print no citation of their own

R16's classification reproduces exactly against the current database:

```
INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION                     30
SOURCE_DOCUMENT_GENUINELY_PRINTS_FOREIGN_NEUTRAL_CITATION    13
INGEST_WRONG_DOCUMENT_IDENTITY                                1
UNTESTABLE                                                    2
```

`docs/ai/new2-r17/reproduce-noncohort-46.json`. A verdict there is a KEY verdict;
a defect is a ROW. Resolving the 30 keys into rows gives **109 defective rows**
(`docs/ai/new2-r17/defect-table-30.json`), and the one thing R16 asserted rather
than measured is now measured per row:

```
documents printing ANY other neutral citation      5 of 109
distinct neutral citations in the document         1 in 104, 2 in 5
```

All five of the "other" citations are themselves cited authorities. So **109 of
109 defective documents print no neutral citation of their own anywhere in their
text.** The extractor was not choosing badly between candidates; it had zero own
candidates and answered anyway.

Where the wrongly-taken citation sat, and what stood in front of it:

```
structure   quoted_or_cited_authority  80    offset  0-250        1
            followed_authority         21            251-1000    35
            cases_referred_block        2            1001-3000   73
            page_furniture              1
            header                      1    a citing phrase within 160 chars
            footer                      1      before it            106 of 109
            body_unmarked               3    a foreign CNR directly before  1
```

```
NEUTRAL_CITATION_ROOT_CAUSE =
  neutralCitationFrom accepted the FIRST regex match in the opening 3,000
  characters on a year test alone. It had no test of whether the occurrence was
  the document's own claim, so on a document that prints no citation of its own
  it returned the citation of the judgment being followed or quoted. The 3,000
  character window is the EXPOSURE — 108 of the 109 sat beyond 250 — and the
  missing ownership test is the CAUSE. Proven, not hypothesised: the two are
  separable and both were measured (§3, arm ARM_W250).
```

The one defect inside the old masthead window is Uttarakhand `HABC/16/2023`,
whose order sheet reads `D1- 23 UKHC010088392026 2026:UHC:4224-DB HABC No.16 of
2023` — a connected 2026 petition's CNR and citation, 160 characters in. No
window could ever have caught it; the foreign CNR beside it does.

---

## 2. The frozen, prediction-blind evaluation population

```
EVALUATION_POPULATION_ID     NEW2-R17-EVAL-b93ed61f2710cc8e
EVALUATION_POPULATION_HASH   b93ed61f2710cc8e330a5da97a390875f741ee54928482880a3a404df0115de1
EVALUATION_SIZE              550
```

`docs/ai/new2-r17/eval-population.json`. Frozen by `(judgmentId, contentHash)`;
re-verified at scoring time — `hashMatches true`, `contentDrift 0`.

The blind strata are **not** drawn from `judgments.neutral_citation`, because that
column IS the extractor's prediction and drawing from it makes a set that can only
confirm the extractor. They are drawn by random uuid anchor from 2023+ AWS High
Court rows (`bench=testcase` excluded) out of a pool of 39,749 documents — not
`TABLESAMPLE SYSTEM`, which is court-clustered, and not `ORDER BY random()`, which
is a sequential scan of 18.7M detoasted documents.

```
A_known_wrong             109   the measured defective rows
B_owner_of_a_defect_key    24   the documents those rows stole from   (positives)
C_source_genuine_foreign   34   the 13 keys a court really did print twice
D_multi_citation           47   two or more distinct citations
E_no_citation_in_text      30   no candidate at all
F_short_order              60   under 2,500 characters
G_long_judgment            40   20,000 characters or more
H_header_boundary          60   first occurrence at 150-800
I_degraded / _known        24   unreadable extraction
J_wrong_document_identity   2   the Karnataka case, §6
R_random_2023plus         120   the base rate, drawn blind
```

**Ground truth is anchored on IDENTITY, never on position** — the row's own CNR
and case number, both of which come from the AWS metadata record and not from the
text being judged. Position decides nothing, so an arm cannot be marked with its
own answer sheet. A citation the adjudicator could not anchor comes back
UNDECIDED and is read by hand: **63 documents hand-adjudicated**,
`docs/ai/new2-r17/hand-adjudication.json`, including **two first-pass labels
corrected on a second pass** and noted in place rather than overwritten.

Two things the hand pass found that no automatic rule had:

- **Bombay does not print its citation in the masthead.** 45 of the 59 unanchored
  documents are Bombay orders whose citation is the last token on the page, after
  the judge's signature — page furniture, 500 to 800 characters in.
- **Rajasthan stamps `[citation] (n of m) [MATTER-NUMBER]`**, which binds each
  citation to a matter. In `CW/2909/2025` the repeatedly stamped citation is bound
  to `CW-4514/2025`, not to the row.

---

## 3. Old versus candidate, on the frozen population

Named arms, because the fix that looks free had to be able to lose on the record.

```
                    true own   false own   missed   correct NULL   precision  recall
OLD                     197         131        1            219      0.597    0.985
ARM_W250                146          12       53            339      0.924    0.734
CAND_A_IDENTITY         143           0       62            345      1.000    0.698
SHIPPED  (8ff7083d)     201           6        2            339      0.962    0.981
```

Precision and recall are strict — a citation string that differs at all is wrong.
Two documents in every arm lose a `-DB` suffix; they are counted separately (§7)
and the lenient figures are in `docs/ai/new2-r17/arms-scored.json`.

**All 6 of SHIPPED's false owns are answers on text the damage screen rejects**,
so on readable documents it is **0**. In 4 of the 6 the document prints
`Neutral Citation No. 2024:PHHC:010957` in a perfectly readable masthead and it is
the row-to-document binding that is untestable, not the citation — which is why a
damage screen is reported as a measured option rather than folded in silently
(arm `CAND_C_SCREENED`: 0 false owns, and it would withdraw 1.95% of answers on a
blind draw, `corpus-impact.json → damageScreen`).

The round's required tradeoff statement:

```
OLD_CORRECT_OWN   197        NEW_CORRECT_OWN   201
OLD_FALSE_OWN     131        NEW_FALSE_OWN       6   (0 on readable text)
OLD_MISSING_OWN     1        NEW_MISSING_OWN     2

FALSE_OWN_REDUCTION        125 of 131  (95.4%);  131 → 0 on readable text
ADDITIONAL_MISSING_COST      1 document
```

The candidate is not "better on precision". It is better on **both**: it answers
4 more true own citations than the shipping rule while removing 125 false ones,
and buys that with one extra refusal.

`ARM_W250` is the measured refusal of the obvious fix. Cutting the window to 250
removes 119 of the 131 false owns and **loses 53 of 205 true ones**, because three
courts stamp the citation in the page furniture. It was never shipped and now
there is a number saying why.

Per stratum, the two that matter most:

```
A_known_wrong (109)          OLD  107 false own            SHIPPED  0 false own, 107 correct NULL
C_source_genuine_foreign(34) OLD   31 true, 1 false        SHIPPED 31 true, 0 false
R_random_2023plus (120)      OLD   37 true, 0 false        SHIPPED 37 true, 0 false — identical
```

The last line is the honest one about corpus risk: **on a blind random draw the
two rules agree completely.** The frozen population's precision is a property of a
set that is 20% known defects by construction and is not a corpus rate.

---

## 4. What it does to the corpus

`docs/ai/new2-r17/corpus-impact.json` — 59,434 blind 2023+ High Court documents,
no ground truth, measured against the committed extractor:

```
both NULL          46,471
same citation      12,741
withdrawn             211      1.63% of everything the old rule answered
gained                 10
changed                 1
```

Concentrated, and named rather than averaged away:

```
Bombay      111 of 603 answers withdrawn   (18.4%)
Meghalaya     7 of  14                     (50.0%)
Gauhati      30 of 217                     (13.8%)
Allahabad    18 of 5,289                   ( 0.3%)
```

Gauhati is the rule working as designed: it prints its own CNR immediately before
the citation on 18,905 of 22,169 documents, and the 13.8% withdrawn are the ones
where the printed CNR belongs to the lead matter of a connected group.

**The remaining Bombay class is a real recall loss and it is not fully
explained.** Two mechanisms are visible in the samples — a connected-matter list
immediately before the page stamp, and an FIR number (`Crime No.0138 of 2024,`)
directly abutting it — and a third is not visible from a single occurrence's
context. Every one of these is a NULL, never a wrong value, so it trades an
unsupported certainty for an honest gap in the direction the round asked for. It
is written down here as an open recall class rather than chased with a fourth
change:

```
THREE_ATTEMPT_STOP_TRIGGERED = NO
  three changes were made to the tier-3 shape and each was measured and each
  improved both false-own and true-own counts (they were not repeated attempts at
  one failure). The fourth was NOT made: the remaining Bombay class needs
  per-document instrumentation at scale, and guessing at it is what the bound
  exists to prevent.
```

---

## 5. Existing rows — a population, not a rewrite

```
EXISTING_CORRECTION_POPULATION   NEW2-R17-EXISTING-ed780d3fdeb77514
EXISTING_CORRECTIONS_APPLIED     NO
```

`docs/ai/new2-r17/existing-correction-population.json`. 127 rows, each binding
judgment identity · current extracted citation · corrected state and value ·
primary evidence · reason · extractor version (`sha256`
`6739f94d…`, commit `8ff7083d`, uncommitted changes `false`) · population hash.

```
corrected to NO_SAFE_OWN_CITATION   122
corrected to a different citation     3
NULL → a citation                     2
evidence supports the correction    125 of 127
```

**No replacement citation is invented where the court printed none** — that is the
defect being corrected, and doing it in the other direction is the same mistake.
The 2 unsupported rows are flagged rather than hidden: they are the Rajasthan
double-bracket commons where the corrected rule refuses and the hand-read evidence
says a citation exists. An authorisation round should see them.

Nothing in this round wrote a `judgments` row.

---

## 6. The wrong-document-identity case, settled by the bytes

```
DOCUMENT_IDENTITY_CORRECTION_REQUIRED = NO
verdict = SOURCE_PUBLISHED_ANOTHER_MATTERS_JUDGMENT_UNDER_THIS_CNR
```

`docs/ai/new2-r17/document-identity-case.json`. `2023:KHC-D:14142` is carried by
`MFA/25207/2011` (04.12.2023) and `MFA/25707/2011` (05.12.2023), both holding
byte-identical text whose masthead reads `MFA No. 25207 of 2011`.

The database cannot separate "our loader wrote one document against two rows" from
"the court published the same judgment twice", so both objects were re-read from
the AWS Open Data bucket — an authorised source, CLAUDE.md §6a:

```
KAHC020253502011_1_2023-12-04.pdf   57,617 bytes   sha256 479e1bbe…
KAHC020007402011_1_2023-12-05.pdf   57,617 bytes   sha256 309cdb09…
OBJECT_BYTES_IDENTICAL = false
```

Two genuinely different objects, both rendering the same matter. The loader stored
what each object contains, so there is no loader defect to correct: **the court
published another matter's judgment under CNR `KAHC020007402011`.** That is a
source fact to record against the row, not a canonical identity to rewrite, and
the extractor patch is not allowed to stand in for it. `CANONICAL_IDENTITY_REWRITTEN = NO`.

---

## 7. Two findings this round did not act on

**A `-DB` suffix the extraction glues shut.** Both Delhi rows in stratum C print
`…2025:DHC:8491-DBThis is a digitally signed order…`. The page prints `-DB`; the
shared regex cannot take a suffix with no word boundary after it, so the corpus
holds `2025:DHC:8491`. Every arm loses it identically, so it is counted in its own
bucket and did not move the ranking. **Not fixed here** — it changes the extracted
VALUE rather than the ownership question this round was asked, and a changed
citation key belongs in a round that can measure what it does to the key space.

**Two metadata/document case-number disagreements**, found while hand-adjudicating
and recorded in `hand-adjudication.json`: Chhattisgarh `MCRC/1666/2025` under a
masthead reading `MCRC No. 1696 of 2025`, and `MAC/1722/2018` under `MAC No. 1364
of 2018`. Out of scope; not investigated.

---

## 8. Controls and hard stops

**The 13 source-genuine foreign citations are preserved.** Stratum C: 31 true own
citations, **0 false**, 1 correct refusal. A court printing one number on two
matters is source truth; the corrected rule reads each document's own masthead or
page stamp and does not relabel either as the other's. Nothing was deleted or
suppressed.

```
CITATION_BULK_APPLY            HOLD
FINAL_FALSIFIER_RUN            NO
FINAL_APPLY_AUTHORIZATION      NOT_IN_THIS_ROUND
```

No edge was written, no falsifier was run, and no R14/R15 population was promoted.
The LCC residual-resolver round is finishing; extraction truth is settled first, on
purpose.
