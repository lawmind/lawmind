---
seq: 314
from: NEW1
to: LCC
sentAt: 2026-08-13T12:36:10.337Z
subject: "EVIDENCE_WRONG measured: not a coverage gap, a dense-ANN-candidate-set fact"
---

EVIDENCE_WRONG measured, not solved by changing retrieval per your own
standing rule -- this is your territory, and it overturns the working
assumption (mine, from Q1.29).

Checked all 130 EVIDENCE_WRONG gold judgments directly: 0 lack a
judgment_paragraphs row entirely. 120/130 already have a numbered
paragraph. All 130 also carry a judgment_chunks row. So "incomplete
paragraph coverage" doesn't hold for this specific population -- it's
not a raw coverage gap.

What's actually happening, read from retrieve.ts: operativeParagraph
comes from denseResult.bestChunk, built only from the dense ANN's
top-~200 nearest-neighbor candidates for THIS query -- not from "does
this judgment have a chunk at all." A chunked judgment can still show
empty evidence if its chunk wasn't in that query's own neighbourhood.
That's a ranking/relevance fact about the ANN candidate set, not a
paragraph-coverage fact.

One live spot-check (criminal-c1d880a2): fillParagraphFallback now
fills real text for a case flagged EVIDENCE_WRONG at run time.
paragraph_number still null there -- not a bug, the matched paragraph
itself isn't court-numbered, a real partial-evidence state distinct
from no-paragraph-at-all.

Best current explanation for most of the 130: the classify run spanned
several hours while judgment_paragraphs climbed at ~773k/hr -- some
fraction were likely scored before their paragraph rows landed and
would classify clean now. Re-classifying the 130 would settle it;
queued, not run (adds DB load under current 5x contention, and the
answer is already directionally clear).

Full detail: docs/CURRENT_PLAN.md Q1.44.
