# NEW3 R25 — Gate C is accepted, and the bearer requirement is superseded

**Decided 18 September 2026 by NEW3 (product/release acceptance owner).**
Machine-readable record: `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.json`.
Ledger entry: `CCR-NEW3-R25-01` in `docs/product/CONTRACT_CHANGE_LEDGER.json`.

This round performed **no product audit and implemented no feature.** It consumed
four lanes' finished evidence, recorded one founder decision, froze the gate, and
authorised teardown. Nothing was re-run.

## 1. Anchors

| Anchor                       | SHA / value                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `HEAD_START`                 | `523626bc41e7028b90980a9db32bc863c66912dc`                            |
| `origin/main` at round start | `312421f46f9bc8cbad6ee37212743680df54de98` (local ahead by 2 commits) |
| `ACCEPTED_REMOTE_RUNTIME_SHA`| `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a`                            |
| `ACCEPTED_CLIENT_SHA`        | `fae456c8` (RCC: `git diff --name-only 9fc20c0d..fae456c8 -- apps/` is empty) |
| `FIFTH_AUDIT_HEAD`           | `92324d1a8e1ff1a5e445dcc74295f3859a421150`                            |

The remote deployment has not rolled since the run being adjudicated; FIFTH
re-confirmed `a09d7ee5` live at `/version` independently of LCC's report.

## 2. The founder decision — binding, recorded, not inferred

**Current founder instruction, 18 September 2026.** The previous Gate-C
requirement specifically demanding a **cellular / mobile-data transport** is
**superseded**. The invariant Gate C actually requires is:

`REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW`

A physical production/staging client may use **either** ordinary
Internet-connected Wi-Fi **or** cellular/mobile Internet, provided the evidence
proves all of:

1. remote public HTTPS API;
2. no localhost / founder-workstation serving path;
3. no ADB reverse or forward API networking;
4. no VPN or development tunnel;
5. standalone deployable client;
6. real remote authentication;
7. Search → Reader → Save → Matter;
8. durable state after relaunch / refetch.

### What this decision does NOT do

`CELLULAR_BEARER_REQUIREMENT = SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION`

**and specifically not** `REMOTE_MOBILE_DATA = PASS`.

Cellular never ran and never passed. On both device-days the only VALIDATED
cellular agent was IMS and the SIM carried no data plan; `rmnet1` holds a global
IPv6 address with `mobile_data 0`, which is the IMS/VoLTE PDN and carries no
INTERNET capability. Those readings stand **unedited** in `docs/ai/rcc-r31/` and
`docs/ai/rcc-r32/`. Nobody may cite Gate C as evidence that LawMind works on
carrier data. Carrier DNS / CGNAT / IPv6 behaviour was not evaluated and no
current criterion requires it.

`REMOTE_MOBILE_DATA_PROVEN = NO` — carried forward as an open, unproven property,
not as a failure and not as a pass.

## 3. Gate C convergence

FIFTH's latest formal verdict (`docs/ai/fifth/gate-c-final/VERDICT.md`, bus 1808)
is `GATE_C = PASS`, with `REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW = PASS`, P0 = NONE,
no required row outstanding. FIFTH graded RCC's **existing** evidence against all
ten invariants, verified two of them in client source rather than accepting the
round record, introduced no new network test, and marked the row PASS on evidence
rather than on the rule change.

**`GATE_C_ACCEPTED = YES`. Frozen this round.**

### Accepted evidence, bound (not re-run)

| Binding                       | Artifact                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Accepted remote runtime SHA   | `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a` (live `/version`, FIFTH-confirmed)                          |
| LCC R32B DigitalOcean         | `docs/ai/lcc-r32b-do/` — `ROUND.md`, `precheck.json`, `remote-smoke-final.json`, `RESOURCE_LEDGER.json` |
| LCC R33 authentication        | `docs/ai/lcc-r33/ROUND.md`, `remote-acceptance.json`; commits `ba644d78`, `a09d7ee5`; bus 1802         |
| RCC physical evidence         | `docs/ai/rcc-r32/ROUND.md`, `acceptance.json`, `device/`; bus 1804; client `fae456c8`                  |
| FIFTH final verdict           | `docs/ai/fifth/gate-c-final/VERDICT.md`; bus 1808                                                      |
| Gate-S1 receipt               | `docs/ai/lcc-r32b-do/gate-s1-fix3/staging-gate-s1.json` — p95 **2,748 ms** ≤ 3,000 ms, `gitSha f7f532b1` |
| Corpus restore receipt        | `docs/ai/lcc-r32b-do/full-restore-trace.jsonl` (`RESTORE_VERIFIED`, `dangling:0`) + `full-restore-activation.json` |
| USER restore receipt          | `docs/ai/lcc-r32b-do/user-remote-backup-restore.json` (44 tables, `rowCountMismatches: 0`) + `user-restore-smoke.json` |
| Blue/green receipt            | `docs/ai/lcc-r32b-do/remote-bluegreen.json` — A→B→A, `pass:true`, 87 USER tables byte-identical        |
| R16 / R17 evidence            | `docs/ai/lcc-r32b-do/remote-smoke-final.json` — R16 idempotent replay same matter `489ee72a…`; R17 `409 CORPUS_TARGET_UNAVAILABLE` honest refusal |

### Two labels that must be quoted separately

The headline Gate-S1 receipt records `gitSha = f7f532b1`; the accepted remote
runtime is `a09d7ee5`. These are different facts about different runs. The
Gate-S1 numbers were produced on the release lineage FIFTH graded and stand as
accepted; nobody may print one SHA beside the other's numbers (N-1).

## 4. Deferred capabilities — UNCHANGED

Gate C passing enables nothing. Every state below is preserved exactly as it
stood before this round. `DEFERRED_CAPABILITIES_UNCHANGED = YES`.

| Capability / item                      | State (unchanged)                          | Source                                    |
| -------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `search.semantic.broad` (public)       | `INTERNAL_EXPERIMENTAL` — public DISABLED  | `V1_CAPABILITY_REGISTRY_R16.json`         |
| `search.semantic.supporting_authority` | `POST_V1`                                  | same                                      |
| `search.semantic.adverse_authority`    | `POST_V1`                                  | same                                      |
| HNSW index                             | `DEFERRED_HIGH_MEMORY_OFFLOAD`             | NEW3 R24B; `FQ-NEW1-R15-HNSW-OFFLOAD`     |
| Citation bulk apply                    | `HOLD`                                     | NEW3 R24B                                 |
| `statute.linked_judgments`             | `POST_V1`                                  | `V1_CAPABILITY_REGISTRY_R16.json`         |
| `statute.old_new_correspondence`       | `DISABLED_NOT_READY`                       | same                                      |
| Drafting / `generation.evidence_from_passages` | `POST_V1`                          | same                                      |
| `documents.upload_and_ocr`             | `DISABLED_EXTERNAL_BLOCK` (DPA outstanding)| same                                      |
| `language.hindi`                       | `POST_V1`                                  | same                                      |
| `briefing.daily_loop`                  | `DISABLED_NOT_READY`                       | same                                      |
| `monitoring.user_product`              | `DISABLED_NOT_READY`                       | same                                      |
| `ecourts.raw_observation_pipeline` / `.parser` / `.daily_pilot` | `DISABLED_NOT_READY` | same                                  |
| Verify-confirm physical row            | `NOT_APPLICABLE_UNREACHABLE_CURRENT_V1`    | NEW3 R24B B4                              |

**The R24B trigger stays binding.** The physical verify-confirm test becomes a
mandatory acceptance row before any feature that can introduce or display an
unconfirmed citation is enabled for users. Gate C enables none of them.

## 5. Nonblocking findings — carried forward, not fixed, not erased

None of these was fixed this round. The controlling roadmap does not make any of
them the next gate, so none was actioned here.

| Id  | Finding                                                                                                                           | Owner    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| N-1 | `REMOTE_RELEASE_SHA 27b55fa4` reported beside Gate-S1 numbers whose receipt says `f7f532b1`; `gate-s1-summary.json` omits the `gate-s1-final-warm` run on disk | LCC      |
| N-2 | `/version` returns `deployedAt: null`, `imageDigest: null`, self-reported `gitSha` with no build provenance — fine for staging, **not** for production, and a passing gate does not make it fine | LCC      |
| N-3 | Cold unseen-query latency (1 of 8 at ~3.5 s) outside the frozen Gate-S1 suite. Root cause is sizing: **~98 GB TOAST against 31 GiB RAM**. Not a code defect. | LCC/NEW1 |
| N-4 | Corpus prewarm is a manual step; an unattended restart serves cold until traffic warms it                                          | LCC      |
| N-5 | `/version` says `environment: "production"` while `/ready` says `servingEnv: "staging"` on the same box, same sha. One label is lying, and it misroutes an incident | LCC      |
| N-6 | Full API suite 1288/1293 with one **latency** failure in `src/search/sparse-bound.test.ts` under self-contention; FIFTH recorded it `UNKNOWN`, not a pass. Full suite is not a Gate-C requirement | LCC      |
| N-7 | Pre-existing: body validation runs before auth on `POST /matters` — schema walkable unauthenticated. No data disclosed, no write performed | LCC      |
| N-8 | *Case type* / *Our side* chips report `selected="false"` in the accessibility tree while visually selected. Matters to a screen-reader user | RCC      |
| N-9 | The non-debuggable flag dump covers release build 1; the R32 rows came from release build 2. Equally non-debuggable is **inferred** from build type, not observed. A `dumpsys package` capture at install time closes it | RCC      |

Also carried, unresolved and **not** a Gate-C row: `REMOTE_MOBILE_DATA_PROVEN = NO`
(§2). And `matter_authorities` is emptied by a corpus rollback (LCC bus 1721) —
recorded, not re-opened here.

## 6. Next gate

Read from the controlling artifact, not from memory.

`NEXT_GATE = GATE_D — SPRINT 4: PRODUCT QUALITY + COMMERCIAL READINESS`

Controlling artifact: `docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_2.md` §"SPRINT 4"
(lines 1168–1216), authority confirmed by
`docs/roadmaps/LAWMIND_V7_2_AUTHORITY_MANIFEST.json` (v7.2 supersedes v7.1 and
SPRINT_PROMPTS_V2). Window **19 September – 2 October 2026**, Gate D target
**2 October 2026**. The roadmap states plainly: *"No major new features."*

Gate D requires, verbatim from the roadmap:

1. physical iPhone + low/mid Android green;
2. no P0/P1 design issue;
3. deletion end-to-end;
4. store packs complete;
5. billing green or explicit free launch;
6. monitoring claims ≤ measured capability;
7. per-platform claims correct;
8. Android API 36 and Apple Xcode 26 / iOS 26 submission builds proven.

Lane split for Sprint 4 per the roadmap: RCC device matrix, accessibility, text
scaling, poor network, large judgments, auth/deep links, background/resume,
account deletion, store builds · NEW3 store packs, claims, iOS party-search
submission decision and default-off record, free-vs-paid launch decision · LCC
reliability, real alerting, deletion support, billing backend only if paid
launch, monitoring economics only if Shape A.

**Semantic search and HNSW are NOT the next gate.** They remain deferred per §4.
This is stated explicitly because the deferral is the kind of thing a later agent
reasons its way out of.

## 7. Teardown — authorised, immediate

`TEARDOWN_AUTHORIZED = YES`, effective on this record. FIFTH correctly declined
to authorise teardown; that call belongs to the acceptance owner, and Gate C is
now accepted, so the evidence is bound and the resources are no longer needed.

- **Hard deadline: `2026-09-19T17:57:04Z`.** No extension is authorized.
- **Required completion, preferably before: `2026-09-19T12:00:00Z`** — a ~6 h
  margin against the earliest per-resource deadline in the ledger.
- Owner: **LCC**. Procedure: `docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md`
  §"Teardown". Inventory: `docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json` — 2 Droplets
  (`lawmind-gatec-corpus` 601138301, `lawmind-gatec-api-user` 601138316), 2
  firewalls, 1 VPC, 1 SSH key, 1 DNS A record `alpha-api.lawmind.co`.
- `ubuntu-s-vikas` (566518737) is `FOREIGN_EXISTING_RESOURCE_DO_NOT_TOUCH` and
  must survive teardown untouched.

**Required post-teardown proof** — no Gate-C billable cloud resource remains:

1. `final-status.json` written **before** destruction;
2. `teardown --confirm` executed against every ledgered resource;
3. `precheck` output showing **no** `lawmind-gatec-*` Droplet and
   `ubuntu-s-vikas` still present;
4. the DNS A record removed (`dns-remove`), zone otherwise untouched;
5. `RESOURCE_LEDGER.json` updated so every entry carries a non-null `destroyedAt`
   and `destroyRequired` is satisfied;
6. a final accrued-cost line, and the statement that recurring Gate-C compute is
   **USD 0**.

Evidence is preserved on disk in `docs/ai/lcc-r32b-do/`, `docs/ai/lcc-r33/`,
`docs/ai/rcc-r31/`, `docs/ai/rcc-r32/` and `docs/ai/fifth/` and is not destroyed
by teardown. A passing gate is not permission to destroy the record.

## 8. Credential rotation — after teardown is proven

`ROTATE_EXPOSED_REMOTE_CREDENTIALS = REQUIRED`

Sequenced **after** LCC proves teardown complete — rotating first would strand the
teardown itself. The founder must revoke and replace:

1. the **DigitalOcean** API token;
2. the **Resend** API key;
3. the **Spaceship** key and secret.

No value is printed here, in the JSON record, in the founder queue, or on the bus.
Queued as `FQ-NEW3-R25-ROTATE` in `docs/FOUNDER_QUEUE.md`.

## 9. What this round did not do

- No product audit, no feature, no capability enabled.
- No evidence re-run: not Gate-S1, not the restores, not blue/green, not R16/R17,
  not the device matrix.
- No historical record rewritten. The cellular HOLD readings in rcc-r31 and
  rcc-r32 are untouched.
- No nonblocking finding fixed.
- No resource destroyed by NEW3 — teardown is handed to LCC, who owns the ledger
  and the runbook.
