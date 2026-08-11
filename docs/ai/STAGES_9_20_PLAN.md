# Stages 9–20 — the plan, with honest scoping

**Written 11 Aug 2026, after Stage 8 landed.** Stages 2–8 are done
(`CANONICAL_IDENTITY`, `DEDUPLICATION`, `CORPUS_QUALITY`, `LEGAL_STRUCTURE`,
`CITATION_PIPELINE_STAGE6`, `CITATION_GRAPH_STAGE7`, `STATUTE_TEMPORAL_STAGE8`).

This file exists because a 12-stage plan held in a todo tool does not survive
compaction. It is the queue and the record of *why the order is what it is*.

---

## The one ordering change, and the reason for it

**The program lists 9 before 10. I am running 10 first.** This is an execution
ordering call, not a re-decision of anything settled — recorded here rather than
made silently.

Stage 9 is "expand the eval set toward 1,000–2,000 queries". Stage 10 is "run
the six-arm retrieval bake-off against that eval set". The stated dependency is
real but it is already satisfied at a smaller size:

- `queries.eval.json` holds **283 queries today**, and
  `RETRIEVAL_BENCHMARK_DESIGN.md` §2 confirmed by direct read that **283 of 283
  gold judgments are Supreme Court** — the exact corpus that already has 100%
  dense embedding coverage (616,197 chunks). **The bake-off needs no new
  embedding job at all.**
- The paired-significance machinery (`stats.ts`, McNemar) already exists, so a
  283-query comparison can be made honest rather than anecdotal.
- Stage 9 costs real hand-verification time per query. **Expanding an eval set
  before knowing which arm it needs to discriminate is building a measuring
  instrument without knowing what is being measured.** The bake-off tells us
  where the arms actually disagree, and *that* is what a bigger set should be
  built to resolve.

283 is a regression set, not a final benchmark — `CURRENT_PLAN.md` §A0 says so
and that stands. Every number Stage 10 produces carries that caveat.

---

## 9 · Retrieval evaluation dataset — EXPENSIVE, MULTI-SESSION

`DONE:` an eval set materially larger than 283, with High Court and statute
queries, each gold label verifiable.
`VERIFY:` a category census showing the court/subject spread, and a re-run of
the Stage 10 arms showing the ranking is stable on the larger set.

**Scoped honestly: this is not a one-sitting task.** Inventing 1,000 queries by
hand in one pass would produce 1,000 unverified labels, which is worse than 283
verified ones. The path is *per category, verified*:

1. **High Court queries — the real gap.** 0 of 283 gold judgments are High
   Court, and we now hold 40,980 HC judgments. A retrieval system measured only
   on Supreme Court is not measured on half its corpus.
2. **Statute queries.** Stage 8 landed 18,590 amendment events and we hold
   34,928 sections; "cases on s.138 NI Act" is the archetypal query and nothing
   in the eval set tests it.
3. **Citation-shaped queries** — `cite:`, `cnr:`, `caseno:` already exist as
   fields and are untested by the golden set.

Start with **100 well-verified queries per category**, not 1,000 guessed.

**Blocked on nothing.** Just expensive.

---

## 10 · Retrieval bake-off — RUNNING FIRST

`DONE:` recall@k and MRR for each arm over the full 283, with paired
significance between arms.
`VERIFY:` the numbers come from a real run against production, and the isolated
arms provably differ from the fused one.

**The one concrete engineering gap, already scoped by
`RETRIEVAL_BENCHMARK_DESIGN.md` §3:** `hybridSearch` always fuses sparse and
dense through RRF, and there is no way to run one arm alone. Its internals
already build the two candidate lists separately before calling `rrf()`, so this
is an **additive `mode` parameter, not a redesign**.

Arms: lexical · dense · hybrid/RRF · +rerank · +graph · +HyDE. The last three
already exist as `ab-cli.ts` levers on top of the fixed hybrid base.

BM25 proper is **not** available — Railway has no BM25 extension
(`RETRIEVAL_BENCHMARK_DESIGN.md` §4). Postgres `ts_rank` is what "lexical" means
here and the write-up must say so rather than calling it BM25.

---

## 11 · Embedding bake-off — AFTER 10

`DONE:` a measured comparison of the current embedder against at least one
alternative (BGE-M3, Qwen3-Embedding) on the same eval set.
`VERIFY:` both run over identical queries with identical scoring.

**Genuinely expensive**: a new embedder means re-embedding the corpus, or at
minimum the Supreme Court slice (616,197 chunks). **Do not start this until 10
has a baseline** — without one there is nothing to beat, and the cost is only
justified by a gap 10 has actually shown.

---

## 12 · Reranker bake-off — AFTER 10

`DONE:` reranker on/off measured on the same set with paired significance.
`VERIFY:` `ab-cli.ts rerank` already does most of this; the gap is running it at
283 rather than 100 and writing the result down.

**Cheapest of the three bake-offs** — the lever already exists.

---

## 13 · Evidence retrieval — authority + paragraph + exact span

`DONE:` a retrieval result carries the paragraph and the exact span it rests on.
`VERIFY:` a returned span appears verbatim in the judgment's own text.

Partly built already: `operativeParagraph` and `operativeParagraphNumber` exist
and `paragraphs.ts` locates a printed paragraph. The gap is the **exact span**,
and its rule is the harness's: a span that cannot be located verbatim is
reported as unlocated, never approximated.

---

## 14 · Evidence verification — claim → evidence → support/contradiction

`DONE:` a claim is checked against candidate evidence and returns support,
contradiction, or insufficient.
`VERIFY:` a claim with no supporting passage returns insufficient, never a
nearest match.

**The rule that defines this stage: semantic similarity is NOT proof.** A
passage that is 0.9 cosine-similar to a claim may say the opposite. This is
where the citation harness's discipline extends from "does this case exist" to
"does this case say what we claim it says", and it is the highest-risk stage in
the program.

---

## 15 · Rhetorical role classification

`DONE:` paragraphs labelled facts / arguments / statute / quoted precedent /
ratio / obiter.
`VERIFY:` measured against a hand-labelled sample, not asserted.

**Survey OpenNyAI first** — it is Indian-law-specific and MIT-adjacent; building
a classifier before checking whether a maintained one exists violates OSS-first.

---

## 16 · Treatment / currentness reasoning

`DONE:` court hierarchy, bench strength and Article 141 inform whether an
authority still stands.
`VERIFY:` a case where a smaller bench "doubted" a larger one is not reported as
displacing it.

**Blocked, and the first version of this entry got the reason wrong.** It said
"no judge-count column exists". A count *is* derivable — `judgment_judges` holds
44,360 rows over 38,325 Supreme Court judgments. Measuring it instead of
asserting it produced the real answer, which is worse:

**The count is a lower bound, and it is catastrophically wrong on exactly the
cases this stage is about.** Checked against externally known bench sizes:

| case | real bench | recorded |
| --- | --- | --- |
| **Kesavananda Bharati** | **13** | **1** (`S.M. SIKRI`) |
| **Golak Nath** | **11** | **1** (`K. SUBBA RAO`) |
| **Maneka Gandhi** | **7** | **1** (`M. HAMEEDULLAH BEG`) |
| S.R. Bommai | 9 | 9 ✓ |

The source records the **presiding judge alone** on most rows and the full coram
on some. 33,484 "single-judge Supreme Court judgments" is not a fact about a
Court that sits in twos — it is a fact about the metadata.

So a `constitution` (5+) filter would **miss Kesavananda Bharati, Golak Nath and
Maneka Gandhi**. An advocate filtering for Constitution Bench authority would be
told the three most famous ones do not exist — *a filter that silently mis-sorts
is worse than one that returns less*, at maximum severity.

**A partial coram is more dangerous than an absent one**, because it looks like
an answer. The prerequisite is a source that publishes the full bench, and
`judgment_judges` must not be used for strength until then.

**And the standing rule: never "good law" merely because nothing contrary was
found.** Absence of a later contrary judgment is not currentness.

---

## 17 · Abstention architecture

`DONE:` SUPPORTED / PARTIALLY_SUPPORTED / INSUFFICIENT_EVIDENCE as explicit
backend states, never a confidence score rendered as prose.
`VERIFY:` the states are stored and rendered from the row, exactly as the three
citation fields are.

Depends on 14. The shape is already proven by the citation harness — three
independent fields, derived at render, never one collapsed enum.

---

## 18 · Data freshness / incremental ingestion

`DONE:` new judgments arrive without a full re-ingest, and staleness is
queryable.
`VERIFY:` a fetch ledger entry per run and a measurable lag per court.

`DATA_MOAT_PROGRAM.md` §5 already designs this. The eCourts grant's rate limiter
and fetch ledger are the mechanism, and the kill switch stays default-off.

---

## 19 · Scale decision — infra

**Only after 9–18 produce real measurements.** An infrastructure decision made
before the retrieval numbers exist is a guess with a budget attached.

---

## 20 · Model training / distillation

**Only after the evidence pipeline is reliable.** Specialised models only —
never a general reasoning model. `docs/DATASETS.md`: primary sources only, never
another model's commentary about law.

---

## What blocks what — the short version

```
10 (bake-off)  ── needs nothing new ────────────► RUN NOW
 9 (eval set)  ── expensive, better informed by 10
11 (embedding) ── needs 10's baseline
12 (reranker)  ── needs 10's baseline · cheapest
13 (spans)     ── independent of 9–12
14 (evidence)  ── needs 13
15 (roles)     ── independent · survey OpenNyAI first
16 (currentness) ─ BLOCKED: no judge-count column exists
17 (abstention) ─ needs 14
18 (freshness) ── independent
19 (scale)     ── needs 9–18
20 (training)  ── needs the evidence pipeline
```
