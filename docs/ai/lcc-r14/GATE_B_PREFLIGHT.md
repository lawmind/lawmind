# GATE-B PREFLIGHT — LCC, 30 AUGUST 2026

**Lane:** LCC · **Round:** Sprint-2 final convergence, Part B
**Authority:** the founder's exact `docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_1.md`
(35,214 bytes, sha256 `76fb3753…`) and `docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V2.md`
(61,078 bytes, sha256 `137059c3…`), both now tracked byte-for-byte.

**Reanchored to current HEAD `08237b8a`**, after NEW3's `0643354d` (party
activation guard, docs only) and NEW1's `1b7d9add` (GPU lock, `services/harness`
only) landed concurrently. `acc478c3` is an ancestor, verified with
`git merge-base --is-ancestor`. The only `services/**` or `packages/**` change
between `acc478c3` and HEAD is this lane's `env.ts` + `env.test.ts`, so the
932-pass API suite below is current rather than stale — and NEW3's DEFER and the
empty override map were both re-read at this HEAD, not at the one they were
first observed on.

**This is a PREFLIGHT, not a receipt.** FIFTH grades Gate B; nothing here is a
verdict and no gate is declared passed. Every line is either an observation with
the command behind it, or a statement that something was not observed.

---

## 0 · REPRODUCIBLE HEAD

| | |
|---|---|
| expected Sprint-2 commits | present; RCC `acc478c3` is an ANCESTOR of HEAD, not a patch-equivalent |
| migrations truth | `check-migration-journal.mjs` — **OK, 100 migrations, journalled, ordered, tracked and unedited since recorded** |
| fresh install | `docs/ai/lcc-r13/fresh-install-proof-day0.json` — `verdict: EQUIVALENT`, **0 divergences**, 157 lane-scratch objects named separately |
| applied-only product schema | none. The live/fresh column and table deltas are all lane-scratch (`n1_lab_*`, `new1_*`), itemised in that proof |
| M0 receipt | **reconciled, not relabelled.** `REPRO_DEBT_3` closed in `110bc7f`; the R11 receipt carries `role: PRE_GATE_SNAPSHOT` and a `supersededBy` block. The 3,799-row difference is the HC bucket writing daily, and both figures are true of their own moment |
| exact governing files | **tracked and verified FROM THE GIT BLOB**, not the working tree — see the header above |

**Product-code dirt affecting audited behavior: NONE.** The full dirt inventory
is 597 paths and almost all of it is continuous-worker output. Classified:

- `services/**`, `packages/**`, `apps/**` code dirt at the start of this round: **none.**
  The only code this lane touched is committed (`a4725682`, `a5a10f1d`, `c8ed9016`).
- `packages/db/factory/.probe-{A,A2,B}.json` — untracked probe scratch, not code,
  not this lane's, left alone.
- `scripts/enrich-worker.cmd` — **comment-only**, an S4U/logon-type amendment. No
  behavior change. Another lane's; left alone.
- 18 dirty markdown files — see §12 below. Docs, not code, and Check 0 is about
  product-code dirt affecting audited behavior.
- The remainder is `.agents/logs/**`, `.agents/bus/**`, `services/ingest/.checkpoints/**`,
  `docs/ai/new1-r9/delta/**` — **continuous-worker and generated output, counted
  separately and never as product dirt.** Those checkpoints are live worker state;
  they were NOT staged and the workers were NOT paused.

---

## 1 · API CONTRACT

`check-contract-status.mjs` — **ok · 105 endpoints · 92 built · 13 specced.**

Frozen and versioned: `WIRE_PROTOCOL_VERSION = 1`, `minSupportedContract = 1`,
current revision **R14** (`docs/product/RCC_V1_API_CONTRACT_R14_AMENDMENT.md`).

Amendment process operational, and demonstrably so this round: ten CCRs in
`CONTRACT_CHANGE_LEDGER.json`, adjudicated individually with the decision, the
adjudicated severity AND the submitted severity both recorded — including one
`NOT_A_CONTRACT_CHANGE_ENGINEERING_DEFECT` (CCR-RCC-S2-03), one `DEFER`
(CCR-NEW3-S2F-01) and one WITHDRAWN amendment (CCR-2026-08-30-04). A process
that only ever returns AMEND is not a process.

Lifecycle states are separate: `decision`, `releasedToRCC` and `newVersion` are
distinct fields, and CCR-RCC-S2-02 sits at `AMEND` + `releasedToRCC: false` —
adjudicated, not yet consumable. RCC has correctly not built against it.

---

## 2 · CAPABILITY REGISTRY

`docs/product/V1_CAPABILITY_REGISTRY_R14.json`, audited by its own five-field rule:

```
enabledOnAtLeastOnePlatform   18
enabledWithoutNamedEvidence    0
offenders                     []
```

Verified independently by reading the file: every `ENABLED_V1` row carries
`evidenceArtifact`, `evidenceState` and `currentContractVersion`. States:
18 `ENABLED_V1` · 6 `DISABLED_NOT_READY` · 4 `POST_V1` · 1 `INTERNAL_EXPERIMENTAL` ·
1 `DISABLED_EXTERNAL_BLOCK`. **Zero web capabilities are enabled.**

---

## 3 · ACCEPTANCE

**Outstanding CURRENT P0: none.** The one open implementation P0 —
`CCR-RCC-S2-03`, the magic-link origin, upheld by NEW3 and NOT downgraded — is
**fixed in `a4725682`**. Production now refuses to start without `AUTH_BASE_URL`
and the retired host cannot return as an implicit default under any combination.

`CCR-NEW3-S2F-01` is **P1 LATENT, not a current P0** — NEW3's own adjudication,
and its own words: *"it becomes a P0 the instant the override is activated."*
The branch cannot execute at HEAD. See §9.

**Affected workflows re-run, not the whole old suite.** Affected code is
`services/api/src/env.ts`:

```
services/api   935 tests · 932 pass · 0 fail · 3 skipped · 378.3s
scripts        11 tests  ·  11 pass · 0 fail   (backup-pack-shape)
```

**Core-loop smoke: RUN, from committed HEAD.** `pnpm --filter @lawmind/harness
product:ten` — NEW3's deterministic ten-matter regression, driven through
`createApp(...).request(...)`, the REAL Hono app with every route guard and auth
middleware in the path:

```
matters              10
invariants          12 checked · 12 held · 0 failed
drift               none, on any matter
HTTP steps         127
authentication      fixture user, in process
```

Evidence: `docs/ai/lcc-r14/core-loop-smoke.json`. It authenticates a fixture
user and never follows an emailed link, which is exactly why NEW3 recorded
`GATE_B_ACCEPTANCE_IMPACT = NONE_OBSERVED` against the magic-link P0.

`GATE_B_CORE_LOOP_DEPENDS_ON_REMOTE_API = NO.` Check 3 names no origin; the
founder's own prompt pack puts staging API (8 Sep) and the physical-phone remote
core loop (16 Sep) inside **Sprint 3, "REMOTE INTEGRATED ALPHA", 5–18 September**.
`REMOTE_API_DEPLOYED = NO`, and nothing was provisioned.

---

## 4 · FIRM-READY OWNERSHIP

**Verified as still current, not recreated.** `matters.workspace_id` is enforced
by migrations `0097_firm_ready_workspace_ownership`, `0098_personal_workspace_is_automatic`
and `0099_matter_workspace_defaults_from_user`, with
`services/api/src/matters/workspace-isolation.test.ts` asserting the freeze at
the database rather than in a code path — a composite key, orphan checks, and a
check that `workspace_id` is the seam the ownership test actually uses. It runs
inside the 932 passing tests above.

---

## 5 · HOSTING

`HOSTING_GATE_STATE = HOLD_MEASUREMENT_DEFERRED_BY_FOUNDER`.

**The founder instructed this lane, mid-round, not to purchase, provision,
upgrade, retain or trial any paid infrastructure, and to defer hosting
measurement until the application is substantially built.** So:

```
HOSTING_MEASUREMENT_AUTHORIZED    NO
HOSTING_PROVISIONING_AUTHORIZED   NO
RECURRING_CLOUD_SPEND_AUTHORIZED  NO
ONE_OFF_CLOUD_SPEND_AUTHORIZED    NO
```

**Nothing was provisioned before or after that instruction.** No paid resource
was created in this session at any point; the only external writes were to the
existing Cloudflare R2 backup bucket, which is prior infrastructure and not new
spend.

`INDIA_RTT_MEASURED = NO` · `STORAGE_THROUGHPUT_MEASURED = NO` ·
`PITR_RESTORE_CHARACTERISED = NO` · `HOSTING_CANDIDATES_MEASURED = 0` ·
`HOSTING_SELECTION = NONE`.

**No number here is derived from vendor documentation.** A hosting comparison
assembled from price pages is not a measurement, and presenting one as though it
were is the failure this line exists to refuse. The existing pricing research in
`docs/ai/lcc-r13/HOSTING_SELECTION.md` is preserved untouched.

`EXTERNAL_BLOCKER`: the founder intentionally deferred paid hosting measurement
until the application is substantially built. This is a founder decision, not a
lane failure, and it is not counted against any other check.

---

## 6 · OFF-MACHINE RESTORE

**An ACTUAL restore, from a fresh Cloudflare R2 download, touching the local
archive at no point.** `docs/ai/lcc-r14/offsite-restore-proof.json`, produced by
the COMMITTED `scripts/lcc-offsite-restore-proof.mjs` against a pack produced by
the COMMITTED `scripts/lcc-protected-set-publish.mjs`.

```
verdict            RESTORE_PROVEN_FROM_OFFSITE
prefix             backups/postgres/2026-08-30T16-46-06-987Z-moat-r14-enc
download           245.7 s      (single-stream; the default multi-thread copy
                                 truncates large objects against this bucket)
decrypt              6.5 s      AES-256-GCM, 7 of 7 cipher AND plaintext digests MATCH
restore            509.2 s      psql -f schema.sql, then pg_restore --data-only
total             1189.6 s
```

**Row counts: 35 of 35 tables match the pack's OWN manifest**, compared against
what the dump contained rather than against a live database that has moved on
since. `pg_restore` exit 0, `psql` exit 0, both stderr tails empty. Content
checksum over `judgment_citations` matches the live database exactly
(`5388aa9b…`).

**Canonical identity — the check this pack existed to add:**

```
identity rows                          18,759,022   = manifest, exactly
rows carrying content_hash             18,759,022
citation endpoints WITHOUT identity             0
CANONICAL_IDENTITY_RECONSTRUCTIBLE            YES
```

Both ends of every edge in the restored `judgment_citations`, anti-joined
against the restored identity map. Not sampled. Before this round the same
question answered **12,564,205** — 67% of the citator restoring into a corpus it
could no longer address, with every row present and every checksum green.

**Provenance:** the four columns are CARRIED for all 18,759,022 rows and
**POPULATED on 6,392**. Reported as a count, never as a pass — that is a fact
about the corpus, not about the backup, and a restore returns what the source
holds.

**Protected files: 362 of 362 verified by sha256 out of the archive**, 36
declared roots, **0 absent**. Coverage by named class, all true: governing
authority · gold/eval · source manifests · worklists and checkpoints ·
migrations · schema truth. The capture rule is recorded in `FILES.json` —
POINT-IN-TIME PER FILE, NOT ACROSS FILES, live workers NOT paused.

**Model artifacts: all 5 MATCH**, downloaded from their own encrypted prefix,
decrypted and re-hashed against the COMMITTED
`docs/ai/lcc-r13/model-artifact-manifest.json` — never against the pack's own
`ENCRYPTION.json`, which would only prove the packing tool self-consistent.
`MODEL_ENCRYPTED_OFFSITE = YES` (AES-256-GCM, 2.28 GB, streamed, never loaded
into memory). `MODEL_REVISION = UNKNOWN`, which §10.1 makes acceptable at Gate B
**because** the files are protected.

```
RESTORE_TECHNICAL        PASS
PROTECTED_SET_COMPLETE   YES
HOST_LOSS_RECOVERABLE    NO
```

**`HOST_LOSS_RECOVERABLE = NO`, and it is reported here separately rather than
folded into the check.** `R2_BACKUP_ENCRYPTION_KEY` exists only in `.env` on this
workstation, so everything only that key opens dies with the workstation. That is
a founder action (`FQ-BACKUP-KEY-ESCROW`), not a Gate-B criterion, and it is
**not** listed as a Gate-B blocker: check 6 asks for an actual restore, and the
actual restore passed.

---

## 7 · eCOURTS

`ECOURTS_OBSERVATION_COUNT = 0` — counted this round, `SELECT count(*) FROM
ecourts_observation`. `ecourts_fetch_ledger` holds **237 rows**, which is the
evidence that the attempts happened and stayed inside the grant.

This is check 7's **path B**, and the completed bounded-stop package is
`docs/ai/lcc-r13/ECOURTS_BOUNDED_STOP_REPORT.md`. Re-verified, not re-run:

- **No new live eCourts request was made in this round.** None was needed and
  none is permitted by the round's own terms.
- The report publishes every attempted hypothesis and its raw result, including
  the ones that were refuted: `fillDistrict` **SOLVED** 2026-08-29T22:58:44Z; the
  parser defect was a lookup returning zero from a populated response; the CAPTCHA
  is **ACCEPTED 3 of 3**.
- `UA_EXPERIMENT_STATE = TESTED_REFUTED`. The User-Agent experiment in roadmap
  §5.3 B **must not be run** — the UA/attribution split was already live for the
  requests that failed, and the cause was a rotating header pair.
  `attribution-transport.test.ts` asserts the client never impersonates a browser,
  because claiming to be Chrome would misrepresent us to the party that authorised
  the access.
- **Monitoring remains disabled and unclaimed.** `USER_MONITORING_PRODUCT =
  DISABLED_NOT_READY`; all six monitoring fields serve `null` /
  `never_attempted` (`services/api/src/court/monitoring-fields.ts`), and no
  polling frequency or SLA appears anywhere. `lastObservationOutcome` is
  `never_attempted` rather than null on purpose: null invites "unknown, probably
  fine", and `never_attempted` cannot be read as a result.
- `platform_config.ecourts_harvest` is **ON**, flipped 2026-08-29T17:33:52Z
  through the audited path with a recorded reason and a durable non-fixture
  actor. Zero observations is therefore **not** "work was not attempted".

---

## 8 · SPARSE ADMISSION

`docs/ai/lcc-r13/sparse-quality-battery.json`, re-verified from the committed
artifact and **not retuned, not re-run, semantic not enabled**:

```
operational rows        35      refused 15 · admitted 20
p95 worst            9,163.1 ms      cold worst 48,887.5 ms
adjudicated scored      40      target absent 0
known target present@10   0.45   (18/40)
known target present@50   0.475  (19/40)
```

Both halves of the check are answered, and the second is answered honestly:
**fast enough** on the operational battery, and **demonstrably useful** at
18/40 @10 on the fixed known-target suite — a number that is a measurement
rather than a claim. The known Supreme-Court-plus-bail limitation is retained
and not papered over.

The narrowing advice the refusal path gives is actionable and was corrected this
sprint on RCC's side: **one NAMED court and a shorter date range**, never a court
category as the remedy — R13's "a court category is not narrowing" was
mechanically wrong (it IS counted as narrowing, it is simply never narrow
enough) and R14 A7 withdrew it.

---

## 9 · PARTY SEARCH

`NEW3_PARTY_DECISION = DEFER` — **CCR-NEW3-S2F-01, decided by NEW3 on
2026-08-30**, `newVersion: null`, `releasedToRCC: null`, R14 remains latest.
Read from the committed ledger before touching anything, which is why
`services/api/src/search/outcome.ts` was **not** modified: on DEFER the response
contract is not widened.

`PARTY_OUTCOME_IMPLEMENTED = NO.` `PARTY_OVERRIDE_ACTIVATION_BLOCKED = YES.`

The guard is recorded by NEW3 as
`PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`, and
**it is not contradicted by the current release configuration** — verified at
HEAD:

- `PLATFORM_CAPABILITY_OVERRIDES = {}` in `services/api/src/release/capabilities.ts`.
- `party-search-platform.test.ts` asserts that map `deepEqual {}` with the comment
  *"adding a row IS flipping the switch"* — so activation cannot land silently; it
  breaks a committed test first.
- `search.party_name` resolves ENABLED on ios, android, web and unknown;
  `platformOverrides: []` on every platform.

Check 9's four requirements: **case-first** (`CASE_NAME_RE` classifies structurally;
no exact-identity query classifies as `party_name`, asserted by 17 passing tests) ·
**no person-centric endpoint** (none exists) · **kill switch exists** (SERVED, not
build-time — a platform override narrows for one platform and a strict narrowness
comparison forbids widening) · **iOS degrade path defined** (VISIBLE degrade to
case-number / citation / CNR with a stated message, binding on RCC and shipped in
`acc478c3`).

The latent defect is stated rather than hidden: with the switch flipped,
`deriveRetrievalOutcome` would report `answered` / `safeForGeneration: true` on a
response whose party arm never ran. It cannot fire today, it is P1 LATENT, and
the three conditions that lift the guard are named in the registry row.

---

## 10 · EMBEDDING SNAPSHOT DURABILITY

`SNAPSHOT_HASH_DURABILITY = PASS`, `REPRO_DEBT_1` closed in LCC R13.
`packages/db/factory/0001_vector_snapshot_identity.sql` makes the identity a real
table with `snapshot_hash` as PRIMARY KEY, append-only by trigger (DELETE
refused, mutation refused, `SEALED` cannot be reactivated), and the constant
column default that had no writer and no migration behind it is gone.

Reproducible schema: the fresh-install proof above restores it with **0
divergences**. **No HNSW index was built, no coarse-walk completion was required,
and no NEW1 GPU lock was taken** — check 10 asks for neither and inventing them
would have blocked the gate on someone else's work.

---

# APPENDIX A · NON-GATE OBSERVATIONS

These are reported because they are true, not because they belong to a check.
None of them is promoted into gate scope.

## A1 · Signups are OFF on this box, set by a test actor

```
platform_config.signups   enabled = false
reason                    "test cleanup"
updated_by_user_id        0963367b-0de4-4614-a3e7-2d65d943a518
updated_at                2026-08-29T12:18:12Z
```

`SIGNUPS_STATE = DISABLED_BY_TEST_CLEANUP`. **Not flipped**, deliberately: a kill
switch is changed with a reason by someone who means to change it, and this lane
was told not to flip it blindly.

`SIGNUPS_GATE_EFFECT = NONE`. The core-loop smoke authenticates an existing
fixture user; it never registers. So the gate is unaffected and the row is still
worth reading, because it is **the same class as the harvesting switch a killed
test suite left ON**: an append-only or config table carrying a state that a test
chose and nobody decided.

## A2 · Supreme Court permission is settled; its evidence is in the wrong place

`SUPREME_COURT_PERMISSION_STATE = SETTLED_BY_FOUNDER`. Not reopened, not
downgraded, and **not turned into UNKNOWN by the paragraph below.**

`SOURCE_RIGHTS_EVIDENCE_LOCATION_STATE = INCONSISTENT_UNTRACKED`:

- `docs/SCI_AUTHORISATION.md` records the founder's confirmation of a separate
  written SCI permission valid through 2029 — and the file is **UNTRACKED**. A
  clone gets nothing.
- `CLAUDE.md` §6a, which IS tracked, says the SCI question "remains contested and
  untouched" with `SCI_AUTHORISATION_STATE = UNCHANGED`.

Two records, one of which a clone cannot see. **The permission is not in doubt;
the location of its evidence is.** The right fix is a founder or NEW2 decision
about which document is canonical, not a lane silently choosing. The file is now
carried in the encrypted protected set, so at least it can no longer be lost with
this workstation.

## A3 · Unpushed commits

`UNPUSHED_COMMITS = 13` against `origin/main` at the time of writing.

**Not classified as a Gate-B blocker**, and nothing was pushed: push authorization
is not this lane's to assume. What WOULD be a blocker is a required protected
artifact existing only in an unpushed local Git object and nowhere else — and
that is exactly why `docs/roadmaps/**`, the gold sets, the checkpoints, the
migrations and `docs/SCI_AUTHORISATION.md` are inside the encrypted pack. The
protected copy is what closes it, not the push.

## A4 · Nine authorization-policy documents are dirty, and one would widen a grant

`PRODUCT_CODE_DIRT = NONE` (see §0). The dirty documents are **not** Check-0
blockers — Check 0 is about product-code dirt affecting audited behavior — and
they were **left untouched**. `NON_GATE_DOC_CONFLICT`, itemised:

| file | hunk | why it was not committed |
|---|---|---|
| `docs/TECHNICAL_INVENTORY.md` | asserts *"Lawmind's separate written SCI grant permits CAPTCHA handling through 2029"* | **This is the one that matters.** It states a grant scope that tracked `CLAUDE.md` §6a calls contested. Committing it would broaden authorization from a working-tree edit. |
| `docs/CORPUS_ACQUISITION_QUEUE.md` row 4b | rewrites "NOT VIABLE" into "components may be evaluated as transport/parser code behind Lawmind's guarded adapter" | The stale half is real — the old row cited a "bulk cause-list only" scope the founder superseded on 29 Aug — but the replacement adds a NEW permission rather than correcting a scope. |
| `docs/AGENT_BROWSER.md` | "driving eCourts from a browser outside that module is outside the grant" becomes "may be used as transport behind that boundary" | Same shape: correct on scope, additive on permission. |
| `docs/HARVEST_ENGINE.md`, `docs/GTM_INDIA.md` | `captchaBypassPermitted` scope reworded from "bulk cause-list harvesting" to the enumerated grant data types | **These two are exactly the settled correction and introduce no new scope.** They were still left alone: this lane could not establish ownership of them, and a correct edit in someone else's file is still someone else's edit. |
| 13 further `.md` files | assorted | not read as authorization changes; not this lane's; untouched |

Nothing was broadened, no confidential term was printed, and the settled eCourts
and SCI positions were not reopened.

## A5 · A NEW3 artifact was disturbed and put back

Running the core-loop smoke rewrote `docs/ai/new3/ten-matter-regression.json`
and its checkpoint — NEW3-owned paths this lane may not write. Both were
**restored to HEAD** with `git checkout`, verified clean, and the run was
recorded in `docs/ai/lcc-r14/core-loop-smoke.json` instead. NEW3's committed
artifact (25 August) is untouched and still theirs to update. Stated here rather
than left for someone to find in a diff.
