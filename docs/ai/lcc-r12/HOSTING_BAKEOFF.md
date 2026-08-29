# Sprint-2 hosting bakeoff — footprint measured, selection BLOCKED

**LCC R12, 30 August 2026.** Roadmap v5 §6 requires hosting to be *"selected from
the measured bakeoff"* before Gate B.

**Verdict: `HOSTING_BAKEOFF_BLOCKED_BY = no provisioned instance in any candidate
region.`** The footprint half is done and exact. The selection half cannot be
completed from this machine, and the round is explicit that it must not be
completed from marketing claims.

---

## 1. THE V1 EXPORT FOOTPRINT — measured, not cloned

The instruction *"do NOT clone the entire local factory DB"* is the whole point,
and the gap is large:

    full factory database          314 GB
    v1 serving release             157 GiB / 168.5 GB      <- what actually ships
    deliberately excluded          146 GB

`SERVING_TABLES` in `services/api/src/ops/release-export-cli.ts` is the
enumerated decision, and this is what it weighs:

| table | total size | bytes |
| --- | --- | --- |
| `judgments` | 151 GB | 162,313,166,848 |
| `judgment_citations` | 5,308 MB | 5,566,267,392 |
| `judgment_statute_refs` | 435 MB | 455,778,304 |
| `statute_sections` | 82 MB | 86,294,528 |
| `lexeme_document_frequency` | 18 MB | 18,456,576 |
| `judgment_judges` | 11 MB | 11,771,904 |
| `statutes` | 432 kB | 442,368 |
| **v1 serving total** | **168.5 GB** | **168,452,177,920** |

### Where the 151 GB of `judgments` actually is

| part | size |
| --- | --- |
| TOAST (`full_text`) | 99 GB |
| indexes (incl. `full_text_tsv` GIN) | 31 GB |
| heap | 22 GB |

**Two thirds of the serving release is judgment full text, and it is not
optional**: the reader renders it and `full_text_tsv` is `GENERATED ALWAYS` from
it, so lexical search — the only search capability `ENABLED_V1` — is derived
from that column. Nothing here can be trimmed without removing a shipped
capability.

`full_text_tsv` is generated, so it is **not in the COPY stream but is rebuilt on
the target**. A restore therefore needs the disk AND the CPU to build a 31 GB
index set. Sizing a target on the dump size alone would undersize it.

### Deliberately excluded — 146 GB

| table | size | why it is not in v1 |
| --- | --- | --- |
| `new1_doc_vector_stage` | 16 GB | factory scratch. NEW1 owns promotion; the master plan forbids it |
| `judgment_chunks` | 9,356 MB | semantic is `INTERNAL_EXPERIMENTAL`, `semanticArmPermitted()` is false |
| `official_source_artifact` | 53 MB | evidence, not serving data — it goes to the **backup**, not the release |
| everything else | ~120 GB | ingest ledgers, telemetry, user state, working tables |

**The vector tables are excluded because no v1 capability reads them, not because
they are large.** `search.semantic.broad` is `INTERNAL_EXPERIMENTAL` with a
public reach of 0.214% of the corpus, and no v1 screen may require it.

### The user/matter database is separate, and tiny

529 users · 3 matters · 529 workspaces. Kilobytes. It carries client detail and
must not share a database with the corpus — a corpus restore should never be
capable of touching an advocate's matters.

**Sizing conclusion: a serving instance needs ~200 GB of disk** (168.5 GB plus
index rebuild headroom and WAL), not 314 GB, and not the 10–30 GB entry tiers.

---

## 2. PRICING — what I could verify, and what I could not

**Verified from the vendor's own rendered pricing page:**

**DigitalOcean Managed PostgreSQL** (official pricing page, fetched 30 Aug 2026):

| RAM | vCPU | included storage | monthly |
| --- | --- | --- | --- |
| 4 GiB | 2 | 60–120 GiB | $60.90 |
| 8 GiB | 4 | 140–280 GiB | **$122.10** |
| 16 GiB | 6 | 290–580 GiB | $244.35 |

Additional storage **$0.215/GiB/month** in 10 GiB increments. The 8 GiB tier's
140–280 GiB range covers our ~200 GB requirement, so **$122.10/month is the
first honest datapoint in this table.** DigitalOcean has a Bangalore (BLR1)
region, which the pricing page does not itself confirm.

**Could NOT be verified, and I will not estimate them:**

| provider | why not |
| --- | --- |
| Hetzner Cloud Singapore | the pricing table does not render to a text fetch. `hetzner.com/cloud` and the docs overview both defer to a console/pricing page that returned placeholder text ("starting from max/mo."). No Singapore surcharge, volume price or instance spec obtained. |
| AWS RDS Mumbai `ap-south-1` | the official pricing page is a region-selector application. Third-party aggregators quote ~$0.159/hr (~$115/mo) for `db.m6g.large`, **explicitly not region-specific**, and a third-party number is exactly the "marketing claim" the round forbids selecting on. |
| Linode/Akamai Mumbai, Vultr Mumbai, Indian providers | not reached this round. |

**Roadmap v5 §6 already recorded the material refinement that matters most:**
Hetzner Singapore is **cloud-only — dedicated root servers cannot be ordered
there** — so Hetzner's headline appeal (very cheap dedicated boxes with large
disks) does not transfer. For a 200 GB Postgres that is the deciding fact, and it
means the cheap-Hetzner assumption should not be carried into Sprint 2 unexamined.

---

## 3. WHAT IS ACTUALLY BLOCKING SELECTION

The bakeoff table roadmap v5 §6 specifies has eleven columns. Pricing is one of
them. **Six of the others cannot be obtained without a running instance in the
region:**

| column | obtainable now? |
| --- | --- |
| monthly compute | partly — DigitalOcean yes, others no |
| Postgres storage cost | partly |
| backup cost | no |
| **India p50 RTT** | **no — requires an instance in-region** |
| **India p95 RTT** | **no** |
| **disk read/write** | **no — a vendor IOPS figure is a claim, not a measurement** |
| PITR | no — behaviour and retention must be exercised, not read |
| egress | partly |
| support | no |
| ops complexity | no |

**Measuring RTT from this box would measure the wrong thing anyway.** The
advocate is in India and this machine is not; a latency figure taken from here
describes my network, not theirs. The measurement has to originate in-region,
which is itself a small provisioned resource.

### The exact spend required, reported rather than silently incurred

To complete the bakeoff honestly:

| item | purpose | approximate monthly |
| --- | --- | --- |
| DigitalOcean Managed PG, 8 GiB / 280 GiB, BLR1 | restore the 168.5 GB release, measure disk + PITR | **$122.10** |
| AWS RDS PostgreSQL, `ap-south-1`, ~200 GB gp3 | the same, on the incumbent-scale option | **~$115–160** (unverified) |
| Hetzner Cloud Singapore instance + volume | the Tier-B comparator | **unknown — pricing not obtained** |
| One small India-region VM (any provider) | the RTT probe origin | **~$5–12** |

**Total to complete: roughly $250–300 for one month**, and it can be torn down
after the measurements. Prorated by the hour it is materially less.

**Nothing was purchased.** No account was created, no resource provisioned, and
no card used. This is a founder decision about a small recurring spend, not a
technical blocker I can engineer around — the round's own rule.

---

## 4. WHAT SPRINT 2 CAN DO WITHOUT THIS

The footprint is the input the bakeoff needed, and it is now exact. Three things
follow immediately and none of them waits on a provider:

1. **The release export and restore path already work.** `release-export-cli.ts`
   produced a verified bounded release this round (checksummed per table,
   `MANIFEST.json` + `MANIFEST.sha256`), and `release-restore-cli.ts` sorts the
   manifest topologically from the target's own `pg_constraint`.
2. **The collation trap is already recorded and is a selection criterion.** The
   source collation is `English_United States.1252`; **a Linux target cannot
   match it**, so every text ordering must be `COLLATE "C"` or the restore
   checksum mismatches on correct data. That is a property of the migration, not
   of any vendor, and it is already handled.
3. **Sizing is settled**: ~200 GB, not 30 GB and not 314 GB.

---

## 5. VERDICT

    V1_EXPORT_SIZE               168,452,177,920 bytes (157 GiB / 168.5 GB)
    V1_TARGET_DISK_REQUIRED      ~200 GB (release + index rebuild + WAL)
    FULL_FACTORY_DB              314 GB   (46% of it never ships)
    USER_MATTER_DB               separate, kilobytes
    HOSTING_SELECTED             — none. Selecting now would be from marketing claims.
    HOSTING_BAKEOFF_BLOCKED_BY   no provisioned instance in any candidate region;
                                 RTT, disk, PITR and backup behaviour are
                                 unmeasurable from this machine. ~$250-300 for one
                                 month, tearable down, unlocks the whole table.
    PRODUCTION_CUTOVER           not attempted, as instructed.
