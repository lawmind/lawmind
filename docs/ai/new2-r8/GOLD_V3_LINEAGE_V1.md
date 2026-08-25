# GOLD_V3_LINEAGE_V1 — R8.1 §7.12

**Lane:** NEW2 · **25 August 2026**
**Verdict on Gold V2: `DEVELOPMENT_EVIDENCE_ONLY`. It cannot be the final hidden set.**
**Verdict on Gold V3: `HUMAN_ADVOCATE_INPUT_REQUIRED`.**

**Artifacts**
- `scripts/n2-gold-v2-audit.mts` — independent re-measurement, read-only
- `docs/ai/new2-r8/gold-v2-audit.json`

---

## 1. Three defects, independently reproduced rather than accepted

FIFTH reported these at bus 1256, 1258 and 1264. A report is a claim, so NEW2
re-derived each number from the Gold files and the live keyset. **All three
reproduce exactly.**

| FIFTH's claim | NEW2's measurement | agree |
| --- | --- | :---: |
| 90/480 queries exceed `/search`'s 500-char bound; long_narrative 43, pasted_passage 47, max 1,800 | 90/480 (18.75%); long_narrative 43, pasted_passage 47, max 1,800 | ✅ |
| exact_identity: 60 keys present, 29 unique, **31 with peers**, max 9 | 60/60 present, 29 unique, **31 ambiguous**, max 9 | ✅ |
| normalised query strings cross splits: train/dev 4, train/holdout 4, dev/holdout 1 | identical, 9 total, 0 crossing all three | ✅ |

### My own first pass reported 0 of 60, and the reason is worth keeping

Matching `target_neutral_citation` **raw** against `judgment_citation_keys.citation_key`
returns **zero rows**, which reads as "the entire exact_identity family is absent
from the index" — a far more alarming and completely false finding.

`citation_key` is not the printed citation. It is `citationLookupKey`
(`services/api/src/search/query-shape.ts:230`), which strips every
non-alphanumeric character: `2025:BHC-AUG:17486-DB` → `2025BHCAUG17486DB`. The
audit script now imports that function rather than restating it, so a drift in
the resolver's normaliser breaks this audit instead of silently changing its
answer.

**A wrong normaliser does not error. It returns a clean, confident zero.**

---

## 2. What NEW2 adds that the reports did not carry: the split breakdown

Both defects reach the **sealed holdout**, which decides whether V2's holdout can
be used at all.

| defect | train | dev | **holdout** |
| --- | ---: | ---: | ---: |
| exact_identity rows whose key is ambiguous | 26 | 3 | **2** |
| queries over the 500-char route bound | 52 | 17 | **21** |

**21 of the 86 holdout rows (24.4%) cannot enter `POST /search` at all.** A
one-shot final holdout in which a quarter of the rows cannot reach the route
being tested is not a holdout of that route. It is a holdout of a different
system.

Counts only. No membership, query text, target id or citation is recorded here
or in the JSON artifact.

---

## 3. Why Gold V2 cannot be the final hidden set — four independent reasons

1. **It is not secret.** The 86-row holdout lives in the shared repository at
   `docs/ai/new2-r7/advocate-gold-v2-HOLDOUT.json`. Every implementation lane
   can read it. Secrecy is not recoverable by deleting the file — it was
   readable while retrieval was being tuned.
2. **Nine query strings cross split boundaries.** Clustering was done on
   decision identity, which held (FIFTH found no overlap by target id, cluster,
   content hash, normalised neutral citation, court+case number, or title+date).
   Query lineage was never a clustering axis, and it should have been.
3. **`exact_identity` is not an exact-identity family.** 31 of 60 keys map to
   more than one judgment, up to 9. The family's premise — "unique in the key
   index" — is false today. `/search` correctly answers `ambiguous:true` for
   those, so scoring them as a rank-1 miss would penalise the server for
   behaving correctly.
4. **`supporting_authority` and `adverse_authority` are not semantic families.**
   Both were built from **citation text**, so each query is a citing judgment's
   own words about a case and the task is cited-case identity. An advocate
   asking "what supports this position" is a different question, and this Gold
   has never contained one. That caveat was NEW2's own from R7; FIFTH confirmed
   it independently.

---

## 4. What Gold V3 must be

| requirement | why it exists |
| --- | --- |
| **human/advocate-authored queries with provenance** | §7.12 forbids a model-written final Gold. A model asked to write an advocate's question writes the question the corpus can already answer. |
| **hidden — never committed to this repository** | see §3.1. Held outside the shared tree, membership known to FIFTH only. |
| **clustered on decision identity AND normalised query lineage** | V2 clustered on the first and leaked on the second. |
| **every query inside the route's own contract** | ≤500 chars for `POST /search`, or a preregistered long-query route with an explicit REFUSAL outcome scored separately. Silent clipping is forbidden by the route itself. |
| **`exact_identity` regenerated from a live, non-vacuous uniqueness predicate** | not from a stored assertion that was true when written. Uniqueness is a property of the index at scoring time. |
| **`exact_identity` split into `unique_exact` and `ambiguous_identity`** | `ambiguous:true` is the CORRECT answer for 31 of the current 60. Two behaviours, two families, two scores. |
| **supporting/adverse authored as a request, not derived from citation text** | otherwise the family measures citation lookup wearing a semantic label. |
| **families kept separate: short concept · doctrine · fact pattern · supporting/adverse · long facts** | R8.1 §6.5 requires per-family metrics before any aggregate. |

### The blocker, stated plainly

Requirements 1 and 7 cannot be met by this lane, by any lane, or by any model in
this repository. They need **practising Indian advocates writing the queries they
actually type**, with provenance recorded.

**`HUMAN_ADVOCATE_INPUT_REQUIRED`** — R8.1 §16 lists this as a known founder /
external item ("genuine human advocate semantic queries if Gold V3 lacks enough
authored material"). It is now measured rather than anticipated: **zero** of
Gold V2's 480 rows are human-authored.

---

## 5. What Gold V2 remains good for, stated so it is not thrown away

It is real evidence and it took real work. It stays usable as:

- **development and regression evidence** for NEW1's retrieval work, labelled as
  such and never as a release claim;
- the **`exact_identity` / `case_title_identity` / `statute` /
  `criminal_code_transition` families** where the target is an identity question
  the corpus can answer — after the ambiguity split in §4;
- a **direct passage-evaluator benchmark** for the 90 over-length rows, if and
  only if they are labelled as not-production-route;
- the **lineage** for V3: 430 live targets with verified DB identity, which V3
  can reuse as targets even though its queries must be newly authored.

Its splits are also genuinely disjoint on decision identity — FIFTH checked six
independent identity axes and found no overlap. That part held.

---

## 6. State

| item | state |
| --- | --- |
| FIFTH 1256 / 1258 / 1264 | **`PROVEN`** — all three reproduced exactly by an independent path |
| holdout secrecy | **`FAILED`** — stored in the shared repository |
| query-lineage clustering | **`FAILED`** — 9 strings cross splits |
| `exact_identity` uniqueness | **`FAILED`** — 31 of 60 keys ambiguous, 2 in the holdout |
| route compatibility | **`FAILED`** — 90/480, 21 of them in the holdout |
| identity-axis disjointness | **`PROVEN`** — six axes, no overlap |
| Gold V2 as final hidden set | **`REFUSED`** |
| Gold V2 as development evidence | **`PASS_AT_MEASURED_SCOPE`** |
| Gold V3 | **`HUMAN_ADVOCATE_INPUT_REQUIRED`** — founder/external, `docs/FOUNDER_QUEUE.md` |
