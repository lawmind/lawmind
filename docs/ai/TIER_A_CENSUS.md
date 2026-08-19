# The exact Tier-A population — 19 August 2026

**Measured, not projected.** Every number here is a full count over all
17,945,147 judgments. The previous 8.49M Tier-A figure was extrapolated from a
0.2% sample; this replaces it.

Contract `v1`. Deployed view hash `e76879ab6bbcd452`
(`judgment_embedding_eligibility`, migrations `0056` + `0058`).

---

## Headline

| | rows | share of corpus |
| --- | ---: | ---: |
| corpus | 17,945,147 | 100% |
| **TIER A** | **9,700,157** | 54.06% |
| **TIER A-CORE** (subset of Tier A) | **4,429,062** | 24.68% |
| **distinct texts in Tier A** | **8,854,281** | — |
| duplicate groups (>1 member) | 301,531 | — |
| **vectors saved by exact dedup** | **845,876** | 8.72% of Tier A |

**8,854,281 is the number that should price a GPU run**, not 9,700,157. The
difference is 845,876 byte-identical texts that would otherwise be embedded twice
or more.

Tier A came in **14.2% above** the 8.49M projection, and A-Core **16.6% above**
3.80M. A sample was never going to be wrong by a small amount here: the axes are
correlated with document length, and length is not distributed the way a uniform
sample assumes.

### Integrity — four independent counts that must agree, and do

```
judgments actual                     17,945,147
census rows_seen                     17,945,147
sum of all census cells              17,945,147
representative members summed         9,700,157  = Tier A
distinct representatives              8,854,281
```

The census also survived an interruption test before the full run: 6,000 rows,
stopped, resumed, 10,000 rows — progress, cells and representative members all
agreed exactly. Each page's aggregates and the cursor that accounts for them are
written in ONE transaction, so the only two states that can exist are "page fully
counted and cursor advanced" and "neither".

---

## Where the other 46% went

Every row lands in exactly one bucket, including the excluded ones, because
"what did we throw away and why" is a question a selector has to survive.

| bucket | rows | share |
| --- | ---: | ---: |
| `excluded_stub` (under 2,000 chars) | 7,263,768 | 40.48% |
| `tier_a_standard` (2,000–3,999) | 5,271,095 | 29.37% |
| `tier_a_core` (4,000+) | 4,429,062 | 24.68% |
| `excluded_text` (axis B) | 332,839 | 1.85% |
| `excluded_role` (axis C) | 324,579 | 1.81% |
| `bail_order` | 321,101 | 1.79% |
| `excluded_identity` (axis A) | 2,703 | 0.02% |

**Length is doing essentially all the exclusion.** 40.48% of the corpus is under
2,000 characters; everything else combined removes 5.47%. Identity removes
0.02% — 2,703 rows out of 17.9M — which confirms on the full population what a
0.2% sample suggested: identity is not the discriminator in this corpus. The axis
stays because the day an ingest lands rows without a case number, this is the
check that notices rather than the retriever.

`bail_order` is broken out rather than excluded or included. Bail orders are
practically useful and are not precedent; which tier they belong in is a
retrieval measurement, and NEW1's to make.

### Text size

| band | rows | mean chars |
| --- | ---: | ---: |
| `standard` | 5,565,296 | 2,829 |
| `brief` | 4,476,641 | 1,490 |
| `stub` | 3,302,525 | 680 |
| `full` | 2,812,244 | 5,435 |
| `substantial` | 1,788,441 | 27,949 |

`substantial` averages **27,949 characters — 5.1x `full` and 9.9x `standard`**.
It is 10.0% of the corpus and, at one vector per document, it is where a
fixed-size embedding window loses the most. NEW1's finding that dense already
over-selects long documents 2.13x uncontrolled (bus 0735) lands squarely on this
band.

---

## Distribution — and the reason the year column exists

### Top courts by Tier A

| court | Tier A |
| --- | ---: |
| Madras High Court | 1,294,279 |
| Allahabad High Court | 1,058,261 |
| Patna High Court | 909,640 |
| High Court of Kerala | 776,812 |
| High Court of Punjab and Haryana | 727,460 |
| High Court of Karnataka | 725,919 |
| Bombay High Court | 681,652 |
| High Court for State of Telangana | 657,917 |
| High Court Of Rajasthan | 490,363 |
| High Court Of Chhattisgarh | 382,569 |

### By decade

| decade | Tier A |
| --- | ---: |
| 1950s | 1,048 |
| 1960s | 3,174 |
| 1970s | 2,937 |
| 1980s | 2,752 |
| 1990s | 28,134 |
| 2000s | 552,152 |
| 2010s | 3,748,533 |
| 2020s | 5,361,427 |

**93.9% of Tier A is 2010 or later.** Everything before 1990 is 9,911 documents —
0.1%. A semantic index built on this is an index of the last fifteen years with a
decorative tail, and any evaluation using pre-1990 authorities is measuring a
population that barely exists here.

The census is stored at court × year × band × bucket precisely so this cannot
hide. NEW2 found 22 court-year blackouts invisible to every court-level
percentage; a court-level Tier-A figure would conceal exactly the same thing.

---

## Duplicates: real common orders, not a data defect

301,531 groups have more than one member. The distribution is steep:

| members | groups |
| ---: | ---: |
| 2 | 215,950 |
| 3 | 33,535 |
| 4 | 16,193 |
| 5 | 7,894 |
| 6 | 5,482 |
| 7 | 3,393 |
| 8 | 2,817 |
| 9 | 2,084 |

The largest group has **7,118 members**. Inspected rather than assumed — the top
three are genuine common orders, and the judgments say so themselves:

* 7,118 · Madras HC, W.P.No.26297 of 2022 — one order, thousands of writ petitions.
* 2,454 · Gujarat HC — text reads *"SPECIAL CIVIL APPLICATION NO. 4139 of 2013 TO
  … 4838 of 2013 With …"*.
* 2,152 · Gujarat HC — *"CRIMINAL REVISION APPLICATION No 308 of 1995 to … No
  2863 of 1995"*.

### The obligation this creates on the retrieval surface

The representative for the 7,118-member group is one petition's row, and its
`case_title` and `judgment_date` are that petition's, while the TEXT is the
common order naming a different petitioner. That is not a defect — it is what a
common order is.

**A retrieval hit on a representative must fan back out to its members before
display.** Otherwise an advocate searching their own case number finds the
decision filed under somebody else's name, or does not find it at all.
`member_count` is on `embedding_content_representative` so the surface can see
the fan-out is required, and the map back is
`WHERE content_hash = $1` against `judgments_content_hash_idx`.

**No case identity is collapsed.** Every petition keeps its `judgments` row,
caption, case number and parties. Only the EMBEDDING is shared, and only for
byte-identical text. Nothing fuzzy is merged, and the ~2k genuine citation
conflicts are untouched: collapsing one of those deletes a decision from the
corpus while every count still looks healthy.

---

## How it was produced

`pnpm --filter @lawmind/embed run tier-census -- --page 5000 --force`

One walk of `judgment_embedding_eligibility` by keyset on `id`. 3,589 pages,
~2,200 rows/s under concurrent load, roughly 2h20m wall. It detoasts every
`full_text` in a 140 GB relation, which is `DB_SCAN` class — hence the resource
gate and the explicit `--force`.

Re-runnable and idempotent. `--reset` truncates rather than re-walking, because a
definition change makes accumulated counts evidence about a population that no
longer exists.

### One honest caveat about the recorded hash

The census ran under view hash `25ccd7cdc445f66e`. Migration `0058` then changed
the view's TEXT — not its meaning — to make `is_bail_order` null-safe, producing
hash `e76879ab6bbcd452`.

**The counts are unaffected, and here is why rather than an assurance.** The
census bucketed rows in JavaScript, where a NULL `is_bail_order` arrives as
`null` and `if (r.isBailOrder)` is falsy — i.e. it already behaved exactly as
`0058`'s view does. The SQL bug that `0058` fixes could not reach this walk,
because this walk never used the SQL boolean.

`embedding_census_progress` is re-stamped to the current hash. The
`embedding_content_representative` rows deliberately **keep `25ccd7cdc445f66e`**,
the hash they were actually built under: that column is provenance, and rewriting
8.85M rows to assert a tidier history is the opposite of what it is for.

---

## What this does NOT say

* **Nothing about quality.** Tier A is a population that is worth spending a
  vector on. Whether one vector per document retrieves well is NEW1's
  measurement, and their 89–96%-at-3%-cost result (bus 0735) is about a sample,
  not this population.
* **`script_quality` is empty.** Zero rows carry a verdict, so axis B still
  passes documents Poppler stripped of Devanagari and Kruti Dev documents whose
  bytes are valid ASCII. NEW2 measured Rajasthan at 95.3% Devanagari-defective.
  Those documents are in the 9,700,157.
* **`hc_document_class` is 93.7% NULL**, so axis C excluded only what was known
  to be court admin. UNKNOWN is not BAD, deliberately — but it does mean
  `excluded_role`'s 1.81% is a floor, not a measurement of how much admin the
  corpus holds.
* **The corpus is still growing.** 17,945,147 is the count at the moment of the
  walk. Any figure derived from it should quote the definition hash and the date,
  as this document does.
