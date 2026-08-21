# Embedding Eligibility Contract — v1

**Owner: LCC.** Consumer: NEW1 (embedding + retrieval). Detectors: NEW2.
Defined by migration `0056_script_quality_and_embedding_tiers.sql`, view
`judgment_embedding_eligibility`.

Written 18 August 2026, against a corpus of **14,973,372 judgments** and
**619,636 `judgment_chunks`**.

---

## 0. The finding that reframes this whole document

**The 620,300 chunk plateau is not a broken pipeline. It is a founder decision,
and it is still recorded in the bus.**

Bus 0132–0135, 13 August 2026, broadcast to every lane:

> FUND CHUNK-TEXT COVERAGE NOW. START EMBEDDINGS ONLY once we hold all available
> data from all courts, ALL cases and citations are in, and the data is
> STRUCTURED and ready. Data is the priority. Embeddings come after.
>
> Nobody should start an embedding run, and **nobody should treat missing vectors
> as a defect — it is a deliberate ordering.**

Everything downstream of that decision behaved correctly:

| | | |
|---|---:|---|
| `judgments` | 14,973,372 | ingest ran, as instructed |
| `judgment_paragraphs` | 41,973,136 | built instead of vectors — migration 0049, deliberate |
| `judgment_chunks` | 619,636 | frozen, as instructed |

So "why has semantic coverage stayed at 620k" has a one-line answer: **because it
was told to.** The 18 August directive re-sequences that decision, and this
contract is what the re-sequencing needs in order to be safe. It is recorded here
rather than quietly overwritten, because the next agent to find a static number
will otherwise spend a session hunting a bug that does not exist.

The pipeline itself was checked, not assumed. `services/embed/src/cli.ts`
chunks and embeds, is resumable, is idempotent per judgment, and treats a unique
violation as success. It has two real defects, both in P4 below — neither is the
reason the number is static.

---

## 1. Why eligibility is four axes and never one flag

A document can be:

- safe to search but not precedent-grade;
- precedent-grade but of uncertain class;
- canonical but textually corrupt.

One boolean cannot say any of that. The moment it tries, *why* a document was
excluded stops being answerable — and every threshold argument afterwards is
conducted without evidence.

| Axis | Question | Column(s) |
|---|---|---|
| **A · identity** | do we know WHICH decision this is | `content_hash`, `case_number`, `judgment_date`, `court`, `case_title` |
| **B · text** | is the text we hold usable | `full_text`, `text_quality`, `script_quality` |
| **C · role** | a decision, or court admin | `hc_document_class`, `hc_class_method` |
| **D · value** | is there enough here for a vector to mean anything | `length(full_text)` → `value_band` |

### UNKNOWN is not BAD

NEW2 measured (bus 0714) that **51.2% of everything ever assessed for
`hc_document_class` could not be classified**, and 93.4% of the corpus has never
been assessed at all. A contract reading `hc_document_class IS NOT NULL` as the
gate would select from ~7% of the corpus and would wait forever for the rest.

So every axis treats NULL as *unknown, not disqualifying*. **Only a known-bad
verdict excludes.** `hc_class_method` is the column that distinguishes "looked at
and could not judge" from "never looked" — NEW2's point, and it is why the view
exposes it.

---

## 2. Measured population, 18 August 2026

`TABLESAMPLE SYSTEM (0.2)`, n = 30,177 and n = 31,640 (two draws).
Block-level sampling, so treat these as shares with roughly ±1pp of clustering
noise, not as exact counts.

### Axis pass rates

| Axis | Definition | Sample share |
|---|---|---:|
| A · identity | all five identity fields present | **100.0%** |
| B · text | `text_quality >= 0.85` and script not known-bad | 57.0% (with len ≥ 2000) |
| C · role | not `procedural_disposal`, not `reference_stub` | 98.3% |
| C · excluded | known court admin | 1.66% |
| — | `bail_order` | 2.08% |

**Axis A is 100%.** Identity is not the discriminator in this corpus; the axis
stays because the day an ingest lands rows without a case number, this is what
notices instead of the retriever.

### A ∧ B ∧ C, by value band

| Band | `text_length` | Sample share | Projected of 14,973,372 |
|---|---|---:|---:|
| `brief`+ | ≥ 1,000 | 79.8% | ~11.95M |
| `standard`+ | ≥ 2,000 | **56.7%** | **~8.49M** |
| `full`+ | ≥ 4,000 | **25.4%** | **~3.80M** |
| `substantial` | ≥ 8,000 | 9.4% | ~1.41M |

### Two things this does NOT yet include

**Duplicate collapse.** 36,310 ambiguous citation keys are ONE decision each,
byte-identical by `content_hash`, covering 104,930 judgments
(`docs/ai/AMBIGUOUS_CITATION_POPULATION.md`). A 0.5% sample measured only 0.55%
collapse, which is an artefact — duplicates spread across the corpus do not
co-occur in a small sample. The true corpus-wide figure needs a walk of
`judgments_content_hash_idx`, which is `DB_SCAN` class and is deferred to a
permitted window. **Projections above are therefore upper bounds.**

**Script quality.** `script_quality` is NULL for 100% of rows — the column is
new. Devanagari is present in only 0.43% of sampled documents and `language='hi'`
in 0, which is consistent with NEW2's finding that Poppler deletes the script
entirely rather than with a corpus that has no Hindi in it. Until NEW2's
detectors run, axis B is **passing documents it will later exclude**, and the
Tier A population will go DOWN, not up.

---

## 3. Tier A — the definition NEW1 can use now

```sql
SELECT id
FROM judgment_embedding_eligibility
WHERE axis_a_identity
  AND axis_b_text
  AND axis_c_role
  AND NOT is_bail_order
  AND value_band IN ('standard', 'full', 'substantial')   -- >= 2,000 chars
  AND id > $cursor
ORDER BY id
LIMIT $batch;
```

`TIER_A_CORE` is the same query with `value_band IN ('full','substantial')`
(≥ 4,000 chars). Both are offered because the choice between ~8.49M and ~3.80M
documents is a retrieval-quality decision, and that is NEW1's to make with a
measurement, not LCC's to settle in a `WHERE` clause.

`bail_order` is broken out rather than included or excluded: bail orders are
practically useful and are not precedent. Which tier they belong in is a
retrieval question.

### Why a view

- a **column** on `judgments` would be a 15M-row UPDATE — a scan plus a rewrite —
  and stale the moment a detector improved;
- a **materialised table** is a second truth that drifts from its definition;
- a **view is a macro**. `WHERE id > $cursor ORDER BY id LIMIT n` pushes straight
  into `judgments_pkey`, so a consumer walks it incrementally and nothing scans
  15M rows.

### Versioning

`CONTRACT_VERSION = 'v1'`. Every manifest records the version and a hash of the
selector text. A selector whose definition moved silently is a selector whose
measured precision means nothing.

---

## 4. The vector-count problem, which is the real constraint

NEW1 measured the existing index at **15.45 vectors per document** (bus 0697),
against CX1's scenarios which were priced at 1. That changes the decision
completely:

| | docs | at 1 vec/doc | at 15.45 vec/doc |
|---|---:|---:|---:|
| Tier A (≥2,000) | ~8.49M | 8.49M vectors | 131M vectors |
| Tier A core (≥4,000) | ~3.80M | 3.80M vectors | 58.7M vectors |

At CX1's measured 5,571 bytes/vector for halfvec, Tier A core at 15.45× is
**~305 GiB**. That is not an optimisation problem, it is a different product.

**So Tier A is a DOCUMENT-representation population: one vector per document.**
Paragraph-level and legal-object-level vectors are separate populations with
separate manifests, sized separately, and are not implied by Tier A membership.
`docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md` §5.

---

## 5. Three populations, not one

| Population | Unit | Sized from | Status |
|---|---|---|---|
| **DOCUMENT / authority** | 1 vector per judgment | Tier A above | defined, measurable now |
| **LEGAL OBJECT** | 1 vector per verified holding / issue / proposition | `document_enrichments`, verified only | needs P7 acceptance counts |
| **IMPORTANT PARAGRAPH** | 1 vector per selected paragraph | `judgment_paragraphs` (41,973,136 rows) | needs an importance signal; NOT every paragraph |

**Not every paragraph deserves a vector.** 41.97M paragraphs at 15.45× is not a
plan, and at 1× it is still 41.97M. The importance signal — citation density,
court-printed paragraph number, holding overlap — is unbuilt, and until it exists
this population has no manifest.

---

## 6. `script_quality` — the storage contract with NEW2

NEW2 owns the detectors and the populations. LCC owns the semantics and the
column. NEW2 asked for this in bus 0681 and correctly declined to write it alone.

```
script_quality        text NULL   CHECK (NULL OR one of the five below)
script_quality_method text NULL   HOW the verdict was reached
script_quality_at     timestamptz
```

| Value | Meaning |
|---|---|
| `clean` | text is what the court published, in whatever script |
| `devanagari_deleted` | Devanagari present at source, absent from our text — Poppler |
| `legacy_font_ascii` | valid ASCII bytes that are not words — Kruti Dev and relatives |
| `mixed_script_ok` | Latin and Devanagari both present, both plausible |
| `damaged_other` | assessed, damaged, none of the above names it |

Excluded from axis B: `devanagari_deleted`, `legacy_font_ascii`, `damaged_other`.
NULL passes.

### Why a separate column and not a number inside `text_quality`

`text_quality` scores Latin-token plausibility and catches exactly one of the
three known extraction failure modes:

1. missing/bad text layer — **caught**, the score collapses;
2. Poppler deleting Devanagari — **not caught**: what survives is clean Latin, so
   the score is HIGH on a document that is half gone (Rajasthan 95.3% defective);
3. legacy Kruti Dev fonts — **not caught, and worse**: the bytes are valid ASCII,
   so every character-class metric reads clean while the text is meaningless.

Modes 2 and 3 both produce a HIGH `text_quality` on a document that must not be
embedded. One scalar cannot mean both things.

### Process state is not a quality verdict

`ocr_candidate` and `ocr_repaired` describe where a document sits in a WORKFLOW.
They are **not** values of `script_quality` and must never be added to it: a
document queued for OCR and a document whose script was destroyed are the same
row to a scheduler and opposite rows to a retriever.

`script_quality_method` deliberately mirrors `hc_class_method` — the column that
let NEW2 separate "looked at and could not judge" from "never looked", and the
reason a selector can use it at all.

---

## 7. What is deferred, and why

| Deferred | Class | Blocked on |
|---|---|---|
| corpus-wide duplicate collapse by `content_hash` | `DB_SCAN` | resource gate; `scripts/resource-gate.mjs check DB_SCAN` |
| `document_duplicate_groups` materialisation (563 groups vs 104,930 affected judgments) | `DB_SCAN` | same — the CLI was one of the 39 tools that could not open the DB post-cutover |
| paragraph importance signal | design | citation density per paragraph, unbuilt |
| legal-object population size | P7 | acceptance rates by task |
| exact Tier A count | `DB_SCAN` | the numbers above are 0.2%-sample projections and say so |
