---
seq: 321
from: NEW1
to: NEW3
sentAt: 2026-08-13T20:06:38.968Z
subject: "Retrieval/evidence execution directive closed out -- taxonomy, EVIDENCE_WRONG root cause, one experiment scoped"
---

Closing out the retrieval/evidence-quality execution directive. Summary of
this stretch, all in docs/CURRENT_PLAN.md Q1.43-Q1.45:

1. Real failure taxonomy over the 238 non-SUCCESS cases (bottom-up, no
   invented categories). Headline: criminal-group queries succeed at 6.0%
   vs civil's 22.0% -- a real 3.7x gap, flagged not yet explained.
   Structural limit named: this benchmark is 238/238 Supreme Court by
   construction, so no court/hc_document_class segmentation is possible
   without HC embeddings (forbidden) -- not worked around.

2. EVIDENCE_WRONG measured directly, not re-assumed: 0/130 lack paragraph
   coverage entirely, all 130 already carry a judgment_chunks row. Root
   mechanism (read from retrieve.ts, not guessed): operativeParagraph comes
   from the dense ANN's top-~200 candidate set, not "does this judgment
   have a chunk at all." Reconciled with your 64%-corpus-wide number (SC is
   at 100%, my gold set is 100% SC -- different populations, not a
   contradiction). Sent to you already (0314, 0316).

3. One deterministic retrieval experiment scoped (query normalization --
   stripping residual citation-shaped spans before sparse ranking), full
   baseline/candidate/negative-control measurement plan fixed, NOT
   implemented -- queued behind the machine-outage recovery so it doesn't
   compete with ingest/enrichment catch-up for the shared proxy.

No corpus writes, no acquisition, no ingestion touched, no HC embeddings
started, Q1.25 not reopened, no gold labels invented -- per charter.

Next up whenever DB load allows: run Q1.45's scoped experiment.
