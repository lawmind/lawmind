# Legacy bus → active lanes: reissue of still-valid actionable items

**SHIP S4-T0.1, 18 September 2026.** Written before legacy routing was disabled,
per roadmap v7.4 §3.5 (Amendment A1).

## Method

- Scanned all 1,821 message files `0001`–`1817` (some sequence numbers carry several
  broadcast files). Legacy files, names and cursors were **not** modified.
- Cursor-pending is **not** a reliable "unacknowledged" signal on this bus: legacy
  cursors run far behind (LCC 931, NEW2 900, NEW3 984) because lanes read by hand
  with `pnpm lane:inbox`. So the scan used two filters: (a) subject/class markers
  for P0 · CCR · HANDOFF · ACTION_REQUIRED · BLOCKER · HOLD beyond each legacy
  cursor (≈80 hits), then (b) reading the post-Gate-C window 1795–1817 in full.
- Every hit before 1795 was checked against later accepted records: Gate B, the
  R16/R17 releases (CCR ledger, `NEW3_R23_R17_ACCEPTANCE.json`), and Gate-C
  acceptance (`NEW3_R25_GATE_C_ACCEPTANCE.*`). Each was superseded by one of them
  and is **not** reissued. Informational history is not reissued.

## Reissued

| Original bus | From → to | Still-valid item | Reissued to | How |
|---|---|---|---|---|
| 1809, 1817 | FIFTH/LCC → LCC/FIFTH | **N-2** `/version` provenance (null deployedAt/digest) and **N-5** `/version` env vs `/ready` servingEnv. Both must close before anything is labelled production. | SHIP | `docs/CURRENT_STATE.md` §8; roadmap §13.3 |
| 1811 | NEW3 → RCC | **N-8** a11y selected-state on chips; **N-9** non-debuggable dump on the release build actually tested; Gate-D device/store scope ("mostly yours") | SHIP | `docs/CURRENT_STATE.md` §8; Sprint Prompts v5 S4-R2 |
| 1812 | NEW3 → FIFTH | ACTION_REQUIRED question: is Gate-D row "monitoring claims ≤ measured capability" satisfiable while `monitoring.user_product` = DISABLED_NOT_READY? | SHIP | Answer recorded: yes, by making **no** monitoring claim (Shape B). `CURRENT_STATE.md` §8 |
| 1815 | LCC → NEW3 | `REMOTE_CREDENTIAL_ROTATION_NOW_REQUIRED = YES` | FOUNDER | `FOUNDER_QUEUE.md` top block (founder is not a bus lane) |
| 1817 | LCC → FIFTH | Three teardown claims worth attacking (cost figure, sweep completeness by name substring, foreign-resource classification) | SHIP backlog, as optional `RED_READ_ONLY` input | Not a Gate-D blocker; RED is FROZEN. Listed here so it is not lost. |
| 1813, 1814 | NEW3 → NEW1/NEW2 | Gate C enables nothing; every deferred capability keeps its state; DATA standing work continues | DATA | bus HANDOFF SHIP → DATA (below) |
| 1583, 1591 | FIFTH ↔ NEW2 | Resolver HOLD: citation edge apply stays HOLD pending independent audit | DATA | same HANDOFF: `CITATION_BULK_APPLY = HOLD` |

SHIP-owned items are recorded in `docs/CURRENT_STATE.md` rather than sent as bus
messages: the bus refuses a lane messaging itself, and a self-addressed message is
not an audit trail.

## Bus message sent

One HANDOFF, SHIP → DATA, referencing 1583, 1591, 1813 and 1814. Its sequence
number and filename are recorded in `AUTHORITY_RECONCILIATION.md`.
