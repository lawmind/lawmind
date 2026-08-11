# The citation concordance program

**The authority for `concordance-adjudicate.ts`, `inferx.ts`, migrations `0043`
and `0044`.** Written 11 Aug 2026, after the deterministic ceiling was measured.

---

## The problem, in one paragraph

A High Court citing `(2006) 4 SCC 1` is very likely citing a judgment sitting in
our corpus under `[2006] X S.C.R. Y`. We cannot join them: **all 38,342 of our
Supreme Court judgments carry S.C.R. citations and zero carry SCC or AIR**,
while **4,485 of 4,489 unresolved High Court citation edges point at SCC/AIR**.
`docs/ai/AUTHORITY_COVERAGE.md` measured it.

That makes most of the apparent corpus gap an **identity problem**, not an
acquisition problem — and identity problems are cheaper to fix than corpora.

---

## Why deterministic matching alone is not enough — measured, not assumed

Two deterministic signals were tried and both have a ceiling:

**1 · Courts printing both citations together.** `concordance.ts` mines
`AIR 1980 SC 791 : [1980] 2 SCR 1067` and turns it into an alias — no fuzzy
matching, no model, no risk. **Re-run across the whole corpus including the
40,980 new High Court documents: 3 aliases from 1,404 SCR keys.** High Court
bail orders cite SCC and AIR but rarely print the S.C.R. equivalent beside them.
The signal is exhausted.

**2 · Case name + year.** Courts do print the case name beside the citation, and
we hold `case_title` and `judgment_date` for every Supreme Court judgment. Token
matching within a year window reaches **28.0%** of targets — but adversarial
validation cut it to **12.1% safe**:

- **51.8%** of accepted mappings rested on ≤3 distinguishing tokens.
- **17 same-reporter collisions were demonstrable errors** — the *Arjun
  Panditrao* referral order and main judgment matched to one row;
  *"Hindustan Times v State of U.P."* matched to two different judgments.

Repeat litigants defeat a name+year join, and Indian public-law litigation is
full of them. **A string metric cannot read what the surrounding sentence is
claiming**, and that is exactly what distinguishes a referral order from the
judgment it refers.

---

## The shape: deterministic narrows, the model adjudicates

    unresolved citation
      → deterministic candidate generation   (cheap, local, narrows the field)
      → DeepSeek adjudication                (chooses among candidates, or refuses)
      → citation_concordance_resolutions     (an opinion, recorded)
      → [SEPARATE, THRESHOLD-GATED PROMOTION]
      → judgment_citation_aliases            (a fact the product reads)

**Never the reverse.** Sending the corpus to the model per citation would cost
more and fix nothing: the ambiguity is in the evidence, not in the search.

### The rule that governs everything here

> **The model may recommend. It may never create canonical identity.**

Nothing reads `citation_concordance_resolutions` to answer a citation query.
Only `judgment_citation_aliases` does that, and moving a row between them is an
explicit, separately-gated step. A model's opinion and a corroborated fact about
the corpus are different things and must stay distinguishable — the same reason
`verified_by_source = 'licensed'` exists and ranks below `ecourts_bulk`.

**A wrong authority is materially worse than an unresolved citation.** An
unresolved citation is visibly unresolved. A wrong one is invisible, and it is
the failure this product exists to prevent.

---

## Token discipline — the 1B allocation

- **`model_input_hash` is the idempotency key.** The same citation, evidence
  snippet and candidate set is a cache lookup, never a second call.
- **Candidates are narrowed before the call**, so the prompt carries a handful
  of titles rather than a corpus.
- **Priority is by citing-document count** — the highest-frequency unresolved
  targets affect the most downstream documents.
- Every call rows into `llm_calls` with its feature (migration `0044`), so spend
  is queryable rather than estimated.

**Data class: PUBLIC.** Judgments and citations are published law. No
pseudonymisation is required and no advocate's document is involved — this
pipeline never touches uploaded content. `CLAUDE.md` §5.

---

## The five-state ontology is preserved, and a sixth is added beside it

    HELD · MAPPED INTERNALLY · KNOWN BUT UNMAPPED · AMBIGUOUS · GENUINELY MISSING

The model's output does **not** enter any of them. It lands in its own state —
`MODEL_ADJUDICATED`, recorded in `citation_concordance_resolutions` with its
decision, confidence, candidate set, evidence and input hash. Promotion out of
it into `MAPPED INTERNALLY` is a separate decision governed by a measured
threshold, not by the model's own confidence word.

---

## What would make this fail, and that is a real outcome

The success criterion is **not** "we used DeepSeek". It is:

> Can LawMind safely resolve materially more of the unknown citation graph than
> deterministic matching alone, **without introducing false canonical
> authorities**?

`docs/ai/CITATION_CONCORDANCE_EVALUATION.md` holds the measurement. If the
adjudicated precision at the promotable tier does not clear the deterministic
baseline by a margin worth the complexity, **the layer does not ship and the
finding is written down** — a negative result about a model is still a result,
and forcing it into production would be the opposite of the discipline that
produced this program.

---

## MEASURED 12 Aug 2026 — **the answer is no, and the layer does not ship**

**`docs/ai/CITATION_CONCORDANCE_EVALUATION.md` is now written from a real run**
(116 cases, 3 arms, 184,375 tokens). The paragraph above was the condition; this
is the outcome, recorded here so nobody reads the architecture without it.

- **It fabricates.** With the true judgment removed from the candidate list —
  the condition that *defines* the real target population — the model named an
  authority anyway in **10.8%** of cases (4 of 37) instead of refusing.
- **Its confidence does not screen the failure.** **Two of those four were
  tagged `high`.** `resolveConfidenceTier`'s own comment called itself *"a
  starting hypothesis, not a measured result"*. It is measured now, and refuted:
  there is no threshold on this evidence that admits the right answers while
  excluding the fabricated ones.
- **It resolves LESS than the deterministic baseline.** Paired on identical
  cases: DeepSeek gave up **18** resolutions the deterministic step got right to
  prevent **8** wrong authorities. McNemar p ≈ 0.00008.
- **And all of it sits under a 22.0% ceiling** — only 44 of 200 real citations
  produce a candidate set at all. The bottleneck is candidate generation, not
  adjudication.

**The boundary this document insisted on is what made that finding cheap and
safe**: the model's opinions went to `citation_concordance_resolutions`, nothing
read them, and `judgment_citation_aliases` never moved. Verified by query after
the run — **4,100 aliases, unchanged; 0 rows promoted.** The rule at the top of
this file held, which is the point of writing it down before running anything.
