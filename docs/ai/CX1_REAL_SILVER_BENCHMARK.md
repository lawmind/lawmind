# CX1 real Silver benchmark

Date: 2026-08-17  
Owner: CX1 temporary scale lab  
Handoff: NEW2  
Status: complete; synthetic compression figures are not used

## Production recommendation

Use plain Parquet with ZSTD level 9. Physically partition by **court**, keep year and document class as columns, and sort each court's rows by year/date so row-group pruning remains useful. Target 128 MiB objects (64–256 MiB acceptable) and 32 MiB uncompressed row groups.

Do not physically partition by court/year. In the measured sample that layout created 1,354–1,355 tiny objects with a 0.10 MiB median, made random-document reads about 3.6× slower than court partitioning, and did not improve the tested filters. Changing `ROW_GROUP_SIZE` from 32 to 64 MiB or the target object size from 128 to 256 MiB could not make small partition cells into large files.

Compact a court partition when either:

- it has eight accumulated fragments; or
- at least two sub-64 MiB fragments can be merged into a 64–256 MiB target object.

The eight-batch experiment reduced 2,461 files to 1,355 (1.816×) and saved 18.1 MiB, but required 71.855 seconds. Compaction should therefore be batched, not performed per ingest.

## Real sample

The benchmark used 365,588 real LawMind judgments selected read-only with `TABLESAMPLE SYSTEM (5) REPEATABLE (170817)`. It covered 26 courts, 77 years, 17 document classes, and 2,031,993,595 UTF-8 source-text bytes (1.89 GiB).

| Size stratum | Definition | Rows |
|---|---|---:|
| small | under 4 KiB | 265,021 |
| medium | 4–64 KiB | 97,418 |
| large | at least 64 KiB | 3,149 |

The current language enum labelled every sampled row `en`, so it cannot support truthful language stratification. A supplemental Unicode scan on the identical repeatable sample found 2,030 Devanagari-bearing rows (0.555%) and 363,558 without Devanagari. That script-presence proxy is reported explicitly rather than relabelling the data.

The temporary source export was 2.07 GB and took 43.306 seconds. All Parquet objects and source payloads were written below the disposable lab directory and removed after aggregation.

## Layout and compression results

All values below are measured. Compression ratio is source text bytes divided by total Parquet bytes.

| Physical layout | ZSTD | Objects | Parquet bytes | Ratio | Encode MiB/s | Decode MiB/s | Object p50 / max | Row groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| unpartitioned, 128 MiB objects, 32 MiB RG | 3 | 8 | 599,883,335 | 3.387× | 722.67 | 2,283.19 | 72.46 / 126.68 MiB | 60 |
| court, 128 MiB objects, 32 MiB RG | 3 | 104 | 532,655,080 | 3.815× | 168.54 | 2,441.54 | 5.18 / 10.63 MiB | 116 |
| court/year, 128 MiB objects, 32 MiB RG | 3 | 1,355 | 505,122,047 | 4.023× | 26.67 | 2,237.25 | 0.10 / 3.02 MiB | 1,355 |
| court/year, 256 MiB objects, 64 MiB RG | 3 | 1,354 | 505,054,879 | 4.023× | 28.08 | 2,226.26 | 0.10 / 3.11 MiB | 1,354 |
| court/year, 128 MiB objects, 32 MiB RG | 6 | 1,354 | 452,050,411 | 4.495× | 26.47 | 2,202.40 | 0.09 / 2.61 MiB | 1,354 |
| court/year, 128 MiB objects, 32 MiB RG | 9 | 1,354 | 425,000,150 | 4.781× | 24.59 | 2,304.02 | 0.09 / 2.58 MiB | 1,354 |

Level 9 saved 80.1 MiB (15.9%) versus level 3 and 27.1 MiB (6.0%) versus level 6 for the same court/year layout. Its encode throughput was only 7.1% below level 6 while decode throughput was slightly higher in this run. Silver is rebuildable analytical storage rather than an interactive write path, so level 9 is the measured capacity choice.

## Access behavior

| Layout | Full scan | Court/year filter | Year-range + class filter | Random document p50 / p95 |
|---|---:|---:|---:|---:|
| unpartitioned ZSTD 3 | 848.75 ms | 687.53 ms | 5.86 ms | 42.13 / 53.19 ms |
| court ZSTD 3 | 793.70 ms | 52.22 ms | 14.49 ms | 36.07 / 44.70 ms |
| court/year ZSTD 3, 32 MiB RG | 866.18 ms | 88.28 ms | 82.42 ms | 129.67 / 132.60 ms |
| court/year ZSTD 3, 64 MiB RG | 870.45 ms | 88.43 ms | 80.55 ms | 127.59 / 130.33 ms |
| court/year ZSTD 6 | 879.88 ms | 87.96 ms | 80.81 ms | 129.09 / 132.17 ms |
| court/year ZSTD 9 | 841.08 ms | 89.02 ms | 83.91 ms | 130.38 / 133.24 ms |

Court partitioning is the practical balance: it cut the court/year filter from 687.53 to 52.22 ms without the tiny-object fan-out. The unpartitioned year-range/class result was fastest in this particular scan because its eight large files and Parquet statistics matched the predicate; that is evidence to preserve sortable filter columns, not a reason to discard court partitioning.

Random-document access remains tens of milliseconds even in the best layout. Silver should not replace the settled Gold/Postgres serving path.

## Object-size interpretation

`ROW_GROUP_SIZE` is not file size. A writer can place several row groups in one object, but cannot fill a target object when a physical partition contains less data. At 5% sampling, the court layout's median object was 5.18 MiB. A simple 20× full-population projection is approximately 104 MiB median—inside the recommended object band—but this is an **estimate**, not a measured full export. The same projection leaves court/year's 0.10 MiB median near only 2 MiB.

The object writer should therefore roll files by accumulated bytes inside each court, independent of row-group boundaries. It should not interpret a row-group setting as an object-size promise.

## Compaction result

Eight fragmented court/year writes produced 2,461 objects and 522,366,739 bytes in 15.454 seconds. Rewriting them into compact court/year output produced 1,355 objects and 504,292,714 bytes in 71.855 seconds at 26.97 MiB/s. This is the evidence behind the eight-fragment trigger; the recommended production layout should compact within court and aim for the 64–256 MiB object band.

## Reproduction and evidence

```powershell
C:\lawmind\cx1-lab\venv\Scripts\python.exe scripts\cx1-real-silver-benchmark.py
```

Machine-readable evidence: `docs/ai/cx1-silver-results/benchmark-results.json`.

The benchmark is plain Parquet/ZSTD. It does not introduce Iceberg, Spark, a storage-provider change, or a new architecture.
