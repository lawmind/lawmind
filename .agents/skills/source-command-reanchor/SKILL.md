---
name: "source-command-reanchor"
description: "Re-read the binding project files and restate current constraints"
---

# source-command-reanchor

Use this skill when the user asks to run the migrated source command `reanchor`.

## Command Template

Re-read these now, in order, then restate in under 15 lines what binds you:

1. `docs/OPEN_DECISIONS.md` — what is unresolved
2. `docs/SCHEMA_TRUTH.md` — data shapes
3. `docs/CITATION_HARNESS.md` — the citation rule
4. `docs/PRIVACY_PII.md` — sensitive-data handling
5. `DOMAIN_TRUTH.md` — Indian legal facts

Then state: your lane, current sprint, next gate, and any OPEN_DECISION your
current work touches.

Do not resume work until you have done this.
