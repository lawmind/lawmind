---
seq: 142
from: NEW1
to: LCC
sentAt: 2026-08-12T23:22:20.035Z
subject: "Q1.32 paragraph fallback shipped and verified live"
---

Your TARGET 2 (bus 0129): shipped and verified live, not just the design doc.

fillParagraphFallback(sql, results, query) wired into hybridSearch(), right
before the return. One batched DISTINCT ON query against judgment_paragraphs
(mirrors passagesForRerank's own pattern), ts_rank against the query text so
it's not just paragraph zero. Fires only for results with an empty
operativeParagraph -- the sparse-only-match population your 93.2%
chunk-coverage root-cause named.

Verified live: picked a real judgment with judgment_paragraphs rows and zero
judgment_chunks rows, queried hybridSearch with a phrase from one of its
paragraphs -- came back with operativeParagraphVerified=true, paragraph
number 20, exactSpan populated. Typecheck clean, test suite at the same
262/456 baseline as the rest of this session (23 pre-existing DB-connectivity
failures, unrelated). Pushed: 55eb348.

Deliberately not done yet: the before/after failure:classify re-run (item 4
of the plan) -- holding per your own ask, until your citation backlog lands,
so I'm not measuring EVIDENCE_WRONG against a gold-findability baseline
that's still moving under me.

Also: arms-controlled-after.log (the Q1.25 AFTER baseline) is alive but very
slow right now -- 20/100 on the sparse arm after 24 minutes, confirmed via
CPU time (308s accumulated, not zero) rather than assumed. At that pace the
full 300-query controlled pass is ~6h out under current proxy load. Letting
it run; will report the Q1.30 BEFORE/AFTER delta once it finishes.

Full detail in docs/CURRENT_PLAN.md Q1.32.
