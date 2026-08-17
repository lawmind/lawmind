# CX1 Full Corpus Census

Generated: **2026-08-17T12:16:50.731Z**

## Phase 1 Scope

This is the metadata-only census base. It reads existing local artifacts only: no database query, no S3 request, no full corpus scan.

Scope boundary: High Court source universe from `docs/HC_METADATA_SURVEY.json`. Supreme Court rows are held in `judgments` but have no denominator in this High Court survey.

## Headline

| Band | Source documents | Held documents | Remaining | Coverage |
|---|---:|---:|---:|---:|
| pre-2016 | 4,757,636 | 1,160,698 | 3,596,938 | 24.4% |
| 2016-2022 | 9,069,540 | 2,043,476 | 7,026,064 | 22.5% |
| 2023 | 2,078,757 | 1,398,203 | 680,554 | 67.3% |
| 2024 | 1,747,681 | 626,303 | 1,121,378 | 35.8% |
| 2025-2026 | 2,875,589 | 2,029,046 | 846,543 | 70.6% |
| **TOTAL** | **20,529,203** | **7,257,726** | **13,271,477** | **35.4%** |

## Largest Remaining Courts

| Court | Source documents | Held documents | Remaining | Coverage |
|---|---:|---:|---:|---:|
| Allahabad High Court (9_13) | 3,493,992 | 816,196 | 2,677,796 | 23.4% |
| Bombay High Court (27_1) | 2,421,666 | 636,197 | 1,785,469 | 26.3% |
| Madras High Court (33_10) | 1,696,917 | 398,302 | 1,298,615 | 23.5% |
| High Court of Punjab and Haryana (3_22) | 1,860,228 | 612,647 | 1,247,581 | 32.9% |
| Patna High Court (10_8) | 1,706,872 | 585,786 | 1,121,086 | 34.3% |
| High Court of Karnataka (29_3) | 955,609 | 231,984 | 723,625 | 24.3% |
| High Court  for State of Telangana (36_29) | 1,044,211 | 327,702 | 716,509 | 31.4% |
| Orissa High Court (21_11) | 795,093 | 106,802 | 688,291 | 13.4% |
| High Court of Kerala (32_4) | 1,036,226 | 370,714 | 665,512 | 35.8% |
| High Court Of Rajasthan (8_9) | 1,095,547 | 500,288 | 595,259 | 45.7% |

## Mobile Order-Type Slice

docs/HC_ORDER_TYPES.json covers **1,291,519** labelled rows in the mobile metadata variant only. It is disjoint from the plain variant and must not be quoted as corpus-wide judgment share.

Confident judgment rows: **9,678**. Ambiguous judgment/order rows: **231,067**.

## Machine Outputs

- `docs/ai/cx1-corpus-census/metadata-coverage.json`
- `docs/ai/cx1-corpus-census/metadata-coverage.csv`

## Next Phase

Add read-only stratified samples for text length, paragraph count, citation count, citation availability, Devanagari presence, and classification failure modes. The scheduler must allow at least MEDIUM work before any database sampling phase starts.
