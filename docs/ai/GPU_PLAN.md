# The GPU — why it has been idle, and what it is actually worth

**13 Aug 2026, LCC.** The founder asked a fair question: there is a strong GPU
in this machine and nothing is using it. This answers it with measurements
rather than enthusiasm, because the honest answer is *"most of what we run
cannot use it, and one thing badly wants it."*

---

## 1 · WHAT IS ACTUALLY THERE

Measured, not recalled:

    NVIDIA GeForce RTX 4060 Ti · 8,188 MiB · utilisation 0% · driver 610.47
    no CUDA toolkit (nvcc absent) · no PyTorch installed
    CPU at 37% while six workers run

**8 GB, not 16.** That single number decides most of what follows.

---

## 2 · WHY IT HAS BEEN IDLE, AND WHY THAT WAS CORRECT

Every pass running today is bound by something a GPU cannot touch:

| workload | bound by | would a GPU help? |
| --- | --- | --- |
| PDF text extraction | S3 download, then poppler parsing | **No** — I/O then branchy CPU |
| citation extraction | regex over text, then DB round trips | **No** — branch-heavy, not arithmetic |
| paragraph splitting | string slicing | **No** |
| statute references | regex + DB writes | **No** |
| metadata / treatment enrichment | **InferX rate limits** | **Yes — see §3** |

The CPU sits at 37% and the GPU at 0% because **neither is the constraint**. The
constraints today are the shared database proxy, S3 fetch latency, and a free
API's 429s. Moving regex onto a GPU would be the "use compute because it is
there" mistake, and `docs/ai/DEEPSEEK_DATA_MOAT.md` §2 already declined it once
on the same reasoning.

**So the GPU being idle has not cost us anything yet.** It is about to.

---

## 3 · THE ONE THING THAT GENUINELY WANTS IT: LOCAL ENRICHMENT

Enrichment is the only workload we have that is compute-bound rather than
I/O-bound, and it is currently throttled by someone else's capacity.

**Measured today:** all three InferX grants return `429 (capacity)` under load;
a circuit breaker and a paid OpenRouter fallback were needed to keep the workers
moving at all.

**What this card can do**, from published benchmarks for exactly this hardware:

| | |
| --- | --- |
| 7–8B model, Q4_K_M quantisation | **40+ tokens/s** |
| VRAM, 7B Q4 at 4K context | ~5 GB — **fits** |
| VRAM, 7B Q4 at 32K context | ~8–9 GB — **does not fit** |

Our metadata prompt is ~4,000 characters of excerpt and ~150 tokens of output,
so it lives comfortably at 4K context. At 40 tok/s that is roughly **4–5 seconds
per document, ~12–15 documents/minute, ~20,000/day** — running continuously, at
**zero marginal cost and no rate limit**.

### The honest caveat, which is the important part

**A 7B local model is materially weaker than DeepSeek V4.** The concordance
evaluation measured that model fabricating an authority **10.8%** of the time
when the right answer was absent; a 7B would very likely be worse.

**Our architecture does not care, and that is the whole argument.** Every claim
must carry a verbatim evidence span that is then located in the source text — a
weaker model does not produce wrong data, it produces *more rejections*.
Measured on the current pipeline: 776 claims already rejected for spans that
could not be found, none of which reached the graph.

So the trade is **quality-neutral and throughput-positive**: a weaker model
lowers the grounding rate and raises the token cost per accepted claim, while
removing the rate limit entirely. That is a good trade for `metadata`, and a
worse one for `treatment`, where §4 of `TREATMENT_MEASURED.md` already shows
rare labels grounding at 33–50%.

---

## 4 · WHAT ELSE IT COULD DO, RANKED HONESTLY

1. **Embeddings.** The obvious use, and **deferred by founder decision** —
   embeddings start only once all courts are held and the data is structured.
   Not blocked on hardware; blocked on sequencing, deliberately.
2. **Near-duplicate detection.** We have 563 exact `content_hash` duplicate
   groups. *Near*-duplicates — the same judgment under two metadata records —
   are unmeasured and need vector similarity to find. Real value, but it is an
   embedding workload and waits behind (1).
3. **OCR.** Only 0.2% of the corpus is scanned without a text layer, and the
   poppler fallback already recovered the Bombay failures. **Low value** — this
   was never an OCR problem.
4. **Reranking.** A cross-encoder would help NEW1's ranking, but it is their
   lane and their measurement should drive it, not this document.

---

## 4b · REVERSED 13 Aug 2026 — FOUNDER DECISION, AND MY REASONING WAS WRONG

> **No local model. DeepSeek stays, and it is paid for.**

The founder's reason: a 7B is not intelligent enough for this work. They are
right, and the argument I made for it above has a hole I should have found
before writing it.

**I claimed the trade was "quality-neutral and throughput-positive" because
evidence-span verification means a weaker model produces more REJECTIONS rather
than wrong data.** That is only half true, and the missing half is the one that
matters.

**Verification catches FALSE POSITIVES. It does not catch FALSE NEGATIVES.**
A fabricated judge whose span is not in the source gets rejected — that half
works. But a judge who IS named in the document and whom a weaker model simply
fails to extract passes through unnoticed, because nothing in the pipeline
compares against ground truth. There is no signal for a claim that was never
made.

So a weaker model's real cost is not more rejections. It is **silently thinner
data** — fewer judges, fewer citations, fewer treatments — every one of them
looking perfectly clean, because everything it *did* return was verified. That
is worse than a visible failure, and it is exactly the *"unknown must stay
unknown"* line this lane holds everywhere else. A gap you cannot see is not a
gap you can report.

**Also relevant and not a small point:** `CLAUDE.md` §5 names DeepSeek V4 Flash
for public-class work. Swapping the model for a materially weaker one is a
change to that routing rule, not an implementation detail, and it is not a
change this lane makes on its own.

**Ollama and the local provider are removed.** The measurements in §1–§3 stand
and are worth keeping — the card is idle, most workloads genuinely cannot use
it, and enrichment is the only compute-bound one. What changes is the conclusion
drawn from them.

**The GPU's remaining real use is §4's list, led by embeddings**, which the
data-first decision has already deferred. When that gate is met, this hardware
becomes the embedding engine — a task where a local model's output is a vector
rather than a claim, so the false-negative problem above does not arise.

---

## 5 · RECOMMENDATION

**Do not build GPU infrastructure yet, and do not leave it at zero forever.**
The sequencing that follows from the founder's own data-first decision:

1. **Now:** nothing. The bottlenecks are network and rate limits, and the
   OpenRouter fallback plus circuit breaker already handle the second.
2. **A local model for enrichment is RULED OUT**, per §4b — not on throughput
   grounds but on quality, and the quality argument is about invisible recall
   loss rather than visible errors.
3. **When the data gate is met** (all courts held, citations in, corpus
   structured), the GPU becomes the **embedding engine**. That is its real job
   here, and it is deferred by sequencing rather than by doubt.

**If enrichment throughput does become the binding constraint**, the answer is
more paid capacity on the model we have chosen, not a weaker model run locally.
Buying throughput costs money; buying it with recall costs data nobody can see
is missing.
