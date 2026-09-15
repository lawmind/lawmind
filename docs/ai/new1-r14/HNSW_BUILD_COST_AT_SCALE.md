# THE R10 BUILD-TIME BRACKET DOES NOT DESCRIBE A 7.65M-ROW BUILD

**Lane:** NEW1 · **Measured:** 15 September 2026 · **Status:** correction, with the
measurement that forces it.

---

## What was carried forward, and what it was built on

`docs/ai/new1-r11/hnsw-final-projection.json` projected the final build as:

```
buildTimeBracketHours
  fullyResident_NOT_ACHIEVABLE   0.67
  fullySpilling_512MB_shape      2.91
```

It said, correctly and in its own words, that everything between those endpoints
was *"INTERPOLATED LINEARLY IN RESIDENT FRACTION and is NOT measured"*, and that
*"two points cannot establish the shape of that curve"*. It was right to flag it.
**The curve is worse than linear, and the endpoint itself is wrong.**

Both measured endpoints come from builds of **250,000 and 1,000,000 rows**
(`docs/ai/new1-r10/hnsw-build-measurements.json`). The 2.91-hour "fully spilling"
figure is the 1M-row @ 512MB build's rate (731 rows/s) multiplied out to 7.65M
rows. That multiplication assumes the post-spill insert rate is a CONSTANT. It is
not. It is a function of how big the graph already is.

## What a 7.65M-row build actually does

**Attempt 1 — `maintenance_work_mem = 4GB`, 4 parallel maintenance workers.**
Started 09:51:40Z, cancelled 14:46:01Z after 4h55m at **52.5%** (4,026,507 of
7,673,717 tuples).

The spill notice fired at **1,571,661 tuples**. That is 4096 MiB / 2,731 bytes =
1,571,676 — the R11 bytes-per-vector figure predicted the spill point **to within
15 tuples**, so the memory model is sound and only the rate model is wrong.

Measured rate, each window clean or noted:

| tuples done | tuples/s | window |
| ---: | ---: | --- |
| 0.50M → 0.80M | 2,695 | pre-spill |
| 0.80M → 1.17M | 3,249 | pre-spill |
| 1.61M → 1.68M | 233 | post-spill, no other active backends |
| 4.00M → 4.01M | 31 | post-spill, clean 300 s window |
| 4.02M → 4.03M | **24.7** | post-spill, clean 420 s window |

**The post-spill rate fell 9.4x between 1.6M and 4.0M elements** and was still
falling. At 24.7/s the remaining 3.65M tuples needed **41 hours and rising** — a
straight-line read of the last window, which the trend says is optimistic.

Extrapolating 731 rows/s to 7.65M rows overstates throughput by a factor of ~30
at the four-million mark.

## Why, and the number that decides it

The finished index is 19.52 GiB (7,673,717 x 2,731 B). `shared_buffers` on this
box is 2 GiB. Once the in-memory graph is exhausted, every remaining tuple is
inserted into the on-disk index, and each insert walks `ef_construction = 64`
candidates through a structure more than nine times larger than the buffer pool.

Measured during the slow phase: **58–76 MB/s read at 0.00 avg sec/read, CPU 27%
across five processes.** That is roughly 9,500 random 8 KiB reads per second —
nowhere near the NVMe's ceiling and nowhere near CPU saturation. The build was
limited by **read concurrency**, not by bandwidth, latency or arithmetic.

That diagnosis is what makes the second attempt a different experiment rather
than the same one with a bigger number: more parallel workers should convert
directly into more concurrent random reads.

## Attempt 2 refuted that diagnosis, and the refutation is the finding

**`maintenance_work_mem = 8GB`, 10 parallel maintenance workers** — ten workers
confirmed allocated in `pg_stat_activity`, not assumed. Started 14:48:16Z,
cancelled 15:39:02Z at 41.2%.

The spill fired at **3,144,795 tuples**. Predicted 8192 MiB / 2,731 B =
3,145,346 — **551 tuples out, 0.018%**. The memory model is now confirmed twice
at two different settings, and the bytes-per-tuple constant is exactly the same
2,731 in memory as on disk.

Post-spill rate: **24.2 tuples/s**, against attempt 1's 24.7 tuples/s.

| | attempt 1 | attempt 2 |
| --- | ---: | ---: |
| `maintenance_work_mem` | 4 GB | 8 GB |
| parallel maintenance workers | 4 | 10 |
| resident tuples | 1,571,661 | 3,144,795 |
| **post-spill tuples/s** | **24.7** | **24.2** |
| disk reads/s during slow phase | ~9,500 | **21,818** |
| read throughput | 58–76 MB/s | **180 MB/s** |
| CPU | 27% | 23.7% |

**Two and a half times the workers did 2.3x the disk reads and produced the same
throughput.** That is not a concurrency limit; it is a serialisation point. Once
the in-memory graph is exhausted, the remaining tuples go in through the ordinary
index-insert path, and the extra workers contend on the same structure rather
than making independent progress — they multiply the reads without multiplying
the inserts.

**Parallelism is not the lever. Residency is the only lever.** And pre-spill the
extra workers were actively worse: attempt 1 reached 2,695–3,249 tuples/s on four
workers where attempt 2 held 1,303–1,644 on ten.

## What the build actually requires, and what the box has

7,673,717 tuples x 2,731 B = **19.52 GiB**, and the two spill points make that a
measurement rather than an estimate.

Measured on this box after cancelling attempt 2, with nothing building:

```
RAM total                       31.7 GiB
Available (free + standby)      11.7 GiB
  of which standby cache        11.6 GiB
In use by processes + kernel   ~20.0 GiB
```

During attempt 2, with 8 GiB committed to the build, free physical memory fell to
**4.2 GiB**. So the practical ceiling for `maintenance_work_mem` here is around
11 GiB, which buys 56% residency and leaves 3.35M tuples on a path that runs at
~24/s and slows as the graph grows — **39 hours and rising**.

`shared_buffers` is 2 GiB and raising it is a global PostgreSQL memory change,
which this round is explicitly not permitted to make.

**There is no configuration of this machine that builds this index in a usable
time.** That is a measured conclusion with a mechanism behind it, not an
exhausted one.

## The honest form of the projection

A build-time projection for an HNSW index must state the **resident fraction and
the element count at which the rate was measured**, because the post-spill rate
is a function of graph size and decays inside a single build. A single "hours"
figure derived from a 1M-row run does not transfer to 7.65M rows and must not be
quoted for one.

It must also not be scaled by worker count. Measured here, the post-spill phase
is indifferent to parallelism, and the pre-spill phase was *faster* with fewer
workers.

`hnsw-build-progress.jsonl` records the rate every five minutes for each attempt,
so the curve is an artifact rather than a memory, and
`hnsw-build-attempt1-4gb-4workers.json` / `hnsw-build-attempt2-8gb-10workers.json`
hold each run's own receipt.
