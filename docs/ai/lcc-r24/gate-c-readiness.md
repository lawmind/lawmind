# LCC R24 — Gate-C dry preparation: what is ready and what is not

`HEAD_START = 9ab5ca82`. No network, no paid infrastructure, no migration, no
provisioning. NEW1's workers were not interrupted at any point.

## Integration check

| required | state |
| --- | --- |
| `13f558d1` R16 backend | ancestor of HEAD |
| `b2de9e2c` matters/iOS fix | ancestor of HEAD |
| `9ab5ca82` RCC client | HEAD |
| `f4439d58` NEW3 R18 | ancestor of HEAD |
| migration `0100` | applied — `api_idempotency_records` exists |
| migration `0101` | applied — `matters.parties` is `jsonb` |
| R16 schema | present (0100) |
| current capability override | `RELEASE_CAPABILITIES_R8_3.5`, with the iOS `search.party_name` platform override |

## What this round changed

1. **`POST /search` emits one structured phase line per request** —
   `search/timings.ts`, `search/route.ts`, `search/retrieve.ts`. Nine top-level
   phases plus nine nested ones, `degraded[]`, and `pool_wait_ms` that is
   measured or null and never derived. Diagnostics only: no response field
   changed, no contract field added.
2. **`measure:round --gate-s1`** — the Gate-S1 harness, added as a MODE of the
   existing LCC search CLI rather than as a second tool. Six fixed classes,
   machine-readable JSON, p50/p95/p99 suppressed where the sample cannot carry
   them.
3. **`ops/cascade-guard.ts`** — a corpus restore now refuses before its first
   `TRUNCATE` if it would empty tables outside the release.
4. **Two red tests addressed** — `audit_log "leaves no rows behind"` was the
   test's fault and is fixed (4/4). The sparse assertion was a wrong diagnosis:
   the plan fence is intact, the assertion now measures the arm rather than the
   whole pipeline, and it is **still red under full-suite load on this box**. The
   threshold was not raised.

## The four MUST-BE-NOs

| | |
| --- | --- |
| `STATEMENT_TIMEOUT_CHANGED` | NO |
| `CLIENT_TIMEOUT_CHANGED` | NO — client is RCC's and was not touched |
| `POOL_SIZE_CHANGED` | NO |
| `INDEX_ADDED` | NO |
| `PAID_INFRA_CREATED` | NO |
| `NETWORK_RESOURCE_CREATED` | NO |
| `NEW1_INTERRUPTED` | NO |

Nothing was optimised. A 15-second event WAS reproduced (`gate-s1-findings.md`)
and deliberately left unfixed, because both available repairs change what an
advocate gets back and R24 was told not to change response semantics.

## Tests

`services/api` search neighbourhood + pool + new suites, twelve files, sequential:
**110 tests · 107 pass · 1 fail · 2 skipped**. The single failure is the sparse
wall-clock assertion above, red under load and green alone. `packages/db`
audit-log 4/4. Typecheck clean (`services/api`, `packages/db`). Lint clean on
every touched file except one PRE-EXISTING error at HEAD — an unused
`precedentialEffect` import in `retrieve.ts`, not mine and left alone. Prettier
clean on every touched file except `sparse-bound.test.ts` and
`release-restore-cli.ts`, both of which already failed format at HEAD.

## `READY_FOR_REMOTE_ALPHA_ENGINEERING = NO`

Not because of this round's work, which landed. Because of two things it
measured:

1. **`REMOTE_DB_SPLIT = NOT_SUPPORTED`** and the gap is not a wiring change —
   nine cross-role JOINs and seven cross-role foreign keys
   (`remote-db-split-readiness.md`). Steps 1–3 of the handoff are mechanical;
   step 4, what happens to a `matter_authorities` row whose judgment is no longer
   reachable, is a product decision nobody has taken.
2. **`USER_DB_RESTORE_DRYRUN = NOT_AVAILABLE`.** There is no user/matter
   backup-and-restore path at all. Gate C's separation property has two halves
   and only the corpus half is built.

Neither is a founder decision and neither needs money, so neither goes to
`FOUNDER_QUEUE.md`. Both are engineering, and both are larger than "one round
before the alpha".
