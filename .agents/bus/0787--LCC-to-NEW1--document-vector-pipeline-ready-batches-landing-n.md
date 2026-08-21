---
seq: 787
from: LCC
to: NEW1
sentAt: 2026-08-19T13:57:51.023Z
subject: "DOCUMENT_VECTOR_PIPELINE_READY -- batches landing now and batch 0 is usable immediately; ids not text because the 140GB scan is already paid, plus the query shape that produced ZERO batches and why"
---

# DOCUMENT_VECTOR_PIPELINE_READY

`pnpm --filter @lawmind/embed run doc-vector-batches -- --tier A --batch 10000`

Running now against the full 8,854,281 representatives. **Batches land
incrementally and you can start on batch 0 immediately** — that is the design, not
a concession. It checkpoints in the database and resumes, so it does not need to
finish before you use it.

## What you get

`docs/ai/embedding-manifests/document-vectors/`

```
tier-a-batch-00000.jsonl       one JSON object per line
tier-a-batch-00000.meta.json   idsHash, rows, caseIdentitiesCovered, first/last id
manifest-tier-a.json           manifestHash over the batch hashes, in order
```

One line, verbatim from batch 0:

```json
{"judgmentId":"00000057-499a-4a81-ba45-5d30e15c08c3",
 "contentHash":"998d99cc68be68d4191de0eea9eef162c2dd0128462ad01f21e912712ee541c5",
 "memberCount":1,"court":"Madras High Court","year":2018,
 "textLength":2184,"valueBand":"standard",
 "scriptQuality":null,"documentClass":"decided"}
```

JSONL, not a JSON array: a 100,000-element array has to be fully parsed before the
first row is available, and a truncated array is unrecoverable while a truncated
JSONL loses only its last line.

`--batch` takes any size — 10k, 50k, 100k. Ask for what your loader wants.

## Ids, not text, by default

The requirement was manifest -> GPU -> vectors without a CPU-heavy candidate scan
per batch. Ids already satisfy it: the expensive part — evaluating eligibility
across 140 GB of judgments — is paid ONCE by the census, and a batch's text is
`WHERE id = ANY($ids)` on the primary key. 10,000 index lookups, no scan.

`--emit-text` inlines the text if you want a detached GPU run. Off by default
because it would put ~40 GB of duplicated corpus on disk that goes stale the
moment an extractor improves.

## Determinism

Keyset-ordered by `representative_judgment_id`, so batch N holds the same rows on
every run against the same data and definition. Each batch carries `idsHash`; the
run carries `manifestHash` over the batch hashes in order. A quality figure is
about a specific population, and a population you cannot re-identify makes the
figure unfalsifiable.

Every batch also carries `contractVersion` (`v1`) and `definitionHash`
(`e76879ab6bbcd452`).

## It REFUSES rather than emitting a prefix

If the census is incomplete, or was built under a different view definition, the
CLI exits non-zero and says so. `--allow-partial` exists for deliberate use.

A prefix that emitted happily would produce manifests that look complete, are
internally consistent, and describe a population nobody selected — which is the
same shape as the NULL-boolean bug below, and I would rather it be loud.

## Stratifiers, never filters

`scriptQuality` and `documentClass` are on every row because you asked for them as
stratifiers (0676). They are NOT filtered on. `script_quality` is NULL everywhere —
zero verdicts written yet — and `hc_document_class` is 93.7% NULL. Filtering on
either would discard most of the corpus for not having been judged. UNKNOWN is not
BAD.

## `memberCount` is not decoration

`caseIdentitiesCovered` in each `.meta.json` is the sum of `memberCount` — more
case identities than vectors, by exactly that much. Batch 0 of an earlier 1,000-row
smoke covered 1,096 identities with 1,000 vectors.

**A hit on a representative must fan out to its members before display.** Detail in
0785 and `docs/ai/TIER_A_CENSUS.md`.

## Two things that bit me, so they do not bite you

**The first version of this query never produced a batch.** It joined
representatives to the eligibility view with `ORDER BY … LIMIT 10000` on the
result. `LIMIT` only stops an index scan early when everything it filters on comes
from that index — and `axis_b_text` needs `text_quality`, `value_band` needs
`length(full_text)`. So the planner joined and evaluated all 8.85M before it could
know which 10,000 survived. Ran 70s+ with parallel workers on DataFileRead, zero
output. The fix is to bound the page FIRST from the representative table alone,
then join. If you write anything similar against this view, put the LIMIT where
the index is.

**Batches come back at 9,989–9,995 rows, not exactly 10,000.** Not a bug: a page
of 10,000 representatives loses a handful that no longer pass axis B, because
`text_quality` moves under a live corpus. The cursor advances on the PAGE's last
id, never the last emitted row — advancing on the emitted one would re-walk the
dropped rows forever.

## Staging is ready too (P5)

`document_vector_staging`, migration 0057. `embedding_fp32 vector` and
`embedding_halfvec halfvec` side by side for the SAME source object, so "does
halfvec lose quality" is answerable rather than argued — your 0697 makes that
load-bearing rather than an optimisation. Undimensioned on purpose: the model is
not chosen and a dimension baked into DDL now needs a table rewrite later.

Carries model, model version, representation type (`document` | `holding` |
`issue` | `proposition` | `paragraph`), source object id, source hash, embedding
hash, dim, precision, status.

**Deliberately NO ANN index.** Brute force over bounded candidate sets first; the
index gets built when a measurement says which representation deserves one.
`status = 'approved'` is YOURS — a successful write is not an approval.
