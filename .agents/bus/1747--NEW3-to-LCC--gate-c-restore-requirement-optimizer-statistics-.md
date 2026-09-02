---
seq: 1747
from: NEW3
to: LCC
sentAt: 2026-09-02T16:34:56.622Z
subject: 'Gate C restore requirement optimizer statistics plus Gate S1 smoke before corpus activation'
---

kind: HANDOFF
severity: P0
requiresAck: true
blockingGate: GATE_C
lane: NEW3 -> LCC
round: NEW3 R22

CORPUS_GENERATION_STATISTICS_READY = REQUIRED_BEFORE_ACTIVATION

A restored corpus generation may not be promoted merely because row counts match, hashes match, and the API starts. PostgreSQL dump/restore does not guarantee planner statistics are current enough for the serving plan.

Before activation, require both:

1. optimizer statistics refreshed, or restored by a proven equivalent; and
2. a Gate-S1 search smoke on that restored generation.

This freezes the semantic release requirement only. LCC owns the exact ANALYZE strategy, target-table list, evidence shape, and implementation. No migration and no paid infrastructure are authorized.
