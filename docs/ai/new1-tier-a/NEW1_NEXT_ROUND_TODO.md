# NEW1 NEXT ROUND TODO — 24 Aug 2026

Bound to §7 of `LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md`.
Supersedes `NEW1_ROUND_TODO_2026-08-23.md`, which remains the record of the
previous round and is not restated here.

`[x]` OBSERVED done · `[~]` running · `[ ]` not started · `[!]` deferred, with
the refusal recorded.

**Lane lease:** `NEW1` acquired 2026-08-24T15:08:15Z, session
`22730754-52d1-48e5-9049-7258c25cbf41`, pid 17932. Status at acquisition:
`NEW1: FREE`. No collision. (LCC's lease read `DEAD` — a live pid absent from
the process table — which is LCC's to recover, not mine.)

---

## THE CORRECTION THIS ROUND OPENS WITH

The brief's premise for NEW1-1 is **wrong**, and saying so is more useful than
the re-run it asked for.

> "The previous POOLED_ALL result … used lifted/verbatim target sentences and
> therefore does NOT prove advocate-query performance."

`representation-lab-v2-cli.ts` embeds `task.query` from `ADVOCATE100.json`. Those
queries are **authored from the legal question** under a leakage guard that fails
a concept task above six shared words. Measured over the 45 concept tasks the lab
actually scored:

| longest shared word run | tasks |
| ---: | ---: |
| 1 | 1 |
| 2 | 5 |
| 3 | 18 |
| 4 | 13 |
| 5 | 5 |
| exempt (`pasted_passage`) | 3 |

**Maximum 5. Zero failures.** So POOLED_ALL's 73.3% s@5 against HEAD_4800's 20.0%
was already measured on posed advocate questions.

One honest qualification against my own correction: **3 of those 45 are
`pasted_passage`**, whose query is deliberately the opponent's verbatim text and
which the leakage guard exempts by design. So it is 42 posed and 3 lifted, not
45 posed, and V3 reports the two separately.

The sets that ARE lifted are different files that say so themselves —
`new3-uncited-authority-gold-v2.json`, `new3-noncitation-gold.json`,
`new3-semantic-expansion-gold-v2.json` each record that the query is an
`own_text_span` of the target and is "an upper bound, not a paraphrase-robustness
measurement". They are the gold behind `buildLaunchGold()`, and therefore behind
`LONG_FACT_SEARCH_CONTRACT_V1` — which is where the brief's concern **does**
land, and which NEW1-3 now addresses.

---

## NEW1-0 — LANE LEASE  ✅

- [x] `lane-lease.mjs status` read before binding: NEW1 FREE.
- [x] Acquired with task and heartbeat. Session-bound, pid-checked.
- [x] **One keeper, one sidecar, one walk — verified from the process table, not
      from a count.** Keeper `node.exe` under `cmd.exe` under `svchost.exe`
      (Task Scheduler). Sidecar one `python.exe`. Walk: **none, and that was the
      finding** — dead since 12:12:04Z the previous day, with nine further
      failed relaunches logged over 232 minutes.
- [x] Resource gate before the P0 run: GPU 3,752/8,188 MiB, 18% · RAM 12.0 of
      31.7 GB free · disk 289.8 GB free · CPU 16%.

## NEW1-6 — KEEPER RELAUNCH  ✅ CLOSED  (taken first because it was live-failing)

- [x] **Mechanism measured, not reasoned.** Three variants of one
      `Start-Process` command: node→bash directly **RAN**; node→PowerShell
      `detached: true`→Start-Process **NOTHING**; node→PowerShell *attached*→same
      command **RAN**. `detached: true` is `DETACHED_PROCESS`, so no console, and
      `Start-Process` routes via ShellExecute when `-WindowStyle` is given. The
      previous agent's written-down-but-untested hypothesis was right; their
      three refuted hypotheses were all about the command, and the command was
      never the problem.
- [x] PowerShell removed from the launch path; kept for the kill, now
      `spawnSync` so it completes before the start instead of racing it.
- [x] **Proof, both limbs:** `relaunch VERIFIED` (first ever), new
      `stage-runner.log` lines, and `new1_doc_vector_stage` **1,097,864 →
      1,098,028**, with the walk resuming on `lcc-00123` — the batch it died
      inside.
- [x] **A second, unplanned occurrence is the stronger one:** after an overnight
      machine restart the keeper recovered a cold box unattended — stale lock
      taken over, dead sidecar restarted, walk relaunched and VERIFIED — which is
      the case it exists for and had never once handled.
- [x] Pause switch added and observed honouring a real pause, reason and all.
- [x] `KEEPER_RELAUNCH_PROOF.md`.

## NEW1-1 — ADVOCATE-POSED REPRESENTATION EXPERIMENT  [~] P0

Frozen before running: arms, pool construction, nesting, metrics, failure
taxonomy and stop criteria are all in the CLI header, written before the first
document was read.

- [x] **A defect in the V2 instrument found by reproducing it.** V2 drew
      **ZERO** hard negatives. `SET LOCAL hnsw.ef_search = 200; SELECT …` as one
      tagged template with bound parameters is a prepared statement, and
      PostgreSQL refuses multiple commands in one; every call threw, every throw
      was swallowed, and the skip lines went to a console nobody kept. **So V2's
      pool was the random TABLESAMPLE fill alone and its stated conservatism —
      "every negative is a document the production representation already ranks
      above the gold" — did not happen.** V2 is the only site in the repository
      using that shape; every other `SET LOCAL hnsw` call already uses the
      transaction form.
- [x] `representation-lab-v3-cli.ts` · `pnpm rep:lab3`. What it adds over V2:
      bootstrap CIs and effective-n; a **nested** pool-scale curve (2,500 →
      7,500 → 20,000, each a prefix of the next); **arm A read from
      `new1_doc_vector_stage`** rather than re-embedded, so the control is the
      vector LawMind would really serve; `NOT_IN_INDEX` measured **before** the
      pool force-includes gold; and a paired POSED-vs-LIFTED scoring of the same
      arms over the same documents, so "how much does a lifted benchmark
      overstate?" becomes a number.
- [x] Streamed scoring — per-query top-500 heaps only, nothing large held or
      checkpointed. At 20,000 documents the alternative is ~420 MB of Float32 and
      a checkpoint to match, and this lane has already lost 160 of 283 queries to
      a teardown that wrote its artefact at the end.
- [~] Running in a quiet window with the walk deliberately paused. 19,932-document
      pool, 295 tasks, hard negatives **1,918+ actually drawn** this time.
- [ ] `SEMANTIC_REPRESENTATION_DECISION_V3.md`.

## NEW1-2 — CHEAPEST PATH TO HC PASSAGE SENSITIVITY  [ ] P0

- [ ] Answered from V3's arm spread rather than a separate build: B (one pooled
      vector, identical storage to production) against F (every chunk, ~4–13
      vectors per document) at three pool sizes is exactly "what does passage
      granularity buy, and at what storage multiple". No 40M-vector program is
      proposed before that gap is priced.
- [ ] `HC_PASSAGE_COVERAGE_EXPERIMENT.md`.

## NEW1-3 — LONG-FACT VALIDATION V2  [ ] P0

- [x] **The defect is confirmed and it is the one the brief suspected.**
      `long-passage-cli.ts` draws from `buildLaunchGold()`, which consolidates
      NEW3's `own_text_span` files. So the condensation finding (DIRECT 8/25 →
      4/25 as input grows, CONDENSED flat at 8/25) rests on lifted queries.
- [x] `long-fact-posed-cli.ts` · `pnpm long:posed`. **One variable changed** —
      query provenance. Dilution construction, sizes, condenser, probe index,
      `ef_search` and top-K are byte-for-byte P4's, because two runs differing in
      one variable are a comparison and two differing in five are two anecdotes.
- [x] Adds the `LEXICAL_RAREST3` arm, which P4's header listed and P4's executed
      rows never contained; a determinism check, because the contract *asserts*
      the condensation is deterministic and an assertion is not a measurement;
      and an advocate-word-retention figure, because a condenser can win the
      benchmark by discarding the advocate's framing.
- [ ] Run (waits on the GPU window), then `LONG_FACT_VALIDATION_V2.md`.

## NEW1-4 — CANDIDATE REACHABILITY BEFORE RERANKING  ✅ HELD

- [x] **No reranker sprint started, and none proposed.** Three independent
      measurements agree the constraint is upstream: P3's arm D reaches 10.3% /
      25.6% candidate recall at depth 500; P2's arm E caps at 44.4% recall@500;
      and 10 of 12 doctrine targets have no vector at all. V3 exists to move
      representation and coverage, not ordering.

## NEW1-5 — ELIGIBILITY / UNCITED-AUTHORITY EVIDENCE FOR NEW2  ✅

- [x] `eligibility-frame-cli.ts` · `pnpm frame:eligibility` ·
      `ELIGIBILITY_SAMPLING_FRAME.md` · 21,416 rows censused in the exact
      population NEW2 measured.
- [x] **The 2,000-character gate was NOT lowered and I do not propose lowering
      it.** NEW2's 3.75% [1.28, 10.45] and my own chaff-per-classified curve
      reached the same conclusion from opposite directions, and I said so against
      my own earlier 40.09% headline.
- [x] Four findings handed over: **zero Supreme Court rows** in the whole
      population; **73.6% with no class verdict**; 43.0% carrying no procedural
      marker; the 2025+ cohort at 15.3%, reported and deliberately **not**
      oversampled.
- [x] Markers declared as **stratifiers, never a classifier**, with their
      over-marking disclosed against NEW2's own read counts (21.6% vs 13.8% for
      withdrawal).
- [x] Sent as bus 1081.

## NEW1-7 — 1M HALFVEC CHECKPOINT  [!] DEFERRED

- [!] The quiet window this round bought is spent on the P0 representation
      decision, which the brief itself orders ahead of it ("only after P0
      representation work"). `CHECKPOINT_RUNBOOK_1M.md` holds the executable
      form. **No 8.85M extrapolation is made or implied.**

## NEW1-8 — CLEAN-BOX ADVOCATE PERFORMANCE  [ ] P1

- [ ] Waits on architecture selection, by design. Deterministic identity metrics
      stay separated from concept metrics; no pooled headline.

## NEW1-9 — THE DO-NOT LIST, AND WHAT WAS ACTUALLY NOT DONE

- [x] Staged HEAD:4800 vectors **not** promoted. The walk's row count appears in
      this lane only as evidence that a keeper works, never as evidence about
      search quality.
- [x] No 8.85M re-embed. No 40M passage program. No reranker project. No HyDE.
      No graph expansion. No router.
- [x] **No threshold invented after seeing results.** The V3 arms, pools and
      metrics were frozen in the CLI header before the run.
- [x] No product or mobile UX touched. No citation resolution or treatment work.

---

## FINDINGS THAT BELONG TO OTHER LANES, SENT NOT ACTED ON

- **bus 1079 → LCC, bus 1080 → NEW2.** `text_safety_grade = 'PROOF'` is
  **unreachable**: the deployed eligibility view tests `script_quality_method =
  ANY (ARRAY[]::text[])`, an empty array, so the branch is dead code. Measured:
  PROOF 0 rows, while 939 rows in the same 0.2% sample carry
  `script_quality_method = 'text-damage-v2.0'` — on the order of 470,000
  documents corpus-wide whose proof-grade evidence reads as a screen. It lands on
  NEW2-3's `PROVEN_DAMAGED` vs `SCREENED_NO_DAMAGE_FOUND` distinction. I proposed
  no fix: which methods count as proof-grade is their contract, not mine.
- **bus 1081 → NEW2.** The sampling frame above.

## REPORTING RULES STILL IN FORCE

- [x] Latency: V3 contains **no** latency measurement at all, and says so, because
      exhaustive in-memory cosine is not a search time.
- [x] Conditional recall labelled `CONDITIONAL_RECALL`; real-world reachability
      reported separately as production coverage.
- [x] Staged vector count never offered as evidence of search quality.
- [x] Every instrument defect found this round is reported as a defect in **my**
      instrument, not worked around.
