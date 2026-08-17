# CX1 Devanagari extraction bake-off

Date: 2026-08-17  
Owner: CX1 temporary scale lab  
Handoff: NEW2  
Status: complete; no production document was rewritten

## Decision

Keep `unpdf` output when it passes structural and script-retention checks. Do **not** route Devanagari documents to Poppler merely because its defect counters are zero: in this sample Poppler silently removed every Devanagari token from all 32 documents. Route structurally defective documents to OCR only after the embedded-text alternatives fail their retention gates, preserve the original extraction and provenance, and require the existing OCR verification workflow before promotion.

The smallest safe NEW2 routing policy is:

1. Extract with `unpdf` and calculate the current defect metrics plus Devanagari-token count, text-length retention, citation preservation, and case-name preservation.
2. If `unpdf` has no orphaned matras, control-character adjacency, or Latin-1 bleed, keep it. This kept 12/32 documents, including all eight Patna controls.
3. Otherwise run Poppler as a cheap embedded-text comparator. Accept it only if it is structurally clean **and** retains at least 80% of the `unpdf` Devanagari tokens and 80% of its text characters, with no citation/case-name regression. Poppler qualified for 0/32 documents here.
4. If neither embedded-text result qualifies, mark the document as an OCR candidate. OCR only that document, store extractor/version/settings and the source/text hashes, and apply citation and case-name gates. Do not silently replace the canonical text or call OCR semantically equivalent. Eight of the 20 candidates were tested here; the remaining 12 are candidates, not measured OCR successes.

## Sample and method

The input is a deterministic 32-document sample from NEW2's affected cohort in `docs/DEVANAGARI_EXTRACTION_DEFECTS.md`. Selection used `TABLESAMPLE SYSTEM (4) REPEATABLE (170817)` against the local production copy, with production access read-only. The manifest contains public metadata, source URLs, hashes, and baseline metrics—not document text.

| Court | Documents | Years represented | Baseline classes |
|---|---:|---|---|
| High Court of Rajasthan | 12 | 2013–2015, 2021–2026 | orphaned matra, control adjacency, Latin-1 bleed, clean controls |
| Allahabad High Court | 12 | 2017, 2021–2023, 2025–2026 | orphaned matra, control adjacency, clean controls |
| Patna High Court | 8 | 2021–2023, 2025–2026 | healthy controls |

Every PDF was processed with the current `unpdf` path and Git for Windows Poppler `pdftotext`. OCR was deliberately limited to the eight shortest, court-balanced documents for which `unpdf` was damaged and Poppler failed script retention. OCR used Tesseract 5.4, official `tessdata_best` Hindi plus English, 250 dpi, and page-segmentation mode 6.

Metrics were computed on Unicode text: valid Devanagari token rate, orphaned matras, control-character adjacency, Latin-1 bleed, character count, paragraph splits, expected citation presence, case-name token preservation, runtime, and failures. A zero Devanagari-token denominator is reported as null—not as 100% valid.

## Results

| Extractor | Attempted / succeeded | Valid Devanagari token rate | Orphaned matras | Control adjacency | Latin-1 bleed | Text characters | Runtime p50 / p95 | Failure rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| current `unpdf` | 32 / 32 | 94.10% | 1,986 | 546 | 69 | 821,384 | 26.74 / 149.62 ms | 0% |
| Poppler `pdftotext` | 32 / 32 | null—zero Devanagari tokens | 0 | 0 | 0 | 667,598 | 35.98 / 129.78 ms | 0% process failures |
| Tesseract `hin+eng` | 8 / 8 | 99.13% | 2 | 0 | 0 | 31,366 | 4,337.76 / 11,017.64 ms | 0% |

Across all 32 documents, both embedded extractors preserved 4/4 expected citation strings and 169/190 sampled case-name tokens. That aggregate does not rescue Poppler: it retained **0% of Devanagari tokens in every document** and only 81.3% of the total character count. Its apparent zero-defect result is complete script loss.

On the eight OCR-routed documents, OCR retained a mean 84.92% of the `unpdf` Devanagari-token count and 104.95% of its character count. Structural defects fell from 287 (`unpdf`) to 2 (OCR), and average paragraph splits rose from 1.0 to 12.75. Case-name preservation was unchanged at 40/49. The routed subset contained no expected database citation strings, so citation preservation for OCR remains unproven by this run.

OCR was roughly 120× slower at the median than `unpdf`. More importantly, its 84.92% token retention prevents a semantic-equivalence claim. It is a targeted recovery path, not the default extractor.

## Exact NEW2 integration recommendation

Add a per-document extraction decision record in NEW2's processing layer without changing the core schema mid-sprint. It should retain, in an offline/result artifact until the owning lane chooses a schema:

- source document ID and source hash;
- extractor name/version/settings and extracted-text hash;
- all defect counts, Devanagari-token and character-retention ratios;
- citation and case-name gate outcomes;
- route decision: `keep_unpdf`, `accept_poppler`, `ocr_candidate`, `ocr_verified`, or `manual_review`;
- explicit reason codes, including `DEVANAGARI_SCRIPT_LOSS`.

Use the 80% retention thresholds above as bake-off gates, not as semantic-quality guarantees. Before NEW2 promotes OCR text, expand the OCR subset specifically with citation-bearing documents and use the project's five-state citation verification harness. Never present an OCR-derived citation as confirmed merely because its string survived extraction.

Operational note: `unpdf` completed all documents but repeatedly emitted `Math.sumPrecise is not a function` and font-substitution warnings under the installed Node runtime. Treat these as observable warnings to fix separately; they were not counted as extraction failures.

## Reproduction and evidence

```powershell
node scripts/cx1-select-devanagari-sample.mjs
node scripts/cx1-devanagari-bakeoff.mjs
```

Machine-readable evidence:

- `docs/ai/cx1-devanagari-results/sample-manifest.json`
- `docs/ai/cx1-devanagari-results/bakeoff-results.json`

The experiment used copied PDFs in a temporary directory and removed payloads after measurement. It made no production writes.
