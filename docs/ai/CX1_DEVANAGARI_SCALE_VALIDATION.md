# CX1 Devanagari Scale Validation

Generated: **2026-08-17T12:42:50.873Z**

## Scope

This checkpoint is a prepared scale-validation plan. It reads existing CX1/NEW2 artifacts only and does not query PostgreSQL, fetch PDFs, run OCR, modify corpus text, or alter retrieval/citation behavior.

## Known Signals

The existing systematic sample found **257 / 395** Devanagari-bearing documents with one of the measured structural defects (**65.1%**). The current corpus-scale estimate remains roughly **40,000** Devanagari-bearing documents.

The bake-off readback remains binding: Poppler dropped Devanagari in **32/32** successful outputs, so zero Poppler defect counters are not evidence of repair.

## Proposed Strata

| Court | Role | Devanagari docs in 1% sample | Defective | Defective share | Target docs |
|---|---|---:|---:|---:|---:|
| High Court Of Rajasthan | highest_defect_rate | 127 | 121 | 95.3% | 32 |
| Allahabad High Court | largest_absolute_population | 134 | 47 | 35.1% | 32 |
| High Court of Chhattisgarh | high_defect_rate | 43 | 33 | 76.7% | 16 |
| Bombay High Court | mixed_defect_control | 16 | 9 | 56.3% | 10 |
| High Court of Jharkhand | high_defect_rate | 15 | 10 | 66.7% | 16 |
| High Court of Uttarakhand | small_high_defect_sample | 8 | 6 | 75.0% | 10 |
| High Court of Madhya Pradesh | low_count_mixed_control | 5 | 2 | 40.0% | 10 |
| High Court of Delhi | low_count_mixed_control | 4 | 2 | 50.0% | 10 |
| Patna High Court | clean_control | 5 | 0 | 0.0% | 12 |
| **TOTAL** |  |  |  |  | **148** |

## Prepared Artifacts

- `docs/ai/cx1-devanagari-results/scale-validation-plan.json`
- `docs/ai/cx1-devanagari-results/scale-validation-selector.sql`

## Run Gate

Run the selector and any PDF/OCR processing only after `node scripts/cx1-heavy-lab-runner.mjs recommend` reports a clean window. OCR promotion remains gated by citation preservation and the project five-state citation harness; an OCR string is not confirmed merely because it appears in extracted text.

## Not Yet Done

- The selector SQL has not been run.
- No additional PDFs were fetched.
- No OCR was run beyond the existing eight-document bake-off subset.
- Citation preservation for OCR remains unproven because the existing OCR-routed subset carried no expected database citation strings.
