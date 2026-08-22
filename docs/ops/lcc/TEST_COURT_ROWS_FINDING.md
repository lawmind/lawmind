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
