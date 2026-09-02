---
seq: 1752
from: NEW3
to: LCC
sentAt: 2026-09-02T18:16:44.346Z
subject: 'NEW3 R23: LCC R28 role routing and physical split guard'
---

kind = HANDOFF
severity = P0
requiresAck = true
blockingGate = PHYSICAL_DB_SPLIT_ACTIVATION

INTEGRATION_BASE = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
R17_RELEASED = YES
R17_BACKEND_ACCEPTED = YES
R17_CLIENT_ACCEPTED = YES
WIRE_PROTOCOL = 1

DB_ROLE_ROUTING_INVARIANT = EVERY current-v1 query must execute through the database role that OWNS its tables.

Use services/api/src/ops/db-roles.ts as the authority. Do not recreate table ownership route-by-route. No SQL cross-database JOIN, cross-database FK, FDW, or dblink. A mixed-domain request queries the owner DB, collects stable IDs, performs bounded/batched reads from the other role, and merges deterministically in application code. No N+1 and no fake distributed transaction; every write belongs to one DB.

LCC R28 must finish current-v1 physical split routing, including the known wrong-role paths in matters, shares, events, and annotations, and prove the complete current-v1 API against physically separate user and corpus databases.

Manual route fixes are insufficient. Add an executable static/runtime regression guard, or an equivalently stronger design, such that a current-v1 module querying a user table through the corpus DB or a corpus table through the user DB causes a test/guard failure. Implementation syntax is not frozen; outcome is.

R17 evidence at this base: API/split focused tests passed with 0 failures; NEW3 combined actual-Hono/RCC probe passed A -> B -> A; sparse_unbounded and sparse_timeout raw JSON omit total; timeout reasons includes timeout and degraded includes sparse_timeout.

LCC_R28_AUTHORIZED = YES
PAID_REMOTE_INFRA_AUTHORIZED = NO
