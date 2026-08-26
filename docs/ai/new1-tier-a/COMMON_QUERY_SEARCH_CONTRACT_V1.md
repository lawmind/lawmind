# COMMON_QUERY_SEARCH_CONTRACT_V1

**Owner:** NEW1 · **Consumer:** LCC · **Date:** 25 Aug 2026 · **HEAD:** `0cd7a65`
**Mandate:** R7 §9 NEW1-P0 — bounded, representative benchmark for high-frequency Indian legal concepts.
**Artifacts:** `COMMON_QUERY_BENCHMARK.json` (frozen questions, `1af9ed42fc7d3efa…`) · `COMMON_QUERY_ARMS.json` (answers)

---

## 1. The headline, and it is a product finding rather than a ranking one

**14 of 48 (29.2%) of the most common queries in Indian legal practice are refused
before ranking. Passage ANN answers every one of them, on-concept.**

The refused set is not a tail of odd inputs. In order:

| concept | queries refused | example |
| --- | --- | --- |
| bail | **4 of 4** | `bail`, and `grant of bail in a criminal case` |
| anticipatory bail | **3 of 4** | `when may a court grant anticipatory bail to a person apprehending arrest` |
| quashing of FIR | **3 of 4** | `quash the FIR` |
| limitation | 2 of 4 | `appeal barred by limitation` |
| writ maintainability | 2 of 4 | `writ petition not maintainable` |

Never refused: cheque dishonour, specific performance, arbitration interim relief,
maintenance, murder, service termination, injunction.

The split is corpus frequency. **The more common the practice area, the more certainly
we refuse it** — which is the exact inverse of what a research product should do.

---

## 2. Query length is not the mechanism. Minimum term document frequency is.

This corrects the inference in LCC bus 1173 (*"one or two terms leaves an estimated set
in the millions, four terms cuts it to something bounded"*).

```
REFUSAL RATE BY QUERY LENGTH
  1-2 terms    6/13 refused  (46%)
  3-5 terms    4/20 refused  (20%)
  6+ terms     4/15 refused  (27%)
```

Not monotone, so length is not the driver. The actual rule, read from
`services/api/src/search/retrieve.ts` and reproduced — not modelled — in the arms
harness:

1. `lexemes = to_tsvector('english', query)`
2. `df` per lexeme from `lexeme_document_frequency` (128,243 lexemes over a
   40,537-document sample) — a precomputed table, not a scan
3. prefer lexemes with `df <= SPARSE_MAX_DOCUMENT_FREQUENCY` (0.50)
4. keep the `SPARSE_RARE_LEXEMES` (3) rarest
5. **refuse when `min(df) > SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY` (0.05)**

```
rarestDf 0.2577  [ 1 term ]  "bail"
rarestDf 0.2577  [ 7 terms]  "grant of bail in a criminal case"
rarestDf 0.0908  [10 terms]  "considerations for granting regular bail to an accused in custody"
rarestDf 0.0564  [12 terms]  "when may a court grant anticipatory bail to a person apprehending arrest"
```

A twelve-word, perfectly well-formed sentence is refused, because only the **three
rarest** lexemes are kept and every lexeme in a sentence about anticipatory bail is
common in a corpus of criminal judgments. Adding words helps only when the added words
are *rare*: `anticipatory bail in economic offences` succeeded in LCC's envelope
because *economic* and *offences* are rarer than *bail*, not because it had four terms.

The 0.50 cap is a red herring. `bail` at 0.2577 passes it comfortably and is refused by
the 0.05 ranking cap five lines later.

---

## 3. The bounded arms, and the fusion I nearly skipped for the wrong reason

R7 permits four: the current sparse guard, passage ANN, a bounded phrase/proximity
lexical path, and **at most one** fusion *if complementary*.

| arm | queries answered | mean on-concept @10 | note |
| --- | --- | --- | --- |
| `sparse_guard` | 34 of 48 | — | reproduces the production **refusal decision**, not production ranking |
| `passage_ann` | **48 of 48** | **0.892** | HNSW over the tranche at production `ef_search = 200` |
| `lexical_phrase` | 32 of 48 | — | LIMIT-capped, joined to the tranche so it can never exceed it |
| `fusion_rrf` | 48 of 48 | **0.911** | RRF, k=60, over ANN + lexical |

### CORRECTION_OF an earlier draft of this file

The first draft **skipped the fusion arm** and gave this reason: *"annLexOverlapAtN mean
0.033 — fusion is only justified when the arms are complementary."*

That reading was **inverted.** An overlap of 0.033 means the two arms return almost
entirely *different* documents — which is the definition of complementary, and exactly
the condition R7 makes the fusion arm conditional on. A **high** overlap would have
justified skipping it. I had written the guard so that the more complementary the arms
were, the more certainly fusion would be skipped.

Fusion was then implemented and run:

```
mean on-concept delta vs passage ANN alone   +0.0188
recommendation                               SHIP-CANDIDATE
```

The decision rule was written before the number was known — fusion ships only if it does
not *lose* on-concept precision — so it is not fitted to the outcome.

**Read the gain honestly: +0.019 is marginal.** Complementary is not the same as useful,
and the lexical arm contributes few documents (32 of 48 queries answered). The
recommendation is SHIP-CANDIDATE, not SHIP: it earns a place in a bake-off against the
full-scale index, not a place in production on this evidence.

No full-corpus unbounded rank was performed. No external search engine was introduced.

---

## 4. Wrong-domain adversarial: zero false-confident hits

Four probes, including NEW3's real instance from bus 1076 (a commercial-breach query
that returned an IPC 394 robbery judgment).

| probe | returned | forbidden-domain hits |
| --- | --- | --- |
| commercial supply contract vs robbery/homicide | 10 | **0** |
| input tax credit vs bail/custody | 10 | **0** |
| restitution of conjugal rights vs company winding-up | 10 | **0** |
| land acquisition compensation vs criminal trespass | 10 | **0** |

Scored mechanically: a hit is a result carrying the forbidden domain's vocabulary and
**none** of the query's own. That is the failure mode NEW3 saw — an answer from another
branch of law that the advocate cannot see is from another branch of law.

### NEW3's pinned regression case, run properly

The four probes above are my own wording. NEW3's bus 1142 supplies something better: a
**deterministic, twice-reproduced, real product failure** with an exact judgment attached
— an IPC §394 robbery conviction returned at **rank 1 of 12** for the commercial position
*"Om Industries breached the supply agreement and is liable for consequential damages"*.
Critically, the sparse arm did **not** refuse that query (rarest df 0.0153). It ran, it
ranked, and it put a robbery conviction first. That is a ranking failure and no coverage
fix may be credited for it.

```
sparse / lexical arm (NEW3)     the robbery conviction at  #1 of 12
passage representation (NEW1)   the same judgment at     #137 of 137   (dead last)

  offender best passage similarity   0.4038
  tranche rank-1 similarity          0.6201
  tranche rank-10 similarity         0.5670
```

Passage top 10 for that exact position: **0 wrong-domain results**; rank 1 is
*Mahanagar Telephone Nigam Ltd v M/s Mafatlal Industries*, a real commercial supply
dispute.

**The first version of this test was worthless and was discarded.** The offending
judgment is not in the tranche at all, so an index that does not contain the wrong
answer cannot be credited for not returning it — absence is not a fix, and reporting it
as one is the same error as counting a forced-gold target as a hit. It was also **not**
inserted into `new1_tranche_passages` to make the test work: the manifest names exactly
which documents are in the index and its content hash is what FIFTH checks, so adding a
document to pass a regression test is the fixture contamination R7 warns about. Instead
the judgment was chunked with the same `chunk.ts`, embedded in memory through the same
sidecar, and scored against the same query vector. **Nothing was written to any table.**

Nothing about the data changed between rank 1 and rank 137. Only the representation did.

**Do not over-read any of this.** Five probes including NEW3's is still a smoke test, not
a rate, and the passage index is 81,720 documents of 18.7M — a full-scale index has vastly
more chances to find a better wrong answer. This says the obvious cross-domain failure
does not reproduce on the passage representation. It does not say wrong-domain retrieval
is solved.

---

## 5. The contract

### 5.1 A refusal is `coverage_unknown` and may never render as "no results"

Already implemented by LCC (`outcome.ts`, commit `241ad20`). This benchmark supplies the
scale: it is **29.2% of common practice queries**, not an edge case.

### 5.2 `coverage_unknown` is derived from `rarestDf`, never from a length heuristic — SHIPPED

If the server infers "short query, therefore degraded", it will mislabel the 12-term
anticipatory-bail sentence as answerable and the 5-term arbitration query as degraded.
`rarestDf` is already computed before ranking, in the same statement, and it *is* the
refusal cause.

**LCC shipped this in commit `a0873d7` and I verified it in the code rather than taking
the report** (`OBSERVED_BY_CODE`): `rarestDf` leaves `sparseAny` on `RetrievalSignals`
(`retrieve.ts:581,585`) and reaches `retrievalOutcome` at **all five** return sites in
`outcome.ts` — including the `coverage_unknown` branch, which is where `sparse_unbounded`
actually lands and which their first pass missed.

Two details of their implementation worth preserving, both better than what I asked for:

- **`rarestDf` is recorded whether or not the query is refused.** A df published only on
  refusal makes the field's *presence* the signal, and then nobody can distinguish a query
  that passed comfortably from one that nearly did not.
- **LCC also issued a `CORRECTION_OF` their own 1173.** The length story was theirs and
  they withdrew it in the same message that shipped the fix.

### 5.3 The passage arm is the remedy, and its scope must be stated with it

Passage ANN answered all 14 refused queries at 0.8–1.0 on-concept. That is the strongest
argument in this sprint for a passage index — but it is measured on the **tranche**, and
the tranche is 81,720 documents of an 18,698,984-document corpus. Coverage numbers from
it are directional. The **refusal** numbers carry no such caveat: they are production's
own rule on production's own table.

### 5.4 On-concept is topicality, not correctness

A result is on-concept when its text contains a `requiredAny` term. This measures whether
the system is in the right area of law. It says nothing about whether the authority is
good, current, or applicable, and **no accuracy claim may be quoted from it.**

---

## 6. Anchors came from the database, never from memory

`CLAUDE.md` §6 forbids inventing a section number; `DOMAIN_TRUTH.md` holds no section
numbers for most of these areas. So each concept declares plain-English search terms for
`statutes.short_title` and `statute_sections.heading`, and the benchmark **resolves** them
against `statute_sections`. Every anchor in the artifact carries the statute, the section
number and the heading it came from, and any of them can be checked against the row.

11 of 12 concepts anchored. One did not:

> **`CQ-09-service-termination` is `NOT_ANCHORABLE`.** The corpus holds *The Industrial
> Disputes (Banking and Insurance Companies) Act, 1949* but **not the Industrial Disputes
> Act, 1947** itself. Emitted as `NOT_ANCHORABLE` rather than anchored to the near-miss.
> **NEW2: this is a statute-acquisition gap** — service and labour matters are a large
> part of High Court writ work, and the principal statute is missing.

---

## 7. Caveats

- **The `sparse_guard` arm reproduces the refusal DECISION, not production ranking.** It
  answers "would the advocate have seen an empty screen", which is the question the
  product failure is about. It does not tell you how good the results would have been had
  it not refused.
- **The first version of this arm was wrong** and was replaced. It invented an
  independence-product estimate over `ILIKE` document frequencies; production uses
  `min(df)` from a precomputed table. An arm that behaves differently from production
  tells you nothing about production. `CORRECTION_OF` an earlier draft of this file.
- **`requiredAny` terms are English.** A Devanagari judgment about the same concept scores
  as off-concept, so per-concept relevance is a **floor**, not an estimate.
- **The 12 concepts are 10 named in R7 plus 2 chosen by NEW1** (a bare single word, and an
  IPC/BNS transition probe). They are representative of high-frequency practice, not a
  random sample of query traffic — we have no query traffic.
- ~~**ANN coverage was measured on a 27% prefix of the passage build** (66,155 passages
  over 21,800 documents)…~~ **RESOLVED 2026-08-26T02:05Z — re-run at full scale on the
  complete tranche: 418,116 passages over 81,720 documents.** The caveat is retired, and
  what it turned into is worth recording rather than deleting:

  | | 27% prefix | complete tranche |
  |---|---:|---:|
  | refused by sparse guard | 14 / 48 (29.2%) | **14 / 48 (29.2%)** |
  | mean on-concept @10, ANN | 0.892 | **0.9562** |
  | queries ANN could not answer | 0 | **0** |
  | wrong-domain hits | 0 | **0** |

  Both halves went the way this contract predicted they would, which is the reason to
  publish the comparison rather than just the new number. **The refusal figure did not
  move at all** — it is production's own rule against production's own
  `lexeme_document_frequency`, so index size cannot touch it. **The coverage figure did
  move**, 0.892 → 0.9562, because that one depends on what is in the index.

  **The prefix claim in the retired caveat was also wrong, and Fifth caught it** (bus
  1255). It said the prefix "is a uniform sample of the tranche by construction, because
  the embed runs in global priority-hash order." It is not: the CLI embeds
  `ids = [...forced, ...natural]`, so any prefix is **forced-complete plus a uniform
  natural prefix** and is biased toward Gold-target availability. It does not change these
  particular numbers — the common-query set carries no Gold targets — but the reasoning
  was unsound and it produced a real error elsewhere, in the partial-index family scores.
