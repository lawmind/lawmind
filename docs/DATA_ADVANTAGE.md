# DATA ADVANTAGE — how we get the most data AND the most precise answers

Written 8 Aug 2026, after the eCourts scheme grant landed and on the founder's
instruction that **"having the most data and the most precise user experience
for accuracy is the goal."**

Both halves of that sentence matter, and they pull against each other more than
is obvious. This file is about doing both rather than trading one for the other.

---

## 0 · The thing that is easy to get wrong

**More data does not automatically mean better answers. Past a point it means
worse ones.**

A corpus of 38,000 Supreme Court judgments and a corpus of 33,000,000 district
court orders are not the same problem with a bigger number. Every document added
is another chance for the retriever to return something topically plausible and
practically useless — and legal corpora are unusually bad for this, because
Indian judgments share structure, boilerplate and phrasing to a degree that
makes near-misses look like matches. The research literature names this
directly: **Document-Level Retrieval Mismatch**, where the retriever picks
chunks from the wrong source document because legal text is so lexically and
structurally similar (arXiv 2603.19251).

So the plan below has two tracks that must ship **together**:

| track              | question it answers           | failure if shipped alone                            |
| ------------------ | ----------------------------- | --------------------------------------------------- |
| **Breadth** (§2)   | "do we hold it?"              | 33M documents, precision@5 collapses, Gate S2 fails |
| **Precision** (§1) | "is the right one at rank 1?" | precise answers about a corpus too small to matter  |

**Precision work goes first**, because it is cheap, it is measurable today
against a 38K corpus, and it is the thing that has to be _already true_ before
scale is survivable.

---

## 1 · PRECISION — the lever we have not pulled

### 1a · There is no reranker, and that is the single biggest gap

Confirmed by search 8 Aug 2026: `services/api/src/search/retrieve.ts` does
hybrid retrieval (stored `tsvector` + dense HNSW over `judgment_chunks`) fused
with **RRF at k=60**. That is a good retrieval stack. It has **no reranking
stage at all.**

The distinction is the whole point: **retrieval optimises recall; reranking
optimises precision.** RRF fuses two rankings that each scored the query and the
document _separately_. A cross-encoder scores them _together_, attending across
both at once — which is why it is dramatically more accurate and dramatically
slower per pair, and therefore why it belongs on the top ~50 candidates rather
than the corpus.

Measured expectation from the literature: **15–30% precision gain for
100–300 ms of added latency.**

**Gate S2 requires `precision@5 ≥ 0.7`.** This is the lever aimed directly at
that number, and it is the difference between passing it by luck and passing it
by design.

### 1b · The model, and why this one

**`BAAI/bge-reranker-v2-m3`.**

| criterion        | why it fits                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Licence**      | **Apache-2.0** — clears `OSS_STACK.md` (MIT/Apache/BSD ok, AGPL not)                                                                                                          |
| **Multilingual** | **Non-negotiable.** Hindi is a standing product commitment; an English-only reranker would silently degrade exactly the queries PD-5 and OD-5 protect                         |
| **Size**         | 278M params — servable on what we already run. `bge-reranker-large` buys ~2 nDCG@10 for double the latency at 560M; not worth it here                                         |
| **Family**       | Same lineage as `Xenova/bge-m3`, which `services/embed` already self-hosts. Same tokenizer family, same ONNX/transformers.js path, same "container needs no network" property |
| **Cost**         | **₹0.** Self-hosted, no key, no subscription — matches the MVP constraint exactly                                                                                             |
| **Quality**      | 51.8 nDCG@10 on BEIR; competitive with commercial rerankers on English                                                                                                        |

ONNX weights exist at `onnx-community/bge-reranker-v2-m3-ONNX`, inheriting the
upstream Apache-2.0.

**Note the shape of this recommendation:** it adds no vendor, no key, no monthly
line item, and no new failure mode that needs the network at runtime. It is the
same trade `services/embed` already made and the reason that decision keeps
paying.

### 1c · Where it goes

Rerank **between retrieval and verification**, never after:

```
hybrid retrieve (top ~50)  →  cross-encoder rerank  →  top 5
   →  hand IDs to the model  →  three-tier verification  →  render from the DB row
```

**It must not touch the verification pipeline.** `CLAUDE.md`: the citation
pipeline is exempt from simplification, and a reranker is a _relevance_ judgement,
never an _existence_ one. Reordering candidates changes which real judgments an
advocate sees first; it can never make an unverified citation verified, and
nothing in `citations/**` should learn that this stage exists.

### 1d · Measure it, do not assume it

Build it **behind the harness**, not before it. The 15–30% figure is the
literature's, not ours, and `precision@5` is a Gate S2 metric whose definition is
already fixed in writing (`services/harness/src/metrics.ts`). The honest
sequence is: harness first → baseline precision@5 recorded → reranker → the same
number again. **If it does not move the number on our own corpus, it does not
ship** — the same gate `TRAINING_STRATEGY.md` already puts on the first
fine-tune.

---

## 2 · BREADTH — what the grant actually unlocked

### 2a · The scale, measured not estimated

NJDG, the government's own data warehouse behind eCourts:

- **~7 crore (70M) pending and disposed cases**
- **~3.3 crore (33M) orders and judgments** from District Courts
- **2,852 district and taluka court complexes** publishing case status and cause
  lists, many also uploading orders
- Full District Court coverage, plus High Courts

Our corpus today: **~38,000 Supreme Court judgments + 845 Central Acts.**

The grant covers **all of it**, plus court names, case status, cause lists,
caveat search and court orders, with permission to display independently and to
train — until **12:00, January 2029**, renewable for payment.

### 2b · The grant partly SUPERSEDES our own tiering conclusion

`docs/CORPUS_TIERING.md` §6 concluded — correctly at the time:

> Every High Court row carries a **CNR**. CNR is what eCourts resolves, and
> eCourts is **Tier 3**: human confirmed, cached permanently, CAPTCHA never
> bypassed... the difference between "we have 19.5M documents" and "we have
> 19.5M documents and we are honest about which ones a court will accept."

That reasoning stands, but its **constraint has moved**. It assumed eCourts
resolution happens one citation at a time, when an advocate personally confirms
it. The grant permits bulk, authorised, automated resolution.

**So the long tail can arrive already citable instead of arriving unverified and
waiting for a human.** That is the difference between holding 33M documents and
holding 33M _usable authorities_, and it is the single largest change to this
product's data position since the corpus began.

### 2c · The enum question this creates — NOT decided here

`verified_by_source = 'ecourts'` currently carries a specific meaning:
**a named human personally vouched for this citation.** That is why it caches
permanently and why it is the fallback when the automated tiers disagree.

If bulk resolution writes the same value, that guarantee silently degrades to
"a machine said so" — and it would still read `ecourts` in the database. The
strongest signal in the product would weaken with no test failing.

**Proposal, for the founder rather than for me:** add a distinct value
(`ecourts_bulk`) so the two remain separable, with the human tier still ranked
above it. Additive to the enum, no existing row changes meaning.

**Not done unilaterally** — `CITATION_HARNESS.md` is a binding spec and this
changes what a stored value means. Recorded in `FOUNDER_QUEUE.md`.

### 2d · What we still do not do

**We do not buy from scraper-resellers.** The research surfaced
`ecourtsindia.com` selling exactly this data through an API. `CLAUDE.md`:
_"Never circumvent an access control, and never buy data from someone who did."_

The grant makes that moot in the best possible way — we get the same data
lawfully, at the source, with written permission and an audit ledger. **A
competitor buying it from a reseller has a supply that can be cut off and a
provenance they cannot defend.** Ours cannot and can.

---

## 2e · The 17.8M judgments are FREE and need no permission at all

**Measured, not estimated** (AWS Registry of Open Data + the dataset's own docs,
8 Aug 2026):

|                                    |                                                                    |
| ---------------------------------- | ------------------------------------------------------------------ |
| `s3://indian-high-court-judgments` | **17.8 million judgments**                                         |
| Courts                             | **25 High Courts, 45 benches**                                     |
| Size                               | **~1.25 TiB** of tar archives                                      |
| Licence                            | **CC-BY-4.0** — commercial use and derived works, with attribution |
| Region                             | `ap-south-1` · **no AWS account required**                         |
| Updates                            | **Quarterly**                                                      |
| Dedup key                          | `(cnr, decision_date, order_number)` — stated by the dataset       |

We hold ~38,000. **This is a 470× increase, free, today, needing nobody's
permission beyond attribution.**

**The two sources do different jobs and neither replaces the other:**

- **AWS Open Data gives us the TEXT** — free, bulk, CC-BY, no rate limit, no
  grant needed.
- **The eCourts grant makes it CITABLE** — the parquet metadata carries **CNR**
  for every row, and CNR is precisely what eCourts resolves.

That is the whole architecture in one line: _bulk the text from AWS, resolve the
citation through eCourts._ Neither alone is sufficient — 17.8M uncitable
documents is a liability, and eCourts alone cannot be bulk-downloaded politely.

## 2f · What it costs to embed — the number is smaller than expected

`CORPUS_TIERING.md` §3 already made the decision that makes this affordable:
**tier 2 stores one vector per JUDGMENT, not per chunk** — _"cuts the embedding
job 16×."_

With measured throughput (BGE-M3 on an A100 80GB: ~60,000 tok/s ≈ 216M tokens/hr
at ~$1.04/hr):

- 17.8M judgments × ~750 tokens for a representative embed ≈ **13.4B tokens**
- ÷ 216M tokens/hr ≈ **62 GPU-hours**
- ≈ **$65, one-off**

**Sixty-five dollars to embed the entire Indian High Court corpus.** Money was
never the constraint here. Parallelise across 8 GPUs and it is under a day for
the same total.

The constraint that IS real is precision, which is §0 and §1 — and it is the
reason this section comes after them rather than before.

## 2g · Tribunals: the resellers are out, but the founder has a better route

`DATA_SOURCES.md` §5 names tribunals as _"the largest gap for a whole class of
practice"_ — an advocate doing company or tax work lives in NCLT and ITAT, and
neither is in our corpus at all.

Research surfaced two commercial APIs covering them (eCourtsIndia, Vakeel360 —
15 NCLT benches, 23 ITAT, 10 CESTAT, 18 CAT). **Both are out.** `CLAUDE.md`
names eCourtsIndia explicitly, and Vakeel360 is the same class: a reseller whose
access provenance we cannot verify and therefore cannot defend.

**The out-of-the-box route is the one the founder has already proved works.**
The eCourts grant came through a government scheme, not a negotiation with a
vendor. Tribunals are also government bodies with the same public-record status.
**Nobody has asked them.** That is a founder action with a known-good template —
the same application that already succeeded once — and it costs a letter rather
than a subscription. Queued.

## 2h · Two techniques that raise precision for ₹0, using what we already run

**Late chunking** (arXiv 2409.04701). Standard chunking embeds each chunk in
isolation, so a chunk reading _"the appeal is allowed"_ is embedded with no idea
which case it belongs to — and in a corpus where thousands of judgments contain
that exact sentence, its vector is nearly meaningless. Late chunking embeds the
**whole document first**, then pools token embeddings into chunks, so every
chunk's vector carries the document's context.

It is **training-free, embedder-agnostic, and needs only a long context window**
— and **BGE-M3 accepts 8,194 positions**, which `services/embed/src/chunk.ts`
already notes. We are running the one model this technique requires.

Note what it is NOT: Anthropic's _Contextual Retrieval_ solves the same problem
by having an LLM write a context sentence for every chunk. Better in some
benchmarks, and it would cost an LLM call per chunk across hundreds of millions
of chunks. Late chunking gets most of the benefit for the price of a pooling
change.

**Citation-graph signal — and this one is ours alone.** `judgment_citations`
already holds judgment-to-judgment edges with the court's own treatment phrase.
The literature is converging on cross-reference-aware legal retrieval (CRAwLeR,
arXiv 2606.21676) precisely because legal documents cross-reference so heavily.

A judgment cited by several of the results we just retrieved is very likely
relevant even when its own text matches the query poorly — this is PageRank, for
law. **No competitor can copy it quickly**: the graph is the expensive part and
we already built it. `TRAINING_STRATEGY.md` §3a already calls the citation graph
a licensable asset in its own right; this is a second use for the same asset.

---

## 3 · The order of work

1. **Harness** (Workstream A) — the baseline. Nothing below is measurable
   without it, including whether any of it helped.
2. **Reranker** — biggest precision lever, ₹0, ships against the harness.
3. **Late chunking** — second precision lever, ₹0, same model.
4. **Citation-graph re-scoring** — third lever, and the one nobody can copy.
5. **IPC↔BNS mapping** (C1) — closes the last S1 criterion.
6. **AWS Open Data ingest** — 17.8M judgments, needs no permission. Tier 2
   shape from `CORPUS_TIERING.md`, ~$65 of GPU.
7. **eCourts CNR resolution** — turns tier 2 from findable into citable. Needs
   the `ecourts_bulk` enum decision (§2c) first.

**Every precision lever ships before the breadth work, and each one is measured
against the harness rather than assumed.** If a lever does not move our own
number it does not ship — the same gate `TRAINING_STRATEGY.md` puts on the first
fine-tune.

**Breadth last, deliberately.** Ingesting 33M documents into a stack whose
precision@5 has never been measured would produce the most data and the worst
answers, and we would not find out until an advocate did.

---

## 4 · Sources

- [Cross-encoder reranking, measured precision gains](https://bigdataboutique.com/blog/rag-reranking-improving-retrieval-quality-with-cross-encoders)
- [BGE-reranker-v2-m3 model card, Apache-2.0](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- [ONNX export](https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX)
- [NJDG coverage figures](https://njdg.ecourts.gov.in/)
- [Document-Level Retrieval Mismatch in legal corpora, arXiv 2603.19251](https://arxiv.org/pdf/2603.19251)
- [RAG vs fine-tuning decision framework](https://winder.ai/rag-vs-fine-tuning-2026-decision-framework/)
