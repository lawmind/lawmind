# NEW3 — v1 PRODUCT DEFINITION AGAINST VERSIONED DATA CAPABILITIES

**Round:** Sprint 2, NEW3 (discovery lane). **Date:** 29 August 2026.
**Backend measured:** live local API, `gitSha 8795ba8b9d569ac5afbbb724d2c9299ed6094c15`,
`contract 1`, database reachable. **Gate A: PASS. NEW3_START: AUTHORIZED.**

**DONE:** v1 defined against capabilities that carry a version, a denominator and an
evidence artifact — ten advocate workflows run against the live backend, a five-state
capability registry, the search / data-trust / monitoring contracts, a frozen RCC API
surface, a claims register and the analytics + derived-intelligence metric definitions.
**VERIFY:** every acceptance case records an actual HTTP status, payload and latency from
`http://localhost:3011`; every registry number cites either a query in this round's
artifacts or a file path in this repository.

**No data worker was stopped.** NEW1's coarse walk, doc-vector embed and GPU sidecar
(PID 13404, 35,456 s CPU) ran throughout; NEW2's ingest and LCC's jobs were untouched.
Seven Postgres backends were active during the measurement pass and every timing below
was taken with them running — a timing taken on a quiet box would not describe this box.

**Nothing was implemented.** No UI, no Railway deploy, no billing, no AI generation, no
semantic exposure, no monitoring enablement.

---

## 0. THE ONE THING TO CARRY FORWARD

The corpus is not the constraint. **Query shape is.**

18,758,460 judgments are held; 100% carry a date and a source URL; 99.99986% carry a CNR;
lexical coverage equals ingest coverage exactly, by construction. And yet an advocate who
types `SATENDER KUMAR ANTIL` — an authority we hold, and the most-cited node in the
sampled citation graph with 7,418 inbound edges — gets **zero results**. An advocate who
narrows to one High Court and one month and types `bail` is told their query is
**too broad**.

Both are the same mechanism, read out of the code rather than guessed:
`services/api/src/search/retrieve.ts` decides admission from `rarestDf`, computed against
`lexeme_document_frequency`, which is **corpus-wide**; the caller's `filters` are a
parameter of the same function and are **not consulted before the refusal**.

So v1's blockers are not data blockers. They are two bounded search-path changes, and
they are worth more to the product than any embedding percentage.

---

## 1. TEN-MATTER ACCEPTANCE

Eleven cases run (ten required coverage areas; party/title and recent-authority each
needed two query widths to locate the boundary, and M11 folds three probes). Full
evidence with raw payloads: **`docs/product/TEN_MATTER_ACCEPTANCE_R12.json`**.

Fixtures were selected **from the live corpus at run time**, never hardcoded, so a stale
fixture cannot make a dead path look alive.

| # | Query / action | Capability | Data source | Freshness evidence | Result | Uncertainty / degraded | Latency | Verdict |
|---|---|---|---|---|---|---|---|---|
| M1 | `POST /search` `2026:JHHC:25953` | `search.exact_identity` | `judgments.neutral_citation` (AWS Open Data HC) | object route, `latestLocalDecisionDate 2026-08-28`, `sourceLagDays 0`; fixture decided 2026-08-28 | rank 1 = fixture | none | **6.0 ms** | PASS |
| M2 | `POST /search` `[2024] 10 S.C.R. 673` | `search.exact_identity` | `judgments.reporter_citations` (SCR) | fixture decided 2024-10-15 | rank 1 = fixture | none | **4.0 ms** | PASS |
| M3 | `POST /search` `BRHC011177572024` | `search.exact_identity` (CNR) | `judgments.cnr`, backfilled from AWS HC metadata — **not** from eCourts | fixture decided 2025-01-08 | rank 1 = fixture | none | **2.0 ms** | PASS |
| M4 | `POST /search` `WPA/24211/2023` | `search.exact_identity` (case number) | `judgments.case_number` as printed | fixture decided 2024-01-02 | fixture present in candidates | candidate list, not a pin | **537.0 ms** | PASS |
| M5 | `POST /search` at three widths — party only · full title · famous party name | case-title arm + lexical fallback | `judgments.case_title` | fixture decided 2026-08-28 | **full title → rank 1**; party only → **0**; `SATENDER KUMAR ANTIL` → **0** | `sparse_unbounded` (df 0.0654) / `sparse_timeout` (df 0.0055); `emptyBecause = query_too_broad_to_rank` | 8.3 ms (full title) | **PASS_WITH_LIMIT** |
| M6 | `GET /statutes`, `/statutes/sections?q=murder`, `?sectionNumber=103` | `statute.lookup` | 849 Acts, 36,663 sections | statute freshness **UNMEASURED** and reported as such | 200 · 5 sections · 5 sections | none | **10.2 ms** | PASS |
| M7 | `POST /search` over `courts=[hc]`, 2026-08-01..2026-08-29, two query widths | `search.structured_filters` + pagination | `judgments.court`, `judgment_date` | object route; **45,660 judgments in the window (measured)** | narrow query → 5 results, all in window, `hasMore true`; **`bail` → 0** | narrow: none. broad: `sparse_unbounded`, df 0.2577 | 179.7 ms | **PASS_WITH_LIMIT** |
| M8 | `GET /judgments/:id` | reader + exact span + provenance | body text + 0092 provenance columns | `asOf` on response; `dateQualityState` carried | 200. Payload carries `sourceUrl`, `textOrigin`, `generationEvidenceEligible`, `numberedShare`, all three citation fields, `overruledStatus` **and** `overruledStatusStored`, `precedentialEffect`, `canAddToMatter` | `bodyText.evidenceWithheld` where body text is convicted damaged | **4.4 ms** | PASS |
| M9 | `GET /judgments/:id/graph`, `/treatment`, `/authorities` | `treatment.resolved_signals` | `judgment_citations` | `asOf` on response; fixture has 7,418 inbound edges | 200/200/200; 15 nodes, 20 edges, `truncated` present | **no partiality declaration** — see §6 | **1,138.3 ms** | PASS |
| M10 | `POST /matters` → `POST /matters/:id/authorities` → `GET /matters/:id/authorities` | `matter.workspace` + `matter.saved_authorities` | `matters`, `matter_authorities` joined to `judgments` at read | `asOf 2026-08-29T17:42:17.803Z` | 201 · 201 · 200, 1 authority listed. Saved authority carries **`verificationState`, `verifiedBySource`, `overruledStatus` as three separate fields** | none | **7.8 ms** | PASS |
| M11 | `POST /search` natural sentence + 600-char probe + high-df term | lexical + honest refusal | `judgments.full_text_tsv` (`GENERATED ALWAYS`) | lexical coverage **equals ingest, by construction** | sentence → results; 600 chars → **400, "nothing has been shortened"**; `section 302` → 0 with `sparse_timeout` | `degraded[]`, `retrievalOutcome.state = coverage_unknown`, `safeForGeneration false` | 2,107.2 ms | PASS |

**Score: 9 PASS · 2 PASS_WITH_LIMIT · 0 HOLD.**

**Cleanup, stated because debris reads as fraud.** The run created one fixture user in the
`example.test` domain, one matter and one saved authority, and deleted all of them —
deleting by OWNER rather than by the ids the responses exposed, because a response shape
we misread still wrote a row. Verified after: `usersLeft 0`, `mattersLeft 0`,
`mattersTotal 3` — the same 3 that existed before.

**Reproducible, not just recorded.** The harness is
`scripts/new3-ten-matter-acceptance.mjs`; the two measurement passes are
`scripts/new3-derived-intelligence-metrics.mjs` and
`scripts/new3-derived-intelligence-graph.mjs`;
`scripts/new3-acceptance-cleanup.mjs` removes fixture rows if a run is interrupted.
Run it as `AUTH_SECRET=<the API's own secret> BASE=<url> node
scripts/new3-ten-matter-acceptance.mjs`. It **refuses to start without the secret**
rather than defaulting one, because it mints a valid session with it. The one-off
probes written along the way were deleted.

### ACCEPTANCE_BLOCKERS

Two, both in search, both bounded, neither a data problem.

**AB-1 — Party-name search returns nothing.** An advocate names a case by its parties.
A full cause title resolves at rank 1 in 8.3 ms; the party name alone returns zero. The
party-name path *exists* in `retrieve.ts` (`rarestToken` + trigram narrowing) but the
request never reaches it — the query is treated as ordinary text and decided by the
document-frequency gate first. **Severity: high.** This is the most common real query
shape in the product and it currently looks like an empty corpus.

**AB-2 — Filters do not bound the admission gate.** `bail` inside one court and one
month — 45,660 judgments — is refused as `query_too_broad_to_rank` at `rarestDf 0.2577`,
because the df is corpus-wide and the filter is not read before the refusal. **Severity:
high**, because narrowing is precisely what the advocate did, and being told to narrow
further is the wrong instruction.

Neither blocks the *other* nine capabilities, and both have honest failure behaviour today
(`emptyBecause` names a reason and a remedy; nothing is silently dropped). They block
**v1 shipping**, not v1 *definition*.

---

## 2. VERSIONED CAPABILITY REGISTRY

**`docs/product/V1_CAPABILITY_REGISTRY_R12.json`** — `NEW3_V1_CAPABILITY_REGISTRY_R12_2026-08-29`.

It is **additive to** `GET /release/capabilities` (`RELEASE_CAPABILITIES_R8_3.3`), not a
replacement. That route is the server's statement about itself in a four-state vocabulary;
this registry is the product's shipping decision in the five-state vocabulary. Every row
names the runtime row it derives from. **Where they disagree, the runtime registry wins on
fact and this one wins on shipping decision.**

Each capability carries: `state` · `dataDependency` · `coverageDefinition` (with its
denominator) · `freshnessDefinition` · `evidenceArtifact` · `minimumBackendVersion`.

`minimumBackendVersion` is the `contract` integer from `GET /version` at which a client may
rely on the shape. Contract 1 is the only version that exists; **anything marked 2 is a
shape a v1 client must not depend on.**

| capability | state |
|---|---|
| `search.exact_citation` | ENABLED_V1 |
| `search.cnr` | ENABLED_V1 |
| `search.case_number` | ENABLED_V1 |
| `search.case_title_full` | ENABLED_V1 |
| `search.structured_filters` | ENABLED_V1 |
| `search.lexical` | ENABLED_V1 |
| `search.honest_refusal` | ENABLED_V1 |
| `judgment.reader` | ENABLED_V1 |
| `judgment.source_evidence` | ENABLED_V1 |
| `corpus.freshness_provenance` | ENABLED_V1 |
| `statute.lookup` | ENABLED_V1 |
| `statute.linked_judgments` | ENABLED_V1 |
| `citation.graph_partial` | ENABLED_V1 |
| `citation.verification_three_field` | ENABLED_V1 |
| `matter.workspace` | ENABLED_V1 |
| `matter.saved_authorities` | ENABLED_V1 |
| `search.party_name_only` | **DISABLED_NOT_READY** (AB-1) |
| `search.filtered_broad_query` | **DISABLED_NOT_READY** (AB-2) |
| `statute.old_new_correspondence` | DISABLED_NOT_READY |
| `briefing.daily_loop` | DISABLED_NOT_READY |
| `ecourts.raw_observation_pipeline` | DISABLED_NOT_READY |
| `ecourts.parser` | DISABLED_NOT_READY |
| `monitoring.user_product` | DISABLED_NOT_READY |
| `ecourts.daily_pilot` | **DISABLED_EXTERNAL_BLOCK** |
| `documents.upload_and_ocr` | **DISABLED_EXTERNAL_BLOCK** |
| `search.semantic.broad` | **INTERNAL_EXPERIMENTAL** |
| `search.semantic.supporting_authority` | POST_V1 |
| `search.semantic.adverse_authority` | POST_V1 |
| `generation.evidence_from_passages` | POST_V1 |
| `language.hindi` | POST_V1 |

**No row-count claim in that file appears without its denominator.** Where a denominator
was not measured, the field reads `UNMEASURED` — never an estimate wearing a count's
clothes.

---

## 3. ENABLED V1 FOUNDATION

Sixteen capabilities ship, and acceptance proves each one against live data.

The v1 product is: **find the authority you already know how to name; read it with its
source and its status; see what cites it; keep it in a matter.** That is a complete,
defensible product with zero AI in the user's path.

**Semantic and AI stay disabled.** Every search response already tells the truth about it:
`semanticAvailable: false`, `semanticIndexSufficient`, `retrievalOutcome.reasons` includes
`semantic_index_insufficient`, and `safeForGeneration: false` on every case observed.

Two ENABLED_V1 rows carry limits the product must render rather than hide:

- **`statute.linked_judgments`** — a link is a *candidate correspondence*, never evidence
  the section says what the judgment says it says. FIFTH measured 1,723 links whose
  statute was enacted **after** the judgment citing it (1,117 of them pre-1974 CrPC
  references pinned to the 1973 Code). The UI must say "cited section, as extracted", not
  "the section this judgment applies".
- **`judgment.source_evidence`** — see §6 and the banned claim in §10.

---

## 4. EMBEDDING CAPABILITY STATE — internal only

Recorded because coverage is a **data moat**, and recorded internally because a moat is
not a feature.

```
SNAPSHOT VERSION        document-vectors-v2
  definition            5b5d02384b46c96c
  manifestHash          524ece8a4254...
  batches               766
SNAPSHOT ELIGIBLE       7,654,179          (NEW1 R10)
COARSE STAGED           2,738,744          measured 2026-08-29T17:45Z, new1_doc_vector_stage
  vs snapshot           35.780%
  vs corpus             14.600%            of 18,758,460
INCREMENTAL BACKLOG     0 eligible uncovered — the delta queue cleared 930 of 930 in 87 s;
                        watermark on LCC's frontier 2026-08-29T04:55:22.134Z
PASSAGE COVERAGE        judgment_chunks 620,300 rows over 40,161 DOCUMENTS = 0.21409%
                        new1_tranche_passages 418,116 — untouched, Tranche V2 NOT started
UNION REACH             111,874 documents = 0.59639% of corpus (NEW1 R10: 2.786x)
CAUGHT_UP_TO_SNAPSHOT   not reached
```

**And this number moves while you read it.** `new1_doc_vector_stage` was 2,738,744 at
17:45Z and **2,763,622 at 18:38Z** — 24,878 rows in 53 minutes, measured again at the end
of this round, with +398 rows observed in a single bounded 45-second window. That is the
whole reason this registry is *versioned*: a coverage percentage without a `takenAt` and a
snapshot version is a number about a moment nobody recorded. **Every embedding figure in
this document is stamped 2026-08-29T17:45Z against `document-vectors-v2`, and it was
already stale before the document was committed.**

**620,300 chunks are 40,161 documents.** The chunk count is not a coverage number and has
been misread as one before. The semantic population is **0.21% of the corpus**.

**SEMANTIC_PUBLIC_STATE = DISABLED**, and rising coverage does not change it. The reason is
not the percentage: a semantic arm reaching 0.21% of the corpus and returning nothing is
**indistinguishable from a corpus that holds nothing on the point**, and that is the exact
confusion this product exists to prevent.

NEW1 also measured the honest thing here: wiring the tranche into the benchmark moved it by
**1 authority out of 228** — a null result, reported as one. What is *not* null is that
**186 of 228 (81.58%) are in the coarse snapshot**. The benchmark is movable by the coarse
layer, not by the passage tranche.

**The API contract is already shaped for semantic to arrive without a rewrite.** The
result object is source-agnostic; `retrievalOutcome` already carries
`semantic_index_insufficient` as a *reason*, `degraded[]` already carries `dense_timeout`
as an *arm*, and `semanticAvailable` / `semanticIndexSufficient` are already fields. Adding
a semantic candidate later adds rows to `results[]` and flips two booleans. **No schema
change is required, and none may be made for it.**

---

## 5. eCOURTS CAPABILITY STATE — four states, deliberately not one

Read from LCC's R11 closure (bus 1524, `docs/ai/lcc-r11/`) and re-probed live.

> **CONTESTED, AND IN MOTION AS THIS WAS WRITTEN.** At 17:29Z on 29 Aug 2026 — after
> broadcasting 1524 — LCC took the `GIT_COMMIT` lease with the task
> *"R11b: correct the invented CAPTCHA blocker and complete the cause-list pipeline"*.
> That is LCC saying its own R11 CAPTCHA finding may have been wrong. **No correction had
> reached the bus when this document was written (newest message: 1525), so the row below
> attributes the claim to 1524 rather than asserting it.**
>
> **Nothing in this document turns on how that resolves.** The three states NEW3 measured
> directly — `ecourts_observation` = **0 rows**, `ecourts_fetch_ledger` = **131 rows**, and
> `POST /court/lookup` answering `available:false, no_adapter_implemented` — are true either
> way. And `USER_MONITORING_PRODUCT` stays `DISABLED_NOT_READY` on gates 2, 3 and 4 (the
> observation writer, measured capacity, measured retention) **even if the CAPTCHA question
> disappears entirely**. If LCC lands a working cause-list pipeline, `ECOURTS_DAILY_PILOT`
> moves from `DISABLED_EXTERNAL_BLOCK` to `DISABLED_NOT_READY` or better, and **no other
> row in this document changes.**

| sub-capability | state | evidence |
|---|---|---|
| `ECOURTS_RAW_OBSERVATION_PIPELINE` | **DISABLED_NOT_READY** | `ecourts_observation` = **0 rows**. Nothing in the tree INSERTs into it — every reference is a `count(*)` or the schema definition. |
| `ECOURTS_PARSER` | **DISABLED_NOT_READY** | fixture-bound; caught a real defect on its first run (the page's inline translation dictionary contains "Record not found", and a document-wide match read a CAPTCHA form as an empty court day). Not bound to a live page because no live page can be fetched. |
| `ECOURTS_DAILY_PILOT` | **DISABLED_EXTERNAL_BLOCK** | The first authorised request ever made under the grant returned the court's own answer: the cause list serves **no data** until `cause_list_captcha_code` is satisfied. `captchaBypassPermitted` is true and the grant records **no operational basis** — no credential, no whitelisted address, no exempt endpoint. `CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED`. |
| `USER_MONITORING_PRODUCT` | **DISABLED_NOT_READY** | four gates, below. |

**These do not collapse into one another.** The first three could all become operational
and `USER_MONITORING_PRODUCT` would still be `DISABLED_NOT_READY`, because internal data
acquisition is not a user-facing claim.

**Switch state:** `platform_config.ecourts_harvest` is **OFF**, flipped back through the
audited path with a reason recorded. Quota spent: 2 of 1,000 daily, 2 of 100 hourly — and
one of those two never reached the network (an em dash in the configured attribution;
HTTP header values are ByteStrings).

**Retention is UNMEASURED**, for both High Court and district, and is recorded that way
rather than estimated: every probe date meets the same wall, so twelve requests would buy
twelve identical refusals.

**Honest behaviour today, observed live:**

```
POST /court/lookup {"cnrNumber":"BRHC011177572024"}
→ {"available": false,
   "reason": "no_adapter_implemented",
   "manualEntry": {"expected": true,
     "message": "Enter the next date from your file. Dates given in open court are the
                 normal source and are treated exactly the same as one we looked up."}}
```

That is the correct disabled state: it refuses, says why, and keeps the advocate's own
workflow first-class rather than second-best.

**Pilot observations do not exist, so their schema is defined but not populated.** The
internal schema and matter-linking contract are frozen in §8 and §9 so that when
observations arrive they land in a shape that already exists. **No monetization and no SLA
until capacity and retention are measured** — see §9.

**SCI is untouched.** `SCI_AUTHORISATION_STATE = UNCHANGED`. This document makes no
statement about the Supreme Court automated-access question.

---

## 6. DATA TRUST CONTRACT

Every legal-research response must carry these, and the reader already carries most:

| field | status today | source |
|---|---|---|
| `source` | **present** — court name on every result | `judgments.court` |
| `sourceEdition` | **GAP** — we know the URL, not the edition | must distinguish raw court text from a reporter's edition |
| `provenanceBasis` | **partial** — `textOrigin` present on the reader | `judgments.source_url` 100%; retained artifact 0.07575% |
| `decisionDate` | **present**, with `dateQuality` and `dateQualityState` | `judgment_date` 100% |
| `ingestedAt` / currentness | **present** at corpus level | `GET /corpus/freshness/object` |
| `uncertainty` / degraded | **present** — `degraded[]`, `retrievalOutcome`, `emptyBecause`, `bodyText.evidenceWithheld` | |
| original artifact / source action | **present** — `sourceUrl` | |

**Two required additions, both additive:**

1. **`sourceEdition`** on every judgment payload. `raw_court_text` \| `reporter_edition` \|
   `unknown`. The rule it protects is not cosmetic: there is no copyright in a judgment
   (Copyright Act s. 52(1)(q)(iv)), but a reporter's *copy-edited* version is protected
   (*Eastern Book Company v. D.B. Modak*). Today the distinction lives in ingestion
   knowledge and not on the wire.

2. **`coverage` on `GET /judgments/:id/graph`.** The response carries `truncated`, which
   says "this page is short". It does **not** say "this graph is 0.56% complete". Required
   shape:
   ```
   coverage: { basis: "resolved_edges_only",
               resolvedEdgesInCorpus: 200761,
               judgmentsWithAnyResolvedOutgoing: 105024,
               corpusDenominator: 18758460,
               declaredPartial: true }
   ```
   Without it, an empty graph reads as "this authority has never been cited", which is a
   silent drop wearing a different hat.

**Every eCourts-derived response must additionally carry** — frozen now, served never
until the sub-gate passes:

```
observedAt                 ISO instant of the observation itself, not of our read
observationSourceKey       the FIVE-dimension key + date + civil|criminal
                           (state, district, court complex, establishment, court)
                           NOT a court string — "one court, one request" was wrong by
                           more than an order of magnitude
observationStrategy        cause_list | case_status | order_list
rawEvidenceRef             pointer to the retained raw observation row
lastObservationOutcome     ok | refused | parse_failed | captcha_blocked | quota_exhausted
sourceUncertainty          the court's own uncertainty, distinct from ours
monitoringDegradedReason   why this matter is not currently being observed
```

**`LISTED` is never rendered as `HEARING_OCCURRED`.** A cause list says a matter was
*listed*. It does not say it was heard, reached, or decided. These are different facts and
the schema keeps them apart; any surface that collapses them is a defect of the same class
as a fabricated citation.

---

## 7. SEARCH CONTRACT — FROZEN

```
exact identifier   →   structured   →   lexical   →   honest broad-query refinement
```

**No semantic router.** The ladder is deterministic and every rung is observable.

1. **Exact identifier.** Neutral citation, reporter citation, CNR, case number, full case
   title. Resolved by an identity predicate, not by similarity. Returns a pin where
   identity is unique and **every reachable candidate where it is not** — never a rank-1
   pin on a shared neutral citation.
2. **Structured.** Court, court category, date range, case type, statute section. SQL
   predicates with a real `COUNT(*)` behind the structured arm.
3. **Lexical.** `full_text_tsv`, rarest-lexemes-ANDed, bounded by measured document
   frequency.
4. **Honest broad-query refinement.** When the lexical arm cannot rank, the response says
   so and says what to do: `degraded: ["sparse_unbounded"]`,
   `emptyBecause: { reason: "query_too_broad_to_rank", remedy: "add_more_terms" }`. It
   never returns a truncated ranking dressed as a complete one.

**Required change before v1 ships (AB-2), and it is a change to the BOUND, not to the
ladder:** when `filters` narrow the candidate set, the admission bound must be computed
against the **filtered** population, or the structured arm must serve the filtered query
without the lexical ranker. The current bound is corpus-wide while the query is not.

**Required change before v1 ships (AB-1):** party-name queries must reach the existing
trigram path on rung 1 rather than falling to rung 3.

**Room preserved for semantic, and the shape is already right.** A future semantic
candidate enters `results[]` as another element of the same result object, with
`semanticAvailable` flipping true and `dense_timeout` already in the `degraded` vocabulary.
**The result schema does not change when semantic arrives. Nothing may be added to it now
in anticipation.**

**The 500-character limit is a current safe bound, not a product limit,** and the refusal
says so. Long fact patterns need a dedicated bounded passage path, not a raised number.

---

## 8. FIRM-READY DOMAIN MODEL — FROZEN

```
User               identity. auth_user ⟷ users.auth_id
Workspace          the owning container. In v1 exactly one per user, created
                   automatically, invisible in the UI.
WorkspaceMember    (workspaceId, userId, role). Exists in the model from day one so
                   that adding a second member later is a row, not a migration of
                   every ownership check in the product.
Matter             belongs to a Workspace, NOT to a User.
SavedAuthority     belongs to a Matter. Joined to judgments AT READ TIME.
MonitoringEntitlement  (workspaceId, matterId, policy, state). Frozen, unused in v1.
```

**Personal Workspace is automatic in v1.** No enterprise UI is built. No sharing screen,
no invite flow, no role picker.

**The one decision that costs nothing now and is unaffordable later:** ownership resolves
through `Workspace`, never directly through `User`. Every ownership check written today
against `user_id` is a check that must be rewritten when the first two-partner firm signs
up. `matter_shares` already exists and gives the seam.

**Court observations are NOT user-owned, and this is the load-bearing separation.**

```
ecourts_observation          keyed by the observation source key + date.
                             A FACT ABOUT A COURT. No user column. Never deleted
                             on a user's erasure request.
matter ⟷ observation link    a JOIN table keyed by canonical case identity
                             (CNR where present, else court + case_number + year).
```

Two advocates monitoring the same matter share one observation and pay one request against
the quota. If the observation table were user-owned, the same listing would be fetched
twice, the quota would be consumed twice, and a GDPR-style erasure would delete a public
court record. **Raw legal/court observation state and user matter state remain separable,
and remain separated.**

---

## 9. MONITORING CONTRACT — fields frozen, capability disabled

Frozen on the backend now so the shape cannot drift while the capability is off:

```
monitoringPolicy             none | on_hearing_date | daily | weekly
lastObservedAt               timestamptz null
nextPlannedObservationAt     timestamptz null
observationSource            ecourts | manual | none
lastObservationOutcome       ok | refused | parse_failed | captcha_blocked |
                             quota_exhausted | never_attempted
monitoringDegradedReason     text null
```

**Every one of these is null or `never_attempted` in v1, and the client must render that
state as "you are keeping this date yourself", never as "monitoring is on".**

**USER_MONITORING_STATE = DISABLED_NOT_READY. Four gates, and pilot data existing is not
one of them:**

1. `CAPTCHA_OPERATIONAL_BASIS` — external, one sentence from the registrar.
2. An observation writer — ours; nothing INSERTs into `ecourts_observation` today.
3. **MEASURED capacity.** The encoded limits are 2,000 ms minimum interval, 100/hour,
   1,000/day. Naive per-matter-per-day polling caps the **entire product** at under ~1,000
   monitored matters across all users, forever. An adaptive observation planner is needed
   before any number is promised to anyone.
4. **MEASURED retention** — currently `UNMEASURED` for both HC and district.

**No published polling frequency. No SLA. No price.** Gates 3 and 4 must be measured
first, and a promise made before a measurement is a promise made about a guess.

---

## 10. CLAIMS REGISTER v1

Every metric below is a different question. **Turning one into another is the failure this
register exists to prevent.**

| metric | value | denominator | measured |
|---|---|---|---|
| corpus rows | **18,758,460** | exact `count(*)` on `judgments` | 2026-08-29T17:45Z, 17.2 s, 7 concurrent backends |
| courts held | **27** | distinct `judgments.court` | same pass |
| unique identities (CNR) | **18,758,433** | 99.99986% of held judgments | same pass |
| judgments with a neutral citation | **1,389,048** | 7.4049% of held judgments | same pass |
| source-held completeness | **98.822%** | `sourceArtifactHeld / upstreamUnique` = 18,724,692 / 18,947,807 | NEW2 R10 gate |
| accounted completeness | **99.99%** | held + unavailable + refused + never-attempted vs upstream | NEW2 R10 gate |
| upstream/local completeness | **0.9697** | `GET /corpus/freshness/object`, `HC_PARITY_V2_2026-08-29` | published 14:40:46Z |
| citation rows | **22,406,483** | raw `judgment_citations` rows | 2026-08-29 |
| — of which blank sentinels | **16,127,190 (71.98%)** | `citation_text` empty, relationship `cites` | 2026-08-29 |
| **real reference strings** | **6,279,293** | non-blank rows | 2026-08-29 |
| **citation coverage** | **3.6233%** | 227,517 resolved rows / 6,279,293 real reference strings | 2026-08-29 |
| distinct resolved edges | **200,761** | — | 2026-08-29 |
| judgments with ≥1 resolved outgoing citation | **105,024** | **0.55987%** of 18,758,460 | 2026-08-29 |
| judgments cited ≥1 time by a resolved edge | **35,153** | **0.18740%** of 18,758,460 | 2026-08-29 |
| statute-link coverage (references) | **77.7509%** | 703,768 linked / 905,156 references | 2026-08-29 |
| statute reach (judgments) | **2.3801%** | 446,483 judgments with ≥1 reference / 18,758,460 | 2026-08-29 |
| coarse embedding coverage | **35.780%** of snapshot · **14.600%** of corpus | 2,738,744 / 7,654,179 · / 18,758,460 | 2026-08-29T17:45Z |
| passage embedding coverage | **0.21409%** | 40,161 documents / 18,758,460 | 2026-08-29 |
| retained source evidence | **0.07575%** | 14,210 `official_source_artifact` rows / 18,758,460 | 2026-08-29 |
| eCourts observation coverage | **0** | `ecourts_observation` rows. Not "low" — zero. | 2026-08-29 |
| overruled marks | **98** | 73 `set_aside` + 17 `doubted` + 8 `partly_set_aside`, 0.00052% | 2026-08-29 |
| citation checks | **16,199** | all `verified`/`corpus`; **zero** `unverified`, **zero** `failed` | 2026-08-29 |

**Two traps this register exists to name.**

**Trap 1 — the sentinel.** Every one of 18,758,460 judgments has at least one row in
`judgment_citations`. "Every judgment has its citations mapped" would therefore be
*arithmetically true* and *completely false in meaning*, because 71.98% of those rows are
the blank sentinel meaning "we looked and found nothing". **Citation coverage is defined on
resolved edges and on nothing else.**

**Trap 2 — two true lag numbers.** `naive lagDays = 1` (newest judgment 2026-08-28) and
`legalCurrency lagDays = 29` (`dataAsOf 2026-07-31`, honest frontier month 2026-07, the
newest month at ≥60% of a 134,810/month baseline). **Quote both or neither.** A month
holding one document has a newest date and no coverage.

**A third, quieter one.** The `unverified` render path has **zero** production rows behind
it. Its correctness rests on tests, not on observation. That is stated here rather than
discovered later.

### BANNED CLAIMS — v1

| banned | why | say instead |
|---|---|---|
| "live" | zero eCourts observations; corpus lag is 0–29 days depending on the question | "updated daily from published court records" |
| "every case" | 98.822% source-held, 27 courts, no district, no tribunal | "27 courts, 18.7 million judgments" |
| "every citation verified" | 3.62% of real reference strings are resolved | "we verify the citations we show you" |
| "good law guaranteed" | `treatment.good_law_claim` is DISABLED; 98 overruled marks corpus-wide | "we show you when a judgment has been set aside" |
| "official government feed / app" | the AWS buckets are **third-party maintained** (Dattam Labs / Pradeep Vanga) under CC-BY-4.0; eCourts access is a registrar's grant, not a government product | "published court records, with attribution" |
| broad "AI" | semantic is INTERNAL_EXPERIMENTAL; `safeForGeneration: false` on every observed response | say nothing about AI |
| "Hindi" | `language.hindi` is DISABLED; not even "coming soon" | say nothing |
| any district-court coverage | `unpopulatedCourtCategories: ["district","tribunal"]` on every response | "High Courts and the Supreme Court" |
| unmeasured uniqueness ("the only…", "no competitor…") | claims about other parties are UNKNOWN unless independently measured | describe what we do |
| "verified from the retained official PDF" | true for 0.07575% of the corpus | "Source: \<court\>, \<link\>" |
| any monitoring frequency or SLA | capacity and retention both UNMEASURED | "you keep the date; we will tell you when we can watch it for you" |

---

## 11. RCC API CONTRACT — FROZEN

**`docs/product/RCC_V1_API_CONTRACT_R12.md`.**

`RCC_API_CONTRACT = FROZEN` for Sprint 2, against `contract 1`.

The repository already enforces truth in `docs/API_CONTRACTS.md` — `check-contract-status.mjs`
reports **105 endpoints · 92 BUILT · 13 SPECCED** and fails if a row and a mounted route
disagree. That file is not duplicated. The frozen document names the **v1 mobile surface**:
which of the 92 built endpoints RCC may call, each with capability state, degraded state,
provenance and freshness fields, and implemented/gap.

**`RCC_BLOCKING_API_GAPS` — three, and only three:**

| # | gap | blocks | shape |
|---|---|---|---|
| G-1 | party-name search (AB-1) | the primary search entry point | no new endpoint; a routing fix inside `POST /search` |
| G-2 | filter-bounded admission (AB-2) | the daily-loop "what's new in my court" screen | no new endpoint; a bound fix inside `POST /search` |
| G-3 | `coverage` on `GET /judgments/:id/graph` | the citation-graph screen may not ship without it | additive object, §6 |

**Neither G-1 nor G-2 is a new endpoint.** RCC can build both screens today against the
frozen shapes and they will start returning results when the bound changes.

**Monitoring endpoints exist contractually and are disabled.** `POST /court/lookup` is
BUILT and answers `{available:false, reason:"no_adapter_implemented", manualEntry:{...}}`.
RCC builds the manual path as the *primary* path, not as a fallback.

**RCC must not depend on anything semantic or on HNSW.** No v1 screen may require
`semanticAvailable: true`.

---

## 12. DESKTOP CONTRACT

**Scope: Search · Reader · Saved · Matter.** Monitoring only if and when
`monitoring.user_product` becomes ENABLED.

**Desktop is a consumer of the same APIs. It is not a new backend and it gets no endpoint
of its own.** Any desktop need that cannot be met by the frozen contract is a contract
change, negotiated in the open, not a private route.

**Note on PD-15.** The founder reversed the desktop research workspace on 12 Aug 2026;
`ResearchWorkspace.tsx`, `MatterWorkspace.tsx` and `DraftWorkspace.tsx` are inert and
frozen, not deleted. **Nothing here revives them.** This section defines what a desktop
surface *would* consume if one is ever authorised, so that the API is not shaped in a way
that forecloses it. The roadmap's §15 argues a web surface de-risks store rejection; that
is a founder decision and is recorded, not taken.

---

## 13. ANALYTICS / DATA FLYWHEEL

`search_events` already exists with 3,123 rows and is **already pseudonymous** — it carries
`subject_hash`, not `user_id`, and has no user foreign key. That is the right default and
it is preserved.

Frozen event set:

| event | properties | why it is worth collecting |
|---|---|---|
| `query_submitted` | `queryClass`, `queryChars`, `hasFilters`, `subjectHash` | query shape is the v1 constraint |
| `search_result_returned` | `resultCount`, `latencyMs`, `degraded[]`, `rarestDf`, `admitted` | the AB-1/AB-2 population, measurable |
| `search_success` | result opened within the session | the only honest success signal |
| `search_degraded_or_refused` | `reason`, `remedy`, `rarestDf` | **directly sizes the two blockers** |
| `source_opened` | `judgmentId`, `surface` | which authorities matter |
| `authority_saved` | `judgmentId`, `matterId` | intent, the strongest signal we get |
| `matter_created` | `caseType`, `hasCnr` | activation |
| `authority_linked_to_matter` | `judgmentId`, `matterId` | retention |
| `correction_submitted` | `judgmentId`, `field`, `claim` | **corrections are a quality input, never a KPI** |
| `monitoring_enabled` | *when available* | — |
| `alert_opened` | *when available* | — |

**These signals later choose passage embedding selection, and that is the point.** NEW1's
own measurement argues against guessing: Tranche V2 stays frozen (manifest
`idsHash 3592efcbc5165a9f` preserved) because the wiring moved the gold benchmark by 1 of
228. **Do not start Tranche V2 without usage evidence.** The documents advocates actually
open are a better selector than any heuristic, and we do not have them yet.

"Corrections accepted per week" is **not** a metric — it rewards a broken corpus. The
metric is *corrections per thousand authorities shown*, and it should fall.

---

## 14. DERIVED-INTELLIGENCE COVERAGE CONTRACT

Definitions frozen. **No dashboard is built.** Every denominator is explicit, because a
percentage without one is a sentence, not a measurement.

| metric | numerator | denominator | value 2026-08-29 |
|---|---|---|---|
| canonical identity % | judgments with a CNR | all held judgments | 18,758,433 / 18,758,460 = **99.99986%** |
| verified date % | judgments with a non-null `judgment_date` | all held judgments | 18,758,460 / 18,758,460 = **100.0000%** — and note `dateQualityState` reads `DATE_UNCHECKED` on the sampled reader response, so *present* is not *verified*; the verified-date metric proper is **UNMEASURED** |
| outgoing citation % | judgments with ≥1 **resolved** outgoing citation | all held judgments | 105,024 / 18,758,460 = **0.55987%** |
| incoming citation % | judgments cited ≥1 time by a resolved edge | all held judgments | 35,153 / 18,758,460 = **0.18740%** |
| citation string resolution % | resolved citation rows | **real** reference strings (sentinels excluded) | 227,517 / 6,279,293 = **3.6233%** |
| statute-reference resolution % | references linked to a held Act | all extracted references | 703,768 / 905,156 = **77.7509%** |
| coarse embedding % | staged coarse vectors | the **versioned snapshot's** eligible set | 2,738,744 / 7,654,179 = **35.780%** |
| passage embedding % | documents with ≥1 chunk | all held judgments | 40,161 / 18,758,460 = **0.21409%** |
| retained source evidence % | `official_source_artifact` rows | all held judgments | 14,210 / 18,758,460 = **0.07575%** |
| eCourts matter identity % | matters resolvable to a canonical court identity | all matters | **UNMEASURED** — 3 matters, no observation, no basis |
| successful observations within SLA % | observations completed inside the planned window | planned observations | **UNMEASURED** — no SLA exists and none may be published |

**Rules that travel with these definitions.**

1. The coarse denominator is the **snapshot**, not the corpus, and the snapshot version
   must be quoted with the number. `document-vectors-v2` cut 7,654,179 rows into 766
   batches where v1 cut 8,854,281 into 886 — **no v2 file is any v1 file**, so a coverage
   number without its snapshot version is not comparable to yesterday's.
2. Passage coverage is counted in **documents**, never in chunks.
3. Citation coverage excludes sentinels, always.
4. `UNMEASURED` is a valid value and is never replaced by an estimate.

---

## 15. OUTPUT

```
HEAD = 8795ba8b9d569ac5afbbb724d2c9299ed6094c15   (live local backend, contract 1)

TEN_MATTER_ACCEPTANCE = 9 PASS · 2 PASS_WITH_LIMIT · 0 HOLD
                        11 cases, live backend, real corpus fixtures picked at run time
                        evidence: docs/product/TEN_MATTER_ACCEPTANCE_R12.json
                        fixtures created and deleted; residual 0; matters back to 3

ACCEPTANCE_BLOCKERS   = AB-1 party-name search returns zero (a held, most-cited
                              authority returns nothing by party name)
                        AB-2 structured filters do not bound the lexical admission
                              gate (45,660-judgment window still "too broad")
                        Both are bounded search-path changes. Neither is a data gap.

V1_CAPABILITY_REGISTRY = docs/product/V1_CAPABILITY_REGISTRY_R12.json
                         NEW3_V1_CAPABILITY_REGISTRY_R12_2026-08-29
                         16 ENABLED_V1 · 7 DISABLED_NOT_READY ·
                         2 DISABLED_EXTERNAL_BLOCK · 1 INTERNAL_EXPERIMENTAL ·
                         4 POST_V1
                         additive to RELEASE_CAPABILITIES_R8_3.3, not a replacement

SEARCH_CONTRACT       = FROZEN. exact identifier → structured → lexical →
                        honest broad-query refinement. No semantic router.
                        Two bound changes required before ship (AB-1, AB-2);
                        neither changes the ladder or the result schema.

DATA_TRUST_CONTRACT   = FROZEN, with two additive gaps named:
                        sourceEdition on judgment payloads;
                        coverage{declaredPartial} on the citation graph.
                        LISTED is never rendered as HEARING_OCCURRED.

EMBEDDING_INTERNAL_STATE = snapshot document-vectors-v2 (def 5b5d02384b46c96c)
                           eligible 7,654,179 · staged 2,738,744 · 35.780% of
                           snapshot, 14.600% of 18,758,460 corpus
                           incremental backlog 0 eligible uncovered
                           passage 40,161 documents = 0.21409%; Tranche V2 frozen
                           CAUGHT_UP_TO_SNAPSHOT not reached

SEMANTIC_PUBLIC_STATE = DISABLED

ECOURTS_RAW_PIPELINE  = DISABLED_NOT_READY  (0 observations; nothing INSERTs)
ECOURTS_PARSER        = DISABLED_NOT_READY  (fixture-bound, never met a live page)
ECOURTS_PILOT         = DISABLED_EXTERNAL_BLOCK *as of bus 1524*, AND CONTESTED —
                        LCC is mid-round on "correct the invented CAPTCHA
                        blocker". CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED is
                        LCC's claim, not NEW3's measurement. If it is withdrawn
                        this row becomes DISABLED_NOT_READY and NOTHING ELSE in
                        this output block changes.
                        switch OFF via the audited path; quota 2/1000 day
                        retention UNMEASURED (HC and district)
USER_MONITORING_STATE = DISABLED_NOT_READY — four gates; pilot data is not one

FIRM_READY_DOMAIN_MODEL = FROZEN. User · Workspace · WorkspaceMember · Matter ·
                          SavedAuthority · MonitoringEntitlement.
                          Personal Workspace automatic; no enterprise UI.
                          Ownership resolves through Workspace, never User.
                          Court observations are NOT user-owned.

MONITORING_CONTRACT   = FIELDS FROZEN, CAPABILITY DISABLED.
                        monitoringPolicy · lastObservedAt ·
                        nextPlannedObservationAt · observationSource ·
                        lastObservationOutcome · monitoringDegradedReason
                        No polling frequency, no SLA, no price.

CLAIMS_REGISTER_V1    = §10. 22 metrics with denominators; 11 banned claims.
                        Two named traps: the 71.98% citation sentinel, and the
                        two true lag numbers (1 day and 29 days).

DERIVED_INTELLIGENCE_METRICS = §14, definitions frozen, no dashboard built.
                               Two are UNMEASURED and stay that way until measured.

ANALYTICS_SCHEMA      = §13. 11 events. search_events is already pseudonymous
                        (subject_hash, no user_id) and stays that way.
                        Tranche V2 does not start without this evidence.

RCC_API_CONTRACT      = FROZEN   (docs/product/RCC_V1_API_CONTRACT_R12.md,
                        against contract 1; 105 endpoints / 92 built / 13 specced
                        enforced by scripts/check-contract-status.mjs)

RCC_BLOCKING_API_GAPS = G-1 party-name routing inside POST /search      (= AB-1)
                        G-2 filter-bounded admission inside POST /search (= AB-2)
                        G-3 coverage{declaredPartial} on GET /judgments/:id/graph
                        None is a new endpoint. RCC is not blocked from starting.

DESKTOP_SCOPE         = Search · Reader · Saved · Matter. Monitoring only if the
                        capability becomes ENABLED. Same APIs, no new backend.
                        PD-15 stands reversed; nothing here revives it.

BETA_SUCCESS_DEFINITIONS = pre-registered in §16 below.

NEW3_PRODUCT_ACCEPTANCE   = PASS
RCC_START_RECOMMENDATION  = AUTHORIZED

NEXT_LCC_REQUIREMENTS = L-1  bound the sparse admission gate by the FILTERED
                             population, or serve filtered queries from the
                             structured arm. (AB-2/G-2 — highest value)
                        L-2  route party-name queries to the existing trigram
                             path on rung 1. (AB-1/G-1)
                        L-3  add coverage{declaredPartial} to the graph response.
                        L-4  add sourceEdition to judgment payloads.
                        L-5  freeze the six monitoring fields on the backend,
                             serving null / never_attempted.
                        L-6  build the ecourts_observation writer — it is ours,
                             not the registrar's, and it gates the pilot even if
                             the CAPTCHA answer arrives tomorrow.

NEXT_RCC_REQUIREMENTS = R-1  build search against the frozen ladder; render
                             degraded[] / emptyBecause as first-class states.
                        R-2  the manual hearing-date path is the PRIMARY path.
                             POST /court/lookup answers available:false today.
                        R-3  verified is SILENT; only unverified and overruled
                             render. failed renders exactly as unverified.
                        R-4  read overruledStatus live at render on every surface.
                        R-5  do not build any screen requiring semanticAvailable.
                        R-6  the citation-graph screen waits on G-3.

BLOCKERS              = FOUNDER:  FQ-ECOURTS-CAPTCHA — one sentence from the
                                  registrar on the operational basis for
                                  cause_list_captcha_code. Nothing we build
                                  closes it.
                        FOUNDER:  the countersigned DPA, still owed, before
                                  document upload / OCR can ship.
                        OURS:     AB-1, AB-2, G-3 (all LCC, all bounded).
                        NOT A BLOCKER: embedding coverage, HNSW, semantic,
                                  eCourts observations, Tranche V2.
```

---

## 16. BETA SUCCESS DEFINITIONS — pre-registered

Written **before** the beta, so the gate cannot be moved to fit the result.

| # | definition | threshold | measured by |
|---|---|---|---|
| B-1 | An advocate finds an authority they already know how to name | ≥ 90% of identifier-shaped queries return the intended judgment at rank 1 | `search_result_returned` where `queryClass = identifier` |
| B-2 | Search does not look empty when it is refusing | `search_degraded_or_refused` ÷ all searches **< 15%** | events |
| B-3 | The product is used more than once | ≥ 40% of activated advocates return in week 2 | `query_submitted` by `subjectHash` |
| B-4 | Intent is expressed | ≥ 25% of advocates save at least one authority to a matter | `authority_saved` |
| B-5 | We are not wrong in public | **zero** citations rendered as confirmed that are not verified; **zero** overruled judgments rendered without the mark; **zero** silent drops | the existing zero-threshold monitors |
| B-6 | Corrections fall | corrections per 1,000 authorities shown declines month over month | `correction_submitted` |

**B-5 is a hard stop and is not traded against any other number.** The others are
diagnostics; B-5 is the licence to operate.

---

## APPENDIX — evidence artifacts produced this round

| file | what it holds |
|---|---|
| `docs/product/TEN_MATTER_ACCEPTANCE_R12.json` | 11 acceptance cases, raw payloads, latencies, fixtures, cleanup and residual proof |
| `docs/product/V1_CAPABILITY_REGISTRY_R12.json` | 30 capabilities, five states, denominators, evidence pointers, minimum backend version |
| `docs/product/DERIVED_INTELLIGENCE_METRICS_R12.json` | exact counts + planner estimates kept apart, with concurrent-activity context |
| `docs/product/DERIVED_INTELLIGENCE_METRICS_R12_GRAPH.json` | graph-shaped metrics, each bounded by a statement timeout; unfinished ones would have been recorded as UNMEASURED (none were) |
| `docs/product/RCC_V1_API_CONTRACT_R12.md` | the frozen v1 mobile surface |

**Caveats, because their absence would be the red flag.**

- The acceptance run used **one** fixture per identifier arm. It proves the arm works on a
  real row; it does not measure the arm's hit rate over a population. A rate would need a
  sampled gold set and was not run this round.
- `judgmentsIdentity.total` reads **18,758,460** while `pg_class.reltuples` reads
  18,752,608. Both are correct: ingest is writing. The exact count is quoted and the
  estimate is kept in its own section of the artifact.
- `M8`'s reader evidence is one judgment. `bodyText.evidenceWithheld` was **not** exercised
  because the fixture's body text is clean — the refusal path is asserted by tests, not
  observed here.
- The `unverified` and `failed` citation render paths have **zero** production rows behind
  them and were not observed.
- `briefing.daily_loop` routes are mounted and were **not** run through acceptance this
  round. It is marked DISABLED_NOT_READY on that basis, not on a defect. Given
  `PRODUCT_BRIEF.md` sequences Tier B before Tier A, that is a gap in *this round's
  coverage*, and it is named rather than hidden.
- Statute freshness is `UNMEASURED`. No probe exists.
- Every latency was measured on a box running the GPU sidecar, the coarse walk, the
  doc-vector embed and ingest, with 7 active Postgres backends. They are honest production-
  shaped numbers, not best-case ones.
