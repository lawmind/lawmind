# LAWMIND — SPRINT PROMPTS v5
## Companion to Master Roadmap v7.4
## Active topology: SHIP · DATA · RED

Historical lane artifacts remain provenance and are never renamed.

> **AMENDMENT A1 — SHIP S4-T0.1, 18 September 2026.** Patched in place, version unchanged.
> Mirrors roadmap v7.4 Amendment A1. Changes: (1) the hard-coded
> `V1_CAPABILITY_REGISTRY_R16.json` becomes "the latest accepted current capability
> registry", with the exact file bound in `docs/CURRENT_STATE.md` (R17 at A1); (2) every
> prompt starts by reading `docs/CURRENT_STATE.md`; (3) S4-R1 gains real alert delivery;
> (4) S4-R2 gains store/release account readiness, `SECURITY_RELEASE_BASELINE` and
> `EXTERNAL_DELETE_AUTH_V1`; (5) the Gate-D checklist and the RED Gate-E attack list gain
> the matching rows; (6) SHIP contract changes follow roadmap §3.7; stop-the-line follows
> §3.6. S4-T0 ran as S4-T0.1: record `docs/ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md`.

> **AMENDMENT A2 — SHIP S4-A2, 19 September 2026.** Patched in place, version
> unchanged (**prompts stay v5**, roadmap stays **v7.4**, no v7.5). Mirrors roadmap
> v7.4 Amendment A2. Changes: (1) **§3 S4-R0** sizes for the ~100-lawyer staged
> private beta instead of a 10–30 closed beta, prices from the ~250 GB **serving**
> dataset rather than the ~343 GB local footprint, carries the Windows→Linux
> collation correctness item, and stays `PROVISIONING_AUTHORIZED = NO`; (2) **§4
> S4-R1** is gated behind the two-stage spend gate (roadmap §13.1.1) — Stage A local
> closure first; (3) **§6 S4-R3** becomes the staged private beta (Wave 0 canary ~5 →
> freeze → Wave 1 ~20–25 → Wave 2 ~100) on a direct signed Android APK, replacing the
> 3–5 advocate shadow beta; (4) **§7 Gate-D convergence** reclassifies store-submission
> rows to public-store readiness and adds the APK distribution contract and canary
> rows; (5) **§10** becomes the post-private-beta public-release path; (6) **§12**
> submission is unchanged but now sits after the private beta.
> Record: `docs/ai/ship-s4-a2/INTEGRATION_RECEIPT.md`.

---

# 0. COMMON OPERATING PREAMBLE

Prepend mentally to every ACTIVE task.

```text
AUTHORITY
current explicit founder instruction
→ verified current repo / DB / runtime / primary-source evidence
→ MASTER ROADMAP v7.4 + SPRINT PROMPTS v5
→ accepted gate receipts + current capability registry
→ v7.2 historical rationale
→ journals / summaries if non-conflicting.

TRUTH
UNKNOWN stays UNKNOWN.
Code/config existence is not runtime proof.
Historical HOLD/FAIL is not rewritten because a later policy changed.
A passing gate enables no capability by itself.

GIT
Fetch/re-anchor current origin/main.
Record HEAD_START, origin/main, status, leases.
Exact-path staging only.
No git add ., git add -A, commit -a.
No reset/rebase/stash/checkout over another session.
Inspect intervening commits if HEAD moved.

CONCURRENCY
Atomic GIT_COMMIT / MIGRATION_SLOT / HEAVY_BOX.
One GPU writer.
One logical owner per job.
Durable progress outranks PID cosmetics.

FAILURE
Three materially equivalent failed attempts → STOP.
No fourth blind retry.

CLAIMS
Public/store capability claims require current platform-enabled evidence.

WEBSITE
The promotional website is TEMPORARY MARKETING ONLY.
It is not the product, not an advocate web app, not architecture authority.
Do not redesign it as part of ordinary product work.
Stable compliance URLs are separate release contracts.

MOBILE PRODUCT
No advocate desktop/web work unless a newer founder instruction explicitly reopens it.

CURRENT STATE (A1)
Read docs/CURRENT_STATE.md first. It names the current registry, gate, stops and founder actions.
"Current capability registry" = the latest accepted registry named there, never a hard-coded R-number.
After a gate, scope decision, registry release or production deploy, SHIP updates it.

STOP-THE-LINE (A1)
Roadmap §3.6. Legal-data corruption, unauthorized source access, security/privacy exposure,
data-risking schema divergence, user/matter data loss, production-corrupting release/rollback → stop that work.
P1/P2 defects → owned backlog, not a project freeze.
```

---

# 1. SHIP S4-T0 — ONE-TIME v7.4 TRANSITION / RECONCILIATION SEAL
## RUN FIRST. No product feature work.

```text
AGENT = SHIP
MODES = RELEASE + COORDINATION
MUTATION = DOCS / ORCHESTRATION TOOLING ONLY
DB WRITES = NO
CLOUD PROVISIONING = NO
PRODUCT FEATURE MUTATION = NO
```

## Objective

Install v7.4 as current repo authority and migrate the runtime orchestration from historical lanes to SHIP/DATA/RED without rewriting historical evidence.

## Preflight

1. `git fetch origin`.
2. Record:
   - HEAD_START
   - origin/main
   - git status
   - staged/tracked/untracked product files
   - GIT_COMMIT/MIGRATION_SLOT/HEAVY_BOX
   - old lane/session leases.
3. Read and mechanically inspect:
   - `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.*`
   - `docs/ai/fifth/gate-c-final/VERDICT.md`
   - `docs/ai/lcc-r34/TEARDOWN_RECEIPT.md`
   - `docs/ai/rcc-r32/ROUND.md`
   - `docs/ai/new1-r15/NEW1_TERMINAL_RECEIPT.md`
   - `docs/ai/new2-r24/NEW2_R24.md`
   - the latest accepted current capability registry named in `docs/CURRENT_STATE.md` (A1: `docs/product/V1_CAPABILITY_REGISTRY_R17.json`; R16 stays historical evidence)
   - `docs/ai/lcc-r13/ECOURTS_BOUNDED_STOP_REPORT.md`
   - `docs/product/MONITORING_12_CONDITION_MATRIX.json`
   - current `AGENTS.md`
   - current `CLAUDE.md`
   - `docs/CURRENT_PLAN.md`
   - `docs/LANE_PROTOCOL.md`
   - `docs/LANE_BUS.md`
   - `PRODUCT_DECISIONS.md`
   - `PRODUCT_BRIEF.md`
   - v7.4 roadmap/prompts/manifest.

If current HEAD is newer than the planning anchor, inspect all intervening commits first.

## Current state that must be verified, not inherited blindly

```text
GATE_C_ACCEPTED = YES
GATE_C_RESOURCES_REMAINING = 0
NEXT_GATE = GATE_D
PUBLIC_MOBILE_CORE_LOOP = PROVEN_REMOTE
R16 = RELEASED/PROVEN
EMBEDDING_COMPLETE = YES at last terminal census
HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD
PUBLIC_SEMANTIC = DISABLED
CANONICAL_CITATION_CORRECTION = PASS
CITATION_BULK_APPLY = HOLD
MONITORING = DISABLED_NOT_READY
ECOURTS_OBSERVATION = 0 last verified
ADVOCATE_DESKTOP_WEB = DO_NOT_BUILD
PROMOTIONAL_WEBSITE = TEMPORARY_NONCORE
```

If current evidence changes one of these, report the exact newer evidence.

## Authority installation

Install into `docs/roadmaps/`:
- `LAWMIND_MASTER_ROADMAP_V7_4.md`
- `LAWMIND_SPRINT_PROMPTS_V5.md`
- `LAWMIND_V7_4_AUTHORITY_MANIFEST.json`
- `LAWMIND_V7_4_RECONCILIATION_MEMO.md`

Create/update:
- `docs/CURRENT_STATE.md`

Do not delete v7.2/v7.3 historical files.

## Bootstrap repair

Update only the minimum repo bootstrap/orchestration text necessary so a fresh agent does not resurrect old topology or stale product scope.

Inspect and amend where required:
- `AGENTS.md`
- `CLAUDE.md`
- `docs/CURRENT_PLAN.md` header/current pointer
- `docs/LANE_PROTOCOL.md`
- `docs/LANE_BUS.md`
- hooks/scripts that validate lane names
- owner maps in `BUILD_GUIDE.md` or equivalent.

Required active names:

```text
SHIP
DATA
RED
```

Historical LCC/RCC/NEW1/NEW2/NEW3/FIFTH/AUDIT-RO messages remain valid provenance.

## Scope corrections that must land

1. Mobile-only advocate product; no new advocate desktop/web.
2. Promo website is temporary marketing only and will be rebuilt after application completion.
3. Compliance URLs are stable release contracts and are not the promo-site architecture.
4. Current v1 scope comes from current capability registry + accepted Gate-C product, not stale briefing/drafting language in old bootstrap.
5. Fewer agents does NOT mean fewer programs.

## Founder actions

Do not rotate secrets yourself.

Surface:
- DO token rotation due
- Resend key rotation due
- Spaceship key/secret rotation due
- R2 backup encryption key escrow due.

## Carried reliability items

Ensure current state explicitly carries:
- deployment provenance N-2
- cold-query sizing N-3
- manual prewarm N-4
- env mismatch N-5
- full-suite UNKNOWN N-6
- body-validation/auth ordering N-7
- accessibility N-8
- release-build flag evidence N-9
- corpus rollback empties `matter_authorities`.

## Output artifacts

Create:
- `docs/ai/ship-s4-t0/TRANSITION_SEAL.md`
- machine-readable state matrix
- old→new owner map
- actionable founder queue summary.

Final table:

```text
HEAD_START =
HEAD_FINAL =
COMMITS =
V7_4_AUTHORITY_HASH = PASS/HOLD
CURRENT_STATE_CREATED = YES/NO
OLD_AGENT_BOOTSTRAP_RETIRED = YES/NO
MOBILE_ONLY_SCOPE_RECORDED = YES/NO
PROMO_WEB_NONCORE_RECORDED = YES/NO
COMPLIANCE_WEB_CONTRACT_RECORDED = YES/NO
GATE_C_ACCEPTED =
GATE_C_INFRA =
NEXT_GATE =
EMBEDDING =
HNSW =
CITATION_CORRECTION =
CITATION_EDGE_APPLY =
ECOURTS =
MONITORING =
FOUNDER_SECURITY_ACTIONS =
PRODUCT_DIRT =
UNKNOWN =
BLOCKERS =
```

Final line:

`V7_4_TRANSITION_SEAL = PASS`

or a precise HOLD.
```

---

# 2. DATA S4-D0 — CURRENT CONTINUITY / DATA-TRUTH CENSUS
## Run after transition seal. Read-mostly. No broad new experiments.

```text
AGENT = DATA
MODES = CORPUS + LEGAL_TRUTH + RETRIEVAL
MUTATION = NONE unless a standing incremental worker already owns its normal writes
NEW CANONICAL MUTATION = NO
NEW HNSW = NO
PUBLIC CAPABILITY CHANGE = NO
```

## Objective

Replace stale counts with one current bounded continuity receipt and prove standing data work is healthy.

## Preflight

- re-anchor HEAD;
- read `docs/CURRENT_STATE.md`;
- inspect DATA logical jobs;
- inspect scheduler + durable receipts;
- preserve healthy workers.

## Measure

### HC/SCI
- current judgment count by major source/court class as already supported;
- newest upstream/held dates where existing tooling supports it;
- accounted vs held;
- source-failure clusters;
- SCI current running path and authorization basis;
- do not call direct SCI grant resolved unless evidence says so.

### Citation
- verify R24 539 correction receipt remains intact;
- current dirty-key count;
- current edge/candidate/apply state;
- bulk apply must remain HOLD absent a new authorized round.

### Statutes
- recensus raw refs and resolver-confirmed classes using existing bounded tooling;
- do not create links.

### Embeddings
- incremental queue watermark;
- oldest pending;
- unnamed residual;
- one-GPU-writer state;
- scheduler mode;
- do NOT rerun expensive full-vector integrity unless evidence says it is needed.

### Model backup
- confirm exact model manifest/off-machine copy reference is still available;
- revision may remain UNKNOWN.

### eCourts
- report current observation count;
- last successful/failed source-state class;
- do not spend live quota unless a separately authorized bounded experiment exists.

## Scheduler handoff

If the delta queue is still Interactive/Logon-only:
send SHIP an actionable OPS handoff specifying exactly what host-level scheduler change is needed.
DATA does not silently modify unrelated host scheduling.

## Output

`docs/ai/data-s4-d0/CONTINUITY_RECEIPT.md`

Final:

```text
CORPUS_CONTINUITY =
SCI_RUNNING_BASIS =
CITATION_R24_RECEIPT =
CITATION_BULK_APPLY =
STATUTE_CURRENT_STATE =
EMBEDDING_INCREMENTAL =
OLDEST_PENDING =
UNNAMED_RESIDUAL =
ONE_GPU_WRITER =
DELTA_SCHEDULER =
ECOURTS_OBSERVATIONS =
MONITORING =
DATA_BLOCKERS =
```

No feature recommendation unless supported by the measurements.
```

---

# 3. SHIP S4-R0 — PERSISTENT BETA HOSTING PRE-FLIGHT / SPEND PACKAGE
## No provisioning in this prompt.

```text
AGENT = SHIP
MODES = OPS + SERVER + RELEASE
CLOUD MUTATION = NO
PAID RESOURCE CREATION = NO
```

## Objective

Produce the smallest reliable persistent beta topology that can stay online through Gate D, the staged **~100-lawyer private beta** (A2, roadmap §16), Gate E and store review.

> **A2, 19 September 2026 — what changed in this prompt.**
>
> - **Cohort sizing.** `10–30 advocate closed beta` is superseded by
>   `~100-lawyer staged private beta`. **Do not assume all 100 are concurrent** —
>   estimate concurrency separately and state the assumption you priced.
> - **Price from the serving dataset.** `SERVING DATASET ≈ 250 GB` is the base
>   pricing number. `LOCAL DATABASE ≈ 343 GB` includes research and probe tables
>   that do not serve; quoting it without naming those exclusions overstates the
>   requirement. Both figures are DATA S4-D0 measurements — do not re-measure.
> - **Release pack.** Accept S4-D0: `PACK3_REUSE_CANDIDATE = YES`,
>   `PACK3_FULL_INTEGRITY = NOT_YET_PROVEN` (manifest hash, 8/8 files, 8/8 byte
>   lengths and schema lineage match; payload sha256 not revalidated). Hash the
>   72.6 GiB **only when this round or S4-R1 actually needs the pack**.
> - **Collation is correctness, not cost.** Source DB is PostgreSQL 18.6, UTF8,
>   `English_United States.1252`. `WINDOWS_LINUX_COLLATION_EQUAL = NO`. **Never
>   describe a Linux restore as identical.** Price and plan either proving the
>   collation-dependent search/index behaviour on the target Linux environment or
>   rebuilding the affected indexes.
> - **No spend follows this prompt.** Roadmap §13.1.1 Stage A applies: after
>   delivering the package, return to local candidate closure rather than idling
>   against a pending hosting decision. `PROVISIONING_AUTHORIZED = NO`.

## Inputs

Read:
- Gate-C DO measured cost/topology
- R32B release pack/restore receipts
- teardown receipt
- current dataset sizes
- Gate-C cold-query finding
- current user DB backup size/state
- current provider options if using external research.

Do not assume DigitalOcean is automatically the final provider merely because Gate C passed there.

## Requirements

Compare at least:
- the proven Gate-C-equivalent topology;
- one materially cheaper topology if credible;
- one higher-memory corpus option if it meaningfully addresses cold-query risk.

For each:
- region;
- vCPU/RAM/disk;
- storage architecture;
- private networking;
- expected hourly/monthly cost;
- restore duration estimate grounded in Gate-C measurements;
- backup cost;
- prewarm/restart behavior;
- expected search/cold-query risk;
- migration effort;
- teardown/recovery plan.

Preserve split CORPUS and USER roles.

The founder workstation must not serve public beta.

## Release-pack reuse

Check whether `D:\lawmind-release-r32b\pack3` is still lineage-valid.

If valid, prefer reuse.
If stale, specify the minimum delta/full release work required.

No export merely for tidiness.

## Security

New beta deployment must use **rotated** credentials, never the old Gate-C credentials after founder rotation.

## Output

`docs/ai/ship-s4-r0/BETA_HOSTING_DECISION_PACKAGE.md`

Final:

```text
RECOMMENDED_TOPOLOGY =
ALTERNATIVE =
EST_MONTHLY_COST =
EST_INITIAL_RESTORE =
COLD_QUERY_RISK =
RELEASE_PACK_REUSABLE =
FOUNDER_SPEND_REQUIRED =
MAX_INITIAL_SPEND_REQUEST =
MAX_MONTHLY_SPEND_REQUEST =
PROVISIONING_AUTHORIZED = NO
```

End with one bounded founder decision request.
```

---

# 4. SHIP S4-R1 — PERSISTENT BETA PLANE + PRE-BETA RELIABILITY
## Run only after explicit founder spend authorization.

> **A2 two-stage spend gate, 19 September 2026 (roadmap §13.1.1).** S4-R0 delivering
> a cost package does **not** start this prompt. Stage A comes first: close
> everything that does not require a persistent public backend, until
> `PRIVATE_BETA_CANDIDATE_LOCAL = READY_EXCEPT_REMOTE_ONLY_PROOF`. Only when the
> remaining blockers genuinely require remote infrastructure does SHIP request the
> spend, and then provision the **smallest** environment that can support final
> remote acceptance, the staged ~100-lawyer private beta and Gate-E evidence.
> No standing cloud months before the candidate needs them.
>
> Carry from S4-R0: `WINDOWS_LINUX_COLLATION_EQUAL = NO`. Prove the required
> collation-dependent search/index behaviour on the target Linux environment, or
> rebuild the affected indexes. A restore is not "identical" because it completed.

```text
AGENT = SHIP
MODES = OPS + SERVER + RELEASE
DEPENDENCY = explicit founder remote-spend authorization
```

## Objective

Stand up the persistent beta/review environment and close the reliability defects that cannot be carried into a 10–30 advocate beta.

## Required infrastructure

- public HTTPS API;
- split CORPUS / USER DBs;
- private DB networking;
- auth/mail;
- release identity;
- backup/restore;
- release/rollback;
- readiness;
- cost ledger;
- no founder-workstation dependency.

## Must close before BETA_READY

### A. Deployment provenance
`/version` contains trustworthy:
- SHA;
- deployedAt;
- artifact/image/package digest or equivalent;
- release id;
- environment.

### B. Environment label
`/version` and `/ready` agree.

### C. Prewarm/readiness
No unattended restart silently enters "ready" while predictably cold and outside accepted behavior.
Automate prewarm or gate readiness, or prove cold performance satisfies the contract.

### D. Matter-authority rollback
Prove corpus release/rollback does not delete or orphan USER `matter_authorities`.

### E. Full API suite
One quiet-window current full suite.
Record exact pass/fail/skip and classify any failure.
Do not loop a timing test until green.

### F. Review access
Implement `REVIEW_ACCESS_V1`.
No real client data.
No broad privilege.
Document Apple/Play review steps.

### G. Auth
Re-prove magic-link handoff after deployment.

### H. Backup
Take/verify current USER backup + restore.
Corpus restore receipt bound to release.

### I. Real alert delivery (A1, roadmap §13.5)
Inject one bounded synthetic alert condition and prove
condition detected → rule fired → dedup/cooldown → human notification delivered.
Record channel + timestamps, never secret values.

## Search

Run frozen Gate-S1 and one bounded cold-query diagnostic.
Do not change the gate thresholds in the same round.

## Acceptance

```text
PERSISTENT_BETA_API =
SPLIT_DB =
PROVENANCE =
ENVIRONMENT_LABEL =
PREWARM_READINESS =
MATTER_AUTHORITIES_ROLLBACK =
FULL_API_SUITE =
REVIEW_ACCESS =
AUTH =
ALERT_DELIVERY =
USER_BACKUP_RESTORE =
CORPUS_ROLLBACK =
GATE_S1 =
PUBLIC_SEMANTIC = DISABLED
```

Do not invite beta users until:

`PERSISTENT_BETA_READY = YES`
```

---

# 5. SHIP S4-R2 — GATE-D MOBILE / ACCESSIBILITY / STORE PASS

```text
AGENT = SHIP
MODES = CLIENT + SERVER + RELEASE + PRODUCT
NO MAJOR NEW FEATURES
```

## Physical devices

Required:
- current physical iPhone;
- representative low/mid Android;
- Galaxy S24 affected-row regression.

Use persistent beta public HTTPS. No localhost/ADB transport for network proof. USB may be used for install/log capture.

## Flow on each required device

- auth/deep link;
- Search exact;
- Search lexical;
- truthful broad-query refusal;
- Reader;
- source/provenance;
- Save;
- Matter;
- relaunch/refetch;
- deletion;
- account/settings.

## Stress/quality

- large judgment;
- max practical text scaling;
- VoiceOver/TalkBack;
- selection/checked states;
- reduced motion;
- safe areas/system bars;
- poor network;
- transient loss;
- background/resume;
- session expiry/recovery;
- no false absence.

Close N-8.

## Store builds

Android:
- actual release targetSdk 36+;
- AAB/internal track;
- non-debuggable/standalone observed.

iOS:
- actual build/archive;
- Xcode26+;
- iOS26 SDK+;
- signing/TestFlight path.

Tablet:
- choose `supportsTablet=false` OR prove tablet support.
Do not leave accidental support.

iOS party search:
- default OFF unless a newer explicit decision exists;
- exact identity still works;
- visible truthful degrade.

## Deletion / compliance

- in-app deletion on persistent beta;
- identity-only account;
- stable external delete resource;
- privacy/support URLs;
- these are compliance endpoints, not a promo-site redesign.
- (A1) the external resource authenticates through `EXTERNAL_DELETE_AUTH_V1`
  (`docs/EXTERNAL_ACCOUNT_DELETION_WEB.md` §3.3), lives in `lawmind/lawmind-site`, and reuses
  `POST /me/data-requests {kind:'erasure'}`. Do not make the R33 mobile landing configurable.
  This is an auth/deletion CCR, so it is high risk: roadmap §3.7, RED_READ_ONLY where useful.

## Accounts (A1, roadmap §14.14)

Measure every Apple / Google Play / EAS row. Mark each VERIFIED, FOUNDER_CONFIRMED or UNKNOWN.
Keep EAS project/build readiness separate from the push feature.
Record the values in `docs/product/STORE_RELEASE_CHECKLIST_V1.md` §0.

## Security (A1, roadmap §14.15)

Evidence every `SECURITY_RELEASE_BASELINE` row from code/config/runtime. None FAIL, none UNKNOWN.

## Store pack

- real screenshots;
- current capabilities only;
- no draft/briefing/semantic/monitoring claims;
- actual data-safety state;
- reviewer access instructions.

## Output

`docs/ai/ship-s4-r2/GATE_D_PRODUCT_MATRIX.md`

Final state per row: PASS/FAIL/HOLD/UNKNOWN.
```

---

# 6. SHIP S4-R3 — STAGED ~100-LAWYER PRIVATE BETA (A2)

```text
AGENT = SHIP
MODE = PRODUCT / RELEASE
DEPENDENCY = PERSISTENT_BETA_READY + APK_DISTRIBUTION_CONTRACT (roadmap §16.3)
DISTRIBUTION = DIRECT SIGNED ANDROID APK
PLAY_STORE_PUBLICATION = NOT REQUIRED
APP_STORE_PUBLICATION  = NOT REQUIRED
```

> **A2, 19 September 2026.** The 3–5 advocate shadow beta as a separate programme is
> **superseded**. There is one private beta of ~100 already-contacted practising
> lawyers, staged internally. Wave 0 replaces the shadow beta's role — it is a canary
> **inside the same programme**, not a second project. Do not stand up separate
> infrastructure, separate recruitment or a separate candidate line for it.

## Objective

Establish the product baseline the old Sprint-3 plan expected but current Gate-C
acceptance does not clearly evidence — and do it inside the real private beta.

## Wave structure

```text
WAVE 0 — CANARY  ~5 lawyers from the SAME contacted cohort
  installation · APK signing and download · auth · basic core loop ·
  crash / ANR / OOM · telemetry · support path ·
  catastrophic trust or safety defects

        ↓  FREEZE metric definitions and severe-defect definitions HERE

WAVE 1  ~20–25 total
  capacity · support load · retrieval behaviour · poor network ·
  device diversity · research workflow

        ↓

WAVE 2  expand toward ~100 lawyers
```

The wave count may be adjusted from evidence; the principle may not — small canary
first, same environment, same cohort, same candidate line.

**Do not tune success definitions after seeing the full ~100-person cohort.**

## Release candidate

Before inviting anyone, the roadmap §16.3 APK release contract must be satisfied in
full: signed **release** APK (never a debug build), package identity, version code,
version name, build/commit SHA, APK sha256, release id, environment id, HTTPS
download source, install and upgrade instructions, rollback to a previous good APK,
changelog, crash/error observability, support and feedback path.

## Cohort

Use `docs/product/RESEARCH_TASK_SET_V1.json`.

Do not coach users.

For each task record:
- task id;
- start/end;
- query reformulations;
- authority opened;
- source opened;
- treatment/currentness checked;
- saved to matter;
- task completed;
- another DB used;
- why;
- time to usable authority;
- trust confusion;
- resume/reconstruction friction.

A2 additions to the per-task record: time to **verified** useful authority ·
evidence / passage inspection · currentness and treatment inspection ·
matter linkage · freshness confusion · **authority-currentness corrections found by
users** · auth failure · search latency · poor-network failure · support incidents.

Do not choose thresholds before observing Wave 0.

After Wave 0, and BEFORE Wave 1 begins:
- freeze RTC baseline/threshold definition;
- freeze another-DB classification;
- freeze severe-trust-confusion definition;
- freeze the severe-defect definition;
- freeze beta measurement protocol.

Monitoring:
- read all twelve conditions;
- absent newer evidence, keep Shape B.
Do not make eCourts a reason to delay research beta.

Output:
`docs/product/SHIP_S4_PRIVATE_BETA_BASELINE.md`

Final:
```text
WAVE =                      (0 | 1 | 2)
LAWYERS_INVITED =
LAWYERS_INSTALLED =
APK_SHA256 =
RELEASE_ID =
TASKS =
RTC_BASELINE =
TIME_TO_VERIFIED_AUTHORITY =
CRASH_ANR_OOM =
SUPPORT_INCIDENTS =
ANOTHER_DB_RATE =
TIME_TO_AUTHORITY =
TRUST_CONFUSION =
RESUME_FRICTION =
THRESHOLDS_FROZEN =
MONITORING_12 =
LAUNCH_SHAPE =
```
```

---

# 7. SHIP — GATE D CONVERGENCE

Run only after S4-R1/R2/R3 evidence exists.

Gate D checklist:

```text
PERSISTENT_BETA_READY
IPHONE_PHYSICAL
LOW_MID_ANDROID_PHYSICAL
HIGH_END_ANDROID_REGRESSION
ACCESSIBILITY
LARGE_JUDGMENT
POOR_NETWORK
BACKGROUND_RESUME
DELETION_IN_APP
EXTERNAL_DELETE_RESOURCE
PRIVACY_SUPPORT_URLS
REVIEW_ACCESS
ANDROID_API36_ARTIFACT
IOS_XCODE26_IOS26_BUILD
TABLET_STATE
IOS_PARTY_SEARCH_STATE
PRODUCTION_PROVENANCE
ENV_LABEL
MATTER_AUTHORITY_ROLLBACK
FULL_API_SUITE
STORE_PACK
COMMERCE_DECISION
MONITORING_CLAIMS
PLATFORM_CAPABILITY_PARITY
PRIVATE_BETA_THRESHOLDS          (A2: frozen after Wave 0, replaces SHADOW_BETA_THRESHOLDS)
STORE_ACCOUNT_READINESS          (A1)
SECURITY_RELEASE_BASELINE        (A1)
ALERT_DELIVERY                   (A1)
EXTERNAL_DELETE_AUTH_V1          (A1)
ANDROID_RELEASE_APK              (A2)
APK_DISTRIBUTION_CONTRACT        (A2, roadmap §16.3)
CANARY_WAVE_READY                (A2, roadmap §16.1)
PRIVATE_BETA_TELEMETRY           (A2)
BACKUP_RESTORE                   (A2)
```

> **A2 reclassification, 19 September 2026 (roadmap §14.13.1).** `STORE_PACK` above,
> and the Play/App Store submission rows, are **moved to public-store readiness** and
> are **not** blockers for the ~100-lawyer APK private beta. Deferred is not
> abandoned: iOS physical and product work, `STORE_ACCOUNT_READINESS` and the Apple
> build proof stay in the roadmap and move with the store work. Do not record them as
> cancelled, and do not re-add them to the APK-beta blocker set.

Commerce:
founder must explicitly choose:
`FREE_BETA` or `PAID_V1`.

**A2:** billing, IAP and Play Billing are **NOT REQUIRED** for the private beta
(roadmap §15.4). The commerce choice binds on the public-release path (§17.0), so a
pending choice is **not** a Gate-D HOLD against the APK beta. It remains a HOLD
against public release, and is never an invented default.

No RED required.

Output:
`GATE_D = PASS|HOLD|FAIL`
```

---

# 8. DATA — OPTIONAL CITATION EDGE ROUND
## Not Gate-D critical path.

Only run when founder/SHIP prioritizes citation graph advancement.

DATA:
- regenerates/freezes current candidate population;
- binds hashes/frontier/source spans;
- no edge writes.

Then RED_READ_ONLY:
- independently attacks alias uniqueness;
- common-order/source furniture;
- cross-court targets;
- self-identity;
- source damaged;
- concentration/fan-in;
- target-holder correctness;
- false pins.

Only after RED PASS may DATA prepare a distinct apply decision.

`CITATION_BULK_APPLY` stays HOLD until then.
```

---

# 9. DATA — OPTIONAL HNSW OFFLOAD ROUND
## Not Gate-D critical path.

Only if explicitly prioritized and a high-memory host is authorized.

Preconditions:
- terminal/current snapshot census;
- exact model files;
- adequate memory;
- one writer;
- no user semantic reachability.

Build using existing guarded script.
Evaluate exact vs ANN.
Do not enable public semantic.

Output:
`HNSW_BUILT` and evaluation evidence only.
Public enablement is a separate SHIP/product decision.
```

---

# 10. SHIP — SPRINT 5, AFTER THE PRIVATE BETA (A2)

Dependency: Gate D PASS.

> **A2, 19 September 2026.** The separate 10–30 advocate closed beta is
> **superseded** by §6's staged ~100-lawyer private beta. This prompt is now the
> **post-private-beta public-release path**; its measurement list applies to the
> private-beta cohort, not to a second recruitment round.

```text
PRIVATE BETA EVIDENCE → PRODUCT / DATA CORRECTIONS → RED GATE E → CANDIDATE FREEZE
→ IOS FINAL PHYSICAL / RELEASE PROOF + ANDROID AAB / PLAY RELEASE PROOF
→ STORE PACKS → PLAY / APP STORE SUBMISSION → PUBLIC RELEASE
```

Store work accelerates **only once private-beta evidence says the product deserves
to ship**. The `LAUNCH_COMMERCE = FREE_BETA | PAID_V1` decision binds here.

Use frozen threshold definitions from **Wave 0** of the private beta.

Measure:
- RTC;
- another-DB rate;
- time to authority;
- false premise handling;
- search refusal comprehension;
- source/treatment understanding;
- save/matter retention;
- auth/support friction;
- crashes;
- resume friction.

Do licensed competitor benchmark only.

Do not change thresholds after seeing beta results.

Decision outputs:
```text
RESEARCH_SESSION_V1 = PROMOTE|DEFER
EVIDENCE_LOCKED_SYNTHESIS_EXPERIMENT = RUN|DEFER
```

No automatic implementation.
```

---

# 11. RED — GATE E
## Fresh independent session. Formal audit.

```text
AGENT = RED
MODE = RED_GATE
MUTATION = NO
```

Read:
- v7.4 authority
- Gate D receipt
- frozen beta evidence
- exact store candidate
- current capability registry
- live review environment
- DATA latest continuity receipt.

Attack:
1. release identity/build provenance;
2. physical device/build-policy proof;
3. Auth→Search→Reader→Save→Matter;
4. ambiguity/refusal/source/currentness;
5. deletion in-app + external;
6. reviewer access;
7. split DB/backup/restore/rollback;
8. R16 idempotency;
9. `matter_authorities` preservation;
10. no public semantic/drafting/upload/monitoring/statute leak;
11. iOS party-search state;
12. store claims <= capabilities;
13. privacy/data-safety truth;
14. no static cadence claim without runtime evidence;
15. current beta thresholds/results not massaged after observation;
16. no P0 security/data issue;
17. (A1) every SECURITY_RELEASE_BASELINE row;
18. (A1) EXTERNAL_DELETE_AUTH_V1: no existence oracle, no broad bypass, R33 redirect intact;
19. (A1) alert delivery reached a human.

Do not audit the promotional site's design.
Only validate stable compliance URLs and any actual launch claims the founder has chosen to publish.

Final:
`GATE_E = PASS|HOLD|FAIL`
```

---

# 12. SHIP — CANDIDATE FREEZE / SUBMISSION

Dependency: Gate E PASS.

Freeze:
- mobile candidate;
- API contract;
- capability registry;
- remote release;
- store listing;
- screenshots;
- review notes;
- privacy/data safety;
- commerce.

Keep review backend live.

No major feature after freeze.

Promotional website may be rebuilt after candidate stability using final claims, but does not block candidate engineering beyond required compliance URLs.

Final:
```text
CANDIDATE_FROZEN =
APP_STORE_SUBMITTED =
PLAY_SUBMITTED =
REVIEW_BACKEND_LIVE =
REVIEW_ACCESS_VERIFIED =
COMPLIANCE_URLS_LIVE =
```
