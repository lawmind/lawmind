# The coarse walk, restarted correctly — what was stale, what was *also* stale, and the numbers

**NEW1, R9, 27 August 2026.**

---

## 1. Starting state, recorded before anything was launched

```
judgments                        18,749,962      (was 18,698,968 — NEW2's +50,994)
deployed eligibility view hash   5b5d02384b46c96c
new1_doc_vector_stage             2,026,872      at 2026-08-27T11:29:27Z
new1_doc_vector_stage_refused        72,092
new1_tranche_passages               418,116  over 81,720 documents
GPU sidecar                       pid 16168 port 8799, live probe answered
```

`5b5d02384b46c96c` is the hash `doc-vector-embed.mjs` is reconciled against, so
the walk's contract guard passes and no reconciliation was needed this round.

---

## 2. Exact and lexical coverage: 100%, and it never waited

**`judgments.full_text_tsv` is `GENERATED ALWAYS AS to_tsvector('english',
full_text)`**, with a GIN index `judgments_full_text_idx` over it. Every row NEW2
inserts is full-text searchable in the same statement that writes it. The
identity paths are the same story — `content_hash`, `cnr`, `case_number`,
`source_url`, the normalised `case_title` key and the normalised
`neutral_citation` key each have their own index, maintained on write.

There is no "make it searchable" job downstream of ingest, and there never was.
Measured on NEW2's entire delta (`created_at >= 2026-08-27`):

| field | of 50,994 |
| --- | ---: |
| `full_text` non-empty | 50,994 |
| `full_text_tsv` non-empty | 50,994 |
| `content_hash` · `case_number` · `cnr` · `judgment_date` · `court` | 50,994 each |
| `case_title` longer than 3 chars | 50,994 |
| `text_quality` | 50,994 |
| `neutral_citation` | 15,639 |
| `script_quality` | **0** |
| `hc_document_class` | **0** |

So §1 of the round is satisfied by the schema, not by a job. **Exact and lexical
search covers 18,749,962 of 18,749,962 judgments.**

### Proved end to end on a judgment ingested today, not argued from the schema

Probe: `0000fcfa-990a-49e4-9082-a5aaa9a980ce`, High Court of Delhi, decided
2026-08-04, *OBINNA THEODORE ONYENTO v. UNION OF INDIA*, `LPA/603/2026`, CNR
`DLHC010352322026` — written by NEW2's walk this morning.

| path | result |
| --- | --- |
| exact `case_number` | 1 hit, is the probe |
| exact `cnr` | 1 hit, is the probe |
| exact `content_hash` | 1 hit, is the probe |
| lexical `"OBINNA THEODORE ONYENTO"` | **match set of 1 across 18,749,962 judgments, in 2 ms** |
| lexical `"ONYENTO"` | match set of 1, in 1 ms |
| structured `court + judgment_date` | 183 judgments that day at that court |

**One correction to my own first run of this test, because it matters.** I first
asked a generic phrase — *"Shailendra Mishra Advocates Respondent JUSTICE"* — with
`LIMIT 200` and no `ORDER BY`, and the probe was not in the returned 200, which
reads like a coverage failure. It is not. That phrase matches **14,879
documents**, and an unranked `LIMIT` returns an arbitrary 200 of them. Asked as a
membership question instead — *does this document's `full_text_tsv` match this
`tsquery`* — the answer is `true`. The defect was in the test, not the index, and
the distinction is exactly the one this round is told to keep straight: **being
retrievable and being ranked at a useful depth are different questions.**

### The gap that is not a gap in searchability, and does cost GPU

`script_quality` is NULL on all 50,994. The eligibility view's `axis_b_text` reads
`script_quality IS NULL OR script_quality IN ('clean','mixed_script_ok')` — so
**every one of them passes the readability gate by never having been looked at.**
This is the admission-by-absence shape; 94.1% of Tier A was admitted the same way.
It does not affect exact or lexical retrieval at all, and it does mean those
documents reach the GPU unscreened. Raised with NEW2 (bus 1391); not written by
this lane, because `script_quality` is a corpus column.

Delta eligibility, measured against the deployed view:

```
BROAD_SEARCHABLE   31,315   standard 13,987 · full 9,879 · substantial 7,449
NOT_ELIGIBLE       19,679   brief 12,086 · stub 7,104 · 489 fail identity/text
already staged          0
content_hash already represented   2,665   →  ~28,650 new representatives
```

---

## 3. The stale worklist had TWO defects and only one of them was the file's date

### Defect 1 — the file was three days old

`stage-coverage.json` was measured **2026-08-20T23:19Z**, when 480,627 rows were
staged. By 25 Aug the table held 2,026,872. The walk was therefore re-reading
batches that had been full for days: batches 140–143 on 25 Aug each ran to
completion reporting `inserted 0`, `skippedAlreadyStaged ~8,800`,
`tokensPerSecond 0`.

### Defect 2 — re-running the census unchanged does not fix it

`COMPLETE_TOLERANCE` is **25 rows**. A batch is ~10,000 documents, of which
roughly **1,200 are permanently refused** by the live eligibility view every
single time the batch is read:

```
~850   text_safety = 'UNSAFE_VERIFIED'      (proven text damage — never embedded)
~350   hc_document_class = 'procedural_disposal' and not a cited authority
```

Those rows are never going to be staged, by design. So **every batch the walk has
ever finished still reports ~1,200 missing and stays on the worklist forever.**

Re-running the census with the tolerance as written:

```
worklist   864 files   head tier-a-batch-00010
```

231 of those are finished. Walking them costs ~25 s each and produces **zero
vectors for the first ~86 minutes** — exactly the healthy-GPU/no-output shape this
round exists to prevent.

### The fix is decided by the distribution, not by judgement

```
missing <= 1,320    231 files   permanent refusal residue: 198,226 rows
     (nothing at all between 1,320 and 4,275)
missing >= 4,275    657 files   real work: 6,553,765 documents
```

The gap is **2,955 rows wide and completely empty**. `COMPLETE_TOLERANCE=2000`
sits in the middle of it, so it is not a tuned number — any value in [1400, 4200]
gives the identical worklist.

```
worklist   657 files   head tier-a-batch-00229    ← the true frontier
```

**Residual risk, named.** A batch with a genuine hole of fewer than 2,000 rows now
reads as complete. That is closed by construction in §5: manifests rebuilt under
the deployed definition will not contain the refused rows at all, so "missing"
will mean what it says and the tolerance can go back to 25.

---

## 4. Running, with a reporter that can catch the failure the walk cannot

```
walk launched     2026-08-27T11:29:35Z   Start-Process, detached
worklist          657 files, head tier-a-batch-00229
telemetry         services/harness/src/coarse-walk-telemetry.mjs, 15-minute windows
ledger            docs/ai/new1-r9/coarse-walk-telemetry.jsonl
```

`nohup` does not survive the session on this box — the walk and its keeper were
both killed with their parent shell once already, three and a half hours before
anyone looked, with the GPU at 0% and nothing reporting anything. `Start-Process`
is the only launcher that outlives the shell here.

The telemetry watcher is a **separate process on purpose**. A reporter living
inside the walk observes the same lie the walk is telling: the sidecar answers,
`nvidia-smi` reads 100%, every batch prints START and END, and nothing lands. This
one asks the database what changed between two real timestamps.

Rows land per `FETCH_PAGE` (200 documents, ~13 s), so a 15-minute window with zero
new rows is not the normal shape of a 16-minute batch — it is a stall. Hence:

```
1 zero window    noted
2 zero windows   ALERT written to docs/ai/new1-r9/WALK_ALERT.json
3 zero windows   the walk is KILLED. Nothing is lost: the stage is idempotent
                 per document and the checkpoint IS the table.
```

Three rather than two before killing, because a false positive costs a relaunch
and a false negative costs 45 minutes — but a rule that only ever warns is a rule
that gets scrolled past, which is how the last one survived four hours.

### First window

```
2026-08-27T11:32:59Z   rows 2,028,308   +174 in 20 s
                       31,320 vectors/hour   GPU 99%   ETA 8.77 days
```

---

## 5. Queued behind HEAVY_BOX, in order

The box is not idle — `pg_stat_activity` shows five parallel workers on the
citation-candidate scan over `judgments`. A full sequential scan of a 151 GB table
would fight it, so these wait:

1. **`tier-census --reset`.** `embedding_content_representative` was built
   2026-08-19T08:51Z under definition `e76879ab6bbcd452`. The deployed view is
   `5b5d02384b46c96c` and the corpus has grown 50,994 rows under it. Until this
   runs, `doc-vector-batches` **correctly refuses** — it compares
   `embedding_census_progress.definition_hash` against the live view and will not
   manifest a population built under a different contract. So NEW2's delta cannot
   be manifested yet, and that refusal is the system working.
2. **`doc-vector-batches --reset --out …/v2`.** A **new directory**, so the
   running walk's manifests are never rewritten underneath it.
3. **Re-census coverage over v2, tolerance back to 25, switch the walk.** The
   stage table is the checkpoint, so the switch costs nothing and loses nothing.

Previous full census: 06:34Z → 08:51Z, **2 h 17 m** for 17.9M rows.

---

## 6. The numbers to hold this round to

| quantity | value |
| --- | ---: |
| judgments exact + lexically searchable | **18,749,962 / 18,749,962 (100%)** |
| eligible representatives (19 Aug census) | 8,854,281 |
| coarse vectors at round start | 2,026,872 (22.9%) |
| permanently refused inside finished batches | 198,226 |
| real remaining coarse work | 6,553,765 |
| measured coarse throughput | 31,067 vectors/hour |
| coarse ETA at that rate | ~211 h ≈ **8.8 days continuous** |
| passage vectors | 418,116 over 81,720 documents |
| statute sections | 36,663 across 849 Acts — embedding, see §4 doc |

Coarse throughput drops while the statute-section job shares the GPU (measured
~20,400/h with both running). That is temporary and it is in the ledger rather
than smoothed out of it.
