# GATE B — NEW3 PRODUCT PREFLIGHT

**NEW3, 30 August 2026. Gate B target: 4 September.**

**This is evidence prepared FOR FIFTH. It is not FIFTH's audit.** NEW3 does not
grade its own gate. Every claim below names the artifact that carries it so an
independent auditor re-checks rather than re-derives.

**Measured against `gitSha f3b31c963dd19741b7a849d8a007d42aa1b9bfb1`** — the HEAD
sealed by LCC's Day-0 integration seal (bus 1567, artifact
`docs/ai/lcc-r13/SPRINT2_DAY0_INTEGRATION_SEAL.md`, commit `2b378f7`).

---

## 1 · API CONTRACT — frozen, versioned, amendment process operational

| requirement | state | evidence |
|---|---|---|
| frozen | **YES** | `RCC_V1_API_CONTRACT_R12.md`, sha256 `e89d93c8…d5ed`, git blob `8c0159ba…` |
| versioned | **YES** | R12 → R13. R12 **not edited**; amendments in `RCC_V1_API_CONTRACT_R13_AMENDMENT.md` |
| process operational | **YES** | `CONTRACT_CHANGE_CONTROL.md` (process) + `CONTRACT_CHANGE_LEDGER.json` (decisions) |
| wire `contract` integer | **1**, unchanged | every amendment is additive or semantic; nothing removed or narrowed |

**5 CCRs received · 3 AMEND · 1 DEFER · 1 REJECT_WITH_ALTERNATIVE · 0 undecided ·
0 P0 open.**

Two of the five are **retrospective, self-filed**, and are in the ledger precisely
because they are the failure modes the process exists to route: RCC re-measuring a
NEW3 row (it reported rather than edited — correct), and LCC editing a NEW3 frozen
artifact (correct content, wrong route — **ratified, not reverted**; reverting a
correct correction to make a process point would leave a false state in the
registry).

**One AMEND is deliberately NOT released to RCC.** `CCR-2026-08-30-04`
(`capabilities[].platforms`) is decided and handed to LCC, and RCC must not build
against it — no backend serves it. `releasedToRCC: false` is the field that says so.

---

## 2 · CAPABILITY REGISTRY — per platform, no ENABLED without named evidence

`V1_CAPABILITY_REGISTRY_R13.json`, supersedes R12.

| | |
|---|---|
| rows | **30** |
| carries `platforms {ios, android, web}` | **30 / 30** |
| ENABLED on ≥1 platform | **18** |
| **ENABLED without named evidence** | **0** |
| every `docs/**` evidence path checked for existence on disk | **yes**, mechanically |
| carries `evidenceState` + `currentContractVersion` | **30 / 30** |

**No capability is enabled merely because client code exists.** Asserted and
checkable: `search.semantic.broad` has a working, client-reachable implementation
and stays `INTERNAL_EXPERIMENTAL` on every platform. The desktop workspace files
exist in the tree, are inert below 900 px, and enable no row.

**Three rows moved, 27 carried forward** and are marked
`carriedForwardFromR12: true`. A per-platform re-issue is not a licence to
re-adjudicate rows nobody measured.

**UNKNOWN remains UNKNOWN.** Every row reads `UNKNOWN_PENDING_FOUNDER` for `web`,
because two binding documents disagree about whether an advocate web surface exists
(`FQ-WEB-SURFACE`). Not enabled, not disabled — and no claim in either direction.

---

## 3 · ACCEPTANCE — no outstanding P0, only affected cases rerun

`NEW3_ACCEPTANCE_DELTA_R13.json`.

| case | verdict | why it was run |
|---|---|---|
| **AB-1** party-name workflows | `PASS_WITH_LIMIT` | backend `d96147e` landed |
| **AB-2** filtered broad-query workflows | `PASS_WITH_LIMIT` | backend `d96147e` landed |
| **CTRL-CITATION** exact-citation positive control | `PASS` | required by the round |
| **CTRL-CORELOOP** Search → Reader → Save → Matter | `PASS` | required by the round |

```
P0_OPEN = 0
P1_OPEN = 2
```

**P1-1** — `retrievalOutcome.rarestDf` is corpus-wide and invariant under filters
(`CCR-2026-08-30-02`, AMENDed, released). **P1-2** — treatment provenance is not on
the wire, so a reporter's annotation and a court's own words render identically
(`CCR-2026-08-30-05`, DEFERRED to Gate C with a named interim behaviour).

**The other eight ten-matter cases were NOT rerun and their R12 verdicts stand.**
Rerunning them would have spent fixture writes on append-only tables to re-observe
an unchanged result — and a suite killed part-way has already left rows behind in
this repo once.

**No acceptance case is labelled PASS whose backend dependency has not landed.**
`d96147e` is an ancestor of HEAD, verified by `git merge-base --is-ancestor`, not
by a filename.

**Cleanup verified, not assumed:** the run deleted by *owner*, not by the ids the
responses exposed — `matters 1, matter_authorities 1, users 1, auth_user 1`, and
residual `usersLeft 0, mattersLeft 0`.

---

## 4 · FIRM-READY WORKSPACE OWNERSHIP — frozen

```
FIRM_READY_WORKSPACE_OWNER = NEW3 (product definition) · LCC (schema)
FIRM_READY_FREEZE_STATE    = VERIFIED_UNCHANGED
```

Verified against the live database, not inferred from the freeze document:
**542** workspaces · **542** members · **0** matters with a null `workspace_id` ·
`monitoring_entitlements` **0 rows** (frozen and unused, as specified) · **0**
workspace columns on `ecourts_observation`.

LCC implemented the model in `7b570b7` (migrations 0097–0099) **to the frozen
model**, with no semantic redefinition, and RCC's contract gained no field. **No
second lane has independently redefined Workspace semantics.** Not redesigned in
this round.

---

## 5 · PARTY SEARCH — case-first, platform-flagged, iOS degrade defined

| requirement | state |
|---|---|
| case-first semantics | **YES** — no person-first surface, no person profile, no "search anyone's court history" |
| platform flag | **YES** — `ENABLED_V1_KILLABLE` on iOS, `ENABLED_V1` on Android |
| iOS degrade product definition | **YES** — visible degrade to case-number / citation / CNR with a stated message; never a silent disappearance |
| capabilities the switch must not disable | **named**: `search.exact_citation`, `search.cnr`, `search.case_number`, `search.case_title_full` |
| per-platform claim | **YES** — claims register A9; the sentence comes off the App Store listing the same day the switch flips |

**Honest limit on the switch:** it is **build-time** today. `GET /release/capabilities`
was observed on 30 August — 24 rows, and the string `platform` appears **nowhere** in
the payload. The served form is `CCR-2026-08-30-04`, AMENDed, handed to LCC, not
released. Until it lands, flipping the switch needs an App Store release, which is
the situation the switch exists to avoid.

**Android is not weakened because the iOS switch exists.**

---

## 6 · WHAT NEW3 IS HANDING FIFTH, BY PATH

| artifact | what it proves |
|---|---|
| `V1_CAPABILITY_REGISTRY_R13.json` | per-platform capability truth, 0 ENABLED without evidence |
| `V1_CLAIMS_REGISTER_R13.md` | per-platform claims, 0 unsupported |
| `CONTRACT_CHANGE_CONTROL.md` + `CONTRACT_CHANGE_LEDGER.json` | the amendment process is operational, with decisions |
| `RCC_V1_API_CONTRACT_R13_AMENDMENT.md` | what RCC may consume, and what it may not |
| `NEW3_ACCEPTANCE_DELTA_R13.json` | the affected-case rerun and both controls |
| `NEW3_R13_PRODUCT_AMENDMENTS.md` | the eCourts correction and the two capability moves |
| `TRUST_STATE_PRODUCT_CONTRACT_V1.md` | 10/10 states representable; the two under strain, named |
| `LAUNCH_SHAPES_V1.md` | both shapes executable, launch date fixed |
| `MONITORING_12_CONDITION_MATRIX.json` | the 8 September decision cannot cherry-pick |
| `CORRECTION_WORKFLOW_V1.md` · `ANALYTICS_EVENT_DEFINITIONS_V1.md` | correction states and metric denominators |
| `RESEARCH_TASK_SET_V1.json` | 50 tasks, threshold deliberately unset |
| `NEW3_V1_PRODUCT_DEFINITION_R12.md` | frozen baseline, **+68 / −0**, correction appended not rewritten |

---

## 7 · WHAT NEW3 IS **NOT** CLAIMING, STATED SO FIFTH DOES NOT HAVE TO FIND IT

- **Gate B check 0 is FIFTH's, not ours.** The Day-0 seal is LCC's artifact and
  partly audits LCC's own commits. NEW3 read it and built on it; NEW3 did not
  re-verify its git ancestry independently.
- **`ecourts_observation = 0` and the bounded stop report is LCC's to produce.**
  Roadmap v7.1 says this check passes only alongside a completed bounded stop
  report — *"0 because work was not attempted" is a HOLD*. LCC's
  `ECOURTS_AJAX_BLOCKER.md` records eight refuted hypotheses and a stop under the
  three-failure bound; **whether that satisfies the check is FIFTH's call, not
  NEW3's.**
- **Monitoring readiness.** 0 of 12 conditions pass. On present evidence the
  8 September decision selects Shape B, and the launch date does not move.
- **Web/desktop.** Contested and founder-owned. NEW3 did not resolve it and the
  registry says `UNKNOWN` in every row rather than guessing.
- **The eight unrerun acceptance cases.** Their R12 verdicts stand and were not
  re-observed this round.
- **Latency stability.** The AB-2 scopes were measured twice, ~40 minutes apart,
  and the same admitted query read **3,760 ms** cold and **418 ms** warm. The
  recorded numbers are the second run. **A single latency figure from this box is
  not a p50**, and no product decision here rests on one.

---

## 8 · HANDOFFS OUT OF THIS ROUND

**To LCC:**
1. `CCR-2026-08-30-04` — serve `capabilities[].platforms` on `GET /release/capabilities`. Additive, optional, no migration, `contract` stays 1. Unblocks the iOS kill switch from build-time to served.
2. `CCR-2026-08-30-05` — `treatment_provenance` on the wire. Deferred to Gate C, named here so it is not lost.
3. **Not a CCR, but you should know:** `platform_config.signups` is `enabled: false` on this box with `reason: "test cleanup"`, set by a test actor. Signups are OFF locally. Same class as the harvesting switch a killed suite left ON.

**To RCC:**
1. Contract **R13** is released for amendments A1 and A2. Both v1 search limits in R12 are superseded — a bare party name now resolves, and one named court plus a month admits a broad term.
2. **Do not build against `capabilities[].platforms`** (A3). Not released.
3. `retrievalOutcome.rarestDf` is diagnostic only. Do not derive a user-facing narrowing hint from it. Use `emptyBecause` and `degraded[]`.
4. The refusal screen must offer **one named court and a shorter date range**. A court *category* chip is not a narrowing remedy — measured, it is still refused.

**To the founder:** `FQ-WEB-SURFACE` — one sentence on whether advocates get a
web/desktop surface. Nothing is blocked on it; Sprint 5's 9 October desktop
deliverable is.
