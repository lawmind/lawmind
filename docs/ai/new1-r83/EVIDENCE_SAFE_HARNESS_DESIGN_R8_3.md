# NEW1 — EVIDENCE-SAFE RETRIEVAL HARNESS, R8.3 §8.5 / §9 / §12 N1-4

**State: BUILT, SMOKED, GATED.** The experiment itself has not run and will not
run until both handoffs in §7 are open.

```
services/harness/src/n1-role-policy.mjs           classifier + eligibility policies
services/harness/src/n1-role-materialise-cli.mjs  labels -> database
services/harness/src/n1-evidence-safe-cli.mjs     the six arms, two scoring modes
artifact (on run)  docs/ai/new1-r83/EVIDENCE_SAFE_METRICS_R8_3.json
```

---

## 1. The blocker nobody had costed: the role is not in the database

§9 requires a filtered ANN comparison. §8.5 requires a strict-exclusion arm.
Both need the eligibility predicate **inside the SQL that pgvector plans**.

The role does not exist in the database. NEW2's `classify()` is a regex cascade
run in script memory against the top-k it has just fetched. That is enough to
**census** what retrieval returned. It cannot **filter** what retrieval
considers, because by the time the classifier sees a passage the ANN scan is
already over.

So the labels have to be materialised first, and that is a job with a cost, not a
line of SQL. Measured on this box:

```
20,000 passages labelled and written   18.1 s
projected for 418,116                  ~6.3 min at that rate
independent 3-batch read probe         ~18 min, 0.83 GiB of slice text
```

The spread is cold-TOAST variance — `judgments.full_text` is out of line, and one
2,000-row batch took 13.5 s against 0.43 s for its neighbour. **Call it 6–20
minutes of real IO.** That is why it is inside my window and not run now: a
`0.83 GiB` detoast burst underneath LCC's API-suite timings is precisely what
`record what else was on the box` is a lesson about.

### Why a copied classifier, and how the copy is kept honest

The labels have to be **NEW2's**, not mine, or the numbers stop being comparable
with the census FIFTH is blind-labelling. NEW2's function lives in a module that
opens a database connection on import, so it is copied rather than imported — and
a copy of someone else's rule is a drift hazard.

`assertClassifierParity()` re-reads `scripts/n2-role-census-widened.mts` at run
time, normalises lines 71–90 and compares the SHA-256 against a pin. If NEW2
changes a regex, **my run fails** rather than quietly producing labels that no
longer mean what the census means.

```
pinned  76efa180c72424ad74735698a5a33c3360732631bd5d435d3c90f18bc83dad16
```

### Why not port the cascade to SQL

Three silent divergences, in a cascade whose entire value is being identical:
JavaScript `.` does not cross a newline and Postgres `.` does; `\b` is `\y`;
`t.length` counts UTF-16 units and `length()` counts characters. Two of the
eleven rules depend on the first of those. Materialising the JS label has none of
them.

---

## 2. An independent reproduction of NEW2's correction

A no-write modulus sample — no `LIMIT`, because `LIMIT` after `WHERE` is what
cost NEW2 two numbers — over 1,453 passages drawn hash-uniformly from all
418,116:

| role | NEW2 corrected, n=59,760 | NEW1 independent, n=1,453 |
|---|---:|---:|
| `OTHER_UNKNOWN` | 60.36% | 62.49% |
| `PARTY_SUBMISSION` | 15.06% | 15.28% |
| `CASE_HEADER` | 10.04% | 9.43% |
| `REPORTER_EDITORIAL` | **4.44%** | **4.34%** |
| `HOLDING_OPERATIVE` | 3.87% | 2.75% |
| `SPAN_UNVERIFIABLE` | 1.88% | 1.79% |
| `COURT_REASONING` | **1.20%** | **1.17%** |

Different lane, different draw, different code path, same numbers. **NEW2's
`LIMIT` correction reproduces from outside NEW2.** The 1.57% pool figure my R8.1
artifacts carried is dead, and the 4.44% replacing it is now confirmed twice.

This also incidentally proves the copied classifier behaves like the original on
real corpus text, which the hash pin alone cannot show.

---

## 3. The six arms — §9's required comparison, in full

| arm | scan | filter | purpose |
|---|---|---|---|
| `exact_unfiltered` | brute force | none | ranking ground truth + drift control against R8.1's `exact` |
| `ann_unfiltered` | HNSW ef=200 | none | the R8.1 baseline, and what ships |
| `exact_filtered` | brute force | in SQL | **the filtered reference** §9 demands |
| `ann_naive_postfilter` | HNSW ef=200 | in SQL, `iterative_scan=off` | the trap, measured as the trap |
| `ann_iter_strict` | HNSW ef=200 | in SQL, `strict_order` | deployable filtered ANN |
| `ann_iter_relaxed` | HNSW ef=200 | in SQL, `relaxed_order` | deployable filtered ANN, cheaper |

### The unfiltered arms do not JOIN, and that was nearly a silent defect

The first working version joined the label table in **every** arm, because the
role is wanted for the composition tally either way. It ran, and it was wrong: a
join changes the plan pgvector runs, so the "baseline" would no longer be the
query R8.1 measured or the one production ships, and every filtered-vs-unfiltered
delta would carry the shape of the comparison inside it. Roles for the unfiltered
arms are now looked up **afterwards**, keyed, off the ranking path.

### Every arm asserts its own GUCs back

`ef_search must be set, not inherited`: an unset `hnsw.ef_search` silently runs at
pgvector's default of 40, which by NEW2's own re-run loses roughly two thirds of
the exact top-100 — and the query succeeds, so nothing looks wrong. Each arm
`SET LOCAL`s inside a transaction and then reads `current_setting` back, failing
if the arm is not the arm it claims to be.

---

## 4. Plan evidence: iterative scan works, and the trap is real

`--explain`, run through the same parameterised path the arms use — `an inlined
EXPLAIN is not evidence`, because a bind parameter once moved a plan on this
codebase from cost 18.72 to 9,255,009.

```
iterative_scan = off            LIMIT 200 -> returned  21 rows   (212 tuples scanned)   301 ms
iterative_scan = strict_order   LIMIT 200 -> returned 200 rows  (2,080 tuples scanned) 1,877 ms
iterative_scan = relaxed_order  LIMIT 200 -> returned 200 rows  (2,237 tuples scanned)    24 ms
```

Two things are settled by this:

1. **pgvector's documented failure is reproduced here, not assumed.** With the
   filter applied after the ANN scan, a `LIMIT 200` returned 21 rows and reported
   no error. §9 exists because a naive `WHERE role != …` produces exactly this and
   looks like a representation result.
2. **Iterative scan engages through a nested-loop JOIN**, not only through a
   same-table predicate. That was the open technical question and it is answered:
   §9 arm 3 is runnable against a side table, so `new1_tranche_passages` stays
   byte-identical and its recorded content hash stays valid.

**The recall numbers from the smoke are VOID and must not be quoted.** They were
taken with 20,000 of 418,116 rows labelled, which makes the filter keep 4.8% of
the table. Under the real policy it keeps about **93.4%** — the exclusion is
`REPORTER_EDITORIAL` 4.44% + `SPAN_UNVERIFIABLE` 1.88% + `DAMAGED_OR_OCR_SUSPECT`
0.28%. A 6.6% exclusion is nowhere near selective enough to produce a 91% loss.

The honest prediction, recorded now so it can be wrong: **the naive post-filter
penalty for THIS policy will be small — single-digit percent of top-100 — because
the filter is not selective.** If it comes back large, something other than
selectivity is happening and that is the finding.

---

## 5. Two successes, never merged

```
judgment success@5         the right judgment is in the top 5
generation-evidence s@5    the right judgment is in the top 5 AND the passage
                           served as its evidence is eligible
evidenceGapAt5             the difference — the release-relevant number
```

A system can score well on the first and zero on the second. `cond_s@5 = 0.3715`
says nothing at all about whether what came back was the court's words.

### Three scoring modes — §8.5

- **BASE** — what ships today. Unfiltered ranking; evidence is whatever passage
  ranked the document, whatever its role.
- **ARM_A** — strict exclusion. Prohibited passages never enter the candidate
  path; the document is ranked by an eligible passage and the evidence *is* that
  passage.
- **ARM_B** — locator → court-evidence re-anchor. A non-court passage may
  **locate** a judgment; the evidence returned is re-anchored to an eligible
  court-authored passage **in that same judgment**. The reporter or party text
  never leaves as evidence. A document with no eligible passage is counted
  `EVIDENCELESS` rather than served with whatever was there — and
  `evidencelessHitsAt5` is reported, because under a fail-closed rule that is the
  share of correct answers that cannot be shown at all.

### Two eligibility policies, because one would be a decision

Applied at scoring time, so both cost nothing extra and the freeze sees the
bracket instead of a number this lane picked:

```
STRICT        COURT_REASONING + HOLDING_OPERATIVE + FACTS + PROCEDURAL_HISTORY
WITH_UNKNOWN  the above + OTHER_UNKNOWN
```

`OTHER_UNKNOWN` is ~60% of the pool and is **not** court-authored — it is text
the cascade recognised nothing in. §8.1 puts it in `EXCLUDED_OR_UNKNOWN`. It is
reported as the upper bracket precisely so that anyone tempted to treat unlabelled
text as court reasoning can see how much of the result rests on doing so.

The **retrieval filter** is a separate parameter and defaults to §8.5's actual
wording for Arm A: remove high-confidence reporter/editorial, plus the two damage
classes, whose span is not provable and which therefore cannot be evidence for an
unrelated reason.

---

## 6. What the harness does not decide

§8.5 says the experiment makes **no rights conclusion**, and it does not.

ARM_B is a *narrowing* of what ships today: today a reporter passage can be
returned AS evidence; under ARM_B it can only locate, and the evidence returned is
court-authored. The experiment measures what each option **costs**. Whether either
is permitted is not its question, and two things say it is genuinely open:

- `docs/FOUNDER_QUEUE.md` — *"May we reproduce the OFFICIAL SCR headnotes from
  e-SCR?"* — **OPEN**;
- `docs/OPEN_DECISIONS.md` **OD-13** — pre-1950 reporters under the
  raw-text-not-reporter rule — **OPEN**.

§8.2 forbids inferring one permission from another, so the artifact records the
retrieval-filter policy and the evidence policy as named parameters and asserts
nothing about storage, indexing, display or training.

**FIFTH:** ARM_B is the one arm whose *deployability* rests on a question neither
NEW1 nor this orchestration resolves. If you judge that running it at all
prejudges the content-use decision, say so and I will report ARM_A alone. I do not
think it does — it cannot make the current state more permissive than it already
is — but that call is yours, not mine.

---

## 7. §9 arm 4 — the partial index — DESIGNED, NOT RUN, with a mechanical reason

A partial HNSW index needs its predicate on the **indexed relation**, so the role
would have to become a column of `new1_tranche_passages`. Setting it is an
`UPDATE` of all 418,116 rows — and an `UPDATE` re-inserts every row into **every**
index on the table, including the 5.4 GiB HNSW index the other five arms are
measured against.

**The arm would bloat its own control.** §9 marks it optional; it stays optional.
Its only marginal value over `ann_iter_*` is latency, and `ann_iter_*` is the
deployable shape either way.

---

## 8. The gates, and what I am doing until they open

```
gate 1   HEAVY_BOX released by LCC          NOT OPEN — LCC 1343 takes it first (§4 Phase B)
gate 2   role policy frozen by NEW2 + FIFTH NOT OPEN — FIFTH 1321 blind packet unlabelled
```

Both are required by §12 N1-5 and neither is mine to open. Until then:

- no experiment run;
- no label materialisation beyond the 20,000-row smoke prefix, which is
  **resumable progress, not debris** — the real run continues from the output
  table's own frontier, so nothing is repeated;
- no HEAD walk (§12 N1-3), verified against the OS process table rather than
  asserted.

### The run order when the gates open

```
1. n1-role-materialise-cli.mjs --run          ~6-20 min, durable metric is the row count
2. n1-evidence-safe-cli.mjs --explain         plan proof at full label coverage
3. n1-evidence-safe-cli.mjs --run             295 tasks x 6 arms, checkpointed per task
4. SEMANTIC_CAPABILITY_RELEASE_SCOPE_R8_3.md  §12 N1-7
```

Step 1 asserts the source count before and after and refuses its own result if the
tranche moved: the walk is keyset over a **random-uuid** primary key, and a
keyset walk over a growing table with random keys exits clean having missed the
middle. Step 3 discards any checkpoint line scored against a different index size
or classifier version, because a row scored against a different index is a
different experiment and averaging the two produces an artifact that looks
entirely normal.

---

## 9. Caveats

- Nothing here validates NEW2's classifier. Its precision is unmeasured; FIFTH's
  blind labelling is what turns it from a signal into a rate. Every number the
  experiment produces is **conditional on that classifier being right**, and the
  artifact says so.
- `n=6` for `supporting_authority` is unchanged and no arm here improves it. This
  round does not test the ranking-at-depth hypothesis; a reranker is forbidden by
  N1-8 and remains a future hypothesis.
- The 295-task set is the R8.1 set, reconstructed from published gold files with
  every query text re-hashed against the frozen manifest. It is **not** FIFTH's
  hidden holdout, which has never been run and is not touched here.
- One lab table is created: `n1_lab_passage_role`. No migration is allocated, no
  product schema is touched, and `new1_tranche_passages` is left byte-identical.
