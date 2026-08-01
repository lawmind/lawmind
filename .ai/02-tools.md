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

## Build discipline

**ponytail** — MIT. Run at `full`.

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Stacks with caveman without overlap: **caveman shrinks what the agent says,
ponytail shrinks what it builds.**

The ladder it enforces, applied to every build decision:

```
1. Does this need to exist?   → no: skip it
2. Already in this codebase?  → reuse it
3. Stdlib does it?            → use it
4. Native platform feature?   → use it
5. Installed dependency?      → use it
6. One line?                  → one line
7. Only then: the minimum that works
```

**Cadence:** `/ponytail-review` at the end of every sprint, before the gate.
`/ponytail-audit` once after S2.

### Never on the chopping block

ponytail's own docs exempt three areas from simplification. **We add a fourth.**

1. Trust-boundary validation
2. Data-loss handling
3. Security and accessibility
4. **The citation verification pipeline.** Three tiers, the explicit unverified
   state, the fan-out, the never-cached overruled read, and every zero threshold.

**If ponytail suggests collapsing a tier, decline and note it.** Tier 2 requires
*both* public sources to agree and Tier 3 is human-confirmed — those look like
redundancy to a simplifier and are the entire product to us. The ladder's first
question is "does this need to exist?"; for the harness the answer is permanently
yes, and it is not re-asked per sprint.

Recorded metrics are the founder's stated rationale, not measurements taken here:
−54% lines of code, −22% tokens, −20% cost, −27% time, 100% safety retained.

Prefer capabilities over hardcoded implementations so tools can be swapped.

Boundary: architecture, ownership and blast-radius questions go to
codebase-memory-mcp. Single-symbol questions — where defined, who references —
go to AFT. Do not use one for the other's job.
