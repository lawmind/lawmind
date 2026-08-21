# CX1 Storage Provider Breakpoints V2

Pricing checked 16 Aug 2026 from official provider pages.

## Verified Rates

VERIFIED: Cloudflare R2 Standard is $0.015/GB-month after 10 GB free, Class A
operations are $4.50/million, Class B operations are $0.36/million, and Internet
egress is free.

VERIFIED: Backblaze B2 is $6.95/TB-month after 10 GB free. Egress is free up to
three times average monthly storage and then $0.01/GB. Its published transaction
allowances make normal object operations inexpensive.

VERIFIED: Hetzner Object Storage is $5.99/month including 1 TB storage and 1 TB
egress, with published excess rates, no extra API request fee, EU locations, and
a 64 KB minimum billable object size. Prices exclude VAT.

Official sources:

- https://developers.cloudflare.com/r2/pricing/
- https://www.backblaze.com/cloud-storage/pricing
- https://www.backblaze.com/cloud-storage/transaction-pricing
- https://docs.hetzner.com/storage/object-storage/overview/
- https://www.hetzner.com/storage/object-storage/

## Storage-Only Estimate

ESTIMATE: using the published rates and excluding operation, retrieval, tax, and
unusual egress charges:

| Stored | R2 Standard | B2 | Hetzner |
| ---: | ---: | ---: | ---: |
| 100 GB | $1.35 | $0.63 | $5.99 |
| 500 GB | $7.35 | $3.41 | $5.99 |
| 1 TB | $14.85 | $6.88 | $5.99 |
| 5 TB | $74.85 | $34.68 | $29.80 |

VERIFIED: B2 is already cheaper than R2 on raw storage price. There is no
mathematical storage-price crossover at 500 GB.

## Provider Decision

DECISION: keep R2 initially because it is already configured, credentials and
integration are known, Internet egress is free, DuckDB can use the S3-compatible
path, and early B2 savings are too small to justify another provider boundary.

DECISION: the R2-until-500-GB rule is an operational-simplicity threshold, not a
price crossover.

DECISION: do not create a B2 or Hetzner account in this pass.

## Re-evaluation Triggers

DECISION: re-evaluate the cold tier when any one occurs:

- stored object volume reaches 500 GB;
- the monthly object-storage bill exceeds $10;
- restore drills show a materially different egress/read pattern;
- retention policy requires substantially more backup history;
- object count or lifecycle operations become an operational constraint.

FUTURE-BENCHMARK: at a trigger, price the actual retained bytes, operation mix,
retrieval volume, restore egress, tax, and staff time. B2 is the default raw-cost
candidate for cold backup; Hetzner is considered when the 1 TB bundle, EU
location, and restore pattern fit.

## Object Shape

DECISION: upload compacted Parquet/ZSTD or tar/zstd objects, not per-document
objects.

ESTIMATE: Silver's initial acceptable object range is 128-512 MiB, subject to
real-corpus tuning. The former 64 MiB p50 gate and universal 256 MiB target are
withdrawn.

FUTURE-BENCHMARK: compare row-group pruning, object count, parallelism,
selective reads, and compaction cost before freezing any object-size policy.
