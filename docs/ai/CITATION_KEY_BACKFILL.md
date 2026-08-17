# Citation-key backfill — first full run, and what it found

LCC, 18 August 2026. Table `judgment_citation_keys` (migration `0053`), builder
`services/ingest/src/citation-keys-cli.ts`, run at `CITATION_KEYS_PAGE=5000`
alongside a live ingest fleet.

## Result

```
key rows                1,104,005
distinct keys           1,017,032
judgments with a key    1,061,396
duplicate row groups    0
yearless keys           0

by source   neutral 1,061,269 · reporter 38,342 · alias 4,394
```

Coverage against the population that can produce a key at all — a non-empty
`neutral_citation` or a non-empty `reporter_citations` — was **1,061,396 of
1,063,525 = 99.80%** at the moment the walk finished.

The gap is not loss. The corpus is being written to continuously: `judgments`
read **7,776,119** when the run ended and **7,961,447** an hour later, so
documents keep becoming eligible after the walker has passed their `created_at`
position. The builder is incremental and a later run collects them.

`0 duplicate row groups` is the load-bearing check. `0053`'s unique index over
`(citation_key, judgment_id, source, source_text)` exists precisely because a
resumable walker re-visits rows, and a duplicated row does not corrupt anything —
it SUPPRESSES a correct resolution by making a key look ambiguous. It held.

`0 yearless` is real rather than a missing measurement: every key carries one or
two years, because a neutral citation always contains its year (`1950 INSC 36`).

## The walk counter is inflated ~2.3x and the keys are still sound

The run reported **16,551,619 judgments walked** against a corpus of ~7.8M, and
the cursor visibly stalled near the end, advancing 100 rows at a time while the
timestamp stayed at `2026-08-17 16:46:00.974221+00`.

Cause: the walker caught up with the live write head. The keyset is
`(created_at, id)`, and the ingest fleet commits many rows sharing one
`created_at`, so at the head the walk degenerates into re-visiting the same
timestamp bucket. The builder's own header anticipated groups of ~100 — one
batch — which was true before the fleet was writing at this rate.

**It cost time, not correctness**: the unique index made every re-visit
idempotent, which is why `duplicate row groups` is 0. The counter is a progress
display, not a measurement of the corpus, and should not be quoted as one. Worth
fixing so the display stops lying, but it is not a data defect.

## The real finding: 45,153 ambiguous neutral keys, and 80% of them are fixable

A key claimed by more than one judgment is one the resolver refuses outright —
`0053`'s design, and correct, because pinning the wrong authority is worse than
pinning none. **45,153 of 1,017,032 distinct keys (4.4%) are ambiguous, and every
single one is `source = 'neutral'`.** Zero reporter or alias ambiguity.

That is surprising, because a neutral citation is the one citation form that is
supposed to be unique by construction. Splitting the ambiguous set by how many
DISTINCT judgment texts each key covers explains it:

| shape | keys | judgment rows | worst single key |
| --- | ---: | ---: | ---: |
| one text, many rows — a **common order** | **36,310** (80.4%) | 104,930 | 845 |
| **multiple distinct texts** sharing one citation | **8,843** (19.6%) | 27,196 | 417 |

### The 80% are not a defect at all

Worked example, `2025:CGHC:57112`:

```
judgment rows            845
distinct content_hash      1
distinct case_number     845
distinct source_url      845
distinct judgment_date     1
```

845 different writ petitions — `MAHENDRA KUMAR KORI`, `JIWAN LAL YADAW`,
`VINOD SINGH`, all v. State of Chhattisgarh — disposed by **one common order on
one day**, each petition carrying that order's text and its neutral citation.
That is ordinary Indian High Court practice for connected matters, not bad data.

**But the citation harness cannot serve it today.** `cite:"2025:CGHC:57112"`
should return ONE authority. It currently resolves to 845 candidates, so
`exactCitation` sees "not exactly one" and pins nothing. An advocate looking up a
real, correctly-cited order gets no pin.

The fix is identity, not resolution: these rows are one judgment with many case
numbers, and `content_hash` already proves it. `document_duplicates` (migration
`0036`) is the existing machinery for exactly this. **Not implemented here** —
collapsing judgment identity touches the citation path and is not a change to
make inside a backfill report.

### The 19.6% are a genuine conflict and must stay refused

8,843 keys where **different judgment texts** claim the same neutral citation.
One of those is wrong and nothing in the corpus says which, so the resolver's
refusal is right and must not be relaxed by any duplicate-collapsing work above.
Whether the source assigns them wrongly or our extraction does is unmeasured.

### Concentration by court

| court | ambiguous keys |
| --- | ---: |
| Allahabad High Court | 21,122 |
| High Court Of Rajasthan | 9,313 |
| High Court Of Chhattisgarh | 4,402 |
| High Court of Karnataka | 3,925 |
| Gauhati High Court | 1,480 |
| High Court of Jharkhand | 1,147 |
| High Court of Himachal Pradesh | 1,103 |
| High Court of Uttarakhand | 1,034 |

Allahabad and Rajasthan lead here and also lead NEW2's Devanagari defect table
(bus 0632: Rajasthan 95.3% of Devanagari-bearing documents defective, Allahabad
the largest defective population). **The overlap is suggestive and is NOT
evidence of a shared cause** — one is PDF text extraction, the other is citation
assignment, and both simply track registry volume and registry production
practice. Recorded so nobody later reads a correlation as a mechanism.

## Not done

- The 36,310 common-order keys are not collapsed. Needs a judgment-identity
  decision, not a backfill.
- The 8,843 conflicts are not diagnosed to source-vs-extraction.
- The walk-counter inflation is not fixed.
- No resolver re-run has been done against the new key table, so "resolver
  improvements" is unmeasured and deliberately not claimed here.
