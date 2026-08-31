# NEW3 — CROSS-SURFACE `overruledStatus` ADJUDICATION

**Lane:** NEW3. **Owner:** NEW3. **Filed:** 31 August 2026.
**Contract revision:** `R14` — **no R15 is created by this record.**
**Ledger row:** `CCR-NEW3-XS-01` in `CONTRACT_CHANGE_LEDGER.json`.
**Trigger:** LCC reported that the judgment reader and the saved-authority list
appear to disagree about the same judgment's treatment status.
**Measured at HEAD** `6f0d96bfee9ccfea1be85fb768fc9f1c82f9f336`.

LCC's severity conclusion is **not inherited**. Every field name, every value and
every population below was read from committed source or counted against the live
database in this session.

---

## 0 · REANCHOR — what was true when this adjudication started

```text
HEAD_START                        = 6f0d96bfee9ccfea1be85fb768fc9f1c82f9f336
CURRENT_CONTRACT                  = R14   (RCC_V1_API_CONTRACT_R14_AMENDMENT.md)
SAVED_AUTHORITY_LCC_IMPLEMENTED   = YES   (24cf3623)
SAVED_AUTHORITY_RELEASED_TO_RCC   = YES   (31 Aug 2026, bus 1628)
SAVED_AUTHORITY_RCC_CONSUMED      = YES   (6f0d96bf, bus 1629 — newly true this session)
PARTY_IOS_OVERRIDE_ACTIVATION     = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
ADVOCATE_WEB_PUBLIC_CAPABILITY    = DISABLED_NOT_READY
```

`RCC_CONSUMED` moved from `NO` to `YES` between the R14 A6.1 release seal and this
adjudication. That matters to the outcome and is the reason this is decided now
rather than at the release: the client half of the answer only came into existence
at `6f0d96bf`.

---

## 1 · THE DIFFERENCE, REPRODUCED INDEPENDENTLY

The difference is real, and it is **narrower and more specific** than "the two
surfaces disagree". It is one field name carrying **two different layers of the
OD-14 model** depending on which route serves it.

### 1.1 What each surface serves — read from committed source at HEAD

| route | `overruledStatus` is | source line |
|---|---|---|
| `GET /judgments/:id` | **derived** — `precedentialPolicy(effect).bannerStatus` | `services/api/src/judgments/route.ts:402` |
| `POST /search`, `POST /search` (semantic arm) | **derived** — `.banner` | `services/api/src/search/route.ts:557`, `:614` |
| `GET /briefings/...` | **derived** — `policy.bannerStatus` | `services/api/src/briefings/route.ts:255` |
| `GET\|POST /matters/:matterId/authorities` | **stored** — `j.overruled_status`, joined live | `services/api/src/matters/authorities.ts:187` |
| `GET /saved-searches/:id/feed` | **stored** — the raw `hybridSearch` hit | `services/api/src/search/saved.ts:292` |

The three derived surfaces **also** serve the stored value, under a **different
name**: `overruledStatusStored` (`judgments/route.ts:403`, `search/route.ts:558`,
`:615`, `briefings/route.ts:257`).

**The saved-authority route serves no `overruledStatusStored`.** So on that one
route the stored value occupies the derived value's name, and the derived value
has no name at all — its only representation is the three R14 A6 policy fields.

### 1.2 The mechanism that makes the two values differ

`precedentialEffectFromEdges` (`precedential-effect.ts:414`) returns
`evidence_defect` when a stored adverse status is backed **only** by
`MODALITY_DEFECT` edges (`:429–431`). `precedentialPolicy` then returns
`bannerStatus: 'none'` for that effect (`:569`, `:589`) — deliberately, because
our own parser's mistake must subtract a warning rather than assert a change in
the law that never happened.

So for `evidence_defect`: **stored is adverse, derived banner is `none`.**

The derivation can also move the other way — `review_required` and an edge graver
than the stored status both raise `bannerStatus` **above** the stored value. That
class is enumerated in §2.3 and measured at zero.

```text
JUDGMENT_READER_STATUS_SEMANTICS = DERIVED_BANNER_TREATMENT_STATE
                                   (policy.bannerStatus; stored value served
                                    beside it as `overruledStatusStored`)
SAVED_AUTHORITY_STATUS_SEMANTICS = STORED_INGESTION_OBSERVATION
                                   (j.overruled_status, joined live per request;
                                    no `overruledStatusStored` on this route)
SAME_LEGAL_FACT_DIFFERENT_VALUE  = YES
```

### 1.3 The live population — counted, not estimated

Every judgment with a non-`none` stored status, run through the committed
derivation in SQL against the live database this session
(`judgments` × `judgment_citations`, `MODALITY_DEFECT` filter, `EDGE_RANK`
1/2/3 as `precedential-effect.ts:311`):

| stored | derived effect | derived banner | judgments |
|---|---|---|---|
| `set_aside` | `overruled` | `set_aside` | 72 |
| `doubted` | `doubted` | `doubted` | 17 |
| `partly_set_aside` | `overruled_in_part` | `partly_set_aside` | 8 |
| **`set_aside`** | **`evidence_defect`** | **`none`** | **1** |

**98 judgments carry a non-`none` stored status. 97 have banner == stored.
Exactly one diverges.**

```text
id               f83d0700-eaf5-4075-9744-2e20faacedc9
case             DIVISIONAL PERSONNEL OFFICER, SOUTHERN RAILWAY & ANR.
                 versus T. R. CHALLAPPAN
citation         1975 INSC 212
stored           set_aside
adverse edges    1        usable adverse edges  0
derived effect   evidence_defect
derived banner   none
saved to live matter authorities, right now   0
```

This is the instance `precedential-effect.ts:266–271` already names in prose. The
count confirms the prose and adds what the prose could not: **it is the only one,
and it is currently in nobody's matter.**

---

## 2 · AUTHORITATIVE SEMANTICS — the three layers are not one answer

### 2.1 The layers, and which field carries which

`precedential-effect.ts` separates them permanently (OD-14, resolved 21 Aug 2026):

| layer | question | field on the wire |
|---|---|---|
| 1 · stored ingestion observation | what our corpus recorded | `overruledStatus` on `/matters/.../authorities`; `overruledStatusStored` elsewhere |
| 2 · derived precedential effect | what actually happened to the law | `precedentialEffect` (eight values, R14 A5) |
| 3 · user-facing treatment / banner | what Lawmind shows and refuses | `overruledStatus` on the reader, search and briefings; `canAddToMatter`, `citableForUntouchedPropositions` |

**They should not all have the same value, and requiring them to would reintroduce
the bug OD-14 fixed.** Layer 1 is a fact about our record. Layer 3 is a decision
about what to show. A defective layer-1 row is exactly the case where layer 3 must
say less than layer 1 does.

### 2.2 What R14 actually promises for `overruledStatus`

R14 is thin here, and this is the substantive governance finding.

- R14 §WHAT DID NOT CHANGE: *"The three citation fields … unchanged, still three
  fields, still rendered from the DB row … `overruledStatus` is still read live at
  render on every surface and is never cached."*
- R14 §A5: *"`overruledStatus` is **unchanged**: still four values, still the only
  value that may drive a banner, still read live and never cached."*
- R14 §A6 adds the three policy fields to the saved-authority shape and says
  nothing at all about which layer that route's `overruledStatus` carries.

**Read together, R14 promises four values, live-read, banner-driving — and never
states that the value differs by route.** A client author reading only R14 would
reasonably conclude the field means the same thing everywhere. It does not.

So the difference is **neither a documented compatibility distinction nor a
deliberate one recorded anywhere a client can read.** It is an undocumented
route-dependent meaning that happens to be safe.

### 2.3 Do the R14 A6 fields already carry the authoritative live truth?

**Yes for the saved-authority route, and that is what makes the difference
survivable.** `precedentialEffect` + `canAddToMatter` +
`citableForUntouchedPropositions` are derived live from the same
`precedentialEffectFromEdges` → `precedentialPolicy` pair the reader uses
(`authorities.ts:114–123`, `:271–274`, `:350–354`). A client holding those three
can reconstruct layer 3 completely.

**Two gaps remain, and both are recorded rather than smoothed over:**

1. **`bannerStatus` itself is not on the saved-authority wire.** A client must
   re-derive it from `precedentialEffect`, which is precisely the "resolve it
   yourself" shape R14 A4.6 withdrew for capabilities. It works today only
   because the single divergent value (`evidence_defect` → banner `none`) is one
   the client can special-case in one line, and RCC did (§3.1).
2. **The banner-upgrade class is unrepresented.** Where a graver edge or
   `review_required` raises the derived banner **above** the stored value, the
   saved-authority route would under-state the warning and the client could not
   tell. **Measured at HEAD: zero rows.** It is latent, not current — see §4.2.

`GET /saved-searches/:id/feed` has neither: it serves the stored value **and no
`precedentialEffect` beside it**, so a consumer has no reconstruction path at all.
No client consumes that route (grepped across `apps/mobile/src`; only
`TodayScreen.tsx` mentions a feed, and in a comment saying it is not one), and it
is not a v1 capability (`V1_CAPABILITY_REGISTRY_R14.json` carries no saved-search
row). Recorded for LCC in §5, not counted against v1.

---

## 3 · USER-TRUTH TEST

> Can an advocate viewing the same saved authority and the same judgment receive
> two apparently contradictory claims about its present legal treatment?

**No — on the released client, as of `6f0d96bf`. Observed, not assumed.**

### 3.1 The client compensation, read and executed

`apps/mobile/src/screens/matter/MatterScreen.tsx:521–522` — the only surface in
the app that renders a `MatterAuthority` (grepped: `MatterAuthority` appears in
`MatterScreen.tsx` alone outside the contract and tests):

```tsx
// An evidence defect is our parser's mistake, not moved law.
// R14 requires no banner and no prohibition for that value.
overruledStatus:
  a.precedentialEffect === 'evidence_defect' ? 'none' : a.overruledStatus,
```

That value is what reaches `citationRender`, so the LAW MOVED chip, the danger
band and the strikethrough are all suppressed for `evidence_defect` — matching the
judgment reader exactly. `treatmentRelationshipCopy` independently refuses to
select a verb for that value (`treatmentRelationship.ts`, `evidence_defect` shares
the neutral `Later judgment: <title>` arm), so the later judgment stays visible
without a legal claim attached to it.

**Executed at HEAD:** `npx jest src/screens/matter/MatterScreen.authorities.test.tsx`
→ **16 pass, 0 fail**, including *"removes a parser-defect warning while keeping
the later judgment visible neutrally"*, which asserts
`Later judgment: …` is present and both `Doubted` and `Doubted in …` are absent.

### 3.2 Classification

```text
USER_TRUTH_CLASSIFICATION = INTERNAL_ONLY_DIFFERENCE
```

**Stated honestly, with its load-bearing qualification:** it is internal only
because **the client compensates for it**, not because the contract distinguishes
the two meanings. Nothing in R14 obliges RCC to keep those two lines. A future RCC
author reading R14 alone would find them redundant — R14 says `overruledStatus` is
the banner value, and by that reading the override is dead code. Deleting it would
convert this to `CURRENT_FALSE_OR_CONTRADICTORY` on the next release, silently.

That is the actual risk in this finding, and it is a **documentation** risk, not a
wire-shape one.

### 3.3 Why it is not `CURRENT_FALSE_OR_CONTRADICTORY`

No advocate can reach a contradiction at HEAD:

- one divergent judgment exists corpus-wide, and it is saved to zero live matters;
- the one surface that could show it neutralises it, with a committed passing test;
- the divergence direction for `evidence_defect` is **warning-subtractive** — the
  raw value would show a LAW MOVED mark that the truth does not support. It cannot
  hide a moved-law warning. The stale-overruled threshold of zero is not touched.

### 3.4 Why it is not `COMPATIBILITY_FIELD_BUT_CLEARLY_DISTINGUISHED`

The distinction is not stated in R14, in `V1_CAPABILITY_REGISTRY_R14.json`, or in
any committed test. `matters/authorities.test.ts:559–589` covers `evidence_defect`
and deliberately asserts `precedentialEffect`, `canAddToMatter` and
`citableForUntouchedPropositions` — and **not** `overruledStatus`, the one field
that would pin which layer this route serves. The client-side type
(`contract.ts:1342`) types it as the same `OverruledStatus` union used everywhere
else, with no note.

**Nothing distinguishes it. This record does.**

---

## 4 · CHANGE-CONTROL DECISION

```text
DECISION     = DEFER
NEW_REVISION = none — R14 remains current
```

### 4.1 Why not `AMEND`

`CONTRACT_CHANGE_CONTROL.md` §3: a **P0** is a surface that *states or implies
something false*. No released surface does. §3 also holds that a P0 is never
deferred — which is the test this finding must pass to be deferrable, and it
passes: **this is a P1.**

An AMEND would increment the contract for a change that (a) no advocate needs
today, (b) NEW3 cannot implement — the fix lives in `services/**` — and (c) would
land a semantic change on a field RCC consumed hours ago. R14's own A4.0 records
what happens when the contract and the implementation move in the wrong order;
repeating it here to tidy a naming inconsistency would be the same mistake for a
smaller reason. **No R15.**

### 4.2 Why not `NO_CHANGE`

Two things are genuinely owed and neither is cosmetic:

1. **The contract is unclear** — §2.2. `NO_CHANGE` with a documentation note is
   permitted by §4 of the mandate *"if current behavior is truthful because the
   fields have explicitly different semantics"*. They are not explicit. This
   record makes them explicit, which is the work; DEFER names the remaining
   cleanup rather than declaring it absent.
2. **The banner-upgrade class is latent** — §2.3 gap 2. Zero rows today because
   every stored status in the corpus matches its edge's rank (the OD-14 census of
   21 Aug found the same, from the other direction: *"not one row disagrees with
   its edge"*). Nothing structurally prevents a future ingest or a
   `propagate-treatment` backlog from producing one, and on that day the
   saved-authority list would under-state a warning the reader shows. That is the
   direction `CITATION_HARNESS.md` rates as severe as a hallucination.

### 4.3 The DEFER, with its exact reason and its exit condition

```text
DEFER_REASON = Released client truth is safe and observed safe (16/16 tests at
               6f0d96bf). The divergent population is one judgment, saved to zero
               live matters, and its divergence subtracts a warning rather than
               hiding one. What is owed is a naming/representation cleanup and a
               guard against a latent class with zero current rows — neither of
               which any advocate is waiting on.

DEFER_CONVERTS_TO_AMEND WHEN ANY OF:
  (1) any judgment appears whose derived bannerStatus is GRAVER than its stored
      overruled_status — the banner-upgrade class, currently zero rows;
  (2) any client other than MatterScreen.tsx renders MatterAuthority.overruledStatus;
  (3) GET /saved-searches/:id/feed acquires a consumer or a v1 capability row;
  (4) RCC proposes removing the evidence_defect override at MatterScreen.tsx:521.

RECONSIDERED_AT = Gate C, 18 September 2026, and immediately on any of the four.
```

### 4.4 The correction, specified now so the future AMEND is mechanical

Not a revision, and it creates none. Recorded so nobody re-adjudicates this.

```text
PREFERRED  serve `overruledStatus = policy.bannerStatus` on
           GET|POST /matters/:matterId/authorities, and add
           `overruledStatusStored = j.overruled_status` beside it — making the
           route identical to judgments/route.ts:402-403, search/route.ts:557-558
           and briefings/route.ts:255-257.

WIRE       ADDITIVE for `overruledStatusStored`. For `overruledStatus` it is a
           VALUE change within an unchanged four-value type on one route: one
           judgment moves `set_aside` -> `none`. Not a shape change, not a
           removal, not a narrowing.
WIRE_PROTOCOL_VERSION stays 1. minSupportedContract stays 1.

RCC        NO CHANGE REQUIRED, before or after. The override at
           MatterScreen.tsx:521-522 becomes a no-op rather than wrong, because
           the server would already have sent `none`. It must NOT be deleted as
           part of the change — see §5 RCC handoff.

TEST       the correction must land with a committed test that pins WHICH LAYER
           the route serves, which no test does today: an evidence_defect
           authority whose listed `overruledStatus` is asserted equal to `none`.
```

---

## 5 · HANDOFFS

Only the lanes the decision actually requires. **Neither handoff asks for a
change now.**

### `LCC_HANDOFF` — record, no work scheduled

> Your cross-surface report is CONFIRMED on the facts and adjudicated **DEFER,
> P1, no R15**. The difference is one field name carrying two OD-14 layers:
> `overruledStatus` is `policy.bannerStatus` on `judgments/route.ts:402`,
> `search/route.ts:557`/`:614` and `briefings/route.ts:255`, and the raw
> `j.overruled_status` on `matters/authorities.ts:187` — which is also the only
> one of the four serving no `overruledStatusStored`. Live census at HEAD: 98
> judgments carry a non-`none` stored status, 97 have banner == stored, and the
> single divergence is `1975 INSC 212` (T. R. Challappan, `evidence_defect`,
> stored `set_aside`, banner `none`), saved to zero live matters. **Do not change
> the route now.** The correction is specified in §4.4 for when the DEFER
> converts; it is preferred over the alternative because it makes this route
> identical to the other three. Two items for your record, neither scheduled:
> (1) `search/saved.ts:292` serves the raw stored value with **no
> `precedentialEffect` beside it**, so a consumer has no reconstruction path —
> unconsumed and not a v1 capability today, and it must not ship without
> deriving; (2) `matters/authorities.test.ts:559–589` covers `evidence_defect`
> without asserting `overruledStatus`, so no committed test pins which layer this
> route serves. R14 stays current. The party-name override stays
> `BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`.

### `RCC_HANDOFF` — one line is contract-load-bearing; do not remove it

> Your R14 A6 consumption at `6f0d96bf` is verified and it is the reason this
> adjudication is `INTERNAL_ONLY_DIFFERENCE` rather than a defect:
> `MatterScreen.tsx:521–522` maps `precedentialEffect === 'evidence_defect'` to
> `overruledStatus: 'none'` before `citationRender`, and
> `MatterScreen.authorities.test.tsx` holds it — **16 pass, 0 fail, run at HEAD.**
> **That override is CONTRACT-LOAD-BEARING and must not be deleted as redundant.**
> R14 says `overruledStatus` is the banner value; on
> `GET|POST /matters/:matterId/authorities` it is the **stored** value instead,
> and R14 does not say so. Until §4.4 lands server-side, your two lines are the
> only thing keeping the matter list and the judgment reader in agreement.
> **No RCC change is requested and none is required** — before or after the
> server correction, at which point the override becomes a harmless no-op.
> A generalisation worth carrying: on the saved-authority route, derive treatment
> from `precedentialEffect` and never from `overruledStatus` alone.

---

## 6 · CLAIM STATE — preserved, not reopened

```text
ADVOCATE_WEB_PUBLIC_CAPABILITY = DISABLED_NOT_READY
ADVOCATE_WEB_SCOPE             = IN_V1
PARTY_IOS_OVERRIDE_ACTIVATION  = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
PARTY_DEFER_STATE              = INTACT
ENABLED_WITHOUT_EVIDENCE       = 0
UNSUPPORTED_CLAIMS             = 0
```

No capability changes state. No claim is added, changed or authorised. No
capability registry row moves. No OPEN_DECISION is touched — this adjudication
sits entirely inside OD-14, which was **resolved** 21 August 2026, and decides
nothing OD-14 left open.

---

## 7 · LIMITS OF THIS ADJUDICATION

Stated because their absence would be the red flag.

- **The route-layer mapping was read from committed source, not observed by
  executing the API.** Each half is a single literal assignment
  (`authorities.ts:187`, `judgments/route.ts:402`) and both were read at HEAD, but
  no request was issued against a running app in this session. The *data-layer*
  divergence **was** executed — the §1.3 census ran against the live database.
- **The census reproduces the committed derivation in SQL rather than calling
  it.** `MODALITY_DEFECT` filtering, `EDGE_RANK` 1/2/3, the storedRank comparison
  and the policy table were transcribed from `precedential-effect.ts`. A
  divergence between the transcription and the module would not have been caught.
  The single row it found is independently corroborated by the module's own prose
  (`:266–271`) naming that exact judgment.
- **The server test suite was not run.** It writes to append-only tables and this
  session must preserve running background workers. Only the RCC jest file was
  executed.
- **`GET /saved-searches/:id/feed` was assessed as unconsumed by grepping the
  mobile client.** A consumer outside `apps/mobile/src` would not have been seen.
- **The banner-upgrade class is measured at zero, not proven impossible.** §4.2.
