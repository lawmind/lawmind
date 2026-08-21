# CX1 Cost And Scale Model V2

Status: corrected 16 Aug 2026. Non-production. No Railway query was made.

## Evidence Labels

Every conclusion in this document is one of: VERIFIED, MEASURED-BUT-LIMITED,
ESTIMATE, FUTURE-BENCHMARK, or DECISION.

## Current Evidence

VERIFIED: the Railway migration inventory records PostgreSQL 18.4 at 103.9 GB,
with a 74.4 GB logical dump payload, and the target as local PostgreSQL 18.6.
Source: docs/ops/migration/MIGRATION_RUNBOOK.md.

VERIFIED: docs/STORAGE_AUDIT.md measured a 96 GB database at its audit point:
judgments 59 GB, judgment_paragraphs 27 GB, judgment_chunks 9.6 GB, and all
other relations below 1% in aggregate.

VERIFIED: the frozen migration count is 7,296,068 judgments. The AWS High Court
source inventory is 20,529,202 documents, not judgments.

MEASURED-BUT-LIMITED: 20 real High Court texts averaged 6.8 KB raw and 2.0 KB
Brotli, approximately 3.4x compression. A separate extraction estimate yielded
96.4 GB raw and 37 GB Brotli, approximately 2.9x. These are the conservative
existing repository measurements for text capacity. They do not establish
Parquet/ZSTD ratios or whole-database compression.

MEASURED-BUT-LIMITED: the 256 MiB sequential IO, 64 MiB random IO, and 25 MB
download proof is a basic viability smoke test. Cache effects, short duration,
download-only network direction, and absence of object-storage upload mean it is
not a capacity benchmark.

VERIFIED: the V1 synthetic 117.88x ZSTD result is INVALID FOR CAPACITY PLANNING. Its
full_text repeated a short template and cannot represent legal text. It remains
in the V1 report as correction evidence and is not used anywhere in V2.

## V1 Projection Correction

ESTIMATE: V1's 10M, 20.529M, 25M, and 50M PostgreSQL projections materially
understated a currently observed database already near 96-103.9 GB. Those
numbers are withdrawn as planning baselines.

| Corpus point | V2 status | Calibrated PostgreSQL size |
| ---: | --- | ---: |
| 10M | ESTIMATE ONLY | pending calibration gate |
| 20.529M source documents | ESTIMATE ONLY | pending calibration gate |
| 25M | ESTIMATE ONLY | pending calibration gate |
| 50M | ESTIMATE ONLY | pending calibration gate |

The 20.529M source figure counts documents with a measured judgment-share range,
so it must not be relabelled as 20.529M judgments.

## Mandatory Calibration Gate

DECISION: no PostgreSQL capacity number is promoted beyond ESTIMATE until LCC
has completed the local restore and the restored cluster has passed migration
verification.

FUTURE-BENCHMARK: after that restore, collect all of the following locally:

- pg_database_size for the restored database;
- pg_total_relation_size for every user relation;
- heap via pg_relation_size;
- indexes via pg_indexes_size;
- TOAST relation size;
- exact table populations for judgments, paragraphs, citations, chunks,
  statute references, treatment, provenance, and enrichment tables that exist
  in schema truth;
- bytes per document, paragraph, citation edge, and enrichment row;
- free disk before restore, after restore, after indexes, and after one backup.

Reference query shape, to be adapted only to tables confirmed by schema truth:

~~~sql
SELECT pg_database_size(current_database());

SELECT
  n.nspname,
  c.relname,
  pg_total_relation_size(c.oid) AS total_bytes,
  pg_relation_size(c.oid) AS heap_bytes,
  pg_indexes_size(c.oid) AS index_bytes,
  CASE
    WHEN c.reltoastrelid = 0 THEN 0
    ELSE pg_total_relation_size(c.reltoastrelid)
  END AS toast_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY total_bytes DESC;
~~~

FUTURE-BENCHMARK: refit 10M, 20.529M, 25M, and 50M only from the restored
relation sizes and populations. Report component equations, not a single
row-count multiplier.

## Capacity Conclusions

DECISION: Gold remains local PostgreSQL; Silver remains Parquet/ZSTD; Bronze is
source-in-place where durable; object storage is off-machine safety and cold
data, not cloud compute.

ESTIMATE: the current workstation is likely viable for the restored database,
active Silver work, and pilot embeddings, but the smoke test does not prove
sustained ingest, backup, or restore capacity.

FUTURE-BENCHMARK: hardware capacity requires multi-GB sequential IO beyond cache
effects, sustained read and write, upload and download, and long-duration
object-storage throughput. Do not run it while migration is active and do not
incur paid traffic without founder approval.
