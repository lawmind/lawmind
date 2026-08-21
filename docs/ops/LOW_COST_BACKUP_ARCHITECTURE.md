# Low-Cost Backup Architecture For Local PostgreSQL 18.6

Scope: design only. No setting was enabled and no production or Railway
database was queried.

Official PostgreSQL 18 references:

- https://www.postgresql.org/docs/18/app-pgbasebackup.html
- https://www.postgresql.org/docs/18/app-pgverifybackup.html
- https://www.postgresql.org/docs/18/continuous-archiving.html
- https://www.postgresql.org/docs/18/runtime-config-wal.html
- https://www.postgresql.org/docs/18/app-pgcombinebackup.html

## Fixed Constraints

VERIFIED: the migration target is PostgreSQL 18.6 on Windows, loopback-only,
with the data directory at C:/lawmind/pgdata.

DECISION: use PostgreSQL-native physical backup and continuous WAL first. Do not
introduce another backup runtime before a native restore succeeds.

## Stage A: First Safety Baseline

DECISION: Stage A uses a full plain-format pg_basebackup with required WAL
streamed into the backup, plus continuous WAL archiving for point-in-time
recovery. It prioritizes a standalone restorable baseline over saving a few GB.

Planned full backup command after local restore:

~~~powershell
pg_basebackup --host 127.0.0.1 --pgdata "C:/lawmind/backups/base/YYYYMMDD-HHMMSS" --format plain --wal-method stream --checkpoint fast --progress --manifest-checksums SHA256
~~~

VERIFIED: PostgreSQL 18 documents that wal-method stream includes the WAL
generated during backup and makes the output standalone without consulting the
archive, provided the stream succeeds. It uses a second replication connection.

DECISION: continuous WAL archive remains separately required. The archive
command must return zero only after a durable copy succeeds and must not
overwrite an existing segment with different content.

Planned settings, values to be validated locally before enablement:

~~~conf
wal_level = replica
archive_mode = on
archive_timeout = 300s
archive_command = 'powershell -NoProfile -ExecutionPolicy Bypass -File C:/lawmind/scripts/archive-wal.ps1 "%p" "%f"'
~~~

ESTIMATE: archive_timeout 300 seconds supports a five-minute RPO target but can
increase archive volume because partially filled WAL segments still occupy a
full segment. Measure actual WAL rate before freezing it.

DECISION: local archived WAL is not removed until remote read-back is verified,
the retained base backup no longer needs it, and the retention calculation has
been recorded.

### Stage A Acceptance

DECISION: a backup is not accepted until all three pass:

1. pg_verifybackup against the plain backup, including required WAL parsing;
2. a full restore into a different local data directory;
3. LawMind smoke tests against the restored cluster.

The smoke set records PostgreSQL version, extension versions, database size,
relation counts, migration state, representative row counts, citation lookup,
lexical search, and application startup preflight. No Railway shutdown or local
cleanup is tied to a backup before this acceptance gate passes.

MEASURED-BUT-LIMITED: the prior 25 MB download is not restore-throughput
evidence. Stage A records actual backup duration, upload duration, restored
bytes, WAL replay duration, RPO, and RTO.

## Stage B: Scale Optimization

FUTURE-BENCHMARK: begin only after Stage A has one accepted full restore. Do not
enable incremental backup in this pass.

VERIFIED: PostgreSQL 18 incremental pg_basebackup requires WAL summarization.
summarize_wal defaults off. wal_summary_keep_time must retain summaries for the
entire WAL range between the reference backup and the new incremental; missing
summaries cause the incremental backup to fail.

Planned experiment:

1. Enable summarize_wal only in the Stage B test plan.
2. Set wal_summary_keep_time comfortably above the maximum interval between a
   retained ancestor backup and its dependent incremental.
3. Take a full backup with a manifest.
4. Take an incremental using pg_basebackup --incremental=<ancestor manifest>.
5. Retain continuous WAL independently.
6. Run pg_verifybackup on every full and incremental artifact.
7. Reconstruct a synthetic full with pg_combinebackup, oldest ancestor first and
   newest incremental last.
8. Run pg_verifybackup on the combined result.
9. Perform the same full restore and LawMind smoke tests as Stage A.

VERIFIED: an incremental cannot be restored directly. pg_combinebackup requires
the full dependency chain, verifies that the chain relationship is legal, and
does not replace pg_verifybackup's integrity checks.

DECISION: retain a machine-readable chain manifest recording each backup ID,
parent ID, backup manifest checksum, WAL bounds, object keys, creation time, and
verification/restore state.

DECISION: never delete or expire an ancestor full or incremental while any
retained descendant depends on it. Losing one ancestor makes those descendants
unrestorable. Losing required WAL blocks recovery to the intended target even if
the base chain combines.

FUTURE-BENCHMARK: compare full-only versus full plus incremental on backup time,
changed bytes, upload bytes, chain complexity, combine time, restore time, and
operator failure modes. Adopt incremental retention only if it preserves the
Stage A restore gate and materially improves cost or duration.

## Encryption And Off-Machine Copy

DECISION: encrypt before off-machine storage or use an approved encrypted
transport/storage layer. Keep recovery keys outside the bucket and test them in
the restore drill.

DECISION: use R2 first for operational simplicity. Provider changes follow
docs/ai/STORAGE_PROVIDER_BREAKPOINTS.md and the external founder-approval cost
mechanism.
