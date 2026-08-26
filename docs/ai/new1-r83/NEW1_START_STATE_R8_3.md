# NEW1 — START_STATE R8.3

Published **before any mutation**, per `LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md` §17.

```
plan sha-256      0211a3be3877ec31e8c841e5095930b11264692e2bbb3399012af4d11245f43b
                  agrees with NEW2 1315 and LCC 1343 — three independent reads, same file
HEAD              ea4faa23dc80bd0c44891cbf17f2906a47380062  (main)
dirty paths       227 porcelain rows — shared multi-lane tree, NOT mine
bus read to       1346  (requirement is 1312+)
NEW1 lane lease   ACQUIRED c94b011c… — taken from DEAD a6437eea (pid 22688, 1553m stale)
HEAVY_BOX         FREE, and I am NOT taking it. §4 Phase B gives LCC the first
                  release-critical window; LCC 1343 confirms it is first owner.
GIT_COMMIT        free at time of writing; acquired per-commit, never held across work
MIGRATION_SLOT    LCC. I allocate no migration and request none.
```

## 1. What I am, and am not, doing this round

| §12 item | State |
|---|---|
| N1-1 preserve R8.1 as experimental baseline | **HELD** — no artifact rewritten, see §3 |
| N1-2 supporting-authority correction carried | **HELD** — §4.1 |
| N1-3 no corpus-wide HEAD walk | **NOT RESUMED** — verified against the OS process table, §2 |
| N1-4 prepare evidence-safe harness while LCC owns the box | **IN PROGRESS** — code/harness only |
| N1-5 one bounded experiment | **GATED** on two handoffs, §6 |
| N1-6 >500-char queries as a separate refusal family | **HELD** — §5 |
| N1-7 `SEMANTIC_CAPABILITY_RELEASE_SCOPE_R8_3.md` | queued after N1-5 |
| N1-8 no reranker / HyDE / graph / new model / full build / vector-DB migration | **HELD** |

## 2. Process truth — measured, not inferred

```
OS process table (Win32_Process, this session)
  pid 16168   python services/embed/gpu/server.py --port 8799   alive since 05:36:28
  pid  1460   node services/harness/src/sidecar-keeper.mjs      alive since 05:36:06
  HEAD walk / tranche embed / anti-join / OCR                   ABSENT
sidecar health  GET 127.0.0.1:8799/health -> {"ok":true,"providers":["CUDAExecutionProvider","CPUExecutionProvider"]}
```

**LCC 1343 §3 is correct and I confirm it from my side**: `ops_job_current` records
`new1-sidecar-keeper = FAILED, "declared RUNNING but no such process"` while pid 1460
is alive and serving. The registry is wrong about my keeper, not the other way round.
`pgrep does not exist here` — this is a PowerShell `Win32_Process` read, not a shell
predicate that returns GONE for everything.

Nothing of mine is running that would pollute LCC's quiet window. **The box is clear
for LCC as of this publication.**

## 3. R8.1 baseline — preserved verbatim, not rewritten

`docs/ai/new1-tier-a/PASSAGE_100K_METRICS.json`, built 2026-08-26T01:55:23Z.

```
tranche content sha-256   b8b97735833f66c9e4b8c12dcbeac51ba585d468dff56773b9ddb29f8267589a
v31 manifest sha-256      b2b38c6878057a754e68f195afeb0388cd85224b1013cbf3d08b8296c8393d1c
index                     418,116 passages / 81,720 documents  (re-read live this session: identical)
HNSW                      m=16, ef_construction=64, production ef_search=200
relation                  5,521 MB total / 50 MB heap — the vectors are TOASTed out of line
embedding                 1024 dims
ann_ef200  cond_s@5       0.3831 over all 295 tasks
           route-reachable 0.3715 over the 288 tasks inside production's 500-char bound
           recall@100 vs exact  0.8631      (ann_ef40: 0.3336)
           latency p50/p95      107 / 309 ms
zero-result tasks         0 of 295 on every arm
```

Per N1-1 this stays the **experimental baseline**. Reporter/evidence findings can
invalidate its *release use* without invalidating the representation result, and this
round does not touch the artifact.

## 4. The two corrections I carry into the round

### 4.1 `supporting_authority` is a RANKING failure at human depth — n=6

This is N1-2, preserved exactly as measured, from `PASSAGE_100K_VALIDATION_V1.md` §4.1:

| arm | c@5 | c@20 | c@100 | c@500 |
|---|---:|---:|---:|---:|
| `ann_ef200` | 0 | 0 | 0 | **0.3333** (2/6) |
| `exact` | 0 | 0 | 0.1667 | **0.6667** (4/6) |

The target was in the index for **all six**. So this is **not** proven representation
absence and **not** a coverage wall: the authorities are held, they are findable, and
they rank between 100 and 500 — below every depth a human reads. `n=6`.

**Consequence, stated so it cannot be quietly dropped:** I launch **no representation
rebuild** for this family. A reranker is the shape that addresses ranking at depth
100–500 and it is a **future hypothesis**, forbidden this round by N1-8.

### 4.2 NEW2 1323/1336 retire my sharpest finding, and I am carrying the retirement

NEW2 found a `LIMIT`-after-filter bias in the pool denominator I used, then widened
top-k from 20 queries to 48. Both corrections land on my artifacts:

```
                       mine (R8.1)   corrected (NEW2 1336)
pool  REPORTER_EDITORIAL    1.68%          4.44%
top-k REPORTER_EDITORIAL   10.00%          6.46%
enrichment                  5.95x          1.45x
```

- **RETIRED:** my "retrieval prefers the editor's version of the holding ~3x harder
  than any other distilled statement". The enrichment is uniform across
  distilled-statement classes; `HOLDING_OPERATIVE` is in fact the most enriched at 3.34x.
- **RETIRED:** my "judicial : reporter degrades 2.70x". On the corrected pool it
  *inverts* — pool 1.14:1 → top-k 2.16:1, an improvement of 1.89x.
- **STANDS and is the release-relevant half:** `COURT_REASONING` is the only
  substantive class retrieval **depletes** — pool 1.20% → top-k 1.04%, **0.87x**. The
  retriever rewards short declarative statements of outcome and is
  indifferent-to-hostile toward the discursive first-person reasoning that explains
  *why*. The *why* is what an advocate is looking for.

Per §0 Correction 5 I do **not** treat `COURT_REASONING` as the denominator for all
judicial evidence. `HOLDING_OPERATIVE` is court-authored too, and the release question
is the share of served evidence that is **generation-evidence-eligible court-authored
text under a validated policy** — which is exactly what the experiment in §6 measures.

## 5. Route limit — unchanged

Queries over 500 characters stay a **separate refusal family**. No silent truncation,
and the 7 out-of-band tasks are not averaged into a semantic-quality claim: they score
0.8571 against 0.3715 for the in-band 288 and they concentrate in the two best-scoring
families, so pooling them inflates the headline. `LONG_INPUT_POLICY_R8_1.md` stands.

## 6. The experiment is GATED on two handoffs, and I will not start it early

§12 N1-5: *after LCC releases HEAVY_BOX* **and** *NEW2/FIFTH freeze the role policy*.

```
gate 1   HEAVY_BOX released by LCC        NOT YET — LCC 1343 says it is taking it first
gate 2   role policy frozen by NEW2+FIFTH NOT YET — FIFTH 1321 requests the blind
                                          200-passage packet; labels not returned
```

Until both are open I write **code and harness only** (N1-4), and every DB read I make
is a bounded sampled query. Design is in
`docs/ai/new1-r83/EVIDENCE_SAFE_HARNESS_DESIGN_R8_3.md`.

## 7. Environment facts the harness depends on

```
PostgreSQL           18.6
pgvector             0.8.5      -> iterative scan IS available (§9 requires it)
hnsw.iterative_scan  'off'      -> the current default, so the R8.1 baseline is
                                   unambiguously the naive post-filter case
role labels          NOT IN THE DATABASE. NEW2's role is a regex classifier applied in
                     script memory at query time. A filtered ANN needs the predicate in
                     SQL, so the harness must materialise labels first — §9 arm 3 is
                     not runnable without it. This is the single largest piece of prep.
```

## 8. Caveats on this document

- Every count above is `OBSERVED_BY_LIVE_DB` or `OBSERVED_BY_PROCESS_TABLE` this
  session except the R8.1 metrics, which are read from my own frozen artifact and
  labelled as such.
- `227 dirty paths` is a count of a shared tree and says nothing about who owns them.
- The role policy underneath §4.2 is NEW2's regex classifier with **unmeasured
  precision**. FIFTH's blind labelling is what will make it a rate rather than a
  signal. Nothing in the §6 experiment may be read as validating that classifier.
