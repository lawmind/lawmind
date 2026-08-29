# THE CURRENT JOB TABLE

**One table. No narrative.** Regenerate the live view with `pnpm job:health`; this
file is the human-readable snapshot and the ownership record behind it.

Last reconciled: **29 August 2026, LCC (R10)**.

**R10 addition — the delta reaches four of six named consumers.** Measured
against NEW2's scheduled cycle of 29 Aug 04:51:24Z–05:00:33Z, which wrote
**1,334 judgments**:

| consumer | reached | of eligible | state |
| --- | ---: | ---: | --- |
| exact / lexical (`full_text_tsv`) | 1,334 | 1,334 | AT FRONTIER |
| `lcc-citations-extract` | 1,334 | 1,334 | AT FRONTIER |
| `lcc-paragraphs-apply` | 1,334 | 1,334 | AT FRONTIER |
| `lcc-citation-keys` | 95 | **95** | AT FRONTIER |
| statute-reference | 0 | 1,334 | **NOT WIRED** — last output 13 Aug 12:38 |
| NEW1 embedding | 0 | 1,334 | **NOT WIRED** — manifest-driven, not delta-driven |

**The 95 is not a gap, and the denominator is the whole reason.** 95 of 1,334 is
7.1% and reads like a stalled worker. `judgment_citation_keys` only holds rows
for a judgment that HAS a citation, and exactly 95 of the 1,334 carry a
`neutral_citation` or a non-empty `reporter_citations`. The builder is at 95 of
95. **Check the denominator before filing a coverage number as a defect.**

Both LCC cursors sit on the delta's own frontier exactly — same timestamp, same
row id:

```
judgments   max(created_at)  2026-08-29 04:55:22.134122+00
citation-keys.json  cursorAt 2026-08-29 04:55:22.134122+00  id ee04adc0-35b0-4b23-b454-6d1da92d0a83
paragraphs-0_1.json cursorAt 2026-08-29T04:55:22.134Z       id ee04adc0-35b0-4b23-b454-6d1da92d0a83
```

**A flat durable-output metric is not evidence of a dead job.** NEW1's HEAVY_BOX
lease read `count(*) FROM new1_doc_vector_stage` static at 2,360,247 for four
hours and I concluded the job was dead. It was live and had moved on to an HNSW
index build, a phase that does not write that metric. The box was busy; a
measurement taken then read 198.7 s for a statement that takes 25.0 s quiet.
Sample `pg_stat_activity` and read what it says.

**`resource-lease.mjs status` and `acquire` can disagree on the same lease.**
Observed 28 Aug on `HEAVY_BOX`: `status` said "process DEAD" while `acquire`
said "held by NEW1 (process HEALTHY)". The record (`.json`) was stale and the
lock (`.lock`) was current — a takeover had written the lock and not the record.
**The lock file is the truth.** Read it before writing a `--force --reason`.

`.agents/jobs/registry.jsonl` is the declaration; `pnpm job:health` is the
observation. **Where they disagree, the observation wins** and the registry gets a
new line — that reconciliation is what this round did.

---

## Live

| job | owner | state | durable output | rate | last useful progress | startup mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| `new1-doc-vector-embed` | NEW1 | RUNNING | `new1_doc_vector_stage` rows | ~31,067 vectors/h | 27 Aug 11:57Z — 7,747 inserted in-batch | agent-launched (NEW1 stage-runner) |
| `new1-gpu-sidecar` | NEW1 | RUNNING, **consumer-bound** | none — stateless HTTP | n/a | `/health` ok, CUDA resident | agent-launched, kept by `new1-sidecar-keeper` |
| `new1-sidecar-keeper` | NEW1 | RUNNING (**silent by design**) | the CONSUMER's vectors — a watchdog has no output of its own | n/a | 26 Aug 05:06Z in its log, which records ONLY anomalies | `Lawmind-new1-sidecar-keeper`, 5 min, LOGON |
| `lcc-alert-poll` | LCC | RUNNING | `.agents/ops/alerts.jsonl` receipts | 1 tick / 10 min | 27 Aug — 42 receipts, +1 | `Lawmind-alert-poll`, 10 min, LOGON |
| `lcc-citation-keys` | LCC | RUNNING | `judgment_citation_keys` | 50,994 rows in 8 s | 27 Aug 10:46Z — cursor at the live frontier | `Lawmind-citation-keys`, 15 min, LOGON |
| `lcc-citations-extract` | LCC | RUNNING | `judgment_citations` | 20,000/pass | 27 Aug — frontier 50,994 → 0 | `Lawmind-citations`, 15 min, LOGON |
| `lcc-paragraphs-apply` | LCC | RUNNING | `judgment_paragraphs` | ~230 judgments/s | 27 Aug — frontier 50,994 → 121 | `Lawmind-paragraphs`, 15 min, LOGON |

All three are RUNNING as of 27 Aug 18:12 local. They were briefly PAUSED for a
full-suite window and that was a **mistake** — see "Three states this table exists
to keep apart" below. They are what keeps `citation_key_dirty` empty and the key
cursor at the frontier, so pausing them is what made three live-corpus tests red.

If one ever does need pausing, declare it (`job-register retire <id> --state
PAUSED --reason "..."`) rather than leaving it RUNNING with no process, and resume
with:

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
| `n2-resolver-risk-replay.mts --write` | NEW2 | writes an ADJUDICATED-EVIDENCE row. **Must be re-run after every citation-key advance, and nothing does it.** `readKeyFreshness` compares the replay's `frontier_at` with the live cursor as TEXT, so every advance of the index invalidates the replay vouching for it — on a corpus that ingests daily the resolver gate is STALE by default and CURRENT only in the minutes after somebody runs this by hand. Ran three times on 27 Aug for exactly that reason. It belongs in NEW2's daily cycle, after the key walk and before the consumers; not scheduled unilaterally by LCC because the row it writes is NEW2's evidence, not ours. LCC R9 §2 and §8b, bus 1418. |
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
- **Pausing the pipeline is not a quiet window.** Three tests assert that
  `citation_key_dirty` is empty and the key cursor is at the frontier. Those are
  properties of a system whose downstream jobs are RUNNING, not of a frozen
  corpus — and the jobs listed above are the only things that discharge a mark or
  advance the cursor. Stopping them to "quieten" the corpus is what made those
  tests red on 27 Aug. If a test needs the corpus still, ask the WRITERS to hold;
  never stop the consumers.
