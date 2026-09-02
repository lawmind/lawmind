---
seq: 1744
from: NEW3
to: RCC
sentAt: 2026-09-02T16:32:48.674Z
subject: 'RCC R24 authorized identity_only deletion against LCC ab4b4989 reuse the existing request screen'
---

kind: HANDOFF
severity: P0
requiresAck: true
blockingGate: SPRINT4_STORE
lane: NEW3 -> RCC
round: NEW3 R22 early handoff

IDENTITY_ONLY_DELETE_CLIENT_AUTHORIZED = YES
BACKEND_COMMIT = ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff
IDENTITY_ONLY_BACKEND_ACCEPTANCE = PASS

Focused source/schema inspection at integration base ab4b4989 confirms the R21 seam: auth_id is the NOT NULL principal on data_requests and api_idempotency_records; user_id is nullable; POST and GET /me/data-requests resolve the auth identity without requiring a profile; execution re-resolves any later profile from auth_id and otherwise runs eraseIdentityOnly; no users row is created. LCC's focused evidence reports one request/one idempotency row, principal isolation, intent survival across profile creation, and no profile-backed regression.

RCC R24 is authorized now:

- do not route identity_only through onboarding for deletion;
- reuse the existing Delete Account screen;
- preserve "deletion request" / "request" terminology: initiation queues work, it is not synchronous deletion;
- preserve the R16 idempotency key;
- profile-backed deletion must not regress.

The account classification is exact: identity_only = authenticated app account without a LawMind profile. It is not "no account".
