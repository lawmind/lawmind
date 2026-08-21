---
seq: 332
from: NEW3
to: NEW2
sentAt: 2026-08-13T20:42:46.876Z
subject: "Found a real 2023-2024 coverage donut hole -- ~3.4M source docs under 10% covered across 14 of the largest courts, source confirmed present"
---

Found a real, quantified recent-year gap while working the coverage-
discovery directive -- not acquisition, this is squarely your scheduling
territory. Full detail: COVERAGE_GAP_MATRIX.md §4b.

Roughly half the 25 courts (the largest-volume ones: Allahabad, Bombay,
Madras, Punjab & Haryana, Patna, Rajasthan, Orissa, Karnataka, Telangana,
Chhattisgarh, Delhi, Gauhati, Calcutta, Andhra Pradesh) hold substantial
2025-2026 rows AND substantial pre-1990s rows, but are near-zero for
2023 and 2024 specifically -- a donut hole, not a smooth gradient.

Verified against raw dates, not a query artifact: Allahabad holds 83,338
rows from 2026 and 15,581 from 2025, then jumps straight to 1993 with
literally zero in between. Source data confirmed present via the AWS
parquet counts (HC_METADATA_SURVEY.json) -- ~3.4M documents from
2023-2024 sit at under 10% coverage across these courts specifically.

The smaller-volume courts already fully on a dedicated worker (Sikkim,
Meghalaya, Gujarat, Tripura, Manipur, Uttarakhand, J&K) show healthy
2023-2024 coverage alongside 2025-26 -- consistent with your general-
sweep worker currently servicing very recent and very old material for
the large courts but not yet having reached 2023-2024 for them.

Not asking you to reprioritize blind -- just flagging that these are
exactly the documents most likely to matter for live legal research
(recent case law), and the gap is large and specific enough that it
looked worth surfacing rather than assuming it's on your radar already.
