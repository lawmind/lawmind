# DECISION_IDENTITY_CONTRACT_V1

**Lane:** NEW2 · **Round:** R7 §10 / §7.5 · **25 August 2026**
**Machine-readable:** `docs/ai/new2-r7/decision-identity-census.json` (every query, verbatim)
**Census script:** `scripts/n2-decision-identity-census.mjs` — contains no `UPDATE`, `DELETE`, `MERGE`, or `INSERT`.

---

## 0. The bound this contract does not cross

**Nothing here deduplicates anything.** No row is deleted, merged, hidden,
preferred or rewritten. Every source record and its provenance is preserved. The
output is a *classification with stated evidence*; promoting any class to a
canonical identity is a separate, deliberate act with its own review and is not
performed by this round.

This is not caution for its own sake. §2 shows that **74% of the documents a
content-hash dedup would delete are common orders**, and deleting them would
destroy real matter identities to remove a duplication that does not exist.

---

## 1. Why "how many judgments do we have" has no single answer

18,698,984 rows. 1,701,630 of them share a `content_hash` with at least one
other. The naive adjustment — subtract the 1,201,091 beyond the first member of
each group — is wrong in three directions at once:

- a **common order** disposing of forty connected matters is one decision text
  and forty matter identities. Both are true;
- **7,160 byte-identical documents** in one group are not one authority — that is
  an extraction failure, and collapsing it would *manufacture* an authority;
- the confirmed **same-decision-different-source** class does **not** share a
  content hash, because the two extractions differ. The hash over-counts and
  under-counts simultaneously.

So the corpus is classified, not collapsed.

---

## 2. §7.5 states, measured

### 2.1 By exact content hash — 500,539 groups, 1,701,630 documents

Discriminated by what the members of a group *disagree* about, using primary
metadata already on the row.

| §7.5 state | groups | documents | beyond first | largest group |
| --- | ---: | ---: | ---: | ---: |
| `EXACT_DOCUMENT_DUPLICATE` — one court, one case number, one date | 91,522 | 183,310 | **91,788** | 14 |
| `COMMON_ORDER_CONNECTED_MATTERS` — one court, one date, many case numbers | **354,081** | **1,249,978** | 895,897 | 99 |
| `EXTRACTOR_CONTAMINATION` suspect — ≥100 byte-identical documents | 545 | **131,056** | 130,511 | **7,160** |
| `UNKNOWN` — one case number, many dates | 41,944 | 83,908 | 41,964 | 5 |
| `UNKNOWN` — many case numbers **and** many dates | 12,447 | 53,378 | 40,931 | 99 |
| `NOT_SAME_DECISION` — same text, different courts | **0** | 0 | 0 | — |

**73.5% of the documents in duplicate-hash groups are common orders.** They are
the class a dedup would delete and the class that must never be deleted.

`NOT_SAME_DECISION` is empty: no content hash in this corpus spans two courts.
Whatever the duplication is, it is never cross-court contamination.

### 2.2 The contamination class, named

The largest byte-identical groups, by title:

| documents | court | title | dates spanned |
| ---: | --- | --- | --- |
| **7,160** | Madras High Court | *A Jayaranjani Vs Radhakrishnan I.A.S.* | 2022-04-04 → 2023-03-11 |
| 2,457 | High Court of Gujarat | *GAIL (INDIA) LTD Vs COMPETENT AUTHORITY* | 2015-08-11 (one day) |
| 2,153 | High Court of Gujarat | *JOHN HAMILTION CHRITIAN Vs TAPTI CORPORATION* | 1997-05-07 (one day) |
| 1,533 | High Court Of Rajasthan | *AACHI DEVI AND ANR Vs STATE EDUCATION DEPARTMENTORS* | 2013-10-03 → 2014-11-26 |
| 1,407 | Madras High Court | *63 MOONS TECHNOLOGIES LIMITED Vs DEPUTY SUPERINTENDENT OF POLICE* | 2022-02-18 → 2023-02-11 |
| 1,375 | High Court for State of Telangana | *. Vs Andhra Pradesh Electicity Regulatory Commission,* | 2011-04-15 → 2011-07-29 |

**A group spanning eleven months cannot be one decision.** 7,160 documents with
identical text and dates from April 2022 to March 2023 is an extraction that
produced the same output for thousands of different inputs. The title *`. Vs
Andhra Pradesh Electicity Regulatory Commission,`* — a bare full stop as the
petitioner — is the same signal from the other end.

The one-day groups (GAIL, John Hamiltion) are different and may be genuine
common orders of unusual size, or a bulk disposal. **They are `UNKNOWN` and this
contract does not guess between them.** 545 groups is a small enough population
to adjudicate by hand and that is the recommendation, not an automated rule.

### 2.3 By CNR — the class the content hash cannot see

CNR is a court-issued case identifier, so a CNR shared across rows with
*different* text is exactly what a byte-hash misses. 18,698,968 of 18,698,984
documents carry one.

| state | CNR groups | documents | beyond first |
| --- | ---: | ---: | ---: |
| `EXACT_DOCUMENT_DUPLICATE` — same CNR, same text | 64,114 | 128,236 | 64,122 |
| **`SAME_DECISION_DIFFERENT_SOURCE` candidate** — same CNR, **same date**, different text | **63,602** | **127,227** | 63,625 |
| `SAME_CASE_DIFFERENT_DATE` — same CNR, different date, different text | 208,493 | 816,890 | 608,397 |
| same CNR, different courts | **0** | 0 | 0 |

**63,602 candidate pairs of the *Chipade* kind.** The single case NEW3 and LCC
found by hand is a class of sixty-three thousand: one court case, one decision
date, two different texts held. The content hash sees none of them.

**208,493 groups (816,890 documents) are `SAME_CASE_DIFFERENT_DATE`** — one case,
several orders over its life. These are **timeline edges, not duplicates**, and
they are the raw material for a matter timeline rather than something to remove.
That they outnumber every duplicate class is worth holding on to.

### 2.4 By shared neutral citation

| state | citation keys | documents | beyond first |
| --- | ---: | ---: | ---: |
| `EXACT_DOCUMENT_DUPLICATE` | 58,908 | 117,821 | 58,913 |
| `SAME_DECISION_DIFFERENT_SOURCE` candidate | 20,823 | 41,671 | 20,848 |
| `COMMON_ORDER_CONNECTED_MATTERS` | 21,316 | 75,118 | 53,802 |
| **`SHARED_CITATION_AMBIGUOUS`** — same court, many case numbers, different text | **54,240** | **126,052** | 71,812 |
| `SHARED_CITATION_AMBIGUOUS` — different courts | 11 | 30 | 19 |

**54,251 citation keys resolve to more than one distinct decision.** This is a
direct resolver hazard and it is the reason `CITATION_RESOLUTION_SCALE_DECISION_V1`
gates bulk resolution: a lookup on any of these keys **must** return `AMBIGUOUS`,
never a rank-1 pick. Eleven of them span two different courts, which is the worst
shape — a citation that resolves to a decision of a court that never made it.

---

## 3. The dedup-adjusted denominators

Two different denominators, because two different questions.

```
raw documents                                                18,698,984

  minus EXACT_DOCUMENT_DUPLICATE beyond first (hash)              91,788
  minus EXTRACTOR_CONTAMINATION beyond first                     130,511
  minus SAME_DECISION_DIFFERENT_SOURCE beyond first (CNR)         63,625
                                                             ───────────
  DISTINCT MATTER IDENTITIES                              ≈  18,413,060

  minus COMMON_ORDER members beyond the first in each group      895,897
                                                             ───────────
  DISTINCT LEGAL AUTHORITIES (decision texts)             ≈  17,517,163
```

**Both figures are approximate in a stated way and neither may be quoted as
exact.** The three subtracted classes are measured on three *different* keys —
content hash, CNR, neutral citation — and **their overlap has not been
measured**. A document that is both a hash duplicate and a CNR duplicate is
subtracted twice, so the true values are somewhat **higher** than shown. The
direction of the error is known; its size is `NOT_MEASURED`.

**The number to use externally is neither.** Until the overlap is measured, the
honest public statement is the raw count with its provenance — "18.7 million
judgment documents from AWS Open Data" — and never "18.7 million judgments" or
"18.7 million cases".

---

## 4. The contract

### 4.1 States and their promotion rules

| §7.5 state | may be merged? | may drive a denominator? | surface behaviour |
| --- | --- | --- | --- |
| `EXACT_DOCUMENT_DUPLICATE` | **candidate only** — never automatically | yes, as a subtraction | show one, keep both rows |
| `SAME_DECISION_DIFFERENT_SOURCE` | **no** — the texts differ; which is canonical is a judgement | yes, as a subtraction | show both, marked as one decision held twice |
| `COMMON_ORDER_CONNECTED_MATTERS` | **never** | authorities yes, matter identities **no** | show each matter; the shared text is a fact about the order |
| `SHARED_CITATION_AMBIGUOUS` | **never** | no | the resolver returns `AMBIGUOUS`; never a rank-1 pick |
| `EXTRACTOR_CONTAMINATION` | **never merged — quarantined** | **no**, excluded from both | must not be an authority, must not be retrievable as one |
| `NOT_SAME_DECISION` | never | no | unrelated |
| `UNKNOWN` | never | **no** — held out of both denominators | treated as distinct |

### 4.2 Rules that bind every consumer

1. **Provenance is never destroyed.** Every source record keeps its `source_url`,
   `content_hash` and row identity regardless of what class it lands in.
2. **A common order is one text and many matters, permanently.** Any surface that
   collapses connected matters because their text matches has lost the
   advocate's case from their own matter list.
3. **`UNKNOWN` never resolves toward "duplicate".** 82,895 documents sit in the
   two `UNKNOWN` hash classes and 545 groups sit in the contamination-suspect
   class; the safe reading of all of them is *distinct*.
4. **No similarity threshold.** There is no fuzzy-match rule in this contract and
   none is proposed. `SAME_DECISION_DIFFERENT_SOURCE` is identified by a
   **court-issued CNR plus an identical decision date**, which is primary
   metadata, not by text similarity. A similarity threshold over 18.7M documents
   would merge on the strength of an anecdote, and the cost of a wrong merge is
   an advocate finding their case filed under someone else's name.
5. **Contamination is quarantined before it is counted.** The 545 groups are
   excluded from both denominators in §3 and must be excluded from any
   retrieval-eligible population before a passage build; 131,056 identical
   documents in a vector index is 131,056 identical nearest neighbours.

### 4.3 `NOT_MEASURED` — recorded, not smoothed

| question | state |
| --- | --- |
| overlap between the hash, CNR and citation duplicate sets | `NOT_MEASURED` — makes §3 approximate in a known direction |
| whether the 545 contamination-suspect groups are contamination or genuine bulk disposals | `UNKNOWN` — 545 is hand-adjudicable and that is the recommendation |
| which member of a `SAME_DECISION_DIFFERENT_SOURCE` pair is the better text | `NOT_MEASURED` — needs the body-evidence state of both |
| whether `SAME_CASE_DIFFERENT_DATE` groups are complete case histories | `NOT_MEASURED` — they are a timeline opportunity, unexplored |
| identity for the 16 documents with no registry identifier | all 16 are the leaked synthetic fixtures |

### 4.4 Relationship to the existing code

`services/ingest/src/decision-identity.ts` already implements candidate
generation with strengths `CNR_EXACT`, `CITATION_EXACT`, `REGISTRY_STRONG`,
`CAPTION_WEAK`, `SAME_CASE_DIFFERENT_DATE`, and marks only the first two
`PROMOTABLE`. This contract **does not change it** and maps onto it:

| module strength | §7.5 state |
| --- | --- |
| `CNR_EXACT` + identical text | `EXACT_DOCUMENT_DUPLICATE` |
| `CNR_EXACT` + same date + different text | `SAME_DECISION_DIFFERENT_SOURCE` |
| `CITATION_EXACT` + many case numbers | `SHARED_CITATION_AMBIGUOUS` **or** `COMMON_ORDER_CONNECTED_MATTERS` — separated by whether the text matches |
| `SAME_CASE_DIFFERENT_DATE` | `SAME_CASE_DIFFERENT_DATE` — a timeline edge, never a duplicate |
| `CAPTION_WEAK` | `UNKNOWN` |

**`document_duplicate_groups` holds 563 groups and 1,500 members** against the
500,539 groups measured here. The materialisation in
`dedup-materialize-cli.ts` has not been run against the current corpus. Running
it would populate the exact-hash groups only, and would carry all three errors in
§1 into a table other lanes read — so it should not be run until the class column
this contract defines exists alongside it.
