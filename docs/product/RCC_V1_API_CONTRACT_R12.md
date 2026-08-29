# RCC v1 API CONTRACT — FROZEN

**Status:** `RCC_API_CONTRACT = FROZEN` for Sprint 2.
**Against:** `contract 1` (`GET /version` → `{"contract":1,"minSupportedContract":1}`).
**Backend observed:** `gitSha 8795ba8b9d569ac5afbbb724d2c9299ed6094c15`, live local API.
**Frozen by:** NEW3, 29 August 2026. **Consumed by:** RCC (mobile) and, later, desktop.

---

## HOW THIS FILE RELATES TO `docs/API_CONTRACTS.md`

`docs/API_CONTRACTS.md` is the **full seam** — 1,791 lines, 105 endpoints, and its
BUILT/SPECCED table is **machine-enforced** by `scripts/check-contract-status.mjs`
(currently `105 endpoints · 92 built · 13 specced`). Adding a route without moving its row
fails the check, and so does marking a row BUILT that no route serves.

**That file is not duplicated and not superseded.** This file names the **v1 mobile
surface**: which of the 92 built endpoints RCC may call, what each one's *capability state*
is, what it does when degraded, which provenance and freshness fields it carries, and where
the gaps are.

**Rule:** if a shape here and a shape there disagree, `API_CONTRACTS.md` wins on shape and
this file wins on whether RCC may ship it.

---

## 0. ENVELOPE AND AUTH — unchanged, restated because they are load-bearing

```
success   { "ok": true,  "data": T }
failure   { "ok": false, "error": { "code": string, "message": string } }
```

| code | status | means | client action |
|---|---|---|---|
| `AUTH_REQUIRED` | **401** | no valid bearer token | sign in / refresh |
| `PROFILE_INCOMPLETE` | **403** | **token is valid**, onboarding never created the `users` row | send to onboarding — **do not refresh the token** |
| `INVALID_REQUEST` | **400** | Zod rejected the body/query | fix the request; the message names the field |
| `NOT_FOUND` | **404** | | |

**The status matters more than the code.** On 401 a client refreshes and retries, which
cannot help when the token was never the problem — that produced a re-login loop against a
valid session. **403 is *authenticated, not yet permitted*.**

**Creates return 201, not 200.** Observed: `POST /matters` → **201**,
`POST /matters/:id/authorities` → **201**. A client asserting `status === 200` will treat a
successful save as a failure. *(This exact mistake was made and caught inside NEW3's own
acceptance harness this round.)*

---

## 1. THE V1 MOBILE SURFACE

Legend — **capability state** from `docs/product/V1_CAPABILITY_REGISTRY_R12.json`.

### 1.1 Session and identity

| method / path | auth | capability | notes |
|---|---|---|---|
| `POST /auth/magic-link` | none | ENABLED_V1 | **always answers the same way** whether or not the address exists |
| `POST /auth/verify` | none | ENABLED_V1 | returns the token pair |
| `POST /auth/refresh` | none | ENABLED_V1 | rotating; a token presented twice revokes the family |
| `POST /auth/logout` | bearer | ENABLED_V1 | |
| `GET /me` | bearer | ENABLED_V1 | `{ user: { authId, email, profileComplete, profile } }` — `profileComplete` is the onboarding gate |
| `PATCH /me` | bearer | ENABLED_V1 | |
| `GET /terms/current` | none | ENABLED_V1 | |
| `POST /me/accept-terms` | bearer | ENABLED_V1 | consent recorded once, in `users.terms_accepted_at` / `terms_version` |

**No AI-assisted watermark on any document.** Consent is once, at onboarding. PD-8 is
superseded.

### 1.2 Search — the one endpoint

```
POST /search        auth: OPTIONAL (verified unauthenticated on the live backend)
```

**Request** (`searchRequest`, Zod):

```jsonc
{
  "query": "string, 1..500",          // >500 → 400. NOTHING IS TRUNCATED.
  "language": "en" | "hi",             // an input field, NOT a capability
  "filters": {                         // all optional
    "court":   "string 1..120",        // a court NAME, matched with =
    "courts":  ["sc"|"hc"|"district"|"tribunal"],  // CATEGORY CODES, expanded server-side
    "dateFrom": "YYYY-MM-DD",          // ISO calendar dates, validated
    "dateTo":   "YYYY-MM-DD",          // dateFrom > dateTo → 400
    "caseType": "criminal" | "civil"
  },
  "matterId": "uuid",                  // optional, links the search to a matter
  "page":     1..100,                  // optional, 1-based, NOT an opaque cursor
  "pageSize": 1..25
}
```

**Response — the shape is CONDITIONAL and the client must treat several fields as
optional.** Observed on the exact-identity path:

```
results, unverifiedReferences, searchId, parsed, total, retrievalOutcome, page
```

Observed on the degraded lexical path:

```
results, unverifiedReferences, unpopulatedCourtCategories, degraded,
emptyBecause, retrievalOutcome, page, searchId
```

**`degraded`, `emptyBecause`, `unpopulatedCourtCategories`, `total`, `parsed` and
`exactTitleCandidates` are OPTIONAL.** A client that requires any of them crashes on the
other path.

**`results[]` element — every key observed live:**

```
judgmentId · citationCheckId · caseTitle · neutralCitation · reporterCitations ·
court · judgmentDate · holding · operativeParagraph · operativeParagraphNumber ·
operativeParagraphVerified · exactSpan · bodyText ·
verificationState · verifiedBySource · overruledStatus · overruledStatusStored ·
precedentialEffect · canAddToMatter · unappliedTreatment ·
overruledByJudgmentId · overruledParas · overruledNote · asOf
```

**Provenance / freshness fields on the result:** `asOf`, `overruledStatusStored` beside the
live `overruledStatus`, `operativeParagraphVerified`, `exactSpan` (null rather than clamped
or guessed where no verified offset exists).

**`retrievalOutcome`:**

```
state             ok | coverage_unknown | ...
reasons[]         timeout | sparse_unbounded | semantic_index_insufficient | ...
safeForGeneration boolean — FALSE on every response observed this round
exactIdentityUsable boolean
resultCount       int
rarestDf          number, present whether or not it refused
contractVersion   1
```

**`degraded[]` vocabulary:** `sparse_timeout` · `sparse_unbounded` · `dense_timeout` ·
`pin_timeout`. `pin_timeout` is the strongest — it means the answer an **index** should
have held was not computed in time.

**`emptyBecause`:** `{ reason: "query_too_broad_to_rank", remedy: "add_more_terms" }`.

**`page`:** `{ page, pageSize, hasMore }`. `hasMore` is **observed by over-fetching**, not
inferred from a full page, so a page failure is distinguishable from the corpus ending.
`total` appears only where a real `COUNT(*)` exists.

#### Degraded-state rendering — binding on RCC

| condition | render |
|---|---|
| `degraded` non-empty, `results` non-empty | results **plus** a visible "we could not search everything" state |
| `degraded` non-empty, `results` empty | **never** "no results". Render `emptyBecause.reason` and `remedy` |
| `unpopulatedCourtCategories` includes a chip the user selected | say the filter has no data behind it — not zero results |
| `retrievalOutcome.state === "coverage_unknown"` | the result set is not a statement about the corpus |
| 400 on a long query | show the server's message verbatim; **never** truncate and retry |

#### Known v1 limits on this endpoint — see G-1 and G-2

- A **party name alone returns zero**. A full cause title resolves at rank 1.
- A **broad term inside a narrow filter is still refused** on a corpus-wide document
  frequency.

RCC builds the screens now; they begin returning results when LCC changes the bound. **No
request or response shape changes for either fix.**

### 1.3 Judgment reader

| method / path | auth | capability |
|---|---|---|
| `GET /judgments/:id` | optional | ENABLED_V1 |
| `GET /judgments/:id/treatment?limit=1..200&cursor=` | optional | ENABLED_V1 |
| `GET /judgments/:id/graph?depth=1..2&limit=1..100` | optional | **BLOCKED BY G-3** |
| `GET /judgments/:id/authorities` | optional | ENABLED_V1 |
| `GET /judgments/:id/annotations` · `POST` · `DELETE /annotations/:id` | bearer | ENABLED_V1 |

**`GET /judgments/:id` — every key observed live:**

```
judgmentId · caseTitle · neutralCitation · reporterCitations · court · bench ·
judgmentDate · dateQuality · dateQualityState · caseNumber · caseType · language ·
sourceUrl · fullText · bodyText · textOrigin · generationEvidenceEligible ·
paragraphs · numberedShare ·
verificationState · verifiedBySource · overruledStatus · overruledStatusStored ·
precedentialEffect · canAddToMatter · citableForUntouchedPropositions ·
precedentialBecause · unappliedTreatment · treatmentAttribution ·
overruledByJudgmentId · overruledParas · overruledNote · asOf
```

**Provenance:** `sourceUrl` (present for 100% of the corpus), `textOrigin`,
`dateQualityState`. **`dateQualityState` read `DATE_UNCHECKED` on the sampled response —
present is not verified, and the UI must not imply otherwise.**

**`bodyText.evidenceWithheld`** is the reader's refusal state for a judgment whose body
text is convicted damaged. Render the refusal. **Never render an empty page.**

**`GET /judgments/:id/graph` returns** `rootId · asOf · nodes · edges · totalNodes ·
returned · truncated`. It does **not** declare partiality — see G-3. **This screen does not
ship until it does.**

### 1.4 Citation state — three fields, never one enum

| method / path | auth | capability |
|---|---|---|
| `GET /citations/:citationCheckId` | optional | ENABLED_V1 |
| `POST /verify/ecourts` | bearer | ENABLED_V1 (Tier 3, human-solved) |
| `POST /verify/confirm` | bearer | ENABLED_V1 |
| `POST /citations/copies` | bearer | ENABLED_V1 |

**Observed response:**

```jsonc
{ "citationCheckId": "...", "citationClaimed": "2026:JHHC:25953",
  "checkedAt": "...", "surface": "search", "shownToUser": true,
  "verificationState": "verified", "verifiedBySource": "corpus",
  "overruledStatus": "none", "overruledStatusShown": "none",
  "matchConfidence": null,
  "judgment": { "judgmentId": "...", "dateQualityState": "DATE_UNCHECKED", ... },
  "tiers": [ { "tier": 1, "source": "corpus", "status": "confirmed", "detail": "..." } ] }
```

**Binding render rules, restated because they are the licence:**

1. **VERIFIED IS SILENT.** No badge on a verified citation. Silence means "verified, not
   decorated". **Silence never means "dropped".**
2. Only two states render: **unverified** (unmissable mark + the eCourts path) and
   **overruled** (LAW MOVED, three states).
3. **`failed` renders EXACTLY as `unverified`.** The advocate cannot act on the difference,
   and an outage must not read as a corpus gap.
4. `verifiedBySource` appears **only** in the on-tap detail and the admin monitor. Never as
   a badge.
5. **Amber `#B4690E` is reserved for LAW MOVED and nothing else.** Our own uncertainty
   renders as neutral ink with a dashed edge.
6. **`overruledStatus` is read live at render on every surface and is never cached.**
   `overruledStatusStored` is beside it so a divergence is visible.
7. `set_aside` **disables add-to-matter** — `canAddToMatter` carries it.
8. Copy is licence protection: *"Safe to file"*, never *"we verified this"*. *"We could not
   confirm this exists"*, never *"verification failed"*.

**Measured context, so RCC knows what it will actually see:** `citation_checks` holds
**16,199** rows and every one is `verified`/`corpus`. There are **zero** `unverified` and
**zero** `failed` rows today. **The unverified path has no production traffic behind it and
must still be built correctly** — it is the path that matters most and the one nothing will
exercise.

### 1.5 Statutes

| method / path | auth | capability |
|---|---|---|
| `GET /statutes` | optional | ENABLED_V1 |
| `GET /statutes/sections?actId&sectionNumber&q&limit&offset` | optional | ENABLED_V1 |

`GET /statutes` → `{ statutes: [{ statuteId, shortTitle, hindiTitle, actNumber, actYear,
enactmentDate, enforcementDate, ministry, sourceUrl, sectionCount }] }` — **849 Acts**
returned in one response.

`GET /statutes/sections` → `{ sections: [{ sectionId, statuteId, shortTitle, sectionNumber,
heading, sectionText, ... }] }`.

**A BARE SECTION NUMBER IS AMBIGUOUS AND THE CLIENT MUST NEVER SEND ONE.** Measured:
`?sectionNumber=103` returns **59 sections from 59 distinct Acts**, and the first is
*The Merchant Shipping Act, 2025* s.103. With `actId` for the Bharatiya Nyaya Sanhita it
returns **s.103 "Punishment for murder"**, correctly. **The Act is part of the question, and
the UI must make the advocate choose it.**

Held and verified this round: BNS 2023 (358 sections) · BNSS 2023 (531) · BSA 2023 (170) ·
IPC 1860 (552) · CrPC 1973 (532) · Indian Evidence Act 1872 (184).

**`statute.old_new_correspondence` is DISABLED.** RCC must **not** show "IPC s.302 → BNS
s.103" anywhere. Transition rules await advocate sign-off, and a wrong correspondence is a
wrong section number.

**A statute link on a judgment is a candidate correspondence, not a holding.** Label it
"cited section, as extracted".

### 1.6 Corpus honesty surfaces

| method / path | auth | capability |
|---|---|---|
| `GET /corpus/coverage` | optional | ENABLED_V1 |
| `GET /corpus/freshness` | optional | ENABLED_V1 |
| `GET /corpus/freshness/object` | optional | ENABLED_V1 |
| `GET /release/capabilities` | optional | ENABLED_V1 |

`GET /corpus/freshness` returns **two lag numbers and both are true**:

```
naive.lagDays          1     max(judgment_date) = 2026-08-28
                             carries its own warning string: "A month holding a single
                             document has a newest date and no coverage — never quote
                             this as currency."
legalCurrency.lagDays  29    dataAsOf 2026-07-31, honestFrontierMonth 2026-07-01,
                             baseline 134,810 documents/month
```

**Quote both or neither.** The client's "data as of" line uses **`legalCurrency.dataAsOf`**.

`GET /corpus/freshness/object` is the machine-readable one: `definitionVersion
HC_PARITY_V2_2026-08-29`, `definitionArtifactSha256 1e5bdd90…c0e7`, `publishedAt`,
`latestUpstreamDecisionDate`, `latestLocalDecisionDate`, `sourceLagDays`,
`upstreamLocalCompleteness`, `sourceUnavailableCount`, plus `courtMonthDetail[]`. It
**fails closed** — the route throws on a definition/sha mismatch rather than serving a
number whose meaning has drifted. **p50 7.5 ms, 0 database queries per request.**

`GET /release/capabilities` is the server's own registry. **RCC should read it at launch
and hide any surface whose capability is not ENABLED** rather than hardcoding the list.

### 1.7 Matters and saved authorities

| method / path | auth | capability | observed |
|---|---|---|---|
| `GET /matters` | bearer | ENABLED_V1 | |
| `POST /matters` | bearer | ENABLED_V1 | **201**, `{ matter: { matterId, ... } }` |
| `GET /matters/:id` · `PATCH /matters/:id` | bearer | ENABLED_V1 | |
| `POST /matters/:id/events` · `PATCH /matters/:id/events/:eventId` | bearer | ENABLED_V1 | |
| `GET /matters/:id/authorities` | bearer | ENABLED_V1 | `{ authorities: [...], asOf }` |
| `POST /matters/:id/authorities` | bearer | ENABLED_V1 | **201**, `{ authority: { ... } }` |
| `DELETE /matters/:id/authorities/:authorityId` | bearer | ENABLED_V1 | |
| `GET /matters/:id/shares` · `POST` · `DELETE` | bearer | **built, not a v1 screen** | Workspace model §8 |

`POST /matters` body: `caseTitle` (1..300) · `cnrNumber` (≤40, nullable) · `court`
(1..200) · `caseType` `criminal|civil` · `parties` (record) · `clientName` (1..200) ·
`ourSide` `petitioner|respondent|accused|complainant|other` · `nextHearingDate`
`YYYY-MM-DD` nullable.

`POST /matters/:id/authorities` body: `{ judgmentId: uuid, citationCheckId?: uuid }`.

**The saved authority carries the three citation fields** — observed:
`verificationState: "verified"`, `verifiedBySource: "corpus"`, `overruledStatus: "none"`,
plus `overruledByJudgmentId`, `overruledParas`, `overruledNote`, `addedAt`, `removedAt`.
**The join is at read time**, so an authority later marked `set_aside` shows it on the next
read. `asOf` is on the list response.

### 1.8 Alerts, briefings, saved searches, documents, consent

| method / path | auth | capability | note |
|---|---|---|---|
| `GET /alerts` · `POST /alerts/:id/read` | bearer | ENABLED_V1 | |
| `GET /me/alert-settings` · `PATCH` | bearer | ENABLED_V1 | |
| `GET /matters/:id/briefings` · `GET /briefings/:id` · `POST /briefings/:id/opened` | bearer | DISABLED_NOT_READY | mounted; **not run through acceptance this round** |
| `GET /saved-searches` · `POST` · `DELETE /:id` · `GET /:id/feed` | bearer | **held — OD-12 is OPEN** | the saved-search feed is a proposed reframe of PD-5 and **must not be resolved by shipping it** |
| `GET /documents` · `GET /documents/types` · `GET /documents/:id` · `PATCH` · `POST /:id/citations` · `DELETE /:id/citations/:cid` | bearer | ENABLED_V1 (existing docs only) | |
| `POST /documents` · `POST /documents/:id/export` · `POST /ocr/jobs` · `GET /ocr/jobs/:id` · `POST /ocr/jobs/:id/confirm` | — | **SPECCED, 404s** | blocked on the countersigned DPA |
| `GET /me/training-consent` · `POST` · `DELETE` | bearer | ENABLED_V1 | |
| `POST /me/data-requests` · `GET /me/data-requests` | bearer | ENABLED_V1 | |
| `POST /arguments/counter` | bearer | **not a v1 screen** | generation-adjacent |

**OCR:** when it ships, **output is never trusted silently** — the advocate confirms
extracted fields before anything saves. A silently wrong hearing date is a missed hearing.

### 1.9 Monitoring — contractual, disabled

```
POST /court/lookup    { "cnrNumber": "..." }        BUILT, and it refuses honestly
→ { "available": false,
    "reason": "no_adapter_implemented",
    "manualEntry": { "expected": true,
      "message": "Enter the next date from your file. Dates given in open court are the
                  normal source and are treated exactly the same as one we looked up." } }
```

**RCC builds the manual hearing-date path as the PRIMARY path, not as a fallback.** The
copy above is the product's position, not an apology.

**Six monitoring fields are frozen now and will be served as null / `never_attempted`:**
`monitoringPolicy` · `lastObservedAt` · `nextPlannedObservationAt` · `observationSource` ·
`lastObservationOutcome` · `monitoringDegradedReason`.

**Render those as "you are keeping this date yourself". Never as "monitoring is on".**
**No polling frequency and no SLA may appear anywhere in the client**, including onboarding
copy, store screenshots and marketing.

**When eCourts observations exist**, every derived response additionally carries
`observedAt` · `observationSourceKey` (five dimensions **plus** a date and civil/criminal —
**not** a court string) · `observationStrategy` · `rawEvidenceRef` ·
`lastObservationOutcome` · `sourceUncertainty` · `monitoringDegradedReason`.

**`LISTED` is never rendered as `HEARING_OCCURRED`.**

### 1.10 Admin — not the mobile surface

Every `/admin/*` route is the separate admin service. **RCC calls none of them.** Web is
admin only; there is no web login for advocates.

---

## 2. BLOCKING GAPS — three, none of them a new endpoint

| # | gap | blocks | fix lives in | shape change |
|---|---|---|---|---|
| **G-1** | party-name queries never reach the trigram path | the primary search entry point | `services/api/src/search/retrieve.ts` routing | **none** |
| **G-2** | the admission bound is corpus-wide while the query is filtered | the daily-loop "what's new in my court" screen | `services/api/src/search/retrieve.ts` bound | **none** |
| **G-3** | `GET /judgments/:id/graph` has no partiality declaration | the citation-graph screen | the graph response | **additive** `coverage{ basis, resolvedEdgesInCorpus, judgmentsWithAnyResolvedOutgoing, corpusDenominator, declaredPartial }` |

**RCC is not blocked from starting.** G-1 and G-2 change behaviour behind frozen shapes.
Only G-3 adds a field, and only one screen waits on it.

---

## 3. WHAT RCC MUST NOT DEPEND ON

- **Anything semantic.** No screen may require `semanticAvailable: true`. It is `false` on
  every response observed, and `search.semantic.broad` is INTERNAL_EXPERIMENTAL.
- **HNSW, embedding coverage, or Tranche V2.** None is a v1 dependency and none is on the
  critical path.
- **eCourts observations.** There are zero, and there will be zero until a founder-level
  answer arrives.
- **`total` on the hybrid path.** The structured arm reports a real `COUNT(*)`; the hybrid
  path deliberately reports none. Do not render "N results" where `total` is absent.
- **Hindi.** `language: "hi"` is an accepted input value, not a supported capability.
- **A 200 on create.** See §0.

---

## 4. CHANGE PROTOCOL

Frozen for the sprint. A mid-sprint change requires telling both consuming lanes on the
bus, and `scripts/check-contract-status.mjs` must stay green — a route added without moving
its row fails CI, which is the point.

Additive fields (G-3's `coverage`, the six monitoring fields, `sourceEdition`) may land
mid-sprint **because a client that ignores an unknown key is unaffected**. Removing or
renaming a field may not.
