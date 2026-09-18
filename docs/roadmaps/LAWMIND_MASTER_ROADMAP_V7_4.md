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

Current accepted v1 includes, subject to current capability registry:
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

Preferred security design:
- use existing magic-link ownership proof;
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

RED does not run Gate D.

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
- Google Play Billing supported current major (PBL8+ as of current plan);
- products configured;
- receipt/entitlement validation;
- reinstall/device-switch recovery;
- refund/cancel state;
- server entitlement truth;
- price/tax/plan metadata;
- restore purchases;
- physical purchase tests;
- store-review compliance.

Do not choose a billing vendor from an old founder-queue recommendation without rechecking current requirements.

## 15.3 Monitoring premium

Monitoring cannot be sold merely because billing exists.

All twelve monitoring conditions and measured cadence economics remain separate prerequisites.

---

# 16. SHADOW BETA BEFORE FULL CLOSED BETA

The original roadmap expected 3–5 practising advocates before freezing larger-beta thresholds.

The current Gate-C acceptance record does **not clearly bind an artifact proving that 3–5 advocate baseline happened**.

Therefore:

```text
SHADOW_BETA_3_5 = NOT_EVIDENCED_IN_CURRENT_GATE_C_ACCEPTANCE
```

Do not pretend it happened.

Run it early in Sprint 4 once persistent beta is usable.

## 16.1 Use the existing curated task set

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

## 16.2 Freeze thresholds after observing, not before

After 3–5 advocates:
- establish RTC baseline;
- freeze Gate-E beta thresholds;
- freeze another-DB and severe-trust-confusion definitions;
- do not tune the threshold after the 10–30-person beta begins.

---

# 17. CLOSED BETA — SPRINT 5

**Target:** 3–16 October, only after Gate D.

10–30 practising advocates against frozen product definitions and persistent beta infrastructure.

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

## 17.1 Competitor benchmark

Use ordinary licensed/user access only. No scraping or terms circumvention.

Use the same bounded task classes where reasonable.

Record observed behavior, not competitor marketing claims.

## 17.2 Product-decision outputs

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
- review credentials narrow and revocable.

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
