# LAWMIND — CURRENT STATE (live pointer)

**This file is LIVE.** SHIP updates it after every gate result, founder scope
decision, capability-registry release, and production/persistent-beta deployment.
It points to the truth; it does not replace receipts.

**Last updated:** 19 September 2026 — **SHIP S4-R0X**: the A2 execution-seam
correction (roadmap §14.13.2, prompts §4/§5/§7/§10), the **S4-R0 hosting decision
package** (`ai/ship-s4-r0/BETA_HOSTING_DECISION_PACKAGE.md`, recommendation
USD 287.17/month, `PROVISIONING_AUTHORIZED = NO`), and Stage-A local closure of
N-7, N-8, N-5, N-2's mechanism, N-4 and the `matter_authorities` rollback guard —
record [`ai/ship-s4-stage-a/LOCAL_CANDIDATE_CLOSURE.md`](ai/ship-s4-stage-a/LOCAL_CANDIDATE_CLOSURE.md),
`PRIVATE_BETA_CANDIDATE_LOCAL = HOLD` with six locally actionable items named.

Before that, 19 September 2026 — SHIP S4-A2 (Amendment A2: data moat &
legal-intelligence frontier, private-beta resequencing, cost control), after DATA S4-D0
(continuity census — **PASS**), S4-T0.3 (CI baseline, alert-surface truth, capability
registry R18), S4-T0.2 (runtime / CI / deployed-target repair — **PASS corrected to
HOLD**, see §1) and S4-T0.1 (authority + orchestration repair).
**Seeded from:** [`roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md`](roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md)
(dated snapshot provenance, immutable). Where the two differ, this file is current
and the ledger shows what was true when v7.4 was prepared.

---

## 1 · Authority

| What | Where |
|---|---|
| Master roadmap (current) | [`roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md`](roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md), Amendments **A1 + A2** |
| Sprint prompts (current) | [`roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md`](roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md), Amendments **A1 + A2** |
| Frontier intelligence (NON-GOVERNING) | [`intelligence/LEGAL_TECH_FRONTIER.md`](intelligence/LEGAL_TECH_FRONTIER.md), [`intelligence/SOURCE_OPPORTUNITY_REGISTER.md`](intelligence/SOURCE_OPPORTUNITY_REGISTER.md), [`research/DELHI_HIGH_COURT_PRIMARY_SOURCE_PILOT.md`](research/DELHI_HIGH_COURT_PRIMARY_SOURCE_PILOT.md) — dated intelligence, governs nothing, auto-promotes nothing |
| Reconciliation memo | [`roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md`](roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md) |
| Hashes | [`roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json`](roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json), checked by `pnpm authority:check` |
| Historical only | v7.2 / v7.1 / v5 roadmaps, prompts v2/v3, `docs/CURRENT_PLAN.md` (journal), `BUILD_GUIDE.md` S0–S7 plan |

HEAD: see `git log -1`. The S4-T0.1 commits are listed in
[`ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md`](ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md);
the S4-T0.2 runtime/CI/deployed-target repair in
[`ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md`](ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md);
the S4-T0.3 closure in
[`ai/ship-s4-t0-3/CI_ALERT_REGISTRY_CLOSURE.md`](ai/ship-s4-t0-3/CI_ALERT_REGISTRY_CLOSURE.md).

**S4-T0.2's overall PASS is CORRECTED to HOLD.** Its hosting and deployed-probe
subobjectives closed and stand; its acceptance contract also required
`REPOSITORY_CI_BASELINE = PASS`, and the pushed GitHub Actions run was red while
the round itself recorded repo-wide format, lint and typecheck failures. The
superseding adjudication is
`SHIP_S4_T0_2_RUNTIME_CI_RECONCILIATION = HOLD — REPOSITORY_CI_BASELINE_NOT_GREEN`,
appended to that round's own record. **S4-T0.3 closes the baseline** — it did not
redefine it.

## 2 · Agents and bus

```text
SHIP   ACTIVE      product · client · server · ops · release · contract change control
DATA   CONTINUOUS  corpus · source · legal truth · retrieval · embeddings
RED    FROZEN      invoked only as RED_READ_ONLY / RED_GATE / RED_P0
FOUNDER            docs/FOUNDER_QUEUE.md (not a bus lane)
```

Bus runtime: `ACTIVE_LANES = SHIP DATA RED`, `LEGACY_LANES = LCC RCC NEW1 NEW2 NEW3 FIFTH AUDIT-RO`
(read-only history). Bind: `echo SHIP > .agents/bus/.lane-<session_id>`. Downstream:
SHIP→DATA, DATA→SHIP, RED→SHIP. Protocol: [`LANE_PROTOCOL.md`](LANE_PROTOCOL.md) §0.

## 3 · Gate

```text
GATE_A = PASS · GATE_B = PASS · LOCAL_V1_ACCEPTED = YES
GATE_C = PASS · GATE_C_ACCEPTED = YES · GATE_C_INFRA = DESTROYED_VERIFIED
REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW = PASS · REMOTE_MOBILE_DATA_PROVEN = NO
CURRENT = Sprint 4 — accelerated private-beta candidate build → GATE_D
          (target 2 Oct 2026) · then GATE_E (RED) · launch target 23 Oct 2026
DATA_S4_D0 = PASS   (continuity census, 19 Sep 2026)
```

Next in sequence (roadmap §24 as updated by A2): **SHIP S4-R0** — persistent-beta
hosting / cost / restore decision package, **no provisioning** — then aggressive local
candidate closure (roadmap §13.1.1 **Stage A**) before any recurring cloud spend. A cost
recommendation is not spend authorization: `PROVISIONING_AUTHORIZED = NO` until the
founder explicitly approves, and Stage B provisions only when remote proof is genuinely
on the critical path.

### Private beta plan (A2, founder decision 19 Sep 2026)

```text
PRIVATE_BETA_TARGET               = ~100 PRACTISING LAWYERS (already contacted)
PRIVATE_BETA_PRIMARY_DISTRIBUTION = DIRECT SIGNED ANDROID APK
PRIVATE_BETA_WAVES                = Wave 0 canary ~5 → FREEZE definitions
                                    → Wave 1 ~20–25 → Wave 2 ~100
PLAY_STORE_BEFORE_PRIVATE_BETA    = NO
APP_STORE_BEFORE_PRIVATE_BETA     = NO
STORE_WORK_DEFERRED_TO            = POST_PRIVATE_BETA public-release path (roadmap §17.0)
IOS_SCOPE                         = IN_SCOPE (product + public launch; submission not a
                                    prerequisite to the Android APK beta)
BILLING / IAP / PLAY BILLING      = NOT REQUIRED for the private beta
```

The old 3–5 shadow beta + 10–30 closed beta sequence is **SUPERSEDED** (roadmap §16;
original text preserved as §16.5). Deferred store work is **not** abandoned.

Android developer verification, rechecked from Google's documentation 19 Sep 2026:
limited distribution caps at **20 devices per APK** (unsuitable for ~100); enforcement
begins 30 Sep 2026 in Brazil, Indonesia, Singapore and Thailand, expanding globally in
2027+. **India is not in that wave**, so nothing blocks the direct APK beta today.
Verified-developer status stays a future distribution requirement (roadmap §16.4).

## 4 · Current capability registry

```text
CAPABILITY_REGISTRY_REVISION = R18
CAPABILITY_REGISTRY_FILE     = docs/product/V1_CAPABILITY_REGISTRY_R18.json
CURRENT_CAPABILITY_REGISTRY  = docs/product/V1_CAPABILITY_REGISTRY_R18.json   (same file; the older key name, kept because tooling reads it)
CURRENT_CLAIMS_REGISTER      = docs/product/V1_CLAIMS_REGISTER_R18.md

API_CONTRACT_REVISION        = R17
API_WIRE_PROTOCOL_VERSION    = 1
API_CONTRACT_FILE            = docs/product/RCC_V1_API_CONTRACT_R17_AMENDMENT.md
API_CONTRACT_LEDGER          = docs/product/CONTRACT_CHANGE_LEDGER.json (currentVersion = R17)

PREVIOUS (historical)        = V1_CAPABILITY_REGISTRY_R17.json, R16.json — immutable snapshots
```

R18 (CCR-SHIP-S4T03-01) does two things and no more. It corrects contract
metadata R17 had inherited from R16 without re-stating — `contractRevision`,
`contractArtifact` and `currentContractVersion` on all 30 rows now read R17,
which is what the contract ledger has said since R17 was released. And it ADDS
three `alerts.*` rows for a surface that was user-reachable with no row at all.
**No capability state moves on any platform, 30 inherited rows show zero drift,
ENABLED stays 17, and R16/R17 are byte-identical to their committed forms.**

**These are independent revision domains; the matching number is coincidental.**
The capability registry counts its own releases (R12 → R17) and the API contract
counts its own (R12 → R17, seven product-contract revisions); they have moved in
step for a while and there is no rule that they must. Reading "R17" without
naming the domain is how a future round will match a registry row against the
wrong contract. Always write `CAPABILITY_REGISTRY_REVISION` or
`API_CONTRACT_REVISION`, never a bare R17.

The wire integer is a third thing again and is **1** — the only value that has
ever existed. Contract revisions R12–R17 are all additive on wire protocol 1
(`contractRevisionVsWireVersion` in the ledger).

Observed and NOT changed by S4-T0.2: inside the R17 registry JSON the metadata
fields `contractRevision` and `contractArtifact` still read `R16` /
`RCC_V1_API_CONTRACT_R16_AMENDMENT.md`, and every capability row reads
`currentContractVersion: "R16"`. The contract ledger — which owns contract
identity — says `currentVersion = R17`. R17 moved only the web platform row, so
those fields were inherited rather than re-stated. Whether they are stale or
deliberately pinned to the revision each row was last MEASURED against is a
question about their defined semantics, and changing them is a contract action
under roadmap v7.4 §3.7, not a documentation repair. Left for SHIP to decide
through a CCR.

R17 moved only the web platform: `OUT_OF_SCOPE_CURRENT_FOUNDER` (CCR-SHIP-S4T0-01).
iOS/Android states were inherited from R16 unchanged, and R18 inherits all of them
again.

### Alerts, monitoring, briefing and push — four capabilities, not one

```text
CITATOR_ALERT_STATE = DISABLED_NOT_READY
                      alerts.saved_authority_moved · alerts.filed_citation_moved
                      Producer EXISTS (services/api/src/citations/fanout.ts), routes
                      EXIST (GET /alerts, POST /alerts/:id/read), client surface EXISTS
                      (TodayScreen "Since yesterday" / "An authority you have used has
                      moved"), tests pass. NO END-TO-END DELIVERY OBSERVED — the only
                      producers are `pnpm --filter @lawmind/cron recheck` and an upheld
                      admin dispute, and neither runs anywhere.
ECOURTS_MONITORING  = DISABLED_NOT_READY   (monitoring.user_product, unchanged)
BRIEFING            = DISABLED_NOT_READY   (briefing.daily_loop, unchanged)
PUSH_DELIVERY       = DISABLED_NOT_READY   (alerts.push_delivery; EAS_PROJECT_ID absent
                      from app.config.ts, so no build can deliver one; no push observed)
ALERT_KINDS         = 2 of PD-5's 4 triggers have an alert_kind value and a producer
```

**None of these is PASS and none is claimable.** `docs/product/V1_CLAIMS_REGISTER_R18.md`
prohibits every alert, push, briefing and monitoring claim. The current-v1 CI guard
is `scripts/check-alert-surface-truth.mjs` — it fails if the product PROMISES an
alert it cannot deliver. The old all-four-trigger test is
`scripts/check-pd5-alerts-readiness.mjs`, a FUTURE readiness gate required before
any capability claims full PD-5/PD-6 behaviour, and deliberately **not** a Gate-D
or current-v1 CI requirement while monitoring and uploads are disabled.

## 5 · Product scope

```text
ADVOCATE_PRODUCT      = native mobile iOS + Android
ADVOCATE_DESKTOP_WEB  = DO_NOT_BUILD
ADMIN_WEB             = separate internal/admin surface
PROMOTIONAL_WEBSITE   = temporary / noncore (lawmind.co, repo lawmind/lawmind-site)
PROMO_SITE_REBUILD    = after application candidate is mature
COMPLIANCE_WEB_URLS   = stable release contracts (privacy, support/contact, external deletion, terms if used)
V1_LOOP               = Search → Results → Reader → Source/Evidence → Save → Matter → Return/Refetch
LAUNCH_SHAPE          = B — research only (absent newer measured evidence)
PRIVATE_BETA_PLATFORM = ANDROID (direct signed APK) — see §3
```

**A2 (19 Sep 2026) expands none of this.** The Gate-D product surface is frozen
exactly as above. A2 installs strategic programs — Primary Source Fabric, Source
Passport, five-clock freshness, court event graph, authority intelligence, historical
provenance reconstruction, source disagreement, the Indian legal research benchmark,
model independence, the Delhi HC source lab (roadmap §26) — which create **no**
implementation task, no schema migration and no UI by themselves.
`docs/SCHEMA_TRUTH.md` is untouched. Competitive pressure is never permission to
bypass a capability gate.

```text
DHC_SYSTEMATIC_DATABASE_INGEST = BLOCKED_PENDING_WRITTEN_PERMISSION
FRONTIER_RADAR_GOVERNING       = NO · AUTO_PROMOTE_TO_ROADMAP = NO
```

Deferred/disabled: public semantic, HNSW public use, supporting/adverse semantic,
drafting (POST_V1), uploads/OCR (DISABLED), Hindi generation (POST_V1), hearing
briefing, monitoring (DISABLED_NOT_READY), eCourts user product, statute-linked
judgments, old/new code applicability, any unconfirmed-citation path
(`VERIFY_CONFIRM_PHYSICAL_ACCEPTANCE = MANDATORY` before one exists). iOS party-name
search: submission default OFF.

## 6 · Data state — DATA S4-D0 continuity census, 19 Sep 2026 (PASS)

Record: [`ai/data-s4-d0/CONTINUITY_RECEIPT.md`](ai/data-s4-d0/CONTINUITY_RECEIPT.md).
Measured, not carried forward, unless the receipt says so.

```text
DATA_S4_D0_CONTINUITY = PASS
TOTAL_HELD_JUDGMENTS  ≈ 18.8M
HC_HONEST_COVERAGE_FRONTIER = 2026-07-01   (newest-date ≠ coverage-complete)
SCI_LIVE              = producing current SC judgments, but ABSENT from the freshness ledger
ROW_LEVEL_PROVENANCE  = SPARSE (~99.75% source_id / authorization_basis NULL) —
                        a DATA-QUALITY / PROVENANCE RECONSTRUCTION program, NOT corpus invalidity
CANONICAL_CITATION_CORRECTION = PASS (R24, 539/539 confirmed)
CITED_AUTHORITY_DRIFT = 1,126 rows materialized-content drift; bounded eligibility impact ≤ 300 docs
LOCAL_DATABASE        ≈ 343 GB  ·  SERVING_DATASET ≈ 250 GB (price infrastructure from 250 GB)
SOURCE_DB_COLLATION   = PostgreSQL 18.6 / UTF8 / English_United States.1252
                        WINDOWS_LINUX_COLLATION_EQUAL = NO — a Linux restore is NOT identical
RELEASE_PACK          = D:/lawmind-release-r32b/pack3 · LINEAGE = PARTIAL
                        PACK3_REUSE_CANDIDATE = YES · PACK3_FULL_INTEGRITY = NOT_YET_PROVEN
                        (manifest hash, 8/8 files, 8/8 byte lengths, schema lineage all match;
                         payload sha256 NOT revalidated — hash it when S4-R0/R1 needs the pack)
DELTA_SCHEDULER       = Interactive / logon-only · REBOOT_WITHOUT_LOGIN = NOT PROVEN
platform_config.signups = DISABLED (reason: test cleanup) — SHIP implementation item, not changed by A2
```

### Re-confirmed by S4-D0, and still gated

```text
EMBEDDING_COMPLETE  = YES (queue = 0; NEW1 R15 terminal census 7,675,588 / 7,675,588)
FULL_HNSW           = NO · HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD · PUBLIC_SEMANTIC = DISABLED
CITATION_BULK_APPLY = HOLD   (A2 does NOT authorize it)
ECOURTS_OBSERVATIONS = 0 · MONITORING_12 = 0/12 UNMEASURED (not failed)
MONITORING          = DISABLED_NOT_READY · BRIEFING = DISABLED_NOT_READY
                      PUSH = DISABLED_NOT_READY · CITATOR_ALERTS = DISABLED_NOT_READY
LAUNCH_SHAPE        = B — RESEARCH ONLY
```

The DATA→SHIP scheduler handoff is now **delivered** (bus 1819): the delta embedding
task runs under an Interactive principal and a reboot without logon leaves a silent
hole. It is a SHIP ops item, and not changed by A2.

## 7 · Active stops (roadmap §3.6)

None.

## 8 · Carried reliability items (owner SHIP unless stated)

**Updated 19 Sep 2026 by SHIP S4-R0X.** Five rows closed locally; the remote half
of two of them is S4-R1's, and saying so is the point of the third column.

| id | item | state | must close before |
|---|---|---|---|
| N-2 | `/version` deployment provenance (null deployedAt/digest) | **MECHANISM CLOSED (local)** — `imageDigest` was a literal `null` in the route, so no deploy could populate it; it now comes from `ARTIFACT_DIGEST`/`IMAGE_DIGEST` and stays `null` when the process cannot prove its artifact. Values only exist at deploy time and are **not** faked. `ee7e03cc` | production label (values) |
| N-3 | cold unseen-query capacity (~3.5 s on 32 GiB host) | OPEN — sizing input, priced in the S4-R0 package §6; the diagnostic that would refute the RAM hypothesis is written down | production sizing |
| N-4 | manual prewarm after activation/restart | **CLOSED (local mechanism)** — `ops/prewarm.ts` warms the corpus on the serving path at boot and `/ready` answers 503 until it finishes. `d741c48d` | remote latency proof = S4-R1 |
| N-5 | `/version` env vs `/ready` servingEnv mismatch | **CLOSED** — both now derive from `resolveServingEnv`, so the mismatch is unrepresentable rather than corrected. `RAILWAY_ENVIRONMENT` and `NODE_ENV` removed from the route. `ee7e03cc` | remote equality proof = S4-R1 |
| N-6 | full API suite timing failure = UNKNOWN | **RUN 19 Sep 2026** — see §8.1 | persistent beta (quiet-window run) |
| N-7 | `POST /matters` body validation before auth | **CLOSED** — `requireAuthenticated` gates 18 routes ahead of their validators; a *derived* wiring test enumerates every json-validating route and found two more that hand enumeration had missed. `2eaf6049` | Gate D (security baseline) |
| N-8 | chips selected visually, `selected=false` in a11y tree | **CLOSED (unit)** — the component existed twice with two different bugs; one `components/SegmentedRow.tsx` now carries `accessibilityState`. `a8c97df3` | TalkBack proof on a physical device |
| N-9 | non-debuggable flag observed on release build 1 only | OPEN — not attempted this round; signing material availability not assessed | next release build |
| — | corpus rollback can empty `matter_authorities` | **CLOSED (local)** — the cascade guard named tables, never rows, so an empty corpus-only target and a shared database holding real matters produced an identical refusal cleared by the same flag. It now counts rows and refuses on actual loss; `--allow-cascade-into` no longer clears that case. The ORPHAN half already had 8 local tests against two real corpus generations and they passed in this round's full run. `d1e5bfaf` | remote restore/rollback re-proof = S4-R1 |

### 8.1 · Full local API suite — 19 September 2026

```text
RUN          serial (--test-concurrency=1), services/api, local corpus
RUN 1        TESTS 1331  PASS 1325  FAIL 2  SKIPPED 4  CANCELLED 0
RUN 2        TESTS 1333  PASS 1329  FAIL 0  SKIPPED 4  CANCELLED 0  TODO 0
             225 suites · 5 m 53 s — the confirming run after the corrections
```

Both failures were caused by the N-7 fix and were tests asserting the **old**
ordering — an unauthenticated `POST` to `/verify/confirm` and `/saved-searches`
expecting `400` from the validator, which it only ever received because validation
ran before auth. **Neither test was weakened.** Each keeps its validator coverage,
moved to the schema (`confirmRequest`, `savedSearchBody`) where the accept case can
also be asserted, plus a new test that a *malformed* body now gets `401` — the case
that would still pass if the ordering were reversed is the valid one, so the
malformed one is the case worth keeping. Re-run green.

**N-6's own failure did not reappear.** The `search/sparse-bound.test.ts` latency
assertions that produced it passed in both runs, under contention. But `N-6` asked
for a **quiet-window** run and this was not one — the ingest fleet and this session
shared the box throughout. Recorded as a real measurement of a contended run, which
is evidence against N-6 being live, and explicitly **not** as the quiet-window
result N-6 wants. That one is still S4-R1's.

Reissued from the legacy bus (see §10): bus 1809/1817 (N-2, N-5), 1811 (N-8, N-9, Gate-D
device/store scope), 1812 (is Gate-D row "monitoring claims ≤ capability" satisfiable
while `monitoring.user_product` is DISABLED_NOT_READY? Answer at Gate D: yes, by making
**no** monitoring claim).

## 9 · Store / release

Account readiness (Apple / Play / EAS): [`product/STORE_RELEASE_CHECKLIST_V1.md`](product/STORE_RELEASE_CHECKLIST_V1.md) §0.
At S4-T0.1: `EAS_PROJECT_ID` absent from `apps/mobile/app.config.ts`; `eas` CLI not installed
on this workstation; Apple/Play account rows UNKNOWN (not observable without console access).
`PLAY_PACKAGE_REGISTRATION_STATUS = UNKNOWN_PENDING_CONSOLE_CHECK`. The 30 Sep 2026
Android developer-verification date is a **verify** action, not a publish deadline:
it removes unregistered packages that are distributed on Play, Google auto-registers
existing and new Play apps, and creating an app in Play Console registers its package
at creation. LawMind's console state has never been observed, so no removal risk is
asserted here. Detail and sources: [`FOUNDER_QUEUE.md`](FOUNDER_QUEUE.md).

External deletion: `https://lawmind.co/delete-account` = 404 at last observation (15 Sep).
Auth contract `EXTERNAL_DELETE_AUTH_V1`: [`EXTERNAL_ACCOUNT_DELETION_WEB.md`](EXTERNAL_ACCOUNT_DELETION_WEB.md) §3.3 (specified, not built).

## 10 · Founder actions (open)

```text
DO_TOKEN_ROTATED               = OPEN
RESEND_KEY_ROTATED             = OPEN
SPACESHIP_KEY_SECRET_ROTATED   = OPEN
R2_BACKUP_KEY_ESCROWED         = OPEN
PERSISTENT_BETA_SPEND          = COST PACKAGE DELIVERED 19 Sep 2026 — awaiting approval
                                 ask USD 450 initial / USD 550 monthly, expected USD 287.17
PROVISIONING_AUTHORIZED        = NO   (A2: a cost recommendation is not authorization)
DELTA_QUEUE_S4U_ELEVATION      = OPEN — ONE UAC consent click. FQ-SHIP-R0X-1.
                                 It also settles CUDA_IN_SESSION_0 = UNKNOWN, which
                                 decides WHICH fix is correct. Do not flip the
                                 principal blind: docs/ops/DELTA_QUEUE_S4U_PROOF.md
APPLE / PLAY ACCOUNT STATE     = founder to confirm (roadmap §14.14)
LAUNCH_COMMERCE                = FREE_BETA | PAID_V1 at Gate D
```

Detail and history: [`FOUNDER_QUEUE.md`](FOUNDER_QUEUE.md) — the **19 September
S4-R0X block** (FQ-SHIP-R0X-1 the elevation click, FQ-SHIP-R0X-2 the priced spend)
sits above the "CURRENT STATUS — S4-T0.1" block, which is unchanged and remains the
standing status for everything else.

## 11 · Latest accepted release / beta environment

```text
PERSISTENT_BETA          = NONE (Gate-C DigitalOcean alpha destroyed 18 Sep 2026 01:13Z; runtime a09d7ee5 historical)
PRODUCTION               = NONE
CURRENT_HOSTING_PROVIDER = NOT_YET_SELECTED
PERSISTENT_BETA_PROVIDER = UNDECIDED · PRODUCTION_PROVIDER = UNDECIDED
                           RECOMMENDED 19 Sep 2026, not selected and not bought:
                           DigitalOcean so-4vcpu-32gb (CORPUS) + s-2vcpu-4gb
                           (API/USER) + Cloudflare R2 — USD 287.17/month, which is
                           USD 63 CHEAPER than Gate C for the same vCPU and RAM.
                           Package: ai/ship-s4-r0/BETA_HOSTING_DECISION_PACKAGE.md
RAILWAY_PRODUCTION       = HISTORICAL / RETIRED   (api-production-1c0b4.up.railway.app)
GATE_C_DIGITALOCEAN      = HISTORICAL / DESTROYED_VERIFIED
FULL_HNSW                = DOES_NOT_EXIST · PUBLIC_SEMANTIC = DISABLED
REPOSITORY_VISIBILITY    = PUBLIC (github.com/lawmind/lawmind)

REPOSITORY_CI            = PASS   (S4-T0.3; pnpm format, pnpm lint, services+packages
                                   typecheck, authority check, design rules, bus tests,
                                   scratch-DB checks)
DEPLOYED_SAFETY          = NOT_RUN_NO_DEPLOYED_TARGET
```

`DEPLOYED_SAFETY` is the third state and it is neither of the other two. It is not
a pass: nothing is deployed, so nothing was graded.

**Spend posture (A2, roadmap §13.1.1).** `BUILD AGGRESSIVELY / SPEND CONSERVATIVELY`.
No paid infrastructure is created because a roadmap phase mentions it. Stage A closes
everything achievable on the existing workstation, database, CI and release artifacts;
Stage B buys the smallest environment that can carry final remote acceptance, the
staged ~100-lawyer private beta and Gate-E evidence — and only after explicit founder
approval. `WINDOWS_LINUX_COLLATION_EQUAL = NO` is a correctness item for whichever
Linux target is chosen, not a cost line.

**No deployed probe may invent a target.** `PROBE_BASE_URL` is required by both
deployed safety probes (`services/harness/src/probe-target.ts`); absent, they
refuse with `NO_DEPLOYED_TARGET` and CI reports
`DEPLOYED_SAFETY = NOT_RUN_NO_DEPLOYED_TARGET`, which is neither a pass nor a
failure. SHIP S4-R1 sets the variable when the persistent beta exists.

Technology is not a provider: Expo, Hono, Postgres 16 + pgvector, Drizzle,
better-auth, Resend, R2 remain current and verified. Where it runs is open until
SHIP S4-R0 prices the options and the founder approves the spend. The Railway
runbook is kept as history in [`DEPLOYMENT.md`](../DEPLOYMENT.md) under a banner
saying so; nothing in it authorises recreating that infrastructure.
