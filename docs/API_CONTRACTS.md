# API CONTRACTS

The seam between the two lanes. **RCC builds against this with mocks and never
waits on LCC; LCC implements to it.** Shapes freeze for the sprint — a mid-sprint change requires telling
both consuming lanes.

All responses: `{ ok: true, data: T }` or `{ ok: false, error: { code, message } }`.
Zod-validated inputs. Auth via `Authorization: Bearer <jwt>`.

---

## Implementation status

**This file is a contract, not a description of the server.** Most of what follows
does not exist yet. Read the status before calling anything.

- **BUILT** — a route is mounted and serves it. Call it.
- **SPECCED** — the shape is agreed and frozen; **no route exists and the call
  404s.** Mock it, do not await it.

**Measured 7 Aug 2026 against `services/api/src/app.ts`: 83 endpoints, 19 BUILT,
64 SPECCED.** This is why `POST /citations/copies` 404'd — it was read as built
because nothing here said otherwise.

**The table is enforced, not maintained by hand.** `node
scripts/check-contract-status.mjs` fails if a row disagrees with the routes
`createApp` mounts, and it runs in `pnpm ci:local` and in CI. Mounting a route
without moving its row is a failing build, and so is the reverse. Path parameter
*names* are normalised away — the caller sends a value, never a name, so
`GET /citations/:citationCheckId` and the mounted `/citations/:id` are one
endpoint.

<!-- BEGIN:status -->

**Platform**

| endpoint | status |
|---|---|
| `GET /health` | BUILT |
| `GET /version` | BUILT |

**Auth — RCC owns**

| endpoint | status |
|---|---|
| `POST /auth/magic-link` | BUILT |
| `POST /auth/verify` | BUILT |
| `POST /auth/refresh` | BUILT |
| `POST /auth/logout` | BUILT |
| `GET /me` | BUILT |
| `PATCH /me` | BUILT |
| `GET /terms/current` | BUILT |
| `POST /me/accept-terms` | BUILT |

**Search — LCC owns**

| endpoint | status |
|---|---|
| `POST /search` | BUILT |
| `GET /judgments/:id` | BUILT |
| `GET /citations/:citationCheckId` | BUILT |
| `POST /verify/ecourts` | BUILT |
| `POST /verify/confirm` | BUILT |
| `POST /citations/copies` | BUILT |

**Bare acts — LCC owns · ADDED IN S1**

| endpoint | status |
|---|---|
| `GET /statutes` | BUILT |
| `GET /statutes/sections` | BUILT |
| `GET /corpus/coverage` | BUILT |

**Feature-parity endpoints — LCC owns · ADDED 6 Aug 2026**

| endpoint | status |
|---|---|
| `GET /judgments/:id/treatment` | BUILT |
| `GET /judgments/:id/graph` | BUILT |
| `GET /judgments/:id/authorities` | BUILT |
| `POST /documents/:id/review` | SPECCED |
| `POST /documents/compare` | SPECCED |
| `POST /uploads/:id/chat` | SPECCED |
| `POST /arguments/counter` | BUILT |
| `GET /saved-searches` | BUILT |
| `POST /saved-searches` | BUILT |
| `DELETE /saved-searches/:id` | BUILT |
| `GET /saved-searches/:id/feed` | BUILT |
| `GET /judgments/:id/annotations` | BUILT |
| `POST /judgments/:id/annotations` | BUILT |
| `DELETE /annotations/:annotationId` | BUILT |

**Matters — LCC owns**

| endpoint | status |
|---|---|
| `GET /matters` | BUILT |
| `POST /matters` | BUILT |
| `GET /matters/:id` | BUILT |
| `PATCH /matters/:id` | BUILT |
| `POST /matters/:id/events` | BUILT |

**Matter sharing — LCC owns · PD-3, PD-4**

| endpoint | status |
|---|---|
| `GET /matters/:id/shares` | BUILT |
| `POST /matters/:id/shares` | BUILT |
| `DELETE /matters/:id/shares/:shareId` | BUILT |
| `PATCH /matters/:id/events/:eventId` | BUILT |

**Matter authorities — LCC owns · added 11 Aug 2026**

| endpoint | status |
|---|---|
| `GET /matters/:id/authorities` | BUILT |
| `POST /matters/:id/authorities` | BUILT |
| `DELETE /matters/:id/authorities/:authorityId` | BUILT |

**Briefings — LCC owns**

| endpoint | status |
|---|---|
| `GET /briefings/:id` | BUILT |
| `GET /matters/:id/briefings` | BUILT |
| `POST /briefings/:id/opened` | BUILT |

**Drafting — LCC owns**

| endpoint | status |
|---|---|
| `GET /documents` | BUILT |
| `GET /documents/types` | BUILT |
| `GET /documents/:id` | BUILT |
| `POST /documents` | SPECCED |
| `PATCH /documents/:id` | BUILT |
| `POST /documents/:id/citations` | BUILT |
| `DELETE /documents/:id/citations/:citationCheckId` | BUILT |
| `POST /documents/:id/export` | SPECCED |

**OCR — LCC owns the service and the API**

| endpoint | status |
|---|---|
| `POST /ocr/jobs` | SPECCED |
| `GET /ocr/jobs/:id` | SPECCED |
| `POST /ocr/jobs/:id/confirm` | SPECCED |

**Court adapter — LCC owns, vendor-agnostic**

| endpoint | status |
|---|---|
| `POST /court/lookup` | BUILT |

**Admin — LCC owns the endpoints, RCC owns the UI**

| endpoint | status |
|---|---|
| `GET /admin/llm-costs` | BUILT |
| `GET /admin/citations` | BUILT |
| `GET /admin/ocr-queue` | BUILT |
| `GET /admin/users` | BUILT |
| `PATCH /admin/users/:id/enrolment` | BUILT |
| `GET /admin/audit` | BUILT |
| `GET /admin/platform` | BUILT |
| `POST /admin/platform/maintenance` | BUILT |
| `POST /admin/platform/kill-switches/:key` | BUILT |
| `POST /admin/platform/flags/:key` | BUILT |
| `GET /admin/cause-lists` | BUILT |
| `POST /admin/cause-lists/:id/retry` | BUILT |
| `POST /admin/cause-lists/:id/escalate` | BUILT |
| `GET /admin/disputes` | BUILT |
| `GET /admin/disputes/:id` | BUILT |
| `POST /admin/disputes/:id/uphold` | BUILT |
| `POST /admin/disputes/:id/reject` | BUILT |
| `GET /alerts` | BUILT |
| `POST /alerts/:id/read` | BUILT |
| `GET /me/alert-settings` | BUILT |
| `PATCH /me/alert-settings` | BUILT |
| `GET /me/training-consent` | BUILT |
| `POST /me/training-consent` | BUILT |
| `DELETE /me/training-consent` | BUILT |
| `POST /admin/overruled-rechecks/run` | BUILT |
| `GET /admin/templates` | SPECCED |
| `POST /admin/templates` | SPECCED |
| `POST /admin/templates/:id/score` | SPECCED |
| `POST /admin/templates/:id/publish` | SPECCED |
| `GET /admin/data-requests` | BUILT |
| `POST /admin/data-requests/:id/complete` | BUILT |
| `POST /admin/data-requests/:id/refuse` | BUILT |
| `GET /admin/privacy/coverage` | SPECCED |

<!-- END:status -->

---

## Platform — LCC owns

```
GET /health    —   → { status, sha, database: { reachable, latencyMs } }
GET /version   —   → { gitSha, deployedAt, environment, imageDigest }
```

**`sha`/`gitSha` are what the build was told, not what is running by any
platform guarantee.** Both read the same `GIT_SHA` environment variable
(`build-info.ts`) — never two independently-resolved values that could
disagree. **It has reported a stale commit twice for two different reasons**:
once through a crashed deploy (the container never actually replaced the old
one), and once — found 11 Aug 2026 — because `railway up` (a CLI deploy,
which is how every real deploy has happened since auto-deploy died 8 Aug)
never populates `RAILWAY_GIT_COMMIT_SHA`, so the code fell through to a
manually-set `GIT_SHA` that nothing was re-setting, and it read the 8 Aug
commit through several real, successful deploys afterward. **Fixed by making
the deploy itself set it**: `scripts/deploy-api.mjs` sets `GIT_SHA` and
`DEPLOYED_AT` immediately before every `railway up`, atomically, so the two
cannot drift apart the way a hand-set variable did. **Still not a platform
guarantee** — it trusts the machine running the deploy script to have the
right commit checked out, not a signed build-provenance chain. **When in
doubt, probe the route whose behaviour actually changed**, not this field —
`services/harness/src/deployed-safety.ts` exists for exactly that.

`imageDigest` is always `null` — nothing in this build computes or receives
a content-addressed image digest; `railway.json` uses Railpack, not a
Dockerfile this project builds directly. Recorded as a known gap, not
guessed at.

`deployedAt` is `null` for any deploy that did not go through
`scripts/deploy-api.mjs` (including every local `pnpm dev`) — absence, never
a fabricated "now".

Returns **503**, not 200, when the database is unreachable: a health check that
stays green while the database is down keeps Railway routing traffic at it.
`/version` answers regardless — deploy identity is not a database question.

## Auth — RCC owns
```
POST /auth/magic-link   { email }            → { sent: true }
POST /auth/verify       { token }            → { accessToken, refreshToken, user }
POST /auth/refresh      { refreshToken }     → { accessToken, refreshToken }
POST /auth/logout       —                    → { ok }
GET  /me                —                    → { user }
PATCH /me               { fullName?, phone?, preferredLanguage?, barEnrolmentNumber?,
                          expoPushToken? } → { user }

GET  /terms/current     —                    → { version, body }
POST /me/accept-terms   { version }          → { termsAcceptedAt, termsVersion }
```

**PD-8 — consent replaces the AI-assisted mark.** `POST /me/accept-terms` records
the advocate actively accepting AI assistance, the duty to verify before filing,
and the terms of legal use. It writes `terms_accepted_at` and `terms_version`
together, rejects a `version` that is not the current one, and is **never
inferred** from any other action. An account with no accepted terms cannot
generate a draft — that is the one place this gates, and it gates nothing else.

**`expoPushToken` — additive, 7 Aug 2026.** The device's Expo push token, sent
after the OS prompt is accepted. **Nullable rather than merely optional:** omitted
means "no change", explicit `null` means "stop sending to this device". The
profile reports it back as `pushRegistered: boolean` and **never returns the token
itself** — it is a device secret and nothing needs to read it back.

Delivery is **batched into the evening briefing** (PD-6): one push per advocate
covering all of tomorrow's hearings, never one per matter. Two things push
immediately and nothing else ever does — `set_aside` on a citation in an exported
draft, and a newly discovered listing for tomorrow.

**Enrolment still never gates** (PD-2). Consent and enrolment are different
things: consent is a condition of drafting, enrolment is a credential that is
merely displayed.

## Search — LCC owns
```
POST /search
  { query, language: 'en'|'hi', filters?: { court?, dateFrom?, dateTo?, caseType? }, matterId? }
  → { results: [ { judgmentId, caseTitle, neutralCitation, reporterCitations,
                   court, judgmentDate, holding,
                   operativeParagraph, operativeParagraphNumber,
                   verificationState: 'verified'|'unverified'|'failed',
                   verifiedBySource: 'corpus'|'public_x2'|'ecourts'|'none',
                   overruledStatus: 'none'|'set_aside'|'partly_set_aside'|'doubted',
                   overruledByJudgmentId?, overruledParas?, overruledNote? } ],
      unverifiedReferences: [ { citationClaimed, reason } ],
      searchId,
      parsed?, total?, ambiguous?: true }
```
Every field from the `judgments` row. Never from model output.
`unverifiedReferences` is never empty-by-omission — anything the model referenced
that no tier confirmed appears here. See `CITATION_HARNESS.md`.

**`ambiguous: true` — added 11 Aug 2026, task 001's follow-on.** Present only
when a bare `cite:"..."` query resolves to **more than one** judgment —
verified live in the corpus, not hypothetical: `cite:"2020 INSC 189"`
resolves to three distinct Supreme Court judgments today (`CITATION_HARNESS.md`
§Exact citation lookup). `results` still carries every real matching row when
this flag is set — nothing invented, nothing dropped — and the client **must**
render a disambiguation, never an ordinary result list, when this flag is
present. Absent (not `false`) on every other response, matching `parsed` and
`total`'s existing optionality on non-structured queries.

**`neutralCitation: string | null` · `reporterCitations: string[]` (never
null, may be empty). Stated explicitly 11 Aug 2026 — this contract was
silent on nullability and a client type declared both non-nullable for the
life of the project**, which never once produced a type error because every
Supreme Court judgment held one. It stopped being harmless the moment the
High Court corpus landed: **40,980 rows hold neither.** `neutralCitation ===
null && reporterCitations.length === 0` is the exact, sole definition of
**citable = false** — task 002, `CITATION_HARNESS.md` §The fourth concern.
This is the same shape as every other citation field on the wire: the server
sends the raw truthful value, the client derives the render state from it —
never the reverse.

**Three independent fields, not one state.** `verificationState` answers whether
the authority exists; `verifiedBySource` answers who confirmed it and drives the
badge qualifier; `overruledStatus` answers whether it is still good law and is
**independent** — a judgment can be `verified` and `set_aside` at once. Any
response carrying a citation must include all three. A citation missing them is a
bug: the client renders "not confirmed" and reports it.

**`verifiedBySource` gains a fifth value: `'ecourts_bulk'`. Added 8 Aug 2026 —
additive, provisional, and nothing writes it yet.**

The Postgres enum has seven values and this contract now has five. That gap was
real and unguarded before today: `GET /citations/:id` and `GET /documents/:id`
read the column and handed it to the client, which types the field as a closed
union and looks its label up in a `Record`. Nothing broke only because nothing
had ever written a diagnostic value. Both routes now go through
`services/api/src/citations/source-strength.ts`, whose mapping is exhaustive
over the column — adding an eighth database value is a compile error rather than
a blank label on an advocate's screen. `indiankanoon` and `aws_s3` map to
`'none'`: one public source matching is not a confirmation under
`CITATION_HARNESS.md` step 5, and such a row is `unverified` regardless.

`'ecourts_bulk'` means **the registry answered us directly under the registrar's
grant** — authoritative, automated, and *not* a human confirmation. It exists so
bulk CNR resolution cannot quietly wear the authority of `'ecourts'`, which
means a named advocate personally vouched.

> **Client requirement, before bulk resolution ships.** `VerifiedBySource` in
> `apps/mobile/src/api/contract.ts` and the label map in
> `apps/mobile/src/citation/tiers.ts` both need the value. Suggested label:
> *"eCourts record"* — distinct from Tier 3's *"You confirmed it"*. Two rules
> hold in the meantime and afterwards: an **unrecognised** source must degrade
> to silent-verified and never to a blank or a crash, and `'ecourts_bulk'` must
> **never** render the Tier-3 wording. Server-side nothing emits the value
> today, so there is no live exposure — the client change simply has to land
> before the resolver does.

**STRUCTURED SEARCH — additive, 9 August 2026.**

`POST /search` now answers field, Boolean, citation, proximity and range queries
in the same endpoint. **Existing callers are unaffected**: ordinary prose takes
exactly the path it did before.

```
POST /search  { query: 'judge:"Kania" AND section:138 AND date:[2019 TO 2024]' }
  → { results: [...], unverifiedReferences: [], searchId,
      parsed: 'Judgments decided by a judge matching "Kania", and referring to
               section 138, and decided between 2019 and 2024.',
      total: 214 }
```

Fields: `party` · `judge` · `cite` · `caseno` · `court` · `date` · `act` ·
`section` · `type` · `text`. Operators: `AND` `OR` `NOT`, parentheses,
`"phrases"`, `NEAR/n`, `[from TO to]`, trailing `*` and `?`.

**`parsed` must be displayed.** It is the server stating what it understood, and
it is a correctness feature rather than a courtesy: a misparse produces
*results*, not errors, so showing the interpretation is the only way an advocate
can catch `a AND b OR c` being read as `a AND (b OR c)`. Absent for prose
queries.

**`total` is the full count, not the page length.** An advocate deciding whether
to narrow a search needs to know whether it matched 5 judgments or 1,237.

**ZERO MEANS ZERO.** A structured query matching nothing returns `results: []`
with `parsed` set — **never a silent fallback to semantic search**. Three cheque
cases by other judges do not read as *"we found nothing and guessed"*; they read
as *"these are the Kania cases on section 138"*, and the advocate cannot tell the
difference. Render it as "no judgment matches this".

**A malformed query is a `400 INVALID_QUERY`** carrying `error.details.offset` —
the character position of the mistake — and `error.details.validFields` when a
field name was not recognised. `error.details` is additive; every other error
shape is unchanged.

**`operativeParagraph` is a paragraph the server identified, not the chunk it
matched. `operativeParagraphNumber` — added 7 Aug 2026, additive.**

Retrieval matches a *chunk*: a fixed-size window cut wherever the chunker landed,
routinely opening mid-word and often spanning a paragraph boundary. The right unit
to search and the wrong unit to show. The server maps it back to the printed
paragraph containing it, strips reporter typesetting — marginal A–H reference
letters, page pinpoints, running heads, words broken across hard wraps — and
returns that.

`operativeParagraphNumber` is **the number the court printed**, and null is a
real, common answer: pre-1990s judgments arrive as scans that lost their
numbering, and a headnote is never numbered. **Never invented.** An advocate told
"see paragraph 22" must land on the paragraph the court numbered 22.

**Null means we cleaned the text but did not identify a paragraph**, and the
client must render it accordingly — not behind an authority rule as the court's
own words. It is also how a failed segmentation surfaces: a located block over
3,000 characters is treated as a failure rather than a very long paragraph,
because that is what it is.

An empty `operativeParagraph` is legitimate. A result matched by the lexical
ranker alone has no dense chunk behind it and therefore no paragraph to show.

**`asOf` — added 6 Aug 2026. Additive; no existing field moved.**

Every payload carrying `overruledStatus` also carries `asOf`: an ISO-8601 UTC
timestamp of **when the server read that status**. Not when the client received it,
not when the row was written.

Without it `CITATION_HARNESS.md`'s offline rule is unimplementable: *"Offline
surfaces render the status they last read **with its as-of date shown**; they never
present a stale status as current."* A client that has to invent that date is
fabricating the one number the rule exists to make honest.

It applies to `/search` results, `GET /judgments/:id`, briefing authorities, draft
citations and matter authority lists — everywhere `overruledStatus` appears. The
client renders it **only on a surface served from cache**; online renders are
current by definition and showing a timestamp there is noise.

```
GET /judgments/:id
  → { judgmentId, caseTitle, neutralCitation, reporterCitations, court, bench,
      judgmentDate, caseNumber, caseType, language, sourceUrl, fullText,
      paragraphs: [ { paragraphNumber: number | null, paragraphIndex, text } ],
      numberedShare,
      verificationState, verifiedBySource,
      overruledStatus, overruledByJudgmentId, overruledParas, overruledNote,
      asOf }
**`paragraphs` — added 6 Aug 2026, because `fullText` alone cannot serve PD-9.**

The reading view is built on paragraph anchors, and a client cannot split
`fullText` without **inventing paragraph numbers**. It must not: `overruled_paras`
is expressed in printed numbers, advocates cite by them, and an advocate told
"see paragraph 22" has to land on the paragraph the court numbered 22.

Segmentation is server-side because it needs the reporter's conventions. The text
carries marginal letters (`A B C D E F G H` down the page edge), running page
numbers and an unnumbered headnote, and lines opening with a digit are just as
often section numbers, years or list items. A client regex fragments the judgment
and misnumbers everything after.

**Two fields, answering different questions:**

- **`paragraphNumber`** — what the court PRINTED. **Nullable, and null is
  common**: headnotes are never numbered and pre-1990s judgments arrive as OCR'd
  scans whose numbering did not survive. This is the citable unit.
- **`paragraphIndex`** — position in the array. Always present, never citable, a
  rendering and scroll-targeting handle only.

`numberedShare` is the fraction carrying a number. **A judgment at 0.0 can be
displayed but not anchored** — the client hides anchors rather than showing broken
ones. Measured across judgments from 1964 to 2023: 11 of 15 sampled were above
0.5, and numbering was monotonic in every one. Never fabricate a 1..N sequence to
fill the gap.

```
GET /citations/:citationCheckId
  → { citationCheckId, citationClaimed, checkedAt, surface, shownToUser,
      verificationState, verifiedBySource, overruledStatus, overruledStatusShown,
      matchConfidence, judgment: {...} | null,
      tiers: [ { tier, source, status, detail, at } ],
      coverage: { tiersImplemented, tiersDefined, note }, asOf }
```
**Added 7 Aug 2026.** The verification sheet and the unverified-citation screen
were both on a mock because nothing returned per-tier results with timestamps.
`citation_checks` held the rows; nothing exposed them.

`status` is one of `confirmed` · `miss` · `not_attempted` · **`not_implemented`**,
and the last one is the point. **`miss` and `not_implemented` are different facts
and must never be collapsed.** `miss` says we queried an independent source and
found nothing. `not_implemented` says Tiers 2 and 3 ship in S2 and have not run.
Rendering the second as the first tells an advocate a citation failed independent
verification that was never attempted — and it makes the harness agree with
itself, reporting a confirmation rate computed over checks that never happened.

`coverage` states this in words so the client is not left inferring it from an
array. In S1: `tiersImplemented: 1` of `tiersDefined: 3`.

**The handle comes from the search response.** Every result in `POST /search` and
every authority in `POST /arguments/counter` carries `citationCheckId`. It is null
only when row alignment could not be guaranteed — never a guessed id, because a
wrong one points the advocate at another judgment's verification record.

```
POST /verify/ecourts { citationText }
  → { ecourtsUrl, prefilledQuery, captchaRequired: true, instructions }
POST /verify/confirm { citationText, judgmentId }
  → { cached: true, citationCheckId, verificationState, verifiedBySource,
      overruledStatus, confirmedAt, asOf }

POST /citations/copies
  { judgmentId, matterId?, citationCheckId?, surface, copiedAt, clientKey }
  → { ok }
```
**Both built 7 Aug 2026.**

**`prefilledQuery` is text to paste, not a URL parameter.** Verified against the
live site: `judgments.ecourts.gov.in/pdfsearch/index.php` is a POST form carrying
`app_token`, `searchOptions` and `captcha` — a session token and a challenge.
**No query string pre-fills it.** The client must present the string for the
advocate to copy, not imply the search box arrives filled. It is normalised for
eCourts' matching, and **its digits are never reordered** — `(2019) 4 SCC 221`
and `(2019) 4 SCC 212` are different cases.

`captchaRequired: true` ships in the payload rather than being left for the client
to remember. **Nothing on the server ever fetches from eCourts**, and a test
asserts the module contains no HTTP client at all — the rule is enforced by an
absence, and absences rot silently.

**`/verify/confirm` requires a user, and will 401 until auth ships in S5.** A
Tier 3 confirmation is cached permanently *for everyone*, so an anonymous caller
able to assert one is a way to poison the harness. It also 404s a `judgmentId` we
do not hold, and returns `overruledStatus` read live from the row — confirming
that a judgment EXISTS says nothing about whether it is still good law.

**Every "Copy citation" tap writes a copy record.** An advocate who copies a
citation into their own document is otherwise invisible to the fan-out — they saw
a verified badge, they may file it, and no notification could ever reach them.
That is the user at highest risk, and plausibly a large share of early users: the
ones who trust the search but not yet the drafting.

Copy works offline, so this **queues through the outbox** with `clientKey` as the
idempotency key, like every other local-first write. Never block the copy on the
request — the clipboard write happens immediately and the record syncs after.
Retention and disclosure: `SCHEMA_TRUTH.md#citation_copies`, `PRIVACY_PII.md`.

## Drafts list — LCC owns · ADDED 11 August 2026

**An ADDITION to the frozen contract.** The Drafts tab was the only route in the
app still wired to a bare `ScreenShell`, and this is why: five draft screens are
built and tested, but nothing could list what an advocate had already written —
`GET /documents/:id` needs an id the client had no way to obtain.

```
GET /documents          (auth required)

{ documents: [ { documentId, documentType, matterId, matterTitle,
                 language, createdAt, citationCount, unverifiedCount } ] }
```

Newest first. **No `generatedContent`** — a list of twenty drafts would ship
twenty full documents to render twenty titles, and that content is
sensitive-class (`PRIVACY_PII.md`).

**`unverifiedCount` counts `failed` together with `unverified`, deliberately.**
`CITATION_HARNESS.md`: an advocate cannot act on the difference and an outage
must not read as a corpus gap. **Copy it as "could not confirm", never
"verification failed".**

**`overruledStatus` is deliberately NOT summarised into this list.** It is read
live at render on the surfaces that show a citation, never cached into a count
that ages.

**RCC:** this unblocks the Drafts tab. `app/(tabs)/drafts.tsx` is 6 lines of
`ScreenShell`; `src/screens/draft/` already holds TemplatePicker, DocumentReview,
CounterArguments, PrecedentPanel and CompareSummary.

## Corpus coverage — LCC owns · ADDED 11 August 2026

**An ADDITION to the frozen contract**, not a change to an existing shape, so it
cannot break work already built against it — the same standing the bare-acts
endpoints were given.

```
GET /corpus/coverage

{ supremeCourt: { courtName, held, sourceDocuments: null },
  highCourts: [ { courtName, courtCode, sourceDocuments, held,
                  firstYear, lastYear } ],          // worst gap first
  judgmentShareUnknown: true,
  judgmentShareRange: [0.0075, 0.1864],
  enumeratedAt }
```

**Why it exists.** `SELECT court, count(*) FROM judgments` returns **one row —
Supreme Court of India, 38,341.** An advocate practising in a High Court searches,
gets a confident-looking result set, and is told nothing about holding **0 of
3,493,695** Allahabad documents. `CLAUDE.md`: **silence about a gap does the same
damage as a fabricated citation** — both let an advocate rely on something
absent, and the fabricated one at least gets caught in open court.

**`sourceDocuments` COUNTS DOCUMENTS, NOT JUDGMENTS, and the client must not
relabel it.** `docs/HC_CORPUS_SURVEY.md` §2 measured the judgment share of the
AWS High Court bucket at a **range of 0.75%–18.64%**: the only published label,
`order_type`, carries a `View Judgement/Order` value on 17.89% of rows that does
not distinguish the two. `judgmentShareUnknown: true` and `judgmentShareRange`
say so on the wire. **Rendering "0 of 3,493,695 judgments" states a number nobody
measured.** A server test asserts no field is ever named `sourceJudgments`.

**`supremeCourt.sourceDocuments` is `null`, never `0`.** That bucket has not been
enumerated per year, and **unknown is a state, not zero** — `0` would say the
source is empty, the opposite of the truth. Same rule as `corpus_coverage`'s
`source_total`.

**`held` is derived live at query time**, never stored, exactly as `/statutes`
derives it. A cached coverage count drifts the moment an ingest writes a row, and
a figure stale in the *reassuring* direction is worse than no figure.

**`enumeratedAt` is when the SOURCE was counted**, not when the row was written.
A coverage claim with no date is not checkable.

**RCC:** this needs a surface. The gap is currently invisible, and an advocate
finding out by searching their own High Court and getting nothing is the failure
this endpoint exists to prevent. Sorted worst-first so the biggest hole is what
you show. `docs/RCC_CONTINUATION_PROMPT.md` §R3.

## Bare acts — LCC owns · ADDED IN S1

**`coverage` — added to, 8 Aug 2026.** Now carries `failedIds` and
`sectionlessCount` alongside `failedCount`.

**Named, never merely counted.** `SCHEMA_TRUTH.md`: *"an unauditable gap is not a
known gap."* `failedIds` lists the indiacode handles the last pass could not
ingest.

**These are two different gaps and must not be added together.**
`failedIds` are Acts we do not hold. `sectionlessCount` are Acts we DO hold whose
sections never parsed — the row exists, so counting statutes overstates what is
searchable. Measured 8 Aug 2026: **825 held, 821 with sections, 20 failed.**

**`complete` will not flip to true at 825.** All twenty failed handles return HTTP
200 at indiacode, so this is not source-side loss: the pages exist and our section
parser extracts nothing from them (old Acts — *The Broach and Kaira Incumbered
Estates Act, 1877*, "MISSING 41"). It is recoverable by a parser change, tracked as
Track B, and **no sprint depends on it**. Render the library as 825 of 845 rather
than as complete.

**These are additions, not changes.** No existing shape moved, so nothing already
built against this contract breaks. `sprints/SPRINT_1.md` gives LCC the bare acts
library and RCC a bare act reading view, and neither had an endpoint.

```

**`coverage` on `/statutes` — added 7 Aug 2026.**

```
coverage: { held, sourceTotal, complete, failedCount, enumeratedAt, ingestInProgress }
```

The client lane found the gap rendering the library: `/statutes` returned 207
Acts, and 206 on the call before, because the ingest was running live — and
nothing said so. **A library rendered as complete when it is not misstates what we
hold**, and an advocate searching for an Act we have not reached concludes we do
not have it. Same argument as `truncated` on the graph and `resolvedAuthorities`
on the point-in-time endpoint.

- `sourceTotal` is what the SOURCE reports (845, from the Central Acts index),
  never a number anyone typed. **Null until an enumeration has run** — unknown is
  a state, not zero.
- `held` is counted on every read, never cached.
- **Do not infer `complete` from `held === sourceTotal`.** A pass can equal the
  count transiently, or with Acts that failed and were retried into place by an
  earlier run. It is true only when a full pass finishes with no failures.
- **`ingestInProgress` is `true | false | null`.** Null means we have never
  enumerated and cannot tell you. It is nullable because a boolean cannot say
  "unknown", and `false` for an absent record is a claim we cannot support —
  caught in production reporting `false` with an ingest actively running.
- `failedCount` counts Acts the last pass could not fetch; `corpus_coverage`
  names them, so a gap is auditable.

GET /statutes
  → { statutes: [ { statuteId, shortTitle, hindiTitle, actNumber, actYear,
                    enactmentDate, enforcementDate, ministry, sourceUrl,
                    sectionCount } ] }

GET /statutes/sections ?actId &sectionNumber &q &limit &offset
  → { sections: [ { sectionId, statuteId, shortTitle, sectionNumber, heading,
                    sectionText, footnote, orderIndex, sourceUrl } ],
      total }
```

One read serves all three uses: `?actId=` reads an act in order for the reader,
`?sectionNumber=103` jumps straight to a section, and `?q=` searches across the
codes. `limit` caps at 600 so a whole act comes back in one call.

**Order by `orderIndex`, never by `sectionNumber`.** Section numbers are text —
they carry letters like `63A` — so lexical ordering puts s.10 before s.2.

`enforcementDate` is separate from `enactmentDate` and is the one that matters:
which regime applies to an offence turns on when the Act came into force, not when
it was passed (`DOMAIN_TRUTH.md`). BNS, BNSS and BSA were all enacted 2023-12-25
and came into force 2024-07-01.

`sectionText` is government-published text served verbatim from the database. It
is never generated, summarised or reformatted.

## Feature-parity endpoints — LCC owns · ADDED 6 Aug 2026

**Additive only. No existing shape moved**, so nothing already built against this
file breaks. These back the eleven screens in `design/screens/01…11` and the plan
in `docs/FEATURE_PARITY.md`.

Every response carrying a citation carries the three independent fields **and**
`asOf`. Every endpoint that touches an uploaded document is sensitive-class:
pseudonymise before any model call, **one document per call** (OD-6).

### Treatment analysis — replaces outcome prediction
```
GET /judgments/:id/treatment ?limit=50 &cursor
  → { judgmentId, asOf,
      counts: { followed, distinguished, doubted, overruled },
      treatments: [ { judgmentId, caseTitle, neutralCitation, court,
                      judgmentDate, relationship: 'followed'|'distinguished'
                                    |'doubted'|'overruled',
                      paragraph,
                      verificationState, verifiedBySource, overruledStatus,
                      asOf } ],
      total, returned, truncated, nextCursor }
```
**Every number is derived from real citation relationships in the corpus and is
traceable to a judgment ID.** This endpoint states what courts *did*. It must never
return a probability, a score, or a predicted outcome — that is the one competitor
feature we decline (`FEATURE_PARITY.md` §4), because it cannot be sourced to a
primary record and cannot be verified by any tier.

`relationship` is a **different question** from `verificationState`. A judgment can
be `verified` and `overruled`, or `unverified` and `followed`. Never fold them —
and note that this is exactly why every row carries **all three** citation fields:
a treatment row is a citation like any other, and a payload that asserts only
`overruledStatus` forces the client to either render everything "not confirmed" or
silently assume a verification the server never claimed.

`counts` are computed over the **whole** treatment set, never over the truncated
page — a count that shrank with pagination would misstate how the law has moved.

### Precedent graph
```
GET /judgments/:id/graph ?depth=1|2 &limit=40
  → { rootId, asOf,
      nodes: [ { judgmentId, caseTitle, neutralCitation, court, judgmentDate,
                 verificationState, verifiedBySource, overruledStatus,
                 asOf, depth } ],
      edges: [ { from, to, relationship } ],
      totalNodes, returned, truncated }
```
`depth` caps at 2 and `limit` caps at 100, default 40.

**`depth` bounds the walk; `limit` and `truncated` bound the payload — both are
required.** A heavily-cited Supreme Court authority has hundreds of citing
judgments at depth 1 alone, so depth alone leaves the response unbounded.

**`truncated` is a correctness field, not a performance one.** A citation network
rendered as though it were complete, when it is not, misrepresents how much law
bears on the authority — the client must be able to say "showing 40 of 312" rather
than implying 40 is all there is. Nodes are returned **most-cited first** so a
truncated graph keeps the authorities that matter, and `totalNodes` is the true
count before truncation.

A citation network is unbounded and a phone is not — the client renders a ranked
list by default and the graph on demand.

### Point-in-time good law — was each authority still standing when relied on?
```
GET /judgments/:id/authorities → { judgmentId, caseTitle, deliveredOn, asOf,
                                   counts, authorities, resolvedAuthorities }
```
**Added to this document 7 Aug 2026, after it had already shipped.** The client
lane found it missing and transcribed its types from the response, which is a
thing they should never have had to do — an undocumented endpoint is one the other
lane has to reverse-engineer. Recorded rather than quietly corrected.

Each entry in `authorities`:

| field | meaning |
|---|---|
| `judgmentId` · `caseTitle` · `neutralCitation` · `judgmentDate` | the cited authority |
| `relationship` | how this judgment treated it — from the court's own printed annotation |
| `standingWhenRelied` | `good_law_then` · `already_moved` · **`overruled_here`** · `moved_since` · `unknown` |
| `daysAlreadyMoved` | days between the overruling judgment and this one. Null unless `already_moved` |
| `overruledOn` | **the overruling judgment's own delivery date** |
| `overruledByJudgmentId` · `overruledByCaseTitle` | which bench moved it |
| `statusRecordedAt` | when OUR row changed. **Never a legal date** — see below |
| `overruledStatus` · `verificationState` · `verifiedBySource` | the three independent fields, from the row |

**`standingWhenRelied` is derived from two court dates and nothing else**:
`deliveredOn` and `overruledOn`. It was briefly derived from `statusRecordedAt`
instead, which is when the back-fill wrote the row — so every authority appeared
to have moved *after* every judgment that cited it, and `already_moved` read 0
corpus-wide. `docs/LCC_PLAN.md` §3 and `services/api/src/judgments/as-at.ts` carry
the full account.

That distinction is the whole endpoint. `moved_since` says the law changed under a
bench that could not have known — unremarkable, and true of a great deal of good
law. `already_moved` says the bench relied on an authority that had already
fallen. Rendering the first where the second is true tells an advocate the
opposite of the fact.

**`overruled_here` means this judgment is the one that moved it** — added 7 Aug
2026 after a corpus-wide cross-check. Of the 99 citations of a moved authority,
48 date as "already moved" and **22 of those are the overruling judgment citing
the authority it overrules**: *Tofan Singh* reciting *Kanhaiyalal*, *Navtej Singh
Johar* reciting *Suresh Kumar Koushal*, *Vidya Drolia*, *Sita Soren*, *Joseph
Shine*, *Vineeta Sharma*, *Puttaswamy*. Their dates are necessarily equal, so a
pure date comparison lands them in `already_moved` — which says a bench relied on
dead law, about the bench that killed it, on the landmarks an advocate is most
likely to open. `daysAlreadyMoved` is null here: a gap of zero days is not a gap.

`unknown` is a real state and must render as one: we hold a status but no dated
overruling judgment, so the question cannot be answered. Never collapsed into
`good_law_then`.

**States facts, never a rating.** No soundness score, no outcome prediction, no
grade on a bench's reasoning — `FEATURE_PARITY.md` §4. Every number here is a
count of days between two court records.

*Client note, agreed with RCC:* this belongs in a panel under "Relied on", not on
its own screen. Their reasoning, recorded because it is better than the original
framing — *"`deliveredOn` is what makes this coherent, and it only means anything
next to the judgment it belongs to. Lift it onto its own screen and it becomes a
free-floating verdict, which is exactly the shape of the thing you're declining."*

### Document review and compare — sensitive class
```
POST /documents/:id/review
  → { documentId, findings: [ { clauseIndex, span, category: 'standard'|'risk'
                                |'negotiation', finding,
                                authorities: [ { judgmentId, caseTitle,
                                                 verificationState,
                                                 verifiedBySource,
                                                 overruledStatus, asOf } ] } ],
      pseudonymisationCoverage, residual, measuredAt }

POST /documents/compare   { aId, bId }
  → { textChanges: [ { paragraphIndex, kind: 'added'|'removed'|'changed' } ],
      citationChanges: [ { paragraphIndex, kind, before?, after?,
                           verificationState, verifiedBySource,
                           overruledStatus, asOf } ] }
```
`citationChanges` is **separate from `textChanges` on purpose**. A changed citation
is a different event from changed prose and re-enters verification; a diff that
renders them the same way hides the one change that matters.

Coverage is **measured, not asserted**, and returned on every review so the client
can state it. We never claim complete PII removal.

### Upload and chat — one document, structurally
```
POST /uploads/:id/chat   { question }
  → { answer, passages: [ { page, span, text } ], uploadId }
```
Scoped to a single `uploadId` in the path. **There is no endpoint that accepts two
document ids**, and there must not be — mixing case files in one context makes the
model conflate parties between matters, which is a confidentiality breach between
two of the same advocate's clients and invisible in fluent output.

Answers cite passages **from that document only**. This endpoint returns no
judgment citations; authority questions go to `/search`.

### Counter-arguments
```
POST /arguments/counter   { position, matterId?, judgmentIds? }
  → { arguments: [ { argument, rebuttal,
                     authorities: [ { judgmentId, caseTitle, neutralCitation,
                                      verificationState, verifiedBySource,
                                      overruledStatus, asOf } ] } ],
      excluded: [ { judgmentId, caseTitle, reason: 'set_aside' } ],
      unverifiedReferences: [ { citationClaimed, reason } ] }
```
Grounded only: the model references judgment IDs handed to it in context and never
emits a citation from memory. `set_aside` authorities are **excluded and shown as
excluded with the reason** — silently dropping them would be a silent drop, which
is measured at a zero threshold.

### Saved searches — in-app feed, never a push
```
GET    /saved-searches                → { savedSearches }
POST   /saved-searches   { query, language, filters? } → { savedSearch }
DELETE /saved-searches/:id            → { ok }
GET    /saved-searches/:id/feed ?since → { results, unseenCount }
```
**No push, no badge, no notification of any kind.** PD-5 excluded subject-following
alerts as *"discovery, not an alert — it belongs in the app, never in a
notification"*, and PD-6 warns that a wrong cadence trains advocates to disable
notifications permanently. `unseenCount` is for in-app ordering only and must not
surface as a badge on the app icon or tab bar.

**The endpoint existing is not approval to build the surface.** `FEATURE_PARITY.md`
§3 holds this against PD-5 pending the founder's confirmation of the in-app-feed
reframe. Shipped server-side so it is ready; **do not build the client surface
until that is confirmed.**

*Pagination note:* this is deliberately time-based (`?since`) while `/admin/audit`
is cursor-based (`nextCursor`). A feed is read forward from where the advocate last
looked; an audit ledger is paged through. Two idioms, chosen rather than drifted
into — the graph and treatment endpoints use cursors, matching the ledger.

### Annotations
```
GET    /judgments/:id/annotations                    → { annotations }
POST   /judgments/:id/annotations  { paragraphIndex, span, note?, matterId? }
                                                     → { annotation }
DELETE /annotations/:annotationId                    → { ok }
```
Annotations are private to the user. When `matterId` is set they follow the
matter's sharing rules (PD-3, PD-4) — a note is private by default and shareable
per note, never shared implicitly by attaching it to a shared matter.

## Matters — LCC owns
```
GET    /matters                → { matters }
POST   /matters                { caseTitle, cnrNumber?, court, caseType, parties,
                                 clientName, ourSide, nextHearingDate? } → { matter }
GET    /matters/:id            → { matter, events, documents, briefings }
PATCH  /matters/:id            { ...partial } → { matter }
POST   /matters/:id/events     { eventDate, eventType, orderText?, notes? } → { event }
```

## Matter sharing — LCC owns · PD-3, PD-4
```
GET    /matters/:id/shares        → { shares: [ { id, invitedIdentifier,
                                       invitedUserId?, grantedBy, grantedAt }] }
POST   /matters/:id/shares        { identifier }   // enrolment number or phone
                                  → { share }
DELETE /matters/:id/shares/:shareId → { revokedAt }

PATCH  /matters/:id/events/:eventId  { noteVisibility: 'private'|'shared' }
                                  → { event }
```
**Per matter, by invitation. There is no chamber-wide endpoint and must not be** —
a chamber of two to five is a list of names, not an org chart, and chamber-wide
default sharing is a conflicts hazard.

Revoke sets `revoked_at`; it never deletes the row. Who had sight of a matter and
when is what a conflicts challenge asks later.

A share grants the **court record** plus notes explicitly marked `shared`.
`noteVisibility` defaults to `private` **in the column**, not in application code.
A shared briefing names whose matter it is and carries no private notes — a junior
may be appearing on it at a morning's notice.

## Matter authorities — LCC owns · added 11 Aug 2026
```
GET    /matters/:id/authorities  → { authorities: [ { authorityId, judgmentId,
                                     caseTitle, neutralCitation, addedBy,
                                     addedAt, removedAt } ], asOf }
POST   /matters/:id/authorities  { judgmentId, citationCheckId? }
                                  → { authority }
DELETE /matters/:id/authorities/:authorityId → { removedAt }
```
**Was specced only in a comment before 11 Aug 2026.** `matters/route.ts`'s own
header already described *"`set_aside` disables add-to-matter"* with no table
and no route behind it — the client's "Add to a matter" button had never had
an `onPress`. RCC found the gap reading the code; this closes it.

**Distinct from `judgment_annotations`.** An annotation with a `matterId` saves
a highlighted *passage* (PD-9 item 3) and requires a `quote`. This saves the
*whole judgment* as an authority with nothing highlighted — a different action,
not a duplicate of it. Both enforce the same `set_aside` refusal, independently
— see below.

**`set_aside` disables add-to-matter, and the response NAMES the replacement** —
the one authority Lawmind refuses to let be used at all, enforced server-side
(`409 AUTHORITY_SET_ASIDE`) exactly as `judgment_annotations` already does for
the passage-level path.

**Reads follow shared-matter access** (owner or a live share, same as
`GET /matters/:id`); **writes are owner-only**, matching `POST
/matters/:id/events` rather than the read path — a sharee can see what was
saved but not add to it.

**Re-adding is idempotent, not an error** — `200` with the existing row if the
judgment is already a live authority, `201` if it is new or was previously
removed. Removal sets `removedAt`; it never deletes the row, same reasoning as
`matter_shares`.

**Does not back `saved_authority_moved` (PD-5).** That alert's audience is
derived from `citation_checks` joined through `searches`/`documents`,
independent of this table — verified by reading `citations/fanout.ts`, not
assumed. This is a separate, real product surface: the matter workspace's
accumulated per-case work.

## Briefings — LCC owns
```
GET  /briefings/:id             → { briefing }
GET  /matters/:id/briefings     → { briefings }
POST /briefings/:id/opened      → { ok }
```

## Drafting — LCC owns
```
GET  /documents/types           → { types: [ { type, label, requiredFields } ], consentRequired }
GET  /documents/:id             → { document }   // ADDITIVE, 8 Aug 2026
POST /documents                 { documentType, matterId?, language, inputParams }
                                → { documentId, content, citations, unverifiedReferences }
PATCH /documents/:id            { paragraphs: [{ index, text }] } → { document }
POST /documents/:id/citations   { judgmentId, replacesCitationCheckId? }
                                → { citationCheck }     // re-verifies
DELETE /documents/:id/citations/:citationCheckId → { ok }
POST /documents/:id/export      { format: 'docx'|'pdf' } → { storageKey, url }
```

**`POST /documents/:id/clear-ai-mark` is removed** — PD-8 superseded. There is no
mark on the document to clear. The export carries no watermark; a single line goes
in the **export metadata**, and the citation summary ("4 of 4 citations verified")
renders in the **draft footer in-app only**, derived from `citation_checks` at read
time.

**PD-7 — `PATCH` accepts paragraph prose only.** It no longer takes a whole
`content` blob and **never takes `watermarkRemoved`**. The server re-extracts
citation spans and rejects `422` on any divergence from the authoritative set in
`citation_checks`; the document is not partially saved. Changing an authority goes
through `POST /documents/:id/citations`, which takes a `judgmentId` and re-runs
the verification tiers — never a citation string. Enforcement is server-side; the
client's lock glyph is presentation. See `CITATION_HARNESS.md` §Citations are
locked in editing.

**PD-8 — only `clear-ai-mark` clears the mark.** Editing never does, at any
volume. There is no threshold and no edit counter.

**PD-11/§9b — `docx` is the default export**, PDF second. Styles must survive
intact; citations export as plain text. A mangled export is worse than no export.

## OCR — LCC owns the service and the API
```
POST /ocr/jobs         { storageKey, sourceType, matterId? } → { jobId, status }
GET  /ocr/jobs/:id     → { status, extractedFields, confidenceOverall,
                           lowConfidenceBlocks, confirmedByUser }
POST /ocr/jobs/:id/confirm  { correctedFields } → { ok }
```
Nothing derived from an OCR job is written to a matter until
`/confirm` is called. See `OCR_PIPELINE.md`.

## Court adapter — LCC owns, vendor-agnostic
```
POST /court/lookup   { cnrNumber } → { matter fields } | { available: false }
```
Manual implementation returns `{ available: false }`; client falls back to the
manual form. Nothing above this endpoint changes when OD-1 resolves.

**BUILT 7 Aug 2026.** The full response is
`{ available: false, reason, manualEntry: { expected, message } }`.

**`available: false` is a normal 200, never an error.** Manual entry is
first-class (PD-12) — next dates are given orally in open court and written on the
file, so an advocate typing one is doing the ordinary thing. **Do not render this
as a failure**; `manualEntry.message` carries copy that does not imply one.

`reason` distinguishes `no_adapter_implemented` from `terms_not_on_file`,
`kill_switch_off`, `court_not_permitted` and the rate-limit reasons. The client
shows the same form for all of them; an operator reading a log needs to tell them
apart, and collapsing them is the same mistake as collapsing `miss` into
`not_attempted`.

**It never answers from our own `matters` table.** A CNR is a public case number,
so resolving one against our caseload would let anyone holding a CNR read another
advocate's client name, party names and hearing date.

## Admin — LCC owns the endpoints, RCC owns the UI
Full section-by-section surface, including which of the 17 designed sections have
no endpoint yet: `ADMIN_SURFACE.md`.

```
GET   /admin/llm-costs   ?from&to  → { byDay, byFeature, byModel, byDataClass, total }
GET   /admin/citations   ?from&to  → { total, byVerificationState, byOverruledStatus,
                                       failureRate, silentDropRate, falseVerifiedRate }
GET   /admin/ocr-queue   ?status   → { jobs }
GET   /admin/users       ?status   → { users }
PATCH /admin/users/:id/enrolment  { status } → { user }
```

### Audit ledger — every privileged action writes one row
```
GET  /admin/audit  ?actor&action&targetType&targetId&from&to&cursor
     → { entries: [ { id, actorUserId, actorRole, action, targetType, targetId,
                      before, after, reason, createdAt } ], nextCursor }
```
Read-only. **There is no write endpoint and no delete endpoint** — rows are
written server-side inside the same transaction as the privileged action, so an
action cannot succeed while its audit row fails. See `SCHEMA_TRUTH.md#audit_log`.

### Platform controls — maintenance, kill switches, feature flags
```
GET  /admin/platform                  → { maintenance, killSwitches, flags }
POST /admin/platform/maintenance      { enabled, message? }
     → { maintenance }
POST /admin/platform/kill-switches/:key  { enabled, reason }
     → { killSwitch }
POST /admin/platform/flags/:key       { enabled, rolloutPercent }
     → { flag }
```

**Six** kill switches, fixed set — `search` · `drafting` · `briefings` ·
`ocr_intake` · `signups` · `ecourts_harvest` *(joined the set 7 Aug 2026 —
`SCHEMA_TRUTH.md#platform_config`, database CHECK constraint
`platform_config_kill_switch_keys`)*. `:key` is validated against that set; an
unknown key is a 400, never an implicit create. A disabled feature returns the
app's honest unavailable state, **never a stale cached answer** — the same rule
as an AI outage.

**`reason` is mandatory on every kill-switch toggle** and is written to the
ledger. A switch thrown at 3am with no reason is unreconstructable by the person
who has to decide at 4am whether to throw it back.

Every call here writes `audit_log` **in the same transaction as the config
write** — `platform.maintenance.toggle`, `platform.kill_switch.toggle`,
`platform.flag.set`, each with `before`/`after`. If the ledger write fails the
control does not move. This is the one admin surface where an unrecorded action
is unacceptable: a kill switch changes what every advocate can do, and "who
turned off drafting, and when" must be answerable months later.

`rolloutPercent` is 0–100 and bucketed by a stable hash of `user_id`, so a user
does not flip in and out of a cohort between requests.

Propagation is ≤60s with no deploy, matching model routing. Config is read
through a cached accessor, never a per-request DB hit.

### Cause list sync
```
GET  /admin/cause-lists          ?date&court&status → { syncs, staleCourts, asOf }
POST /admin/cause-lists/:id/retry  → { sync }
POST /admin/cause-lists/:id/escalate { notifyAdvocates: boolean }
     → { sync, briefingsMarked, advocatesNotified, notificationNote }
```
Escalation marks affected briefings `dates_not_confirmed`. An unconfirmed listing
is never presented as confirmed.

**BUILT 7 Aug 2026.** Three notes RCC needs before building against these.

**The two writes return `401` until auth ships.** `retry` and `escalate` change
what advocates receive; an anonymous caller able to escalate could mark every
briefing in the system unconfirmed. Same posture as `POST /verify/confirm`.

**`advocatesNotified` is always `false` today, including when `notifyAdvocates`
is `true`.** Direct notification is S3's and delivery does not exist, so the flag
is accepted and the response says plainly that nobody was told. **Do not render it
as "advocates informed"** — reporting an unsent notification as sent is the same
class of failure as showing an unverified citation as confirmed. `notificationNote`
carries the sentence to show.

**`staleCourts[].lastConfirmedDate: null` means never pulled, not long ago.** A
court we have never set up and a court that broke this morning are different
problems, and collapsing them hides the first inside the second. A sync of `ok`
**or `empty`** counts as confirmed — a court that published no listings has told
us something.

Escalating a sync whose status is `ok` or `empty` returns **`409
NOTHING_TO_ESCALATE`** rather than obeying. A mark that can be applied to a
healthy day teaches advocates that it means "somebody clicked a button".

### Disputed citations
```
GET  /admin/disputes        ?status → { disputes, falseVerifiedRate }
GET  /admin/disputes/:id            → { dispute, citationCheck, judgment, impact:
                                        { savedCount, filedCount } }
POST /admin/disputes/:id/uphold  { correction, reason }
     → { corrected: true, reverificationJobId, affectedSaved, affectedFiled, notified }
POST /admin/disputes/:id/reject  { reason } → { dispute }
```
**Uphold is a fan-out write, not a status change.** It creates a
`citation_fanouts` row and runs the shared operation below. Drives
`falseVerifiedRate`, **target zero**.

### The citation fan-out — one operation, two triggers
Called by **dispute uphold** and by the **overruled re-check**. Do not implement
it twice.

```
applyOverruledChange({ judgmentId, fromStatus, toStatus, trigger, triggerRef })
  → { fanoutId, savedCount, filedCount, copiedCount, notifiedCount }
```
In one transaction:
1. write the corrected `overruled_status` (+ `overruled_status_changed_at`,
   `overruled_paras`, `overruled_note`, `overruled_by_judgment_id`) to `judgments`;
2. enqueue re-verification for **every** `citation_checks` row referencing that
   judgment — everyone who saved it;
3. queue a notice to **every advocate who exported it in a draft**, at the
   severity in `CITATION_HARNESS.md` §When the law moves;
4. queue a notice to **every advocate who copied it out of the app**
   (`citation_copies`), at the **same severity as an export** — in both cases the
   citation has left and we cannot know where it went.

Step 4 reaches the only population that has no other route back to us. Omitting it
leaves the highest-risk user silently uncovered, which is why it is part of the
one shared operation rather than a follow-up.

**Idempotent** on `sha256(judgmentId || toStatus || trigger || triggerRef)`,
enforced by a unique constraint — a double-uphold or an overlapping re-check must
not notify anyone twice. **Partial completion is not acceptable:** if the fan-out
cannot be enqueued the whole operation fails, the dispute stays open and the
re-check run is marked `failed`. Never leave the corpus saying overruled while
the advocate who filed it was not told.

### Training consent — DPDP s. 6, ADDITIVE 9 Aug 2026

**New endpoints. Additive to the frozen contract — RCC, this is a client-facing
surface that needs a screen.**

```
GET    /me/training-consent  → { granted, grantedAt, version,
                                 currentVersion, isCurrent }
POST   /me/training-consent  { version }  → { granted, ... }
DELETE /me/training-consent               → { granted: false, ... }
```

**This is NOT the PD-8 onboarding consent.** DPDP Act 2023 s. 6 requires consent
to be specific to a stated purpose; accepting the terms is not agreeing that an
advocate's own work may train the model. Two separate column pairs, two separate
questions, and the onboarding screen must not silently collect both.

**`DELETE` sits beside `POST` on purpose.** DPDP s. 6(4)–(6): withdrawal must be
**as easy as granting**. One call, same path, nobody's approval, not a support
ticket. It is **idempotent** — withdrawing when nothing was granted succeeds and
reports the true state, because an advocate exercising a right should never meet
an error telling them it was unnecessary.

| field | meaning |
|---|---|
| `granted` | both columns set. **Never inferred from silence** |
| `grantedAt` | null when never granted — an absence reported as an absence |
| `version` | the notice actually agreed to |
| `currentVersion` | what the app should be showing |
| `isCurrent` | false when consent was given against a **superseded** notice |

**`isCurrent` is separate from `granted` deliberately.** Consent to an old notice
is real consent and is *not* consent to the current one. Collapsing them would
let a notice change silently re-authorise everyone, or silently revoke everyone.
`POST` with a version we do not recognise is a **409 `STALE_CONSENT_VERSION`**,
never a coerced write — storing whatever string arrives would record agreement to
a notice nobody can now produce.

### Citator alerts — PD-5, PD-6
```
GET   /alerts            ?since   → { alerts, unreadCount }
POST  /alerts/:id/read            → { ok }
GET   /me/alert-settings          → { settings }
PATCH /me/alert-settings   { savedAuthorityMoved?, ownMatterJudgment?,
                             unknownListing? }  → { settings }
```

**Four triggers, and only four:**

| # | Trigger | Produced by |
|---|---|---|
| 1 | An authority **saved to a matter** is set aside or overruled | the citation fan-out, `savedCount` |
| 2 | An authority **cited in a filed draft** is set aside | the citation fan-out, `filedCount` + `copiedCount` |
| 3 | A judgment **in one of the advocate's own matters** is uploaded | corpus ingest |
| 4 | A matter is **listed on a date they did not enter** | cause list sync |

**Triggers 1 and 2 are implemented by `applyOverruledChange`** (8 Aug 2026 —
`alerts` table, real audiences resolved from `citation_checks`/`documents`/
`citation_copies`, immediate push for `set_aside`/`partly_set_aside`). The
fan-out is the single producer; a second path that notices the same flip would
double-notify. Do not add one.

**Triggers 3 and 4 have no producer yet.** The endpoints are BUILT and the two
settings keys are real and honoured — but nothing in the codebase writes an
`ownMatterJudgment` or `unknownListing` alert today. Trigger 3 awaits the OCR
pipeline (`POST /ocr/jobs`, still SPECCED); trigger 4 awaits a cause-list-to-
matter matcher, which does not exist — `GET /admin/cause-lists` is per-court
sync health, not per-matter, and `services/api/src/court/sync.ts`'s `escalate()`
handles a *different* case (a confirmed date going unconfirmed after a scraper
outage, already surfaced through the briefing's `dateConfidence`, not through
this table). See `docs/FOUNDER_QUEUE.md` §The advocate-facing cause-list
endpoint for the shape trigger 4 will need. Toggling either setting today is
honest and inert, never a fabricated event.

**ADDITIVE, 9 August 2026 — `settings.unavailable`.** Inert was honest in the
code and invisible in the product: an advocate could switch on *"tell me when a
matter is listed on a date I did not know about"*, watch it save, and be told
nothing ever. **They would find out by missing a hearing.** So both settings
responses now carry an extra key:

```
{ settings: { savedAuthorityMoved, ownMatterJudgment, unknownListing,
              unavailable: ["ownMatterJudgment", "unknownListing"] } }
```

**Additive and provisional.** A client that ignores it behaves exactly as
before; a client that reads it can present the switch as not yet working rather
than as working. **The list is DERIVED from the `alert_kind` enum, never
written down** — so when a producer ships and the enum gains its value, the
entry disappears by itself. A hard-coded list would be correct today and wrong,
silently, the moment trigger 3 or 4 lands. Empty array when everything works;
the key is always present, because an absent key means "server too old to know"
and an empty one means "everything works".

**Trigger 2 cannot be disabled.** `PATCH /me/alert-settings` accepts no key for
it; sending one is a `400`. An advocate who has filed a document citing law that
has since moved does not get to opt out of being told.

**Excluded by decision: no subject-following alerts.** New judgments on a
frequently searched subject are discovery, not preparation — they belong in the
app and never in a notification. There is no endpoint for it, and the refusal is
stated on the settings screen rather than hidden.

**Cadence — batched into the evening briefing.** Alerts accumulate into a "since
yesterday" block on the briefing card. **The app does not grow a notifications
tab.** A wrong cadence trains advocates to disable notifications permanently, and
they do not come back.

**Two standing exceptions push immediately:**
1. `set_aside` on a citation in an **exported** draft — this is trigger 2, already
   pushed by the fan-out at the severity in `CITATION_HARNESS.md`. Not
   re-implemented here.
2. A newly discovered listing for **tomorrow** — raised by cause list sync, not by
   the fan-out. Danger-tinted, never gilt.

> `design/screens/IMPLEMENTATION.md` §9b item 8 describes a *single* exception. `PRODUCT_DECISIONS.md`
> PD-6 defines two, and PD-6 is authority. See `design/SCREENS.md` OQ-3.

### Overruled re-check — scheduled
```
POST /admin/overruled-rechecks/run    → { flipped, checked }   // manual trigger
```

**There is no run-history endpoint and no `overruled_rechecks` table.** It was a
job log with one consumer. "Did it run" is answered by the 22:50 alert; "what
changed" by `citation_fanouts` where `trigger = 'recheck'`, which the Citation
monitor already reads. The manual trigger returns its own result synchronously
rather than a job id to poll.
Runs on the `cron` service. Scope: every judgment referenced by an active matter
or an exported draft. Compares live `judgments.overruled_status` against the
status last rendered; each flip calls `applyOverruledChange` with
`trigger: 'recheck'`.

**It does not re-run verification tiers 1–3.** Existence is permanent and stays
cached; only good-law status moves. The run is therefore an indexed corpus read,
not an external API spend — cost is bounded by corpus size, not user count.

**Frequency — recommended: daily at 22:30 IST, immediately before the nightly
hearing sweep, plus event-driven on corpus ingest.**

The event-driven path is what actually delivers freshness: when ingestion sets
`overruled_status` on any judgment, fan out for that judgment at once. The daily
run is the safety net that catches statuses changed by another path — a manual
admin correction, or an upheld dispute whose fan-out failed and was retried.

The tradeoff: hourly buys nothing, because overrulings are published at a court's
pace and the binding latency is **corpus ingest lag**, not re-check frequency —
re-checking hourly against a corpus that syncs daily just re-reads the same rows
at twelve times the cost. Slower than daily is unsafe for one specific reason:
briefings carry authorities, so a re-check that has not run since the last ingest
can put overruled law into tonight's briefing. **22:30 is chosen so the re-check
always completes before briefing generation at 23:00** — that ordering is the
requirement, not the clock time.

### Draft templates
```
GET  /admin/templates                    → { templates }
POST /admin/templates                    { documentType, language, prompt } → { template }
POST /admin/templates/:id/score          → { score, gateResults }
POST /admin/templates/:id/publish        { overrideReason? } → { template }
```
`publish` refuses below score 90 unless `overrideReason` is present, and the
override writes `template.override_gate` to the audit ledger.

### Data & deletion — DPDP
```
GET  /admin/data-requests        ?status → { requests, overdueCount }
POST /admin/data-requests/:id/complete  { artefactStorageKey? } → { request }
POST /admin/data-requests/:id/refuse    { reason } → { request }
GET  /admin/privacy/coverage            → { pseudonymisationCoverage, residual, measuredAt }
```
Coverage is **measured, not asserted**. We never claim complete PII removal —
`PRIVACY_PII.md`.
