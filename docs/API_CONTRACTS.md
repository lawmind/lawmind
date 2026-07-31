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
```

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
**Uphold is a fan-out write, not a status change.** In one transaction it must:
write the correction to `judgments`; enqueue re-verification for every
`citation_checks` row referencing that judgment; and queue a notice to every
advocate who exported it in a draft. Idempotent on `disputeId` — a double-uphold
must not double-notify. Partial completion is not acceptable: if the fan-out
cannot be enqueued, the uphold fails and the dispute stays open. Drives
`falseVerifiedRate`, **target zero**.

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
