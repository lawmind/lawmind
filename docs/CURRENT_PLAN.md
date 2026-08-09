# CURRENT PLAN — the single ordered queue

**Read this file at session start, after the mandatory set in `CLAUDE.md` §0.**
It exists because a plan held only in a todo tool does not survive compaction, a
new session, or a fresh agent. **This file does.**

Last updated **8 August 2026**. Owner: **LCC (server lane)**. RCC's plan is
`docs/RCC_MASTER_PLAN.md` and is not duplicated here.

> **The ordering rule, and it is not negotiable.** `docs/GTM_INDIA.md` §9: Gate S2
> passes **before** the ground campaign. A field campaign against 2 million
> advocates is a one-shot instrument — an advocate who finds a citation they
> cannot rely on and says so in the bar room has cost us that bar room
> permanently. **The ground game amplifies whatever is actually there.**

---

## 0 · STATE OF PLAY, in five numbers

| | |
| --- | --- |
| **Gate S2** | **FAILING.** success@5 **17.3%** control · **22.3%** with graph + reranker, against a 0.70 floor. Both re-measured 9 Aug after a defect that pinned the wrong judgment at rank 1 on 13.1% of the set was removed — the old 19.1%/23.7% are void and were **inflated by leakage** |
| Corpus | 38,341 judgments · 616,197 embedded chunks · 192,197 citation edges (44,785 resolved) |
| Citator | **22 judgments flagged of 38,341.** 7 more are `overruled_in_part` and blocked on paragraph extraction |
| Harness | 25 queries of 30. **All three previously unmeasurable metrics now produce numbers** — a generation path exists (`generate.ts`) and an adversarial runner exists (`adversarial.ts`). Until 9 Aug there was NO model call in the package, and `run-cli.ts` reported 0 (a PASS) the moment `OPENROUTER_API_KEY` merely existed |
| Reranker | **With the graph: 17.3% → 22.3%, delta +4.9%, interval 0.4 to 9.5, McNemar p = 0.049 — the rig says SHIPS**, marginally, on 283 queries. And it had **never once been measured on real passages**: 37.6% of candidates were being scored against an empty string until 9 Aug |
| Latency | **STILL THE BINDING CONSTRAINT, but 1.38× over rather than 3.8×.** Reranking is **4,136 ms mean · p95 4,263 ms** against Gate S1's 3 s for the whole request. Truncating to 256 tokens fits and was **measured and rejected** — it costs more accuracy than the reranker adds. The free lever (padding) is **dead at a 1.1% ceiling**. What remains: **12 candidates instead of 20**, cut from both ends so the graph slots survive |

**Where the three metrics actually stand, 9 Aug:**

| metric | value | note |
| --- | --- | --- |
| hallucinationRate | **0 of 31 refs** | below the observation floor → reported NOT MEASURED |
| silentDropRate | **0** | same |
| **adversarialPassRate** | **20.0%** | worst-case over 25 calls. **Threshold 1.0 — FAILS** |
| successAt5 | **24.0%** | the bottleneck everything else waits on |
| staleOverruledRate · overruledLeakage | 0 · 0 | PASS |

**Why the generation metrics are hard to measure at all:** at success@5 = 24%
the retrieved evidence genuinely does not answer most questions, so the model
abstains — correctly — and there are too few citations to compute a rate from.
**Retrieval is upstream of everything.**

**The fp32 reranker never OOMed.** It failed on a missing `onnx/model.onnx_data`
— the fp32 build uses ONNX **external-data format**, so `model.onnx` is only the
657 KB graph and the 2.27 GB weights live in a companion file that was never
downloaded. The error surfaces from `InferenceSession::Initialize` as
*"file_size: The system cannot find the file specified"*, which is easy to read
as an allocation failure and is not one.

**The file is now fetched** and sits beside the 571 MB q8 build. **fp32 is
untested, not broken** — so the "q8 is the only usable build" constraint that
shaped the reranker work may simply not exist. Test it once the running A/B is
clear; loading 2.27 GB alongside a live experiment risks killing it.

**Also measured 9 Aug:** q8 on DirectML is **230 ms/passage — 11.5 s per query**.
Int8 kernels are poorly accelerated on DML, so the quantisation that lets this
model run on CPU is what stops the GPU helping it. **Embeddings on GPU,
reranking on CPU** is the split that works.

**Changed 9 August 2026 — keys and database are now LIVE:**

| | |
| --- | --- |
| OpenRouter | **WORKING.** Verified call, cost **$0.0000029**. DeepSeek V4 Flash **$0.098/$0.196** per M tok. **It emits reasoning tokens — a small `max_tokens` returns EMPTY content** |
| Claude API | **WORKING** (Haiku 4.5 verified) |
| Database | **OPEN** via Railway TCP proxy `altaria.proxy.rlwy.net:40754`, proxy id `dc1959e1-…`. **DELETE IT WHEN DONE** |
| Migration 0025 | **APPLIED** to production — it had never been run |
| Training extraction | **6/6 live tests pass** against the real corpus. The SQL had never once executed before today |
| Citation fast path | **VERIFIED on the real corpus**: 279 near-miss citations → **0** resolved to their source; 25/25 real and 20/20 reporter citations resolve |
| Re-embed cost | **$65 line STRUCK.** Measured **36.6 ms/chunk on this machine's CPU** → 616,197 chunks ≈ **6.3 h** (12–19 h realistically). An overnight run, not a purchase |
| Indian Kanoon | **NOT A BLOCKER — SETTLED.** No API: it is metered and the budget goes to Supreme Today instead. Website accounts only. The metered client stays built and refusing, permanently |

---

## 1 · TIME-CRITICAL — the Supreme Today account arrives tomorrow

The founder buys **one account** to test. `docs/HARVEST_ENGINE.md` §13: **day one
is measurement, not harvest.** Everything below must exist before then so day one
is not spent building scaffolding.

- [x] **Pacing engine** — `services/ingest/src/harvest/pace.ts`, AIMD, 15 tests
- [x] **Supreme Today client** — session + circuit breaker, 12 tests
- [x] **Indian Kanoon client** — metered, budget-guarded, 11 tests
- [x] **Raw archive + fetch ledger** — migration `0023`, `harvest_fetches`.
      Content-hashed, immutable, records refusals. Three constraints close the
      ways a ledger could lie
- [x] **Resumable, de-duplicated work queue** — `harvest_queue`, UNIQUE
      (source, item_key). 9 store tests observed against real Postgres
- [x] **The licensed `verified_by_source` value** — migration `0024`.
      `ecourts > public_x2 > ecourts_bulk > licensed > corpus`
- [x] **A display gate** — `licensedDisplayPermitted()`, **default false**, opens
      only on an exact `LICENSED_DISPLAY_PERMITTED=true`. A withheld headnote is
      **null, never a truncated version of theirs**
- [x] **Day-one probe** — `pnpm --filter @lawmind/ingest harvest:probe`. Refuses
      honestly without credentials and prints a completion date and total cost

**§1 IS COMPLETE.** The account can be used the day it exists.

**Day-one script, in order:** what does the account actually see · what is the
real sustained rate · how big is the overlap between our 38,341 citations and
their resolvable set · archive **one** page and build the parser against it
**offline**. Never iterate a parser against the live service — that is paying for
our own bugs.

---

## 1b · BHARAT.LAW — 2–3 accounts, founder decision 9 August 2026

The founder has decided to buy **two or three accounts**. The client is built.
**It refuses today, on purpose**, and the reason is not caution — it is that the
permission is a different shape from Supreme Today's.

- [x] **Account pool** — `services/ingest/src/harvest/bharatlaw.ts`, **30 tests**
- [x] **The consent gate** — `AUTHORISATION` is **null**, exactly like
      `court/authorisation.ts`. Every automated call refuses while it is null.
      **`CLAUDE.md` §6's rule applied to a second vendor: if the authorisation's
      terms are not in the repo, the switch stays off.**
- [x] **Benchmark and extraction are separate permissions**, never one flag.
      `extractionPermitted` is expected to stay **false permanently** —
      `BHARAT_LAW_OFFER.md` §5
- [x] **A 401/403 on ONE account halts the WHOLE POOL.** Tested by counting
      network calls, not by inspecting a flag. **This is the rule that keeps
      2–3 accounts from being ban-evasion** — answering a refusal with the next
      credential is circumventing an access control, which their AUP names
- [x] **Two ceilings, not one.** Each account carries its own credit
      entitlement (Pro = **10,000/month**, their published meter) *and* the pool
      carries a lower global daily ceiling, so **adding an account does not
      silently multiply our traffic**
- [x] **Consent overrides more accounts than it covers** → the pool refuses
      rather than quietly using the covered subset

**WHY IT IS OFF.** Supreme Today gave a **written licence**. Bharat.Law gave a
**verbal yes** — and their Evaluation Terms permit benchmarking only *"without
our prior written consent"*, which is a **consent requirement, not a ban**. One
email converts it. `FOUNDER_QUEUE.md` **FQ-BL1** holds the exact wording to send.

**ORDER OF OPERATIONS, and the first step costs nothing:**

1. **Free tier first, ₹0, no signup.** Run *Kharak Singh* and *Danamma* through
   it. **That settles curated-vs-computed before any money moves.**
2. **Send FQ-BL1.** If they will not put it in writing, that is also an answer.
3. **Then buy — monthly, never annual.** Transcribe the email into
   `AUTHORISATION` and the pool opens by itself.

**Nothing here is on the Gate S2 critical path.** §2 still outranks it.

---

## 2 · GATE S2 — everything else is downstream of this

- [ ] **Recall levers** — **REGROUPED 9 Aug 2026, because "blocked on $65" was
      wrong for half of them.** `docs/RETRIEVAL_ARCHITECTURE.md` §0.

      **Blocked on nothing but a live Postgres** (same thing the reranker run
      needs — not money, not a key):
      **citation-graph expansion**, which is *already built*
      (`services/api/src/search/graph-expand.ts`, IDF-damped, harness-wired
      behind `HARNESS_GRAPH`) and has simply **never been measured**. Measure it
      **with the reranker and without** — that file's own note says graph and
      reranker are one combination, since expansion enters at rank 16 and cannot
      move success@5 alone.

      **Blocked on the LLM key only** — these are *query-side*, so they need
      **no re-chunking, no re-embedding, no reindexing**:
      HyDE · multi-query / RAG-Fusion · query decomposition.

      **~~Blocked on ~62 GPU-hours ≈ $65~~ — STRUCK 9 Aug 2026, MEASURED.**
      `Xenova/bge-m3` fp32 on this workstation's CPU runs at **36.6 ms/chunk**,
      so all 616,197 chunks is **≈ 6.3 hours** (12–19 h realistically) — **an
      overnight run on hardware we already own.** The $65 assumed a rented GPU
      because Railway has none and nobody re-checked once a 4060 Ti existed.
      `docs/RETRIEVAL_ARCHITECTURE.md` §6c. So: late chunking ·
      summary-augmented chunking (**DRM is 95.2%**) are **blocked on nothing but
      a night** — but still run the free query-side and graph levers first.

      **AND THE FREE LEVER IS NOT DONE: HyDE is built and unmeasured**, so this
      section's own sequencing rule says measure it before spending the night.

      **The schema question, recorded before the six hours rather than after.**
      Late chunking and SAC change the CHUNKS, not the model — so they are new
      rows, not a new column, and `judgment_chunks` has
      `UNIQUE (judgment_id, chunk_index)`. Two chunkings cannot coexist in it
      without putting a strategy into that key, and doing so would also put both
      strategies inside **one HNSW index**, so every ANN search would have to
      over-fetch and filter — the exact cost `dense()` already pays for PD-10
      filters.

      **Recommendation: a separate table with its own HNSW index.** It leaves the
      live index untouched, needs no filter on the hot path, and is deletable in
      one statement if the new chunking loses. If it wins, it becomes the table.
      **The reversible choice, for an experiment that may well be rejected** —
      256-token truncation was.
- [x] **GRAPH EXPANSION MEASURED at n=283, 9 Aug 2026 — the first time ever.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **19.1%** |
      | **recall@20** | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.144 |

      **0 gained · 0 lost · 283 unchanged. McNemar: no discordant pairs at all.**
      By the A/B rig's own rule: **DOES NOT SHIP** on success@5.

      **But this is a success, not a null result, and `graph-expand.ts`
      predicted it in writing months ago:** *"Entering at rank 16 cannot move
      success@5 on its own. **Graph and reranker are one combination, not two
      features**."*

      **recall@20 moved +8.2 points.** The graph IS finding authorities that
      text similarity never retrieved — which is exactly the 56% that
      `BLOCKER_REGISTER` says no reranker can reach. They arrive below rank 5,
      so success@5 cannot move. **Recall is the thing the graph was supposed to
      fix, and it fixed it.**

      **The combination is now the experiment**, not either half.

- [x] **`ab both` MEASURED at n=283, 9 Aug 2026 — the combination DOES move the
      number, and then latency overrode the whole question.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **23.7%** |
      | recall@20 | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.162 |

      **29 gained · 16 lost · 238 unchanged. McNemar p = 0.072 — NOT SETTLED**,
      95% interval −0.0% to 9.2%. **~577 queries would settle it; this run was
      283.** So: promising, trending the right way, **not proven.**

      **The graph+reranker hypothesis held.** Graph alone moved success@5 by
      **zero** with 0 discordant pairs. Together they moved it **+4.6** with 45
      discordant pairs. The graph supplies authorities text similarity never
      found; the cross-encoder is what lifts them into the top five. Neither
      half does it alone, exactly as `graph-expand.ts` predicted.

      **BUT THE RUN BREACHED THE LATENCY BUDGET AND THE HARNESS SAID SO:**
      rerank **mean 11,424 ms · p95 55,074 ms**, against Gate S1's **3 s for the
      entire search request**. *"Accuracy is moot until this fits."*

- [ ] **~~AND THE LATENCY IS FIXED — 55×~~ — WRONG. RETRACTED SAME DAY.**

      **The 209 ms benchmark used ~50-character synthetic strings. Real
      judgment passages are 2,169–2,641 characters (median 2,519) — roughly
      **50× longer** — and cross-encoder attention cost grows with the SQUARE of
      sequence length.

      **Measured on real passages from the corpus:**

      | reranker | 20 REAL candidates | 20 synthetic |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** (A/B mean) | — |
      | **fp32 on DirectML** | **30,539 ms** · 1,527 ms each | **126 ms** |

      **fp32 on GPU is nearly 3× WORSE than q8 on CPU for the real workload**,
      and it sits at **7.9 GB of 8.1 GB** — which is why the fp32 A/B crashed at
      query ~210 with exit 13. The card cannot hold attention tensors for twenty
      2,500-character passages.

      **The latency breach is UNSOLVED.** Gate S1 allows 3 s for the whole
      request; the best measured reranker is 11.4 s.

      **That hypothesis was WRONG and is closed.** `rerank.ts` already sets
      `truncation: true, max_length: 512`, and already documents the quadratic
      cost. Nothing was untruncated.

      **But it led to the real lever. Measured on a realistic 2,530-character
      passage, q8/CPU, 20 candidates:**

      | `max_length` | 20 candidates | verdict |
      | --- | --- | --- |
      | **512** (current) | **3,613 ms** · 181 ms each | over the 3 s budget |
      | **256** | **1,647 ms** · 82 ms each | **inside** |
      | **128** | **786 ms** · 39 ms each | comfortably inside |

      **Sequence length dominates everything else.** It also explains the whole
      fp32 confusion: the 126 ms synthetic benchmark tokenised to ~15 tokens
      while real passages pad to the full 512, and cost is quadratic.

      **`RERANK_MAX_LENGTH` is now configurable, default UNCHANGED at 512**,
      because **the accuracy cost of truncating is unmeasured**. A cross-encoder
      that sees half a paragraph may rank it worse, and reranking exists to be
      accurate. **The decisive experiment is `ab both` at 256 against the 512
      baseline of success@5 = 23.7%** — it needs the corpus proxy reopened.

      **One discrepancy I cannot yet explain and will not paper over:** this
      bench measured **3,613 ms** at 512 tokens, while the `ab both` run
      reported a **mean of 11,424 ms**. Candidate causes are per-call overhead,
      varied real passage lengths, and CPU contention with the embedder. **Until
      that is reconciled, treat 3,613 ms as a floor rather than the number.**

      **What stands from the earlier entry:** the fp32 weights really were
      missing (`model.onnx_data`, 2.27 GB) and fp32 really does load now. Only
      the speed claim was wrong.

- [ ] **~~The 55× fix~~ — see above.** Retained for the record:

      | reranker | 20 candidates | verdict |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** | 4× over the whole request budget |
      | q8 on DirectML | ~4,600 ms | int8 is poorly accelerated on DML |
      | **fp32 on DirectML** | **209 ms** (10.4 ms each) | **fits, with room** |

      **"q8 is the only usable build" was never true** — the fp32 weights were
      simply never downloaded (`model.onnx_data`, 2.27 GB, external-data format).
      fp32 is also **unquantised**, so its accuracy should be at least q8's.

      **The caveat that decides whether this ships: Railway has no GPU.** This
      makes the reranker viable *if* it is served on a GPU endpoint, and lets us
      measure true unquantised accuracy locally today. Re-running `ab both` at
      fp32/DML now.

- [x] **TRUNCATION TO 256 TOKENS: MEASURED AND REJECTED — 9 Aug 2026.**

      **It fits the budget and makes retrieval measurably worse.**

      | | 512 tokens | 256 tokens |
      | --- | --- | --- |
      | success@5 | **23.7%** | **13.8%** |
      | recall@20 | 48.8% | 48.8% |
      | MRR | 0.162 | 0.118 |
      | rerank latency | 11,424 ms (pre-clip) | **2,104 ms · p95 2,255 ms** |

      **paired delta −5.3%, 95% interval −10.0% to −0.6% — it does NOT span
      zero. McNemar p = 0.040.** 16 gained, 31 lost across 47 discordant pairs.

      **This is a real degradation, not noise**, and it is worse than doing
      nothing: 13.8% is below the 19.1% control. **Half a paragraph is not
      enough context for a cross-encoder to rank Indian judgments**, and the
      cheap latency win costs more accuracy than the reranker was adding.

      **So the trade-off is settled and the answer is no.** The rig's own
      verdict: *"DOES NOT SHIP: it makes retrieval measurably worse."*

      `RERANK_MAX_LENGTH` stays at **512**. It exists now as a measured knob
      with a known cost, not an untried idea.

- [x] **512 tokens WITH the clip — MEASURED 9 Aug 2026.** **mean 4,136 ms ·
      p95 4,263 ms**, against 11,424 / 55,074 before. success@5 reproduced
      **exactly** at 23.7%, so the clip is score-neutral end to end and not only
      in the unit test.

      **It also closes the discrepancy §2 refused to paper over.** The bench said
      4,205 ms and the live run says 4,136 — **within 1.7%**. The old 3× gap was
      tokenising text the model then discarded; nothing else.

      **1.38× over budget, not 3.8×.** The p95 collapsed by **12.9×**, and the
      distribution is now tight (mean 4,136 vs p95 4,263) — that tightness is
      itself evidence the clip removed the variance source.

- [x] **The free latency lever is DEAD, measured not assumed.** `padding: true`
      pads every pair to the longest in the batch, and padding is masked — so
      length-bucketed batching would be **score-identical**, exactly like the
      clip. Sampled 400 real operative paragraphs: **93.5% already hit the 512
      cap**, min 351. There is almost no variance to exploit and the ceiling on
      bucketing is **1.1%**. Five minutes of measurement instead of a day of
      building.

      **So the remaining 1,136 ms has no free fix.** Retrieval is p95 488 ms
      (`CORPUS_TIERING.md` §4), leaving 2,512 ms for reranking → **12 candidates,
      down from 20.** And that cut **must keep the 5 graph slots**: graph
      suggestions enter at ranks 16–20, so a naive "rerank the top 12" would
      never see them and the entire +4.6 combination would evaporate.

- [x] **THE PIN DEFECT — 9 Aug 2026. It contaminated both arms of every A/B this
      project has run.** `services/api/src/search/query-shape.ts`, fixed in
      `c1bb164`.

      `classifyQuery` returned `shape: 'citation'` whenever **any**
      citation-shaped substring appeared *anywhere* in the text. Every eval query
      is a 200–900-character passage of judicial reasoning, and redaction removes
      only the *cited* judgment's own citations — up to three others are allowed
      to survive. So:

      | | |
      | --- | --- |
      | classified as `citation` | **140 of 283** |
      | resolved to exactly one judgment → **pinned at rank 1** | **46** |
      | **the pinned judgment was the WRONG case** | **37 = 13.1% of the set** |

      **Pinning inserts a judgment at rank 1 and shifts everything below it down
      one place**, so a gold answer sitting at rank 5 was pushed out of the top
      five by a case the passage merely mentioned in passing.

      **`warrantsExactLookup` had already written down the rule it was
      violating:** *"a missed citation is a slower correct answer, while a
      wrongly-claimed citation would pin the wrong judgment at rank 1."* The
      classifier was simply not strict enough to honour it. **A citation must be
      what the query is ABOUT, not merely present in it** — tested as the length
      of what remains once the citation is removed.

      **Verified on the real corpus rather than asserted:** wrong pins **37 → 0**,
      while the live hard-negative suite still returns **25/25 real and 20/20
      reporter citations resolving** and **279 near-misses resolving to nothing**.

      **EVERY NUMBER ABOVE WAS MEASURED THROUGH THIS AND IS VOID** — 19.1%
      control, 23.7% graph+reranker, 13.8% at 256 tokens.

      **RE-MEASURED at n=283, and the verdict changed.**

      | | through the wrong pins | **corrected** |
      | --- | --- | --- |
      | success@5, control | 19.1% | **17.3%** |
      | success@5, graph+reranker | 23.7% | **22.3%** |
      | recall@20 | 40.6% → 48.8% | 38.9% → **48.1%** |
      | MRR | 0.140 → 0.162 | 0.119 → **0.153** |
      | paired delta | +4.6%, interval **−0.0 to 9.2** | +4.9%, interval **0.4 to 9.5** |
      | McNemar | p = 0.072 — *not settled* | **p = 0.049 — SHIPS** |

      **THE BASELINE FELL, AND THAT IS THE FIX WORKING RATHER THAN FAILING.**
      Of the 46 pins, **9 were the gold judgment** — which can only mean the
      passage still contained a citation resolving to its own answer, i.e.
      **redaction had missed it**. The pin was converting that residual leakage
      into a *guaranteed rank-1 hit*. Removing the pin removes the guarantee, and
      about nine free hits with it. **So 19.1% was inflated by leakage on ~3.2%
      of queries, and 17.3% is the honest number.**

      Note what removing the pin does **not** do: the missed citation is still in
      the query text, so BM25 can still match on it. **The leakage is reduced,
      not eliminated** — see the redaction item below.

      **And the combination now crosses the line: p = 0.049.** Stated plainly
      rather than celebrated — that is *marginally* under 0.05 on the same 283
      queries with one confound removed, not a replication. **Growing the set is
      what would settle it.**

      **The latency line from this run is contaminated and should be ignored:**
      mean 4,320 ms · p95 5,169 ms, measured while typechecks and test suites
      ran on the same CPU. The clean figure is the **4,136 ms · p95 4,263 ms**
      from the uncontended run above.

- [ ] **REDACTION MISSES CITATIONS THAT RESOLVE TO THE GOLD JUDGMENT** — found
      9 Aug 2026 by the pin audit, not yet fixed.

      `build-queries.ts` strips `citation_text`, the gold judgment's
      `neutral_citation`, its `reporter_citations` and its distinctive title
      words. **That is not the same as stripping every citation that resolves to
      the gold judgment** — a format the corpus row does not carry survives, and
      the query then contains its own answer.

      The fix is mechanical: after redaction, resolve every remaining citation
      through `citationLookupKey` and **reject any query still pointing at its
      own gold**. Rejecting rather than redacting, because a one-sentence hole is
      cheaper than a query nobody would type.

      **It will DROP queries, so the superset guard will refuse it** — correctly,
      and that is the guard doing its job rather than an obstacle. Doing it means
      re-baselining deliberately with `--rebuild`, and every number above is
      re-measured against the new set. **A decision to take between runs, never
      in the middle of one.**

- [x] **THE RERANKER WAS SCORING 37.6% OF CANDIDATES AGAINST AN EMPTY STRING —
      9 Aug 2026. This is larger than the pin defect.** `c6b7114`.

      `operativeParagraph` is filled from the **dense** arm's `bestChunk` map, so
      a judgment BM25 found that the dense top-50 did not has no chunk and the
      field is `''`. `retrieval.ts` handed that same field to the cross-encoder.

      **Measured over 500 candidates from 25 real queries: 188 of them — 37.6% —
      were empty.** A cross-encoder scoring a query against `""` returns a low
      score necessarily and every time, so **the reranker was systematically
      deleting two candidates in five from the top five** — and doing it to
      exactly the lexical matches that carry section numbers and citations.

      **This plausibly explains the reranker's whole disappointing record**:
      +6.0 at p = 0.210 alone, and **16 queries LOST** when it was applied.

      **`API_CONTRACTS.md` is not wrong** — it says an empty `operativeParagraph`
      is legitimate because *"a result matched by the lexical ranker alone has no
      dense chunk behind it and therefore no paragraph **to show**"*. That is a
      correct decision about **display**. It was never a decision about
      **ranking**, and the two uses of one field had quietly diverged.

      Graph suggestions had a quieter version: `chunk_index 0`, which in an
      Indian judgment is the cause title, the coram and counsel's names. **The
      cross-encoder is the only thing that can lift a rank-16 graph suggestion
      into the top five, and it was being asked to judge them on their
      letterhead.**

      Fixed by `passagesForRerank()` — the chunk nearest the query vector, one
      batched `DISTINCT ON`. **Verified: empty passages 37.6% → 0.0%, all 188
      filled.** `operativeParagraph` untouched; conflating display and ranking
      again is how this returns.

      **AND THE LATENCY NUMBERS WERE FLATTERED BY IT TOO.** An empty string
      tokenises to almost nothing, so **37.6% of the reranker's candidates were
      nearly free**. Filling them means the cross-encoder now does work it was
      silently skipping. The re-run's observed rate bears this out immediately:
      **27 s/query against 15 s/query before.**

      **Prediction, written before the run reports so it can be checked rather
      than rationalised:** if cost is linear in non-empty candidates, the mean
      goes from 4,136 ms to roughly **4,136 / (1 − 0.376) ≈ 6,600 ms**, plus one
      `passagesForRerank` round trip per query. That would put reranking at
      **~2.2× over the whole-request budget rather than 1.38×**, and it makes the
      12-candidate cut necessary rather than optional. **Part of the observed
      slowdown is the round trip over the Railway proxy, which production does
      not pay — that share must be separated before the number is quoted.**

- [x] **A VALIDITY CAVEAT ON THE WHOLE GATE, measured 9 Aug 2026.** The eval set
      exercises a **different retrieval path from the one advocates will use**.

      `plainto_tsquery` ANDs every lexeme. Over the first 30 eval queries — each
      a 200–900 character citing passage — the AND pass returned a **median of 1
      candidate out of 38,341**, never more than 2, and fell below the relax
      floor on **30 of 30**. The OR fallback therefore fires **100% of the
      time**.

      **Real advocate queries are short**, so production will mostly run the AND
      path. **We are tuning a configuration our users will not hit.** This is
      inherent to the CLERC method — a citing passage is long by construction —
      and it is the price of ground truth with provenance.

      **And the other fixture does not cover the gap.** `queries.hand.json` is
      **five queries, all Hindi, 225–268 characters** — genuine research
      questions rather than extracted passages, which is better, but still long
      enough to take the same OR path. So:

      > **No query anywhere in this harness is short, and none is a short
      > English one. The query shape most advocates will actually type has zero
      > coverage.**

      That is not an argument against the derived set, which is the only thing
      giving us ground truth with provenance. It is a gap that needs its own
      fixture — short English queries, with provenance, held separately and
      **never averaged into the same number**, because a metric mixing two query
      populations reports on neither.

      **The query half is now built** — `services/harness/src/issue-statements.ts`,
      15 tests. Indian judgments state their question formulaically, and that
      sentence is short, question-shaped and the court's own. **Measured on 300
      real judgments: 18.0% yield one, 88 statements, median 134 characters.**

      **The GOLD half is an open problem and is deliberately unsolved.** CLERC
      works because the citation sits *at* the passage, so the link is the
      judge's own. An issue statement carries no such link — the authorities
      answering it are cited pages later, interleaved with those for every other
      issue the judgment decides. The tempting rule, *"gold = every judgment this
      one relied on"*, is available today and **weaker than it looks**: a
      judgment deciding four issues would score a query about issue one correct
      for retrieving an authority that answers issue three, inflating success@5
      by an unknown amount in an unknown direction. **That is worse than not
      measuring**, so the fixture is not built on it.

      The immediate consequence was a free latency win: the AND pass is skipped
      above 200 characters, since its match set is a strict subset of the OR
      pass's and the code already keeps whichever returned more. **Latency only —
      it cannot change a result.** `7dacc7a`.

- [ ] **HyDE — built, wired as an A/B lever, not yet measured.**
      `services/api/src/search/hyde.ts`, 14 tests.

      It generates prose about law, which `CLAUDE.md` otherwise forbids, and is
      acceptable only because of **where that prose is allowed to go**: it reaches
      the embedder and nothing else, **citation-shaped spans and bare case names
      are stripped before embedding** — the model has no retrieval, so every
      citation it writes is invented, and an invented citation is *noise pointing
      somewhere specific*, which is worse than noise — and **only the dense arm
      uses it**, so BM25 keeps the advocate's literal words.

      **Generation costs 2,519–4,916 ms against a 3,000 ms whole-request
      budget**, so it fires only on `concept` queries, where the register gap it
      exists to close actually is. **`dataClass` is required with no default**:
      a user-typed query is ambiguous, ambiguity resolves to sensitive, and
      sensitive is refused under OD-6 — so **HyDE over real user queries does not
      ship until the DPA lands**, whatever it measures.

- [ ] **Settle the reranker properly** — p = 0.072 needs ~577 queries. The
      query set is 283; the eval set would have to grow before this is decided.
- [~] **C1 · IPC↔BNS mapping** — unblocks the five BNS queries and closes the last
      S1 criterion. Handles verified: **IPC `123456789/11091` · Evidence `4218` ·
      CrPC `4221`**.

      **Splitter built and STOPPED at an honest limit.** Measured on the real IPC
      PDF: **36 sections of roughly 511**, range 1–120, 84 gaps. What it finds is
      correct — s. 1 and s. 2 are the real ones — but the PDF text layer puts
      most headings mid-line, and the heading rule is line-anchored. **The anchor
      is what stops it firing on ordinary numbered prose, so relaxing it trades
      an incomplete corpus for a wrong one.**

      **RE-DIAGNOSED 9 Aug 2026, and the earlier diagnosis was wrong twice.**

      **The layout hypothesis is dead.** Read the PDF's own text items: every
      item sits at **x = 72.0**, one font, one size. There is no indentation, so
      position carries no signal and "headings by POSITION" cannot work. The
      line anchor was never the problem either.

      **Both real misses were vocabulary, and both are now fixed:**
      a defining section's heading opens with a **quotation mark**
      (`19. "Judge".--`) which `[A-Z]` rejected — that is most of the
      definitions chapter — and an amended section carries its **footnote marker
      before the number** (`4*[18. "India".--`) so the line does not start with
      the digit. **36 → 70 sections**, both prefixes narrow, and the
      ordinary-numbered-prose guard still passes.

      **And the denominator was wrong.** "36 of ~511" measured against a number
      that is not in the file. India Code handle `123456789/11091` serves an
      **INCOMPLETE IPC**: 58 pages running ss. 1–120B, then ss. 168–171H, then
      s. 511. **Sections 121–510 are simply absent** — page 57 is s. 120B and
      page 58 is s. 511. Every page has a text layer, so this is not an
      extraction failure; the source itself is partial. **86 distinct sections
      carry a body marker, and we now parse 70 of them.**

      **So the next move is a SOURCE, not a parser.** No regex can recover
      sections that are not in the file, and s. 302 — the one everybody checks —
      is one of them.
- [ ] Three metrics stay **NOT MEASURED** until an LLM key exists — founder-queued

---

## 3 · THE MOAT, ranked by how long a funded competitor needs to copy it

`docs/TECHNICAL_MOAT.md` §5.

- [~] **Paragraph extraction for `overruled_in_part`** — extractor built, 20
      tests, wired into the propagation. **It does NOT unblock the seven, and the
      reason is a finding rather than a gap.**

      It first found paragraphs for all seven and every one was wrong.
      `[Para 129]` is the SCR headnote's own pinpoint into the **citing**
      judgment; the overruling itself appears in a *Case Law Cited* list with
      **no paragraph attribution at all**. We were one `--apply` from recording
      *Vineeta Sharma*'s paragraph 129 as the dead paragraphs of *Danamma*.

      Two refusals now catch that, and the corpus correctly returns **7 skipped**.
      **The paragraphs are not in that region of the text.** They are either in
      the body of the citing judgment where the overruling is actually reasoned —
      which needs a different locator, not a wider window — or nowhere.

      **Their Authority Check may supply them directly, which makes this a reason
      to buy the licence rather than a reason to keep parsing.**
- [ ] **The verification record** — 12+ months for anyone to copy, because it
      cannot be retrofitted onto logs that were never kept. Every field is already
      in `citation_checks` and **nothing renders it**
- [ ] **OCR** — replace `paddleocr | tesseract`, both at the benchmark floor
      (EasyOCR 93.6 → **58.3** on real Devanagari scans). **Qwen3-VL-8B,
      Apache-2.0, 75.2, one 24 GB GPU.** Self-hosted means *the file never leaves*
- [ ] **Offline-first retrieval** — `sqlite-vec` + `op-sqlite`. Own matters, saved
      authorities, opened judgments only. **Overruled status must render "last
      checked 08:14", never silently as good law**, or offline does not ship
- [ ] **Ingest speed** — measure whether High Court uploads actually land inside
      the May 2026 24-hour direction. Unproven until measured from our own ingest

---

## 4 · STANDING CORRECTIONS OWED

- [x] `docs/COMPETITIVE.md`'s **"nobody sells a workflow"** — corrected 8 Aug.
      Most of the paragraph survives: the *incumbents* still sell databases; what
      changed is that a new entrant arrived with the workflow already in it
- [x] `docs/OCR_PIPELINE.md` — correction recorded. Its premise is wrong and
      nobody should build on it until the stack moves
- [ ] **E1.2 alert drill is NOT done and must not be ticked.** `check-alert-
      coverage.mjs` is red at **2 of 4 PD-5 triggers** and deliberately unwired
      from `ci:local` until the violations are fixed

---

## 5 · WAITING ON THE FOUNDER — see `docs/FOUNDER_QUEUE.md`

Nothing below blocks the lane. Each has a built path that refuses honestly.

**Credentials and money:** Supreme Today account · Indian Kanoon
`INDIANKANOON_API_TOKEN` (₹500 credit) · `OPENROUTER_API_KEY` · a GPU for
self-hosted OCR · one Supreme Today seat for lawful manual benchmarking.

**Ask Supreme Today before the harvest starts:** the **per-account request
ceiling** (daily, monthly, burst) — it moves total cost by **30×** and
`SUPREMETODAY_MAX_REQUESTS_PER_DAY` is a *placeholder* until the contract sets
it · **may we DISPLAY their headnotes or only hold them**, and what attribution.

**Counsel, one instruction, three questions:** SCR official headnotes on e-SCR
(free, ~34,000 judgments — s. 52(1)(q)(iv) vs *EBC v. Modak*, and an official
headnote is a **government work**) · the lay-facing explainer · OD-2's written
residency view.

**Decisions:** the free citation check (the strongest idea found — asks nobody to
switch) · the ₹5,000/yr price point that reaches our exact user · which
distribution channel first · an advocate to review 20 outputs.

---

## 6 · HOW TO PICK THE NEXT TASK

1. **Anything in §1**, while the account is imminent.
2. **Then §2.** Gate S2 gates the ground campaign, the marketing claim, *and* the
   evaluation of the Supreme Today licence itself.
3. **Then §3**, in the order written — it is already ranked by defensibility.
4. **§4 whenever a related file is open.**
5. **Never §5.** Queue it and keep going.

**And the standing rule that decides ships:** `DATA_ADVANTAGE.md` §1d — *if it
does not move the number on our own corpus, it does not ship.* Applied on 8 Aug to
reject a **free** Apache-2.0 reranker at +6.0 points and p = 0.210. A paid
dependency gets the same test, not a softer one.
