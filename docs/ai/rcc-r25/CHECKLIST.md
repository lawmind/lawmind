# RCC R25 — round checklist

Written to a file rather than a todo tool, for the reason `CLAUDE.md` gives: a
plan held only in a tool does not survive compaction or a fresh agent. Ticked
only against something observed.

## Phase A — integrated base

- [x] `HEAD_START = 6124b5f0`
- [x] NEW3 R23 handoff read (bus 1753) — `INTEGRATION_BASE = 6124b5f0`, matches
- [x] `R17_RELEASED = YES` confirmed from NEW3 R23, not assumed from R24's `NO`
- [x] identity_only backend (LCC R26) + client (RCC R24) both present at HEAD

## Phase B — real R17 end-to-end

- [x] harness runs the real API in a process and drives `src/api/client.ts` unmodified
- [x] disposable corpus generations A/B + real user database
- [x] §3 available save → `201`, one row, hydrated authority
- [x] §4 absent target, no live row → `409 CORPUS_TARGET_UNAVAILABLE`
- [x] §4 no raw "no judgment with that id" / "authority not found" on screen
- [x] §4 no fabricated authority — row count read from the database
- [x] §4 no automatic retry (`retryable: false`, client-derived)
- [x] §4 already-satisfied save → `200 { unavailableAuthority }`, no second row
- [x] §5 existing saved row survives as a six-field shell
- [x] §5 no stale title/court/date/citation leak — asserted as absence
- [x] §5 remove action still addresses the shell's `authorityId`
- [x] §6 recovery: same `authorityId`, hydrated, no duplicate, no stale shell

## Phase C — identity_only deletion end-to-end

- [x] fixture: authenticated identity, no `users` row
- [x] `GET /me` classifies `identity_only` and carries the email
- [x] Delete Account screen reached and driven, no onboarding
- [x] confirmation uses the authenticated identity's own address
- [x] request reaches the backend
- [x] no profile row created — `users` counted at 0
- [x] written against `auth_id`, `user_id` NULL
- [x] R16 key preserved; replay returns the same request
- [x] acknowledgement is a REQUEST (`received` + `dueAt`), never "deleted"
- [x] profile-backed regression: same route, `user_id` non-null
- [x] failure states: unauthenticated → `AUTH_REQUIRED`; bad token → not success

## Phase D — external deletion web resource

- [x] `apps/**` searched: `mobile` + `admin` only, admin is the staff console
- [x] `PUBLIC_WEB_PRESENT = NO`, corroborated by `FQ-SITE` and `WEBSITE_PRODUCT_SPEC_V1.md` §0
- [x] no fake mobile-hosted HTML route invented
- [x] `EXTERNAL_DELETE_WEB = BLOCKED_REPOSITORY_OWNER`
- [x] exact target repository/path/route written for NEW3 — `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md`
- [x] flow, identity_only support, verification, copy and security all specified
- [x] `PLAY_ACCOUNT_DELETION_URL_CANDIDATE` produced
- [x] Play Console NOT edited
- [x] one correction raised: the spec's `/support` FAQ would not satisfy the policy

## Phase E — physical Android

- [x] `adb devices -l` run once — empty
- [x] `DEVICE = PENDING`, no wireless troubleshooting
- [x] no physical row inferred from Jest, tsc or an export

## Phase F — accessibility / store regression

- [x] `check:sunlight` exit 0
- [x] `check:hex` exit 0
- [x] `check-design-rules design/screens` exit 0 — no new violations
- [x] `check-amber-reservation` exit 0
- [x] stale `#8A8578` in `design/DESIGN_SYSTEM.md` + `scripts/check-design-rules.mjs` left alone; handoff kept
- [x] Apple image `macos-tahoe-26.5-xcode-26.6` untouched
- [x] iOS party-search override preserved (`search.party_name` narrows to DISABLED)

## Phase G — tests

- [x] e2e: 2 suites / 23 tests / 0 failures
- [x] unit: 109 suites / 1,260 tests / 0 failures (serial; contention run recorded)
- [x] `tsc --noEmit` app — clean, `types: ['jest']` unchanged
- [x] `tsc --noEmit -p tsconfig.e2e.json` — clean
- [x] Android production export — 6.3 MB Hermes bundle
- [x] bundle read back in ASCII **and** UTF-16LE; harness strings absent
- [x] export directory deleted
- [ ] iOS export — not run: no iOS-relevant client or config change this round
- [ ] web build — not run: no web surface exists and none was changed

## Phase H — commit and handoff

- [x] no residue: 0 fixture rows, 0 leftover databases
- [x] re-anchor against the original ask
- [x] `GIT_COMMIT` lease
- [x] commit `apps/**` + RCC docs only — `b787748b`, 15 files, nothing from a forbidden lane
- [x] NEW3 handoff (bus 1754)
- [x] LCC handoff (bus 1755)
