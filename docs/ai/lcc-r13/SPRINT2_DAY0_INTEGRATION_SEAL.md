# SPRINT-2 DAY-0 INTEGRATION SEAL — LCC

**Sealed:** 2026-08-30T07:06Z · **Lane:** LCC · **Session:** `0b4ad19b-07f1-4fc3-b18e-3e95e4fa292e`
**Authority:** `LAWMIND_MASTER_ROADMAP_V7_1.md` §10 (Sprint 2, Day-0 seal) and §14 risk row 1.
**Class:** bounded integration/preflight. **No Sprint-2 feature work was begun.**

Every number below came from a command or query run in this session. Where a
number contradicts a project document, both appear and the row is labelled
`CONFLICT`. Nothing was relabelled and no history was rewritten.

---

## 1. COMMIT ANCESTRY

`HEAD = 36ce478db5ea1ed130348c2a269309def54c6c13`
(`feat(new1-r12): the weights match no published version, and the lane lease said DEAD for 341 minutes`, 2026-08-30T04:37:05+04:00)

Method: `git merge-base --is-ancestor <commit> HEAD`. Not filenames, not summaries.

| commit | lane | subject | classification |
|---|---|---|---|
| `6b90f98941a1c214161a7bf43def2dcce548bc1d` | LCC R11 | fix(ecourts): I invented a fourth condition on the CAPTCHA bypass; there are three | **ANCESTOR_OF_HEAD** |
| `edac0de015850019248986cf305a1008ddd6da26` | NEW1 R11 | feat(new1): the walk was healthy and the bus said the box was free | **ANCESTOR_OF_HEAD** |
| `831c6c28b6ec94f6368aaa30ff6b8127a4b734d6` | NEW3 R12 | chore(bus): NEW3 latency correction to 1526-1530 | **ANCESTOR_OF_HEAD** |

**The seal window is 20 commits** from `6b90f98` to `36ce478` inclusive. Zero
reverts (`git log --grep -i 'revert|undo'` → none).

### 1.1 The check that was actually load-bearing: work outside HEAD

Ancestry of three named commits does not prove no completed work was lost. Every
distinct commit in the reflog was tested for reachability from HEAD; ten were not
ancestors. Each was then classified by patch identity (`git patch-id --stable`
against the last 400 HEAD commits) and by subject match:

| commit | classification | evidence |
|---|---|---|
| `45cbead3`, `8a3fed64` | SUPERSEDED_BY_`82d1632d` | identical patch-id |
| `e5157b56` | SUPERSEDED_BY_`7dc60345` | identical patch-id |
| `e3c29c4e` | SUPERSEDED_BY_`87932d7` | same subject, HEAD copy committed 68 s later (amend) |
| `624203cc` | SUPERSEDED_BY_`3e21405` | same subject, +18 s |
| `74e07708` | SUPERSEDED_BY_`51b1c1c` | same subject, +111 s |
| `d3e68c30` | SUPERSEDED_BY_`cd5aef5` | same subject, +37 s |
| `ee63b27f` | SUPERSEDED_BY_`b301d47` | same subject, +40 s |
| `b8a3bb37` | SUPERSEDED_BY_`0472e67` | same subject, +3 s |
| `c103324c` | CONTENT_PRESENT_AT_HEAD | subject reworded; all 12 `services/harness/src/*` paths exist at HEAD |

`git branch -a`: one other local branch, `lcc/s1-embeddings-citations-retrieval`
at `ffb6ef5` — a Sprint-1 branch, not Sprint-2 work. `git stash list`: empty.
`git worktree list`: one worktree. `origin/main` is at `5a58d0e`; **`main` is 287
commits ahead of origin and has never been pushed** — see BLOCKERS.

**Verdict: no completed lane work is missing from HEAD.** No STOP condition.

---

## 2. WORKTREE AND LEASE TRUTH

**Staged paths: none.** `git diff --cached --name-only` was empty at seal start.
No other lane's work was staged, swept or mutated.

**Tracked modifications at seal start: 82.** Composition, by owner:

| group | count | owner | note |
|---|---|---|---|
| `services/ingest/.checkpoints/*` | 30 | NEW2 | live ingest cursors, mutate continuously |
| `docs/ai/new2-*`, `docs/ops/migration/new2-*` | 12 | NEW2 | round evidence |
| `docs/*.md` (non-plan) | 14 | mixed | pre-existing |
| `docs/ai/new1-*`, `docs/ai/new1-tier-a/*` | 6 | NEW1 | live walk telemetry |
| `.agents/bus/leases/*`, `.agents/jobs/*`, `.agents/logs/*`, `.agents/ops/*` | 8 | bus | heartbeats and receipts |
| `services/api/src/citations/*` | 3 | LCC | pre-existing, untouched this round |
| `apps/admin/lib/api.ts` | 1 | RCC | pre-existing, untouched this round |
| remainder | 8 | mixed | `.ai/09-project.md`, `DOMAIN_TRUTH.md`, `docs/ai/lcc-r11|r12/*` |

**Untracked: 17,145 paths.** 15,143 are `.venv-ocr/**` — a Python virtualenv that
`git check-ignore` does **not** ignore. See UNKNOWN_PRODUCT_DIRT.

Untracked paths under product roots (17): 4 under `scripts/`, 13 under
`services/`. All are dot-prefixed scratch (`.dup.mts`, `.look.mts`, `.mn.mts`,
`.sp.mts`, `.hyg.mts`, …), NEW2 checkpoints, or lane CLIs. None is unpushed
product source. Ten `LAWMIND_*.md` planning documents sit untracked at the repo
root.

### 2.1 Leases

| domain / lane | state | holder | session pid | verdict |
|---|---|---|---|---|
| **HEAVY_BOX** | HELD | NEW1 | 2136 — **gone from the process table** | **HEALTHY_BY_PROGRESS — DO NOT CLEAR** |
| GIT_COMMIT | RELEASED | NEW1 (last) | — | free |
| MIGRATION_SLOT | RELEASED → **acquired by this session** | LCC | — | held for the fresh-install proof, released after |
| DB_MIGRATION | RELEASED | LCC (25 Aug) | — | superseded by MIGRATION_SLOT per R8.1 §4 |
| CLIENT_APPS | RELEASED | RCC (25 Aug) | — | free |
| LCC lane | RELEASED → **acquired by this session** | LCC | — | took over from dead `65292fca` |
| NEW1 lane | HELD | NEW1 | 2136 — gone | durable progress 4 min ago — **DO NOT CLEAR** |
| NEW2 lane | HELD | NEW2 | 12396 — gone | **STALE by session death**, 1,032 min since heartbeat, no durable metric attached |
| NEW3 lane | RELEASED | NEW3 | — | free |
| RCC lane | RELEASED | RCC | — | free |
| FIFTH | FREE | — | — | 70 messages pending, no session bound |

**HEAVY_BOX was not cleared, and clearing it would have been the error this seal
exists to prevent.** Its session pid is dead, but it declares
`livenessSource: durable-progress` with metric
`SELECT count(*) FROM new1_doc_vector_stage`, and that metric moved during the
seal:

```
2026-08-30T06:55:48Z   3,048,837   (lease heartbeat at seal start)
2026-08-30T06:58Z      3,051,225   (direct query, this session)
2026-08-30T07:00:48Z   3,051,425
2026-08-30T07:05:48Z   3,054,019   (lease heartbeat at seal end)
```

`resource-lease.mjs status HEAVY_BOX` states it plainly: *"session pid is gone,
but the durable output metric moved 4m ago."* The live GPU writer was confirmed
independently in the process table — `python services/embed/gpu/server.py --port
8799` (pid 23260), `sidecar-keeper.mjs` (pid 6504), `doc-vector-embed.mjs` (pid
27128). **Exactly one GPU writer.**

**CONFLICT — `lane-lease.mjs status` reports NEW1 as `DEAD`** while
`resource-lease.mjs status` reports the same lane's box as
`HELD (HEALTHY_BY_PROGRESS)`. The lane tool judges liveness by session pid only;
the resource tool honours `livenessSource`. Both were read; the resource tool is
the correct one for a durable-progress lease. Not fixed in this round — LCC
Sprint-2 item.

### 2.2 Registry versus reality

`.agents/jobs/registry.jsonl` holds 35 distinct jobs, 9 declared `RUNNING`.
**Every declared pid is absent from the process table** (checked: 8796, 6880,
20932, 9120, 16168, 1460, 21696, 6528). For NEW1's three jobs this is benign —
the logical worker is alive under new pids, launched by
`Task Scheduler: Lawmind-new1-coarse-walk`, and durable output proves it. For
LCC's three (`lcc-paragraphs-apply`, `lcc-citations-extract`,
`lcc-citation-keys`) it is **fake RUNNING state on LCC's own rows.** Recorded
here, not repaired in a preflight round.

NEW2's `new2-daily-delta` is a scheduled job, not a resident process; last cycle
`2026-08-29-180002` ended 2026-08-29T14:18:06Z with `outcome: ok`, 17 scopes,
`aws_open_data_hc.heldDocuments = 18,720,013`.

---

## 3. eCOURTS CAPTCHA — STALE BLOCKER CORRECTED, APPEND-ONLY

Canonical string, per roadmap §2:

```
CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT
```

**Finding on arrival.** LCC R12 had already appended prose corrections to three
of the four named artifacts, and had broadcast bus messages 1541–1545 correcting
1521–1525. But `git grep RETRACTED_AS_INVENTED_REQUIREMENT` returned **zero
matches repo-wide** — the roadmap's canonical token existed in no file, so a
future grep for the retraction found only the retracted claim.

**What this seal appended.** Four insertions, all additive (`git diff --numstat`
shows `+N / -0` on every one — nothing was deleted or reworded):

| artifact | added | prior state |
|---|---|---|
| `docs/CURRENT_PLAN.md` | +12 | prose correction present since R12; token absent |
| `docs/FOUNDER_QUEUE.md` (FQ-ECOURTS-CAPTCHA) | +10 | already headed `[WITHDRAWN 30 Aug 2026]`; token absent |
| `docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md` | +10 | correction block present; token absent |
| `docs/ai/lcc-r11/ecourts-data-quality.json` | +14 | **no correction at all** — `killSwitch.reason` still asserted `CAPTCHA_IMPLEMENTATION_BLOCKED` / `CAPTCHA_OPERATIONAL_BASIS=NONE_RECORDED` |

The JSON received a new top-level `correction` object. The original wrong text is
preserved verbatim — after the edit, `NONE_RECORDED` still appears at
`.authorisation.captcha.operationalBasis` and `.killSwitch.reason`, and the file
parses.

Bus messages 1521–1525 are immutable append-only files and were **not edited**;
1541–1545 already carry LCC's correction, and this seal adds a further broadcast
carrying the canonical token.

**Nothing was broadened.** No replacement requirement was invented, no grant text
was printed, Gate A was not reopened, and the settled conditions remain only
those in `CLAUDE.md` §6a.

### 3.1 CONFLICT — an artifact this lane may not touch

`docs/product/NEW3_V1_PRODUCT_DEFINITION_R12.md:271` still records:

```
| ECOURTS_DAILY_PILOT | DISABLED_EXTERNAL_BLOCK | ... CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED |
```

The withdrawal states the correct value is **`DISABLED_NOT_READY`** — the block is
ours, not external. That file is a NEW3 product-definition artifact and is a
FORBIDDEN PATH for LCC. **Not edited. Handed to NEW3 on the bus.**

`docs/ai/lcc-r12/LCC_R12_CONTINUATION.md:38` also names the retracted basis, but
in a narrative describing the mistake. Left as written.

---

## 4. THE TWO M0 SNAPSHOTS — RECONCILED, NOT RELABELLED

**REPRO_DEBT_3 was already closed by LCC R12 in commit `110bc7f`.** This seal
verified the closure rather than repeating it.

`docs/ai/lcc-r11/m0-identity-receipt.json` now carries
`"role": "PRE_GATE_SNAPSHOT"` and a `supersededBy` block naming
`docs/ai/lcc-r12/m0-gate-a-receipt.json`. Its own text is explicit that nothing
was miscomputed:

> *"Two different walks of a bucket that writes daily give two different
> denominators, and both are true of their own moment: 18,947,807 here,
> 18,951,606 at the gate. Nothing here was miscomputed; it was mislabelled as the
> gate figure, and that is what is corrected."*

| | PRE_GATE (LCC R11) | AUTHORITATIVE GATE-A |
|---|---|---|
| receipt | `docs/ai/lcc-r11/m0-identity-receipt.json` | `docs/ai/lcc-r12/m0-gate-a-receipt.json` |
| walk | `.tmp-new2/upstream3` | `.tmp-new2/m0-upstream` |
| manifest sha256 | `d5ae427c7f4a1786037e710969a178f33ea48611d105f9c8baa2d33c966dc0e5` | `a72d98686d4d8a01006cb748a228126c4c781cd285c95745b95c25eeb5e5ac50` |
| `upstreamUnique` | 18,947,807 | **18,951,606** |
| `rowsRead` | 20,295,796 | 20,299,598 |
| observed | 2026-08-29T10:11:42Z manifest | 2026-08-29T13:47:48Z → 13:59:21Z |

The Gate-A PASS stands as historical truth. The two figures differ by 3,799
because the HC bucket writes daily; neither was renamed.

### 4.1 The authoritative receipt was verified, not trusted

Every hash the receipt binds was recomputed against the live file this session:

```
manifest .tmp-new2/m0-upstream/objects.json    a72d9868…  MATCH
parity          docs/ai/new2-r10/parity-matrix-gate.json      MATCH
freshness       docs/ai/new2-r10/source-freshness-gate.json   MATCH
operationalGate docs/ai/new2-r10/R10_OPERATIONAL_GATE.json    MATCH
frontier        docs/ai/new2-r10/coverage-frontier-gate.json  MATCH
freshnessObs    docs/ai/new2-r10/freshness-observation.json   MATCH
definition      docs/ai/new2-r10/hc-parity-definition-v2.json MATCH
```

It records all nine required components: `observedAt`, manifest SHA,
`upstreamUnique`, partition count (1,438, zero partition errors), definition
version + SHA (`HC_PARITY_V2_2026-08-29` / `1e5bdd90…`), canonical identity-set
digest (`d746088b…`), parity artifact SHA, freshness generation
(`2026-08-29T14:38:58.523Z#a47d446ffc51`), and source-byte retention — declared
honestly as `SOURCE_BYTES_RETAINED: false`, `SOURCE_REFETCH_REQUIRED: true`.
Nothing was reconstructed from current values.

**CONFLICT — one bound artifact is not committed.**
`docs/ai/new2-r10/freshness-observation.json` matches the receipt at its
**working-tree** sha `47676cd9…`; the **HEAD** version hashes to `116a1748…`.
The receipt therefore binds to an uncommitted file, and a clone of HEAD cannot
reproduce that binding. NEW2 owns the path; not committed by this lane.

---

## 5. MIGRATION AND HEAD TRUTH

Committed, applied and fresh-install were all read separately. Applied-only state
was not accepted as repository truth.

```
committed migrations        100  (packages/db/drizzle/*.sql, journal entries 0..99)
applied  migrations         100  (drizzle.__drizzle_migrations, max created_at 1788037236331)
manifest classification     100  APPLIED_RECORDED, 0 APPLIED_UNRECORDED, 0 UNAPPLIED
journal check               OK — journalled, ordered, tracked and unedited
```

The 25 Aug state recorded in `migration-fresh-install-proof.mjs` (58 recorded
against 87 journalled, 28 APPLIED_UNRECORDED) is **closed**. Journal head is
`0099_matter_workspace_defaults_from_user`; live max matches it exactly.

**Fresh-install proof, run this session on a disposable database**
(`lawmind_freshinstall_probe_25432`, created, migrated, re-migrated for no-op,
dropped; artifact `docs/ai/lcc-r13/fresh-install-proof-day0.json`):

```
VERDICT: EQUIVALENT      divergences: 0      bookkeeping rows: live 100, fresh 100
                live   fresh
extensions         3       3
columns         1019     934     0 only-live, 0 only-fresh (+85 lane scratch)
tables           102      91     0 only-live, 0 only-fresh (+11 lane scratch)
indexes          294     278     0 only-live, 0 only-fresh (+16 lane scratch)
constraints      950     905     0 only-live, 0 only-fresh (+45 lane scratch)
enums             37      37
views              5       5
functions        158     158
invalid_indexes    0       0
```

An empty database reaches the live **product** schema from the journal alone.
157 objects exist only on the live box; all 157 are lane scratch and were never
migrations.

### 5.1 `new1_doc_vector_stage.snapshot_hash` — reported, not fixed

Per instruction, inspected only. No migration authored, no writer modified, no
NEW1 worker touched.

**Live column, from `information_schema`:**

```
snapshot_hash | text | NULLABLE | DEFAULT '5b5d02384b46c96c'::text
```

**Live population, queried 2026-08-30T06:58Z:**

```
total rows        3,051,225
snapshot_hash set 2,564,270   all one value, '5b5d02384b46c96c'
snapshot_hash NULL  486,955   distinct hashes: 1
```

The 486,955 nulls are NEW1's pre-stamp v1 generation, consistent with bus 1559.

**Does HEAD contain a migration and writer semantics sufficient to reproduce this
field? NO, on both halves.**

1. **No migration declares the table or the column.** `git grep snapshot_hash --
   packages/db/drizzle` → zero. Every mention of `new1_doc_vector_stage` under
   `packages/db/drizzle` (0066, 0067, 0093) is a prose comment inside a migration
   about something else. The column is absent from the Drizzle schema in
   `packages/db/src`.
2. **The only creator is the worker**, `services/harness/src/doc-vector-embed.mjs:379`,
   `CREATE TABLE IF NOT EXISTS new1_doc_vector_stage (...)` — and **that DDL does
   not declare `snapshot_hash` at all.**
3. **No writer ever names the column.** `git grep snapshot_hash -- services` finds
   it in exactly two places: a refusal guard in
   `services/api/src/ops/release-export-cli.ts` and a read predicate in
   `services/harness/src/tranche-reach-delta-cli.mts`. Every stamped row got its
   value from the schema default, not from the job that produced the vector.
4. The `ALTER TABLE … ADD COLUMN IF NOT EXISTS snapshot_hash text` statement
   exists **only as recorded text** inside two evidence artifacts
   (`docs/ai/embedding-manifests/EMBEDDING_IDENTITY_V2.json:104`,
   `docs/ai/new1-r10/NEW1_R10_ROUND.md:231`). Nothing executes them.

**CONFLICT with bus 1559 (NEW1 R12).** NEW1 states *"a fresh database stamps every
row NULL."* The measured fresh-install state is stricter: the whole table,
including `snapshot_hash`, is **absent** from a fresh install — it appears in
`diffs.columns.lane_scratch_only_in_live` as
`new1_doc_vector_stage.snapshot_hash :: text NULL DEFAULT '5b5d02384b46c96c'::text`,
and the worker's own `CREATE TABLE` would then rebuild the table **without the
column**. NULL is what a *reader* of the current box would infer; column-absent is
what a fresh clone actually produces. Both statements share the same conclusion —
the identity is not reproducible — and NEW1's remains directionally right.

`SNAPSHOT_HASH_DURABILITY_STATE = NOT_REPRODUCIBLE_FROM_HEAD` (schema and writer
both). REPRO_DEBT_1 stays **OPEN** and still blocks HNSW.

---

## 6. WHAT THIS SEAL CHANGED

Five files. Four append-only corrections plus two new evidence artifacts.
No lane-owned work outside LCC's paths was staged, committed or mutated.
No background worker was stopped. No migration was authored or applied.
No eCourts live-request budget was spent.
