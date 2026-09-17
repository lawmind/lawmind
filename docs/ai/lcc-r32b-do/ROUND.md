# LCC R32B-DO — Gate C on DigitalOcean sgp1

`HEAD_START = 11b49d58` (contains `e9b02d34`; `origin/main` was `e9b02d34`).
`REMOTE_RELEASE_SHA = 27b55fa4`. Backend Gate C passed. RCC (bus 1792) and
FIFTH (bus 1793) have the endpoint.

## Export contract (before any spend)

| defect | proof | fix |
|---|---|---|
| `judgment_paragraphs` missing from `SERVING_TABLES` and from the bounding rule | contract test fails when the table is removed; FK-derived bound check | `1d6ee1bb` |
| restore's own `ORDER_BY` map also lacked it (would fall back to `ctid`) | read | derived from `SERVING_TABLES` |
| checksum `md5(string_agg)` cannot exceed 1 GB | `ERROR: string buffer exceeds maximum allowed length` at 34M rows; paragraphs = 92M | streaming md5, byte-identical on existing packs (tested) |
| checksum and COPY outside a shared snapshot while ingestion writes | read | one exported REPEATABLE READ snapshot |
| 204 GiB uncompressed release vs 159 GiB free | measured | `--gzip` + per-file sha256, verified before TRUNCATE |
| full-row COPY sort would spill ~100 GiB into the live DB's temp | EXPLAIN | `enable_sort = off` for unbounded COPY (`b3c59c1d`) |

Bounded 500-judgment rehearsal passes, plain and gzip. Files:
`bounded-rehearsal*.json`.

## Full export (3 runs)

Runs 1 and 2 failed three hours in with `snapshot ... does not exist`. The
cause was postgres.js's default `max_lifetime` (30–60 min) silently closing
the idle snapshot holder. The server logs no termination. (The workstation's
`idle_in_transaction_session_timeout = 1h` was a second hazard, fixed
first.) Fix: `bca8cb9c`. Run 3 reused the byte-identical `judgments` file only
after recomputing its checksum inside its own snapshot.

`judgments 18,793,342 · 9b81f1ea` · `judgment_paragraphs 92,083,253 ·
7c9805b5` · 72.61 GiB gzip · `TRANSFER_INTEGRITY PASS` (manifest + 8 file
sha256 on the host). File: `full-export.json`.

## Remote restore

`release-restore-cli` ran as the non-superuser owner, with
`GRANT SET ON PARAMETER session_replication_role`, 03:45 → 14:05Z (10 h 20 m).
`RESTORE_VERIFIED`: 8/8 tables match rows and checksums, 0 dangling FKs,
281 valid indexes. Activation gate `ACTIVATE`.

Found during the run: the restore's own pooled connection was also recycled,
so paragraphs and citations loaded without replica mode (FK triggers ran; the
result was still correct). Fix: `c7fcdcea`. Also fixed: the activation gate
read superuser-only `pg_statistic` (`3639361e`), and the USER backup required
superuser (`68c08f1f`).

`REMOTE_PARAGRAPH_EVIDENCE = PASS`: 0 orphans, Reader paragraphs, the search
fallback attached evidence to 10/10 hits, and `2022 INSC 690` resolves
uniquely with 76 paragraphs.

## Serving

API on `s-2vcpu-4gb`, systemd, split mode, no `DATABASE_URL`. That required
`4bd2a179`: `index.ts` needed `DATABASE_URL` for a health ping. Caddy TLS is
at `alpha-api.lawmind.co` (one A record added through the Spaceship API;
nothing else in the zone changed). No public PostgreSQL on either host,
checked from outside.

- **Wrong-role write found and fixed (`f7f532b1`).** `ActivationOutbox` wrote
  the USER table `activation_events` through the corpus handle, and every
  write failed its FK. Verified after the fix: USER rows 8 → 10, 0 corpus
  errors.
- Core HTTPS smoke 20/20 on the full corpus (`remote-smoke*.json`).
- Magic link through Resend → verify → `/me` 200, replay 401.
- USER remote backup → isolated restore → authenticated smoke: PASS.
- A → B → A: shell under B, same `authorityId`/`addedAt`, 409 on a new save,
  87 USER tables byte-identical.

## Gate-S1

| run (all from a cold reset) | p95 ms |
|---|---|
| baseline, 2 workers | 4,774 FAIL |
| fix 1: 3 workers | 4,053 FAIL |
| fix 2: 6 workers | 3,181 FAIL |
| fix 3: post-activation warm-up | **2,748 PASS** (p50 350, p99/max 3,453) |

Pool wait was 0 in every run, and nothing was relaxed. The cost is `ts_rank`
detoasting from a 98 GB TOAST table.

**Known limitation:** 1 of 8 never-seen queries took 3.5 s.

## Teardown

`docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md`. Hard deadline
**2026-09-19T17:57Z**. `ubuntu-s-vikas` was not touched.
