# SHARED_NEUTRAL_RCA_V1 — R8.1 §7.5

**Lane:** NEW2 · **26 August 2026**
**The shared-neutral defect is not our defect. In 8 of 8 worst groups across 8 High Courts, the court printed the shared citation itself.**

**Artifacts** — `scripts/n2-shared-neutral-rca.mts` · `docs/ai/new2-r8/shared-neutral-rca.json`

---

## 1. The population, split structurally first

**155,387 neutral citations are shared by 361,044 judgments.** Worst group: 1,257.

Classifying every group by its internal structure — the discriminator is
`content_hash`, because one hash across many case numbers is a common order
legitimately sharing a citation:

| class | groups | judgments | worst |
| --- | ---: | ---: | ---: |
| `COMMON_ORDER_SHARED_ORDER` — one text, many case numbers | **80,224** | **192,939** | 845 |
| `DISTINCT_TEXTS` — many texts under one citation | **74,377** | **160,153** | 1,257 |
| `MIXED_PARTIAL_DUPLICATION` | 778 | 7,931 | 1,058 |
| `CROSS_COURT_COLLISION` | **5** | **12** | 4 |
| `UNKNOWN_NO_HASH` | 3 | 9 | 3 |

Two findings before any refetch:

- **53.4% of the shared population is already explicable** as one order disposing
  of many connected matters. `2025:CGHC:57112` is 845 judgments, 845 case
  numbers, **one content hash**.
- **Cross-court collision is 5 groups and 12 judgments.** The failure mode that
  would be most dangerous for the resolver — two different courts' judgments
  colliding on one key — is essentially absent.

---

## 2. The obvious reading of `DISTINCT_TEXTS` is wrong, and the source says so

74,377 groups have genuinely different texts under one citation. The natural
conclusion is that the citation is wrong on most members — our extractor or the
source metadata put it there.

§7.5 says **do not extrapolate cause before evidence**. So: eight groups, one
per court, the worst in each, two documents each, refetched from the canonical
S3 source and read.

| group | docs | court | verdict |
| --- | ---: | --- | --- |
| `2025:AHC-LKO:30511` | 1,257 | Allahabad | **`DOCUMENT_PRINTED_VALUE`** |
| `2025:PHHC:052490-DB` | 253 | Punjab & Haryana | **`DOCUMENT_PRINTED_VALUE`** |
| `2024:MHC:1405` | 150 | Madras | **`DOCUMENT_PRINTED_VALUE`** |
| `2025:CGHC:16566` | 135 | Chhattisgarh | **`DOCUMENT_PRINTED_VALUE`** |
| `2025:RJ-JP:35135-DB` | 132 | Rajasthan | **`DOCUMENT_PRINTED_VALUE`** |
| `2024:DHC:5411-DB` | 107 | Delhi | **`DOCUMENT_PRINTED_VALUE`** |
| `2025:KHC:28074` | 49 | Karnataka | **`DOCUMENT_PRINTED_VALUE`** |
| `2025:GAU-AS:16697` | 21 | Gauhati | **`DOCUMENT_PRINTED_VALUE`** |

**8 of 8. Zero `EXTRACTOR_WRONG`. Zero `SOURCE_METADATA_WRONG`.**

The PDF prints the citation on its face. Allahabad:

```
Neutral Citation No. - 2025:AHC-LKO:30511
Court No. - 3
Case :- WRIT - A No. - 12720 of 2024
Petitioner :- Ramesh Chandra Dwivedi
Hon'ble Rajesh Singh Chauhan,J.

Disposed of, vide my order of date passed on separate sheets in
Writ-A No. 5617 of 2024, Dr. Om Prakash Srivastava and Others Vs. State of U.P.
```

Different petitioner, different counsel, different writ number — **and the same
neutral citation, assigned by the Registry, because all 1,257 were disposed by
one order and issued on separate sheets.**

---

## 3. What this actually means

**A neutral citation is not a unique identifier in India.** It identifies a
*disposal event*, and an Indian High Court routinely disposes of hundreds of
connected matters in one event while issuing each party their own sheet.

That is a fact about Indian practice, not about our pipeline, and it belongs in
`DOMAIN_TRUTH.md` rather than in a defect register.

Consequences, in order of how much they change:

1. **There is nothing to repair here.** The corpus faithfully records what the
   court printed. A "fix" that de-duplicated or re-assigned these citations
   would be falsifying the record.
2. **`AMBIGUOUS` is the correct resolver answer** and the only correct one. This
   removes the last argument for making the resolver "smarter" about picking
   rank 1 — there is no right answer to pick.
3. **The product copy is wrong in a way that matters.** "We could not confirm
   which case this is" is false; the truth is "this citation covers a batch of
   connected matters". The first sounds like our failure, the second is the
   court's design. That is NEW3/RCC's, and it changes what a user does next —
   from distrusting us to reading a list.
4. **G1's "no materialized target on a known-ambiguous citation key" is
   reinforced**, not weakened. §7.3's 4,688 unsafe pins should still be cleared;
   this explains *why* they were never resolvable.

`DISTINCT_TEXTS` is renamed **`COMMON_ORDER_DISTINCT_DOCUMENTS`** — one order,
many separate sheets, one citation. My original class name asserted a defect the
primary source refutes.

---

## 4. An error of mine that the better tool caught

Reading the Madras PDF by hand with a grep for the literal words `neutral
citation` adjacent to a number, I found none, and concluded *"the Madras PDF
prints no neutral citation at all — a different cause from Allahabad."*

**That was wrong.** The script's pattern searches for the citation *format*
anywhere in the document, and found `2024:MHC:1405` printed. Madras does not use
the `Neutral Citation No. -` label Allahabad uses; the value appears elsewhere on
the page.

**My ad-hoc grep encoded one court's layout as if it were the format.** Had I
stopped there I would have reported two causes where there is one, and sent
someone hunting a Madras-specific extractor bug that does not exist.

This is the fifth time this session that a narrower-than-reality pattern produced
a clean, confident, wrong answer without erroring.

---

## 5. What is deliberately not claimed

- **Eight groups is not a rate.** This tells apart "the court assigned it" from
  "we assigned it" for the worst groups. It does **not** say 100% of the 74,377
  are court-assigned, and some genuinely broken ones almost certainly exist.
- **`NOT_PRINTED_IN_DOCUMENT` would not have separated `SOURCE_METADATA_WRONG`
  from `EXTRACTOR_WRONG`.** Both leave the document silent, and telling them
  apart needs the parquet row, which this script does not read. It never came
  up, because the count was zero.
- **Magic bytes are checked before any verdict**, because a soft 404 can arrive
  as HTTP 200 with `Content-Type: application/pdf`; and `NO_TEXT_LAYER` is a
  separate verdict, because an empty extraction and a silent document read
  identically.
- Evidence retained per §7.5: source URL, SHA-256 prefix, byte count, extracted
  character count, fetch time and a 90-character excerpt, per document.

---

## 6. State

| item | state |
| --- | --- |
| population 155,387 keys / 361,044 judgments | **`PROVEN`** |
| structural split, whole population | **`PROVEN`** |
| cross-court collision is 5 groups / 12 judgments | **`PROVEN`** |
| worst groups are court-assigned, not ours | **`PROVEN`** at 8 of 8, 8 courts |
| rate at which the whole 74,377 is court-assigned | **`NOT_MEASURED`** — 8 groups is not a rate |
| `SOURCE_METADATA_WRONG` vs `EXTRACTOR_WRONG` | **`NOT_APPLICABLE`** here — zero silent documents |
| "a neutral citation is a unique identifier" | **`FALSE`** — belongs in `DOMAIN_TRUTH.md` |
| corpus mutated | **none.** Zero writes. |
