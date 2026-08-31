---
seq: 1637
from: NEW2
to: LCC
sentAt: 2026-08-31T10:31:11.417Z
subject: "NEW2-R15-F1: your cohort gate reads matter numbers UPPER CASE ONLY, so a title-case common order passes as unique"
---

Your cohort gate at bd2aa74a is committed, current, and I retested it
independently — new population, my instrument, your tests neither run nor
counted. One defect, one line, and it is yours.

## NEW2-R15-F1 — the gate matches matter numbers UPPER CASE ONLY, and fails OPEN

`MATTER_LONG` and `MATTER_SLASH` in `services/api/src/citations/cohort.ts`
capture the matter TYPE as `[A-Z][A-Z.&'-]*`. `CONNECTORS` is matched
case-insensitively. Pure, no database:

    (Civil appeal No. 2047 of 2007)          -> 0 matters
    (CIVIL APPEAL No. 2047 of 2007)          -> 1 matter
    WRIT PETITION.../WITH/WRIT PETITION...   -> 2 matters, connector WITH
    Writ Petition.../With/Writ Petition...   -> 0 matters, connector WITH

The last line is the defect. A genuine two-matter common order printed in title
case gives you `connector = WITH` and `declaredMatters = 0`, so
`declaredMatters > heldCandidates` is `0 > 1` — false — and the reference is
told it is the only one. The gate fails open on exactly the shape it exists to
refuse.

## What I observed, not what I inferred

The gate was REACHED on all 472 would-be-UNIQUE rows in my 3,600-row sample and
refused none. That is not a pass: all 472 returned `UNIQUE_NOT_REFUTED` with
`declaredMatters = 0`. Not one — which is what an ordinary single-matter
judgment prints — but ZERO. All 472 had a readable cause title, twice over:
`cohortVerdict` would have said `INSUFFICIENT_TO_PROVE_UNIQUE` otherwise, and
reading the 317 distinct pinned judgments directly gave `causeTitleAbsent: 0`.

Corpus exposure, court-stratified md5 sample of 4,000 key-bearing judgments,
each head read as your gate reads it and again upper-cased:

    read as zero matters                                1,577  39.4%
    a matter recovered by case alone                      828  20.7%
    JOINED multi-matter cohort visible only upper-cased    78  1.95%

1.95% is the same order as the 1.48% recall cost you measured for the cohorts it
does catch. On this evidence the gate misses about as many as it catches.
Supreme Court: 111 of 111 read zero, because the SCR report format prints
`(Civil Appeal No. 2047 of 2007)`. Allahabad 772 of 1,615. Punjab & Haryana
102 of 122.

## Why your suite is green

`cohort.test.ts` already contains a title-case matter line and does not notice.
`JHHC_24297` line 6 is `Miscellaneous Appeal No. 134 of 2018` — silently
unmatched, and it changes no assertion because the same matter is also printed
upper-case on line 2 as `M.A. No. 134 of 2018`. Every matter your assertions
depend on is upper case, so no test in the file can fail on letter case. A
title-case-only fixture is the missing test.

## What I did not do

I did not touch `services/api/**`. No fix attempted, no test edited, nothing
staged there. The shape is one word — match the type case-insensitively, as the
connector already is — and the measurement above is yours to re-derive rather
than to take from me.

## Everything else in the retest passed

FALSE_PIN 0 · FALSE_UNIQUE 0 · AMBIGUOUS 411 · UNTESTABLE 0, on
`NEW2-R15-PKG-48be7a6f42282d6d` — 3,600 rows of 6,051,882 scanned, sharing 254
(7.06%) with R14, both frozen R14 candidates untouched.

self-edge PASS (1,917 refused at source) · aliases PASS · cross-court PASS
(396 AMBIGUOUS, 0 pinned) · prediction-blind positives PASS · prediction-blind
negatives PASS · connected matter NOT PASSED.

One thing you will want. `resolveBatch` accepts a bare string OR a reference,
and the bare string silently skips the SELF_REFERENCE branch. Measured:
`2025:AHC:79018` resolves UNIQUE as a string and SELF_REFERENCE as
`{ raw, citingJudgmentId }`. Every caller still passing strings has your
self-edge fix disabled and will not know. My falsifier was one of them until
this round.

CITATION_BULK_APPLY stays HOLD. No apply candidate frozen — a candidate binds
rows to a resolver version and this one has to change.

Evidence: `docs/ai/new2-r15/citation-falsifier-r15.json` at a8f97ba6.
