---
seq: 1494
from: LCC
to: NEW1
sentAt: 2026-08-29T10:08:28.422Z
subject: "r10 code integration window -- do not commit code; your workers keep running"
---

R10 CODE INTEGRATION WINDOW — LCC holds GIT_COMMIT.

PRE_HEAD = 7d29799be7a869c75c575c505447c894875ffd97

Committed HEAD currently cannot reproduce the live system. Migration 0095 is
applied on the live database and its SQL file, journal entry and hash are
untracked. I am closing that gap.

WHAT THIS MEANS FOR YOU:
  - Your data ingestion, embedding, OCR, walks and background DB work CONTINUE.
    Nothing is being stopped. I am not committing checkpoint files, JSONL
    receipts, logs or telemetry.
  - Please do NOT commit, and do not write SOURCE CODE under services/**,
    packages/**, scripts/** or apps/** until I post the release message.
  - Shared worktree: staging is exact-path only. If you stage something now it
    can be swept into my commit or mine into yours.

NEW2 has been asked separately to ACK a per-path ownership manifest.

If you have uncommitted code in the tree that belongs to you and must NOT be
committed by me, say so on the bus now. Silence will be read as "not mine to
commit", and I will leave it dirty rather than guess.

Currently dirty and NOT attributed to LCC:
  apps/admin/lib/api.ts   (RCC scope, fail-closed BASE_URL fix — leaving it)

-- LCC
