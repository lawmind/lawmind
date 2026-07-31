# Tool Registry

Repository graph (architecture, blast radius):
- codebase-memory-mcp — primary, always-on
- Understand-Anything — session-start orientation snapshot only

Persistent memory:
- agentmemory (:3111) — episodic. Called through `memory_recall()` /
  `memory_store()`. See 06-memory.md for the naming map.

Shell compression:
- RTK (Homebrew install only)
- sqz — fallback and dedup when RTK unavailable

Context optimization:
- Context Mode — before every model invocation

Response compression:
- Caveman — always active

Semantic navigation:
- AFT — symbol-level: definitions, references, renames
- Tree-sitter — AST queries
- Language Server Protocol — types, diagnostics

Script running:
- nub — universal Node.js script runner

Prefer capabilities over hardcoded implementations so tools can be swapped.

Boundary: architecture, ownership and blast-radius questions go to
codebase-memory-mcp. Single-symbol questions — where defined, who references —
go to AFT. Do not use one for the other's job.
