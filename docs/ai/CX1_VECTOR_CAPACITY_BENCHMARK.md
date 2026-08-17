# CX1 pgvector capacity benchmark

Date: 2026-08-17  
Owner: CX1 temporary scale lab  
Handoff: NEW1  
Scope: infrastructure cost/capacity only; retrieval quality is not tested

## Decision boundary

`halfvec(1024)` is a strong **capacity candidate**, not an approved representation. At the approximately 600k scale it reduced the measured HNSW index from 8,179.71 to 2,726.58 bytes/vector and the TOAST-inclusive table-plus-index footprint from 13,778.58 to 5,571.26 bytes/vector. It also built faster and inserted faster in this run.

NEW1 must test retrieval quality before any representation change. CX1 makes no claim that `halfvec` is semantically equivalent to `vector`, and this report does not select an embedding model.

## Existing population and isolation

The existing read-only population contained 620,300 non-null `vector(1024)` values across 40,161 judgments on pgvector 0.8.5. The current HNSW definition is cosine distance with `m=16` and `ef_construction=64`; its measured index size was 5,073,821,696 bytes (4.725 GiB), or 8,179.63 bytes/vector.

CX1 exported those vectors once with binary COPY, imported them into a second PostgreSQL 18 cluster on loopback port 55432, and removed the copy payload. Export took 58.689 seconds for 2,559,357,821 bytes; import took 12.016 seconds. All index creation, inserts, and dumps happened in that disposable cluster. Canonical writes: zero.

The lab used 2 GiB `shared_buffers`, 2 GiB `maintenance_work_mem`, four parallel maintenance workers, and the production HNSW parameters.

## Raw and indexed representation cost

| Scale | Representation | Raw payload bytes/vector | HNSW bytes/vector | HNSW total | Build time | Query p50 / p95 (`ef_search=40`) |
|---:|---|---:|---:|---:|---:|---:|
| 100k | `vector` fp32 | 4,100 | 8,188.64 | 781.0 MiB | 55.901 s | 1.032 / 1.350 ms |
| 100k | `halfvec` | 2,052 | 2,729.66 | 260.3 MiB | 46.102 s | 0.890 / 1.435 ms |
| 300k | `vector` fp32 | 4,100 | 8,184.49 | 2.287 GiB | 54.642 s | 8.866 / 13.832 ms |
| 300k | `halfvec` | 2,052 | 2,728.18 | 780.5 MiB | 36.222 s | 8.012 / 12.502 ms |
| 600k | `vector` fp32 | 4,100 | 8,179.71 | 4.571 GiB | 403.253 s | 6.617 / 11.200 ms |
| 600k | `halfvec` | 2,052 | 2,726.58 | 1.524 GiB | 80.300 s | 5.754 / 9.804 ms |

Each query figure is 40 copied-vector probes returning 10 neighbors. This is an infrastructure latency sample, not a relevance evaluation. The non-monotonic build and query times show warm-cache, table order, and parallel-build effects in this single pass; do not fit a latency curve from them.

## TOAST-inclusive storage overhead

The main result file's per-run `heapBytes` uses PostgreSQL `pg_relation_size`, which excludes TOAST. CX1 therefore added an explicit `pg_table_size` observation before extrapolating:

| Measured structure | Rows | Table including TOAST | HNSW index | Combined bytes/vector |
|---|---:|---:|---:|---:|
| existing/copied fp32 | 620,300 | 3,473,031,168 B (5,598.95/vector) | 5,073,821,696 B (8,179.63/vector) | 13,778.58 |
| disposable `halfvec` | 600,000 | 1,706,803,200 B (2,844.67/vector) | 1,635,950,592 B (2,726.58/vector) | 5,571.26 |

The table cost exceeds the raw payload because PostgreSQL stores out-of-line values with tuple, page, and TOAST overhead. For capacity planning, use the combined TOAST-inclusive figure—not base heap and not the 4,100/2,052-byte payload alone.

Measured index overhead was exceptionally stable across scale: fp32 ranged 8,179.71–8,188.64 bytes/vector; `halfvec` ranged 2,726.58–2,729.66. The existing fp32 index agreed with the disposable 600k result to within 0.01%.

## Incremental insert cost

Every structure received 10,000 additional copied vectors after build.

| Scale | Representation | Insert rows/s | Index growth | Approx. index growth/vector |
|---:|---|---:|---:|---:|
| 100k | fp32 | 344.07 | 81,829,888 B | 8,183 B |
| 100k | `halfvec` | 366.11 | 27,271,168 B | 2,727 B |
| 300k | fp32 | 270.32 | 81,756,160 B | 8,176 B |
| 300k | `halfvec` | 319.74 | 27,254,784 B | 2,725 B |
| 600k | fp32 | 155.12 | 81,747,968 B | 8,175 B |
| 600k | `halfvec` | 282.79 | 27,254,784 B | 2,725 B |

At 600k, fp32 incremental throughput was 45.1% lower than `halfvec` in this run. Insert cost declines with index size, so bulk build/compaction windows remain preferable to unconstrained concurrent inserts.

## RAM observation

The benchmark sampled aggregate RSS across the PostgreSQL process tree. Because PostgreSQL processes map shared buffers, summing their RSS double-counts shared pages and is an **upper bound**, not physical RAM consumed. The recorded upper-bound peaks were:

| Scale | fp32 aggregate RSS peak | `halfvec` aggregate RSS peak |
|---:|---:|---:|
| 100k | 2.25 GiB | 3.55 GiB |
| 300k | 12.02 GiB | 9.41 GiB |
| 600k | 22.48 GiB | 13.91 GiB |

During the 600k fp32 build, an independent OS observation showed at least about 11.95 GiB free of 31.75 GiB. The workstation did not page or become unresponsive. This supports a stable single-build envelope, not multiple simultaneous builds.

## Backup impact

Custom-format logical dumps were taken after each 10k incremental insert. They contain table data and index DDL, but not built HNSW pages.

| Nominal scale | fp32 dump bytes / time | `halfvec` dump bytes / time |
|---:|---:|---:|
| 100k | 548,182,199 / 75.433 s | 481,740,631 / 69.375 s |
| 300k | 1,544,883,462 / 209.015 s | 1,357,618,034 / 195.336 s |
| 600k | 3,040,005,983 / 410.074 s | 2,671,521,150 / 383.201 s |

The last dump actually contains 610k rows because it follows the incremental insert. A physical backup must also carry HNSW pages, so the TOAST-inclusive table-plus-index capacity below is the appropriate physical planning figure.

## Labelled storage estimates

These are **linear extrapolations**, not measured databases. They multiply the measured ~600k per-vector table and index costs and exclude free-space headroom, WAL, temporary build space, other columns/indexes, and backup duplication. Production provisioning should add at least 30% operating headroom plus space for one rebuild/backup strategy.

| Vectors | fp32 table | fp32 HNSW | fp32 combined | `halfvec` table | `halfvec` HNSW | `halfvec` combined |
|---:|---:|---:|---:|---:|---:|---:|
| 1M | 5.21 GiB | 7.62 GiB | 12.83 GiB | 2.65 GiB | 2.54 GiB | 5.19 GiB |
| 5M | 26.07 GiB | 38.09 GiB | 64.16 GiB | 13.25 GiB | 12.70 GiB | 25.94 GiB |
| 10M | 52.14 GiB | 76.18 GiB | 128.32 GiB | 26.49 GiB | 25.39 GiB | 51.89 GiB |

No build-time or latency estimate is offered at 1M/5M/10M because the measured timings were not monotonic and would make such extrapolation misleading.

## NEW1 handoff

If NEW1's quality evaluation approves `halfvec`, it can cut the measured combined vector-table/HNSW footprint by about 59.6% at this dimension and configuration. NEW1 should test recall/relevance on the same query set and operating `ef_search` values before approval. Until then, capacity plans must assume fp32.

## Reproduction and evidence

```powershell
C:\lawmind\cx1-lab\venv\Scripts\python.exe -u scripts\cx1-vector-capacity.py
```

Machine-readable evidence: `docs/ai/cx1-vector-results/benchmark-results.json`.
