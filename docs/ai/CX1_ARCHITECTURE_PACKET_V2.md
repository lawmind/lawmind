# CX1 Architecture Packet V2

Status: correction pass complete, 16 Aug 2026. Non-production, zero Railway,
zero paid spend, and no lane-bus modification.

## Evidence Contract

DECISION: every V2 conclusion is labelled VERIFIED, MEASURED-BUT-LIMITED,
ESTIMATE, FUTURE-BENCHMARK, or DECISION.

DECISION: docs/ai/CX1_ARCHITECTURE_PACKET.md remains unchanged as the V1
historical record. V2 corrects it without erasing the mistakes.

## Fixed Strategy

DECISION: the execution order remains:

Railway exit -> maximum data -> clean/normalize -> structured legal objects ->
citation/treatment/statute graph -> document intelligence -> retrieval ->
embedding pilot -> embeddings at measured scale -> premium LawMind.

DECISION: Bronze remains source-in-place where durable, with fragile, unique,
and licensed sources retained.

DECISION: Silver remains Parquet/ZSTD for analysis and rebuilds.

DECISION: Gold remains local PostgreSQL canonical legal truth.

DECISION: object storage remains off-machine backup, fragile-source retention,
provider snapshots, and training/evaluation artifacts.

DECISION: no cloud compute while pre-revenue without external founder approval.

## Correction Register

VERIFIED: V1's four nominal 128 MB, 256 MB, 512 MB, and 1 GB runs did not prove
file-size targets. ROW_GROUP_SIZE affected row groups, and all runs emitted the
same 264 tiny objects.

VERIFIED: the V1 117.88x synthetic ZSTD result is INVALID FOR CAPACITY PLANNING
because full_text repeated a short template. V2 uses the repository's limited
real-text evidence: 20 High Court samples at 6.8 KB raw and 2.0 KB Brotli, plus
the independent 96.4 GB raw and 37 GB Brotli estimate. Neither establishes a
Parquet/ZSTD corpus ratio.

VERIFIED: estimated_get_requests_for_delhi_2024 was zero because V1 omitted the
data.parquet directory level from its filesystem path. V2 counts distinct
filenames after filtering Hive partition columns.

MEASURED-BUT-LIMITED: the corrected bounded proof used 18,000 synthetic rows
and 37,452,000 raw synthetic text bytes. Six appended court/year batches emitted
36 objects; compaction emitted 12; Delhi/2024 objects fell from 6 to 2; every
layout retained all 18,000 rows.

VERIFIED: DuckDB 1.5.5 rejects FILE_SIZE_BYTES combined directly with
PARTITION_BY. V2 applies FILE_SIZE_BYTES separately inside each enumerated
court/year partition. The proof's 1 MB setting is a small mechanics control, not
a production target.

MEASURED-BUT-LIMITED: 256 MiB sequential IO, 64 MiB random IO, and a 25 MB
download establish only basic machine viability. They do not establish
sustained capacity.

VERIFIED: the migration inventory observed PostgreSQL at 103.9 GB, while V1's
row-scaled projections understated the current footprint. V1's 10M, 20.529M,
25M, and 50M PostgreSQL numbers are withdrawn as planning baselines.

## Silver Decision

DECISION: court/year is normally the coarse physical partition.

DECISION: document_class remains a column unless a measured partition is large
enough and selective-read evidence justifies a physical split.

ESTIMATE: 128-512 MiB is the initial acceptable production object-size range,
not a frozen universal target. Real-corpus evidence can change it.

FUTURE-BENCHMARK: a safe representative real-text sample after migration must
measure row-group pruning, object count, parallelism, selective reads, full
scans, temporary space, and compaction cost.

## PostgreSQL Calibration And Backup

DECISION: after LCC restores local PostgreSQL, the calibration gate collects
pg_database_size, total relation size, heap, indexes, TOAST, table populations,
and bytes per document, paragraph, citation, and enrichment before refitting
10M, 20.529M, 25M, and 50M.

ESTIMATE: all PostgreSQL scale projections remain estimate-only until that gate.

DECISION: Stage A uses a full plain pg_basebackup with WAL streamed into the
backup plus continuous WAL archive. Acceptance requires pg_verifybackup, a full
restore into a different data directory, and LawMind smoke tests.

FUTURE-BENCHMARK: Stage B begins only after Stage A succeeds. It compares a full
backup against PostgreSQL 18 incremental pg_basebackup plus continuous WAL,
requires summarize_wal and sufficient wal_summary_keep_time, retains the entire
ancestor chain, reconstructs with pg_combinebackup, verifies, and restores.

VERIFIED: losing any required full or incremental ancestor makes dependent
incrementals unrestorable. pg_combinebackup checks chain relationships but does
not replace pg_verifybackup.

## Cost And Storage

VERIFIED: B2 is cheaper than R2 on raw storage price already.

DECISION: R2 remains the initial provider for operational simplicity: existing
configuration and credentials, zero Internet egress, DuckDB integration, and
small early savings from switching.

DECISION: re-evaluate cold storage at 500 GB, a $10 monthly storage bill, a
materially different restore pattern, larger retention requirements, or an
object-count operational constraint. Do not create a B2 or Hetzner account now.

ESTIMATE: at published storage-only rates, R2 is approximately $1.35/month for
100 GB and $7.35/month for 500 GB after the free tier, before operations or tax.

DECISION: --approve is removed from the cost guard. Approval-required spend must
reference a pre-existing founder artifact that the spend command cannot create.

VERIFIED: the guard validates scope, expiry, provider, purpose, kind, cumulative
amount, and use count, then aggregates task, provider, UTC day, UTC month, active
monthly commitment, and project totals in an append-only JSONL ledger.

DECISION: UNKNOWN or UNBOUNDED cost remains forbidden. A dry run does not
authorize spend; a successful --record is required before a provider action.

### Final Cost-Guard Hardening

VERIFIED 2026-08-16: the global guard now uses meaningful task/provider/day/
month and active-recurring windows; lifetime totals are reporting-only, so
ordinary $0 work remains open. Signed Ed25519 approvals, append-only
AUTHORIZATION/ACTUAL/CLOSE events, and a recoverable owner-identified lock were
added without duplicating R2's existing pre-network enforcement in
`packages/storage/src/spend.ts`. Provider hard caps, runtime guards, global
approval, and billing alerts are explicitly separate layers. See
`docs/COST_POLICY.md` and `docs/COST_INCIDENTS.md`.

## Embeddings

DECISION: no full-corpus embedding and no full paragraph/chunk HNSW.

ESTIMATE: existing HNSW projections are linear capacity estimates derived from
one measured workload, not guaranteed future index sizes.

FUTURE-BENCHMARK: NEW1 decides eligibility, vector count, fp32 versus halfvec,
binary candidate quality, and whether pgvector remains adequate.

DECISION: no Qdrant migration or deployment now.

## Proof Cleanup

VERIFIED: both proof directories were untracked. V2 removed only 1,069 CX1
payload files: 7 bin files, 5 DuckDB files, 1 DuckDB WAL file, and 1,056 Parquet
files.

VERIFIED: exact bytes reclaimed were 2,575,426,674. Five JSON reports totaling
8,584 bytes remain. Scripts, Markdown decisions, and all unrelated files remain.

VERIFIED: before cleanup, every removed payload and its byte length was verified
inside cX1work.zip. The machine-readable cleanup record is
docs/ai/CX1_PROOF_CLEANUP.json.

## Supporting Files

DECISION: the V2 packet is supported by:

- docs/ai/COST_SCALE_MODEL.md
- docs/ai/DATA_TIERING.md
- docs/ai/STORAGE_PROVIDER_BREAKPOINTS.md
- docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md
- docs/ai/EMBEDDING_SCALE_MODEL.md
- docs/COST_POLICY.md
- docs/COST_LEDGER.md
- docs/cost-approvals/README.md
- scripts/cost-guard.mjs
- scripts/cx1-parquet-benchmark.py
- scripts/cx1-hardware-benchmark.py

DECISION: stop after verification. No bus modification, production work,
Railway operation, provider account, or paid service follows this packet.
