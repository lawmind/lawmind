# CX1 Data Tiering V2

Goal: support LawMind's data program without weakening citation safety.

## Layer Decision

DECISION: use the following four placements.

| Layer | Contents | Primary home | Secondary home |
| --- | --- | --- | --- |
| Bronze | Raw sources, provider snapshots, acquisition receipts | Source-in-place when durable | Object storage for fragile, unique, or licensed material |
| Silver | Clean normalized analytical and rebuild data | Local Parquet/ZSTD | Cold object storage after compaction and approval |
| Gold | Canonical legal truth and live indexes | Local PostgreSQL | Physical backup plus WAL off-machine |
| Object storage | Backups, fragile sources, provider snapshots, training/evaluation artifacts | R2 initially | Re-evaluate cold provider at documented triggers |

DECISION: object storage is not the canonical database and no cloud compute is
introduced while pre-revenue without founder approval.

## Corrected Parquet Proof

MEASURED-BUT-LIMITED: scripts/cx1-parquet-benchmark.py ran against 18,000
synthetic rows and 37,452,000 bytes of synthetic text with DuckDB 1.5.5. Report:
docs/ai/cx1-parquet-proof/run-20260816-035605-v2/benchmark-report.json.

| Layout | Physical partition | Objects | Delhi/2024 objects | p50 object |
| --- | --- | ---: | ---: | ---: |
| Six appended batches | court/year | 36 | 6 | 497,247 B |
| One over-partitioned write | court/year/document_class | 18 | 3 | 991,671 B |
| Compacted write | court/year | 12 | 2 | 1,485,546 B |

MEASURED-BUT-LIMITED: all three layouts retained 18,000 rows. Compaction reduced
36 objects to 12, and Delhi/2024 selective object count reduced from 6 to 2.

VERIFIED: the V1 Delhi/2024 count of zero was a script path bug. V1 searched
below layout/court=delhi/year=2024, while DuckDB had written below
layout/data.parquet/court=delhi/year=2024. V2 counts distinct filenames from
read_parquet after filtering partition columns, so the count no longer depends
on a guessed directory prefix.

VERIFIED: ROW_GROUP_SIZE controls row groups, not target file size. DuckDB 1.5.5
also rejects combining FILE_SIZE_BYTES directly with PARTITION_BY. V2 therefore
enumerates each court/year partition and applies FILE_SIZE_BYTES to a
single-partition COPY. The 1 MB test setting exists only to expose object-count
behavior on a bounded dataset.

VERIFIED: every synthetic compression ratio from either proof is INVALID FOR
CAPACITY PLANNING and may not size the legal corpus.

## Silver Physical Design

DECISION: court/year is normally the coarse physical partition.

DECISION: document_class remains a column unless a measured court/year partition
is large enough to split and selective-read evidence shows the split is useful.

ESTIMATE: use 128-512 MiB as an initial acceptable production object-size range,
not a universal target. A small final object is acceptable. The range must be
replaced or retained only after a representative real-text benchmark.

DECISION: compact appended batches before cold upload. Monitor object count,
size distribution, row groups per file, and files touched by representative
filters. Never write one object per document.

FUTURE-BENCHMARK: tune object and row-group sizing on a safe representative
real-text sample after migration. Evaluate together:

- row-group predicate pruning;
- object count and request count;
- available read parallelism;
- selective-read bytes;
- full-scan throughput;
- compaction time, temporary space, and rewrite cost.

A larger file can reduce object requests while harming selective reads or
parallelism. No single size wins without those measurements.

## Placement Rules

DECISION: keep durable AWS Open Data source-in-place and store source keys,
hashes, provenance, and extraction method rather than duplicate public objects.

DECISION: copy Bronze only when the source is fragile, unique, licensed,
contractually auditable, or lacks stable public retrieval.

DECISION: Gold is restored from physical PostgreSQL backup plus WAL. Silver is a
rebuild and analytical layer, not the normal Gold restore path.

FUTURE-BENCHMARK: add the Silver writer only after local restore and Stage A
backup acceptance. Dry-run first, then report compaction and selective reads
before any upload.
