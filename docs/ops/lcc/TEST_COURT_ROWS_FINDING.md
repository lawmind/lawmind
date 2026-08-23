# The 3 synthetic `Test Court` rows — searched for, and not found

**Founder-gated item H. Nothing has been deleted. Nothing is being recommended
as closed.** This file records what a search of the live corpus actually found,
so the founder can decide against evidence rather than against a memory.

Written 22 Aug 2026 by LCC. Every number is a query against the live local
Postgres, reproducible below.

---

## The claim

`docs/CURRENT_PLAN.md` (LCC, an earlier session):

> *"3 synthetic `Test Court` rows I created by stopping a test mid-run are still
> in `judgments` — the DELETE was refused by the sandbox classifier and is listed
> for the founder rather than left silent."*

Carried forward into `docs/ai/audits/LAWMIND_ADDENDUM_ACK_2026-08-22.md`, whose
own note is worth quoting because it was already honest about the limit of its
evidence:

> *"corpus contains 3 synthetic Test Court rows; deletion is founder-gated. (1%
> DB sample could not independently confirm presence at this size — consistent
> with n=3.)"*

## What is in the corpus now

```sql
SELECT count(*) FROM judgments WHERE court ILIKE '%test%';
-- 0
```

Zero. Not three. Every other `court` column in the schema was checked too —
`matters`, `cause_list_syncs`, `coverage_cell`, `embedding_census_cell` — all
zero.

## The two things that LOOK like the claim and are not

**1. `TEST` is a case-type abbreviation, not a marker.** Seven judgments carry
case numbers like `TEST.CAS./12/2009`, `TEST/1/2024`, `Test.App./8/2025`. That
is **Testamentary** — probate and succession. Real cases, real source PDFs in the
AWS bucket, real courts (Delhi, Allahabad, Gauhati). A cleanup script matching
`case_number ILIKE '%TEST%'` would delete genuine probate judgments.

**2. `case_title LIKE 'SYNTHETIC%'` returns 8 rows, all real.** They are
judgments about synthetic chemicals and synthetic textiles — including
*SYNTHETICS & CHEMICALS LTD. ETC. versus STATE OF U.P. AND ORS.*, `1989 INSC
321`, a Constitution Bench authority on State excise powers. Deleting on that
pattern would remove a landmark.

Both of these are why this file exists instead of a `DELETE`. The obvious
predicate for "find the test data" matches real law in both directions.

## What this does and does not establish

**Establishes:** no row in `judgments` has a court naming a test court, today.

**Does not establish:** that the three rows never existed. Two explanations fit
equally and this lane cannot separate them —

- they were deleted by a later session that did not update `CURRENT_PLAN.md`; or
- the INSERT never committed, and the note recorded an intention rather than a
  state (consistent with the DELETE having been refused: a mid-run stop that
  rolls back leaves nothing behind).

The audit's own 1% sample "could not independently confirm presence", which is
what a full census now says at n=0 rather than n=3.

## The cleanup script, prepared and not run

There is nothing to clean. If rows matching the description ever appear, the safe
predicate is the COURT column and only the court column:

```sql
-- PRE-INVARIANT: record the count before touching anything.
SELECT count(*) AS before_total FROM judgments;
SELECT id, court, case_title, case_number, source_url, created_at
  FROM judgments WHERE court ILIKE '%test court%';

-- The delete. NEVER match on case_number or case_title: TEST.CAS. is
-- Testamentary and SYNTHETIC is a chemicals company.
-- DELETE FROM judgments WHERE court ILIKE '%test court%';

-- POST-INVARIANTS, all three:
--   before_total - after_total  must equal exactly the number listed above
--   the listed ids must have NO rows in judgment_citations, judgment_chunks
--     or judgment_paragraphs (a synthetic row with real edges is not synthetic)
--   source_url must be NULL or non-AWS for every id deleted
```

The third invariant is the real guard: anything with an
`indian-*-court-judgments.s3.ap-south-1.amazonaws.com` source URL came from the
authorised bucket and is not ours to delete.

## Status

**OPEN, founder-gated.** This lane is not marking the FOUNDER_QUEUE item closed —
the global correction addendum says an agent's finding is not founder approval,
and "we looked and found nothing" is a finding. The founder may now close it, or
ask for a different search, against real numbers.

---

# RE-CENSUS, 23 August 2026 — **the answer changed from 0 to 6, and the reason resolves the whole contradiction**

**Nothing has been deleted. Nothing is recommended as closed.** This section is
added below the 22 August finding rather than replacing it, because the two
answers together are the evidence — neither is wrong.

## The census, re-run against the live corpus

```sql
SELECT count(*) FROM judgments WHERE court ILIKE '%test%';         -- 6
SELECT count(*) FROM judgments WHERE court ILIKE '%Test Court%';   -- 6
SELECT count(*) FROM judgments WHERE case_title ILIKE 'SYNTHETIC%';-- 14
SELECT count(*) FROM matters           WHERE court ILIKE '%test%'; -- 0
SELECT count(*) FROM cause_list_syncs  WHERE court ILIKE '%test%'; -- 0
SELECT count(*) FROM coverage_cell     WHERE court ILIKE '%test%'; -- 0
```

On 22 August the first two returned **0**. They now return **6**.

## The six rows, in full

| id | case_title | source_url | created_at (UTC) |
| --- | --- | --- | --- |
| `6fd21632-11bb-4aec-be28-3de62befb65f` | SYNTHETIC — Assembly Fixture | `test://assemble/8c10973f…` | 2026-08-23 **02:41:54** |
| `d4ca2129-d6f8-44c6-b9f9-b8a913bad0b8` | SYNTHETIC — Authorities Fixture | `test://authorities/9435f3e6…` | 2026-08-23 **02:51:46** |
| `194290da-dcb2-4d0f-bd78-e51880a522fd` | SYNTHETIC — Replacement Fixture | `test://authorities/a539a320…` | 2026-08-23 **02:51:46** |
| `00d958ce-6d32-4599-8516-5a6cc0379bc3` | SYNTHETIC — Set Aside Fixture | `test://authorities/2d7830fb…` | 2026-08-23 **02:51:46** |
| `d990e6a7-209a-4e1f-b1d1-c46792b05ea6` | SYNTHETIC — Still Good Law For Now | `test://authorities/d501ae6d…` | 2026-08-23 **02:51:46** |
| `7d75f737-4834-4f8d-9ea5-c0f5ba3f6d03` | SYNTHETIC — Reporter Citation Only | `test://authorities/3b53a156…` | 2026-08-23 **02:51:46** |

`full_text` lengths are 17–46 characters. `case_number` is NULL on all six.

## What this establishes, and it is the useful part

**These are leaked TEST FIXTURES, not corpus data, and the population is
TRANSIENT.** All six were written in a ten-minute window this morning by a
concurrent session's test run, and their `after` hooks did not delete them — the
same morning a suite died mid-run with a Postgres `could not read blocks …
Invalid argument`, which is exactly how a cleanup hook gets skipped.

**That resolves the contradiction the round brief asked about.** The original
claim of "3 synthetic Test Court rows" and the 22 August census returning 0 are
BOTH true, at different moments. The count is not a property of the corpus; it is
a property of whether a test suite happened to be mid-run when somebody looked.
Treating either number as a fixed fact about the database is the mistake.

## A safe predicate now exists, and it is not the one anyone would reach for

The 22 August finding's warning still stands and is the reason nothing is being
deleted on a pattern:

- `case_number ILIKE '%TEST%'` matches **Testamentary** probate cases —
  `TEST.CAS./96/2015` (Delhi), `TEST/119/2022` (Allahabad). Real law.
- `case_title ILIKE 'SYNTHETIC%'` matches judgments about synthetic chemicals,
  including *SYNTHETICS & CHEMICALS LTD. v. STATE OF U.P.*, `1989 INSC 321`, a
  Constitution Bench authority. **14 such rows now**, of which 6 are fixtures and
  8 are real.

The discriminator that does not touch real law is **`source_url LIKE 'test://%'`**.
Every genuine judgment carries an `http(s)` source — an AWS Open Data object or a
court URL — because that is where it was fetched from. A `test://` scheme cannot
be fetched from anywhere and can only have been written by a fixture.

**This is offered as evidence, not as a cleanup instruction.** It has NOT been
executed, and the blast-radius query (do any citation edges, matter authorities
or `judgment_chunks` point at these six?) **timed out on a contended box before
it could be answered** — so the one number a safe deletion would need is still
missing, and no deletion should be considered without it.

## What is still owed before anything is deleted

1. The blast-radius count above, run on a quiet box.
2. A fix in the *test suites*, not the corpus — a fixture that inserts into
   `judgments` should clean up in a `finally`, or the six will come back
   tomorrow. Deleting the rows without that is sweeping, not fixing.
3. The founder's decision. Unchanged: `FQ-TEST-COURT-ROWS` stays open, and it is
   not closed on an agent's recommendation.

---

## Re-run attempted and DEFERRED here — superseded, same day, by the re-census above

I attempted the census under a 110-second budget while the API suite was running
against the same database and it was killed by the timeout: a leading-wildcard
`court ILIKE '%test%'` on an 18.7M-row table is a sequential scan of a 151 GB
relation, and the resource gate reads `DEFER DB_SCAN` under that load.

**A concurrent LCC session then ran it properly and got the answer, so read the
re-census section above, not this one.** Six rows, all created today between
02:41 and 02:51 UTC, all `source_url LIKE 'test://%'` — leaked test fixtures from
a suite mid-run, not corpus data.

That result is the better version of the point this note was going to make: the
population is TRANSIENT, so the census answers 0 or N depending on whether a test
suite is running when you ask. A number that changes between two readings of the
same predicate is not a property of the corpus, and the original cleanup
request's "3 synthetic Test Court rows" is explained by it rather than
contradicted.

**Nothing has been deleted, and nothing should be** — deleting a fixture
mid-suite would fail somebody else's test run, and deleting on a reading taken
while a suite is live would be acting on a number that is about to change.
