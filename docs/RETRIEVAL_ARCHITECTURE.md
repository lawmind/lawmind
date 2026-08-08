# RETRIEVAL ARCHITECTURE — what we take from the evidence-first blueprint

Written 9 August 2026 against the founder's **"Indian Legal AI — Evidence-First
Architecture"** document, read in full, section by section, plus current
research on the techniques it names.

**The headline: the document and our build already agree on the hard part, and
it names one gap we genuinely do not cover.** That gap is §35, and it is the
most valuable page in the document.

---

## 0 · The one correction that changes what we do this week

`CURRENT_PLAN.md` §2 lists **"recall levers"** as a single item **blocked on ~62
GPU-hours ≈ $65** of re-embedding.

**That block only applies to half of them.** Late chunking and
summary-augmented chunking change the *index*, so they need the re-embed. But
the document's §24 (HyDE), §25 (query decomposition) and the multi-query /
RAG-Fusion family are **query-side**: they run before the query ever touches the
index, and they need **no re-chunking, no re-embedding and no reindexing.**

Reported effects, on general corpora rather than ours: query decomposition
context_recall **+0.250**, HyDE **+0.125 recall and +0.143 precision**. Treat
those as a reason to measure, not as our numbers.

**So "recall is blocked on founder spend" was wrong as stated**, and the queue
is corrected. What is genuinely blocked: HyDE and multi-query need an LLM to
write the hypothetical passage or the variants, so they wait on
`OPENROUTER_API_KEY`. **What is blocked on neither money nor a key is the
citation graph** — §3 — which turns out to have been built already and never
measured.

---

## 1 · What the document confirms we already got right

Worth stating, because it means the expensive parts do not need redoing.

| Document says | Our state |
| --- | --- |
| §3 "The LLM is not the database" — the model must never generate the citation string | **Already law here.** `CLAUDE.md`: *render citation fields FROM THE DATABASE ROW, never from model output* |
| §33 Deterministic citation renderer | **Built.** Badges are derived at render from three DB fields, never stored |
| §5 Paragraph-level evidence, not arbitrary chunks | **Partly built.** `judgment_annotations` carries `paragraph_number` AND `paragraph_index` deliberately, because a re-ingest moves position but not the printed number |
| §13 Temporal reasoning — "a citation can be authentic but legally obsolete" | **This is our entire `overruled_status` design**, never cached, re-read live on every surface |
| §9 Hybrid retrieval, §10 reranking | **Built and measured.** RRF at k = 60, candidate depth 50 per ranker, HNSW `ef_search` with `iterative_scan` |
| §44 Abstention over a plausible citation | **Built as `unverified`** — never silently dropped, never shown as confirmed |
| §57 "Do not fine-tune 20M PDFs into a model" | **Agreed and recorded** in `TRAINING_STRATEGY.md` |

**On §9/§10 specifically, current sources put well-tuned Postgres hybrid search
at recall@10 ≈ 0.84 against ≈ 0.62 for vector alone, and say to leave RRF's
k = 60 alone because sweeping it is smaller than eval noise.** We already run
k = 60 and depth 50. **Our retrieval fundamentals are not the problem.**

---

## 2 · §35 — the gap we genuinely do not cover

This is the section worth the whole document.

> *Claim: "The Supreme Court held X." Citation: correct case. But source
> passage: "The Court rejected X." Citation correctness: PASS. Legal support:
> FAIL.*

**Our three fields cannot catch that.** They answer:

1. `verification_state` — **does this judgment exist?**
2. `verified_by_source` — **who confirmed it?**
3. `overruled_status` — **is it still good law?**

**None of them asks whether the paragraph we point at actually says what we say
it says.** A citation can be verified, current, and completely misdescribed.

Current research has a name for this and confirms it is invisible to the usual
tooling: **"deceptive grounding"** — a response *"fully faithful to retrieved
documents, cites real sources, and contains no fabricated claims"*, where *"the
failure is at the attribution level, a dimension none of these frameworks
inspect."*

**For us this is worse than a hallucinated citation, not better.** A fake
citation dies in court immediately and publicly. A real citation that does not
support the proposition survives the first check, gets filed, and fails in front
of the judge — which is precisely the humiliation `CLAUDE.md` §2 says ends the
company.

### What to do about it

**A fourth question, answered per claim rather than per citation.** The
document's §31 shape is right:

```
SUPPORTED · PARTIALLY_SUPPORTED · CONTRADICTED
INSUFFICIENT_EVIDENCE · CONFLICTING_AUTHORITIES
```

**This is an addition to `CITATION_HARNESS.md`, which is spec, so it is
queued rather than done** — FQ-R1. It does not reopen the three fields; it adds
a question they were never asked. The mechanism (§36) is an entailment check of
claim against cited paragraph, which is a small model, not a frontier one.

**And it gives Gate S2 the metric §51 argues is the most important one:**

```
Unsupported Claim Rate = unsupported material claims / total material claims
```

Our current metric set — `hallucinationRate`, `silentDropRate`,
`staleOverruledRate`, `overruledLeakage`, `successAt5`, `adversarialPassRate` —
**has no member that would move if every citation were real, current, and
misdescribed.** That is the hole.

---

## 3 · The citation graph — ALREADY BUILT, and still unmeasured

**Correction, and it is mine.** I started writing a graph ranker for
`retrieve.ts` before checking the directory. **`services/api/src/search/graph-expand.ts`
already exists**, is 175 lines, is already imported by
`services/harness/src/retrieval.ts`, and is **better than what I wrote**. My
version was reverted in full.

What it already does that mine did not:

- **IDF damping on corpus-wide inbound count.** `support ÷ log₂(inbound)`. Mine
  ranked on raw co-citation, which is the exact failure the existing file names
  and defends against: *"Kesavananda is cited by everything; if raw inbound
  count drove the score, every query would return the same five famous cases and
  the metric would improve while the product got worse."*
- **Only edges FROM the candidate set count.** Global citation count is never
  the score, only the damping term.
- **`HAVING count(*) >= 2`** — one candidate citing something is a reference,
  not evidence.
- **Requires the cited judgment to have an embedded chunk**, so expansion cannot
  hand the advocate a row with no text behind it.
- **Suggestions enter at the BOTTOM of the ranking**, so graph evidence can put
  an unretrieved authority on the second screen but never above something two
  independent rankers agreed on.

**So the document's §12/§20 recommendation was already taken, months ago, and
with more care than the document describes.** The honest gap is different and
smaller: **it has never been measured.** The harness supports it behind
`HARNESS_GRAPH`, `CURRENT_PLAN.md` §2 still lists "citation-graph expansion
re-scored" as an unmeasured lever, and `baseline.json` records no graph arm.

**Measurement needs the corpus proxy (a live Postgres), which is the same thing
the reranker run at n=283 is waiting for.** It is not waiting on money or a key.

The existing file also already states the right expectation, which the document
does not: *"Entering at rank 16 cannot move success@5 on its own. **Graph and
reranker are one combination, not two features**"* — expansion supplies an
authority text similarity never found, and the cross-encoder is what promotes it
into the top five. **They must be measured together and separately.**

**Research caveat worth carrying:** current comparisons do **not** show graph
methods dominating. GraphRAG *underperforms* on multi-hop against RAPTOR and
HippoRAG, and its *"heavy reliance on frequent LLM calls and extensive
summarization makes it prohibitively expensive"*. **Ours is not GraphRAG.** We
do not build entity graphs with an LLM — we walk a citation graph the courts
wrote, already extracted, in one SQL query with no model call. That is the cheap
end of the idea and the part with a real Indian-legal justification.

---

## 4 · What we take later, and in what order

**RAPTOR (§19) — yes, eventually, with the document's own caveat.**
Hierarchical summarisation for long judgments. Reported strongest on
faithfulness (70.9%) of the methods compared. The document's warning is the
important part and matches our harness: *"Do not use summaries as the final
evidence. The final citation should point to the original source passage."* A
summary is a retrieval aid; the citation resolves to the paragraph the court
printed. **Needs an LLM budget to build the summaries — queued.**

**RLM (§17) — real, and not for us yet.** MIT CSAIL, arXiv 2512.24601,
Dec 2025; handles 10M+ tokens by treating the prompt as a REPL environment and
recursively calling itself, never summarising, so no information loss. **The
right tool for "analyse every judgment on this proposition and find the
conflicts"** — the document's §46 Type D. It is above retrieval, not instead of
it, and it is worth nothing while success@5 is 24%. **Revisit after Gate S2.**

**Self-RAG (§22) and Corrective RAG (§23) — cheap and well matched to us.**
Evaluating retrieval quality *before* generation is directly aimed at our
failure mode: a bad retrieval set producing a confident, well-formed, unsupported
answer. Both need an LLM key.

**Hard negatives (§37) — take the list verbatim, now.** Our adversarial set is
**5 queries**. The document names seven failure shapes we should be testing:
correct case/wrong paragraph · correct citation/wrong proposition · semantically
similar but lower authority · old authority since overruled · a case that
distinguishes rather than follows · a citation that looks real and is not · a
paragraph that mentions the concept without supporting the claim. **Every one is
buildable from our own corpus with no LLM and no spend.** Queued as the next
credential-free harness item.

**LegalBench-RAG** (arXiv 2408.10343) is worth knowing about — the first
open-source retrieval benchmark for law, 6,858 query–answer pairs, built on
**span-level** retrieval rather than document IDs. **It is US contract law**, so
it is not our benchmark, but its method — minimal precise spans, Precision@k and
Recall@k — is the same method our harness uses, which is a useful independent
check that we are measuring the right thing.

---

## 5 · What we do NOT take, and why

**The stack in §48 and §62: Qdrant / Milvus / Neo4j / OpenSearch. No.**

`CLAUDE.md` fixes the stack at Railway Postgres + pgvector and says *ask before
adding any vendor*, and here the answer is clearly no on the merits:

- **The document is written for 20M documents. We hold 38,341.** Almost all of
  its scale advice is for a corpus we do not yet have.
- **Postgres already does all four jobs** — `tsvector` + gin for lexical,
  pgvector + HNSW for dense, ordinary tables for the citation graph, ordinary
  columns for metadata. The graph ranker in §3 above is **one SQL query**, not a
  Neo4j deployment.
- Current sources say the same thing directly: you can *"build production hybrid
  search without a dedicated search cluster"*, one table, two indexes, RRF.
- Four datastores means four consistency problems and four things to operate,
  for an MVP with one server engineer.

**Revisit when ingest actually approaches the AWS corpus scale** — that is a
real future, and the honest trigger is measured query latency or index build
time in Postgres, not a diagram.

**§39–§41 "distil the teacher" — take the framing, not the shortcut.** The
document is right that *"teacher output is a candidate, not ground truth"* and
that verification against the primary corpus is what makes it usable. But
`CLAUDE.md` forbids training on another model's commentary about law, and
**Bharat.Law is not a distillation target at all**: their NyaI is *"model
agnostic"* — an orchestration layer over third-party models, so there are no
weights to learn from. `BHARAT_LAW_OFFER.md` §5.

---

## 6 · Where this leaves the plan

Nothing here displaces Gate S2; it sharpens what to do about it.

1. **Graph expansion MEASURED** on the 283-query set — the code has existed for
   months; only the measurement is missing, and it needs a live Postgres rather
   than money or a key. **Measure it with the reranker and without**, per
   `graph-expand.ts`'s own note that they are one combination.
2. **Hard negatives from §37** — no spend, no key, and it makes
   `adversarialPassRate` mean something at n > 5.
3. **Query-side levers** (HyDE, multi-query, decomposition) — no re-embedding,
   needs only the LLM key. **Correcting the queue: these were wrongly grouped
   with the $65 of re-embedding.**
4. **Claim-support verification** and Unsupported Claim Rate — FQ-R1, because it
   amends spec.
5. **RAPTOR, Self-RAG, Corrective RAG, RLM** — after Gate S2 passes.

---

## 7 · What I am NOT claiming

- **The +0.250 and +0.125 recall figures are from general-corpus reports, not
  from our corpus.** They justify measuring, nothing more.
- **The graph ranker is unmeasured**, and I nearly shipped a worse duplicate of
  it by not reading the directory first. Its effect on success@5 is unknown.
- **"Deceptive grounding is our worst failure mode" is an inference**, not a
  measurement — we have never measured claim-support because nothing computes
  it. That is the argument for FQ-R1, and it would be circular to call it proven.
- **I have not read the LegalBench-RAG paper in full**, only its abstract and
  summaries; the claim that its method matches ours is from those.
