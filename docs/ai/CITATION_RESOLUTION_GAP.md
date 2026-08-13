# 14,601 citations point at judgments we hold, and are recorded as unresolved

**13 Aug 2026, LCC.** Found while measuring the citation-year-typo class NEW3's
Sun Export finding implied. Nothing has been written. This is a measurement and
a proposal.

---

## 1 · THE STRUCTURAL FACT NOBODY HAD STATED

    judgments holding an SCC-form reporter citation ......... 0
    judgments holding an S.C.R.-form reporter citation ...... 38,342

**The corpus is keyed entirely on S.C.R. and holds no SCC form at all.** Yet
judgments cite each other overwhelmingly in SCC:

| unresolved citations, by reporter family | |
| --- | --- |
| **SCC** | **323,135** |
| other | 177,489 |
| AIR | 58,009 |
| SCR | 35,913 |
| INSC | 4,213 |

So **323,135 unresolved SCC citations cannot resolve by reporter matching at
all** — there is nothing on the other side to match. `judgment_citation_aliases`
is not an optimisation for that population; it is the **only** bridge that can
ever exist between how judgments cite and how we index.

That reframes the concordance work: it is not a tool for 34 overruled edges, it
is the mechanism for **54% of all real unresolved citations**.

---

## 2 · THE PART THAT NEEDS NO CONCORDANCE AT ALL

The SCR row above is the anomaly: we hold SCR forms, so SCR citations *should*
resolve. Measured with the same `aliasKey()` the concordance uses:

| of 26,177 distinct unresolved SCR-form citations | |
| --- | --- |
| **resolve to EXACTLY ONE held judgment** | **14,601** |
| ambiguous — two or more judgments | **0** |
| no held match | 11,576 |

**Zero ambiguous.** There is no "which one did the advocate mean" problem here;
every one of the 14,601 names precisely one held judgment.

### It is not a timing artefact

The obvious explanation — the cited judgment arrived after the edge was written,
and resolution never re-ran — is **wrong**:

    matchable unresolved edges ......................... 14,737
      cited judgment arrived AFTER the edge ...........      0   (0.0%)
      cited judgment already existed ..................  14,737   (100.0%)

**Every single one had its target already in the corpus at the moment the edge
was recorded.**

---

## 3 · WHAT I HAVE **NOT** ESTABLISHED

**I do not know why the resolver did not link them.** I have shown the data
supports linking — exact key match, single target, no ambiguity — and I have
*not* read the resolution path closely enough to say whether this is a defect, a
deliberate refusal on some signal I have not modelled, or a pass that simply
never ran over this population.

**That distinction decides whether the fix is a re-run or a code change**, and
claiming a defect before reading the code is the mistake I have made repeatedly
today. Stated as an open question rather than a diagnosis.

---

## 4 · PROPOSED, NOT DONE

1. **Read the resolution path** and establish which of the three explanations
   holds. Until that is answered, nothing should be written.
2. **If it is a missed pass:** a re-resolution over the 14,601 is deterministic,
   unambiguous, and needs no model — the largest safe citation-graph improvement
   currently available.
3. **If it is a deliberate refusal:** understand the signal before overriding it.
   A resolver that refuses for a reason I have not modelled is more likely right
   than I am.

**Not written, per the founder's standing instruction.** `cited_judgment_id`
changes what an advocate sees, which puts it in the same class as the
concordance `--apply` that is being held.
