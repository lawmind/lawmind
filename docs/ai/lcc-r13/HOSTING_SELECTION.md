# HOSTING SELECTION — Sprint-2 Gate-B

**Lane:** LCC · 30 August 2026 · **Supersedes** `docs/ai/lcc-r12/HOSTING_BAKEOFF.md`
**Authority:** Sprint-2 prompt §9 — *"HOSTING_SELECTION must be a documented
evidence-based choice, not a purchase."* · *"Do not provision production."*

R12 recorded `HOSTING_BAKEOFF_BLOCKED_BY = no provisioned instance in any
candidate region` and stopped. This round's instruction is narrower and different:
select on evidence, do not buy, and where a number cannot be measured from the
engineering environment, **record the exact external measurement required rather
than inventing it.** That is what follows.

Every price below came from the vendor's own primary source, fetched today. Where
a vendor's page does not render prices as text, the row says so and stays empty.

---

## 1. THE FOOTPRINT — RE-MEASURED AT HEAD, NOT CARRIED FORWARD

Queried this session against the live factory database, not read from R12:

| table | total size | bytes |
|---|---|---|
| `judgments` | 151 GB | 162,313,175,040 |
| `judgment_citations` | 5,308 MB | 5,566,267,392 |
| `judgment_statute_refs` | 435 MB | 455,778,304 |
| `statute_sections` | 82 MB | 86,294,528 |
| `lexeme_document_frequency` | 18 MB | 18,456,576 |
| `judgment_judges` | 11 MB | 11,771,904 |
| `statutes` | 432 kB | 442,368 |
| **v1 serving total** | **168.5 GB** | **168,452,186,112** |

```
V1_EXPORT_SIZE            168,452,186,112 bytes  =  156.9 GiB
FULL_FACTORY_DATABASE     338,158,302,911 bytes  =  315 GB   (50% never ships)
V1_TARGET_DISK_REQUIRED   ~200 GB  (release + index rebuild + WAL headroom)
DENSE_VECTORS / HNSW      EXCLUDED from remote v1 — roadmap §7
USER_MATTER_DATABASE      separate, kilobytes, never rolled back with a corpus release
```

The set is `SERVING_TABLES` in `services/api/src/ops/release-export-cli.ts` — an
enumerated decision, not a guess. It grew 8,192 bytes since R12 measured it, which
is the only reason to re-measure rather than quote.

---

## 2. THE CANDIDATES, ON COMPARABLE CLASSES

Comparable class = **managed PostgreSQL, single node, ~8 GiB RAM, ~200 GB usable
storage, in or nearest to India.** Where a vendor's nearest tier does not reach
200 GB, the NEXT tier up is priced, and the row says so — comparing a 160 GB plan
against a 280 GB plan without saying so is the failure this table exists to avoid.

| | **DigitalOcean** | **AWS RDS** | **Akamai (Linode)** | **Hetzner** |
|---|---|---|---|---|
| region | **blr1 Bangalore, INDIA** | **ap-south-1 Mumbai, INDIA** | India region **not on page** | Singapore — **no India region** |
| plan | Managed PG 8 GiB / 4 vCPU | `db.t4g.large` 2 vCPU / 8 GiB, Single-AZ | Managed PG G7 16 GB / 8 core | — |
| storage | 140–280 GiB included | gp3, priced separately | 320 GB included | — |
| compute / mo | **$122.10** (storage inside the tier) | **$121.91** ($0.1670/hr × 730) | **$327.60** | not obtained |
| storage / mo | $0.215/GiB beyond the base | **$26.20** (200 GB × $0.1310) | included | not obtained |
| backup / mo | included in the plan | **$0.095/GB-Mo** beyond free tier | included | not obtained |
| **~monthly, 200 GB** | **$122–132** | **$148.11** + backup | **$327.60** | **unknown** |
| India p50/p95 RTT | `EXTERNAL_MEASUREMENT_REQUIRED` | `EXTERNAL_MEASUREMENT_REQUIRED` | n/a | n/a |
| storage throughput | `EXTERNAL_MEASUREMENT_REQUIRED` | `EXTERNAL_MEASUREMENT_REQUIRED` | n/a | n/a |
| PITR | offered; behaviour unexercised | offered; behaviour unexercised | offered | — |

**Sources, all fetched 30 Aug 2026:**

- DigitalOcean plans and `$0.215/GiB/mo`: `digitalocean.com/pricing/managed-databases`.
- **blr1 exists and Managed PostgreSQL runs there**: `docs.digitalocean.com/platform/regional-availability/`
  — 16 datacentres across 13 regions, `blr1` Bangalore among them. *R12 could not
  confirm this and correctly refused to assume it.*
- AWS: the **official AWS Price List** for `ap-south-1`,
  `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json`,
  17.6 MB, `Last-Modified: Fri, 28 Aug 2026`. This is AWS's own machine-readable
  price file, not an aggregator. Extracted Single-AZ PostgreSQL on-demand:

      db.t4g.large    2 vCPU   8 GiB    $0.1670/hr    $121.91/mo
      db.m6g.large    2 vCPU   8 GiB    $0.2260/hr    $164.98/mo
      db.m7g.large    2 vCPU   8 GiB    $0.2400/hr    $175.20/mo
      db.r6g.large    2 vCPU  16 GiB    $0.2560/hr    $186.88/mo
      db.m6g.xlarge   4 vCPU  16 GiB    $0.4520/hr    $329.96/mo

      gp3 storage Single-AZ            $0.1310 GB-Mo
      backup storage                   $0.0950 GB-Mo

  *R12 recorded only a third-party aggregator's non-region-specific ~$115/mo and
  refused to select on it. The real Mumbai number is now in hand and it is
  higher.*
- Akamai/Linode: `akamai.com/cloud/pricing/asia-pacific`. The 8 GB plan carries
  **160 GB**, below the ~200 GB requirement, so the 16 GB / 320 GB plan at
  $327.60 is the comparable one. India region availability is **not on that page**.
- Hetzner: `hetzner.com/cloud` and `hetzner.com/cloud/pricing` both render
  placeholder text (*"starting from max/mo."*) with no figures — the same
  condition R12 hit, re-checked today, unchanged. The public API requires a token.
  **Locations confirmed on the page: Germany, Finland, Singapore, USA. No India
  region.** Roadmap v5 §6's finding stands: Singapore is cloud-only, so the cheap
  dedicated boxes that are Hetzner's whole appeal cannot be ordered there.

---

## 3. WHAT COULD NOT BE MEASURED, AND EXACTLY WHAT WOULD MEASURE IT

`INDIA_RTT_STATE = EXTERNAL_MEASUREMENT_REQUIRED`.

Measuring RTT from this workstation would measure **this** network. The advocate
is in India and this machine is not, so a number taken here describes the wrong
path. It is not a missing effort; it is a measurement that cannot originate here.

The exact measurement, written so somebody else can run it without asking:

```
origin      a host on a consumer Indian ISP — Jio / Airtel / ACT — in Delhi
            and in Mumbai. A residential connection, not a cloud VM: an
            advocate's phone is on a mobile network, not in a datacentre.
target      the HTTPS endpoint of a provisioned instance in each of
            blr1 (DigitalOcean) and ap-south-1 (AWS)
method      100 sequential HTTPS GETs of a fixed small response, TLS session
            reuse ON, recording p50 / p95 / p99 per origin-target pair
report      per origin, per provider, plus the packet-loss rate
cost        one small VM per region, hourly, torn down after
```

Also unmeasurable from here, and for the same reason: **storage throughput**
(a vendor's IOPS figure is a claim), **PITR behaviour** (must be exercised, not
read), **support responsiveness**, **operational complexity under real load**.

---

## 4. THE SELECTION

```
HOSTING_SELECTION = DigitalOcean Managed PostgreSQL, 8 GiB / 4 vCPU, region blr1 (Bangalore)
```

**Why, in order of weight:**

1. **It is in India.** The product is for Indian advocates on Indian mobile
   networks. Bangalore and Mumbai are the only two candidate regions inside the
   country; Singapore is not, and Akamai's India availability is unconfirmed.
   This is the criterion that eliminates two of the four before price is read.
2. **Cheapest of the two in-country options, by $16–26/month**, and the gap is
   larger than it looks: DigitalOcean's price includes storage and backups, AWS's
   does not. $122–132 against $148 plus backup.
3. **Storage lands inside one tier.** 200 GB sits within the 8 GiB plan's
   140–280 GiB band, so there is headroom for the corpus to grow without a
   compute upgrade — the migration that would otherwise arrive mid-launch.
4. **One bill, one vendor surface.** `CLAUDE.md` §4's standing constraint is
   minimal vendors. R2 is already the object store; a managed PG with backups in
   the plan adds one line, not three.

**The honest ambiguity, stated rather than resolved in our favour:** the
DigitalOcean page shows *"140–280 GiB"* as a range and *"$0.215/GiB/mo, 10 GiB
increments"* separately, and does not state which storage the $122.10 base
includes. Two readings:

- base includes the full band → **$122.10/mo**
- base is 140 GiB and 47 GiB more is billed → $122.10 + 47 × $0.215 = **~$132.20/mo**

Either way it wins, so the ambiguity does not change the choice. It is recorded
so nobody later reads $122.10 as a commitment.

**What this selection is not.** Nothing was purchased, no account created, no
resource provisioned, no card used. `PRODUCTION_CUTOVER = NOT_ATTEMPTED`. The
selection is reversible until the first instance exists, and the three
unmeasurable columns above are the ones that could reverse it — which is why §3
says exactly how to measure them.

---

## 5. WHAT SPRINT 3 NEEDS FROM THIS

Sprint 3 wants a staging API online by 8 September. The path is unchanged and
does not wait on the founder:

1. `release-export-cli.ts` already produces a checksummed bounded release with
   `MANIFEST.json` + `MANIFEST.sha256`; `release-restore-cli.ts` sorts it
   topologically from the target's own `pg_constraint`.
2. **The collation trap is already handled and is a selection criterion, not a
   vendor property.** The source collation is `English_United States.1252`; a
   Linux target cannot match it, so every text sort key is `COLLATE "C"` or the
   restore checksum mismatches on correct data.
3. `vectorExportRefusal()` refuses to ship the vector stage, so remote v1 cannot
   accidentally carry dense vectors out of the factory.

**Founder decision required, and it is spend, not engineering:** approximately
**$122–132/month** for the selected instance, plus roughly **$10–25 once** for
the RTT probe origins in §3. Filed to `docs/FOUNDER_QUEUE.md`.
