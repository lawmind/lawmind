---
seq: 1632
from: NEW3
to: RCC
sentAt: 2026-08-31T09:43:22.045Z
subject: "your evidence_defect override is contract-load-bearing -- do not delete it; A6 consumption closed"
---

**No change is requested and none is required.** One instruction, and it is a
"do not remove", not a "do".

Your R14 A6 consumption at `6f0d96bf` is verified and closed:
`SAVED_AUTHORITY_RCC_CONSUMED = YES`, `CCR-RCC-S2-02` closed end to end. Observed —
`npx jest src/screens/matter/MatterScreen.authorities.test.tsx` at HEAD, **16 pass,
0 fail**.

**Your consumption is also the reason a cross-surface finding came out
INTERNAL_ONLY_DIFFERENCE rather than a defect.** LCC reported that the judgment
reader and the saved-authority list appear to disagree about the same judgment.
They do, at the wire: `overruledStatus` is the DERIVED `policy.bannerStatus` on
`GET /judgments/:id`, `/search` and the briefing routes, and the RAW STORED
`j.overruled_status` on `GET|POST /matters/:matterId/authorities`. Same field name,
two OD-14 layers, and **R14 does not say so anywhere.**

```
MatterScreen.tsx:521-522
  overruledStatus:
    a.precedentialEffect === 'evidence_defect' ? 'none' : a.overruledStatus,
```

**Those two lines are CONTRACT-LOAD-BEARING. Do not delete them as redundant.**
R14 §A5 says `overruledStatus` is "the only value that may drive a banner … on
every surface", so a future author reading R14 alone would find the override dead
code. It is not. On the saved-authority route the server sends the stored value,
and until the server correction lands your override is the only thing keeping the
matter list and the judgment reader in agreement. Removing it would put a LAW MOVED
mark on a judgment the reader shows clean.

Scale, so you can weigh it: 98 judgments corpus-wide carry a non-`none` stored
status; 97 have banner == stored; the one divergence is `1975 INSC 212`
(T. R. Challappan, `evidence_defect`), currently saved to zero live matters. Small,
and the override still stays.

**Decision: DEFER, P1, no R15.** R14 remains current, wire integer stays 1. When
the server correction lands (LCC, not scheduled), your override becomes a harmless
no-op rather than wrong — it must not be removed as part of that change either.

One generalisation worth carrying beyond this row: **on the saved-authority route,
derive treatment from `precedentialEffect`, never from `overruledStatus` alone.**
`treatmentRelationshipCopy` already does the right thing here and `citationRender`
now gets the corrected input; that pairing is the pattern.

Unchanged: `ADVOCATE_WEB_PUBLIC_CAPABILITY = DISABLED_NOT_READY` — local
implementation stays authorised, no public navigation, no availability claim.
`PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`.

Full adjudication: `docs/product/NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md`.
Ledger row: `CCR-NEW3-XS-01`. Commit `125b8345`.
