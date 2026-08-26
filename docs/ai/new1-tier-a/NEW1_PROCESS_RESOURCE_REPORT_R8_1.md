# NEW1 — PROCESS AND RESOURCE REPORT, R8.1

**Deliverable:** R8.1 §6.9 (process/resource report) · **Lane:** NEW1 · **Date:** 25–26 Aug 2026
**Job:** `new1-tranche-embed` — bounded 100k-document passage tranche
**Status at writing:** `RUNNING_PROGRESSING`, 70,000 / 81,720 documents

Everything below is `OBSERVED_BY_LIVE_DB`, `OBSERVED_BY_PROCESS_TABLE` or quoted
verbatim from a log. Where a cause is not established it is labelled `UNKNOWN` rather
than filled in with the likeliest story.

---

## 1. Outcome

The tranche embed ran 5h 02m, **died on a single uncaught exception**, and sat dead for
18 minutes before a human noticed. Nothing lost — it commits per batch and resumed
exactly where it stopped. The interesting part is not the crash; it is that **three
independent supervision mechanisms all reported health while the job was dead**, and one
of them credited itself with a recovery it did not perform.

All three are now closed. The resource numbers in §5 are the ones the full-corpus
passage-build decision turns on, and §6 says plainly why they do not fit on this box.

---

## 2. The incident, from the logs

| time (UTC) | event | source |
|---|---|---|
| 11:36:01 | worker PID 9820 starts | process table |
| 16:44:02 | last successful batch — 46,200 docs, 141,065 passages | `tranche-embed.log` |
| ~16:44:09 | sidecar stops answering `/health` | keeper log, back-calculated from "last ok 52s ago" |
| 16:45:01 | `health MISS 1/2` | keeper log |
| 16:45:40 | `health MISS 2/2` | keeper log |
| 16:45:42 | `RESTART #2 — sidecar unreachable` | keeper log |
| 16:48 | **NEW1 reads the row count, sees growth, publishes `RUNNING_PROGRESSING`** | START_STATE_R8_1 |
| 16:49:35 | `SWEEP FAILED — spawnSync powershell.exe ETIMEDOUT. Assume the old sidecar is STILL ALIVE.` | keeper log |
| ~16:49 | worker dies: `[DOMException [TimeoutError]: The operation was aborted due to timeout]` | `tranche-embed-runner.log` |
| 16:49:45 | keeper spawns sidecar PID 7844 | keeper log |
| 16:49:50 | `sidecar answered 3s after spawn` | keeper log |
| 17:02:00 | restarted by hand — `already embedded 46,200 · remaining 35,520` | `tranche-embed.log` |

**The 300-second gap is the clock that explains the whole thing.** `EMBED_TIMEOUT_MS`
defaults to 300 s. The last batch completed at 16:44:02; the next request stalled against
a wedged sidecar; the `AbortSignal` fired ~300 s later at ~16:49 and the rejection was
uncaught. So the sidecar wedged at 16:44 and the worker died at 16:49 — **the job was
already doomed but still alive when it looked healthy, and already dead when it looked
recently-alive.**

---

## 3. Three supervision mechanisms, three different failures

### 3.1 The worker had no restart-on-exit at all

The keeper watches `stage-embed.log` — the **HEAD walk**, which is paused. The tranche
writes `tranche-embed.log`, which nothing read. So the sidecar was healthy again by
16:49:50 and the GPU sat at zero until 17:02.

**Thirteen idle minutes because the keeper was fixing the dependency while nobody watched
the dependent.** Overnight that is not thirteen minutes.

*Closed:* the keeper now watches the tranche by silence — 10 minutes, five times its
~2-minute progress interval — with the same discipline as the walk (kill survivors, spawn
detached, pause-file escape hatch carrying a reason), plus one rule the walk does not
need: **`TRANCHE EMBED DONE` means never relaunch.** A finished job's log is silent
forever, and silence is this keeper's only signal; without that check it would restart a
completed tranche every ten minutes.

*Not yet proven:* the tranche relaunch path has **never fired**. `NOT_MEASURED` until it
does. The walk's own history in this file records a relaunch that logged success 51
consecutive times while the walk stayed dead for 4h20m, so an unexercised launch path is
worth exactly nothing until it launches something.

### 3.2 The keeper credited itself with someone else's recovery

At 16:49:50 it logged `sidecar answered 3s after spawn`. It had not fixed anything:

- the sweep had just logged `ETIMEDOUT` and **assumed the incumbent was still alive**;
- so PID 4116 still held port 8799;
- `server.py` sets `SO_EXCLUSIVEADDRUSE`, so the newly spawned PID 7844 **could not bind
  and exited**;
- the health that came back was **the incumbent un-wedging on its own** after ~5.5 min.

PID 4116's creation time is unchanged from 08:56Z through the entire incident — it was
never replaced. "My restart fixed it" and "it recovered by itself and my restart did
nothing" imply opposite things about whether this keeper is load-bearing, and the log
could not tell them apart.

*Closed:* after the sidecar answers, the keeper now checks whether **its own spawned PID
is still alive** and says which of the two happened.

### 3.3 `HEAVY_BOX` said HELD while no mutex was held

NEW1 hand-wrote `.agents/bus/leases/HEAVY_BOX.json` at 16:45Z because R8.1 §3 names NEW1
the initial owner and no lease existed — without checking whether a tool owned that path.
`scripts/resource-lease.mjs` did. The **record** was written; the **lock** was never
taken. For three hours every lane that asked read `HELD` while nothing would have stopped
a second lane from acquiring it. Caught by NEW2 (bus 1269/1270), not by me.

*Closed:* acquired through the CLI, `HEAVY_BOX.lock` present, heartbeating the durable row
count.

**The generalisation is the point:** a lease you can write with a text editor is a lease
you can believe without taking. Same shape as 3.2 — a record produced by something other
than the act it claims to record.

### 3.4 And my own reading was wrong

Two live DB reads nine minutes apart, both rising, both real — and the second returned
*exactly* the counts of the 16:44:02 log line. All the growth had happened before the
death. **A rising count and a still-rising count are different facts**, and a job that
dies between two reads produces a delta indistinguishable from progress.

R8.1 §3 says to compare durable output across windows. It does not say the comparison is
sufficient when the windows can straddle a death. The check costs one line: **the log's
own timestamp was four minutes stale when I quoted its row count as current.** Freshness
of a measurement is part of the measurement.

---

## 4. Job registry and identity

| field | value |
|---|---|
| job_id | `new1-tranche-embed` |
| launcher | `services/harness/src/tranche-embed-launch.sh`, detached via `Start-Process` |
| worker | `tsx src/tranche-embed-cli.ts` — PID 21552, born 2026-08-25T17:02Z (`restart_count 1`) |
| GPU sidecar | `services/embed/gpu/server.py --port 8799` — PID 4116, born 08:56Z, **never restarted** |
| supervisor | `Lawmind-new1-sidecar-keeper` scheduled task |
| durable metric | `select count(*), count(distinct judgment_id) from new1_tranche_passages` |
| input version | `TRANCHE_100K_MANIFEST.json`, natural digest `4b0674267dab4676…` |

The job was **not in the registry at all** until this session — an unmanaged critical
worker, G0-relevant. The dead instance is retired in the same line rather than left
claiming `RUNNING` with a dead PID.

**One identity subtlety worth recording.** `resource-lease.mjs` compares
`commandFingerprint` against the **lease holder's** command line. For a supervising agent
session holding a lease over a detached worker, the holder is `claude.exe` and the worker
is `tsx`, so supplying the *job's* fingerprint produces `PID_RECYCLED` immediately after a
clean acquire. Job identity belongs in the job registry; the lease fingerprint describes
the holder. Both readings are defensible and the tool picks one silently.

---

## 5. Resources, measured

### GPU
RTX 4060 Ti, 8,188 MiB. Sampled every 1.5 s under load: **91–100% utilisation**,
**59–63 °C**, SM clock **2,385–2,715 MHz**. Not thermally limited (this part throttles in
the low 80s). Sidecar resident ~4.5–5.3 GiB. **The GPU is the bottleneck and it is
saturated** — which is why dropping the stale HNSW (below) was expected to free I/O rather
than wall-clock.

### Throughput, and a comparison I nearly published wrongly
At 17:15Z the run showed ~10,500 chars/s against ~12,500 just before the crash, and I was
about to report a ~30% regression. **It was cold-start.** The `tok/s` in the log is a
*cumulative* average, so comparing it across two windows of different age is not a
comparison at all. By 20:01Z the cumulative figure was **5,950 tok/s — above the
pre-crash 4,337** — with nothing changed but elapsed time.

Documents/second and throughput now point in **opposite** directions: the remaining
documents average ~10,000 characters against ~6,500 for the earlier ones, so docs/sec
falls while tokens/sec rises. Any single-rate ETA from here is arithmetic dressed as a
fact, and none is quoted.

### Storage, per passage — measured at 251,664 passages, HNSW dropped

| component | bytes | per passage |
|---|---:|---:|
| heap | 31,719,424 | 126 B |
| TOAST (the vectors) | 1,391,828,992 | **5,530 B** |
| primary key | 13,688,832 | 54 B |
| **subtotal, no ANN index** | **1,437,294,592** | **5,711 B** |
| HNSW, *fresh* build at 64,960 passages | 531,357,696 | **8,180 B** |
| **total with ANN** | | **≈ 13,891 B** |

A 1024-d `float4` vector is 4,096 bytes and every one exceeds the 2 KB TOAST threshold, so
the vectors live entirely out of line — the 30 MB heap is metadata only.

### The stale index, dropped
`new1_tranche_passages_hnsw` was built at 13:53Z over **64,960 passages** (a 26% prefix)
and had grown incrementally to **1,939 MB** by 20:00Z. The runbook requires it to be
dropped and rebuilt rather than appended to — a build time and index size from a partial
table is not the number the decision needs, and an incrementally-grown HNSW is not the
same graph as a fresh one. Dropped at 20:02Z; the embed did not notice.

### Postgres settings that make the rebuild reproducible
`maintenance_work_mem` **512 MB** · `max_parallel_maintenance_workers` **4** ·
`shared_buffers` **2 GB** · `work_mem` **32 MB** · `effective_cache_size` **12 GB** ·
`max_parallel_workers_per_gather` **4**.

A build time quoted without `maintenance_work_mem` is not reproducible. The prior fresh
build recorded `m=16, ef_construction=64, maintenance_work_mem=1GB,
max_parallel_maintenance_workers=1` — **the session used 1 GB where the server default is
512 MB**, and the rebuild must state which it used.

### Disk / DB
`lawmind` **300 GB**. C: **284 GB free**.

### Passage-level facts
251,664 passages over 70,000 documents · mean 2,196 chars and 574 tokens per passage ·
**6,376 passages (2.53%) carry `char_offset = -1`**, i.e. the offset could not be
verified. Those cannot support a pinpoint citation, and the rate is the tranche-level
consequence of the chunker defect reported in bus 1224.

---

## 6. What this says about a full-corpus passage build

**Not a recommendation — that is `HEAD_VS_PASSAGE_DECISION_V2`. This is the arithmetic.**

> **UPDATED 2026-08-26T01:44Z with the completed build. The earlier version of this
> section used a 3.6 chunks/doc projection and was too optimistic.** The true rate is
> **5.116** and the fresh index is now measured rather than extrapolated. The direction of
> the conclusion did not change; its margin got worse.

### Measured at completion — no projection in this table

| | value |
|---|---:|
| documents | 81,720 |
| passages | **418,116** |
| **chunks / document** | **5.116** |
| heap + TOAST + pkey | 2,387,927,040 B → **5,711 B / passage** |
| **fresh HNSW at 418,116** | 3,401,678,848 B → **8,136 B / passage** |
| **total per passage** | **13,847 B** |
| build time | **224.6 s** |
| WAL during build | 1,697,494,088 B |
| temp spilled | **0** |
| backend RSS | 2,110 MiB (sample after the build, not a peak) |
| params | `m=16`, `ef_construction=64`, `maintenance_work_mem=2GB`, `max_parallel_maintenance_workers=2` |

The index cost per passage barely moved — **8,136 B measured at 418k against 8,180 B at
64,960** — so the earlier per-element basis was sound. What was wrong was the passage
*count*.

**The two builds are not comparable on time.** The 64,960 build used 1 GB and one
maintenance worker; this one used 2 GB and two. 6.44× the rows took 3.59× the wall clock
*with twice the memory and twice the workers*. Anyone extrapolating build time from these
two points is extrapolating across a configuration change as well as a size change.

### The projection, corrected

At **13,847 B/passage** and the Tier A deduplicated population of **8,854,281 documents**:

| chunks/doc | passages | storage |
|---:|---:|---:|
| 3.0 (earlier guess) | 26.6 M | 368 GB |
| **5.116 (measured here)** | **45.3 M** | **≈ 627 GB** |

**Against 284 GB free and a database already at 300 GB, a full-corpus passage build does
not fit on this box** — now by a factor of roughly two rather than a modest overrun, and
still before counting WAL, temp or the build's working set. At this tranche's WAL rate the
build alone would generate on the order of 180 GB of WAL.

Three caveats that travel with the projection — the first is *not* fixed by having
finished the build:

1. **5.116 chunks/doc is this tranche's rate, not the corpus's.** The draw is deliberately
   era-skewed (5% pre-1990 against a 0.08% corpus share), and the rate moved from 3.05 to
   5.12 *within this single build* as the later documents ran longer — 648.8 M characters
   embedded against 302.5 M at the halfway point. A corpus-representative rate needs a
   corpus-representative sample, which this is not by construction.
2. **HNSW build time is not linear and 45.3 M passages will not fit the working set.**
   Two points at two different configurations do not define a curve.
3. **`halfvec` is not costed here.** Halving vector storage moves the subtotal from
   5,711 B to roughly 3,663 B — with the index, ~11,799 B/passage and ~535 GB. It changes
   the number materially and *still does not fit*. `NEW1_HALFVEC_TASK_FIDELITY` exists;
   whether that fidelity is acceptable is a separate question this report does not answer.

---

## 7. Still `UNKNOWN`

- **`SIDECAR_STALL_CAUSE`.** The sequence is proven; the cause is not. The sidecar stopped
  answering for ~5.5 minutes and recovered without being replaced. Nothing in its own
  output explains it, GPU memory showed no exhaustion, and no second consumer was on the
  card. It is not being guessed at.
- **The tranche relaunch path.** Written, never fired.
- **Whether the retry wrapper is sufficient.** 4 attempts at 5/15/45 s covers a stall
  shorter than ~65 s plus four timeout windows. The one observed stall lasted ~5.5 min,
  which the retry alone would **not** have survived — the keeper's 10-minute relaunch is
  what covers that case. Neither has been exercised against a real stall.
