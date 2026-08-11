# Stage 10 — the retrieval bake-off

**Run 11 Aug 2026** against production, full 283-query eval set.
`services/harness/src/arms-cli.ts` · `pnpm --filter @lawmind/harness arms`.

**Status: the UNCONTROLLED pass is complete and written up below. The CONTROLLED
pass is running.** The single most actionable finding — §3 — is already final
and does not depend on it.

---

## 1 · The uncontrolled pass — the arms as production runs them

| arm | success@5 | recall@20 | MRR | wall |
| --- | --- | --- | --- | --- |
| sparse (`ts_rank`) | 10.2% | 17.0% | 0.070 | 881s |
| dense (BGE-M3) | **21.2%** | **40.6%** | **0.149** | 1166s |
| hybrid (RRF) — *production* | 17.3% | 38.9% | 0.119 | 1235s |

Paired on success@5, discordant queries only:

```
dense  vs sparse:  +41 / -10   McNemar p=0.0000
hybrid vs sparse:  +21 /  -1   McNemar p=0.0000
hybrid vs dense:   +16 / -27   McNemar p=0.1263   ~774 queries to settle
```

**Production's fused ranking scores below the dense arm alone**, on all three
metrics, 16 gained against 27 lost. **It is not significant at 283 queries** —
p = 0.13, and the tool itself says ~774 would be needed to settle it — but the
direction is consistent across every metric.

**This must not be read as "drop the lexical arm".** See §2.

---

## 2 · The confound, which nearly became a published lie

**The arms were not searching the same corpus.**

```
sparse reaches      79,322 judgments    everything, via full_text_tsv
dense reaches       38,341 judgments    only what is embedded
High Court embedded          0 of 40,980
```

Every gold judgment in the eval set is Supreme Court. So sparse carried a
haystack more than twice the size, in which **the extra 40,980 documents can
never be the answer but can absolutely outrank one** — and hybrid inherits that
handicap through the fusion, while dense never sees it.

*"Dense is twice as good as lexical"* is what the table reads as. Most of that
gap may be haystack size rather than ranker quality, and the two hypotheses have
**opposite fixes**:

- *fusion hurts* → drop or down-weight sparse in `/search`
- *the unembedded corpus pollutes the lexical arm* → finish embedding, fusion is
  fine

They produce identical numbers here. The controlled pass (`courts: ['sc']`, same
haystack for both arms) is what separates them, and **no change to the retrieval
path may be made before it lands.**

---

## 3 · The finding that is already final: High Court law is unreachable

Chasing §2 turned up something better than the bake-off was looking for.
Measured against **production**, three ordinary High Court practice queries with
no filters:

```
"anticipatory bail cancellation of bail bond"   5 results · 0 from a High Court
"quashing of FIR under section 482"             5 results · 0 from a High Court
"maintenance to wife under section 125"         5 results · 0 from a High Court
```

Every result, every query, Supreme Court. Force `filters.courts: ['hc']` and
Patna High Court judgments appear immediately — so **they are in the corpus and
lexically findable. They simply never win.**

### Why, and it is structural rather than tuning

RRF gives each judgment `1/(k+rank)` **per list it appears in**. A judgment in
*both* candidate lists collects **two** contributions; one that can only ever
appear in a single list collects **one**.

**No High Court judgment is embedded, so no High Court judgment can ever collect
the second contribution.** The entire High Court corpus competes one-armed
against opponents using two. The fusion down-ranks 40,980 judgments as a
side-effect of an index gap, silently — the results look fine, they are real
Supreme Court authorities, and nothing says that half the corpus could not
compete.

### What follows from it

- **The fix is embedding the High Court corpus, not reweighting RRF.** Putting a
  thumb on the fusion to compensate would be hiding a missing index behind a
  tuning constant.
- **RCC's court chips (bus 0046) are the access path, not a convenience.** Until
  the embeddings land, `filters.courts: ['hc']` is the only way an advocate
  reaches High Court law. Sent as bus 0062 so a future design decision does not
  quietly demote them.
- **No copy about it yet.** *"We hold High Court judgments but they rank poorly"*
  is true and reads as an excuse; the honest surface depends on which fix lands.

---

## 4 · Constraints on quoting any number above

- **"sparse" is Postgres `ts_rank`. It is NOT BM25.** Railway has no BM25
  extension (`RETRIEVAL_BENCHMARK_DESIGN.md` §4), so no BM25 arm was run and
  none may be claimed.
- **283 queries, 283 of 283 gold judgments Supreme Court.** This measures
  Supreme Court retrieval. It says nothing about High Court retrieval — which
  §3 shows is the part that most needs measuring, and which **Stage 9 must
  therefore build queries for**.
- **recall@20 is 38.9% on the production path.** Roughly six queries in ten never
  surface their gold judgment anywhere in the top twenty. That is a recall
  problem, not a ranking one, and no reranker fixes it.
- The eval set is a **regression set, not a benchmark** (`CURRENT_PLAN.md` §A0).

---

## 5 · What this changes in the plan

- **Stage 9 gains a specific brief.** "Expand toward 1,000–2,000" was vague;
  §3 makes the first category concrete — **High Court queries with High Court
  gold**, because that is the half of the corpus no measurement currently
  touches.
- **Stage 11 (embedding bake-off) is not the next embedding work.** Embedding
  the 40,980 High Court judgments with the model we already run beats comparing
  a second model on a corpus half of which is unindexed.
- **Nothing ships to `/search` on these numbers.** Recorded, not acted on.
