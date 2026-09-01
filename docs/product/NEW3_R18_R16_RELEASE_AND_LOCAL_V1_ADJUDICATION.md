# NEW3 R18 — R16 CLIENT-CONSUMPTION AUTHORIZATION, AND THE REMAINING LOCAL-V1 LEDGER

**NEW3, 2 September 2026.** Anchored on `HEAD = 13f558d1`.
Required ancestry verified before any decision: `13f558d1`, `be25a95b`,
`2e6c148a` are all ancestors of HEAD.

This round does **not** release R16. It creates the lifecycle state that was
missing, disposes six bus items, and records the exact remaining local-v1
blockers.

## 0 · Revision identity — unchanged by this round

```text
CONTRACT_REVISION                 = R16
WIRE_PROTOCOL                     = 1
WIRE_BREAKING_CHANGE              = NO
MIN_SUPPORTED_CONTRACT            = 1
R16_RELEASED                      = NO
R16_CLIENT_CONSUMPTION_AUTHORIZED = YES      ← new in this round
PAID_REMOTE_INFRA_AUTHORIZED      = NO
```

No R17 was opened. Implementation lifecycle is not a wire change and must not be
represented as one.

---

## 1 · Bus disposition

Each item is classified from committed source and, where the claim was
measurable, from a measurement taken in this round. Newer code alone was not
accepted as a reason to close anything.

| bus | from | classification | reason |
|---|---|---|---|
| 1696 | LCC | **ACKED** | R16 backend independently re-verified in this round — schema, index, trigger and foreign keys read live from the database, and the 23-test conformance suite re-run to 23 pass / 0 fail / **0 skipped**. See §2. |
| 1695 | RCC | **ACKED** | Both cadence sites independently confirmed closed (§8). The three questions it handed back — `/s/[slug]`, iOS party default, Apple toolchain — are adjudicated here in §6, §5 and §7. |
| 1693 | RCC | **ACKED** | Physical-device P0 closed at `cc5a373f`, with the mechanism corrected rather than asserted. Nothing was asked of NEW3 and nothing is owed. The `AuthBoundary`-starves-the-router finding is recorded as a durable architectural fact, not a one-off fix. |
| 1679 | RCC | **SUPERSEDED** | Adjudicated by `NEW3_POST_R15_ACCEPTANCE_DELTA_R16.md` at commit **`5e0eb8c1`**, which cites `8f6b7e4` throughout. No part of 1679 is outstanding. |
| 1682 | LCC | **DEFERRED** | Its factual claims were **re-measured and reproduce exactly** (§9). The release decision it asks for is deferred because `statute.linked_judgments` is POST_V1 for local-v1 and has no current-v1 surface; deferral is a scheduling answer, not a doubt about the evidence. |
| 1686 | RCC | **SUPERSEDED, with one explicit ACK** | Its two hand-backs are both closed by later adjudicated work: the nightly cadence copy by bus 1692 → executed at **`8692bfb9`**, and the annotation idempotency gap by R16 → implemented at **`e325ed9f`**. Its one open product question — the `disposed`/`archived` definitions — is **ACCEPTED AS WRITTEN**, see §1.1. |

### 1.1 · `disposed` / `archived` — RCC's definitions stand

RCC took a product decision it could not ship without and asked to be overruled
if it was wrong. It is not wrong.

```text
DISPOSED  the court is finished with it. A fact about the case.
ARCHIVED  you are finished with it. A fact about your desk.
```

Adopted verbatim as the v1 meaning. The two states stay separate for exactly the
reason given: a matter can be archived without being disposed and disposed
without being archived. `CITATOR_ALERT_REGRESSION = NO` is the correct call and
is now a rule rather than an implementation detail — **an authority saved inside
an archived matter is still alerted on**, because the law moving is a fact about
the authority and archiving is a fact about the desk.

The design pack's third option, "On hold", is **refused**. It is not a state this
product has, and adopting a drawn control that widens an enum is a contract
change nobody filed.

---

## 2 · R16 backend acceptance — independently verified

```text
R16_BACKEND_ACCEPTANCE = PASS
```

LCC's report was not accepted as evidence of itself. What follows was observed
in this round.

### 2.1 · The database, read live

```text
api_idempotency_records                    PRESENT
api_idempotency_records_scope_key_unique   UNIQUE (user_id, method, route, idempotency_key)
api_idempotency_records_complete_at_commit TRIGGER DEFERRABLE INITIALLY DEFERRED
foreign keys                               user_id -> users(id)   ...and no others
```

The single foreign key is the whole of `CANONICAL_LEGAL_DATA_COUPLING = NONE`.
It is not a claim in a report; it is what `pg_constraint` returns.

### 2.2 · The conformance suite, re-run

```text
tests 23 · pass 23 · fail 0 · cancelled 0 · skipped 0
```

`skipped 0` is the load-bearing number. The suite guards every test with
`skipUnlessMigrated`, so a database without migration 0100 would have printed a
clean run of nothing. It did not skip, so the tests executed against a migrated
database.

### 2.3 · Requirement by requirement

| requirement | verified by |
|---|---|
| one generic ledger | `idempotency.ts` has one table and one wrapper; no per-domain column was added |
| all six current-v1 creates | read out of `app.ts`: annotations, matters, matter events, data requests, verify/confirm, training consent — six `withIdempotency` mount sites, each naming its canonical route template explicitly |
| principal scoping | index column `user_id`; test **L** proves one principal cannot replay, collide with or observe another's key |
| HTTP method scoping | index column `method`. **No behavioural test exists**, and none can: all six routes are POST, so there is no second method to collide with. Accepted as structurally unreachable, not as tested — §2.4 |
| canonical route scoping | index column `route`; test **M** — the same raw key on a different route does not collide |
| request fingerprinting | SHA-256 over `{method, route, params, query, body}` with keys sorted at every depth; tests **C2** (order/whitespace) and **E** (significant query) |
| same key + same request replay | tests **A** and **H**, both counting durable rows, not response equality |
| same key + different request → 409 | tests **C** (body) and **D** (path parameter) |
| concurrent same key | tests **B** (two overlapping executors, 618 ms), **B2** (six), and the wait-budget test observing `Retry-After: 1` at 2,121 ms |
| legacy no-key behaviour | test **J** — two creates, two matters, zero ledger rows. The wrapper returns before opening a transaction |
| lost-response retry safety | tests **A** and **H** |
| transactional coupling | test **G** (a handler that dies before commit) and the deferred-trigger test (the database refuses a record that would commit without its result) |
| erasure | `eraseUser` deletes by `user_id`; the erasure census asserts GONE |
| no canonical legal-data coupling | §2.1 |

### 2.4 · The two gaps LCC named, adjudicated

Both were self-reported. Both are accepted, and neither is a defect.

1. **R16 §1 "surrounding whitespace is rejected" is untested.** The Headers API
   strips leading and trailing whitespace before dispatch, so no client can
   produce a padded value for the server to refuse. The clause is not withdrawn —
   it states the intended semantics, and the implementation's `\x21-\x7e` class
   enforces it regardless. Interior whitespace, which the transport preserves,
   **is** refused and **is** tested. `WHITESPACE_CLAUSE = SEMANTICALLY_SATISFIED,
   TRANSPORT_UNREACHABLE`. Asserting a behaviour the transport makes unreachable
   would have been the wrong answer, and LCC was right to say so rather than
   fake it.
2. **Method scoping has no behavioural test.** Same shape: the column is in the
   unique index, and every scoped route is POST. Recorded so that the first
   non-POST scoped route inherits the obligation rather than the silence.

### 2.5 · Naturally idempotent operations, unchanged

```text
POST /matters/:id/authorities   live (matter_id, judgment_id) partial unique index  UNCHANGED
POST /citations/copies          UNIQUE (user_id, client_key)                        UNCHANGED
```

Neither appears in `e325ed9f`'s file list. Neither gained a second mechanism.
`clientKey` keeps its own identity and must not acquire a header.

---

## 3 · The circular dependency, broken by naming the missing state

Bus 1697 told RCC not to consume R16 while `RELEASE_STATE = UNRELEASED`. R16 §6
makes final release depend on client evidence. So the release could not happen
until the client implemented, and the client could not implement until release.

That is not a conflict between two rules. It is one lifecycle expressed as two
values when it needs three, and the fix is the third value — not a premature
release, and not a new contract revision.

```text
R16_BACKEND_ACCEPTANCE            = PASS
R16_CLIENT_CONSUMPTION_AUTHORIZED = YES
R16_RELEASED                      = NO
```

What each one means, exactly:

* **`R16_CLIENT_CONSUMPTION_AUTHORIZED = YES`** — the backend contract is
  accepted as conformant. RCC may implement and test the `Idempotency-Key`
  header against it now. The wire shape will not move underneath that work; if
  it ever needs to, that is a new adjudicated revision and RCC is told first.
* **`R16_RELEASED = NO`** — R16 is not product-current. No release note, no
  store copy, no capability row, no claim anywhere states that duplicate-safe
  writes are a property of this product. Until final acceptance, a shipped build
  may carry the code and may not carry the promise.

Final release still requires RCC implementation evidence and a NEW3 final
acceptance. This authorization moves the gate, not the guarantee.

Bus 1697's DO-NOT-CONSUME condition is **superseded for implementation and
testing only** by the handoff published this round.

---

## 4 · Idempotency retention

```text
IDEMPOTENCY_RETENTION_CLASS = C_SPRINT4_PRIVACY_OPERATIONS_ITEM
```

Not a release blocker, and not acceptable-as-is either.

**Why it is not a blocker.** The design has no `in_progress` row, so there is no
stale claim to reap and nothing that breaks by being kept. Correctness does not
degrade with age: an old record simply replays an old result to a client that has
long since discarded the key. `eraseUser` deletes the table by `user_id` and the
erasure census asserts GONE, so the one privacy obligation with a deadline —
account closure — is already met. Current-v1 write volume across six creates,
none of them high-frequency, is small.

**Why it is not `D`.** The stored `response_body` is the success envelope, and
for an annotation or a matter that envelope carries the advocate's own words —
matter titles, party names, note text. That is sensitive-class content held for
an unbounded period with no stated purpose beyond a retry horizon measured in
minutes. Backups extend it further. "We keep your notes forever in a retry
ledger" is not a sentence this product's privacy policy currently supports, and
it is not one an advocate would expect.

**Why it is not `E`.** No counsel question is open here. The existing policy
position — collect what the product needs, keep it while the purpose lasts — is
sufficient to say the purpose lasts hours, not years.

```text
IDEMPOTENCY_RETENTION_REQUIREMENT = SEMANTIC, NOT A NUMBER
```

The requirement, stated as semantics only, for Sprint 4 to satisfy:

1. A retention bound must exist and must be **derived from the real client retry
   horizon** — the longest interval over which a client may still legitimately
   replay a key — plus a stated safety margin. It must not be copied from another
   company's published TTL.
2. Expiry must **delete the stored response body**. Retaining the fingerprint
   after expiry is permitted and is the cheaper half; retaining the advocate's
   words is the half with a cost.
3. A key whose record has expired must behave as a **new key**, never as a
   mismatch. An expired replay that answers `409` would be a worse failure than
   the duplicate the mechanism exists to prevent.
4. The bound must be **documented in the privacy surface** in the same terms as
   every other retention period, not left as an implementation constant.
5. Backup retention must be stated, not assumed to inherit.

`LCC_RETENTION_HANDOFF = ISSUED_AS_SPRINT4, NOT_NOW`. LCC must not invent a TTL
in the meantime. The absence of one is a recorded decision, not an oversight.

---

## 5 · `POST /matters` — `parties`

```text
MATTERS_PARTIES_CLASSIFICATION = A_API_IMPLEMENTATION_BUG_CONTRACT_ALREADY_STRUCTURED
MATTERS_PARTIES_RUNTIME_SHAPE  = JSON-ENCODED STRING SCALAR, on write AND on every read
MATTERS_PARTIES_CONTRACT_SHAPE = record  (R12 §1.7; request schema z.record(z.string(), z.unknown()))
MATTERS_PARTIES_RCC_EXPECTATION= object  ({ description: string })
CONTRACT_CHANGE_REQUIRED       = NO
MATTERS_PARTIES_SEVERITY       = P1
```

### 5.1 · It is worse than the defect LCC reported

LCC reported a `POST /matters` **response** shape. Measured in this round
against the real routes, sending exactly what
`apps/mobile/src/screens/matter/NewMatterScreen.tsx` sends:

```text
POST /matters      201   parties typeof = string   parties.description = undefined
GET  /matters/:id  200   parties typeof = string   parties.description = undefined
GET  /matters            200   parties typeof = string
stored column            jsonb_typeof(parties) = string
```

The response is not the defect. **The stored value is.** `matters/route.ts`
writes `${JSON.stringify(body.parties)}::jsonb`, and postgres.js JSON-encodes a
JS string parameter, so the column holds a jsonb **string scalar** rather than an
object. Isolated and reproduced directly:

```text
JSON.stringify(obj)::jsonb  ->  jsonb_typeof = string
sql.json(obj)               ->  jsonb_typeof = object
```

Every read path returns `r.parties` verbatim, so `GET /matters` and
`GET /matters/:id` are wrong too, for every matter the current server has ever
created. This is a persistence defect wearing a serialization defect's clothes.

### 5.2 · What an advocate sees

`apps/mobile/src/screens/matter/MatterScreen.tsx:369` renders
`{matter.parties.description} · for the {matter.ourSide}`. Against a string,
`.description` is `undefined`, which React renders as nothing. There is no crash
and no error state. The line reads ` · for the accused` and **the parties are
silently gone** from the matter workspace — the retention moat, on the screen
whose entire job is to say which case this is.

Silence in place of the advocate's own case identity is the failure mode this
product treats most seriously everywhere else.

### 5.3 · Why the contract does not move

R12 §1.7 already specifies `parties` as a record, and the request schema already
validates one. The runtime violates a contract that is already structured.
Conforming an implementation to an existing contract is not a contract change,
and changing the contract to describe the bug would bless it. `CONTRACT_REVISION`
stays `R16`; `WIRE_PROTOCOL` stays `1`.

RCC's `{ description: string }` is RCC's chosen key inside an unconstrained
record, as its own type comment says. It is not a contract LCC enforces and it
does not need to become one. Nothing about this defect requires RCC to change.

### 5.4 · Blocking

```text
MATTERS_PARTIES_BLOCKS = FINAL_LOCAL_V1_ACCEPTANCE
  blocks RCC R16 implementation ....... NO   (independent surfaces)
  blocks final local-v1 acceptance .... YES
  blocks remote alpha ................. YES  (by inheritance)
```

P1, not P0: no citation is falsely verified, no authority is misrepresented and
no law is claimed to have moved or not moved. It is data integrity on a
current-v1 core surface.

### 5.5 · The fix, and the half that is not the fix

`LCC_PARTIES_HANDOFF = ISSUED, P1`

1. Write with `sql.json(...)`, never `JSON.stringify(...)::jsonb`.
2. **Backfill the existing string-scalar rows.** A code fix alone leaves every
   matter created before it permanently broken, and the two shapes then coexist
   in one column — which is how a client comes to need a defensive parse forever.
3. Add a test that asserts the **shape**, not the round-trip. No server test
   asserts `parties` today, which is why a defect this visible survived: every
   fixture writes an object and reads back whatever came out.
4. `jsonb_typeof(parties) = 'object'` for all rows is the acceptance check.

`RCC_PARTIES_HANDOFF = NOTIFY_ONLY, NO CLIENT CHANGE`. RCC must **not** add a
defensive `JSON.parse`. A client that parses defensively today breaks on the day
the server is fixed, and it converts a loud, findable defect into a permanent
compatibility shim. The client is already correct.

---

## 6 · `/s/[slug]` — release reachability

```text
SLUG_ROUTE_CLASSIFICATION = C_INTERNAL_SCREEN_MANIFEST_TOOL
SLUG_ROUTE_DECISION       = DEV_GUARD
SLUG_ROUTE_CAPABILITY     = NONE — and that is dispositive
```

### 6.1 · What it actually is

`apps/mobile/app/s/[slug].tsx` looks up a slug in `screens/manifest.ts`. If the
slug names a built screen it redirects to the real route; otherwise it mounts
`ScreenShell`, which prints the design inventory's own `title`, `group` and
`notes` prose. Measured at this HEAD:

```text
manifest rows                     98
redirect to a real screen         17
mount ScreenShell in a release build   81
of those, carrying notes prose         54
of those, notes actually RENDERED      53
```

Eighty-one internal design-inventory entries are reachable from a release binary,
fifty-three of them printing free prose written to describe a design, not to be
read by an advocate. Sampled rows include `sign-in-enrolment-number ::
"Second frame. Enrolment number, not email"` — describing a sign-in mechanism
this product does not have, on a screen an advocate can reach.

### 6.2 · The precedent already exists in this repo

`/gallery` and `/directory` were exactly this problem and were already fixed
exactly this way: `if (!__DEV__) return <Redirect href="/+not-found" />;`.
`app/s/[slug].tsx` carries no such guard. It is the same class of surface with
the same exposure and no reason to be treated differently.

### 6.3 · Why "the current strings are now safe" is refused as a reason

RCC removed one cadence claim from row 78 and raised the general shape rather
than stopping at the instance. That was the right call and this ruling agrees
with it.

A hundred rows of internal prose that reaches production through an unguarded
dynamic route is a **standing generator of unadjudicated claims**, not a set of
strings that happens to be clean today. Every future design row is a new
production-reachable sentence written by someone documenting a mockup. Auditing
the current contents proves the current contents; it proves nothing about the
next commit.

It is worse than unaudited: **both claim audits exempt the file by name.**
`r16Surfaces.test.ts` skips `manifest.ts` by filename, so the audit that exists
to catch cadence claims was structurally incapable of catching the one that was
there. A production surface excluded from the audits that govern production
surfaces is the definition of an internal tool that escaped.

### 6.4 · Why the fix is the guard and not the exemption

Removing the exemption instead would subject a hundred-row internal design ledger
to production claims discipline forever — which would either freeze the design
inventory or corrupt it into marketing copy. The manifest should be free to say
"colour and serif superseded". It should not be able to say it to an advocate.

Guarding the route makes the exemption **correct** rather than dangerous: an
audit may legitimately skip a file that cannot reach production.

### 6.5 · Not a product surface, and the test that decides it

There is no capability row for a screen inventory, no `V1_SURFACE` entry, and no
acceptance evidence. By NEW3's own standing rule that settles it: a surface with
no capability row and no acceptance evidence is not current product, whatever it
renders.

`RCC_SLUG_HANDOFF = ISSUED, P1` — add the `__DEV__` guard, matching `/directory`
exactly, and add a test asserting the guard rather than asserting the current
strings. The manifest itself is not to be edited for this; its prose is fine
where it belongs.

---

## 7 · iOS party-name search

```text
IOS_PARTY_SEARCH_CURRENT  = ON, BY INHERITANCE
IOS_PARTY_SEARCH_DECISION = A_ACTIVATE_IOS_OFF_NOW
PARTY_IOS_OVERRIDE_ACTIVATION = UNBLOCKED — the guard's six-step sequence is complete
```

### 7.0 · The thing that nearly got decided wrongly

This round's first pass reasoned from V7.2 §10.5 alone — the policy says OFF, the
served state is ON, therefore flip it. That reasoning reached the right answer for
the wrong reason, and it would have **silently reopened a settled NEW3 decision.**

`CCR-NEW3-S2F-01` (ledger `CCR-2026-08-30-11`) records an explicit prohibition:

```text
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
scope: adding ANY row to PLATFORM_CAPABILITY_OVERRIDES that narrows
       search.party_name on any platform
```

The reason is not procedural. `retrievalOutcome` had no way to say that an arm was
**administratively switched off**, so a suppressed party query with zero results
derived `abstained` + `low_relevance` — byte-identical to an honest zero. That is
the *"there is no law on this"* versus *"we could not search"* collapse, and it is
the single most dangerous thing this product can say. Activating the override
before the derivation was corrected would have turned a latent P1 into a live P0.

So the question is not "does policy want OFF". It is **"has the guard lifted"**.

### 7.1 · The guard's own six-step sequence, checked step by step at HEAD

R15 §B1.7 states it as BINDING, and adds: *"The override may be activated only
when every step below has actually happened — not when the next one is scheduled;
when the previous one is observed."*

| # | step | state | observed how |
|---|---|---|---|
| 1 | NEW3 contract defining the reason value | **DONE** | R15 §B1 — `capability_disabled` contracted |
| 2 | LCC implementation | **DONE** | `outcome.ts:115` types it; `outcome.ts:260` makes `party_name_disabled` contribute to `couldNotLookProperly`, so a suppressed zero derives `coverage_unknown`, never `abstained` |
| 3 | the deliberately pinned-wrong test updated | **DONE** | `trust-state-cross-surface.test.ts:577` — the pin B1.7 names by line — now asserts `coverage_unknown` + `['capability_disabled']` and `notEqual('abstained')`. `outcome.test.ts` carries the exact required case; `party-search-platform.test.ts:163` serialises it through intent, routing and empty retrieval on a real route |
| 4 | RCC consumption confirmed, no code change | **DONE** | `searchTruth.ts:126` — `classifySearch` returns `party_disabled` on `partyArmDisabled(degraded)` **or** `capabilityArmDisabled(retrievalOutcome)`, and it is the first branch, ahead of refusal, timeout, coverage_unknown and empty |
| 5 | **independent verification by a lane other than the implementer** | **DONE IN THIS ROUND** | §7.2 |
| 6 | a `PLATFORM_CAPABILITY_OVERRIDES` row may be added | **NOW AUTHORIZED** | §7.4 |

LCC implemented step 2, RCC step 4. NEW3 is neither, which is what step 5 asks
for. It had never been performed; the ledger still carried the guard as blocked
and the correction as *"still owed"*, recomputed 31 August, before the correction
landed.

### 7.2 · Step 5, performed by observation

Run at HEAD in this round, not read from a report:

```text
services/api  outcome.test.ts + party-search-platform.test.ts
              + trust-state-cross-surface.test.ts
              81 tests · 81 pass · 0 fail · 0 skipped

apps/mobile   searchTruth.test.ts
              25 tests · 25 pass
```

The decisive assertions, which now exist and pass:

```text
{party_name_disabled, 0 results, semanticIndexSufficient: true}
  -> state 'coverage_unknown', reasons ['capability_disabled'], NOT 'abstained'
{no degraded arms, 0 results}
  -> state 'abstained', reasons ['low_relevance']        (the honest zero, unchanged)
{results > 0, party arm suppressed}
  -> state 'degraded', safeForGeneration false
```

A suppressed zero and an honest zero are no longer indistinguishable. That was
the whole of the guard, and it is discharged.

### 7.3 · The rest of the case for OFF

With the guard lifted, the ordinary product argument decides it:

1. **The policy is recorded and the server contradicts it.** V7.2 §10.5 sets
   `IOS_PARTY_SEARCH_SUBMISSION_DEFAULT = OFF` unless NEW3 plus founder/counsel
   record a specific evidence-based decision to submit ON. No such record exists.
   iOS is ON because nobody wrote a row, not because anybody decided it — and
   "nobody has written the row yet" is not evidence for ON.
2. **A flip deferred to Gate D depends on memory.** One row now, with the whole
   degrade path built and tested, beats a platform fork discovered at submission.
3. **It cannot weaken Android or web, mechanically.** The override is keyed by
   platform, and `capabilityStateForPlatform` ignores any override that is not
   strictly narrower. This is to be asserted by a test, not assumed.

The argument the round warns against — *"early activation buys real testing
time"* — is **weaker here than it looks and is not relied on.** There is no
`apps/mobile/ios/`, no pinned build image, no iOS CI job and no iOS device
evidence in this repo, so nobody can exercise an iOS surface today. Early
activation buys correctness, not test coverage, and it should be argued as such.

`B` (activate at Gate D) is rejected: it makes the correct submission state
contingent on someone remembering. `C` (keep ON) is rejected: §10.5 demands a
specific founder/counsel record that does not exist.

### 7.4 · The handoff, and the one thing it must not do incidentally

`IOS_PARTY_SEARCH_HANDOFF = LCC`

Add exactly one row to `PLATFORM_CAPABILITY_OVERRIDES` narrowing
`search.party_name` to `DISABLED` on `ios`, in the file that already documents
this row as the one it exists for.

**`party-search-platform.test.ts` asserts that the switch ships unflipped on
every platform, and activation breaks that test.** That assertion records a
product decision, not a safety property, so it is correct that it breaks — but it
must be updated *deliberately, in the same change*, to assert the new decision:
iOS narrowed, Android/web/unknown untouched. Deleting it, weakening it, or
letting it be repaired incidentally is refused.

Nothing else moves. `search.party_name` stays `ENABLED` release-wide; exact case
number, CNR and citation lookup are untouched by the flag by construction; the
client half needs no change. Reversible by deleting the row if founder/counsel
later record an ON decision.

---

## 8 · Static cadence claim

```text
STATIC_CADENCE_CLAIM_CLOSED = YES
```

Both reachable sites verified closed in this round, independently of RCC's
report:

1. `screens/judgment/VerificationSheet.tsx` — the sentence is gone. The only
   remaining occurrence of "every night" in the file is a **comment** recording
   the removal and the reasoning. No replacement cadence, no timestamp, no
   notification undertaking.
2. `screens/manifest.ts` row 78 — `notes` now reads `'Batched, four triggers'`.
   The word "nightly" is gone.

A repository sweep for `re-checked · rechecked · each night · every night ·
overnight · you will be told · notified` across both files returns only those two
comment lines. Remaining `daily` hits are the **daily loop** feature name and the
`daily-cause-list` slug — a product name, not a currentness cadence.

No `lastCheckedAt` was invented. The contract still serves no citator recheck
timestamp, and RCC correctly refused every forbidden substitute — `asOf`, the
citation-existence `checkedAt`, build time and the cron file.

```text
UNSUPPORTED_REACHABLE_CADENCE_CLAIMS = 0   (was 1 named + 1 unnamed)
```

The second site is the more important finding. It was invisible to the audit that
existed to catch it, and §6 rules on the general shape rather than the instance.

---

## 9 · Apple toolchain, Android API 36, and the statute-link re-measurement

### 9.1 · Android — verified

```text
ANDROID_API36_READY = YES
```

Read from the merged **release** manifest artifact, not from a package version:
`targetSdkVersion="36"`, `minSdkVersion="24"`, with `targetSdk = "36"` /
`compileSdk = "36"` confirmed in React Native's own `libs.versions.toml`. V7.2
§10.1 asks for exactly this evidence class and it is satisfied.

### 9.2 · Apple

```text
APPLE_TOOLCHAIN_CLASS = GATE_D_STORE_BLOCKER
  local-v1 blocker ....... NO
  remote alpha blocker ... NO
  Gate D store blocker ... YES
  Gate E submission ...... YES (by inheritance)
```

Measured: `eas.json` pins **no `image` on any profile**, including `production`;
there is no `apps/mobile/ios/` native project; there is no iOS CI job. So
`APPLE_UPLOAD_READY = UNKNOWN` is the correct and only honest value, and RCC was
right to queue it rather than invent an image identifier.

It is **not** a local-v1 blocker. Local-v1 is an Android-and-local proposition;
no part of it requires an App Store upload. Classifying an unbuildable iOS
toolchain as a local-v1 blocker would stop work that does not depend on it, and
answering it would require paid infrastructure to settle a question local-v1
never asks. That is explicitly refused.

```text
APPLE_NEXT_EVIDENCE = a configured production build image in eas.json, whose
                      Xcode and iOS SDK versions are then readable from the
                      image's published contents — OR an actual production
                      build's log naming Xcode 26+ / iOS 26 SDK+.
```

Either closes it deterministically. Nothing else does: a JavaScript package
version, an Expo SDK number and a RN version are all evidence about the
JavaScript layer and none of them names a toolchain. V7.2 §10.2 says so directly.
No image is invented here, and none is to be invented anywhere else.

### 9.3 · Statute links — bus 1682's numbers re-measured

LCC asked NEW3 to check the figure rather than take it. Measured this round:

```text
judgment_statute_refs                          907,426 total
  carrying a statute_id                        703,768
  resolution_state IS NULL                     907,335
  refused_pre_enactment                             49
  unresolved_pre_commencement                       42
  linked_exact / linked_chronology_permitted         0

judgment_date < statutes.enactment_date              0
year(judgment_date) < statutes.act_year              0
judgment_date < statutes.enforcement_date            0
```

LCC's claims **reproduce exactly**; the totals have grown only by continued
ingest. Two facts follow and both are recorded rather than acted on:

* **Every resolution state ever written is a refusal.** The confirmed-link tier
  is empty for every input in this corpus, so the route's default tier returns
  nothing — correctly. LCC declining to make it look alive was the right call.
* **The registry's 1,723 anachronistic links do not reproduce at this HEAD**, on
  any of the three predicates, with no NULLs excluded. This is not a finding that
  FIFTH was wrong; it is a finding that the population it measured is not the
  population here, and neither lane knows which commit changed it. Recorded as an
  open provenance question, not as a closure.

`statute.linked_judgments` remains POST_V1 and user-unreachable — held on the
server by an environment flag that is off unless set, and on the client by having
no route at all. Its release acceptance is deferred; it is not part of local-v1.

---

## 10 · Local-v1 pre-acceptance — NOT final acceptance

Final local-v1 acceptance is **withheld**. RCC's R16 client implementation has
not run, so a required evidence set does not exist yet.

```text
READY_FOR_FINAL_LOCAL_V1_ACCEPTANCE = NO
  — POST /matters parties (P1, LCC)
  — /s/[slug] production reachability (P1, RCC)
  — R16 client implementation + evidence (RCC)
  then: YES_AFTER_RCC_R16
```

### 10.1 · Every item, classified

| item | state | class |
|---|---|---|
| auth deep-link P0 | PASS on the physical S24 at `cc5a373f`, six cases, evidence from the server's own request log | **CLOSED** |
| coverage contradiction | fixed — the hard-coded "Supreme Court only" lede is derived now, and 25 of 25 High Courts hold rows | **CLOSED** |
| static cadence claim | both sites removed and verified this round | **CLOSED** |
| R16 backend | accepted, §2 | **CLOSED** |
| R16 client | not implemented; now authorized | **LOCAL_V1_BLOCKER** |
| `POST /matters` `parties` | string scalar stored and served; the parties line renders empty | **LOCAL_V1_BLOCKER** |
| `/s/[slug]` reachability | 81 internal rows, 53 prose strings, reachable in a release build | **LOCAL_V1_BLOCKER** |
| iOS party search | ON by inheritance against a recorded OFF policy; the `CCR-NEW3-S2F-01` activation guard is **discharged** this round | **SPRINT4_STORE_BLOCKER** — activate now per §7 |
| `CCR-NEW3-S2F-01` retrievalOutcome guard | discharged: a suppressed zero now derives `coverage_unknown`, not `abstained`/`low_relevance`, and NEW3 performed the independent verification the guard required | **CLOSED** |
| Apple toolchain | production image unpinned, Xcode/SDK UNKNOWN | **SPRINT4_STORE_BLOCKER** (Gate D) |
| statute-linked judgments | POST_V1, unreachable by two independent mechanisms | **POST_V1** |
| monitoring | `monitoring.user_product` unavailable; `MONITORING_LEAKS = 0` | **POST_V1** |
| billing | `BILLING_PRESENT = NO`, proven from the resolved release classpath | **SPRINT4_STORE_BLOCKER** |
| Sprint 4 privacy/legal surfaces | not built; `SPRINT4_PRIVACY_PULLED_FORWARD = NO` | **SPRINT4_STORE_BLOCKER** |
| in-app account deletion (Apple 5.1.1) | Gate D requirement | **SPRINT4_STORE_BLOCKER** |
| idempotency retention policy | undecided by design, §4 | **NONBLOCKING_DEBT** |
| `statute.linked_judgments` registry row reads `LIMITED` | `isUserReachable` is true for `LIMITED`, so the registry row alone would not hold it; two other mechanisms do | **NONBLOCKING_DEBT** |
| R16 method-scoping and whitespace tests | structurally unreachable today, §2.4 | **NONBLOCKING_DEBT** |
| desktop workspace surfaces | PD-15 reversed 12 Aug; inert, not extended | **POST_V1** |

### 10.2 · Summary lines

```text
LOCAL_V1_BLOCKERS        = R16_CLIENT_IMPLEMENTATION · MATTERS_PARTIES_SHAPE · SLUG_ROUTE_REACHABILITY
REMOTE_ALPHA_BLOCKERS    = all of the above, by inheritance
SPRINT4_STORE_BLOCKERS   = IOS_PARTY_OVERRIDE · APPLE_TOOLCHAIN · BILLING_PBL8 ·
                           SPRINT4_PRIVACY_LEGAL · IN_APP_ACCOUNT_DELETION
POST_V1_ITEMS            = STATUTE_LINKED · MONITORING · DESKTOP_WORKSPACE
NONBLOCKING_DEBT         = IDEMPOTENCY_RETENTION · STATUTE_LINKED_REGISTRY_ROW ·
                           R16_UNREACHABLE_TEST_CASES
```

---

## 11 · Remote spend

```text
PAID_REMOTE_INFRA_AUTHORIZED       = NO
READY_FOR_REMOTE_SPEND_DECISION    = NOT_SET
```

Deliberately not set. It belongs to final local-v1 acceptance, after RCC's R16
evidence, and nothing in this round moves it. No remote infrastructure was
created, and no question in this round was answered by paying for any.

`DB_MIGRATION = NONE` · `NETWORK = NONE` · every measurement in this document was
taken against the local development database or committed source.
