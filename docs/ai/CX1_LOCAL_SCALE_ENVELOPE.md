# CX1 local workstation scale envelope

Date: 2026-08-17  
Owner: CX1 temporary scale lab  
Handoff: LCC + NEW2 + NEW1  
Status: complete on disposable workloads

## Recommended operating envelope

Use a **two-worker ceiling for non-vector heavy database work**: one ingest/result writer plus one citation walker or second writer. Use a **one-worker ceiling during HNSW maintenance**: one vector build, with the other heavy jobs queued. Do not run two HNSW builds concurrently.

The lab remained stable when a 100k HNSW build overlapped one writer or one citation walk, but that is a survivability observation rather than the preferred schedule. Concurrent work caused up to a 15.4% throughput loss and a 36.6% median-latency increase for result writes. The separate capacity run also showed that a 600k fp32 build is much longer and more memory-intensive than 100k, so the safe production-like rule is to serialize vector maintenance.

Practical ceilings:

| Work class | Ceiling | May overlap |
|---|---:|---|
| HNSW build/rebuild | 1 | ordinary light reads; queue ingest, citation walk, and bulk result writes |
| ingest writer | 1 | one citation walker or one result writer |
| citation-key walk | 1 | one ingest writer |
| DeepSeek-result persistence | 1 bulk writer | one ingest writer; this says nothing about model-call compute |
| combined heavy DB jobs | 2 without vector build; 1 with vector build | do not stack an unmeasured third job |

Jobs that should **not** overlap: two vector builds; a full-scale vector build with ingest; a full-scale vector build with a citation-key walk; or a full-scale vector build with bulk result persistence. Also avoid treating actual DeepSeek inference as tested—the lab replayed only result writes and made no model calls.

## Isolation and workload

The run copied 50,000 real documents (276,312,259 binary-COPY bytes) read-only from the local canonical database. It then operated entirely in the disposable PostgreSQL cluster on port 55432.

The replay workloads were:

- indexed random document reads;
- ingest-like 1,000-row COPY batches with hashing;
- a whole 50,000-document citation-key walk;
- representative JSONB/raw-output persistence labelled `deepseek_writes`;
- a production-parameter HNSW build over 100,000 copied fp32 vectors.

Non-vector scenarios ran for approximately 15 seconds. Vector scenarios ran until the 100k build completed. Canonical writes: zero. DeepSeek model calls: zero.

## Solo baselines

| Workload | Measured throughput | p50 / p95 operation latency | Wall time |
|---|---:|---:|---:|
| indexed random reads | 11,248.85 reads/s | 0.068 / 0.153 ms | 15.403 s |
| ingest-like COPY | 2,657.80 rows/s | 381.10 / 681.41 ms per batch | 15.921 s |
| citation-key walk | 1,033,738.94 rows/s | 27.85 / 132.43 ms per 50k walk | 15.421 s |
| simulated result writes | 4,276.77 rows/s | 194.58 / 487.68 ms per batch | 15.406 s |
| 100k fp32 HNSW build | 1,833.85 vectors/s | n/a | 54.530 s workload time |

## Interaction results

| Pair | First workload impact vs solo | Second workload impact vs solo | Peak CPU | Peak aggregate PostgreSQL RSS |
|---|---|---|---:|---:|
| ingest + vector build | ingest −9.65%; p95 +17.80% | build −0.14% time (noise) | 33.3% | 5.01 GiB |
| citation walk + vector build | citation −3.24%; p95 +2.53% | build time +5.77% | 50.4% | 4.74 GiB |
| result writes + vector build | writes −15.43%; p50 +36.61%; p95 +2.84% | build time +0.48% | 38.0% | 4.89 GiB |
| ingest + citation walk | ingest +1.17% | citation +12.85% | 47.8% | 3.37 GiB |
| ingest + result writes | ingest +0.69% | writes −0.12% | 27.6% | 3.63 GiB |

Small positive changes are cache/scheduling noise, not evidence that concurrency accelerates work. The non-vector pairs were stable and showed no errors. The citation-plus-vector case reached the highest CPU and slowed the build; the writer-plus-vector cases imposed the clearest writer penalty.

Across all scenarios CPU peaked at 50.4% and aggregate PostgreSQL process-tree RSS peaked at 5.01 GiB. As in the vector report, process-tree RSS is an upper bound because PostgreSQL processes share mappings. No workload error, paging event, or unresponsive period was observed.

System-wide disk-counter deltas are preserved in the machine result, but background checkpoints and unrelated workstation activity can contribute to them. They are suitable for detecting gross saturation, not for attributing exact bytes to a workload.

## Scheduling recommendation

For routine local operation:

1. Run citation walks alongside a single ingest writer when needed; this pair was stable.
2. Allow ingest and result persistence to overlap at one worker each; measured throughput was effectively unchanged.
3. Reserve an exclusive maintenance window for vector build/rebuild, especially at the existing ~600k population or larger.
4. Drain or throttle bulk result writes before vector maintenance; they experienced the largest overlap penalty.
5. Do not extrapolate the 100k interaction run to multiple vector builds or 1M+ without another disposable test.

This envelope applies to the measured workstation and PostgreSQL configuration. It is not a Railway result and does not reopen infrastructure-provider decisions.

## Reproduction and evidence

```powershell
C:\lawmind\cx1-lab\venv\Scripts\python.exe -u scripts\cx1-local-scale-envelope.py
```

Machine-readable evidence: `docs/ai/cx1-envelope-results/benchmark-results.json`.
