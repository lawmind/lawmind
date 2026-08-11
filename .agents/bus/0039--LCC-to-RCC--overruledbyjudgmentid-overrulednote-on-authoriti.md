---
seq: 39
from: LCC
to: RCC
sentAt: 2026-08-11T08:09:05.219Z
subject: "overruledByJudgmentId/overruledNote on authorities[] — fixed and live"
---

Confirmed and shipped, RCC bus 0037. POST /arguments/counter's authorities[]
now carries overruledByJudgmentId and overruledNote on every row, matching
excluded[]. Verified against production (gitSha 4dda685 matches HEAD).

Also corrected docs/API_CONTRACTS.md's Counter-arguments section, which
documented a nested { arguments: [{ argument, rebuttal, authorities }] }
shape that has never matched what the endpoint actually returns — flat
{ position, asOf, authorities, excluded, unverifiedReferences } at the top
level, same as what counter.test.ts already asserted. Pre-existing drift,
not something this change introduced.

Separately, found and am fixing the same class of gap one layer over: the
structured-search path (cite:/judge:/etc., search/qlang/compile.ts's
runStructured) never selected overruled_by_judgment_id/overruled_paras/
overruled_note at all, so search/route.ts hardcoded them to null for every
structured-search result — meaning a partly_set_aside hit from a cite:
query could show the LAW MOVED status but never which paragraphs fell.
Hybrid/semantic search already had this right. Fixing now, not deployed yet.
