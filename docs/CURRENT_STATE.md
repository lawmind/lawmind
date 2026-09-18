# LAWMIND — CURRENT STATE (live pointer)

**This file is LIVE.** SHIP updates it after every gate result, founder scope
decision, capability-registry release, and production/persistent-beta deployment.
It points to the truth; it does not replace receipts.

**Last updated:** 18 September 2026 — SHIP S4-T0.2 (runtime / CI / deployed-target repair),
after S4-T0.1 (authority + orchestration repair).
**Seeded from:** [`roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md`](roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md)
(dated snapshot provenance, immutable). Where the two differ, this file is current
and the ledger shows what was true when v7.4 was prepared.

---

## 1 · Authority

| What | Where |
|---|---|
| Master roadmap (current) | [`roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md`](roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md), Amendment A1 |
| Sprint prompts (current) | [`roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md`](roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md), Amendment A1 |
| Reconciliation memo | [`roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md`](roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md) |
| Hashes | [`roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json`](roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json), checked by `pnpm authority:check` |
| Historical only | v7.2 / v7.1 / v5 roadmaps, prompts v2/v3, `docs/CURRENT_PLAN.md` (journal), `BUILD_GUIDE.md` S0–S7 plan |

HEAD: see `git log -1`. The S4-T0.1 commits are listed in
[`ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md`](ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md);
the S4-T0.2 runtime/CI/deployed-target repair in
[`ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md`](ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md).

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
CURRENT = Sprint 4 → GATE_D (target 2 Oct 2026) · then GATE_E (RED) · launch target 23 Oct 2026
```

Next in sequence (roadmap §24): DATA S4-D0 continuity census → SHIP S4-R0 persistent-beta
hosting cost package (no provisioning) → founder spend decision → S4-R1.

## 4 · Current capability registry

```text
CAPABILITY_REGISTRY_REVISION = R17
CAPABILITY_REGISTRY_FILE     = docs/product/V1_CAPABILITY_REGISTRY_R17.json
CURRENT_CAPABILITY_REGISTRY  = docs/product/V1_CAPABILITY_REGISTRY_R17.json   (same file; the older key name, kept because tooling reads it)
CURRENT_CLAIMS_REGISTER      = docs/product/V1_CLAIMS_REGISTER_R17.md

API_CONTRACT_REVISION        = R17
API_WIRE_PROTOCOL_VERSION    = 1
API_CONTRACT_FILE            = docs/product/RCC_V1_API_CONTRACT_R17_AMENDMENT.md
API_CONTRACT_LEDGER          = docs/product/CONTRACT_CHANGE_LEDGER.json (currentVersion = R17)

PREVIOUS (historical)        = V1_CAPABILITY_REGISTRY_R16.json — immutable, R16 = RELEASED/PROVEN
```

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

R17 moves only the web platform: `OUT_OF_SCOPE_CURRENT_FOUNDER` (CCR-SHIP-S4T0-01).
iOS/Android states are inherited from R16 unchanged.

## 5 · Product scope

```text
ADVOCATE_PRODUCT      = native mobile iOS + Android
ADVOCATE_DESKTOP_WEB  = DO_NOT_BUILD
ADMIN_WEB             = separate internal/admin surface
PROMOTIONAL_WEBSITE   = temporary / noncore (lawmind.co, repo lawmind/lawmind-site)
PROMO_SITE_REBUILD    = after application candidate is mature
COMPLIANCE_WEB_URLS   = stable release contracts (privacy, support/contact, external deletion, terms if used)
V1_LOOP               = Search → Reader → Source/Evidence → Save → Matter
LAUNCH_SHAPE          = B — research only (absent newer measured evidence)
```

Deferred/disabled: public semantic, HNSW public use, supporting/adverse semantic,
drafting (POST_V1), uploads/OCR (DISABLED), Hindi generation (POST_V1), hearing
briefing, monitoring (DISABLED_NOT_READY), eCourts user product, statute-linked
judgments, old/new code applicability, any unconfirmed-citation path
(`VERIFY_CONFIRM_PHYSICAL_ACCEPTANCE = MANDATORY` before one exists). iOS party-name
search: submission default OFF.

## 6 · Data state (last receipts; not re-measured in S4-T0.1)

```text
EMBEDDING_COMPLETE            = YES at NEW1 R15 terminal census (7,675,588 / 7,675,588)
HNSW                          = DEFERRED_HIGH_MEMORY_OFFLOAD · PUBLIC_SEMANTIC = DISABLED
CANONICAL_CITATION_CORRECTION = PASS (R24, 539/539)
CITATION_BULK_APPLY           = HOLD
ECOURTS_OBSERVATION           = 0 at last bounded evidence · MONITORING = DISABLED_NOT_READY
DELTA_SCHEDULER               = Interactive/Logon-only at last observation (roadmap §9.3; DATA→SHIP handoff pending S4-D0)
```

## 7 · Active stops (roadmap §3.6)

None.

## 8 · Carried reliability items (owner SHIP unless stated)

| id | item | must close before |
|---|---|---|
| N-2 | `/version` deployment provenance (null deployedAt/digest) | production label |
| N-3 | cold unseen-query capacity (~3.5 s on 32 GiB host) | production sizing |
| N-4 | manual prewarm after activation/restart | persistent beta |
| N-5 | `/version` env vs `/ready` servingEnv mismatch | production label |
| N-6 | full API suite timing failure = UNKNOWN | persistent beta (quiet-window run) |
| N-7 | `POST /matters` body validation before auth | Gate D (security baseline) |
| N-8 | chips selected visually, `selected=false` in a11y tree | Gate D |
| N-9 | non-debuggable flag observed on release build 1 only | next release build |
| — | corpus rollback can empty `matter_authorities` | persistent beta |

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
PERSISTENT_BETA_SPEND          = PENDING_SHIP_COST_PACKAGE_AND_FOUNDER_SPEND_APPROVAL
APPLE / PLAY ACCOUNT STATE     = founder to confirm (roadmap §14.14)
LAUNCH_COMMERCE                = FREE_BETA | PAID_V1 at Gate D
```

Detail and history: [`FOUNDER_QUEUE.md`](FOUNDER_QUEUE.md), top block "CURRENT STATUS — S4-T0.1".

## 11 · Latest accepted release / beta environment

```text
PERSISTENT_BETA          = NONE (Gate-C DigitalOcean alpha destroyed 18 Sep 2026 01:13Z; runtime a09d7ee5 historical)
PRODUCTION               = NONE
CURRENT_HOSTING_PROVIDER = NOT_YET_SELECTED
PERSISTENT_BETA_PROVIDER = UNDECIDED · PRODUCTION_PROVIDER = UNDECIDED
RAILWAY_PRODUCTION       = HISTORICAL / RETIRED   (api-production-1c0b4.up.railway.app)
GATE_C_DIGITALOCEAN      = HISTORICAL / DESTROYED_VERIFIED
FULL_HNSW                = DOES_NOT_EXIST · PUBLIC_SEMANTIC = DISABLED
REPOSITORY_VISIBILITY    = PUBLIC (github.com/lawmind/lawmind)
```

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
