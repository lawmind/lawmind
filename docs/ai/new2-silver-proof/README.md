# SILVER COMPRESSION — THE REAL RATIO IS ~3.8x, NOT 117.88x

**Owner: NEW2 (ingestion lane), Track E.** Measured 17 August 2026, during the
post-migration write freeze, with no database connection.

`docs/CURRENT_PLAN.md` NEW2.14 item 7 requires the Silver export to be
calibrated on a **real representative sample**, and states that CX1's synthetic
ratio is not used for capacity planning. This is that measurement.

Tool: `services/ingest/src/harvest/silver-ratio-cli.ts` (`pnpm silver:ratio`).
Artifact: `run-20260817-160docs.json`.

---

## THE NUMBER

160 real High Court PDFs from the AWS Open Data bucket, spread across **16
court-year cells** (2018, 2021, 2023, 2025 × four courts each), text extracted
with the same Poppler binary the pipeline uses. **0 fetch failures, 0 documents
without a text layer.**

| | bytes | ratio |
| --- | --- | --- |
| source PDFs | 26,458,908 | — |
| extracted text | 1,477,031 | — |
| zstd, **per document** | 491,706 | **3.00x** |
| zstd, **concatenated** | 388,297 | **3.80x** |

A 48-document run taken independently the same hour gave 3.36x and 4.05x, so the
figure is stable across sample size at roughly **3–4x**.

### CX1's synthetic figure was 117.88x

`docs/ai/cx1-parquet-proof/run-20260816-033152/benchmark-report.json` reports
`compression_ratio_full_text_to_parquet: 117.88`. Its own v2 run already marked
that `INVALID FOR CAPACITY PLANNING`, for the right reason — *"Synthetic text
does not represent LawMind legal-text entropy"* — and the correctness of that
self-flag is now quantified: **the synthetic number is about 31x too
optimistic.**

Sizing storage against 117.88x would have under-provisioned the Silver layer by
a factor of roughly thirty, and the error would only have surfaced once the
export was already running. CX1 was right to refuse to report it; this is what
it should have been replaced with.

---

## THE SECOND NUMBER IS THE ARCHITECTURE DECISION

The mission's instruction is *"compact objects rather than one-object-per-document"*.
The two ratios above are exactly that comparison:

- **per document** = what you get with one object per document, each compressed
  in isolation
- **concatenated** = what you get from a compact object, where zstd can reuse a
  window across documents that share boilerplate

**Compaction gain: 1.27x** (1.21x on the 48-document run).

Real, and worth taking — 27% off the Silver layer for a batching decision that
costs nothing. But it is a **27% saving, not a step change**, and it should be
argued for on that basis. The larger reason to compact remains request count:
one object per document means one GET per document, and `CX1_ARCHITECTURE_PACKET`
already makes that case on its own terms.

Why the gain is modest rather than large is itself informative: judgment
boilerplate ("IN THE HIGH COURT OF …", cause titles, statutory formulae) is
repetitive *within* a document as much as across documents, so a per-document
zstd window already captures most of it.

---

## A SHARED DICTIONARY RECOVERS MOST OF COMPACTION'S BENEFIT — AND KEEPS ADDRESSABILITY

The reason compaction wins is that zstd reuses a window across documents. A
**shared dictionary** offers the same reuse to documents compressed
*individually*. If it closes the gap, one-object-per-document stops costing
anything in bytes and the compaction decision becomes purely about request
count.

Measured on the same 160 documents, **held out on purpose**: the dictionary is
built from the first 32 and measured against the other 128. Building it from the
documents it then compresses would measure how well zstd can quote text it was
handed, which is not a question anyone needs answered.

| | bytes | ratio |
| --- | --- | --- |
| held-out text | 1,207,774 | — |
| per document, no dictionary | 393,707 | 3.07x |
| per document, **with dictionary** | 341,892 | **3.53x** |

**Dictionary gain: 1.15x**, against a compaction gain of **1.27x**.

So a 112 KB shared dictionary buys about **85% of what compaction buys**, while
leaving every document independently addressable and fetchable. **That makes the
compaction decision a request-count decision, not a storage decision** — which is
where `CX1_ARCHITECTURE_PACKET` already put it, now with the storage half
measured rather than assumed.

**And 1.15x is a floor, not a ceiling.** Node exposes zstd's dictionary
parameter but not `ZDICT_trainFromBuffer`, so this is raw held-out content used
directly as a dictionary. A properly trained dictionary is normally
significantly better on a corpus this repetitive, and would plausibly overtake
compaction outright. Capped at 112 KB — zstd's own default trained-dictionary
size — because an uncapped dictionary flatters the result by simply containing
more of the corpus.

**The operational cost this introduces, and it is not zero:** a dictionary is a
decoding dependency. Every object compressed with it is unreadable without the
exact dictionary bytes, so the dictionary becomes a versioned artifact that must
be stored, replicated and never garbage-collected. That is a real obligation
against a 15% saving, and it is a decision for whoever owns the Silver export,
not for this measurement.

---

## PDFs ARE 17.9x LARGER THAN THEIR TEXT

26,458,908 bytes of PDF yielded 1,477,031 bytes of text. That ratio is not a
compression figure and it is not what this tool was written to measure, but it
falls straight out of the sample and bears directly on
`docs/R2_SOURCE_RETENTION_MATRIX.md`: **retaining source PDFs costs about
eighteen times what retaining extracted text costs**, before any compression.

Not a recommendation — the PDF is the evidentiary artifact and there are good
reasons to keep it. Recorded so the retention decision is made against a
measured multiplier rather than an assumed one.

---

## WHAT THIS DOES NOT ESTABLISH

- **It is source text, not our `full_text`.** Our text has been through
  cleaning, and the page-furniture cleaner will remove more. The real Silver
  ratio will differ, probably upward slightly as repeated furniture is stripped.
  This bounds the estimate; it does not finish it.
- **No parquet file was written.** Parquet adds columnar framing and page
  headers on top of the codec, so a real export lands slightly **worse** than
  3.80x. Treat that figure as an upper bound.
- **It is not a corpus projection and must not be multiplied by 20,529,203.**
  160 documents across 16 cells is a sample. Producing a corpus storage total
  from it would be the same class of error this file exists to correct.
- **One codec, default level, no level sweep.** A compression-level sweep was
  not run and may be worth a little more.
- **The dictionary is raw content, not ZDICT-trained.** Its 1.15x is a floor.
  Training one requires a binding Node does not expose, so it would need a
  Python or CLI step — worth doing before the Silver export is designed, not
  before it is discussed.
