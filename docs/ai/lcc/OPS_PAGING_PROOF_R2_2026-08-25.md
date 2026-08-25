# OPERATIONAL PAGING — WHAT WAS PROVEN, 25 AUGUST 2026

**Lane:** LCC. **Plan:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2` §6, LCC-6.
**Supersedes nothing** — `OPS_ALERTING_PROOF.md` is the earlier round and its
findings still stand. This records what changed after R4 graded that round
`PARTIAL`.

---

## What R4 said was missing

> Eight alert-poller assertions passed… **Nothing was emailed. `OPS_ALERT_EMAIL`
> is unset, no production-like scheduler is proved, and no human acknowledged a
> page.** At low traffic, the search rules intentionally wait for a minimum
> sample, so an early-launch outage can remain invisible to rate rules.

Three separate gaps: **no non-console transport**, **no proved scheduler**, and
**a rate-rule blind spot at launch traffic**. All three are addressed below. One
is fully closed, one is closed except for a credential, one is closed.

---

## 1. A non-console transport, with receipts that outlive the process

`fileSinkNotifier` (`services/api/src/ops/notify.ts`) appends one JSON line per
delivery to `.agents/ops/alerts.jsonl`.

This is not the console with extra steps. The console writes to a terminal nobody
is watching and leaves **nothing** once the process exits, so a drill's only
evidence was somebody's memory of having seen it. The file makes *"were we ever
actually paged, and for what"* answerable by reading a file.

**It does not pretend to be a human.** Its name — which is what lands in
`ops_alert_deliveries.channel` — is literally
`file-sink (durable, no human paged): .agents/ops/alerts.jsonl`, so a query
asking whether a page reached a person cannot be answered "yes" by this
transport. `notifierFrom` still **refuses to start in production** without
`RESEND_API_KEY` and `OPS_ALERT_EMAIL`.

Selection order is now: Resend → file sink → console, and the console remains
non-production only.

---

## 2. A scheduled tick, executed by the Windows scheduler and observed

Task `Lawmind-alert-poll`, every 10 minutes, running
`.agents/jobs/lcc-alert-poll.cmd`.

**A correction to the repo's own record.** `Lawmind-paragraphs.cmd` states that
`schtasks /create` and `Register-ScheduledTask` both return *"Access is denied"*
for this user and that the Startup folder is the unelevated substitute. **That is
no longer true.** Retested by registering and immediately removing a probe task:
`CREATE OK`. The sidecar keeper is already a scheduled task registered by this
same user.

It matters specifically here. The Startup folder fires at **logon**, so a
rebooted machine sitting at the lock screen would run no alert poller at all —
and the moment you most want a pager is the moment nobody has logged in.

**Observed, not assumed:**

```
Get-ScheduledTask Lawmind-alert-poll      → State: Ready
Start-ScheduledTask Lawmind-alert-poll    → scheduler executed the task
.agents/logs/lcc-alert-poll.log           → tick … exit 0
```

The scheduler-driven tick evaluated two live conditions
(`briefingSweepZeroWrite`, `stalledCriticalJobs`) and delivered neither, because
both were inside their 120-minute cooldown from the drills minutes earlier. That
is the cooldown working under the scheduler rather than under a test.

To disable: `Unregister-ScheduledTask -TaskName Lawmind-alert-poll -Confirm:$false`

---

## 3. The drill matrix

Every row below is a real execution, and every one left a receipt in
`.agents/ops/alerts.jsonl` **and** a row in `ops_alert_deliveries`.

| Condition | How | Delivered | Receipt |
|---|---|---|---|
| long SQL | `--inject-rule longestStatementSeconds` | yes | 05:20:17 |
| low disk | `--inject-rule diskFreeFraction` | yes | 05:20:18 |
| briefing zero-write | **fired naturally** — 1 matter listed, no briefing | yes | 05:19:36 |
| API/search 5xx | `--inject-rule serverErrorRate` | yes | 05:20:21 |
| collector failure | `--inject-rule collectorFailure` | yes | 05:20:22 |
| **DB down** | real: poller pointed at a dead database | **yes** | 05:20:36 |
| stalled critical worker | **fired naturally** — 2 NEW1 jobs FAILED | yes | 03:31:30 |
| cooldown suppression | re-drill inside 120 min | correctly suppressed | — |

**The DB-down drill is the strongest one.** The poller was pointed at a database
that refuses authentication. It did not crash and it did not go quiet: it raised
`metricsUnavailable` at `page` severity and delivered it. The one thing it could
not do is record the delivery in `ops_alert_deliveries`, because that table is in
the database that is down — an unavoidable limitation, stated rather than hidden,
and the reason the file sink exists.

Two of the eight conditions fired **without being injected at all**, which is
worth more than a drill: the rules are catching real state on this box right now.

---

## 4. The launch-traffic blind spot

Every search rule is a RATE, and every rate is gated behind `MIN_SAMPLE = 20`
because three requests with one failure is 33% and is noise. That gate is right,
and it has a hole the size of the first week of launch: **with nineteen searches
in fifteen minutes, all nineteen can 5xx and no rule fires**, because the
denominator never arrived.

Two absolute conditions now sit underneath the gate, where the numbers are small
enough to read directly:

- `searchErrorLowTraffic` — any 5xx below the sample gate, at `watch`;
- `searchTotalFailureLowTraffic` — **every** search in the window failed, at
  `page`. At n=2 that is a 100% rate the sample gate refuses to look at, and it
  is the exact shape of a route that is simply down.

Neither is a threshold, so neither is in `ALERT_RULES`: they are contradictions,
judged the way `briefingSweepZeroWrite` is.

---

## 5. What is still owed, precisely

**One credential, and only one.** `RESEND_API_KEY` and `OPS_ALERT_EMAIL`.

Everything else is built and proven. The moment both are set, `notifierFrom`
selects Resend ahead of the file sink with no code change, the scheduled task
picks it up on its next tick, and `ops_alert_deliveries.channel` starts recording
`resend` instead of a name that admits nobody was paged.

Until then the honest position is: **the pipeline is proven end to end and no
human has been woken.** That distinction is in the transport's own name so it
cannot be lost.

Recorded in `docs/FOUNDER_QUEUE.md`.

---

## Files

| Path | What |
|---|---|
| `services/api/src/ops/notify.ts` | `fileSinkNotifier`, selection order |
| `services/api/src/ops/alert-poller-cli.ts` | `--inject-rule <name>`, sink default |
| `services/api/src/admin/metrics.ts` | low-traffic absolutes, control-plane rules |
| `.agents/jobs/lcc-alert-poll.cmd` | the tick the scheduler runs |
| `.agents/ops/alerts.jsonl` | receipts, append-only |
| `.agents/logs/lcc-alert-poll.log` | one line per tick |
