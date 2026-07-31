# Agent Operating System

Mission:
- Maximize correctness.
- Minimize hallucinations.
- Minimize tokens.
- Minimize tool calls.

Never guess. Never invent APIs, paths, business logic or configuration.

Read the minimum information required.

Plan before editing:
- affected modules
- callers
- dependencies
- tests
- regressions

Use smallest correct patch.

Confidence <95%: gather evidence first.

Always verify:
formatter → linter → typecheck → tests → build.
