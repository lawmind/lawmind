# eCOURTS AUTHORISATION — the grant, and what has to happen before we use it

The founder applied to the government registrar for permission to harvest eCourts
data. **It was granted on 7 August 2026.**

That resolves the objection at its root. The concern was never scraping — it was
**unauthorised** access under ss. 43 and 66 of the IT Act, and written
authorisation removes it. Going through the front door was the better route and it
was the founder's call; the engineering position had been to treat the CAPTCHA as
a wall.

**The adapter is built. The audited kill switch was turned ON on 29 August 2026**
(founder decision, `CLAUDE.md` §6a). No eCourts HTTP request was made in that
work — the switch grants permission, it does not initiate traffic, and there is
no cron or poll behind it. `guard.decide()` now returns `allowed` for a permitted
court, so the cause-list/observation tooling reaches the network the next time it
is run; the parser, raw-capture writer and pilot remain a separate technical task.

---

## FOUNDER DECISION — 29 AUGUST 2026 (eCourts only)

Recorded as a decision made on this date, not a restatement of an earlier one.
Canonical text lives in `CLAUDE.md` §6a; this file is reconciled to it.

- **Full written authorization for eCourts** covers the scope already represented
  by `services/api/src/court/authorisation.ts` — the enumerated
  `permittedDataTypes` (court names, case status, cause lists, caveat search,
  court orders, judgments). The earlier "bulk cause-list harvesting only" wording
  is superseded.
- **Authorized CAPTCHA bypass** applies across that eCourts scope, under the
  unchanged mechanical conditions in `CLAUDE.md` §6.
- **The conservative operational limits stand** unless the written authorization
  states more specific ones: 2,000 ms minimum interval, 100 requests/hour,
  1,000 requests/day, expiry January 2029.
- **`ECOURTS_GRANT_ATTRIBUTION`** is an internal audited attribution string, not
  a grant-mandated quotation (no mandatory wording is recorded in this repo). Its
  runtime value is configured; it stays out of tracked source and out of normal
  logs.
- **Founder/admin actor:** `users.id 3d37f77f-23f3-4eb0-b34f-d1700ec652a5`, a
  durable non-fixture admin actor, its placeholder display name corrected. This
  is the actor named on the activation audit row.
- **eCourts only.** The separate SCI / Supreme Court automated-access question is
  untouched and still contested (`FOUNDER_QUEUE.md` FQ-LCC-R10-1 point 2).

Closes the eCourts half of FQ-LCC-R10-1 and all of FQ-ECOURTS-ACTOR.

---

## STATUS, 17 AUG 2026: THE SWITCH CAN MOVE. IT IS THE LAST LOCK LEFT

|                                   |                                                                 |
| --------------------------------- | --------------------------------------------------------------- |
| Grant made                        | **7 Aug 2026**                                                  |
| Scope, per the founder 8 Aug 2026 | **all available data**                                          |
| CAPTCHA bypass                    | **expressly permitted** — see below, rule changed               |
| Expires                           | **January 2029**, then **renewable for payment**                |
| Kill switch `ecourts_harvest`     | **ON, 29 Aug 2026** — audited kill-switch path, actor `3d37f77f…` |
| Conditions transcribed            | **YES**, 8 Aug 2026 — corrected 17 Aug, this row said `NO` for nine days after it stopped being true |
| Requests ever made                | **0**, and the ledger can show it                               |

> **This heading previously read "AWAITING THE LETTER'S NUMBERS — the switch
> cannot move", and it was wrong for nine days.** NEW3 read it, nearly acted on
> it, and flagged it instead (bus 0617). Recording that rather than quietly
> editing it: a status table that is stale in the SAFE direction still costs
> someone a day, and this one was blocking a founder instruction.

**Verified by execution, 17 Aug 2026, not by reading:**

```
AUTHORISATION is null?  false
expiresAt               2029-01-01T06:30:00.000Z
permittedCourts         ALL_COURTS
hoursIst                {"from":0,"to":24}
captchaBypass           true
expired now?            false
```

`guard.ts` checks its locks cheapest-and-most-absolute first: terms on file,
then expiry, attribution, **then** the kill switch. Terms and expiry now pass.
Activation additionally requires the confidential wire attribution and the
audited kill-switch flip; neither is inferred from the existence of the grant.

**Turning it on does not start any traffic, and that is measured, not assumed.**
The only caller of `fetchCauseList` is `retryCauseList` — an authenticated,
attributable admin request. There is no cron, no scheduler and no poll. So the
freeze concern raised in bus 0617 does not apply to the switch itself: it grants
permission, it cannot initiate a fetch.

**What the flip still needs — operational inputs, not a renewed permission decision.**
`audit_log.actor_user_id` is `NOT NULL`, and `admin/platform.ts` is explicit that
*"a config change with no audit trail is worse than no change."* Of the six
switches this is the one where that is not an internal nicety: it authorises
contacting a court's systems under a registrar's written grant, and *"we are not
sure who turned it on"* is the answer that loses the grant. There is no founder
identity in `users` — 53 rows, all test accounts — so naming one would be a false
audit record.

The command is built and needs only that id (`FQ-ECOURTS-ACTOR`):

```
pnpm --filter @lawmind/api kill-switch ecourts_harvest --on \
  --actor <the founder's users.id> \
  --reason "founder confirmed the grant stands, 17 Aug 2026 (bus 0617)" --apply
```

It writes the config row and the audit row in ONE transaction, refuses an
`--actor` that is not in `users`, is dry by default, and afterwards prints
`decide()`'s verdict for a sample court — so the operator sees what the switch
actually bought instead of assuming it bought permission.

### The CAPTCHA rule changed — 8 Aug 2026, on the founder's authority

The standing rule was _"never bypass; the advocate always solves it."_ **The
grant expressly permits the bypass, and the rule is updated accordingly** in
`CLAUDE.md` §6.

This is not a softening. The rule existed for exactly one reason —
**unauthorised** access under IT Act ss. 43/66 — and written authorisation
removes that reason. What replaces it is narrower and mechanical:

- **`captchaBypassPermitted` is a field ON the grant**, not a constant or an env
  var, so the permission **expires with the authorisation automatically** in
  January 2029. Nobody will remember that date in 2029; the code does. Read it
  only through `captchaBypassAllowed()`, which checks grant-exists **and**
  not-expired **and** expressly-permitted, because a caller checking one
  condition is a caller who eventually checks only one.
- **Scope is the enumerated data types in `authorisation.ts`** (including case
  status, cause lists, orders and judgments), and network traffic remains inside
  the guarded `court/ecourts.ts` adapter. Tier 3 per-citation confirmation still
  hands the advocate the door:
  `citations/verify.ts` holds no HTTP client and the test asserting that
  **stays**. Two different acts under two different parts of the grant, and
  collapsing them is how a bounded permission becomes an unbounded one.
- **Bypass is not exemption.** Every such request still passes the rate limiter
  and still writes the fetch ledger.
- `onExpiry: 'renewable_for_payment'` is recorded so the renewal is a diarised
  commercial decision, **not something discovered by an advocate seeing an empty
  cause list on a hearing morning.**

Tested in `services/api/src/court/guard.test.ts` — the assertions are about
**expiry and absence**, not the happy path: bypass is refused with no grant on
file, refused the day after expiry, and refused when the letter is silent.

`CLAUDE.md`: _if the authorisation's terms are not in the repo, the switch stays
off._ **An unbounded harvest under a bounded permission is the fastest way to lose
the permission**, and the loss would be permanent in a way an outage never is.

So the guard refuses everything while the terms are absent — **including with the
kill switch turned on.** That ordering is deliberate: an operator who flips the
switch before the conditions are recorded has not granted themselves permission,
they have only turned a handle.

---

## Remaining activation inputs

The enforceable conditions are already transcribed in
`services/api/src/court/authorisation.ts`; `AUTHORISATION` is non-null. No
condition defaults to unlimited. The remaining runtime inputs are operational,
not a renewed permission decision:

| field                     | what it is                           | if the letter is silent                                                           |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `reference`               | the letter's own reference           | it has one; use it                                                                |
| `grantedOn` / `expiresOn` | ISO dates                            | **grants are not perpetual.** If no expiry is stated, set one year and diarise it |
| `attribution`             | the attribution string, **verbatim** | use the organisation name as the registrar knows it                               |
| `permittedCourts`         | courts the grant covers              | list only what is named. A court not listed is not covered                        |
| `permittedHoursIst`       | hours requests may be made, IST      | if unrestricted, `{ from: 0, to: 24 }` — written deliberately, not left out       |
| `minIntervalMs`           | minimum gap between requests         | 2000                                                                              |
| `maxRequestsPerHour`      | volume ceiling                       | 100                                                                               |
| `maxRequestsPerDay`       | volume ceiling                       | 1000                                                                              |

**A condition the letter does not state is transcribed at the conservative value,
never omitted.** An absent limit must never read as permission — the same rule
that stops a null `ocr_confidence` from reading as a confidence of zero.

1. Supply confidential `ECOURTS_GRANT_ATTRIBUTION` in the target environment so
   every request carries the required identity. The letter reference is optional
   for runtime but belongs in the restricted compliance store, not this repo.
2. Turn the switch on with a real actor and reason through the audited admin path.

```sql
UPDATE platform_config
SET enabled = true, reason = '<why, and referencing the grant>', updated_at = now()
WHERE key = 'ecourts_harvest';
```

**Gap closed 8 Aug 2026.** `POST /admin/platform/kill-switches/:key` is now
**BUILT**, so prefer it over the hand-written statement above: it validates the
key against the fixed set of six, requires a `reason`, and writes
`platform_config` **and** `audit_log` in one transaction — if the ledger write
fails the switch does not move. Flipping `ecourts_harvest` by hand still works
but leaves no audit row, which for this particular switch is exactly the
provenance a registrar might later ask for.

---

## How adherence is proved, not promised

Permission always arrives with conditions — volume, frequency, hours, attribution.
They are enforced as configuration rather than trusted to memory, because a limit
somebody remembers is a limit that gets exceeded on the day they are not looking.

- **`services/api/src/court/guard.ts`** is the only path to the network. Terms →
  expiry → kill switch → court → hours → frequency → hourly volume → daily volume.
- **`ecourts_fetch_ledger`** records every request **and every refusal**, with
  timestamp, endpoint, court, and which transcription of the grant was in force.
  Refusals are rows because the ledger's other job is to show the locks held.
- **The limiter counts from the ledger, not from memory.** A restart must not hand
  us a fresh quota we were not granted.
- **Refusals do not consume quota.** A burst of refusals must not lock out the
  requests the grant actually allows.

If the registrar asks whether we stayed inside the grant:

```sql
-- everything we did, by day and court
SELECT date_trunc('day', requested_at) AS day, court, outcome, count(*)
FROM ecourts_fetch_ledger GROUP BY 1, 2, 3 ORDER BY 1 DESC;

-- the busiest hour we ever had, against the ceiling
SELECT date_trunc('hour', requested_at) AS hour, count(*)
FROM ecourts_fetch_ledger WHERE outcome <> 'refused'
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
```

**That is a query, not a promise.** It is the difference between being able to
answer the registrar and having to reassure them.

---

## What this does NOT permit

**Tier 3 citation verification is unchanged and is not covered by this grant.**
We hand the advocate the eCourts URL and the text to paste, **and the advocate
solves the CAPTCHA.** Nothing on the server ever solves one.
`services/api/src/citations/verify.ts` contains no HTTP client and
`services/api/src/court/guard.test.ts` asserts it, along with asserting that no
module outside the adapter names an eCourts host at all.

The two are different acts under different authority and must not drift into each
other. A Tier 3 confirmation is cached permanently **because a human personally
vouched for it** — if a scraper ever wrote that row, "the advocate confirmed this"
would silently become "a vendor said so", and those are not the same fact.

**Never circumvent an access control without written authority, and never buy
data whose access provenance cannot be demonstrated.**
That is why `ecourtsIndia` and the other scraper-resellers stay out even now that
we have our own permission: buying from someone who circumvented a control is the
same act at one remove.

---

## The letter

The grant was made 7 Aug 2026; enforceable conditions were transcribed 8 Aug and
corrected 17 Aug. Its identifying reference, signatory and verbatim attribution
are confidential at the registrar's request and therefore belong in the
restricted compliance store/runtime secret, not source control. This is not a
missing-authorization state. The guard refuses live traffic only when the
required runtime attribution is absent, the grant has expired, the audited switch
is off, or an operational limit would be exceeded.
