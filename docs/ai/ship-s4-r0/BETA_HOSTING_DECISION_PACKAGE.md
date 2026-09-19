# SHIP S4-R0 — PERSISTENT BETA HOSTING DECISION PACKAGE

```text
AGENT = SHIP · MODES = OPS + SERVER + RELEASE
DATE  = 19 September 2026
HEAD_START = 69c4c8aaa98fe7dc33c28de8bfed790615d7da76
HEAD_AT_WRITE = a9f886384ca698a390ab2073610a81f2a60a4867   (phase 0 correction)

CLOUD_MUTATION          = NO
PAID_RESOURCE_CREATION  = NO
PROVISIONING_AUTHORIZED = NO
```

**Nothing was provisioned, resized, deleted or billed to produce this document.**
No DigitalOcean, Hetzner or Cloudflare API was called. Prices come from the
vendors' own current public pages, read on the date recorded against each one,
and from our own Gate-C resource ledger, which recorded the price the
DigitalOcean API actually charged.

**A cost recommendation is not spend authorization.** SHIP returns to Stage A
local closure immediately after this file lands (roadmap §13.1.1).

---

## 1 · The recommendation, first

```text
RECOMMENDED_TOPOLOGY = DigitalOcean · Storage-Optimized so-4vcpu-32gb (CORPUS)
                       + Basic s-2vcpu-4gb (API/USER)
                       + Cloudflare R2 (release pack, USER dumps, beta APK)
                       region sgp1 proven; blr1 preferred IF Storage-Optimized
                       is offered there (unverified — see §9.4)

EST_MONTHLY_COST       = USD 287.17 / month
EST_INITIAL_RESTORE    = 10 h 20 m calendar; USD ~4.40 of compute inside the cap
COLD_QUERY_RISK        = MODERATE at 32 GiB — bounded, measured, and resizable
RELEASE_PACK_REUSABLE  = YES

CHEAPER_ALTERNATIVE          = Hetzner Cloud SIN1 CCX33 + volumes, ~USD 255–270
                               NOT RECOMMENDED — see §7.2
HIGH_MEMORY_ALTERNATIVE      = DigitalOcean so-8vcpu-64gb, USD 549.17
                               JUSTIFIED AS A CONTINGENCY, NOT AS A STARTING
                               POINT — see §7.3

MAX_INITIAL_SPEND_REQUEST = USD 450
MAX_MONTHLY_SPEND_REQUEST = USD 550
PROVISIONING_AUTHORIZED   = NO
```

**The recommendation is cheaper than Gate C was**, for the same vCPU and the same
RAM: USD 286.00 against Gate C's USD 350.00 of compute. Two reasons, both
arithmetic rather than negotiation. Gate C ran the legacy `so1_5-4vcpu-32gb`
variant with 900 GiB of NVMe; the current-generation Storage-Optimized plan at
the same 4 vCPU / 32 GiB carries 600 GiB and costs USD 0.38988/h against Gate C's
USD 0.48512/h. And DigitalOcean caps bundled-plan hourly billing at **672 hours**
a month, not 720, which the roadmap's `$0.52083/hour` line has never been
multiplied out (§9.1).

**The single most useful structural fact in this package** is that the private
beta's own wave structure matches the concurrency bands almost exactly — Wave 0
≈ 5, Wave 1 ≈ 20–25, Wave 2 ≈ 100 invited — and DigitalOcean resizes RAM and
vCPU in place. So the decision is not "pick the right size now". It is "start on
the measured-sufficient size, run one diagnostic, and resize between waves if
the diagnostic demands it" (§8).

---

## 2 · What this round consumed rather than re-measured

Per the round's own non-negotiable rule, the following were read as inputs and
**not re-audited**: T0.1, T0.2, T0.3, Gate C, the Gate-C teardown, DATA S4-D0,
the A2 strategic research and acceptance, capability registry R18 and API
contract R17.

| input | record | consumed |
|---|---|---|
| Gate-C deployment | `docs/ai/lcc-r32b-do/ROUND.md`, `full-restore-trace.jsonl`, `RESOURCE_LEDGER.json` | topology, prices charged, restore timing |
| Gate-C teardown | `docs/ai/lcc-r34/TEARDOWN_RECEIPT.md` | USD 16.67 accrued, recurring USD 0, 7/7 DELETED_VERIFIED |
| Gate-C search gate | `docs/ai/lcc-r32b-do/gate-s1-summary.json` | p50/p95/p99 and the phase breakdown |
| DATA S4-D0 | `docs/ai/data-s4-d0/CONTINUITY_RECEIPT.md` | dataset sizes, pack lineage, collation |
| Amendment A2 | `docs/ai/ship-s4-a2/INTEGRATION_RECEIPT.md` | private-beta shape, two-stage spend gate |

Three things were measured fresh, because no accepted receipt contained them and
the sizing decision turns on them: the **heap/index split of the serving set**,
the **size of every index the search path can touch**, and the **admission and
pool limits in the running code**. All three are §6.

`RED` was not invoked. `DATA` was not given a mission. One bounded DATA handoff
is proposed in §12 and not sent from inside this file.

---

## 3 · Dataset truth — what is being hosted

From DATA S4-D0, accepted and **not** re-measured:

```text
LOCAL DB FOOTPRINT   ≈ 343 GB
SERVING DATASET      ≈ 250 GB   ← the number infrastructure is priced from
```

Measured fresh this round, because the split between heap and index decides how
much RAM matters (`pg_table_size` / `pg_indexes_size`, local PostgreSQL 18.6,
19 Sep 2026):

| table | heap | index | total |
|---|---:|---:|---:|
| `judgments` | 129.71 GB | 32.79 GB | 162.50 GB |
| `judgment_paragraphs` | 82.54 GB | 17.44 GB | 99.98 GB |
| `judgment_citations` | 2.29 GB | 3.29 GB | 5.58 GB |
| `judgment_statute_refs` | 0.17 GB | 0.29 GB | 0.46 GB |
| `judgment_citation_keys` | 0.18 GB | 0.27 GB | 0.45 GB |
| `statute_sections` | 0.07 GB | 0.01 GB | 0.09 GB |
| `lexeme_document_frequency` | 0.01 GB | 0.01 GB | 0.02 GB |
| `judgment_judges` | 0.01 GB | 0.01 GB | 0.01 GB |
| `judgment_citation_aliases` | 0.00 GB | 0.00 GB | 0.00 GB |
| `statutes` | 0.00 GB | 0.00 GB | 0.00 GB |
| **serving total** | **215.0 GB** | **54.1 GB** | **269.1 GB** |

`269,057,155,072` bytes exactly, which is the same total S4-D0 reported as
"~250 GB". Both are right: S4-D0 rounded, and this table adds the two small
serving tables (`judgment_judges`, `lexeme_document_frequency`) that the restore
actually carries. **Price from 269 GB, not 250 GB, and never from 343 GB.**

### Explicitly excluded, and why

Roughly 93 GB of the 343 GB local footprint is research and probe artifact that
does not serve and is **not** provisioned for:

```text
45   GB  vector stage (embeddings; PUBLIC_SEMANTIC = DISABLED, HNSW = DEFERRED)
10.4 GB  probe HNSW tables
9.8  GB  judgment_chunks          (620,300 chunks over 40,161 documents)
5.5  GB  tranche passages
2.8  GB  embedding_content_representative
         plus smaller staging tables
```

`judgment_chunks` is the one worth naming twice: Gate C restored it **empty**
(`hasRows: false`, 8,192 bytes) and the activation gate passed anyway, listing it
under `empty` rather than `absent`. That is the shape a serving restore should
have while public semantic is disabled, and it is evidence the exclusion is
already how the release path behaves rather than a new decision taken here.

---

## 4 · Release pack — and a correction the evidence forces

### 4.1 What S4-D0 recorded, unchanged

```text
RELEASE_PACK           = D:/lawmind-release-r32b/pack3
releaseVersion         = 2026-09-17.mu4rlyak
createdAt              = 2026-09-17T02:48:50.862Z
COMPRESSED EXPORT      = 72.6 GiB gzip, 8 tables (77,960,605,063 bytes)
PACK3_REUSE_CANDIDATE  = YES
PACK3_LINEAGE          = PARTIAL
  manifest hash        MATCH      8/8 files present      8/8 byte lengths exact
  schema lineage       MATCH      (105 migrations, last 0104_ops_job_state_check_all_states)
```

**No new export.** The pack is one day younger than Gate C and 0.033% behind
live; nothing about the current delta requires re-exporting hundreds of GiB.
**The 72.6 GiB payload was not stream-hashed to write this document**, exactly as
instructed — S4-R0 does not restore the pack.

### 4.2 `PACK3_FULL_RESTORE_DURATION` is NOT unknown — it was observed

The round instruction asked that two facts be kept distinct and not relabelled:
the Gate-C observed restore/deployment path at ≈10h20m, versus
`PACK3 FULL RESTORE DURATION = UNKNOWN`. Current HEAD contains evidence that
these are **the same event**, and since §17's deliverable is a grounded restore
estimate, the contradiction is material to the task and is recorded rather than
carried:

```text
docs/ai/lcc-r32b-do/full-export.json            releaseVersion 2026-09-17.mu4rlyak
docs/ai/lcc-r32b-do/full-restore-activation.json releaseVersion 2026-09-17.mu4rlyak
docs/ai/data-s4-d0/CONTINUITY_RECEIPT.md   pack3 releaseVersion 2026-09-17.mu4rlyak
```

And the restore verified row counts that are pack3's manifest rows exactly:

```text
judgments             18,793,342 = expected      judgment_paragraphs 92,083,253 = expected
judgment_citations    22,451,373 = expected      judgment_statute_refs  928,805 = expected
judgment_judges           44,360 = expected      statutes                   849 = expected
statute_sections          36,663 = expected      lexeme_document_frequency 128,243 = expected
```

So:

```text
PACK3_FULL_RESTORE_DURATION = OBSERVED 10 h 19 m 42 s   (37,181,724 ms)
                              2026-09-17T03:45:26.190Z → 14:05:07.914Z
                              target so1_5-4vcpu-32gb, sgp1, non-superuser owner
                              source a HOST-LOCAL copy at /srv/lawmind-release/pack
                              verdict RESTORE_VERIFIED → ACTIVATE
```

**What remains genuinely unknown, and is not dressed up:** the `D:` → host
transfer time is **excluded** from that figure, and whether the copy on `D:`
today is still byte-identical to the copy that was shipped is a separate
question about a different artifact.

On that second question, one thing is better than S4-D0's wording suggests. The
Gate-C round verified **all eight per-file sha256 on the host copy** before
loading — `phase: file_integrity, ok: true` eight times in
`full-restore-trace.jsonl`, and `ROUND.md` records `TRANSFER_INTEGRITY PASS
(manifest + 8 file sha256 on the host)`. So pack3's recorded sha256 values are
**known-good as authored**. `PACK3_FULL_INTEGRITY = NOT_YET_PROVEN` is a correct
statement about **the copy on `D:` as it stands today**, not about whether the
manifest means anything.

### 4.3 When to revalidate the payload

```text
REVALIDATE_PACK3_PAYLOAD_SHA256 = immediately BEFORE it becomes an input to an
                                  actual remote restore (S4-R1), never earlier
COST                            = streaming 72.6 GiB off D:, ~20–40 min of disk
NEEDS                           = no database, no network, no lease
```

Byte-length matching already excludes the truncation class. What it does not
exclude is in-place corruption, and the only thing that does is the hash. It is
cheap, it is not on any critical path today, and it must not be skipped on the
day the restore depends on it.

---

## 5 · Restore, measured to the phase — and the lever it exposes

From `docs/ai/lcc-r32b-do/full-restore-trace.jsonl`, 72 phase records:

| phase | duration | note |
|---|---:|---|
| pack integrity, 8 × sha256 on host | 4 m 40 s | |
| **`judgments` COPY** | **7 h 51 m 09 s** | 37.48 GB gz · 18,793,342 rows · 41 columns |
| `judgment_paragraphs` COPY | 1 h 03 m 26 s | 39.13 GB gz · 92,083,253 rows · 9 columns |
| `judgment_citations` COPY | 50 m 57 s | 1.27 GB gz · 22,451,373 rows |
| five small tables | ~1 m 50 s | |
| FK validation, 8 constraints | 1 m 51 s | 0 dangling |
| analyze + index count | 14 s | 281 indexes, 0 invalid |
| row count + checksum verify | 25 m 10 s | 8/8 match |
| statistics, search smoke, activation | 22 s | slowest probe 1,862 ms |
| **total** | **10 h 19 m 42 s** | |

### 5.1 Why `judgments` took 7.4× longer than a file of the same size

`judgment_paragraphs` moved 39.13 GB compressed in 1 h 03 m. `judgments` moved
**37.48 GB — less** — in 7 h 51 m. Nearly identical compressed bytes, 7.4× the
wall time, and it is not I/O.

`judgments.full_text_tsv` is `tsvector GENERATED ALWAYS AS
to_tsvector('english', full_text)` (`docs/SCHEMA_TRUTH.md:134`,
`packages/db/drizzle/0004_judgments_stored_tsvector.sql`). Every one of
18,793,342 rows computes a tsvector over a full judgment text during the COPY,
and the **17.71 GB GIN index** over that column is maintained inline, row by
row, because the migrations had already created it before the load. That is
CPU-bound work on one backend.

**Consequence, and it points the opposite way to intuition: buying more vCPU
does not shorten this.** A single `COPY FROM` stream is one PostgreSQL backend on
one core. Restore hours are paid hours and are also time-to-first-serving, so
this is worth an experiment — but the experiment is not "bigger box".

### 5.2 The two levers, as bounded R1 experiments

```text
LEVER_1  DROP the GIN index (and optionally the generated column) before the
         judgments COPY; rebuild after, with max_parallel_maintenance_workers
         set. An index BUILD parallelises; inline maintenance does not.
         Plausible saving: hours. Risk: the rebuild must complete before
         activation, and the activation gate must refuse a missing index.

LEVER_2  SPLIT judgments.copy.gz into N chunks and run N concurrent COPYs on a
         4-core host. Plausible saving: up to ~3×. Risk: chunk boundaries must
         be row-exact, and a partial failure leaves a half-loaded table — the
         truncate/verify contract already in release-restore-cli must cover it.
```

Both are **measurements to perform during S4-R1**, not changes this round makes.
Neither is a prerequisite to the beta: 10h20m of one-time restore is acceptable.

### 5.3 Restore estimate per architecture, with uncertainty

| architecture | estimate | uncertainty | basis |
|---|---|---|---|
| A — DO so-4vcpu-32gb | **10 h 20 m** | ±20% | Same vendor, same vCPU/RAM, same region family; NVMe 600 GiB vs 900 GiB on the observed host. The dominant phase is CPU-bound, so the disk difference barely enters. |
| B — Hetzner SIN1 CCX33 | 6 h – 12 h | **UNBOUNDED** | 8 dedicated AMD EPYC vCPU may be materially faster **per core** than DO Storage-Optimized, which would cut the tsvector phase. But the 269 GB target sits on **network volumes** rather than local NVMe, which pushes the other way. No measurement exists on this provider. Treating this range as an estimate would be false precision. |
| C — DO so-8vcpu-64gb | 9 h – 10 h 20 m | ±20% | 8 vCPU does not speed one COPY stream (§5.1). The only gain is more page cache during the paragraph and citation phases and during verify. Expect a modest improvement, not half. |

**Measurement to perform during S4-R1, for whichever is chosen:** time the
restore to the same phase granularity the Gate-C trace used, and record it
against the architecture. One number per provider is the whole point; there is
currently exactly one, for one provider.

---

## 6 · Cold-query risk, measured — this is what decides RAM

### 6.1 The measurement, consumed not re-run

Gate-S1, frozen, `docs/ai/lcc-r32b-do/gate-s1-summary.json`, final run
`gate-s1-fix3`, n = 36:

```text
p50 350 ms · p95 2,748 ms · p99 3,453 ms · max 3,453 ms · GATE = PASS
```

The phase breakdown is what matters, and it is unambiguous:

```text
worst-case total 3,298 ms, of which  sparse 3,190 ms
                                     structured  946 ms
                                     pins        440 ms
                                     fallback     80 ms
                                     hydrate      13 ms
                                     poolWait      0 ms      admission 0 ms
```

**`sparse` is 96.7% of the worst case.** `poolWait` and `admission` were zero, so
at n = 36 sequential probes the bottleneck was never contention — it was one
phase reading from storage. Retrieval was **not changed** to make this number
prettier; it is a sizing input.

### 6.2 What `sparse` actually reads — measured fresh

Every index on the serving tables, largest first (local PostgreSQL 18.6,
19 Sep 2026):

| size | method | table | index |
|---:|---|---|---|
| **17.712 GB** | gin | `judgments` | `judgments_full_text_idx` |
| 4.963 GB | btree | `judgment_paragraphs` | `judgment_paragraphs_judgment_idx` |
| 4.963 GB | btree | `judgment_paragraphs` | `judgment_paragraphs_unique` |
| 4.495 GB | btree | `judgments` | `judgments_source_url_key` |
| 3.982 GB | btree | `judgment_paragraphs` | `judgment_paragraphs_number_idx` |
| 3.529 GB | btree | `judgment_paragraphs` | `judgment_paragraphs_pkey` |
| 2.532 GB | btree | `judgments` | `judgments_content_hash_idx` |
| 2.508 GB | gin | `judgments` | `judgments_case_title_trgm` |
| 1.514 GB | btree | `judgments` | `judgments_case_title_normalised_idx` |
| 1.310 GB | btree | `judgment_citations` | `judgment_citations_unique_edge` |
| 0.982 GB | btree | `judgments` | `judgments_cnr_idx` |
| 0.922 GB | btree | `judgments` | `judgments_pkey` |
| 0.837 GB | gin | `judgments` | `judgments_case_number_trgm` |
| | | | *(smaller indexes omitted; full set totals 54.1 GB)* |

The working set the search path can touch on a research query:

```text
judgments_full_text_idx              17.71 GB   the sparse phase
judgments_case_title_trgm             2.51 GB   title matching
judgments_pkey                        0.92 GB
judgments_case_title_normalised_idx   1.51 GB
judgments_cnr_idx                     0.98 GB
judgments_neutral_citation_key        0.24 GB
judgments_judgment_date_idx           0.21 GB
judgments_court_idx                   0.19 GB
judgments_case_type_idx               0.18 GB
judgments_date_court_idx              0.14 GB
                                    ─────────
HOT_INDEX_WORKING_SET               ≈ 24.6 GB
```

### 6.3 The arithmetic that justifies — and bounds — architecture C

```text
32 GiB host   =  34.4 GB.  A 24.6 GB hot index set fits ONLY IF essentially
                 nothing of the 215 GB heap is cached, and the OS and the
                 PostgreSQL backends also need their share. Result: index
                 mostly resident once warm; every result hydration reads heap
                 from disk. THAT IS EXACTLY THE OBSERVED PROFILE — fast warm
                 (p50 350 ms), slow on an unseen query (sparse 3,190 ms).

64 GiB host   =  68.7 GB.  24.6 GB of hot index resident with room to spare,
                 plus roughly 30 GB of heap page cache. Materially different,
                 and different in the direction the measurement points.
```

So architecture C is **justified by measurement rather than by the general
principle that more RAM is better** — which is what §13 asked for. But it is
still a **hypothesis with a measurement attached, not a proven fix**, and it
costs USD 262/month more. Two facts make starting cheaper the better call:

1. Gate-S1 **PASSED** at 32 GiB. The cold-query issue is a carried reliability
   item (N-3), not a failing gate.
2. DigitalOcean resizes RAM and vCPU **in place**. Starting on A does not lock
   anything in, and the private beta's waves give natural resize windows (§8).

**What would refute the RAM hypothesis**, and must be checked before spending
USD 262/month on it: if the R1 cold-query diagnostic shows `sparse` time
dominated by GIN posting-list *scan* work on very common lexemes rather than by
page faults, then the answer is a query/df bound, not RAM, and C buys nothing.
The corpus-wide `df` gate is already known to ignore filters, and
`lexeme_document_frequency` exists precisely to bound this — so this is a live
alternative explanation, not a courtesy caveat.

```text
R1_COLD_QUERY_DIAGNOSTIC = for a set of never-before-run queries, capture
                           EXPLAIN (ANALYZE, BUFFERS) with ef_search set
                           explicitly, and split sparse time into
                           shared_blks_read (page faults → RAM-bound, buy C)
                           versus GIN posting-list scan rows (→ df/query-bound,
                           C buys nothing). Set ef_search rather than
                           inheriting it; production is not the probe default.
```

### 6.4 A bounded cost finding, recorded and NOT acted on

`judgment_paragraphs_judgment_idx` is `btree (judgment_id, paragraph_index)`.
`judgment_paragraphs_unique` is `UNIQUE btree (judgment_id, paragraph_index)` —
**identical columns in identical order**. The non-unique index is fully
redundant: any scan it can serve, the unique index serves identically.

```text
RECOVERABLE      4.963 GB of index  (1.8% of the 269 GB serving set)
ALSO SAVES       inline maintenance during the 1 h 03 m paragraphs COPY
ALSO SAVES       RAM it competes for
STATUS           NOT ACTED ON. Dropping an index is a schema change and belongs
                 to DATA / contract change control (roadmap §3.7), not to a
                 hosting decision package. Proposed as a bounded handoff, §12.
```

Index **scan counts** were also read and are deliberately **not** used as
evidence. `pg_stat_user_indexes` on this workstation shows
`judgments_full_text_idx` at 0 scans and `stats_reset` at `null` — which reflects
ingest work on a box that has not served a search recently, not that full-text
search is unused. A zero there is UNKNOWN, not unused, and no index is
recommended for removal on that basis.

---

## 7 · The three architectures

Common to all three, and not negotiable by any of them: **split CORPUS and USER
roles**, private DB networking, no public PostgreSQL port, public HTTPS API only,
and **the founder workstation never serves the beta**.

### 7.1 A — PROVEN BASELINE, current generation · **RECOMMENDED**

```text
PROVIDER      DigitalOcean
REGION        sgp1 (proven at Gate C) · blr1 preferred if available (§9.4)

CORPUS        so-4vcpu-32gb    4 vCPU · 32 GiB · 600 GiB NVMe · 6,000 GiB transfer
              USD 0.38988/h · USD 262.00/mo
API + USER    s-2vcpu-4gb      2 vCPU ·  4 GiB ·  80 GiB SSD  · 4,000 GiB transfer
              USD 0.03571/h · USD  24.00/mo
NETWORKING    VPC + 2 firewalls + 1 DNS A record            USD 0.00
BACKUP        Cloudflare R2 — release pack 78 GB @ 0.015     USD  1.17/mo
              USER pg_dump (4,057,824 bytes at Gate C)       under the 10 GB free tier
              beta APK artifacts                            under the 10 GB free tier

MONTHLY FIXED COST     USD 287.17
EXPECTED VARIABLE COST USD 0.00 — research traffic for ~100 lawyers is nowhere
                       near the 10 TB of bundled transfer; R2 egress is free
ONE-TIME RESTORE COST  USD ~4.40  (10.33 h × USD 0.42559/h, per-second billed
                       since 1 Jan 2026, and inside the monthly cap anyway)
```

**Disk, checked against the measured 269.1 GB rather than assumed:**

```text
600 GiB = 644.2 GB decimal

one live generation                             269.1 GB   42%   comfortable
one generation + pack on host + WAL/temp        ~387   GB   60%   comfortable
TWO generations + WAL/temp                      ~578   GB   90%   TIGHT
two generations + pack resident                 ~656   GB  102%   DOES NOT FIT
```

**So A carries one live generation easily and two only under a protocol.** That
is why Gate C chose the 900 GiB variant, and it is the one real constraint A
imposes:

```text
DISK PROTOCOL (mandatory for A)
  1. stream the pack from R2, restore, DELETE the on-host pack before activation
  2. two generations may coexist only for the rollback window
  3. drop the superseded generation as soon as the new one is accepted
  4. alarm at 80% of 644 GB, refuse a new generation at 85%
```

**Insurance option A+.** If the DigitalOcean API still offers the legacy
`so1_5-4vcpu-32gb` (900 GiB), it costs USD 0.48512/h = **USD 326.00/mo** — USD 40
more than A — and removes the disk protocol entirely. Availability of a legacy
slug is `UNVERIFIED` and is a one-call check at provisioning time. Worth taking
if offered.

### 7.2 B — LOWER-COST CREDIBLE OPTION · **NOT RECOMMENDED**

```text
PROVIDER      Hetzner Cloud
REGION        SIN1 (Singapore) — the same geography as Gate C, not worse

CORPUS        CCX33   8 dedicated vCPU · 32 GB · 240 GB NVMe · 0.5–8 TB traffic
              USD 205.99/mo  (Singapore, after the 15 June 2026 adjustment)
              240 GB NVMe < 269.1 GB SERVING SET → volumes REQUIRED
VOLUMES       ≥ 450 GB for one generation + WAL; ≥ 700 GB for two
              PRICE UNVERIFIED by this round — Hetzner's volume rate is not on
              the page that carried the server prices
API + USER    CCX13   2 vCPU · 8 GB · 80 GB — price UNVERIFIED for SIN1

MONTHLY FIXED COST     ~USD 255–270  (PARTLY UNVERIFIED)
SAVING VS A            ~USD 20–30 / month
```

Three reasons this is recorded and declined, in order of weight:

1. **It moves the dataset off local NVMe onto network-attached volumes — against
   the exact failure being sized for.** The measured bottleneck is `sparse`
   reading pages that are not in RAM (§6.1). A 32 GiB host with 269 GB on network
   volumes has the same RAM as A and slower storage under the phase that is
   already 96.7% of the worst case. Paying less for a worse answer to the known
   problem is not a saving.
2. **Every piece of Gate-C provisioning, teardown and falsification tooling is
   DigitalOcean-API-specific.** `scripts/lcc-r32b-do.mjs` creates and destroys by
   DO resource id, reads resources back by id to prove deletion, and refuses the
   foreign Droplet `ubuntu-s-vikas` by name. That is how Gate-C teardown reached
   **7 of 7 DELETED_VERIFIED, 0 UNKNOWN** and recurring USD 0. Re-creating that
   on a second provider is real work, and until it exists, "we can turn it off"
   is an intention rather than a proven procedure.
3. **The restore path is unproven there and §5.3 cannot bound it.** The one
   restore measurement this project owns is on DigitalOcean.

**USD ~25/month against re-proving the entire deployment and teardown path on
the critical path to a ~100-lawyer beta is precisely the trade §13 forbids.**
Revisit at production scale, where the same percentage is a larger number and
there is time to prove the path before it is load-bearing.

Hetzner's EU prices are far lower (CCX33 USD 162.99, CCX43 USD 325.49) but
Germany/Finland adds roughly 120–160 ms of round trip to every Indian request on
top of a p95 already at 2,748 ms. **Not credible for this product's geography**,
and not priced further.

### 7.3 C — HIGHER-MEMORY OPTION · **JUSTIFIED AS A CONTINGENCY**

```text
PROVIDER      DigitalOcean, same region as A

CORPUS        so-8vcpu-64gb    8 vCPU · 64 GiB · 1,170 GiB NVMe · 7,000 GiB transfer
              USD 0.77976/h · USD 524.00/mo
API + USER    s-2vcpu-4gb                                    USD  24.00/mo
BACKUP        as A                                           USD   1.17/mo

MONTHLY FIXED COST     USD 549.17
DELTA VS A             + USD 262.00 / month
```

What the extra money buys, measured:

```text
RAM 32 → 64 GiB   the 24.6 GB hot index set resident with ~30 GB of heap cache
                  instead of resident-only-if-nothing-else-is (§6.3)
vCPU 4 → 8        RESEARCH_CONCURRENCY could rise 3 → 6, roughly doubling
                  admitted concurrency — a TUNING CHANGE TO BE MEASURED, not an
                  automatic consequence of more cores
DISK 600 → 1,170  the §7.1 disk protocol becomes unnecessary; two generations
                  and the pack all fit
RESTORE           modest gain only. 8 vCPU does not speed one COPY stream (§5.1)
```

**Verdict: correct contingency, wrong starting point.** Gate-S1 passed at 32 GiB;
the diagnostic in §6.3 can refute the RAM hypothesis outright; and the resize is
in place. Spending USD 262/month before the diagnostic runs is buying a guess.

---

## 8 · Capacity model — and why the waves make this easy

### 8.1 What the running code actually admits

Measured from source at HEAD, not assumed (`services/api/src/pools.ts`,
`services/api/src/search/admission.ts`):

```text
RESEARCH_CONCURRENCY          = 3       expensive searches in flight at once
RESEARCH_STATEMENTS_PER_REQUEST = 2     sparse ‖ dense
RESEARCH_POOL_MAX             = 6       3 × 2, sized rather than guessed
CORE_POOL_MAX                 = 8       auth · matters · judgments · citations · health
USER_POOL_MAX                 = 8       AUTH_POOL_MAX = 2
ADMISSION_WAIT_MS             = 2,000   then 503 + Retry-After
CORE_STATEMENT_TIMEOUT_MS     = 10,000
```

The fourth concurrent search waits at most 2 s and is then **refused with 503**,
never served an empty page — `docs/CITATION_HARNESS.md` holds silent drop at a
zero threshold, and a `results: []` caused by our own congestion is that silent
drop wearing a success code. **`SEARCH_BUSY` is an honest state; an empty result
is not.** The capacity question is therefore "how often do we refuse", which is a
product question with a truthful answer, not "when do we look broken".

### 8.2 Capacity at the measured latency

```text
3 slots ÷ p50 0.350 s  ≈ 8.6 searches / second
3 slots ÷ p95 2.748 s  ≈ 1.09 searches / second      ← the number to size against
```

### 8.3 The three bands §14 requires

**Stated assumption, because inventing one would be worse:** an *active research
user* issues roughly **one search every 30 seconds** — search, then read a
judgment for a while. This is an assumption, it is **UNMEASURED**, and Wave 0
measures it. It is stated here so the founder can reject it rather than inherit
it.

| band | search rate | share of p95 capacity | risk |
|---|---:|---:|---|
| **5 concurrent active** | 0.17 /s | 15% | **LOW.** Comfortable on A even if every query lands at p95. |
| **15 concurrent active** | 0.50 /s | 46% | **MODERATE, acceptable.** Bursts will occasionally queue inside the 2 s admission wait; refusals unlikely. |
| **30 concurrent active** | 1.00 /s | **92%** | **HIGH on A.** At the cold-query end of the distribution, sustained 30-user activity sits at the admission limit and 503 refusals become likely in bursts. |

**`~100 invited ≠ 100 concurrent`, and the plan already reflects that.** A2's wave
structure is Wave 0 ~5 → Wave 1 ~20–25 → Wave 2 toward ~100, which lands almost
exactly on the three bands above. The architecture therefore only has to reach
the 30-band by **Wave 2**, and every wave boundary is a natural resize window.

```text
RECOMMENDED SEQUENCE
  Wave 0 (~5)      A.  Measure the real search-per-user rate; replace the
                       30-second assumption with a number.
  Wave 1 (~20–25)  A.  Run the §6.3 cold-query diagnostic under real load.
  Wave 2 (~100)    A, or resize to C IF AND ONLY IF the diagnostic showed
                       RAM-bound behaviour or the measured rate invalidates
                       the band table. In-place resize; no migration.
```

That sequence is the reason the recommendation is A rather than C: it converts a
USD 262/month guess into a USD 262/month decision taken on evidence, without
risking the beta, and without a second founder round-trip if
`MAX_MONTHLY_SPEND_REQUEST` is approved at USD 550.

### 8.4 Cold-query risk per architecture

| architecture | cold-query risk |
|---|---|
| A | **MODERATE.** Gate-S1 PASSED at this shape (p95 2,748 ms / p99 3,453 ms) with the known unseen-query limitation (N-3). Warm behaviour is good; the risk is the long tail on a first-of-its-kind query, and it is bounded by admission rather than by a hang. |
| B | **MODERATE-TO-WORSE.** Same RAM as A, dataset on network volumes instead of local NVMe, under the phase that is already 96.7% of the worst case. |
| C | **LOWER, by hypothesis.** §6.3 gives the arithmetic and also gives the test that would refute it. Unproven until that test runs. |

---

## 9 · Pricing provenance, and two corrections

### 9.1 DigitalOcean caps bundled hourly billing at 672 hours, not 720

> "Usage is capped at 672 hours (28 days) per month for bundled-plan CPU
> Droplets. Bundled Plans have a monthly cap, so you'll never pay more than the
> flat monthly price for that plan."

Source: DigitalOcean pricing documentation and droplet pricing pages, read
**19 September 2026**. Confirmed arithmetically against two independently known
prices: `0.03571 × 672 = 23.997 ≈ USD 24.00` (Basic 2 vCPU/4 GiB) and
`0.38988 × 672 = 261.99 ≈ USD 262.00` (Storage-Optimized 4 vCPU/32 GiB).

**Correction carried forward.** Roadmap v7.4 §13.1 records Gate-C's combined
compute as "roughly $0.52083/hour" and has never multiplied it out. At 720 hours
that reads USD 375.00/month; the correct figure at the 672-hour cap is
**USD 350.00/month**. The hourly rate in the roadmap is right; anyone turning it
into a monthly number should use 672.

Also noted, dated **1 January 2026**: DigitalOcean moved to **per-second
billing** with a minimum charge of 60 seconds or USD 0.01. A 10 h 20 m restore is
billed by the second, which is why §7.1's one-time restore cost is USD 4.40 and
not a rounded-up day. Separately, **v5 Droplets are billed on actual hours and
are NOT capped at 672** — so if a v5 plan is ever chosen, the 672 arithmetic in
this document does not apply to it.

### 9.2 Gate C ran a legacy plan variant that is no longer on the public page

`docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json`, written **16 September 2026** from
the DigitalOcean API at creation:

```text
lawmind-gatec-corpus     sizeSlug so1_5-4vcpu-32gb
                         vcpus 4 · memoryMiB 32768 · diskGiB 900
                         hourlyUsd 0.48512        → USD 326.00 / mo at 672 h
lawmind-gatec-api-user   sizeSlug s-2vcpu-4gb
                         vcpus 2 · memoryMiB 4096 · diskGiB 80
                         hourlyUsd 0.03571        → USD  24.00 / mo at 672 h
                         combined 0.52083/h       → USD 350.00 / mo at 672 h
region sgp1
```

DigitalOcean's current public Storage-Optimized line, read 19 September 2026, has
**no 900 GiB tier** at 4 vCPU:

| vCPU | RAM | NVMe | USD/h | USD/mo |
|---:|---:|---:|---:|---:|
| 2 | 16 GiB | 300 GiB | 0.19494 | 131.00 |
| **4** | **32 GiB** | **600 GiB** | **0.38988** | **262.00** |
| **8** | **64 GiB** | **1,170 GiB** | **0.77976** | **524.00** |
| 16 | 128 GiB | 2,340 GiB | 1.55952 | 1,048.00 |
| 24 | 192 GiB | 3,520 GiB | 2.33929 | 1,572.00 |
| 32 | 256 GiB | 4,690 GiB | 3.11905 | 2,096.00 |

So `so1_5-4vcpu-32gb` is a **legacy or unlisted variant**. It was really served
by the API three days ago, and it may still be; that is the A+ option in §7.1 and
it is `UNVERIFIED` until the sizes endpoint is read at provisioning time.

### 9.3 Every price in this document, with its source and date

| item | price | source | read |
|---|---|---|---|
| DO Storage-Optimized 4 vCPU/32 GiB/600 GiB | USD 0.38988/h · 262.00/mo | digitalocean.com/pricing/droplets | 19 Sep 2026 |
| DO Storage-Optimized 8 vCPU/64 GiB/1,170 GiB | USD 0.77976/h · 524.00/mo | digitalocean.com/pricing/droplets | 19 Sep 2026 |
| DO Memory-Optimized 4 vCPU/32 GiB/100 GiB | USD 0.25000/h · 168.00/mo | digitalocean.com/pricing/droplets | 19 Sep 2026 |
| DO Memory-Optimized 8 vCPU/64 GiB/200 GiB | USD 0.50000/h · 336.00/mo | digitalocean.com/pricing/droplets | 19 Sep 2026 |
| DO Basic 2 vCPU/4 GiB/80 GiB | USD 0.03571/h · 24.00/mo | our own Gate-C ledger (DO API) | 16 Sep 2026 |
| DO `so1_5-4vcpu-32gb` 900 GiB (legacy) | USD 0.48512/h · 326.00/mo | our own Gate-C ledger (DO API) | 16 Sep 2026 |
| DO Block Storage volumes | USD 0.10 / GiB / mo, 1 GiB – 16 TiB | DO volume pricing docs | 19 Sep 2026 |
| DO billing cap | 672 h/mo, bundled CPU plans; per-second since 1 Jan 2026 | DO billing docs | 19 Sep 2026 |
| Hetzner SIN1 CCX33 8 vCPU/32 GB/240 GB | USD 205.99/mo (EUR 174.49) | docs.hetzner.com price adjustment 15 Jun 2026 | 19 Sep 2026 |
| Hetzner SIN1 CCX43 16 vCPU/64 GB/360 GB | USD 401.99/mo (EUR 340.99) | docs.hetzner.com price adjustment 15 Jun 2026 | 19 Sep 2026 |
| Hetzner DE/FI CCX33 · CCX43 | USD 162.99 · 325.49/mo | docs.hetzner.com price adjustment 15 Jun 2026 | 19 Sep 2026 |
| Hetzner block storage volumes | **UNVERIFIED** | not on the page carrying server prices | — |
| Cloudflare R2 standard storage | USD 0.015 / GB / mo | developers.cloudflare.com/r2/pricing | 19 Sep 2026 |
| Cloudflare R2 egress | **USD 0.00 — free** | developers.cloudflare.com/r2/pricing | 19 Sep 2026 |
| Cloudflare R2 Class A / Class B | USD 4.50 / 0.36 per million | developers.cloudflare.com/r2/pricing | 19 Sep 2026 |
| Cloudflare R2 free tier | 10 GB-mo · 1 M Class A · 10 M Class B | developers.cloudflare.com/r2/pricing | 19 Sep 2026 |

A Memory-Optimized variant was priced and dropped: MO 8 vCPU/64 GiB is
USD 336/mo against SO's USD 524, but carries only **200 GiB** of disk. Adding the
~500 GiB of block storage the 269 GB serving set needs costs USD 50/mo and puts
the dataset on network-attached storage — the same objection that sinks B (§7.2),
for USD 386/mo. Local NVMe is the point of the Storage-Optimized line for this
workload.

### 9.4 Region — one open question, not a blocker

```text
GATE_C_REGION    sgp1 (Singapore) — PROVEN
BLR1             DigitalOcean has a Bangalore region. For a product whose users
                 are practising advocates IN INDIA, blr1 removes roughly 30–60 ms
                 of round trip versus sgp1 on every request.
UNVERIFIED       whether Storage-Optimized plans are offered in blr1. DO states
                 Premium Memory-Optimized and Storage-Optimized are available in
                 "AMS3, SFO3, LON1 and SGP1, as well as all other data centers",
                 which IMPLIES blr1 but does not list it.
CHECK            one unauthenticated-equivalent read of the sizes endpoint at
                 provisioning time, filtered by region. Not a research project.
DEFAULT IF NO    sgp1, which is proven and which Gate C's public-network
                 physical flow already passed from India.
```

This is a latency improvement, not a correctness or compliance requirement. No
data-residency obligation was found in `docs/PRIVACY_PII.md` or the roadmap, and
none is invented here.

---

## 10 · Windows → Linux collation — and a clarification that saves R1 time

### 10.1 The binding fact, unchanged

```text
WINDOWS_LINUX_COLLATION_EQUAL = NO
SOURCE  PostgreSQL 18.6 · UTF8 · English_United States.1252
        extensions pg_trgm 1.6 · vector 0.8.5 · plpgsql 1.0
```

**A successful Linux restore does NOT establish equivalent search semantics**,
and nothing below weakens that.

### 10.2 What the restore mechanism means — REINDEX is moot

The Gate-C restore is a **logical** restore: `COPY FROM` per table, phases
`copy_open → copy_stream_begin → copy_complete`, with the 281 indexes already
present from migrations and maintained inline by the **target** server. It is not
a physical page copy.

**Therefore no index arrives at the target carrying source-collation ordering.**
Every btree was constructed on Linux, under Linux collation, as rows were
inserted. The corrupted-order class that a physical restore across collations
produces — the class `amcheck bt_index_check` exists to catch — **does not arise
on this path**, and a REINDEX pass after restore would rebuild correct indexes
into identical correct indexes.

So `WINDOWS_LINUX_COLLATION_EQUAL = NO` is, on this restore path, a **semantics**
difference and not a corruption risk: the same query can order results
differently, and strings that compare equal under one collation may not under the
other. That is exactly what has to be proven, and it is **Approach A, the bounded
behavioural equivalence suite** — not Approach B.

```text
RECOMMENDED_APPROACH = A (bounded behavioural equivalence suite)
APPROACH_B_REINDEX   = UNNECESSARY on a COPY-based logical restore, and it would
                       become NECESSARY only if the restore path ever changes to
                       a physical/binary one (pg_basebackup, filesystem
                       snapshot, pg_upgrade --link). Recorded so that a future
                       change of restore mechanism re-opens it deliberately.
```

One weak piece of positive evidence already exists and is labelled as weak: the
Gate-C restore's UNIQUE indexes all built successfully with 0 mismatches across
8/8 tables. A collation change that made two previously-distinct keys compare
equal would have **failed** that build. It did not. That excludes the
collision-under-target-collation case for the data present on 17 September; it
says nothing about ordering or about rows added since.

### 10.3 Minimum R1 proof — the three areas §18 names

**1 · Case-title normalization and search.** The object at risk is measured:
`judgments_case_title_normalised_idx`, 1.514 GB, `btree (lower(btrim(regexp_replace(case_title, '\s+', ' ', 'g'))))`
— a btree over a `lower()`-derived text expression, so both its **ordering** and
its **equality** semantics are collation- and ctype-dependent. Also
`judgments_case_title_trgm`, 2.508 GB GIN trgm: trigrams are not
collation-ordered, but the `lower()` applied before them is ctype-dependent.

```text
PROOF  a fixed corpus of ~200 case titles spanning: ASCII; mixed case; leading
       articles; internal punctuation (& , . v. vs versus); Devanagari;
       Latin diacritics; and the all-caps forms the corpus actually contains.
       Assert BYTE-IDENTICAL output on source and target for
         (a) ORDER BY the normalised expression
         (b) = on the normalised expression
         (c) prefix / LIKE and trigram similarity result SETS and ORDER
       A case-sensitivity or normalisation asymmetry fails OPEN — a permissive
       matcher returns MORE rows, which reads as success. Assert the set, not
       just the count.
```

**2 · Citation and index ordering.** Objects at risk, measured:
`judgments_neutral_citation_key` 0.242 GB, `judgments_cnr_idx` 0.982 GB,
`judgments_source_url_key` 4.495 GB, `judgment_citations_unique_edge` 1.310 GB,
`judgment_citation_keys_unique` 0.151 GB — all btree over text.

```text
PROOF  for a fixed sample, assert identical ORDER BY output for neutral_citation,
       cnr and the citation keys; and assert the UNIQUE constraints admit and
       reject exactly the same rows on both sides. A neutral citation is NOT
       unique in this corpus, so uniqueness here is a statement about the key
       columns, not about judgments — do not conflate them.
```

**3 · Other collation-dependent indexes.** Enumerate them rather than trusting a
remembered list; §6.2 is the current enumeration and it is measured, not recalled.

```text
PROOF  enumerate every btree-over-text index on the serving tables on the TARGET
       and assert the enumeration matches the source's, index for index. A
       missing index is a silent performance cliff that no behavioural test with
       a small fixture will notice.
ALSO   record datcollate / datctype / pg_collation on the target IN the release
       receipt, so the target's semantics are NAMED rather than assumed. The
       whole class of bug here begins with nobody writing the collation down.
```

**Full-text search is largely outside this risk, and that is the good news.**
`judgments_full_text_idx` is GIN over `tsvector`. `tsvector` is not
collation-ordered, and `to_tsvector('english', …)` depends on the **text search
configuration**, not on `LC_COLLATE`. So the 17.71 GB index carrying 96.7% of the
worst-case query time is the part least likely to change behaviour across the
restore. Assert the text search configuration is identical on both sides and this
area is closed cheaply.

**This is not solved by assertion.** The suite above is the acceptance, it runs in
S4-R1 against the real target, and its result is recorded as PASS or FAIL per
area — never as "the restore completed".

---

## 11 · Operational requirements §20 names

| requirement | how A satisfies it | state |
|---|---|---|
| public HTTPS API | Caddy on the API host, as at Gate C (`alpha-api.lawmind.co` proven) | proven pattern |
| CORPUS role | dedicated Storage-Optimized host, split mode, no `DATABASE_URL` | proven pattern |
| USER role | on the API host at Gate C; separate database, 87 tables | proven pattern |
| private DB networking | VPC + firewall; **no public PostgreSQL on either host, checked from outside** at Gate C | proven |
| auth / email | better-auth self-hosted + Resend; magic link → verify → `/me` 200, replay 401, proven at Gate C | proven, key rotation OPEN |
| release identity | `/version` — **N-2 open**, being closed locally in Stage A | in progress |
| backup | R2; USER `pg_dump -Fc` proven byte-identical host↔workstation at teardown | proven pattern |
| restore | `release-restore-cli`, `RESTORE_VERIFIED`, 8/8 rows and checksums, 0 dangling FKs | proven |
| rollback | generation switch proven; **`matter_authorities` preservation is Stage A work** | see §11.1 |
| prewarm / readiness | **N-4 open**, being closed locally in Stage A | in progress |
| telemetry | `PRIVATE_BETA_TELEMETRY`, Stage A | in progress |
| no founder-workstation serving dependency | two cloud hosts; workstation serves nothing | by construction |
| teardown | `scripts/lcc-r32b-do.mjs` + `docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md` §Teardown | **proven: 7/7 DELETED_VERIFIED, 0 UNKNOWN, recurring USD 0** |

**Not every logical role needs its own managed service.** Gate C ran CORPUS and
USER on two Droplets with no managed database, no load balancer, no Kubernetes
and no volumes — "not deleted, never created" — and passed. Blast radius is
preserved by the split and the VPC, not by buying more products. A managed
Postgres for a 269 GB corpus would cost multiples of USD 262 and would remove the
generation-switch mechanism that the rollback story depends on.

### 11.1 What Gate C's blue/green proof actually showed — it matters for §36

`docs/ai/lcc-r32b-do/remote-bluegreen.json`:

```text
generations   A present ("1")   B ABSENT ("0")
switch to B → availability "corpus_unavailable"
              sameAuthorityId true · sameAddedAt true · noFabricatedFields true
              re-save under B → 200, same authorityId
              NEW save under B → 409 CORPUS_TARGET_UNAVAILABLE
                                 falseExistentialClaim FALSE
switch back to A → 200, same caseTitle, same authorityId, same addedAt
USER digest     87 tables before · 87 after · changedTables []
```

So what is proven is a **switch mechanism with honest degradation**, not two
simultaneously-populated generations: B was empty, and pointing at it produced a
truthful refusal rather than an empty result or a fabricated field. The USER side
was **byte-identical across the whole switch**.

Two consequences:

1. **Disk sizing does not need two full generations for the proven pattern** — but
   a real release rollback without a 10h20m re-restore does. That is the §7.1 disk
   protocol.
2. **`matter_authorities` preservation across a corpus switch already has remote
   evidence**: `changedTables []` over 87 USER tables, and a saved authority that
   survived A → B → A with the same id and timestamp. Stage A's job (§36 of the
   round instruction) is the **rollback tooling and the regression test**, not
   rediscovering whether the split protects user data. Remote re-proof stays in R1.

---

## 12 · One bounded DATA handoff, proposed not sent

```text
TO       DATA
SUBJECT  judgment_paragraphs_judgment_idx is exactly redundant
CLAIM    judgment_paragraphs_judgment_idx = btree (judgment_id, paragraph_index)
         judgment_paragraphs_unique       = UNIQUE btree (judgment_id, paragraph_index)
         Identical columns, identical order. VERIFIED from pg_indexes, 19 Sep 2026.
IMPACT   4.963 GB of index — 1.8% of the 269 GB serving set; inline maintenance
         during the 1 h 03 m paragraphs COPY; RAM contended with a 24.6 GB hot set
ASK      adjudicate whether the non-unique index may be dropped. Schema change →
         roadmap §3.7 applies. SHIP does not drop it.
NOT ASKED  no broad index review, no new research programme, no HNSW work, and
           nothing that disturbs ingest or embedding continuity
```

DATA remains CONTINUOUS and was given no mission by this round.

---

## 13 · Beta APK distribution — cost and mechanism

§21's requirements, and the cheapest credible thing that meets all of them
without a new vendor:

```text
MECHANISM  Cloudflare R2 bucket + R2 custom domain (HTTPS), access controlled by
           an unguessable per-release path plus the invite that carries it;
           R2 is ALREADY in the approved stack (CLAUDE.md §4)

HTTPS                     R2 custom domain — yes
signed APK                the release build's own signature (Stage A, §31)
stable release identity    releaseId + versionCode + versionName + commit SHA
APK SHA256                published beside the artifact and asserted on install
controlled distribution    per-release path in the invite; not a public index
upgrade path               versionCode monotonic; the invite carries the newest path
rollback artifact          the previous release stays in the bucket, never deleted

COST       APK artifacts at ~60–120 MB each; a handful of releases sits INSIDE
           R2's 10 GB free tier. Egress is FREE. 100 lawyers × a few downloads
           each ≈ USD 0.00.
```

```text
NOT USED   the public source repository as the distribution channel. It is free
           and it is wrong: REPOSITORY_VISIBILITY = PUBLIC, and a private-beta
           binary handed to ~100 named advocates does not belong on an
           unrestricted public download path.
NOT BUILT  a custom app store, a bespoke updater, or any in-app update mechanism.
           Nothing in the current architecture requires one, and the versionCode
           + invite path covers upgrade.
```

---

## 14 · Android developer verification — recorded separately, blocks nothing

Google's current policy was rechecked on 19 September 2026 for A2 and is **not**
re-researched here. Recorded as §22 requires:

```text
LIMITED DISTRIBUTION   UNSUITABLE — caps at ~20 devices per APK; the cohort is ~100
FULL DISTRIBUTION      a potential future-proofing path. ONE-TIME ACCOUNT COST,
                       NOT RECURRING INFRASTRUCTURE. Not in this package's
                       monthly figures, and deliberately not amortised into them.
PLAY PUBLICATION       NOT REQUIRED for the private APK beta
ENFORCEMENT 30 SEP 2026  Brazil, Indonesia, Singapore, Thailand only.
                         INDIA IS NOT IN THAT WAVE; global expansion 2027+.
```

```text
PLAY_PACKAGE_REGISTRATION_STATUS = UNKNOWN_PENDING_CONSOLE_CHECK
```

LawMind's Play / Android Developer Console state **has never been observed** and
is not observable from here. It is a **founder action**, it goes to
`docs/FOUNDER_QUEUE.md`, and it **does not block S4-R0 or Stage A**. No removal
risk is asserted, because asserting one would require seeing the console.

---

## 15 · Security

```text
ROTATED CREDENTIALS ONLY. The new beta deployment uses freshly rotated
credentials and NEVER the Gate-C credentials.
```

Four founder rotations are **OPEN** and are prerequisites to provisioning, not to
this package:

```text
DO_TOKEN_ROTATED              = OPEN
RESEND_KEY_ROTATED            = OPEN
SPACESHIP_KEY_SECRET_ROTATED  = OPEN
R2_BACKUP_KEY_ESCROWED        = OPEN
```

**Destroying the hosts did not invalidate the credentials.** Gate-C teardown
reached 7/7 DELETED_VERIFIED and recurring USD 0, and every one of those four
keys remains leaked-but-possibly-valid. Teardown is not rotation. No secret value
was read, printed or used to produce this document, and **no DigitalOcean API
call was made** — the Gate-C prices quoted here come from our own committed
ledger, not from a live authenticated query.

Also carried, unchanged: `SECURITY_BETA_BASELINE` rows whose only possible
evidence is the future public HTTPS environment stay `REMOTE_ONLY_PROOF` and are
never marked PASS from code existence.

---

## 16 · Spending recommendation

```text
MAX_INITIAL_SPEND_REQUEST = USD 450
MAX_MONTHLY_SPEND_REQUEST = USD 550

EXPECTED MONTHLY SPEND    = USD 287.17   (architecture A)
```

The two numbers are deliberately above the expected spend, and the gap is not
padding — it is what removes a second founder round-trip from the critical path:

```text
USD 287.17  architecture A, month 1, including R2 backup
+   ~4.40   the 10 h 20 m initial restore (inside the monthly cap anyway)
+  ~21 h    headroom for ONE failed restore and a retry (still inside the cap)
+  131.00   a mid-month prorated resize to architecture C, IF the §6.3 cold-query
            diagnostic shows RAM-bound behaviour
────────────
    ~450    MAX_INITIAL_SPEND_REQUEST

USD 549.17  architecture C in full, so that a MEASURED need to resize before
            Wave 2 does not require a second approval mid-beta
────────────
    ~550    MAX_MONTHLY_SPEND_REQUEST
```

```text
PROVISIONING_AUTHORIZED = NO
```

**No paid action follows from this document.** Nothing is created, and SHIP does
not wait: the session proceeds immediately to Stage A local candidate closure
(roadmap §13.1.1), which is where the remaining private-beta blockers actually
are.

### Teardown procedure — the thing that makes the spend reversible

```text
PROVEN  docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md §Teardown, in documented order
        scripts/lcc-r32b-do.mjs — deletes ONLY ledgered resource ids, reads each
        one back by id to prove deletion (a 204 is a request, not a fact), and
        refuses the foreign Droplet ubuntu-s-vikas by name
RESULT  Gate C: 7/7 DELETED_VERIFIED · 0 UNKNOWN · twelve collections swept ·
        recurring compute USD 0 · accrued USD 16.67 against a USD 75 cap
```

The reason architecture A is recommended over a USD 25/month saving is partly
this paragraph. A monthly commitment whose exit has been executed and falsified
once is a materially smaller commitment than one whose exit is a plan.

---

## 17 · The one bounded founder decision

**Everything above is a recommendation. This is the only thing that needs an
answer, and the lane keeps moving either way.**

> **Approve `MAX_INITIAL_SPEND_REQUEST = USD 450` and
> `MAX_MONTHLY_SPEND_REQUEST = USD 550` for the persistent beta plane, to be
> provisioned as architecture A (DigitalOcean Storage-Optimized 4 vCPU / 32 GiB /
> 600 GiB + Basic 2 vCPU / 4 GiB + Cloudflare R2, expected USD 287.17/month),
> with authority to resize in place to architecture C (USD 549.17/month) only if
> the S4-R1 cold-query diagnostic shows RAM-bound behaviour?**
>
> Provisioning would additionally require the four OPEN credential rotations
> (§15), which are separately yours.
>
> **Answering "not yet" costs nothing today.** Stage A has weeks of work that
> needs no cloud, and A2's spend gate exists so that the money starts when the
> candidate needs it.

---

## 18 · Acceptance

```text
RECOMMENDED_TOPOLOGY   = DO so-4vcpu-32gb (CORPUS) + s-2vcpu-4gb (API/USER) + R2
ALTERNATIVE            = Hetzner SIN1 CCX33 + volumes — priced, NOT RECOMMENDED (§7.2)
HIGH_MEMORY_ALTERNATIVE = DO so-8vcpu-64gb — justified by measurement as a
                          CONTINGENCY, with the test that would refute it (§6.3)

EST_MONTHLY_COST       = USD 287.17
EST_INITIAL_RESTORE    = 10 h 20 m calendar · USD ~4.40 compute
COLD_QUERY_RISK        = MODERATE at 32 GiB · bounded by admission · resizable
RELEASE_PACK_REUSABLE  = YES  (payload sha256 revalidated immediately before R1 uses it)

FOUNDER_SPEND_REQUIRED    = YES
MAX_INITIAL_SPEND_REQUEST = USD 450
MAX_MONTHLY_SPEND_REQUEST = USD 550
PROVISIONING_AUTHORIZED   = NO

CLOUD_MUTATION         = NO
PAID_RESOURCE_CREATED  = NO
DO_API_CALLED          = NO
SECRET_READ_OR_PRINTED = NO
CAPABILITY_CHANGED     = NO    (registry R18, contract R17, wire 1 — untouched)
DATA_DISTURBED         = NO
RED_INVOKED            = NO

CORRECTIONS_RECORDED   = 3
  1. PACK3_FULL_RESTORE_DURATION is OBSERVED 10 h 19 m 42 s, not UNKNOWN (§4.2)
  2. DO bills bundled plans at a 672 h monthly cap, so Gate C was USD 350/mo and
     not the USD 375 that $0.52083 × 720 implies (§9.1)
  3. REINDEX after restore is moot on a COPY-based logical restore; the collation
     risk is semantics, and the behavioural suite is the proof (§10.2)

UNVERIFIED             = 4
  - Hetzner block storage volume price
  - Hetzner SIN1 CCX13 price
  - whether Storage-Optimized plans exist in DO blr1
  - whether the legacy so1_5-4vcpu-32gb (900 GiB) slug is still offered
ASSUMPTION_STATED      = 1
  - one search per active research user per 30 s (UNMEASURED; Wave 0 measures it)
```

**S4_R0 = DELIVERED.** SHIP proceeds to Stage A without waiting.
