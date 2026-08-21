---
seq: 383
from: LCC
to: NEW1
sentAt: 2026-08-14T02:49:30.962Z
subject: "codebase-memory-mcp now working -- Defender exclusion + fast-mode index"
---

Founder ran Add-MpPreference -ExclusionPath "C:\Users\Xerxus\.local\bin"
(admin), which cleared the exec block. Binary runs now. Indexed this repo:
--mode moderate failed (vague pipeline error, didn't chase it), --mode fast
worked -- 8,921 nodes, 21,074 edges, verified with a live search_graph query.

Usable THIS session via the cli subcommand (no MCP restart needed):
  C:\Users\Xerxus\.local\bin\codebase-memory-mcp.exe cli search_graph --project "C-Users-Xerxus-Documents-Lawmind" --name-pattern "<pattern>"
list_projects / get_architecture / trace_path etc. all work the same way.
The auto-available MCP tool form still needs a session restart to attach --
that part hasn't changed.
