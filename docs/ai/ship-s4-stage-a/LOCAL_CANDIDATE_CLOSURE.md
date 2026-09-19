# SHIP S4-R0X — STAGE-A LOCAL CANDIDATE CLOSURE

```text
AGENT  = SHIP   ·  LANE BOUND: .agents/bus/.lane-a7e90288…
DATE   = 19 September 2026
ROUND  = S4-R0X — A2 execution-seam correction → S4-R0 → Stage-A acceleration

HEAD_START = 69c4c8aaa98fe7dc33c28de8bfed790615d7da76   (== origin/main, == expected)
HEAD_FINAL = c29a90a3 (this receipt) — §1
COMMITS    = 12

PAID_RESOURCE_CREATED   = NO
CLOUD_PROVISIONED       = NO
PROVISIONING_AUTHORIZED = NO
CLOUD_API_CALLED        = NO
```

**This round did not reach `READY_EXCEPT_REMOTE_ONLY_PROOF`, and §50 forbids using
that phrase as a convenient way to stop.** The exact remaining locally-actionable
blockers are named in §12. Everything claimed closed below was observed, and
everything not attempted says so.

---

## 1 · Commits

```text
a9f88638  docs(ship-s4-r0x): A2 said it, the prompts did not do it
717eaf13  docs(ship-s4-r0): the restore we called unknown was measured three days ago
2eaf6049  fix(api): close N-7 — the schema walk ran before the 401
a8c97df3  fix(mobile): close N-8 — the chips were selected everywhere except the a11y tree
8f0d053d  docs(ship-s4-r0x): the delta queue's principal — measured, prepared, not guessed
ee7e03cc  fix(api): close N-5 and N-2's mechanism — two sources for one question
d741c48d  fix(api): close N-4 — warm the corpus, and make readiness wait for it
8a2f0a84  fix(api): the signups kill switch controlled nothing, and now it does
4301bcae  test(api): N-7's two casualties were tests asserting the old ordering
455eddd8  refactor(api): drop a dead parameter from the prewarm timeout
d1e5bfaf  fix(ops): the cascade guard counted tables, not the rows it would destroy
c29a90a3  docs(ship-s4-stage-a): the closure receipt, and it says HOLD
```

`HEAD_FINAL = c29a90a3`, the commit carrying this receipt. A receipt cannot
contain its own hash, so this line was filled in by a follow-up that changes
nothing else.

30 files, **+4,962 / −338**. Exact-path staging throughout; no `git add .`, no
`-A`, no `commit -a`, no reset, no checkout over foreign work. The authoritative
list is `git log --grep="ship-s4-r0x"` plus the five `fix(api)`/`fix(mobile)`
commits above.

---

## 2 · Phase 0 — the A2 execution seam

```text
A2_EXECUTION_SEAM_CORRECTED = YES   (a9f88638)
NEW_AMENDMENT_CREATED       = NO — not A3, not v7.5
A1_A2_HISTORY_PRESERVED     = YES — verified byte-for-byte against `git show HEAD:`
```

A2's classification was right; the **execution** documents had not followed it. A
next agent reading Sprint Prompts v5 literally — which is how a fresh session
reads — would have implemented `REVIEW_ACCESS_V1` before `PERSISTENT_BETA_READY`,
proved A1's end-to-end alert delivery before the beta, and run S4-R2 as a store
submission pass sitting in front of the APK beta. The Gate-D checklist was worse:
it mixed both sets into one list, so it had more than one honest reading.

**Two rows joined the private-beta critical set**, because both are beta
operability items that had no row anywhere and would have been nobody's job:
`PREWARM / READINESS` (N-4) and `SECURITY BETA BASELINE`.

**Four moved to the public-store set**, each for a stated reason:
`REVIEW_ACCESS_V1` (a reviewer account is what a store needs; an invited advocate
is not a reviewer) · `STORE ACCOUNT READINESS` · `EXTERNAL_DELETE_AUTH_V1` (Play's
*externally-initiated* deletion requirement — `IN_APP_DELETION` stays beta-critical
and the external contract is not weakened by one word) · and A1's `ALERT DELIVERY`
proof.

That last one carries the reason that decides it: the five `alerts.*` /
`monitoring.*` / `briefing.*` rows the proof would exercise are all
`DISABLED_NOT_READY` and must stay so for the beta, so making the proof a blocker
would mean **enabling a disabled capability to satisfy a readiness gate**. Exactly
backwards. What the beta needs instead is operator observability — crash/error,
server health, support escalation — which is `PRIVATE_BETA_TELEMETRY`.

```text
IOS_PRODUCT        = IN_SCOPE
IOS_PUBLIC_RELEASE = IN_SCOPE
IOS_STORE_SUBMISSION_BEFORE_ANDROID_PRIVATE_BETA = NO
IOS_PHYSICAL_ACCEPTANCE = PUBLIC_RELEASE_REQUIREMENT · NOT_ANDROID_APK_BETA_BLOCKER
DEFERRED_IS_NOT_CANCELLED = recorded in roadmap §14.13.2 and prompts §10
```

Roadmap §14.13.1 amended, **new §14.13.2** records the whole correction, prompts
§4/§5/§7/§10 corrected to match, §5 retitled to the private-beta mobile quality /
release pass. Manifest hashes recomputed through the existing mechanism as
`amendments[1].executionCorrections[0]` — no second authority architecture.

```text
authority:check  worktree 79/79 PASS   ·   HEAD tree 78/78 PASS
```

78/78 is the pass at HEAD: the one skipped check is the tracked-bus-message scan,
which the script skips without a real `.git`, as its own comment says.

---

## 3 · Phase 1 — SHIP S4-R0

```text
S4_R0_PACKAGE = docs/ai/ship-s4-r0/BETA_HOSTING_DECISION_PACKAGE.md   (717eaf13)

RECOMMENDED_TOPOLOGY = DigitalOcean so-4vcpu-32gb (CORPUS)
                       + s-2vcpu-4gb (API/USER) + Cloudflare R2
EST_MONTHLY_COST     = USD 287.17
EST_INITIAL_RESTORE  = 10 h 20 m calendar · USD ~4.40 of compute
COLD_QUERY_RISK      = MODERATE at 32 GiB — bounded by admission, and resizable
RELEASE_PACK_REUSABLE = YES

MAX_INITIAL_SPEND_REQUEST = USD 450
MAX_MONTHLY_SPEND_REQUEST = USD 550
PROVISIONING_AUTHORIZED   = NO
```

Cheaper than Gate C's USD 350/month for the same vCPU and the same RAM, for two
arithmetic reasons: Gate C ran the legacy `so1_5` variant with 900 GiB of NVMe,
and DigitalOcean caps bundled hourly billing at **672 hours**, not 720 — which the
roadmap's `$0.52083/hour` line has never been multiplied out.

Three architectures compared and no more, as instructed. Hetzner Singapore CCX33
is priced honestly at USD 205.99 and **declined**: it moves 269 GB off local NVMe
onto network volumes, against the exact phase that is 96.7% of the worst case, and
every Gate-C provisioning and teardown script is DigitalOcean-resource-id specific
— the tooling that reached 7/7 `DELETED_VERIFIED` and recurring USD 0. USD ~25 a
month against re-proving the exit path is the trade §13 forbids.

### Three corrections the evidence forced

1. **`PACK3_FULL_RESTORE_DURATION` was not unknown.** `full-export.json` and
   `full-restore-activation.json` both carry `releaseVersion 2026-09-17.mu4rlyak`,
   which is pack3's, and the restore verified row counts that are pack3's manifest
   rows exactly across all eight tables. So the Gate-C 10h20m **was** a full pack3
   restore: 10 h 19 m 42 s. What stays genuinely unknown is the `D:`→host transfer,
   which that figure excludes, and whether the `D:` copy is still the copy that
   shipped — and on the latter, Gate C verified all eight per-file sha256 on the
   host copy before loading, so the manifest values are known-good as authored.
2. **DigitalOcean's 672-hour cap.** Gate C was USD 350/month, not the USD 375 that
   `$0.52083 × 720` implies.
3. **REINDEX after restore is moot.** The restore is `COPY FROM` with indexes
   already present from migrations, so every btree was built on Linux under Linux
   collation as rows were inserted. `WINDOWS_LINUX_COLLATION_EQUAL = NO` remains
   binding and unproven — it is a **semantics** difference, and the bounded
   behavioural equivalence suite is the proof, not a rebuild. Recorded so that
   changing to a physical restore mechanism re-opens it deliberately.

### The sizing finding that decides the memory question

Measured fresh, because no accepted receipt contained it:

```text
SERVING SET          269.1 GB  =  215.0 GB heap  +  54.1 GB index
HOT INDEX WORKING SET ≈ 24.6 GB, of which judgments_full_text_idx is 17.71 GB
GATE-S1 WORST CASE    3,298 ms total, of which `sparse` is 3,190 ms (96.7%)
```

At 32 GiB that index set is resident only if essentially nothing of the 215 GB
heap is cached — which is exactly the observed fast-warm / slow-cold profile. So
the 64 GiB option is **justified by measurement**, and it is still a hypothesis, so
it is a contingency rather than the starting point, with the diagnostic that would
refute it written down: if `sparse` time is GIN posting-list scan rather than page
faults, RAM buys nothing.

The restore's dominant cost points the opposite way to intuition and is recorded
for S4-R1: `judgment_paragraphs` moved 39.13 GB compressed in 1 h 03 m while
`judgments` moved 37.48 GB — **less** — in 7 h 51 m, because
`judgments.full_text_tsv` is `GENERATED ALWAYS AS to_tsvector` and the 17.71 GB GIN
over it is maintained inline. One backend, one core. **More vCPU does not shorten
it.**

---

## 4 · Stage-A acceptance matrix

```text
A2_EXECUTION_SEAM_CORRECTED     = PASS            a9f88638

DELTA_SCHEDULER                 = NOT_DONE        founder-only, one consent click
REBOOT_WITHOUT_LOGIN_PROOF      = NOT_PERFORMED   deliberately — §5

PRIVATE_BETA_SIGNUP_STATE       = RESOLVED        §6

N7_AUTH_BEFORE_VALIDATION       = PASS            2eaf6049
N8_ACCESSIBILITY                = PASS            a8c97df3
N9_RELEASE_BUILD                = NOT_ATTEMPTED   §12

ANDROID_RELEASE_APK             = NOT_ATTEMPTED   §12
APK_SHA256                      = NONE
APK_SIGNING                     = NOT_ASSESSED

DEPLOYMENT_PROVENANCE_TOOLING   = PASS (local)    ee7e03cc — N-2 mechanism
ENVIRONMENT_LABEL_CONTRACT      = PASS            ee7e03cc — N-5 closed
PREWARM_READINESS_TOOLING       = PASS (local)    d741c48d — N-4 mechanism

MATTER_AUTHORITIES_ROLLBACK     = PASS (local)    d1e5bfaf + existing — §4.1
FULL_LOCAL_API_SUITE            = PASS            §7 — 1333/1329/0/4

LARGE_JUDGMENT                  = NOT_ATTEMPTED   §12
LOCAL_NETWORK_LIFECYCLE         = NOT_ATTEMPTED   §12

IN_APP_DELETION                 = NOT_RE-VERIFIED §12
SECURITY_LOCAL_BASELINE         = PARTIAL         §8
PRIVATE_BETA_TELEMETRY          = NOT_ATTEMPTED   §12

CAPABILITY_CLAIM_PARITY         = PASS            §9

PUBLIC_SEMANTIC      = DISABLED
CITATION_BULK_APPLY  = HOLD
MONITORING           = DISABLED_NOT_READY
```

### 4.1 · `matter_authorities` rollback — two halves, and neither needed cloud

§36 asks that a corpus release or rollback cannot **silently delete** or **orphan**
USER matter-authority references, and says to prove logical preservation without
cloud. Both halves are now closed locally, and the investigation started by
checking what already existed rather than by building.

**Cannot silently DELETE — closed this round (`d1e5bfaf`).** `cascade-guard.ts`
already computed, transitively from `pg_constraint`, every table a
`TRUNCATE ... CASCADE` over the release would also empty, and
`release-restore-cli.ts` already refused before the first `TRUNCATE`. Sound, with
one weakness: **it named tables, never rows**, so a corpus-only target carrying
empty copies of the user tables and a shared database holding an advocate's saved
authorities produced a byte-identical refusal cleared by the same flag.

Gate C's own trace shows it: `cascade_guard_refused` with 12 victims, then
`cascade_guard_overridden` by `--allow-cascade-into`. That was correct — those 12
were empty — and it is exactly the problem. An operator trained by routine
restores to clear this warning will clear it on the day it means "destroy thirteen
saved authorities". A warning that is usually noise is not a guard.

The decision now rests on rows: all victims empty → proceed, say so, **require no
override**; any victim populated → refuse and name the counts, worst first, and
`--allow-cascade-into` deliberately does **not** clear that case. Neither direction
breaks the Gate-C path — that restore would now proceed with no flag at all.

**Cannot ORPHAN — already covered, and verified passing in this round's run.**
`matters/authorities-corpus-split.test.ts` exercises the real thing against **two
real corpus generations**, and all eight ran (not skipped) in the full suite:

```text
✔ generation A carries the judgment and generation B does not
✔ saves normally while generation A is active
✔ under generation B the saved row reads back as an unavailable shell
✔ re-saving the SAME live row under B is the already-satisfied case, not a refusal
✔ saving a target absent from the active generation is 409, not 404, and writes nothing
✔ A → B → A hydrates the same row, with no duplicate and no rewrite
✔ a stranger gets the matter's 404, never the corpus verdict
```

An authority whose judgment is absent from the active generation reads back as an
**unavailable shell** rather than vanishing — which is the same rule the citation
harness applies to a citation: never silently dropped. Gate C proved the same
behaviour remotely (`changedTables []` across 87 USER tables through A→B→A).

```text
MATTER_AUTHORITIES_ROLLBACK_LOCAL = PASS
REMOTE_RESTORE_ROLLBACK_REPROOF   = S4-R1, as §36 itself assigns it
```

---

## 5 · The delta scheduler — measured, prepared, and honestly not done

```text
DELTA_SCHEDULER_S4U        = NOT_DONE
CUDA_IN_SESSION_0          = UNKNOWN — untested, and it decides which fix is right
REBOOT_WITHOUT_LOGIN_PROOF = NOT_PERFORMED
ONE_GPU_WRITER             = PRESERVED — nothing created, changed, enabled,
                             disabled or deleted; no second writer, no duplicate
                             trigger, no AtStartup writer, no logon launcher
```

`Lawmind-new1-delta-queue` is the only Lawmind task still on `LogonType
Interactive`; five siblings run `S4U`. It was registered `2026-08-29 09:44`, one
day before the 30 August sweep, and the sweep did not reach it.

**It was not flipped, and that is the substantive part.** `docs/ops/JOB_TABLE.md`
states the Interactive principal is *deliberate* — the GPU queue runs in a
signed-in session "so CUDA is available". That text is **uncommitted** working-tree
content and HEAD's copy of that file predates the entire S4U fix, so its
provenance could not be established from git. It may still be right. And if it is,
moving the task to S4U produces a job that fires, finds no CUDA, and embeds
nothing — **a task that looks alive while producing zero vectors**, strictly worse
than the honest hole it replaced.

So the claim gets measured before the production task is touched, and the probe is
committed rather than described: `scripts/ops/s4u-cuda-probe.cmd`. It loads no
model, starts no sidecar, opens no database connection and cannot become a second
writer; its throwaway task's trigger is a year out so a forgotten probe cannot fire
later.

Why SHIP could not answer it: `Register-ScheduledTask -LogonType S4U` returns
**"Access is denied."** unelevated — measured this session — and this session
cannot elevate. `Xerxus` is a local Administrator with a UAC-filtered token, so it
is a consent click and never a credential. One click.

The reboot proof was not attempted because rebooting would have killed the running
fleet and this session's own long work, and because it is meaningless before the
CUDA question answers. A **locked** session is explicitly not that test —
Interactive already survives a lock, which is how the defect hid.

No alarm was added: `job-health.mjs` already derives `boots` from the live
`LogonType`, already prints `UNATTENDED RECOVERY` every run, and already says "its
principal is Interactive, so a locked machine fires it never". A second guard would
have duplicated a working one. That file also carries another lane's uncommitted
edits and was deliberately left alone.

Record: `docs/ops/DELTA_QUEUE_S4U_PROOF.md` · `docs/FOUNDER_QUEUE.md` FQ-SHIP-R0X-1.

---

## 6 · Private-beta signup — resolved, and the switch now exists

```text
PRIVATE_BETA_SIGNUP_STATE = CLOSED_BY_DEFAULT
                            → OPENED FOR THE INVITE WINDOW through the audited
                              kill switch, with a reason
                            → CLOSED AGAIN AFTER WAVE 2, with a reason
```

The investigation changed the question. `platform_config.signups` was toggled by
an audited admin endpoint, recorded in `audit_log`, listed in `SCHEMA_TRUTH.md` —
and **read by nothing**. The only runtime readers of `platform_config` were
`court/guard.ts` and `premium/gate.ts`. An operator closing signups got a 200, an
audit row, and no change in behaviour.

Meanwhile an account was obtainable by anyone from any address. That is open
public signup, which A2's private-beta model is not, and the exposure is not other
people's data — tenant isolation holds — it is **capacity and spend**: the S4-R0
package puts a 30-concurrent beta at 92% of admitted search capacity.

An allowlist was considered and rejected as the answer: a table, a migration, a
`SCHEMA_TRUTH` change and an admin surface for ~100 addresses is a new subsystem,
and the instruction not to invent a broad new auth system rules it out when an
audited mechanism already exists in the fixed key set.

```text
CLOSED       = no NEW identity. An address already in `auth_user` is ALWAYS let
               through, so closing after Wave 2 cannot lock out the cohort.
REFUSAL      = SILENT — the same `{ sent: true }`, no mail. A refusal that
               announced itself would enumerate a list of named advocates.
MISSING ROW  = CLOSED when serving. Verified: no migration seeds this row, so a
               fresh USER database has none — which is exactly why **S4-R1
               structurally cannot inherit "test cleanup"**.
UNREADABLE   = CLOSED. Not knowing is not permission.
DEVELOPMENT  = not consulted, via the same single serving-environment source N-5
               gave `/version` and `/ready`.
```

**The live `platform_config` row was not touched.** It is local, R1 does not
inherit it, and flipping a founder's switch is not SHIP's to do unasked. It was
read before and after every suite in this round and is byte-identical.

`SCHEMA_TRUTH.md` now records the switch's semantics beside `ecourts_harvest`'s.

---

## 7 · Full local API suite

```text
COMMAND   tsx --test --test-concurrency=1 src/*.test.ts src/**/*.test.ts
SCOPE     services/api, against the local corpus

RUN 1     TESTS 1331 · PASS 1325 · FAIL 2 · SKIPPED 4 · CANCELLED 0
RUN 2     TESTS 1333 · PASS 1329 · FAIL 0 · SKIPPED 4 · CANCELLED 0 · TODO 0
          225 suites · 353,316 ms (5 m 53 s)
```

Run 2 is the confirming run, taken after correcting the two tests. The test count
rises by exactly 2: `verify.test.ts` trades one route test for a schema test plus
an ordering test (+1), and `saved.test.ts` converts its route test in place and
adds an ordering test (+1). Both arithmetics close — `1325 + 2 + 4 = 1331` and
`1329 + 0 + 4 = 1333` — so nothing was silently dropped from the run.

`--test-concurrency=1` deliberately. A concurrent run is how this project once
turned two suites sharing one log into 139 phantom failures, and N-6 is itself a
timing failure recorded under self-contention.

### The two failures were mine, and neither test was weakened

Both were tests asserting the **old** ordering, and both broke because the N-7 fix
works:

```text
citations/verify.test.ts   "rejects a malformed body through the shared validator"
                           POST /verify/confirm, no session, malformed body
                           expected 400, got 401
search/saved.test.ts       "rejects a language outside the contract"
                           POST /saved-searches, no session, language: 'fr'
                           expected 400, got 401
```

Each got its 400 **only because body validation ran before the auth check** — the
exact defect N-7 names. Neither app instance in those files supplies `deps.auth`,
so every request is anonymous; an anonymous caller must now be refused whatever the
body says.

The correction adds coverage rather than removing it. Each file keeps its validator
assertion, moved to the schema that **is** the contract (`confirmRequest`,
`savedSearchBody`), where the **accept** case can also be asserted — something the
route test could never do without a session, so the original check could not tell a
schema that rejects `fr` from one that rejects everything. Each file then gains a
test that a *malformed* body returns `401`, which is the case worth keeping: a test
using a **valid** body would pass even with the ordering reversed.

Both files re-run green (11/11), and the neighbouring security assertions they sit
beside — "an anonymous caller able to assert a permanent Tier 3 verification can
poison the harness", and the four-method 401 sweep on saved searches — were already
passing and are untouched.

### Classification

```text
PASS              1329
FAIL              0   (2 in run 1, both attributable to the N-7 fix and both
                  closed by correcting the test's EXPECTATION, never the product)
SKIP_WITH_REASON  4   — each skips on an absent local fixture (`needs a corpus`,
                  `needs the saved_searches table`), which is the honest state of
                  a workstation whose corpus tables are not all present
UNKNOWN           0   — no timing failure appeared in either run
HOLD              0
```

**N-6's own failure did not reappear.** The `src/search/sparse-bound.test.ts`
latency assertions that produced it passed in both runs — "does NOT refuse an
ordinary advocate query" at 1,260 ms and "keeps the all-common fallback alive" at
1,296 ms — under contention. That is evidence against N-6 being a live defect, and
it is **not** the quiet-window run N-6 asks for.

**This was not a quiet window**, and N-6 asked for one. The ingest fleet and this
session shared the box throughout. Recorded as a real measurement of a **contended**
run — which is a stronger result than it looks, since the sparse-bound latency test
that produced N-6 passed here — and explicitly **not** as the quiet-window run N-6
wants. That one still belongs to S4-R1.

---

## 8 · Security baseline — the local portion

Only rows actually evidenced this round are marked. **No row is marked PASS from
code existence**, and rows whose only possible evidence is the future public HTTPS
environment stay `REMOTE_ONLY_PROOF`.

| row | state | evidence |
|---|---|---|
| `PROTECTED_ROUTE_AUTH_BEFORE_SENSITIVE_WORK` | **PASS (local)** | N-7 closed, 2eaf6049. A *derived* wiring test enumerates every route registering a json validator and requires each to gate first or carry a stated exemption — it found two routes hand-enumeration had missed on its first run. |
| `SECRETS_NOT_COMMITTED` | **PASS (local)** | `git ls-files` matches no `.env`, `.pem`, `.p12`, `.jks` or keystore; `.gitignore` lines 2–3 cover `.env` and `.env.*`. |
| `QUERY_STRINGS_NOT_LOGGING_TOKENS` | **PASS (local)** | The request logger logs `c.req.path`. Verified against Hono rather than assumed: `/x?token=SECRET123` logs `/x`, and the token is absent. |
| `TENANT_AUTHORIZATION` | carried | Unchanged by this round; every write still carries `WHERE user_id = $me`. Not re-evidenced here, so not claimed. |
| `TLS_PUBLIC_API` · `PUBLIC_POSTGRES_CLOSED` | `REMOTE_ONLY_PROOF` | No deployed target exists. |
| `BACKUP_KEY_ESCROW` | founder | FQ-BACKUP-KEY-ESCROW, OPEN. |
| every other row | **NOT_ASSESSED this round** | Named in §12 rather than left implied. |

Four founder credential rotations remain **OPEN** and are prerequisites to
provisioning, not to this round: `DO_TOKEN_ROTATED`, `RESEND_KEY_ROTATED`,
`SPACESHIP_KEY_SECRET_ROTATED`, `R2_BACKUP_KEY_ESCROWED`. Destroying the Gate-C
hosts did not invalidate them — teardown is not rotation. No secret value was
read, printed or used in this round.

---

## 9 · Capability and claim parity

```text
CAPABILITY_CLAIM_PARITY = PASS
CAPABILITY_REGISTRY_REVISION = R18   (unchanged)
API_CONTRACT_REVISION        = R17   (unchanged)
WIRE_PROTOCOL_VERSION        = 1     (unchanged)
```

Verified rather than asserted: `git diff a9f88638~1..HEAD` touches **no** file
under `docs/product/`, so the capability registry and claims register are
byte-identical to their pre-round forms. R18 still reads `ENABLED_V1 17 ·
POST_V1 5 · DISABLED_NOT_READY 9 · INTERNAL_EXPERIMENTAL 1 ·
DISABLED_EXTERNAL_BLOCK 1` across 33 rows.

```text
PUBLIC_SEMANTIC (search.semantic.broad)      INTERNAL_EXPERIMENTAL   unchanged
search.semantic.supporting_authority          POST_V1                unchanged
search.semantic.adverse_authority             POST_V1                unchanged
documents.upload_and_ocr                      DISABLED_EXTERNAL_BLOCK unchanged
monitoring.user_product · briefing.daily_loop DISABLED_NOT_READY     unchanged
alerts.push_delivery · alerts.saved_authority_moved ·
alerts.filed_citation_moved                   DISABLED_NOT_READY     unchanged
CITATION_BULK_APPLY                           HOLD                   unchanged
ADVOCATE_DESKTOP_WEB                          DO_NOT_BUILD           unchanged
```

**No capability became user-reachable.** This round's route changes only
*restricted* access — N-7 added gates to 18 routes including `/premium/jobs`, and
that gate sits **before** `refuseIfDisabled`, so an anonymous caller can no longer
learn which capabilities are disabled either. Guards run clean:
`check-alert-surface-truth` · `check-contract-status` · `check-schema-truth` ·
`check-amber-reservation` all PASS.

No new capability-registry revision was created, because no capability state and no
contract metadata legitimately changed.

---

## 10 · What this round deliberately did NOT build

Every item on §44's list, and these specifically because they were adjacent and
tempting:

```text
no HNSW · no public semantic · no citation bulk apply
no Court Pulse · no Court Event Watch · no Procedural Law Change Radar
no Evidence-Locked Synthesis · no Research Session · no generic legal chat
no drafting · no uploads/OCR · no Hindi generation
no Play listing · no AAB · no internal track · no App Store · no TestFlight
no Apple review mode · no billing/IAP · no marketing-site work
no DHC crawler · no systematic Delhi HC ingestion
```

Also not done, and each for a stated reason rather than by omission:

- **No `releaseId` field on `/version`.** `gitSha` + `deployedAt` + `imageDigest`
  already identify a deployment uniquely, and adding a field is an additive
  contract amendment requiring a CCR under roadmap §3.7. A test asserts its
  absence so a later round cannot add it without meeting that process.
- **No REINDEX pass designed for the restore.** It is moot on a logical `COPY`
  restore (§3), and designing one would have been work against a misdiagnosis.
- **No signup allowlist.** §6.
- **No second liveness alarm for the delta queue.** §5.
- **`job-health.mjs`, `JOB_TABLE.md` and the other 3,300 dirty worktree files left
  alone.** They carry other lanes' uncommitted work. `git stash` was used once,
  in error, against this shared worktree; it aborted before merging, the foreign
  stash (dated 1 Sep, 83 files) is intact and unapplied, and it was not used again.

---

## 11 · DATA and RED

```text
DATA = CONTINUOUS, undisturbed. No mission given, no ingest or embedding job
       stopped, started, enabled or disabled. One bounded handoff is PROPOSED in
       the S4-R0 package §12 and deliberately not sent from inside a document:
       judgment_paragraphs_judgment_idx is btree (judgment_id, paragraph_index)
       and judgment_paragraphs_unique is UNIQUE btree over the identical columns
       in the identical order — 4.963 GB of exactly redundant index, 1.8% of the
       serving set. VERIFIED from pg_indexes. Dropping it is a schema change and
       belongs to DATA under roadmap §3.7. SHIP did not drop it.

RED  = FROZEN, not invoked. No stop-the-line condition was met and none is
       declared.
```

---

## 12 · Remaining locally actionable work — the honest list

**`PRIVATE_BETA_CANDIDATE_LOCAL = HOLD`**, and these are why. None of them is
blocked by anything external; they were not reached.

```text
P1  N9_RELEASE_BUILD / ANDROID_RELEASE_APK / APK_DISTRIBUTION_CONTRACT
    A real local Android release candidate with package id, version code,
    version name, commit SHA, release id, APK sha256, non-debuggable observed,
    no Metro dependency, target SDK, signing certificate fingerprint. Signing
    material availability was NOT assessed, so it is not yet known whether any
    part of this is founder-blocked. Do not fall back to a debug APK.

P1  LARGE_JUDGMENT
    Exercise a real large judgment locally: rendering, scrolling, paragraph
    navigation, selection, the 4,000-char annotation boundary, resume position,
    memory, accidental truncation, stale highlight.

P1  LOCAL_NETWORK_LIFECYCLE
    timeout · transient loss · retry · background/resume · force-stop/relaunch ·
    session expiry · server unavailable · corpus unavailable.
    Invariant to hold throughout: failure != "no law found".

P1  IN_APP_DELETION
    Verify the actual initiation flow locally, preserving identity-only support,
    real request state, no invented retention period, no second deletion backend.

P2  PRIVATE_BETA_TELEMETRY
    crash · ANR/OOM where available · auth failures · API latency · search
    latency · server errors · release/version identity · support correlation.
    Allowlisted: no raw matter documents, no raw privileged content, no
    unrestricted legal query text, no magic-link/token logging.

P2  SECURITY_LOCAL_BASELINE — the rows §8 marks NOT_ASSESSED
    TENANT_AUTHORIZATION (re-evidence) · SESSION_EXPIRY_RECOVERY ·
    MAGIC_LINK_REPLAY · MAGIC_LINK_REDIRECT_CLOSED (R33) · RATE_LIMITING ·
    TOKENS_NOT_LOGGED · ADMIN_ISOLATION · MOBILE_SECURE_STORAGE ·
    BACKUP_ENCRYPTION · DEPENDENCY_VULNERABILITY_REVIEW ·
    SENTRY_DATA_ALLOWLIST · POSTHOG_DATA_ALLOWLIST ·
    NO_RAW_MATTER_DOCUMENT_CONTENT_IN_TELEMETRY ·
    NO_RAW_SENSITIVE_QUERY_TEXT_UNLESS_EXPLICITLY_APPROVED ·
    DATA_SAFETY_MATCHES_RUNTIME
```

---

## 13 · Remote-only and founder-only

```text
REMOTE_ONLY_BLOCKERS
  PERSISTENT_BETA_READY            no environment exists
  PRODUCTION_LIKE_PROVENANCE       the /version MECHANISM is ready; the VALUES
                                   only exist at deploy time and are not faked
  ENVIRONMENT_LABEL (remote equality)   local contract closed; remote proof is R1
  PREWARM latency proof            local mechanism closed; remote timing is R1
  BACKUP_RESTORE                   needs a target
  WINDOWS_LINUX_COLLATION proof    needs the Linux target (§3, approach A)
  GATE_S1 re-run                   needs the environment
  TLS_PUBLIC_API · PUBLIC_POSTGRES_CLOSED
  HIGH_END_ANDROID_REGRESSION · LOW_MID_ANDROID_PHYSICAL · ACCESSIBILITY on
    device · POOR_NETWORK · BACKGROUND_RESUME  — physical devices on a public
    network; N-8's fix is unit-proven locally and TalkBack proof is physical

FOUNDER_ONLY_BLOCKERS
  FQ-SHIP-R0X-1  one elevated consent click — the delta queue's principal, and
                 the CUDA-in-session-0 measurement that decides the fix
  FQ-SHIP-R0X-2  persistent-beta spend approval (USD 450 initial / 550 monthly)
  DO_TOKEN_ROTATED · RESEND_KEY_ROTATED · SPACESHIP_KEY_SECRET_ROTATED ·
  R2_BACKUP_KEY_ESCROWED          all OPEN, all prerequisites to provisioning
  APPLE / PLAY ACCOUNT STATE      never observed; not a Stage-A blocker
  LAUNCH_COMMERCE                 FREE_BETA | PAID_V1, binds on public release

UNKNOWN
  CUDA_IN_SESSION_0               decides which delta-scheduler fix is correct
  ANDROID SIGNING MATERIAL        not assessed this round
  Hetzner volume + CCX13 SIN1 prices          S4-R0 §9.3
  DO Storage-Optimized availability in blr1   S4-R0 §9.4
  whether the legacy so1_5 900 GiB slug is still offered
```

---

## 14 · Final state

```text
PRIVATE_BETA_CANDIDATE_LOCAL = HOLD — §12 lists six locally actionable items,
                                      none of them externally blocked
```

`READY_EXCEPT_REMOTE_ONLY_PROOF` is **not** declared. §50 says it may be used only
when every remaining private-beta blocker genuinely requires a public remote
environment, a physically unavailable device, a founder credential or account
action, or external proof — and it must not be used as a convenient way to stop.
Six items in §12 meet none of those conditions.

```text
PAID_RESOURCE_CREATED   = NO
CLOUD_PROVISIONED       = NO
CLOUD_API_CALLED        = NO
PROVISIONING_AUTHORIZED = NO
SECRET_READ_OR_PRINTED  = NO
DB_OR_CORPUS_MUTATION   = NO
CAPABILITY_CHANGED      = NO
DATA_DISTURBED          = NO
RED_INVOKED             = NO
STOP_THE_LINE           = NONE — no roadmap §3.6 condition met
```
