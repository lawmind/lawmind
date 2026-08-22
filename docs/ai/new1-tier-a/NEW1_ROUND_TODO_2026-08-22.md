# NEW1 ROUND TODO — 22 Aug 2026

Derived from the binding NEXT-ROUND CONTRACT, the NEW1 lane prompt (P0–P9), the
GLOBAL CORRECTION ADDENDUM and the NEW1 CORRECTION (A–F).
Live file. `[x]` = OBSERVED done · `[~]` = in progress · `[ ]` = not started ·
`[!]` = blocked/deferred, with the reason. Every completed item names its evidence.

Mission: **MAKE LAWMIND FIND THE RIGHT LAW.** Embedding-walk progress is NOT
retrieval quality.

---

## S. SESSION SETUP

- [x] **S1** Bind lane = NEW1
- [x] **S2** Read plan tail · dossier R1 · bus 1004→1017
- [x] **S3** Inspect real process + checkpoint state before trusting any count
- [x] **S4** This TODO file, kept updated as items land
- [x] **S7** Global CORRECTION ADDENDUM + NEW1 addendum (A–F) folded into this list
- [ ] **S5** `docs/OPEN_DECISIONS.md` + `FOUNDER_QUEUE.md` entries touching retrieval
- [ ] **S6** Full read of `SEARCH_CONTRACT_FOR_PRODUCT.md` carry-over

---

## P0 — KEEP THE TIER-A WALK HEALTHY

- [x] **P0.1** One owner identified, not restarted while healthy: GPU sidecar
      (`server.py --port 8799`), keeper (`sidecar-keeper.mjs`), walk
      (`doc-vector-embed.mjs` under `stage-runner.sh`)
- [x] **P0.2** Verified by PROGRESS, not process presence — batch `lcc-00076`
      advancing, worklist 67/864, `tableRows` 787,037
- [x] **P0.3** Re-verified twice. **THIRD CHECK FOUND IT DEAD.** A fleet-wide restart
      at ~09:34Z killed the runner shell mid-`lcc-00092`; batches 89/90/91 had ended
      clean, so this was not a contract refusal. Last STAGE DONE 09:32:34Z,
      `tableRows` **822,134**.
- [x] **P0.3a** GPU sidecar proved healthy FIRST (`GET /health` 22 ms, `POST /embed`
      253 ms, CUDAExecutionProvider) — so the sidecar was not the cause
- [x] **P0.3b** Walk relaunched by hand (`Start-Process … walk-launch.sh`), verified by
      NEW log lines (`END lcc-00010`, `START lcc-00011`, 10:04:44Z) — not by a process count
- [x] **P0.3c** Keeper defect made observable: its own relaunch failed silently TWICE
      (`relaunch DID NOT TAKE`, 09:53 and 09:58) while a hand-run of the same launcher
      worked first try — the second occurrence of an episode its own comment records
      from 21 Aug. `stdio: 'ignore'` was discarding PowerShell's only explanation; it
      now writes `.agents/logs/new1-walk-relaunch.log`.
      **Cause still UNKNOWN. This makes the next failure diagnosable; it does not fix it.**
- [x] **P0.4** CONFIRMED FROM CODE: every batch re-reads `hc_document_class` and
      `judgment_embedding_eligibility.text_safety` live (never trusts the manifest),
      refuses `UNSAFE_VERIFIED` unconditionally, and `assertContractHash()` halts the
      walk when the deployed view moves (three reconciliations, current `2e7b53afe35fa81c`)
- [x] **P0.5** ACCOUNTING CLOSES (`stage-accounting.json`, `stage:accounting`).
      113 batches, **1,119,642 rows walked**: staged this run 386,572 · already
      staged 620,355 · refused TEXT_UNSAFE 81,692 · refused class/tier 21,014 ·
      no text 0. **CURRENT_FORMAT_UNEXPLAINED = 0** — every walked document is
      staged or refused by a rule that can be named. The 10,009 residual rows are
      all in three 19-Aug batches whose log format predates the refusal counters.
      Live tables: stage **985,539**, quarantine 72,092.
      Taken from the walk's own STAGE DONE lines, not a join: the three-way join
      over 18.7M rows blew a 900 s budget while the walk was staging, and a
      cheaper wrong answer is not worth having.
      **The manifest denominator is STALE and a completion percentage against it
      would be wrong** — it was generated under eligibility hash `e76879ab6bbcd452`,
      deployed is `2e7b53afe35fa81c`, and two of those revisions changed WHICH
      documents are eligible. Corpus-wide re-derivation DEFERRED to a quiet window.
- [x] **P0.6** MEASURED: `judgment_text_recovery` holds **67 rows**, and **0 of them
      have a staged vector**. No recovered OCR text has been embedded.
      **Stated as a forward risk rather than a clean bill:** the walk reads
      `judgments.full_text` and has NO rule about recovery provenance. It is safe today
      because the recovery pilot is 67 documents and none are staged — not because
      anything would stop recovered text entering the GPU once NEW2 writes it into
      `full_text` at scale. That rule needs to exist before the recovery program grows.
- [ ] **P0.7** One more liveness check before the session's final report
- [x] **P0.8** Walk verified healthy again at 15:15Z — batch `lcc-00110`, worklist
      89/864. Stage is **985,539 rows**, so the P7 1M checkpoint is close.

---

## P1 — CASE-NAME QUALITY

Baseline (frozen gold `ba9357cba2fbf297`, n=229, LOCAL_CONTENDED): s@1 **67.69%**,
s@5 71.62%, MRR 0.6947, timeouts 9, wrongPins 65, p50 1,608 ms / p95 19,196 ms.

- [x] **P1.0** Baseline established from the frozen gold
- [x] **P1.1** Whole path recorded as code facts: `caseNamePins` → `exactCaseTitle`
      (whole-query = whole-title normalised; returns NULL unless EXACTLY ONE row) →
      `caseTitleTrigram` (rarest-token `ILIKE` + `word_similarity ≥ 0.65`, own 2,500 ms
      budget). Pin budget `floor(limit/2)` = **2 slots**; `skipSparse` fires whenever
      ANY pin lands — so a wrong pin also suppresses the lexical arm that might have
      recovered the right case.
- [x] **P1.2** Failure decomposition, all 229, earliest-cause-wins
      (`case-title-decomposition.json` + `case-title-routing.json`):
      - **F1 TITLE_AMBIGUITY — 74/229 (32.3%), dominant.** The gold title names 2–16
        different judgments (max 16, spanning 2012–2024, different dates and lengths —
        NOT copies of one matter). `exactCaseTitle` returns NULL on N>1 by design, so
        the trigram probe decides, and every twin scores `word_similarity` = **1.000**:
        a tie broken by physical row order.
      - **F2 STRUCTURED_HIJACK — 9/229 (3.9%), 5 lose gold entirely.** A title
        containing `AND` is parsed by qlang as a boolean query, answered by
        `answerStructured`, and `/search` returns BEFORE `hybridSearch` runs — the
        exact-title pin never happens. Reproduced end-to-end through `createApp`.
      - **F3 SECTION_HIJACK — 1/229.** `SECTION_RE` precedes `CASE_NAME_RE`, so a title
        containing "SECTION 1" routes to the statute-reference lookup.
      - Budget: **42/229 (18.3%)** blow the 2,500 ms trigram budget; **29/229** have gold
        at probe rank 3–20 where only 2 pin slots exist.
      - Sub-families the prompt named that MEASURED AS NOT THE CAUSE: the exact
        normalised route itself (index scan **0.8 ms** on
        `judgments_case_title_normalised_idx`), V/VS/VERSUS, initials, punctuation,
        OCR name noise — all 229 score `word_similarity` 1.000 against their gold.
- [x] **P1.2a** (addendum B) EXACT-ROUTE-DECLINED vs FUZZY-RANKED-BADLY:
      **declined 74 · fuzzy-ranked-badly 0.** The exact route is not weak, it ABSTAINS.
- [x] **P1.3** Split metric — the aggregate was hiding two populations:
      | population | n | rank 1 | in top-5 |
      |---|---|---|---|
      | unique title | 155 | 146 (**94.2%**) | 149 (96.1%) |
      | duplicated title | 74 | 9 (**12.2%**) | 15 (20.3%) |
      | pooled (the 67.69%) | 229 | 155 | 164 |
      57 of 65 wrong pins and 8 of 9 timeouts are duplicated-title queries.
      Probe-rank distribution: 1→136 · 2–5→31 · 6–20→12 · absent→50.
      **`s@20 == s@5` is an instrument artefact: `RESULT_LIMIT=5` makes anything past
      rank 5 unobservable.**
- [x] **P1.4** Dominant family named, and it is not a scoring problem: **identity
      ambiguity plus two routing bypasses.** No ranking weight touched.
- [x] **P1.4a** Fix SIMULATED on the same frozen gold (pin EVERY exact normalised-title
      match, order `judgment_date DESC, id`):
      **s@1 67.69% → 83.41% · coverage@5 71.62% → 95.63% · coverage@20 → 97.38% ·
      latency p50 1,608 ms → 1 ms, p95 19,196 ms → 1 ms, max 383 ms.**
      24 of 74 ambiguous sets hold ≥6 judgments, so full coverage also needs P5.
- [x] **P1.5** Recommendation sent to LCC — **bus 1021**, with the pin-all shape,
      the three families, the simulated numbers and the three-dimension summary.
- [!] **P1.6** Server change only after bus ownership handshake (LCC owns `services/api`).
      The uncommitted `rarestToken` stemming fix already in the tree needs that note too.

---

## P2 — WHY DOCUMENT-VECTOR DENSE IS ONLY ~13–15%

- [x] **P2.1** Provenance pinned: `reach:docvec` over `new1_probe_half_250k` (256,998
      staged vectors, HNSW, ef_search 200) — fact_passage s@5 **15.21%** (n=355 in index),
      nl_doctrine s@5 **13.33%** (n=195). **CONDITIONAL_RECALL** — scored only on gold
      present in the probe.
- [x] **P2.2** Full decomposition, 571 rows (`dense-failure-decomposition.json`):
      `QUERY_VECTOR_MISMATCH_OR_REPRESENTATION` 350 · `TARGET_RANKED_TOO_LOW_NEAR` 74 ·
      `OK_TOP5` 80 · `OK_TOP20_NOT_TOP5` 25 · **`ANN_MISS` 21** · `NOT_STAGED` 20 ·
      `TEXT_UNSAFE` 1. Exact-rank buckets: 1→58 · 2–5→34 · 6–20→29 · 21–200→79 ·
      201–2k→90 · 2k–20k→119 · >20k→141.
- [x] **P2.3** **Not the index** — `ANN_MISS` 21/571 (3.7%); exact and ANN rank agree
      elsewhere. **Not the document vector** — self-retrieval **68 of 68** sampled
      misses return at rank 1 from their own stored head text.
- [x] **P2.4** **HEAD:4800 truncation REFUTED as the mechanism** — 42.2% of the
      worst-miss family's documents are WHOLLY inside 4,800 chars vs 49.2% of the
      successes. Query length equally flat (miss p50 197 chars, hit p50 237).
- [x] **P2.5** ROOT CAUSE, in one sentence: **document-level vectors cannot answer
      sentence-level queries.** Same documents, two queries — the whole embedded head
      text returns the document at **rank 1, 68 of 68**; ONE SENTENCE from inside that
      same head text returns it in the top 5 **17.5%** of the time.
      **I had this backwards first and corrected it**: I wrote that the queries come
      from the CITING judgment. `QUERY_NOT_IN_GOLD = 0` proves all 571 occur verbatim
      inside their own gold judgment (NEW3 bus 0940 says the same of the construction).
- [x] **P2.6** (addendum C) MEASURED labels, `semantic-query-audit.json`:
      `QUERY_LOOKS_ANSWERABLE` 557 · `QUERY_TOO_FACT_HEAVY` 6 · `QUERY_IS_BOILERPLATE` 5 ·
      `QUERY_TEXT_DAMAGED` 3 · `QUERY_NOT_IN_GOLD` 0. **The boilerplate figure is a
      FLOOR, not a rate** — the corpus-wide phrase probe completed on 41 of 120 and the
      other **79 are recorded UNMEASURED**, never counted as answerable.
- [x] **P2.7** HEAD:4800 re-tested the RIGHT way (`head-offset.json`): the query's own
      words INSIDE the embedded window → s@5 **17.47%** (n=332); BEYOND it → **9.60%**
      (n=198). Truncation roughly doubles the failure rate and is worth a few points;
      it is not the headline.
- [x] **P2.8** Findings sent to NEW2 — **bus 1026** — with three binding construction
      rules for ADVOCATE-100 (never make the query a substring of the target; require a
      question an advocate could pose before seeing the answer; screen query text for
      damage with the document detector).

---

## P3 — BEST PRACTICAL CONCEPT RETRIEVAL  *(after P2)*

> Constraint carried from P2: arms must target QUERY↔DOCUMENT mismatch. An index
> change cannot help 3.7%, and a longer document representation cannot help a
> population whose documents already fit inside the window.

- [x] **P3.1** ONE arm chosen, because only one survives P2: **passage-level vectors
      over the SAME head text**. Everything else is an answer to a refuted hypothesis —
      a new model (self-retrieval 68/68), a longer window (worth ~8 points, measured),
      an index rebuild (3.7%), a reranker (the answer is 2,000 places away, not
      mis-ordered). `passage-vs-document-cli.ts` written: paired, same document subset,
      same distractors, so the two arms cannot differ by corpus.
- [~] **P3.2** RUNNING, and it exposed an operational fact worth more than the arm:
      **`getEmbedder()` embeds IN-PROCESS ON CPU by default** (`services/embed/src/embed.ts`
      — `EMBED_DEVICE` defaults to `cpu` because production has no GPU). It does NOT use
      the CUDA sidecar the walk feeds. So every harness experiment this session has been
      burning CPU, not GPU: the passage run reached **14,358 CPU-seconds** (~8 cores) and
      is what drove the resource gate to `CPU 82.7%` and the walk from 8,800 to
      ~7,500 tok/s. `EMBED_DEVICE=dml` exists and is measured cosine-identical at fp32
      (`embed.ts`), but with the walk holding the GPU (VRAM free 450 MiB) it is not free
      either. **Heavy harness embedding and the walk cannot both run; that is the real
      constraint, and it belongs in every future experiment's plan.**
      I stopped the run's shell; the detached node process survived and `Stop-Process` is
      not permitted in this session, so it is finishing on its own.
- [ ] **P3.3** Recommendation = strongest PRODUCTION search under sane latency/storage

---

## P4 — SPARSE ARM DECISION FOR LCC

- [x] **P4.1** Paired arms run, n=60 stratified, production's own 15 s bound
      (`sparse-arms.json`):
      | arm | gold found | @1 | @5 | timeouts | p50 |
      |---|---|---|---|---|---|
      | A current `sparse()` | 16 | 9 | 10 | **35** | 15,013 ms |
      | C all-common fallback DELETED | **0** | 0 | 0 | **60** | 15,019 ms |
      | **D rarest-3 ANDed** | **34** | **17** | **22** | **4** | **815 ms** |
      | E rarest-3 ORed | 8 | 4 | 7 | 51 | 15,016 ms |
      **Arm B control: 0 of 60 gold authorities exist in `judgment_chunks` at all** —
      the dense arm cannot contribute a single correct answer to this population.
- [x] **P4.2** **The dossier's LONG_QUERY_POLICY_V1 item (1) is REFUTED.** Deleting
      the all-common fallback is the WORST arm — 100% timeouts, zero gold. The cost is
      the wide OR plus `ORDER BY ts_rank`, not the fallback; arm E shows three ORed
      lexemes still time out 51 times in 60, so it is the OR and not the term count.
- [x] **P4.3** Sent to LCC — **bus 1025** — policy (replace the OR pass with rarest-3
      ANDed), 2.1× recall, 18× faster p50, 9× fewer timeouts, the exact skip condition,
      and DEGRADED-not-empty wire semantics.

---

## P5 — PAGINATION RANKING CONTRACT  *(LCC implements, NEW1 owns correctness)*

- [x] **P5.1** WRITTEN — `PAGINATION_RANKING_CONTRACT.md`, all five result kinds,
      each with its required ordering keys and the reason a missing `id ASC` makes
      re-execution impossible.
- [x] **P5.2** Fixtures specified (§7), drawn from the frozen gold — including the
      16-judgment title set and the 15-judgment citation set.
- [x] **P5.3** GATE MEASURED (`rank-stability.json`, 12 queries × 3 executions):
      **case_title 3/3 stable · citation 3/3 stable · nl_doctrine 2/3 · fact_passage 2/3.**
      **Both unstable queries are exactly the two where the degraded set varied** (one
      ran 25,091 / 13,298 / 9,510 ms). No instability from ties, none from the
      exact-identity paths. So the answer SPLITS: deterministic re-execution is safe
      for exact-identity pages NOW; hybrid pages wait on P4, because the cause is a
      timeout and not a ranking defect.
- [x] **P5.4** Contract + fixtures + gate sent to LCC — **bus 1027**.

---

## P6 — CITATION BENCHMARK CORRECTION

- [x] **P6.1/6.2/6.3** RE-GRADED (`citation-ambiguity-regrade.json`, `cite:ambiguity`):
      **UNIQUE_CITATION_EXACTNESS n=212, s@1 100.00%, s@5 100%.**
      **AMBIGUOUS_CITATION_CANDIDATE_COVERAGE n=17** — gold reachable 88.24%,
      **false pins 0**, arbitrary-rank-1 64.71% (luck, not quality), largest set 15.
      Pooled s@1 was 97.38% and is retired as the gate number: it averaged a lookup
      that is perfect with a question that has no single answer.
      NEW2 bus 1019 settles what the ambiguity IS: 53.9% duplicate documents, 30.7%
      connected matters under one common order, 13.9% multiple orders in one case,
      0.9% court batch numbering, 0.1% our extractor. **A neutral citation names a
      DISPOSAL EVENT, not a judgment** — so the product answer is "this citation
      covers 253 connected matters", and `exactCitation` abstaining on 2+ is right.

---

## P7 — 1M HALFVEC CHECKPOINT

- [x] **P7.1** Gate READ, with `DATABASE_URL` exported first so a DEFER means pressure
      and not an unreadable gate. Stage is **985,539** — the 1M checkpoint is within
      one batch — but the gate says:
      ```
      DEFER  VECTOR_BUILD
             - CPU 82.7% > 50%
             - 5 active queries > 2
             - longest active statement 142s > 120s
             - commit free 7.1% < 35%
             - 6 ingest fleet process(es) writing — an index build wants the box to itself
      ```
- [!] **P7.2/7.3 DEFERRED, and the refusal IS the record** (addendum E). The walk is
      healthy and must not be stopped to reach a round number. `CHECKPOINT_RUNBOOK_1M.md`
      already holds the executable form — what to run, in what order, and what would
      make each answer untrustworthy. **No 8.85M extrapolation is made or implied.**

---

## P8 — HC DENSE RELEASE PATH  *(design)*

- [x] **P8.1/8.2** WRITTEN — `HC_DENSE_RELEASE_PATH.md`. Staging → accounting gate →
      immutable `judgment_document_vectors_rNN` → halfvec + HNSW → a VIEW the dense arm
      reads, so promotion and rollback are one `ALTER VIEW`. Each release row records
      the eligibility-view hash it was admitted under.
      The five gates with their state: G1 representation quality **BLOCKED** on
      ADVOCATE-100 · G2 gold retrieval gain NOT RUN · G3 halfvec scale NOT RUN (and
      must not stop the walk) · G4 body-text safety — the mechanism exists at embed
      time but **the re-check at PROMOTION time does not, and 72,092 rows have already
      been withdrawn after embedding, so it is required** · G5 mixed load NOT RUN.
      HC dense is a **FEATURE** gate: failing it blocks that surface, not the release.

---

## PA — LONG-PASSAGE RESEARCH TRACK  *(addendum A — after P2/P4)*

- [ ] **PA.1** Bounded sweep: ~500 / ~1,000 / ~2,500 / ~5,000 chars
- [ ] **PA.2** Arms: direct dense · deterministic condensation · bounded keyword
      extraction + dense · current path as control. **The whole passage NEVER goes to
      corpus-wide `sparseAny`.**
- [ ] **PA.3** Measure target recall · s@5 · latency · query-embedding behaviour ·
      whether long irrelevant facts degrade the vector · false positives
- [ ] **PA.4** Output `LONG_PASSAGE_SEARCH_CONTRACT_RECOMMENDATION` + the MAXIMUM SAFE
      INPUT SIZE the current stack supports
- [ ] **PA.5** 500 chars recorded as a CURRENT SAFETY BOUND, never the product vision.
      No server behaviour without LCC coordination.

---

## P9 — ADVOCATE-100  *(waiting on NEW2)*

- [!] **P9.1** BLOCKED on NEW2's primary-source-bound gold artifact
- [ ] **P9.2** On delivery: ENGINEERING metrics separated from
      TASK_COMPLETION_WITH_SAFE_EVIDENCE; no target language in queries; paraphrases
      grouped by target/proposition family; failure taxonomy, not just aggregates

---

## REPORTING RULES IN FORCE  *(global addendum §3–§5; NEW1 addendum D, F)*

- [x] Every launch-relevant claim carries QUALITY · SAFETY/COVERAGE · LATENCY.
      A fast wrong result is not a pass; a relevant result on unsafe evidence is not a pass.
- [x] Scores computed only over reachable documents are labelled **CONDITIONAL_RECALL**
- [x] No invented absolute launch threshold — absolute usefulness waits for
      ADVOCATE-100 + lawyer review
- [x] An SC-only benchmark is never described as HC search
- [x] No agent recommendation is treated as founder approval; founder-gated items go to
      `FOUNDER_QUEUE.md` and the lane keeps going
- [x] No cloud provisioning, no paid infrastructure, no pricing changes

---

## DO-NOT-DO  *(standing guard)*

citation RESOLVER itself · broadening ingestion · product UI changes · a new reranker
unless P2 proves BADLY_RANKED dominant · GPU micro-optimisation · new corpus
acquisition · HyDE · graph expansion · corpus-wide OCR · new cloud/Railway/GPU rental ·
changing pricing.

---

## SESSION SUCCESS CRITERIA

- [x] **why case-title rank is wrong** — identity ambiguity (32.3% of gold titles name
      2–16 judgments; the exact route abstains), plus a qlang `AND` hijack and a
      `SECTION` hijack that bypass the pin. Not a scoring problem.
- [~] **why doc-vector dense is only ~13–15%** — not the index (3.7%), not the document
      vector (68/68 self-retrieve at rank 1), not HEAD:4800 truncation (equal exposure).
      Query↔document mismatch; gold construction under measurement.
- [ ] which bounded sparse policy replaces the current timeout behaviour
- [ ] which retrieval architecture has the strongest evidence
- [ ] whether 1M halfvec is production-plausible (if the checkpoint is reached)
- [ ] how pagination preserves rank
- [~] the walk keeps progressing safely — died once at 09:34Z, restarted 10:04Z,
      re-checked before the final report
