# DATA_MOAT_LEDGER_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Machine-readable twin:** `docs/ai/new2-r7/DATA_MOAT_LEDGER_V1.json`
**Raw per-pass evidence + the exact SQL of every number:** `docs/ai/new2-r7/data-moat-census/*.json`

Every figure below is `OBSERVED_BY_LIVE_DB`, counted on local `lawmind`
(PostgreSQL 18.6) on 25 Aug 2026, unless the row says `SAMPLED` or `UNKNOWN`.

---

## 0. Read this before you quote a number from anywhere else

**Every planner statistic on this database reads ~0.** `pg_stat_user_tables`
reports `judgments.n_live_tup = 3`. The real count is **18,698,984**. It reports
`judgment_citations = 0`; the real count is **22,322,063**. Statistics have not
been re-gathered since the crash, so anything sourced from `reltuples`,
`n_live_tup` or a planner row estimate is wrong *by construction* right now — not
merely stale. Every count in this ledger is an exact `count(*)` or an explicitly
labelled `TABLESAMPLE`.

**Raw row count is not a count of legal authorities**, and this ledger never
treats it as one. §2 gives the dedup-adjusted denominators.

---

## 1. The moat in one table

| what | documents | of corpus |
| --- | ---: | ---: |
| raw documents | **18,698,984** | 100% |
| — from AWS Open Data, High Courts | 18,660,626 | 99.79% |
| — from AWS Open Data, Supreme Court | 38,342 | 0.21% |
| — from any other source | **0** | 0% |
| — synthetic test fixtures leaked into the corpus | 16 | — |
| source document (PDF) retained | **0** | **0%** |
| has a real neutral citation | 1,370,251 | 7.33% |
| has a reporter citation | 38,345 | 0.21% |
| has a case number | 18,698,965 | 99.9999% |
| has a CNR | 18,698,968 | 99.9999% |
| has a case type | 4,573,943 | 24.46% |
| has bench / coram | **38,326** | **0.20%** |
| has a judgment date | 18,698,984 | 100% |
| has a content hash | 18,698,968 | 99.9999% |
| has a disposal nature | 17,523,517 | 93.71% |
| has an HC document class | 4,865,352 | 26.02% |
| carries an overruled badge | 104 | 0.0006% |
| has paragraphs segmented | 18,675,491 | 99.87% |
| has a staged document vector | 2,026,872 | 10.84% |
| has retrieval chunks | 40,161 | 0.21% |
| has ≥1 statute reference | 426,473 | 2.28% |

| citation graph | rows | of 22.3M | of real references |
| --- | ---: | ---: | ---: |
| rows in `judgment_citations` | **22,322,063** | 100% | — |
| — **empty sentinels: "processed, found nothing"** | **16,090,216** | **72.08%** | — |
| — **actual extracted citation strings** | **6,231,847** | 27.92% | 100% |
| — — resolved to a judgment we hold | **231,412** | 1.04% | **3.71%** |
| — — despatch stamps wrongly extracted as citations | 827 | — | 0.01% |
| — — — **of those, resolved to a specific judgment (false pins)** | **61** | — | — |
| treatment edges (relationship ≠ `cites`) | **15,982** | 0.07% | 0.26% |
| — carrying a provenance class | 11,579 | — | — |
| judgments carrying a citation key | 1,369,958 neutral + 38,345 reporter | | |
| paragraph rows | 91,231,179 | | |

**`CORRECTION_OF` this document's own first draft, same day.** The first version
of this table reported "extracted references 22,322,063 · resolved 231,412
(1.04%)" without distinguishing the sentinel rows.

- **old claim:** the corpus holds 22.3M extracted references resolving at 1.04%.
- **new fact:** 16,090,216 of those rows — exactly one per citing judgment, every
  one with `char_offset = 0`, `evidence IS NULL`, `citation_text = ''` and
  `cited_judgment_id IS NULL` — are **sentinels recording that a document was
  processed and yielded no citation.** They are not references. The corpus holds
  **6,231,847** extracted citation strings, resolving at **3.71%**.
- **evidence:** `count(*) = count(DISTINCT citing_judgment_id) = 16,090,216`, and
  all three field conditions hold on all 16,090,216 rows.
- **affected downstream:** any claim of the form "22 million citations" is wrong
  by a factor of 3.6 even before the resolution question. The resolution rate is
  3.6× better than first stated and still means **96.3% of real extracted
  references point at something we do not hold**.

---

## 2. Dedup-adjusted denominators — and why the honest answer is a range

R7 §10 requires "decision-identity-adjusted authorities" and forbids equating raw
rows with unique authorities. The adjustment cannot be a single number, and
saying so is the finding.

**Exact-content-hash groups, counted:** 500,539 groups covering **1,701,630
documents**, of which **1,201,091 are beyond the first member of their group**.
The largest single group holds **7,160 byte-identical documents**.

Subtracting all 1,201,091 would be wrong in three different directions at once,
which is why `DECISION_IDENTITY_CONTRACT_V1` classifies them rather than
subtracting them:

- a **common order** disposing of forty connected matters is one decision text
  and forty matter identities. Both are true, and merging destroys the second;
- a group of 7,160 byte-identical documents is not one authority — it is almost
  certainly **extractor contamination**, and collapsing it would *manufacture* an
  authority out of a failure mode;
- the one confirmed **same-decision-different-source** pair in this corpus
  (*Chipade*, found by NEW3 and LCC) does **not** share a content hash, because
  the two OCRs differ. So the hash simultaneously over-counts and under-counts,
  and neither error is visible from the hash alone.

**The classification has since been done** (`DECISION_IDENTITY_CONTRACT_V1`), and
it shows the naive subtraction would have been wrong by an order of magnitude in
its main term: **73.5% of the documents a content-hash dedup would delete are
common orders**, which are one text and many matter identities, and must never be
deleted.

| class | documents beyond the first in their group |
| --- | ---: |
| `EXACT_DOCUMENT_DUPLICATE` (one court, one case number, one date) | 91,788 |
| `COMMON_ORDER_CONNECTED_MATTERS` | 895,897 |
| `EXTRACTOR_CONTAMINATION` suspect (≥100 byte-identical) | 130,511 |
| `SAME_DECISION_DIFFERENT_SOURCE` candidates, by CNR — **invisible to the hash** | 63,625 |
| `UNKNOWN` (two hash classes) | 82,895 |

**Two denominators, because there are two questions:**

```
distinct MATTER IDENTITIES     ≈ 18,413,060     (raw − true duplicates − contamination − same-decision-different-source)
distinct LEGAL AUTHORITIES     ≈ 17,517,163     (the above, further less common-order members)
```

**Both are approximate in a stated direction.** The three subtracted classes are
measured on three different keys — content hash, CNR, neutral citation — and
**their overlap is `NOT_MEASURED`**, so a document counted in two classes is
subtracted twice and the true figures are somewhat higher.

**The number to use externally is neither.** Until the overlap is measured the
honest public statement is the raw count with its provenance — "18.7 million
judgment documents from AWS Open Data" — never "18.7 million judgments" and never
"18.7 million cases".

---

## 3. The seven findings that change what should be built next

### 3.1 We hold zero source documents. `storage_key IS NOT NULL` is true for 0 of 18,698,984.

The entire corpus is derived text with no retained original. Consequences, in
order of severity:

- **"Show me the PDF" is impossible for every judgment we hold.** Not slow —
  impossible.
- A re-extraction to repair the 469,599 `PROVEN_DAMAGED` documents has nothing
  local to re-extract *from*; it must re-fetch from AWS.
- Tier 3 citation confirmation and any future evidence-of-provenance claim rest
  on a `source_url` we have not re-verified, not on a document we hold.

`R2_SOURCE_RETENTION_MATRIX.md` exists and describes retention. The corpus does
not implement it. Recorded here as a fact, not as a plan — the retention decision
has a cost and belongs to LCC/founder, not to this lane.

### 3.2 Bench / coram exists for 38,326 documents, and all of them are the Supreme Court.

38,342 Supreme Court judgments are held; 38,326 carry a bench. **Every one of the
18,660,626 High Court documents has none.** Any bindingness or authority-hierarchy
classifier that needs bench size therefore has evidence for 0.2% of the corpus
and no evidence at all for the other 99.8%. This is the whole answer to the
`AUTHORITY_HIERARCHY_INPUT_LEDGER_V1` question and it is a negative one.

### 3.3 "22 million citations" is wrong twice over — 72% are sentinels, and 96.3% of the rest point at nothing we hold.

72.08% of `judgment_citations` — **16,090,216 rows** — are not references at all.
They are one sentinel per citing judgment, recording *"this document was
processed and no citation was found"*: `citation_text = ''`, `char_offset = 0`,
`evidence IS NULL`, `cited_judgment_id IS NULL`, and `count(*)` exactly equals
`count(DISTINCT citing_judgment_id)`.

The real extracted-reference population is **6,231,847**, of which **231,412
(3.71%)** point at a judgment we hold.

Court-shaped, and the Supreme Court is the sole exception: 99,756 of its 227,480
resolve (43.9%), against 32,844 of Allahabad's 2,708,919 (1.2%) and 4,293 of
Bombay's 2,160,649 (0.2%).

**"22 million citations" is not a conservative version of the truth — it is a
different number about a different thing.** R7 §10's instruction not to market
22M reference rows as a resolved graph is stronger than it first appears: the 22M
is not even a count of reference rows.

### 3.3b Sixty-one live false pins: a registry despatch stamp resolved to a real judgment.

`judgment_citations` holds **827 rows whose `citation_text` is a registry
despatch stamp** rather than a citation — `2011:FEBRUARY:11`, `2011:SEP:28`,
`2011:JULY:19`. **61 of them carry a `cited_judgment_id`**, i.e. they resolve to
one specific judgment. 35 distinct stamps, 35 distinct targets, 61 citing
documents affected.

```
citation_text   2011:FEBRUARY:11
resolves to     J.JANET ELGEEVA, Vs THE TAHSILDAR,   Madras High Court
because         that judgment's neutral_citation field also holds "2011:FEBRUARY:11"
```

Nothing cites "2011:FEBRUARY:11". It is a despatch timestamp that landed in
`judgments.neutral_citation` for 431 Madras judgments, and the extractor read it
out of a citing document's text as though it were a citation.

**This is a false pin, which `docs/CITATION_HARNESS.md` forbids outright.** LCC
purged the same class from `judgment_citation_keys` on 24 Aug (441 key rows,
bus 1116) and added a gate at the resolver. `judgment_citations.cited_judgment_id`
is a *different store* and was not covered by either. Reported to LCC; the
correction is a bounded, reversible `cited_judgment_id → NULL` on 61 rows that
leaves `citation_text` untouched, and is proposed rather than applied unilaterally
because the serving path is LCC's.

### 3.4 Neutral-citation identity is court-shaped to the point of absence.

| court | documents | real neutral citations |
| --- | ---: | ---: |
| Allahabad High Court | 2,276,082 | 558,920 (24.6%) |
| High Court of Karnataka | 955,450 | 222,912 (23.3%) |
| High Court Of Rajasthan | 1,095,169 | 196,216 (17.9%) |
| High Court Of Chhattisgarh | 568,798 | 106,868 (18.8%) |
| Bombay High Court | 1,983,885 | 57,424 (2.9%) |
| High Court of Punjab and Haryana | 1,848,332 | 56,105 (3.0%) |
| High Court of Kerala | 1,036,112 | 7,086 (0.7%) |
| High Court of Delhi | 382,129 | 2,490 (0.7%) |
| **Madras High Court** | 1,696,697 | **258 (0.02%)** |
| **Patna High Court** | 1,706,788 | **1** |
| **High Court for State of Telangana** | 1,042,408 | **3** |
| **Orissa High Court** | 794,461 | **3** |
| **High Court of Andhra Pradesh** | 306,162 | **3** |
| **High Court of Madhya Pradesh** | 650,704 | **0** |
| **High Court of Gujarat** | 422,014 | **0** |

Six High Courts holding **4,922,537 documents between them** have essentially no
citation identity. An advocate in Chennai, Patna, Hyderabad, Cuttack, Jabalpur or
Ahmedabad cannot look their own High Court's judgment up by citation, because we
hold no citation for it.

By decade the same fact reads differently and matters for currentness:

| decade | documents | real neutral citation |
| --- | ---: | ---: |
| 1950s | 1,281 | 76.74% |
| 1960s | 3,223 | 98.26% |
| 1970s | 2,990 | 97.93% |
| 1980s | 2,875 | 93.91% |
| 1990s | 31,900 | 20.28% |
| 2000s | 1,092,431 | 0.84% |
| 2010s | 7,679,370 | **0.10%** |
| 2020s | 9,884,914 | 13.52% |

The 1950s–1980s rows are almost entirely Supreme Court. The 2010s — 7.68 million
documents, 41% of the corpus — are 0.10% citable.

### 3.5 `VERIFIED_SEMANTIC_CORE` is empty, and one unpopulated column is the reason.

`SAMPLED`, `TABLESAMPLE SYSTEM (0.25) REPEATABLE (20260825)`, n = 46,559:

| semantic tier | share |
| --- | ---: |
| `NOT_ELIGIBLE` | 48.75% |
| `BROAD_SEARCHABLE` | 44.93% |
| `BAIL_ORDER_REACHABLE` | 5.32% |
| `UNRESOLVED_EXPERIMENTAL` | 0.95% |
| `CITED_AUTHORITY_REACHABLE` | 0.05% |
| **`VERIFIED_SEMANTIC_CORE`** | **0.00%** |

| text safety | share |
| --- | ---: |
| `UNKNOWN` | 89.90% |
| `UNSAFE_VERIFIED` | 10.10% |
| `SCREENED_OK` | 0.00% |

`VERIFIED_SEMANTIC_CORE` requires `script_quality IN ('clean','mixed_script_ok')`.
`script_quality` is **NULL for 89.90% of the corpus**, and a NULL is neither
value, so the tier can never fire. The tier is not measuring quality; it is
measuring whether a backfill has run. **NEW1 — this is upstream of your
eligibility frame and it is not a threshold you can tune around.**

### 3.6 Body-text evidence: 90.4% is `SCREENED_NO_DAMAGE_FOUND`, which is not "clean".

| state | documents | share |
| --- | ---: | ---: |
| `SCREENED_NO_DAMAGE_FOUND` | 16,906,647 | 90.42% |
| `SCREENED_DAMAGED` | 1,322,722 | 7.07% |
| `PROVEN_DAMAGED` | 469,599 | 2.51% |
| `NEVER_SCREENED` | 16 | 0.0001% |

The 16 `NEVER_SCREENED` are the leaked synthetic fixtures (§3.7) — every real
document has been through a corpus-covering screen. `scripts/check-screened-not-clean.mjs`
enforces the wording across 1,007 shipping files and is **still not wired into
`ci-local.mjs`**, which is LCC's file. That remains open.

Damage is court-shaped too: Punjab & Haryana 280,761 · Bombay 55,981 ·
Karnataka 123,411, against Madras 0, Calcutta 0, Jharkhand 0.

**`text_extraction_method = 'ocr'` is true for 0 documents.** No OCR has ever
run over this corpus. The 469,599 proven-damaged documents have never been
through the one process known to recover them (20/20 recovered in NEW2's earlier
OCR probe, against 0/20 for re-extraction).

### 3.7 Synthetic fixtures are in the production corpus, and the count is growing.

`court = 'Test Court'`, 16 documents, titles beginning `SYNTHETIC —`, most recent
created 23 Aug 2026 09:14Z. NEW3 tracked this class from 6 to 16. They are the
only `NEVER_SCREENED` rows, they carry citations of the form `FIX 2023 INSC 3`,
and three of them are the only add-to-matter refusals an advocate could
encounter anywhere in the corpus. Ownership is LCC's fixture path, not this
lane's data path; recorded here because the ledger must count what is in the
table, not what is supposed to be.

---

## 4. Text volume — `SAMPLED`

`TABLESAMPLE SYSTEM (0.25) REPEATABLE (20260825)`, n = 46,559. This is a **cluster
sample**: `TABLESAMPLE SYSTEM` selects whole pages, rows on a page are
correlated, and pages fill in ingest order which is court-and-year ordered. Treat
as indicative, never as an exact count.

| band | share of sample |
| --- | ---: |
| `full_text IS NULL` | 0.00% |
| under 1,000 chars | 18.04% |
| 1,000–1,999 | 25.01% |
| 2,000–7,999 | 46.69% |
| 8,000 or more | 10.27% |

It was sampled rather than counted for a reason worth recording: `judgments` is
22 GB of heap and **129 GB of TOAST**, so a single corpus-wide `length(full_text)`
detoasts 129 GB. The first attempt at that metric ran 7.5 minutes with four
parallel workers and produced nothing before being killed. **Anything that reads
`judgment_embedding_eligibility` corpus-wide pays this cost**, because that view
computes `length(j.full_text)` for its value band.

---

## 5. What this ledger does NOT know

Recorded as `UNKNOWN`, never as zero, and never smoothed:

| question | state | why |
| --- | --- | --- |
| how many unique legal authorities | `UNKNOWN`, bounded 17,497,893–18,698,984 | needs the §7.5 classification |
| are the 100% populated `judgment_date` values *reliable* | `NOT_MEASURED` | `judgment_date_quality` holds 713,136 rows against 18.7M; the other 96% has no quality verdict |
| citation extraction precision | `NOT_MEASURED` | never measured at scale; §6 of `CITATION_RESOLUTION_SCALE_DECISION_V1` |
| whether the 493 ingest batches inside the 17 Aug exposure window were walked | `UNKNOWN` | they carry no citation, so walked and skipped are observationally identical. See `CITATION_BATCH_GAP_RCA.md` |
| passage-level legal role | `NOT_MEASURED` at time of writing | `PASSAGE_SAFETY_ROLE_CONTRACT_V1` |
| whether `SCREENED_NO_DAMAGE_FOUND` documents are actually undamaged | `UNKNOWN` by definition | the screen found no damage; that is not the same claim |
| IPC / CrPC / Indian Evidence Act text | **NOT HELD** | `STATUTE_INTELLIGENCE_LEDGER_V1` |

---

## 6. Provenance and authorisation

Every one of the 18,698,984 documents came from AWS Open Data — 18,660,626 from
`indian-high-court-judgments.s3.ap-south-1.amazonaws.com` and 38,342 from
`indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com`. 16 rows have no
`source_url` and all 16 are the synthetic fixtures.

**No document in this corpus came from BharatLaw, Supreme AI or eCourts.** All
three are authorised (CLAUDE.md §6a, valid to 13 Nov 2029) and none has
contributed a row. That is the single largest lever in
`AUTHORIZED_SOURCE_DELTA_PLAN_V1`: the gaps in §3.4 and §3.2 are exactly the
fields those sources carry and AWS Open Data does not.
