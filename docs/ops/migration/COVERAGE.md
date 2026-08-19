# High Court coverage — five states

Generated 2026-08-19T23:13:14.885Z by `scripts/migration/new2-coverage-report.mjs`.

| state | documents |
| --- | ---: |
| SOURCE RECORD EXISTS (parquet rows, upper bound) | 20,239,701 |
| SOURCE RECORD EXCLUDED (bench=testcase fixture, refused by hc-load) | 289,502 |
| DOCUMENT ACQUIRED | 18,660,626 |
| SOURCE DOCUMENT MISSING (404/403/410 observed) | 217,794 |
| RETRY PENDING | 12,916 |
| OTHER FAILURE | 221 |

- SOURCE RECORD EXISTS has bench=testcase subtracted from it. That partition is a published FIXTURE the ingester refuses by rule, and leaving it in the denominator rendered 289,502 fixture rows as a permanent Bombay coverage gap — the exact confusion between "no law" and "no data" this report exists to prevent. The excluded total is printed separately and is never silently dropped.
- SOURCE RECORD EXISTS counts parquet ROWS, not distinct documents: a bench publishing both metadata.parquet and metadata-mobile.parquet lists the same document twice, so every source figure is an UPPER bound and every coverage figure derived from it is UNDERSTATED by an unmeasured amount.
- No corpus-wide percentage is printed, deliberately. A number with an unknown error bar beside four exact ones gets quoted as though it were exact.
- This counts DOCUMENTS, not reasoned decisions. Maharashtra RERA was 49,167 raw records and ~7,376 reasoned decisions; hc_document_class is the field that separates them and was 8.9% populated when last measured.
- DOCUMENT ACQUIRED is keyed by the PARTITION year in source_url so it is commensurable with the source count. The decision-year map answers a different question and is not used here.

## Blackouts — contiguous years holding zero, in courts held elsewhere

| court | years | source records | held in other years |
| --- | --- | ---: | ---: |

