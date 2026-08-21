# WHAT THE PLAIN HIGH COURT VARIANT ACTUALLY CONTAINS — FIRST MEASUREMENT

**Owner: NEW2 (ingestion lane), Track D.** Measured 17 August 2026 during the
write freeze. No database connection: parquet metadata by range request, PDFs by
document fetch, text by the pipeline's own Poppler binary, classification by the
project's own `classifyHcDocument`.

Tool: `services/ingest/src/harvest/hc-class-sample-cli.ts`.
Artifact: `docs/ai/new2-silver-proof/hc-class-sample-20260817.json`.

---

## 1. WHY THIS WAS UNMEASURED UNTIL NOW

Every corpus figure carries "documents, not judgments", and the number usually
attached is the **0.75%–18.64%** judgment share from `docs/HC_ORDER_TYPES.json`.
That range comes from the `order_type` column, which exists **only on
`metadata-mobile.parquet`**: 1,291,519 rows, four courts, **6.3% of the corpus**.
`hc-ordertype-cli.ts` says in its own header that the result "must never be
quoted as a corpus-wide judgment count".

It is narrower than it looks. The plain and mobile files are **disjoint record
sets** — zero shared CNRs (that tool, 9 Aug), and zero shared `pdf_link` on two
partitions checked independently (17 Aug, `COVERAGE_FRONTIER_17AUG.md` §0a). A
rate measured on the mobile variant is not an estimate of the plain variant's
rate; it is a different population's rate.

**So the composition of 93.7% of the corpus had never been measured**, because
the plain files publish no type label at all and the answer needs the document's
text.

---

## 2. THE MEASUREMENT

**200 documents across 20 court-year cells** (2018, 2021, 2023, 2025 × five
courts each), plain variant only. **0 fetch failures, 0 documents without a text
layer, 0 rows missing `disposal_nature`.**

| class | n | share | mean chars |
| --- | --- | --- | --- |
| **unclassified** | **89** | **44.5%** | 8,204 |
| `decided` | 36 | 18.0% | 21,053 |
| `procedural_disposal` | 34 | 17.0% | 1,421 |
| `bail_order` | 25 | 12.5% | 6,047 |
| `decided_brief` | 11 | 5.5% | 981 |
| `reference_stub` | 5 | 2.5% | 436 |

**`decided` is 18.0%, and it is an upper bound on the authority share** — it
means a merits disposal with enough text to *contain* reasoning, not that
reasoning is present. `hc-classify.ts` refuses the legal question deliberately
and this inherits the refusal.

The mean-character column is the sanity check that the classes are real: 21,053
characters for `decided` against 436 for `reference_stub` and 981 for
`decided_brief` is a two-order-of-magnitude separation, and it falls out of
`disposal_nature` rules rather than being imposed by a length threshold.

---

## 3. THE 44.5% IS NOT A CLASSIFIER FAILURE — IT IS THE DESIGN, CONFIRMED AT SCALE

The residual looked alarming until it was broken down by rule, and then it
resolved into one thing:

| method | n |
| --- | --- |
| `unclassified_disposal:DISPOSED OFF` | 65 |
| `unclassified_disposal:DISPOSED OF` | 11 |
| `unclassified_disposal:CLOSED` | 10 |
| `unclassified_disposal:DISPOSED` | 3 |
| **all other unclassified** | **0** |

**Every one of the 89 is the `DISPOSED*` / `CLOSED` family.** No other disposal
value fell through — the vocabulary is otherwise complete against this sample.

`hc-classify.ts` states exactly this as a deliberate choice:

> *"`DISPOSED`, `DISPOSED OFF`, `DISPOSED OF`, `DISPOSED OF NO COSTS`, `CLOSED`,
> `ORDERED` … stay unclassified — ~1.5M rows … those words cover a reasoned
> decision, a consent order and an infructuous closure alike, and no amount of
> vocabulary work makes the source say which. **That residue is the population a
> model may look at, and the only one.**"*

**This measurement is independent confirmation of that design at bucket scale**,
and it is not a small confirmation. Adding a rule that guessed `DISPOSED OFF`
into `decided` would have moved 32.5% of the sample into the authority class on
a word that does not carry that meaning. The refusal is load-bearing.

### But it resizes the model-eligible population, upward and a lot

The `~1.5M rows` figure in that header is measured against **production rows**.
Against the **bucket**, the same residue is **44.5%** of the plain variant.
Plain holds 19,237,684 documents, so the model-eligible population is on the
order of **8–9 million documents**, not 1.5 million.

That is a routing and cost fact, not a classification fact, and it belongs to
whoever budgets the DeepSeek pass. **It is indicative, not a corpus rate** — 20
cells chosen for spread is not a random draw — but the direction is not in
doubt: the residue is several times larger than the production figure implies.

---

## 4. WHAT THIS DOES NOT ESTABLISH

- **It does not supersede `docs/HC_ORDER_TYPES.json`.** That measures the
  disjoint mobile variant. These are two populations, not two estimates of one,
  and neither number should be quoted as the other's.
- **`decided` ≠ authority.** Upper bound, and the classifier says so.
- **200 documents is a sample.** Court-year cells were chosen for spread rather
  than drawn at random. This replaces "unmeasured" with "measured on 200
  documents", which is a real improvement and not a corpus rate.
- **One extractor.** Text came from Poppler. A document whose text layer is
  malformed rather than absent would classify on corrupted text; the 0-scan
  result says none in this sample were empty, not that all were clean.
  `text-corruption.ts` is the detector for that and was not run here.
