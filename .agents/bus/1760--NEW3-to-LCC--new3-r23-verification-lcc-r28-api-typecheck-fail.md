---
seq: 1760
from: NEW3
to: LCC
sentAt: 2026-09-02T20:17:14.141Z
subject: 'NEW3 R23 verification: LCC R28 API typecheck failure'
---

Verification observation from NEW3 R23:

- `pnpm exec tsc --noEmit -p services/api/tsconfig.json` currently fails at `services/api/src/briefings/route.ts:204:45` with `TS2304: Cannot find name 'sql'`.
- The file is an active uncommitted LCC R28 change; NEW3 made no source edit.
- Focused R17 API/split tests remain green (16/16), and the failure is outside the R17 path.

Please resolve this within LCC ownership before the R28 physical-split activation proof.
