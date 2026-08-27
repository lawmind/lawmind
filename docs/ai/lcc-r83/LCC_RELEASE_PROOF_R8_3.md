# LCC — R8.3 RELEASE PROOF (§10 LCC-9)

**Lane:** LCC · **Session:** `73dcdd62` · **Window:** `HEAVY_BOX` held from 2026-08-26T19:33Z
**Plan:** `LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md`
(`sha256 0211a3be…45f43b`)

Everything here was OBSERVED in this window. Where a check did not run, or ran
and failed, it says so and says whose it is.

---

## 1 — Fresh-install replay · **PASS**

The question: can a database built from empty, by replaying every migration in
order, reach the schema the live database runs? It is a different question from
"is the live database correct", and until it was answered migration `0087` was
proven **forward-applied** and **not** proven **replayable** — I applied it with
`apply-migration-online.mjs`, which executes the SQL and does *not* write
`drizzle.__drizzle_migrations`, and inserted that ledger row by hand.

Disposable database `lawmind_release_replay`, created and dropped in the run.

```
migration files on disk          88
journal entries                  88
migrations applied on scratch    88
replay wall clock                1.5s
pg_extension                     pg_trgm, plpgsql, vector
0087 triggers on scratch         judgments_citation_key_dirty_ins,
                                 judgments_citation_key_dirty_upd
citation_key_dirty on scratch    present
```

**0087 is replayable.** The caveat I published in its own commit message is
closed by this line and not by anybody's recollection.

## 2 — Schema equivalence, live vs replayed

```
triggers      MATCH    8d6b1112856d715f    5 vs 5
enums         MATCH    b5158e3f70856455  131 vs 131
extensions    MATCH    df7a36c5302372f2    3 vs 3
views         MATCH    1f9cd2ece9776a12    4 vs 4
tables        DIFFER   1018 vs 942 columns
indexes       DIFFER    273 vs 259
```

The difference is entirely **objects no migration creates**, and that is §10
LCC-9's "classify lab-only objects" arriving as a measurement rather than as a
task.

## 3 — Lab-only object classification · **ALL LAB-ONLY**

```
public base tables       91
created by a migration   81
NOT created by any       10
```

| table | rows (est) | production readers |
|---|---:|---:|
| `new1_doc_vector_stage` | 2,016,054 | 0 |
| `new1_probe_fp32_250k` | 256,998 | 0 |
| `new1_probe_half_250k` | 256,998 | 0 |
| `new1_tranche_passages` | 418,116 | 0 |
| `new2_neutral_dupe_groups` | 155,388 | 0 |
| `new1_doc_vector_stage_refused` | 72,092 | 0 |
| `new1_inbound_counts` | 35,694 | 0 |
| `new1_head_baseline` | 20,947 | 0 |
| `n1_lab_passage_role` | 20,000 | 0 |
| `new2_p1_sample_groups` | 1,786 | 0 |

**VERDICT: no production route depends on an unmigrated table.** A restore built
from migrations alone loses 3.2 million lab rows and no product capability.

### The first answer was wrong, and how

The classifier's first pass reported **2 blockers** — `new1_doc_vector_stage` read
by `services/api/src/ops/release-export-cli.ts`, and by migrations 0066/0067.
Both were false:

- the migration hits are the table's name inside a `--` **comment**;
- the export hit is inside `DELIBERATELY_EXCLUDED`, a list of tables the release
  export **refuses to carry**.

A name inside a comment, or inside a string saying "we do not export this", is
the opposite of a dependency. The classifier now returns each match **with its
line** and drops comment-only and refusal-list lines, because grepping a name is
not evidence that anything uses it. Recorded here because the wrong answer was
one `git grep -l` away from being published as a release blocker.

## 4 — Full API suite, quiet window

```
tests 770 · suites 134 · pass 761 · fail 7 · skipped 2 · 428.4s
```

Then, after repairing the 5 failures that were mine:

```
premium routes   12/12   (was 5 failures)
```

### The two remaining failures are not mine, and both are real

**(a) `corpus coverage — THE GAP IS VISIBLE`.** Not a code regression — a **data
fact that outran its test**:

```
Allahabad coverage is now 65.143%  (2,276,082 of 3,493,991)
```

The test asserts Allahabad is still effectively absent, and its own message says
what to do: *"If that is real, this endpoint's whole premise has changed and
`docs/HC_CORPUS_SURVEY.md` needs rewriting before this test is relaxed."* It is
real. **NEW2 owns this** — the survey document and the coverage premise are
corpus truth, and LCC relaxing a coverage assertion to make its own suite green
would be the worst possible reason to move it.

**(b) `no timestamptz reaches the client as Postgres text` — PRE-EXISTING RED.**
Verified by stashing every change of mine and re-running: it fails at HEAD too.

```
at HEAD, without any of my work:
  admin/timestamp-precision.test.ts:93
  citations/key-freshness.test.ts:85
  citations/key-freshness.ts:219, :230, :231
```

I added two more (`citations/old-row-backfill-falsifier.test.ts:104`,
`release/candidate.ts:154`) and am **not** removing them, because the guard has a
false-positive class it cannot currently express:

> `key-freshness.ts` casts `cursor_at::text` **deliberately**, and its own comment
> says why — postgres.js truncates timestamptz binds to millisecond resolution, so
> two cursors 78 microseconds apart would compare equal through a JS `Date`. It is
> an **identity** comparison, not a wire rendering. `isoColumn()` renders
> millisecond ISO and would *break* it.

My two casts are the same class: the release candidate's `cursor_at` and
`max(created_at)` are the drift detector's identity fields, and truncating them
weakens it. The guard's rule — "no timestamptz reaches the CLIENT as Postgres
text" — is right; its implementation matches any `_at::text` anywhere in the
service, including internal identity reads that never touch a response.

**Recommendation, not a unilateral fix:** an explicit opt-out marker that must
state a reason, so the exemption is auditable. I have not weakened the guard to
make my own count look better; the honest state is that it is red, was red
before me, and is red for a reason worth a decision rather than a patch.

## 5 — Release candidate

```
LMRC-20260826-d12f2a9-8bc29635f62fa69b     digest 8bc29635f62fa69b
capability registry  RELEASE_CAPABILITIES_R8_3.2
migrations applied   88
statute refs         862,594   linked 688,123  (79.77% — never "statute coverage")
citation key cursor  2026-08-24 18:59:19.088+00
resolver dirty work  0 open
max(judgment_date)   2026-08-18   NOT the frontier of published law
corpus write locks   none held at seal
re-check             FROZEN
```

## 6 — Mixed-load isolation · **PASS**

Isolation is a claim about behaviour under contention, so it cannot be measured
on a quiet box. Three phases against the real Hono app, admission semaphore wired
at the production default `RESEARCH_CONCURRENCY=3`.

```
                        200   503    p50 / p95 / max ms   silent empty 200s
LOCAL_QUIET              9     0       3 /  113 /  113          0
LOCAL_CONTENDED          8     1       5 / 2004 / 2004          0
RECOVERY                 9     0       3 /    3 /    3          0
background load: 12 concept queries, 4 refused 503
```

The one refusal carried `Retry-After: 2`, and the 2004 ms maximum **is**
`ADMISSION_WAIT_MS` — a bounded wait then an honest refusal, which is the
designed behaviour observed rather than asserted.

**Zero silent empty 200s in every phase** is the number that matters. A congested
server answering `results: []` is the purest silent drop there is: the advocate
cannot tell it from a corpus that genuinely has nothing.

### The first run of this harness was worthless, and the reason generalises

It reported `12 finished, 0 refused` — which reads as perfect isolation. It was
not: I had not passed `admission`, so `deps.admission` was `undefined` and **no
semaphore ran at all**. The absence of a gate and a gate that never fires produce
identical output. Anyone reading an isolation number, mine included, should ask
which one they are looking at.

All latencies here are LOCAL and are never public mobile latency — §16.

## 7 — Targeted planner statistics · a correction I nearly published

`pg_stat_user_tables` reads `n_live_tup` = **3** for `judgments` and **0** for
`judgment_citations`, with `last_analyze` NULL throughout. That looks exactly
like broken planner statistics on the two biggest tables.

**It is not.** The planner uses `reltuples` and `pg_statistic`, and both are
sound:

```
judgments              reltuples 18,698,984   pg_statistic 38 of 38 columns
judgment_citations     reltuples 22,322,064   pg_statistic  9 of 10 columns
judgment_paragraphs    reltuples 89,622,944   pg_statistic  9 of  9
```

What is reset is the stats **collector**, by the earlier crashes. That affects
autovacuum triggering, not query plans. Different problem, different owner, and
worth not overstating — the loud number was the wrong one to read.

## 8 — Restore / host-loss / rollback · **UNPROVEN**

Not FAILED. Not PASSED. I have no evidence, and the reason is mine.

I ran the release export (500 judgments, 7 tables, 59 MB, manifest + checksums)
and then attempted the restore three times. Each attempt was **killed by a
tool-call timeout**, and each time I read the leftover Postgres backend — sitting
in `ClientRead` on a COPY whose client no longer existed — as a hang.

I then published "the restore hangs" to FIFTH, with a theory: `judgment_judges`
exports as 0 rows / 0 bytes (migration 0040 moved bench data out) and the
zero-byte file desynchronises the connection. **Tested twice, in isolation, and
false:**

```
Readable.from([])          empty COPY ok, next COPY ok, rows 0 and 2
createReadStream(0-byte)   empty COPY ok, next COPY ok, rows 0 and 2
```

The tell I should have read first: `restore.err` empty, `restore.out` header
only, process gone. **A hang does not exit.** Clean stderr plus a vanished
process is a kill.

Corrected to FIFTH in bus 1380. Now running as a one-shot **scheduled task** —
the launcher `scripts/enrich-worker.cmd` already documents as the one that
survives here, because the harness attaches children to a job object with
kill-on-close and a scheduled task is not a descendant of it.

## 9 — What did NOT run in this window, stated plainly

- **host-loss / rollback drill** — not run.
- **release-import equivalence verification** — the export ran; the restore's own
  manifest verification has not completed.

§10 LCC-9 is therefore **PARTIAL**, not complete. Reporting the suite as green
while these are outstanding is exactly what "if the full suite cannot complete,
do not call it green" forbids.

## 10 — Release candidate, current

```
LMRC-20260827-0c5abcb-98214aed1ead1831
  reproducible   NO — apps/admin/lib/api.ts is uncommitted, and apps/** is RCC's
  head           0c5abcb        schema 8f68eb83e2501868
  registry       RELEASE_CAPABILITIES_R8_3.3 / (digest bound)
  migrations     89 / 96026d3cda0ba110
  fleet paused   YES — services/ingest/.checkpoints/STOP, R8.3 §7 window
  write locks    none held
```

A reproducible candidate is blocked on **one file that is not mine**. Its content
is a finished fail-closed fix that was simply never committed. Committing another
lane's file to make my own seal go green is not a trade I will make.
