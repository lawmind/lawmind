# High Court corpus — quality report

**Measured against production 11 Aug 2026**, after classification
(migration `0042`, `services/ingest/src/hc-classify.ts`). Produced before any
index construction, as required.

---

## The headline

> **40,980 documents contain 2,249 unique candidate authorities — 5.5%.**

"We hold 40,980 High Court judgments" is not a true sentence. We hold 40,980
**documents**, of which the large majority are bail orders and procedural
disposals that cannot support a legal proposition.

This lands inside the measured judgment share of 0.75%–18.64%
(`HC_CORPUS_CHARACTERIZATION.md`), near the low end.

---

## 1 · What the documents are

| class | documents | share | mean chars | in a duplicate group |
| --- | --- | --- | --- | --- |
| `bail_order` | **23,194** | 56.6% | 3,300 | 741 |
| *(unclassified)* | 10,828 | 26.4% | 4,645 | 397 |
| `procedural_disposal` | 3,963 | 9.7% | 1,760 | 84 |
| **`decided`** | **2,410** | **5.9%** | **13,464** | 245 |
| `decided_brief` | 453 | 1.1% | 1,196 | 5 |
| `reference_stub` | 132 | 0.3% | 317 | 4 |

**Every rule records which rule fired.** 0 rows carry a class with no method.

**`decided` has a mean of 13,464 characters against the corpus mean of 4,071** —
independent corroboration that the class is picking out documents with room for
reasoning, not just a relabelling.

### The 26.4% left unclassified is deliberate

10,654 rows carry `disposal_nature = 'DISPOSED'`, the most ambiguous value in
the column: it covers a reasoned decision, a consent order and an infructuous
closure alike. **Guessing it into `decided` would have inflated the authority
count by 24% of the corpus on a word that does not mean what the guess needs it
to mean.** 174 more carry no disposal at all. Both stay NULL with a method
naming why — *not classified* must not become *classified as ordinary*.

---

## 2 · Two defects the validation sample caught that the unit tests did not

Both were found by **reading real rows**, after a green test suite.

**1 · 58% of `decided` were bail applications.** The first version classified
every merits disposal as `decided`. The sample came back full of `CR. MISC.`
rows — Criminal Miscellaneous, which in this corpus is overwhelmingly bail.

| | |
| --- | --- |
| CR. MISC. with a merits disposal | 6,598 |
| ⤷ containing an explicit bail phrase | **5,092 (77%)** |
| CWJC (writ) with a merits disposal | 738 |
| ⤷ containing an explicit bail phrase | **1 (0.1%)** |

The CWJC control is what makes it a signal rather than a coincidence. `decided`
fell from 8,748 to 2,410, and its mean length **rose from 6,260 to 13,464** —
exactly what removing short bail orders should do.

**This one rule reads the prose rather than a source field**, so it is recorded
under its own method (`text_bail_phrase`, 6,477 rows) and is the only inference
in the module. Everything else restates `disposal_nature` verbatim.

**2 · `reference_stub` over-fired on Miscellaneous Jurisdiction Cases.** A
1,617-character `MJC/2684/2017 In Civil Writ Jurisdiction Case No.6979 of 2016`
was called a stub, but the reference to another case is the application's
*subject*, not a statement that its own reasoning is elsewhere. The real stubs
measure 171–212 characters. Bound tightened; the class fell 147 → 132 and its
mean length 453 → 317.

---

## 3 · The coverage finding, which is larger than the classification

| court | documents | `decided` |
| --- | --- | --- |
| **Patna High Court** | 39,445 | **2,347** |
| Bombay High Court | 523 | 4 |
| High Court of Gujarat | 497 | 0 |
| High Court of Uttarakhand | 190 | 0 |
| High Court of Punjab and Haryana | 93 | 28 |
| High Court of Kerala | 60 | 24 |
| Calcutta, Orissa, and 12 others | <75 each | 0 |

**97.4% of candidate authorities are Patna High Court.** And by year:

    2026   2,294        2024    48        every year before 2024   68

**95% of them are from 2026.**

> **We do not have a High Court corpus. We have a Patna High Court 2026 slice.**

That is a far more consequential fact than the ranking work that surfaced it.
Any claim about "High Court coverage" — in the product, in marketing, or in an
internal number — has to say Patna and has to say 2026.

---

## 4 · Provenance and quality on the candidate authorities

| | 2,410 `decided` |
| --- | --- |
| CNR | **100%** |
| case number | **100%** |
| parties | **100%** |
| source URL | **100%** |
| content hash | **100%** |
| text quality ≥ 0.90 | 2,364 (98.1%) |
| **neutral citation** | **0** |

Provenance is complete and text quality is good. **Zero neutral citations** is
the gap: these documents cannot be cited by a neutral citation because none was
extracted, so `citationDisplay()` will render every one of them through the
reporter-citation path or as uncitable.

---

## 5 · What must NOT be concluded from this

- **`0 outbound citations` is not evidence these documents cite nothing.**
  Citation extraction has never run on the High Court corpus. It is evidence of
  a missing pass, not of a property of the documents.
- **`unclassified` is not `not an authority`.** 10,828 documents are unresolved,
  and some are certainly reasoned decisions.
- **`bail_order` is not `worthless`.** A bail order is a real judicial act and an
  advocate may well want to search it. It is simply not precedent on a legal
  question, and an index must not present it as one.
- **This is a classification of documents, not a legal weight.** Whether a High
  Court order carries precedential authority is about ratio and reasoning, and
  nothing here decides it.

---

## 6 · Next, in order

1. **Citation extraction on the High Court corpus** — the missing pass. Until it
   runs, "0 citations" stays uninterpretable and the citation graph excludes 52%
   of the corpus by row count.
2. **Collapse duplicate groups in retrieval.** 1,476 HC rows sit in
   `document_duplicate_members` and retrieval reads that table nowhere, so the
   same document can occupy several of five result slots.
3. **Then design the index experiment** — and it should be scoped to the ~2,249
   unique candidate authorities plus whatever citation extraction promotes out
   of `unclassified`, not to 40,980 rows.
