# NEW1 — START_STATE_R8_1

**Published:** 2026-08-25T16:50Z
**Lane:** NEW1 (retrieval, passage embedding/index/eval, ANN-vs-exact, abstention)
**Session:** `a6437eea-0678-4b1d-95ea-e93bfab9bbde`
**Role this round:** NEW1 **and** initial `HEAVY_BOX` owner (R8.1 §3).

Published **before any mutation of retrieval state**, per R8.1 §2. Every number below
is `OBSERVED_BY_LIVE_DB` or `OBSERVED_BY_PROCESS_TABLE` at the timestamp given. Nothing
here is carried from a previous session's report.

---

## 1. Orchestration file digest — and one conflict to record first

| | |
|---|---|
| file | `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` |
| sha256 | **`18e75f184fbbc53644cc531d41fbdbedfa53247d121904319c220558f3dcef2c`** — matches the founder's attached source byte for byte |
| ~~superseded~~ | ~~`ad4c6343178303f443401a34a9b0eb235d37293475bd489985044c705b2263fc`~~ — NEW1's transcription, **wrong**; see the correction below |
| bytes | 34,495 |
| lines | 491 |

**`CONFLICT_REQUIRES_REMEASUREMENT` — read this before comparing digests.**

At session start **no copy of R8.1 existed anywhere on disk.** `find`, a repo-wide
`grep` for `R8_1` / `ORCHESTRATION_LOCK`, and `git log` all returned nothing. The lock
reached this lane as a delivered brief, not as a repository artifact.

NEW1 therefore **materialized the file from the delivered text** so that it survives a
compaction and so the other lanes have something to diff against. Two consequences,
stated rather than buried:

1. **This digest is of NEW1's transcription, not of an orchestrator-published
   original.** If another lane computes a different digest, that is *expected* and is
   not evidence of tampering — it means we each transcribed independently. The
   orchestrator publishing one canonical copy is what closes this.
2. The delivered text arrived carrying **cp1252 transport mojibake** (`Â·`, `â` where
   `·`, `—`, `→`, `≠`, `≤`, `–` belong), and the transcription repaired those.

> ### CORRECTION, 19:50Z — the repair was NOT purely mechanical, and I said it was
>
> I wrote that the repair "touches punctuation only; no clause, number, ownership row
> or prohibition was altered." **That was wrong, and Fifth caught it** (bus 1265).
>
> Line 64 of the founder's source reads:
>
> ```
> LCC maintains OS ↔ registry ↔ scheduler/service ↔ useful-output truth.
> ```
>
> Three **U+2194 bidirectional** arrows. My transcription rendered all three as
> **U+2192 right** arrows, turning a statement of *mutual reconciliation* into a
> *one-way chain* — a real change to an obligation LCC carries, produced by me while
> asserting that no such change had occurred.
>
> The mechanism is worth naming because it will recur: both `→` and `↔` mojibake to a
> visually identical `â` prefix in cp1252, so the two are **indistinguishable in the
> corrupted text**. I could not have read the difference — which means the honest move
> was to mark every arrow `UNRESOLVED`, not to pick the commoner one and call the
> result mechanical. **A repair that cannot fail visibly is a guess with good posture.**
>
> The repo file has since been corrected (not by me) and now matches the founder's
> attached source byte for byte at `18e75f18…`. Fifth's ruling stands: the attached
> bytes govern, and the **bidirectional obligation is the live one**.

**Binding status regardless:** NEW1 treats R8.1 §6 (its own orders), §17 (prohibitions)
and §2/§3 (protocol) as in force from now. The conflict is about *provenance of the
digest*, not about *what NEW1 is required to do*.

Second authority, read in full and on disk already:
`docs/ai/new1-tier-a/R7_FINAL_RUN_RUNBOOK.md` — the ordered post-embed sequence. R8.1 §6
and the runbook agree step for step; where they overlap the runbook is the operational
detail and R8.1 is the authority.

---

## 2. Machine and repository truth

| fact | value | how observed |
|---|---|---|
| HEAD | `9509e78d9a88e6e993d8c1e7631e341f392b36da` | `git rev-parse HEAD` |
| dirty paths | 145 (8 modified, 137 untracked) | `git status --porcelain` |
| — of those, NEW1-owned | `docs/ai/new1-tier-a/stage-embed-summary.json`, `.agents/logs/new1-sidecar-keeper.8799.lock` | path inspection |
| DB | PostgreSQL **18.6** on x86_64-windows, database `lawmind` @ 127.0.0.1:5432 | `select version()` |
| `max_parallel_workers_per_gather` | **4** | `current_setting` |
| migration high-water | **0086_quality_screen_runs**, journal has **87 entries** (idx 0–86) | `packages/db/drizzle/meta/_journal.json` |
| bus high-water | **seq 1234** (1,238 message files) | `.agents/bus/` |
| disk free (C:) | 282.6 GB free / 647.9 GB used | `Get-PSDrive` |
| GPU | RTX 4060 Ti, 21% util, 5,342 / 8,188 MiB | `nvidia-smi` |

The 145 dirty paths are overwhelmingly **other lanes' bus messages and checkpoints**.
NEW1 stages by exact path only and will not touch them (R8.1 §4: never `git add -A`).

---

## 3. Leases

| lease | holder | state | note |
|---|---|---|---|
| **HEAVY_BOX** | **NEW1** | **HELD** | created this session — the lease did not exist; R8.1 §3 names NEW1 the initial owner |
| NEW1 (lane) | NEW1 (this session) | **HELD** | taken over by `--force`; prior owner `c2792141` DEAD, heartbeat 798 min stale, no PID recorded |
| LCC (lane) | `0f864777` | DEAD | pid 28584 absent from process table, 354 min stale |
| NEW2 (lane) | `c28e64c1` | RELEASED | released 2026-08-25T15:07:48Z |
| RCC (lane) | `01a036ea` | HUNG | pid 11568 `codex.exe` alive, heartbeat 350 min stale; RCC is parked under R8.1 §1 anyway |
| DB_MIGRATION | LCC | HELD | LCC owns migration numbering. NEW1 allocates **no** ordinals (R8.1 §4). |
| CLIENT_APPS | RCC | RELEASED | — |

**Why the dead NEW1 lease did not mean a dead job.** The previous NEW1 session is gone,
but the heavy job it launched is **still running and still producing rows** — it was
launched detached, so it outlived its session. This is the R8.1 §3 rule working as
intended: *useful output is the signal, PID and session are not.* The job was
**adopted, not restarted**. Restarting it would have thrown away five hours of GPU.

---

## 4. HEAVY_BOX job registry — `new1-tranche-embed`

Registered this session via `scripts/job-register.mjs claim`. **It had never been
registered**, which is a G0 "unmanaged critical worker" defect; recording it here as
closed by me rather than reporting it as someone else's finding.

| field | value |
|---|---|
| job_id | `new1-tranche-embed` |
| owner | NEW1 |
| purpose | bounded 100k-document tranche passage embedding (R8.1 §6.1) |
| launcher | `services/harness/src/tranche-embed-launch.sh` (bash, PIDs 22820 / 23372) |
| worker | `node … tsx src/tranche-embed-cli.ts` — **PID 9820**, born `2026-08-25T15:36:01+04:00` = **11:36:01Z** |
| GPU sidecar | `python services/embed/gpu/server.py --port 8799` — PID 4116, born 08:56:09Z |
| input version | `TRANCHE_100K_MANIFEST.json`, natural-selection digest `4b0674267dab46760549570bd0e5b7b5026236a9f5c4b05553d05ab77ff075cb` |
| durable output metric | `select count(*), count(distinct judgment_id) from new1_tranche_passages` |
| log | `docs/ai/new1-tier-a/tranche-embed.log` |
| contention class | GPU_SIDECAR + DB_WRITE |
| pause/resume | resumable from its own document cursor; the log's `docs n/81720` is the offset |

### Progress, measured twice as §3 requires

| at (UTC) | passages | documents | source |
|---|---|---|---|
| 16:39 | 139,199 | 45,600 | live DB |
| 16:48 | **141,065** | **46,200** | live DB |

Delta over the window: **+1,866 passages, +600 documents.** Log-derived instantaneous
rate `2.26 docs/s` (800 docs in 354 s); run average `2.50 docs/s`; `4,337 tok/s`.

> ### CORRECTION, 17:05Z — the state above was already false when this file was written
>
> **The job died at 16:44:02Z**, eleven minutes before I published `RUNNING_PROGRESSING`.
> Both DB reads were real and both rose, but **the 16:48 read was reading a corpse**: it
> returned exactly the counts of the 16:44:02 log line, so all the growth I measured had
> already happened before the death. A rising count and a *still rising* count are not
> the same fact, and a job that dies between two reads produces a delta indistinguishable
> from progress. **The check I skipped costs one line: the log's own timestamp was four
> minutes stale when I quoted its row count as current.** Freshness of the measurement is
> part of the measurement.
>
> **Root cause, quoted rather than inferred** — `tranche-embed-runner.log`, immediately
> after the last progress line:
>
> ```
> node:internal/modules/run_main:107
>     triggerUncaughtException(
> [DOMException [TimeoutError]: The operation was aborted due to timeout]
> ```
>
> `AbortSignal.timeout()` in `getRemoteEmbedder` (`EMBED_TIMEOUT_MS`, 300s default)
> rejecting uncaught. The bound is not the bug — its own comment is right that an
> unbounded fetch is how a long run dies silently. The bug is that a **surfaced** stall
> was fatal, and that nothing restarted it: the only keeper on this box watches the
> sidecar, not the embedder. What stalled the sidecar is `UNKNOWN` and stays open as
> `SIDECAR_STALL_CAUSE` — PID 4116 never died and answers a probe in milliseconds.
>
> **Fixed** in `services/embed/src/tranche-embed-cli.ts`: bounded retry at the call site,
> 4 attempts, 5s/15s/45s backoff, every attempt in the durable log, then it stops.
> `getRemoteEmbedder` itself is **not** touched — it is shared with the document walk and
> incremental chunking, and changing its failure semantics would alter another lane's job
> without asking.
>
> **Restarted 17:02:00Z, zero work lost** — resumed at 46,200 embedded, 35,520 remaining.
> The per-batch commit did what its comment promised. New worker **PID 21552**,
> `restart_count 1`, dead instance retired in the registry rather than left claiming
> RUNNING. **ETA moves to ≈ 21:20Z.**
>
> A watchdog is armed on the log's own `docs n/81720` offset: two consecutive 3-minute
> windows without movement, any timeout/exhausted/recovered line, or completion, all
> raise an event. **Silence is now an event instead of a gap.**

**State at 16:48Z: `RUNNING_PROGRESSING` — WRONG, see the correction above.**
**State from 17:02Z: `RUNNING_PROGRESSING`, re-verified against a log line newer than the
row count it explains.**

**Projection:** 35,520 documents remain → **≈ 4.4 h**, ETA **≈ 21:05Z**. At the observed
3.053 chunks/document the table lands at **≈ 249,500 passages over 81,720 documents**,
which matches the runbook's `~250,000` expectation. Total run ≈ 9.5 h against the
runbook's "~8-hour" estimate — the estimate was low, not the job slow.

**Contention:** `pg_stat_activity` shows exactly one non-idle backend on `lawmind`, and
it is this job's own `SELECT id::text, full_text FROM judgments WHERE id::text = ANY($1)`.
No other lane is on the box. NEW2 confirmed the same in bus 1233 and released.

---

## 5. What is NOT running, deliberately

- **The HEAD walk stays paused.** `.agents/logs/new1-walk.pause` is in place and NEW1's
  R8.1 order says explicitly *"Do not resume the old HEAD walk."* It is not resumed and
  it is not deleted. Its disposition (resume / coarse-only / superseded / abandoned) is
  a **finding of `HEAD_VS_PASSAGE_DECISION_V2`**, not a thing to decide by reflex now.
  The pause file records why it cost nothing: batches 00131–00141 each inserted 0 rows,
  and stage rows sat at 2,026,872 for 65 minutes — `RUNNING_REPLAYING`, not progressing.
- **`chunk.ts` is frozen.** R8.1 §6.8 and the runbook both forbid touching it mid-tranche;
  it is the segmentation identity of both `judgment_chunks` and this build. The 46%
  in-window span-loss defect NEW1 reported in bus 1224 stays open and unfixed until the
  tranche closes and a segmentation version bump is deliberate.
- **No full-corpus passage build, no new vector DB, no model bakeoff, no HyDE, no graph
  ranking, no reranker program, no input-length sweep.** R8.1 §6 (forbidden list) and §17.

---

## 6. Inherited state that constrains what the eval may claim

Carried in from the current artifacts and from other lanes' bus traffic. These are not
new NEW1 findings; they are the caveats the R8.1 deliverables must respect.

1. **`PASSAGE_INDEX_BUILD.json` is stale and must be rebuilt, not appended.** It records
   a build over **64,960 passages / 21,400 documents** — a 26% prefix. Build 62.5 s,
   index 531,357,696 B, heap 371,105,792 B, WAL 262,790,936 B, `m=16 efConstruction=64
   maintenance_work_mem=1GB`. A build time from a partial table is not the number the
   full-corpus decision turns on.
2. **`ef_search` is 40 in the probe harness and 200 in production.** Measured
   recall@100 vs exact: **0.889 at ef=200, 0.295 at ef=40** — a 71% loss. Every ANN
   number must name its arm. LCC accepted this and is not changing `retrieve.ts`.
3. **210 of 213 gold targets are forced.** The draw is gold-blind over 8.85M documents,
   so a forced target is an END_TO_END **miss** by construction. END_TO_END on this
   tranche is a near-floor number; CONDITIONAL is the informative one. **Both, always,
   never one alone** (R8.1 §6.3).
3b. **No prefix of this build is a uniform sample** — Fifth, bus 1255, accepted in full.
   The CLI embeds `ids = [...forced, ...natural]`, so every partial state is
   **forced-complete plus a uniform natural prefix**. Fifth verified it at 46,200
   embedded: 45,990 natural + all 210 forced, zero rows outside the manifest, zero
   duplicate `(judgment_id, chunk_index)`. The consequence is specific and it lands on
   an artifact I already hold: **`ABSTENTION_CANDIDATE.json` was measured on a ~22k
   prefix and is therefore biased toward Gold-target availability.** It is not
   representative of the tranche and will not be quoted as if it were. The forced-first
   build order gets disclosed wherever a partial number appears.
4. **Fifth's selector verdict is `VALID_SELECTION_CANDIDATE / PROOF_INCOMPLETE`** (bus
   1202), with two open proof defects that are NEW1's to close — see §7.
5. **Reporter contamination of 0.10% does not transfer to this tranche.** NEW2's
   `PASSAGE_SAFETY_ROLE_CONTRACT_V1` measured it on the *vector stage*, where the
   Supreme Court is 0.49% of rows. The SC corpus is **92.77% SCR reporter edition**
   (35,570 of 38,342) with **40.92% carrying headnote prose**, and the SC holds 43.9% of
   all resolved citations. Any passage-safety number for this tranche must be
   re-measured on this tranche, SC separately from HC.
6. **Whole-document eligibility does not catch damaged passages** — 90 of 13,944 (0.65%)
   damaged spans sat inside documents the body screen calls safe.
7. **`PARTY_SUBMISSION` is the most common identified neighbour of `COURT_REASONING`**
   (45 vs 32). Topical similarity has no signal separating *"the petitioner argued X"*
   from *"we hold X"*. This is a retrieval-quality risk, not a data-cleanliness one.
8. **The abstention grid edge is a signal finding, not a tuning problem.** On the partial
   index `topSim` p05 was 0.6219 and every query scored 0.62–0.77, so an absolute
   similarity threshold could not discriminate and the rule collapsed to gap-only. If it
   repeats at full scale, **the grid is not widened again** — the honest report is that
   this feature set cannot calibrate abstention.
9. **14 of 48 common queries refuse, and the composition is the finding**: all four
   bail, three of four anticipatory bail, three of four quashing-FIR, two of four
   limitation, two of four writ maintainability. Driver is `min(df)`, **not** query
   length — 1–2 terms 46% refused, 3–5 terms 20%, 6+ terms 27%, not monotone. LCC shipped
   `rarestDf` as the measured cause at all five return sites (commit `a0873d7`).
   The refusal numbers are production's rule on production's table and **will not move**
   when the index grows; the coverage numbers will.

---

## 7. NEW1's ordered queue for R8.1

Gated on the embed finishing. Steps 1–6 are the runbook sequence; each one's output
gates the next.

**While the embed runs (light only, no DB scans, no GPU contention):**

- **N1-a — close Fifth's two selector proof defects** (bus 1202). Both are code, neither
  touches the running tranche:
  (i) the live-cell invariant is *observed* rather than *enforced* — the query returns
  live `court`/`judgment_date` but only `survivors.has(id)` is tested, so a mismatch
  would be silently accepted on the next frame. Enforce it, count it, publish
  `LIVE_CELL_METADATA_MISMATCH`.
  (ii) `contentSha256` hashes `revalidation.elapsedSeconds`, so a correct second run
  fails for taking 139.8 s instead of 140.2 s. Digest the invariants, publish timing
  outside the digest.
- **N1-b — long-input policy** drafted against `≤500 / 500–1000 / ~2500 / ~5000` char
  bands, explicit outcome for unsupported input, **no silent truncation** (R8.1 §6.6).

**On `TRANCHE EMBED DONE` — verified by row count, never by the process being gone:**

1. Rebuild HNSW on the **complete** table; publish params, rows, build time, index/heap
   bytes, WAL/temp delta, backend RSS.
2. Refresh the HEAD baseline **only if** the table was dropped.
3. Full 295-task four-arm eval, checkpoint cleared. **Per-family table above any
   aggregate; no aggregate may hide a zero family.** `adverse_authority` and `statute`
   read 0.25 / 0.33 on the partial index against a lifetime of zeros — if that holds at
   full scale it is the round's headline, and if it does not, that is the finding.
4. Abstention on **development only**; check `thresholdOnGridEdge`; at most **one**
   bounded composite risk candidate; then freeze.
5. Common-query arms against the full index; update or remove the 27%-prefix caveat in
   `COMMON_QUERY_SEARCH_CONTRACT_V1.md` §7 — **do not leave it stale**.
6. Publish `PASSAGE_100K_VALIDATION_V1`, `HEAD_VS_PASSAGE_DECISION_V2`,
   `RETRIEVAL_CANDIDATE_R8_1`, `ABSTENTION_POLICY_R8_1`, and the process/resource report.
7. Design (not run) the bounded **segmentation-V2** pinpoint/source-offset experiment.
8. Update `docs/CURRENT_PLAN.md`; **explicitly RELEASE `HEAVY_BOX`**; notify LCC / NEW2 /
   FIFTH.

`HEAD_VS_PASSAGE_DECISION_V2` **recommends; it does not decide.** Full scale needs NEW1
evidence *and* Fifth approval *and* founder approval if compute or storage expands
materially.

---

## 8. Completion states declared now

| item | state |
|---|---|
| R8.1 digest provenance | `CONFLICT_REQUIRES_REMEASUREMENT` — no canonical on-disk copy existed |
| tranche embedding | **`PROVEN` — COMPLETE 2026-08-26T01:39:27Z. 418,116 passages over 81,720 documents (5.12 chunks/doc), confirmed by row count, not by the process being gone.** Two deaths and two restarts (uncaught timeout 16:44Z; machine reboot 23:05Z), zero rows lost |
| tranche embed supervision, relaunch path | **`PROVEN` 2026-08-26T01:36:34Z** — `TRANCHE EMBED SILENT for 151 min — relaunch #1`, resumed at the correct offset and wrote rows. No longer `NOT_MEASURED` |
| HNSW index on complete tranche | `NOT_MEASURED` — current artifact is a 26% prefix |
| 295-task four-arm eval | `NOT_MEASURED` — awaiting the complete index |
| abstention policy | `NOT_MEASURED` — grid-edge signal failure recorded on the partial index |
| selector proof | `PARTIAL` — both of Fifth's 1202 defects now fixed in code; the completed second-run `--verify` result is still owed and runs after the tranche closes |
| live-cell invariant | `PROVEN` at measured scope — 0 of 81,510 court-cell, 0 era-cell, 0 null date, 0 null court, recomputed offline from the frozen manifest; now **enforced by rejection** rather than observed |
| `SIDECAR_STALL_CAUSE` | `UNKNOWN` — but the *sequence* is now `PROVEN` from the keeper's own log; see §4b. The sidecar wedged, self-recovered after ~5.5 min, and was never replaced |
| tranche embed supervision | `PROVEN` at code level — the keeper now watches `tranche-embed.log` by silence; the relaunch path itself is **not yet exercised** and stays `NOT_MEASURED` until it fires |
| common-query coverage | `PASS_AT_MEASURED_SCOPE` — 27% prefix, caveat live |
| common-query refusal | `PROVEN` — production rule on production table, scope-independent |
| HEAD walk | `PAUSED` by order; disposition deferred to `HEAD_VS_PASSAGE_DECISION_V2` |

---

## 9. Standing note for the other lanes

A corpus-wide sequential aggregate is **not** a light job on this box.
`max_parallel_workers_per_gather` is **4**, so a job described as "one pass at a time"
arrives as five workers saturating `DataFileRead` — that cost this lane 14 minutes and
3.9× on a G3-gating artifact earlier today. When requesting a window, say the number, or
set it to 1 for the session. NEW2 has already accepted this and changed its practice
(bus 1233); it is recorded here so a fresh agent does not rediscover it.
