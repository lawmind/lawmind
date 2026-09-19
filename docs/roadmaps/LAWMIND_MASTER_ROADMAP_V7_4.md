# LAWMIND — MASTER ROADMAP v7.4
## Trust-First Indian Legal Research · Data Moat · Mobile Release · Closed Beta · Launch

**Prepared:** 18 September 2026  
**Supersedes for current execution:** `LAWMIND_MASTER_ROADMAP_V7_3.md` and `LAWMIND_MASTER_ROADMAP_V7_2.md` where this document explicitly updates state, sequencing, ownership, or founder decisions.  
**Preserves:** v7.2's evidence-first legal-truth architecture, mutation discipline, capability gating, gate philosophy, uncertainty rules, source provenance rules, and independent pre-submission audit.  
**Companion execution pack:** `LAWMIND_SPRINT_PROMPTS_V5.md`  
**Current public repository used as execution truth when prepared:** `lawmind/lawmind@6b1355eb96ae46e6ad0c7d0441306dd6ea76618a`  
**Current phase:** Gate C accepted and closed → Sprint 4 / Gate D preparation  
**Target Gate D:** 2 October 2026  
**Target Gate E:** 16 October 2026  
**Target public launch:** 23 October 2026, subject to gates; dates never override evidence.

> **v7.4 fixes an error in v7.3:** reducing the number of agents must reduce coordination overhead, not compress the project specification. LawMind still has distinct product, legal-truth, corpus, retrieval, monitoring, privacy, serving, store, beta, commercial, and release programs. They are now owned by fewer agents, not deleted from the roadmap.

> **AMENDMENT A1 — SHIP S4-T0.1 authority + orchestration repair, 18 September 2026.**
> Patched in place; the version stays v7.4 (no v7.5 for corrections). The founder's
> original bytes are preserved in git as the first install commit and are hashed in
> `LAWMIND_V7_4_AUTHORITY_MANIFEST.json` → `amendments[0].preEditSha256`.
> Round record: `docs/ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md`.
>
> | § | Change |
> |---|---|
> | 1.3 | Dated ledger = snapshot provenance; `docs/CURRENT_STATE.md` = live pointer, updated by SHIP after every gate, scope decision, registry release or production deploy |
> | 3.5 | Bus runtime: `ACTIVE_LANES = SHIP DATA RED`, `LEGACY_LANES` read-only; FOUNDER = `docs/FOUNDER_QUEUE.md`, not a bus lane |
> | 3.6 | **NEW** stop-the-line policy restored |
> | 3.7 | **NEW** contract change control moved to SHIP (CCR → freeze → implement → separate post-implement acceptance) |
> | 4.2, 14.12, 14.13 | "current capability registry" = the latest accepted registry named in `docs/CURRENT_STATE.md` (R17 at this amendment), never a hard-coded R16 |
> | 11.2, 14.5 | R33 fixed mobile redirect is an invariant; the external deletion web flow needs a separate `EXTERNAL_DELETE_AUTH_V1` |
> | 12.4 | **NEW** privacy / DPDP section restored with primary-source dates |
> | 12.5 | **NEW** third-party AI / DPA triggers and the verify-confirm trigger restored |
> | 13.5 | **NEW** real alert delivery proof before production readiness |
> | 14.14 | **NEW** store / release account readiness (Apple, Play, EAS) |
> | 14.15 | **NEW** `SECURITY_RELEASE_BASELINE` (Gate D + Gate E) |
> | 15.2 | billing wording: supported PBL8+ (PBL9 is current), re-measure before implementing |
> | 20.4 | **NEW** official policy rechecks recorded 18 Sep 2026 |

> **AMENDMENT A2 — DATA MOAT & LEGAL-INTELLIGENCE FRONTIER, 19 September 2026.**
> SHIP S4-A2 integration round. Patched in place by the A1 mechanism: the version
> stays **v7.4**, the prompts stay **v5**, there is no v7.5 and no parallel A2
> roadmap. Pre-edit bytes and sha256 are recorded in
> `LAWMIND_V7_4_AUTHORITY_MANIFEST.json` → `amendments[1].preEditFiles`; A1's own
> history is preserved byte-for-byte beside it.
> Round record: `docs/ai/ship-s4-a2/INTEGRATION_RECEIPT.md`.
>
> A2 carries **two** founder decisions and **one** strategic thesis. It enables no
> capability, changes no product code, and expands no gate.
>
> | § | Change |
> |---|---|
> | 0.4 | **NEW** founder decisions: ~100-lawyer private beta on a direct signed Android APK; store publication is NOT a prerequisite; `BUILD AGGRESSIVELY / SPEND CONSERVATIVELY` |
> | 13.1 | Spend gate becomes **two-stage**: Stage A local candidate closure at zero/low spend, Stage B remote-only proof after explicit founder authorization |
> | 14.13 | Gate-D pass definition **reclassified** for the APK private beta; store-submission rows move to public-store readiness and are deferred, not abandoned |
> | 15 | Billing / IAP / Play Billing **not required** for the private beta |
> | 16 | The 3–5 shadow beta + 10–30 closed beta two-programme model is **SUPERSEDED** by one staged ~100-lawyer private beta (Wave 0 canary → Wave 1 → Wave 2) |
> | 16.3 | **NEW** APK private-beta release contract |
> | 17 | Sprint 5 resequenced as the post-private-beta public-release path |
> | 24 | Execution order updated for the private-beta sequencing and the two-stage spend gate |
> | 26 | **NEW** Amendment A2 strategic programs: Primary Source Fabric, Source Passport, five-clock freshness, court event graph, authority intelligence, historical provenance, source disagreement, the Indian legal research benchmark, model independence, Delhi HC source lab, frontier promotion governance |
>
> **A2 is strategy, not implementation.** Nothing in §26 is built, migrated,
> schema'd or surfaced by this amendment. Competitive pressure is never permission
> to bypass a capability gate.

> **A2 EXECUTION-SEAM CORRECTION — SHIP S4-R0X, 19 September 2026.** Not A3, not
> v7.5, no new amendment, and **no A2 decision is re-adjudicated.** A2's
> classification was right; the execution documents had not fully followed it, so a
> next agent reading Sprint Prompts v5 could still have treated store-review work as
> a gate on the direct-APK cohort. **New §14.13.2** records the whole correction:
> `PREWARM / READINESS` and `SECURITY BETA BASELINE` join the private-beta critical
> set in §14.13.1, while `REVIEW_ACCESS_V1`, `STORE ACCOUNT READINESS` (§14.14),
> `EXTERNAL_DELETE_AUTH_V1` and A1's `ALERT DELIVERY` proof (§13.5) move to the
> public-store / production set. Prompts v5 §4, §5, §7 and §10 are corrected to
> match, and §5 becomes the private-beta mobile quality / release pass.
> **Deferred is not cancelled**, no contract is weakened, and
> `IOS_PRODUCT = IOS_PUBLIC_RELEASE = IN_SCOPE`.
> Record: `docs/ai/ship-s4-stage-a/LOCAL_CANDIDATE_CLOSURE.md`.

---

# 0. FOUNDER AMENDMENTS — BINDING

## 0.1 Product surface

LawMind's advocate product is a **mobile application**.

```text
ADVOCATE_PRODUCT_IOS      = IN_SCOPE
ADVOCATE_PRODUCT_ANDROID  = IN_SCOPE
ADVOCATE_DESKTOP_WEB      = FROZEN / DO_NOT_BUILD
ADMIN_WEB                 = SEPARATE INTERNAL SURFACE
```

The founder's 12 August 2026 mobile-only decision remains controlling unless explicitly changed again. Old desktop-workspace code may remain inert; no Sprint 4–6 capacity is spent extending it.

## 0.2 Website — PROMOTIONAL ONLY

**Current founder instruction, 18 September 2026:**

`lawmind.co` is a temporary **promotional / marketing surface**. It is **not the LawMind product, not an advocate web application, and not an architecture authority**. The founder expects the promotional website to be torn down and rebuilt after the application is complete.

Therefore:

```text
PROMOTIONAL_WEBSITE_IMPORTANCE = LOW / NON_CORE
PROMOTIONAL_WEBSITE_REBUILD    = DEFER UNTIL APP CANDIDATE IS STABLE
PROMOTIONAL_WEBSITE_COPY       = NOT PRODUCT SOURCE OF TRUTH
ADVOCATE_WEB_LOGIN             = DO_NOT_BUILD
```

Do **not** consume Gate-D engineering time redesigning the promotional site to match every intermediate capability state.

A small distinction matters:

### Stable compliance web surface

Some store/legal URLs must survive a marketing-site rebuild. These are **compliance endpoints**, not "the website product":

- privacy policy;
- support/contact;
- terms if used for submission;
- external account-deletion resource required by Google Play.

Treat these URLs as stable contracts. Their implementation may be visually minimal. They must remain functional through any future promotional-site teardown/rebuild.

```text
PROMO_SITE          = EPHEMERAL
COMPLIANCE_URLS     = STABLE RELEASE CONTRACT
```

Store metadata and review notes remain serious public claims. Temporary promotional copy does not control product scope.

## 0.3 Gate-C bearer amendment

Historical mobile-data attempts remain truthful:

```text
REMOTE_MOBILE_DATA_PROVEN = NO
```

But the founder superseded the cellular-only Gate-C criterion.

Accepted Gate-C invariant:

```text
REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW = PASS
CELLULAR_BEARER_REQUIREMENT = N/A — SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION
```

This is not a claim that Wi-Fi and carrier networks are technically identical.

## 0.4 Private beta, distribution and spend — FOUNDER DECISIONS (A2, 19 September 2026)

These are **current explicit founder instructions** and therefore sit at the top of
the authority order. Where they conflict with earlier sequencing in this roadmap,
they win, and the earlier sequencing is marked SUPERSEDED rather than deleted.

### 0.4.1 The private beta is one programme of ~100 already-contacted lawyers

```text
PRIVATE_BETA_TARGET               = ~100 PRACTISING LAWYERS
PRIVATE_BETA_CONTACT_STATUS       = ALREADY_CONTACTED
PRIVATE_BETA_PRIMARY_DISTRIBUTION = DIRECT SIGNED ANDROID APK
PLAY_STORE_BEFORE_PRIVATE_BETA    = NO
APP_STORE_BEFORE_PRIVATE_BETA     = NO
```

This **supersedes** the two-programme model in §16 and §17 (a 3–5 advocate shadow
beta, then a separate 10–30 advocate closed beta). There is now **one** beta
programme, staged internally. §16 carries the replacement structure.

### 0.4.2 iOS is not cancelled — only its store submission is resequenced

```text
ADVOCATE_PRODUCT_ANDROID = IN_SCOPE   (private-beta delivery platform)
ADVOCATE_PRODUCT_IOS     = IN_SCOPE   (product and public-launch scope)
IOS_APP_STORE_SUBMISSION = NOT A PREREQUISITE TO STARTING THE ANDROID APK BETA
```

Do not delete iOS work, and do not spend Gate-D calendar on App Store submission
mechanics that deliver nothing to an Android APK cohort. §0.1 is unchanged:
`ADVOCATE_DESKTOP_WEB = DO_NOT_BUILD`.

### 0.4.3 Cost control

```text
BUILD AGGRESSIVELY
SPEND CONSERVATIVELY
```

No paid infrastructure is created because a roadmap phase mentions it. Before any
recurring spend, maximise local development, the existing workstation and
database, existing CI, existing release artifacts, existing Gate-C evidence and
free GitHub Actions. Larger runners, GPU hosts, persistent staging, managed
monitoring vendors, paid model infrastructure, extra databases, HNSW hosts and
store/billing infrastructure are **not purchased** unless a current critical-path
requirement actually needs them. The mechanism is §13.1's two-stage spend gate.

### 0.4.4 What A2 does not do

A2 is a governance and sequencing amendment. It enables no capability, changes no
product or API behaviour, writes nothing to the database or corpus, provisions
nothing, and creates no paid resource. `PROVISIONING_AUTHORIZED = NO` remains the
state after S4-R0 produces its package; a cost recommendation is not spend
authorization.

---

# 1. AUTHORITY AND EVIDENCE

Conflict order:

1. current explicit founder instruction;
2. verified current repository / database / runtime / primary-source evidence;
3. this roadmap + `LAWMIND_SPRINT_PROMPTS_V5.md`;
4. accepted current gate receipts and current capability registry;
5. v7.2 roadmap, prompts and deep-research memo as historical design rationale;
6. lane journals / founder queue / old plans where non-conflicting;
7. summaries and older bootstrap material.

A later summary does not override an earlier measured artifact merely because it is later.

## 1.1 Historical truth is append-only

Never rewrite an earlier HOLD/FAIL/UNKNOWN to make history look cleaner.

Examples:
- the mobile-data Gate-C attempt remains HOLD historically;
- R14's broken evidence binding remains historically broken even though R15 repaired the verification mechanism;
- a stale roadmap statement remains stale, not retroactively true.

## 1.2 Evidence vocabulary

Use explicit states:

```text
PASS
FAIL
HOLD
UNKNOWN
NOT_RUN
NOT_APPLICABLE
NOT_REPRODUCED
SUPERSEDED
DEFERRED
```

Rules:
- code/config existence ≠ runtime proof;
- HTTP 200 ≠ successful legal observation;
- failed observation ≠ "nothing changed";
- absence from an index ≠ absence from law;
- model confidence ≠ legal verification;
- PID/GPU activity ≠ durable worker progress;
- a delete request ≠ deletion proof;
- a passing gate ≠ capability enablement.

## 1.3 Current-state pointer

`docs/CURRENT_PLAN.md` has accumulated historical rounds and currently contains stale authority language. It must no longer be the only current-state pointer.

Create/maintain:

`docs/CURRENT_STATE.md`

It should fit in a few pages and point to:
- current roadmap/prompts hashes;
- current HEAD;
- active agents;
- current gate;
- current capability registry;
- last DATA continuity receipt;
- founder actions;
- active blockers;
- deferred capabilities;
- latest accepted release/beta environment.

`CURRENT_PLAN.md` remains a historical operational journal unless deliberately retired.

**A1 — two current-state files, two different jobs:**

```text
docs/roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md = snapshot provenance (immutable, dated)
docs/CURRENT_STATE.md                                     = current mutable execution pointer (LIVE)
```

The dated ledger records what was true when v7.4 was prepared and is never edited to
track later events. `docs/CURRENT_STATE.md` is seeded from it and then moves.

**SHIP must update `docs/CURRENT_STATE.md` after every:**
- gate result (PASS/HOLD/FAIL);
- founder scope decision;
- capability-registry release (it names the exact current registry file);
- production (or persistent-beta) deployment.

`pnpm authority:check` verifies it exists, names an existing registry, and points at
the canonical roadmap paths.

---

# 2. OPERATING MODEL — THREE AGENTS, FULL SPECIFICATION

Historical identities remain immutable provenance:

`LCC · RCC · NEW1 · NEW2 · NEW3 · FIFTH · AUDIT-RO`

New work uses only:

## 2.1 SHIP — ACTIVE

Purpose: turn measured legal/data capability into a reliable mobile product and release it.

SHIP owns, subject to task mode:

### CLIENT
- `apps/mobile/**`
- client auth/deep-link behavior
- device UX/accessibility
- offline/poor-network behavior
- build/release packaging

### SERVER
- `services/api/**`
- `services/cron/**`
- auth/security/privacy
- split corpus/user serving contracts
- R16 idempotency
- deletion
- API reliability

### OPS
- remote serving
- deployment/release/rollback
- backups/restores
- scheduler/control-plane configuration
- readiness/prewarm
- observability/alerts
- store review environment

### PRODUCT / RELEASE
- capability registry
- product contracts
- Gate-D acceptance
- store/review packs
- claims
- commercial/free-vs-paid decision package
- beta measurement
- founder queues/handoffs

SHIP may work end-to-end when a task crosses client/server/release boundaries. It must still state which modes are active in each prompt.

SHIP may not silently mutate canonical legal truth owned by DATA.

## 2.2 DATA — CONTINUOUS by default

Purpose: make the evidence base harder to copy and safer to trust.

DATA owns:

### CORPUS / SOURCE
- `services/ingest/**`
- HC/SCI acquisition
- source identity/provenance
- OCR/data quality
- freshness
- eCourts raw observation work

### LEGAL TRUTH
- canonical judgment identity
- citations
- common-order/connected-matter evidence
- statutes
- treatment/source classifications
- guarded canonical-correction packages

### RETRIEVAL
- `services/embed/**`
- relevant `services/harness/**`
- embedding delta
- vector integrity
- ANN experiments
- retrieval evaluation
- representation/ranking experiments

DATA cannot enable a public capability merely because an experiment works. SHIP/product acceptance remains the public release gate.

Canonical legal-truth mutation still requires the mutation protocol below and, for high-risk populations, independent RED falsification.

## 2.3 RED — FROZEN by default

RED is a **fresh independent session**, not a permanent engineering lane.

Modes:

```text
RED_READ_ONLY  = bounded high-risk falsification
RED_GATE       = formal Gate E
RED_P0         = emergency security/data-truth audit
```

RED:
- owns no normal product path;
- does not implement what it audits;
- does not self-authorize a mutation or release;
- does not become a fourth project manager.

Gate D does **not** require RED.

## 2.4 Agent state discipline

```text
ACTIVE      = scoped new work requiring judgment
CONTINUOUS  = standing job / continuity only
FROZEN      = no attention
```

Do not full-prompt a CONTINUOUS lane.

---

# 3. SHARED EXECUTION RULES

## 3.1 Shared worktree

Retain the hard-won v7.2 controls:

- atomic `GIT_COMMIT`;
- atomic `MIGRATION_SLOT`;
- atomic `HEAVY_BOX`;
- one GPU writer;
- exact-path staging only;
- never `git add .`, `git add -A`, `git commit -a`;
- never reset/rebase/stash/checkout over another session's changes;
- re-anchor `HEAD`, `origin/main`, status and leases immediately before staging;
- inspect intervening commits if HEAD moved.

## 3.2 Integration seal

After concurrent mutation work and before the next mutation wave:
- verify all intended commits are ancestors of HEAD;
- classify staged/tracked/untracked product files;
- inspect leases;
- inspect actionable handoffs;
- verify authority hashes;
- refuse to "repair" missing commits automatically.

## 3.3 Three-equivalent-failure stop

Three materially equivalent failures:
- stop;
- publish outputs;
- publish best current hypothesis;
- name tie-break evidence.

No fourth blind attempt.

Known Windows `NUL` pseudo-entry remains under its existing stop.

## 3.4 Long-job health

Durable progress outranks process cosmetics.

Possible states:

```text
RUNNING_BY_PROGRESS
RUNNING_PROCESS_CONFIRMED
STALE_REGISTRATION
STALLED
FAILED_CONFIRMED
UNKNOWN
```

`UNKNOWN` is never restart-safe.

A restart/takeover requires the evidence to agree:
- durable output stale past documented bound;
- receipts/logs stale;
- no valid active descendant where observable;
- no healthy-by-progress lease.

## 3.5 Bus simplification

Future messages route only between:

```text
SHIP
DATA
RED
FOUNDER
```

Historical bus messages are never renamed.

Actionable message classes remain:
- P0
- CCR
- HANDOFF
- ACTION_REQUIRED
- BLOCKER

Delivery ≠ acceptance. Receiving agent verifies the claim.

**A1 — bus runtime as implemented (`.claude/hooks/lane-common.sh`, `scripts/lane-*.mjs`, `scripts/resource-lease.mjs`):**

```text
ACTIVE_LANES = SHIP DATA RED
LEGACY_LANES = LCC RCC NEW1 NEW2 NEW3 FIFTH AUDIT-RO
DOWNSTREAM   = SHIP → DATA · DATA → SHIP · RED → SHIP
```

- new sessions bind only to an active lane; a legacy binding is refused for new work and told why;
- new sends and `ALL` broadcasts target active lanes only;
- legacy messages, filenames and cursors stay untouched and remain readable in `pnpm lane:inbox`;
- **FOUNDER is not a bus lane.** Anything for the founder goes to `docs/FOUNDER_QUEUE.md`;
- RED stays FROZEN unless invoked; the RED → SHIP route exists so a RED report has somewhere to land, not to create a three-agent ring.

## 3.6 Stop-the-line policy (A1, restored)

These stop the **affected** work immediately:

```text
canonical legal-data corruption
unauthorized source access
security/privacy exposure
migration/schema divergence risking data
user/matter data loss
production-corrupting release/rollback failure
```

On a stop: freeze the affected mutation path, preserve evidence, record the incident in
`docs/CURRENT_STATE.md` → "Active stops", notify the owner (bus P0 or founder queue), and
resume only on a written clearance that names the evidence.

Ordinary P1/P2 defects are **not** stops. They become owned backlog items with a named
owner and gate, and they do not falsely freeze the whole project.

## 3.7 Contract change control — SHIP-owned (A1)

`docs/product/CONTRACT_CHANGE_CONTROL.md` is the process. Historical RCC/NEW3/LCC ledger
rows stay as they are. From S4 onward:

1. **CCR_PROPOSED**: current contract version, exact problem, safe current fallback,
   user-truth impact, additive/breaking delta, client impact, server impact, tests
   required. The proposal is frozen in `CONTRACT_CHANGE_LEDGER.json` **before** any
   implementation edit.
2. **IMPLEMENT**: SHIP implements.
3. **POST_IMPLEMENT_ACCEPTANCE**: re-anchor, then a separate acceptance pass against
   the frozen proposal. A contract is never "released" merely because SHIP wrote both
   sides.
4. **Legal/data semantics** (canonical legal truth, citation, statute, retrieval
   truth states): DATA independently reviews the semantic contract.
5. **High risk** (authentication, authorization, deletion/erasure, sensitive-data
   routing, gate criteria, canonical legal mutation safety): invoke `RED_READ_ONLY`
   where independent falsification is materially useful. RED does not implement.

---

# 4. COMPANY / PRODUCT THESIS

LawMind is an **evidence-first Indian legal research operating system for practising advocates**, not a generic consumer legal chatbot.

The v1 mobile loop is:

```text
Search
→ Results
→ Judgment Reader
→ Source / Evidence / Treatment state
→ Save authority
→ Matter
→ return later without reconstructing the research
```

Current v1 should optimize **research completion and retained matter context**, not breadth of AI features.

## 4.1 North Star

**LawMind Research Task Completion Rate (RTC)**

A research task is complete when an advocate can:

1. find a useful authority;
2. inspect enough source/evidence to trust what was found;
3. read sufficient context to use it;
4. save/link it to the relevant matter;
5. finish the task without needing another legal database for that task.

Supporting product metrics:
- time to usable authority;
- another-database rate + reason;
- query reformulations;
- source opens;
- authority saves;
- matter linkage;
- trust-state confusion;
- resume/reconstruction friction;
- repeated research due to lost context.

## 4.2 Current launch-visible capability class

Current accepted v1 includes, subject to the **latest accepted current capability registry** (named in `docs/CURRENT_STATE.md`; R17 at A1):
- exact neutral/reporter citation identity where supported;
- CNR identity over held data;
- case-number search with ambiguity;
- full/near-full case-title search;
- lexical research with explicit broad-query refusal;
- structured narrowing;
- Reader with source/provenance/date uncertainty;
- save to matter;
- matters / timeline / hearing-date records;
- account settings/deletion initiation;
- platform-specific capability gating.

## 4.3 Explicitly not current-v1

Do not expand current v1 merely because older `PRODUCT_BRIEF.md`, `CLAUDE.md`, competitors, or the temporary promotional website mention these:

- public broad semantic/concept search;
- fact-pattern search;
- adverse-authority automation;
- generic chat;
- drafting;
- document upload/OCR;
- Hindi generation/drafting;
- Hearing Pack;
- 24-hour briefing;
- live user monitoring;
- automatic old/new criminal-code applicability;
- public statute-linked judgment conclusions;
- freehand citation generation.

These remain separate post-v1 or gated programs.

---

# 5. CURRENT EXECUTION STATE — 18 SEPTEMBER 2026

## 5.1 Gate state

```text
GATE_A                 = PASS
GATE_B                 = PASS
LOCAL_V1_ACCEPTED      = YES
GATE_C                 = PASS
GATE_C_ACCEPTED        = YES
GATE_C_INFRA           = DESTROYED_VERIFIED
NEXT_GATE              = GATE_D
```

Gate-C temporary DigitalOcean infrastructure was successfully torn down:
- 2 droplets gone;
- Gate-C VPC/firewalls/SSH key gone;
- alpha DNS removed;
- unrelated `ubuntu-s-vikas` untouched;
- recurring Gate-C compute = $0.

Accepted Gate-C runtime was `a09d7ee5…`; this is historical release evidence, not an environment that still exists.

## 5.2 Core remote product proof

On a physical Galaxy S24 against public remote HTTPS:

```text
AUTH                   = PASS
SEARCH_EXACT           = PASS
SEARCH_LEXICAL         = PASS
READER                 = PASS
SAVE                   = PASS
MATTER                 = PASS
RELAUNCH_PERSISTENCE   = PASS
CRASHES                = 0
ANR                     = 0
OOM                     = 0
```

## 5.3 R16

Generic idempotency was implemented and proven locally/remotely for current-v1 mutation routes.

Do not re-design per-table idempotency unless evidence shows the generic contract is insufficient.

## 5.4 Current search SLO evidence

Gate-S1 accepted staging result:

```text
whole-request p50 = 350 ms
p95               = 2,748 ms
p99               = 3,453 ms
frozen budget      = p95 <= 3,000 ms
```

Known limitation outside that frozen suite:
- one unseen/cold research query took ~3.5 s;
- serving box had ~31 GiB RAM;
- stored search-vector/tsvector footprint was ~98 GB.

Treat this as a **capacity/sizing question**, not the old generic-plan Reader defect.

---

# 6. DATA-MOAT PROGRAM

DATA work continues even while SHIP pursues Gate D.

## 6.1 HC / SCI continuity

For each acquisition/source continuity report record:
- new judgments;
- newest upstream decision date;
- newest locally held decision date;
- accounted%;
- actually-held%;
- source-unavailable count separately;
- clustered failure classes;
- raw-artifact/provenance health.

Never collapse recency and completeness.

Do not copy old corpus counts into a current report without re-measuring them.

## 6.2 Source authorization — distinguish the sources precisely

Current repo records founder authorization for:
- BharatLaw;
- Supreme AI;
- eCourts India,
subject to their source-specific conditions.

Do not silently generalize one grant into another source.

### Direct SCI automation is a separate question

Current repository evidence explicitly distinguishes:
- **public official SCI homepage judgment feed + official linked PDFs**: usable on `public_official` basis;
- **separate direct SCI written-grant / expanded automated-access question**: historically contested in `docs/ai/new2-r10/sc-authorization-reanchor.json`.

Do not say "SCI authorization is solved" without naming which path.

Current running SCI public-feed acquisition does not require that separate contested grant.

## 6.3 Provenance

Every legal datum that can affect user-facing truth must preserve:
- source identity;
- source artifact / URL where available;
- content/source hash;
- extraction method;
- timestamp/frontier;
- verification or uncertainty state;
- transformation provenance.

No model opinion becomes canonical legal truth.

---

# 7. CITATION / LEGAL-TRUTH PROGRAM

## 7.1 Canonical Mutation Protocol v2 remains binding

Candidate classifications:

```text
SAFE
AMBIGUOUS
UNTESTABLE
TARGET_HOLDER_CONFLICT
SOURCE_DAMAGED
```

Ambiguity quarantines that row/population; it does not force safe rows to wait.

Required immutable candidate information:
- canonical row identity;
- one disposition only;
- expected old value;
- proposed new value/NULL;
- source identity/hash;
- deterministic evidence;
- population hash;
- frontier identity;
- target-holder state;
- common-order evidence where applicable.

Mutation sequence:

```text
candidate
→ independent falsification where required
→ immutable execution manifest
→ immediate live drift check
→ expected-old guarded transaction
→ in-transaction validation
→ commit
→ fresh-session row-by-row readback
→ immutable receipt
```

Canonical-value authorization ≠ graph-edge apply authorization.

## 7.2 Current canonical correction state

NEW2 R24 proved:
- 539 audited safe corrections written;
- 539/539 postcommit readback;
- quarantined population untouched;
- dirty citation-key index correctly rebuilt;
- `CANONICAL_CORRECTION = PASS`.

Do not re-audit/re-apply those 539 as if unfinished.

## 7.3 Current edge population

Fresh post-correction candidate generation observed roughly:
- 1,556,947 candidates;
- 1,003,934 self-identity occurrences;
- 354,196 ambiguous;
- 3,137,718 with no held target;
- 16,130,843 refused pre-lookup (dominated by empty sentinel rows);
- 5 untestable.

The candidate graph is a concentrated fan-in to ~5,272 targets and is heavily alias-mediated.

Therefore:

```text
CITATION_BULK_APPLY = HOLD
```

Next step, only when prioritized:
- DATA freezes a bounded/current edge population;
- RED independently attacks alias uniqueness, source span, common-order behavior, cross-court false pins, self-edge handling, damaged text and target concentration;
- a separate apply decision follows.

This is **not a Gate-D blocker** unless existing user-facing truth is wrong.

## 7.4 Parser architecture remains separated

Never collapse:
1. strict user-query citation parser;
2. source citation-span scanner;
3. mention-role / ownership / graph-edge interpretation.

A valid citation token may be:
- own identity;
- common-order furniture;
- connected-matter identity;
- outgoing citation;
- foreign/source quotation;
- ambiguous;
- damaged.

Parse success never creates an edge by itself.

## 7.5 Common orders

Preserve:
- every canonical judgment ID;
- CNR;
- case number;
- source artifact;
- source/content hash;
- shared-order evidence.

Do not merge cases into one canonical judgment because they share text/citation.

---

# 8. STATUTE / CRIMINAL-CODE TRANSITION PROGRAM

Maintain legal data for:
- Act identity;
- current/repealed status;
- commencement;
- savings;
- section identity;
- amendment history;
- predecessor/successor identity;
- judgment→statute raw references;
- chronology.

Older measured state showed a very large raw `judgment_statute_refs` population with almost no resolver-confirmed public links. Re-measure before quoting current counts.

## 8.1 Release rule

`statute.linked_judgments` stays non-public until:

1. exact relationship semantics are frozen;
2. bounded representative population is resolver-confirmed;
3. raw/unclassified refs are preserved;
4. chronology is enforced where relevant;
5. no semantic/LLM-created canonical links;
6. adversarial false-link sample passes;
7. source/provenance is available;
8. SHIP accepts the product semantics;
9. capability registry explicitly enables the surface.

## 8.2 Old/new criminal code applicability

BNS/BNSS/BSA predecessor/successor mapping may be represented as data.

The product must **not automatically decide legal applicability** merely from dates/mappings without the agreed legal sign-off and explicit capability release.

---

# 9. RETRIEVAL / EMBEDDING PROGRAM

## 9.1 Coarse embedding frontier — terminal

Last verified NEW1 R15:

```text
CURRENT_ELIGIBLE_DOCUMENTS          = 8,444,960
ELIGIBLE_CONTENT_IDENTITIES         = 7,675,588
EMBEDDED_CONTENT_IDENTITIES         = 7,675,588
CONTENT_HASH_ALREADY_COVERED        = 769,357
QUEUED                              = 0
UNNAMED_RESIDUAL                    = 0
EMBEDDING_COMPLETE                  = YES
VECTOR_INTEGRITY                    = PASS
```

The corpus can grow after that timestamp; these are a snapshot, not constants.

The incremental queue remains the ordinary mechanism for fresh ingest.

## 9.2 Model reproducibility

Current production coarse model:
- BGE-M3 ONNX fp32;
- 1024 dimensions;
- exact local files hashed;
- upstream model revision remains `UNKNOWN`;
- exact local model bytes backed up off-machine.

Do not "clean up" by replacing the local model with nominal upstream bytes and then claiming reproducibility.

## 9.3 Incremental scheduler risk

The delta embedding task was last observed using an interactive-logon scheduling mode.

This creates a silent gap after machine boot if nobody logs in.

Close this during SHIP/DATA transition:
- preserve DATA ownership of the logical job;
- SHIP/OPS owns host scheduler mechanics;
- configure start without interactive login if safe;
- prove one reboot/start scenario;
- retain one-GPU-writer protection;
- durable queue receipts remain source of truth.

## 9.4 HNSW

No full production HNSW index exists.

Measured full-build RAM requirement:
~19.52 GiB for the current production generation.

Observed safe free RAM on the workstation was materially lower (~12.4–14.2 GiB).

Therefore:

```text
LOCAL_FULL_HNSW_BUILD = PROHIBITED_BY_MEASURED_CONSTRAINT
HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD
PUBLIC_SEMANTIC_SEARCH = DISABLED
```

No third local attempt.

A future offload requires:
- restored snapshot identity;
- exact model/generation predicate;
- adequate memory;
- session-local build memory;
- progress/kill threshold;
- post-build integrity;
- ANN vs exact recall@10/50/100;
- p50/p95/p99;
- filtered-query completeness;
- several `ef_search` values.

Building the index is not permission to expose semantic search.

## 9.5 Passage embeddings

Do not mass-embed passages because a GPU is idle.

A future tranche must be justified by:
- beta queries;
- saved authorities;
- failed research tasks;
- Reader navigation;
- measured retrieval gains.

## 9.6 Cold-query capacity study

Before choosing final production sizing, run a bounded study comparing:

A. more RAM / larger corpus-serving host;
B. a smaller/alternative ranking representation if one is demonstrated safe;
C. current representation as control.

Measure:
- cold p50/p95/p99;
- warm p50/p95/p99;
- result equivalence/quality;
- memory;
- storage;
- monthly cost;
- restart/prewarm behavior.

Do not relax the 3-second request budget or sacrifice truthful ranking simply to lower a number.

This study informs **production sizing**, not semantic-search release.

---

# 10. eCOURTS / MONITORING PROGRAM

## 10.1 Current technical state

Latest bounded stop evidence:
- `fillDistrict` solved;
- option parser defect fixed;
- earlier User-Agent hypothesis refuted;
- rotating AJAX header pair identified;
- cookie-jar defect fixed;
- CAPTCHA accepted 3/3;
- bounded cause-list submit attempts then received the source's own upstream-server failure;
- no real cause-list result fixture obtained;
- `ecourts_observation = 0`;
- retention unmeasured;
- daily pilot not started;
- user monitoring disabled.

Do not resurrect old `Invalid Request` or User-Agent hypotheses as current blockers.

## 10.2 Safety semantics

Never convert:
- HTTP 200 → success;
- parse empty → no cases;
- CAPTCHA rejection → empty court;
- fetch failure → no change;
- listed → hearing occurred.

User-facing truth remains:

```text
LISTED_OBSERVED != HEARING_OCCURRED
```

## 10.3 Shape A / Shape B

Monitoring becomes launchable only if all twelve monitoring conditions pass.

Current last verified monitoring matrix had zero usable observations, therefore:

```text
LAUNCH_SHAPE = B — RESEARCH ONLY
```

until newer evidence proves all twelve conditions.

Shape B is not a failed launch. It means monitoring remains off the launch critical path.

No monitoring:
- price;
- SLA;
- polling cadence;
- court-coverage promise;
- push/alert promise

without measured runtime evidence.

## 10.4 Future bounded DATA work

If monitoring is reprioritized:
- try bounded alternate authorized court/date/establishment populations;
- preserve every raw response;
- do not impersonate a browser/network fingerprint without explicit authorization;
- stop after the three-equivalent-failure rule;
- build economics only after a real observation exists.

---

# 11. WRITE RELIABILITY, AUTH, AND DATA ISOLATION

## 11.1 R16 idempotency — released baseline

Current-v1 mutating requests use a generic idempotency contract scoped by:

```text
principal
+ method
+ canonical route
+ idempotency key
```

Same key/same fingerprint → replay same logical result.  
Same key/different fingerprint → 409.  
Concurrent same key → one logical mutation.  
5xx transaction rollback → no orphan success receipt.

Do not regress into text/content-based deduplication.

## 11.2 Auth

Gate C discovered and fixed a real production magic-link topology issue.

Accepted design:
- mail link lands on LawMind-controlled `/auth/magic-link/open`;
- that endpoint only hands the raw token to the mobile deep link;
- browser landing does not consume the token into a browser cookie;
- canonical Better Auth verification remains on the app/API verify path;
- one-use/replay/expiry remain canonical;
- redirect target is constrained;
- tokens are not logged.

Do not replace this with an alternate custom verifier.

**A1 — R33 invariant, stated exactly** (`services/api/src/auth/magic-link-landing.ts` + test, `docs/ai/lcc-r33/ROUND.md`):
`GET /auth/magic-link/open` redirects only to the fixed `lawmind://auth/verify?token=…`
(`MAGIC_LINK_APP_URL`). It deliberately ignores better-auth's `callbackURL`, `redirect`
and `newUserCallbackURL`, so nobody can steer a live credential.

```text
R33_MOBILE_MAGIC_LINK_REDIRECT = FIXED — never configurable, never weakened
```

Any web flow that needs proof of account ownership (external deletion, §14.5) gets its
own separately specified mechanism. It never makes this landing configurable.

## 11.3 Split databases

Remote Gate C proved physically distinct:
- CORPUS DB;
- USER DB.

No generic `DATABASE_URL` fallback in serving mode.

USER data never rolls back merely because a corpus release rolls back.

## 11.4 Pre-beta defect: `matter_authorities` rollback behavior

A prior LCC finding says corpus rollback can empty `matter_authorities`.

This is not acceptable for a persistent beta/production system because a saved authority association is user state.

Before persistent beta is declared ready:

```text
CORPUS_ROLLBACK_PRESERVES_MATTER_AUTHORITIES = PASS
```

Fix/test the ownership/release contract so a corpus generation switch cannot silently delete user/matter linkage.

This is elevated from "nonblocking Gate-C note" to **pre-beta reliability requirement**.

## 11.5 Request validation/auth ordering

Pre-existing finding:
`POST /matters` body validation can execute before auth.

It currently leaks no user data and performs no write, but unauthenticated schema-walk behavior is undesirable.

SHIP should harden this before production review where bounded and low risk:
auth principal → then protected-body work, without breaking client contract.

---

# 12. BACKUP, DISASTER RECOVERY, SECRETS

## 12.1 Gate-C teardown credentials — founder action now

After teardown, rotate/revoke:
- DigitalOcean API token;
- Resend API key;
- Spaceship API key;
- Spaceship API secret.

Do not paste replacements into chat/repo.

The temporary Gate-C SSH private key is now inert because the public key and hosts are gone; remove the local key unless a retention policy says otherwise.

## 12.2 R2 moat-backup key escrow — founder action

`FQ-BACKUP-KEY-ESCROW` remains important.

Current evidence says the curated moat backup is client-side AES-256-GCM encrypted and restore has been proven, but the encryption key existed only in local `.env`.

An encrypted backup whose key dies with the workstation is not disaster recovery.

Required founder action:

```text
R2_BACKUP_ENCRYPTION_KEY_ESCROW = VERIFIED_OFF_WORKSTATION
```

Use a password manager or another appropriately protected location.

Never record the key value in a repo artifact.

## 12.3 Beta/prod restore expectations

Persistent beta/prod must have:
- corpus release pack identity/checksums;
- USER DB backups;
- restore drills;
- split-role restore;
- release/rollback receipt;
- user-state survival;
- no dependence on a founder workstation during service.

## 12.4 Privacy / DPDP (A1, restored from v7.2 and re-dated from primary sources)

Checked 18 September 2026; sources in `LAWMIND_V7_4_RECONCILIATION_MEMO.md` §19.

Digital Personal Data Protection Act, 2023: commencement notification **G.S.R. 843(E)**,
dated **13 November 2025**. Rules: **DPDP Rules, 2025, G.S.R. 846(E)**, published
**13 November 2025**.

| Instrument | What | In force |
|---|---|---|
| Act, clause (a) | definitions, Data Protection Board (ss. 18–26), penalty framework and related provisions | on publication, **13 Nov 2025** |
| Act, clause (b) | s. 6(9), s. 27(1)(d) | one year later, **13 Nov 2026** |
| Act, clause (c) | the major Data Fiduciary obligations: ss. 3–5, 6(1)–(8),(10), 7–17, 27 (other than (1)(d)), 28–34, 36–37, 44(2) | eighteen months later, **13 May 2027** |
| Rules 1, 2, 17–21 | title/definitions, Board | publication, **13 Nov 2025** |
| Rule 4 | (as notified) | one year after publication, **13 Nov 2026** |
| Rules 3, 5–16, 22, 23 | the bulk of compliance, per secondary summary: notices, consent standards, security safeguards, breach reporting, retention/deletion, Data Principal rights, cross-border conditions | eighteen months after publication, **13 May 2027** |

One secondary source dates the "on publication" tranche 14 Nov 2025. Gazette
publication date governs, and the recheck below settles it.

**Do not represent all DPDP obligations as already fully effective at an October 2026
launch.** Most Data-Fiduciary obligations start 13 May 2027.

**Retain now anyway, because each is expensive to retrofit:**
- a truthful privacy notice (what is collected, why, which processors, how to erase);
- data minimisation;
- deletion/erasure architecture (`POST /me/data-requests {kind:'erasure'}`, in-app + external);
- access isolation (tenant authorization, split CORPUS/USER DBs);
- auditability of privileged actions;
- a data inventory;
- a provider/subprocessor inventory;
- consent/permission architecture where applicable (terms consent is already recorded in `users`).

```text
DPDP_EFFECTIVE_DATE_RECHECK = REQUIRED_BEFORE_PUBLIC_LAUNCH
```

## 12.5 Third-party AI / DPA triggers (A1, restored)

Current v1 ships no sensitive-content AI path:

```text
DOCUMENT_UPLOAD_OCR = DISABLED
DRAFTING             = POST_V1
HINDI_GENERATION     = POST_V1
```

**Before any future feature sends sensitive matter/document content to a third-party AI
provider, all of these hold:**
- a countersigned DPA with that provider;
- provider/subprocessor list reviewed and published in the privacy notice;
- the data purpose disclosed;
- required consent/permission obtained;
- partial pseudonymisation described honestly, **never** a claim of complete PII removal;
- one matter / one document per call (isolation preserved);
- telemetry and logging receive no raw sensitive content.

```text
COUNTERSIGNED_DPA = REQUIRED_BEFORE_UPLOADS_OR_SENSITIVE_MODEL_ROUTING
```

**R24B verify-confirm trigger (preserved).** Before any feature can introduce or display an
unconfirmed citation:

```text
VERIFY_CONFIRM_PHYSICAL_ACCEPTANCE = MANDATORY
```

Current state: `NOT_APPLICABLE_UNREACHABLE_CURRENT_V1` (NEW3 R24B), with the trigger intact.

---

# 13. PERSISTENT REMOTE BETA PLANE — MOVED BEFORE GATE D

This is a material sequencing correction from v7.3.

Gate-C infrastructure was disposable and is gone. Serious Gate-D testing now requires:
- a stable API origin;
- real auth/email;
- real split DB;
- release-shaped iOS/Android binaries;
- deletion;
- reviewer access;
- poor-network/device testing;
- a service that remains alive through closed beta and store review.

Therefore persistent staging/beta serving must be activated **before the main Gate-D device matrix**, not after Gate D.

## 13.1 Spend gate

No new paid infrastructure until SHIP produces a measured package and the founder explicitly authorizes it.

The package must include:
- proposed provider/region;
- topology;
- compute/storage;
- expected recurring monthly cost;
- restore time;
- release-pack source;
- backup plan;
- prewarm plan;
- rollback;
- stop/delete procedure;
- capacity risk;
- alternative lower-cost option if material.

Gate-C DigitalOcean `sgp1` is a proven baseline, not an automatic permanent choice.

Gate-C measured baseline:
- dedicated 32 GiB / 4 vCPU corpus host;
- 4 GiB / 2 vCPU API+USER host;
- combined hourly compute roughly $0.52083 in that temporary configuration;
- full release pack ~72.6 GiB compressed;
- corpus restore ~10h20m.

Re-use the preserved release pack if its lineage is still valid rather than exporting hundreds of GiB again for no reason.

### 13.1.1 Two-stage spend gate (A2, 19 September 2026)

v7.4 as written moved the persistent beta plane **before** the Gate-D device
matrix, because serious remote and device testing needed a stable origin. The
founder's A2 priority reverses the emphasis without deleting that reasoning:
complete as much of the application as possible **before** recurring spend starts.

The correction is a two-stage gate, not a reordering of the proof.

**Stage A — local / zero-to-low-spend candidate closure.**

Continue aggressive application development locally until:

```text
PRIVATE_BETA_CANDIDATE_LOCAL = READY_EXCEPT_REMOTE_ONLY_PROOF
```

Everything that does **not** require a persistent public backend closes first:
client defects; accessibility; large-judgment rendering; local lifecycle
behaviour; release APK generation and signing; security and static checks; auth
contract correctness; deletion logic; capability gating; current-claim parity; the
test suite; the API contract; rollback logic implementation; deployment tooling;
telemetry instrumentation.

**Do not provision a persistent beta merely to perform work that is available
locally.**

**Stage B — remote-only proof.**

Only when the remaining blockers genuinely require remote infrastructure does SHIP
present the measured hosting package (§13.1, S4-R0), the founder explicitly
authorizes the spend, and SHIP provisions the **smallest** environment that can
safely support final remote acceptance, the staged ~100-lawyer private beta and
Gate-E evidence.

```text
NO STANDING CLOUD MONTHS BEFORE THE CANDIDATE NEEDS THEM
PROVISIONING_AUTHORIZED = NO   until explicit founder approval
```

A cost recommendation is not spend authorization. After S4-R0 delivers its
package, SHIP returns to Stage A closure rather than idling against a pending
hosting decision.

### 13.1.2 Sizing inputs corrected by S4-D0 (A2)

S4-R0's sizing assumption changes from a 10–30 advocate closed beta to the
**~100-lawyer staged private beta**. Do not assume all 100 are concurrent —
estimate concurrency separately and state the assumption.

Price the base topology from the **serving** dataset, not the research footprint:

```text
LOCAL DATABASE   ~343 GB   (includes research/probe tables that do not serve)
SERVING DATASET  ~250 GB   (the number infrastructure is priced from)
```

Quoting 343 GB without naming the excluded research and probe tables overstates
the requirement. Both numbers are DATA S4-D0 measurements.

Release-pack state, accepted from S4-D0 and **not** re-derived here:

```text
RELEASE_PACK           = D:/lawmind-release-r32b/pack3
RELEASE_PACK_LINEAGE   = PARTIAL — manifest hash verified, 8/8 files present,
                         8/8 byte lengths match, schema lineage matches
PAYLOAD_SHA256         = NOT REVALIDATED
PACK3_REUSE_CANDIDATE  = YES
PACK3_FULL_INTEGRITY   = NOT_YET_PROVEN
```

Hashing 72.6 GiB is cheap **when S4-R0/S4-R1 actually needs the pack** and is not
performed in a governance round.

### 13.1.3 Windows → Linux collation is a correctness question, not a cost one (A2)

S4-D0 measured the source database as PostgreSQL 18.6, UTF8, with
`English_United States.1252` collation and ctype. A Linux target cannot literally
reproduce that Windows collation.

```text
WINDOWS_LINUX_COLLATION_EQUAL = NO
```

**Do not describe a Linux restore as identical.** Before persistent beta
deployment, SHIP must either prove the required collation-dependent search and
index behaviour on the target Linux environment, or rebuild the affected indexes
appropriately. This is carried into S4-R0/S4-R1 and is not solved by A2.

## 13.2 Pre-beta reliability closure

Before inviting advocates:
- N-2 production provenance solved;
- N-5 environment label contradiction solved;
- automated post-activation prewarm/readiness or explicit cold-safe readiness solved;
- `matter_authorities` rollback preservation proved;
- current full API suite run in a quiet window;
- remote backup/restore ready;
- stable auth/mail;
- reviewer access strategy implemented;
- no public semantic;
- no deferred capability accidentally enabled.

## 13.3 Production provenance

Before anything is labelled production:

`/version` must not be only self-reported Git SHA with null deployment metadata.

Record/prove:
- immutable release SHA;
- build/deploy timestamp;
- artifact/image digest or equivalent package digest;
- environment identity;
- deployment/release ID.

`/version` and `/ready` must agree on environment class.

## 13.4 Prewarm/readiness

Gate C required a manual prewarm step.

Persistent beta should not silently become slow after unattended restart.

Choose one explicit design:
- automated safe prewarm after activation; or
- readiness remains false until the required warm state is reached; or
- prove cold performance already satisfies product limits.

Do not claim warm service merely because the process is up.

## 13.5 Real alert delivery (A1)

Persistent beta observability must prove **notification**, not merely metrics. Before
anything is declared production-ready, inject one bounded synthetic alert condition and
prove the whole chain:

```text
condition detected
→ alert rule fired
→ dedup/cooldown path exercised
→ human notification delivered
```

Record the channel and timestamps for each step, never secret values.

```text
ALERT_DELIVERY_PROVEN = REQUIRED_BEFORE_PRODUCTION_READINESS
```

This is operational alerting. It is separate from the disabled advocate monitoring product.

---

# 14. GATE D — PRODUCT QUALITY + COMMERCIAL READINESS

No major new features.

Gate D means **release-quality hardening of the current mobile v1**.

## 14.1 Physical device matrix

Required:

### Existing high-end Android
Galaxy S24 evidence remains useful, but rerun affected rows against the persistent beta release where needed.

### Representative low/mid Android
Use a device that can expose:
- slower CPU;
- memory pressure;
- ordinary 60Hz screen;
- common Android navigation/inset behavior.

### Current physical iPhone
Must be a real current iOS device for:
- sign-in/deep link;
- Search;
- Reader;
- Save;
- Matter;
- relaunch;
- deletion;
- VoiceOver;
- text scaling;
- background/resume;
- poor network.

Do not substitute simulator-only proof for Gate D physical rows.

## 14.2 Accessibility

Gate D explicitly tests:
- TalkBack;
- VoiceOver;
- largest practical text sizes;
- reduced motion;
- focus order;
- accessible names/states;
- touch target sizes;
- selection state.

Known N-8:
case-type/our-side chips visually selected but accessibility tree reports false.

Close it with real screen-reader evidence.

## 14.3 Large judgments

Exercise:
- very large Reader;
- paragraph navigation;
- exact excerpt selection;
- 4,000-char annotation boundary;
- no OOM;
- no accidental truncation;
- no stale highlight;
- scroll/resume.

## 14.4 Poor network and lifecycle

Test:
- request timeout;
- transient network loss;
- retry;
- background/resume;
- force-stop/relaunch;
- magic-link callback;
- session expiry/recovery;
- server unavailable / corpus unavailable;
- no false "no law found";
- no operation-specific wrong copy.

## 14.5 Account deletion

In-app deletion initiation is already proven on current contract and supports identity-only accounts.

Gate D must prove it against the persistent beta environment.

### External Google deletion resource

Maintain a stable external resource for users who no longer have the app.

Do not turn this into a marketing-site project.

The route may be minimal, but it must be functional and branded.

Preferred security design (**A1 corrected**, since the mobile magic link cannot be reused unchanged; see §11.2):
- ownership proof via a separately specified **`EXTERNAL_DELETE_AUTH_V1`**
  (contract: `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md` §3.3), purpose-bounded,
  short-lived, rate limited, raw tokens never logged, no reusable broad auth bypass,
  no regression of the R33 mobile redirect;
- the surface lives in the external site repository `lawmind/lawmind-site`
  (`https://lawmind.co/delete-account`), not in `apps/site` in this repo;
- avoid account-existence oracle;
- reuse `/me/data-requests {kind:'erasure'}`;
- no second deletion backend;
- identity-only accounts supported;
- render real received/due state;
- invent no retention period.

## 14.6 Store compliance URLs

Stable:
- privacy;
- support/contact;
- external deletion;
- terms if submitted/used.

These remain available through future promotional-site rebuilds.

## 14.7 Reviewer access — NEW explicit Gate-D blocker

Magic-link-only consumer auth is awkward for App Review / Google Play review.

Before submission, implement **REVIEW_ACCESS_V1**.

Requirements:
- reviewer can access the product without owning an inaccessible mailbox;
- access works from reviewer geography;
- credentials/instructions are reusable during review;
- seeded demo data contains no real client/legal matter;
- reviewer sees real product behavior, not screenshots;
- ordinary users do not gain privileged bypass;
- capability registry still applies;
- review account can be revoked after review.

SHIP chooses the smallest secure solution:
- dedicated review account with stable credential path; or
- narrowly scoped demo/review mode if store policy permits and it exercises full product behavior.

Do not add a broad alternate authentication mechanism just for convenience.

## 14.8 Android

Before Gate D:
- prove release targetSdk >= 36 from actual current release artifact;
- edge-to-edge/system-bar safe-area physical check;
- production AAB/internal-track build;
- no debug/Metro dependency.

## 14.9 Apple

Before Gate D:
- run an actual production/TestFlight-shaped build;
- prove Xcode >=26;
- prove iOS SDK >=26;
- prove signing/archive;
- keep a stable API backend available during review.

Current `eas.json` pins a modern Xcode image; that is configuration evidence, not build evidence.

## 14.10 Tablet support

Current `app.config.ts` has `supportsTablet: true`, while no tablet layout has been accepted.

Before store candidate:
choose and prove one:
- set `supportsTablet:false`; or
- physically test/design supported tablet surface and provide required screenshots/UX.

Default recommendation for current v1: **false**, unless the founder explicitly wants tablet support.

## 14.11 iOS party-name search

Submission default remains:

```text
IOS_PARTY_SEARCH_SUBMISSION_DEFAULT = OFF
```

unless a specific current founder/counsel/product decision changes it.

When off:
- citation works;
- CNR works;
- case number works;
- full title works;
- party-name state degrades visibly and truthfully.

Prepare review notes describing LawMind as case-first legal research, not a person-dossier product.

## 14.12 Store metadata

Store listing copy is a serious release surface.

Before submission:
- derive every feature claim from current capability registry;
- no hidden/deferred feature in screenshots;
- no unsupported accuracy/superlative;
- real screenshots from real device/data;
- no fake legal records;
- current privacy/data-safety declarations match shipped behavior;
- backend review environment remains live.

## 14.13 Gate-D pass definition

Gate D requires:

1. physical iPhone green;
2. representative low/mid Android green;
3. high-end Android regressions green where affected;
4. no P0/P1 design/reliability issue;
5. accessibility pass;
6. deletion in-app pass;
7. stable external deletion/compliance URLs ready;
8. reviewer access ready;
9. Android API36+ release artifact proven;
10. Apple Xcode26+/iOS26+ build proven;
11. tablet state explicit;
12. iOS party-search state explicit;
13. production provenance/environment-label defects closed before production label;
14. rollback preserves USER/matter state including `matter_authorities`;
15. full API suite current result classified;
16. store packs substantially complete;
17. commerce decision explicit;
18. monitoring claims do not exceed measured capability;
19. current capability registry matches every platform surface.
20. (A1) store / release account readiness rows measured (§14.14);
21. (A1) `SECURITY_RELEASE_BASELINE` rows evidenced (§14.15);
22. (A1) real alert delivery proven on the persistent beta plane (§13.5);
23. (A1) `EXTERNAL_DELETE_AUTH_V1` implemented to its contract, R33 mobile redirect unchanged.

### 14.13.1 Reclassification for the APK private beta (A2, 19 September 2026)

The list above is **not shortened**. Public-store requirements are **moved to the
gate they actually belong to**, because handing ~100 Indian advocates a directly
distributed signed APK does not require a store listing.

**PRIVATE-BETA / GATE-D CRITICAL** — required before the ~100-lawyer APK beta:

```text
PERSISTENT_BETA_READY            (when the remote environment is finally activated)
ANDROID RELEASE APK
APK DISTRIBUTION CONTRACT        (§16.3)
HIGH-END ANDROID REGRESSION
REPRESENTATIVE LOW/MID ANDROID
ACCESSIBILITY
LARGE JUDGMENT
POOR NETWORK
BACKGROUND / RESUME
AUTH
DELETION IN APP
PRIVACY / SUPPORT SURFACE
PRODUCTION-LIKE PROVENANCE
ENVIRONMENT LABEL
PREWARM / READINESS              (A2 execution correction; N-4)
MATTER_AUTHORITY ROLLBACK
FULL API SUITE
BACKUP / RESTORE
SECURITY BETA BASELINE           (A2 execution correction; §14.15 beta-applicable subset)
CAPABILITY / CLAIM PARITY
NO MONITORING CLAIMS
PRIVATE-BETA TELEMETRY
CANARY WAVE READY                (§16.1, Wave 0)
```

**PUBLIC STORE RELEASE — DEFERRED UNTIL AFTER THE PRIVATE BETA:**

```text
PLAY STORE SUBMISSION      ·  PLAY STORE PACK
AAB SUBMISSION PROOF       ·  APP STORE SUBMISSION
APP STORE PACK             ·  APPLE REVIEW ACCESS
APPLE REVIEW NOTES         ·  FINAL STORE SCREENSHOTS
IAP / BILLING              ·  PUBLIC STORE COMMERCE
REVIEW_ACCESS_V1           ·  STORE ACCOUNT READINESS      (A2 execution correction)
EXTERNAL_DELETE_AUTH_V1    ·  ALERT DELIVERY (A1 proof)    (A2 execution correction)
```

### 14.13.2 A2 execution correction, 19 September 2026

Seven rows were added or moved above because the **execution** documents still made
store-review work a gate on the APK beta while A2's classification said otherwise.
This is an execution-seam correction to A2 — **not A3, not v7.5** — and it changes no
strategic decision.

**Added to the private-beta critical set**, because both are beta operability items
that had no row and would otherwise have been nobody's job: `PREWARM / READINESS`
(N-4; an unattended restart must not enter "ready" while predictably cold) and
`SECURITY BETA BASELINE` (the §14.15 rows whose evidence applies to the beta).

**Moved to the public-store set:**

- `REVIEW_ACCESS_V1` — a store-reviewer account and reviewer instructions are what
  Apple and Google need. Invited advocates holding a signed APK are not reviewers.
  Ordinary beta authentication must still be real and secure; no reviewer-style
  bypass may be introduced to make the beta convenient.
- `STORE ACCOUNT READINESS` (§14.14) — store accounts gate store submission.
- `EXTERNAL_DELETE_AUTH_V1` — this is Google Play's **externally-initiated** deletion
  requirement. `DELETION IN APP` stays private-beta critical, privacy and support
  contact surfaces stay reachable, and the external contract
  (`docs/EXTERNAL_ACCOUNT_DELETION_WEB.md` §3.3) is **not weakened** — it remains
  mandatory before the relevant public-store release.
- `ALERT DELIVERY` — A1's end-to-end proof (§13.5) binds on production /
  public-release readiness. It cannot be a private-beta blocker, because
  `alerts.saved_authority_moved`, `alerts.filed_citation_moved`,
  `alerts.push_delivery`, `monitoring.user_product` and `briefing.daily_loop` are all
  `DISABLED_NOT_READY` and must stay so for the beta. Closing the gate would mean
  enabling a disabled capability to satisfy a readiness check. What the beta requires
  instead is **operator** observability — crash/error, server health, support
  escalation — which is `PRIVATE-BETA TELEMETRY` above. **The A1 requirement is
  resequenced, never deleted.**

**iOS, recorded explicitly so deferral is never read as cancellation:**

```text
IOS_PRODUCT        = IN_SCOPE
IOS_PUBLIC_RELEASE = IN_SCOPE

IOS_STORE_SUBMISSION_BEFORE_ANDROID_PRIVATE_BETA = NO

IOS_PHYSICAL_ACCEPTANCE = PUBLIC_RELEASE_REQUIREMENT
                          NOT_ANDROID_APK_BETA_BLOCKER
```

**Deferred is not abandoned.** iOS physical and product work remains a
public-launch requirement (§0.4.2); it is simply not required to hand Android
lawyers an APK. §14.14's store/release account readiness rows and §14.9's Apple
build proof stay in the roadmap and move with the store work. A future round that
reads this section must not record the deferred rows as cancelled.

Gate-D rows 1 and 10 above (physical iPhone, Apple Xcode26+/iOS26+ build) are the
one place the two lists touch: the iPhone build proof is **retained** as product
evidence and is **not** a private-beta distribution blocker.

RED does not run Gate D.

## 14.14 Store / release account readiness (A1)

**Measure, do not assume.** Every row is `VERIFIED` (observed in the console, CLI or API),
`FOUNDER_CONFIRMED` (founder states it, with the date), or `UNKNOWN`. Current values live in
`docs/product/STORE_RELEASE_CHECKLIST_V1.md` §0.

### Apple
```text
APPLE_DEVELOPER_MEMBERSHIP
APPLE_ACCOUNT_TYPE              (individual | organization)
APPLE_ORGANIZATION_VERIFIED
APPLE_DUNS_IF_ORG
APPLE_BINDING_AUTHORITY
APPLE_WORK_EMAIL                (on the organization's domain)
APPLE_TEAM_ID
APPSTORE_CONNECT_APP_RECORD
IOS_BUNDLE_ID_RESERVED          (co.lawmind.app)
SIGNING_CERTIFICATES
PROVISIONING
TESTFLIGHT_ACCESS
```
Apple's organization enrollment requires a publicly available, functional website on a
domain associated with the organization. The temporary promotional site may satisfy
that. **Satisfying it does not make the promotional site product architecture.**

### Google Play
The planned launch falls after 30 Sep 2026, so the current Play Console requirements
apply (§20.4):
```text
PLAY_ACCOUNT_TYPE               (personal | organization)
PLAY_ORGANIZATION_VERIFIED_IF_APPLICABLE
PLAY_DUNS_IF_ORG
PLAY_LEGAL_NAME_ADDRESS
PLAY_CONTACT_VERIFIED
PLAY_PAYMENT_PROFILE_IF_APPLICABLE
PLAY_APP_REGISTERED             (package registration for developer verification)
PLAY_PACKAGE_ID                 (co.lawmind.app)
PLAY_DATA_SAFETY
PLAY_SIGN_IN_DETAILS            (reusable, always valid, location-independent)
```
Do not infer the personal-account closed-testing rule (testers/days). Read the actual
account type first.

### Expo / EAS
```text
EAS_ACCOUNT
EAS_PROJECT
EAS_PROJECT_ID                  (apps/mobile/app.config.ts carries none at A1)
EAS_ORG
IOS_CREDENTIAL_OWNER
ANDROID_SIGNING_OWNER
```
`EAS_PROJECT_REQUIRED_FOR_BUILD/DELIVERY` is **not** `PUSH_NOTIFICATIONS_FEATURE`. Push may
stay deferred (Shape B makes no push/monitoring claim) while the EAS project and build
pipeline become release-ready.

## 14.15 SECURITY_RELEASE_BASELINE (A1) — Gate D evidences, Gate E attacks

Evidence comes from code, config or runtime observation as each row requires. An
expensive external penetration test is **not** required to tick a row.

```text
TENANT_AUTHORIZATION
PROTECTED_ROUTE_AUTH_BEFORE_SENSITIVE_WORK      (includes N-7: POST /matters body validation before auth)
SESSION_EXPIRY_RECOVERY
MAGIC_LINK_REPLAY
MAGIC_LINK_REDIRECT_CLOSED                      (R33)
RATE_LIMITING
SECRETS_NOT_COMMITTED
TOKENS_NOT_LOGGED
QUERY_STRINGS_NOT_LOGGING_TOKENS
TLS_PUBLIC_API
PUBLIC_POSTGRES_CLOSED
ADMIN_ISOLATION
MOBILE_SECURE_STORAGE
BACKUP_ENCRYPTION
BACKUP_KEY_ESCROW                               (founder: FQ-BACKUP-KEY-ESCROW)
DEPENDENCY_VULNERABILITY_REVIEW
SENTRY_DATA_ALLOWLIST
POSTHOG_DATA_ALLOWLIST
NO_RAW_MATTER_DOCUMENT_CONTENT_IN_TELEMETRY
NO_RAW_SENSITIVE_QUERY_TEXT_UNLESS_EXPLICITLY_APPROVED
DATA_SAFETY_MATCHES_RUNTIME
```

Each row: `PASS | FAIL | HOLD | UNKNOWN`, with evidence path. Gate D requires none FAIL and
none UNKNOWN. Gate E re-attacks every row.

---

# 15. COMMERCIAL / PREMIUM PROGRAM

Do not let old promotional pricing decide architecture.

Current engineering state has no required purchasable launch surface.

Gate D founder decision:

```text
LAUNCH_COMMERCE = FREE_BETA | PAID_V1
```

Do not infer it.

## 15.1 If FREE_BETA

- no billing SDK/product surface required for launch;
- no IAP metadata;
- no fake locked premium cards;
- monetization moves to measured v1.1 work;
- collect beta behavior/unit economics first.

## 15.2 If PAID_V1

Separate implementation gate:
- Apple IAP / StoreKit path;
- Google Play Billing: a **supported PBL8+** version (A1: PBL8 and PBL9 are both supported; PBL9 is current as of 18 Sep 2026; PBL7 left support for new apps/updates on 31 Aug 2026). **Re-measure the actual current stable version before implementation**;
- products configured;
- receipt/entitlement validation;
- reinstall/device-switch recovery;
- refund/cancel state;
- server entitlement truth;
- price/tax/plan metadata;
- restore purchases;
- physical purchase tests;
- store-review compliance.

Do not choose a billing vendor from an old founder-queue recommendation without rechecking current requirements. Old RevenueCat/OpenIAP recommendations (FOUNDER_QUEUE, 8 Aug 2026) are historical input, not binding decisions.

## 15.3 Monitoring premium

Monitoring cannot be sold merely because billing exists.

All twelve monitoring conditions and measured cadence economics remain separate prerequisites.

## 15.4 Commerce is not required for the private beta (A2, 19 September 2026)

```text
BILLING_IMPLEMENTATION = NOT REQUIRED
IAP                    = NOT REQUIRED
PLAY BILLING           = NOT REQUIRED
```

for the ~100-lawyer private beta, unless the founder separately changes the
decision. Do not build paywalls, billing SDKs or fake premium cards before
private-beta evidence establishes value. **Commercial decisions follow product
evidence.**

The `LAUNCH_COMMERCE = FREE_BETA | PAID_V1` founder decision above is not deleted;
it moves to the public-release path (§17), where it actually binds. A Gate-D HOLD
on commercial state is not raised against the private beta.

---

# 16. PRIVATE BETA — ONE STAGED PROGRAMME (A2)

> **SUPERSEDED, 19 September 2026 (A2).** The two-programme model below — a 3–5
> advocate shadow beta, then a separate 10–30 advocate closed beta — is replaced by
> **one** private-beta programme of ~100 already-contacted practising lawyers,
> staged internally into waves. The original text is kept unedited beneath the new
> structure because its measurement discipline is still exactly right, and because
> `SHADOW_BETA_3_5 = NOT_EVIDENCED_IN_CURRENT_GATE_C_ACCEPTANCE` remains a true
> historical statement that must not be rewritten.

## 16.1 Wave structure

One cohort, one environment, one candidate line, staged exposure.

```text
WAVE 0 — CANARY  ~5 lawyers, drawn from the SAME contacted cohort

  purpose: installation · APK signing and download · auth · basic core loop ·
           crash / ANR / OOM · telemetry · support path ·
           catastrophic trust or safety defects

  NO separate infrastructure · NO separate recruitment · NO separate beta program

        ↓  freeze metric definitions and severe-defect definitions here

WAVE 1  ~20–25 total

  validate: capacity · support load · retrieval behaviour · poor network ·
            device diversity · research workflow

        ↓

WAVE 2  expand toward ~100 lawyers
```

The wave **count** may be adjusted from evidence. The **principle** may not:

```text
small canary first · same beta environment · same cohort ·
same candidate line · no separate shadow-beta project
```

**Thresholds freeze after Wave 0 and before Wave 1 — never after seeing the full
~100-person cohort.** This is the one discipline the superseded §16.2 got right and
A2 keeps verbatim in force: do not tune a success definition after observing the
population it grades.

## 16.2 Private-beta success metrics (A2 strengthens, does not replace, RTC)

Measure: research task completion · time to usable authority · **time to verified
useful authority** · another database required, and why · query reformulations ·
source opens · evidence / passage inspection · currentness and treatment
inspection · authority save · matter linkage · resume / reconstruction friction ·
trust-state confusion · freshness confusion · **authority-currentness corrections
found by users** · crash / ANR / OOM · auth failure · search latency · poor-network
failure · support incidents.

`docs/product/RESEARCH_TASK_SET_V1.json` remains the task set. **Do not coach
lawyers into passing tasks.**

## 16.3 APK private-beta release contract

Before inviting the cohort there must be a real release candidate, recorded with:

```text
SIGNED RELEASE APK       ·  PACKAGE IDENTITY
VERSION CODE             ·  VERSION NAME
BUILD SHA / COMMIT SHA   ·  APK SHA256
RELEASE ID               ·  ENVIRONMENT ID
HTTPS DOWNLOAD SOURCE    ·  INSTALL INSTRUCTIONS
UPGRADE INSTRUCTIONS     ·  ROLLBACK / PREVIOUS GOOD APK
CHANGELOG                ·  CRASH / ERROR OBSERVABILITY
SUPPORT / FEEDBACK PATH
```

**Never distribute a debug build as the private beta merely because it installs
easily.** Play Store publication is not required, and an AAB is not required for
this APK beta — AAB and store work move to public-store readiness (§14.13.1).

## 16.4 Android developer verification — a distribution policy item, not a reason to publish

Rechecked against Google's own documentation on **19 September 2026** (A2), because
a remembered version of this rule is exactly how a false blocker enters a roadmap:

```text
LIMITED_DISTRIBUTION_DEVICE_LIMIT = 20 devices per APK
PRIVATE_BETA_COHORT               = ~100 lawyers
=> LIMITED_DISTRIBUTION_SUITABLE  = NO
```

Google's limited-distribution path (no government ID, no registration fee, aimed at
students, teachers and hobbyists) caps installs at **20 devices per APK**, which is
far below this cohort. Use the normal direct/private distribution path appropriate
to a professional developer instead.

Enforcement, as documented on the recheck date: user-facing enforcement begins
**30 September 2026** in **Brazil, Indonesia, Singapore and Thailand** on
participating app stores, expanding globally in **2027 and beyond**. **India is not
in the September 2026 wave.** Therefore:

```text
ANDROID_DEVELOPER_VERIFICATION = FUTURE DISTRIBUTION REQUIREMENT
BLOCKS_THE_INDIAN_APK_PRIVATE_BETA_TODAY = NO
```

Keep global developer-verification readiness as a distribution requirement to close
before broad enforcement reaches India. Do **not** spend implementation time on Play
submission merely to solve a problem that does not block a direct APK beta today.
This refines, and does not contradict, `docs/CURRENT_STATE.md` §9: the 30 September
date is a **verify** action, not a publish deadline, and LawMind's Play console
state has still never been observed.

---

## 16.5 SUPERSEDED — the original shadow-beta text, preserved

The original roadmap expected 3–5 practising advocates before freezing larger-beta thresholds.

The current Gate-C acceptance record does **not clearly bind an artifact proving that 3–5 advocate baseline happened**.

Therefore:

```text
SHADOW_BETA_3_5 = NOT_EVIDENCED_IN_CURRENT_GATE_C_ACCEPTANCE
```

Do not pretend it happened.

Run it early in Sprint 4 once persistent beta is usable.

### 16.5.1 Use the existing curated task set

The repository already contains `docs/product/RESEARCH_TASK_SET_V1.json`.

Use realistic tasks without coaching the advocate to pass.

Record:
- task ID;
- task start/end;
- query reformulations;
- authority opened;
- source opened;
- treatment/currentness inspected;
- saved to matter;
- task completed;
- another DB used;
- why another DB was used;
- time to usable authority;
- trust-state confusion;
- resume/reconstruction friction.

### 16.5.2 Freeze thresholds after observing, not before

After 3–5 advocates:
- establish RTC baseline;
- freeze Gate-E beta thresholds;
- freeze another-DB and severe-trust-confusion definitions;
- do not tune the threshold after the 10–30-person beta begins.

---

# 17. SPRINT 5 — AFTER THE PRIVATE BETA

> **RESEQUENCED, 19 September 2026 (A2).** The separate 10–30 advocate closed beta
> is superseded by §16's staged ~100-lawyer private beta. Sprint 5 is now the
> **post-private-beta public-release path**, and the measurement list below applies
> to the private-beta cohort instead of a second recruitment round. The target dates
> are historical and, as always, never override evidence.

## 17.0 Post-beta public release path (A2)

```text
PRIVATE BETA EVIDENCE
        ↓
PRODUCT / DATA CORRECTIONS
        ↓
RED GATE E
        ↓
CANDIDATE FREEZE
        ↓
IOS FINAL PHYSICAL / RELEASE PROOF
ANDROID AAB / PLAY RELEASE PROOF
        ↓
STORE PACKS
        ↓
PLAY / APP STORE SUBMISSION
        ↓
PUBLIC RELEASE
```

Store work accelerates **only once private-beta evidence says the product deserves
to ship**. The `LAUNCH_COMMERCE = FREE_BETA | PAID_V1` decision (§15) binds here,
not against the APK beta.

---

## 17.1 Measurement programme (applies to the private-beta cohort)

**Target (historical):** 3–16 October, only after Gate D.

Against frozen product definitions and persistent beta infrastructure.

Measure:
- RTC;
- time to usable authority;
- another database needed;
- useful authority quality;
- source/provenance use;
- treatment/currentness understanding;
- false-premise handling;
- query refusal comprehension;
- save/matter retention;
- auth friction;
- resume/reconstruction friction;
- crashes/ANR/OOM;
- poor-network behavior;
- support issues.

Do not coach users.

### 17.1.1 Competitor benchmark

Use ordinary licensed/user access only. No scraping or terms circumvention.

Use the same bounded task classes where reasonable.

Record observed behavior, not competitor marketing claims.

### 17.1.2 Product-decision outputs

Only after beta evidence:

```text
RESEARCH_SESSION_V1 = PROMOTE | DEFER
EVIDENCE_LOCKED_SYNTHESIS_EXPERIMENT = RUN | DEFER
```

### Research Session
Promote only if advocates repeatedly lose/reconstruct useful research context.

Minimum concept:
- research-session id;
- optional matter id;
- queries/filters;
- opened authorities;
- saves;
- last active;
- resume.

No chat requirement.

### Evidence-locked synthesis
Run only if advocates find correct evidence in LawMind but repeatedly leave primarily to synthesize it.

Internal experiment:
```text
question
→ verified retrieval
→ exact evidence spans
→ authority/treatment/currentness
→ generated claims
→ claim-to-evidence audit
→ answer / abstain
```

Each substantive claim:
- SUPPORTED
- PARTIALLY_SUPPORTED
- CONTRADICTED
- INSUFFICIENT_EVIDENCE

No freehand citations.

These are v1.1 decisions unless founder explicitly changes scope.

---

# 18. PROMOTIONAL WEBSITE / FUNDRAISING — CORRECTED ROLE

Remove "website build" from the product critical path.

## 18.1 During Gate D / beta

Do only:
- keep stable compliance URLs functional;
- prevent the promo site from being mistaken internally as capability authority;
- make no store/review submission claim that contradicts the shipped binary.

Do **not**:
- redesign homepage;
- implement advocate web app;
- build marketing feature demos;
- chase copy parity on every sprint;
- treat old price cards as commercial decisions.

## 18.2 When to rebuild promotional site

Best timing:
- after Gate D candidate is stable;
- preferably after closed-beta findings settle launch messaging;
- before public launch if founder wants a polished acquisition surface.

At that point rebuild from:
- frozen capability registry;
- final store screenshots;
- measured beta evidence;
- final commercial decision;
- actual launch platform availability.

## 18.3 Fundraising

Fundraise/data-room work is serious but distinct from promo web engineering.

Prepare:
- product thesis;
- Gate A/B/C/D evidence;
- data moat/corpus facts with timestamps/denominators;
- source-rights map;
- architecture;
- retrieval evaluations;
- legal-truth safeguards;
- beta RTC/retention/another-DB metrics;
- cost model;
- launch/commercial decision;
- risk register;
- privacy/security controls.

Never turn internal unverified experimental numbers into investor claims.

---

# 19. GATE E — FORMAL RED AUDIT

RED wakes as a fresh independent session after closed beta and before store candidate freeze.

Audit the exact committed candidate and live beta/review environment.

Minimum Gate-E attack:

### Product
- Auth → Search → Reader → Save → Matter;
- deletion;
- app lifecycle;
- device matrix;
- accessibility;
- reviewer access;
- store screenshots/metadata.

### Legal truth
- citation states;
- ambiguity/refusal;
- provenance;
- treatment/currentness;
- no hidden unconfirmed citation path;
- statute/old-new capabilities still gated;
- semantic/adverse/drafting/monitoring not accidentally enabled.

### Release
- API36;
- Xcode/iOS SDK;
- signed artifact identity;
- deployed provenance;
- environment labels;
- split DB;
- backup/restore;
- rollback preserving user state;
- current full API suite;
- no founder-workstation dependency.

### Privacy/security
- account deletion;
- external deletion;
- data-safety disclosures;
- no unsupported third-party AI sharing;
- auth protection before protected data/work;
- secrets not committed;
- review credentials narrow and revocable;
- (A1) every `SECURITY_RELEASE_BASELINE` row in §14.15;
- (A1) `EXTERNAL_DELETE_AUTH_V1`: no account-existence oracle, no broad bypass, R33 redirect intact;
- (A1) alert delivery actually reached a human (§13.5).

### Claims
- store metadata <= capability registry;
- no static cadence without runtime evidence;
- no unsupported accuracy/superlative;
- promotional website is not evaluated as core product except stable compliance URLs and any launch claims the founder chooses to publish.

Gate E outputs:

```text
PASS
HOLD — exact blocker
FAIL — falsified invariant
```

---

# 20. SPRINT 6 — CANDIDATE FREEZE / SUBMISSION / LAUNCH

Target candidate freeze: 17 October 2026.  
Target public launch: 23 October 2026.  
Buffer: 24–30 October.

Dates are targets.

## 20.1 Freeze

Freeze:
- capability registry;
- API contract;
- mobile candidate;
- release SHA/build provenance;
- store listing;
- screenshots;
- review notes;
- privacy/data safety;
- commerce state;
- beta environment/reviewer data.

No scope expansion after freeze without explicit founder re-open.

## 20.2 Submission

Backend/review environment stays live while stores review.

Monitor:
- auth delivery;
- API readiness;
- DB capacity;
- backup;
- reviewer account;
- support URL;
- deletion URL.

## 20.3 Promotional site rebuild

If desired, rebuild the promotional site **after the application candidate is stable** using actual launch claims.

It may launch before/with the app, but it never determines app architecture.

## 20.4 Official policy rechecks (A1, primary sources read 18 Sep 2026; URLs in memo §19)

```text
GOOGLE_TARGET_API          = Android 16 / API 36+ for ordinary new apps and updates since 31 Aug 2026 (extension to 1 Nov 2026 on request)
APPLE_UPLOAD_TOOLCHAIN     = Xcode 26+ with the iOS 26 SDK+, required for App Store Connect uploads since 28 Apr 2026
GOOGLE_EXTERNAL_DELETION   = in-app deletion path + a web link resource (functional, relevant, identifiable)
GOOGLE_REVIEW_ACCESS       = sign-in details accessible at all times, reusable, valid regardless of user location
APPLE_REVIEW_ACCESS        = an active demo account, or a fully featured demo mode with Apple's prior approval
PLAY_CONSOLE_2026_09_30    = Android developer verification: Play packages must be registered by 30 Sep 2026 or be removed
APPLE_ORG_ENROLLMENT       = legal entity (no DBA), D-U-N-S, binding authority, work email on the org domain, functional public website on the org domain
PBL                        = supported PBL8+ if paid (PBL9 current); recheck the actual current version before implementation
DPDP                       = §12.4; DPDP_EFFECTIVE_DATE_RECHECK = REQUIRED_BEFORE_PUBLIC_LAUNCH
```

Re-check every row immediately before submission. Store policy moves faster than this roadmap.

---

# 21. SCOREBOARD

Every metric includes denominator + measurement timestamp.

## 21.1 Data

- HC accounted%;
- HC actually-held%;
- newest upstream / newest held;
- SCI public-feed freshness;
- source-failure clusters;
- canonical citation correction state;
- citation edge candidate/audit state;
- citation graph edge apply state;
- statute raw/resolver-confirmed states;
- embedding four-state counts;
- incremental oldest pending age;
- vector integrity;
- eCourts observations/day.

## 21.2 Product

- RTC;
- task count / advocate count;
- another-DB rate;
- time-to-authority;
- query reformulations;
- source opens;
- saves;
- matters created;
- resume friction;
- trust-state confusion;
- delete completion/request state.

## 21.3 Retrieval

- exact identity success;
- known-target present@10/50;
- broad-query refusal rate;
- degraded rate;
- p50/p95/p99;
- cold vs warm;
- pool wait;
- search-arm timings;
- ANN metrics only if ANN exists.

## 21.4 Reliability

- API uptime;
- full-suite state;
- crash/ANR/OOM;
- backup age;
- latest restore;
- release/rollback;
- USER-data preservation;
- idempotency duplicate-mutation failures;
- environment/provenance correctness;
- alerts that actually reached a human.

## 21.5 Store/release

- Android targetSdk;
- Android release/AAB proof;
- iOS Xcode/SDK/archive proof;
- tablet state;
- iOS party-search state;
- review account state;
- privacy/support/deletion URLs;
- billing version if present;
- exact store candidate SHA.

## 21.6 Commercial

- free vs paid;
- active beta users;
- weekly returning advocates;
- task completions;
- support load;
- infra/user cost;
- model/user cost where applicable;
- paid conversion only if paid exists.

---

# 22. RISK REGISTER — CURRENT

| Risk | Current exposure | Required control |
|---|---|---|
| Old agent topology resurrects from repo bootstrap | High until transition seal | update `AGENTS.md`, `CLAUDE.md`, lane docs/hooks; preserve history |
| Current-plan authority points to stale roadmap | High | `CURRENT_STATE.md` + v7.4 manifest |
| Gate-C infra destroyed, Gate-D needs real backend | Immediate | persistent beta spend/preflight before physical Gate-D |
| Gate-C credentials still valid | Founder/security | rotate DO/Resend/Spaceship |
| R2 backup encryption key exists only on workstation | Disaster recovery | off-machine key escrow |
| Corpus rollback can empty `matter_authorities` | User-state loss | fix/prove before persistent beta |
| Deployment provenance incomplete | Incident/release ambiguity | immutable SHA/digest/deployedAt |
| `/version` vs `/ready` environment mismatch | incident routing | one environment source of truth |
| Manual prewarm after restart | cold latency | automate or gate readiness |
| Novel query >3s on 32GB corpus host | UX/capacity | cold-query capacity study |
| Full API suite has unresolved timing failure | regression uncertainty | quiet-window full run |
| Reviewers cannot complete magic-link auth | store rejection | REVIEW_ACCESS_V1 |
| `supportsTablet:true` untested | store/UX inconsistency | disable tablet or test/support |
| iOS party-name public-database policy | App Review risk | default OFF, exact case research preserved |
| External deletion missing/unstable | Play rejection | stable functional external delete URL |
| Promo website mistaken as product truth | wasted work/scope drift | founder website amendment in bootstrap |
| Citation edge fan-in/alias concentration | false graph risk | RED pre-apply audit; bulk apply HOLD |
| eCourts no real observation | false monitoring promise | Shape B; 12-condition gate |
| HNSW pressure creates premature semantic release | scope/safety | offload only; release separately |
| Upload/drafting pressure bypasses DPA/verify-confirm | privacy/citation risk | capability remains disabled; trigger mandatory |
| Direct SCI authorization conflated with public official feed | authorization error | source-path distinction |
| Beta thresholds tuned after seeing full beta | metric gaming | 3–5 advocate baseline first |
| Paid launch creates billing work under deadline | schedule risk | explicit founder FREE_BETA vs PAID_V1 decision |
| (A1) External delete reuses the mobile magic link and weakens R33 | credential steering / account takeover | separate `EXTERNAL_DELETE_AUTH_V1`; R33 redirect fixed |
| (A1) Play package not registered by 30 Sep 2026 | app removal / cannot publish | measure `PLAY_APP_REGISTERED` now (§14.14) |
| (A1) No EAS project id in `app.config.ts` | no store build pipeline | measure EAS rows; separate from push |
| (A1) DPDP obligations misstated as fully in force (or ignored) | legal/claims | §12.4 dates + launch recheck |
| (A1) Alerts that never reach a human | silent outage in beta | §13.5 synthetic alert delivery proof |

---

# 23. FOUNDER ACTION QUEUE — CURRENT PRIORITY

## P0 security / continuity

1. Rotate/revoke Gate-C DigitalOcean token.
2. Rotate Resend API key.
3. Rotate Spaceship API key + secret.
4. Escrow `R2_BACKUP_ENCRYPTION_KEY` off the workstation.
5. Remove inert Gate-C local SSH private key if no retention requirement.

## P0/P1 execution decisions

6. Approve/decline the persistent beta hosting budget after SHIP provides the measured package.
7. Confirm access to an Apple Developer Program account / required App Store Connect organization state for the production iOS build.
8. Confirm Google Play Console account state where required.
9. At Gate D, choose `FREE_BETA` or `PAID_V1`.

No promotional-website design decision is required now.

---

# 24. IMMEDIATE EXECUTION ORDER

> **UPDATED 19 September 2026 (A2).** Phases 0–4 below are the v7.4 original and
> stay readable as written. A2 changes the sequencing in three specific ways, and
> where the two disagree, this block wins.
>
> 1. **Phase 0 is complete.** Rotation (§23 P0) remains OPEN on the founder; the
>    transition seal ran as S4-T0.1/T0.2/T0.3, the continuity census ran as
>    DATA S4-D0, and SHIP S4-R0 (hosting/cost package, **no provisioning**) is next.
> 2. **Phase 1 splits at the two-stage spend gate (§13.1.1).** Provisioning does not
>    follow S4-R0 automatically. SHIP returns to Stage A local candidate closure and
>    asks for spend only when remote proof is genuinely on the critical path.
> 3. **Phase 2 items 14–15 are superseded** by §16's staged ~100-lawyer private beta:
>    Wave 0 canary (~5) → freeze definitions → Wave 1 (~20–25) → Wave 2 (~100).
>    Phase 2 item 13 (store pack) and Phase 4's store submission move behind the
>    private beta per §14.13.1. **Phase 3's "10–30 advocates" is superseded** by the
>    same one-programme model; Sprint 5 becomes the post-beta public path (§17.0).
>
> A2's own parallel strategic tracks (§26) — Delhi HC permission, Primary Source
> Fabric design, benchmark design, frontier watch, the source opportunity register —
> **may not consume the release critical path** unless one uncovers a genuine P0
> truth or safety defect.

## Phase 0 — today

1. Founder performs credential rotation + backup-key escrow.
2. SHIP runs **v7.4 Transition/Reconciliation Seal** — docs/orchestration only.
3. DATA runs a lightweight current continuity census after the seal.
4. SHIP produces persistent-beta hosting/cost package — **no provisioning yet**.

## Phase 1 — after founder remote-spend approval

1. SHIP provisions/restores persistent beta plane.
2. SHIP closes pre-beta reliability:
   - provenance;
   - environment label;
   - prewarm/readiness;
   - `matter_authorities` rollback;
   - quiet full API suite;
   - reviewer access;
   - backup/restore.
3. DATA keeps ingestion/embedding delta healthy.

## Phase 2 — Gate-D work

1. physical iPhone;
2. low/mid Android;
3. high-end Android affected-row regression;
4. accessibility/text scaling/reduced motion;
5. large judgment;
6. poor network/background/resume;
7. deletion;
8. external compliance endpoints;
9. Android API36 release;
10. iOS Xcode26/iOS26 build;
11. tablet decision;
12. iOS party-search decision;
13. store pack;
14. 3–5 advocate shadow beta;
15. freeze larger-beta thresholds;
16. founder free-vs-paid decision;
17. Gate D.

## Phase 3 — Sprint 5

- 10–30 advocates;
- persistent beta;
- 50-task research program;
- licensed competitor benchmark;
- fundraising data room;
- research-session/synthesis evidence decisions;
- no scope expansion by default.

## Phase 4 — Gate E / launch

- fresh RED Gate E;
- candidate freeze;
- store submission;
- backend remains live;
- optional promotional-site rebuild from final product truth;
- launch.

---

# 25. FINAL NORTH STAR

LawMind wins by compounding five things:

**Data truth**  
Court/source identity, provenance, freshness and explicit uncertainty.

**Legal truth**  
No plausible false authority, no silent ambiguity, no model opinion promoted into canonical law.

**Research completion**  
The advocate finishes real work without another database.

**Workflow retention**  
Verified research becomes matter context that can be resumed instead of rediscovered.

**Operational truth**  
Builds, schedulers, search latency, backups, restores, capability states and public claims are measured, not inferred.

> **better legal data × defensible legal truth × faster advocate workflow × retained matter context × repeat usage**

---

# 26. AMENDMENT A2 — DATA MOAT & LEGAL-INTELLIGENCE FRONTIER

**Installed 19 September 2026, SHIP S4-A2.** Strategy, not implementation. No
schema migration, no UI, no capability, no corpus mutation follows from this
section by itself. Every program here becomes work only through its own bounded
prompt, prioritised against the private-beta critical path.

## 26.0 The thesis

LawMind does **not** answer competitor pressure by expanding the current feature
surface. The defensible moat is:

```text
VERIFIED INDIAN LEGAL DATA
+ PRIMARY-SOURCE PROVENANCE
+ RETRIEVAL
+ AUTHORITY INTELLIGENCE
+ TEMPORAL / CURRENTNESS STATE
+ EXACT EVIDENCE
+ EVALUATION
+ DETERMINISTIC CITATION RENDERING
+ LAWYER WORKFLOW
```

Reasoning models are replaceable. **The model proposes. Evidence proves.**

## 26.1 Current product scope remains frozen

A2 expands nothing. The Gate-D product is unchanged:

```text
Search → Results → Reader → Source / Evidence → Save → Matter → Return / Refetch
```

```text
ADVOCATE_PRODUCT_ANDROID = IN_SCOPE     ADVOCATE_PRODUCT_IOS = IN_SCOPE
ADVOCATE_DESKTOP_WEB     = DO_NOT_BUILD

PUBLIC_SEMANTIC          = DISABLED     HNSW_PUBLIC          = DISABLED
CITATION_BULK_APPLY      = HOLD
MONITORING               = DISABLED_NOT_READY
BRIEFING                 = DISABLED_NOT_READY
DRAFTING                 = POST_V1      HINDI GENERATION     = POST_V1
UPLOAD / OCR             = DISABLED / LATER
ECOURTS_OBSERVATIONS     = 0
```

**Competitive pressure is never permission to bypass a capability gate.** A2 does
not authorize `CITATION_BULK_APPLY`, does not enable public semantic search, does
not build HNSW and does not start systematic Delhi HC ingestion.

## 26.2 Primary Source Fabric

An explicit strategic program. Every source eventually receives a **Source
Contract** covering:

source identity · owner · jurisdiction · court/body/publisher · source class ·
canonical origin · officialness · authorization basis · authorization state ·
allowed acquisition · allowed storage · allowed reproduction · allowed linking ·
authentication · CAPTCHA / manual constraints · refresh expectation · identity
keys · parser version · first observed · last observed · latest artifact ·
coverage frontier · integrity / hash policy · observation reliability · retention ·
downstream allowed capabilities · explicit prohibitions · review / expiry.

Binding rules, and the reason each exists:

```text
OFFICIAL                  != AUTOMATIC PERMISSION
TECHNICALLY ACCESSIBLE    != AUTHORIZED
ADAPTER WORKS             != PUBLIC FEATURE
ONE SOURCE'S AUTHORIZATION != ANOTHER SOURCE'S AUTHORIZATION
```

The last line is the one that has actually cost this project time: CLAUDE.md §6a
authorizes BharatLaw, Supreme AI and eCourts by name, and nothing about those
three grants extends to a fourth source. `Supreme AI` and `Supreme Today` remain
different sources.

## 26.3 Source Passport

The long-term authority-provenance architecture. Eventually attached to
authorities: canonical case identity · court · date · official source URL(s) ·
observed source(s) · preferred source and the reason · first seen · last verified ·
original artifact hash · text hash · extraction / OCR method · paragraphization
version · metadata conflicts · content conflicts · corrigenda · treatment state ·
treatment verification time · coverage frontier at verification · authorization
class · uncertainty.

**No schema migration now. No UI now.** `docs/SCHEMA_TRUTH.md` is untouched by A2.

## 26.4 Five-clock freshness

The canonical temporal model. Five clocks, not one:

```text
LATEST_HELD            the newest thing we hold
SOURCE_FRONTIER        the newest thing the source has published
COVERAGE_FRONTIER      the point up to which we believe we are COMPLETE
INGEST_FRONTIER        the point our ingestion has actually processed to
VERIFICATION_FRONTIER  the point up to which verification has run
```

Separate state dimensions, never folded into the clocks:

```text
OBSERVATION_CONFIDENCE
SOURCE_COMPLETENESS_STATE
SOURCE_AVAILABILITY_STATE
```

Older language maps explicitly onto these rather than spawning duplicate concepts.

**Never allow `newest judgment date = yesterday` to silently become `coverage
complete through yesterday`.** DATA S4-D0 already falsified that equivalence: the
HC honest coverage frontier is **2026-07-01** while daily ingest continues, and
`sci-live` is producing current Supreme Court judgments while being **absent from
the existing freshness ledger**. A ledger that omits a running source cannot
answer a currentness question, and the gap is invisible to any check that reads
only the maximum date.

## 26.5 Court event graph

A strategic **research** track. Nothing is ingested for it by A2.

```text
CASE → SOURCE PUBLICATION → CAUSE-LIST VERSION → BENCH / COURTROOM CONTEXT
     → OBSERVED EVENT → PRONOUNCEMENT → ORDER → JUDGMENT
     → CORRIGENDUM / REVISION / TREATMENT
```

Mandatory non-inference invariants — each one is a wrong answer we would otherwise
ship with confidence:

```text
LISTED_OBSERVED          != HEARING_OCCURRED
DISPLAY_BOARD_OBSERVED   != FINAL_CASE_STATUS
PRONOUNCEMENT_ENTRY      != JUDGMENT_TEXT_PUBLISHED
MISSING_PDF              != NO_JUDGMENT_DELIVERED
FAILED_FETCH             != NOTHING_CHANGED
TIME_PASSING             != COURT_EVENT
```

Prefer append-only / versioned observations. An observation that is overwritten
cannot later be distinguished from one that was never made.

## 26.6 Authority intelligence

The long-term moat, in dependency order:

```text
AUTHORITY → HIERARCHY / BENCH STRENGTH → LEGAL PROPOSITION
→ EXACT SUPPORTING PASSAGE → TREATMENT → TEMPORAL VALIDITY
→ SUBSEQUENT AUTHORITY → BINDING / PERSUASIVE CONTEXT
→ SOURCE / PROVENANCE → CONFLICT / UNCERTAINTY
```

Binding:

```text
CITATION EXISTS != PROPOSITION SUPPORTED
```

`CITATION_BULK_APPLY` stays **HOLD**. A2 does not authorize it, and no amount of
strategic enthusiasm for authority intelligence converts a held apply into a
permitted one.

## 26.7 Historical provenance reconstruction

DATA S4-D0 measured that roughly **99.75%** of legacy rows carry NULL `source_id`
and `authorization_basis` — provenance is populated only on the frontier.

Record this as:

```text
DATA-QUALITY / PROVENANCE RECONSTRUCTION PROGRAM
```

and **not** as `CORPUS INVALID`. Future reconstruction must classify every value it
writes:

```text
DIRECTLY_PROVEN · DETERMINISTICALLY_DERIVED · PROBABLE · CONFLICTING · UNKNOWN
```

**Never populate provenance merely because a dataset is likely to have come from a
known bulk source.** A confident guess written into a provenance column is worse
than a NULL, because the NULL is honest and the guess is not distinguishable from
a measurement afterwards.

Not Gate-D critical unless it falsifies a current public claim.

## 26.8 Source disagreement

When two legitimate copies of the same authority disagree, compare: artifact
bytes / hash · text hash · case identity · CNR / case number · title · date · bench ·
citation · paragraph structure · text · corrigenda · publication timestamps.

**Classify the disagreement. Never silently collapse a substantive difference.**
Picking a winner without recording that there was a contest is how a corpus loses
the ability to answer "which version did the court actually issue".

## 26.9 Indian legal research benchmark

Evaluation is itself a moat. **Do not benchmark prose fluency.**

Future benchmark classes: exact citation · case number · CNR · authority discovery ·
fact-pattern precedent research · adverse authority · hierarchy / bindingness ·
treatment / currentness · conflicting authority · procedural-law currentness ·
source / provenance inspection · false-premise handling · citation accuracy ·
exact passage support · temporal correctness · obsolete-authority detection ·
source fidelity · ambiguity handling · abstention · matter save / reconstruction ·
time-to-verified-authority · another-database requirement.

Two rules, both learned the hard way in this repository:

- **Freeze definitions and tasks before evaluating any system.** A benchmark whose
  definitions move after the first result measures the definition, not the system.
- **Agents may not modify hidden adversarial evaluation data.** A phrase list scores
  100% on the documents it was written from; an evaluation an agent can edit is an
  evaluation it will eventually pass for the wrong reason.

## 26.10 Model independence

```text
MODEL = replaceable reasoning component

LEGAL DATA · PROVENANCE · RETRIEVAL · AUTHORITY INTELLIGENCE · CURRENTNESS ·
EVIDENCE · EVALUATION · CITATION RENDERING · WORKFLOW = the durable system
```

**No model output becomes authority by itself.** This is the same rule §2 of
`CLAUDE.md` states for citations, generalised: the model references what retrieval
handed it, and what renders comes from the database row.

## 26.11 Delhi High Court — reference source laboratory

Delhi HC becomes the **first deep source laboratory**. It is **not** an immediate
scraping target.

Research inventory (what exists, not what we take): judgments · orders · daily
orders · cause list (advance, main, supplementary, revised, deletion, corrigendum,
pronouncement) · case / filing status · CNR / case identity · display board ·
roster · bench · courtroom · rules · practice directions · circulars ·
notifications · e-DHCR / official reporting · corrections · withdrawals ·
revisions.

Current researched boundary:

```text
DHC_SYSTEMATIC_DATABASE_INGEST = BLOCKED_PENDING_WRITTEN_PERMISSION
```

Until written permission or a formal arrangement exists:

```text
NO systematic commercial mirror     NO production crawl
NO CAPTCHA bypass                   NO authenticated-service automation
NO bulk storage or reproduction based merely on accessibility
```

Allowed planning work: source schema · identity model · parser design **on lawful
bounded fixtures** · direct linking where currently permitted · a permission or
partnership request.

**Delhi HC is not a Gate-D blocker.** The eCourts grant (CLAUDE.md §6a) authorizes
eCourts and says nothing about Delhi HC's own systems — §26.2's fourth binding rule
in its concrete form.

## 26.12 Frontier radar and promotion governance

The radar is `docs/intelligence/LEGAL_TECH_FRONTIER.md`, with
`docs/intelligence/SOURCE_OPPORTUNITY_REGISTER.md` and
`docs/research/DELHI_HIGH_COURT_PRIMARY_SOURCE_PILOT.md` beside it.

```text
FRONTIER_RADAR_GOVERNING = NO
AUTO_PROMOTE_TO_ROADMAP  = NO
DATED_INTELLIGENCE       = YES
```

Every entry separates: observation · date · source · verification class · vendor
claim? · independently verified? · possible LawMind implication · falsifier / test ·
promotion state.

Promotion path — competitor behaviour creates **hypotheses**, not authority:

```text
EXTERNAL DEVELOPMENT → FRONTIER WATCH → PRIMARY-SOURCE VERIFICATION → FRONTIER RADAR
        ↓
DURABLE STRATEGIC IMPLICATION?
   NO → WATCH
   YES → FALSIFY / TEST → EVIDENCE STRONG?
                             NO  → RADAR
                             YES → ROADMAP AMENDMENT
```

**Do not paste competitor product announcements into v7.4.** A roadmap that absorbs
a press release has adopted a vendor's claim as its own evidence.

## 26.13 Agent posture after A2

```text
SHIP = ACTIVE      private-beta candidate closure is the critical path
DATA = CONTINUOUS  no broad new mission from this round
RED  = FROZEN      formal Gate E, specific high-risk falsification, or P0 only
```

A2 creates **later, bounded** DATA work — `sci-live` freshness accounting,
five-clock freshness implementation, Source Contract / Passport implementation,
`cited_authority` drift observability. Each receives its own narrow prompt after
A2 is governing and after SHIP has prioritised it against the beta critical path.

Explicitly not authorized by A2: systematic Delhi HC ingest · citation bulk apply ·
HNSW. Do not waste an independent audit round validating governance text.
