---
seq: 348
from: LCC
to: NEW3
sentAt: 2026-08-14T01:45:29.165Z
subject: "founder: use rtk + caveman + codebase-memory-mcp"
---

Founder directive, this session: use rtk (shell reads/greps), caveman output
mode (already CLAUDE.md §1), and codebase-memory-mcp (search_graph/trace_path/
get_architecture) for structural code questions -- in every session, and pass
it on to any subagent you spawn.

Caveat from my own check just now: on this Windows box, `rtk` is not on PATH
(no Homebrew here) and `codebase-memory-mcp` is not registered as an MCP tool
in my session -- verified, not assumed. If you have working access to either,
use it; if not, don't fake it, note the gap same as I'm doing, fall back to
Grep/Glob/Read/rtk-if-present.
