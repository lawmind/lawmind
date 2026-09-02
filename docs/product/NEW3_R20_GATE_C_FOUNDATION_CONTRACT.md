# NEW3 R20 — Gate-C foundation contract

**NEW3, 2 September 2026.** Governance-only round. No application, service,
package, migration, database row, remote resource, or background worker was
changed. The P0 LCC handoff was sent early as bus 1723; this memo finishes the
authoritative record.

## Decision

```text
CROSS_DB_REFERENCE_MODEL                       = SOFT_CORPUS_REFERENCE
CROSS_DB_MISSING_TARGET_CONTRACT_CHANGE_REQUIRED = YES
CORPUS_RELEASE_MODEL                           = IMMUTABLE_BLUE_GREEN_CORPUS_GENERATION
CORPUS_ROLLBACK_MODEL                          = ACTIVE_GENERATION_SWITCH
USER_DB_MUTATED_BY_CORPUS_ROLLBACK             = NO

QLANG_SHARED_SPARSE_FENCE_REQUIRED             = YES
GIN_FUZZY_SEARCH_LIMIT_ALLOWED                 = NO

NO_SPEND_LOCAL_GATE_C_ENGINEERING_ALLOWED      = YES
CURRENT_V1_FUNCTIONALLY_COMPLETE               = PENDING_DEVICE
READY_FOR_REMOTE_SPEND_DECISION                = NO
PAID_REMOTE_INFRA_AUTHORIZED                   = NO

CITATION_BULK_APPLY                            = HOLD
CITATION_EDGE_APPLY_BLOCKS_GATE_C              = NO
BRIEFINGS_JSONB_WRITER                         = POST_V1
HNSW_ENTRY_PREDICATE                           = UNCHANGED
SEMANTIC_PUBLIC_SEARCH                         = DISABLED
```

## 1 · Integration and authority

At `HEAD_START = 75a84804c09be058f9d7b20f3d60e4845ec7f729`, all required
commits were ancestors of HEAD: `b0ac15d1`, `f5ce4d44`, `75a84804`,
`9ab5ca82`, and `b2de9e2c`.

The tracked authority bytes match
`docs/roadmaps/LAWMIND_V7_2_AUTHORITY_MANIFEST.json`:

| artifact                             |  bytes | sha256                                                             |
| ------------------------------------ | -----: | ------------------------------------------------------------------ |
| `LAWMIND_MASTER_ROADMAP_V7_2.md`     | 41,064 | `99a25cb4ffed2bf88e15f11501aa3593d203422dda1193750bdcb677b956a254` |
| `LAWMIND_SPRINT_PROMPTS_V3.md`       | 36,688 | `c6becbf97bede0e9b055bbe30d2d30c6687a8a0d31afac7b01078bffdb086e31` |
| `LAWMIND_V7_2_DEEP_RESEARCH_MEMO.md` | 14,891 | `285a9114aa72bcc1bdf55efca871d8a33ef67326b3e5080d56ad801469e7768c` |

No historical authority or contract artifact was edited.

## 2 · Authoritative database ownership matrix

The local live catalogue contained **102 public base tables**. Classification
was not inferred from names: the matrix uses live foreign keys, the declared
columns and invariants in `packages/db/src/schema.ts` and the migrations, serving
route reads/writes, the R16 capability registry, and LCC R24's release-export and
cascade evidence.

`USER_MATTER_OWNED` below means the durable application/control domain, not only
rows containing client prose. It includes identity, privacy, audit, telemetry,
and delivery state that a corpus generation switch must never erase.
`CROSS_ROLE_REFERENCE_ONLY` tables are physically in that durable database and
carry a soft immutable corpus UUID.

| class                       | count | tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ownership evidence                                                                                                                                                                                                                                                                            |
| --------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORPUS_OWNED`              |    34 | `citation_concordance_resolutions`, `citation_key_dirty`, `citation_key_frontier`, `corpus_coverage`, `coverage_cell`, `document_duplicate_groups`, `document_duplicate_members`, `document_enrichments`, `external_citation_documents`, `external_citations`, `harvest_fetches`, `harvest_queue`, `hc_class_candidate`, `hc_ingest_ledger`, `judgment_chunks`, `judgment_citation_aliases`, `judgment_citation_keys`, `judgment_citations`, `judgment_coverage`, `judgment_date_quality`, `judgment_judges`, `judgment_paragraphs`, `judgment_recovery_queue`, `judgment_statute_refs`, `judgment_text_recovery`, `judgments`, `lexeme_document_frequency`, `official_source_artifact`, `quality_screen_runs`, `statute_amendment_unparsed`, `statute_amendments`, `statute_mappings`, `statute_sections`, `statutes`                 | Public legal/source records, provenance artifacts, coverage, ingest truth, citation/statute graph, paragraphs/chunks and derived serving indexes. Every judgment/statute relationship stays inside this domain.                                                                               |
| `USER_MATTER_OWNED`         |    25 | `activation_events`, `api_idempotency_records`, `audit_log`, `auth_account`, `auth_session`, `auth_user`, `auth_verification`, `data_requests`, `documents`, `erasure_objects`, `experiment_assignments`, `experiment_exposures`, `llm_calls`, `matter_events`, `matters`, `official_source_fetch_ledger`, `ops_alert_deliveries`, `ops_job_observations`, `platform_config`, `r2_operation_ledger`, `refresh_tokens`, `search_events`, `searches`, `training_consent_events`, `users`                                                                                                                                                                                                                                                                                                                                                 | User identity/content and durable control/audit state. `official_source_fetch_ledger` is append-only access evidence and `r2_operation_ledger` is operational history; neither may disappear merely because a corpus generation rolls back.                                                   |
| `CROSS_ROLE_REFERENCE_ONLY` |     8 | `alerts`, `citation_checks`, `citation_copies`, `citation_disputes`, `citation_fanouts`, `judgment_annotations`, `matter_authorities`, `verification_cache`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Each carries user, matter, verification, dispute, annotation, copy or notification history plus a judgment ID. These are durable user-domain records; the live catalogue proves the seven direct FKs to `judgments`, and `citation_fanouts` is included because its state drives user alerts. |
| `POST_V1_NOT_RELEVANT`      |    35 | `briefings`, `cause_list_syncs`, `credit_ledger`, `document_vector_staging`, `ecourts_fetch_ledger`, `ecourts_observation`, `ecourts_transition`, `embedding_census_cell`, `embedding_census_progress`, `embedding_content_representative`, `embedding_snapshot`, `embedding_snapshot_policy`, `entitlement_events`, `entitlements`, `factory_schema_journal`, `lcc_r15_falseunique`, `matter_shares`, `monitoring_entitlements`, `n1_lab_passage_role`, `new1_doc_vector_stage`, `new1_doc_vector_stage_refused`, `new1_head_baseline`, `new1_inbound_counts`, `new1_probe_hnsw_1000000`, `new1_probe_hnsw_250000`, `new1_source_vector_stage`, `new1_tranche_passages`, `new2_neutral_dupe_groups`, `new2_p1_sample_groups`, `ocr_jobs`, `premium_jobs`, `resolver_risk_replay`, `saved_searches`, `workspace_members`, `workspaces` | Disabled/held product areas, experiment/staging tables, lane probes, or schema-local metadata. They are not a Gate-C foundation dependency and receive a production-domain assignment before their capability is activated.                                                                   |

The four counts sum to 102 with no duplicate or omitted live table. The 34-table
corpus class is an ownership boundary, not the seven-table release-pack manifest:
LCC R24 proved that treating those seven as the whole corpus would silently erase
paragraph, vector, provenance, enrichment, and user tables.

### Current-v1 facts the matrix makes explicit

- Auth identity, sessions, accounts, verification tokens, refresh tokens, user
  profiles, privacy requests, training consent, and idempotency are durable user
  data.
- `citation_checks` and `verification_cache` preserve human/user evidence in the
  durable domain. Their judgment IDs may become unavailable; the evidence rows
  do not disappear.
- `judgment_chunks`, `judgment_paragraphs`, citation keys/aliases/edges,
  statutes/sections/references, source artifacts, coverage, and lexical indexes
  are corpus data.
- HNSW/vector ownership is corpus-side, but its entry predicate and public
  activation remain outside this Gate-C exact/structured/lexical decision.

## 3 · Cross-database reference architecture

The current API does not support a physical split: it has one `DATABASE_URL`,
two workload pools over that same URL, nine serving statements that join a
user-owned row to `judgments`, and seven user-to-judgment foreign keys.

Gate C requires `SOFT_CORPUS_REFERENCE`:

1. Corpus UUIDs remain immutable across release packs.
2. The eight cross-role tables live in the durable user database.
3. No physical FK points from the user database into a corpus generation.
4. New cross-role writes validate the target in the request-pinned active corpus
   generation, then write the user database. No distributed transaction.
5. Reads fetch user rows, batch corpus IDs into one indexed corpus read, and
   merge in application memory. A missing target produces the R17 shell.
6. Reconciliation reports counts and IDs for operations; it never deletes,
   rewrites, removes, or changes legal status on a user row.

The existing transparent JOIN shape is not preserved across databases.

## 4 · Missing saved-authority target

`SOURCE_UNAVAILABLE` already exists as a trust concept, but is not the same
condition: it means an upstream source observation failed. The selected corpus
generation omitting a target says nothing about upstream reachability or the
judgment's existence or legal status. The smallest truthful addition is
`availability = corpus_unavailable` in a separate saved-authority shell array.

The exact API shape, write outcomes, removal behavior and automatic restoration
are frozen in
[`RCC_V1_API_CONTRACT_R17_AMENDMENT.md`](RCC_V1_API_CONTRACT_R17_AMENDMENT.md).

```text
MISSING_TARGET_EXISTING_VOCABULARY = NO_EXACT_EQUIVALENT
CROSS_DB_MISSING_TARGET_CONTRACT_CHANGE_REQUIRED = YES
```

No judgment title, citation, verification/currentness, treatment or source
metadata is copied into the shell. A later generation containing the same UUID
restores the full live object on read without mutating the saved row.

## 5 · Corpus release and rollback

The approved model is immutable blue/green corpus generations:

```text
new corpus database
  -> restore release
  -> verify manifest, required tables, indexes, constraints and serving probes
  -> register validated generation
  -> atomically activate generation

rollback
  -> atomically switch to a prior validated generation
```

The user/matter database is not part of a corpus release. It is backed up and
restored independently. A corpus rollback never runs a user mutation, never
truncates a shared database, and never invokes `CASCADE` across domains. Old
validated generations remain available for rollback. Requests pin one generation
so a mid-request activation cannot mix two releases.

The current cascade guard is a correct refusal for the old shared-database path,
not the Gate-C rollback architecture. `USER_DB_RESTORE_DRYRUN` remains absent and
is an implementation prerequisite before remote alpha.

## 6 · Search truth at the 15-second boundary

The qlang/structured lexical path uses the same sparse admission and deterministic
materialized population fence as ordinary sparse retrieval.

```text
QLANG_BOUNDED_OUTCOME =
  admitted population completes -> existing answered/abstained semantics;
  population above bound -> HTTP 200 + sparse_unbounded + coverage_unknown,
  existing emptyBecause, no trusted total

QLANG_TIMEOUT_OUTCOME =
  HTTP 200 + sparse_timeout + coverage_unknown,
  no trusted total, no generic TIMEOUT 503, no automatic retry

USER_VISIBLE_MEANING =
  the system did not complete this search; it did not prove that no judgment
  matched. Use existing neutral incomplete/refusal rendering.
```

`gin_fuzzy_search_limit` is prohibited because PostgreSQL may return a random
subset of matches. Legal retrieval either ranks a deterministic bounded
population or truthfully refuses.

## 7 · Gate-C engineering while the device is pending

R19 remains authoritative: `CURRENT_V1_FUNCTIONALLY_COMPLETE = PENDING_DEVICE`.
That prevents a remote-spend decision; it does not prohibit reversible local
code and tests for the already-approved remote architecture.

```text
NO_SPEND_LOCAL_GATE_C_ENGINEERING_ALLOWED = YES
READY_FOR_REMOTE_SPEND_DECISION           = NO
PAID_REMOTE_INFRA_AUTHORIZED              = NO
```

No VPS, managed database, paid remote API, hosting trial, or split deployment is
authorized by this memo.

## 8 · Preserved holds and non-blockers

- NEW2 R24's canonical correction is PASS. A fresh 1,556,947-candidate edge
  population exists. `CITATION_BULK_APPLY = HOLD` and edge application does not
  block Gate C unless current product legal truth is shown wrong.
- The briefings JSONB writer remains `POST_V1`; the capability is disabled and
  no new evidence made it current-v1 reachable.
- NEW1 continues independently. The HNSW entry predicate is unchanged and
  semantic public search remains disabled.

## 9 · Blockers after this decision

The product decisions are frozen; LCC does not need to stop for another one.
Implementation evidence is still required for:

1. R17 server implementation and RCC consumption, then independent NEW3
   acceptance before physical split activation.
2. A user/matter backup and restore dry run.
3. The pending physical Android R16 mutation, deep-link and device-health matrix.
4. Explicit founder authorization before any paid remote infrastructure.

None of those blocks no-spend local Gate-C engineering.
