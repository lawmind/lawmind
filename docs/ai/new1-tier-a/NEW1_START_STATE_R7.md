# NEW1 — START_STATE (R7 §2)

**Published:** 2026-08-25T11:00Z · **Lane:** NEW1 (retrieval / passage / abstention)
**Session:** `5343b8ef-1d20-4672-9f59-2f3f138c6772`

---

## Anchors

| field | value |
| --- | --- |
| `orchestrationSha256` | `6e868d643d27a6b4f778c0f4e5ec023a94c7d7f85301ad9211d337e3fb046f7d` |
| `orchestrationFile` | `LAWMIND_FINAL_DATA_INTELLIGENCE_BACKEND_MASTER_PLAN_R7_2026-08-25.md` |
| `gitHead` | `0762d2818ff45ce399d469b867686b80114fa1d7` (`docs(new1): board records the tranche selection as BLOCKED`) |
| `latestBusSequenceRead` | **1176** (FIFTH → NEW1, selector-architecture verdict) |
| `dbTarget` | local `lawmind` @ `127.0.0.1:5432` · PostgreSQL **18.6** · pgvector **0.8.5** |
| `dirtyPathCount` | 100 entries in `git status --short` (24 modified, 76 untracked) |

### Leases observed

| domain | holder | heartbeat | verdict |
| --- | --- | --- | --- |
| `LCC` | LCC, pid 3848 `claude.exe` | 09:40Z | HELD, plausible |
| `NEW1` | session `c2792141…`, **pid null** | 03:28Z | HELD by a session that is not this one; **taken over by this session** |
| `NEW2` | pid 26580 `claude.exe` | 03:15Z | HELD, heartbeat 7h stale |
| `RCC` / `CLIENT_APPS` | pid 28488 `codex.exe` | 03:56Z | HELD, heartbeat 7h stale |

Lease state is not accepted as process truth; the process table below is.

### Dirty paths NEW1 owns

`services/harness/src/tranche-select-cli.mjs` · `services/embed/src/index.ts` ·
`docs/ai/new1-tier-a/stage-embed-summary.json` · `.agents/logs/new1-sidecar-keeper.8799.lock`.

Everything else dirty belongs to LCC (`apps/admin`, ops/lease), RCC (`apps/mobile`),
or NEW2 (`services/ingest/.checkpoints/*`). **NEW1 will not stage any of them.**

---

## Live processes relevant to this lane

| job | pid | created | state | evidence |
| --- | --- | --- | --- | --- |
| GPU sidecar `services/embed/gpu/server.py --port 8799` | 4116 | 08:56Z | `RUNNING_PROGRESSING` (idle-ready) | `/health` → `{"ok":true,"providers":["CUDAExecutionProvider",…]}`; RTX 4060 Ti, 4,580/8,188 MiB resident, 20% util |
| sidecar keeper `sidecar-keeper.mjs` | 18856 | 08:55Z | `RUNNING_PROGRESSING` | task log advancing; holds `new1-sidecar-keeper.8799.lock` |
| HEAD walk (`stage-runner.sh` → `doc-vector-embed.mjs`) | 29288 + 8 children | 09:47Z | **`RUNNING_REPLAYING` → now `PAUSED`** | see below |
| orphan `cmd /K enrich-worker paragraphs` | 20124 | 08:45Z | live, **unowned** | dead parent, no scheduled task, no registry row |

### CORRECTION_OF = my own bus 1175

- **Old claim:** "two orphaned `cmd /K` loops (`citations` 7308, `paragraphs` 8776)".
- **New fact:** at 10:52Z **one** remains — `paragraphs`, pid **20124** (not 8776).
  The `citations` loop is gone.
- **Evidence:** `OBSERVED_BY_EXECUTION`, full `Get-CimInstance Win32_Process` sweep;
  pids re-read rather than recalled.
- **Downstream:** any latency caveat of mine that says "two loops" should read "one".

---

## The HEAD walk: paused, and it was producing nothing

`OBSERVED_BY_LIVE_DB` + `OBSERVED_BY_EXECUTION`.

```
new1_doc_vector_stage rows @ 05:03:57Z   2,026,872
new1_doc_vector_stage rows @ 10:52:18Z   2,026,872      outputDelta = 0
```

The keeper relaunched the walk at 09:47Z after 277 minutes of silence, and it ran for
65 minutes. Every batch in that window had the same shape:

```
tier-a-batch-00131 … 00141
  inserted: 0   tokens: 0   tokensPerSecond: 0
  skippedAlreadyStaged: ~8,800 of ~9,990
  tableRows: 2026872   (unchanged, every batch)
```

**This is exactly the failure mode R7 §4 names.** `processAlive` true, `heartbeatFresh`
true, GPU resident, `checkpointAdvancing` true (worklist 117 → 120 of 864), and
`outputDelta` **zero**. Reported as `RUNNING_REPLAYING`, never as progress.

**Root cause — `OBSERVED_BY_CODE` + `OBSERVED_BY_EXECUTION`:**
`stage-runner.sh` walks the worklist in `docs/ai/new1-tier-a/stage-coverage.json`. Its
own comment says *"Re-read per run, never cached: the census is re-run between runs and
a stale worklist would re-walk batches that have since been filled."* The worklist file
**is** re-read per run — but the census that **writes** it was last run
**2026-08-20T23:19:43Z, five days ago**. It records `tier-a-batch-00131` as
`staged 13 / 9990`; the live stage now holds 8,811 of that same batch. The runner is
faithfully replaying ~119 batches completed between 20 and 25 Aug. The safeguard was
placed one step too far downstream: re-reading a file nobody regenerates is not freshness.

The walk is now **PAUSED** via `.agents/logs/new1-walk.pause`, which records the exact
HEAD state and makes `stage-coverage-census.mjs` a **required step 1** of any resume.
Nine processes were stopped; `pg_stat_activity` then showed **zero** rows for this
database — no orphaned backends left behind. (A killed client does not kill its
statement; that has bitten this lane before.)

Nothing was discarded: staged rows, the refusal quarantine, the batch manifests and the
contract hash `5b5d02384b46c96c` are all intact.

---

## FACTS_OBSERVED

| # | fact | label |
| --- | --- | --- |
| F1 | `new1_doc_vector_stage` = **2,026,872** rows, all with a non-null embedding | `OBSERVED_BY_LIVE_DB` |
| F2 | `new1_doc_vector_stage_refused` = **72,092** rows | `OBSERVED_BY_LIVE_DB` |
| F3 | Accounted = 2,098,964 of Tier A **9,700,157** → **21.6%** of Tier A has a HEAD vector or an explicit refusal | `DERIVED` from F1/F2 |
| F4 | Walk output delta over 65 live minutes = **0 rows** | `OBSERVED_BY_LIVE_DB` |
| F5 | `stage-coverage.json` `measuredAt` **2026-08-20T23:19:43Z** — 5 days stale; worklist 864 files | `OBSERVED_BY_CODE` |
| F6 | **886** `tier-a-batch-*.jsonl` + **2** `tier-a-value-batch-*.jsonl` exist locally, each row carrying `judgmentId, contentHash, memberCount, court, year, textLength, valueBand, scriptQuality, documentClass` | `OBSERVED_BY_CODE` |
| F7 | `manifest-tier-a.json` says `batches: 886`, `rowsEmitted: 8,846,550`, `complete: true`, `definitionHash e76879ab6bbcd452` — but `manifestHash` is `e3b0c442…b855`, the SHA-256 of the **empty string**, and `batchHashes` is `[]`. The manifest **cannot certify its own contents.** | `OBSERVED_BY_CODE` |
| F8 | Deployed `judgment_embedding_eligibility` viewdef md5 `8ab73956077134649e5d9466f552d27c`, 3,298 chars | `OBSERVED_BY_LIVE_DB` |
| F9 | `drizzle.__drizzle_migrations` holds **58** rows against **87** `.sql` files on disk | `OBSERVED_BY_LIVE_DB` |
| F10 | Selector attempts #1–#3 all failed: 88 s for one cell; `sql(arrayOfArrays)` TypeError before send; 40 min timeout on the single-pass `row_number()` version | `OBSERVED_BY_EXECUTION` (bus 1175, commit `baf741c`) |
| F11 | Short common queries return **0 results / `sparse_unbounded`**: `bail`, `anticipatory bail`, `bail anticipatory`. A four-term variant returns 5. | `OBSERVED_BY_EXECUTION` (LCC bus 1173) |
| F12 | GPU sidecar answers `/health` with `CUDAExecutionProvider`; 4,580 MiB resident is the model, **not** work | `OBSERVED_BY_EXECUTION` |

### Standing NEW1 results carried into this sprint

| result | value | label |
| --- | --- | --- |
| V3 end-to-end vs conditional | **24.4%** end-to-end, 37.8% conditional — 38% of posed targets are not in the index at all | `OBSERVED_BY_EXECUTION`, corrected in bus 1162/1163 |
| `adverse_authority` | **0** for every representation arm tested | `OBSERVED_BY_EXECUTION` |
| `statute` | **0** for every representation arm tested | `OBSERVED_BY_EXECUTION` |
| gold with no production vector | 12 of 213 (5.6%); 8 of 20 POSED concept targets (40%) | `OBSERVED_BY_EXECUTION` |
| chunks per document | 3.39 measured → 100k docs ≈ 339,000 passages | `DERIVED` from the V3 run |
| contention penalty | 8,412 → 494 tok/s, **17×**, when the walk shares the box | `OBSERVED_BY_EXECUTION` |

---

## FACTS_UNVERIFIED

- `NOT_MEASURED` — exact unique/duplicate `judgmentId` count across the 888 local frame files.
- `NOT_MEASURED` — whether every frame file was produced under one eligibility definition. `definitionHash e76879ab6bbcd452` is *claimed*, not proven per file (F7).
- `NOT_MEASURED` — current-view survival rate of a candidate reserve drawn from that frame.
- `NOT_MEASURED` — real passage HNSW build time, peak RAM, index bytes at 100k-document scale.
- `NOT_MEASURED` — ANN-vs-exact recall loss at production `ef_search`. (`ef_search=40` is the probes' setting; production runs 200 — the probe number must not be quoted as production.)
- `HYPOTHESIS` — that passage segmentation moves `adverse_authority` and `statute` off zero. **This is the sprint's falsifiable question.**
- `NOT_MEASURED` — how much of F11's zero-result behaviour is refusal rather than ranking miss, per query family.

---

## DEPENDENCIES

| on | what | state |
| --- | --- | --- |
| FIFTH | selector-architecture verdict before attempt #4 | **RECEIVED** (bus 1176). ACK is my next action. |
| FIFTH | hidden holdout ownership; NEW1 tunes on train/dev only | active |
| NEW2 | passage safety/role contract (G2) — supplies `passageRole` and body-quality for `RETRIEVAL_EVIDENCE_CONTRACT_V1` | outstanding; the contract ships with the field defined and its source named |
| NEW2 | `0086` body-text-evidence view (`PROVEN_DAMAGED` / `SCREENED_NO_DAMAGE_FOUND` / `NEVER_SCREENED`) | announced bus 1148/1149; does not change which documents the embed queue refuses |
| LCC | consumes `RETRIEVAL_OUTCOME_CONTRACT_V1`; owns the `coverage_unknown` / `degraded` server response for F11 | in flight |
| LCC | box quiet for the passage build + HNSW | will be requested as a `HEAVY_WINDOW` on the bus |

---

## FILES_YOU_OWN

Written this sprint:

- `docs/ai/new1-tier-a/NEW1_START_STATE_R7.md` (this file)
- `docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json`
- `docs/ai/new1-tier-a/PASSAGE_100K_VALIDATION_V1.md` + raw ANN/exact metrics JSON
- `docs/ai/new1-tier-a/ABSTENTION_HIDDEN_HOLDOUT_CANDIDATE.md`
- `docs/ai/new1-tier-a/COMMON_QUERY_SEARCH_CONTRACT_V1.md`
- `docs/ai/new1-tier-a/RETRIEVAL_EVIDENCE_CONTRACT_V1.md`
- `docs/ai/new1-tier-a/HEAD_VS_PASSAGE_DECISION_V2.md`
- `docs/ai/new1-tier-a/NEW1_GPU_PROCESS_TRUTH_R7.md`
- NEW1 harness CLIs under `services/harness/src/`; `services/embed/src/index.ts`
- `.agents/logs/new1-*`, `.agents/jobs/new1-*`

**Not mine, will not be staged:** `apps/**`, `services/api/**`, `services/ingest/**`,
`drizzle/**`, any migration ordinal, `docs/ai/lcc/**`, NEW2 doc paths.

---

## HEAVY_JOBS_YOU_WILL_TOUCH

| job | class | state |
| --- | --- | --- |
| HEAD Tier-A walk | `GPU_HEAVY` + `DB_WRITE` | **PAUSED** by this session, losslessly |
| tranche selector #4 | `IO_HEAVY` local + bounded `DB_SCAN` on PK batches | after ACK of bus 1176 |
| 100k passage embed | `GPU_HEAVY` | needs a `REQUEST_HEAVY_WINDOW` grant |
| passage HNSW build | `INDEX_BUILD` + `DB_WRITE` | same window |
| ANN-vs-exact sweep | `DB_SCAN`, bounded | same window |

None of these will run concurrently with an LCC release restore or a NEW2 full-corpus
classifier pass. Every one of them will be reported by **durable output delta** — rows
or index bytes that exist afterwards and did not exist before — never by PID, GPU
utilization, HTTP 200, or checkpoint motion.

---

## What NEW1 will NOT do this sprint (R7 §16)

Full passage build · reranker/model bake-off · legal embedding fine-tuning · HyDE ·
graph ranking · ColBERT · a new vector DB · Elasticsearch/ParadeDB · a repeat of the
input-length sweep over an index that lacks the target · any UI work.
