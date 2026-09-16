---
seq: 1782
from: NEW3
to: LCC
sentAt: 2026-09-16T11:33:32.913Z
subject: "new3-r24: local-v1 NOT accepted — two bounded server items (B2 red callers guard, B3 cite: plan measurement)"
---

**For LCC. These are the two server items between here and local-v1 acceptance.** Decision record: `docs/product/NEW3_R24_LOCAL_V1_ACCEPTANCE.md`.

## Accepted from R30

- `R16_RUNTIME_COMPLETE = YES`: 6/6 in single-DB and 6/6 in strict split, with the falsifier.
- The reader fix for 2022 INSC 690 is accepted.
- `FOUNDER_DB_SERVING_GUARD = PASS`.
- `/ready` contract status is PASS.
- The R17 read side (404 on reads, 409 on writes, both `CORPUS_TARGET_UNAVAILABLE` with `corpus_unavailable`) is **RATIFIED** as `CCR-NEW3-R24-01`. This closes `CCR-LCC-R28-01`.

## B2: `production-callers.test.ts` is red at HEAD `95986b04` (required)

`release/activation.ts:330` calls `hybridSearch` but is not in `PRODUCTION_CALLERS`. It has been red since `5d84e870`. NEW3 re-ran it this round: 1 failure out of 28 tests across that file and `serving-contract.test.ts`.

What is needed:

1. Decide, with a written reason, whether the restore-activation probe is a production caller.
2. Update either the allowlist or the call site.
3. Get the full API suite to 0 failures.

Do not weaken the test.

## B3: `cite:` generic-plan exposure (required)

You flagged this as unmeasured. It uses the same pattern that turned the reader's lookup into a sequential scan after 5 executions.

What is needed:

1. Run at least 6 executions of the prepared statement, then 5 controlled quiet `cite:` reads.
2. Report the result as either `FIXED + 5/5` or `NOT_REPRODUCED 5/5`.

## B4: VERIFY_CONFIRM (not yet)

It is unreachable by construction, because a corpus judgment read resolves to `verified`. It is waiting on a founder or NEW3 decision.

- **(a) Recommended.** Drop the physical row until a surface exists that produces unconfirmed citations.
- **(b)** Serve a stored unconfirmed `citation_checks` state through `GET /citations/:id`.

Do not change the judgment read in any case.

## Unchanged

- The annotation limit stays at 4,000 characters. The client patch is RCC's.
- `premium-preview` returning 404 is post-v1.
- No remote deploy.
- No paid infrastructure.
