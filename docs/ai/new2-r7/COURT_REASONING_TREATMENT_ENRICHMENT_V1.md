# COURT_REASONING_TREATMENT_ENRICHMENT_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Machine-readable:** `docs/ai/new2-r7/treatment-enrichment-pilot.json` (all 75 candidates with full context retained)
**Pilot script:** `scripts/n2-treatment-enrichment-pilot.mjs` — **`writes_performed: 0`**

## VERDICT: DO NOT SCALE.

**0 of 11 hand-adjudicated candidates survived.** Precision is below **27.3%**
at 95% confidence (rule of three on 0/11), against a pre-registered bar of 95%.
The gate that fails is not fixable by adding vocabulary, and §4 says why.

The corpus keeps its **5** `COURT_REASONING_EXPLICIT` edges. Nothing was written.

---

## 1. Why the pilot was run

Currentness evidence today rests almost entirely on a reporter's editorial note:

| treatment provenance | edges | share |
| --- | ---: | ---: |
| `REPORTER_EDITORIAL_ANNOTATION` | 11,573 | 72.41% |
| `NULL` — never classified | 4,403 | 27.55% |
| **`COURT_REASONING_EXPLICIT`** | **5** | **0.03%** |
| `MODALITY_DEFECT` | 1 | 0.01% |

Five edges in the whole corpus record a court saying, in its own words, that an
earlier authority has moved. R7 §10 asks whether that can be increased from the
231,412 resolved citation edges we already hold.

---

## 2. The pipeline, and every gate it applies

```
resolved edge with a char_offset
  → cut a real 1,600-char window of the citing judgment's text at that offset
  → GATE 1  exact span verification      the citation string is really there
  → GATE 2  treatment language present   and exactly one relation, not several
  → GATE 3  the trap set                 counsel · reporter · modality · negation · question · quotation
  → GATE 4  court voice                  the passage-role contract's reasoning rules
  → GATE 5  chronology                   the citing judgment post-dates the cited one
  → GATE 6  body damage                  neither document nor window is damaged
  → CANDIDATE — proposed, never promoted
```

**No writes of any kind.** `relationship`, `treatment_provenance` and
`overruled_status` are untouched. R7 §10: models may propose candidates, models
do not establish canonical treatment — and neither does a regular expression.

### 2.1 Refusals over 40,000 resolved edges

| gate | refused |
| --- | ---: |
| `NO_TREATMENT_LANGUAGE` | 37,051 |
| `NOT_COURT_VOICE` | 1,924 |
| `MODALITY_DEFECT` | 544 |
| `SPEAKER_IS_COUNSEL` | 191 |
| `CONFLICTING_TREATMENT_LANGUAGE` | 164 |
| `QUOTED_PRECEDENT` | 40 |
| `SPEAKER_IS_REPORTER` | 5 |
| `CITING_BODY_DAMAGED` | 2 |
| `NEGATED` | 2 |
| `INTERROGATIVE_OR_CONDITIONAL` | 1 |
| `CHRONOLOGY_IMPOSSIBLE` | 1 |
| **surviving candidates** | **75** |

`SPAN_NOT_FOUND: 0`. The `char_offset` column is **reliable** — see §5, which is
a correction of this pilot's own first run.

### 2.2 What survived, before adjudication

| proposed relationship | candidates |
| --- | ---: |
| `distinguished` | 38 |
| `set_aside` | 21 |
| `overruled` | 10 |
| `followed` | 5 |
| `approved` | 1 |

70 of the 75 sit on edges currently marked plain `cites`, 2 agree with an
existing treatment, and 3 contradict one.

---

## 3. The pre-registration, and the result against it

**Registered before any candidate was read** (R7 §10: *pre-register precision
requirement before scaling*):

> A candidate class may be promoted only if a hand-adjudicated sample of at
> least 10 candidates shows **≥ 95% precision**, with **zero** false
> `overruled`/`overruled_in_part` — the two relations that drive a LAW MOVED
> badge, where a false positive is indistinguishable to an advocate from a
> hallucination.

**Result: 0 of 11 confirmed.**

| # | proposed | cited authority | verdict | why |
| --- | --- | --- | --- | --- |
| 1 | `overruled` | ONGC v. Western Geco, (2014) 9 SCC 263 | **REFUTED** | window discusses setting aside an *arbitral award*; no treatment of the cited case |
| 2 | `overruled` | Union of India v. ADR, (2003) 4 SCC 399 | **REFUTED** | window is an SCR headnote list; text says the judgments *"have not disturbed"* the position |
| 3 | `overruled` | Akhtaribi v. State of M.P., [2001] 4 SCC 355 | **REFUTED — WRONG TARGET** | a genuine overruling — of two *High Court Division Bench* judgments, not of the cited case |
| 4 | `overruled` | Oriental Insurance v. Zaharulnisha, [2008] 7 SCR 58 | **REFUTED** | window is headnote apparatus — `[Para 30] [801-G-H; 802-A-B]` |
| 5 | `overruled` | Mohanlal v. State of Punjab, (2018) 17 SCC 627 | **REFUTED** | window is a numbered restatement of propositions; no overruling in it |
| 6–8 | `set_aside` | Banda Development Authority; State of Assam v. Bhaskar Jyoti Sarma (×2) | **REFUTED** | *"The impugned order passed by the High Court is set aside"* — the operative order in the present appeal, not a treatment of any precedent |
| 9 | `distinguished` | Padmasundara Rao, [2002] 2 SCR 383 | **REFUTED** | no distinguishing language attaches to the cited case in the window |
| 10 | `distinguished` | Dayaram Asanand Gursahani, [1984] 2 SCR 703 | **REFUTED** | window is reasoning about pay scales; the cited case is merely listed |
| 11 | `distinguished` | Ram Sarup v. Munshi, AIR 1963 SC 553 | **REFUTED — WRONG TARGET** | *"are distinguishable on the facts"* refers to New Central Jute Mills, cited in the same window |

---

## 4. The three failure modes — and why the first one is fatal to the approach

### 4.1 WRONG TARGET: proximity is not reference

**Two of eleven were genuine judicial treatment aimed at a different case.** A
judgment that discusses authorities cites several in one paragraph; the
overruling verb attaches to one of them by grammar, and a character window has no
grammar.

This is not a vocabulary problem and no amount of extra phrases fixes it. **The
window contains the right words and the wrong referent**, which is the single
most dangerous shape available: every gate passes and the answer is wrong. It is
also the shape a language model would be *most* confident about, because the text
genuinely reads as an overruling.

Resolving it needs the sentence's grammatical object bound to a specific
citation — coreference, not proximity — and that is a different programme from
this one.

### 4.2 OPERATIVE-ORDER CONFUSION: `set_aside` does not belong in this vocabulary

All 21 `set_aside` candidates are *"the impugned order is set aside"* — the
court's disposal of **the appeal in front of it**, not a statement about a
precedent. `set_aside` describes what happens to the order under challenge and
should never have been in a citation-treatment vocabulary. **28% of the
candidates were this one error.**

Worth carrying beyond this pilot: `judgments.overruled_status` uses the value
`set_aside`, and OD-14 already found that column doing the work of `overruled`.
The same word means two different things one table apart.

### 4.3 REPORTER HEADNOTES: the trap fired 5 times and should have fired far more

`SPEAKER_IS_REPORTER` refused only 5 of 40,000, yet **4 of the 11 hand-read
candidates were headnote text**. The markers used (`HEADNOTE`, `Held :—`,
`Editor's Note`) are rarer in this corpus than the apparatus actually is —
running heads, margin letters `A B C D E F G H`, and pin-cites like
`[801-G-H; 802-A-B]`.

**And the reason there is headnote apparatus at all is a finding in its own
right** — §6.

---

## 5. `CORRECTION_OF` this pilot's own first run

- **old claim:** 35,612 of 40,000 resolved edges (89%) failed `SPAN_NOT_FOUND`,
  suggesting `judgment_citations.char_offset` does not locate the citation.
- **new fact:** the offsets are **correct**. Reading eight edges directly showed
  the citation text sitting exactly at the recorded offset every time.
- **evidence:** the fault was in this script. It replaced whitespace with `\s*`
  *before* escaping regex metacharacters, so the escape pass escaped the
  backslash and asterisk it had just inserted. Every citation containing a space
  — nearly all — became an impossible literal. Escaping first drops
  `SPAN_NOT_FOUND` from 35,612 to **0**.
- **affected downstream:** none outside this document — the erroneous figure was
  never published. Recorded because "the data is broken" was the comfortable
  conclusion and it was wrong, and because `char_offset` being reliable is load-
  bearing for any future evidence-span work.

---

## 6. A finding the pilot surfaced that is bigger than the pilot

**Our Supreme Court corpus is the SCR reporter edition, not raw court text.**

| tier | documents | carry a reporter running head | carry a headnote marker |
| --- | ---: | ---: | ---: |
| Supreme Court of India | 38,342 | **35,570 (92.77%)** | **15,691 (40.92%)** |
| High Courts | 93,175 `SAMPLED` (0.5%) | **2 (0.002%)** | 2 (0.002%) |

The High Court corpus is raw court text, as intended. The Supreme Court corpus
is not: 92.77% of it carries the `SUPREME COURT REPORTS` running head, and 40.92%
contains headnote prose.

This matters in four places at once:

1. **Licensing.** `CLAUDE.md` §6: *"What IS protected is a reporter's
   copy-edited version — headnotes, editorial numbering (Eastern Book Company v.
   D.B. Modak) — so use raw court text and never a law report's edition of it."*
   SCR is the Supreme Court's **own official** reporter rather than a private
   publisher's, which may or may not change the analysis. **That is a legal
   question and this lane does not answer it** — raised in
   `docs/FOUNDER_QUEUE.md`.
2. **Training data.** `docs/DATASETS.md` forbids training on a reporter's
   edition. 38,342 documents are affected.
3. **Passage safety.** `PASSAGE_SAFETY_ROLE_CONTRACT_V1` measured reporter
   contamination at 0.10%. That figure is correct **for its frame**, which is
   High-Court-dominated. It does not hold over the Supreme Court subset — and the
   Supreme Court subset carries **43.9% of all resolved citations**.
4. **This pilot.** The headnote trap is concentrated in exactly the documents the
   citation graph is densest in.

---

## 7. What would have to change before this is worth re-running

Not proposed as work for this sprint — recorded so the next attempt does not
repeat this one:

- **bind the treatment verb to a citation grammatically**, not by proximity.
  Until that exists, §4.1 caps precision regardless of vocabulary;
- **drop `set_aside`** from citation-treatment vocabulary entirely;
- **detect reporter apparatus by structure** — running heads, margin letters,
  pin-cite brackets — not by the word `HEADNOTE`;
- **exclude the SCR-formatted Supreme Court subset** or handle it as reporter
  text, pending §6.1;
- keep the pre-registered bar at **≥95% with zero false `overruled`**. A false
  LAW MOVED badge is indistinguishable to an advocate from a hallucination, and
  `docs/CITATION_HARNESS.md` sets the threshold for that at zero.

The 75 candidates and their full context are retained in
`treatment-enrichment-pilot.json` so a human adjudicator can work through the
remaining 64 without re-running anything.
