# NEW1 R9 — corpus into search: what ran, what it measured, what is still queued

**27 August 2026.** Lane NEW1 (retrieval, ranking, evidence). This file is the
index; the evidence is in the documents beside it.

| document | what it settles |
| --- | --- |
| `COARSE_RESTART_R9.md` | why the walk stopped, the second defect nobody had found, and the restart's numbers |
| `SEARCH_STACK_COVERAGE_R9.md` | what each search layer actually reaches, and the non-judgment path |
| `PASSAGE_TRANCHE_2_DESIGN.md` | the storage budget, and what fits inside it |
| `DELTA_RECONCILIATION.md` | 339 judgments that were in nobody's list, and why |
| `coarse-walk-telemetry.jsonl` | the 15-minute ledger, appended live |
| `delta/queue-ledger.jsonl` | the continuous incremental queue's own record |
| `text-unsafe-quarantine.json` | 7 vectors over proven-damaged text, moved, with the reversal |
| `source-vector-promotion-statute_section.json` | 36,663 statute vectors into the shared table |

---

## The numbers

```
exact + lexically searchable      18,749,962 / 18,749,962      100%
coarse vectors                     2,094,899  and climbing     23.7% of eligible
coarse vectors SEARCHABLE                  0                   no vector index yet
passage vectors                      418,116  over 81,720 documents
statute-section vectors               36,663  across 849 Acts, promoted
production dense actually reaches     40,161  documents        0.214% of corpus
real remaining coarse work         6,488,553  documents ≈ 9.3 days at 29k/h
```

**40,161 is the number to lead with.** `retrieve.ts` queries `judgment_chunks`
and nothing else — not the 8.85M eligible, not the 2.09M coarse vectors we hold,
not the 81,720 in the passage tranche. Everything else here is downstream of it.

---

## What ran

**1 — Exact and lexical needed no job, and there is no backlog.**
`judgments.full_text_tsv` is `GENERATED ALWAYS`, GIN-indexed, so every row NEW2
inserts is searchable in the same statement that writes it. All 50,994 of the
delta verified field by field. Proved end to end on a Delhi judgment written that
morning: the lexical query `"OBINNA THEODORE ONYENTO"` has a **match set of 1
across 18,749,962 judgments, in 2 ms**.

**2 — The coarse walk is running again, at the true frontier.** The stale
worklist's date was real; the defect underneath it was not known.
`COMPLETE_TOLERANCE=25` against a **permanent ~1,200-row refusal residue** per
10,000-document batch means every batch the walk has ever finished stays on the
worklist forever — 231 files, ~86 minutes of guaranteed zero output at the head
of a nine-day run. The distribution decides the threshold, not judgement: missing
counts are bimodal with **nothing at all between 1,320 and 4,275**, so a tolerance
of 2,000 sits in an empty gap 2,955 wide. Worklist: **657 files, head
`tier-a-batch-00229`.**

**3 — NEW2's delta is fully embedded, and it never waited for a census.**
27,607 of 27,610 representatives inserted, 3 refused `textUnsafe`, 0 bad norms,
29.5M tokens in 6,980 s. Asked directly rather than inferred from a subtraction:
**0 eligible Tier-A-band judgments in NEW2's authoritative 50,994 lack a coarse
vector** — 27,607 staged directly, 3,705 covered by a `content_hash` another
staged judgment carries, 19,693 `NOT_ELIGIBLE`.

**3b — And the queue is continuous, not a tool plus a habit.** `delta-queue.mjs`
carries a `created_at` watermark (never an id — random uuids put half of every
future row below an id watermark), restarts each pass a deliberate minute early
because a gap is worse than a repeat, and **advances only after the durable row
count actually moved**, because an exit code is a claim and three jobs in this
repository have reported COMPLETE while doing nothing. Building it exposed two
defects that would both have fired days from now: `delta-manifest` cast `--since`
to `::date`, so a one-minute window silently became the whole day (339 requested,
28,318 returned); and it spawned `tsx` from a path that does not exist under
`services/harness`, because pnpm hoists it to the root. Both fixed, both proven.

**3c — 339 judgments were in nobody's list.** My `created_at` re-derivation
returned 51,333 against NEW2's 50,994 snapshot. The 339 landed between
**13:04:51.891Z and 13:05:10.694Z — two minutes and one second after the handoff
was cut.** 306 Allahabad, 33 Bombay. Manifested as their **own labelled delta**
and embedded (132 eligible representatives, 132/132), because folding them into
the original would have made its `idsHash` describe a population that no longer
matches its label.

**4 — 36,663 statute sections are embedded AND promoted.** LCC applied migration
`0089` twenty minutes after the ask, so `document_vector_staging` — the table
built to keep source kinds apart, and empty until today — holds 36,663
statute-section vectors across 849 Acts. 0 differ from the fallback copy, 0 are
non-unit-norm. The embed itself: 36,663 written, 0 skipped, 1,717 s at 21
sections/second while sharing the GPU with two judgment walks.

**5 — The vectors were proven correct before nine more days were spent producing
them.** 20 coarse rows via `TABLESAMPLE SYSTEM` across the whole table,
re-embedded and compared: cosine 1.000000 at min, median and max. The same check
on the statute vectors: also 1.000000, 0 below 0.99.

**6 — 7 vectors over proven-damaged text were quarantined.** The walk refuses
`text_safety = 'UNSAFE_VERIFIED'` before the GPU sees a document; what it
structurally cannot reach is a row already staged when the verdict lands. NEW2's
screen convicted 547 documents at ~13:00Z and five had been staged by a walk that
started at 11:45Z. Moved, never deleted, with `refused_class` carrying the reason
and the reversal `INSERT ... SELECT` in the artifact. Re-asked afterwards:
**0 remain.**

**7 — And one claim of mine did not survive its own test.** I wrote that putting
the Act name inside the embedded text is what separates IPC s.302 from BNS s.103.
Measured against the counterfactual it separates them by **five hundredths**
(0.8725 → 0.8169, still "same provision" territory), does **nothing at all** for
BSA s.63 vs Evidence Act s.65B (0.8749 → 0.8751), and raises mean similarity
across every other pair because titles share tokens. **Which Act a provision
belongs to is a filter on the row, not a hope about the ranking** — the same rule
the citation harness enforces for verification state. Full pair table in
`SEARCH_STACK_COVERAGE_R9.md`.

---

## Running unattended

```
coarse walk        657-file worklist · batch 5/657 · ~29,000 vec/h · ETA 9.3 days
telemetry          15-minute ledger; 2 zero-output windows = ALERT,
                   3 = KILL the walk (idempotent, the stage table is the checkpoint)
tier-census        --reset, rebuilding embedding_content_representative under the
                   deployed definition 5b5d02384b46c96c
post-census chain  detached; cuts the v2 manifests into document-vectors-v2/ and
                   STOPS there on purpose — swapping a running nine-day job's
                   input directory is a deliberate step, not a 3 a.m. one
delta-queue        continuous incremental consumer, watermark on disk
```

---

## What is queued, and on whom

| item | on whom | why it matters |
| --- | --- | --- |
| coarse HNSW index | the walk finishing | 2.09M vectors are stored and **not searchable** until it exists. Priced: 69.1 GB fp32, **~35 GB as a `halfvec` expression index** — no second column, and fp32 stays authoritative because it casts down and halfvec does not cast back up. |
| wiring `new1_tranche_passages` into `retrieve.ts` | **LCC** — their file, and it changes what an advocate sees | production dense 40,161 → **111,874 documents, 2.79×, with zero new GPU** (the tranche overlaps `judgment_chunks` by only 10,007) |
| passage tranche 2 | the coarse walk, or a founder decision to interleave | frozen and hashed: 568,000 documents, `idsHash 3592efcbc5165a9f`, 2.91M passages, 58.5 GiB, 76.5 GPU-hours. **Items 1–4 alone — every Supreme Court judgment, every passage-worthy cited authority, the whole BNS/BNSS/BSA transition — are 130,293 documents, 13.4 GiB and 0.73 days.** |
| `CREATE TABLE` DDL for the two lab tables | me, when the walk finishes | LCC is right to refuse to journal a table that is mid-build; the index definition is the unstable part and it is now priced |
| `hc_document_class` on the 50,994 | **NEW2**, offered and accepted | all NULL; NULL passes `axis_c_role` harmlessly, but a classified delta refuses `procedural_disposal` on evidence rather than on silence |

### `script_quality`: NEW2 ran the screen, and it does not do what I asked for

I asked for it so the 50,994 would stop being admitted by silence. It cannot
produce that: the CLI writes exactly one of five verdicts, and `clean` would have
to be asserted from the **absence** of a signal — a pure-ASCII English judgment
and a Hindi judgment whose Devanagari the extractor deleted are the same bytes at
scan time.

```
screened   52,078      legacy_font_ascii written   547
Devanagari present, no verdict available   152
pure ASCII below marker threshold, no verdict   51,379
```

So **547 are convicted on evidence and 50,447 remain NOT ASSESSED**, and running
it again changes nothing. NEW2's wording is the record, kept verbatim: *NULL means
NOT ASSESSED, never assessed-and-fine.* What it bought is real — 547 documents,
542 of them Rajasthan `8_9`, are now excluded from `axis_b_text` by a verdict
rather than by silence, with a measured error direction of 0 false positives in
939 PDF-labelled clean documents across nine courts.

---

## The census was not on the critical path, and I was framing it as though it were

Correcting my own sequencing. The full reconciliation buys two things: NEW2's
50,994, and whatever eligibility changes have admitted since 19 August. **The
first was delivered without it** — `delta-manifest.mjs` manifested and embedded
27,610 representatives while the census had not started. Against that, the
worklist holds 6.49M documents and ~9.3 days of GPU; the census cannot make the
walk finish sooner, only make the worklist slightly longer.

So it waited for a genuinely quiet window rather than fighting the
citation-enrichment factory for a sequential scan of a 151 GB table — and when
NEW2 confirmed 0 non-idle backends, it started. That was a decision, not a delay.

---

## The decision that is not mine — `FQ-N1-R9-1`

**D: has 793.3 GB free and Postgres does not use it.** C: has 269.5 GB free
holding a 303 GB database. A passage vector costs **21,607 bytes all-in**
(13,847 heap+TOAST, 7,760 HNSW) and a document 108 KiB, so:

```
full-corpus passage build   8,854,281 × 108 KiB  =  935 GB
what fits on C: today                            =   60 GB → 568,000 documents
```

C: alone caps the passage corpus at **6.4% of the eligible population**. A
tablespace on D: is the highest-leverage storage decision available; it changes
the restore path and D:'s random-read latency under an HNSW probe is unmeasured,
so it belongs to the founder and LCC. Tranche 2 is frozen against the C:-only
budget, so nothing waits on the answer.

---

## What this round deliberately did NOT do

No new benchmark architecture, no representation bakeoff, no role classification,
no reranker, no HyDE, no graph ranker, no vector-database migration. The coarse
representation stays HEAD:4800 and the passage segmentation stays
`chunk.ts/defaults@F_ALL_CHUNKS`. `search.semantic.broad` stays
`EXPERIMENTAL_INTERNAL` in LCC's capability registry — this is coverage work so
that the eventual evaluation runs against the real corpus rather than 40,161
judgments.

The four known semantic limits are carried as facts and not attacked: broad
semantic quality is not release-ready; supporting-authority failure is
ranking-at-useful-depth in the measured sample, not proven representation
absence; absolute-similarity abstention failed; the passage-role classifier is
not reliable enough to be a legal evidence gate.
