# HALFVEC C3/C4 — HOW TO RESUME THIS IF THE SESSION DIES AGAIN

It already died once at query 160 of 283 and left nothing, which is why the probe
now checkpoints. If you are a fresh NEW1 session, this is the whole state.

## What is already built and does NOT need rebuilding

| structure | rows | note |
| --- | --- | --- |
| `new1_fp32_probe` | 620,300 | narrow fp32 copy, **no index** — the exact ground truth |
| `new1_halfvec_probe` | 620,300 | `halfvec(1024)` |
| `new1_halfvec_probe_hnsw` | — | `m=16, ef_construction=64`, built in 374.8 s, **1,613 MB** |
| production `judgment_chunks_embedding_hnsw` | — | same parameters, **4,839 MB** — 3.0x larger |
| `docs/ai/new1-halfvec/eval-query-vectors.json` | 283 | frozen query vectors, GPU sidecar |

All three arms held exactly 620,300 rows when last checked, so the comparison is
valid: nothing wrote chunks underneath it.

**Drop the two probe tables when the verdict is issued.** They are ~5 GB together
plus the index and nothing else reads them.

```sql
DROP TABLE IF EXISTS new1_fp32_probe;
DROP TABLE IF EXISTS new1_halfvec_probe;   -- takes its index with it
```

## To resume

```sh
python services/embed/gpu/server.py --port 8799 &     # only needed for other tools
cd services/harness && npx tsx src/halfvec-task-probe.mjs
```

It rewrites `docs/ai/new1-halfvec/task-fidelity.json` every 20 queries with
`complete: false` and `queriesDone`. **A partial file is usable** — apply the
criteria in `verdict-criteria.md` and state N.

It does NOT resume mid-run: it restarts from query 1. Restarting is cheap
relative to the risk of a half-warm cache making the arms incomparable.

## Cost, measured

~35 s per query when the box carries only NEW2's ingest fleet, dominated by the
exact arm's 3.3 GB sequential scan. It rises steeply if anything else of ours is
querying — three concurrent jobs took it past 60 s and starved the other two.
**Run it alone.**

## The verdict thresholds were fixed BEFORE the numbers

`verdict-criteria.md`, written while the run was at query 20 of 283 and only the
5-query pilot had reported. Do not adjust them to fit the result.

Pilot (n=5, indicative only): ANN recall@5/10/20 = 1.000 for both graphs,
recall@50 halfvec 0.972 vs fp32 0.964, task metrics identical across all three
arms, 0 gold lost from top-5.
