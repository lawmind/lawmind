# The search stack, by actual coverage — and the number that should be quoted first

**NEW1, R9, 27 August 2026.** Measured, not remembered. Every figure below comes
from a query run this session against the live database.

---

## 1. The four layers, and how much of the corpus each one can actually see

The round asks for a simple stack: exact identifier → structured/lexical → coarse
semantic when available → passage semantic on a high-value subset. Here is what
each layer reaches today.

| layer | mechanism | documents reachable | share of 18,749,962 |
| --- | --- | ---: | ---: |
| **exact identifier** | `content_hash`, `cnr`, `case_number`, `source_url`, normalised `case_title` and `neutral_citation` keys — six indexes, all maintained on write | **18,749,962** | **100%** |
| **structured / lexical** | `full_text_tsv`, a `GENERATED ALWAYS` tsvector with a GIN index; plus `court`, `judgment_date`, `case_type`, `hc_document_class`, `overruled_status` btrees | **18,749,962** | **100%** |
| **coarse semantic** | `new1_doc_vector_stage`, one HEAD:4800 vector per document | 2,031,802 stored — **0 searchable** | **0%** |
| **passage semantic** | `new1_tranche_passages`, HNSW-indexed | 81,720 stored — **0 wired** | **0%** |
| *what production dense actually queries today* | `judgment_chunks`, HNSW | **40,161** | **0.214%** |

### The number to quote first

**Semantic search in production today searches 40,161 judgments.** Not 8.85
million, not 2.03 million, not 81,720 — forty thousand, which is **0.214% of the
corpus** and **0.45% of the eligible population**. Everything else in this
document is downstream of that one fact.

That is exactly why the round is a coverage job. It is also why
`search.semantic.broad` being `EXPERIMENTAL_INTERNAL` in LCC's capability
registry is the right setting: broad semantic search over 0.2% of the corpus
would be judged on a sample nobody chose.

---

## 2. Two things exist and are not connected to anything

### `new1_doc_vector_stage` — 2,031,802 coarse vectors, no vector index

```
new1_doc_vector_stage_pkey   111 MB   btree (judgment_id)
                             ← and that is the complete index list
```

Eleven point nine gigabytes of `vector(1024)`, and the only way to run a
similarity query against it is a sequential scan of all of it. **The vectors are
stored. They are not searchable.** A coverage job that ends here delivers reach
on paper and none in practice.

**The vectors are correct**, which was worth establishing before spending nine
more days producing them. Twenty rows drawn with `TABLESAMPLE SYSTEM` across the
whole table, re-embedded from `judgments.full_text` through the same sidecar:

```
cosine(stored, re-embedded same HEAD)    min 1.000000   p50 1.000000   max 1.000000
below 0.99                               0 of 20
recipe on every sampled row              HEAD:4800
```

`TABLESAMPLE` and not `ORDER BY judgment_id LIMIT 20`: the older sanity check took
the eight lowest uuids every time, all from batch 0, and would have passed
unchanged while every later batch wrote rubbish.

**The index is deliberately NOT built this round, and that is an engineering
call rather than an omission.** HNSW insert cost is paid per row. Building the
index now and letting the walk insert into it would slow the remaining 6.55M
documents materially, for a searchable index over 23% of the population. The
right sequence is: finish the walk, then build once over the complete set.

Priced from `judgment_chunks`' measured 7,806 B/vector:

```
fp32     8,854,281 × 7,806 B  =  69.1 GB
halfvec  expression index on (embedding::halfvec(1024))  ≈  35 GB
```

Recommendation: **halfvec expression index**. It halves the index with no second
column and no data migration, and the fp32 column stays authoritative — fp32
casts down to halfvec, halfvec does not cast back up. Budgeted at 35 GB in
`PASSAGE_TRANCHE_2_DESIGN.md` §2.

### `new1_tranche_passages` — 418,116 passages, HNSW-indexed, unread

Production dense retrieval (`services/api/src/search/retrieve.ts`) queries
`judgment_chunks` and nothing else. The tranche overlaps it by **10,007
documents**, so wiring the tranche in would take dense coverage from 40,161 to
**111,874 documents** — a **2.79×** improvement available with no new GPU work at
all.

That is a *retrieval* change inside `search/retrieve.ts`, which is LCC's file, and
it changes what an advocate sees. It is raised here as a costed option, not made.

---

## 3. Non-judgment primary text (§4)

The requirement is that statute sections, official orders and eCourts order text
become retrievable through the same infrastructure, **with source type in
metadata so the three are never confused.**

### The table for it already exists and is empty

`document_vector_staging` carries `source_object_type`, `representation_type`,
`definition_version`, `dim`, `precision`, `embedding_fp32`, `embedding_halfvec`,
and a unique identity index over `(source_object_type, source_object_id,
representation_type, embedding_model, embedding_model_version, source_hash)`.
It holds **0 rows**. That reads as dead and is not — it is the right shape,
migrated in advance, and nobody has had a non-judgment population to put in it
until the statute corpus landed.

### One `CHECK` blocks it

```sql
document_vector_staging_source_object_type_check
  CHECK (source_object_type = ANY (ARRAY['judgment', 'legal_object']))
```

A statute section is neither. Filing it as `legal_object` — which means a
model-extracted holding, issue or proposition lifted out of a judgment at
`SPAN_VERIFIED` trust — would put an enacted provision and a model's reading of a
judgment in one class. That is the precise confusion §4 forbids, so the value was
not reused. The widening is one additive statement, sent to LCC as bus 1397 with
the SQL inline; the table is empty, so validation is instant and there is nothing
to break.

### The work ran anyway

`services/harness/src/source-vector-embed.mjs` (NEW1 lane) reads
`pg_get_constraintdef` before it embeds anything — the failure it prevents is
spending the GPU on 36,663 sections and discovering at the `INSERT` that none of
them can be written. Without the constraint it **refuses and prints the
migration verbatim**. With `--fallback-table` it stages identical rows, identical
columns and an identical identity index into `new1_source_vector_stage`, which one
`INSERT … SELECT` promotes once the CHECK is widened.

```
statute sections          36,663  across 849 Acts
embedded text             "<short title> — s. <number> — <heading>\n<section text>"
recipe / model            HEAD:4800, byte-identical to the judgment walk's
```

The Act name is **inside the vector**, not only in the metadata, and that is the
one non-obvious decision in the file. *"Whoever commits murder shall be punished
with death…"* is nearly identical in the Penal Code 1860 and the Bharatiya Nyaya
Sanhita 2023, and the entire reason we hold both is that the advocate needs to
know which. Without the title in the text the two provisions are near-duplicates
in the vector space. Sections average ~1,000 characters, so the 4,800-character
cap essentially never binds and the vector covers the whole provision.

### Why 36,663 rows matter more than the count suggests

```
Bharatiya Nagarik Suraksha Sanhita, 2023   531 sections
Bharatiya Nyaya Sanhita, 2023              358 sections
Bharatiya Sakshya Adhiniyam, 2023          170 sections
judgments already citing the BNS family    116,678
```

No frontier model knows these codes. Retrieval is the only path to them, and a
result set that can put the section text beside the judgments applying it is the
transition feature — currently blocked by an `ARRAY` literal.

### eCourts and official orders

`ecourts_observation` exists with a full schema and holds **0 rows** — the
adapter has never run, so there is no lag to measure and nothing to index. Adding
it to `source-vector-embed.mjs` is one entry in the `SOURCES` table when NEW2
delivers text; the write path, the identity and the refusal are already
kind-agnostic.

---

## 4. Incremental handoff (§8) — no global census per delta

The pipeline NEW2's deltas will use:

1. **Incremental queue.** New judgment ids arrive (a delta list from NEW2, or
   derived from `created_at`), get manifested into a small batch file, and go
   through the same `doc-vector-embed.mjs`. No census involved.
2. **Occasional full reconciliation.** `tier-census --reset` +
   `doc-vector-batches --reset` + a coverage census, when either the corpus has
   grown materially or the eligibility definition hash has moved. Both conditions
   are true today, which is why the full reconciliation is queued this round.

The guard that makes this safe already exists and fired correctly this session:
`doc-vector-batches` compares `embedding_census_progress.definition_hash` against
`pg_get_viewdef` of the live view and **refuses** to manifest a population built
under a different contract. It refuses right now — census `e76879ab6bbcd452`,
deployed `5b5d02384b46c96c` — which is the system working, not a fault.

**Ask to NEW2 (bus 1391): send the new-row ids as a delta list.** Deriving them
from `created_at` works today only because their walk was the only thing that
wrote today. That is a property of the afternoon, not of the pipeline.
