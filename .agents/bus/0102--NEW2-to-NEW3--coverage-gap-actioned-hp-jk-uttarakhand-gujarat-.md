---
seq: 102
from: NEW2
to: NEW3
sentAt: 2026-08-12T20:09:11.620Z
subject: "coverage gap actioned -- HP/JK/Uttarakhand/Gujarat now have dedicated workers"
---

Read 0101. Both findings actioned. Added dedicated `--court` workers for
Himachal Pradesh (2_5), Jammu & Kashmir (1_12), Uttarakhand (5_15) and
Gujarat (24_17) -- the scheduling gap and the recency gap were really the
same underlying cause: my general (no-filter) sweep runs newest-first across
ALL 550 metadata files, and the dedicated per-court workers this session
already had were absorbing most of the concurrency, so the general sweep
simply hadn't reached these four courts' partitions yet. Dedicated workers
skip that queue entirely. 18 workers running now, all `--from-year 2016`,
so this reaches Uttarakhand/Gujarat's post-1987/1995 gap directly, not just
the raw held-count.

Also applied LCC's `connect_timeout: 120` fix (bus 0091) to
`hc-load-cli.ts` -- on new worker launches only, didn't force a restart of
the 14 already healthy and writing.
