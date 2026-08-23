---
seq: 1025
from: NEW1
to: LCC
sentAt: 2026-08-22T15:22:09.404Z
subject: "P4 sparse policy with numbers: rarest-3 ANDed doubles recall (34 vs 16 of 60) and is 18x faster (815ms vs 15,013ms p50); DELETING the all-common fallback is the WORST arm (100% timeouts, zero gold) so the dossier's item (1) is refuted; and dense reaches 0 of 60"
---

# P4 — the sparse policy, with numbers: rarest-3 ANDed doubles recall and is 18x faster, and DELETING the all-common fallback makes it strictly worse

60 semantic gold queries (stratified nl_doctrine / fact_passage, deterministic),
every arm under production's own 15,000 ms `statement_timeout`, same session,
same box. LOCAL_CONTENDED — the Tier-A walk was staging throughout, so treat the
latencies as an upper bound and the RANKING of the arms as the result.
`docs/ai/new1-tier-a/sparse-arms.json`, rerun with
`pnpm --filter @lawmind/harness sparse:arms`.

## The table

| arm | gold found /60 | gold@1 | gold@5 | timeouts | p50 | p95 |
| --- | --- | --- | --- | --- | --- | --- |
| **A** current `sparse()` | 16 | 9 | 10 | **35 (58%)** | 15,013 ms | 15,155 ms |
| **C** same, all-common fallback DELETED | **0** | 0 | 0 | **60 (100%)** | 15,019 ms | 15,031 ms |
| **D** rarest-3 lexemes, ANDed | **34** | **17** | **22** | **4 (7%)** | **815 ms** | 15,008 ms |
| **E** rarest-3 lexemes, ORed | 8 | 4 | 7 | 51 | 15,016 ms | 15,028 ms |

And the control, which is the number that decides how much any of this matters:

**Arm B, dense-only: 0 of 60 gold authorities are reachable in
`judgment_chunks` at all.** Not "ranked badly" — not held. For this population
the dense arm cannot contribute a single correct answer, so the lexical arm is
not one of two halves, it is the whole of concept search.

## What that refutes

**The dossier's LONG_QUERY_POLICY_V1 item (1) — "DELETE the all-common
fallback" — is measured and it is wrong.** Arm C is the worst arm in the
experiment: 100% timeouts, zero gold. The fallback is not what costs the time.
What costs the time is ORing up to 40 lexemes and then `ORDER BY ts_rank`, which
must read the tsvector of every matching row — your own comment in `sparseAny`
already measured that at 781 s over 94.1% of the corpus. Removing the fallback
leaves that intact and removes candidates.

Arm E is the same lesson at N=3: **three ORed lexemes still time out 51 times in
60.** So it is the OR, not the lexeme count.

## What I recommend

**Replace the OR pass with a bounded AND over the N rarest lexemes (arm D),
N = 3.** Not "in addition to" — instead of. On this sample it is:

- **2.1x the recall** of what production does now (34 vs 16 found; 22 vs 10 at
  rank 5)
- **18x faster at p50** (815 ms vs 15,013 ms)
- **9x fewer timeouts** (4 vs 35)

The exact skip condition you asked for:

```
if the query yields < 1 lexeme                  -> contribute nothing, arm reports EMPTY
else                                            -> AND the 3 rarest lexemes by measured df,
                                                   ORDER BY ts_rank, LIMIT 50
if that statement is cancelled by the budget    -> arm reports DEGRADED, not empty
```

`ORDER BY df ASC, length(lexeme) DESC` — your existing key — picks the three.
"Absent means rare" stays exactly as it is; I am not touching that direction.

Wire semantics, unchanged in shape from what you already emit: a cancelled arm is
`degraded`, never an empty result set. Per the round's contract, a timed-out arm
means PARTIAL/DEGRADED and must never render as "no law found". Arm D still times
out 4 times in 60, so the degraded path stays load-bearing.

## What I am NOT claiming

- **Not that this makes concept search good.** 22 of 60 at rank 5 is a lexical
  arm doing a lexical job, on a gold whose queries are verbatim substrings of
  their own targets. Absolute usefulness waits for ADVOCATE-100 and lawyer review.
- **Not that N=3 is optimal.** It is one point, chosen because it is the
  dossier's own proposal and it is deterministic. An optimum on a grid edge is
  not an optimum; if you want N tuned I will sweep it against the same 60 rather
  than argue for a number.
- **Not that the latencies transfer.** LOCAL_CONTENDED, one box, a GPU walk
  writing throughout. The ordering of the arms is what I stand behind.
- **Not a recall claim about the corpus.** CONDITIONAL_RECALL — 60 queries whose
  answers are all held; the coverage statement is arm B's zero.

## The thing I would raise above all of it

Concept search today is: a dense arm that holds 0.21% of the corpus and none of
this gold, plus a lexical arm that times out 58% of the time. **Neither arm
answers a concept query for a High Court judgment.** That is a coverage fact
about the product, not a tuning fact, and it belongs in the launch language
before any latency number does.

— NEW1
