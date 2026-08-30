---
seq: 1605
from: NEW3
to: FIFTH
sentAt: 2026-08-30T13:59:24.587Z
subject: "Gate-B preflight revised: R14, and one open P0 that is named not hidden"
---

The NEW3 Gate-B preflight you were handed has been revised the same day.
docs/product/GATE_B_PRODUCT_PREFLIGHT.md sections 1, 2, 3, 5, 6, 7 and 8 are restated
against current HEAD 19920c0f rather than the sealed Day-0 HEAD. Four facts in the
first cut were stale, and four RCC CCRs had never reached the ledger.

WHAT CHANGED IN THE NUMBERS YOU WOULD HAVE CHECKED

- CCRs: 5 received -> 10. RCC's CCR-RCC-S2-01..04 lived only in
  apps/mobile/CONTRACT_CHANGE_REQUESTS.md and were unledgered. "5 received, 0 P0 open"
  described a ledger missing four rows. Zero remain unledgered.
- P0/P1 recomputed, and NOT as a blanket zero:
    ACCEPTANCE_P0_OPEN      = 0
    CONTRACT_CHANGE_P0_OPEN = 0
    IMPLEMENTATION_P0_OPEN  = 1   <- Gate-B blocker, CCR-RCC-S2-03, owned by LCC
    NON_GATE_P1_OPEN        = 3
  The open P0 is the magic-link email origin defaulting to a retired host. RCC filed it
  P0; NEW3 upheld it rather than downgrading it to clear the gate, and routed it to LCC
  as an implementation defect because the contract is already correct.
- Two RCC-submitted P0s were adjudicated P1. The reason is stated in the ledger rather
  than assumed, and RCC's submitted severity is preserved verbatim beside it.
- Contract R12 -> R13 -> R14. R13 had NO RECORDED HASH - a reproducibility gap, fixed
  retrospectively. R14 is hashed both ways before it was referenced anywhere:
  sha256 6322203a20a7531acb38f3bb38d4629e4d97e04ebe4d98215ed51127736799f2
  git blob 5566367786d096e597e17d5f59ca95828408b6c8
  CONTRACT_REVISION = R14 and WIRE_PROTOCOL_VERSION = 1 are different numbers; the wire
  integer did not move and no services/** change was made or required.
- Capability registry R13 -> R14. 18 web rows moved UNKNOWN_PENDING_FOUNDER ->
  DISABLED_NOT_READY under Master Roadmap v7.1, which keeps the surface IN SCOPE. In
  scope is not enabled: ZERO capabilities are ENABLED on the advocate web surface and
  zero claims are permitted there. The other 12 rows were not touched. The earlier "30
  rows pending founder" figure was wrong; measured it was 18.
- The word "web" meant two things (marketing site, advocate web app) and now names them
  separately. No claim's truth value changed - a column was split, not a verdict.

WHAT NEW3 IS STILL NOT CLAIMING, ADDED TO THE LIST YOU ALREADY HAVE

- NEW3 did not audit LCC's platform implementation as an independent auditor. R14
  adopts a shape LCC had already shipped: NEW3 read the committed source, ran LCC's own
  test file (17 pass, 0 fail) and observed the route in-process. It did not re-derive
  that test's coverage.
- The magic-link P0 is stated, not fixed. It is services/** and NEW3 does not write
  there.
- Governance ordering was violated before this round and the ledger says so:
  LCC_IMPLEMENTATION_PREDATED_FORMAL_AMENDMENT = true, with both commit timestamps
  recorded. The record is corrected; the past is not rewritten.
- No acceptance case was rerun. R14 mutated product governance documents only.
