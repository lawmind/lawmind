# ADMIN SURFACE

Every section of the admin desk, what it reads, what it can *do*, and whether an
endpoint exists. Designed in `design/screens/LawMind Admin.dc.html` — **17
sections**, all interactive in the prototype. Screen numbering: `design/SCREENS.md`
items 31–48.

**Nothing here is built.** This file is the contract so LCC can implement to it, RCC can build against it, and
so the gaps are visible. Endpoint shapes live in `API_CONTRACTS.md`; tables in
`SCHEMA_TRUTH.md`.

## Governing rules

1. **Every privileged action writes `audit_log`** — actor, action, target,
   before/after, timestamp — in the *same transaction* as the action. An action
   cannot succeed while its audit row fails. Append-only: no UPDATE, no DELETE.
2. **The admin consumes the same `tokens.ts` as the app.** No admin-only hex, no
   second palette, no second type scale. Density may differ; values may not.
   (The current renders still show the v2 palette — build from their *layout*.)
3. **The verification badge renders identically in admin and app** — same
   component, same derivation from the three fields in `CITATION_HARNESS.md`. An
   admin triaging a disputed citation must see exactly what the advocate saw, or
   the queue is worthless as evidence.
4. **Rejection never removes access.** Enrolment is a credential, not a gate.

## Status legend
`✅` contracted · `⚠️` partly contracted · `❌` no endpoint yet

---

## 1 · Overview `❌`
**Does:** landing dashboard — KPIs (active advocates, briefings tonight, searches
today, citation failure rate, MRR), 14-day product health chart, "needs a human
today" triage list, live activity stream.
**Reads:** `users`, `briefings`, `searches`, `citation_checks`, `citation_disputes`,
`data_requests`, subscriptions.
**Privileged action:** none — it is a read surface that routes to others.
**Endpoint:** none. Needs `GET /admin/overview` returning the KPI block, the
14-day series and the triage counts. Composed of other sections' reads, so it must
not drift from them — derive it, do not re-implement the counts.

## 2 · Enrolment queue `⚠️`
**Does:** claimed enrolment + corroborating signals side by side; approve, request
a document, or reject; keeps a decision log.
**Reads:** `users` (`bar_enrolment_number`, `enrolment_status`), matters and search
volume as corroborating signal.
**Privileged action:** approve / reject / request document → `enrolment.approve`,
`enrolment.reject`, `enrolment.request_document`.
**Endpoint:** `PATCH /admin/users/:id/enrolment` exists. **Missing:** the
request-document action, and the decision log read. Rejection must not change
access — assert this in a test, not a comment.

## 3 · Advocates `⚠️`
**Does:** filterable table — enrolment state, plan, matters, searches, last seen.
**Reads:** `users`, `matters`, `searches`, subscriptions.
**Privileged action:** none directly; drills into support and enrolment.
**Endpoint:** `GET /admin/users` exists but is enrolment-shaped. Needs filter and
pagination parameters for the table view.

## 4 · Briefings `❌`
**Does:** nightly run table with per-run status, failure retry, and **per-block
composition toggles** (last order · pending applications · authorities ·
checklist) for incident containment — turn off a block that is misbehaving without
a deploy.
**Reads:** `briefings`, `cause_list_syncs`, `matters`.
**Privileged action:** retry a run; toggle a composition block →
`briefing.retry`, `briefing.block.toggle`. Both audited.
**Endpoint:** none. Composition toggles are a live config write — they change what
every advocate receives tonight, so they need the same 60-second propagation and
audit treatment as model routing.

## 5 · Citation monitor `✅`
**Does:** failure rate against a 2.5% alert threshold, failing queries with cause,
and **notify affected advocates** for citations already exported in drafts.
**Reads:** `citation_checks`, `searches`, `documents`.
**Privileged action:** notify affected advocates → `citation.notify_affected`.
**Endpoint:** `GET /admin/citations` — now returns `byVerificationState`,
`byOverruledStatus`, `failureRate`, `silentDropRate`, `falseVerifiedRate`.
Silent-drop and hallucination thresholds stay at **0.0%** (`CITATION_HARNESS.md`).

## 6 · Corpus & ingestion `❌`
**Does:** sources with sync lag and health, coverage by court and year, full
reindex trigger.
**Reads:** `judgments`, `judgment_chunks`.
**Privileged action:** trigger a full reindex → `corpus.reindex`. Expensive and
destructive to query latency; must be rate-limited and audited.
**Endpoint:** none.

## 7 · LLM spend & routing `⚠️`
**Does:** cost by day / feature / model, **live model routing per feature**
(applies in 60s, no deploy), budget caps and throttles.
**Reads:** `llm_calls`.
**Privileged action:** change routing; set a budget cap → `llm.route.set`,
`llm.budget.set`.
**Endpoint:** `GET /admin/llm-costs` exists (read only, and already returns
`byDataClass`). **Missing:** every write — routing, caps, throttles.
**Open gap — see `OPEN_DECISIONS.md` OD-6:** routing is keyed by *feature*, but a
feature handles both public judgment text and uploaded documents, so feature alone
cannot express a data-class rule. Do not resolve this here.

## 8 · Subscriptions `❌`
**Does:** plans and prices, coupons with kill toggles, payment history.
**Reads:** subscriptions, payments.
**Privileged action:** create/kill a coupon; change a plan price →
`billing.coupon.kill`, `billing.plan.update`.
**Endpoint:** none on the admin side. `GET /subscription/plans` and
`POST /subscription/checkout` are the advocate-facing pair. Prices: `PRD.md`.

## 9 · Support inbox `❌`
**Does:** tickets with the advocate's context auto-attached; quick remedies —
grant searches, escalate.
**Reads:** `users`, `searches`, `matters`, subscriptions.
**Privileged action:** grant a search allowance; escalate →
`support.grant_allowance`, `support.escalate`. Granting allowance is a billing
side-effect and must be audited.
**Endpoint:** none.

## 10 · Push campaigns `❌`
**Does:** audience picker, composer, lock-screen preview, send history.
**Reads:** `users`, `matters` (for audience predicates).
**Privileged action:** send a campaign → `push.campaign.send`. Irreversible and
outward-facing; requires an explicit confirm step and an audience-count preview
before send.
**Endpoint:** none.

## 11 · Platform controls `✅`
**Does:** maintenance mode, **5 kill switches** (`search` · `drafting` ·
`briefings` · `ocr_intake` · `signups`), feature flags with percentage rollout.
**Reads:** `platform_config`.
**Privileged action:** every control on the page →
`platform.maintenance.toggle`, `platform.kill_switch.toggle`,
`platform.flag.set`.
**Endpoint:** `GET /admin/platform`, `POST /admin/platform/maintenance`,
`POST /admin/platform/kill-switches/:key`, `POST /admin/platform/flags/:key`.

Contracted ahead of S6 because this is the one admin surface where an unrecorded
action cannot be tolerated. A kill switch changes what every advocate can do, and
*who turned off drafting, and when* must be answerable months later.

Three rules that are not optional:
- **`reason` is mandatory** on every kill-switch toggle, enforced by a check
  constraint on `platform_config`, and written to the ledger. A switch thrown at
  3am with no reason is unreconstructable by whoever decides at 4am whether to
  throw it back.
- **The ledger write is in the same transaction as the config write.** If the
  audit row fails, the control does not move.
- **Kill-switch keys are a fixed set.** An unknown key is a 400, never an implicit
  create — a typo must not produce a switch nobody is watching.

A disabled feature returns the app's honest unavailable state, never a stale
cached answer. Propagation ≤60s, no deploy.

## 12 · Staff & audit `✅`
**Does:** roles and permissions; the append-only audit ledger.
**Reads:** `users` (staff), `audit_log`.
**Privileged action:** change a role → `staff.role.set`. Self-referential: the
role change is itself audited.
**Endpoint:** `GET /admin/audit` — read-only, cursor-paginated, filterable by
actor, action, target and date. No write endpoint and no delete endpoint exists
**by design**. Role writes are still missing.

## 13 · Analytics `❌`
**Does:** cohort retention grid, feature usage, and the activation metric that
predicts retention — **two briefings opened in week one**.
**Reads:** `users`, `briefings`, `searches`, `documents`.
**Privileged action:** none.
**Endpoint:** none.

---

# Added in the refined bundle

Four sections, each closing a failure mode the app cannot recover from on its own.

## 14 · Cause list sync `✅`
**Does:** per-court pull time, item count and status. Every briefing is built from
a scraped cause list, and **a parser that silently returns an empty list is worse
than an outage** — briefings still go out, with stale dates.
**Reads:** `cause_list_syncs`, `briefings`, `matters`.
**Privileged action:** retry a pull; escalate → `causelist.retry`,
`causelist.escalate`.
**Endpoint:** `GET /admin/cause-lists`, `POST /admin/cause-lists/:id/retry`,
`POST /admin/cause-lists/:id/escalate`.
**Fixed escalation policy:** retry once → mark affected briefings
`dates_not_confirmed` → notify affected advocates directly. **We never present an
unconfirmed listing as confirmed** — the same rule as citations.

## 15 · Disputed citations `✅`
**Does:** the trust feedback loop. An advocate reports that a badge was wrong.
**This queue outranks everything else in the admin.**
**Reads:** `citation_disputes`, `citation_checks`, `judgments`, `documents`.
**Privileged action:** uphold or reject → `dispute.uphold`, `dispute.reject`.
**Endpoint:** `GET /admin/disputes`, `GET /admin/disputes/:id`,
`POST /admin/disputes/:id/uphold`, `POST /admin/disputes/:id/reject`.

**Uphold is a fan-out write, not a status change.** It calls the shared
`applyOverruledChange` operation — **the same one the nightly overruled re-check
calls.** One transaction:
1. write the correction to the corpus (`judgments`);
2. enqueue re-verification for **every** `citation_checks` row referencing that
   judgment — everyone who saved it;
3. queue a notice to **every advocate who exported it in a draft** — it is already
   in a filed document;
4. queue a notice to **every advocate who copied it out of the app**
   (`citation_copies`), at the same severity as an export.

Idempotent on `sha256(judgmentId || toStatus || trigger || triggerRef)`, enforced
by a unique constraint on `citation_fanouts`: a double-uphold, or an uphold racing
the nightly re-check, must not notify anyone twice. Partial completion is not
acceptable — if the fan-out cannot be enqueued the uphold fails and the dispute
stays open. Tracks the **false-verified rate**, whose target is **zero**.

**Do not build a second fan-out.** An admin upholding a dispute and a scheduled
job noticing the same flip require identical work; two implementations would
drift, and the one that drifts is the one that stops notifying.

## 15a · Overruled re-check `✅` (scheduled, no UI of its own)
**Does:** re-checks `overruled_status` for every judgment referenced by an active
matter or an exported draft. Overruled status is **never cached** —
`CITATION_HARNESS.md`.
**Reads:** `judgments`, `citation_checks`, `matters`, `documents`,
`citation_copies`.
**Privileged action:** manual trigger → `overruled.recheck.run`. Flips call
`applyOverruledChange`.
**Endpoint:** `POST /admin/overruled-rechecks/run` only. **No run-history
endpoint and no table** — "did it run" is the 22:50 alert, "what changed" is
`citation_fanouts` where `trigger = 'recheck'`, which the Citation monitor
already reads.
**Schedule:** daily 22:30 IST on the `cron` service — **before** briefing
generation at 23:00, so tonight's briefings cannot carry overruled authorities —
plus event-driven on corpus ingest. Surfaces in the Citation monitor and in
"needs a human today" when a run fails.

## 16 · Draft templates `✅`
**Does:** 10 document types, each prompt **versioned** and scored against a
200-item golden set reviewed by a practising advocate. Catches quality regressions
no error rate surfaces — a template can drift for weeks while returning 200s.
**Reads:** `draft_templates`, `documents`.
**Privileged action:** publish a version; override a failing gate →
`template.publish`, `template.override_gate`.
**Endpoint:** `GET /admin/templates`, `POST /admin/templates`,
`POST /admin/templates/:id/score`, `POST /admin/templates/:id/publish`.
**Gates:** court-format compliance · no invented citations · no overruled
authority cited as good law · AI mark present · Hindi parity.
**Nothing ships below 90 without a founder override**, and the override writes to
the audit ledger with a mandatory reason.

## 17 · Data & deletion `✅`
**Does:** DPDP Act obligations with a **visible clock per request** — export,
correction, erasure. States retention plainly and tracks **pseudonymisation
coverage (99.2%)**, the number behind the privacy disclosure the app shows.
**Reads:** `data_requests`, `pii_entities`, `users`.
**Privileged action:** complete or refuse a request → `data_request.complete`,
`data_request.refuse`.
**Endpoint:** `GET /admin/data-requests`,
`POST /admin/data-requests/:id/complete`, `POST /admin/data-requests/:id/refuse`,
`GET /admin/privacy/coverage`.
Coverage is **measured, not asserted**, and the residual 0.8% is disclosed rather
than hidden. We never claim complete PII removal — `PRIVACY_PII.md`.
Blocked by **OD-2** (DPDP data residency) for public launch, not for build.

---

## Designed but absent · contracted but undesigned

| | |
|---|---|
| **`GET /admin/ocr-queue` is contracted but no OCR review queue is designed** | Consistent with **OD-7** blocking scanned intake. `design/SCREENS.md` item 33. |
| **10 of 17 sections have no write endpoint** | Overview, Briefings, Corpus, Subscriptions, Support, Push and Analytics have none at all; Enrolment, Advocates and LLM routing are read-only or partial. Platform controls was in this list and is now contracted. |
| **The overruled re-check has no designed surface** | It runs on `cron` and reports into Citation monitor and "needs a human today". If it deserves its own panel, that is a design question — not resolved here. |
