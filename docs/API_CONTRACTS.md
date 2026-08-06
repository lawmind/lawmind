# API CONTRACTS

The seam between the two lanes. **RCC builds against this with mocks and never
waits on LCC; LCC implements to it.** Shapes freeze for the sprint — a mid-sprint change requires telling
both consuming lanes.

All responses: `{ ok: true, data: T }` or `{ ok: false, error: { code, message } }`.
Zod-validated inputs. Auth via `Authorization: Bearer <jwt>`.

## Auth — RCC owns
```
POST /auth/magic-link   { email }            → { sent: true }
POST /auth/verify       { token }            → { accessToken, refreshToken, user }
POST /auth/refresh      { refreshToken }     → { accessToken, refreshToken }
POST /auth/logout       —                    → { ok }
GET  /me                —                    → { user }
PATCH /me               { fullName?, preferredLanguage?, barEnrolmentNumber? } → { user }

GET  /terms/current     —                    → { version, body }
POST /me/accept-terms   { version }          → { termsAcceptedAt, termsVersion }
```

**PD-8 — consent replaces the AI-assisted mark.** `POST /me/accept-terms` records
the advocate actively accepting AI assistance, the duty to verify before filing,
and the terms of legal use. It writes `terms_accepted_at` and `terms_version`
together, rejects a `version` that is not the current one, and is **never
inferred** from any other action. An account with no accepted terms cannot
generate a draft — that is the one place this gates, and it gates nothing else.

**Enrolment still never gates** (PD-2). Consent and enrolment are different
things: consent is a condition of drafting, enrolment is a credential that is
merely displayed.

## Search — LCC owns
```
POST /search
  { query, language: 'en'|'hi', filters?: { court?, dateFrom?, dateTo?, caseType? }, matterId? }
  → { results: [ { judgmentId, caseTitle, neutralCitation, reporterCitations,
                   court, judgmentDate, holding, operativeParagraph,
                   verificationState: 'verified'|'unverified'|'failed',
                   verifiedBySource: 'corpus'|'public_x2'|'ecourts'|'none',
                   overruledStatus: 'none'|'set_aside'|'partly_set_aside'|'doubted',
                   overruledByJudgmentId?, overruledParas?, overruledNote? } ],
      unverifiedReferences: [ { citationClaimed, reason } ],
      searchId }
```
Every field from the `judgments` row. Never from model output.
`unverifiedReferences` is never empty-by-omission — anything the model referenced
that no tier confirmed appears here. See `CITATION_HARNESS.md`.

**Three independent fields, not one state.** `verificationState` answers whether
the authority exists; `verifiedBySource` answers who confirmed it and drives the
badge qualifier; `overruledStatus` answers whether it is still good law and is
**independent** — a judgment can be `verified` and `set_aside` at once. Any
response carrying a citation must include all three. A citation missing them is a
bug: the client renders "not confirmed" and reports it.

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
POST /verify/ecourts { citationText } → { ecourtsUrl, prefilledQuery }
POST /verify/confirm { citationText, judgmentId } → { cached: true }

POST /citations/copies
  { judgmentId, matterId?, citationCheckId?, surface, copiedAt, clientKey }
  → { ok }
```
**Every "Copy citation" tap writes a copy record.** An advocate who copies a
citation into their own document is otherwise invisible to the fan-out — they saw
a verified badge, they may file it, and no notification could ever reach them.
That is the user at highest risk, and plausibly a large share of early users: the
ones who trust the search but not yet the drafting.

Copy works offline, so this **queues through the outbox** with `clientKey` as the
idempotency key, like every other local-first write. Never block the copy on the
request — the clipboard write happens immediately and the record syncs after.
Retention and disclosure: `SCHEMA_TRUTH.md#citation_copies`, `PRIVACY_PII.md`.

## Bare acts — LCC owns · ADDED IN S1

**These are additions, not changes.** No existing shape moved, so nothing already
built against this contract breaks. `sprints/SPRINT_1.md` gives LCC the bare acts
library and RCC a bare act reading view, and neither had an endpoint.

```
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

## Briefings — LCC owns
```
GET  /briefings/:id             → { briefing }
GET  /matters/:id/briefings     → { briefings }
POST /briefings/:id/opened      → { ok }
```

## Drafting — LCC owns
```
GET  /documents/types           → { types: [ { type, label, requiredFields } ] }
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

Five kill switches, fixed set — `search` · `drafting` · `briefings` ·
`ocr_intake` · `signups`. `:key` is validated against that set; an unknown key is
a 400, never an implicit create. A disabled feature returns the app's honest
unavailable state, **never a stale cached answer** — the same rule as an AI
outage.

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
GET  /admin/cause-lists          ?date&court&status → { syncs, staleCourts }
POST /admin/cause-lists/:id/retry  → { sync }
POST /admin/cause-lists/:id/escalate { notifyAdvocates: boolean }
     → { briefingsMarked, advocatesNotified }
```
Escalation marks affected briefings `dates_not_confirmed`. An unconfirmed listing
is never presented as confirmed.

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

**Triggers 1 and 2 are already implemented by `applyOverruledChange`.** They are
listed here because they are alerts the advocate receives, **not because anything
new is built** — the fan-out is the single producer, and a second path that
notices the same flip would double-notify. Do not add one.

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
