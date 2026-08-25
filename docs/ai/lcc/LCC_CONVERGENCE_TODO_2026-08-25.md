# LCC — LAUNCH CONVERGENCE SPRINT TODO BOARD

**Source of truth:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md` §6.
**Baseline:** `LAWMIND_INDEPENDENT_VALIDATION_DOSSIER_R4_2026-08-25.md` §§5–9, 14, 22–24.
**Lane lease:** LCC held by session `76b6b72f…` (pid 3848), taken over from `fa117007…` on `PID_RECYCLED`.
**Last updated:** 2026-08-25, end of run.

**Boundaries in force:** no `apps/**` (RCC owns CLIENT_APPS) · no semantic-retrieval
redesign (NEW1) · no treatment source adjudication (NEW2) · no product copy (NEW3) ·
no resolver mass backfill · no treatment mass rewrite · no Railway · no cloud spend ·
no live eCourts.

Legend: `[x]` done and observed · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## P0 — PROCESS CONTROL PLANE (LCC-1) — DONE

- [x] **LCC-0** Acquire LCC lease; inspect git / bus / DB / CPU / RAM / disk /
      pg_stat_activity / background jobs / Task Scheduler / lane registry
- [x] **LCC-1a** Job inventory and reconciler — 14 fields, 7 states, observations
      kept separate from the lanes' own declarations (`scripts/job-health.mjs`)
- [x] **LCC-1b** One-command health report for every lane — `pnpm job:health`
      (`--quiet`, `--json`, `--strict`, `--publish`)
- [x] **LCC-1c** Startup audit — Task Scheduler, logon launchers, wrapper locks,
      orphan GPU, unregistered live processes
- [x] **LCC-1d** Stalled-worker alert semantics — migration `0083`,
      `ops_job_observations` to `metrics.ts` to `alert-poller`, proven end to end
- [x] Fix found by the tool, in the tool — descendant expansion; the sidecar
      keeper was invisible because its command line uses a relative path
- [x] Low-traffic absolute search rules (R4 hidden risk #14)
- [x] `enrich-worker.cmd` exponential backoff, 30s to 1h, resets on real work
- [x] Disable `Lawmind-citations.cmd` logon launcher — frontier confirmed closed
      by direct count (0 pending)
- [!] Stop the LIVE citations restart loop (pid 7308) — `taskkill` refused by the
      sandbox; needs one approval. The launcher is already disabled, so it does
      not survive a reboot either way.

### What the control plane found on its first run

| Finding | Owner | Status |
|---|---|---|
| TWO GPU servers bound to 127.0.0.1:8799 (pids 20452, 28592, same keeper) | NEW1 | reported, bus 1124, not touched |
| 3 NEW1 jobs read RUNNING over pids absent from the process table | NEW1 | reported, bus 1124 |
| `registry.jsonl` line 3 is a truncated append no parser can read | NEW1 | reported, bus 1124 |
| citations loop: index rebuilt every ~3.5 min, 0 work, 56.5 MB log | LCC | fixed (backoff + launcher off) |
| paragraphs wrapper alive 12h holding a decorative lock, no worker | LCC | recorded |

---

## P0 — ACCOUNT ERASURE, EXTERNAL OBJECTS (LCC-2) — DONE

- [x] Migration `0084_erasure_objects.sql` — per-object lifecycle:
      `PENDING` / `DELETED` / `RETRYABLE_FAILURE` / `PERMANENT_FAILURE`
- [x] `erasure-objects.ts` — idempotent sweep, DELETE **then HEAD** for a real
      receipt, attempt budget, dead letter
- [x] **Bug found:** `ocr_jobs.storage_key` is `NOT NULL`, its rows were deleted,
      and its keys were never collected — objects orphaned silently. Fixed.
- [x] Keys now carry provenance (`documents.` / `ocr_jobs.` / `data_requests.`)
- [x] `completed` gated on every object being confirmed gone; a dead letter does
      NOT complete a request
- [x] `erasure-objects-cli.ts` — scheduled retry, `--dead-letters`, exit 1 while
      anything is still owed
- [x] **LCC-2b** One comprehensive disposable fixture — 22 tables, one identity,
      one erasure, table-by-table expected-residue map. 3/3 green
- [x] Old-email re-registration proven a NEW identity (R4 "unmeasured")
- [x] **LCC-2c** Credit-ledger retention queued to `docs/FOUNDER_QUEUE.md`

---

## P0 — TREATMENT PROVENANCE LOAD-BEARING (LCC-3) — DONE

- [x] `COURT_REASONING_EXPLICIT` — the only class `mayStateAsHolding()` permits
- [x] `REPORTER_EDITORIAL_ANNOTATION` — visible and qualified; **98 warnings kept,
      not reduced to 5**
- [x] `MODALITY_DEFECT` — cannot propagate (`IS DISTINCT FROM`, so the NULL
      majority is unaffected)
- [x] `NULL` — stays UNKNOWN; never read as COURT
- [x] All seven surfaces: search, judgment, treatment row, matter, briefing,
      document/draft, counterargument
- [x] 20 cross-surface tests; 79 green across the affected suites
- [x] **Correction after NEW3's regression:** `evidence_defect` — a parser defect
      must subtract a warning, not add a prohibition. 1975 INSC 212 saves again

---

## P0/P1 — SPARSE / RESEARCH PRODUCTION ENVELOPE (LCC-4) — DONE

- [x] Structural enumeration; **found a live bypass** — the saved-search feed took
      no admission slot. Third route to make that mistake
- [x] A test that fails on bypass, **falsified** with a deliberate probe (2 of 5
      assertions fail, 5/5 when removed)
- [x] Quiet-window run, all eight shapes, through the real Hono app
- [x] p50/p95/max, degraded flag, pool use, temp bytes (0.00 MiB spill), no 53200
- [x] **LCC-4c** `emptyBecause` — "we declined to look" no longer renders as
      "there is no law on this". Remedy tested, not asserted

---

## P0 — CITATION-KEY CONTINUOUS FRESHNESS (LCC-5) — DONE

- [x] Migration 0085: the builder's own cursor in the DB, plus a risk-replay log
- [x] Two bounds — 25,000 lag rows and 72 quiet hours — because a dead builder and
      a caught-up one both read as zero lag
- [x] `UNIQUE_UNCONFIRMED_STALE_INDEX`; the candidate is KEPT, only the claim is
      withdrawn. Proven on [1950] 1 S.C.R. 1008
- [x] `mayAssertUnique('UNKNOWN') === false`
- [x] Alert rules read the same function the resolver gates on

---

## P0 — HUMAN OPERATIONAL PAGING (LCC-6) — DONE except one credential

- [x] Stalled critical background worker raises a page
- [x] Low-traffic absolute-failure rules (the launch-week hole)
- [x] Non-console transport with receipts that outlive the process
- [x] Scheduled tick — `Lawmind-alert-poll`, every 10 min, observed rc=0
- [x] Seven conditions drilled; **two fired without being injected**
- [x] DB-down drill: pages even when the ledger it writes to is gone
- [!] `RESEND_API_KEY` + `OPS_ALERT_EMAIL` — queued; no human is woken until then

---

## P0 — RELEASE REHEARSAL #2 (LCC-7) — NOT RUN (needs the box; NEW1 holds it)

- [x] **Prerequisite found and fixed** — 4 applied migrations were absent from
      `_journal.json`, so a restore would have built a schema missing 7 live
      objects (NEW2 bus 1161)
- [ ] **Still open:** live `__drizzle_migrations` records 58 of 87; 12 of the 29
      unrecorded are non-idempotent and would abort an official `migrate()` run
- [ ] 100k+ judgments if resource-safe, else largest defensible slice and why
- [ ] manifest/versioning, explicit columns, truncated-transfer rejection
- [ ] restore, ANALYZE, exact-search equivalence, currentness equivalence
- [ ] GIN rebuild, pgvector parity, representative HNSW build
- [ ] disk / RAM / temp / WAL measured
- [ ] rollback of the legal snapshot WITHOUT rolling back user/private data
- [ ] Verdict: `READY_FOR_REMOTE_STAGING` or `NOT_READY`, with evidence

---

## P1 — ACTIVATION EVENT DURABILITY (LCC-8) — DONE

- [x] Bounded outbox (2,000), retry with backoff, flush on SIGTERM
- [x] Loss counted BY REASON — capacity vs retries mean different things
- [x] Privacy asserted structurally: the entry is an id and a step, nothing else
- [x] Described as a measured loss bound, never as durable — it does not survive
      SIGKILL and the comment says so

---

## P1 — CLIENT / WEBSITE SUPPORT (LCC-9) — STANDING

- [ ] Respond only to explicit RCC/NEW3 handoffs; no parallel web frontend

---

## Startup inventory — 2026-08-25T03:2x UTC

Machine: RAM 31.7 GB total / 10.7 GB free · C: 289.2 GB free · D: 793.3 GB free · CPU ~39%.

| Process | PID | Parent | Started | Owner (claimed) |
|---|---:|---:|---|---|
| `postgres.exe` postmaster + 9 children | 5984 | 4864 | 24 Aug 16:50 | shared |
| `sidecar-keeper.mjs` | 9696 | 6600 | 24 Aug 18:48 | NEW1 |
| `embed/gpu/server.py --port 8799` | 20452 | 9696 | 24 Aug 18:48 | NEW1 |
| `embed/gpu/server.py --port 8799` | 28592 | 9696 | 25 Aug 06:46 | NEW1 — second bind |
| `tsx src/doc-vector-embed.mjs` | 28256 / 23096 | 26436 | 25 Aug 07:05 | NEW1 |
| `enrich-worker.cmd citations` wrapper | 7308 | 18840 | 24 Aug 18:47 | LCC — loop, awaiting kill |
| `enrich-worker.cmd paragraphs` wrapper | 8776 | 11808 | 24 Aug 18:48 | LCC — idle shell, no worker |

**Not adjudicated, not killed.** Another lane's process is never stopped on a name
match or on looking stale.

## Commits and migrations this run

- `574439a` feat(lcc): a control plane that will not accept a live PID as proof of work
- migrations `0083_ops_job_observations`, `0084_erasure_objects` — both APPLIED
- bus `1123`–`1126` — DB_MIGRATION 0083 announced to all lanes before apply
