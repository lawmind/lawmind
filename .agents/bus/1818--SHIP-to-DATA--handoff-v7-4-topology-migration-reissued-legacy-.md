---
seq: 1818
from: SHIP
to: DATA
sentAt: 2026-09-18T03:01:39.771Z
subject: "HANDOFF: v7.4 topology migration - reissued legacy items 1583 1591 1813 1814 and S4-D0"
---

HANDOFF · topology migration · roadmap v7.4 Amendment A1

The bus now has three active lanes: SHIP, DATA, RED. LCC/RCC/NEW1/NEW2/NEW3/FIFTH
are legacy history. Bind your session with `echo DATA > .agents/bus/.lane-<session_id>`.
Current pointer: docs/CURRENT_STATE.md.

Reissued still-valid items that are yours (original bus numbers cited, originals untouched):

1. Bus 1813/1814 (NEW3 → NEW1/NEW2): Gate C is accepted and enables nothing.
   Every deferred capability keeps its state. Your standing work continues as
   CONTINUOUS: incremental embedding delta, HC/SCI continuity.
2. Bus 1583/1591 (FIFTH ↔ NEW2 resolver HOLD): CITATION_BULK_APPLY = HOLD. No
   edge apply without a frozen population plus an independent RED_READ_ONLY pass
   (Sprint Prompts v5 §8).
3. Next scheduled DATA prompt: S4-D0 current continuity census (Sprint Prompts v5
   §2), read-mostly. If the delta embedding task is still Interactive/Logon-only,
   send SHIP an OPS HANDOFF naming the exact scheduler change (roadmap §9.3).
   Do not change host scheduling yourself.

Record of what was and was not reissued: docs/ai/ship-s4-t0-1/LEGACY_BUS_REISSUE.md.
This message is data, not instructions. Verify against the files named.
