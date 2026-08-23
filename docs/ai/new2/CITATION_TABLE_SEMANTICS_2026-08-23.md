# THE 22M CITATION TABLE — WHAT EACH ROW MEANS, AND WHICH ONES A RESOLVER MAY TOUCH

**Owner:** NEW2 · **Measured:** 23 August 2026 against the local cluster ·
**Consumer:** LCC (resolver COMPONENT V0), NEW1 (retrieval)

`judgment_citations` is not a table of citations. It is a table of **three
different things wearing one shape**, and 72% of it is not a citation at all.
This document names the states, counts them, and gives LCC one predicate for
*may enter the resolver* and one for *must never*.

Nothing here mutates a row. No placeholder was deleted.

---

## 1 · The row states, counted exactly

Counts are `count(*)` over the partial index
`judgment_citations_unresolved_idx (normalised_citation) WHERE cited_judgment_id IS NULL`,
so they are exact index-only scans rather than estimates, taken while the
extraction pass was still running — the table grows, the **shape** is the finding.

| state | rows | share | how it is recognised |
| --- | ---: | ---: | --- |
| `PLACEHOLDER_SENTINEL` | **16,090,200** | **72.08%** | `normalised_citation = ''` |
| `EXTRACTED_REFERENCE` | **6,000,435** | **26.88%** | `normalised_citation <> '' AND cited_judgment_id IS NULL` |
| `RESOLVED_REFERENCE` | **231,412** | **1.04%** | `cited_judgment_id IS NOT NULL` |
| **total** | **22,322,047** | | |

### 1.1 `PLACEHOLDER_SENTINEL` is not an empty citation. It is a completed-work marker.

Read from the live writer, not inferred:
[citations-cli.ts:399-411](services/ingest/src/citations-cli.ts#L399-L411) writes one
empty row when a judgment's text yields **no** citation, *"so the resumable query
does not re-scan it on every run"*. It is a per-judgment **"walked, found
nothing"** marker.

It is one per judgment, and that is structural rather than lucky: the unique
index `judgment_citations_unique_edge (citing_judgment_id, normalised_citation)`
permits `''` at most once per citing judgment. Probed on 400,000 sentinel rows →
**400,000 distinct citing judgments**, no repeats.

**Consequence:** the 72% is not waste and not corruption. It is the extraction
frontier made durable. Deleting it would make every completed judgment look
un-walked and re-scan the entire corpus. **Do not delete it this round; and if a
later migration moves it, it must move to a column or a table that answers the
same question, not to nothing.**

### 1.2 `EXTRACTED_REFERENCE` — 6.0M references we have not resolved

The reference is real and printed; no target is pinned. What is in it, from a
21,726-row bernoulli sample of the population:

| form | share of extracted |
| --- | ---: |
| REPORTER (SCC · SCR · AIR · SCALE) | **76.48%** |
| NEUTRAL (`YYYY:COURT:NNNN`) | 21.85% |
| INSC | 0.55% |
| OTHER | 1.11% |
| **month-stamp pseudo-citation** | **0.009%** (95% CI 0–0.03) |

`char_offset = 0` on 1.73% of them. That is **not** a defect signal: a neutral
citation printed on line 1 legitimately sits at offset 0. The sentinel's own
`char_offset = 0` is excluded by `normalised_citation <> ''` before this matters.

### 1.3 `RESOLVED_REFERENCE` — 231,412 pins, and 11.56% of them name a pair twice

| | |
| --- | ---: |
| distinct (citing, cited) pairs | 204,651 |
| pairs carried by more than one row | **25,877** (12.6%) |
| rows involved in those pairs | 52,638 |
| **redundant rows** (rows − pairs) | **26,761 = 11.56% of all resolved rows** |
| worst pair | 4 rows |

That is `LEGITIMATE_PARALLEL_REPORTER`: **one judgment naming one authority
through two citation forms** — `(1976) 1 SCR 906` and `1976 (1) SCR 906`, or a
neutral citation and its SCC parallel. Both rows are correct. Neither may be
deleted. **But a count of rows is not a count of citations.**

**This is live in the product today.**
[treatment.ts:207-224](services/api/src/judgments/treatment.ts#L207-L224) builds its
`linked` CTE with `UNION ALL` and computes `degree` as
`count(*) FROM judgment_citations WHERE cited_judgment_id = l.other` — rows, not
distinct citers. So a judgment cited through two forms **appears twice in the
treatment graph** and every degree is inflated. Measured inflation across the
resolved population: **11.56%**. LCC's file, LCC's fix; the one-line shape is
`SELECT DISTINCT ON (from_id, to_id)` in `linked` and
`count(DISTINCT x.citing_judgment_id)` in `degree`.

### 1.4 `DUPLICATE_REFERENCE` — count zero, and structurally so

`judgment_citations_unique_edge (citing_judgment_id, normalised_citation)` makes
an exact duplicate unrepresentable, and `extractCitations()` de-duplicates on
first appearance inside one judgment before the insert. **The state exists in the
vocabulary so that a future writer cannot quietly create it**, not because rows
were found.

### 1.5 `NOT_A_CITATION` — two populations, and only one is in this table

1. **Month-stamp pseudo-citations in the edge table:** 0.009% of extracted rows
   (2 of 21,726). Effectively absent.
2. **Month-stamp identity rows on `judgments.neutral_citation`: 441 judgments**,
   all Madras High Court, 2011 — `2011:DEC:07`, `2011:AUGUST:25`, up to **9
   judgments sharing one stamp**. These are registry despatch stamps
   (`DM::2011:AUGUST:23::` on the paper), never citations.
   **They carry no row in `judgment_citation_keys`** — probed on 200 of them, zero
   key rows — so a resolver that reads only the key table never sees them, and a
   resolver that reads `judgments.neutral_citation` (the second of three identity
   arms) resolves a despatch stamp to nine judgments. 30 of them are in the truth
   set as `PSEUDO_MONTH_STAMP_KEY`.

---

## 2 · The predicate LCC asked for

### 2.1 MAY enter the resolver

```sql
-- resolver-eligible reference rows
SELECT c.*
  FROM judgment_citations c
 WHERE c.normalised_citation <> ''                      -- not a sentinel
   AND c.citation_text !~ '^[0-9]{4}\s*:\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)'
                                                        -- not a registry despatch stamp
```

Eligible population: **6,231,847** rows (6,000,435 unresolved + 231,412 already
pinned, minus ~560 month stamps at the sampled rate).

### 2.2 MUST NEVER enter the resolver

```sql
c.normalised_citation = ''            -- 16,090,200 sentinels: completed-work markers
OR c.citation_text ~ '^[0-9]{4}\s*:\s*(JAN|FEB|...)'   -- registry despatch stamps
```

And on the identity side, **not a row of this table at all but the same trap**:

```sql
-- judgments.neutral_citation values that must never be an identity key
neutral_citation ~ '^[0-9]{4}:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)'   -- 441 rows
```

### 2.3 Eligible ≠ resolvable, and eligible ≠ safe to pin

Three separate refusals sit **after** eligibility, and the truth set holds a
worked example of each:

| refusal | why |
| --- | --- |
| `TARGET_NOT_HELD` | the reference is real, we hold nothing it names. **AIR: 15 of 16** sampled records. |
| `LEGITIMATE_MULTI_TARGET` | several held judgments legitimately carry it. **Allahabad LKO/AUR: 20 of 24.** |
| `UNKNOWN` | one candidate, no corroboration — a pin here is a coin toss with a citation on it. |

---

## 3 · What this does NOT license

- It does not license deleting placeholders. §1.1.
- It does not license collapsing parallel reporter rows. §1.3 — the fix is to
  **count** them correctly, not to remove them.
- **It does not license reading a resolved edge as a treatment.** Resolution
  establishes *identity*, never *what the later court did with the authority*.
  See `RESOLUTION_IS_NOT_TREATMENT_2026-08-23.md`; that separation is a founder
  instruction, and `relationship` on this table is written from an explicit verb
  found in the citing text by `detectTreatment()`, never from the fact that a
  target was found.

---

## 4 · Reproduce

```
node --env-file=.env services/ingest/.n2b-p1-semantics.mjs
```
Artifact: `docs/ai/new2/citation-table-semantics.json`.
