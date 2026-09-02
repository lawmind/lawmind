# LCC R28 — complete physical DDONE | # | Phase | Item | DONE |
|---|-------|------|-------|
| A1 | A | Explicit role access for current-v1 modules (`corpusSql` / `userSql`) | DONE |
| A2 | A | No silent fallback — wrong role FAILS, never retries | DONE |
| B3 | B | Current-v1 route/DB matrix, driven from the real route graph | DONE |
| B4 | B | Fix all wrong-role queries | DONE |
| B5 | B | Batch cross-role hydration, no N+1 | DONE |
| B6 | B | User writes never require a corpus transaction | DONE |
| C7 | C | Two physically distinct disposable databases | DONE |
| C8 | C | Negative schema proof — each DB stripped of the other's tables | DONE |
| C9 | C | Boot in strict split mode, identities proved distinct | DONE |
| D10 | D | Current-v1 end-to-end API matrix through the real Hono app | DONE |
| D11 | D | Tenant isolation, user A vs user B | DONE |
| E12 | E | Permanent role-routing guard (query layer + static source guard) | DONE |
| E13 | E | Role sentinels — deliberate wrong-role queries must fail | DONE |
| F14 | F | Blue/green corpus switch A→B→A, user DB unchanged | DONE |
| F15 | F | User backup / restore, then current-v1 smoke on the restored DB | DONE |
| F16 | F | Corpus activation gate — statistics + Gate-S1 smoke | DONE |
| G17 | G | Search non-regression: one Gate-S1 suite, p95 <= 3000 ms, C3 smoke | DONE |
| H18 | H | Required zeroes (cross-role FKs, SQL joins, FDW, dblink, distributed tx, fallback) | DONE |
| I19 | I | High-signal suites, typecheck, owned lint | DONE |
| I20 | I | Commit under GIT_COMMIT lease, send NEW3 + RCC handoffs | DONE |

## What the matrix measured

First run, before any wiring change, against two physically split databases each
stripped of the other role's tables:

```
31/46 pass · 2 fail · 13 wrong-role
missing relations named: matters, judgment_annotations, citation_checks,
                         saved_searches, users, documents
```

After the wiring change:

```
64/64 pass · 0 fail · 0 wrong-role
```

## Files this round has touched so far

- `scripts/lcc-db-role-audit.mjs` — new; roles a module needs, derived from its SQL
- `scripts/lcc-cross-role-sql.mjs` — new; statements naming both roles
- `scripts/lcc-r28-split-env.mjs` — new; the two databases and the negative schema proof
- `scripts/lcc-r28-split-matrix.mjs` — new; the current-v1 matrix through the real app
- `services/api/src/db-role-guard.ts` — new; role-tagged handle, throws, never falls back
- `services/api/src/app.ts` — the wiring: every current-v1 route's handle is now a decision
- `services/api/src/index.ts` — better-auth and `AuthDeps` moved to the user role
- `services/api/src/auth/routes.ts` — `AuthDeps.sql` documented as USER-only
- `services/api/src/search/route.ts` — `searches`, `citation_checks`, telemetry on the user role
- `services/api/src/judgments/route.ts` · `judgments/annotations.ts`
- `services/api/src/documents/route.ts` · `briefings/route.ts`
- `services/api/src/citations/copies.ts` · `citations/verify.ts`
- `services/api/src/search/saved.ts` · `arguments/counter.ts`
- `services/api/src/admin/disputes.ts` · `admin/metrics.ts` · `admin/rechecks.ts`
- `services/api/src/premium/route.ts`
