# API CONTRACTS

The seam between lanes. CX1 and CX2 build against this with mocks; they never
wait on LCC. Shapes freeze for the sprint — a mid-sprint change requires telling
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
```

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

```
GET /judgments/:id → { judgment with fullText }
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

## Matters — LCC owns
```
GET    /matters                → { matters }
POST   /matters                { caseTitle, cnrNumber?, court, caseType, parties,
                                 clientName, ourSide, nextHearingDate? } → { matter }
GET    /matters/:id            → { matter, events, documents, briefings }
PATCH  /matters/:id            { ...partial } → { matter }
POST   /matters/:id/events     { eventDate, eventType, orderText?, notes? } → { event }
```

## Briefings — CX2 generates, LCC serves
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
PATCH /documents/:id            { content?, watermarkRemoved? } → { document }
POST /documents/:id/export      { format: 'pdf'|'docx' } → { storageKey, url }
```

## OCR — CX2 owns the service, LCC serves the API
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

## Admin — CX2 owns
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

### Overruled re-check — scheduled
```
GET  /admin/overruled-rechecks        → { runs, lastRun, flippedLast30d }
POST /admin/overruled-rechecks/run    → { recheckId }   // manual trigger
```
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
