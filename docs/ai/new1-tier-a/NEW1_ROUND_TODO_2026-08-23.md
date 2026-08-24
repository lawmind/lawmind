# NEW1 ROUND TODO — 23 Aug 2026

Supersedes `NEW1_ROUND_TODO_2026-08-22.md`. Derived from the superseding NEW1
lane prompt (P0–P13) and the FINAL ORCHESTRATOR CORRECTION.

`[x]` OBSERVED done · `[~]` in progress · `[ ]` not started · `[!]` blocked/deferred.
Every completed item names its evidence.

**Mission: MAKE LAWMIND FIND THE RIGHT LAW.** A rising staged-vector count is not
retrieval quality, and the id-order/gold-reachability result already proved that.

---

## BINDING CORRECTION FOLDED IN (orchestrator, 23 Aug)

- [x] **C1 · RESOLVED CITATION ≠ LEGAL TREATMENT.** `A CITES B` establishes no
      treatment relationship. Applied directly in P5: `cited_authority` is an
      identity edge, the eligibility view uses it as a proxy for authority, and
      **that misuse is the finding**. No number in this lane is reported as
      currentness or treatment coverage.
- [x] **C2–C9** (matter-data confidentiality, premium cost, experiment
      assignment, tenant security, staging package, activation funnel, feature
      flags, accessibility) — **relayed, not acted on.** They bind LCC/RCC/product
      lanes. NEW1 writes no client code and sends no matter data anywhere.

---

## P0 — KEEP THE WALK HEALTHY, DO NOT WORSHIP IT

- [x] **P0.1 THE WALK WAS DEAD FOR 7 h 26 m** — last progress 17:16:50Z on batch
      `lcc-00113`, found dead at 00:43Z. **Seventeen consecutive keeper relaunches
      failed**, each logging only `powershell exited 0`.
- [x] **P0.2** Sidecar proved healthy FIRST (`/health` 22 ms, CUDAExecutionProvider,
      ONE python process, no orphans) — so the sidecar was not the cause.
- [x] **P0.3** Walk relaunched by hand, verified by NEW log lines (batch
      `lcc-00049` START 00:47:51Z, contract hash OK `2e7b53afe35fa81c`), not by a
      process count.
- [!] **P0.4 THE KEEPER RELAUNCH IS BROKEN AND I STOPPED AFTER THREE FAILED
      CYCLES.** `Start-Process` with this command run BY HAND starts the walk every
      time (3/3 across 21–23 Aug). The same command issued by the keeper has never
      once produced a walk — **21 consecutive relaunches**, always exit 0, no
      stdout, no stderr, no process. Three hypotheses tested and REFUTED:
      1. doubled backslashes in the LAUNCHER PATH — `bash -c 'test -f'` resolves
         both forms;
      2. absolute vs RELATIVE launcher path — changed to relative, relaunches
         #18–#21 failed identically;
      3. doubled backslashes in `-WorkingDirectory` — a marker script launched
         under BOTH forms ran, both reporting the same pwd.
      The one untested difference is that the keeper spawns PowerShell
      `detached: true` and `unref()`s it, so that shell has no console. **Written
      down, not acted on** — the rule is to stop at three.
- [x] **P0.4a** My own instrumentation was itself defective and is reverted: the
      `-c 'exec bash … >> log 2>&1'` form I added mangled the redirection, because
      `-ArgumentList` joins its elements with spaces WITHOUT quoting, so `>>` and
      the path reached bash as positional arguments. That is why the launched
      shell's log stayed empty. What is KEPT is the one piece that worked — the
      exact PowerShell command is written to the relaunch log BEFORE it runs.
- [x] **P0.5 OPERATIONAL FACT FOR THE NEXT AGENT: when the walk dies, the keeper
      will NOT bring it back.** Relaunch by hand and verify by a NEW line in
      `stage-runner.log`, never by a process count. The walk died a SECOND time
      this session at 02:33Z (batch 115, `fetch failed`) when three of my
      experiments contended with it for the sidecar; restarted by hand at 09:08Z.
- [x] **P0.5a 'HEAVY HARNESS EMBEDDING AND THE WALK CANNOT BOTH RUN' IS NOW
      MEASURED AT THREE.** Walk + representation lab + long-passage starved each
      other; the long-passage run was stopped so the lab could finish. Two
      concurrent GPU consumers is the working limit on this box.
- [x] **P0.6** Staged count is NOT used anywhere as evidence of search quality.

---

## P1 — CASE-TITLE, FINAL BROAD BATTERY  ✅ COMPLETE

- [x] **P1.1** `case-title-battery-cli.ts` written — families assigned
      earliest-wins, ambiguity scored as *useful disambiguation* rather than
      arbitrary rank 1. `pnpm --filter @lawmind/harness title:battery`.
- [x] **P1.2** RUN against stable HEAD, frozen gold `ba9357cba2fbf297`, n=229.
      `case-title-battery.json`.
      | population | n | s@1 | s@5 | coverage | p50 | timeouts |
      |---|---:|---|---|---|---|---:|
      | unique title | 155 | **100.00%** | 100.00% | 100.00% | 408 ms | 0 |
      | duplicated title | 74 | 54.05% | 86.49% | 86.49% | 397 ms | 0 |
- [x] **P1.3** Versus the pre-fix baseline: unique s@1 94.2%→**100%**, duplicated
      s@1 12.2%→**54.05%**, s@5 20.3%→**86.49%**, timeouts **9→0**, wrong pins
      **65→0**, p95 **19,196 ms→~1.3 s**.
- [x] **P1.4** Both routing hijacks fixed — ` AND ` rows (99) score s@5 95.96%;
      the `SECTION` row is rank 1.
- [x] **P1.5 ALL 10 REMAINING MISSES ARE SETS OF 16–200 JUDGMENTS.** Not a
      ranking defect: a 5-slot page cannot represent a 200-judgment set. Belongs
      to `PAGINATION_RANKING_CONTRACT.md`.
- [x] **P1.6 GAP DECLARED, NOT PASSED:** `NORMALIZED_VARIANT`, `MISSPELLING`,
      `V_VS_VERSUS` matched **zero rows** — this gold cannot test them.
      ADVOCATE-100's `misspelling` class then measured **0/5**. The 100%
      unique-title figure does NOT cover misspellings.
- [x] **P1.7** `CASE_TITLE_SEARCH_CONTRACT_V1.md` written; sent to LCC, **bus 1048**.

---

## P2/P10 — REPRESENTATION LAB  ✅ COMPLETE

- [x] **P2.1** `representation-lab-v2-cli.ts`, six arms, `pnpm rep:lab2`.
- [x] **P2.2 SCALED RESULT — 45 tasks, 2,500-document pool, negatives drawn as
      the CURRENT representation's own ANN neighbours** (`representation-lab-v2.json`):
      | arm | v/doc | s@1 | **s@5** | r@500 | nDCG@20 | KiB/doc |
      |---|---:|---:|---:|---:|---:|---:|
      | **A HEAD_4800 — LIVE** | 1.00 | 11.1% | **20.0%** | 68.9% | 0.207 | 2.0 |
      | **B POOLED_ALL** | **1.00** | 46.7% | **73.3%** | **100.0%** | **0.663** | **2.0** |
      | C POOLED_SALIENT | 1.00 | 44.4% | 62.2% | 97.8% | 0.580 | 2.0 |
      | D MULTI_3 | 3.00 | 42.2% | 66.7% | 95.6% | 0.588 | 6.0 |
      | F ALL_CHUNKS — ceiling | 4.09 | 48.9% | 80.0% | 100.0% | 0.695 | 8.2 |
      | E LEXICAL→SEMANTIC | 1.00 | 24.4% | 35.6% | 44.4% | 0.308 | 2.0 |
- [x] **P2.3 THE CORE RESEARCH QUESTION IS ANSWERED: YES, AND IT COSTS NOTHING.**
      A pooled whole-document vector is **3.7× the live recipe on s@5 at IDENTICAL
      storage**, and reaches **92% of the every-chunk ceiling at a quarter of the
      storage**. More vectors per document is NOT the lever — D costs 3× and loses.
- [x] **P2.4 A DEGRADES WITH POOL SIZE AND B DOES NOT.** Pilot (260 docs) A 37.8%
      / B 73.3%; scaled (2,500 docs) A **20.0%** / B 73.3%. That is the property
      that decides behaviour at 18M.
- [x] **P2.5** Two pilot defects fixed rather than reported around: a 260-document
      pool made `recall@500` 100% for every arm **by construction**, and arm E
      computed rarity **within the pool** so the median candidate set was **1**.
- [x] **P2.6** Embedding made survivable after the first scaled run died at
      **8,094 of 9,811 chunks** on `UND_ERR_HEADERS_TIMEOUT`.
- [x] **P2.7** Sent to LCC (**bus 1061**) and NEW3 (**bus 1062**).

## P3 — TWO-STAGE RETRIEVAL  ✅ COMPLETE

- [x] **P3.1** `two-stage-candidates-cli.ts`, `pnpm stage1:candidates`, five
      generators, two strata never pooled.
- [x] **P3.2 LCC's bus 1041 hypothesis CONFIRMED in direction:** median document
      frequency of the terms the rarest-3 rule selects is **245** on long queries
      and **901** on short ones. Short queries have nothing rare to grab.
- [x] **P3.3 BUT CANDIDATE RECALL IS BAD IN BOTH STRATA.** Arm D at depth 500:
      **10.3%** (LONG_FULL) / **25.6%** (SHORT_FAMILY). Latency is fine —
      p50 214–293 ms, zero timeouts. **Fast and empty.**
- [x] **P3.4 A DEFECT IN THE SHIPPED RAREST-TERM RULE:** `G3_RAREST1` returned
      **22 EMPTY candidate sets of 39**, median selected-term df **0**. "Absent
      means rare" selects tokens the text-search configuration DISCARDS, and
      `plainto_tsquery` then yields an empty query that matches nothing.
- [x] **P3.5 THE ARCHITECTURE FINDING.** On targets that ARE in `judgment_chunks`
      (n=6): dense r@20 **83.3–100%**, lexical rarest-3 r@20 **0.0%**.
      **The dense arm is not weak, it is empty.**
- [x] **P3.6 NO RERANKER.** Candidate recall is the binding constraint; reranking
      an empty pool is wasted work. Two independent experiments agree (P2's arm E
      caps at 44.4% recall@500).
- [x] **P3.7** Sent to LCC — **bus 1059**. Instrument bugs disclosed: the first run
      pointed at the wrong index AND put `SET LOCAL` in the same statement as a
      parameterised vector, giving 39/39 false "timeouts".

## P4 — LONG FACT / PASSAGE SEARCH  ✅ COMPLETE

- [x] **P4.1 LAST ROUND'S ROOT CAUSE FIXED AT THE ROOT.** `harness-embedder.ts`:
      every harness experiment routes query embedding through the **GPU sidecar**
      (verified live — unit norm 1.0000000696, 1024-d, 123 ms warm). Six CLIs
      switched. It **refuses loudly** rather than falling back to CPU.
- [x] **P4.2 THE EMBEDDER IS NOT TRUNCATING.** Cosine to the 1,000-char prefix
      falls **1.0000 → 0.6625** as input grows to 20,000 chars, while cosine to
      the full text rises **0.6435 → 1.0000**. Two columns, opposite directions,
      monotone. **The 500-char cap protects us from the SPARSE ARM, not from a
      model that cannot read.**
- [x] **P4.3 LONG INPUT HALVES RECALL, AND IT IS DILUTION.** 25 fact patterns per
      size, targets in top 5:
      | size | DIRECT | CONDENSED | CONTROL_500 |
      |---:|---:|---:|---:|
      | 500 | 8/25 | 8/25 | 8/25 |
      | 1,000 | **4/25** | 8/25 | 8/25 |
      | 2,500 | **4/25** | 8/25 | 8/25 |
      | 5,000 | **4/25** | 8/25 | 8/25 |
      Same finding as the document-vector result from the QUERY side: a vector
      describing everything answers nothing specific.
- [x] **P4.4** `LONG_FACT_SEARCH_CONTRACT_V1.md` written; sent to LCC (**bus
      1066**) and NEW3 (**bus 1067**). Deterministic condensation, no model call —
      a condensation that varies between identical requests breaks pagination.
- [x] **P4.5** 500 chars recorded as a CURRENT SAFETY BOUND, never the vision.
      Embedding latency flat at 408–564 ms p50; not a constraint.

## P5 — UNCITED-AUTHORITY BIAS  ✅ COMPLETE

- [x] **P5.1** `uncited-authority-bias-cli.ts`, `pnpm bias:uncited`,
      `uncited-authority-bias.json`, deployed view `2e7b53afe35fa81c`.
- [x] **P5.2 GOLD ANSWER: 27 of 27 ELIGIBLE_NORMALLY, 0 rescued, 0 unreachable.**
      **And that zero is an instrument limit, not a clean bill** — those 27 are
      landmarks (long, `decided`, cited by everything), and a landmark is the one
      document a rule refusing the uncited can never catch.
- [x] **P5.3 CORPUS CENSUS, n=40,000 through the deployed view:**
      **UNREACHABLE SOLELY FOR WANT OF AN INBOUND CITATION = 16,035 = 40.09%.**
      - 15,701 (39.25%) short (<2,000 chars) and uncited — **the LENGTH gate**
      - 334 (0.84%) refused class and uncited — the CLASS gate
      **The length gate is 47× the class gate.** The prompt framed this as a class
      problem; the corpus says otherwise.
- [x] **P5.4 THE RESCUE IS A MIRAGE:** `CITED_AUTHORITY_REACHABLE` holds
      **11 of 40,000 = 0.03%** while the refusal it guards catches 40%.
- [x] **P5.5** ADVOCATE-100's `distinct_target_judgments: 281` is carried by ONE
      task (A100-007, 253 bound targets). The other 99 share **27** distinct
      judgments. Every per-authority statistic over that gold has n=27.
- [x] **P5.6** Sent to NEW2 (**bus 1049**) and LCC (**bus 1050**). Not resolved
      alone; the view is not in this lane.

---

## P6 — 1M HALFVEC CHECKPOINT  [!]

- [x] **P6.1** Stage crossed 1M and is at **1,027,052**.
- [!] **P6.2 DEFERRED, and the refusal is the record.** The box is running the
      walk, the ingest fleet and this lane's experiments. `CHECKPOINT_RUNBOOK_1M.md`
      holds the executable form. **No 8.85M extrapolation is made or implied.**

---

## P7 — HC-DENSE DECISION  [ ] — blocked on P2/P3, deliberately

- [ ] Do NOT promote 8.85M document vectors because they exist. The pilot already
      suggests the current HEAD:4800 representation is the WEAKEST measured arm.

---

## P8 — ADVOCATE-100 V2  ✅ EXECUTED

- [x] **P8.1** Run on leakage-audited gold (`new1_construction_rule_audit`,
      0 leakage failures). `advocate100-results.json`.
- [x] **P8.2 ENGINEERING:** TARGET_AT_1 10 · TARGET_IN_5 6 · TARGET_IN_PAGE 4 ·
      TARGET_MISSED 46 · NO_BOUND_TARGET 28 · HTTP_400 6.
      **16 of 72 bound targets reach the top 5 (22.2%); 11 of 42 families.**
- [x] **P8.3 BY CLASS — identity resolves, every concept class is at or near zero:**
      citation **6/6** (p50 **8 ms**) · case_number 4/4 · case_title 3/6 ·
      overruled 2/5 · **misspelling 0/5** · doctrine **1/12** · fact_pattern
      **0/10** · supporting_authority **0/6** · adverse_authority **0/4** ·
      current_law 0/4 · statute 0/3 · long_narrative 0/3 · pasted_passage 0/3.
- [x] **P8.4 LATENCY IS CONTAMINATED AND SAYS SO.** p50 5,109 ms, p95 30,020 ms,
      recorded `LOCAL_CONTENDED` — the walk was staging and the representation lab
      was embedding throughout. v1 measured p50 1,716 ms on a quieter box. **The
      concept-class p95 is the statement bound, not a representation fact.**
      A clean-box re-run is owed before any latency number is quoted.
- [x] **P8.5** `PREFER_OVER_CURRENT_WORKFLOW` NOT invented. No reviewer answers fabricated.

---

## P12 — NEGATIVE / ADVERSARIAL RETRIEVAL SET  ✅ COMPLETE

- [x] **P12.1** `retrieval-safety-cli.ts`, `pnpm safety:retrieval`,
      `retrieval-safety.json`.
- [x] **P12.2 THE METRIC IS NARROW ON PURPOSE.** `/search` returns authorities,
      not answers, so a page of near-misses for a nonsense query is often the
      RIGHT product answer. What matters is an **exact-identity route answering a
      query about something that does not exist** — a ranked list says "these are
      the closest things I hold"; an exact route says "this is the case you named".
- [x] **P12.3 FALSE_IDENTITY_RATE = 0/6.** Six fabricated identifiers
      (`2099 INSC 9999`, `2098:DHC:888888-DB`, `(2097) 14 SCC 991`, two invented
      titles, an impossible case number), each **confirmed absent from the corpus
      before use**, and **no exact route answered any of them**.
- [x] **P12.4** NON_EMPTY_RATE 25/38, reported as BEHAVIOUR, never as pass/fail.
- [x] **P12.5 AN INSTRUMENT BUG CAUGHT AND FIXED, NOT REPORTED AROUND.** The
      first run printed `FALSE_IDENTITY_RATE 0/0` — a `count(*)` over a three-way
      `OR` timed out at 15 s (`neutral_citation` alone measures **21.2 s**), so no
      probe's absence was ever confirmed. **A denominator of zero is not a pass**;
      it is an instrument measuring nothing while displaying a reassuring number.
      Now three bounded `EXISTS` probes on a longer-timeout connection, and an
      unconfirmable probe is EXCLUDED and named.

---

## P11 — TEMPORAL CORRECTNESS  ✅ COMPLETE

- [x] **P11.1** `temporal-correctness-cli.ts`, `pnpm safety:temporal`.
- [x] **P11.2 DATE_BOUND_RESPECTED: 0 violations across 8 probes**, every one of
      which returned 5 results. The date filter is correct.
- [x] **P11.3 THE FIRST RUN OF THIS PROBE WAS WRONG AND SAID THE OPPOSITE.** It
      reported violations in five of eight probes — because it sent `dateTo` at
      the TOP LEVEL when the schema nests it under `filters`
      (`services/api/src/search/route.ts:167`), so zod stripped it and the search
      ran unfiltered. **The product was correct; my instrument was not.** Caught
      by checking the schema before reporting a temporal leak, which is a serious
      claim about a shipped product.
- [!] **P11.4 DATE_SUSPECT_SURFACED is UNMEASURED** — there is no `date_state`
      column on `judgments` on this database. Reported as unmeasured, never
      scored as clean.
- [x] **P11.5 SCOPE HELD:** this tests date bounds ONLY. It does not test good-law
      status — `overruled_status` is never cached, is read live at render, and is
      a different system. A date bound is not a currentness check.

## P13 — QUERY ROUTER  [ ] — deliberately not started
      The router's premise is that different modes are each useful on their own
      queries. P3 says the concept path has 10–26% candidate recall, so routing to
      it would route to a path that cannot answer. **Routing is the right idea at
      the wrong time**; it waits on coverage.

## P9 — RELEASE DECISION  ✅ COMPLETE
- [x] `SEMANTIC_SEARCH_RELEASE_DECISION.md` — **verdict C**, with the corrected
      reason: semantic search fails because the documents are not in the index,
      not because ranking or representation is wrong. Identity search is ready
      and is a different product.

## LCC FOLLOW-UPS ANSWERED THIS SESSION

- [x] **LCC bus 1060 — the search-path OOM.** LCC's MECHANISM is **REFUTED**:
      an early-exit scan found **zero judgments** with a `full_text_tsv` over
      4 MiB, and a 0.5% sample puts the largest at **249,641 bytes stored /
      397,102 detoasted**. A 96 MiB allocation is **247×** the largest tsvector in
      the corpus, so it cannot be one pathological document. The arithmetic
      (96 MiB / 388 KiB ≈ 247 rows) points at the `ts_rank` sort materialising a
      large match set — **labelled INFER, not reproduced.** LCC's proposed remedy
      (bound the candidate set, not the clock) is *more* right for it: a match-set
      cause cannot be quarantined away. Instrument checked first — `pg_column_size`
      can report an 18-byte TOAST pointer, and here it does not. Sent as **bus 1063**.
- [x] **LCC bus 1054 — the threshold counterfactual**, run and sent as **bus 1064**:
      | threshold | additions | cumulative | proc_disposal | UNCLASSIFIED | chaff/all | **chaff/CLASSIFIED** |
      |---:|---:|---:|---:|---:|---:|---:|
      | 2000 (deployed) | 0 | 0 | — | — | — | — |
      | 1500 | 4,333 | 4,333 | 241 | 3,422 | 5.6% | **26.5%** |
      | 1200 | 2,676 | 7,009 | 212 | 2,147 | 7.9% | **40.1%** |
      | 800 | 3,877 | 10,886 | 463 | 3,010 | 11.9% | **53.4%** |
      **LCC's own decision rule answers NO once the denominator is right.**
      ~77% of every band has no class verdict, so `chaff/all` is a FLOOR, not a
      rate. **I said the 2,000 gate is closer to right than my own bus 1050
      implied** — against my own finding. The real blocker is that 77% is
      unclassified, which is a coverage question before it is a threshold one.
- [x] **Sampling variation disclosed rather than hidden:** three TABLESAMPLE draws
      gave **40.09% / 38.77% / 38.61%** for the headline. Quote it as **~39% ± 1**.

## REPORTING RULES IN FORCE

- [x] Every launch-relevant claim carries QUALITY · SAFETY/COVERAGE · LATENCY
- [x] Conditional scores labelled `CONDITIONAL_RECALL`
- [x] No invented launch threshold
- [x] Staged vector count never offered as evidence of search quality
- [x] Contaminated latency labelled contaminated
