# THE CURRENT JOB TABLE

**One table. No narrative.** Regenerate the live view with `pnpm job:health`; this
file is the human-readable snapshot and the ownership record behind it.

Last reconciled: **27 August 2026, LCC (R9)**.

`.agents/jobs/registry.jsonl` is the declaration; `pnpm job:health` is the
observation. **Where they disagree, the observation wins** and the registry gets a
new line — that reconciliation is what this round did.

---

## Live and paused

| job | owner | state | durable output | rate | last useful progress | startup mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| `new1-doc-vector-embed` | NEW1 | RUNNING | `new1_doc_vector_stage` rows | ~31,067 vectors/h | 27 Aug 11:57Z — 7,747 inserted in-batch | agent-launched (NEW1 stage-runner) |
| `new1-gpu-sidecar` | NEW1 | RUNNING, **consumer-bound** | none — stateless HTTP | n/a | `/health` ok, CUDA resident | agent-launched, kept by `new1-sidecar-keeper` |
| `new1-sidecar-keeper` | NEW1 | RUNNING (**silent by design**) | the sidecar answering `/health` | n/a | 26 Aug 05:06Z — it logs ONLY anomalies | `Lawmind-new1-sidecar-keeper`, 5 min, LOGON |
| `lcc-alert-poll` | LCC | RUNNING | `.agents/ops/alerts.jsonl` receipts | 1 tick / 10 min | 27 Aug — 42 receipts, +1 | `Lawmind-alert-poll`, 10 min, LOGON |
| `lcc-citation-keys` | LCC | **PAUSED** | `judgment_citation_keys` | 50,994 rows in 8 s | 27 Aug 10:46Z — cursor at the live frontier | `Lawmind-citation-keys`, 15 min, LOGON |
| `lcc-citations-extract` | LCC | **PAUSED** | `judgment_citations` | 20,000/pass | 27 Aug — frontier 50,994 → 0 | `Lawmind-citations`, 15 min, LOGON |
| `lcc-paragraphs-apply` | LCC | **PAUSED** | `judgment_paragraphs` | ~230 judgments/s | 27 Aug — frontier 50,994 → 121 | `Lawmind-paragraphs`, 15 min, LOGON |

The three PAUSED are paused **deliberately**, for the full-suite quiet window, with
their scheduled tasks disabled alongside. Resume:

```powershell
Enable-ScheduledTask -TaskName Lawmind-citation-keys, Lawmind-citations, Lawmind-paragraphs
Start-ScheduledTask  -TaskName Lawmind-citation-keys
node scripts/job-register.mjs claim lcc-citation-keys --pid <wrapper pid> --lane LCC ...
```

## Manual — started by a human, never by a launcher

| job | owner | why it is MANUAL |
| --- | --- | --- |
| ingest fleet (`scripts/start-ingest-fleet.ps1`) | NEW2 | its work is DERIVED per round from the upstream delta. A logon launcher re-runs a STATIC width plan, which is how six courts held ~0 while the launcher reported success. `Lawmind-ingest.cmd` stays `.disabled-frontier-closed`. |
| `tier-census --reset` / `doc-vector-batches --reset` | NEW1 | full sequential scans of an 18.7M-row, 151 GB table. Takes `HEAVY_BOX`. |
| `n2-resolver-risk-replay.mts --write` | NEW2 | writes an ADJUDICATED-EVIDENCE row. **Must be re-run after every citation-key advance** or the resolver gate closes on its own; see LCC R9 §2. |
| `release-export-cli` / `release-restore-cli` | LCC | release rehearsal, never a background job. |

---

## What "one owner per logical job" actually rests on

**Not `enrich-worker.cmd`.** Its live-node check has a hole the width of its own
backoff — the loop spends 30 s to an hour with no node process, and a second
wrapper starting in that window sees nothing. Measured 27 Aug: three hand-started
wrappers plus three scheduled tasks produced **six wrapper shells and three
concurrent `citations` workers on the same rows**.

The guarantee is the scheduled task's **`MultipleInstances = IgnoreNew`**, which
Windows enforces and nothing can race. One task per worker; the task is the owner;
the 15-minute trigger restarts a wrapper that died. Duplicates are refused with
`0x800710E0`.

**So: do not hand-start `enrich-worker.cmd` while its task exists.**
`Start-ScheduledTask -TaskName Lawmind-<name>` is the only supported way in.

---

## Startup, honestly

```
BOOT   1 mechanism   LawMindPostgres — Windows service, LocalSystem, recovers
                     with nobody logged in
LOGON  5 mechanisms  alert-poll · new1-sidecar-keeper · citation-keys ·
                     citations · paragraphs
```

**A rebooted machine sitting at the lock screen runs Postgres and nothing else** —
including no pager. Boot-triggered tasks need elevation and were probed and
refused (`AtStartup` + `LogonType S4U` → *Access is denied*). `FQ-LCC-R9-1`.

`pnpm job:health` prints this split every run under `UNATTENDED RECOVERY`, so it
is visible rather than remembered.

---

## Three states this table exists to keep apart

- **A process being alive does not prove progress.** `new2-paragraphs-apply` was
  declared `IDLE_CAUGHT_UP` with a live pid; that pid was a bare `cmd /K` shell
  whose loop had exited at the freeze.
- **A process being absent does not prove completion.** `lcc-citation-keys` has no
  node process between passes and is healthy.
- **Silence is not always a stall.** `new1-sidecar-keeper` logs only anomalies, so
  33 hours of nothing is its correct output. Verify it against the sidecar's
  `/health`, never against its log.
