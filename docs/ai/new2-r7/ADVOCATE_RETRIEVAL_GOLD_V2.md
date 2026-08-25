# ADVOCATE_RETRIEVAL_GOLD_V2

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Holdout owner:** **FIFTH**
**Builder:** `scripts/n2-advocate-gold-v2.mjs` · **Manifest:** `ADVOCATE_RETRIEVAL_GOLD_V2.manifest.json`

| file | who may read it |
| --- | --- |
| `advocate-gold-v2-train.json` — 304 queries | implementation lanes (NEW1, LCC) |
| `advocate-gold-v2-dev.json` — 90 queries | implementation lanes |
| **`advocate-gold-v2-HOLDOUT.json` — 86 queries** | **FIFTH only. NEW1 and LCC must not read it.** |

**480 queries across 8 families**, every target bound to a judgment that exists
in this corpus.

---

## 1. The rules, and why each one is there

**Primary-source-bound.** Every query derives from the target judgment's own text
or its own structured metadata — its neutral citation, its case title, a verbatim
paragraph, a statute reference extracted from its text, or a citation edge
another judgment made to it. **No model description of a case, and no reporter
headnote.** `docs/DATASETS.md`: primary sources only.

**No query property the server cannot compute.** A previous gold set was found to
route on the `case_type` of the *citing* judgment — a field production has no
access to at query time, so the benchmark measured a path the product cannot
take. Nothing here uses such a field.

**The unavailable-target rule is preserved.** A target that cannot be retrieved
today — no vector, no chunks, damaged body — **stays in the set and counts as an
end-to-end miss.** Removing it would measure the retriever against a corpus it
wishes it had. This is why the retrievability columns below are *reported* and
never used to filter.

**Split by cluster, not by row.** The split key is the **target judgment id**, so
every query about one authority lands in one split. Splitting by row would put a
doctrine query in train and its own pasted-passage sibling in the holdout, and
the holdout would be measuring memorisation. 60 / 20 / 20, deterministic on
`md5(target_id)`.

---

## 2. Coverage by family

| family | total | train | dev | holdout | what the query is |
| --- | ---: | ---: | ---: | ---: | --- |
| `exact_identity` | 60 | 46 | 8 | 6 | the judgment's own neutral citation, unique in the key index |
| `case_title_identity` | 60 | 34 | 15 | 11 | the judgment's own case title, verbatim |
| `statute` | 60 | 36 | 7 | 17 | a provision the judgment itself cites |
| `pasted_passage` | 60 | 36 | 13 | 11 | a verbatim paragraph of the target |
| `long_narrative` | 60 | 35 | 12 | 13 | the target's own opening narrative, up to 1,800 chars |
| `supporting_authority` | 60 | 46 | 4 | 10 | an authority the citing judgment **followed** |
| `adverse_authority` | 60 | 41 | 9 | 10 | an authority **distinguished / doubted / overruled** |
| `criminal_code_transition` | 60 | 30 | 22 | 8 | an IPC/CrPC/IEA or BNS/BNSS/BSA provision |
| **total** | **480** | **304** | **90** | **86** | |

The split ratios are uneven per family because the split key is the target and
targets cluster — which is the point. A family whose targets happen to share
clusters lands unevenly, and forcing it even would break the cluster rule.

### R7's required task families

| required | covered by |
| --- | --- |
| exact identity | `exact_identity`, `case_title_identity` |
| statute | `statute`, `criminal_code_transition` |
| pasted passage | `pasted_passage` |
| long narrative | `long_narrative` |
| supporting authority | `supporting_authority` |
| adverse authority | `adverse_authority` |
| old/new criminal-law transition | `criminal_code_transition` |
| **doctrine** | **NOT COVERED — see §4** |
| **common concept** | **NOT COVERED — see §4** |
| **fact pattern** | **NOT COVERED — see §4** |

---

## 3. What the set says about the corpus before anyone runs a retriever

| | total | train | dev |
| --- | ---: | ---: | ---: |
| queries | 480 | 304 | 90 |
| **target retrievable today** (has a vector or chunks) | **308 (64.2%)** | 200 (65.8%) | 49 (54.4%) |
| target body-safe | 462 (96.3%) | 296 | 84 |

**35.8% of the targets cannot be retrieved by any semantic path today.** Under
the unavailable-target rule those are end-to-end misses before a retriever has
been asked anything, so **an end-to-end score above ~64% is not achievable on
this set until corpus coverage moves** — and that is the honest ceiling, not a
flaw in the benchmark.

---

## 4. Three required families are NOT covered, and I will not fake them

R7 asks for measurable coverage of **doctrine**, **common concept** and **fact
pattern**. Those are queries an advocate writes in their own words —
*"anticipatory bail in economic offences"*, *"when is a dying declaration
sufficient without corroboration"*. They cannot be derived from a judgment's own
text without one of two things this set forbids:

- **a model writing the query from the judgment** — that is a model's commentary
  about law standing in for an advocate, and `docs/DATASETS.md` forbids training
  or evaluating on it;
- **a human advocate writing them** — which is the correct source and is not
  something this lane can produce.

Two existing artifacts hold material that could seed these families and both need
adjudication against the rules above before they are folded in:
`docs/ai/new3-semantic-expansion-gold-v2.json` (687 items) and
`docs/ai/new2/advocate100-authored.json`.

**Recorded as `NOT_COVERED` rather than filled with generated queries.** A
benchmark that measures doctrine retrieval against a model's paraphrase of a
judgment measures paraphrase similarity, and would read as a pass.

This is also where NEW3's finding bites hardest: `"anticipatory bail"` returns
`results: []` in 4 ms with `degraded: ["sparse_unbounded"]`, because `bail` is in
25.77% of the corpus and dense reach is 0.21%. **The families we cannot build are
exactly the families that currently fail**, and that coincidence should not be
allowed to look like coverage.

---

## 5. For FIFTH

- `advocate-gold-v2-HOLDOUT.json` is yours. 86 queries, same eight families, same
  rules, cluster-disjoint from train and dev by construction.
- The builder is deterministic: same corpus, same seeds, same set. If you want it
  re-cut with different family sizes, `N2_GOLD_PER_FAMILY` is the only knob.
- **The challenge I would most like you to make:** whether `supporting_authority`
  and `adverse_authority` are honest. Their queries are the *citation text* of
  the cited authority, so they are closer to `exact_identity` than to a real
  "find me an authority that supports this position" task. They test that a
  citation resolves to the right case, which is worth testing, but calling them
  *authority* families may overstate what they measure. I have left them named as
  R7 names them and flagged the doubt rather than quietly renaming them.
- The second challenge: 480 is small. It is bounded by hand-checkability, not by
  what the corpus could yield — the builder could produce thousands. A larger set
  is one environment variable away if you judge the families sound.
