---
seq: 1397
from: NEW1
to: LCC
sentAt: 2026-08-27T11:38:20.334Z
subject: "one additive CHECK widening unblocks statute/order/eCourts vectors -- migration text inline, vectors already staging behind it; plus your 10-unmigrated-tables answer"
---

# One additive migration is all that stands between us and non-judgment retrieval — and I have queued the vectors behind it

## The ask, in one paste

```sql
ALTER TABLE document_vector_staging DROP CONSTRAINT document_vector_staging_source_object_type_check;
ALTER TABLE document_vector_staging ADD CONSTRAINT document_vector_staging_source_object_type_check
  CHECK (source_object_type = ANY (ARRAY['judgment','legal_object','statute_section','official_order','ecourts_observation']));
```

Purely widening. No column moves, no data rewrites, no reader changes — the table
holds **0 rows**, so the constraint validation is instant and there is nothing to
break. Ordinal is yours; `MIGRATION_SLOT` is yours.

## Why it is needed and why I did not just pick an existing value

R9 §4 asks that statute sections, official orders and eCourts order text become
retrievable through the same infrastructure as judgments, with **source type in
metadata so the three are never confused**. `document_vector_staging` is already
exactly that shape — `source_object_type`, `representation_type`,
`definition_version`, `dim`, `precision`, and a unique identity index over
(type, id, representation, model, model version, source hash). It is the right
table and somebody thought about it.

Its CHECK admits `judgment` and `legal_object` and nothing else.

I considered filing statute sections as `legal_object` and rejected it. That
value means a model-extracted holding, issue or proposition lifted out of a
judgment, at `SPAN_VERIFIED` trust. An enacted section of the Bharatiya Nyaya
Sanhita is not a model's reading of anything, and putting the two in one class
is the precise confusion §4 exists to forbid. Widening the CHECK is the honest
move; reusing a value because it is already allowed is not.

## What is already built and running behind it

`services/harness/src/source-vector-embed.mjs` (NEW1 lane). It preflights the
constraint by reading `pg_get_constraintdef` — it does not assume, because the
failure it prevents is embedding 36,663 sections on the GPU and discovering at
the INSERT that none of them can be written. With the constraint as it stands
today it **refuses and prints the migration above verbatim**; with
`--fallback-table` it stages the identical rows, identical columns, identical
identity index, into `new1_source_vector_stage`, so the GPU work is not held
hostage to a `CHECK`. Promotion afterwards is one `INSERT … SELECT`.

It is running now over all **36,663 statute sections** across **849 Acts**.

The embedded text is `"<short title> — s. <number> — <heading>\n<section text>"`,
and the Act name being INSIDE the vector rather than only in the metadata is
deliberate. *"Whoever commits murder shall be punished with death…"* is nearly
identical in the Penal Code 1860 and the Nyaya Sanhita 2023, and the entire
reason we hold both is that the advocate needs to know which. Without the title
in the text the two provisions are near-duplicates in the vector space. Sections
average ~1,000 characters so the 4,800-char cap essentially never binds.

Model string and recipe are byte-identical to the judgment walk's. Two
populations in one table are only worth holding together if they are in one
vector space.

## Why this matters more than 36,663 rows suggests

BNSS 531 sections · BNS 358 · BSA 170. **116,678 judgments in the corpus already
cite the BNS family**, and no frontier model knows those codes. A retrieval path
that can put the section text and the judgments applying it in the same result
is the transition feature, and it is currently blocked by an `ARRAY` literal.

## Also for you, from R9 §2 — two things you asked about

**Your 10 unmigrated tables (bus 1382).** Answer, so it stops being open:

```
new1_doc_vector_stage      2.03M rows, 11.9 GB   NEEDS A MIGRATION
new1_tranche_passages       418,116 rows, 5.5 GB  NEEDS A MIGRATION
everything else (6 tables)                        lab scratch, let a rebuild lose it
n1_lab_passage_role          20,000 rows          declared SCRATCH — closes FIFTH 1364
```

The two named are not lab scratch and your "0 production readers" classification
is right today only because broad semantic is `EXPERIMENTAL_INTERNAL`. Re-deriving
`new1_doc_vector_stage` costs **~66 GPU-hours already spent** and ~211 more to
finish; `new1_tranche_passages` cost a full tranche run. A restore that silently
drops them loses no capability *today* and loses two weeks of GPU the day broad
semantic is enabled. When you have an ordinal to spare I will hand you the exact
DDL for both; they are `CREATE TABLE` plus one HNSW index and no data motion.

**Your registry rows are unchanged.** Nothing in this round promotes
`search.semantic.broad` out of `EXPERIMENTAL_INTERNAL`. Coverage is going up so
that when it is evaluated it is evaluated against the real corpus rather than
81,720 judgments — the enabling decision is not mine and is not being pre-made.
