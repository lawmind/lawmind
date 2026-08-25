# STATUTE_SOURCE_RECONCILIATION_R8 — R8.1 §7.15

**Lane:** NEW2 · **25 August 2026**
**Two of the three "missing" criminal codes are obtainable today. The third is genuinely absent, and now for a proven reason rather than a failed query.**

**Artifacts**
- `scripts/n2-statute-source-probe-r8.mts` · `docs/ai/new2-r8/statute-source-probe-r8.json`
- text layers fetched to scratch for measurement; **nothing written to `statutes` or `statute_sections`**

---

## 0. Headline

| Act | references in corpus | R7 verdict | **R8 verdict** |
| --- | ---: | --- | --- |
| **Indian Penal Code, 1860** | 93,881 | `PARTIAL` — ss. 1–120B | **`AVAILABLE_COMPLETE`** — central official PDF, 1,104,850 B |
| **Indian Evidence Act, 1872** | 17,576 | `COMPLETE` (a reprint) / `PROVEN_DAMAGED` (1872 scan) | **`AVAILABLE_COMPLETE`** — central principal Act, 639,810 B |
| **Code of Criminal Procedure, 1973** | **280,027** | `NOT AVAILABLE` | **`CONFIRMED_ABSENT`** — metadata record exists, bitstream does not |

**111,457 of the 391,484 blocked references are unblocked by acquisition alone**,
covering the IPC and the Evidence Act. No permission is missing, no founder
decision is needed, and the artifacts are official Government of India
publications on India Code.

**CrPC 1973 remains the single largest statute gap in the corpus** at 280,027
references across 186,382 judgments.

---

## 1. The finding that would have shipped a 18%-complete Act as complete

India Code serves, next to each Act's PDF, a convenient pre-extracted
`*.pdf.txt` bitstream. **It is hard-truncated at exactly 100,000 characters.**

```
ipc-A1860-45.pdf.txt   101,048 bytes on disk   100,000 UTF-8 characters
iea-A1872-1.pdf.txt    101,130 bytes on disk   100,000 UTF-8 characters
```

Two different Acts, two different byte counts, the same character count to the
digit. That is a platform cap, not a coincidence.

**And the file opens with `ARRANGEMENT OF SECTIONS` — the complete table of
contents — before any body text.** So the truncation removes the END of the Act
while leaving a full index of everything it no longer contains.

### What a heading-count completeness check reports

| | IPC | IEA |
| --- | ---: | ---: |
| distinct section headings found | 569 | 185 |
| highest section number seen | **511** | **167** |
| published section count | 511 | 167 |
| bare-number gaps | **0** | **0** |
| **apparent completeness** | **100%** | **100%** |

### What the document actually contains

| | IPC | IEA |
| --- | ---: | ---: |
| table of contents | chars 0–39,837 | chars 0–13,548 |
| body text | chars 39,837–100,000 | chars 13,548–100,000 |
| **highest section with BODY text** | **98** | **66** |
| **sections with body text** | **92 of 511** | **64 of 167** |
| **real completeness** | **18.0%** | **38.3%** |

Spot checks on the IPC body: **s. 302 (murder) absent · s. 420 (cheating) absent ·
s. 498A (cruelty) absent · s. 511 absent.** On the IEA body: s. 65B (electronic
records) present, s. 114A absent, s. 165 absent.

**A completeness check that counts section headings passes at 100% on a file
holding 18% of the Indian Penal Code.** This is the same failure family as
`text_quality` certifying unreadable documents and `VERIFIED_SEMANTIC_CORE`
reading 0.00% off a NULL column: the metric and the property have come apart,
and only opening the artifact separates them.

I made this error in this session. The first inventory run reported "569 distinct
headings, highest 511, zero gaps" and I was one step from recording
`AVAILABLE_COMPLETE, 511 sections`. What caught it was the byte count — two files
at exactly 100,000 characters — not the section logic.

**Operational consequence: the acquisition target is the PDF, never the
`.pdf.txt`.** §7.15's own instruction — *never mark partial complete* — has a
concrete mechanism behind it now.

---

## 2. IPC 1860 — available, and R7 measured the wrong artifact

| | |
| --- | --- |
| item | `972afbe0-a2de-415d-9df5-8d70038056ad` |
| collection | **CENTRAL** |
| title | The Indian Penal Code, 45 of 1860 (Rep., Act 45 of 2023) |
| PDF | `A1860-45.pdf` — **1,104,850 bytes** |
| text layer | `A1860-45.pdf.txt` — 101,048 B, **truncated, do not use** |
| TOC section inventory | 511 sections, 58 lettered variants, no gaps |
| repeal recorded in the title | Act 45 of 2023 (BNS), i.e. the source states its own currency |

R7 recorded IPC as `PARTIAL — 58 pages, sections 1..120B`. That verdict is
correct **about the artifact R7 examined**, which was
`123456789/547803` — a **Chandigarh state adaptation**, 191,038 bytes. The
central Act is 5.8× larger and is a different document.

**R7's IPC verdict is superseded, not contradicted.** The lane searched by exact
title and took the first item with bitstreams; several items titled exactly "The
Indian Penal Code, 1860" carry **no files at all**, and the one that does was a
state adaptation.

---

## 3. IEA 1872 — available, and it is a third distinct artifact

| | |
| --- | --- |
| item | `b62073e0-4d33-4348-8eda-d92af40af24b` |
| collection | **CENTRAL** |
| title | The Indian Evidence Act, 1872, 1 of 1872 (Rep., Act 47 of 2023) |
| PDF | `A1872-1.pdf` — **639,810 bytes** |
| text layer | `A1872-1.pdf.txt` — 101,130 B, **truncated, do not use** |
| TOC section inventory | 167 sections, 18 lettered variants, no gaps |

R7 examined two other items: `547821` (a reprint, "171 of 183 sections parsed")
and `550883` (the 1872 print scan, `PROVEN_DAMAGED`). This is neither. It is the
principal Act in the CENTRAL collection.

**The 183-vs-167 discrepancy is not resolved here and is recorded as
`NOT_MEASURED`.** R7's reprint TOC listed 183 headings; this artifact's lists
167. One of them counts repealed and omitted sections differently. Determining
which is correct needs both PDFs opened side by side and is not done.

---

## 4. CrPC 1973 — confirmed absent, and the mechanism is now known

R7 said "every exact-title item has zero bitstreams", which is a statement about
one query. Three independent search paths now say the same thing about the
source:

1. **Collection-scoped paging.** The CENTRAL collection returns 378 items
   matching "Criminal Procedure". Filtering to principal Acts — excluding
   amendment, repealing, supplementary and validating Acts — leaves **five**:

   | Act | file | bytes |
   | --- | --- | ---: |
   | Code of Criminal Procedure Act **1861**, 25 of 1861 | `A1861-25.pdf` | 9,884,393 |
   | Code of Criminal Procedure Act **1872**, 10 of 1872 | `A1872-10.pdf` | 9,321,998 |
   | Code of Criminal Procedure Act **1882**, 10 of 1882 | `A1882-10.pdf` | 46,302,537 |
   | Code of Criminal Procedure Act **1898**, 5 of 1898 | `A1898-5.pdf` | 30,997,240 |
   | *(postponement Act, 1872)* | `A1872-17.pdf` | 22,925 |

   **The 1973 Code is not among them.** India Code holds every Code of Criminal
   Procedure India has ever had *except* the one in force for the last fifty
   years.

2. **Cross-collection title search.** Two items exist in the collection `Acts`
   titled exactly **"The Code of Criminal Procedure, 1973"** —
   `1f3fe54b-4d0c-46fe-b447-78039bf89aa2` and
   `4162be1c-914b-46a2-b62f-5f1114e76462`. **Both carry zero bitstreams.** The
   catalogue record exists; the document does not.

3. **Amendment Acts are all present.** `A2010-41`, `A1990-10`, `A1956-39` and
   thirty-odd others resolve with files. The amendments to a document the
   platform does not hold are individually downloadable.

`CONFIRMED_ABSENT` rather than `NOT_MEASURED`: three paths, one answer, and the
zero-bitstream records name the mechanism.

---

## 5. The two hosts §7.15 named that this repo had never probed

| host | verdict | note |
| --- | --- | --- |
| `legislative.gov.in` root | `HTML_OK` 6,593 B | reachable, real content, **not yet mined** |
| `legislative.gov.in/documents/acts/` | `HTML_OK` 7,698 B | the A2Z central Acts index — next probe target for CrPC |
| `www.indiacode.nic.in` | `HTML_OK` 2,009 B | legacy host; R7 saw 404s on deep handles |
| `egazette.gov.in` root | **`NO_RESPONSE`** | DNS/TLS failure, twice, ~25 s timeout |
| `egazette.gov.in` search entry | **`NO_RESPONSE`** | same |

**eGazette is unreachable from this machine and that is recorded as
`NO_RESPONSE`, not as "the source does not have it".** A network failure and an
absent document are different facts and only one of them is about the source.

The Legislative Department is reachable and unmined. That is the most promising
remaining route to a 1973 CrPC and it is the next §7.15 step, not a founder item.

---

## 6. What did NOT happen here

- **No writes to `statutes` or `statute_sections`.** Zero. This is acquisition
  evidence, not acquisition.
- **No PDF was ingested.** Only the two truncated text layers were fetched, and
  only to measure them; both are now known to be unusable for ingest.
- **No rate limit was approached.** One request at a time, 1.2 s apart, ~60
  requests total across the whole probe.
- **No section was interpolated.** Every count above comes from what the artifact
  prints. The published totals (511, 167) are the source's own table of contents,
  not this lane's assumption.

---

## 7. State

| item | state |
| --- | --- |
| `.pdf.txt` 100,000-character truncation | **`PROVEN`** — two files, exact same character count, body ends mid-Act |
| heading-count completeness is vacuous on these files | **`PROVEN`** — 100% apparent, 18.0% real for IPC |
| IPC 1860 obtainable | **`PROVEN`** — central item, 1,104,850 B PDF |
| IEA 1872 obtainable | **`PROVEN`** — central item, 639,810 B PDF |
| CrPC 1973 on India Code | **`CONFIRMED_ABSENT`** — three paths, zero-bitstream records |
| IEA 183-vs-167 section count | **`NOT_MEASURED`** |
| Legislative Department holdings | **`NOT_MEASURED`** — reachable, unmined, next step |
| eGazette | **`NO_RESPONSE`** — network, not a source verdict |
| PDF text extraction recall | **`NOT_MEASURED`** — needs the PDFs and a Devanagari-safe extractor |
