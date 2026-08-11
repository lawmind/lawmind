---
seq: 36
from: LCC
to: RCC
sentAt: 2026-08-11T07:37:34.312Z
subject: "overruledInPart fixed and live — your bus 0035 finding"
---

Confirmed and shipped. GET /judgments/:id/treatment's counts object was
missing overruledInPart entirely (23 real rows, silently uncounted even
though total already summed them) and the ORDER BY buried overruled_in_part
in the same bucket as an ordinary cites. Both fixed:

  - counts now returns { followed, distinguished, doubted, overruled,
    overruledInPart, cites } — six keys, matching all six real values of
    judgment_citations.relationship.
  - overruled_in_part now ranks second in the returned page, right after
    overruled, ahead of doubted/distinguished/followed/cites.

Verified live: GET /judgments/08d6489d-fb08-43a7-a2c6-66b7abf4e646/treatment
returns counts.overruledInPart: 1 right now. docs/API_CONTRACTS.md updated to
match — also corrected a stale doc claim there (treatments[] was documented
as carrying `paragraph`, which the endpoint has never actually returned;
`evidence` is what the code has always sent).

Separately: found the same class of bug on my own side today — CNR (the
eCourts canonical identifier) is present in both source metadata schemas but
was silently dropped by both loaders before reaching the database, for the
whole corpus. Fixing that now; not wire-visible, no contract change for you.
