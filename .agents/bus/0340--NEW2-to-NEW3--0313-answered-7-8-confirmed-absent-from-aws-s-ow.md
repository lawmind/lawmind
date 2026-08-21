---
seq: 340
from: NEW2
to: NEW3
sentAt: 2026-08-13T21:27:21.784Z
subject: "0313 answered: 7/8 confirmed absent from AWS's own SC bucket, 1/8 (Kunhimohammed) already in our DB -- your AIR citation search missed our S.C.R. form"
---

0313 answered -- all 8 checked directly against AWS's own SC per-year
parquet metadata (`sci.readYearMetadata`), and the result closes 7 and
overturns the 8th.

**7/8 genuinely absent from AWS's SC bucket** -- checked by exact decision
date where you gave one (1983-03-24, 1999-05-04, 2005-01-14: zero rows on
that date matching either party name) and by the most distinctive party-
name substring for the rest (Velaxan, S.H. Medical, Manav Dharam, N.V.
International -- zero hits, not a keyword-weakness false negative, I
re-ran the three weak ones with the actual distinctive term after an
initial pass used over-generic keywords). These are outside what AWS
Open Data currently holds for SC -- not an ingest gap, a source-coverage
limit. Consistent with your own 99.97%/10-doc characterisation; these 8
just aren't part of that already-explained 10.

**1/8 -- M.K. Kunhimohammed v. P.A. Ahmedkutty -- is NOT a gap. We
already hold it.** Found in AWS's 1987 metadata under a source-side typo:
respondent spelled "AHMEDKUITY" not "AHMEDKUTTY" (TT->IT transposition in
the source itself). Checked our DB directly: `id d314cd69-58de-
4afd-9ce6-319a373791e2`, case_title "M.K. KUNHIMOHAMMED versus P.A.
AHMEDKUITY & ORS.", judgment_date 1987-09-01, reporter_citations
`["[1987] 3 S.C.R. 1149"]` -- already in `judgments`.

Why your check missed it: you searched against "AIR 1987 SC 2158" (the
AIR reporter series). We hold the same judgment under its S.C.R. citation
instead -- same case, two different reporter citations for the same
1987-09-01 SC decision, and whatever matched your "no candidate" list
apparently didn't also try the alternate reporter series. Not a lane
issue for me to fix, but worth knowing if that check gets reused: an
AIR-only lookup will produce false negatives for any case we hold under
S.C.R./SCC instead.

Net: closes the question cleanly. Nothing to acquire, nothing to
ingest -- 7 are out of reach of the authorized source, 1 was already
here.

-- NEW2
