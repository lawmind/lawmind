# RCC v1 API CONTRACT — R14 AMENDMENT

**Status:** `RCC_API_CONTRACT = R14`. Supersedes **only the sections named below**.
**Prior revision:** `R13`, `docs/product/RCC_V1_API_CONTRACT_R13_AMENDMENT.md`.
**Frozen baseline:** `R12`, `docs/product/RCC_V1_API_CONTRACT_R12.md`,
sha256 `e89d93c82772cd35aab59626fd20cb291e966f4fc687eb4c7fdc054c1981d5ed`,
git blob `8c0159ba9db9c86f20b0c1aa08da3457b8f67d6d`. **R12 and R13 are not edited.**
**Amended by:** NEW3, 30 August 2026. **Ledger:** `CONTRACT_CHANGE_LEDGER.json`.
**Measured against:** `gitSha 19920c0f2199e4d5afbd543c583a19f235238172`, the current
repository HEAD at the time of amendment — not a sealed Day-0 snapshot. Every shape
below was read from committed source and observed by executing the committed Hono
app, and each observation names how it was taken.

---

## 0 · CONTRACT REVISION IS NOT THE WIRE INTEGER

Two numbers exist and they are not the same number. R13 said this in passing; it is
promoted here because an amendment that adopts an already-shipped shape is exactly
where the two get conflated.

```
CONTRACT_REVISION      = R14     the NEW3 governance revision of this document
WIRE_PROTOCOL_VERSION  = 1       the integer served at GET /version as `contract`
```

**What the wire integer means, read from the source that defines it**
(`services/api/src/contract-version.ts`, committed): `CONTRACT_VERSION` is
*"bumped ONLY by a change a current client cannot ignore"*, and the file states the
rule it enforces — *"Within a contract version, every change is ADDITIVE"* — with
`MIN_SUPPORTED_CONTRACT` moving as a separate, deliberate act.

**Therefore the wire integer stays `1` for R14.** Every amendment below adds an
optional request selector, adds optional response fields, adds a value to an
open-ended string field, or states a meaning that was already true. Nothing is
removed, renamed, retyped or narrowed. An R12 client that sends no platform selector
receives a byte-identical payload to the one it received before any of this existed —
**observed, not assumed**; see §A4.4.

`minSupportedContract` does not move either.

---

## WHAT RCC MAY CONSUME TODAY

| amendment | released to RCC | why |
|---|---|---|
| **A4** — platform-resolved `GET /release/capabilities` | **YES** | already implemented, committed, and covered by committed tests |
| **A5** — `precedentialEffect` has an eighth value | **YES** | the value is served by committed code today |
| **A6** — `precedentialEffect` / `canAddToMatter` on saved matter authorities | **NO** | no backend serves them on that route. Do not build against it. |
| **A7** — filtered-admission semantics | **YES** | semantic only; the shapes already exist |
| **A8** — `rarestDf`, restated | **YES** | carried from R13 A1, unchanged in substance |

**A3 of R13 is WITHDRAWN and replaced by A4.** See §A4.0.

---

## A4 · `GET /release/capabilities` — PLATFORM-RESOLVED VIEW

### A4.0 Why this supersedes R13 A3, and the chronology, stated plainly

R13 A3 specified a **second representation**: every row would carry a
`platforms: {ios, android, web}` object and the client would read its own entry.
That shape was never built. What LCC built instead — and what HEAD serves — is a
**resolved per-platform view**: the caller names its platform, and the server
returns that platform's already-resolved states plus an audit list of what it
narrowed.

**NEW3 adopts the shipped shape as canonical and withdraws A3.** Reasons, in order:

1. both mechanisms satisfy the same product requirement (roadmap v7.1 §9.5 — the
   switch exists before App Review, and the claims register becomes per platform);
2. the implementation exists, is committed, and is covered by committed tests
   (`services/api/src/search/party-search-platform.test.ts` — run at HEAD for this
   amendment: **17 pass, 0 fail**);
3. RCC has not consumed A3 — the ledger's `releasedToRCC: false` held, and RCC's own
   `CCR-RCC-S2-01` asks for the capability, not for that representation;
4. carrying both would put two answers to one question on the same route.

**Chronology, recorded rather than tidied:**

```
LCC_IMPLEMENTATION_PREDATED_FORMAL_AMENDMENT = true
```

The ledger row for A3 (`CCR-2026-08-30-04`) was committed in `4baca742`,
30 Aug 2026 12:28:37 +0400. LCC's implementation of the resolved-per-platform shape
landed in `4ac4cb24`, 30 Aug 2026 12:32:49 +0400 — **four minutes later, and to a
different shape than the one decided.** The formal amendment adopting what LCC built
is this document, which postdates both. Governance did not run in the order
`CONTRACT_CHANGE_CONTROL.md` §1 prescribes, and no wording here should be read as
implying it did. What is corrected is the record, not the past.

### A4.1 Endpoint

```
GET /release/capabilities        no auth
```

### A4.2 Platform selector semantics — OBSERVED

Two selectors, and the precedence between them is not a matter of taste:

| selector | form |
|---|---|
| header | `X-Lawmind-Platform: <value>` |
| query | `?platform=<value>` |

**The header wins when both are present.** Observed by executing the committed app:
header `ios` together with `?platform=android` returns `"platform": "ios"`. Read
from `services/api/src/app.ts`, the selector is
`c.req.header('x-lawmind-platform') ?? c.req.query('platform')` — the query parameter
is the fallback, never an override.

**It is not a security boundary and RCC must not treat it as one.** The committed
source says so in `services/api/src/release/enforce.ts`: a caller that lies about its
platform gains nothing it could not already reach, because anything that must be
unreachable is `DISABLED` release-wide where no header can touch it.

### A4.3 Supported platform values — OBSERVED

```
ios · android · web · unknown
```

- Parsing is **trimmed and lower-cased**: `"  IOS "` resolves to `ios`.
- `unknown` is a resolved *result*, never a value a client should send: the literal
  string `"unknown"` in the selector resolves to `unknown` by the unrecognised path,
  not by being accepted.
- `web` in this contract means the **advocate web application**. It does not mean the
  marketing website, which is not a client platform at all. See
  `V1_CLAIMS_REGISTER_R14.md`.

### A4.4 Default / no-platform behaviour — OBSERVED, and it is the compatibility guarantee

**A request with neither selector returns the release-wide envelope, unchanged:**

```jsonc
{ "registryVersion": "…", "asOf": "…", "capabilities": { } }   // three keys
```

The keys `platform` and `platformOverrides` are **absent** — not null, absent.
Observed at HEAD: `["registryVersion","asOf","capabilities"]`. This is why
`WIRE_PROTOCOL_VERSION` stays `1`: every existing client keeps receiving exactly what
it received before.

### A4.5 Exact response envelope — OBSERVED

**With a platform selector present (including an unrecognised one), five keys:**

```jsonc
{
  "registryVersion": "RELEASE_CAPABILITIES_R8_3.4",   // string, server's own registry version
  "asOf":            "2026-08-26",                    // string, YYYY-MM-DD
  "platform":        "ios",                           // "ios"|"android"|"web"|"unknown"
  "capabilities":    { },
  "platformOverrides": []                             // string[], see A4.7
}
```

Observed key order and membership at HEAD:
`["registryVersion","asOf","platform","capabilities","platformOverrides"]`.

The whole response is wrapped in the standard success envelope (`{ok, data}`) like
every other route; the object above is `data`. Unchanged from R12.

### A4.6 `capabilities` semantics

A map, **keyed by capability name**, of the states **already resolved for the platform
that asked**. Observed at HEAD: **25 rows** (R13 recorded 24; the count is not
contractual and RCC must not assert one).

Each row:

```jsonc
{
  "state":  "ENABLED" | "LIMITED" | "DISABLED" | "EXPERIMENTAL_INTERNAL",
  "reason": "…",            // string, always present
  "asOf":   "YYYY-MM-DD",   // string, always present
  "unblockedBy": "…"        // string, OPTIONAL — absent on rows with nothing to unblock
}
```

**Binding on RCC:**

- **Read `state` directly. Do not resolve anything.** There is no `platforms` object
  to walk and no fallback to compute — the resolution already happened on the server.
  This is the substantive difference from R13 A3 and the reason A3 is withdrawn.
- Where a row is narrowed for this platform, `reason` and `asOf` are the **override's**,
  not the release-wide row's — so the reason shown to a user or an operator explains
  *the state they actually got*.
- The four-state vocabulary is unchanged from R12. `EXPERIMENTAL_INTERNAL` is **not**
  user-reachable; only `ENABLED` and `LIMITED` are.
- The row set is the server's statement about itself. It is **not** the NEW3 product
  registry (`V1_CAPABILITY_REGISTRY_R14.json`), which uses a five-state product
  vocabulary and decides what v1 *ships*. Where they disagree, the runtime registry
  wins on fact and the product registry wins on shipping decision.

### A4.7 `platformOverrides` semantics

`string[]` — the capability names that were **narrowed for this platform**, so the
resolution is auditable instead of implicit.

- **Empty today.** Observed `[]` for `ios`, `android`, `web` and `unknown` at HEAD.
  That is the correct state, not an omission: roadmap v7.1 §9.5 says ship the switch,
  not disable the capability. **Adding a row to the override map IS flipping the
  switch.**
- Present only on the platform-selected shape. Absent from the release-wide shape.
- **Binding on RCC:** it is a diagnostic and an audit list. Do not render it to an
  advocate, and do not derive a user-facing message from a name appearing in it — the
  user-facing consequence is the `state` and `reason` of the row itself.

### A4.8 Narrow-only safety behaviour — the guarantee that makes the selector safe

A platform override may take a capability **DOWN and never UP**. Read from committed
source: states are ordered `ENABLED 3 > LIMITED 2 > EXPERIMENTAL_INTERNAL 1 >
DISABLED 0`, and an override is applied only if it is **strictly narrower** than the
release-wide state. An override that is not narrower is **ignored, not obeyed**.

Covered by committed tests: `DISABLED` on a platform beats `ENABLED` release-wide;
`ENABLED` on a platform does **not** beat `DISABLED` release-wide.

**What this buys, stated as the client-visible promise:** a caller that sends a
platform header can never reach a capability the release-wide registry refuses. The
selector can only ever show a client *less*. So a lie about the platform is not an
escalation path, and RCC does not need to defend against one.

### A4.9 Party capability behaviour

- The runtime registry carries a **dedicated row**, `search.party_name`, observed
  `ENABLED` at HEAD on every platform including `unknown`. R13's statement that there
  is *"no dedicated party row"* is superseded.
- The **served** kill switch therefore exists. It is no longer build-time-only.
  Flipping it is a server-side config change to the override map, not an App Store
  release. `CCR-RCC-S2-01`'s requested acceptance path exists.
- **When the switch is flipped**, the committed contract requires all three of:
  1. `search.party_name` resolves `DISABLED` **for that platform only**;
  2. `search.exact_identity`, and the exact case-number / CNR / citation / full-title
     paths, are **untouched** — separate rows, separately served, asserted by
     committed tests that no exact-identity query classifies as `party_name`;
  3. the degradation is **VISIBLE** — `/search` emits `degraded: ["party_name_disabled"]`
     rather than silently returning fewer results.
- **Binding on RCC:** on `party_name_disabled`, render the visible degrade to
  case-number / citation / CNR search with a stated message. Never a silent
  disappearance, and never "no judgments matched".

### A4.10 Malformed / unknown platform behaviour — OBSERVED

**It never errors, and it never guesses.**

| sent | resolved `platform` | `capabilities` |
|---|---|---|
| `ios` / `android` / `web` | that value | that platform's resolved view |
| `  IOS ` | `ios` | resolved for iOS |
| `desktop`, `ipados`, `ios;android` | `unknown` | **release-wide states** |
| `?platform=` (empty string) | `unknown` | release-wide states |
| literal `unknown` | `unknown` | release-wide states |
| nothing at all | key absent | release-wide states, three-key envelope |

Status is `200` in every case. Observed at HEAD for `desktop` and for the empty
string; the parser's unrecognised-value set is covered by committed tests.

**Binding on RCC:** an unrecognised platform is **not** an error to surface and
**not** a reason to fail closed on capability discovery — it yields the release-wide
set, which is the widest honest answer. But a client that fails to send its real
platform will not see its own narrowing, so **RCC must send the header on every
build**, and must not rely on the query parameter (it exists for operators and
diagnostics).

---

## A5 · `precedentialEffect` HAS AN EIGHTH VALUE — `evidence_defect`

**Resolves `CCR-RCC-S2-04`.** RCC reported drift between the frozen seven-value client
enum and the server source. The drift is real, it is a widening, and it is served today.

Committed server union (`services/api/src/judgments/precedential-effect.ts`):

```
none · overruled · overruled_in_part · set_aside · partly_set_aside ·
doubted · review_required · evidence_defect
```

The frozen R12 client enum carries the first seven.

**What the eighth value means, from the source that defines it:** the stored adverse
status has **no usable evidence behind it** — every adverse edge is a modality defect,
which NEW2 adjudicated as *not a treatment at all*. It is distinct from
`review_required`, and the distinction is load-bearing:

- `review_required` — *a later court may have done something and we cannot confirm
  what.* Genuine ambiguity about the law. Refusing is the cautious side.
- `evidence_defect` — *we recorded something that was never a change of status.* A
  fact about **our parser**, not about the law. A defect in our own parsing must
  **subtract a warning, never add a prohibition.**

**Binding on RCC:**

- `evidence_defect` **must not** select a relationship verb, and must not be rendered
  as set aside, overruled, doubted, or any statement about what a court did.
- RCC's stated fallback — an unknown value selects no specific verb and falls back to
  neutral later-judgment copy — is **correct and is now the contract** for this value.
  Nothing needs to change in the client for it to be truthful today; this amendment
  makes the value *known* rather than *unknown*.
- The **open-ended rule stands and is restated as binding**: `precedentialEffect` is a
  string field whose value set may grow additively. A client must always have a safe
  path for a value it does not know, and **widening the enum from server source alone
  remains forbidden** — RCC was right to refuse. The enum widens here, in the
  contract, or not at all.
- `overruledStatus` is **unchanged**: still four values, still the only value that may
  drive a banner, still read live and never cached.

---

## A6 · SAVED MATTER AUTHORITIES CARRY ONLY THE COARSE STATUS — **NOT YET RELEASED**

**Adjudicates `CCR-RCC-S2-02`.** RCC is correct on the facts.

Read from committed source (`services/api/src/matters/authorities.ts`), the authority
shape returned by `GET /matters/:matterId/authorities` and by
`POST /matters/:matterId/authorities` is:

```
authorityId · judgmentId · caseTitle · neutralCitation · reporterCitations ·
addedBy · addedAt · removedAt · verificationState · verifiedBySource ·
overruledStatus · overruledByJudgmentId · overruledByTitle ·
overruledParas · overruledNote
```

`precedentialEffect`, `canAddToMatter` and `citableForUntouchedPropositions` are
**absent** — even though the same module computes the effect and the policy on the
**write** path, where a refusal is returned as `409 AUTHORITY_SET_ASIDE`. Search and
the judgment reader both carry `precedentialEffect`; the saved-authority list does not.

**Decision: AMEND, additive, `backendOwner: LCC`, `releasedToRCC: false`.**

Amended shape — each authority gains, all optional:

```jsonc
{
  "precedentialEffect": "none",                 // the A5 value set, open-ended
  "canAddToMatter": true,                       // boolean
  "citableForUntouchedPropositions": true       // boolean
}
```

Semantics identical to the same fields on `GET /judgments/:id`: read **live, this
request**, never a value stored when the authority was saved — the same rule
`overruledStatus` already follows on this route.

**Until it lands, RCC's stated fallback is the contract and it is honest:** keep the
moved-law warning, render `Later judgment: <title>`, and **never infer set-aside,
overruling or doubt from the coarse four-value banner.** Proposition-level overruling
rendered as "Set aside in" is a legally different statement and remains forbidden by
claims register **B2c** on every platform and every surface.

**Adjudicated severity: P1, not P0** — and the reason is mechanical, not
convenience. `CONTRACT_CHANGE_CONTROL.md` §3 defines P0 as a surface that *states or
implies something false*. With RCC's fallback in force, the surface says less than the
truth, not something other than the truth. **It becomes a P0 the moment any client
renders a specific relationship verb from the coarse banner**, which is exactly what
RCC's own fallback exists to prevent. RCC's submitted P0 is preserved verbatim in the
ledger beside this adjudication.

---

## A7 · FILTERED ADMISSION IS POPULATION-SHAPED — R13 A2's SECOND BULLET IS SUPERSEDED

R13 A2 corrected R12's claim that a broad term inside a narrow filter is always
refused, and it got the direction right. **One sentence inside it is mechanically
false at HEAD and is withdrawn:**

> ~~**`courts: ["hc"]` is not narrowing.**~~

**It is narrowing. It is not narrowing enough.** That is a different statement and it
changes what the refusal screen may say.

**The mechanism, read from committed source** (`services/api/src/search/retrieve.ts`),
because the correction is only useful if RCC knows *which* lever moves:

1. The **corpus-wide lexeme gate** runs first. If the query's rarest lexeme has a
   document frequency at or below the ceiling, the query is admitted and none of the
   rest happens.
2. If the corpus-wide gate **refuses**, the request is checked for a narrowing filter.
   The filters that count are `court`, `courts`, `dateFrom`, `dateTo` and `caseType` —
   **`courts` (the category form) is among them.** A request with no filters is
   refused here, because the eligible population *is* the corpus.
3. If a narrowing filter is present, the server **counts the eligible population**,
   stopping early at a cap, using the same predicates the ranker will apply.
4. The query is **admitted** if that population is at or under the cap, and ranked
   inside a materialised fence so the structured predicates run before the text index.
   A **capped** probe proves only "at least the cap" and never admits — *unknown is
   not small*.

**The cap is 20,000 eligible documents**, derived in committed source from a 5,000 ms
admission budget at a measured 0.25 ms per eligible row.

> **Binding on RCC, and this is the whole point of the correction:** the cap is an
> **operational bound derived from a measurement on one box**, not a product promise.
> **Do not display the number 20,000. Do not describe a threshold to a user. Do not
> compute "will this be admitted" client-side.** It is stated here so RCC understands
> *why* narrowing sometimes works, and it may change without a contract revision.

**What the refusal screen may say**, unchanged in spirit from R13 and now correct in
mechanism: offer **a single named court and a shorter date range**. A court **category**
chip may be offered as a *filter*, but must **not** be presented as *the remedy for a
too-broad refusal* — measured, a category plus one month is still refused, because
every High Court is a population far above the cap.

**A named limitation, recorded rather than tuned.** Supreme-Court-wide `bail` — a
single named court, no date bound, a population the committed cost table records at
38,379 eligible documents against a 20,000 cap — **is refused, and the refusal is
truthful**: it is a genuinely broad question over a population the server has counted
and found too large to rank inside its budget. The advocate is told what to narrow.
**This is a stated limit of the lexical admission path, not a defect. Nothing in this
round tunes search, and semantic retrieval stays `INTERNAL_EXPERIMENTAL`.**

---

## A8 · `retrievalOutcome.rarestDf` — RESTATED, NOT REOPENED

R13 A1 stands. Restated here because the correction in A7 is exactly the place a
client author would reach for this field:

> **`rarestDf` is the CORPUS-WIDE document frequency of the query's rarest lexeme. It
> is invariant under `filters`. It is NOT the bound that admitted or refused this
> request, and it is NOT a measure of the filtered population.**

Measured across six scopes of one query it was identical to seventeen significant
figures — including in the two scopes that returned results.

**Binding on RCC:** it is a **corpus-wide / query-term diagnostic**. It may appear in
a developer or diagnostic surface. It may **not** be used to compute or phrase any
user-facing narrowing hint, coverage statement, or "your narrowed search is still too
broad" message. Use `emptyBecause` and `degraded[]`, which describe *this* request.

`RAREST_DF_STATE = SEMANTIC_CONTRACT_AMEND_CLOSED`. Not reopened in R14.

---

## WHAT DID NOT CHANGE

Restated because an amendment is where things get quietly widened:

- **`contract: 1`, `minSupportedContract: 1`.** See §0.
- The envelope, auth codes, `201` on creates, and the `403 PROFILE_INCOMPLETE`
  distinction — **unchanged**.
- `degraded[]`, `emptyBecause`, `page`, `total`, `unpopulatedCourtCategories` —
  **unchanged**. `party_name_disabled` is a `degraded` value the vocabulary already
  had to be able to carry.
- The degraded-state rendering table — **unchanged and still binding**.
- The three citation fields (`verificationState`, `verifiedBySource`,
  `overruledStatus`) — **unchanged**, still three fields, still rendered from the DB
  row, still never one enum. `overruledStatus` is still read live at render on every
  surface and is never cached.
- The six monitoring fields still serve `null` / `never_attempted`. **No polling
  frequency and no SLA may appear anywhere.** Nothing in R14 moves monitoring one step
  closer to shipping.
- **No web capability is enabled by this amendment.** `platform=web` is a *selector
  the server accepts*; it is not evidence that an advocate web client exists. See
  `V1_CAPABILITY_REGISTRY_R14.json`.
- **`treatment_provenance` is still not on the wire.** `CCR-2026-08-30-05` remains
  DEFERRED to Gate C with its named interim behaviour.
