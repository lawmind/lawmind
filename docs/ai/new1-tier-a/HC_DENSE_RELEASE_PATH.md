# HC DENSE — THE PROMOTION PATH FROM STAGING TO PRODUCTION

NEW1, 22 Aug 2026. P8. Design only; nothing here is built and nothing here is
approved. The one sentence this exists to enforce:

> **Production must never query the mutable staging table, and finishing the
> embeddings does not enable HC dense search.**

---

## 1. Where the vectors are now, and why that is not a search index

`new1_doc_vector_stage` is a WORKING table. It is written to continuously by the
Tier-A walk, rows are moved out of it when NEW2's verdicts change
(`new1_doc_vector_stage_refused` holds 72,092 such withdrawals), and its contents
are correct only relative to the eligibility view's definition AT THE MOMENT each
row was written — a definition that has already moved three times
(`e76879ab6bbcd452` → `5efa4c8decef699e` → `6e87c83ac05da264` → `2e7b53afe35fa81c`).

A table with those properties can be probed. It cannot be the thing a request
hits, for three independent reasons:

1. **Correctness.** A judgment whose `text_safety` flips to `UNSAFE_VERIFIED`
   must stop being semantic evidence immediately. In staging that is a DELETE
   racing a SELECT.
2. **Stability.** An HNSW index on a table under constant insert is being rebuilt
   under the query it is serving.
3. **Accountability.** "Which vectors did production answer from on 3 September"
   has no answer if the table is mutable.

---

## 2. The path

```
new1_doc_vector_stage            mutable, continuously written, never queried by product
        │
        │  ACCOUNTING GATE      every eligible representative STAGED / REFUSED /
        │                       QUARANTINED / INELIGIBLE / MISSING, MISSING = 0
        │  QUALITY GATE         §3
        ▼
judgment_document_vectors_rNN    IMMUTABLE release table, one per release
        │                       + release_id, built_at, eligibility_view_hash,
        │                       recipe ('HEAD:4800'), row count, checksum
        │
        │  halfvec cast + HNSW build, measured (P7), on the release table only
        ▼
judgment_document_vectors        VIEW pointing at the current release
        │                       promotion = one ALTER VIEW, rollback = the same
        ▼
retrieve.ts dense arm           reads the VIEW, never a table name
```

Two properties this shape buys, cheaply:

- **Promotion and rollback are the same operation.** No copy, no reindex, no
  window where the product has half a corpus.
- **The release is auditable.** `eligibility_view_hash` recorded on the release
  row answers "under which contract was this vector admitted" without archaeology.

Naming and DDL are LCC's to decide — `docs/SCHEMA_TRUTH.md` is the authority and
this document does not add a shape to it.

---

## 3. The five gates, each with its measurement and its current state

| gate | question | measured by | state today |
| --- | --- | --- | --- |
| **G1 representation quality** | does a vector of this recipe retrieve the right authority for a question an advocate actually asks | ADVOCATE-100 (P9), NOT the current semantic gold — see `DENSE_FAILURE_ANALYSIS.md` §3 | **BLOCKED** on NEW2's artefact |
| **G2 gold retrieval gain** | does adding HC document vectors improve retrieval over production as it stands | paired arms, production route vs production + release, same gold | **NOT RUN** |
| **G3 halfvec scale proof** | do heap, index, build time, peak RAM, temp disk, WAL and ANN latency behave at 1M and extrapolate honestly to 8.85M | P7 checkpoint measurement | **NOT RUN** — and it must not stop the walk to run |
| **G4 body-text safety** | is every vector in the release derived from text the corpus currently calls safe | re-checked at promotion against the live view, not at embed time | mechanism exists (the walk refuses `UNSAFE_VERIFIED`); the RE-CHECK at promotion does not |
| **G5 staging mixed-load** | can the release table be queried at product latency while the walk keeps writing the staging table | measured on this box, LOCAL_CONTENDED and LOCAL_QUIET separately | **NOT RUN** |

**G4 deserves its own sentence.** The walk refuses unsafe text at embed time, but
verdicts arrive after embedding — 72,092 rows have already been withdrawn. So the
promotion step must re-ask the question for every row it promotes, at promotion
time. A release built from "it was safe when we embedded it" is a release that
can carry known-damaged text into generative evidence, which §6 of the project
CLAUDE.md forbids outright.

---

## 4. What "done" is NOT

- Not "the walk reached 100%". Coverage is not quality, and the walk's own goal
  is ACCOUNTED FOR, not staged.
- Not "the index built". G3 is about whether it can be built at 8.85M on this
  hardware without starving the writers, which is a different question from
  whether 1M built once.
- Not "s@5 improved on the current semantic gold". That gold cannot support the
  inference (`DENSE_FAILURE_ANALYSIS.md`).
- Not a launch claim. Per the release-gate classes, HC dense is a **FEATURE**
  gate: failing it blocks the HC-dense surface, and the surface must then be
  honestly hidden rather than shipped thin. It does not block a core research
  release.

---

## 5. Sequence, and what would make me recommend starting

1. Accounting gate green (`stage:accounting`, MISSING = 0) — cheap, ready now.
2. G3 at the 1M checkpoint, in a quiet window, or DEFERRED with the reason
   recorded. Never extrapolate 8.85M without it.
3. G2 paired arms, because it is the only gate that can say the release is worth
   promoting at all.
4. G1 on ADVOCATE-100 when it exists.
5. G4 re-check written into the promotion step itself, not into a runbook.
6. G5 last, because it is the only one that needs the release table to exist.

Nothing above requires a cloud service, a rented GPU, or a paid tier. All of it
is local.
