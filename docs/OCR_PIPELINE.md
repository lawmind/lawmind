# OCR PIPELINE

## Why this is not optional
A large share of Indian district court orders exist only as scans. Advocates
photograph orders on their phone in the courtroom. An app that cannot read a
photographed order is not usable where most Indian litigation happens.

## Engines

| Engine | Licence | Strengths | Weaknesses |
|---|---|---|---|
| **PaddleOCR** | Apache 2.0 | Strong multilingual incl. Devanagari; good layout and table detection; actively developed | Heavier runtime; Python service |
| **Tesseract** | Apache 2.0 | Mature; `hin`/`tam`/`ben` trained data; light; easy deploy | Weaker on complex layouts, tables, poor scans |

**RESOLVED 2 Aug 2026 (OD-7): PaddleOCR primary, Tesseract fallback.** Court
orders are layout-heavy — cause titles, party blocks, numbered paragraphs, seals
— and layout handling is where the two diverge most. Both are Apache 2.0, so
there was never a licensing dimension to weigh.

**OCR intake ships in v1.** The product is a complete ecosystem: an advocate
should never need a second app for a law-related task. Deferring scanned intake
would have sent them elsewhere on exactly the documents that matter most, and an
advocate who opens another app once opens it again.

**The S4 bake-off still runs — as tuning, not selection.** Neither engine's
published benchmarks were measured on Indian court documents, so the numbers that
matter still have to be produced here. Run both against 50 real scanned orders:
good scans, bad photocopies, angled phone photographs, Hindi-language orders.

**Measure field-extraction accuracy, not character accuracy.** 98% characters with
a corrupted hearing date is a failure — the one field that must be right is the
one a character-level score is least sensitive to.

## Pipeline
1. **Intake** — PDF (digital or scanned), image, or camera capture.
2. **Classify** — digital PDF with a text layer skips OCR entirely.
3. **Preprocess** — deskew, denoise, contrast normalise, crop. Phone photographs
   need perspective correction; this contributes more accuracy than engine choice
   on camera input.
4. **Detect script** — Devanagari, Latin, Tamil, Bengali. Mixed-script is common;
   a Hindi order routinely carries English case citations.
5. **OCR** — PaddleOCR, Tesseract on fallback; language pack per detected script.
6. **Confidence scoring** — per block. Low-confidence regions flagged in the UI,
   never silently accepted.
7. **Structure extraction** — court, case number, parties, date, order body.
8. **Human confirmation** — the advocate sees extracted fields and corrects
   before anything saves. **OCR output is never trusted silently.**

Step 8 mirrors the citation rule: automation proposes, the advocate confirms. An
OCR error that silently becomes a hearing date is a missed hearing.

## Where it runs
Separate Railway service (`ocr`), Python + FastAPI, async queue. Kept off the API
service so a heavy job cannot starve request handling. A phone photograph of a
ten-page order is not a synchronous request.

## Corpus use
The same pipeline processes scanned judgments during ingest. Some older High
Court judgments in the AWS datasets are scans. Those pass through OCR before
chunking and carry `ocr_confidence` so retrieval can down-rank uncertain text.

---

## CORRECTION — 8 Aug 2026: the engines named below are at the benchmark floor

**arXiv 2606.29213 (2026), "Can OCR-VLMs Read Devanagari?"** benchmarked ten
systems on **300 real printed scans**, and the result invalidates the basis for
the choice recorded in this file:

| System | chrF++ on REAL scans |
| --- | --- |
| Gemini 2.5 Flash | 86.3 |
| Claude Opus 4.7 | 82.2 |
| **Qwen3-VL-8B (open, Apache-2.0, one 24 GB GPU)** | **75.2** |
| GPT-5.5 | 58.5 |
| **EasyOCR (classical)** | **58.3** |
| olmOCR-7B | 40.5 |

**On clean rendered text all ten score 91–98.** On real scans **nine of ten
collapse** and the field spreads **76 points**. `paddleocr` and `tesseract` are
classical engines of the same family as EasyOCR, and every vendor demo — ours
included, if we are not careful — is clean text.

**The replacement, and the reason is privacy before accuracy.** `Qwen3-VL-8B` is
Apache-2.0 and runs on a single 24 GB GPU. `CLAUDE.md` §5 routes uploaded
documents as sensitive-class — pseudonymise, then Claude, one document per call —
and OD-6's countersigned DPA is still owed before uploads ship. **A self-hosted
OCR-VLM means the document never leaves at all**, which is better than
pseudonymisation because nothing is sent, and it is a claim no competitor routing
to a frontier API can make.

`dots.ocr` (MIT) is explicitly stronger on Devanagari than Latin/CJK-trained
models. **Surya's repo is Apache-2.0 but its weights have historically carried a
separate commercial term — verify before use, do not assume the repo licence
covers them.**

**Two things this does not change.** `ocr_engine` stays an enum and gains a value
rather than being repurposed — the `ecourts_bulk` lesson. And **OCR output is
still never trusted silently**: the advocate confirms extracted fields before
anything saves, because a silently wrong hearing date is a missed hearing. A
better engine raises the ceiling; it does not remove the confirmation step.

**Nothing has been rebuilt yet.** This records that the file's premise is wrong,
so nobody builds on it. `docs/CURRENT_PLAN.md` §3 carries the work, and it must
be **measured on real degraded scans, never on clean text**.
