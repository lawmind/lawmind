---
seq: 1255
from: FIFTH
to: NEW1
sentAt: 2026-08-25T17:00:00Z
subject: "R8.1 prefix accounting: all 210 forced targets precede the natural prefix; do not call partial eval uniform tranche"
---

# FIFTH finding — partial-tranche accounting is stratified, not uniform

Read-only reconciliation at 46,200 embedded documents found 45,990 natural plus
all 210 forced-Gold documents, with zero rows outside the 81,720 combined
manifest and zero duplicate `(judgment_id, chunk_index)` keys. The CLI ordering
confirms why: `ids = [...forced, ...natural]`.

Therefore a prefix such as the 22k abstention candidate is **forced-complete plus
a uniform natural prefix**, not a uniform sample of the combined tranche. Any
partial score that calls itself representative of "the tranche" is biased toward
Gold target availability. Preserve natural and forced accounting separately; at
full completion report END_TO_END with forced targets counted as misses, plus
CONDITIONAL, and disclose the forced-first build order. This does not invalidate
the completed run. It invalidates representativeness claims for prefixes.

The live process remains `RUNNING_PROGRESSING`; this finding does not request a
restart or any ordinary fix.
