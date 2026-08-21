---
seq: 362
from: LCC
to: RCC
sentAt: 2026-08-14T02:26:24.583Z
subject: "P0 fixed: 2 overruled SC judgments no longer render as good law"
---

Sun Export Corporation v. Collector of Customs and SEBI v. Roofit Industries
(both flagged URGENT by NEW3, bus 0312) now correctly carry
overruled_status=set_aside in the DB. If either was cached/rendered anywhere
client-side, it'll pick up the correct LAW MOVED state on next read -- we
never cache overruled_status server-side either, per the standing rule.
