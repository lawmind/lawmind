# OPERATIONAL ALERTING — DELIVERY PROOF

**Lane:** LCC · **Task:** LCC-5 (P1 RELEASE) · **Date:** 24 Aug 2026
**Status:** an alert reaches a human, proven through the same path a real one
takes. One pre-existing, unrelated alert gap found and NOT fixed here — §6.

---

## 1. What was missing

`ALERT_RULES` has been evaluated inside `GET /admin/metrics` since the endpoint
was written. **Nothing ever delivered one.** The endpoint returns `alerts[]` to
whoever asks, and nobody asks at 3 a.m.

---

## 2. What was built

| file | what it is |
| --- | --- |
| `services/api/src/ops/notify.ts` | `Notifier` behind an interface; Resend the one implementation |
| `services/api/src/ops/alert-poller.ts` | one tick: collect → decide → deliver → record |
| `services/api/src/ops/alert-poller-cli.ts` | `pnpm ops:alert-poll [--inject]` |
| `packages/db/drizzle/0080_ops_alert_deliveries.sql` | the cooldown + delivery ledger |

**Resend, not a paging vendor.** Already the approved transport, key already in
the environment, one HTTP POST, no new account and no new bill — the plan is
explicit that no paid observability vendor is required yet. PagerDuty or SMS is
a later swap behind the same interface, which is why a single implementation has
one.

**One collector, two consumers.** `collectMetrics` was lifted out of the Hono
handler. The route renders it; the poller acts on it. A poller with its own copy
of the thresholds is a poller that disagrees with the endpoint the day one
changes — the same failure `precedential-effect.ts` exists to end, one level
down the stack.

### The four refusals

- **`watch` is never delivered.** It means *something will fail if this
  continues* — for a human reading the endpoint, not for waking one. An alerting
  system that pages on everything gets muted, and then the one that mattered is
  muted too.
- **No second page inside the cooldown** (120 min), keyed on the **rule** rather
  than the message, so a detail line that drifts (`p95 18.1s` → `18.4s`) cannot
  defeat it.
- **A refused delivery does not start a cooldown.** The row is written with the
  provider's own error and the next tick retries. Recording an attempt as if it
  landed is the same lie in a different place.
- **A collector that cannot run becomes its own page** (`metricsUnavailable`).
  "No alerts" and "could not look" are the same silence, and the second is the
  state where an incident is guaranteed to be invisible.

### Never report a send that did not happen

Inherited verbatim from `packages/auth/src/mail.ts`. The console transport is
named **`console (nothing was sent)`** and that string lands in
`ops_alert_deliveries.channel`, so *"were we ever actually paged"* cannot be
answered wrongly by it. `notifierFrom` **refuses to start** in production
without both `RESEND_API_KEY` and `OPS_ALERT_EMAIL` — having a way to send mail
is not the same as knowing who to wake.

---

## 3. A gap the test found, not the design

The cooldown read and the delivery write both live in **the database the poller
is monitoring**. So the one case where the alert matters most — the database
being unreachable — was the case where reading the cooldown threw and **nothing
went out at all**.

Both now fail independently of the send. An unreadable ledger means nothing is
in cooldown and everything goes out; `ledgerReadable: false` says the record is
short. The asymmetry decides the direction: **a duplicate page is a nuisance, a
missing one is the incident nobody hears about.**

---

## 4. Two conditions that did not exist

**`diskFreeFraction`** — the one resource nothing watched, and the one whose
exhaustion is not graceful: PostgreSQL stops accepting writes, the ingest fleet
dies mid-batch, and the first symptom is a 500 rather than a slowdown. Read with
`statfs`, not a shelled-out `df`/`wmic`: a metrics endpoint that spawns a process
during an incident is one that stops working during an incident. Reported as a
fraction so the threshold holds on a workstation and on a small serving box
without per-host tuning.

**Briefing sweep health** — four questions, because they fail separately and
each one alone looks healthy:

1. did the job **run**? — newest `generated_at` (`briefingSweepAgeHours`)
2. was there **work to do**? — matters listed in the next 48 h
3. did it **write** anything? — briefings for those dates
4. did **delivery** happen? — `briefingUndeliveredRate`

(2) is what makes (3) mean anything. *"Zero briefings written"* is correct on a
night when no matter has a hearing and an outage on a night when fifty do —
without the denominator those are the same number. That contradiction is its own
alert, `briefingSweepZeroWrite`, at `page`, because it is not a rate.

**This is the wedge, and it fails silently**: nobody complains about an email
they did not know to expect.

---

## 5. Evidence

### The acceptance test — inject a condition, prove the notification

```
$ pnpm --filter @lawmind/api ops:alert-poll --inject

OPS ALERT — nothing was sent, this is the console transport
THIS IS AN INJECTED TEST CONDITION. No advocate is affected.

[PAGE] longestStatementSeconds — longest running statement is 1245s
[PAGE] injectedDrill — deliberately injected by alert-poller-cli --inject …

environment: development
build: 63128b4eac55757fe92d4f90acb849f8ab6652f7
```

```json
{ "channel": "console (nothing was sent)",
  "delivered": ["longestStatementSeconds", "injectedDrill"],
  "suppressedByCooldown": [], "failure": null }
```

**One of those two was real.** `longestStatementSeconds` at 1,245 s is a live
ingest-fleet statement on this box — the first thing this system ever did was
report a true condition nobody had been told about.

Second run, immediately after:

```json
{ "delivered": [], "suppressedByCooldown": ["longestStatementSeconds", "injectedDrill"] }
```

Ledger:

```
2026-08-24T16:09:30Z  longestStatementSeconds  page  injected=true  failure=none  | console (nothing was sent)
2026-08-24T16:09:30Z  injectedDrill            page  injected=true  failure=none  | console (nothing was sent)
```

### Suites

```
src/ops/alert-poller.test.ts    8 pass  0 fail
src/admin/admin.test.ts        31 pass  0 fail
tsc --noEmit -p services/api    clean
scripts/check-migration-journal.mjs   OK — 81 migrations, journalled, ordered, tracked
```

---

## 6. A DIFFERENT alert gap, found and deliberately not fixed

`scripts/check-alert-coverage.mjs` is **red, and was red before this round**:

```
alert coverage · 2 of 4 PD-5 triggers can fire
  PD-5 "a judgment in one of the advocate's own matters is uploaded" — NO alert_kind value
  PD-5 "a matter is listed on a date they did not know about" — NO alert_kind value
  PD-6 immediate exception "a newly discovered listing for TOMORROW" cannot fire
```

That is **advocate-facing** alerting — a settled product decision the system does
not implement, where the app offers a switch for a notification that cannot be
produced. It is a different subsystem from operational paging and nothing in
this round touched `alert_kind`. Named here so it is not lost, and not folded
into this task: two things called "alerts" are not one thing.

---

## 7. What this does NOT claim

- **Nothing was emailed.** Every proof above ran on the console transport,
  which announces that it sent nothing. `RESEND_API_KEY` is present in this
  environment but `OPS_ALERT_EMAIL` is not, and inventing an address to prove a
  delivery would be the exact dishonesty this file is built against. **One
  founder-queue item: the address to wake.**
- **Nothing is scheduled on this box.** Production scheduling belongs to
  `DEPLOYMENT.md` §cron, and a local task emailing alerts about a dev
  workstation is noise. `pnpm ops:alert-poll` is one tick, exit 1 if a delivery
  was refused, so a scheduler that only watches exit codes still learns the
  thing that matters most — that we could not raise the alarm.
- **The thresholds are not validated against incident history.** There is no
  incident history. They are stated with their reasoning next to the numbers
  they judge, and the first weeks of real pages are what will move them.
- **`briefingSweepAgeHours` cannot fire yet.** `briefings` holds 0 rows on this
  database, so `max(generated_at)` is null and the rule correctly declines to
  page about a job that has never run. It is unexercised against real data.
- **Search-health page conditions are the pre-existing ones**
  (`serverErrorRate`, `degradedRate`, `zeroResultRate`,
  `admissionRefusalRate`). No new search condition was added; what changed is
  that they can now reach a person.
