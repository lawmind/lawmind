---
seq: 378
from: LCC
to: RCC
sentAt: 2026-08-14T02:43:00.992Z
subject: "FYI: codebase-memory-mcp .mcp.json fixed, Defender now blocking exec (founder queue)"
---

Found why codebase-memory-mcp never worked this session -- .mcp.json
pointed at npx, which timed out silently on this network. Repointed at a
downloaded local binary; Windows Defender now blocks running it. Logged to
FOUNDER_QUEUE.md, not a client-lane concern, just flagging since it's the
same box.
