# LCC — TRUST-STATE CONTRACT EXERCISE

**LCC, 31 August 2026.** Measured against `HEAD 72b87859` unless a line says
otherwise. Contract revision **R14**, wire integer **1**. Nothing here changes a
wire shape, a value set, or the meaning of a served field.

**What this answers, in one sentence:** for every trust state the contract
currently carries, does the same legal fact produce the same truth on every
surface an advocate can reach it from — and where it does not, is the difference
intentional, ambiguous, or a defect?

**Method.** Vocabularies were read from committed source, never from prose.
Cross-surface presence was built by grepping each route's response object.
Population figures were re-derived against the live database this session rather
than inherited from an earlier round. The layer question — which of two values a
field named `overruledStatus` actually carries — is now pinned by a committed
test (`services/api/src/judgments/trust-state-cross-surface.test.ts`), because it
is a single literal assignment per route and a behavioural test passes vacuously
on five of six surfaces.

**What was deliberately not done.** No route was changed. NEW3's `overruledStatus`
DEFER (bus 1631) is preserved and was not reopened; nothing here is new falsifying
evidence against it, and one finding below strengthens it. No threshold was moved.
No performance work was started.

---

## 1 · THE CONTRACTED TRUST VOCABULARIES

Seven axes. Each is a separate question and none of them is derivable from
another — which is the point, and the reason none of them is one enum.

### 1.1 Citation verification

```
CONTRACT_FIELD      verificationState
ALLOWED_VALUES      verified | unverified | failed
AUTHORITATIVE_SOURCE citation_checks.verification_state
DERIVED_OR_STORED   STORED, and hard-coded 'verified' on every corpus-row surface
SURFACES_SERVED     search · judgment reader · matter authorities · briefing
                    authorities · saved feed · counterargument · GET /citations/:id
```

```
CONTRACT_FIELD      verifiedBySource
ALLOWED_VALUES      corpus | public_x2 | ecourts | ecourts_bulk | licensed | none
AUTHORITATIVE_SOURCE citations/source-strength.ts — the column holds two more
                    values (indiankanoon, aws_s3) that the wire maps to `none`
DERIVED_OR_STORED   STORED, through an exhaustive boundary switch
SURFACES_SERVED     as above
```

`failed` and `unverified` are distinct on the wire and render identically by
design — R12 §1.4 rule 3, and it is the subtlest rule in the product.

**Live population, this session:** `citation_checks` holds **16,875** rows and
every one is `verified` / `corpus`. **Zero** `unverified`, **zero** `failed`. The
unverified path has no production traffic behind it and is still the path that
matters most.

### 1.2 Evidence support

```
CONTRACT_FIELD      bodyText { state, grade, evidenceWithheld }
ALLOWED_VALUES      state: TEXT_DAMAGED | TEXT_UNKNOWN   (never CLEAN)
                    grade: PROOF | SCREEN | NONE
                    evidenceWithheld: boolean
AUTHORITATIVE_SOURCE search/body-text-safety.ts against judgments.script_quality
DERIVED_OR_STORED   DERIVED per request
SURFACES_SERVED     search (hybrid, structured, ambiguous) · judgment reader ·
                    saved feed · counterargument
```

```
CONTRACT_FIELD      textOrigin · generationEvidenceEligible
ALLOWED_VALUES      REPORTER_EDITION | COURT_SOURCE | UNKNOWN · boolean
AUTHORITATIVE_SOURCE judgments/text-origin.ts, from PROVENANCE not content
DERIVED_OR_STORED   DERIVED per row
SURFACES_SERVED     GET /judgments/:id ONLY
```

### 1.3 Treatment

```
CONTRACT_FIELD      overruledStatus            (the banner — four values)
ALLOWED_VALUES      none | set_aside | partly_set_aside | doubted
DERIVED_OR_STORED   BOTH, depending on the surface — see §2.1. This is the finding.

CONTRACT_FIELD      overruledStatusStored      (the raw column, for divergence)
CONTRACT_FIELD      precedentialEffect         (what happened — eight values)
ALLOWED_VALUES      none | overruled | overruled_in_part | set_aside |
                    partly_set_aside | doubted | review_required | evidence_defect
                    OPEN-ENDED: R14 §A5 binds a client to a safe unknown path.
CONTRACT_FIELD      canAddToMatter             (the one product refusal)
CONTRACT_FIELD      citableForUntouchedPropositions
CONTRACT_FIELD      unappliedTreatment         (a fact, never a banner)
CONTRACT_FIELD      treatmentAttribution       (who said so — four values)
ALLOWED_VALUES      COURT | REPORTER | DEFECTIVE | UNKNOWN
AUTHORITATIVE_SOURCE judgments/precedential-effect.ts, layers 1-4
```

`treatment_provenance` — the raw column — remains off the wire per R14
(`CCR-2026-08-30-05`, DEFERRED to Gate C). `treatmentAttribution` is the derived
four-value class over it and **is** served. See §5.3: this reads as a contract
ambiguity, not a breach.

### 1.4 Currentness

```
CONTRACT_FIELD      asOf
ALLOWED_VALUES      ISO-8601 instant — the SERVER's read time, never the client's
DERIVED_OR_STORED   DERIVED per request; overruledStatus is never cached
SURFACES_SERVED     search · judgment reader · matter authorities · counterargument
```

```
TYPE (not on the wire) CurrentnessClaim { adverseTreatment, scope, basis, asOf }
                       basis is the constant 'lawmind_resolved_sources' — never
                       "all Indian courts", never "good law"
                       scope: NOT_APPLICABLE | WHOLE_JUDGMENT | RESOLVED | UNRESOLVED
```

```
CONTRACT_FIELD      the six monitoring fields
ALLOWED_VALUES      lastObservationOutcome = 'never_attempted'; the other five null
DERIVED_OR_STORED   CONSTANT — the capability is DISABLED_NOT_READY
```

### 1.5 Source / evidence availability

```
CONTRACT_FIELD      sourceUrl              present for 100% of the corpus
CONTRACT_FIELD      provenance { source, sourceEdition, basis, recordedAt, recorded }
DERIVED_OR_STORED   STORED, and NULL for 99.969% of rows — published, never defaulted
SURFACES_SERVED     GET /judgments/:id ONLY
```

```
TYPE (NOT ON ANY WIRE) SourceArtifactState
                       { sourceArtifactHeld, textState, fullTextEvidenceAvailable,
                         generationEvidenceAvailable }
                       textState: TEXT_AVAILABLE | IMAGE_ONLY_OCR_PENDING | null
```

`corpus/source-artifact-state.ts` has **zero production callers** — only its own
test. See §5.4.

### 1.6 Partial coverage

```
CONTRACT_FIELD      graphCoverage().declaredPartial
ALLOWED_VALUES      the literal `true` — a boolean that COULD read false would
                    eventually read false because somebody moved a number
CONTRACT_FIELD      unpopulatedCourtCategories  (string[], computed per request)
CONTRACT_FIELD      retrievalOutcome.rarestDf   (corpus-wide diagnostic; R14 §A8
                    forbids deriving any user-facing narrowing hint from it)
CONTRACT_FIELD      page { page, pageSize, hasMore } — hasMore is OBSERVED
CONTRACT_FIELD      total — present only where a real COUNT(*) exists
```

### 1.7 Could-not-observe / degraded

```
CONTRACT_FIELD      retrievalOutcome.state
ALLOWED_VALUES      answered | abstained | degraded | coverage_unknown | review_required
CONTRACT_FIELD      retrievalOutcome.reasons[]
ALLOWED_VALUES      sparse_unbounded | semantic_index_insufficient | unsafe_body |
                    low_relevance | ambiguous_identity | timeout | date_unreliable |
                    source_stale
CONTRACT_FIELD      retrievalOutcome.safeForGeneration · exactIdentityUsable
CONTRACT_FIELD      degraded[]     sparse_timeout | sparse_unbounded |
                                   dense_timeout | pin_timeout | party_name_disabled
CONTRACT_FIELD      emptyBecause { reason, remedy }
AUTHORITATIVE_SOURCE search/outcome.ts — ONE derivation, every consumer calls it
DERIVED_OR_STORED   DERIVED per request
SURFACES_SERVED     search · saved feed · counterargument
```

---

## 2 · CROSS-SURFACE CONSISTENCY

### 2.1 `overruledStatus` — one name, two layers

Eight emission sites. Six serve the **derived banner**; two serve the **raw
stored column** under the same name.

| surface | file | layer | stored companion |
|---|---|---|---|
| `GET /judgments/:id` | `judgments/route.ts:402` | DERIVED here | `overruledStatusStored` |
| the hybrid ranker | `search/retrieve.ts:2420` | DERIVED here | `overruledStatusStored` |
| `POST /search` structured · ambiguous | `search/route.ts:557,614` | DERIVED here | `overruledStatusStored` |
| briefing authorities | `briefings/route.ts:255` | DERIVED here | `overruledStatusStored` |
| `GET /saved-searches/:id/feed` | `search/saved.ts:292` | DERIVED upstream | none |
| `POST /arguments/counter` | `arguments/counter.ts:212` | DERIVED upstream | none |
| `GET\|POST /matters/:matterId/authorities` | `matters/authorities.ts:187` | **STORED** | none |
| `GET /citations/:citationCheckId` | `citations/check.ts:123` | **STORED** | `overruledStatusShown` |

**Classification: `INTENTIONAL_LAYER_DIFFERENCE` for the two upstream
re-emitters; `CONTRACT_AMBIGUITY` for the two stored surfaces.** Neither is an
implementation defect against a written specification, because R14 §A5 says
`overruledStatus` is *"the only value that may drive a banner … on every
surface"* and never states which layer that is on a per-route basis. NEW3
adjudicated the matter-authorities half as `INTERNAL_ONLY_DIFFERENCE`, DEFER, P1,
no R15 (bus 1631). **That decision stands and is not reopened here.**

**One correction to NEW3's record, evidence-based.** Bus 1631 item 1 records
`search/saved.ts:292` as serving *"the raw stored value and no
`precedentialEffect` beside it — strictly worse than the matter list."* The line
number is exact and the `precedentialEffect` half is correct. **The layer half is
not:** `r` there is a `SearchResult` from `hybridSearch`, and `retrieve.ts:2420`
sets that key to `policy.bannerStatus` before saved.ts ever sees it. The saved
feed serves the **derived banner**. It is therefore not worse than the matter
list on the banner axis at all — only on the finer field. The mistake is an easy
one and is exactly why the pin now checks the import as well as the expression:
`overruledStatus: r.overruled_status` and `overruledStatus: r.overruledStatus`
differ by one underscore and by a whole layer.

**The two layers genuinely disagree, live.** Re-derived in SQL this session, not
inherited:

```
judgments with a non-none stored status ............................. 98
  set_aside 73 · doubted 17 · partly_set_aside 8
judgments whose adverse edges are ALL MODALITY_DEFECT ................ 1
  f83d0700-eaf5-4075-9744-2e20faacedc9
  DIVISIONAL PERSONNEL OFFICER, SOUTHERN RAILWAY v. T. R. CHALLAPPAN
  1975 INSC 212 — stored set_aside, derived banner none
live matter authorities on that judgment ............................. 0
```

Identical to NEW3's census. The direction is what makes the DEFER safe: the
stored layer **over**-states, showing a graver warning than the evidence
supports. The under-stating class — where a saved list would show a milder
warning than the derived one — measures **zero rows**. That is now asserted in
the pin, so a reversal of direction cannot arrive quietly.

**NEW, and not in NEW3's census:** `GET /citations/:citationCheckId` is a fifth
surface of the same class, and unlike the matter list **the divergence is already
recorded in the database**:

```
citation_checks rows matched to that judgment ........................ 8
  surface judgment_detail · overruled_status_shown = 'set_aside' ..... 4
  surface judgment_detail · overruled_status_shown = 'none' .......... 4
```

Four rows were written before the reader served the derived banner and four
after. `citations/check.ts:123` serves the joined stored column, so the endpoint
answers `set_aside` for **all eight** — including the four whose own
`overruledStatusShown` field, in the same response, says `none`. A single
response therefore contains both layers under two names, with no statement of
which is which.

**Not user-reachable today.** `VerificationSheet.tsx` and
`UnverifiedCitationScreen.tsx` are the only client callers of that route and
neither renders `overruledStatus` from it. So the classification matches NEW3's:
internal, and a documentation risk rather than a wire-shape one. It is filed to
NEW3 as `CCR-LCC-XS-02` rather than changed, because moving it is a value change
inside an unchanged type on a released route — the same act NEW3 deferred once
already, for the same reason.

### 2.2 Field presence across surfaces

`✓` served · `·` absent. Read as a map of what a consumer can and cannot know.

| field | search | reader | matter auth | citation check | briefing | saved feed | counter |
|---|---|---|---|---|---|---|---|
| `verificationState` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `verifiedBySource` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `overruledStatus` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `overruledStatusStored` | ✓ | ✓ | · | · (`Shown`) | ✓ | · | · |
| `precedentialEffect` | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `canAddToMatter` | ✓ | ✓ | ✓ | · | ✓ | · | · |
| `citableForUntouchedPropositions` | · | ✓ | ✓ | · | · | · | · |
| `unappliedTreatment` | ✓ | ✓ | · | · | ✓ | · | · |
| `treatmentAttribution` | · | ✓ | · | · | · | · | ✓ |
| `bodyText` | ✓ | ✓ | · | · | · | ✓ | ✓ |
| `textOrigin` / `generationEvidenceEligible` | · | ✓ | · | · | · | · | · |
| `dateQualityState` | · | ✓ | · | ✓ | · | · | · |
| `retrievalOutcome` | ✓ | · | · | · | · | ✓ | ✓ |

**All absences above are `INTENTIONAL_LAYER_DIFFERENCE`,** and the evidence is
that R12 froze each shape from an observed response: the reader's key list
(R12 §1.3) names `textOrigin`, `generationEvidenceEligible`,
`citableForUntouchedPropositions` and `treatmentAttribution`; the search result's
key list (R12 §1.2) names none of them. A client cannot be surprised by an
absence its own frozen contract records.

**Two of them are worth NEW3's attention anyway, and are filed as ambiguities
rather than defects** — see §5.2 and §5.3.

---

## 3 · THE REQUIRED TRUTH DISTINCTIONS

| distinction | verdict | how it holds |
|---|---|---|
| verified vs unverified/failed | **PASS** | three independent fields; `failed` renders as `unverified` by design and is preserved in the row. Zero non-verified rows exist, so the path is untested by traffic and correct by construction. |
| partial graph vs complete-looking graph | **PASS** | `declaredPartial` is the literal `true`, not a threshold; coverage is defined on RESOLVED EDGES and is asserted to stay well under half the corpus, so a flattering denominator swap fails a test. |
| source-link-only vs retained evidence | **PASS BY OMISSION — see §5.4** | no surface claims retention, so no surface can over-claim it. The distinction itself is **not on any wire**. |
| image-only vs full-text evidence | **PASS, partially represented** | `sourceArtifactState` keeps `sourceArtifactHeld` and `fullTextEvidenceAvailable` independent, and `bodyText.state` is never `CLEAN`. But the artifact state is not served; what protects the advocate live is the body-text refusal, not the image/text distinction. |
| UNKNOWN vs a negative answer | **PASS** | `attributionOf([])` is `UNKNOWN`, never `COURT`. `currentnessClaim.basis` is `lawmind_resolved_sources`, never "all courts". `treatmentScope` returns `UNRESOLVED` rather than inventing a paragraph. `precedentialEffect` distinguishes `review_required` (the law may have moved, we cannot confirm) from `evidence_defect` (our parser recorded something that never happened). |
| could-not-observe vs nothing changed | **PASS** | `lastObservationOutcome` is `never_attempted`, not `null` — a value that cannot be read as a result. `nextPlannedObservationAt` is null because a date there is a commitment. |
| stale/currentness-unknown vs verified-current | **PASS** | `overruledStatus` is read live on every surface and cached nowhere; `asOf` is the server's read time. `source_stale` degrades rather than answering. |
| evidence support vs citation existence | **PASS** | `generationEvidenceEligible('REPORTER_EDITION')` is `false` while the judgment stays fully findable and citable — 38,342 Supreme Court authorities are in exactly that state. `safeForGeneration` is true only for `answered`, so a `degraded` page of real results is showable and not arguable-from. |

**The four prohibitions, each tested:**

- a citation existing never implies the claim is supported — `generationEvidenceEligible`
  and `safeForGeneration` are separate gates from citation resolution;
- a source link existing never implies retained evidence — nothing on any wire
  says "retained", and `sourceArtifactHeld` is false whenever both the bytes and
  the storage key are null;
- an image-only artifact never becomes full-text evidence —
  `fullTextEvidenceAvailable` requires `textState === 'TEXT_AVAILABLE'`, so a held
  image is `sourceArtifactHeld: true` and `fullTextEvidenceAvailable: false`
  simultaneously;
- a failed currentness check never becomes current — a timeout or an unreachable
  arm produces `coverage_unknown`, never `abstained`, and this is asserted
  exhaustively rather than by sample.

---

## 4 · SLOW · TIMEOUT · DEGRADED · UNAVAILABLE · ZERO RESULTS

RCC observed a physical-Android cold `/search` at **15,334 ms** against a client
timeout of 15,000 ms, warm at **771 ms**, and corrected the client so a timeout no
longer claims OFFLINE. The server half of that rule was checked here.

**`SERVER_STATE_CONFLATION_FOUND = NO.** Five facts, five distinct
representations, verified rather than assumed:

| fact | server representation |
|---|---|
| **slow** | *no representation at all.* `RetrievalOutcomeInput` carries no duration, deadline or clock, so a request that took 15 s and COMPLETED is `answered`. Slowness is not incompleteness. |
| **timeout** | a `reason`, never a `state`. `sparse_timeout` / `dense_timeout` / `pin_timeout` are arms; with results the state is `degraded`, with none it is `coverage_unknown`. |
| **degraded** | results present, set not known complete, `safeForGeneration: false`. |
| **unavailable** | `semanticAvailable: false` — what a cold, over-budget or breaker-tripped embedder produces — yielding `semantic_index_insufficient`. |
| **network unreachable** | not a server state. `/search` has no outbound HTTP; the only remote dependency is the embedder, which degrades to lexical-only rather than failing the request. |
| **zero results** | `abstained` **only** when nothing else applies. Every other zero is `coverage_unknown`, which R12's rendering table forbids rendering as "no results". |

The exhaustive check walks all 64 combinations of the could-not-look inputs and
asserts `abstained` is unreachable whenever any of them is true — the property
the four hand-written cases could only sample. It also asserts that the
honest-empty path stays reachable, so the test cannot pass by making `abstained`
impossible.

**`SEARCH_COLD_LATENCY_OBSERVATION`, classified and not chased.** One incidental
finding, stated because it removes a candidate rather than because it diagnoses
anything: **the embedder is not the cause.** `embedQuery` is capped at
`EMBED_TIMEOUT_MS = 2000` and returns `null` on expiry, so it can contribute at
most 2 s and degrades rather than blocking. The remaining ~13 s is on the
database path. Not diagnosed here, per the round's scope.

Recorded for whoever does take it: `services/api/src/index.ts` states a **Gate S1
budget of 3 s for the whole request**, so 15,334 ms is roughly five times the
server's own stated bound. That is a real gap and it is a performance question,
not a trust-state one. **No threshold was raised to make the observation
disappear.**

---

## 5 · FINDINGS

### 5.1 `IMPLEMENTATION_DEFECTS_FOUND = 0` today · **one latent conflation**

No surface was found serving a value its own contract forbids, dropping a
citation silently, rendering an unverified state as confirmed, or turning a
failed observation into a negative answer **in any configuration reachable
today**.

One is reachable in a configuration two flags away, and it is the most important
finding in this round.

### 5.1.1 `CCR-LCC-XS-01` — a disabled capability is invisible to the outcome derivation

`party_name_disabled` is a `DegradedArm`: the party-name arm was **not run**
because the capability registry disables it for the requesting platform
(R14 §A4.9). It is a *we did not look* fact.

**`deriveRetrievalOutcome` cannot see it.** It is not in `TIMEOUT_ARMS`, it is
not `sparse_unbounded`, and there is no reason value meaning "a capability was
disabled". So it contributes nothing to `couldNotLookProperly` and produces no
reason of its own. `retrievalOutcome` says **nothing at all** about the party
arm; only `degraded[]` carries the fact.

Measured by calling the derivation directly:

```
party_name_disabled · 0 results · semanticIndexSufficient = false (today)
  → coverage_unknown, reasons ["semantic_index_insufficient"]

party_name_disabled · 0 results · semanticIndexSufficient = true
  → abstained, reasons ["low_relevance"]
```

**Unreachable today, twice over**, which is the only reason this is a CCR and not
a P0: `platformOverrides` is empty on every platform so the arm is never
disabled (R14 §A4.7; NEW3 bus 1608 holds the switch under an activation guard),
and even with it flipped, `SEMANTIC_INDEX_SUFFICIENT = false` sends a party query
— which is not exact-identity-shaped — to `coverage_unknown` anyway.

**So the honest verdict is masked by a conservative default that exists to be
removed.** The day NEW1 publishes an accepted retrieval path and that constant
flips, an advocate searching a party name on a platform where the arm is off is
told `abstained` — *we looked and found nothing* — about an arm that was never
run. That is the exact failure `outcome.ts` was written to prevent, and it
arrives as a consequence of a **good** event. Two safety properties currently
depend on each other by accident.

A second half, same case: `search/route.ts` gates `emptyBecause` on
`sparse_unbounded` alone, so no remedy is emitted either. R12's degraded-render
table tells RCC that a non-empty `degraded` with empty `results` must render
`emptyBecause.reason` and `remedy` — a field that will not be present. R14 §A4.9
gives RCC a party-specific rule keyed on `degraded[]`, so **the client is
instructed correctly**; the disagreement is between two server-side statements.

**`CONTRACT_CHANGE_REQUIRED = YES`, and this is why LCC stopped.** Correcting it
means `party_name_disabled` must contribute to `couldNotLookProperly`, and the
`RetrievalOutcome` type forbids a non-`answered` state with no reason — so the
fix requires a **new `RetrievalOutcomeReason` value**. That is squarely inside
the guard: a new reason is a wire meaning, and R15 is not LCC's to create. The
exact CCR is in §5.6.

Pinned rather than left implicit: `trust-state-cross-surface.test.ts` asserts
both the masked answer and the wrong one, so the day the CCR lands the pin fails
and updating it is the deliberate act that records the fix.

### 5.2 `CONTRACT_AMBIGUITY` — the layer question, on a fifth surface

Filed as **`CCR-LCC-XS-02`**. `GET /citations/:citationCheckId` serves the stored
column under the derived value's name, alongside `overruledStatusShown`, with no
statement of which layer either is. Eight live rows exist where the two layers
disagree and four of them disagree with the other field in the same response.
Not user-reachable — no client renders it. Same class and same recommended
treatment as NEW3's existing DEFER; **LCC has not changed it.**

### 5.3 `CONTRACT_AMBIGUITY` — provenance is off the wire, attribution is on it

R14's "WHAT DID NOT CHANGE" states `treatment_provenance` *"is still not on the
wire"*, DEFERRED to Gate C, and `TRUST_STATE_PRODUCT_CONTRACT_V1.md` §3.1 says a
reporter's annotation and a court's own words *"render identically"*.

Both are true of the raw column and neither is true of the derived class.
`treatmentAttribution` — `COURT | REPORTER | DEFECTIVE | UNKNOWN` — **is served
today** on `GET /judgments/:id` and `POST /arguments/counter`, and it carries
precisely the reporter-versus-court distinction §3.1 describes as unavailable.
That is not a breach: the column is not on the wire, R12 §1.3 records
`treatmentAttribution` in the reader's frozen key list, and the deferral is about
the raw value. **It is a documentation risk of exactly the kind NEW3 named in bus
1631** — a contract sentence that reads as a stronger statement than the code
makes. Filed as **`CCR-LCC-XS-03`**, no wire change requested.

Beneath it sits an asymmetry worth a decision rather than a fix:
`treatmentAttribution` is computed in `search/route.ts`'s `derivedEffects` for
every structured hit and then **discarded**, while the counterargument screen —
which reads the same `retrieve.ts` result — serves it. So the screen an advocate
uses to argue *against* an authority can say a reporter said the law moved, and
the screen they use to *find* it cannot. Adding it to `/search` is a new field on
a released route, so it is NEW3's call, not LCC's.

### 5.4 `CONTRACT_AMBIGUITY` — retained evidence is not represented anywhere

Filed as **`CCR-LCC-XS-04`**. `TRUST_STATE_PRODUCT_CONTRACT_V1.md` §1 records
state 6, *"SOURCE_LINK_ONLY ≠ retained evidence"*, as **representable today**,
with `judgment.source_evidence` as its evidence. That is a **capability name**,
not a wire field, and the capability is served by `sourceUrl` plus the
`provenance` object.

`corpus/source-artifact-state.ts` is the module that actually separates a held
artifact from a link, and separates a held IMAGE from full text. Grepped at HEAD:
**its only importer is its own test.** No route emits `sourceArtifactHeld`,
`textState`, `fullTextEvidenceAvailable` or `generationEvidenceAvailable`.

The product is nonetheless truthful, and the mechanism should be recorded
honestly because it is weaker than the contract implies: **the banned claim is
prevented by never making the opposite claim.** `SourceTrustBlock.tsx` says
*"Source · <court>"* and *"Open the court's copy"* — a link claim — and says
nothing about provenance where the row carries no record. Nothing over-claims,
because nothing claims.

§5 of that contract already discloses states 7, 8 and 9 as fixture-designed and
not evidence. **State 6 carries no such disclosure and, on this evidence, needs
one** — or the fields need to reach a wire. LCC has built neither, because either
is a new field.

### 5.5 What was fixed

`IMPLEMENTATION_DEFECTS_FIXED = 0`. Nothing met the bar: every difference found
is either frozen into R12, already adjudicated by NEW3, or requires a new wire
value that only NEW3 may add.

### 5.6 The CCR, stated exactly

```
CCR-LCC-XS-01
  raisedBy        LCC
  date            31 August 2026
  severity        P1 — latent; becomes P0 on the day SEMANTIC_INDEX_SUFFICIENT
                  flips true AND search.party_name is narrowed for any platform
  route           POST /search
  field           retrievalOutcome.state · retrievalOutcome.reasons[]
  wireInteger     1 — unchanged; this is additive to an open reason list plus a
                  value change on an unchanged five-value state type
  minSupported    1 — unchanged

  DEFECT
  `party_name_disabled` is a DegradedArm meaning an arm was NOT RUN. It does not
  participate in `couldNotLookProperly` and has no reason value, so with zero
  results the derivation can return `abstained` — the one state a client may
  render as "we looked and found nothing".

  REQUESTED
  1. a new RetrievalOutcomeReason, `capability_disabled`, meaning: an arm the
     query needed was not run because the registry disables it for this platform.
     Additive to a list R7 §7.1 already treats as growable.
  2. `party_name_disabled` in degradedArms contributes to `couldNotLookProperly`,
     so zero results yield `coverage_unknown` and results yield `degraded`.
  3. OPTIONAL, and LCC's recommendation is NO: extending `emptyBecause` to this
     case would need a second `reason`/`remedy` pair, and R14 §A4.9 already binds
     RCC to a party-specific render keyed on `degraded[]`. Two mechanisms for one
     message is how the four optional fields disagreed in the first place.

  NOT REQUESTED
  no change to `degraded[]`, to the state vocabulary, to safeForGeneration, or to
  any citation, treatment or evidence field.

  UNTIL IT LANDS
  the behaviour is pinned by `trust-state-cross-surface.test.ts`, so it cannot
  change silently in either direction.
```

Three further items are filed as ambiguities with **no wire change requested**:
`CCR-LCC-XS-02` (§5.2, the citation-check layer), `CCR-LCC-XS-03` (§5.3,
provenance off the wire while attribution is on it), `CCR-LCC-XS-04` (§5.4,
retained evidence unrepresented).

### 5.7 What was added

One test file, `services/api/src/judgments/trust-state-cross-surface.test.ts`,
28 assertions, no production code touched. It closes the gap NEW3 named in bus
1631 §4.4 — *"No committed test pins which layer this route serves"* — for all
eight emission sites at once, and adds the exhaustive could-not-look property for
`retrievalOutcome`.

**Falsified, not assumed.** `matters/authorities.ts:187` was temporarily mutated
to serve `policy.bannerStatus` and the pin failed on exactly that surface; the
file was restored byte-identically (`git diff --stat` empty) before anything else
ran. A green pin that cannot go red is not a pin.

---

## 6 · RCC / UI TRUTH-SEMANTICS HANDOFF

Truth semantics only. **Nothing here says how any of it should look.**

| state | API field | meaning | user-facing distinction required | current client consumption |
|---|---|---|---|---|
| verified | `verificationState: 'verified'` | this citation resolved against a source we accept | none — verified is silent | YES |
| unverified | `verificationState: 'unverified'` | nobody confirmed it exists | must be unmissable, with the eCourts path | YES (no live rows) |
| failed | `verificationState: 'failed'` | our check could not run | **must be indistinguishable from unverified** — an outage must not read as a corpus gap | YES (no live rows) |
| verification strength | `verifiedBySource` | which tier confirmed it | on-tap detail and admin only, never a badge | YES |
| law moved | `overruledStatus` ≠ `none` | this authority's standing changed | three states, never collapsed to one | YES |
| law moved, layer | `overruledStatusStored` | the raw column beside the live banner | none — diagnostic | UNKNOWN |
| what happened | `precedentialEffect` | eight values, OPEN-ENDED | a value you do not know must fall back to neutral later-judgment copy and select **no verb** | YES |
| who said so | `treatmentAttribution` | COURT / REPORTER / DEFECTIVE / UNKNOWN | only `COURT` may be worded as a holding; reader and counterargument only | UNKNOWN |
| still usable | `canAddToMatter` | the one refusal in the product | `false` disables add-to-matter | YES |
| partly usable | `citableForUntouchedPropositions` | still good for what the later court did not reach | reader and matter list only | YES (A6, 6f0d96bf) |
| unapplied edge | `unappliedTreatment` | a verified adverse edge the corpus has not applied | **never a banner** | UNKNOWN |
| evidence withheld | `bodyText.evidenceWithheld` | body fields are empty by REFUSAL, not absence | must state the refusal; never an empty page | YES |
| body quality | `bodyText.state` / `.grade` | `TEXT_UNKNOWN` is the honest default; `grade` is how well damage is proven | never pool state with grade | YES |
| whose text | `textOrigin` | the retained artifact's edition | reader only; may not be presented as the court's own words | YES |
| may ground a claim | `generationEvidenceEligible` | false for a reporter edition | must survive every consumer that quotes a passage | YES |
| we looked, found nothing | `retrievalOutcome.state = 'abstained'` | honest empty | the **only** state renderable as "no results" | YES |
| we could not look | `'coverage_unknown'` | no statement about the corpus | **never** "no law on this" | YES |
| incomplete answer | `'degraded'` | real results, set not complete | show results **and** the incompleteness | YES |
| an arm was not run | `degraded[]` contains `party_name_disabled` | the party-name path is off for this platform | visible degrade to case number / citation / CNR, per R14 §A4.9 — **and do not reconcile it against `retrievalOutcome.state`, which does not yet carry it (§5.1.1)** | UNKNOWN — unreachable today |
| a human must choose | `'review_required'` | more than one distinct authority matched | disambiguation, never a best match | YES |
| safe to argue from | `safeForGeneration` | true only for `answered` | `degraded` is showable and not arguable-from | YES |
| exact identity still works | `exactIdentityUsable` | false only when identity is the doubt | a degraded semantic path must not disable citation lookup | UNKNOWN |
| graph is partial | `graphCoverage().declaredPartial` | never a census | no count may be presented as a total | YES |
| filter has no data | `unpopulatedCourtCategories` | we hold nothing in that category | say the filter is empty, not that nothing matched | YES |
| corpus diagnostic | `rarestDf` | corpus-wide, invariant under filters | **may not** produce any narrowing hint | YES (diagnostic only) |
| monitoring | six fields, `never_attempted` | nothing has ever been observed | no polling frequency, no SLA, anywhere | YES |
| **not represented** | retained-artifact state | see §5.4 | a link may never be described as a held document | N/A |

Three rows read UNKNOWN because LCC verified the field is served and did not
verify whether a client reads it. That is RCC's half and is stated as unknown
rather than guessed.

---

## 7 · LIMITS OF THIS EXERCISE

- **The layer map was read from committed source, not observed by calling the
  API.** Each half is a single literal assignment, and the mutation falsifier
  proves the pin sees a change to it — but a route rebuilt around a different
  variable name would need the pin updated by hand.
- **The database halves were read, never written.** No API suite that writes
  append-only tables was run: background workers are live this session, and a
  killed suite has previously left `platform_config.ecourts_harvest` ON.
- **Four DB-backed test files fail in a shell without `DATABASE_URL`** and pass
  with it — `text-origin.test.ts` 3 fail → 6 pass, `empty-because.test.ts` 4 fail
  → environmental. Both are pre-existing and unrelated to anything added here.
- **The unverified and failed citation paths have zero production rows**, so
  every statement about them is about construction, not about observed behaviour.
  `verification-catches-false-positives-only` applies: a state nothing produces
  leaves no trace to check.
- **The cold-latency observation is classified, not diagnosed.** Ruling out the
  embedder is a single measured bound, not a profile.
