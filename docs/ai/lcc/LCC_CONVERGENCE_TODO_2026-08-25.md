# LCC — LAUNCH CONVERGENCE SPRINT TODO BOARD

**Source of truth:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md` §6.
**Baseline:** `LAWMIND_INDEPENDENT_VALIDATION_DOSSIER_R4_2026-08-25.md` §§5–9, 14, 22–24.
**Lane lease:** LCC held by session `76b6b72f-c322-4563-8d8b-5544a5312a69` (pid 3848), acquired
2026-08-25 from `fa117007…` on `PID_RECYCLED`.

**Boundaries in force:** no `apps/**` edits (RCC owns CLIENT_APPS) · no semantic-retrieval
redesign (NEW1) · no treatment source adjudication (NEW2) · no product copy (NEW3) · no
resolver mass backfill · no treatment mass rewrite · no Railway · no cloud spend · no live
eCourts.

Status vocabulary: `TODO` · `DOING` · `DONE` · `BLOCKED` · `PARTIAL`.

---

| # | Item | Priority | Status | DONE criterion | VERIFY |
|---|---|---|---|---|---|
| LCC-0 | Acquire LCC lease; inspect git/bus/DB/CPU/RAM/disk/pg_stat_activity/jobs/Task Scheduler/lane registry | P0 | DONE | Lease HELD by this session; full startup inventory recorded | `lane-lease status LCC` prints this session; inventory written to this board |
| LCC-1a | Job inventory schema + reconciler: every persistent worker → machine-readable record with the 14 required fields and the 7 states | P0 | TODO | Every live LawMind process either maps to a registry job or is reported UNKNOWN/orphan | one command prints the matrix; a killed worker flips to STOPPED, a silent one to RUNNING_STALLED |
| LCC-1b | One-command health report usable by every lane (`pnpm job:health`) | P0 | TODO | `JOB\|OWNER\|PID\|AGE\|STATE\|HEARTBEAT\|LAST PROGRESS\|PROGRESS\|CHECKPOINT\|STARTUP\|RESTARTS\|RESOURCE` | run it; output matches independently-read pids and checkpoints |
| LCC-1c | Startup audit: Task Scheduler, logon launchers, keeper, sidecar, classifier, OCR, citation-key catch-up, alert poller, orphan GPU | P0 | TODO | Every startup mechanism named with what it launches and whether it progresses | enumerate `schtasks`, Run keys, `.cmd` launchers; cross-check against live pids |
| LCC-1d | Stalled-worker alert semantics wired into the alert poller | P0 | TODO | A RUNNING_STALLED critical job raises a page | inject a stalled record; observe notifier receipt |
| LCC-2a | Erasure external-object lifecycle: per-object PENDING/DELETED/RETRYABLE_FAILURE/PERMANENT_FAILURE, idempotent retry, deletion receipt | P0 | TODO | `data_requests.status='completed'` only after every mandatory object is DELETED or DEAD_LETTER-adjudicated | test: seeded R2 keys, forced failure → request NOT completed; success → completed with receipts |
| LCC-2b | One comprehensive disposable erasure fixture across auth/product/storage/premium relations + old-email re-registration | P0 | TODO | Single fixture identity, one erasure call, table-by-table expected-residue assertion | the fixture test is green and names every table it asserts |
| LCC-2c | Credit-ledger retention stays explicit and founder-blocked | P0 | TODO | `docs/FOUNDER_QUEUE.md` entry naming the exact unresolved retention question | entry present, references the linked-not-detached finding |
| LCC-3 | Treatment provenance load-bearing across search / judgment / treatment / matter / briefing / document / counterargument | P0 | TODO | COURT_REASONING_EXPLICIT strong-only-with-verification; REPORTER qualified-but-visible; MODALITY_DEFECT cannot propagate; NULL stays unknown | cross-surface tests, one per surface, per provenance class; reporter warnings still render |
| LCC-4a | Structural enumeration of every production hybrid/retrieval caller; no caller bypasses preflight | P0/P1 | TODO | A test that fails when a new caller skips the preflight | run it; add a synthetic bypassing caller and watch it fail |
| LCC-4b | Quiet-window latency/resource envelope: exact, case no, title, normal concept, long rare, all-common, saved-search, counterargument | P0/P1 | TODO | p50/p95/max, degraded flag, pool use, IO/temp, no 53200, plans where useful | run in a coordinated quiet window; artefact retained |
| LCC-4c | Bounded honest response for accepted-but-slow synchronous research | P0/P1 | TODO | A defined server behaviour instead of a mobile hang | test asserts the bounded/degraded path at the budget |
| LCC-5 | Citation-key continuous freshness: latest ingest, key frontier, lag rows, lag age, last risk-strata replay; fail closed / mark stale when too stale | P0 | TODO | A freshness reading is queryable and the resolver refuses or qualifies past the bound | force lag; observe enrichment fail closed / stale mark |
| LCC-6 | Human operational paging: scheduled execution + delivery proven to a named mailbox/sink; long SQL, disk, briefing zero-output, API/search errors, collector failure, DB failure, stalled worker; low-traffic absolute rules | P0 | TODO | A scheduled tick delivers a real page outside console, with a receipt | drill each condition; retain receipts; founder action named precisely if recipient is blocked |
| LCC-7 | Release rehearsal #2 at ≥100k judgments (or largest defensible slice, documented) | P0 | TODO | READY_FOR_REMOTE_STAGING or NOT_READY with evidence | manifest/versioning, explicit columns, truncated-transfer rejection, restore, ANALYZE, exact-search equivalence, currentness equivalence, GIN rebuild, pgvector/HNSW parity, disk/RAM/temp/WAL, rollback of legal snapshot without user DB |
| LCC-8 | Durable activation persistence (bounded outbox/retry, failure metric, no raw legal/matter text) | P1 | TODO | Activation writes survive process exit | kill mid-write; observe replay; assert no confidential content stored |
| LCC-9 | Client/website server support — explicit RCC/NEW3 handoffs only | P1 | TODO | Only handoff-driven server work; no parallel web frontend | bus messages cited for every such change |

---

## Startup inventory — 2026-08-25T03:1x UTC (recorded at LCC-0)

Machine: RAM 31.7 GB total / 10.7 GB free · C: 289.2 GB free · D: 793.3 GB free · CPU ~39%.

| Process | PID | Parent | Started | Owner (claimed) |
|---|---:|---:|---|---|
| `postgres.exe` (postmaster + 9 children) | 5984 | 4864 | 2026-08-24 16:50 | shared |
| `services/harness/src/sidecar-keeper.mjs` | 9696 | 6600 | 2026-08-24 18:48 | NEW1 |
| `services/embed/gpu/server.py --port 8799` | 20452 | 9696 | 2026-08-24 18:48 | NEW1 |
| `services/embed/gpu/server.py --port 8799` | 28592 | 9696 | 2026-08-25 06:46 | NEW1 (second instance — investigate) |
| `tsx src/doc-vector-embed.mjs` | 2656 / 28256 / 23096 | 25804 | 2026-08-25 07:05 | NEW1 (unclaimed in lease) |
| `railway.js mcp` ×5 | 28268, 18844, 11304, 30008, 29980 | — | 2026-08-25 06:24–07:00 | tooling, not LawMind work |
| `chrome-devtools-mcp` ×4 | 16512, 19208, 24440, 24048 | — | 2026-08-24 18:49 | tooling |

**Not adjudicated, not killed.** Per §3 and the standing rule, another lane's process is not
stopped on a name match or on looking stale.
