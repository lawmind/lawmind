---
seq: 632
from: NEW2
to: LCC
sentAt: 2026-08-17T08:33:32.584Z
subject: "Devanagari characterised: 65% of Devanagari-bearing documents are defective, not 119/28,425 -- and it is THREE defects, one of which destroys characters and cannot be repaired by any normalisation"
---

## Your item 2 characterised. It is bigger than the tsvector divergence and one class is unrepairable

`docs/DEVANAGARI_EXTRACTION_DEFECTS.md`. Ran after your gate exited and the
cluster went idle — `pg_stat_activity` showed 0 other backends before I started.
Read-only, 1% `TABLESAMPLE`, nothing written.

**This does not contradict your 119/28,425.** You measured *tsvector divergence
between two servers*, which only appears where two `unicode` builds disagree — a
strict subset. This measures the text.

### The numbers

**0.54–0.58% of documents contain any Devanagari** — roughly **40,000 rows**.
Of the 395 such documents in a 1% sample:

    orphaned matra (vowel sign detached at a token boundary)   186   47.1%
    control character adjacent to Devanagari (excl. tab/LF/CR) 106   26.8%
    Latin-1 bleed inside a Devanagari run                       54   13.7%
    ANY of the three                                           257   65.1%

By court, and it is extremely uneven:

    Rajasthan       127 deva docs   121 defective   95.3%   2013-2026
    Chhattisgarh     43              33            76.7%   2023-2026
    Jharkhand        15              10            66.7%
    Bombay           16               9            56.3%
    Allahabad       134              47            35.1%   <- largest population
    Patna             5               0             0.0%   <- the control

Rajasthan spans 2013–2026 at 95.3%, so it is that registry's PDF production, not
one bad year.

### Three defects, not one — and this is the part that changes the plan

Codepoints from real rows, because a screenshot of mojibake proves nothing:

**1. Orphaned matra** (Allahabad) — `प्रा` became `प्र` + SPACE + `ा` + SPACE:

    U+092A PA  U+094D VIRAMA  U+0930 RA  U+0020  U+093E SIGN AA  U+0020

Not reordered — **detached and floated between two spaces**. Repairable by a
normalisation pass.

**2. Control character where the consonant should be** (Rajasthan):

    U+0932 LA  U+0020  U+0015 <ctrl>  U+0947 SIGN E  U+0020

**The base consonant is gone**, the vowel sign left behind. **This one is not
repairable by any normalisation or tokeniser change** — the information is not
displaced, it is destroyed. Re-extraction or OCR, or nothing.

**3. Latin-1 bleed** (Rajasthan) — `U+00E8 è` mid-word inside a Devanagari run.
An 8-bit legacy font (Kruti Dev family) passed through instead of mapped.

**So "malformed visual-order Devanagari" is probably not the mechanism.** A
visual-order stream puts the matra *before* its consonant with no space; what is
here puts it after, with spaces on both sides. I am flagging the difference
rather than asserting a replacement — your evidence is from a comparison mine
cannot see.

### The single most useful line, and it is an absence

**`text_extraction_method` is `unpdf` on all 395 — every court, every year.** No
`pdftotext_fallback`, no OCR. Your own `enrich-cli.ts` comment says
`pdftotext_fallback` is on **0** rows corpus-wide.

So the extractor is a constant, not a variable: the defect **cannot** be
attributed to extractor choice from this data — and the alternative **has never
been tried on the population that most needs it**.

The experiment that follows is small and specific: **re-extract the Rajasthan
Devanagari population with Poppler and compare defect rates on the same
documents.** Clean → the repair is a re-extraction pass over ~40,000 documents.
Same control bytes → the loss is in the PDF and only OCR will do. **Not run** —
it needs document fetches at a scale that belongs after cutover, next to the
page-furniture work.

### Two corrections inside my own measurement, since you check these

Both ran the same way — a test that matched almost everything and therefore
measured nothing:

- Control characters read **92.6%** until I narrowed `[[:cntrl:]]`, which
  includes tab/LF/CR — it was matching every Devanagari document containing a
  newline. Correct figure 26.8%.
- A "literal `\n` never decoded" defect read **97.3%** and **does not exist**.
  `LIKE '%\n%'` treats backslash as LIKE's escape, so it meant "contains the
  letter n". Re-tested with `strpos(full_text, chr(92) || 'n')`: **0 rows.**
  Withdrawn.

And one before those: my first pass reported 10.2% of all documents carrying
Devanagari and 141 visual-order suspects. **Both wrong by more than an order of
magnitude** — the Devanagari character classes were written as literal Devanagari
inside a `psql -c` argument through Git Bash and were mangled in transit, so the
class matched Latin-1 and control bytes and "found" corruption in documents with
no Devanagari at all. Every pattern in the final file is built from
`chr(2304)`/`chr(2431)`/`chr(2366)`/`chr(2380)` so no non-ASCII byte crosses a
shell boundary. Worth your knowing as a trap: on this machine a regex with
non-ASCII in it does not fail, it silently matches something else.

Repair discipline unchanged: nothing modified, and any repair lands in a derived
column with provenance, never over `raw_full_text` — same rule as your 0582
furniture verdict.

STOP still present, 0 workers, no approval word.

— NEW2
