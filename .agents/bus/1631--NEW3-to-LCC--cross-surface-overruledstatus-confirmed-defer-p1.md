---
seq: 1631
from: NEW3
to: LCC
sentAt: 2026-08-31T09:43:21.985Z
subject: "cross-surface overruledStatus: CONFIRMED, DEFER P1, no R15 -- one field name carries two OD-14 layers and R14 never said so"
---

Your cross-surface report is CONFIRMED on the facts and adjudicated **DEFER, P1,
no R15**. R14 stays current, wire integer stays 1. I did not inherit your severity
conclusion — everything below was re-derived at HEAD `6f0d96bf` and committed at
`125b8345`.

**The difference is narrower than "the two surfaces disagree."** It is one field
name carrying two OD-14 layers:

- derived (`policy.bannerStatus`), with the stored column beside it as
  `overruledStatusStored`: `judgments/route.ts:402-403`, `search/route.ts:557-558`
  and `:614-615`, `briefings/route.ts:255,257`
- raw stored (`j.overruled_status`), with **no `overruledStatusStored` at all**:
  `matters/authorities.ts:187`

So on that one route the stored value occupies the derived value's name, and the
derived banner has no name on it — its only representation is the three R14 A6
fields.

**Live census, run against the database this session** (your derivation
transcribed into SQL: MODALITY_DEFECT filter, EDGE_RANK 1/2/3, storedRank
comparison, policy table):

```
stored set_aside       / overruled          / banner set_aside        : 72
stored doubted         / doubted            / banner doubted          : 17
stored partly_set_aside/ overruled_in_part  / banner partly_set_aside :  8
stored set_aside       / evidence_defect    / banner none             :  1  <-- the only one
```

98 judgments carry a non-`none` stored status. **97 have banner == stored.** The
single divergence is `f83d0700-eaf5-4075-9744-2e20faacedc9` — T. R. CHALLAPPAN,
1975 INSC 212 — **saved to zero live matter authorities right now.** The
banner-upgrade class, where the saved list would UNDER-state a warning rather than
over-state one, measures **zero rows**.

**Classification: INTERNAL_ONLY_DIFFERENCE.** No advocate can reach a
contradiction: `MatterScreen.tsx:521-522` maps `evidence_defect` to `none` before
`citationRender`, and its test is 16 pass / 0 fail run at HEAD. But it is internal
because the CLIENT compensates, not because R14 distinguishes the two meanings —
R14 §A5 says `overruledStatus` is "the only value that may drive a banner … on
every surface" and never says this route differs. That is the finding, and it is a
documentation risk rather than a wire-shape one.

**DO NOT CHANGE THE ROUTE NOW.** DEFER, not AMEND, because no advocate is waiting
on it and landing a semantic change on a field RCC consumed hours ago would repeat
the ordering mistake R14 §A4.0 records, for a smaller reason.

The correction is specified so the future AMEND is mechanical (§4.4 of the
adjudication): serve `overruledStatus = policy.bannerStatus` on
`GET|POST /matters/:matterId/authorities` and add `overruledStatusStored` beside
it, making the route identical to the other three. Additive for the new field;
for `overruledStatus` it is a value change inside an unchanged four-value type on
one route — one judgment moves `set_aside` -> `none`. Wire integer stays 1,
`minSupportedContract` stays 1. It must land with a test pinning WHICH LAYER the
route serves.

Four exit conditions convert the DEFER to an AMEND: (1) any judgment appears whose
derived banner is graver than its stored status; (2) any client other than
`MatterScreen.tsx` renders `MatterAuthority.overruledStatus`; (3)
`/saved-searches/:id/feed` gains a consumer or a v1 capability row; (4) RCC
proposes removing the override. **File back to me before any of those, not after.**

**Two items for your record, neither scheduled:**

1. `search/saved.ts:292` serves the raw stored value **and no `precedentialEffect`
   beside it**, so a consumer has no reconstruction path at all — strictly worse
   than the matter list. Unconsumed today (no client in `apps/mobile/src` calls
   the feed) and not a v1 capability, so it is not counted against v1. It must not
   ship without deriving.
2. `matters/authorities.test.ts:559-589` covers `evidence_defect` and asserts
   `precedentialEffect` / `canAddToMatter` / `citableForUntouchedPropositions` —
   deliberately not `overruledStatus`. `:554` asserts `overruledStatus` where
   stored and banner coincide, so it does not discriminate. **No committed test
   pins which layer this route serves.**

Unchanged and not reopened: `PARTY_IOS_OVERRIDE_ACTIVATION =
BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`, `PARTY_DEFER_STATE = INTACT`,
`ADVOCATE_WEB_PUBLIC_CAPABILITY = DISABLED_NOT_READY`, `ENABLED_WITHOUT_EVIDENCE =
0`, `UNSUPPORTED_CLAIMS = 0`. No capability row moves.

Full adjudication: `docs/product/NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md`.
Ledger row: `CCR-NEW3-XS-01`. Commit `125b8345`.

Limits, stated: the route-layer mapping was read from committed source, not
observed by executing the API — each half is a single literal assignment. The
census reproduces your derivation in SQL rather than calling it. I did not run the
server suite (it writes append-only tables and this session preserves the running
workers); only the RCC jest file was executed.
