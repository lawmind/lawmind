# The 278 rejections — what they actually were

**15 August 2026, LCC, per the founder's directive: *"Do NOT respond to a 78.2%
verification rate by simply changing the prompt. Find the root cause."***

The first 100-document `case_structure` pass verified **1,011 claims and
rejected 278** — 78.4%. This is the triage of all 278, by cause, with an owner
against each. Read `docs/ai/LEGAL_OBJECT_PROGRAM.md` first; this is the
measurement that decides whether its five tasks are safe to scale.

**The headline: only 28.4% of the rejections were the model's.** A prompt edit
could not have touched the other 71.6%, and the number it would have moved most
is the one measuring our own text.

---

## 1 · HOW IT WAS MEASURED

`services/ingest/src/enrich-triage-cli.ts` — no model calls, no writes. It reads
the stored `raw_output` for every row, re-derives the claims, re-runs the **real**
`verifyClaims`, and then puts each refused claim through a ladder of
progressively weaker substring tests, recording **the first one under which the
quote appears**.

Three properties make the result checkable rather than asserted:

- **The ladder runs strictest-first.** The first rung that fits is the *least
  forgiving* explanation available. Run loosest-first and everything looks like
  an OCR artefact.
- **The excerpt is reproduced and CHECKED**, not assumed: each row's excerpt is
  rebuilt and compared against the stored `input_hash`. It reproduced for
  **101 of 101** rows. Where it had not, the elision test would have been
  withheld rather than guessed.
- **Nothing here is wired into `verifyClaims`.** These loosened comparisons
  classify a failure; they never promote one. `enrich.ts`'s rule stands: *"Do
  NOT add a kind here to make a failing verification pass."*

`enrich-triage.test.ts` — 14 tests, and the ones that matter are refusals: a
fabricated sentence, and a real span from a different judgment, must not be
excused as page furniture by any rung.

---

## 2 · THE ANSWER

| cause | claims | share | owner |
| --- | ---: | ---: | --- |
| `source_page_furniture` — a page rule, running header or e-signature panel sits **inside the sentence** in `full_text` | **56** | 20.1% | ingest |
| `unexplained_drift` — a long verbatim run that diverges and does not resume under any named rule | 54 | 19.4% | mixed |
| `case_only` — the quote is exact but for letter case | **45** | 16.2% | verifier |
| `paraphrase` — real fragments assembled into a sentence the judgment does not contain | 31 | 11.2% | model |
| `fabrication` — shares almost nothing with the document | **30** | 10.8% | model |
| `ocr_spacing` — matches once spacing, hyphenation and punctuation are removed | 26 | 9.4% | ingest |
| `source_interpolation` — every word present in order, but the model skipped a clause of the court's own text | 17 | 6.1% | model |
| `char_transcription` — an isolated one-character difference (`7975`/`1975`, `Ied`/`led`, `narnes`/`names`) | 14 | 5.0% | ingest |
| `verifier_min_length` — a correctly copied span under the 12-character floor | 3 | 1.1% | verifier |
| `internal_ellipsis` — the model joined two real passages with `...` | 1 | 0.4% | model |
| `punctuation_only` — curly quote or dash | 1 | 0.4% | verifier |

**By owner: ingest 150 (54.0%) · model 79 (28.4%) · verifier 49 (17.6%).**

Against the founder's five categories:

| category | claims | share |
| --- | ---: | ---: |
| 1 · genuine model fabrication (incl. paraphrase, splicing, ellipsis) | 79 | 28.4% |
| 2 · whitespace / case normalisation | 46 | 16.6% |
| 3 · OCR / extraction | 96 | 34.5% |
| 4 · elision / boundary | **0** | 0.0% |
| 5 · verifier defect | 49 | 17.6% |
| — · unexplained residual | 54 | 19.4% |

Categories 2 and 5 overlap by construction: case folding **is** the verifier
defect. The residual is reported separately rather than distributed, because a
bucket assigned by elimination is a guess wearing a measurement's clothes.

### Category 4 is ZERO, and that is a real result

**Not one claim** was found in the excerpt but absent from the document. The
20k-head + 8k-tail window was the design decision most likely to be quietly
costing something, and at this sample it costs nothing detectable. It stays.

Stated with its limit: this measures the elision creating a **false** span. It
cannot measure the recall the elision loses, because *a claim never made leaves
no trace* — `LEGAL_OBJECT_PROGRAM.md` §4 already says so and this does not
change it.

---

## 3 · THE INGEST DEFECT, WHICH IS THE BIGGEST SINGLE CAUSE

`full_text` carries the PDF's **page furniture inline, mid-sentence**:

```
…the petitioner had filed an appeal - 6 - HC-KAR NC: 2026:KHC:23440
WP No. 39444 of 2025 which also culminated in an order dated 30.12.2025…
```

```
…the said amount was handed over to the petitioner Signed by: LOKENDRA JAIN
Signing time: 7/31/2023 2:57:58 PM Signature Not Verified 3 Second Appeal
No. 176/2023 in his favour and on the basis…
```

A model asked to quote the sentence quotes **the sentence**. It is reading
correctly; the string test is what fails. The document does contain those words
contiguously in every sense a lawyer would recognise.

### Measured prevalence, and it is court-specific

`TABLESAMPLE BERNOULLI` over the classified substantive population, 15 Aug 2026:

| court | `- N -` page rule inline | e-signature panel inline | n |
| --- | ---: | ---: | ---: |
| **High Court of Karnataka** | **92.1%** | **47.4%** | 38 |
| **High Court of Madhya Pradesh** | 0.0% | **68.6%** | 35 |
| High Court of Kerala | 0.0% (`: N :` form, 2.4%) | 0.0% | 42 |
| Uttarakhand · Punjab & Haryana · Rajasthan | 0.0% | 0–7.4% | 73 |

Corpus-wide, a 3,438-document draw: `digitally signed by` **12.8%**,
`signature not verified` **5.7%**.

**Small samples, large effects.** n=38 will not support a precise rate, but a
92% signal is not a sampling artefact. The per-court split is the useful part:
this is a handful of courts' PDF layouts, not a general extraction failure, so
it is fixable per court rather than corpus-wide.

**The blast radius is wider than enrichment**, which is why it is being sent to
NEW2 rather than worked around here. Anything reading `full_text` reads the
furniture too: paragraph segmentation, chunking for embeddings, citation
extraction spans, and any passage shown to an advocate as evidence. Enrichment
merely happens to be the pass that **measures** it, because it is the only one
holding a model's independent reading of the same text.

**Not fixed here, deliberately.** Stripping furniture at read time inside the
enrichment pass would hide a corpus defect behind one consumer's workaround, and
the next consumer would rediscover it. `services/ingest/src/enrich-triage.ts`'s
`FURNITURE_PATTERNS` is the measured vocabulary, ready to be reused by whoever
fixes the extraction.

---

## 4 · THE VERIFIER DEFECT, FIXED

`INTENT: verifyClaims located the evidence span with a CASE-SENSITIVE substring
test while case-FOLDING the value check one line below it; 45 rejected claims
expect the span to be found; enrich.ts's own comment says case is not identity
and that folding "still cannot find a name the document does not contain".`

The two tests disagreed with each other. Indian judgments print prayers, cause
titles and exhibit lists in full capitals and the model returns sentence case —
the same `HONOURABLE MR. JUSTICE …` problem that forced folding on the value
check after the first pilot, arriving by a different road.

**Applied.** `enrich.ts` now folds both. The safety property is unchanged and
that is the whole argument: a case-insensitive substring test still cannot find
a passage the document does not contain. Three tests were added and they are the
point — a fabricated span is refused in three casings, and a real span from
another judgment is refused in two.

**Measured, not predicted.** `enrich-cli --reverify` re-ran verification over the
stored output at zero token cost:

```
REVERIFY — 101 stored case_structure rows, no model calls
rows whose verified count changed: 32
claims verified: 1011 -> 1056
```

**+45, exactly the triage's count.** Verification rate **78.4% → 81.9%**.

---

## 5 · WHAT THIS SAYS ABOUT SCALING

The model-owned failure rate is the number that governs, and it is **79 of 1,289
claims — 6.1%**, not 21.6%. Of that, outright fabrication is **30 claims,
2.3%**, and every one was caught and dropped by the span check. The pipeline
worked; the rejection rate was mostly measuring us.

Per kind, on the same 100 documents:

| kind | claims | rejected | dominant cause |
| --- | ---: | ---: | --- |
| `chronology` | 373 | 17.7% | case (fixed) |
| `procedural_history` | 285 | 20.0% | unexplained drift, furniture |
| `relief_sought` | 147 | 21.1% | furniture, OCR spacing |
| `issue` | 171 | 21.6% | drift, paraphrase |
| `fact` | 313 | 27.8% | furniture |

`fact` is the weakest and it is weakest for an **ingest** reason, not a model
one — facts are recited in long paragraphs, and a long paragraph is the shape
most likely to be interrupted by a page break.

**No task is unsafe on this evidence, and none is cleared to full scale on it
either** — this is 100 documents of one task. The four remaining tasks
(`holding`, `arguments`, `authorities`, `topics`) have **zero rows** and cannot
be judged at all yet. What this measurement supports is the next rung: run each
of the five at 1,000 documents and triage again, with the case fix already in
place so the ingest signal is not buried under a verifier artefact.

**Deliberately not concluded here:** whether the 6.1% model-owned rate is
acceptable for promotion into anything canonical. Nothing is promoted, no route
reads `document_enrichments`, and `0045`'s boundary is untouched.

---

## 6 · `holding`, THE SECOND TASK — measured the same evening, with the fix already in

100 documents, 789 claims, **643 verified — 81.5%**. Triaged identically.

| cause | claims | share | owner |
| --- | ---: | ---: | --- |
| `unexplained_drift` | 48 | 32.9% | mixed |
| `source_page_furniture` | 36 | 24.7% | ingest |
| `paraphrase` | 28 | 19.2% | model |
| `ocr_spacing` | 20 | 13.7% | ingest |
| `char_transcription` | 6 | 4.1% | ingest |
| `source_interpolation` | 4 | 2.7% | model |
| `punctuation_only` | 2 | 1.4% | verifier |
| `internal_ellipsis` | 1 | 0.7% | model |
| **`fabrication`** | **1** | **0.7%** | model |

**By owner: ingest 110 (75.3%) · model 34 (23.3%) · verifier 2 (1.4%).**

Three things this says that one task could not:

1. **`case_only` is now ZERO.** It was 16.2% of `case_structure`'s rejections and
   the fix removed the whole bucket rather than shrinking it. That is the shape a
   real root-cause fix has.
2. **Outright fabrication on the hardest task is ONE claim in 789 — 0.13%.**
   `holding` asks the model for the operative direction of a judgment, the field
   most tempting to write from memory, and it declined to. The model-owned rate
   overall is 34/789 = **4.3%**, lower than `case_structure`'s 6.1%.
3. **The ingest share went UP, to 75.3%**, because removing the verifier bucket
   left the corpus defect as a larger fraction of a smaller total. The corpus, not
   the model, is what limits this pipeline.

Per kind: `reasoning` 22.1% rejected · `proposition` 20.0% · `holding` 17.2% ·
`relief_granted` 13.2%. The two most valuable fields — the holding itself and the
relief granted — are the two that verify best.

---

## 7 · ALL FIVE TASKS, MEASURED — AND THE SAFETY GATE

100 documents each, all triaged against the **same** verifier (post case-fold
fix, so `case_structure`'s figures below supersede §2's). This is the evidence
the founder's directive asks for before any task scales past 100.

| task | claims | verified | rate | ingest | model | verifier | **fabrication** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `topics` | 840 | 705 | **83.9%** | 65.2% | 28.9% | 5.9% | 4 — **0.48%** |
| `authorities` | 580 | 483 | **83.3%** | 67.0% | 33.0% | 0% | 0 — **0.00%** |
| `case_structure` | 1,289 | 1,056 | 81.9% | 64.4% | 33.9% | 1.7% | 30 — **2.33%** |
| `holding` | 789 | 643 | 81.5% | 75.3% | 23.3% | 1.4% | 1 — **0.13%** |
| `arguments` | 621 | 487 | 78.4% | 75.4% | 23.9% | 0.7% | 0 — **0.00%** |

*(ingest/model/verifier are shares of that task's REJECTIONS; fabrication is a
share of ALL its claims, which is the number that governs.)*

### The one result that matters, and it is not the headline rate

**Outright fabrication is 35 claims across all 4,119 — and 30 of the 35 are in
`case_structure` alone.** The other four tasks produce 5 between them. A
verification rate of 78–84% is remarkably flat across tasks; the *fabrication*
rate varies by a factor of eighteen. Ranking tasks by their headline rate would
have put `case_structure` in the middle of the pack and hidden this entirely.

Per kind, model-owned failure (fabrication + paraphrase + splicing + ellipsis):

| worst kind per task | rate |
| --- | ---: |
| `case_structure` · **`fact`** | **8.9%** of 313 |
| `authorities` · `authority_relied_on` | 8.8% of 227 |
| `case_structure` · `issue` | 7.0% of 171 |
| `arguments` · `argument_petitioner` | 6.0% of 382 |
| `holding` · `holding` | 5.0% of 180 |
| `topics` · `topic` | 4.9% of 327 |
| `authorities` · `provision_applied` | 3.4% of 353 |

**The pattern has a cause, not just a shape.** `case_structure` asks the model to
reconstruct a NARRATIVE — what happened, in what order, to whom. The other four
ask it to locate something the court has already stated in its own words: its
holding, the relief it granted, the authority it leaned on, a contention it
attributed to a side. **Narrative reconstruction invites invention; locating a
stated proposition does not.** `fact` is the worst kind in the whole programme
and it is the most narrative one.

### THE GATE, AND WHAT IT DOES AND DOES NOT CLAIM

**Cleared to 1,000: `holding`, `arguments`, `authorities`, `topics`.**
Fabrication 0–0.48%, no kind above 8.8% model-owned, and their rejections are
dominated by corpus defects we already own.

**HELD at 100: `case_structure`.** Not because it is unsafe — see below — but
because 2.33% fabrication is 5–18× its siblings and concentrated in one kind. The
cheap next move is to narrow `fact`'s prompt toward the court's own recital
rather than the events, and re-measure at 100. Scaling it first would spend the
grant's scarce tokens generating claims that are then thrown away.

**WHAT THIS GATE IS NOT SAYING, and the distinction is the whole safety
argument: every one of those 35 fabrications was CAUGHT AND DROPPED.** None
entered any table as fact. `document_enrichments` is read by no route and no
retrieval path, and migration `0045`'s boundary is untouched. So this gate is
about **token efficiency and dataset quality**, not about protecting the product
from what is stored — the span check is what protects that, and it worked on
every single one.

**Still not concluded:** whether any of these rates is acceptable for PROMOTION
into a canonical table. That is a separate, measured decision and it has not been
taken. Nothing is promoted.

**And the limit of all of it:** 100 documents per task, drawn from the classified
substantive population, which is Karnataka- and Kerala-heavy. The pre-2016 High
Court material NEW2 began ingesting on 14 Aug — older scans, worse OCR, no
neutral citations — is **not represented in any of these numbers**, and the
ingest-owned share is exactly the thing that tranche should be expected to move.
