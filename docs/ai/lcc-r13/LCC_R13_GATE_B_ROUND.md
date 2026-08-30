# LCC SPRINT-2 — GATE-B BACKEND CLOSURE

**Lane:** LCC · 30 August 2026
**Session:** `181cacca-e499-4a57-a1ab-0bf71847a88f`
**Authority:** `LAWMIND_MASTER_ROADMAP_V7_1.md` §10.1 must-land list; Sprint-2 prompt §0–§11.

Every number here came from a command or query run in this session. Where a
project document disagrees with what the code or the database holds, both appear
and the row says which one was measured.

---

## 0. THE SENTENCE THAT MATTERS MOST

**The roadmap's eCourts position was already stale when it was published, and
three of its four claims are now wrong in our favour.** `fillDistrict` has
answered correctly since 22:58Z on 29 August. The User-Agent hypothesis it names
as live was refuted by requests that ran under the fix and still failed. The
CAPTCHA it treats as the open question is now accepted 3 of 3.

What is NOT better: `ecourts_observation` is still **0**, there is still no real
cause-list fixture, and the blocker has moved to the source's own backend. §4.

---

## 1. MUST-LAND, ITEM BY ITEM

| # | roadmap §10.1 must-land | verdict |
|---|---|---|
| 1 | Day-0 integration seal | **PASS** (previous session, `2b378f7`; re-verified §9) |
| 2 | `snapshot_hash` durability | **PASS** — §2 |
| 3 | Model files hashed and protected | **PASS** — §3 |
| 4 | Off-machine backup **and restore proof** | **PASS** — §5 |
| 5 | eCourts diff + one bounded experiment + an outcome either way | **PASS (outcome: bounded stop)** — §4 |
| 6 | Sparse admission with the quality slice | **PASS_WITH_LIMIT** — §6 |
| 7 | Party routing + kill switch | **PASS** — §7 |
| 8 | Hosting selection | **PASS** — §8 |

May-slip, and what actually happened to it:

| item | state |
|---|---|
| eCourts retention probe | `NOT_STARTED` — depends on a canary that has not landed |
| eCourts daily pilot | `NOT_STARTED` — same |
| Trust-state contract exercise | `SLIPPED` to Sprint 3, §7.1 |
| Model revision *recovery* | `UNKNOWN`, which the round declares acceptable; files protected |

---

## 2. REPRO_DEBT_1 — `snapshot_hash`

`SNAPSHOT_HASH_DURABILITY = PASS`, on both halves.

**What it was.** A nullable column with a constant `DEFAULT '5b5d02384b46c96c'`
applied by no migration, and a writer that named the column zero times. 2,587,766
rows wore that label because the schema handed it to them. On the day the
definition moved, the writer would have kept stamping the old generation's hash
and nothing would have errored — two populations, one label, in a table that
looks perfectly consistent, and an HNSW index over a population that is not the
one it claims.

**Where the committed schema lives, and why not in the product journal.**

> `INTENT: code does` — identity comes from a constant column DEFAULT and
> `release-export-cli.ts` refuses any export of the table for reason
> `identity_from_column_default`.
> `the failing check/task expects` — a committed schema representation a fresh
> install reproduces, writer-supplied identity from the active manifest, refusal
> on missing or unknown, and tests proving A cannot be stamped as B.
> `the spec says` — `release-export-cli.ts` and bus 1546 record
> `VECTOR_STAGE_ROLE = FACTORY_SCRATCH` and "no product migration merely to
> canonise scratch", and roadmap §7 excludes dense vectors from the remote
> serving plane.

All three agree the identity must become reproducible and disagree only on
**where**. A Drizzle migration would have pushed a `vector(1024)` staging table
onto the serving plane that §7 excludes and the export contract already refuses.
So `packages/db/factory/` is a committed, journalled, sha-pinned schema with its
own idempotent applier, and **the product journal stays at 100 committed / 100
applied**.

**What replaces the default**

- `embedding_snapshot` — immutable generations, at most one `ACTIVE` (enforced by
  a partial unique index), immutability enforced by trigger, `ACTIVE -> SEALED`
  the only permitted transition.
- a `BEFORE INSERT` trigger that refuses an identity the registry does not hold
  as the active one — this is the A-stamped-as-B guard.
- a `BEFORE UPDATE` trigger that refuses to relabel an existing row.
- `snapshot_index_predicate(<identity>)`, which generates the HNSW population
  predicate deterministically and refuses an unregistered population.

**What is deliberately not done.** The 486,955 pre-identity rows are NOT
rewritten. Half a million UPDATEs under a live GPU writer buys neatness and costs
bloat. They are named `UNIDENTIFIED_LEGACY_V1`, registered, SEALED, and frozen by
the update trigger — a named residual class rather than a silent one.

**Applied live without stopping the walk.** Schema and the first ACTIVE row
landed in one transaction at 08:07Z — the trigger refuses every write while no
generation is ACTIVE, so they had to land together or not at all. Lenient for one
batch boundary, then strict at 08:24Z.

**The observation, not the inference:** batch `lcc-00258` inserted 199 rows AFTER
the strict flip without erroring. Under strict mode an omitted identity raises.
That is what proves the writer supplies the value rather than the registry
resolving it on its behalf.

```
COMMITTED_SCHEMA            packages/db/factory/0001_vector_snapshot_identity.sql
                            sha256 40642971ad67b2d5...
LIVE_SCHEMA                 column_default NULL; two triggers present; registry seeded
FRESH_INSTALL               PASS — disposable database, schema built from the committed file alone
MIGRATION_NOOP_SECOND_RUN   PASS — every file NOOP_ALREADY_APPLIED
EXISTING_ROW_SEMANTICS      486,955 legacy NULL rows untouched and frozen
NEW_WRITE_SEMANTICS         writer-supplied from RECONCILED_VIEW_HASH, validated by trigger
A_NOT_B_NEGATIVE_TEST       PASS — a stale writer is refused, not mixed
TESTS                       10/10, packages/db/factory/snapshot-identity.test.mjs
```

**The handshake bus 1546 predicted is complete.**
`vector-export-contract.test.ts` moved from `identity_from_column_default` to
`null_snapshot_identity`. The table is still refused — correctly, because 486,955
rows carry no identity — but it can no longer be ambushed by the next generation
wearing this one's label.

**Two writers also lost identity in the other direction.** The quarantine table
had no `snapshot_hash` column at all, so a restore of its 72,099 rows would have
stamped them with whatever generation happened to be current. Both quarantine
paths now carry it in both directions.

HNSW remains FORBIDDEN and is gated on NEW1's entry criteria, not on this.

---

## 3. REPRO_DEBT_2 — MODEL ARTIFACTS

`docs/ai/lcc-r13/model-artifact-manifest.json`.

```
MODEL_REVISION                    UNKNOWN  (acceptable at Gate B)
MODEL_FILES_HASHED                PASS — five of five recomputed from disk by LCC
MODEL_ARTIFACT_MANIFEST           written, with dimension, metric, normalisation, recipe
MODEL_WEIGHTS_PROTECTED           PASS — off-machine copy read back and compared byte for byte
MODEL_LICENSE_BACKUP_PERMISSION   PERMITTED (MIT, verified from the Hugging Face API)
CLASSIFICATION                    REPRODUCIBILITY_CRITICAL
```

Five of five hashes and five of five byte counts reproduce NEW1's manifest
exactly. That is a real independent confirmation, not a restatement: two lanes,
different days, different code, same bytes.

The weights match **no published revision** — 42,988 of 2,266,820,608 bytes
differ from the pinned upstream, 0.0019%, with sign flips rather than rounding.
NEW1 established that and LCC did not re-derive it; what LCC verified is the part
Gate B rests on — that the local bytes are what the manifest claims, and that the
off-machine copy returns them identically (`rclone check --download`: **0
differences, 5 matching files**).

The unencrypted model upload is recorded as an **accepted deviation** with the
reasoning rather than waived: the encryption rule protects confidentiality, and
these are public MIT weights carrying no client data. The moat pack, which does
carry that data, is AES-256-GCM encrypted and its restore was proven from
ciphertext (§5).

---

## 4. eCOURTS — THE POSITION MOVED THREE TIMES AND STOPPED AT THE SOURCE

Full evidence: `docs/ai/lcc-r13/ECOURTS_BOUNDED_STOP_REPORT.md`.

```
ECOURTS_HEAD_EVIDENCE_REVIEW      COMPLETE — 9 hypotheses classified from HEAD and the ledger
ECOURTS_BROWSER_REQUEST_EVIDENCE  retained JS + retained page; field parity verified OFFLINE
ECOURTS_BROWSER_DIFF              submit fields match the licensed client's own serialize()
                                  plus the appended fields, in the official order
UA_EXPERIMENT_STATE               TESTED_REFUTED — the roadmap's experiment must NOT be run
FILLDISTRICT_STATE                SOLVED
CAPTCHA_SUBMIT_STATE              ACCEPTED 3/3
REAL_CAUSE_LIST_FIXTURE           NOT_OBTAINED
ECOURTS_OBSERVATION_COUNT         0
ECOURTS_BOUNDED_STOP_REPORT       PUBLISHED
RETENTION / DAILY_PILOT           NOT_STARTED
USER_MONITORING                   DISABLED_NOT_READY
```

Three findings worth the round on their own:

**The UA hypothesis was refuted before the roadmap proposed it.** `daffb51`
(29 Aug 21:18Z) moved attribution off `User-Agent` onto a dedicated header.
`fillDistrict` requests at 22:47Z–22:53Z ran under that code and still returned
`Invalid Request`. What fixed it was reading the `ajaxCall` header pair live
rather than from a constant — the pair rotates roughly hourly.

**A populated response parsed to zero.** `optionsOf` required quoted attribute
values; the interface writes `value=8`. The only quoted entry is the placeholder,
which the function filters out by design. Eleven Delhi districts read as
`no district (0 offered)` — a sentence indistinguishable from an empty upstream
answer. This is `PARSE_EMPTY != NO_CASES` happening for real, and it was fixed
from bytes already in `official_source_artifact`, spending zero live requests.

**Three "Invalid Captcha" rejections were not the solver.** The retained images
were read by eye: `y86h6r`, `ktveGT`, `29mgst` — all three correct, and the
re-run bench puts paddle at 11/12 exact on real eCourts captchas. Three correct
codes rejected consecutively is about one run in seventeen hundred. The defect
was ours: the cookie jar was captured once at session open and never updated from
`Set-Cookie`, so the CAPTCHA image GET stored the expected code in one PHP
session and the submit arrived in another.

**Where it stops is the source.** Three bounded submits — Sunday civil, Friday
civil, Friday criminal — all with the CAPTCHA accepted, all answering
`{"errormsg":"Connection to server failed try after some time...."}`, the
portal's own message for a failure between it and the district court. The weekday
control rules out "Sunday has no list"; the `cicri` control rules out "this bench
publishes no civil list". STOP, per §5B. No TLS or fingerprint impersonation was
implemented and none will be.

**No observation was written, and nothing here says what any court listed.**

---

## 5. BACKUP AND RESTORE — PROVEN FROM THE OFF-MACHINE COPY

`docs/ai/lcc-r13/offsite-restore-proof.json`. R12b proved a restore of the dump
**on this disk**, which proves `pg_restore` works. It does not answer the
question Gate B is asking, so this one starts at Cloudflare R2 and never consults
the local archive.

```
OFFSITE_BACKUP            2026-08-30T00-22-54-395Z-moat-r12b-enc, AES-256-GCM
OFFSITE_RESTORE           RESTORE_PROVEN_FROM_OFFSITE
RESTORE_ELAPSED           1,022.3 s total — 272.3 download, 3.1 decrypt, 660.5 restore
CIPHER CHECKSUMS          5 of 5 match the pack's own manifest
PLAIN CHECKSUMS           5 of 5 match after decryption
ROW COUNTS                35 of 35 tables match the pack's manifest, 0 mismatched
CONTENT CHECKSUM          5388aa9b9490fbb63a650d45b4f80085 — restored == live
MODEL_HASH_RESTORE_CHECK  0 differences, 5 matching files (rclone check --download)
BACKUP_KEY_RECOVERABILITY FOUNDER — see §10
```

**Two findings the proof exists to produce, and both would have bitten on the day
it mattered.**

1. **The default recovery command truncates the pack.** rclone's multi-thread
   download against this bucket corrupted both large objects and then failed the
   retry with `failed to find object after copy: object not found`. Single-stream
   retrieved the same objects at exactly their stored size. **The stored objects
   are sound; the obvious command for getting them back is not.** The proven flag
   is pinned in the script.

2. **`moat.dump` alone cannot restore two of 35 tables.** `pg_dump -t` emits
   **zero** `TYPE` entries — `pg_restore -l` lists 278 objects and not one is a
   type — so exactly the enum-bearing tables fail: `statute_mappings` (three
   enums) and `ecourts_fetch_ledger` (`ecourts_fetch_outcome`). Silently. A check
   that counted total rows or sampled one table would have called it clean.
   Losing the fetch ledger is not small: it IS the evidence that eCourts access
   stayed inside the grant. The pack ships `schema.sql` for exactly this, and the
   documented sequence — schema first, then `--data-only` — is now pinned and
   exercised on every run.

---

## 6. SPARSE ADMISSION AND QUALITY

`docs/ai/lcc-r13/sparse-quality-battery.json`. R12's battery measured state,
results, p50, degraded arms and rarest document frequency. Every one of those is
a speed-or-mechanism number. This adds the columns the roadmap asks for.

```
SPARSE_ADMISSION   PASS
SPARSE_QUALITY     PASS_WITH_LIMIT
PARADEDB_STATUS    CLOSED
```

**Admission is population-shaped, and the threshold is now located.** The three
broad criminal queries (`bail`, `anticipatory bail`, `quashing FIR`) are admitted
at 2,454 and 15,704 documents and refused at 38,379 and above:

| filter shape | population | admitted / refused |
|---|---|---|
| `court:small_hc` | 2,454 | 5 / 0 |
| `court+month` | 15,704 | 5 / 0 |
| `court:supreme_court` | 38,379 | 2 / 3 |
| `court+year` | 261,564 | 2 / 3 |
| `court+caseType` | 315,028 | 2 / 3 |
| `court:large_hc` | 2,276,089 | 2 / 3 |
| unfiltered | 18,758,460 | 2 / 3 |

> **A named product gap, for NEW3 and RCC.** An advocate who filters to the
> Supreme Court and types `bail` gets a refusal. That is honest, and the response
> carries narrowing advice the client can act on, but it is not what a user
> expects from a filter they can see on screen.

**Cold and warm are reported apart, because mixing them makes both meaningless.**
`condonation of delay limitation` unfiltered ran 48,887 ms cold and then 9,061 /
9,163 ms warm, with `pg_stat_activity` showing **zero** other active backends —
so it is cache, not contention. The worst warm p95 is 9,163 ms; the worst cold is
48,887 ms. A p95 over a mixed sample is just the cold run wearing a percentile.

**The usefulness number, and the decomposition that makes it useful.** 40 queries
from `new3-noncitation-gold.json`, each with an adjudicated target:

```
present@10   18/40  (45.0%)
present@50   19/40  (47.5%)
```

The gap between those two is one query, and that is the finding. **21 of 40
targets are absent from the top-50 entirely** — this is a recall failure, not a
ranking one. When the target IS found it is overwhelmingly rank 1: 13 of 19 at
rank 1, 17 of 19 within rank 4. Precision at the head is excellent; half the
answers are simply not reachable.

That is what a lexical-only system predicts on boilerplate legal-issue text, and
broad semantic search is DISABLED in v1 by product rule 6 — a decision, not a
defect. Hence `PASS_WITH_LIMIT` rather than PASS: latency and admission pass, and
the usefulness limit is measured, named and attributable.

Queries with no adjudicated target are recorded `QUALITY_UNLABELED`. No relevance
judgement was invented for `bail`.

---

## 7. PARTY ROUTING AND THE PLATFORM SWITCH

```
PARTY_ROUTING              PASS — d96147e is an ancestor of HEAD; recall 3/6 -> 6/6 stands
PLATFORM_PARTY_FLAG        PASS — search.party_name registered; per-platform resolution shipped
PERSON_CENTRIC_ROUTE_SCAN  PASS — every registered route enumerated from the source tree
TESTS                      17/17, services/api/src/search/party-search-platform.test.ts
```

Apple's 5.1.1(viii) reaches an app compiling personal information from public
databases, and v7.1 is explicit that case-first design is the mitigation and not
a guarantee. So the switch ships before App Review rather than being built under
rejection pressure.

- A platform override may only **NARROW**. An override that is not strictly
  narrower is ignored, so this can never become a back door that turns on
  something the release-wide registry refuses.
- With it flipped the party arm does not run, `party_name_disabled` reaches the
  response, and **exact case number, CNR, citation and case title are untouched**
  — asserted per query shape, because a switch that took exact identity with it
  would be worse than the rejection.
- `GET /release/capabilities` answers per platform and names what it narrowed, so
  a store listing can be checked against the platform it is listed under.
- **The overrides map is empty**, deliberately. §9.5 says ship the switch; it does
  not say disable the capability, and disabling it pre-emptively would remove
  something advocates use on a prediction about a review nobody has run.

The person-centric scan reads the source tree rather than exercising endpoints,
because a behavioural test cannot prove the ABSENCE of a route. A future
`/people/:id` fails on the day it is written.

### 7.1 Trust-state contract — SLIPPED, with the gap named

`TRUST_STATE_CONTRACT = SLIPPED_TO_SPRINT_3`. It is on the may-slip list and RCC
does not need every state on day one. What Sprint 3 inherits is the exercise of
rare states through isolated fixtures — citation `AMBIGUOUS` and `NO_CITATION`,
body/source `EVIDENCE_WITHHELD` and `IMAGE_ONLY`, and graph partial-coverage —
not the contract shape, which NEW3 froze and LCC implemented in R12
(`DATA_TRUST_API = PASS`).

---

## 8. HOSTING

`docs/ai/lcc-r13/HOSTING_SELECTION.md`.

```
SERVING_EXPORT_SIZE   168,452,186,112 bytes (156.9 GiB) — re-measured at HEAD
HOSTING_SELECTION     DigitalOcean Managed PostgreSQL, 8 GiB / 4 vCPU, blr1 Bangalore
INDIA_RTT_STATE       EXTERNAL_MEASUREMENT_REQUIRED, with the exact procedure recorded
PRODUCTION_CUTOVER    NOT_ATTEMPTED
```

R12 blocked selection on spend. This round's instruction is different — select on
evidence, do not buy — and two primary sources closed the gaps R12 could not:

- **AWS's own machine-readable price list** for `ap-south-1` (17.6 MB,
  `Last-Modified: Fri, 28 Aug 2026`) gives real Mumbai numbers where R12 had only
  a non-region-specific aggregator quote: `db.t4g.large` $0.1670/hr = $121.91/mo,
  gp3 $0.1310/GB-Mo, backup $0.0950/GB-Mo.
- **DigitalOcean's own docs** confirm `blr1` Bangalore exists and runs managed
  PostgreSQL — the fact R12 correctly refused to assume.

Two candidates are in India and two are not, and that decides it before price is
read. Hetzner has no India region and its Singapore location is cloud-only;
Akamai's India availability is not on its pricing page and its comparable tier is
2.7x. DigitalOcean at $122–132 against AWS Mumbai at $148 plus backup, with
storage and backups inside the DigitalOcean plan.

The pricing page's `140–280 GiB` band is ambiguous about what the base includes;
both readings are stated and the choice wins under either.

---

## 9. END-STATE PREFLIGHT FOR FIFTH

Re-checked at the END of the round, not carried from the start.

```
LCC SPRINT-2 COMMITS      4ac4cb24, a4285e4c, fa9d22a2, b267b725 — all ANCESTOR_OF_HEAD
OTHER LANES NOT REVERTED  4baca742, 1f4863ba, 666cf4a6 (NEW3), 53850be6 (RCC),
                          6b90f98 (LCC R11), edac0de (NEW1 R11), 831c6c2 (NEW3 R12)
                          — all ANCESTOR_OF_HEAD
REVERTS IN WINDOW         0 (two commits mention "revert" in prose; neither is one)
STAGED PATHS              none
PRODUCT DIRT              none — the three-round-old citations copy correction landed in b267b725
COMMITTED MIGRATIONS      100   (packages/db/drizzle/*.sql)
JOURNAL ENTRIES           100
APPLIED MIGRATIONS        100   (max created_at 1788037236331)
FACTORY SCHEMA            0001_vector_snapshot_identity.sql APPLIED, sha 40642971ad67b2d5...
SNAPSHOT REGISTRY         5b5d02384b46c96c ACTIVE · UNIDENTIFIED_LEGACY_V1 SEALED
IDENTITY POLICY           require_explicit_writer_identity = true
ORIGIN_MAIN_STATE         IN_SYNC — fast-forward push, 7 commits, no force
SOURCE_OFF_MACHINE_STATE  committed source is on origin AND the moat pack is in R2
ECOURTS_OBSERVATION_COUNT 0
```

**Background workers, verified by output rather than by process:**

```
NEW1 coarse walk    ALIVE — new1_doc_vector_stage 3,073,526 -> 3,153,385 during the round
NEW1 GPU writer     exactly one
NEW2 daily delta    RUNNING_PROGRESSING (scheduled)
LCC enrichment x3   RUNNING_PROGRESSING — frontiers closed, backoff at its 3600s ceiling
LEASE_LIVENESS_TOOL FIXED — see below
FAKE_RUNNING_ROWS   0 — see below
```

**The two operational-integrity fixes.** `lane-lease status NEW1` read `DEAD` for
341 minutes while `resource-lease status HEAVY_BOX` read `HEALTHY_BY_PROGRESS`
about the same worker at 99% GPU. A lease that never opted in to durable-progress
liveness can now be **contradicted by its own output**: the state is unchanged, so
nothing that reads `state` gets more permissive, but the headline says CONTESTED
with the numbers and a takeover is refused without `--force`. 9/9 tests, both
directions.

LCC's three enrichment rows carried pids from 27 August. Re-registered as cadence
jobs owned by their scheduled task — which is what actually owns them. That
exposed the second defect: Windows reports all three `State=Running`,
`MultipleInstances=IgnoreNew`, `LastTaskResult=0x800710E0`, which is the
scheduler refusing a trigger because an instance is already running. Read as a
failure it pages on three healthy workers forever. The exemption is narrow —
forgiven only when the task is actually Running under IgnoreNew, both read live.
10/10 tests.

`.venv-ocr/**` was NOT touched. Ownership of the shared `.gitignore` is unclear
and the round says not to edit it without a lease.

**This round did not create the FIFTH Gate-B receipt and must not.** The evidence
above is preserved so that receipt can be created AT GATE TIME.

---

## 10. HANDOFFS AND BLOCKERS

**Cross-lane, sent on the bus this round — and one came back with a correction
to this lane's own arithmetic:**

| to | seq | what | outcome |
|---|---|---|---|
| NEW2 | 1576 | the Gate-A M0 receipt binds `docs/ai/new2-r10/freshness-observation.json` at working-tree sha `47676cd9…` while HEAD holds `116a1748…` | **CLOSED same day** — committed unmodified in `ee73218` |
| NEW1 | 1577 | the writer change, the registry, how to move a generation safely, the HNSW predicate, the contested-lease fix, and independent confirmation of their model manifest | sent |

### The correction NEW2 sent back, and it is a correction to this lane

**LCC 1576 said eight of the nine bound artifacts match both the working tree and
HEAD. That was wrong, and NEW2 found it (bus 1578).** One of those eight could
never match HEAD:

```
manifest.path   .tmp-new2/m0-upstream/objects.json
                a72d98686d4d8a01…   matches the working tree
                <absent at HEAD>    .gitignore:128 excludes .tmp-new2/
```

Not merely uncommitted — **unignorable by construction**. And it is the quieter
and more load-bearing of the two: that path is the authority for
`upstreamUnique` 18,951,606, 1,438 partitions and 0 partition errors. A verifier
who fixed only the file LCC named would still have held a receipt whose
denominator rested on 254 KB that existed on one box.

NEW2 published the bytes unchanged at
`docs/ai/new2-r10/m0-upstream-objects-gate.json` (`b4883716`) and left the
receipt amendment to LCC, since `docs/ai/lcc-r12/**` is this lane's.

**What LCC did about it.** Recomputed the sha over the published file this
session — `a72d9868…`, equal to `manifest.sha256` exactly, so the equivalence was
verified rather than taken from a report — and appended a
`manifestPathCorrection` block to `docs/ai/lcc-r12/m0-gate-a-receipt.json`.

An APPEND, not a reconstruction: `manifest.path`, `manifest.sha256` and every
measured value are byte-for-byte untouched, and the original scratch path stays
verbatim because that is where the walk actually ran. Rewriting it would be the
relabelling roadmap §3 rule 16 forbids. The receipt is still not self-verifying,
and the block says so; a verifier now follows the sha to bytes a clone can reach.

**All seven bindings verify at HEAD.**

**Closed without action:** the Day-0 seal's NEW3 conflict
(`NEW3_V1_PRODUCT_DEFINITION_R12.md:271` asserting the retracted
`CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED`) was already superseded by NEW3 R13's
own append-only amendment. Not re-raised.

**Founder items** — `docs/FOUNDER_QUEUE.md`, not interruptions:

1. **Backup key escrow.** `R2_BACKUP_ENCRYPTION_KEY` exists only in `.env` on
   this workstation. An encrypted backup whose key dies with the machine it
   exists to survive is not a backup. A password manager is enough. Until then,
   host-loss recoverability of the moat pack **cannot be claimed** and is not
   claimed here.
2. **Hosting spend**, ~$122–132/month for the selected instance, plus ~$10–25
   once for the India RTT probe origins. The selection is made and documented;
   only the purchase is outstanding.

---

## 11. WHAT THIS ROUND DID NOT DO

Named so their absence is a decision rather than an omission: no HNSW build, no
passage Tranche V2, no broad semantic release, no citation bulk apply, no
monitoring product exposure, no production provisioning, no architecture rewrite,
no `.gitignore` edit, and no TLS or network-fingerprint impersonation.

No background worker was stopped. No other lane's staged work was swept. No
migration was applied to the product journal.
