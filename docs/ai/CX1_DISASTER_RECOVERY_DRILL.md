# CX1 Disaster Recovery Drill

Generated: **2026-08-17T14:21:22.607Z**

## Scope

Workstream L prepared-not-run checkpoint. This artifact converts the existing backup architecture into a concrete restore-drill checklist and a bounded smoke SQL for a future disposable restored cluster. It does not download R2 objects, run PostgreSQL backup/restore commands, start a restored server, query Gold, or change production state.

## Source Evidence

| Source | Hash | Role |
|---|---|---|
| `docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md` | `e839264ddbd5cf38...` | Stage A/Stage B backup acceptance design |
| `docs/ai/CX1_ARCHITECTURE_PACKET_V2.md` | `e25aaef9c43d35f5...` | CX1 architecture correction and backup policy source |
| `docs/ops/migration/compare-final.json` | `af903544499ee582...` | current local migration comparison baseline |
| `docs/ops/migration/smoke-local.json` | `50db335d11de219b...` | current local LawMind smoke baseline |

## Prepared Outputs

- Machine plan: `docs/ai/cx1-disaster-recovery-drill/drill-plan.json`
- Acceptance checklist: `docs/ai/cx1-disaster-recovery-drill/acceptance-checklist.csv`
- Restore-smoke SQL: `docs/ai/cx1-disaster-recovery-drill/restore-smoke.sql`

## Acceptance Gate

A backup is not accepted by CX1 until all of these have evidence from a restored disposable cluster:

- L0-source-selection: Identify exact accepted base backup ID, object keys, backup_manifest path, WAL start/end, and encryption/key procedure.
- L1-object-readback: Download or mount backup objects from R2 into CX1 disposable storage and hash every object against the source manifest.
- L2-pg-verifybackup: Run pg_verifybackup against the plain base backup, including WAL parsing.
- L3-disposable-restore: Restore into a different data directory under C:/lawmind/cx1-lab/dr-restore and start on a non-production port.
- L4-restored-smoke-sql: Run restore-smoke.sql only against the restored cluster, not Gold.
- L5-compare-to-baseline: Compare extension versions, relation estimates, migration state, representative counts, generated columns, citation lookup, full-text search, vector readiness, and application preflight.
- L6-rto-rpo: Record backup readback duration, verify duration, WAL replay duration, restored bytes, disk peak, RTO, and effective RPO.
- L7-cleanup: Stop restored cluster and remove only CX1 disposable restore paths after evidence is written.

## Existing Relevant Evidence

- Migration compare baseline: 0 fail / 2 warn / 1 info, compared at 2026-08-17T01:59:41.871Z.
- Local smoke baseline: 11 pass, 1 fail, 1 informational/null.
- The local smoke full-text GIN-index choice failure is carried as a known baseline caveat, not treated as DR evidence yet.

## Not Yet KNOW

- R2 object readback throughput, restored bytes, WAL replay duration, RTO, and RPO are not measured by this offline pass.
- File identity or a migration compare is not a substitute for a restore drill.
- The smoke SQL must be run only against the restored disposable cluster on a non-production port.

## Boundary

Offline Workstream L only: no R2 download, no provider operation, no pg_basebackup, no pg_verifybackup, no restore, no pg_ctl, no PostgreSQL query, no production write, and no Gold cleanup.
