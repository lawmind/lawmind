# CURRENT PLAN — the single ordered queue

**Read this file at session start, after the mandatory set in `CLAUDE.md` §0.**
It exists because a plan held only in a todo tool does not survive compaction, a
new session, or a fresh agent. **This file does.**

Last updated **9 August 2026**. **Read §A first — it supersedes §2's ordering.** Owner: **LCC (server lane)**. RCC's plan is
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

# A · THE PLAN FROM 9 AUGUST 2026 — structured search, then coverage

**This section supersedes §2's ordering.** Founder-directed after the retrieval
work was judged to be over-engineering that produced nothing usable. That
judgement was correct and the research says why.

## A0 · Why the number never moved

Our eval set uses the **CLERC** method (arXiv 2406.17186). **CLERC's own
published ceiling is 48.3% recall@1000** zero-shot, 41–43% for dense retrievers
including BGE — which is what we run — and 68.5% recall@1K for a *fine-tuned*
LegalBERT DPR. The paper states existing models *"struggle significantly"*.

We measure **48.1% recall@20** on a 38,341-judgment corpus. Smaller haystack, so
not like-for-like — but the conclusion stands: **`success@5 ≥ 0.70` is a number
nobody in the published literature reaches on this task, at any k.** Gate S2 was
mis-specified, and the lane spent weeks failing a test the field cannot pass.

## A1 · The strategic error, which is larger

Manupatra and SCC Online sell **Boolean, field, citation and faceted search** —
party, judge, act, section, court, period, with nesting. That is what advocates
are trained on and what they type. We built semantic search and four filters.
**We were competing at the one thing the incumbents do not do, while missing the
thing they do.**

Meanwhile the market violently validated the original thesis: the public
AI-hallucination sanctions tracker records **1,598 court cases** involving
fabricated citations by June 2026, up from ~200 a year earlier — **~8 per day**,
penalties to **$110,204**, multi-year suspensions.

## A2 · STRUCTURED SEARCH — LANDED 9–10 Aug 2026

**All of A2 is done and applied to production.** Working end to end against the
live corpus:

```
cite:"(1994) 3 SCC 1"                    → S.R. BOMMAI versus UNION OF INDIA
cite:"AIR 1965 SC 845"                   → SAJJAN SINGH versus STATE OF RAJASTHAN
section:138 act:"NI Act"                 → 359 judgments
section:482 act:"CrPC"                   → 1,237 judgments
judge:"CHANDRACHUD" AND type:criminal    → 214 judgments
judge:"GAJENDRAGADKAR" AND date:[1960 TO 1962]  → 262
"basic structure" NEAR/6 "constitution"  → 20
cite:"(2099) 9 SCC 9999"                 → 0, and nothing invented
```

| what | before | after |
| --- | --- | --- |
| Citation formats searchable | S.C.R. and INSC only — **AIR 0, SCC 0** | **+4,097 AIR/SCC aliases** |
| Judgments flagged in the citator | **22** | **81** |
| Citation edges carrying a treatment | 95 | **5,318** |
| Provision references | **none — the table did not exist** | **97,806** across 25,466 judgments (66.4%) |
| Judges searchable | a comma-delimited string | **44,360 rows, 277 distinct judges** |
| Gate S2 | an unreachable 0.70 floor | **two deterministic gates, both measuring 1.0000** |

Commits: `ccbebc8` `56e25ad` `c493518` `220825b` `ae6ad9d` `fe9ab13` `74c8ace`
`c2e94c4` `1deb80a` `4b04328`.

## A2-OLD · the original checklist, kept for provenance

- [x] **A2.1** Query language: tokenizer, recursive-descent parser, typed AST.
      Fields · Boolean · `NEAR/n` · wildcards · ranges. **37 tests**, including a
      3,000-case fuzz. `ccbebc8`
- [x] **A2.2** `explain.ts` — renders the AST back to a sentence, echoed in the
      response. **A correctness feature**: a misparse produces *results*, not
      errors, so the only defence is stating the interpretation and letting the
      advocate check it.
- [x] **A2.3** Migration `0026` — `pg_trgm`, trigram indexes on title/case
      number, normalised citation index matching `citationLookupKey` exactly,
      `judgment_judges`, `judgment_statute_refs`. `56e25ad`
- [ ] **A2.4** `compile.ts` — AST → parameterised SQL. Every value bound.
- [ ] **A2.5** `judgment_statute_refs` extractor — **requires act context**; a
      bare "section 5" is not recorded. BNS↔IPC expansion at query time.
- [ ] **A2.6** Route + contract: `parsed` echo, facets, 400 with offset on parse
      failure, all three citation fields preserved.
- [ ] **A2.7** **THE SAFETY RULE** — structure decides, semantics fills, never
      blended. Zero structured matches returns **zero**, with semantic
      suggestions in a *separate* field. An advocate who asked for
      `judge:Chandrachud` must never receive another judge's judgment.
- [ ] **A2.8** Gate S2 re-spec: `structuredExactness` and `fieldPrecision` at
      1.0; `successAt5`/`recallAt20` demoted to ungraded diagnostics; CLERC
      evidence recorded in `sprints/SPRINT_2.md`. **Each new metric needs a
      negative control proving it can fail.**

## A3 · TODO — coverage. The AWS Open Data corpus

**Storage is not the obstacle and never was.** See `docs/CORPUS_TIERING.md` §6,
measured: **~42 GB in Postgres** and **~115 GB on R2** for the whole corpus,
under **$8/month**. Railway bills **used** space, not provisioned, so raising the
volume ceiling costs nothing until data fills it.

- [x] **A3.1 COUNTED 10 Aug 2026 — `docs/HC_CORPUS_SURVEY.md`.** 1,493 parquet
      footers in 85 s, a few MB moved. `pnpm --filter @lawmind/ingest hc:count`.

      **20,529,202 documents all years · 15,771,566 in the last 10 years**, so
      the "15.9M" headline was fair. **The finding is what the total is made of.**

      **The bucket publishes TWO metadata files per partition and they share
      ZERO CNRs.** `metadata.parquet` (19,237,683 rows) and
      `metadata-mobile.parquet` (1,291,519). Measured on one partition: 1,841
      vs 53,753 rows, **0 CNRs in common**. The first pass skipped the mobile
      files as unparseable keys. They carry **eighteen extra columns** —
      `order_type`, `is_final`, `petitioner`, `respondent`, `pet_advocate`,
      `case_type`, `bench_name` — and a **differently shaped `pdf_link`**, so
      the variant decides how a PDF key is derived. Four of 25 courts publish it.

      **Reconciles EXACTLY with `DATASETS.md`'s independent count** on 2023,
      2024 and 2025 — to the digit. And that identity is the evidence the
      earlier count silently included the mobile files without distinguishing
      them.

      **Document count is not judgment count, and the share is a RANGE:
      0.75% – 18.64%.** A first pass matched `/judgment|judgement/` and reported
      **18.64%; that was wrong** — `View Judgement/Order` (231,067 rows, 17.89%)
      says *judgment OR order* and is almost the whole of it. Unambiguous
      judgments are **9,678 = 0.75%**. Narrowing the range needs PDF text, which
      is A3.3. **Caveat that governs the number: mobile variant only — 8% of the
      corpus, disjoint from the other 92%. Never quote it as corpus-wide.**

      **Ingest order falls out of it:** top five courts are **54%** of the last
      decade (Allahabad 3.49M, Bombay 1.53M, Madras 1.51M, Punjab & Haryana
      1.26M, Patna 1.07M); bottom five are 0.4%. **Delhi is 16th by document
      count while being among the most cited** — document count is not
      authority count and must not drive the order alone.

      **Unchanged and still disqualifying:** neither variant has a citation
      column. A judgment ingested from this bucket is **searchable and not
      citable**. This survey does not soften that.
- [ ] **A3.2** **High Courts, last 10 years first** — OD-4's stated order.
- [x] **A3.3 MEASURED 10 Aug 2026 — `docs/HC_EXTRACTION_COST.md`.** 1,000 PDFs,
      40 from each of 25 courts, random offset into rotating parquet files, 2016+.
      Same `unpdf` path the SC loader uses. `pnpm --filter @lawmind/ingest hc:extract`.

      **EXTRACTION IS NOT THE BOTTLENECK.** 99.4% extracted · 0.2% need OCR ·
      0.4% corrupt. **154 ms download + 32 ms extract = 186 ms per PDF**, so
      15,771,566 documents is **4.2 days on eight workers** (33.9 on one).
      **Download dominates extraction 5:1** — the lever is concurrency, not a
      faster PDF library, and the bucket's tolerated rate is NOT measured.

      **Text volume corroborates `CORPUS_TIERING.md`.** Mean 5,823 chars →
      **96.4 GB raw** for the decade; the 37 GB brotli budget implies 2.9×
      compression, entirely ordinary. **Two independent estimates agree and the
      storage plan stands.**

      **OCR burden 0.2% ≈ 31,700 documents** — a rounding error, not the feared
      disaster. Not costed: paddleocr/tesseract are at the Devanagari floor.

      **THE AGGREGATE HID THE IMPORTANT NUMBER, and this is the finding.** The
      stratified sample reported `missing 0.0%`. Chasing the four Bombay failures
      showed **Bombay 2023–2026 at 29.5% missing and 10% failed**, and HEAD-checks
      per bench show it is **whole bench-years**: 2026 `newas` 0/12, 2026 `newos`
      0/12, 2025 `newas` 1/12, 2023 `newos_spl` 0/12, while every 2024 bench is
      12/12. **Metadata does not imply a PDF.** So: treat 404 as an expected
      per-bench-year outcome, probe twelve HEADs before queueing thousands of
      rows, and never trust a corpus-wide average for this — it averaged 0% over
      a court sitting at 29.5%.

      **Two exclusions fall out.** `bench=testcase` is a test fixture publishing
      ~16,000 rows a year at Bombay. And **Bombay 2016–2017 is 16.0% `Invalid
      PDF structure`** against a corpus-wide 0.4% — court-and-era specific.

      **Per-court text length spreads 11× (Delhi 17,424 → Uttarakhand 1,519),
      which retires a generalisation:** `DATASETS.md`'s *"2,223 chars for Punjab
      & Haryana"* was a true number about two bottom-of-distribution courts read
      as a corpus constant. 18% under 1,000 chars still stands.

      **NOT settled and unchanged:** embedding still costs ~3,956 GPU-hours
      (`DATASETS.md`), and **neither variant has a citation column — an ingested
      HC judgment is searchable and not citable.** That remains the disqualifier.
- [ ] **A3.4** Tier 2 rows for every judgment: metadata + one `bit(1024)` vector.
- [ ] **A3.5** R2: brotli text + flat fp32 vectors. **PDFs are never copied** —
      the AWS bucket is public, permanent and CC-BY-4.0; we store a key.
- [ ] **A3.6** **Publish coverage per court and per year in the product.**
      `corpus_coverage` exists. Silence about a gap does the same damage as a
      fabricated citation — both let an advocate rely on something absent.

## A3b · TODO — Cloudflare R2, the storage lane

**Was missing from this plan and should not have been.** R2 is already the
approved vendor (`OD-4`, `CORPUS_TIERING.md` §3) and nothing works at 15.9M
without it. The founder is supplying an account and API token.

- [ ] **A3b.1** `packages/storage` behind an interface that **refuses honestly
      without credentials**, exactly as `packages/auth/src/mail.ts` does. The
      whole path builds and tests with no token; only the upload is outstanding.
- [ ] **A3b.2** `judgments.storage_key` — a column, not a URL. **The PDF is never
      copied**: the AWS bucket is public, permanent and CC-BY-4.0, so we store a
      key into somebody else's CDN.
- [ ] **A3b.3** Brotli text objects — measured at **2.0 KB per High Court
      judgment**, 37 GB for the whole corpus.
- [ ] **A3b.4** fp32 vector blobs with **ranged reads** — 500 candidates × 4 KB is
      one 2 MB ranged GET. Zero egress is the property that makes the tiered
      design viable on a read path.
- [ ] **A3b.5** A cost ceiling and an alert. R2 is $0.015/GB/month with free
      egress, but **Class A operations are $4.50/million** — a naive per-chunk
      write pattern is where an object-storage bill actually goes wrong.
- [ ] **A3b.6** Kill switch + fetch ledger, same discipline as the eCourts
      adapter. Every credentialled integration in this repo is auditable.

## A3c · TODO — THE CITATOR. Measured 9 Aug, and the gap is 161×

**The founder's judgement that this is the real gap is confirmed by the data.**

| | |
| --- | --- |
| Citation edges | **192,197**, of which **44,785 resolved (23.3%)** |
| Classified `cites` — the generic bucket | **180,432 — 94% of all edges** |
| `followed` · `distinguished` | 10,437 · 1,233 |
| **`overruled` · `overruled_in_part` · `doubted`** | **69 · 19 · 7 — 95 edges in total** |
| Judgments flagged `overruled_status != none` | **22 of 38,341** |
| **Judgments whose text USES overruling language** | **3,549** |

**Two separate bottlenecks, and they need different fixes:**

**1 · Relationship extraction is nearly blind.** 94% of edges are the generic
`cites`. Against 22 flagged judgments, **3,549 contain overruling language** —
`stands overruled` 97 · `does not lay down the correct law` 283 · `per incuriam`
339 · `impliedly overruled` 50 · `hereby overruled` 86, and 3,156 containing the
stemmed word `overrule` at all. **Not all of those overrule anything** — many
discuss an overruling made elsewhere, or reject the argument that something was
overruled — so 3,549 is a ceiling on candidates, not a count. Even at a 10% true
rate it is **~350 against 22**.

**2 · Resolution is 23.3%.** Three-quarters of what the Supreme Court cites is
not in our corpus — High Courts, Privy Council, and the specialist reporters the
extractor cannot read. **Coverage (§A3) fixes this half directly**, and this is
the sharpest available argument for the AWS ingest.

- [ ] **A3c.1** Classify treatment from the text **around each citation offset** —
      `judgment_citations.char_offset` already exists on every edge, so the
      evidence is already joined to the citation. No new data, no purchase, no
      OCR.
- [ ] **A3c.2** **High-precision patterns first, never a model.** Reading the
      court's own words is a primary source; a model's opinion about whether a
      case was overruled is exactly the commentary `DATASETS.md` forbids.
- [ ] **A3c.3** **PRECISION ABSOLUTELY OVER RECALL, and this is not a preference.**
      `overruled_status` drives the LAW MOVED mark, and `set_aside` disables
      add-to-matter. A false positive tells an advocate a good authority is dead
      — the stale-overruled threshold is **0** for the same reason. Anything
      uncertain goes to a **review queue, never to the column.**
- [ ] **A3c.4** Distinguish *"we overrule X"* from *"X was overruled in Y"* and
      from *"the contention that X is overruled is rejected"*. **The third reads
      identically to a keyword matcher and means the opposite.** This is the
      whole difficulty, and it is why the patterns must be tested against real
      passages before anything is written.
- [ ] **A3c.5** Report the candidate list with its evidence span for human
      review. **A citator that flags 350 judgments nobody checked is worse than
      one that flags 22 that were.**

## A3d · THE CONCORDANCE GAP — found 9 Aug by running the demo, and it is the one

**This is why Supreme Today pinpoints a citation and we do not.** It is not a
retrieval problem, a ranking problem or a model problem. It is a naming problem.

**Every judgment in our corpus carries exactly one reporter citation, and it is
always `S.C.R.`** — `[1973] SUPP. 1 S.C.R. 1` for *Kesavananda*. Measured across
all 38,341 rows: **AIR 0 · SCC 0.** The resolved citation graph says the same:
of 44,785 resolved edges, **AIR 0 · SCC 0 · SCR 43,858 · INSC 886**.

**So an advocate typing the citation they actually use gets nothing.**
`AIR 1973 SC 1461` and `(1973) 4 SCC 225` are how *Kesavananda* is cited in
practice; we know it only as `1973 INSC 91`. A zero result reads as *"no such
case"*, which is the worst possible failure for a product whose promise is that
a citation is real.

**It also retrospectively qualifies a test I trusted.** The live hard-negative
suite reports 25/25 real citations resolving — but those citations were drawn
*from our own corpus*, so every one was S.C.R. The test was non-vacuous for what
it tested and **never touched the two formats advocates use.**

### The prize, measured

| unresolved edges | count | distinct strings |
| --- | --- | --- |
| total unresolved | **147,412** | |
| **SCC** | **76,387** | **31,943** |
| S.C.R. | 30,365 | |
| **AIR** | **16,848** | **9,067** |
| INSC · SCALE | 2,331 · 1,044 | |

**41,010 distinct AIR and SCC strings sit in our own judgment text and resolve to
nothing** — and many point at judgments we hold. `AIR 1952 SC 343` is cited **59
times**; it is a 1952 Supreme Court judgment and **we have every Supreme Court
judgment from 1950.** We own the case and do not know its name.

### The fix — derive the concordance from the courts' own words

- [ ] **A3d.1** For each unresolved AIR/SCC citation, take the text window around
      its `char_offset` — **the offset is already stored on every edge** — and
      extract the case name printed beside it. Courts write *"State of West
      Bengal v. Anwar Ali Sarkar, AIR 1952 SC 343"*; the name is right there.
- [ ] **A3d.2** Match that name against `judgments.case_title`, now
      trigram-indexed, constrained by the **year in the citation** and the court.
- [ ] **A3d.3** **Corroboration, not a single sighting.** `AIR 1952 SC 343`
      appears 59 times, each beside a case name. Agreement across many citing
      judgments is strong evidence; one occurrence is not. Record the count.
- [ ] **A3d.4** **EXACTLY ONE candidate, or nothing.** Two matches record
      nothing — the same rule `exactCitation` already applies. **A wrong alias is
      worse than a missing one**: an advocate searching `AIR 1952 SC 343` and
      receiving the wrong judgment may cite it, which is the failure this entire
      product exists to prevent.
- [ ] **A3d.5** Store in a **separate table with its evidence**, not merged into
      `reporter_citations`. `cite:` searches both. Provenance must stay
      answerable: *"who says this judgment is AIR 1952 SC 343"* has to have an
      answer, and it is "fifty-nine Supreme Court judgments say so".
- [ ] **A3d.6** This is **primary-source derivation, not a model's opinion** —
      permitted where `DATASETS.md` forbids commentary. It also **removes a
      reason to buy**: the concordance is part of what a licence sells.

## A4 · What each account and licence is actually for

**They are four different things and only one of them is a bulk corpus.**

| Source | What it is for | What it is NOT |
| --- | --- | --- |
| **AWS Open Data** | **The bulk corpus.** ~17.8M judgments, CC-BY-4.0, free, no account, permanent | Not live data — it is a back catalogue |
| **eCourts grant** (7 Aug 2026 → 1 Jan 2029) | **The daily loop.** Cause lists, case status, court orders, caveat search — *tomorrow's listings*, which is the wedge feature | **NOT a bulk corpus.** Capped at **1,000 requests/day**; the entire grant period yields ~876,000 requests. Harvesting 15.9M judgments this way would take **43 years** |
| **Supreme Today** ₹50,000/mo | **Editorial layer we cannot get free**: High Court + tribunal **headnotes** and **Authority Check treatment** (which case overruled which). Also question→citation pairs | **Not raw judgments** — those are free at 17.8M scale. Not Supreme Court headnotes either: e-SCR gives ~34,000 official ones free |
| **Bharat.Law** ₹1,499 one month | **Competitive research.** Does their treatment data actually resolve the seven `overruled_in_part` cases our extractor could not? Curated or computed? | **Extract nothing.** Their AUP forbids benchmarking in writing, and the data is either free elsewhere or a machine's opinion we may not train on |

**The through-line: our citator is the gap.** 22 flagged judgments of 38,341,
because a Supreme-Court-only corpus can only show the Supreme Court overruling
itself. AWS gives coverage; Supreme Today gives treatment; eCourts gives today.
Only the middle one costs real money, and `SUPREME_TODAY_LICENCE.md` says buy one
month and measure it.

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

- [ ] **THE CITATION EXTRACTOR COVERS FIVE FORMS, ALL SUPREME-COURT-CENTRIC** —
      found 9 Aug 2026 while building the leak check. **Not fixed: the blast
      radius reaches ingest, the citation graph and every caller of
      `classifyQuery`, and it must not be changed mid-experiment.**

      `@lawmind/ingest`'s `extractCitations` holds patterns for `INSC`, `SCC`
      (either spelling, round brackets only), `AIR … SC`, `SCR` (**either**
      bracket) and `SCALE`. **A specialist or High Court reporter is invisible to
      it** — read directly off the corpus: `[1953] 24 I.T.R. 70`, `[1946] 14
      I.T.R. 673`.

      There is also a smaller inconsistency: `citationLookupKey`'s own docstring
      promises `[2019] 4 SCC 221` collapses to the same key as the round-bracket
      form, and `build-queries.ts` carries a square-bracket citation *shape* —
      but the extractor never produces one for SCC, so the normalisation handles
      a form nothing can find. Pinned as a failing expectation in
      `build-queries.test.ts` rather than silently fixed.

      **A CORRECTION TO MY OWN FIRST NUMBER, recorded because the method matters
      more than the result.** The first measurement counted every square-bracket
      span the extractor did not return and would have reported **1,561 missed
      against 1,788 extracted — a 47% miss rate.** That was wrong twice: the SCR
      pattern already takes either bracket, so most were never missed; and the
      residual count is dominated by **`[2003] SUPP. 4`, a running page header
      repeated dozens of times per judgment**, which is not a citation at all.
      **No percentage should be quoted from this until the header artefact is
      excluded.** What stands is the qualitative finding: **specialist reporters
      are not extracted, at all.**

      **MEASURED, AND IT COSTS NOTHING TODAY.** An I.T.R. authority is only a
      lost graph edge if that judgment is in our corpus — so the number to check
      is *resolvable* misses, not raw ones. Checked against all 38,341 rows:

      | | |
      | --- | --- |
      | judgments in the corpus | 38,341 |
      | **court = Supreme Court** | **38,341 — 100%** |
      | carrying an I.T.R. reporter citation | **0** |
      | carrying a Cri.L.J. reporter citation | **0** |

      **A missed specialist-reporter citation cannot resolve to anything we
      hold.** It would be an unresolved edge whether we extracted it or not, so
      the gap has **zero present impact** and fixing it now would move no number.

      **It becomes real the moment High Court data lands** — which is precisely
      what the Supreme Today licence would buy and what eCourts harvesting would
      add. **So this is a prerequisite of that ingest, not a defect of this one**,
      and it belongs in the same piece of work rather than ahead of it.

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
