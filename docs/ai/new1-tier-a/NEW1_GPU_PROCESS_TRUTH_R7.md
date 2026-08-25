# NEW1 — GPU / PROCESS TRUTH (R7 §4)

**Owner:** NEW1 · **Date:** 25 Aug 2026 · **HEAD:** `0762d281`
**Mandate:** R7 §4 — *"A GPU at 100% is not proof of useful embedding output. A PID is not proof of progress."*

---

## 0. The rule, and the one number that enforces it

Every NEW1 job below is reported by **durable output delta**: rows that exist
afterwards and did not exist before. Not PID. Not GPU utilization. Not checkpoint
motion. Not an exit code.

This is not a stylistic preference. It is the only thing that would have caught what
happened on this box this morning.

---

## 1. The incident: 65 minutes, 96% GPU, zero rows

| signal | reading | verdict |
| --- | --- | --- |
| `processAlive` | true, 9 processes | ✅ healthy-looking |
| `heartbeatFresh` | true, log growing every ~20s | ✅ healthy-looking |
| GPU | model resident, batches running | ✅ healthy-looking |
| `checkpointAdvancing` | worklist 117 → 120 of 864 | ✅ healthy-looking |
| **`outputDelta`** | **0 rows in 65 minutes** | ❌ **the truth** |

```
new1_doc_vector_stage @ 05:03:57Z   2,026,872
new1_doc_vector_stage @ 10:52:18Z   2,026,872
```

Every batch in the window reported the same shape:

```
tier-a-batch-00131 … 00141
  inserted: 0   tokens: 0   tokensPerSecond: 0
  skippedAlreadyStaged: ~8,800 of ~9,990
  tableRows: 2026872   (identical, every batch)
```

Correct R7 state: **`RUNNING_REPLAYING`**. Four of five health signals said
`RUNNING_PROGRESSING`.

### Root cause — a freshness guarantee placed one layer too low

`stage-runner.sh` reads its worklist from `stage-coverage.json`, and its own comment
says the file is *"re-read per run, never cached: the census is re-run between runs and
a stale worklist would re-walk batches that have since been filled."*

That is true, and it did not help. The file **is** re-read faithfully every run. But
the census that **writes** it was last run **2026-08-20T23:19:43Z — five days earlier.**
It still records `tier-a-batch-00131` as `staged 13 / 9990`; the live stage held 8,811
of that batch. So the runner was correctly replaying ~119 batches completed between
20 and 25 August.

**The generalisable lesson, and it is not about this script:** re-reading a file that
nobody regenerates is not freshness. The guard was on the *consumer* of the derived
artifact instead of on its *staleness*. It fails in the most expensive possible way —
it looks perfectly healthy while doing nothing, indefinitely.

### The fix, in the place it cannot be forgotten

The pause file `.agents/logs/new1-walk.pause` makes re-running
`stage-coverage-census.mjs` a **required step 1** of any resume, with the reason
written beside it. A resume that skips it replays finished batches and produces no
rows — which is exactly what happened, so the instruction is evidence-backed rather
than cautionary.

---

## 2. Process identity register (R7 §4)

| field | GPU sidecar | sidecar keeper | HEAD walk | tranche embed |
| --- | --- | --- | --- | --- |
| job type | embedding server | supervisor | Tier-A HEAD vectors | 100k passage build |
| command | `services/embed/gpu/server.py --port 8799` | `services/harness/src/sidecar-keeper.mjs` | `stage-runner.sh` → `doc-vector-embed.mjs` | `tranche-embed-cli.ts` |
| PID / created | 4116 · 08:56Z | 18856 · 08:55Z | 29288 · 09:47Z | relaunched 11:36Z |
| startup mechanism | keeper spawn | `cmd /c` from `.agents/jobs/new1-sidecar-keeper.cmd` | keeper relaunch on silence | `Start-Process`, detached |
| progress metric | requests served | poll + relaunch decisions | rows in `new1_doc_vector_stage` | rows in `new1_tranche_passages` |
| restart policy | keeper, 2 health misses | none (top of NEW1 tree) | relaunch after 20 min log silence | manual; resumable by `judgment_id` |
| **state** | `RUNNING_PROGRESSING` | `RUNNING_PROGRESSING` | **`PAUSED`** (deliberate, R7 §9) | `RUNNING_PROGRESSING` |

### Startup dependency — the honest answer

**None of the NEW1 jobs survive a reboot unattended.**

- The keeper starts from a Windows Task Scheduler entry that runs
  `.agents/jobs/new1-sidecar-keeper.cmd`, and the walk starts only from the keeper.
- The tranche embed was launched with `Start-Process` from an interactive session and
  has **no** scheduled entry at all.

So: `nohup … &` does not survive the session on this box (the walk and its keeper were
both killed with their parent shell once, and neither wrote "I was killed"), and
`Start-Process` survives the *session* but not a *reboot*. R7 §4 asks whether
unattended recovery is real. For NEW1 it is not, and this file says so rather than
letting a passing health check imply otherwise.

---

## 3. Two failure modes this box produces that health checks cannot see

**Two sidecars can share one port, silently.** `http.server.HTTPServer` sets
`allow_reuse_address = 1`, and on Windows `SO_REUSEADDR` permits binding a port that is
**actively listening** — not merely one in `TIME_WAIT`, as on Unix. Observed on this
box with three sidecars alive at once, connections split between them by the OS, and
nothing anywhere reporting a fault. The keeper cannot detect a failure the operating
system refuses to report. `server.py` now binds with `SO_EXCLUSIVEADDRUSE`, so a second
sidecar dies loudly instead of quietly sharing.

**A killed client does not kill its statement.** Stopping a worker leaves its statement
running and holding locks, and a restart adds another. Every process kill in this
sprint was followed by a `pg_stat_activity` check; after pausing the walk that check
returned **zero rows** for this database, which is the evidence that the pause was
clean — not the absence of the processes.

---

## 4. Contention is measured, not assumed

The tranche embed's throughput fell from **7,080 → 4,476 tok/s** over the run. The
cause is on the box and is not mine:

```
pid 14540  active  WITH g AS (SELECT content_hash, count(*) … FROM judgments …   -- NEW2, identity/dedup
pid 16404  active  WITH page AS (SELECT id, created_at, neutral_citation …       -- LCC, citation keys
```

Both are legitimate other-lane work and I have not touched them. The consequence is
that **no throughput number in this sprint is a clean-box number**, and none is quoted
as one. The 17× degradation NEW1 measured earlier under contention is the reason the
quiet-window protocol exists; this is a milder instance of the same effect.

One orphan remains: `cmd /K enrich-worker paragraphs`, **pid 20124**, dead parent, no
scheduled task, no registry record.

### CORRECTION_OF my own bus 1175

- **Old claim:** two orphaned `cmd /K` loops — `citations` 7308 and `paragraphs` 8776.
- **New fact:** at 10:52Z there is **one**, `paragraphs`, pid **20124**. The
  `citations` loop is gone and one of my PIDs was wrong.
- **Evidence:** full `Get-CimInstance Win32_Process` sweep, re-read rather than recalled.
- **Downstream:** any latency caveat of mine saying "two loops" should read "one".

---

## 5. Durable-output ledger for this sprint

| job | before | after | delta | verdict |
| --- | --- | --- | --- | --- |
| HEAD walk, 09:47–10:52Z | 2,026,872 | 2,026,872 | **0** | `RUNNING_REPLAYING` → paused |
| tranche embed, cell-ordered attempt | 0 | 2,917 | +2,917 | discarded deliberately (biased prefix) |
| tranche embed, priority-ordered | 0 | **69,941 and rising** | +69,941 | `RUNNING_PROGRESSING` |
| tranche selector #4 | no manifest | 81,510 documents | +81,510 | complete, reproducible |
| HNSW index (partial, 64,960 passages) | none | 0.49 GiB | +0.49 GiB | built in 62.5 s |

Every row above is a count read from the database or a file size read from the
filesystem. Not one of them is inferred from a process being alive.

---

## 6. Caveats

- **The 2,917-row discard was mine and deliberate.** The first embed pass ran in stratum-cell
  order, which front-loads the Supreme Court's oldest and longest judgments — measured at
  35,500 chars/doc against a tranche mean of 10,648. Any prefix of that build would have
  been a statement about one court's older docket. The rows cost 239 s and were deleted so
  that any prefix of the priority-ordered build is a uniform sample of the tranche.
- **Reboot recovery is untested, not merely undocumented.** No reboot has been performed
  during this sprint, so the claim in §2 is `OBSERVED_BY_CODE` (scheduler entries and
  launch mechanisms) rather than `OBSERVED_BY_EXECUTION`.
- **The keeper's relaunch-on-silence rule is correct and was not the fault here.** It
  relaunched a walk that had genuinely been silent 277 minutes. What it cannot see is that
  the relaunched process is replaying — silence and uselessness are different failures, and
  it only watches for one.
