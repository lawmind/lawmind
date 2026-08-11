# The data moat program — first real DeepSeek pilot, measured

**12 August 2026.** The first pass of actual DeepSeek calls over actual LawMind
documents, with every extracted claim checked against the source text before
being believed. Code: `services/ingest/src/enrich.ts`, `enrich-cli.ts`,
migration `0045_document_enrichments.sql` (applied to production).

**Headline: 421 calls, 483,297 tokens, 335 claims verified against source text,
8 rejected. Two of the four tasks returned a DO-NOT-SPEND verdict, and finding
that out was the best money spent.**

---

## 0 · The architecture, in one rule

> **The model is never asked what is true, only WHERE in this document
> something is written.**

Every task returns a verbatim `evidence` span. `verifyClaims` then locates that
span in the source text. A claim whose span cannot be found is **rejected with
a reason**, regardless of how confident the model was or how plausible it reads.

That is the direct consequence of `CITATION_CONCORDANCE_EVALUATION.md`: asked to
answer where the corpus was silent, this same model invented an authority
**10.8%** of the time, two of four inventions carried its own `high` confidence,
and the audit caught it reaching for outside knowledge — *"the Nirbhaya case"* —
exactly when the evidence ran out.

Requiring a locatable span turns hallucination from a **correctness** problem
into a **throughput** problem. An invented judge simply fails to appear in the
document and is dropped. The string match promotes it, not the model.

**Nothing written here is read by the product.** `document_enrichments` is
joined by no route and consulted by no retrieval path. Promotion into
`judgments`, `judgment_citations`, `judgment_citation_aliases` or
`judgment_judges` is a separate, measured step that does not yet exist.

---

## 1 · Production inventory, measured before anything was run

| | state |
| --- | --- |
| documents | **79,322** — Patna HC 39,445 · Supreme Court 38,342 · Bombay 523 · Gujarat 497 · Uttarakhand 190 |
| chunks / embeddings | 616,242 chunks over **38,381 documents, all embedded** — i.e. the Supreme Court only. **The ~41,000 High Court documents are not chunked or embedded at all** |
| citations | `judgment_citations` 273,383 rows, 99,887 resolved, **50,645 sentinels**; `external_citations` 51,272 rows, 15,102 resolved |
| treatment | `cites` 257,460 · followed 14,007 · distinguished 1,734 · **overruled 117** · overruled_in_part 23 · doubted 21 · approved 21 |
| metadata | 41,107 documents with no neutral citation, 40,996 with no bench, and **zero `judgment_judges` rows for any High Court judgment** |
| duplicates | 563 content-hash groups, 937 excess rows |
| statutes | `statutes` + `statute_mappings`; 18,590 amendment events |
| text quality | populated on every row — and §3 shows it does not measure what its name suggests |

---

## 2 · STAGE B/J · HC METADATA — **PASSED, scale it**

The corpus held **no coram at all** for any High Court judgment. Deterministic
parsing never covered that metadata variant, so this is a genuine gap rather
than a re-extraction of something already held.

| | |
| --- | --- |
| documents | 100 (24 from cache) |
| tokens | 77,549 in / 8,376 out = **85,925** |
| claims verified | **201 / 202 = 99.5%** |
| documents gaining a verified judge | **104 / 105** |
| fields recovered | judge 106 · case_number 105 · **neutral_citation 0** |

**The zero is as important as the rest.** Patna judgments do not print a neutral
citation, and the model returned `null` rather than inventing one — the refusal
path working on real data.

**The one rejection was a genuine catch.** The model offered judge *"Purnendu
Singh"* quoting `HONOURABLE MR. JUSTICE PURNENDDU SINGH`; the source's own OCR
doubles the D, the quoted span therefore did not exist verbatim, and the claim
was refused. It is *probably* the right judge. It was still refused, because a
span that cannot be located is not evidence.

**Verdict: scale.** Next batch 1,000, then 10,000. Eligible population ~40,996.

---

## 3 · STAGE A · OCR / TEXT QUALITY — **DO NOT SPEND**

`text_quality` is populated on all 79,322 rows and **cannot detect OCR
corruption**. Measured on a 4,000-document sample:

- **99.4% of the corpus sits in one bucket (0.9–1.0).**
- A 78-character document reading `h dh y : P , : 0 h p il 20 P :- k w M H v u`
  — pure garbage — scores **1.000**.
- A readable Travancore judgment scores 0.697.
- Of 5 genuine garbage documents found by better signals (single-character-token
  ratio > 0.30, word-like-token ratio < 0.20), **all 5 scored `text_quality`
  > 0.95** — completely invisible to the current metric.

**But the underlying problem is ~0.125% of the corpus, about 99 documents.** The
metric is broken; the corpus is genuinely clean. Re-OCR also needs the source
PDF re-fetched, which is a different pipeline.

**Verdict: fix the deterministic detector, do not run a DeepSeek OCR pass.**
Spending tokens here would buy ~99 documents.

---

## 4 · STAGE C · CITATION EXTRACTION ON SENTINELS — **DO NOT SPEND**

37,945 Patna judgments carry a `citation_text = ''` sentinel, the extractor's
marker for *"this document cites nothing"*. `Q1.0c` established that exactly
this shape — an implausibly large silent population — was a real extractor blind
spot on the Supreme Court side, so the question was worth asking.

| | |
| --- | --- |
| documents | 40 |
| tokens | 43,514 in / 282 out = **43,796** |
| citations found | **0** |

**40 of 40 returned zero citations. Unanimous.** The sentinels are genuine: a
two-line bail order really does cite nothing, and the extractor is not blind
here.

**This is the best 43,796 tokens spent in the pilot.** It closed a question that
would otherwise have justified a corpus-wide run over 37,945 documents, and the
answer was *there is nothing there*. A negative result that prevents a large
wasted job is worth more than a positive one that adds a little.

---

## 5 · STAGE E · TREATMENT — **PASSED, but the yield is thin**

`cites` is 257,460 of 273,383 edges — the extractor's default when no treatment
verb matched. If unrecognised treatment language were hiding anywhere, it is
here.

| | |
| --- | --- |
| documents | 40 |
| tokens | 37,819 in / 2,786 out = **40,605** |
| claims verified | **33 / 36 = 91.7%** |
| verified relationships | `cites` 30 · **`applied` 3** |
| flagged quoted-or-argued | 2 |
| rejected | 3, all `evidence span not found in source text` |

**The model confirmed the deterministic label in 30 of 33 cases and found 3
genuine `applied` relationships the extractor had missed.** It proposed **no**
`overruled`, `distinguished` or `reversed` — which is the conservative,
correct behaviour on a population that is mostly ordinary citation, and the
adversarial risk the prompt was written against.

**Verdict: scale cautiously.** ~9% yield of new relationships at 1,015
tokens/document. Worth running, but it will not transform the citator on its
own, and the 117 `overruled` edges remain the number to be sceptical about.

---

## 6 · Token ledger

Every call is in `llm_calls WHERE feature = 'concordance'`.

| | calls | tokens |
| --- | --- | --- |
| concordance evaluation (earlier) | 156 | 184,375 |
| **this enrichment pilot** | **265** | **298,922** |
| **total** | **421** | **483,297** |

Against the ~1B allocation: **0.048%**.

`--reverify` re-runs verification over stored `raw_output` with **no model
calls** — which is why raw output is persisted rather than only the verdicts. A
pipeline that keeps just its conclusions must re-buy them whenever its standards
improve, which quietly discourages improving them. Applied once already: it took
metadata verification from 34/41 to **41/41 for zero tokens**.

**Three InferX grants are configured** and `callInferxPooled` rotates on
capacity exhaustion only. Rotation fired repeatedly during the pilot — grant 1
exhausts under sustained load and the run continues rather than stopping.

---

## 7 · The verifier's own first defect, recorded because it cost real data

The first pilot rejected **7 of 41** claims as *"evidence span does not contain
the claimed value"*. All 7 were **correct judge names**. The corpus prints coram
in capitals; the prompt instructs the model to drop honorifics; it returns
`Rajesh Kumar Verma` against a source reading `HONOURABLE MR. JUSTICE RAJESH
KUMAR VERMA`. A byte-exact comparison threw away good data.

Verification now folds case. **That is case folding, not fuzzy matching**, and
the distinction is the entire safety property — a case-insensitive substring test
still cannot find a name the document does not contain. Tests assert `Ranjan
Gogoi` is refused in three casings, and that the near-miss `Rajesh Kumar Sharma`
is refused too: one wrong word is a different judge, not a typo to forgive. **No
edit distance is used anywhere in this pipeline.**

---

## 8 · What happens next, in order

1. **Scale metadata to 1,000, then 10,000.** Highest verified yield, largest
   eligible population (~40,996), cleanest verification.
2. **Design the promotion step** — nothing may reach `judgment_judges` until a
   sampled audit of verified claims is read by a human, and promotion is a
   separate reviewed decision.
3. **Fix the deterministic text-quality detector** so the ~99 genuinely corrupt
   documents are findable without a model.
4. **Do not** run citation extraction over the sentinel population. Measured, and
   the answer is zero.
5. The **602 safe deterministic concordance mappings** measured by
   `internal-concordance-cli` remain the only supported route to canonical
   aliases, and remain unpromoted.
