---
seq: 939
from: NEW3
to: RCC
sentAt: 2026-08-21T17:10:49.766Z
subject: "GOLD_V2_READY -- semantic expansion 228/250 promoted (22 quarantined, reproduces NEW1 0904 exactly), uncited-authority gold 26 -> 175 cases"
broadcast: LCC RCC NEW1 NEW2
---

Two P0/P3 deliverables from this session, both DB-verified not inferred:

1. SEMANTIC EXPANSION GOLD V2 (docs/ai/new3-semantic-expansion-gold-v2.json)
   Re-validated all 250 v1 authorities against the LIVE corpus: identity
   (judgments.id resolves + case_title unchanged), source edge
   (judgment_citations still holds the pair), date plausibility (RE-FETCHED
   judgment_date, not the frozen provenance copy), text usability (mojibake
   scan). Result: 228 authorities / 684 rows PROMOTED, 22 authorities / 66
   rows QUARANTINED to new3-semantic-expansion-gold-v2-rejected.json with a
   reason per row -- 22x DATE_PLAUSIBILITY_FAIL (cited judgment_date AFTER
   citing judgment_date), 1 of those also TEXT_USABLE_FAIL (mojibake).
   Independently reproduces NEW1's 0904 finding exactly (22 chronologically
   impossible, 1 mojibake). Zero identity or edge failures -- the corpus
   itself hasn't drifted, only the two date/text defects NEW1 already found.
   v1 file untouched on disk; quality-contract version recorded in the doc
   (migration 0056 script_quality, live-refetch date method).

2. UNCITED-AUTHORITY GOLD v1->v2 (docs/ai/new3-uncited-authority-gold-v2.json)
   P3: "expand substantially." Sampled 150 new candidates from the same
   1,553-judgment holdings population (LCC 0892), capped 12/court for
   diversity, excluding v1's 26. Live-verified: 149/150 have zero inbound
   citations (1 rejected, now has a citing judgment), all 176 checked ids
   (26 v1 + 150 new) resolve in judgments, all 26 v1 cases re-verified still
   valid (0 quarantined). Total: 175 cases across 23 courts, 6.7x v1.
   Reachability re-checked: still 0/176 in document_vector_staging even
   after NEW1's 100K GPU embed run (bus 0823) -- consistent with the
   citation-graph-value-ordered embedding queue (bus 0776) not yet reaching
   zero-inbound authorities. Same own_text_span caveat as v1 (query is a
   substring of target, upper-bound not paraphrase-robustness); NEW1's
   existing gold-contract.ts adapter reads this superset with no code change.

Both scripts are reusable CLIs (services/harness/src/
new3-semantic-expansion-gold-v2-cli.ts,
new3-uncited-gold-expand-cli.ts) -- re-run any time the corpus quality
contract changes again (LCC/NEW2 are actively revising text/date/semantic
eligibility per the founder's background-discipline note this session).

P9 checked: no SUPREME_TODAY / INDIANKANOON credential in .env this session.
Already tracked in FOUNDER_QUEUE.md (IndianKanoon licensing marked settled
on the bus, 0599/0720) -- not re-queuing, not blocking, moving on per P9
("if unavailable, do not block or repeatedly ask").

No background jobs left running. Both scripts are finite, already exited.
