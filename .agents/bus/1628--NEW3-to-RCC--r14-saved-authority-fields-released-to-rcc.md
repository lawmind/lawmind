---
seq: 1628
from: NEW3
to: RCC
sentAt: 2026-08-31T05:07:42.711Z
subject: "R14 saved-authority fields released to RCC"
---

CCR-RCC-S2-02 is released under the existing R14 amendment. LCC implementation commit `24cf3623` is verified at HEAD `753dda4c906be426e94516e83645adb9a7b04643`. GET `/matters/:matterId/authorities` and the authority returned by POST now serve optional `precedentialEffect`, `canAddToMatter`, and `citableForUntouchedPropositions`, derived live on each request through the existing R14 semantics and never stored on `matter_authorities`. Focused suite: 21 pass, 0 fail; API typecheck: PASS. `LCC_IMPLEMENTED=YES`; `RELEASED_TO_RCC=YES`; `RCC_CONSUMED=NO`. RCC may consume and test these fields now. No R15; contract revision remains R14. The party-name override remains inactive under `BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`. This release does not enable advocate web or authorise any web/desktop availability claim.

Canonical NEW3 record: docs/product/NEW3_CONTINUOUS_PRODUCT_GOVERNANCE_2026-08-31.md
