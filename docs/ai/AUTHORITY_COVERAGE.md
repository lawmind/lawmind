# What legal authority do we actually possess?

**Measured against production 11 Aug 2026.** This phase's question, answered:
*exactly what do we hold, what do we not, and what does our own primary-source
corpus tell us we are missing?*

---

## The four states, kept distinct

> **RAW DOCUMENT ≠ AUTHORITY ≠ RESOLVED AUTHORITY ≠ HELD AUTHORITY**

| | |
| --- | --- |
| **raw documents**, High Court | 40,980 |
| ⤷ **candidate authorities** (`decided`) | 2,410 |
| ⤷ **unique** after deduplication | **2,249** |
| **held**, Supreme Court | 38,342 |

"40,980 High Court judgments" remains false. 5.5% of those documents are
candidate authorities, and **97.4% of them are Patna High Court, 95% from 2026**
(`HC_CORPUS_QUALITY.md`).

---

## 1 · Citation resolution — what the HC corpus points at

6,500 citation edges were extracted from the High Court corpus, where there had
been **zero** because the pass had never run.

| status | edges | distinct targets |
| --- | --- | --- |
| **resolved to a HELD authority** | **2,011** (30.9%) | 514 |
| valid identifier, **not resolvable with the current concordance** | 4,485 | 1,274 |
| unrecognised citation shape | 4 | 3 |

**2,011 was 144 an hour earlier.** Nothing was acquired: the resolver had never
run against the newly extracted edges, and 1,867 of them matched aliases already
in `judgment_citation_aliases`. **A 14× gain from data we already held.**

### The label that must not be used

The middle row is **not** "document not held". Whether we hold those judgments is
**UNKNOWN**, and the distinction is the whole point of this phase:

- **4,485 of the 4,489 unresolved edges point at Supreme Court reporters** —
  3,571 SCC, 878 AIR. Only 4 point anywhere else.
- **Every one of our 38,342 Supreme Court judgments carries an S.C.R. citation.
  Zero carry SCC. Zero carry AIR.**

So a High Court citing `(2006) 4 SCC 1` is very likely citing a judgment sitting
in our corpus under `[2006] X S.C.R. Y`. **We cannot join them, and that is a
concordance gap, not a coverage gap.** Recording it as "not held" would convert
an unknown into a false negative — the exact failure this product exists to
prevent, at the level of our own inventory.

---

## 2 · The missing-authority map, ranked

Ranked by citing documents — the only ranking currently defensible, since we
cannot resolve identity for these targets.

| citation | reporter | year | citing documents |
| --- | --- | --- | --- |
| (2025) 4 SCC 78 | SCC | 2025 | 89 |
| (2013) 1 SCC 353 | SCC | 2013 | 75 |
| (2006) 4 SCC 1 | SCC | 2006 | 66 |
| (2018) 6 SCC 21 | SCC | 2018 | 62 |
| (1998) 7 SCC 123 | SCC | 1998 | 57 |
| (1992) 4 SCC 99 · (1994) 2 SCC 401 · (2000) 7 SCC 521 … | SCC | various | 56 each |

**Corpus-wide the same shape holds: 122,851 unresolved edges across 57,947
distinct targets.** The High Court slice is 3.7% of it.

**Strategic value cannot yet be ranked by treatment or precedential weight**,
because those require resolving the target first. Citing-document frequency is
what is honestly available, and it is recorded as such.

---

## 3 · The concordance is exhausted from our own corpus

`concordance-cli` mines pairings courts print themselves —
`AIR 1980 SC 791 : [1980] 2 SCR 1067` — and turns them into aliases. Re-run over
the corpus **including the 40,980 newly ingested High Court documents**:

    1,438 pairings corroborated by 2+ citing judgments
    3 of 1,404 SCR keys exist in our corpus
    ALIASES READY: 3

**Three.** High Court bail orders cite SCC and AIR but rarely print the S.C.R.
equivalent beside them, so the trick that worked on Supreme Court text does not
work here. Applied anyway; the yield is what it is.

**This is the finding that decides the next move**: the remaining 1,274 targets
cannot be resolved from text we already hold. They need either an external
SCC/AIR↔SCR concordance, or acceptance that they stay unresolved.

---

## 4 · What must not be concluded

- **An unresolved citation is not a nonexistent authority.** 4,485 of them
  almost certainly name judgments we hold under a different reporter.
- **Citation extraction is not proof an authority exists in our corpus.** It is
  proof a court referred to something.
- **The 2,249 candidates are not established as genuine reasoned judgments.**
  They are documents whose `disposal_nature` and length are consistent with a
  merits decision, corroborated by citing at 26.2% against bail's 1.9%. That is
  evidence, not proof.
- **This is not broad High Court coverage.** It is Patna, 2026.

---

## 5 · Next, in order

1. **Duplicate collapse at retrieval time** — 1,476 HC rows sit in
   `document_duplicate_members`, retrieval reads that table nowhere, and the
   same document can occupy several of five result slots. Not started.
2. **Decide the SCC/AIR concordance question.** Resolving 1,274 targets — and
   57,947 corpus-wide — is worth more than any ranking change, because it
   converts *unknown* into *held* or *genuinely missing*. An external
   concordance source is a licensing question, not an engineering one.
3. **Only then the HC indexing experiment**, scoped to ~2,249 unique candidates
   rather than 40,980 rows. **No embedding has been run and RRF is unchanged.**
