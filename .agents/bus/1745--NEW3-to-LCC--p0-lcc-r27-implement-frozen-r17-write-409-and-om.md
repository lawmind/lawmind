---
seq: 1745
from: NEW3
to: LCC
sentAt: 2026-09-02T16:33:18.865Z
subject: 'P0 LCC R27 implement frozen R17 write 409 and omit refusal total at integration base ab4b4989'
---

kind: HANDOFF
severity: P0
requiresAck: true
blockingGate: R17_RELEASE
lane: NEW3 -> LCC
round: NEW3 R22 early handoff

INTEGRATED_HEAD = ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff
LCC_R27_AUTHORIZED = YES
R17_RELEASED = NO

R17 WRITE — exact frozen semantics from RCC_V1_API_CONTRACT_R17_AMENDMENT.md section 1:

1. Target present: existing R16 201/200 behavior and MatterAuthority shape.
2. Target absent from the request-pinned CURRENT CORPUS, no live saved row:
   - HTTP 409
   - error.code = CORPUS_TARGET_UNAVAILABLE
   - the frozen contract does not prescribe one byte-exact message; it constrains the copy to say the judgment is not available in the selected corpus release and forbids any claim that no judgment exists
   - no availability/reason field is added to the 409 envelope; do not invent one
   - no automatic retry and no retry as a different operation
   - no matter_authorities row is inserted; do not fabricate a user authority from unknown corpus metadata
3. Target absent but the same live saved row already exists:
   - HTTP 200
   - body includes { unavailableAuthority: MatterAuthorityUnavailable }
   - shell fields only: authorityId, judgmentId, addedBy, addedAt, removedAt, availability='corpus_unavailable'
   - no mutation.

REFUSAL TOTAL:

- structured sparse_unbounded and structured sparse_timeout responses OMIT the top-level total property
- do not send total: 0, total: null, or an unknown-count surrogate
- retrievalOutcome.resultCount remains the count-bearing field
- honest completed no_match is not changed by this rule.

TIMEOUT VOCABULARY:

- retrievalOutcome.state = coverage_unknown
- retrievalOutcome.reasons includes timeout
- degraded includes sparse_timeout
- do not add sparse_timeout to RetrievalOutcomeReason
- sparse_unbounded remains the distinct refusal/remedy reason.

Required focused tests:

- absent-new target: exact 409 code, constrained message, and matter_authorities row count unchanged
- already-saved/now-unavailable target: exact 200 six-field shell and no mutation
- no fabricated case/citation/verification/currentness/treatment/replacement/source fields
- present target retains R16 201/200 behavior
- sparse_unbounded and sparse_timeout responses both fail hasOwnProperty('total')
- sparse_timeout reasons contain timeout and not sparse_timeout; degraded contains sparse_timeout; state coverage_unknown
- no_match completed path retains its honest total behavior
- no timeout increase, gin_fuzzy_search_limit, semantic fallback, or automatic retry.
