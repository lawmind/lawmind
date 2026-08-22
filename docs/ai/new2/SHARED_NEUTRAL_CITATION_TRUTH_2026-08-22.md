# Shared neutral citations — is our corpus identity wrong, or is the law complex?

**NEW2 · 22 August 2026 · source-document study, answering NEW1 bus 1017.**

NEW1 found at least 100,000 neutral citations naming more than one judgment and
declined to say whether that was the courts or our extractor, because separating
the two needs source documents read against the registry. This is that read.

**The answer is: overwhelmingly the courts, plus a large duplicate-ingestion
problem that has nothing to do with citations — and a small, real, provable
extractor defect that is now measured rather than feared.**

---

## 1. The population, exactly

NEW1's ≥100,000 was a capped count and said so. The true figure:

```
neutral citations carried by more than one judgment      155,388 groups
judgments in those groups                                361,045 rows
largest single group                                       1,257 judgments
judgments carrying any neutral citation                1,370,683 rows
distinct neutral citations held                        1,165,026
```

**26.3% of every citation-bearing row in the corpus shares its citation with at
least one other judgment.** That is the number to hold, not 100,000.

Shape:

```
groups of exactly 2                     146,218   94.1%
groups of 3-9                             8,072
groups of 10-49                             984
groups of 50+                               114
groups whose members are byte-identical  80,224   51.6%
groups spanning more than one court          11
```

Court concentration — Allahabad is 75.3% of all shared rows:

```
Allahabad High Court        130,577 groups / 271,826 rows   worst 1,257
High Court of Rajasthan       9,312 /  34,336               worst   463
High Court of Chhattisgarh    4,406 /  17,180               worst   845
High Court of Karnataka       4,266 /  12,419               worst   129
Gauhati High Court            1,480 /   4,319
High Court of Jharkhand       1,147 /   4,158
High Court of Himachal Pradesh 1,103 /  5,416
High Court of Uttarakhand     1,033 /   3,975
Bombay High Court               767 /   2,286
Punjab and Haryana              382 /   1,528               worst   253
```

Artifact: `docs/ai/new2/shared-neutral-census.json`.

## 2. Where the column comes from — read from the code, not assumed

Before reading any document, the provenance of `judgments.neutral_citation` was
established from the live code, because NEW1's hypothesis (b) named a mechanism
("the extractor picking one citation off a listing page and stamping it across a
batch") that either exists in the code or does not.

**It does not exist.** There are exactly two writers:

- **High Courts** — `neutralCitationFrom()`, `services/ingest/src/harvest/hc-load.ts:217`.
  It takes the **first** `\d{4}:[A-Z]{2,10}:\d{1,6}` match in the **first 3,000
  characters of that document's own extracted text**, and rejects the match
  unless its year equals the document's year or the year before. Its own comment
  states the assumption it rests on: *"The document's own appears in the header,
  so the first occurrence within the opening window is the safe one."*
- **Supreme Court** — `sci.ts:196`, `case_id` verbatim from source metadata.

No listing page is read. No value is copied between rows. So hypothesis (b) as
worded is ruled out by the code, and the only way our extractor can be wrong is
narrower and sharper: **the first citation-shaped token in the opening window is
sometimes not the document's own.** That is the thing this study measures.

## 3. What the source documents say

1,786 groups sampled — stratified by court × group-size band × byte-identity —
and 6,595 individual source documents read. For each document: the byte offset
of the shared citation, how many times it occurs, whether it stands alone on a
line, and 260 characters of surrounding text.

Every row also carries the addendum's evidence class. `full_text` is our
extraction of **that document's own PDF** (`source_url` is unique per row and
points at one order in the authorised bucket), so it is evidence about the
document and not about a collection page — but it is still one inference from
the paper, which is why §4 re-reads the decisive PDFs directly.

Population-weighted over the 361,037 shared rows:

| verdict | share | 95% CI | ~rows |
|---|---|---|---|
| DUPLICATE_DOCUMENT | 53.89% | 53.78–54.00 | 194,577 |
| CONNECTED_MATTER_COMMON_ORDER | 30.74% | 23.22–37.05 | 110,978 |
| MULTIPLE_ORDERS_SAME_CASE | 13.85% | 7.69–21.47 | 50,018 |
| COURT_SHARED_BATCH_CITATION | 0.91% | 0.63–1.31 | 3,296 |
| **EXTRACTOR_STAMP_CONTAMINATION** | **0.11%** | 0.04–0.25 | **414** |
| **NOT_A_CITATION** | **0.10%** | 0.10–0.11 | **366** |
| SOURCE_UNAVAILABLE | 0.06% | 0.05–0.06 | 215 |
| UNDETERMINED | 0.32% | 0.17–0.52 | 1,173 |

Read plainly: **99.4% of shared citations are the courts' own doing or our own
duplicate ingestion. 0.21% is a citation defect, with a further 0.32% we could
not determine from the layout and are not counting either way.**

## 4. The three mechanisms, proven on the paper

The decisive groups were re-fetched from the bucket as PDFs and re-extracted with
**poppler `pdftotext -layout`** — a different tool from the `unpdf` path used at
ingest, so a shared extractor bug cannot produce a shared answer. No OCR was used;
an image-only page would have been reported unavailable rather than guessed at.
Artifact: `docs/ai/new2/shared-neutral-pdf-evidence.json`.

### (a) The court did it — and this is most of it

`2025:PHHC:052490-DB` is carried by **253** judgments. On the paper, in every one:

```
line 1 of 31 :  2025:PHHC:052490-DB
line 2       :  IN THE HIGH COURT OF PUNJAB AND HARYANA AT CHANDIGARH
line 3       :  CWP No.21878 of 2024        <- and 18762, 20344, 16450 ... 253 of them
line 4       :  Date of Decision: 24.04.2025
```

253 connected writ petitions disposed of by one common order on one day, issued
as 253 separate PDFs, each printing the same registry citation as its own. **The
corpus is right.** The product implication is not a fix, it is a feature: this
citation covers 253 connected matters and should say so rather than reading as
ambiguity.

### (b) We did it — and this is rare

`2026:PHHC:027747-DB` is carried by 15 judgments. On the paper, in every one:

```
line 27 of 53 : ... has placed reliance upon the Division Bench judgement of this
                Court in M/s Bansal Casting, S.K. Enterprises Vs. Union of India
                and Another and M/s Shree Ram Industries V/s State of Haryana and
                Another; 2026:PHHC:027747-DB to submit that in such circumstances...
```

It is the citation of the authority all fifteen relied on. Those Punjab & Haryana
orders print **no neutral citation of their own at all** — `position('Neutral
Citation' in full_text)` is 0 in every one of them — so `neutralCitationFrom`
took the first citation-shaped token it found, and that token belonged to
*M/s Bansal Casting*. The header assumption in the function's comment is simply
false for this court's layout.

### (c) It was never a citation

`2011:AUGUST:23` is carried by 10 judgments. On the paper:

```
line 50 of 52 : DM::2011:AUGUST:23::            Crl.O.P.(MD)No.10047 of 2011
                /TRUE COPY/ gsr  SUB ASST REGISTRAR
```

It is the Madras registry's **despatch stamp** — despatched on 23 August 2011 —
matched by a pattern that never asked whether `AUGUST` is a court.
**383 rows corpus-wide** carry a month name in the court-code position, across
all twelve months plus the OCR variants `DEC`, `SEP`, `FEB`, `NOV`, `JAN`, `OCT`,
`JANURARY`, `SEPTEMEBER`, `ARPIL`, `AGT`.

## 5. What the shared-citation study could not see, measured separately

Contamination that **collides** is visible in a duplicate group. Contamination
that does not — one judgment picking up an authority's citation that nobody else
picked up — sits in no group at all and is invisible to §3. That blind spot is
priced by a separate court-stratified random sample of 2,647 documents drawn
from the whole citation-bearing population (`docs/ai/new2/extraction-precision.json`):

```
printed as the document's own          94.85%
another judgment's citation             0.14%   ~1,900 rows
not a citation at all                   0.03%   ~  400 rows
absent from the body text               2.63%   ~36,000 rows  (94% of it Supreme Court,
                                                 where the value legitimately comes
                                                 from source metadata, not the text)
undetermined — layout not yet read      2.35%   ~32,000 rows
```

By court, the differences are large and matter more than the average:

```
court                        rows      own%  another's%  not-a-citation%  undetermined%
Allahabad                 558,920     100.0        0.0             0.0             0.0
Karnataka                 222,912     100.0        0.0             0.0             0.0
Rajasthan                 196,216     100.0        0.0             0.0             0.0
Chhattisgarh              106,868     100.0        0.0             0.0             0.0
Bombay                     57,424      50.0        3.1             0.0            46.9
Punjab and Haryana         56,105      92.5        0.0             0.0             7.5
Jharkhand                  51,195     100.0        0.0             0.0             0.0
Supreme Court              38,215       5.0        0.0             0.0             0.6   (94.4% metadata-sourced)
Delhi                       2,490      87.5        0.6             0.0            11.9
Meghalaya                   1,639      75.6        0.0             0.0            24.4
Madras                        699      26.3       10.0            61.9             1.9
Calcutta                       18      22.2       22.2             0.0            55.6
```

**Madras is the one court whose neutral citations should not be trusted at all**:
62% of its 699 citation-bearing rows are despatch stamps and 10% are other
judgments' citations. **Bombay's 46.9% undetermined is a gap in my reading, not a
finding about Bombay** — its citation sits in a page footer next to `Signed by:`
and `1/1`, a layout I have only partly characterised. It is reported as
undetermined rather than counted as either right or wrong.

## 6. A fourth thing found on the way: OCR-corrupted court codes

The full court-code distribution (83 distinct codes,
`docs/ai/new2/neutral-code-distribution.json`) has a tail that is a catalogue of
extraction damage rather than of courts:

- Rajasthan's `RJ-JP` appearing as `RT-JP` (39), `FU-JP` (16), `EU-JP` (15),
  `RI-JP` (4), `IU-JP` (3), `IW-JP` (2), `EW-JP` (2), `RJJP` (2), `FLJ-JP`,
  `FLT-JP`, `ELT-JP`, `RLJP`, `RJ-JB` (1 each)
- Allahabad's as `AHCLKO`, `AHC-KO`, `AHA`, `AH`, `CHA`
- `INSC` — a **Supreme Court** code — on judgments of **4 different High Courts**
- `NCPHHC`, where the `NC:` label itself bled into the value

Each of these is a citation string that cannot resolve and cannot be searched
for, because it is not what the court printed.

## 7. What this means for other lanes

**For NEW1 (bus 1017).** Your 0.9% of citation queries resolving to 6–20
judgments is, in the overwhelming majority, the registry legitimately giving one
number to a batch of connected matters. `exactCitation` declining to pin on 2+
matches is the right behaviour and stays right. The better product answer is the
one you already guessed: *"this citation covers 253 connected matters"*, not an
ambiguity warning. **Do not deduplicate these groups.**

**For LCC (resolver).** A canonicalizer must not assume a neutral citation
identifies one judgment. In this corpus it identifies a **disposal event**, which
may be one judgment or 1,257. Any resolver that picks a single target on an exact
neutral-citation match is wrong 26.3% of the time by construction. The
ground-truth set in `docs/ai/new2/` is built to fail exactly that.

**Nothing was rewritten, deduplicated or corrected.** This session's contract
forbids it and the founder's direction on corpus identity is not mine to make.

## 8. What is still unknown, stated as unknown

- **Bombay's footer layout** — 46.9% of its citation-bearing rows are
  undetermined. One layout read would close it.
- **The 32,000 undetermined rows corpus-wide** are not evidence of correctness.
- **The 194,577 duplicate-document rows** are a corpus-identity problem in their
  own right and are *not* analysed here beyond being counted. LCC's `e7392c7`
  found the same population from the CNR side (71.3% of Allahabad's one-day-apart
  CNR pairs byte-identical). Those are the same rows. Whoever owns that decision,
  it is a separate one from citations.
- **The PDFs re-read directly number 11**, chosen because each decides a
  different question. The other 6,584 documents were read through our own
  extraction of their own PDFs.
