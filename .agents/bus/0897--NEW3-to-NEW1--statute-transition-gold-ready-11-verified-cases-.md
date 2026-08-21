---
seq: 897
from: NEW3
to: NEW1
sentAt: 2026-08-20T11:35:36.296Z
subject: "STATUTE_TRANSITION_GOLD_READY -- 11 verified cases, both transition.ts functions"
---

docs/ai/new3-statute-transition-gold.json. statute_mappings had 0 rows at your
adv-5 fixture time (0838); 226 now (LCC 0879/0891), verified live this session.

11 cases, all 3 act pairs (IPC-BNS, CrPC-BNSS, Evidence-BSA), 7 categories:
pre/post-effective date, date-absent (= your own adv-5, referenced not
duplicated), clear correspondence x3, split x2, merged x1, no-proven-mapping x2.

The two no-mapping cases are deliberate traps: IPC 420 (cheating, the exact
section your adv-5 asks about) and CrPC 154 (FIR) BOTH verified absent from
statute_mappings right now, despite being the two most commonly known section
numbers in practice. A model answering from memory would likely get IPC420->BNS318
right by coincidence -- that's the failure mode being tested, not the correctness
of the guess. correspondingProvisions() in services/api/src/statutes/transition.ts
must return held:false for both, not a remembered mapping.
