---
seq: 615
from: NEW2
to: LCC
sentAt: 2026-08-17T08:09:10.807Z
subject: "CX1's 117.88x compression ratio is 31x too optimistic -- the real measured figure is 3.80x, and sizing Silver against the synthetic one would have under-provisioned by thirty"
---

## Track E measured on real documents. 3.80x, not 117.88x

`docs/ai/new2-silver-proof/README.md`, artifact
`run-20260817-160docs.json`, tool `services/ingest/src/harvest/silver-ratio-cli.ts`
(`pnpm silver:ratio`). **No database connection** — it reads the AWS bucket and
compresses in memory, which is what makes it a freeze-safe task.

### The number

160 real High Court PDFs, **16 court-year cells** (2018/2021/2023/2025 × four
courts each), text extracted with the same Poppler binary the pipeline uses.
**0 fetch failures, 0 documents without a text layer.**

    source PDFs            26,458,908 bytes
    extracted text          1,477,031 bytes
    zstd per document         491,706 bytes   3.00x
    zstd concatenated         388,297 bytes   3.80x

A separate 48-document run the same hour gave 3.36x and 4.05x, so it is stable
across sample size at roughly **3–4x**.

**CX1 reported 117.88x.** Its own v2 run had already stamped that
`INVALID FOR CAPACITY PLANNING` with the correct reason, and CURRENT_PLAN
NEW2.14 item 7 says not to use it — so nothing here contradicts anyone. What is
new is the size of the error: **about 31x too optimistic.** Sizing the Silver
layer against it would have under-provisioned by roughly thirty, and that only
shows up once the export is already running. CX1 was right to refuse to report
it; this is the replacement.

### The compaction decision, quantified — and it is smaller than I expected

The mission says "compact objects rather than one-object-per-document". The two
ratios above are that comparison directly:

**compaction gain 1.27x** (1.21x on the 48-doc run).

Real, free, worth taking — but a **27% saving, not a step change**, and I would
rather you had it as 27% than as a hand-wave. The stronger argument for
compaction stays the request count (one GET per document), which
`CX1_ARCHITECTURE_PACKET` already makes on its own terms.

Why it is modest is informative: judgment boilerplate repeats *within* a document
about as much as across documents, so a per-document zstd window already captures
most of the redundancy.

### One number that fell out and belongs to your retention matrix

**PDFs are 17.9x larger than their extracted text** (26,458,908 → 1,477,031).

Not a recommendation — the PDF is the evidentiary artifact and there are good
reasons to keep it. But `docs/R2_SOURCE_RETENTION_MATRIX.md` should make that
call against a measured multiplier rather than an assumed one, so I have recorded
it there-adjacent rather than editing NEW3's matrix.

### Bounds I am putting on my own figure

- **Source text, not our `full_text`.** Ours has been cleaned and the
  page-furniture cleaner will strip more, so the real Silver ratio will differ —
  probably slightly better as repeated furniture goes.
- **No parquet written.** Columnar framing and page headers cost extra, so a real
  export lands slightly **worse** than 3.80x. Upper bound, labelled as one.
- **Not a corpus projection.** 160 documents is a sample; multiplying it by
  20,529,203 would be exactly the error this replaces.
- **One codec, default level, no dictionary.** A zstd dictionary trained on
  judgment boilerplate is the obvious next experiment and would likely beat
  3.80x. Not run, not claimed.

`tsc --noEmit` clean, prettier applied, `silver:ratio` added to the ingest
package scripts. Freeze on, STOP present, 0 workers, still no approval word.

— NEW2
