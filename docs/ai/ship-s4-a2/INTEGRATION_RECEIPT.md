# SHIP S4-A2 — AMENDMENT A2 INTEGRATION RECEIPT

```text
AGENT = SHIP · MODE = SHIP/RELEASE + SHIP/COORDINATION
OBJECTIVE CLASS = GOVERNANCE / EXECUTION-SEQUENCING INTEGRATION
DATE = 19 September 2026
HEAD_START = f36d40103308762ec8e12f42a80314161b7e4294
HEAD_FINAL = 368ba1b8202d56b70a0f6fe585afe822b83f9be0   (the A2 integration commit)
COMMITS    = 2 — 368ba1b8 integration · this commit fills HEAD_FINAL, because a
             receipt cannot contain its own commit hash
```

Amendment A2 — **DATA MOAT & LEGAL-INTELLIGENCE FRONTIER** — is installed in the
governing v7.4 / prompts-v5 files using A1's authority mechanism. No v7.5 exists, no
parallel A2 roadmap exists, and no future agent has to choose between two documents.

---

## 1 · Anchor

`git fetch origin` → `origin/main == HEAD == f36d4010`, matching the expected anchor
exactly. Per the round's own instruction, **no general reconciliation was re-run**: the
accepted receipts were consumed, not re-audited.

Accepted as input and not re-measured:

| input | record | state consumed |
|---|---|---|
| SHIP S4-T0.1 | `docs/ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md` | PASS; A1 mechanism; SHIP/DATA/RED topology; authority lint PASS |
| SHIP S4-T0.2 | `docs/ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md` | **HOLD — REPOSITORY_CI_BASELINE_NOT_GREEN**, with its hosting subresults intact |
| SHIP S4-T0.3 | `docs/ai/ship-s4-t0-3/CI_ALERT_REGISTRY_CLOSURE.md` | PASS; `REPOSITORY_CI = PASS`; registry R18 |
| DATA S4-D0 | `docs/ai/data-s4-d0/CONTINUITY_RECEIPT.md` | **PASS**; census figures carried into A2 |

`DEPLOYED_SAFETY = NOT_RUN_NO_DEPLOYED_TARGET` was **not** converted to PASS.
`T0.2 OVERALL = HOLD` was **not** rewritten. Historical FAIL/HOLD/UNKNOWN states stand.

## 2 · The two founder decisions A2 records

**Private beta.** ~100 already-contacted practising lawyers, one programme, staged
internally: Wave 0 canary (~5) → freeze metric and severe-defect definitions → Wave 1
(~20–25) → Wave 2 (~100). Primary distribution is a **direct signed Android APK**.
Play and App Store publication are **not** prerequisites. This supersedes the 3–5
shadow beta + 10–30 closed beta sequence; iOS stays in product and public-launch
scope, and its store submission is resequenced rather than cancelled.

**Cost control.** `BUILD AGGRESSIVELY / SPEND CONSERVATIVELY`, implemented as a
two-stage spend gate (roadmap §13.1.1) rather than as an exhortation. Stage A closes
everything achievable on the existing workstation, database, CI and release artifacts
until `PRIVATE_BETA_CANDIDATE_LOCAL = READY_EXCEPT_REMOTE_ONLY_PROOF`; Stage B buys
the smallest environment that can carry final remote acceptance, the staged beta and
Gate-E evidence — and only after explicit founder approval.

This is deliberately **not** a reversal of v7.4 §13's reasoning. Remote proof still
has to happen; A2 changes when the money starts, not whether the evidence is taken.

## 3 · Edits, and why each file

| file | change |
|---|---|
| `docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md` | A2 banner + change table; **NEW** §0.4, §13.1.1–13.1.3, §14.13.1, §15.4, §16.1–16.4, §17.0, **NEW §26** (eleven strategic programs); §16 superseded with the original preserved unedited as §16.5; §17 resequenced; §24 updated |
| `docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md` | A2 banner; §3 S4-R0 resized and repriced; §4 S4-R1 behind the spend gate; §6 S4-R3 → staged private beta; §7 Gate-D checklist reclassified; §10 → post-beta public path |
| `docs/roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md` | durable authority history: why A2 patched v7.4, what was superseded vs deferred, the two primary-source facts |
| `docs/roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json` | `amendments[] += A2` with pre-edit bytes/sha256 and recomputed canonical hashes; **A1 preserved byte-for-byte** |
| `docs/CURRENT_STATE.md` | live pointer: amendments A1+A2, private-beta plan, S4-D0 data state, spend posture |
| `docs/intelligence/LEGAL_TECH_FRONTIER.md` | **NEW** non-governing dated radar with the promotion path |
| `docs/intelligence/SOURCE_OPPORTUNITY_REGISTER.md` | **NEW** source register; authorizes nothing |
| `docs/research/DELHI_HIGH_COURT_PRIMARY_SOURCE_PILOT.md` | **NEW** source-lab design; ingest blocked pending written permission |

`docs/CURRENT_STATE.md` remains a **live pointer** and is deliberately not a hashed
authority snapshot. The dated 18 September ledger was **not edited** — its sha256 is
unchanged in the manifest.

## 4 · Manifest discipline

Pre-edit hashes were computed **before** any edit and are recorded at
`amendments[1].preEditFiles`:

```text
roadmap  68099 / da712ba267970399f96f623f2c57a912db3a9c8181e481d3d163e7dd4ab7e6f8
prompts  22960 / 0cfdb542f372324942de67d75e2ee832c8c5b328bd292b9dfaa40351b33a75e1
memo     14867 / 937b214538dac5ee8f940cb23f7b39237af7b2165d5e48138855364892a9fb81
manifest  3934 / b32e3b8c41f405d113090077dfe87ab7f260841861f8518f745523e1434b9262
ledger    4565 / ed76db2b7cd2943e723e2e311075b508d35b5bfe212b37f9d9939c61a77aecfd  (NOT edited)
CURRENT_STATE 14198 / ea5effa442ab4c1f0d4e2ab54299350a4d12ecf5c356b254e782538d35c2425d  (live; provenance only)
```

A1's `amendments[0]` was compared against `git show HEAD:` after the write and is
**identical**. The authority lint was **not weakened** to make A2 pass — the three
failures it reported mid-round were precisely the three stale manifest hashes, and
they were fixed by recomputing, not by relaxing the rule.

## 5 · Primary-source recheck (only what this round needed)

**Android developer verification**, read from Google's own documentation on
19 Sep 2026:

```text
LIMITED_DISTRIBUTION_DEVICE_LIMIT = 20 devices per APK
ENFORCEMENT_2026_09_30            = Brazil, Indonesia, Singapore, Thailand
GLOBAL_EXPANSION                  = 2027 and beyond
INDIA_IN_SEPTEMBER_2026_WAVE      = NO
```

Consequences recorded in roadmap §16.4: the limited-distribution path is **unsuitable**
for a ~100-lawyer cohort (20 < 100), and nothing blocks a direct APK beta in India
today. Verified-developer status stays a **future** distribution requirement. This
refines — and does not contradict — `CURRENT_STATE.md` §9: the 30 September date is a
verify action, not a publish deadline, and LawMind's Play console state has still never
been observed. Source: https://developer.android.com/developer-verification

No other external research was performed. Nothing else in this round needed it.

## 6 · Carried, not hidden

A2 concerns strategy and sequencing, and it may not bury live defects. Unresolved SHIP
reliability work stands unchanged: **N-2** deployment provenance · **N-3** cold
unseen-query capacity · **N-4** manual prewarm after activation/restart · **N-5**
`/version` vs `/ready` environment mismatch · **N-6** full API suite quiet-run state ·
**N-7** protected request body validation before auth · **N-8** accessibility
selected-state defect · **N-9** release-build flag evidence · and corpus rollback
possibly removing or orphaning `matter_authorities`.

Gate-C historical facts are untouched: `GATE_C = PASS`, accepted runtime
`a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a`, `GATE_C_INFRA = DESTROYED_VERIFIED`, zero
billable resources remaining, `REMOTE_MOBILE_DATA_PROVEN = NO`,
`CELLULAR_BEARER_REQUIREMENT = SUPERSEDED`, and the Gate-S1 measurements
(p50 ≈ 350 ms, p95 ≈ 2,748 ms, p99 ≈ 3,453 ms) with the known cold-query limitation.
Public Wi-Fi pass is not cellular proof; a Gate-C pass is neither persistent-beta nor
production readiness. Retrieval was **not** changed to make the cold-query number
prettier — it is an infrastructure sizing input for S4-R0.

Founder security actions remain **OPEN**: `DO_TOKEN_ROTATED`, `RESEND_KEY_ROTATED`,
`SPACESHIP_KEY_SECRET_ROTATED`, `R2_BACKUP_KEY_ESCROWED`. Destroyed hosts do not
invalidate leaked-but-still-valid API credentials, so teardown is not completion. No
secret value was inspected or exposed, and nothing was rotated by SHIP.

`DELTA_SCHEDULER` stays Interactive/logon-only and `platform_config.signups` stays
DISABLED. Both are SHIP implementation items for a later round and were **not** changed
here.

## 7 · Verification actually run (bounded, as instructed)

| check | result |
|---|---|
| `git fetch origin` / anchor match | PASS — HEAD == origin/main == expected |
| `node scripts/lawmind-authority-check.mjs` (worktree) | **PASS — 79/79** |
| same check against the **HEAD tree** (`git archive HEAD` → `--root`) | **PASS — 78/78**. This repo is a shared worktree with other lanes' uncommitted files in it, and two of the files that check reads in full are dirty right now — so a green worktree run alone would have been partly a statement about someone else's work in progress. The one missing check is the tracked-bus-message scan, which the script skips without a real `.git`, as its own comment says. |
| manifest JSON parse | PASS |
| A1 `amendments[0]` vs `git show HEAD:` | **identical** |
| dated ledger sha256 unchanged | PASS |
| format gate scope | docs markdown and `docs/roadmaps/*.json` fall outside `pnpm format`'s glob (`{services,packages}/**/*.{ts,js,json}` plus root), so no formatter can rewrite a hashed artifact |
| lane/bus files changed? | **NO** — no lane, bus or hook file touched, so bus tests were not required |

Deliberately **not** run, because none is part of A2 integration: full corpus census ·
vector integrity · Gate-S1 · Gate C · device matrix · eCourts probe · citation candidate
generation · HNSW probe · full remote API probe.

## 8 · Acceptance

```text
A2_INSTALLED_USING_A1_AUTHORITY_PATTERN = PASS
NO_V7_5                                 = PASS
FRONTIER_RADAR_NON_GOVERNING            = PASS
GATE_D_SCOPE_NOT_EXPANDED_BY_FRONTIER   = PASS
PRIMARY_SOURCE_FABRIC_RECORDED          = PASS   (§26.2)
FIVE_CLOCK_FRESHNESS_RECORDED           = PASS   (§26.4)
SOURCE_CONTRACT_RECORDED                = PASS   (§26.2)
SOURCE_PASSPORT_RECORDED                = PASS   (§26.3)
COURT_EVENT_NON_INFERENCE_RECORDED      = PASS   (§26.5)
AUTHORITY_INTELLIGENCE_RECORDED         = PASS   (§26.6)
INDIAN_LEGAL_RESEARCH_BENCHMARK_RECORDED = PASS  (§26.9)
MODEL_INDEPENDENCE_RECORDED             = PASS   (§26.10)
DHC_PERMISSION_GATE_RECORDED            = PASS   (§26.11)
PRIVATE_BETA_100_LAWYERS_RECORDED       = PASS   (§0.4.1, §16.1)
APK_BEFORE_STORES_RECORDED              = PASS   (§0.4.1, §14.13.1)
OLD_3_5_PLUS_10_30_BETA_SEQUENCE_SUPERSEDED = PASS (§16; original preserved §16.5)
STAGED_100_LAWYER_BETA_RECORDED         = PASS   (§16.1)
STORE_SUBMISSION_MOVED_POST_PRIVATE_BETA = PASS  (§14.13.1, §17.0)
COST_CONTROL_DIRECTIVE_RECORDED         = PASS   (§0.4.3, §13.1.1)
NO_PAID_RESOURCE_CREATED                = PASS
NO_PRODUCT_CAPABILITY_ENABLED           = PASS
NO_DB_OR_CORPUS_MUTATION                = PASS
DATA_REMAINS_CONTINUOUS                 = PASS
RED_REMAINS_FROZEN                      = PASS
```

**V7_4_A2_INTEGRATION = PASS**
