# GATE C — COST FIT AND EXACT REMOTE SIZING (LCC R32A)

**16 September 2026. Zero-spend round. `PAID_INFRA_CREATED = NO`.**

Written for whoever runs R32B, which may be a fresh agent. Every number below
comes from the live accepted database or from a vendor page read today. Evidence
is in [`../ai/lcc-r32a/`](../ai/lcc-r32a/), and
[`gate-c-sizing.json`](../ai/lcc-r32a/gate-c-sizing.json) holds the computed
result. Rerun:

```bash
pnpm exec tsx scripts/lcc-r32a-footprint.mjs      --out docs/ai/lcc-r32a   # catalogue sizes
pnpm exec tsx scripts/lcc-r32a-export-sample.mjs  --out docs/ai/lcc-r32a   # export bytes + gzip
pnpm exec tsx scripts/lcc-r32a-io-snapshot.mjs    <file>                   # block I/O, before/after
node scripts/lcc-r32a-cost-model.mjs              --dir docs/ai/lcc-r32a   # plan fit + cost
```

---

## 0 · The decision

|                       |                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CORPUS**            | Hetzner Singapore **CPX52** (12 vCPU, 24 GB RAM, 480 GB local NVMe), plus a **300 GB Cloud Volume** used only to stage the export. Delete the volume as soon as the restore is verified. |
| **API + USER**        | Hetzner Singapore **CPX22** (2 vCPU, 4 GB RAM, 80 GB). USER Postgres and the API run on this one VM.                                                                                     |
| **Network**           | One Hetzner private network. The API reaches both databases by private IP. The corpus VM runs no public service.                                                                         |
| **Run window**        | **72 hours maximum.** If the restore is not verified by T+36 h, stop and tear down.                                                                                                      |
| **Delete**            | Both VMs, the volume and both IPv4s, immediately after the evidence is preserved (§6).                                                                                                   |
| **Projected 72 h**    | **$26.08 net.** Worst case $33.31, with the volume price doubled and 18% GST added.                                                                                                      |
| **Authorisation cap** | **USD 40.00**, one-time.                                                                                                                                                                 |

`TARGET_MET = YES`: under the $40 target and under the preferred $30.

---

## 1 · What was measured (live `lawmind`, PostgreSQL 18.6)

|                                          | GiB                          | how                                                     |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| whole database                           | **343.005**                  | `pg_database_size`                                      |
| corpus-role tables (all)                 | 324.377                      | `db-roles.ts` partition                                 |
| **USER-role tables (44)**                | **0.041**                    | same                                                    |
| **Gate-C required set**                  | **250.097**                  | 7 `SERVING_TABLES` + `judgment_paragraphs`              |
| export manifest only (7 tables)          | 157.030                      | `release-export-cli.ts` `SERVING_TABLES`                |
| deferred (chunks, vector stage, tranche) | 59.156                       | not carried                                             |
| **export, plain COPY**                   | **204.286**                  | sampled COPY, scaled                                    |
| **export, gzip -6**                      | **67.242**                   | same                                                    |
| **USER backup (`pg_dump -Fc`)**          | **0.0037** (4,017,236 bytes) | shipped `lcc-user-backup.mjs`, restore VERIFIED in 10 s |
| WAL directory                            | 2.0                          | `pg_ls_waldir`                                          |

Locally the two planes share one database: `DB_SPLIT_MODE` is unset in `.env`.
The plane sizes above are the `db-roles.ts` split of that one database, not two
physical databases.

### Largest relations (heap / indexes / TOAST / total, GiB)

| relation                         | class                                      | heap  | idx   | toast | total      |
| -------------------------------- | ------------------------------------------ | ----- | ----- | ----- | ---------- |
| judgments                        | CURRENT_V1_REQUIRED                        | 21.54 | 30.53 | 99.22 | **151.30** |
| judgment_paragraphs              | CURRENT_V1_REQUIRED_NOT_IN_EXPORT_MANIFEST | 56.41 | 16.23 | 20.41 | **93.07**  |
| new1_doc_vector_stage            | DEFERRED_CAPABILITY_DATA                   | 2.13  | 0.43  | 42.07 | 44.63      |
| judgment_chunks                  | DEFERRED_CAPABILITY_DATA                   | 1.09  | 4.77  | 3.27  | 9.14       |
| new1_probe_hnsw_1000000          | PRESENT_BUT_NOT_REQUEST_PATH               | 0.08  | 2.54  | 5.15  | 7.77       |
| new1_tranche_passages            | DEFERRED_CAPABILITY_DATA                   | 0.05  | 3.19  | 2.15  | 5.39       |
| judgment_citations               | CURRENT_V1_REQUIRED                        | 2.14  | 3.06  | 0     | 5.20       |
| embedding_content_representative | PRESENT_BUT_NOT_REQUEST_PATH               | 1.07  | 1.69  | 0     | 2.77       |
| judgment_statute_refs            | CURRENT_V1_REQUIRED                        | 0.16  | 0.27  | 0     | 0.43       |
| statute_sections                 | CURRENT_V1_REQUIRED                        | 0.05  | 0.01  | 0.02  | 0.08       |

Largest indexes: `judgments_full_text_idx` (GIN) 16.50 · `judgment_chunks_embedding_hnsw`
4.73 (deferred) · `judgment_paragraphs_judgment_idx` 4.62 · `judgment_paragraphs_unique`
4.62 · `judgments_source_url_key` 4.18 · `judgment_paragraphs_number_idx` 3.71 ·
`judgment_paragraphs_pkey` 3.29 · `judgments_case_title_trgm` 2.34 GiB.

Class totals: REQUIRED 157.03 · REQUIRED-NOT-IN-MANIFEST 93.07 · DEFERRED 59.16 ·
PRESENT-NOT-REQUEST-PATH (47 relations) 15.12 · USER 0.04 · UNKNOWN (2) 0.003.
Nothing was deleted, and nothing was left out because semantic search is off.

### Working set (RAM)

A pinned Gate-S1 query set (60 requests) was run against the live local API while
`pg_statio` counters were snapshotted before and after. An idle window of the
same length was measured as a baseline.

| window | blocks touched (upper bound) | read from OS |
| ------ | ---------------------------- | ------------ |
| load   | 19,563 MiB                   | 11,056 MiB   |
| idle   | 23 MiB                       | 2 MiB        |

The load window produced all of the I/O. Distinct blocks touched are at most
OS reads plus shared_buffers, so **≤ 12.8 GiB**. Most of it is `judgments`
TOAST (the stored `full_text_tsv`) and heap. The local probe's p95 was
1,437–1,721 ms across three runs, on a 31.7 GiB contended workstation with
`shared_buffers = 2GB`. That is **not** a Gate-S1 number.
Evidence: `io-delta-load.json`, `io-delta-idle.json`, `io-probe/`.

### API

- The live local API (pid 19208) was sampled every second while 60 requests
  ran. Peak resident memory was **308 MiB** (commit charge 1,563 MiB). This was
  a `tsx` development process.
- Pools (`pools.ts`): corpus 8 core + 6 research = **14** connections; USER
  8 + auth 2 = **10**.

---

## 2 · Disk

**Corpus, local disk:** (250.1 restored + 4 WAL + 16 temp + 10 OS/PG) × 1.15 = **322.1 GiB**.

- The restored size is the source's own size, bloat included. `judgments` has
  a dead-tuple ratio of 0.078, so a fresh load should come in smaller. That
  margin is kept, not spent.
- Temp covers the largest btree (4.62 GiB) times three, with a 16 GiB floor.
  `ANALYZE` needs no meaningful disk.

**Staging:** `release-restore-cli.ts` reads plain `.copy` files from disk
(`createReadStream`). The plan is to pull one `.gz` at a time, decompress it and
delete the `.gz`. Peak = 204.3 plain + 35.7 largest `.gz` = 240 GiB, × 1.1 =
**264 GiB**, which is a **300 GB volume** (279 GiB). Volume throughput is 200 MB/s
sustained per Hetzner's docs, so reading 204 GiB takes about 17 min of I/O.

**CORPUS_MIN_DISK_GIB = 322.1 local + 264 staging = 586.1.**

**USER/API:** (0.041 + 10 × backup + 10 OS/PG + 3 app + 2 logs) × 1.15 = **17.3 GiB**.
CPX22 has 74.5 GiB.

## 3 · Plan fit (Hetzner SIN, net USD)

Hetzner's "GB" is decimal and is converted to GiB below.

| plan  | vCPU | RAM GiB | disk GiB | $/h    | cap/mo | DB fits            | DB + staging fit | RAM ≥ working set |
| ----- | ---- | ------- | -------- | ------ | ------ | ------------------ | ---------------- | ----------------- |
| CPX22 | 2    | 3.7     | 74.5     | 0.0497 | 30.99  | –                  | –                | –                 |
| CPX32 | 4    | 7.5     | 149      | 0.0929 | 57.99  | no                 | no               | no                |
| CPX42 | 8    | 14.9    | 298      | 0.1763 | 109.99 | **no** (298 < 322) | no               | marginal          |
| CPX52 | 12   | 22.4    | 447      | 0.2540 | 158.49 | **yes**            | no               | yes               |
| CPX62 | 16   | 29.8    | 596      | 0.3253 | 202.99 | yes                | yes              | yes               |

In selection order, CPX32 fails on disk and RAM, and CPX42 fails on disk.
Putting the database itself on a volume was not considered: 5,000 sustained
IOPS behind a cold 12.8 GiB working set is not a credible path to a 3 s p95.
CPX52 is the first plan whose local disk holds the database. It then needed
staging space, so the two ways to get it were priced over 72 h:

| option                    | 72 h       |
| ------------------------- | ---------- |
| **CPX52 + 300 GB volume** | **$26.08** |
| CPX62, no volume          | $29.06     |

**CPX52 + volume wins.** It still wins if the unverified volume price doubles
(+$2.15). CPX52 at 22.4 GiB RAM leaves roughly 15 GiB of page cache and
5.6 GiB of `shared_buffers`, which covers the ≤12.8 GiB working set.

**USER/API: CPX22.** RAM budget: OS 450 + Postgres 704 (512 MB buffers plus
12 backends × 16 MB) + API 1,024 (3.3× the measured peak) + backup tooling 150
= **2,328 of 3,815 MiB**.

## 4 · Cost

All figures are net of VAT. Hourly billing runs up to each resource's monthly
cap.

|                                             | 24 h      | 72 h                     | 7 d       | month (hypothetical) |
| ------------------------------------------- | --------- | ------------------------ | --------- | -------------------- |
| COMPUTE (CPX52 + CPX22)                     | 7.29      | 21.87                    | 51.02     | 189.48               |
| STORAGE — volume 300 GB                     | 0.72      | 2.15                     | 5.02      | 20.08                |
| STORAGE — R2 staging (67.2 GiB, flat month) | 0.86      | 0.86                     | 0.86      | 0.86                 |
| IPv4 × 2 (flat month, $0.60 each)           | 1.20      | 1.20                     | 1.20      | 1.20                 |
| NETWORK                                     | 0         | 0                        | 0         | 0                    |
| **TOTAL**                                   | **10.06** | **26.08**                | **58.10** | **211.61**           |
| TAX/VAT                                     | UNKNOWN   | ×1.18 if 18% GST applies |           |                      |

**Assumptions, stated rather than hidden:**

- **Volume price is UNVERIFIED.** No Hetzner page reachable today prints it.
  The figure used is €0.0572/GB-month from a third party (costgoat, updated
  5 Sep 2026), converted at Hetzner's own SIN USD/EUR ratio. The hourly rate
  divides by 672 h, which overstates it. Hetzner's docs do confirm volumes are
  billed hourly with a monthly cap.
- **IPv4** is charged as a full month for each address. Hetzner's docs say
  unattached Primary IPs are also billed, so the runbook deletes them.
- **Network:** Singapore includes 1 TB (CPX22) and 4 TB (CPX52). Gate-C egress
  is JSON responses plus a 4 MB backup. The private network carries corpus
  traffic. Pulling from R2 has no egress fee.
- **No Hetzner backups or snapshots.** Backups add 20% of the server price and
  are not needed here: the USER backup goes to R2 and the corpus rebuilds from
  the export.

## 5 · Failure domains, and API colocation

- **The two databases are separate.** CORPUS Postgres runs on the CPX52 and USER
  Postgres on the CPX22: separate VMs, disks and clusters. So their
  `system_identifier` values differ, and `/ready`'s `rolesDistinct` check and
  `verifyDistinctDatabases` can prove the split. A lost corpus VM is a re-restore.
  A lost USER VM is recovered from the R2 USER backup (4 MB, restore rehearsed
  today in 10 s).
- **`API_USER_COLOCATION = YES`, on four conditions:**
  1. **`USER_DATABASE_URL` must use the CPX22's private-network IP, with
     `LAWMIND_ALLOW_PRIVATE_DB_HOST=1`.** `serving-contract.ts` refuses
     `localhost`, `127.0.0.1` and the VM's own hostname in staging. This is
     correct behaviour, not a workaround. USER Postgres listens only on the
     private interface, and `pg_hba` admits only the private subnet.
  2. The API runs under systemd with `MemoryMax=1536M` and `CPUWeight=50`, and
     Postgres gets `CPUWeight=200`. This keeps the API from starving USER
     Postgres. At the measured load, the API's 308 MiB peak and 10 USER
     connections are far below the 3.8 GiB machine.
  3. `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` = the workstation's identifier.
     It is required by the contract.
  4. The USER backup runs from the CPX22 and ships to R2 single-stream,
     independent of the corpus.

---

## 6 · Runbook — R32B, only after the founder authorises §8

**Before ordering anything (on the workstation):**

1. Resolve blocker B1 (§9).
2. `release:export` to a local directory. Gzip each `.copy` file and upload to
   R2 with `rclone --transfers 1 --multi-thread-streams 0`. Record the sha256
   of each file.
3. Read the workstation's `system_identifier` for the forbidden-identifier list.

**Order:** one private network · CPX22 · CPX52 · a 300 GB volume attached to the
CPX52. Location `sin`, and **"delete Primary IP with server" enabled**. Start the
clock.

**Restore (CPX52):**

1. Install Postgres 18 and pgvector 0.8.5.
2. Set `max_wal_size=4GB` and `shared_buffers=5GB`.
3. Run the migrations.
4. Per table: download the `.gz` to the volume, decompress it, delete the `.gz`.
5. Run `release:restore`. It performs verify, ANALYZE and the activation gate,
   in that order.
6. **Do not build HNSW.**
7. Unmount, detach and **delete the volume** once `RESTORE_VERIFIED`.
8. **Stop rule:** if not verified by T+36 h, tear down (§7). Cost at that point
   is about $14.07 net.

**USER/API (CPX22):**

1. Install Postgres 18 and run the migrations against the USER database.
2. Start the API with the §5 environment.
3. Check that `/ready` reports `rolesDistinct: true`.
4. Run `lcc-user-backup.mjs`, ship the result to R2, then run
   `lcc-r28-user-backup-restore.mjs`.

**Gate S1:** run
`node scripts/lcc-staging-gate-s1.mjs --api https://… --corpus-url … --phase-log … --repeat 3 --out docs/ai/<round>`.

## 7 · Teardown checklist, after the evidence is preserved

Keep **before** deleting anything:

- [ ] `staging-gate-s1.json`, phase log, `/ready` and `/version` bodies,
      restore verdict — committed to `docs/ai/<round>/`
- [ ] USER backup in R2, and `lcc-offsite-restore-proof`-style proof that the R2
      copy restores
- [ ] remote restore proof (`RESTORE_VERIFIED` output, manifest, timings)
- [ ] the deployed env **names** (no secret values), systemd units, `pg_hba`
      and `postgresql.conf` deltas — copied into `docs/ops/`
- [ ] release manifest and export checksums

Delete:

- [ ] CPX52 corpus VM
- [ ] CPX22 API/USER VM
- [ ] 300 GB volume, if still present
- [ ] both Primary IPv4s: check the Primary IPs list is empty (unattached IPs
      still bill)
- [ ] private network (free, but remove it)
- [ ] snapshots and backups: confirm there are none
- [ ] R2 export `.gz` objects (optional, about $0.86/month). **Keep** the USER
      backup and manifests.

Verify: the Hetzner project's resource list is empty, and the next invoice
preview shows no running items.
**`REMOTE_ALPHA_IDLE_MONTHLY_COMPUTE = $0`.**

Never delete: the offsite USER backup, Gate-C evidence, deployment
configuration, or release manifests.

## 8 · Founder authorisation needed

> **"I authorise LCC R32B to create, in Hetzner Cloud Singapore, one CPX52
> corpus VM with one temporary 300 GB volume and one CPX22 API+USER VM on a
> private network, for at most 72 hours, with a hard one-time spend cap of
> USD 40.00 (projected USD 26.08 net), and to delete all of it once the Gate-C
> evidence is preserved."**

Hetzner is not in the CLAUDE.md §4 stack ("Railway Postgres"). This sentence
also authorises Hetzner as a temporary vendor. **No account exists** and no
token is in the environment (the API returned 401 without one), so R32B needs
the founder's Hetzner account and API token.

## 9 · Blockers and corrections for R32B

- **B1 — the export manifest does not carry `judgment_paragraphs`, but the live
  request path reads it.**
  - `search/retrieve.ts` `fillParagraphFallback` queries it on every search.
    `release-export-cli.ts` `SERVING_TABLES` omits it, so a remote restore gets
    an empty table from the migrations.
  - Nothing errors. Sparse-only results silently lose their operative-paragraph
    evidence, so a Gate C run would measure a lighter product than accepted
    local v1.
  - This round sized **for inclusion** (the larger case, +93 GiB). Adding the
    table to `SERVING_TABLES` is a change to a product-owned path, outside this
    round's paths. It needs its own round or a founder call. **Resolve before
    exporting.**
- **B2 — full-scale restore duration has never been measured.**
  - The only restore rehearsals loaded 500 judgments.
  - The migrations build indexes before the load, so COPY writes into three
    GIN indexes and many btrees across 110 M rows.
  - Hours are plausible and **unverified**. The T+36 h stop rule bounds the
    cost, not the risk.
- **B3 — Gate C on a Hetzner-hosted API is not the settled API provider.**
  - `REMOTE_ALPHA_PACKAGE.md` §0 records the API tier as SETTLED on Railway
    (Singapore). This topology measures a Hetzner API, as directed.
  - If production keeps the API on Railway, this Gate-S1 number does not cover
    the Railway→Hetzner hop.
  - Singapore does resolve the EU-region conflict that §0 raised.
- **C1 — the collation will change.** The source is Windows
  `English_United States.1252`; the target will be `en_US.UTF-8`. This is
  already handled: the restore rebuilds indexes and the export sorts by
  `COLLATE "C"`.
- **Local number is not a gate.** The p95 figures here are
  `LOCAL_*_PROBE_NOT_A_GATE`.

## 10 · Permanent pre-revenue beta — NOT AUTHORIZED, NOT PROVISIONED

- **Hetzner SIN:** the measured requirement (≥322 GiB local NVMe, about 24 GB
  RAM) steadies at **CPX52 + CPX22 = $189.48/month + IPv4**, with no staging
  volume.
- **That exceeds the ~$100/month constraint.** No smaller Hetzner SIN plan
  holds this corpus on local disk.
- **E2E Cloud India: UNVERIFIED.** E2E's docs confirm CPU compute prices
  changed on **1 August 2026**. The live calculator renders no figures to a
  non-browser fetch, and this round refused to use the pre-August C3/M3 numbers.

**CHEAPEST_MEASURED_PLAUSIBLE_STEADY_STATE = Hetzner SIN CPX52 + CPX22,
$189.48/month net.** It is above the constraint.

The lever is disk, not compute. The corpus is 250 GiB before any semantic
data. A cheaper steady state has to shrink what the corpus carries, which is a
product and data decision, not a hosting one. Alternatively, E2E's post-August
price has to be read in a browser.
