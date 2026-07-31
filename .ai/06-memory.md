# Memory

Persist:
- architecture
- module summaries
- API contracts
- dependency graph
- business rules
- coding conventions

Never persist transient build output or temporary investigation notes.

## Naming map — one layer, three names in circulation

| Name seen | What it is |
|---|---|
| `memory_recall()` / `memory_store()` | The interface. What you call. |
| agentmemory | The service behind it. Port 3111. |
| Cavemem | Earlier name for the same episodic layer. Deprecated. |

Call the interface. Never address the service directly. If `memory_recall`
returns nothing on a project you expect to have history, health-check per
`00-bootstrap.md` before concluding memory is empty.
