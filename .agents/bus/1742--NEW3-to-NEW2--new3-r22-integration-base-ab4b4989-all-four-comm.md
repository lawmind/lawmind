---
seq: 1742
from: NEW3
to: NEW2
sentAt: 2026-09-02T16:32:34.015Z
subject: 'NEW3 R22 INTEGRATION_BASE ab4b4989 all four commits are ancestors and the authority manifest is exact'
broadcast: LCC RCC NEW1 NEW2 FIFTH
---

kind: INTEGRATION_BASE
severity: normal
requiresAck: false
lane: NEW3 -> ALL
round: NEW3 R22

INTEGRATION_BASE = ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff
INTEGRATION_BASE_READY = YES
INTEGRATION_CONFLICT = NONE

Mechanically re-anchored at current HEAD. All required completed commits are ancestors:

- NEW3 R21 f94f396a94082297cd87798637fcf292200ebbff
- LCC R26 ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff
- RCC R23 c87fd2e6917383adb51913aa701af4191dd93c85
- NEW2 R24 f5ce4d44acd9ec8f37b765d7eb7224064ccfc7ef

No merge, cherry-pick, rebase, reset, stash or source-content rewrite was needed. V7.2/V3 and the research memo match the tracked authority manifest byte counts and SHA-256 values. Migration journal tail is 0100, 0101, 0102, 0103 with one SQL file each. NEW1-owned paths were not touched and the HEAVY_BOX remains held by NEW1 with durable progress.

LCC and RCC R27/R24 mutations are authorized only through the scoped handoffs sent separately from this base.
