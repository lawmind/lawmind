# NEW1 R9 — corpus into search: what ran, what it measured, what is still queued

**27 August 2026.** Lane NEW1 (retrieval, ranking, evidence). This file is the
index; the evidence is in the three documents beside it.

| document | what it settles |
| --- | --- |
| `COARSE_RESTART_R9.md` | why the walk stopped, the second defect nobody had found, and the restart's numbers |
| `SEARCH_STACK_COVERAGE_R9.md` | what each search layer actually reaches, and the non-judgment path |
| `PASSAGE_TRANCHE_2_DESIGN.md` | the storage budget, and what fits inside it |
| `coarse-walk-telemetry.jsonl` | the 15-minute ledger, appended live |

---

## The six numbers

```
exact + lexical searchable          18,749,962 / 18,749,962      100%
coarse vectors (stored)              2,026,872 → climbing        22.9% of eligible
coarse vectors (searchable)                  0                   no vector index yet
passage vectors                        418,116 over 81,720 documents
production dense actually searches       40,161 documents        0.214% of corpus
statute sections embedded               36,663 across 849 Acts   (running)
```

---

## What ran

**1 — Exact and lexical needed no job.** `judgments.full_text_tsv` is
`GENERATED ALWAYS`, GIN-indexed. Every one of NEW2's 50,994 new judgments was
full-text and identity searchable in the same statement that inserted it.
Verified field by field: 50,994/50,994 on text, tsv, content_hash, case_number,
cnr, judgment_date, court and case_title.

**2 — The coarse walk is running again**, at the true frontier, with a reporter
that can catch a stall the walk itself cannot see. The stale worklist had a
second defect: `COMPLETE_TOLERANCE=25` against a permanent ~1,200-row refusal
residue per batch meant 231 finished batches could never leave the worklist —
86 minutes of guaranteed zero output at the head of a nine-day run. Fixed by a
tolerance that sits inside a measured empty gap 2,955 rows wide.

**3 — NEW2's delta is being embedded without waiting for a census.**
`delta-manifest.mjs` collapses a handoff by `content_hash` twice — within the
delta and against what is already staged — and emits a batch the existing walk
consumes. 27,610 representatives standing for 30,306 judgments, cut under
definition `5b5d02384b46c96c`, `idsHash cfe144f0275af4ae`. This is R9 §8's
incremental queue, and it means no future delta blocks on a 2 h 17 m census.

**4 — Statute sections are being embedded** into a table that keeps source kinds
apart, behind one additive `CHECK` widening requested from LCC.

**5 — The staged coarse vectors were proven correct before nine more days were
spent producing them.** 20 rows via `TABLESAMPLE SYSTEM` across the whole table,
re-embedded and compared: cosine 1.000000 at min, median and max. The same check
on the 36,663 statute vectors: also 1.000000, 0 below 0.99.

**6 — And one claim of mine did not survive its own test.** I wrote that putting
the Act name inside the embedded text is what separates IPC s.302 from BNS s.103.
Measured against the counterfactual it separates them by **five hundredths**
(0.8725 → 0.8169, still "same provision" territory), does **nothing at all** for
BSA s.63 vs Evidence Act s.65B (0.8749 → 0.8751), and raises mean similarity
across every other pair because titles share tokens. **Which Act a provision
belongs to is a filter on the row, not a hope about the ranking** — `statute_id`
and `short_title` are columns, and a query that must not mix codes constrains on
them. Details and the full pair table in `SEARCH_STACK_COVERAGE_R9.md`.

---

## What is queued, and on what

| item | blocked on | why it matters |
| --- | --- | --- |
| `tier-census --reset` + `doc-vector-batches --reset` | **HEAVY_BOX** (NEW2 holds it; five parallel workers on the citation scan) — and **it is not on the critical path**, see below | the representative table is from 19 Aug under definition `e76879ab6bbcd452`; the deployed view is `5b5d02384b46c96c` |
| coarse HNSW index (~35 GB halfvec) | the walk finishing | 2M+ vectors are stored and **not searchable** until it exists |
| statute/order/eCourts vectors into `document_vector_staging` | **LCC** — one `CHECK` widening, bus 1397 | the table is empty, so it validates instantly |
| wiring `new1_tranche_passages` into `retrieve.ts` | **LCC** — it is their file, and it changes what an advocate sees | would take production dense from 40,161 to 111,874 documents, **2.79×**, with zero new GPU |
| passage tranche 2 (~568,000 documents, 60 GB) | the coarse walk, or a founder decision to interleave | items 1–4 of the selector alone — Supreme Court, cited authorities, the whole BNS/BNSS/BSA transition — are ~191,000 documents and ~1.1 days of GPU |
| `script_quality` screen over the 50,994 | **NEW2** — it is a corpus column | all 50,994 pass the readability gate by never having been looked at |

---

### The census is not urgent, and I was framing it as though it were

Correcting my own sequencing, because the arithmetic says something different
from the instinct. The full reconciliation buys two things: NEW2's 50,994, and
whatever eligibility changes have admitted since 19 August. **The first is
already delivered** — `delta-manifest.mjs` manifested and is embedding 27,610
representatives without touching the census at all. The second is unmeasured but
bounded by the corpus not having moved much under a definition that changed in
ways the walk's own contract guard says it does not read.

Against that, the current worklist holds **6,553,765 documents — about 8.8 days
of continuous GPU.** The census cannot make the walk finish sooner; it can only
make the worklist slightly longer. So fighting the citation-enrichment factory
for a 2 h 20 m sequential scan of a 151 GB table buys nothing this week and
costs another lane's throughput. It waits for a genuinely quiet window, and that
is a decision rather than a delay.

## The decision that is not mine and should be made

**D: has 793.3 GB free and the database does not use it.** C: has 269.5 GB free
and holds a 303 GB database. A tablespace on D: for the passage table and its
index would lift the passage budget from 60 GB to something that could hold the
Supreme Court plus every High Court judgment since 2020.

It changes the physical layout of the production database, its restore procedure
and its backup surface; D:'s random-read performance under an HNSW probe is
unmeasured. It is the single highest-leverage storage decision available and it
belongs to the founder and LCC.

---

## What this round deliberately did NOT do

No new benchmark architecture, no representation bakeoff, no role
classification, no reranker, no HyDE, no graph ranker, no vector-database
migration. The coarse representation stays HEAD:4800 and the passage
segmentation stays `chunk.ts/defaults@F_ALL_CHUNKS`. `search.semantic.broad`
stays `EXPERIMENTAL_INTERNAL` in LCC's capability registry — this is coverage
work so that the eventual evaluation runs against the real corpus rather than
40,161 judgments.

The four known semantic limits are carried as facts and not attacked: broad
semantic quality is not release-ready; supporting-authority failure is
ranking-at-useful-depth in the measured sample, not proven representation
absence; absolute-similarity abstention failed; the passage-role classifier is
not reliable enough to be a legal evidence gate.
