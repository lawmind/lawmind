# SHIP S4-T0.1 — Authority + orchestration + governance repair

**SHIP, 18 September 2026.** One-time repair round. Docs, governance, orchestration
tooling and hooks only. No product behaviour, database, cloud or spend.

```text
HEAD_START          = 6b1355eb96ae46e6ad0c7d0441306dd6ea76618a
ORIGIN_MAIN_START   = 6b1355eb96ae46e6ad0c7d0441306dd6ea76618a
HEAD_FINAL          = __C2__   (the content commit; __C3__ only records these SHAs)
COMMITS             = 5ae98ce72db36604cb92b24261b00c087999caac  install the founder's v7.4 pack verbatim at docs/roadmaps/
                      __C2__  authority + orchestration repair (this round's content)
                      __C3__  record commit SHAs in this file and CURRENT_STATE.md
```

## Re-anchor (start)

```text
STAGED                 = 0 files
TRACKED_DIRT           = 84 modified + 1 deleted, all other sessions' (.agents/jobs, checkpoints,
                         docs/ai/new1-*, docs/*.md incl. .ai/09-project.md and docs/TECHNICAL_INVENTORY.md)
UNTRACKED              = 3,127 (logs, checkpoints, bus files, and the 5 founder v7.4 files under docs/)
GIT_COMMIT             = record holder LCC, pid 26156 GONE, status RELEASED
MIGRATION_SLOT         = record holder LCC, pid 23028 GONE (stale)
HEAVY_BOX              = record holder LCC, pid 35452 GONE (stale)
ACTIVE_SESSION_BINDINGS= 196 files, all legacy (LCC 63 · NEW2 39 · NEW1 36 · NEW3 32 · RCC 25 · FIFTH 1); 0 SHIP/DATA/RED
```

Foreign dirt in two files this round also had to edit (`.ai/09-project.md`,
`docs/TECHNICAL_INVENTORY.md`) was **not** swept in: those two were staged from a
blob built as `HEAD + this round's hunk only`. The other session's uncommitted
hunks stay in its working tree and remain its to commit.

## V7_4_FILES_FOUND_AT_START / PRE_EDIT_MANIFEST_CHECK / CANONICAL_PATHS

All five expected files were present, untracked, under `docs/`:

| File | bytes | sha256 | manifest |
|---|---|---|---|
| LAWMIND_MASTER_ROADMAP_V7_4.md | 52,277 | 4a0f5faf…655ec1 | MATCH |
| LAWMIND_SPRINT_PROMPTS_V5.md | 20,126 | 070e541c…152f06 | MATCH |
| LAWMIND_V7_4_RECONCILIATION_MEMO.md | 11,892 | 4aa230ab…c195b | MATCH |
| LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md | 4,565 | ed76db2b…7aecfd | MATCH |
| LAWMIND_V7_4_AUTHORITY_MANIFEST.json | 1,334 | 5c9cc5ab…daecd4 | (self; not listed) |

`PRE_EDIT_MANIFEST_CHECK = PASS (4/4)`. Untracked, so `git mv` did not apply: moved
with `mv` to `docs/roadmaps/`. No copy remains under `docs/`. The founder's exact
bytes are committed first (5ae98ce72db36604cb92b24261b00c087999caac) and their hashes are kept in the manifest under
`amendments[0].preEditFiles`.

```text
CANONICAL_PATHS = docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md
                  docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md
                  docs/roadmaps/LAWMIND_V7_4_RECONCILIATION_MEMO.md
                  docs/roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json
                  docs/roadmaps/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md   (unedited)
```

## v7.4 patched in place: Amendment A1

Roadmap: A1 table under the header, then §1.3 (ledger vs live pointer), §3.5 (bus
runtime), **§3.6 stop-the-line**, **§3.7 SHIP contract change control**, §4.2
(latest accepted registry), §11.2 (R33 invariant), §12.4 (DPDP), §12.5 (DPA +
verify-confirm triggers), §13.5 (alert delivery), §14.5 (external deletion auth),
§14.13 rows 20–23, **§14.14 store/release accounts**, **§14.15 security baseline**,
§15.2 (PBL8+), §19 (Gate E rows), §20.4 (policy rechecks), §22 (five risks).
Prompts v5: A1 block, preamble CURRENT STATE + STOP-THE-LINE, registry pointer,
S4-R1 §I alert delivery, S4-R2 accounts/security/external-delete, Gate-D and Gate-E
rows. Memo: §19 primary-source table. No v7.5.

## ACTIVE_STALE_REFERENCES_FOUND / FIXED / HISTORICAL_REFERENCES_PRESERVED

Search (tracked text, `git ls-files | grep -E`): every pattern the round listed, then
widened to `.ai/`, `.claude/`, `docs/API_CONTRACTS.md` and "governs … v7.x" phrasing.

```text
ACTIVE_STALE_REFERENCES_FOUND = 33 files (table below; several files had more than one stale line)
ACTIVE_STALE_REFERENCES_FIXED = 33 files
ACTIVE_STALE_COUNT            = 0   (pnpm authority:check PASS; its scope is the active set below)
```

| Class | Files |
|---|---|
| Bootstrap / read order | `AGENTS.md`, `CLAUDE.md` (§0, §1, §7), `.ai/09-project.md`, `.claude/commands/reanchor.md` |
| Injected every session/turn | `.claude/hooks/reanchor.sh` (TWO lanes, Tier A/B scope, CURRENT_PLAN as queue), `.claude/hooks/session-start.sh` (read order, TWO LANES) |
| Lane runtime | `lane-common.sh`, `lane-bus.sh`, `lane-wake.sh`, `scripts/lane-send.mjs`, `lane-inbox.mjs`, `lane-status.mjs`, `resource-lease.mjs`, `lane-lease.mjs`, `lane-bus.test.sh` |
| Current headers | `docs/CURRENT_PLAN.md`, `BUILD_GUIDE.md`, `PRODUCT_BRIEF.md`, `docs/LANE_BUS.md`, `docs/LANE_PROTOCOL.md`, `docs/API_CONTRACTS.md`, `docs/TECHNICAL_INVENTORY.md` (one line) |
| Governance | `docs/product/CONTRACT_CHANGE_CONTROL.md`, `CONTRACT_CHANGE_LEDGER.json` (top-level owner + registry pointers only) |
| Release / founder | `STORE_RELEASE_CHECKLIST_V1.md`, `EXTERNAL_ACCOUNT_DELETION_WEB.md`, `FOUNDER_QUEUE.md` (9 entries), `WEBSITE_PRODUCT_SPEC_V1.md`, `WEBSITE_CLAIM_EVIDENCE_MATRIX.md` |
| Pack | roadmap v7.4 + prompts v5 hard-coded `V1_CAPABILITY_REGISTRY_R16.json` |
| Code comments only | `ResearchWorkspace.tsx`, `MatterWorkspace.tsx` ("Master Roadmap v7.1 governs"): comment text only, no code |

`HISTORICAL_VALID`, preserved untouched: old roadmaps/prompts (`docs/roadmaps/*V5*,
*V7_1*, *V7_2*, *PROMPTS_V2/V3*`, v7.2 manifest), registries R12–R16, claims R13–R16,
every `docs/ai/**` round report, `docs/product/NEW3_*` and `GATE_B_PRODUCT_PREFLIGHT.md`
records, 1,821 bus messages, the CURRENT_PLAN and FOUNDER_QUEUE bodies below their
new banners/status notes, `docs/ACQUISITION_SESSION_LOG.md` and
`docs/AGENT_WORKFLOW_RESEARCH.md` ("five agents", dated),
`scripts/lcc-offsite-restore-proof.mjs` (asserts old files are IN a backup, which
is not an authority claim). `CURRENT_VALID`: CCR-SHIP-S4T0-01 quoting the old
state it replaces.

## CURRENT_PLAN_STATE / CURRENT_STATE_PATH

```text
CURRENT_PLAN_STATE = HISTORICAL OPERATIONAL JOURNAL, banner added, body untouched (+16 lines)
CURRENT_STATE_PATH = docs/CURRENT_STATE.md (LIVE; seeded from the dated ledger)
```

## AGENT_TOPOLOGY / BUS_MIGRATION / LEGACY_BUS_COMPATIBILITY

```text
AGENT_TOPOLOGY  = SHIP ACTIVE · DATA CONTINUOUS · RED FROZEN
ACTIVE_LANES    = SHIP DATA RED
LEGACY_LANES    = LCC RCC NEW1 NEW2 NEW3 FIFTH AUDIT-RO
DOWNSTREAM      = SHIP→DATA · DATA→SHIP · RED→SHIP (no ring)
LEASES          = GIT_COMMIT SHIP/DATA/RED · HEAVY_BOX SHIP/DATA · MIGRATION_SLOT, DB_MIGRATION, CLIENT_APPS SHIP
```

- New sessions bind only to active lanes. A legacy binding gets a named refusal,
  receives nothing, and does not advance the legacy cursor.
- `lane-send` refuses legacy recipients and legacy authors; `ALL` reaches active lanes only.
- `lane-inbox` reads active **and** legacy cursors, so legacy delivery state renders
  exactly as before. `lane-status` summarises legacy lanes without alarming on them.
- No bus file renamed or edited; the global sequence continues (1818 = first SHIP message).
- Legacy actionable scan + reissue: `LEGACY_BUS_REISSUE.md`. One HANDOFF sent:
  **bus 1818** `1818--SHIP-to-DATA--handoff-v7-4-topology-migration-reissued-legacy-.md`
  (refs 1583, 1591, 1813, 1814). SHIP-owned items (refs 1809, 1811, 1812, 1817) are
  recorded in `docs/CURRENT_STATE.md` §8. Founder items (ref 1815) are in `FOUNDER_QUEUE.md`.
- This session is bound as SHIP.

## CURRENT_CAPABILITY_REGISTRY / WEB_PLATFORM_STATE

```text
CURRENT_CAPABILITY_REGISTRY = docs/product/V1_CAPABILITY_REGISTRY_R17.json
CURRENT_CLAIMS_REGISTER     = docs/product/V1_CLAIMS_REGISTER_R17.md
R16                         = unchanged (git diff empty), still RELEASED/PROVEN historical evidence
WEB_PLATFORM_STATE          = OUT_OF_SCOPE_CURRENT_FOUNDER (30/30 rows; prior value kept as webStatePriorR16)
IOS / ANDROID               = inherited from R16, 30/30 rows equal
ADMIN_WEB                   = SEPARATE_INTERNAL_SURFACE · PROMO SITE = NOT_A_CLIENT_PLATFORM
CHANGE_CONTROL              = CCR-SHIP-S4T0-01: proposed + frozen before R17 was written, implemented,
                              then a separate post-implement acceptance (6/6 PASS). Vocabulary addition is additive.
```

Not changed (mutation boundary): the server still accepts `?platform=web`
(`runtimeObservationR16`). That is a selector, not an advocate client. Refusing it
would be a behaviour change, so it is a separate future SHIP CCR.

## EXTERNAL_DELETE_AUTH_SPEC / R33_MOBILE_MAGIC_LINK_PRESERVED

```text
EXTERNAL_DELETE_AUTH_SPEC          = SPECIFIED — docs/EXTERNAL_ACCOUNT_DELETION_WEB.md §3.3, ten invariants; NOT BUILT
EXTERNAL_DELETE_SURFACE            = lawmind/lawmind-site /delete-account (external repo; not apps/site)
R33_MOBILE_MAGIC_LINK_PRESERVED    = YES — magic-link-landing.ts and its test untouched; invariant #1 of the spec
```

## DPDP_SECTION_RESTORED / DPA_TRIGGER_RESTORED / VERIFY_CONFIRM_TRIGGER

```text
DPDP_SECTION_RESTORED  = YES — roadmap §12.4. Act G.S.R. 843(E) 13 Nov 2025: (a) on publication,
                         (b) 13 Nov 2026, (c) 13 May 2027. Rules G.S.R. 846(E): 1,2,17–21 on 13 Nov 2025;
                         Rule 4 on 13 Nov 2026; 3,5–16,22,23 on 13 May 2027.
                         DPDP_EFFECTIVE_DATE_RECHECK = REQUIRED_BEFORE_PUBLIC_LAUNCH
DPA_TRIGGER_RESTORED   = YES — §12.5; COUNTERSIGNED_DPA = REQUIRED_BEFORE_UPLOADS_OR_SENSITIVE_MODEL_ROUTING
VERIFY_CONFIRM_TRIGGER = YES — VERIFY_CONFIRM_PHYSICAL_ACCEPTANCE = MANDATORY before any unconfirmed-citation feature
```

## APPLE_ACCOUNT_READINESS / PLAY_ACCOUNT_READINESS / EAS_PROJECT_STATE

Rows defined in roadmap §14.14; values in `STORE_RELEASE_CHECKLIST_V1.md` §0.1.

```text
APPLE_ACCOUNT_READINESS = 12 rows defined; all UNKNOWN except configured bundle id co.lawmind.app (config VERIFIED,
                          reservation unobserved). No console access this round.
PLAY_ACCOUNT_READINESS  = 10 rows defined; UNKNOWN except configured package co.lawmind.app.
                          PLAY_APP_REGISTERED deadline 30 Sep 2026 flagged to the founder.
EAS_PROJECT_STATE       = EAS_PROJECT_ID ABSENT from app.config.ts (VERIFIED); owner absent; `eas` CLI not installed
                          (npx: "could not determine executable"). Separated from PUSH (deferred).
IOS_IMAGE               = eas.json production macos-tahoe-26.5-xcode-26.6 (config VERIFIED; build NOT PROVEN)
```

## SECURITY_RELEASE_BASELINE / ALERT_DELIVERY_REQUIREMENT / STOP_THE_LINE_POLICY

```text
SECURITY_RELEASE_BASELINE  = 21 rows, roadmap §14.15; Gate D evidences, Gate E attacks; no pentest required
ALERT_DELIVERY_REQUIREMENT = roadmap §13.5 + S4-R1 §I: synthetic condition → rule → dedup/cooldown → human delivered
STOP_THE_LINE_POLICY       = roadmap §3.6, six conditions; P1/P2 become owned backlog
```

## FOUNDER_QUEUE_CORRECTIONS

Top block "CURRENT STATUS — S4-T0.1" plus dated status notes under 9 entries; no
entry deleted or rewritten: FQ-APPLE-TOOLCHAIN (IMAGE_PINNED = YES, build NOT_PROVEN,
account VERIFY) · FQ-HOSTING + FQ-LCC-R13-HOSTING (PERSISTENT_BETA_HOSTING =
PENDING_SHIP_COST_PACKAGE_AND_FOUNDER_SPEND_APPROVAL) · FQ-SITE (EXISTS_BUT_NONCORE,
rebuild DEFER, compliance URLs current, external delete gap) · FQ-WEB-SURFACE
(SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION, ADVOCATE_WEB = DO_NOT_BUILD) ·
FQ-PUSH-PROJECT (PUSH_PRODUCT = DEFERRED / NONBLOCKING; EAS separate) ·
FQ-BACKUP-KEY-ESCROW and FQ-NEW3-R25-ROTATE (all four security actions **OPEN**, not
marked done by this agent) · in-app purchase (vendor advice historical; PBL8+ recheck).

## AUTHORITY_LINT / LANE_BUS_TESTS / MANIFEST_VALIDATION

```text
AUTHORITY_LINT      = scripts/lawmind-authority-check.mjs · `pnpm authority:check` · CI server lane (pre-install)
                      PASS 61/61 · its tests scripts/lawmind-authority-check.test.mjs 8/8
                      (incl. 5 negative cases and a "history is ignored" case)
LANE_BUS_TESTS      = bash scripts/lane-bus.test.sh → 22 passed, 0 failed (13 kept + 9 new)
                      node --test scripts/lease-liveness.test.mjs → 8 pass, 1 skipped (pre-existing skip), 0 fail
MANIFEST_VALIDATION = PASS: 4 entries at canonical paths, bytes + sha256 recomputed by the lint;
                      pre-edit hashes preserved under amendments[0]
JSON                = manifest, R17 registry, contract ledger parse (node JSON.parse)
```

## Boundary

```text
PRODUCT_CODE_BEHAVIOR_CHANGED = NO   (two comment blocks in inert workspace files; no statement changed)
DB_CHANGED                    = NO
CLOUD_CHANGED                 = NO
PAID_RESOURCE_CREATED         = NO
```

## UNKNOWN

- Apple, Play and EAS account state: every row not marked VERIFIED above.
- DPDP Gazette text: the PIB PDF did not decode, so the Act's clause lettering and the
  13 vs 14 Nov day rest on secondary sources. Launch recheck required.
- Compliance URLs were not re-probed (last observation 15 Sep 2026).
- Whether legacy "delivered" messages were ever acted on. Cursor state cannot show it,
  so the reissue relied on reading the post-Gate-C window and later acceptance records.

## CORRECTIONS

- My first inline DPDP table glossed s. 6(9) and Rule 4 as "consent managers" and listed
  Rules-bucket topics no source I read stated. Both glosses were removed before commit.
- The first bus-test draft reused a sequence number (95) that the broadcast case had just
  consumed, and used a fixture without front-matter. That was a test bug, fixed; the runtime
  was right.
- The first lint banner rule failed FOUNDER_QUEUE, whose status block sits after a short
  intro. The region now ends at the first rule after the marker (bounded to 200 lines).

## NOT_DONE

- No Apple/Play/EAS measurement beyond repo config (needs founder console access).
- No server change to refuse `platform=web` (behaviour change → future CCR).
- `EXTERNAL_DELETE_AUTH_V1` specified only (Gate-D implementation).
- `CLAUDE.md` §6 still says generated documents carry an "AI-assisted draft" mark, which
  the per-turn core says was superseded (PD-8). This is pre-existing and not an authority
  or topology claim, so it is left for a product round rather than decided here.
- Transition-seal artifacts named by the original S4-T0 prompt (`docs/ai/ship-s4-t0/`) are
  consolidated into this round's record.

## Final acceptance

```text
V7_4_CANONICAL_AUTHORITY              = PASS
CURRENT_STATE_POINTER                 = PASS
OLD_ACTIVE_ROADMAP_POINTERS           = 0
OLD_ACTIVE_AGENT_TOPOLOGY_REFERENCES  = 0
HISTORICAL_EVIDENCE_REWRITTEN         = NO
CAPABILITY_REGISTRY_ALIGNED           = PASS
BUS_RUNTIME_ALIGNED                   = PASS
MANIFEST_ALIGNED                      = PASS
AUTHORITY_LINT                        = PASS
```

SHIP_S4_T0_1_AUTHORITY_RECONCILIATION = PASS
