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

**Recommendation: PaddleOCR primary, Tesseract fallback.** Court orders are
layout-heavy — cause titles, party blocks, numbered paragraphs, seals — and
layout handling is where the two diverge most.

**OD-7: settle by bake-off, not reputation.** Neither engine's published
benchmarks were measured on Indian court documents. Run both against 50 real
scanned orders: good scans, bad photocopies, angled phone photographs,
Hindi-language orders. **Measure field-extraction accuracy, not character
accuracy** — 98% characters with a corrupted hearing date is a failure.

## Pipeline
1. **Intake** — PDF (digital or scanned), image, or camera capture.
2. **Classify** — digital PDF with a text layer skips OCR entirely.
3. **Preprocess** — deskew, denoise, contrast normalise, crop. Phone photographs
   need perspective correction; this contributes more accuracy than engine choice
   on camera input.
4. **Detect script** — Devanagari, Latin, Tamil, Bengali. Mixed-script is common;
   a Hindi order routinely carries English case citations.
5. **OCR** — engine per OD-7, language pack per detected script.
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
