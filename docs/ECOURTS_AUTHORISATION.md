# eCOURTS AUTHORISATION — the grant, and what has to happen before we use it

The founder applied to the government registrar for permission to harvest eCourts
data. **It was granted on 7 August 2026.**

That resolves the objection at its root. The concern was never scraping — it was
**unauthorised** access under ss. 43 and 66 of the IT Act, and written
authorisation removes it. Going through the front door was the better route and it
was the founder's call; the engineering position had been to treat the CAPTCHA as
a wall.

**The adapter is built and it is switched off.** Nothing in this codebase has ever
made a request to eCourts. Two independent locks hold, and this document is one of
them.

---

## STATUS: AWAITING TERMS — the switch cannot move

| | |
|---|---|
| Grant made | **7 Aug 2026** |
| Kill switch `ecourts_harvest` | **off**, created off in migration 0013 |
| Conditions transcribed | **NO** — `services/api/src/court/authorisation.ts` holds `null` |
| Requests ever made | **0**, and the ledger can show it |

`CLAUDE.md`: *if the authorisation's terms are not in the repo, the switch stays
off.* **An unbounded harvest under a bounded permission is the fastest way to lose
the permission**, and the loss would be permanent in a way an outage never is.

So the guard refuses everything while the terms are absent — **including with the
kill switch turned on.** That ordering is deliberate: an operator who flips the
switch before the conditions are recorded has not granted themselves permission,
they have only turned a handle.

---

## What the founder still owes, and it is small

**Three steps, in this order. Any one alone leaves the door shut.**

**1. Transcribe the letter into `services/api/src/court/authorisation.ts`.**
Replace `AUTHORISATION = null` with the object. Every field is required — there is
no partial transcription, and nothing defaults to "unlimited":

| field | what it is | if the letter is silent |
|---|---|---|
| `reference` | the letter's own reference | it has one; use it |
| `grantedOn` / `expiresOn` | ISO dates | **grants are not perpetual.** If no expiry is stated, set one year and diarise it |
| `attribution` | the attribution string, **verbatim** | use the organisation name as the registrar knows it |
| `permittedCourts` | courts the grant covers | list only what is named. A court not listed is not covered |
| `permittedHoursIst` | hours requests may be made, IST | if unrestricted, `{ from: 0, to: 24 }` — written deliberately, not left out |
| `minIntervalMs` | minimum gap between requests | 2000 |
| `maxRequestsPerHour` | volume ceiling | 100 |
| `maxRequestsPerDay` | volume ceiling | 1000 |

**A condition the letter does not state is transcribed at the conservative value,
never omitted.** An absent limit must never read as permission — the same rule
that stops a null `ocr_confidence` from reading as a confidence of zero.

**2. Record the letter itself.** Reference, date, signatory and stated conditions,
in this file below. The transcription in code is what the machine enforces; this
is what a human checks it against.

**3. Turn the switch on, with a reason.**

```sql
UPDATE platform_config
SET enabled = true, reason = '<why, and referencing the grant>', updated_at = now()
WHERE key = 'ecourts_harvest';
```

**Known gap, stated rather than papered over:** the admin write endpoint
`POST /admin/platform/kill-switches/:key` is S6 and still SPECCED, so today this
is a hand-written statement and **it therefore does not write `audit_log`.** The
transaction that would pair the two does not exist yet. Until S6, the reason
column and this document are the record.

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

**Never circumvent an access control, and never buy data from someone who did.**
That is why `ecourtsIndia` and the other scraper-resellers stay out even now that
we have our own permission: buying from someone who circumvented a control is the
same act at one remove.

---

## The letter

> **Not yet recorded.** Paste the grant's reference, date, signatory and stated
> conditions here, then complete step 1 above. Until this section is filled in,
> `AUTHORISATION` stays `null` and the guard refuses every request.
