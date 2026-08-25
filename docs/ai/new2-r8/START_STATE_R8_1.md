# NEW2 — START_STATE_R8_1

**Lane:** NEW2 — corpus / data truth / ingest / source drift / citation-data repair /
passage roles + damage / statutes / OCR.

**Published:** 2026-08-25T16:50Z · session `53b2a879-4ae5-43f2-a316-48284f9af018`
**Protocol:** `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` §2.

---

## 1. Anchors

| item | value | label |
| --- | --- | --- |
| orchestration file | `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` | `MATERIALIZED_BY_NEW2` — see §2 |
| SHA-256 | `ad4c6343178303f443401a34a9b0eb235d37293475bd489985044c705b2263fc` | `OBSERVED_BY_EXECUTION` |
| size | 34,495 bytes, UTF-8 | `OBSERVED_BY_EXECUTION` |
| git HEAD | `9509e78d9a88e6e993d8c1e7631e341f392b36da` | `OBSERVED_BY_EXECUTION` |
| bus high-water | `1234` (`1234--NEW2-to-FIFTH`) | `OBSERVED_BY_EXECUTION` |
| DB | PostgreSQL 18.6 x86_64-windows · `lawmind` @ 127.0.0.1:5432 | `OBSERVED_BY_LIVE_DB` |
| migrations | **87 applied / max id 87 / 87 `.sql` on disk** through `0086_quality_screen_runs` | `OBSERVED_BY_LIVE_DB` |
| NEW2 lease | ACQUIRED 16:47Z, took over from `c28e64c1…` (DEAD) | `OBSERVED_BY_EXECUTION` |
| `HEAVY_BOX` owner | **NEW1** — lease HELD since 16:46:33Z, R8.1 task string | `OBSERVED_BY_EXECUTION` |

### Deltas from NEW2's R7 START_STATE, both material

1. **Migrations reconciled.** R7 recorded **58** rows in `drizzle.__drizzle_migrations`
   against 87 files on disk and called a journal-driven restore release-blocking
   (my bus 1161). It now reads **87/87/87**, independently confirming LCC's 1209
   rather than taking it from their report. `RESOLVED`.
2. **The orchestration file did not exist at HEAD.** See §2.

---

## 2. `CONFLICT_REQUIRES_REMEASUREMENT` — the lock file was not in the repo

`LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` was **absent from the
working tree and from HEAD** when this lane started. It was delivered to NEW2
only as message text. A `find` across the repo for `R8_1` / `ORCHESTRATION LOCK`
/ `HEAVY_BOX` matched **no document**, and no bus message up to 1234 announces one.

NEW2 therefore **materialized it at the repo root from the founder's message
text**, and the SHA-256 above is the hash of that materialization — not of a
file any other lane has seen.

**Consequence other lanes must apply, not work around:** a differing SHA is a
*transcription* difference, not a version difference. The delivered text arrived
with cp1252 mojibake (`Â·`, `â`, `â `, `â¤`); NEW2 repaired those to the
characters they encode (`·`, `—`/`→`/`↓`, `≠`, `≤`) and changed nothing else.
No ownership row, gate, numbered item or prohibition was altered. Any lane whose
hash differs should diff against this file rather than pick a version from
memory; if the founder later lands a canonical copy, that copy wins and this one
is replaced, not merged.

---

## 3. Dirty paths at start

Nine tracked modifications, **none NEW2-owned source**:

```
.agents/bus/leases/LCC.json                               LCC
.agents/jobs/registry.jsonl                               LCC
.agents/logs/new1-sidecar-keeper.8799.lock                NEW1
.agents/logs/new2-hc-classify-resume.err                  NEW2 (log, at rest)
apps/admin/lib/api.ts                                     LCC/RCC
docs/ai/new1-tier-a/stage-embed-summary.json              NEW1
services/ingest/.checkpoints/citation-keys.json           NEW2 (at rest)
services/ingest/.checkpoints/hc-classify.cursor           NEW2 (at rest)
services/ingest/.checkpoints/text-safety-screen-all.json  NEW2 (at rest)
```

plus ~145 untracked `.agents/bus/*.md`.

**NEW2 will stage only paths it wrote, by exact path, under `GIT_COMMIT`.**
The three `services/ingest/.checkpoints/*` files are at rest — no NEW2 job is
running — so any movement in them during R8.1 is mine and will be reported as an
output delta, never as incidental noise.

---

## 4. Running jobs and `HEAVY_BOX`

`OBSERVED_BY_EXECUTION` — `Get-CimInstance Win32_Process`, 16:37–16:50Z.

| pid | created | command fingerprint | owner | class |
| --- | --- | --- | --- | --- |
| 20620 / 31652 / 9820 | 15:36:01 local | `tsx src/tranche-embed-cli.ts` | NEW1 | GPU_HEAVY + DB_WRITE |
| 18856 | 12:55:41 local | `services/harness/src/sidecar-keeper.mjs` | NEW1 | supervisor |
| 4116 | 12:56:09 local | `services/embed/gpu/server.py --port 8799` | NEW1 | GPU |
| 6480 + children | — | local `postgres` | shared | — |

**NEW2 runs ZERO jobs at this moment.** No classifier, no citation-key builder,
no OCR worker, no text-safety screen, no ingest adapter is live.

### HEAVY_BOX progress anchor (durable output, not PID)

`new1_tranche_passages` at 16:50Z: **141,065 passages over 46,200 distinct
judgment_ids**, against NEW1's frozen 81,510-document manifest — **56.68% of
documents**. Recorded so a later reading proves progress or stall by row delta
rather than by GPU%, heartbeat or exit code. NEW1 owns the verdict; this is
NEW2's independent anchor, and FIFTH's §9.4 check has a second witness.

One observation handed to NEW1 rather than interpreted here: at 16:50Z
`pg_stat_activity` for `lawmind` showed **only this lane's own query** — no
connection from the tranche build. Consistent with a GPU-side batch between
flushes; **not** by itself evidence of either progress or stall. It is a reason
to read the row delta, not a finding.

---

## 5. FACTS_OBSERVED this session

`OBSERVED_BY_LIVE_DB`, bounded queries only (NEW1 holds `HEAVY_BOX`).

| fact | value |
| --- | --- |
| `resolver_risk_replay` | **0 rows — EMPTY** |
| synthetic fixture rows, `court = 'Test Court'` | **16** |
| synthetic fixture rows, `source_url LIKE 'test://%'` | **16 — the same 16** |
| FK dependents of `judgments` | 22 constraints; **8 are `NO ACTION`** and will block a delete |

### G4 is confirmed unmet, and it is a release gate

`resolver_risk_replay` is **empty**. R8.1 §5 G4 requires it "nonempty/current"
before safe uniqueness is served, and FIFTH raised the same thing to LCC at
bus 1190. This is §7.4 and it is NEW2's to populate. Recorded as
`CONFIRMED_EMPTY`, not as "pending".

### The fixture predicate danger is now measured, not asserted

R8.1 §0.4 forbids a loose court-name predicate. NEW2 tested how loose is loose:

```
case_title LIKE 'SYNTHETIC%' AND court <> 'Test Court'   ->  8 rows
```

**All eight are real judgments.** They include *Synthetics & Chemicals Ltd. v.
State of U.P.* (1989 INSC 321) — a Constitution Bench authority — plus seven
genuine High Court matters from Bombay, Delhi, Allahabad, Rajasthan and MP, each
with a real AWS Open Data `s3` PDF source URL.

A title-prefix predicate would have deleted a landmark. The two safe predicates
(`court = 'Test Court'`, `source_url LIKE 'test://%'`) independently return the
**same 16 rows**, and the manifest will still be built from **exact IDs**.

---

## 6. FACTS_UNVERIFIED — R8.1 must not build on these

- exact dependent-row counts for the 16 fixture IDs across all 22 FK constraints
- whether the ~24,500 ambiguous materialized pins (G3, sampled 10.6%) survive on
  current HEAD, and their exact population
- passage role/damage distribution at **top-k** on NEW1's actual tranche —
  only the pool base rate has ever been measured
- whether IPC 1860 / CrPC 1973 / IEA 1872 are obtainable from an official
  India Code / Legislative Department / Gazette artifact
- per-source freshness as an executable contract rather than a document
- why `language` is effectively English-only while native text exists
- whether Gold V2's supporting/adverse pairs are semantically honest

---

## 7. Order of work (R8.1 §7, light until NEW1 releases `HEAVY_BOX`)

Prepare-only now — bounded probes, source research, code, dry-runs:

1. §7.1 exact synthetic fixture manifest **(P0)**
2. §7.2 deterministic statute-ref → held-Act linking (G1: 323,524 unambiguous)
3. §7.3 ambiguous materialized citation-pin repair + rollback manifest
4. §7.4 resolver risk replay — **currently empty, G4 blocker**
5. §7.5 shared-neutral primary-source RCA
6. §7.7 actual-tranche top-k passage safety harness
7. §7.8 targeted OCR queue by value priority
8. §7.12 Gold V2 → human-authored Gold V3 lineage
9. §7.15 official IPC/CrPC/IEA source reconciliation
10. §7.17 executable source freshness/drift
11. §7.18 Hindi/language truth
12. §7.9 SCR structural attribution

Execution of the mutating half waits on NEW1's explicit `HEAVY_BOX` release.

---

## 8. Bounds NEW2 restates and will not cross

No destructive dedup · no resolver mass backfill · no treatment mass promotion
(proximity V1 stays DO NOT SCALE) · reporter/editorial is never court reasoning ·
`OTHER_UNKNOWN` is UNKNOWN · missing date verdict is `DATE_UNCHECKED` ·
no `UNKNOWN -> CLEAN` in any direction · HTTP 200 + empty ingest is
`FAILED_SOURCE_SHAPE`, never success · no `git add .` / `-A` / `commit -am` ·
no migration ordinal without an LCC `MIGRATION_SLOT` · no `apps/**`, no
`services/api/**`, no `services/embed/**` · long jobs report durable output at
least every 15 minutes.
