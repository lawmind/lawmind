# codebase-memory-mcp — auto-start OFF, on-demand kept

**Status: applied 19 Aug 2026, LCC. Not uninstalled. Index intact.**

## What was measured, not assumed

`codebase-memory-mcp` 0.10.3 is declared in the checked-in `.mcp.json`, so **every**
Claude session in this repo spawned its own resident stdio server. Sampled from
`Win32_Process` (CPU time ÷ process age), 19 Aug 2026 10:2x:

| PID   | role                | CPU-seconds | age (s) | % of one core |
| ----- | ------------------- | ----------- | ------- | ------------- |
| 25380 | session stdio server| 137.2       | 805     | **17.1**      |
| 2748  | session stdio server| 138.6       | 804     | **17.2**      |
| 13180 | session stdio server| 137.1       | 803     | **17.1**      |
| 5440  | session stdio server| 136.3       | 802     | **17.0**      |
| 8784  | shared daemon       | 145.5       | 31,521  | 0.5           |

Four agent sessions ≈ **0.68 of a core, continuously, while idle** — no tool call
was made against any of them during that window. That is the previous session's
"roughly one wasted CPU core across four agent instances", reproduced with
numbers rather than inherited as a claim. On a box where the retrieval path is
already the measured bottleneck (NEW2 bus 0711: 738 of 1,219 slow statements are
retrieval, p50 43s) this is not a rounding error.

## The mechanism used

`.claude/settings.json` (project-scoped, checked in, so it covers all lanes):

```json
"disabledMcpjsonServers": ["codebase-memory"]
```

This is the **documented** Claude Code key for rejecting a server declared in a
project `.mcp.json` — verified against code.claude.com/docs/en/settings, not
guessed. Two keys that plausibly exist and **do not** (`enabledMcpjsonServers`,
`enableAllProjectMcpServers`) were checked and are absent from the docs; do not
reintroduce them on memory.

`.mcp.json` is deliberately left **unchanged**. The server declaration stays, so
re-enabling is deleting one line from `settings.json` rather than reconstructing
a config. Nothing was uninstalled: `list_projects` still reports
`C-Users-Xerxus-Documents-Lawmind` at 23,294 nodes / 54,651 edges / 101.8 MB.

Settings load at **session start**, so this stops the *next* session spawning a
server; it does not reach into one already running. Already-resident servers were
ended separately (below).

## The on-demand method — verified working, not theoretical

The binary runs one tool and exits. This is its own documented mode
(`codebase-memory-mcp --help`), not a workaround:

```
codebase-memory-mcp cli [--json] <tool> [flags]
```

Measured: `cli --json list_projects` returned in **1.5s** and left **no residual
process** (process count before and after was identical, same PIDs).

Working example, run against this repo:

```sh
"C:/Users/Xerxus/.local/bin/codebase-memory-mcp.exe" cli --json list_projects

"C:/Users/Xerxus/.local/bin/codebase-memory-mcp.exe" cli --json search_graph \
  --project C-Users-Xerxus-Documents-Lawmind --name-pattern expandCategories
```

Two traps, both hit while verifying:

1. **`--project` is required** on every graph tool. Without it you get
   `missing required argument: project`, not a default.
2. Passing a raw JSON blob as the argument still works but is **deprecated** and
   warns. Use flags, `--args-file <path>`, or piped stdin.

The full tool set is unchanged and all of it is reachable this way:
`index_repository, search_graph, query_graph, trace_path, get_code_snippet,
get_graph_schema, get_architecture, search_code, list_projects, delete_project,
index_status, check_index_coverage, detect_changes, manage_adr, ingest_traces`.

## Ending the servers that were already running

Settings only bind at session start, so the four resident servers were ended
directly (`Stop-Process -Force`, PIDs 25380 / 2748 / 13180 / 5440). Killing an
MCP server is not destructive — the session reports it disconnected and it can
be reconnected; no index or graph state lives in those processes.

**Observed after:** `codebase-memory-mcp` process count went 5 → **0**. The
shared daemon was not killed directly; it exited on its own once its last client
left, which is why the count is 0 and not 1.

**Cold-start on-demand still works with zero resident processes**, which is the
check that matters — the fallback must not have depended on the thing removed:

```
cli --json list_projects   →  3.5s, correct output, index intact
                              (23,301 nodes / 54,658 edges — it had grown
                               slightly during the session, so the graph is
                               live, not a frozen snapshot)
```

It prints `hint: this command started a temporary CBM daemon`. That temporary
daemon **also exits**: process count re-measured 20 seconds later was **0**. So
the steady-state idle cost of this configuration is genuinely zero, not "one
small daemon".

Cost of the trade: a cold `cli` call is 3.5s versus 1.5s warm. Two seconds per
structural query, paid only when a query is actually made, against 0.68 of a
core paid continuously whether or not anyone asks anything.

If a lane ever does enough graph work for that 2s to matter,
`codebase-memory-mcp daemon start` keeps one warm — 0.5% of a core, ~34x cheaper
than one idle stdio client, and it is a deliberate opt-in rather than something
four sessions each do by accident.

## What is NOT covered by this change

- Nothing prevents a future session re-adding the server by hand, or another
  tool spawning one. The setting removes the automatic path, not the capability.
- `auto_watch = true` remains set in the binary's own global config
  (`codebase-memory-mcp config list`). That is a **machine-wide** setting shared
  with every other repo on this box, so LCC did not change it unilaterally. If
  the daemon's cost ever matters, `config set auto_watch false` is the lever —
  and it is reversible.
- This says nothing about whether the graph is *useful*. It is still indexed and
  still queryable; it simply no longer bills a core for the privilege of being
  available.
