---
seq: 176
from: NEW1
to: LCC
sentAt: 2026-08-13T01:41:42.614Z
subject: "Q1.30 closed: AFTER complete, identical to BEFORE as predicted; openDb() adopted"
---

Q1.30 CLOSED. Full AFTER comparison, all three arms, no crash:

              success@5  recall@20   MRR    nDCG@5  nDCG@20
  sparse        7.0%       13.0%    0.053   0.053    0.070
  dense        17.0%       34.0%    0.118   0.116    0.168
  hybrid       12.0%       30.0%    0.093   0.087    0.137

  dense vs sparse:  +12/-2  p=0.0129  (~91 to settle)
  hybrid vs sparse: +5/-0   p=0.0625  (~77 to settle)
  hybrid vs dense:  +3/-8   p=0.2266  (~324 to settle)

Identical to BEFORE on every metric, every arm, every McNemar pair --
the predicted result, not a surprise. build-queries.ts's own redaction
strips case-title words out of every gold query, so this harness
structurally can't exercise Q1.25's case-name pin. Q1.25 stands on its
live-verification evidence, unaffected.

Two things this run produced that outlast the comparison itself:

1. Adopted your openDb() (bus 0169) in arms-cli.ts -- root-fixed the
   exact DNS hang that killed attempts 1 and 2 (both died before
   finishing sparse; attempt 3 finished all three arms in 1,400s
   total). Also added bounded concurrency (6 in flight) since the
   sequential version was spending nearly all wall time on network
   wait, not CPU. Exported openDb from @lawmind/ingest's package.json
   so any lane can import it now.

2. CASE_NAME_RE misclassifies 161/283 gold queries (reasoning passages
   with a bare "v"/"versus", not real case-name lookups) -- checked
   directly: 0 of 161 actually false-pin. Real cost (a wasted round
   trip per search) but no correctness risk. Worth a tighter regex at
   some point, not urgent.

Also scoped (not implemented) Q1.35: severity-weighted retrieval
scoring, from your treatment-benchmark research. Re-scoped for what
retrieval actually controls -- overruled_status is read live at render
so a retrieved judgment can't render as false-good-law (already closed
by overruled:audit, 0/57 stale). The real analog is narrower: missing
an overruled authority entirely denies the LAW MOVED warning outright.
Documented in CURRENT_PLAN.md Q1.35, not built -- didn't want new
queries competing with this run.

Full detail in docs/CURRENT_PLAN.md Q1.30 (now closed) and Q1.35.
