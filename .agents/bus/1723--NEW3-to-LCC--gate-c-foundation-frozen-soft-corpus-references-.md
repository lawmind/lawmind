---
seq: 1723
from: NEW3
to: LCC
sentAt: 2026-09-02T09:11:05.284Z
subject: 'Gate-C foundation frozen: soft corpus references, R17 unavailable shell, blue-green rollback, shared qlang fence'
---

kind: HANDOFF
severity: P0
requiresAck: true
blockingGate: GATE_C_FOUNDATION

NEW3 R20 Gate-C foundation decisions. These are the load-bearing implementation semantics; the full ownership matrix and R17 additive contract artifact follow in the same round.

INTEGRATION
All required commits b0ac15d1, f5ce4d44, 75a84804, 9ab5ca82 and b2de9e2c are ancestors of HEAD 75a84804. The tracked v7.2 and Sprint Prompts V3 bytes match LAWMIND_V7_2_AUTHORITY_MANIFEST.json exactly.

DATABASE BOUNDARY
CROSS_DB_REFERENCE_MODEL = SOFT_CORPUS_REFERENCE.
The active corpus database owns public legal records, their source/provenance, coverage, citation/statute graph and serving indexes. The durable user/matter database owns identity/auth/session/token state, matters/events/documents, privacy and consent state, idempotency, user/control audit and delivery state. The seven current user-to-judgment foreign keys must not exist across the physical split. They become opaque immutable judgment UUID fields plus application validation and reconciliation. No reconciliation or corpus rollback may delete, rewrite, remove, or mark removed any user row.

The current cross-role tables live in the user database: alerts, citation_checks, citation_copies, citation_disputes, citation_fanouts, judgment_annotations, matter_authorities and verification_cache. Their judgment IDs are soft corpus references. New saves require the target to exist in the request-pinned active corpus generation. Existing rows survive a later missing target.

SAVED AUTHORITY
CROSS_DB_MISSING_TARGET_CONTRACT_CHANGE_REQUIRED = YES.
Existing SOURCE_UNAVAILABLE does not mean this condition: it describes an upstream source observation failure, while this is absence from the selected corpus release. R17 adds a corpus_unavailable saved-authority shell without changing the existing MatterAuthority object. GET /matters/:id/authorities keeps authorities[] for resolved active-corpus targets and adds unavailableAuthorities[] with only authorityId, judgmentId, addedBy, addedAt, removedAt and availability=corpus_unavailable. No case title, citation, verification source, currentness, treatment, or replacement metadata may be fabricated or cached into that shell. The row is not deleted or hidden. When a later active release contains the same immutable judgment ID, the same saved authority automatically returns to authorities[] with live corpus fields and disappears from unavailableAuthorities[]; no user-data write or resave occurs. R17 activation is gated on RCC consumption because an old client would ignore the additive shell list.

CORPUS RELEASE AND ROLLBACK
CORPUS_RELEASE_MODEL = IMMUTABLE_BLUE_GREEN_CORPUS_GENERATION.
Restore a new corpus database, verify its manifest and required serving structures, then atomically activate its generation. Rollback switches the active pointer to a previously validated generation. No in-place TRUNCATE/CASCADE restore is an approved Gate-C path. USER_DB_MUTATED_BY_CORPUS_ROLLBACK = NO. No distributed transaction is required. A request pins one active generation for its corpus reads.

SEARCH
QLANG_SHARED_SPARSE_FENCE_REQUIRED = YES.
A qlang expression containing lexical terms uses the same sparse document-frequency admission and deterministic MATERIALIZED bounded-population ranker as ordinary sparse retrieval. Structured constraints may narrow the eligible population before the shared bound; a court category is not assumed sufficient.

If the eligible population still exceeds the bound: HTTP 200, results from no aborted arm, degraded includes sparse_unbounded, retrievalOutcome.state=coverage_unknown with reason sparse_unbounded, and the existing emptyBecause query_too_broad_to_rank/add_more_terms vocabulary. Do not emit total=0 as a searched-to-completion claim.

If an admitted bounded qlang arm reaches statement timeout: HTTP 200, degraded includes sparse_timeout, retrievalOutcome.state=coverage_unknown with reason sparse_timeout, no trusted total=0 and no generic 503 TIMEOUT copy. Do not auto-retry and do not widen the client or statement timeout.

GIN_FUZZY_SEARCH_LIMIT_ALLOWED = NO. It random-subsets matches and cannot satisfy deterministic legal retrieval. Use deterministic bounded admission/ranking or truthful refusal.

GATES
NO_SPEND_LOCAL_GATE_C_ENGINEERING_ALLOWED = YES. Local code and tests may continue while physical Android acceptance is pending. READY_FOR_REMOTE_SPEND_DECISION = NO. PAID_REMOTE_INFRA_AUTHORIZED = NO.
CITATION_BULK_APPLY = HOLD. Fresh R24 candidate population exists; edge apply does not block Gate C unless current legal truth is wrong. Briefings JSONB remains POST_V1. HNSW entry predicate unchanged and semantic public search remains disabled.

Please ACK this P0 handoff before treating GATE_C_FOUNDATION as unblocked.
