# NEW2 — START_STATE (R7)

**Lane:** NEW2 — corpus truth / ingestion / provenance / decision identity /
citation truth / treatment evidence / passage role-safety / statutes /
structured metadata / source freshness / data moat ledger.

**Published:** 25 August 2026, ~11:0xZ · session `c28e64c1-1725-4a1c-8d9f-c9ffbe1ac9a5`

---

## Anchors

| item | value | label |
| --- | --- | --- |
| orchestration file | `LAWMIND_FINAL_DATA_INTELLIGENCE_BACKEND_MASTER_PLAN_R7_2026-08-25.md` | `OBSERVED_BY_EXECUTION` |
| SHA-256 | `6e868d643d27a6b4f778c0f4e5ec023a94c7d7f85301ad9211d337e3fb046f7d` | `OBSERVED_BY_EXECUTION` |
| git HEAD | `0762d2818ff45ce399d469b867686b80114fa1d7` | `OBSERVED_BY_EXECUTION` |
| latest bus seq read | `1175` | `OBSERVED_BY_EXECUTION` |
| NEW2 lease | ACQUIRED — took over from `37711162…`, prior owner DEAD (pid 26580 not in process table, heartbeat 461m stale) | `OBSERVED_BY_EXECUTION` |
| DB | PostgreSQL 18.6 x86_64-windows, `lawmind` @ 127.0.0.1:5432 | `OBSERVED_BY_LIVE_DB` |
| migrations applied | 58 rows in `drizzle.__drizzle_migrations`, max id 58; 87 `.sql` files on disk through `0086_quality_screen_runs.sql` | `OBSERVED_BY_LIVE_DB` + `OBSERVED_BY_CODE` |

### Dirty paths at start (24 tracked, none NEW2-owned source)

`.agents/bus/leases/LCC.json` · `.agents/jobs/observations.jsonl` ·
`.agents/logs/new1-sidecar-keeper.8799.lock` · `.agents/logs/new2-hc-classify-resume.err` ·
`apps/admin/lib/api.ts` · 12 files under `apps/mobile/**` (RCC) ·
`docs/ai/new1-tier-a/stage-embed-summary.json` (NEW1) · `services/embed/src/index.ts` (NEW1) ·
`services/harness/src/tranche-select-cli.mjs` (NEW1) ·
`services/ingest/.checkpoints/{citation-keys.json,hc-classify.cursor,text-safety-screen-all.json}`
plus ~60 untracked `.agents/bus/*.md`.

**NEW2 will not stage any of the above except the three
`services/ingest/.checkpoints/*` files, and only if a NEW2 job actually moves them.**

---

## Live processes relevant to this lane

`OBSERVED_BY_EXECUTION` — `Get-CimInstance Win32_Process`, 25 Aug ~10:5xZ.

| pid | ppid | name | what | owner |
| --- | --- | --- | --- | --- |
| 18856 | 21612 | node | `services/harness/src/sidecar-keeper.mjs` | NEW1 |
| 4116 | 18856 | python | `services/embed/gpu/server.py --port 8799` | NEW1 |
| 6480 (+9 children) | 4708 | postgres | local corpus DB, started 12:42 local | shared |

**NEW2 runs ZERO jobs at this moment.** No classifier, no citation-key builder,
no OCR worker, no text-safety screen, no ingest adapter is live. Every
`services/ingest/.checkpoints/*` file is therefore at rest, and any movement in
one during this sprint is mine and will be reported as an output delta.

**The GPU box is NEW1's.** NEW1's sidecar + GPU server are the only heavy
consumers. NEW2 will request a `DB_SCAN` / `DB_WRITE` window on the bus before
any full-corpus pass and will not start one against NEW1's tranche work.

---

## FACTS_OBSERVED

`OBSERVED_BY_LIVE_DB`, counted this session (real `count(*)`, not `n_live_tup`):

```
judgments                  18,698,984
judgment_citations         22,322,063
judgment_citation_keys      1,412,697
documents                           1
```

**`pg_stat_user_tables.n_live_tup` reads 0 or near-0 for every large table on
this database** — statistics have not been re-gathered since the crash. Any
number in this sprint sourced from `n_live_tup` or `reltuples` is wrong by
construction; NEW2 will use exact counts or explicitly-labelled bounded samples.

Carried forward from NEW2's own prior round, each previously OBSERVED and now
treated as `DERIVED` until re-measured on current HEAD:

- body-text evidence corpus state: `PROVEN_DAMAGED` 469,599 · `SCREENED_NO_DAMAGE_FOUND` 1,322,722 · `NEVER_SCREENED` 16,906,647
- resolver false-unique after LCC's key catch-up: 15.63% → 0.00% material
- despatch-stamp keys: 431 → 0; one misspelling class (`ARPIL`) still escapes the gate
- 293 real neutral citations stranded in 9 never-walked ingest batches; total shortfall 734 = 439 correctly-unkeyed stamps + 293 unwalked + 0 lag
- treatment provenance: 95.62% of LAW MOVED edges rest on a reporter headnote; 5 edges are `COURT_REASONING_EXPLICIT`

---

## FACTS_UNVERIFIED (this sprint must not build on these unmeasured)

- whether the 9 never-walked batches are the *only* whole batches skipped
- citation-extraction precision by court / source / era — never measured at scale
- passage legal-role distribution — the study was QUEUED, never run
- whether IPC 1860 / CrPC 1973 / IEA 1872 are held at all in any usable form
- per-adapter freshness: last useful document, parser signature, expected delta band
- whether any mutable suppression/redaction mechanism exists end to end
- decision-identity denominators — the corpus has never been counted in unique authorities

---

## DEPENDENCIES

- **LCC** — `DB_MIGRATION` coordination; resolver correctness freshness is joint (their `RESOLVER_CORRECTNESS_FRESHNESS_V3`, my ingest-side frontier); `check-screened-not-clean.mjs` still needs wiring into the shared `ci-local.mjs`.
- **NEW1** — the 100k tranche frame is the sampling frame for the passage role study; `judgment_embedding_eligibility` (deployed hash `5b5d02384b46c96c`) is theirs and NEW2 does not alter it.
- **FIFTH** — owns the hidden holdout of `ADVOCATE_RETRIEVAL_GOLD_V2`; NEW2 builds train/dev and hands the holdout over unseen.
- **NEW3** — three of NEW2's provenance adjudications are pinned product fixtures (M02/M03/M04). Re-adjudicating any of them trips `FIXTURE_DRIFT` in their test **by design**; NEW2 will announce before touching one.

---

## FILES_YOU_OWN

Write scope this sprint:

```
docs/ai/new2/**            docs/ai/new2-r7/**
services/ingest/**         services/harness/src/n2-*  (NEW2-prefixed only)
scripts/n2-*  scripts/new2-*
packages/db/drizzle/**     ONLY under an announced DB_MIGRATION lease
```

Explicitly NOT written by NEW2: `apps/**` (RCC), `services/api/**` (LCC),
`services/embed/**` (NEW1), `packages/db/drizzle/0083` (LCC's), shared
`ci-local.mjs` without an LCC handoff.

---

## HEAVY_JOBS_YOU_WILL_TOUCH

| job | class | when | progress metric |
| --- | --- | --- | --- |
| data-moat census pass | `DB_SCAN` | needs a window | rows emitted per stratum, checkpointed |
| citation extraction precision sample | `DB_SCAN` (bounded) | no window needed — sampled | labelled rows / target n |
| decision-identity candidate grouping | `DB_SCAN` | needs a window | groups written to a NEW2-owned table |
| passage role sample | `DB_SCAN` (bounded) | no window — sampled from NEW1 frame | classified passages / target n |
| statute adapter fetch | `IO_HEAVY` (external) | anytime, rate-limited | documents with verified official identity |

Every one reports **real output delta** — rows written or rows labelled — never
PID, exit code, checkpoint motion or HTTP 200.

---

## Bounds NEW2 restates and will not cross

no destructive dedup · no resolver mass backfill · no treatment mass promotion ·
no inferred temporal applicability · HTTP 200 + empty ingest is
`FAILED_SOURCE_SHAPE`, never success · no `UNKNOWN` → `CLEAN` in any direction ·
no `git add .` / `-A` / `commit -am` · no shared schema change without an
announced `DB_MIGRATION` lease.
