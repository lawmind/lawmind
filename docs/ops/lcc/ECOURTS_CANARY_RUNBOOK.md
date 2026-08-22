# eCourts — the one-canary runbook

**Status: PREPARED, NOT RUN. No request has been made.**

P8 of the LCC round is explicit: *"No live request yet unless the founder
resolves the actor and explicitly authorizes the canary."* This file exists so
that authorization can be acted on in minutes rather than designed under
pressure, and so that a future agent finds a procedure instead of improvising
one against a bounded permission.

Written 22 Aug 2026 by LCC against the code as it stands. Every claim below was
read out of the code or the database, not remembered.

---

## 1. What is already enforced, in code, today

`services/api/src/court/guard.ts` `decide()` refuses in this order, and each
refusal is a distinct `reason` string rather than a boolean:

| order | reason | what it means |
| --- | --- | --- |
| 1 | `terms_not_on_file` | the registrar's conditions are not transcribed into `court/authorisation.ts`. **Outranks the kill switch** — if we cannot state the terms, we may not act on them |
| 2 | `authorisation_expired` | compared as an INSTANT, not a date: the grant expires at 12:00 on its final day, and a date-only comparison would grant a silent extra twelve hours |
| 3 | `kill_switch_off` | `platform_config.ecourts_harvest` is off. **A missing row reads as OFF** |
| 4 | `court_not_permitted` | `ALL_COURTS` is checked explicitly, because an empty list means "none" and the two must never be confused |
| 5 | `outside_permitted_hours` | IST, from the grant |

`record()` writes `ecourts_fetch_ledger` for every request — **including every
refusal**. "Did we stay inside the grant" is answerable by query rather than by
anyone's memory, and a refused request is evidence too.

Storage is already split, and the split is the point (`0061`):

- `ecourts_observation` — what the registry SAID, raw, never edited
- `ecourts_transition` — what we DERIVED from a sequence of observations
- `ecourts_fetch_ledger` — what we ASKED for, when, and what happened

All three exist in the database today, and the ledger already holds **52 rows**
from the refusal path — the gate has been observed refusing, repeatedly, without
a single live request ever being made. Confirmed by query, not assumed.

---

## 2. What is NOT resolved, and what it blocks

**`FQ-ECOURTS-ACTOR` — the genuine actor.** A request identifies somebody. Who
that is — the company, a named advocate, an account the registrar issued — is a
founder decision, and it is not derivable from anything in this repository. It
blocks the canary completely: making a request as an unresolved actor is exactly
the overreach that loses a grant.

**Founder authorization for the canary itself.** Separate from the actor, and
also not an engineering call. An agent's recommendation is not approval — the
global correction addendum says so in terms, and this file does not close either
item.

---

## 3. LISTED IS NOT A HEARING

The rule, restated where it will be acted on rather than only where it was
written:

> A cause-list entry says a matter was **LISTED**. It does not say a hearing
> **OCCURRED**, and it certainly does not say what happened at one.

Matters are adjourned, benches do not assemble, items are passed over, and the
list itself is amended after publication. An advocate told "your hearing
happened on the 11th" when the item was passed over has been told something
false about their own case by a product that was supposed to be watching it.

So: `ecourts_observation` records the listing as a listing. `ecourts_transition`
may derive "the next hearing date moved" from two observations. **Neither may
ever write "heard" from a cause list alone**, and no code path in this repository
does today.

---

## 4. The canary, when it is authorized

**One court, one day, one request. Then stop and read.**

```
# 0. PRECONDITIONS — all three, checked, not assumed
#    a. FQ-ECOURTS-ACTOR resolved and the actor written down
#    b. founder authorization for THIS canary, recorded in FOUNDER_QUEUE.md
#    c. the registrar's conditions transcribed in court/authorisation.ts
#       (if absent, decide() already refuses with terms_not_on_file)

# 1. Confirm the gate refuses BEFORE you open it. A gate that was never
#    observed refusing is a gate nobody has tested.
pnpm --filter @lawmind/api kill-switch --key ecourts_harvest --off \
  --actor-email <admin> --reason "pre-canary: prove the refusal" --apply
#    -> then attempt the fetch and expect reason=kill_switch_off in the ledger.

# 2. Open the switch, with a reason. The reason is required by the schema and
#    by the audit trigger; it is what a later question actually needs.
pnpm --filter @lawmind/api kill-switch --key ecourts_harvest --on \
  --actor-email <admin> --reason "canary: <court>, <date>, authorized <ref>" --apply

# 3. ONE request. One court, one cause-list date.

# 4. Read the ledger before anything else runs.
SELECT requested_at, court, endpoint, outcome, http_status, duration_ms,
       authorisation_reference, refusal_reason
  FROM ecourts_fetch_ledger ORDER BY requested_at DESC LIMIT 10;

# 5. CLOSE THE SWITCH. Immediately, whatever the outcome.
pnpm --filter @lawmind/api kill-switch --key ecourts_harvest --off \
  --actor-email <admin> --reason "canary complete" --apply
```

**Step 5 is not optional and not "later".** The switch defaults off for a
reason; an open switch after a canary is an unbounded harvest waiting for the
next process that happens to call `decide()`.

---

## 5. What the canary must produce to count as a pass

Not "it worked". Four artefacts, or it did not happen:

1. **A ledger row for the refusal in step 1** — the gate observed refusing.
2. **A ledger row for the real request**, with the grant reference recorded
   there (and NOT in `decide()`'s `detail`, which is one field away from a
   client payload — the registrar required the letter's identifying details stay
   out of the application).
3. **A raw `ecourts_observation` row**, unedited, whatever it contains.
4. **A ledger row for the switch closing**, in `audit_log`, with its reason.

If the response is unparseable, THAT is the result and the raw observation is
still preserved. A canary that discovers our parser is wrong has done its whole
job.

---

## 6. Caps, and what is not built

The grant's numeric caps live in `court/authorisation.ts` and `decide()` enforces
the ones expressible as a predicate (courts, hours, expiry). **A cumulative
request cap across a window is not enforced in code today** — it is enforceable
by query against `ecourts_fetch_ledger`, which is why the ledger records
refusals as well as successes, but nothing refuses on it automatically.

That is a gap and it is stated rather than papered over. For a ONE-request
canary it does not bind. Before any repeated harvest it must be built, and the
shape is a `decide()` branch counting rows in the ledger over the grant's own
window.

---

## 7. If the grant lapses

`captchaBypassPermitted` is a field ON the grant, so it expires WITH the grant,
automatically, in January 2029 — never by anyone remembering to turn it off.
`decide()` returns `authorisation_expired` from that instant. Nothing needs to be
done to make the product safe when the grant ends; something needs to be done to
make it work again, which is the correct direction for a permission to fail.
