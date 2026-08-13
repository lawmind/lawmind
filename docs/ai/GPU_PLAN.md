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

## 5 · RECOMMENDATION

**Do not build GPU infrastructure yet, and do not leave it at zero forever.**
The sequencing that follows from the founder's own data-first decision:

1. **Now:** nothing. The bottlenecks are network and rate limits, and the
   fallback plus circuit breaker already handle the second. Standing up CUDA,
   PyTorch and a serving stack today would be infrastructure built ahead of the
   need — the third drift mode in `RING_PROGRAM.md` §2c.
2. **When InferX + OpenRouter throughput becomes the binding constraint on
   enrichment** — measurable as a sustained non-zero circuit-breaker rate with
   the paid fallback also saturated — stand up a local 7B for **metadata only**,
   behind the same evidence-span verification, and measure its grounding rate
   against the current one before trusting it.
3. **When the data gate is met** (all courts held, citations in, corpus
   structured), the GPU becomes the embedding engine and this document is
   superseded by that plan.

**The trigger for step 2 is a number, not a feeling:** enrichment throughput
capped by provider capacity rather than by our own queue depth. We are not there
today — the queue is deeper than the capacity limit, so more capacity would help
and more *hardware* would not.
