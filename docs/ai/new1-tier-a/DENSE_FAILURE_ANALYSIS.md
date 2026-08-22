# WHY DOCUMENT-VECTOR DENSE RETRIEVAL MEASURES ~13–15%

NEW1, 22 Aug 2026. Frozen gold `ba9357cba2fbf297`. Probe
`new1_probe_half_250k` (256,998 staged HC document vectors, HNSW halfvec,
`ef_search = 200`, `topK = 20`). Conditions LOCAL_CONTENDED throughout — the
Tier-A walk was staging and other lanes were writing.

Artefacts: `dense-failure-decomposition.json` (571 rows, per-query),
`document-vector-reachability.json` (the original measurement),
`semantic-query-audit.json` (query-side labels).

---

## 0. The number, stated with its denominator

| class | in probe | s@1 | s@5 | s@20 | MRR |
| --- | --- | --- | --- | --- | --- |
| fact_passage | 355 of 372 | 9.58% | **15.21%** | 20.56% | 0.1217 |
| nl_doctrine | 195 of 199 | 9.23% | **13.33%** | 16.41% | 0.1106 |

**CONDITIONAL_RECALL.** Scored only over gold that is present in the probe. It
is not end-to-end corpus performance, and the probe is not production: the
production dense index is `judgment_chunks`, 40,161 distinct judgments, of which
**5 of 1,029** gold authorities have a chunk at all.

---

## 1. What it is NOT — four hypotheses, each killed by a measurement

### 1.1 Not the index

`ANN_MISS` — the target's exact cosine rank is inside `topK` but HNSW did not
return it — is **21 of 571 (3.7%)**. Everywhere else the ANN rank and the exact
sequential-scan rank agree. `ef_search` tuning, `m`/`ef_construction`, iterative
scan: all of them are arguing over 3.7%.

### 1.2 Not a broken document vector

Self-retrieval: the gold document's OWN stored head text was re-embedded and
used as the query, on a sample of 68 misses. **68 of 68 returned the gold
document at rank 1**, none worse than rank 5. The stored vector is
discriminative and unit-normed; it finds itself instantly. Whatever is failing
happens between the QUERY and that vector, not inside it.

### 1.3 `HEAD:4800` truncation — REAL BUT SECONDARY, and my first test asked the wrong question

**Correction to an earlier reading in this file.** I first measured whether the
gold DOCUMENT fits inside 4,800 characters and concluded truncation was not
involved at all. That test answers "was anything cut off", when the question that
decides a retrieval is "was THE THING THE QUERY IS MADE OF cut off". The exposure
table is still true and still shows no separation:

| family | n | gold document WHOLLY inside 4,800 chars | len p50 |
| --- | --- | --- | --- |
| worst misses (`exactRank > 200`) | 218 | 92 — **42.2%** | 5,960 |
| near misses (`exactRank` 21–200) | 62 | 37 — 59.7% | 3,620 |
| successes (`OK_TOP5`) | 65 | 32 — **49.2%** | 4,839 |

If truncation were the whole mechanism, successes would be systematically shorter
than misses. They are not — the successes are slightly MORE truncated than the
worst misses.

**The sharper test.** `semantic-query-audit.json` measured `QUERY_NOT_IN_GOLD =
0`: for all 571 rows the query text occurs VERBATIM inside the judgment it is
gold for. NEW3 says the same of the construction (bus 0940 — "query is a
substring of target"). So every query has an exact character offset inside its
own answer, and `head:offset` computes it (`head-offset.json`):

| the query's own words are… | n | s@5 | s@20 | exact rank ≤ 20 |
| --- | --- | --- | --- | --- |
| INSIDE the embedded 4,800 chars | 332 | **17.47%** | 24.70% | 28.61% |
| BEYOND them — never embedded | 198 | **9.60%** | 10.10% | 11.11% |

(21 rows have no offset: whitespace-normalised `strpos` found no match.)

So truncation **doubles** the failure rate and is worth fixing — and it accounts
for a few points of the headline, not for the headline. **Even when the query's
exact sentence IS inside the embedded window, the document is retrieved in the
top 5 only 17.5% of the time.** That residual is §2.4, and it is the real finding.

### 1.4 Not query length

`queryChars` p50: misses 197, successes 237. The distributions overlap almost
completely. Long queries are not the failing ones.

---

## 2. What it IS

### 2.1 The exact-rank distribution says the gap is enormous, not marginal

| exact cosine rank of the gold | queries |
| --- | --- |
| 1 | 58 |
| 2–5 | 34 |
| 6–20 | 29 |
| 21–200 | 79 |
| 201–2,000 | 90 |
| 2,000–20,000 | 119 |
| > 20,000 | 141 |

**260 of 550 in-index queries put the gold beyond rank 2,000** out of 256,998.
A ranking that is 2,000 places wrong is not a tuning problem. Distances make the
same point: a typical miss sits at 0.52–0.56 cosine distance while the winner
sits at 0.35 — the gold is not narrowly beaten, it is nowhere near.

### 2.2 Reading the actual misses shows why

Eight consecutive worst-family misses, inspected in full:

- `ISSUE-004` — *"Since the issues arising in all the three petitions are the
  same, therefore, all the three cases are being disposed of by a common
  order."* No legal question is named. Thousands of judgments contain this
  sentence.
- `ISSUE-001` — *"the impugned order suffers from violation of principles of
  natural justice and is liable to be aside"* — boilerplate, and damaged
  ("liable to be aside").
- `ISSUE-009` — *"whether the notification dated 08 1 I'201 'l and the ancillary
  notilication dated 10.1 1 .201 1 …"* — OCR wreckage.
- `ISSUE-016` — *"There is another issue. There is a delay in filing
  LA App.Nos.3/2009, 67/2009, 69/2009 …"* — docket numbers from one file.

Meanwhile the top-3 the index returned were topically correct every time:
natural-justice queries returned natural-justice cases; a last-seen-together
circumstantial-evidence query returned circumstantial-evidence cases from three
different High Courts and the Supreme Court.

**Correction — I had this backwards on first reading.** I wrote that these
sentences come from the CITING judgment. They do not: `QUERY_NOT_IN_GOLD = 0`
proves every one of them occurs inside the gold judgment itself. They are the
TARGET's own words, which makes the task easier than I said, not harder — and
makes the failure worse, not more excusable.

What survives from the reading is narrower and still true: several of these
sentences are boilerplate or damaged, so even as the target's own words they do
not distinguish the target from thousands of judgments containing the same
sentence. The measured labels are in §2.3, and they are a small minority.

### 2.4 The finding: document-level vectors cannot answer sentence-level queries

Put the two measurements side by side, on the SAME documents:

| the query is… | gold's rank |
| --- | --- |
| the document's whole embedded head text (4,800 chars) | **rank 1, 68 of 68 sampled** |
| ONE SENTENCE from inside that same embedded head text | top-5 **17.5%**, top-1 ~10% |

The vector is a single point for 4,800 characters of judgment. One sentence is a
few percent of that text and shares its generic legal register with hundreds of
thousands of other judgments, so the sentence's own vector lands in a crowded
neighbourhood the document's centroid is not the nearest member of.

**That is a granularity mismatch, not a quality problem, and it is not fixed by a
better model or a longer window.** It is the argument for indexing PASSAGES —
which is what production's `judgment_chunks` already does for the 40,161
judgments it covers.

### 2.3 The measured query-side labels

`semantic-query-audit.json` measures four properties per query, none assigned
speculatively (NEW1 addendum C): `QUERY_TEXT_DAMAGED` (odd-character density and
vowel-less token share), `QUERY_TOO_FACT_HEAVY` (docket/date/number token
share), `QUERY_NOT_IN_GOLD` (the query phrase does not occur in the judgment it
is gold for), `QUERY_IS_BOILERPLATE` (a bounded corpus-wide phrase count, capped
at 200, anything not measurable inside its budget recorded as UNMEASURED rather
than guessed).

Measured, 571 queries:

| label | n |
| --- | --- |
| `QUERY_LOOKS_ANSWERABLE` | 557 |
| `QUERY_TOO_FACT_HEAVY` | 6 |
| `QUERY_IS_BOILERPLATE` | 5 |
| `QUERY_TEXT_DAMAGED` | 3 |
| `QUERY_NOT_IN_GOLD` | **0** |

**The boilerplate figure is a FLOOR and must not be quoted as a rate.** The
corpus-wide phrase probe was attempted on 120 queries and completed on 41; the
other **79 exceeded their 20-second budget and are recorded UNMEASURED**, not
counted as answerable. So the visible query-side defects are small, and the
sample that could have shown them larger did not finish. What §2.4 establishes
does not depend on this split either way.

---

## 3. What this changes

1. **The 13–15% figure must not be used as a statement about LawMind's semantic
   search quality.** It is a statement about this gold, and the gold's
   construction has an upper bound built into it. `launch-gold.ts` already
   excluded `sem:proposition` for exactly this reason ("the TARGET JUDGMENT'S
   OWN WORDS, lifted verbatim … an upper-bound row"); the fact_passage class has
   the mirror-image defect and was not excluded.
2. **No new embedding model, and no re-embedding at a longer window, is
   justified by this evidence.** Both would be answers to hypotheses §1.2 and
   §1.3, which are refuted.
3. **The real open question is the one the gold cannot answer**: given a legal
   QUESTION an advocate actually types, does dense retrieval over document
   vectors return the authority they need? That needs ADVOCATE-100, which is
   NEW2's primary-source-bound artefact, and it is the reason P9 is not
   optional.
4. **A benchmark gate on this class should be re-stated as two numbers**, the
   same split P1 and P6 needed: queries that CAN identify an authority, and
   queries that cannot. Only the first is a retrieval measurement.

---

## 4. What is still worth doing to the representation (P3), and what is not

Targeted at the measured failure — query↔document asymmetry — rather than at the
refuted ones:

| candidate | targets | justified by this evidence? |
| --- | --- | --- |
| head + tail / multi-segment vectors | truncation | **partly — worth 8 points at most.** §1.3: inside-head 17.5% vs beyond-head 9.6%. Fixing truncation completely moves the beyond-head population up to the inside-head rate, no further |
| a different embedding model | representation | **no** — §1.2 shows the representation self-retrieves perfectly |
| `ef_search` / HNSW rebuild | index | **no** — 3.7% |
| **a passage-level index over the SAME documents** | **granularity — §2.4** | **the strongest candidate on this evidence.** A sentence query against a 4,800-char centroid retrieves its own document 17.5% of the time; production's `judgment_chunks` is already passage-level and does not have this problem, it has a coverage problem (40,161 judgments) |
| bounded rare-term lexical candidates fused with dense | asymmetry, and corpus coverage | **plausible** — this is P4, and it is the only arm that searches all 18.7M documents |
| reranking | ordering | **no, not yet** — a reranker cannot rescue a candidate set that does not contain the answer, and §2.1 says the answer is 2,000 places away |

---

## 5. Three dimensions

- **QUALITY**: s@5 13–15% on this gold, and the gold cannot support the
  inference that quality is 13–15%. Exact rank ≤ 20 for 121 of 550.
- **SAFETY/COVERAGE**: 20 of 571 gold authorities are not staged, 1 is
  `TEXT_UNSAFE` and correctly refused. The probe is 256,998 of a ~8.85M Tier-A
  population; production dense is 40,161 judgments, effectively Supreme Court
  only. **Nothing here is a High Court dense-search result.**
- **LATENCY**: ANN p50 715 ms (fact_passage) / 299 ms (nl_doctrine) at
  `ef_search = 200` on the 257k probe, LOCAL_CONTENDED. Exact sequential scan for
  the diagnostic ranks cost 0.7–5 s per query and is a diagnostic cost, not a
  product path.
