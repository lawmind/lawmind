# NEW1 — THE FIRST EVIDENCE THAT TIER-A EMBEDDINGS DO USEFUL WORK

**Owner: NEW1.** 19 August 2026. P6.
Tool: `pnpm --filter @lawmind/harness bench:expansion`
(`services/harness/src/tier-a-expansion-benchmark-cli.ts`).
Artifact: `docs/ai/new1-tier-a/expansion-benchmark.json`.

---

## WHY A SECOND BENCHMARK EXISTS

The frozen 283-query CONTROLLED benchmark **cannot** measure corpus expansion and
never will. It is `courts=[sc]`, every gold judgment is Supreme Court, and the
Supreme Court is 99.9974% embedded. It was deliberately insulated from corpus
change — which is exactly what makes it blind to corpus growth. Running Tier-A's
value past it would measure nothing.

So this builds a benchmark whose gold authorities are documents that **were
unreachable until Tier-A embedded them**: 120 query→authority pairs, built from
real citation edges, where the cited judgment is one of the 19,987 documents now
carrying a Tier-A document vector.

Queries are citing passages built through `build-queries.ts`'s OWN redaction and
rejection functions — `redact`, `passageLooksLikeReasoning`, `snapToSentences`,
`looksOcrDamaged`, `citationsPointingAtGold` — imported rather than
reimplemented, because a second copy of a leakage control is a second place for it
to be quietly weaker. **113 of 233 candidate passages were rejected** by those
rules.

The citing side spans 11 High Courts: Allahabad 33, Karnataka 23, Delhi 22,
Jharkhand 11, P&H 7, Rajasthan 7, Himachal 5, Madras 5, Chhattisgarh 4,
Uttarakhand 2, Gujarat 1.

---

## THE RESULT

| universe | n | success@5 | recall@20 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- |
| **OLD** — production dense arm, 40,161 chunk-embedded documents | 120 | **0.8%** | **0.8%** | 0.004 | 0.005 |
| **NEW** — Tier-A document vectors, 19,987 documents | 120 | **35.8%** | **45.8%** | 0.318 | 0.319 |

**117 of the 120 gold authorities carry no chunk at all.** That is not a ranking
failure and no reranker, no fusion weight and no candidate depth can fix it: the
dense arm cannot return a document that has no vector. The 0.8% is one query out
of 120 — the three gold judgments that happen to be chunk-embedded, of which one
ranked.

The same authorities, once given ONE document vector each, are found in the top
five 35.8% of the time.

---

## THE CHEAP-ARM DESIGN, AND WHY THE FIRST VERSION WAS THROWN AWAY

The first run scored all 120 queries through the production ANN path and spent
**two hours** doing it. That was a slow tautology: the value-ordered manifest is
built with `NOT EXISTS (SELECT 1 FROM judgment_chunks …)`, so those documents have
no chunk **by construction** and no vector search at any depth could ever return
them. Paying 120 HNSW searches to rediscover a `WHERE` clause is not evidence.

The replacement is a presence check over all 120 gold ids — one indexed query —
plus a **positive control**: 20 queries scored the full expensive way, to catch
the case where the presence check and the retrieval path disagree (a stale index,
a partial rebuild, chunks that arrived after the manifest was cut).

**The control agreed with the presence check on every sampled query, with zero
disagreements.** If it ever disagrees, the OLD row stops being trustworthy and the
tool says so rather than averaging the contradiction away.

---

## WHAT THIS DOES NOT SAY, STATED BEFORE ANYONE QUOTES THE 35.8%

**The two universes are not the same size, so this is not a like-for-like ranking
comparison.** NEW searches 19,987 documents; OLD searches 620,300 chunks over
40,161 documents. A smaller candidate pool is an easier ranking problem, and some
of the 35.8% is that.

**What IS like-for-like is the reachability claim**, and it is the one that
matters: 117 of 120 authorities went from *impossible to retrieve* to *retrievable*.
That transition does not depend on pool size at all.

**A fair ranking comparison needs the merged universe** — Tier-A document vectors
and the existing chunk vectors contending in one ranking — and that is deliberately
NOT done here. The two representations have different distance distributions
(chunk-level versus document-level) and nobody has calibrated them. Merging them
silently would smuggle a fusion decision into an expansion measurement, which is
the same error the 18 August fusion sweep was corrected for.

**Other limits:**

- 120 queries, one citing passage per gold, no repeats.
- The gold population is the citation-VALUE-ordered batch — documents chosen
  *because* something cites them. They are more findable than a random Tier-A
  document, and the benchmark inherits that bias by construction.
- NEW is exact cosine, not HNSW. At 19,987 rows an index would change nothing;
  at 8.85M it will, and this number does not transfer to that scale unmeasured.
- `script_quality` verdicts landed on only 56,767 rows corpus-wide (NEW2, bus
  0780), so some of this population may carry Devanagari that Poppler deleted.
  Axis B cannot see it yet.

---

## WHAT IT CHANGES

This is the first number in the programme that answers *"is the GPU doing useful
work?"* with something other than throughput. The answer is yes, and the size of
the effect is the difference between **0.8% and 35.8%** on authorities an advocate
could have needed and could not have been shown.

It also gives the embedding queue an ordering criterion with evidence behind it:
the population measured here is the **citation-value-ordered** batch, and it was
reachable-to-findable in one pass. The id-ordered batch (stage 1) could not be
measured at all — nothing cites those documents, so no benchmark can score them.
