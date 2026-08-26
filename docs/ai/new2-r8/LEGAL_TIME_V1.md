# LEGAL_TIME_V1 — R8.1 §7.13

**Lane:** NEW2 · **26 August 2026**
**The older an authority is, the more it is cited, and the less we can trust its date. Pre-1970 highly-cited authorities are 43.9% `DATE_SUSPECT`.**

---

## 1. The good news first: the checked slice is the right slice

Only **3.81%** of the corpus has a date verdict — 713,136 of 18,698,984. The
obvious worry is that the checked 3.81% is an arbitrary slice and the
authorities that matter were missed.

They were not.

```
highly-cited authorities (>=5 inbound resolved citations)   7,018
  with a date verdict                                       7,018
  DATE_UNCHECKED                                                0
```

**Every single one is checked.** Whoever ran the date verifier aimed it at the
right population. That is worth recording because it is the opposite of what
`OCR_PRIORITY_QUEUE_V1` found for damage coverage, and it means the remaining
96.19% is a moat problem rather than a release blocker.

---

## 2. The bad news: the high-value population is three times worse

| population | `DATE_SUSPECT` |
| --- | ---: |
| corpus-wide, among checked | **4.68%** |
| **highly-cited authorities** | **13.3%** (931 of 7,018) |

And within highly-cited, it is entirely an age effect:

| era | highly-cited | suspect | rate |
| --- | ---: | ---: | ---: |
| **pre-1970** | 1,354 | **595** | **43.9%** |
| 1970–1989 | 1,347 | 117 | 8.7% |
| 1990–2009 | 1,750 | 85 | 4.9% |
| 2010+ | 2,567 | 134 | 5.2% |

**Pre-1970 is 43.9% — nine times the corpus rate.**

Full state distribution for the highly-cited population: 5,737 `DATE_VERIFIED`
(81.7%), 931 `DATE_SUSPECT` (13.3%), 350 `DATE_UNKNOWN` (5.0%).

---

## 3. Why this is a G4 problem and not a metadata nit

Pre-1970 is where the foundational authorities live — the constitutional
benches, the cases that anchor a doctrine and get cited for fifty years. They
are the **most cited** part of the corpus and the **least date-trustworthy**.

Everything temporal is built on that date:

- **"the later authority"** — which of two cases is later is a date comparison,
  and 44% of the time one side of that comparison is doubtful;
- **as-of / point-in-time search** — filtering "law as it stood in 1985" ranks on
  a field we doubt;
- **treatment chronology** — R8.1 §7.10's replacement architecture lists
  chronology as a binding step, and a chronology built on suspect dates
  manufactures the same false confidence the proximity architecture did;
- **statute transition** — whether a judgment predates or postdates the
  BNS/BNSS/BSA cutover of July 2024 is a date question. That one is safe here,
  since the 2010+ era is only 5.2% suspect, but the same machinery answers both.

**`DATE_SUSPECT` must reach the surface as uncertainty, not be silently used for
ordering.** G4 already says date absence is `DATE_UNCHECKED`; this says
`DATE_SUSPECT` on a heavily-cited old authority is the more dangerous state,
because absence is visible and suspicion is not.

---

## 4. The §7.13 priority queue, and it is small

§7.13 asks to prioritise treatment edges, top cited authorities, Gold targets,
new ingest and the statute transition. Measured against that order:

| priority | population | state |
| --- | --- | --- |
| top cited authorities | 7,018 | **fully checked**; 931 suspect need adjudication |
| **pre-1970 highly-cited** | **1,354** | **595 suspect — the actual work** |
| treatment edges | — | endpoints are a subset of top-cited; covered |
| Gold targets | 430 live | `NOT_MEASURED` here |
| new ingest | — | `NOT_MEASURED`; the corpus is 56 days behind anyway (`SOURCE_FRESHNESS_R8`) |
| statute transition | 2010+ | 5.2% suspect — lowest-risk era |

**The release-critical work is 595 documents.** Not 18 million, not 713,136 —
595 pre-1970 heavily-cited authorities whose date we already know we doubt.

That is the same shape as `OCR_PRIORITY_QUEUE_V1`: the corpus-wide number is
enormous, the release-critical number is small, and the two are only connected
by an assumption nobody measured.

---

## 5. What is not claimed

- **The verifier's own precision is `NOT_MEASURED`.** `DATE_SUSPECT` is that
  method's verdict, not adjudicated truth. 43.9% could partly be the verifier
  failing on old typography rather than the dates being wrong — and pre-1970
  documents are exactly where extraction is hardest. **Either way it is a
  refusal to trust the date, which is the correct behaviour; but "43.9% of these
  dates are wrong" is NOT what this says.**
- **`DATE_UNKNOWN` (5.0%) is UNKNOWN**, not a soft pass and not a suspect.
- **The 96.19% unchecked is `DATE_UNCHECKED`** and must render as such. It is
  not evidence of good dates.
- **Gold targets and new ingest were not measured** for date coverage. Both are
  cheap and neither is done.

---

## 6. State

| item | state |
| --- | --- |
| every highly-cited authority has a date verdict | **`PROVEN`** — 7,018 of 7,018, zero unchecked |
| highly-cited suspect rate 13.3% vs 4.68% corpus | **`PROVEN`** |
| pre-1970 highly-cited 43.9% suspect | **`PROVEN`** |
| release-critical population is 595 documents | **`PASS_AT_MEASURED_SCOPE`** — on this tiering |
| date verifier precision | **`NOT_MEASURED`** — suspect is a refusal, not an adjudication |
| Gold-target date coverage | **`NOT_MEASURED`** |
| statute-section effective intervals | **`NOT_MEASURED`** — §7.13 requires them; statutes are not timeless |
| 96.19% of corpus | **`DATE_UNCHECKED`** — moat, not release |
