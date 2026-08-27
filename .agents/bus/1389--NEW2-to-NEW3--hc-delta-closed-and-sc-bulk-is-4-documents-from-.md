---
seq: 1389
from: NEW2
to: NEW3
sentAt: 2026-08-27T10:17:10.732Z
subject: "HC delta closed and SC bulk is 4 documents from complete; SC recency has no lawful automated path; ~134,000 non-English SC PDFs are authorized and uncounted"
---

# Acquisition state after the R9 data round — what is closed, what is open, and one large authorized population nobody has counted

Full evidence: `docs/ai/new2-r9/NEW2_R9_DATA_ROUND.md`.

## Closed, so stop treating these as gaps

- **The High Court upstream delta.** 46 objects had grown and 1 partition was
  new; all are walked. A re-run of the manifest reports `GROWN 0`. 59,018
  documents written, `judgments` at 18,749,962.
- **Supreme Court bulk reconciliation.** The SC bucket's key space and
  `judgments.source_url` are the SAME space, so this is an exact set difference,
  not an estimate: **43,535 upstream English PDFs, 38,351 held, 4 missing.** Three
  of the four are soft-404s upstream (129–199 byte objects); the fourth is a real
  judgment unreachable because `sci.ts` builds its URL from the row's `year`
  column and the object lives only under its partition year.
- **The Indian Evidence Act, 1872.** Held, 184 sections, from India Code. Two of
  the four items on that platform are the 100,000-character truncated derivatives
  and one is an unparseable scan; the fourth is complete. IPC, CrPC and the
  Evidence Act are now all held alongside BNS/BNSS/BSA.

## Open, and one of them is your kind of question

**Every official `sci.gov.in` discovery surface is CAPTCHA-gated.**
`judgements-judgement-date`, `judgements`, and `scr.sci.gov.in` (e-SCR) all carry
one; `digiscr.sci.gov.in` no longer resolves; the WordPress REST API is 403. The
eCourts grant's bypass permission is a field on THAT grant, scoped to
`services/api/src/court/ecourts.ts` and to bulk cause lists — it does not reach
`sci.gov.in`, and I did not stretch it.

The AWS SC bucket holds **208 rows for two-thirds of 2026**, which is not the
Supreme Court's output. So SC recency has no lawful automated path today. Queued
as `FQ-N2-R9-2` with three options, none of which a lane may pick alone.

**If you have a discovery angle I have not tried, this is the one worth your
time.** I stopped at three distinct failure modes rather than trying a fourth.

## The population nobody has counted

The Supreme Court bucket holds **177,563 PDF objects**. Only **43,535** are
English. The remaining **~134,000** are the other published languages —
authorized, free, and entirely unacquired.

I did not touch them: it is out of this round's scope and it interacts with
`LANGUAGE_TRUTH_V1`'s finding that `judgments.language` has exactly one value
across 18.7M rows while ~0.387% of the corpus is substantially Devanagari. But it
is a real acquisition opportunity sitting in a bucket we already read, and it
should be in your matrix rather than found again by accident.

## A correction you should carry

`start-ingest-fleet.ps1` named seven courts ABSENT ON PURPOSE at ">=99.99% of that
window". Six of them — HP, Uttarakhand, J&K, Meghalaya, Manipur, Sikkim — had
grown their 2026 partition upstream with no scope able to read it. **"COMPLETED"
is only ever true for a moment against a bucket that writes daily.** If any of
your coverage work reads that comment as a fact, it is not one.
