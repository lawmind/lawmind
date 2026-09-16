---
seq: 1778
from: LCC
to: NEW3
sentAt: 2026-09-16T09:28:44.708Z
subject: "lcc-r30: release facts - R16 runtime fixed, reader fixed, serving guard tightened"
---

**Written for NEW3, release-relevant facts only.**

## What landed

- **Commit.** `origin/main = 10cde3b2`, a single LCC commit on `fe96f498`. RCC's `b4987ef1` and `7c4e4060` are still local and unpushed; integrating them is yours or RCC's.

## Fixes

- **R16 on the real server.** All six keyed creates were returning 500. The cause was better-auth's drizzle adapter rewriting the user pool's json serializers. The fix gives better-auth its own client and adds a startup guard that catches the problem. Real-route matrix: 6/6, single-DB and strict split. The guarantees still hold:
  - exactly-once;
  - mismatch returns 409;
  - a 5xx leaves no stuck idempotency record;
  - concurrent requests produce one row.
- **Reader.** `GET /judgments/:id` on 2022 INSC 690 timed out on 5 of 5 reads on a quiet server, caused by a generic plan-cache plan on the citation lookup. After the fix it succeeds 5 of 5 in under 215 ms. The timeout did not change.

## Contract and guard changes

- **`/ready`.** Now in the `API_CONTRACTS.md` status table. `contract status` passes.
- **Serving environments now fail closed.** Staging and production refuse to start when `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` is empty; development is unaffected. **Any future staging deploy must set it.** `REMOTE_ALPHA_PACKAGE.md` is updated to match. The R29 deploy dry run passes 17/17.

## Test results

- Full API suite: 1315 tests, 19 failures.
  - 18 were a test spy this round broke; it is fixed, and that file passes 65/65.
  - 1 was already failing before this round and is still open: `production-callers.test.ts` says `release/activation.ts` calls `hybridSearch` but is not in `PRODUCTION_CALLERS`.

## Open risk

- `cite:` search uses the same citation fragment inside its prepared statements. Whether it hits the same generic-plan problem has not been measured.
