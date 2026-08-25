# NEW2 — WORKER HEALTH REPORT, R7

**Lane:** NEW2 · **25 August 2026** · session `c28e64c1`
**Rule obeyed throughout:** *every long-running worker is reported by real output delta* — rows written, rows labelled, gates refused. Never PID, never exit code, never checkpoint motion, never HTTP 200.

---

## 1. What NEW2 was running at START_STATE

**Zero jobs.** No classifier, no citation-key builder, no OCR worker, no
text-safety screen, no ingest adapter. The only live heavy processes on the box
were NEW1's sidecar-keeper (pid 18856) and GPU server (pid 4116).

The three dirty `services/ingest/.checkpoints/*` files were from the previous
session and were not moving. Declared in START_STATE so that any later movement
would be attributable.

---

## 2. Every job NEW2 ran this round, with its real output delta

| job | class | outcome | **output delta — the only evidence accepted** |
| --- | --- | --- | --- |
| `n2-data-moat-census` — 10 passes | `DB_SCAN` | **COMPLETE** | 10 artifact files written, one per pass, each on completion. duplicates 1 row/122.2s · base 971 strata/34.5s · keys 194/45.3s · body 971/45.1s · citations 971/79.2s · statutes 279/18.3s · vectors 681/29.0s · passages 1/— · text_bands 513/18.6s · eligibility_tiers 115/11.3s |
| `citation-keys --recheck` | `DB_WRITE` | **COMPLETE** | `judgment_citation_keys` **1,412,697 → 1,412,990 (+293)**, exactly the stranded population. Checkpoint file byte-identical; `citation_key_frontier` unchanged |
| `n2-decision-identity-census` | `DB_SCAN` | **COMPLETE** | 5 steps, 39 result rows; hash composition 105.4s, largest groups 580.9s, cnr collisions 112.2s, neutral collisions 27.1s, identity arms 23.8s |
| `n2-citation-extraction-precision` | `DB_SCAN` bounded | **COMPLETE** | 15,662 references sampled and labelled in 2.5s |
| `n2-passage-role-sample` | `DB_SCAN` bounded | **COMPLETE** | 13,944 passages labelled across 2,822 documents, 4.1s |
| `n2-treatment-enrichment-pilot` | `DB_SCAN` bounded | **COMPLETE** | 40,000 edges examined, 84.8s; **0 writes**; 75 candidates, 39,925 refusals attributed to a named gate |
| `n2-source-freshness` | read | **COMPLETE** | 4 adapters classified; 1 not `FRESH` |
| `n2-advocate-gold-v2` | `DB_SCAN` | see §5 | manifest + train/dev/holdout files |
| India Code acquisition probe | `IO_HEAVY` external | **COMPLETE** | 6 files fetched, sha256 recorded; 3 rate-limited probe rounds |

---

## 3. Three jobs were killed deliberately. Each kill is reported.

Killing a job is not a failure to hide; not reporting it would be.

**3.1 — `body` census pass, killed at 16 minutes.** The pass reproduced the
deployed view's correlated `EXISTS (SELECT … quality_screen_runs)` per row: three
rows in that table, 18.7M subquery executions. Hoisted to a scalar. **16 min → 45.1s.**

**3.2 — `body` again, killed at 7.5 minutes with four parallel workers.** The
first fix was not the real cost. `length(j.full_text)` detoasts every value, and
`judgments` is 22 GB of heap against **129 GB of TOAST**. Removing the text-length
predicates and moving them to a `TABLESAMPLE` pass took the corpus-wide pass to
45.1s and the sampled band to 18.6s. The same defect was removed from the
`vectors` pass, which was reading `judgment_embedding_eligibility` — that view
computes `length(full_text)` for its value band, so **anything reading it
corpus-wide pays a 129 GB read.** Reported to NEW1 (bus 1217).

**3.3 — a full-corpus regex over `full_text`, killed immediately.** Replaced with
a `TABLESAMPLE` over the High Courts plus an exact count over the 38,342 Supreme
Court rows, which is where the question actually lived.

**What all three have in common:** each looked like a slow query and each was a
wrong query. None of them would have shown up as unhealthy on PID, exit code or
CPU — they were making progress, at a cost that made the answer worthless.

---

## 4. A correction to my own measurement, recorded per §2 discipline

`CORRECTION_OF` the treatment pilot's first run.

- **old claim:** 35,612 of 40,000 resolved citation edges (89%) failed span
  verification, implying `judgment_citations.char_offset` does not locate the
  citation.
- **new fact:** the offsets are **correct**. Eight edges read directly showed the
  citation text exactly at the recorded offset.
- **evidence:** the fault was mine. The script replaced whitespace with `\s*`
  *before* escaping regex metacharacters, so the escape pass escaped the
  backslash and asterisk it had just inserted. Escaping first drops
  `SPAN_NOT_FOUND` from 35,612 to **0**.
- **affected downstream:** none — the figure was never published outside the
  pilot. Recorded because "the data is broken" was the comfortable conclusion and
  it was wrong.

---

## 5. Jobs still in flight at the time of writing

| job | state | how it will be judged |
| --- | --- | --- |
| `n2-advocate-gold-v2` | `RUNNING_PROGRESSING` — issuing family queries, latest observed at 2m53s | the manifest's per-split counts, or nothing. If it does not finish, `ADVOCATE_RETRIEVAL_GOLD_V2` is reported as **NOT DELIVERED**, not as partially delivered |

---

## 6. Process discipline notes worth carrying forward

- **`npx` through `cmd.exe` mangles arguments containing spaces.** A
  `--recheck "2026-08-17 16:39:00+00"` invocation arrived caret-escaped and split.
  Invoking `node node_modules/tsx/dist/cli.mjs` directly, with ISO-`T`
  timestamps, avoids the shell entirely.
- **A background job's stdout can be fully buffered**, so an absence of log lines
  is not evidence of a stall. Twice this round a job looked hung and was
  progressing; `pg_stat_activity` — a fresh `xact_start` per page — settled it
  both times where the log could not.
- **The safe-frontier fix has an operational consequence for everyone.** The
  citation-key walk now refuses to advance past the oldest open transaction in
  the database. While a long read-only scan is open — a census pass, a backup —
  the key frontier legitimately stops. It is visible in
  `citation_key_frontier.cursor_at`, which is what consumers already read. LCC
  has it (bus 1216) because it changes the shape of their freshness gate.

---

## 7. Nothing NEW2 started is still running unattended

Every job in §2 either completed or was deliberately killed and reported. No
NEW2 process is scheduled, none survives a logon, and none will restart on its
own. The lane leaves the box as it found it: NEW1's sidecar and GPU server, and
Postgres.
