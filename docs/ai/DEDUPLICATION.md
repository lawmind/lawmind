# DEDUPLICATION — EXACT materialised, NEAR quantified and deferred

**11 August 2026, LCC, Stage 3 of the DATA → RETRIEVAL EXECUTION PROGRAM.**
Builds on `docs/ai/CANONICAL_IDENTITY.md` (Stage 2, the identity model) and
closes `docs/ai/tasks/003-corpus-inventory.md`'s deferred question: *"resolving
[the exact-duplicate groups] changes what `judgments` rows exist and needs its
own task."* It does not change what `judgments` rows exist — nothing here
merges or deletes a row.

**Per the program's own instruction: do NOT immediately perform an expensive
full-corpus row-level deduplication.** This document does the cheap, exact
work first, then spends a small, bounded query budget to find out whether the
expensive near-duplicate work is even justified, before deciding whether to
build it.

---

## 1 · EXACT DUPLICATES — MATERIALISED

**Migration `0036`** — `document_duplicate_groups` / `document_duplicate_members`,
full schema and rationale in `docs/SCHEMA_TRUTH.md` §document_duplicate_groups.
Applied to production, verified against `information_schema`/`pg_type` directly
(both tables and both enum types exist).

**Materialised by `services/ingest/src/dedup-materialize-cli.ts`
(`pnpm --filter @lawmind/ingest run dedup:materialize --confirm`)**, which reads
only the already-100%-populated `judgments.content_hash` — no PDF fetch, no
full-text re-scan, no new computation. Measured against production:

| | |
| --- | --- |
| exact-duplicate groups (`content_hash`, count > 1) | **563** |
| rows involved | **1,500** (1.9% of the 79,321-row corpus) |
| largest group | **124 rows** — the Gujarat 1993 batch judgment, task 003 |

**This number corroborates the corpus-quality dashboard exactly**
(`docs/ai/DATA_MOAT_PROGRAM.md` §6: *"duplicate groups: 563 (1,500 rows,
1.9%)"*) — two independently written queries (the dashboard's ad-hoc `GROUP BY`
and this CLI's materialisation query) agree to the row, a real cross-check
rather than a restated assumption. **Task 003's original figure of 937 groups
is superseded** — that count predated the CNR backfill session; 563 is the
number against the corpus as it stands today, and is the one this document
carries forward.

Written as one row per group in `document_duplicate_groups`
(`relationship = 'exact_duplicate'`, `method = 'content_hash'`) and one
membership row per judgment in `document_duplicate_members` — **1,500
membership rows for 563 groups**, verified by a `count(*)` against both tables
after the write.

## 2 · NEAR-DUPLICATE — WHY THIS SESSION DID NOT BUILD MINHASH/LSH YET

**The instruction is explicit**: MinHash/LSH "where justified", conservative
thresholds, document-level evidence — not "build it because the stage says
so." Before spending the engineering cost of a shingling/permutation/banding
pipeline, this session ran three **cheap, exact SQL probes** against the
already-populated corpus to find out whether a real near-duplicate problem
exists, and what shape it takes. All three are single queries against
indexed/aggregated columns — no full-text scan, no new computation, fully
reproducible.

### Probe 1 — same CNR, different `content_hash`

**Reads as**: *"the same legal case, but the text we hold for it differs — is
that a genuine second document, or noise?"*

**Result: 3 CNRs, 6 rows total** (of 79,321). Read directly, not inferred from
the count (`docs/ai/tasks/003-corpus-inventory.md`'s own standing rule —
verify by reading the text):

| CNR | rows | what they actually are |
| --- | --- | --- |
| `BRHC010440502024` | 2 | Same Patna HC case (CWJC/7910/2024). **Different orders, different dates**: one uploaded 25.07.2024 by bench (Bajanthri/Chakravarthy J), the other uploaded 28.04.2026 by a **different bench** (Shah/Kumar J), text length 12,448 vs 48,450 chars |
| `BRHC010604622023` | 2 | Same case (CWJC/9583/2023). First order 17.05.2024 ("disposed of"), second **28.01.2026, "C.W.J.C. No. 9583 of 2023 stands allowed"** — a later substantive order on the same matter |
| `BRHC011216462025` | 2 | Same case (CR.MISC./83271/2025). One order "dismissed for want of prosecution", the other an **anticipatory bail order with conditions** — clearly a different hearing |

**Verdict: DIFFERENT DOCUMENT in all 6 rows, not a duplicate of any kind.**
Every pair is genuinely two separate orders issued on two separate dates by
two separate benches under one ongoing case — exactly the "one CASE, many
DOCUMENTs" relationship `CANONICAL_IDENTITY.md` §1 names as a real corpus
shape, now confirmed with a second, independent example at the CNR level (the
first was the content-sharing Gujarat/Patna batch judgments; this is the
inverse — same case, genuinely different text). **This probe found zero
evidence of accidental duplication and is itself the useful result**: sharing
a CNR is not a near-duplicate signal and must not be treated as one.

### Probe 2 — same `(court, case_number, judgment_date)`, different `content_hash`

**Reads as**: *"three independent identity fields agree, but the text
differs — is `case_number` alone reliable?"*

**Result: 23 groups.** Sampled the 8 largest, read the actual rows (`cnr`,
`content_hash`, `source_url`, text length) rather than trusting the count:

Every sampled group is **Supreme Court**, and every member has a **distinct
CNR and a distinct source PDF**. The clearest example: three completely
different judgments — `2018_1_661_664_EN.pdf`, `2018_1_665_670_EN.pdf`,
`2018_1_671_673_EN.pdf`, three **consecutive page ranges in the same SCR
volume issue** — all print `CIVIL APPEAL No. 12164/2016` as their case number,
because Indian Supreme Court practice commonly disposes of several **connected
or tagged appeals together under one lead appeal number**, each still getting
its own separate judgment text and its own CNR.

**Verdict: DIFFERENT DOCUMENT in every sampled case, not a near-duplicate.**
This is a genuinely new finding, not previously recorded: **`case_number`
alone is not a reliable case-identity key at the Supreme Court** — three
distinct cases can legitimately share one printed appeal number. This is
**exactly why `CANONICAL_IDENTITY.md` §2 ranks CNR above `case_number`**
(CNR is 100% populated and did not collide in this probe; `case_number` did) —
the design decision is now backed by a real, previously-unmeasured example,
not only a theoretical ordering.

### What these two probes establish for the classification taxonomy

| relationship | how detected this session | count |
| --- | --- | --- |
| `exact_duplicate` | `content_hash` match | 563 groups / 1,500 rows — materialised, §1 |
| `near_duplicate` | not found by either probe | **0 confirmed candidates** |
| `different_document` (superficial collision, not a duplicate) | shared CNR or shared (court, case_number, date), distinct `content_hash` | 3 CNR groups + 23 case-number groups, all read and confirmed different |
| `unknown` | cross-partition HC collision, not swept | see §3 |

**Neither probe is exhaustive.** They test two specific, cheap hypotheses
(same-CNR text drift, same-case-number-and-date text drift) — they do not
search for near-duplicates that share neither identifier, e.g. one High Court
quoting a Supreme Court judgment at length, or a corrected re-issue of an
order under a changed case number. **Zero evidence found is not proof of
absence**; it is the honest result of the two cheapest, most likely-to-hit
probes available, stated as such rather than generalised into "no near-dup
problem exists."

## 3 · WHAT A REAL MinHash/LSH PASS WOULD COST, IF BUILT

**Not built this session — quantified, not pretended solved**, per the
program's own instruction.

- **Scope: the 79,321-row ingested corpus, not the 20.5M-row HC source
  bucket.** `docs/ai/HC_CORPUS_CHARACTERIZATION.md` §8–9 already deferred the
  full 1,493-file cross-partition sweep on cost grounds (sampled duplication
  rate too low to justify it) — that finding stands and is not re-litigated
  here. A MinHash pass over the *ingested* corpus is a much smaller ask: full
  text for 79,321 rows, not 20.5M.
- **Read cost**: `full_text` for all 79,321 rows. `docs/ai/HC_EXTRACTION_COST.md`
  measured mean text length at 5,823 characters for High Court judgments;
  Supreme Court judgments run longer (`docs/CORPUS_TIERING.md`). A full-corpus
  `SELECT full_text` is on the order of the ~1.5 GB `judgments` text volume
  already recorded in `docs/CURRENT_PLAN.md` Q1.3 — a few minutes over the
  Railway proxy at the rates observed in this session (§1's materialisation of
  1,500 rows took several minutes over the same proxy), not an overnight job.
- **Compute cost**: shingling (k-gram, k≈5 words) + MinHash signature (~128
  permutations) per document is O(document length) and cheap per document —
  the same order of magnitude as `contentHash`'s sha256 pass, already measured
  at negligible cost across the corpus. LSH banding to produce candidate pairs
  is sub-quadratic in corpus size (the entire point of LSH), so 79,321
  documents is not the regime where it becomes impractical.
- **What is NOT cheap, and is the real reason this is deferred rather than
  built now**: choosing and validating a similarity threshold needs
  document-level evidence — reading enough true/false candidate pairs to know
  whether, say, Jaccard 0.85 catches real near-duplicates without also
  catching two judgments that both quote the same 40 lines of a Supreme Court
  precedent (a false positive with real product-safety cost — merging two
  distinct authorities is exactly the failure `CANONICAL_IDENTITY.md` §3
  forbids). That validation work does not shrink with corpus size and was not
  done this session because §2's two probes found **no confirmed near-duplicate
  candidate to calibrate against** — there is nothing yet to tune a threshold
  on.

**Recommended trigger for building it**: either (a) the HC ingest resumes at
meaningfully larger scale (`docs/CURRENT_PLAN.md` Q2, founder-gated) and the
exact-duplicate rate at that scale suggests near-duplicates are also more
common, or (b) a future probe of the shape in §2 — cheap, targeted, reading
real text — turns up a confirmed near-duplicate case to calibrate a threshold
against. Building the full pipeline speculatively, with no calibration data,
risks exactly the "over-engineering that produced nothing usable" the founder
already corrected this program away from once (`docs/CURRENT_PLAN.md` §A0).

## 4 · CROSS-PARTITION HC COLLISION — restated, not re-measured

**`UNKNOWN`, unchanged from `docs/ai/HC_CORPUS_CHARACTERIZATION.md` §8–9.**
Whether the same case appears under different CNRs across the AWS bucket's
1,493 partition files was sampled (26 files, ~504,000 rows: plain variant
99.9% within-file distinct, mobile variant 72.3% average, wide range) but
never checked *across* files — holding distinct values across the full sweep
is the expensive operation both that document and this one decline to run
without stronger justification than a low sampled rate provides. Not
re-measured here; this section exists so a future pass does not re-derive the
same deferral from zero.

## 5 · PROVENANCE — what was preserved, checked directly

Per the program's explicit instruction ("do not destroy provenance when
deduplicating"), verified rather than assumed:

- Every `judgments` row touched by §1's materialisation is **unchanged** — no
  `UPDATE`, no `DELETE` executed against `judgments` by
  `dedup-materialize-cli.ts` (the script contains no such statement; read
  directly before running it against production).
- `source_url`, `source timestamp` (`created_at`), `cnr`, `case_number` remain
  on each member row exactly as ingested.
- The duplicate relationship itself is now a **first-class, queryable fact**
  (`document_duplicate_groups`/`document_duplicate_members`) rather than an
  implicit consequence of a `GROUP BY` someone has to remember to run.

## 6 · WHAT THIS DOCUMENT DOES NOT DO

- Does not merge, delete, or canonicalise any `judgments` row — every one of
  the 563 exact-duplicate groups still renders as up to 124 separate search
  results, exactly as before. Whether the product should visually collapse an
  exact-duplicate group is a retrieval/UX decision, not made here.
- Does not build MinHash/LSH — quantified and deferred, §3, with a named
  trigger for building it.
- Does not perform the full 1,493-file HC cross-partition sweep — restated
  deferral, §4.
- Does not touch `apps/**` or any RCC-owned surface.
