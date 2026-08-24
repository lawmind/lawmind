# LONG_FACT_SEARCH_CONTRACT_V1

**NEW1 · 23 Aug 2026.** Evidence: `pnpm --filter @lawmind/harness long:passage`,
`docs/ai/new1-tier-a/long-passage.stdout.log`. Query embedding routed through the
**GPU sidecar** (`harness-embedder.ts`) — last round's version of this experiment
ran on the in-process CPU embedder and starved the walk, which is why it never
finished.

---

## 1. THE FACT THAT DECIDES EVERYTHING ELSE

**The embedder is NOT silently truncating long input.** Measured by embedding the
same text at growing lengths and comparing each vector to (a) its own first 1,000
characters and (b) the full 20,000:

| input chars | cosine to 1,000-char prefix | cosine to full 20,000 |
| ---: | ---: | ---: |
| 500 | 0.9572 | 0.6435 |
| 1,000 | **1.0000** | 0.6625 |
| 2,500 | 0.9421 | 0.7081 |
| 5,000 | 0.8623 | 0.8259 |
| 10,000 | 0.7799 | 0.8952 |
| 20,000 | 0.6625 | **1.0000** |

The two columns move in opposite directions, monotonically. If the model were
discarding text past a window, the left column would stay pinned at 1.0 and the
right would stop moving. It does neither.

**So the 500-character cap is NOT protecting us from a model that cannot read.**
It is protecting us from the lexical arm, and that is a different problem with a
different fix.

## 2. AND YET LONG INPUT STILL HALVES RETRIEVAL

Four arms, 25 real fact patterns per size, targets in top 5:

| input size | DIRECT (embed the whole thing) | CONDENSED | CONTROL_500 | embed p50 |
| ---: | ---: | ---: | ---: | ---: |
| 500 | **8/25** | 8/25 | 8/25 | 556 ms |
| 1,000 | **4/25** | **8/25** | 8/25 | 433 ms |
| 2,500 | **4/25** | **8/25** | 8/25 | 408 ms |
| 5,000 | **4/25** | **8/25** | 8/25 | 564 ms |

`DIRECT` drops from 8 to 4 the moment input exceeds 500 characters and then stays
flat. `CONDENSED` and `CONTROL_500` hold at 8 at every size.

**The mechanism is DILUTION, not truncation.** The model reads the whole
narrative and averages the advocate's legally decisive sentence together with the
dates, party names, procedural history and irrelevant background around it. The
resulting vector is a faithful summary of a document nobody is looking for.

This is the same finding as the document-vector result from the other direction:
a vector that describes *everything* answers *nothing specific*. There it was the
document side; here it is the query side.

## 3. THE CONTRACT

### 3.1 Accept the advocate's real narrative

The product SHOULD accept a paragraph of facts. 500 characters is a **current
safety bound on the retrieval path**, never the product vision, and nothing in
this measurement argues for keeping it as a user-facing limit.

### 3.2 Never embed the raw narrative

**Do not send a >500-character fact pattern to the embedder as-is.** Measured
cost: half the recall, at every size tested.

### 3.3 Condense deterministically, then embed

`CONDENSED` recovers full recall at every size. The condensation that was
measured is: **keep the sentences carrying the rarest lexemes by MEASURED
document frequency (`lexeme_document_frequency`), up to 500 characters.**

It must be deterministic — no model call. A condensation that varies between two
identical requests makes pagination non-reproducible, which
`PAGINATION_RANKING_CONTRACT.md` forbids.

### 3.4 The whole passage NEVER goes to corpus-wide `sparseAny`

Unchanged and non-negotiable. A 900-character verbatim passage kept the sparse
arm alive for 32 minutes; LCC's bus 1060 shows the same arm can exhaust database
memory. The condensed form is what reaches any lexical path.

### 3.5 Show the advocate what was searched

If the product silently condenses 2,000 characters to 500, the advocate must be
able to see which sentences were used. Otherwise a miss is unexplainable to the
person best placed to fix it by rephrasing.

### 3.6 MAXIMUM SAFE INPUT SIZE

| path | bound | basis |
| --- | --- | --- |
| user input accepted | **no measured limit up to 5,000 chars** | dilution is handled by condensation |
| text reaching the embedder | **500 chars, condensed** | DIRECT halves recall above this |
| text reaching any lexical arm | **500 chars, condensed** | 32-min query, and OOM per LCC 1060 |
| embedding latency | 408–564 ms p50 | flat across all sizes; not a constraint |

---

## 4. CAVEATS

- **n=25 per size, and the ceiling is 8/25 (32%).** The arms are compared against
  each other on identical inputs, which is what the design is for; the absolute
  level is low and reflects the same coverage problem as everything else this
  round (see `SEMANTIC_SEARCH_RELEASE_DECISION.md` §2). A 4-vs-8 difference on
  n=25 is directionally clear and is not a precise effect size.
- **`CONDENSED` was measured with ONE condensation rule.** It recovers what
  DIRECT loses; nothing here says it is the best rule, only that a bounded
  deterministic one suffices.
- **The truncation probe is one text.** The monotone opposing trends across six
  lengths are hard to produce by accident, but it is one document.
- Nothing here was measured through a production index.
