# DEVANAGARI EXTRACTION DEFECTS — CHARACTERISED, AND IT IS NOT (ONLY) VISUAL ORDER

**Owner: NEW2 (ingestion lane), Track D.** Measured 17 August 2026 against the
local database after NEW1's post-migration gate exited and the cluster went idle.
Read-only; nothing was written.

LCC's finding (`docs/CURRENT_PLAN.md`, open item 2) is that tsvector tokenisation
differs on **119 of 28,425** sampled rows with `full_text` byte-identical by md5,
and attributes it to *"malformed visual-order Devanagari from PDF extraction
meeting a different character classification"*. This is the characterisation the
mission asked for: by court, by year, by extractor, by frequency.

**The frequency is far higher than 119/28,425 suggests, and the mechanism is
three defects rather than one.** Neither statement contradicts LCC: they measured
*tokenisation divergence between two servers*, which only shows up where the two
`unicode` versions disagree. This measures *the text itself*.

---

## 0. A FALSE READING I PRODUCED FIRST, AND WHY IT IS IN THIS FILE

The first version of this measurement reported **376 of 3,695 documents (10.2%)
carrying Devanagari and 141 showing visual-order markers**. Both figures are
wrong by more than an order of magnitude. The real figures are **0.58%** and a
different denominator entirely.

**Cause: the Devanagari character classes never reached Postgres.** The regex was
written as literal Devanagari inside a `psql -c` argument passed through Git Bash
on Windows, and the non-ASCII bytes were mangled in transit. The resulting class
matched arbitrary Latin-1 and control bytes, so it "found" corruption in
documents containing no Devanagari at all — the samples it returned were
`\b`, `#`, `%` garbage and one Kruti-Dev-style legacy font bleed.

**Every pattern in this file is now built with `chr(2304)`, `chr(2431)`,
`chr(2366)`, `chr(2380)` — pure ASCII SQL, no non-ASCII byte crossing a shell
boundary.** The results below are from those. Two further self-corrections in §2.

This is the failure mode `lawmind-encoding-false-alarms` warns about, arriving
from the opposite direction: not mojibake that is really fine, but a *filter*
that was silently mojibake and therefore measured nothing it claimed to.

---

## 1. HOW COMMON IS DEVANAGARI AT ALL

**0.54%–0.58% of documents contain any Devanagari codepoint** (U+0900–U+097F).
Two independent samples: 20 of 3,431 (0.58%) and 395 of a 1% systematic sample.
Against 7,296,068 rows that is **roughly 40,000 documents**.

Small as a share of the corpus, and not small as a population — and every one of
them is in the language half of the product that has a hard rule attached
(`CLAUDE.md`: Hindi renders in Noto Sans Devanagari everywhere including PDF
export).

---

## 2. THE THREE DEFECTS, MEASURED SEPARATELY

1% systematic sample, restricted to the **395** documents containing Devanagari:

| defect | documents | share of Devanagari docs |
| --- | --- | --- |
| **orphaned matra** — a dependent vowel sign at a token boundary, detached from its consonant | 186 | **47.1%** |
| **control character adjacent to Devanagari** (excluding tab/LF/CR) | 106 | **26.8%** |
| **Latin-1 bleed** — a U+00A0–U+00FF character inside a Devanagari run | 54 | **13.7%** |
| **any of the three** | **257** | **65.1%** |

**Two of those three numbers are corrections to my own first pass**, and both
errors ran the same way — a test that matched almost everything and therefore
measured nothing:

- **Control characters read 378 (92.6%) before `[[:cntrl:]]` was narrowed.**
  POSIX `[[:cntrl:]]` includes tab, LF and CR, so the test was matching every
  Devanagari document that contains a newline. Excluding U+0009/000A/000D takes
  it to 106.
- **A "literal `\n` never decoded" defect read 397 (97.3%) and is not real at
  all.** `LIKE '%\n%'` treats backslash as LIKE's escape character, so the
  pattern meant "contains the letter n". Re-tested with
  `strpos(full_text, chr(92) || 'n')`: **0 documents.** The `\n` I had seen in a
  sample was Python's repr of a genuine newline. Withdrawn.

---

## 3. WHAT THE DEFECTS ACTUALLY LOOK LIKE — codepoints, not adjectives

Read out of real rows and dumped as codepoints, because the terminal cannot be
trusted to render this and a screenshot of mojibake proves nothing.

**Orphaned matra — Allahabad High Court**

```
U+002E  U+0020  U+092A  U+094D  U+0930  U+0020  U+093E  U+0020  U+0925 …
   .      SP      PA    VIRAMA    RA      SP    SIGN AA   SP     THA
```

`प्रा` has become `प्र` + space + `ा` + space. The vowel sign is not
*reordered*, it is **detached and floated between two spaces**. Any tokeniser
sees a one-character token that is a combining mark, and the word it belonged to
is now a different word.

**Control character where a consonant should be — High Court of Rajasthan**

```
U+0932  U+0020  U+0015  U+0947  U+0020  U+0905  U+092C  U+0940 …
  LA      SP    <ctrl>  SIGN E    SP      A       BA    SIGN II
```

The base consonant is **gone**, replaced by a raw control byte, with its vowel
sign left behind. This is worse than the first class: the first misplaces
information, this destroys it. **No re-ordering pass can repair it and no
tokeniser change can either — it needs re-extraction or OCR.**

**Latin-1 bleed — High Court of Rajasthan**

```
U+0930  U+093E  U+091C  U+00E8  U+0925  U+093E  U+0928
  RA   SIGN AA    JA    è LATIN   THA   SIGN AA   NA
```

A Latin-1 byte sitting mid-word inside a Devanagari run — the signature of an
8-bit legacy font (Kruti Dev / Chanakya family) whose bytes were passed through
instead of mapped.

---

## 4. BY COURT — AND RAJASTHAN IS ALMOST TOTAL

| court | Devanagari docs | defective | % | years seen |
| --- | --- | --- | --- | --- |
| **High Court of Rajasthan** | 127 | **121** | **95.3%** | 2013–2026 |
| High Court of Chhattisgarh | 43 | 33 | 76.7% | 2023–2026 |
| High Court of Uttarakhand | 8 | 6 | 75.0% | 2023–2026 |
| High Court of Jharkhand | 15 | 10 | 66.7% | 2023–2026 |
| High Court of Himachal Pradesh | 3 | 2 | 66.7% | 2022–2025 |
| Bombay High Court | 16 | 9 | 56.3% | 2014–2026 |
| High Court of Delhi | 4 | 2 | 50.0% | 2019–2024 |
| High Court of Madhya Pradesh | 5 | 2 | 40.0% | 2017–2023 |
| **Allahabad High Court** | 134 | 47 | **35.1%** | 2022–2026 |
| Patna High Court | 5 | **0** | **0.0%** | 2022–2026 |
| High Court of Andhra Pradesh | 2 | 0 | 0.0% | 2025 |

**Rajasthan at 95.3% is effectively total** and spans 2013–2026, so it is a
property of that registry's PDF production rather than of one bad year.
**Allahabad carries the largest absolute Devanagari population** (134 of 395
sampled) at a much lower 35.1%.

**Patna is 0 of 5.** Too small to conclude from, and worth naming anyway: it is
the one court in the sample with no defect at all, which makes it the natural
control if anyone wants to know what a clean Devanagari extraction from this
pipeline looks like.

### The extractor is a constant, not a variable

**`text_extraction_method` is `unpdf` on every single Devanagari-bearing document
in the sample — all 395, every court, every year.** No `pdftotext_fallback`, no
OCR.

That is the single most useful line in this file. It means:

- **The defect cannot be attributed to extractor choice from this data**, because
  there is no variation to attribute it to.
- **It also means the alternative has never been tried on these documents.**
  `enrich-cli.ts` records `pdftotext_fallback` on **0** rows corpus-wide, so the
  fallback path exists and has never run against the population that most needs
  it.

The mission's instruction is *"test embedded text, pdftotext, OCR when genuinely
required"* and *"never replace better source text with worse text"*. The
experiment that follows from this table is small and specific: **take the
Rajasthan population, re-extract with Poppler, and compare defect rates on the
same documents.** If Poppler is clean, the repair is a re-extraction pass over
~40,000 documents and not an OCR programme. If Poppler shows the same control
bytes, the loss is in the PDF and OCR is the only route.

**That experiment is not run here** — it needs document fetches at a scale that
belongs after the cutover, alongside the page-furniture work.

### ANSWERED 17 Aug 2026 — and it is a third outcome neither branch predicted

CX1 ran it on a deterministic 32-document sample
(`docs/ai/CX1_DEVANAGARI_BAKEOFF.md`, evidence in
`docs/ai/cx1-devanagari-results/bakeoff-results.json`). Poppler is not clean and
it does not show the same control bytes. **It returns no Devanagari at all.**

| extractor | Devanagari tokens | orphaned matras | control adjacency | Latin-1 bleed | p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `unpdf` (current) | 28,285 | 1,986 | 546 | 69 | 26.7 ms |
| Poppler `pdftotext` | **0** | 0 | 0 | 0 | 36.0 ms |
| Tesseract `hin+eng` | 1,146 | 2 | 0 | 0 | 4,338 ms |

**32 of 32 documents came back with zero Devanagari tokens**, and 27 of 32
outputs are pure ASCII (`bytes === chars`). On one Allahabad 2023 judgment
`unpdf` returned 138,406 characters carrying 17,869 Devanagari tokens; Poppler
returned 31,476 carrying none.

So the re-extraction branch of the hypothesis is dead: **there is no cheap
Poppler repair for this population.** The 121 defective Rajasthan documents and
the 47 Allahabad ones are an OCR question, at roughly 120× the per-document cost,
and OCR's own 84.9% token retention on the eight routed documents means it cannot
be called semantically equivalent either. It is a targeted recovery path.

**The dangerous half of this result is that "0 defects" reads as a win.** Every
defect metric here counts events *inside* Devanagari text, so deleting the script
scores perfectly on all three. Two consequences, both now closed:

1. `bakeoff-results.json` recorded `orphanedMatras: 0` for Poppler with no
   usability flag, so a reader integrating from the JSON rather than CX1's prose
   would have got the opposite of the right answer. The aggregate now carries
   `usable` and `devanagariDropped`; rescore an existing run with
   `node scripts/cx1-devanagari-bakeoff.mjs --reaggregate <results.json>`.
2. **`reextract-cli.ts` routes corrupt documents to Poppler and would have
   written the result.** Its two guards cannot see this: `classifyCorruption` is
   built on `[A-Za-z]` token shapes and ten English probe words, so ASCII-only
   Poppler output scores CLEAN — correctly, by the only question it asks — and
   "never shorter" fails because deleting Devanagari does not always shorten the
   file. Document `04ceaa01` (Allahabad 2026) went from 2,252 characters with 8
   Devanagari tokens to 2,314 with none: longer, clean, missing its Hindi, and
   `UPDATE judgments SET full_text` writes over the only copy. `script-retention.ts`
   now gates that write, with a test that asserts `classifyCorruption` would have
   let it through.

---

## 5. WHAT THIS DOES NOT ESTABLISH

- **It does not contradict LCC's 119/28,425.** They measured tsvector divergence
  between two servers; that only appears where two `unicode` builds disagree, and
  is a strict subset of malformed text. Both numbers are right about different
  questions, and the second one is the one that matters for retrieval quality.
- **"Visual order" is not confirmed as the mechanism.** What the codepoints show
  is *detachment*, *character loss* and *Latin-1 bleed*. A genuinely visual-order
  stream would put the matra **before** its consonant with no space between; the
  Allahabad example puts it after, with spaces on both sides. The distinction
  matters because reordering is repairable by a normalisation pass and character
  loss is not.
- **1% systematic sample.** `TABLESAMPLE SYSTEM` samples pages, not rows, so
  documents cluster by physical locality and the per-court figures carry more
  uncertainty than the totals. Rajasthan's 95.3% and Allahabad's 35.1% are far
  enough apart to survive that; Patna's 0/5 and Andhra's 0/2 are not.
- **No repair was attempted and no text was modified.** `raw_full_text` survives
  under LCC's furniture verdict (bus 0582), and the same rule applies here: any
  repair lands in a derived column with its provenance recorded, never over the
  source.
