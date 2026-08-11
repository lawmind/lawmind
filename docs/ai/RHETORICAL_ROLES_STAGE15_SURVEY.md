# Stage 15 — rhetorical roles: SURVEY, not a build

**Surveyed 11 Aug 2026.** `docs/ai/STAGES_9_20_PLAN.md` §15 says *"survey
OpenNyAI first"*, and `CLAUDE.md` OSS-first says search for a maintained project
before building anything non-differentiating. This is that survey. **Nothing was
built.**

**Conclusion up front: do not build a classifier. A maintained, Apache-2.0,
Indian-law-specific one exists and covers more of what Stage 15 asks for than
Stage 15 asked for — with one legally consequential gap it does not cover, and
which nothing else appears to cover either.**

---

## What exists

| thing | what it is | licence |
| --- | --- | --- |
| [`OpenNyAI/Opennyai`](https://github.com/OpenNyAI/Opennyai) | Python NLP pipeline for Indian legal text — NER, rhetorical-role structuring, extractive summariser | **MIT** |
| [`Legal-NLP-EkStep/rhetorical-role-baseline`](https://github.com/Legal-NLP-EkStep/rhetorical-role-baseline) | baseline model code + the BUILD benchmark | code **Apache 2.0** |
| BUILD dataset | the annotated corpus behind it | **CC BY-SA 4.0** |
| [`opennyaiorg/InRhetoricalRoles`](https://huggingface.co/opennyaiorg/InRhetoricalRoles) | **the pre-trained weights** | **apache-2.0** (verbatim from the model card) |

Funded by EkStep Foundation, aimed at access to justice in India — the same
jurisdiction and document type as our corpus, not a US/EU model being borrowed.

### The licence line that matters, and it is a line

**Using the pre-trained model is clean.** The weights are Apache 2.0 and the
library is MIT; both are on `docs/OSS_STACK.md`'s allowed list, and neither is
AGPL.

**Training our own classifier on BUILD is a different question.** BUILD is
**CC BY-SA 4.0** — share-alike. Whether a model trained on a share-alike dataset
is a derivative that must itself be share-alike is a real, unsettled question
and **not one to answer alone**. So:

> Use the Apache-2.0 weights. Do not train on BUILD without the founder and, if
> it comes to it, counsel. The clean path does not require the dataset at all.

---

## The 13 labels, mapped against what Stage 15 asked for

Stage 15 asked for facts / arguments / statute / quoted precedent / ratio /
obiter. The mapping is better than requested in four places and short in one.

| Stage 15 wanted | OpenNyAI label | note |
| --- | --- | --- |
| facts | `FAC` | ✓ |
| arguments | `ARG_PETITIONER`, `ARG_RESPONDENT` | **better** — separates the two sides, which is what an advocate actually needs |
| statute | `STA` | ✓ |
| quoted precedent | `PRE_RELIED`, `PRE_NOT_RELIED` | **better** — relied vs not relied is close to the treatment distinction `treatment.ts` already models |
| ratio | `Ratio` | ✓ |
| **obiter** | — | **NOT COVERED. See below.** |
| — | `PREAMBLE`, `RLC`, `ISSUE`, `ANALYSIS`, `RPC`, `NONE` | extra: ruling by lower court, ruling by present court, issues |

Baseline reports **weighted F1 77.7 on hidden test data**. That is a real number
from the authors, not one we measured, and it is quoted as theirs.

---

## The gap: there is no obiter label, and that is the legally consequential one

`Ratio` is predicted. **Obiter dicta is not a label in this scheme at all.**

That distinction is not cosmetic in Indian practice: ratio decidendi binds under
Article 141, obiter does not. An advocate told a passage is "the ratio" when it
is obiter has been handed something they may cite as binding and cannot.

So a classifier that predicts `Ratio` and has no `obiter` class **cannot be read
as "everything not-ratio is obiter"** — the other 12 labels are facts,
arguments, statute and procedure, not obiter. The honest position is that this
model answers *"is this the ratio"* and says nothing about obiter, and any
surface built on it must not imply otherwise.

I found no maintained project that classifies obiter for Indian judgments.
Adjacent work exists ([`Law-AI/semantic-segmentation`](https://github.com/Law-AI/semantic-segmentation),
7 roles; [`LegalSeg`](https://arxiv.org/html/2502.05836v1)) and neither closes
it either. **Recorded as an open gap, not quietly folded into `Ratio`.**

---

## What this costs to adopt

- **Python.** Opennyai is a Python library needing **Python ≥ 3.13**. This is
  not a new stack element — `CLAUDE.md` §4 already lists an OCR service in
  Python/FastAPI, so a second Python service is a known shape, not a vendor
  decision. **No new vendor, so no founder question.**
- **GPU optional.** It runs without one; CUDA via Cupy is an optimisation.
- **Batch, never per-request.** Same reasoning as `generated_holding` in
  migration `0033`: a rhetorical role is a property of the JUDGMENT, not of a
  query, so it is computed once and read from the row. Putting a model call
  inside `/search` would add a round trip to every result on every search.

---

## Named next steps, in order — none of them started

1. **Measure it on OUR corpus before adopting it.** 77.7 weighted F1 is the
   authors' number on their hidden test set. Our corpus is 51.3% High Court
   documents that are mostly *orders rather than reasoned judgments*
   (`HC_CORPUS_CHARACTERIZATION.md`: measured judgment share 0.75%–18.64%), and
   a role classifier trained on reasoned judgments has no reason to hold up on a
   two-paragraph bail order. **Hand-label ~50 paragraphs from our own rows and
   check.** This is the same discipline that caught `parties.ts` and
   `citations.ts`, and it is the step that decides whether this is adopted.
2. **Then a migration**, following `statute_amendments`' shape: role per
   paragraph, model version recorded, confidence stored, and an unlabelled
   paragraph recorded as unlabelled rather than defaulted to `NONE`.
3. **Never render a role as a legal claim.** "This is the ratio" is an
   assertion about binding authority. Whatever ships says what it is — a
   machine's structural label on a paragraph — in the same way `unverified`
   never renders as confirmed.

---

Sources: [Opennyai](https://github.com/OpenNyAI/Opennyai) ·
[rhetorical-role-baseline](https://github.com/Legal-NLP-EkStep/rhetorical-role-baseline) ·
[InRhetoricalRoles weights](https://huggingface.co/opennyaiorg/InRhetoricalRoles) ·
[Law-AI/semantic-segmentation](https://github.com/Law-AI/semantic-segmentation) ·
[LegalSeg](https://arxiv.org/html/2502.05836v1)
