# High Court coverage — five states

Generated 2026-08-18T07:12:25.827Z by `scripts/migration/new2-coverage-report.mjs`.

| state | documents |
| --- | ---: |
| SOURCE RECORD EXISTS (parquet rows, upper bound) | 20,529,203 |
| DOCUMENT ACQUIRED | 12,184,886 |
| SOURCE DOCUMENT MISSING (404/403/410 observed) | 85,205 |
| RETRY PENDING | 5,189 |
| OTHER FAILURE | 74 |

- SOURCE RECORD EXISTS counts parquet ROWS, not distinct documents: a bench publishing both metadata.parquet and metadata-mobile.parquet lists the same document twice, so every source figure is an UPPER bound and every coverage figure derived from it is UNDERSTATED by an unmeasured amount.
- No corpus-wide percentage is printed, deliberately. A number with an unknown error bar beside four exact ones gets quoted as though it were exact.
- This counts DOCUMENTS, not reasoned decisions. Maharashtra RERA was 49,167 raw records and ~7,376 reasoned decisions; hc_document_class is the field that separates them and was 8.9% populated when last measured.
- DOCUMENT ACQUIRED is keyed by the PARTITION year in source_url so it is commensurable with the source count. The decision-year map answers a different question and is not used here.

## Blackouts — contiguous years holding zero, in courts held elsewhere

| court | years | source records | held in other years |
| --- | --- | ---: | ---: |
| Bombay High Court | 1996-2012 | 605,453 | 1,237,314 |
| Madras High Court | 1995-2018 | 477,667 | 1,052,202 |
| High Court of Punjab and Haryana | 1995-2013 | 385,664 | 1,254,083 |
| Patna High Court | 1996-2012 | 380,011 | 1,168,635 |
| High Court  for State of Telangana | 1995-2012 | 341,033 | 425,624 |
| High Court of Kerala | 1997-2012 | 312,556 | 417,538 |
| High Court of Kerala | 2017-2020 | 246,609 | 417,538 |
| High Court  for State of Telangana | 2016-2019 | 226,083 | 425,624 |
| High Court of Jharkhand | 1998-2020 | 219,765 | 228,434 |
| High Court Of Chhattisgarh | 2016-2022 | 215,270 | 236,165 |
| High Court Of Chhattisgarh | 1996-2012 | 175,505 | 236,165 |
| High Court of Karnataka | 1997-2014 | 165,362 | 572,599 |
| High Court of Madhya Pradesh | 1996-2016 | 156,616 | 493,187 |
| High Court of Karnataka | 2016-2018 | 156,361 | 572,599 |
| Calcutta High Court | 1996-2022 | 150,476 | 259,629 |
| Gauhati High Court | 1998-2018 | 140,168 | 176,713 |
| High Court of Gujarat | 1996-2015 | 131,400 | 290,629 |
| High Court of Delhi | 1996-2016 | 119,056 | 231,497 |
| High Court Of Rajasthan | 1995-2012 | 116,175 | 862,132 |
| Orissa High Court | 1996-2015 | 33,987 | 719,439 |
| High Court of Andhra Pradesh | 1995-2019 | 14,278 | 231,053 |
| High Court of Jammu and Kashmir | 1999-2015 | 1,552 | 112,034 |

