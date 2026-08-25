# LCC — LAUNCH CONVERGENCE SPRINT TODO BOARD

**Source of truth:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md` §6.
**Baseline:** `LAWMIND_INDEPENDENT_VALIDATION_DOSSIER_R4_2026-08-25.md` §§5–9, 14, 22–24.
**Lane lease:** LCC held by session `76b6b72f…` (pid 3848), taken over from `fa117007…` on `PID_RECYCLED`.
**Last updated:** 2026-08-25, mid-run.

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

## P0 — ACCOUNT ERASURE, EXTERNAL OBJECTS (LCC-2) — IN PROGRESS

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
- [~] **LCC-2b** One comprehensive disposable fixture — written; first run failed
      on invented column names. Real schema now read from the database; rewriting
      the fixture against it.
- [ ] Old-email re-registration proven a NEW identity (R4 "unmeasured")
- [ ] **LCC-2c** Credit-ledger retention into `docs/FOUNDER_QUEUE.md`, explicit

---

## P0 — TREATMENT PROVENANCE LOAD-BEARING (LCC-3) — NOT STARTED

- [ ] `COURT_REASONING_EXPLICIT` — strong wording only when other verification passes
- [ ] `REPORTER_EDITORIAL_ANNOTATION` — visible but qualified; warnings NOT removed
- [ ] `MODALITY_DEFECT` — may not propagate strong currentness
- [ ] `NULL` — stays unknown, never silently promoted
- [ ] Applied across search, judgment, treatment, matter, briefing, document, counterargument
- [ ] Cross-surface tests, one per surface per provenance class

---

## P0/P1 — SPARSE / RESEARCH PRODUCTION ENVELOPE (LCC-4) — NOT STARTED

- [ ] Structural enumeration of every production hybrid/retrieval caller
- [ ] A test that fails when a new caller bypasses the preflight
- [ ] Quiet-window run: citation/exact, case number, title, normal concept,
      long rare, all-common, saved-search, counterargument
- [ ] Measure p50 / p95 / max, degraded flag, DB pool use, IO/temp, no 53200
- [ ] Bounded honest response for accepted-but-slow synchronous research

---

## P0 — CITATION-KEY CONTINUOUS FRESHNESS (LCC-5) — NOT STARTED

- [ ] Track latest citation ingest, key frontier, lag rows, lag age, last
      risk-strata replay
- [ ] Resolver enrichment fails closed or marks stale past the safe bound
- [ ] Coordinate truth replay with NEW2

---

## P0 — HUMAN OPERATIONAL PAGING (LCC-6) — PARTLY DONE

- [x] Stalled critical background worker raises a page (via the control plane)
- [x] Low-traffic absolute-failure rules
- [ ] A non-console transport and a proven scheduled tick
- [ ] Drill: long SQL, disk, briefing zero-write, API/search 5xx,
      collector failure, DB-down path
- [ ] Receipt retained, named recipient, remaining founder action stated exactly

---

## P0 — RELEASE REHEARSAL #2 (LCC-7) — NOT STARTED

- [ ] 100k+ judgments if resource-safe, else largest defensible slice and why
- [ ] manifest/versioning, explicit columns, truncated-transfer rejection
- [ ] restore, ANALYZE, exact-search equivalence, currentness equivalence
- [ ] GIN rebuild, pgvector parity, representative HNSW build
- [ ] disk / RAM / temp / WAL measured
- [ ] rollback of the legal snapshot WITHOUT rolling back user/private data
- [ ] Verdict: `READY_FOR_REMOTE_STAGING` or `NOT_READY`, with evidence

---

## P1 — ACTIVATION EVENT DURABILITY (LCC-8) — NOT STARTED

- [ ] Bounded outbox/retry so writes survive process exit
- [ ] Failure metric
- [ ] Assert no raw confidential query or matter text is stored

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
