# Railway shutdown — the exact founder actions

**A separate file from `MIGRATION_RUNBOOK.md` on purpose: nothing here may be
run until §7 of that runbook is fully ticked.** Every step below is
irreversible or close to it, and the corpus is 20 million judgments that took
weeks of proxy-limited ingestion to assemble.

> **THE ONE RULE ON THIS PAGE.** Railway is the rollback path. It stays up,
> billing, until the local copy AND the R2 backup are **independently
> verified** — verified meaning `compare.mjs` reports 0 FAIL on exact row
> counts, and the R2 backup has been downloaded again and byte-compared. A
> month of Railway is cheaper than the corpus. **Do not shorten this.**

---

## 0 · THE GATE — do not scroll past this

Run this and read the verdict. It is the whole decision:

```bash
node scripts/migration/manifest.mjs --source railway --exact --label railway-final \
     --out docs/ops/migration/manifest-railway-final.json
node scripts/migration/manifest.mjs --source local   --exact --label local-final \
     --out docs/ops/migration/manifest-local-final.json
node scripts/migration/compare.mjs \
     --a docs/ops/migration/manifest-railway-final.json \
     --b docs/ops/migration/manifest-local-final.json \
     --out docs/ops/migration/compare-final.json
```

`VERDICT: source and target agree on schema, structure and exact row counts.`
is the only output that opens this page. Anything else — stop.

Then confirm the backup is a backup and not an upload:

```bash
node scripts/migration/backup-r2.mjs --verify-only backups/postgres/<stamp>-full
```

---

## 1 · ORDER OF OPERATIONS

Cheapest and most reversible first. **Each step is separated by a soak period on
purpose** — most migration damage is discovered by using the system, not by
inspecting it.

| # | action | reversible? | wait before the next step |
| --- | --- | --- | --- |
| 1 | Point every worker and the API at `LOCAL_DATABASE_URL` | yes, trivially | **48 h of real use** |
| 2 | **Stop** Railway services (do not delete) | yes, one click | **7 days** |
| 3 | Take a final Railway backup, independent of ours | n/a | — |
| 4 | Delete the Railway Postgres service | **NO** | — |
| 5 | Delete the remaining Railway project resources | **NO** | — |

**Step 2 is where the money stops.** A stopped service is not billed for
compute; a retained volume is billed for storage, which is the small number.
**Steps 4 and 5 save relatively little and are the only irreversible ones** —
there is no hurry, and the value of a week's rollback window is much higher than
a week of idle-volume storage cost.

---

## 2 · STEP 1 — REPOINT THE WORKERS AND API (reversible)

Local `.env` already carries both, so switching is one variable and rollback is
the same variable back:

```
DATABASE_URL=postgresql://postgres:<pw>@127.0.0.1:5432/lawmind      # local
RAILWAY_DATABASE_URL=postgresql://postgres:<pw>@hayabusa.proxy...   # kept for rollback
```

Restart the fleet from its recorded inventory:

```bash
node scripts/migration/freeze.mjs thaw --target local
```

That prints the 37 supervised jobs exactly as they were running, and starts
none of them — a human starts them, because replaying 37 command lines into a
shell automatically is how twenty workers end up pointed at the wrong database.

**Then prove it by row growth, never by process count.** Four ways the fleet
looks alive while doing nothing are already documented; a `ps` output is not
evidence. Watch the counts move.

---

## 3 · STEP 2 — STOP THE RAILWAY SERVICES (reversible, and this is where billing stops)

**CLI, not the dashboard** — the console is not a blocker and never was:

```bash
railway login
railway link                       # select the LawMind project
railway status                     # list services, confirm what is about to stop
railway down                       # stops the current service's deployment
```

Do the API/worker services **first** and the Postgres service **last**. Stopping
Postgres first would break anything still pointed at it and turn an orderly
shutdown into an incident.

**Verify billing actually stopped** rather than assuming: check the Railway usage
page after 24 h. A service that redeploys itself from a webhook is still
billing, and the whole point of this exercise is the invoice.

---

## 4 · STEP 3 — A FINAL RAILWAY-SIDE BACKUP, INDEPENDENT OF OURS

Before anything is deleted, take Railway's own backup of the Postgres service
and download it. **Ours and theirs should both exist at the moment of deletion.**
Two copies made by two different tools fail in different ways; two copies made
by the same tool share a bug.

---

## 5 · STEPS 4–5 — DELETION (IRREVERSIBLE)

Only after the 7-day soak, and only with §0 still passing. Once the Postgres
service is deleted **the volume goes with it and no support ticket brings it
back.**

```bash
railway service delete             # confirm the service name, twice
```

Then remove anything else still billable: unused environments, cron jobs,
volumes, and any service kept "just in case". Retain nothing billable unless
something explicitly requires it.

---

## 6 · WHAT MUST BE TRUE FOREVER AFTER

The moment Railway is gone, **this workstation holds the only live copy of the
data moat.** That changes what routine maintenance means, and the following stop
being optional:

- **The R2 backup is the disaster-recovery plan and it must stay current.** A
  backup from before the shutdown is worth progressively less every day the
  local corpus grows. Schedule `backup-r2.mjs` and check the receipts.
- **A backup is not verified until it has been read back.** `backup-r2.mjs`
  does this by default and it is free on R2 — egress costs nothing there. Do
  not "optimise" that step away.
- **Bounded rotation, not unlimited accumulation** (`--keep`). This whole
  migration exists because of a bill.
- **The cluster restarts itself** via the `LawMindPostgres` scheduled task at
  logon. Verify that after the first reboot rather than trusting it — an
  auto-start that has never been observed starting is a belief.
- **`data_checksums` is on** in the local cluster, as it was on Railway. Silent
  corruption on a single consumer NVMe with no cloud replica is the failure this
  catches, and it is now the only thing that catches it.

---

## 7 · ROLLBACK, IF ANY OF THIS GOES WRONG BEFORE STEP 4

While Railway still exists, rollback is one environment variable:

```
DATABASE_URL=<the Railway url, kept in .env as RAILWAY_DATABASE_URL>
```

Restart the fleet. Everything written locally since cutover is lost unless it is
dumped and re-restored upward — which is why the soak periods in §1 are measured
in days, and why step 4 waits until the local database has actually been used in
anger rather than merely inspected.
