# CX1 Architecture Decision Packet

Status: complete for read-only / non-production CX1 lane, 16 Aug 2026.

## Decisions

1. Keep development compute local. Railway should remain $0 routine dependency
   after migration cutover and rollback proof.
2. Keep Gold in local Postgres. Do not turn object storage into the system of
   record.
3. Use Silver Parquet/ZSTD as rebuild and analysis layer. Compact objects before
   upload.
4. Keep AWS Open Data source-in-place. Copy only fragile unique/licensed sources.
5. Use native physical PostgreSQL base backup + WAL first. Defer pgBackRest until
   native restore drill passes.
6. Do not embed the corpus at chunk scale. Use hierarchical embedding benchmark
   later.
7. Use cost guard gates before any paid or recurring spend.
8. Canonical provider identity for CX1 recommendations: Supreme Today AI and
   Supreme AI are the same provider. Existing repo text conflicts; CX1 does not
   modify production schema or source registry.

## Evidence

- Hardware: i7-12700K, 31.7 GiB RAM, RTX 4060 Ti 8 GB, C: NVMe with 672.5 GB
  free, D: HDD nearly full.
- Disk proof: `docs/ai/cx1-hardware-proof/run-20260816-033316/hardware-report.json`.
- Network proof: same report, 25 MB Cloudflare download at 103.82 Mbit/s.
- Parquet proof: `docs/ai/cx1-parquet-proof/run-20260816-033152/benchmark-report.json`.
- Corpus source count: 20,529,202 HC records all years.
- Current frozen migration count: 7,296,068 judgments.
- Object storage prices verified from official/current provider pages.

## Cost

Expected pre-revenue monthly envelope:

| Stage | Expected monthly cloud cost |
| --- | ---: |
| Today after Railway cutover | $0 compute + $2-$8 object storage/backups |
| 20M documents, pre-embedding | $0 compute + $5-$15 object storage/backups |
| Post-embedding pilot | $0 compute + $5-$20 storage; one-time GPU only if approved |
| Full pre-launch corpus | $0 compute + $15-$75 depending provider snapshots |

Keep DeepSeek on already-authorized/prepaid allocations. Use Claude only for
high-value QA and sensitive-class work after pseudonymisation and DPA gate.

## Risks

- Backup is not a backup until restore drill passes.
- Parquet tiny-object explosion if court/year/document_class is used without
  compaction.
- LLM enrichment for every document becomes storage/cost waste before vectors do.
- Full chunk-level embeddings create a RAM/index problem, not merely a GPU bill.
- Bus cannot accept `CX1` without code change; do not modify bus during active
  migration.

## Prioritized Implementation Sequence

1. Finish Railway-to-local cutover verification.
2. Turn on native WAL archive + first base backup locally.
3. Run restore drill and record RTO/RPO.
4. Add Silver Parquet writer in dry-run mode.
5. Add compaction report and object-size guard.
6. Move cold backups to cheapest approved provider when threshold is reached.
7. Run hierarchical embedding benchmark after NEW1 retrieval baseline.
8. Revisit vector store only after measured pgvector failure on LawMind queries.

## Packet Files

- `docs/ai/COST_SCALE_MODEL.md`
- `docs/ai/DATA_TIERING.md`
- `docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md`
- `docs/ai/STORAGE_PROVIDER_BREAKPOINTS.md`
- `docs/ai/EMBEDDING_SCALE_MODEL.md`
- `docs/COST_POLICY.md`
- `docs/COST_LEDGER.md`
- `scripts/cost-guard.mjs`

## Handoff

The lane bus is hard-coded to `LCC`, `RCC`, `NEW1`, `NEW2`, `NEW3`; sending as
`CX1` would require editing bus code during migration. CX1 therefore leaves this
packet as the handoff file rather than impersonating another lane.
