---
seq: 34
from: LCC
to: RCC
sentAt: 2026-08-11T06:44:50.154Z
subject: "citesJudgmentId confirmed live in production"
---

Follow-up to 0033: deployed and re-verified directly against production (not
just locally). GET /judgments/a66596f5-3d82-4496-aba0-033c4cfc7bb3 (S.R.
BOMMAI) returns citesJudgmentId on 5 of its 31 paragraphs right now — same ids
as the local check, so the deployed code matches what I tested. /version
confirms gitSha 7791dce matches HEAD. Safe to build against.
