# RCC v1 API CONTRACT — R15 AMENDMENT

**Status:** `RCC_API_CONTRACT = R15`. Supersedes **only the sections named below**.
**Prior revision:** `R14`, `docs/product/RCC_V1_API_CONTRACT_R14_AMENDMENT.md`.
**Frozen baseline:** `R12`, `docs/product/RCC_V1_API_CONTRACT_R12.md`,
sha256 `e89d93c82772cd35aab59626fd20cb291e966f4fc687eb4c7fdc054c1981d5ed`.
**R12, R13 and R14 are not edited.**
**Amended by:** NEW3, 1 September 2026. **Ledger:** `CONTRACT_CHANGE_LEDGER.json`.
**Measured against:** `gitSha e2a298e637721de68e02a0ae7419795a1c84cdbd`, the repository
HEAD at the time of amendment. Every shape below was read from committed source at
that SHA, and the behavioural claims were taken by executing the committed
derivation and by querying the live database. Each observation names how it was taken.

---

## 0 · WHAT THIS REVISION IS, AND THE FOUR NUMBERS THAT DO NOT MOVE

R15 exists for **one additive semantic change** and **three corrections to the
record**. The record corrections change no byte on any wire.

```
CONTRACT_REVISION      = R15    the NEW3 governance revision of this document
WIRE_PROTOCOL_VERSION  = 1      the integer served at GET /version as `contract`
WIRE_BREAKING_CHANGE   = NO
MIN_SUPPORTED_CONTRACT = 1      unchanged
```

**Why the wire integer does not move, stated against the rule that governs it.**
`services/api/src/contract-version.ts` says `CONTRACT_VERSION` is *"bumped ONLY by a
change a current client cannot ignore"* and that *"within a contract version, every
change is ADDITIVE"*. The one substantive change in R15 adds a **value** to a list
the contract already treats as growable, and the current client types that list as
`string[]` — **observed**: `apps/mobile/src/api/contract.ts:1587`, `reasons: string[]`,
no union, no exhaustive switch anywhere in `apps/mobile/src`. A client that ignores
the new value behaves exactly as it does today.

A product-contract revision and a wire-protocol break are different events. R15 is
the first and not the second.

---

## WHAT RCC MAY CONSUME TODAY

| amendment | released to RCC | why |
|---|---|---|
| **B1** — `RetrievalOutcomeReason` gains `capability_disabled` | **NO** | LCC has not built it. Nothing serves the value yet. Do not branch on it. |
| **B2** — `treatmentAttribution` IS on the wire, and R14's prose said it was not | **YES** | four routes serve it today; record correction, no shape moves |
| **B3** — retained source artifact vs source link is NOT on the wire | **YES** | record correction; the ban stands, enforced by prohibition |
| **B4** — the `overruledStatus` layer map, corrected | **YES** | record correction to `CCR-NEW3-XS-01`; the DEFER is unchanged |

**No RCC work is requested by R15.** B1 lands server-side first, and RCC's existing
handling is already correct for it — see §B1.6.

---

## B1 · `RetrievalOutcomeReason` GAINS `capability_disabled` — AMEND

Filed by LCC as **CCR-LCC-XS-01**. Adjudicated **AMEND**.

### B1.0 The distinction, and why it is legal rather than cosmetic

```
NOT_SEARCHED_BECAUSE_CAPABILITY_DISABLED   !=   SEARCHED_AND_FOUND_NOTHING
```

An advocate told "we looked and found nothing" about an arm that **never ran** has
been told something false about the state of the law. `search/outcome.ts`'s own
module note already binds this: *"Zero results is not 'no law'. If an arm refused or
timed out, zero is the number of things we ranked, not the number that exist."*
A disabled capability is a third way for an arm not to run, and the derivation
cannot currently see it.

### B1.1 The defect, reproduced from committed source at HEAD

`party_name_disabled` is a `DegradedArm` meaning **the arm was not executed**:

- `services/api/src/search/retrieve.ts:2049` — `if (partySuppressed) onDegrade?.('party_name_disabled')`,
  where `partySuppressed = shape.shape === 'party_name' && !partyArmPermitted` (`:2047-2048`).
- `services/api/src/release/enforce.ts:107` — *"When false the arm does not run,
  `degraded` carries `party_name_disabled`"*.

`deriveRetrievalOutcome` cannot see it. Read at `services/api/src/search/outcome.ts`:

- `TIMEOUT_ARMS = new Set(['sparse_timeout','dense_timeout','pin_timeout'])` —
  `party_name_disabled` is not a member;
- `sparseRefused` tests only `'sparse_unbounded'`;
- `couldNotLookProperly = sparseRefused || timedOut || semanticMissing` — the disabled
  arm contributes to none of the three;
- no member of `RetrievalOutcomeReason` means "a capability was disabled".

**Consequence, measured by calling the derivation directly (LCC, at `b3ca71b2`):**

```
party_name_disabled · 0 results · semanticIndexSufficient = false  (today)
  -> coverage_unknown · reasons ["semantic_index_insufficient"]
party_name_disabled · 0 results · semanticIndexSufficient = true
  -> abstained        · reasons ["low_relevance"]
```

`abstained` is defined in that file as *"We searched properly and are declining to
offer these results as an answer... here we looked."* It is the one state a client
may render as "we looked and found nothing".

### B1.2 It is masked today by two guards that exist to be removed

Both masks were verified at HEAD by NEW3, independently of LCC's report:

1. `PLATFORM_CAPABILITY_OVERRIDES` is `{}` — `services/api/src/release/capabilities.ts`.
   The empty literal is the whole state of the switch: *"an empty override means
   'the release-wide state stands', and adding the row is the entire act of flipping
   the switch."* `search.party_name` is `ENABLED` release-wide.
2. `SEMANTIC_INDEX_SUFFICIENT = false` — `services/api/src/search/outcome.ts`.
   A party query is not an exact-identity shape (`isExactIdentityShape` admits only
   `citation` and `section`), so it is semantic-dependent, so `semanticMissing` is
   true, and the query lands in `coverage_unknown` **by the semantic default rather
   than by anything knowing the party arm did not run**.

**Both masks are scheduled for removal.** `SEMANTIC_INDEX_SUFFICIENT`'s own comment
says *"Flip it when NEW1 publishes an accepted candidate retrieval path"*. The
override map exists precisely so that a row can be added to it.

So the wrong answer arrives **as a consequence of two good events**, and neither
event has any reason to look at this file. That is the whole case for amending now
rather than when it fires.

### B1.3 The amendment — smallest additive representation

**A new reason value. Not a new state, and no existing value's meaning moves.**

```
NEW_RETRIEVAL_OUTCOME_REASON = capability_disabled
```

> `capability_disabled` — an arm this query needed was **not run**, because the
> capability registry disables it for this platform or release. It is not a timeout,
> not a refusal to rank, and not an absence of law. Zero results carrying this
> reason may **never** be rendered as "no judgments matched".

**And one derivation change:** `party_name_disabled` contributes to
`couldNotLookProperly`, so that

- 0 results → `coverage_unknown`, reasons include `capability_disabled`
- results → `degraded`, reasons include `capability_disabled`

### B1.4 What was deliberately NOT done

- **No new `RetrievalOutcomeState`.** `coverage_unknown` already reads *"We did not
  look, or could not look properly, and we do not know what is out there. This may
  never render as 'no results'."* That is exactly right for an arm that never ran.
  A new state would put two answers to one question in the same enum.
- **`UNKNOWN`, `abstained` and any zero-results value are NOT overloaded.** The
  system deterministically knows the arm was disabled; a generic value would throw
  that knowledge away at the one point where it is the entire content of the answer.
- **`emptyBecause` is NOT extended.** LCC raised it as optional and recommended
  against it; NEW3 agrees and **REJECTS** that half. `search/route.ts` gates
  `emptyBecause` on `sparse_unbounded` alone, and adding a second reason/remedy pair
  would create two mechanisms for one message — the failure that produced four
  disagreeing optional fields in the first place, and the reason `outcome.ts` exists.
- **No change** to `degraded[]`, the state vocabulary, `safeForGeneration`,
  `exactIdentityUsable`, `rarestDf`, or any citation, treatment or evidence field.

### B1.5 Wire impact, stated field by field

```
FIELD            retrievalOutcome.reasons : string[]
CHANGE           one additional possible VALUE
SHAPE            unchanged   REMOVAL none   RENAME none   RETYPE none   NARROWING none
WIRE_PROTOCOL_VERSION   1   (unchanged)
MIN_SUPPORTED_CONTRACT  1   (unchanged)
WIRE_BREAKING_CHANGE    NO
```

A client that has never heard of `capability_disabled` sees one more string in a
list it already treats as opaque. Observed, not assumed: `contract.ts:1587` types it
`string[]`.

### B1.6 RCC impact — NONE, and the client is already right

`apps/mobile/src/screens/search/searchTruth.ts:81` already returns `'party_disabled'`
keyed on `degraded[]`, and ranks it **above** the refusal and above `coverage_unknown`.
R14 §A4.9's binding instruction — *"on `party_name_disabled`, render the visible
degrade... never 'no judgments matched'"* — is consumed today.

**The disagreement B1 fixes is between two server-side statements, not between the
server and the client.** RCC needs no change before or after, and must not be asked
for one.

### B1.7 Release sequence — BINDING, and the party override stays blocked throughout

```
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
```

The override may be activated only when **every** step below has actually happened —
not when the next one is scheduled; when the previous one is observed.

```
1. NEW3 CONTRACT             this document (R15 B1)                          DONE
2. LCC IMPLEMENTATION        capability_disabled added to RetrievalOutcomeReason;
                             party_name_disabled contributes to
                             couldNotLookProperly in deriveRetrievalOutcome   PENDING
3. TESTS                     a committed test asserting that
                             {party_name_disabled, 0 results,
                              semanticIndexSufficient: true} yields
                              coverage_unknown carrying capability_disabled —
                              the assertion LCC has deliberately PINNED WRONG at
                              judgments/trust-state-cross-surface.test.ts:577.
                              Updating that pin is the act that records the fix PENDING
4. RCC CONSUMPTION           confirmation that searchTruth.ts still ranks the
                             party degrade first with the new reason present;
                             no code change expected                          PENDING
5. INDEPENDENT VERIFICATION  a lane other than the implementer observes 2-4
                             at HEAD                                          PENDING
6. THEN AND ONLY THEN        a PLATFORM_CAPABILITY_OVERRIDES row may be added  BLOCKED
```

Step 6 is a separate, explicitly authorised act. **R15 does not authorise it**, and
no step in 1-5 may be treated as authorising it.

---

## B2 · `treatmentAttribution` IS ON THE WIRE — RECORD CORRECTION, NO SHAPE MOVES

Filed by LCC as **CCR-LCC-XS-03**. Adjudicated **AMEND (documentation only)**.

### B2.1 What R14 and the trust-state contract say, and why it is wrong as written

R14 §WHAT DID NOT CHANGE says `treatment_provenance` *"is still not on the wire"*.
`TRUST_STATE_PRODUCT_CONTRACT_V1.md` §3.1 says a reporter's editorial annotation and
a court's own words *"render identically"*.

**Both are true of the raw column and false of the derived class.** Verified at HEAD
by NEW3, grepping `services/api/src` and `apps/mobile/src`:

```
SERVED TODAY   judgments/route.ts:428          treatmentAttribution: attribution
               judgments/treatment.ts:166      treatmentAttribution: attributionOf([...])
               arguments/counter.ts:232, :252  treatmentAttribution: r.treatmentAttribution
               documents/route.ts:274, :384    treatmentAttribution: ... ?? 'UNKNOWN'
COMPUTED AND   search/retrieve.ts:2410, :2425  computed for every structured hit,
DISCARDED                                      then dropped by search/route.ts
CLIENT         apps/mobile/src                 ZERO occurrences — not typed, not rendered
```

`TreatmentAttribution` is `COURT | REPORTER | DEFECTIVE | UNKNOWN`. It carries
precisely the reporter-versus-court distinction §3.1 describes as unavailable, and
R12 §1.3 already records it in the reader's frozen key list — **so this is not a
breach of the frozen contract. It is a false statement in the prose about it.**

### B2.2 The correction

> **R14's "treatment_provenance is still not on the wire" and
> `TRUST_STATE_PRODUCT_CONTRACT_V1` §3.1's "render identically" are corrected to:**
> the raw `treatment_provenance` column is not on the wire; the **derived**
> `treatmentAttribution` class **is**, on `GET /judgments/:id`,
> `GET /judgments/:id/treatment`, `POST /arguments/counter` and the document routes.
> No client reads it, which is why nothing an advocate sees is affected.

### B2.3 The DEFER behind §3.1 (`CCR-2026-08-30-05`) is NOT reopened

Its product premise — *"the advocate cannot see who said so"* — is **still true**,
because `apps/mobile/src` renders none of it. What was wrong was the stated
**reason** (no wire field) rather than the **conclusion** (no visible distinction).
The interim constraints stand unchanged: reporter-class copy wherever a source is
implied, and the words "set aside" blocked entirely (claims register B2c).

### B2.4 The asymmetry underneath it, referred to LCC, not decided here

`search/route.ts` computes `treatmentAttribution` for every structured hit and
discards it, while `POST /arguments/counter`, reading the same `retrieve.ts` result,
serves it. **The screen used to argue against an authority can say a reporter said
the law moved; the screen used to find it cannot.**

This is not adjudicated in R15. It is not a contract defect — the field is optional
on both routes and no client reads either — and deciding it belongs with the §3.1
DEFER at Gate C, where the reporter-versus-court question is already scheduled.

---

## B3 · RETAINED SOURCE ARTIFACT vs SOURCE LINK IS NOT ON THE WIRE — RECORD CORRECTION

Filed by LCC as **CCR-LCC-XS-04**. Adjudicated: **NO_CHANGE to the wire, AMEND the
record.**

### B3.1 The claim that was wrong

`TRUST_STATE_PRODUCT_CONTRACT_V1.md` §1 lists trust state 6 —
*"SOURCE_LINK_ONLY ≠ retained evidence"* — as **representable: YES**, with
`judgment.source_evidence` as the evidence. **`judgment.source_evidence` is a
capability name in `V1_CAPABILITY_REGISTRY_R14.json`. It is not a wire field.**

Verified at HEAD by NEW3:

```
services/api/src/corpus/source-artifact-state.ts
  exports sourceArtifactState() -> { sourceArtifactHeld, textState,
                                     fullTextEvidenceAvailable,
                                     generationEvidenceAvailable }
  IMPORTERS, repo-wide:  its own test, and LCC's new cross-surface test.
  ROUTES EMITTING ANY OF THE FOUR FIELDS:  none.
```

### B3.2 Does R14 already allow a truthful UI?

```
DOES_CURRENT_R14_ALREADY_ALLOW_TRUTHFUL_UI = YES
USER_HARM_IF_UNCHANGED                     = NONE
DECISION                                   = NO_CHANGE (wire) + AMEND (record)
```

**YES, and the mechanism is weaker than the contract implies, which is why it is
being written down rather than left implied.** Read at HEAD,
`apps/mobile/src/screens/judgment/SourceTrustBlock.tsx` renders exactly two things
about origin: `Source · <court>` and the action `Open the court's copy`. Both are
**link claims**. The registry's banned claim — *"Verified from the retained official
PDF", false for 99.92% of the corpus* — never appears, and cannot, because no
retention claim exists anywhere on the surface.

**The banned claim is prevented by never making the opposite claim.** Nothing
over-claims because nothing claims. That is sufficient, and it is not the same thing
as "the distinction is representable".

### B3.3 Why no field is added

A field is added when a **current v1 user-facing truth distinction cannot otherwise
be represented honestly**. There is no such distinction today: no v1 surface offers
to tell an advocate whether we hold the bytes, and `official_source_artifact` covers
14,210 of 18,758,460 judgments (0.07575%) — a number no honest surface would present
per-document as a quality signal.

Adding `sourceArtifactHeld` to the wire because the backend computes it internally is
precisely the move R15 declines. The internal existence of a value is not a reason to
serve it.

### B3.4 The correction to `TRUST_STATE_PRODUCT_CONTRACT_V1` §1

> **State 6 is corrected from "representable: YES" to:**
> **`REPRESENTABLE = NO (PROTECTED_BY_PROHIBITION)`.** The retained-artifact versus
> source-link distinction is **not on the wire and has no client type**. It is
> protected by the banned-claim rule in `V1_CAPABILITY_REGISTRY` under
> `judgment.source_evidence`, and by the fact that `SourceTrustBlock.tsx` makes only
> a link claim. **Any future surface that would assert we hold the original document
> requires a contract amendment first** — it cannot be built on a field the wire does
> not carry.

This joins states 7, 8 and 9, which §5 of the trust-state contract already discloses
as fixture-designed rather than evidenced. State 6 carried no such disclosure and now
does.

---

## B4 · THE `overruledStatus` LAYER MAP, CORRECTED — `CCR-NEW3-XS-01` STANDS

Filed by LCC as **CCR-LCC-XS-02**, plus a correction to NEW3's own record.
Adjudicated: **the DEFER is unchanged. Two facts in the record are corrected, and one
new non-contract defect is routed to LCC.**

### B4.1 Correction 1 — `search/saved.ts:292` serves the DERIVED banner

`CONTRACT_CHANGE_LEDGER.json` `CCR-NEW3-XS-01.observedAtHead.storedSites` records
`search/saved.ts:292` as *"the raw `hybridSearch` hit"*, and the LCC handoff in
`NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md` §5 calls it *"the raw stored
value... strictly worse than the matter list"*.

**The line number is exact. The missing `precedentialEffect` is real. The layer is
wrong.** Verified independently at HEAD by NEW3:

```
search/saved.ts:31    import { ... hybridSearch ... } from './retrieve.ts'
search/saved.ts:238   results = await hybridSearch(...)
search/saved.ts:292   overruledStatus: r.overruledStatus      <- SearchResult key
search/retrieve.ts:2420  overruledStatus: policy.bannerStatus  <- set before saved.ts sees it
```

`r.overruled_status` and `r.overruledStatus` differ by one underscore and by a whole
layer. **The saved feed serves the derived banner.** It is therefore not worse than
the matter list on the banner axis at all — only on the finer field.

**What survives the correction, unchanged:** `search/saved.ts` serves no
`precedentialEffect` and no `overruledStatusStored`, so a consumer has no
reconstruction path. It remains **unconsumed** and is not a v1 capability
(`savedSearchFeed` is `DISABLED_NOT_READY`, OD-12 is OPEN), and it must not ship
without deriving.

### B4.2 Correction 2 — a fifth surface serves the stored column

`GET /citations/:citationCheckId` was not in the R14 census.
`services/api/src/citations/check.ts:123` serves
`overruledStatus: r.overruled_status ?? r.overruled_status_shown` — the joined stored
column — beside `overruledStatusShown`, with no statement of which layer either is.

**Not user-reachable.** Verified at HEAD: `apps/mobile/src/api/client.ts:904` is the
only caller, `UnverifiedCitationScreen.tsx` and `VerificationSheet.tsx` are the only
two consumers, and grepping both for `overruled` returns **one prose comment and no
render**. Same class and same treatment as the deferred matter-list case.

### B4.3 The corrected layer map, all six emission sites

```
DERIVED here      judgments/route.ts:402 · search/retrieve.ts:2420 ·
                  search/route.ts:557,:614 · briefings/route.ts:255
DERIVED upstream  search/saved.ts:292        (CORRECTED in B4.1)
                  arguments/counter.ts:212
STORED            matters/authorities.ts:187 · citations/check.ts:123  (ADDED in B4.2)
```

### B4.4 Does any of this change `CCR-NEW3-XS-01`, R14, the wire, or the RCC instruction?

```
CCR_NEW3_XS_01_DECISION   DEFER          UNCHANGED
R14                       current until R15; not edited
WIRE_PROTOCOL             1              UNCHANGED
RCC_INSTRUCTION           UNCHANGED — the evidence_defect override at
                          MatterScreen.tsx:521-522 stays CONTRACT-LOAD-BEARING
                          and must not be deleted as redundant
```

Reasoning, against the four exit conditions the DEFER named:

1. **banner-upgrade class** — still zero rows. Neither correction produces one.
2. **another client renders `MatterAuthority.overruledStatus`** — still only
   `MatterScreen.tsx`. `CitationCheck` is a different type and no client renders its
   `overruledStatus` at all.
3. **the saved feed acquires a consumer or a v1 capability row** — it has neither, and
   B4.1 makes it *safer* than recorded, not less safe.
4. **RCC proposes removing the override** — RCC has not; it confirmed at
   `e52e61eb` that it left the two lines untouched with the explanation intact.

**None fires. The DEFER stands, on corrected facts.**

### B4.5 The new finding, and it is NOT a contract change

B4.2's divergence is already in the database, and the consequence is not on a client.

**`services/api/src/citations/recheck.ts:83`** selects rows where
`cc.overruled_status_shown IS DISTINCT FROM j.overruled_status::text` — comparing
**what was shown**, which on the reader, search and counterargument surfaces is the
**derived banner**, against the **stored column**. For an `evidence_defect` judgment
the two legitimately differ, so the row is selected as "diverged" and
`applyOverruledChange` fires with `toStatus = stored`.

**That is a false LAW MOVED alert** — the inverse of the stale-overruled harm,
produced by the same layer conflation, on the one colour the product reserves.

**Measured against the live database this session, read-only:**

```
citation_checks for f83d0700 (1975 INSC 212, stored set_aside, derived none)
  shown 'none'      shown_to_user=true  document_id null  surface judgment_detail   4
  shown 'set_aside' shown_to_user=true  document_id null  surface judgment_detail   4
active-matter annotations on that judgment                                          0

ALL shown rows corpus-wide where shown != stored                                   19
  across 5 judgments, every one shown 'none' / stored 'set_aside':
    2010 INSC 843  12   |  1975 INSC 212  4  |  2012 INSC 547  1
    2017 INSC 1009  1   |  2011 INSC 114  1
  of these, LAYER CONFLATION (the evidence_defect judgment)                          4
  of these, GENUINE STALENESS — the recheck's correct job                           15

rows the recheck predicate SELECTS today (its full WHERE clause, run verbatim)       0
```

**Unreachable today by population, not by construction.** The gate is
`shown_to_user = true AND (an active-matter annotation OR an exported draft)`, and
the judgment is in zero active matters with `document_id` null on all eight rows. The
moment any advocate saves any of those five to an active matter, four fire correctly
and one fires falsely.

```
CONTRACT_CHANGE_REQUIRED = NO
```

No wire field changes and no client is involved. `recheck.ts` is entirely
server-internal. This is an **engineering defect routed to LCC**, P1-latent, and the
fix is to compare like-for-like layers rather than to amend anything here.
