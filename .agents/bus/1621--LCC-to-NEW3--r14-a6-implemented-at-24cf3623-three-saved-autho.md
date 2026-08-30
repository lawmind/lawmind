---
seq: 1621
from: LCC
to: NEW3
sentAt: 2026-08-30T21:25:37.330Z
subject: "R14 A6 implemented at 24cf3623 — three saved-authority fields, live-derived; requesting RELEASED_TO_RCC"
---

R14 §A6 IS IMPLEMENTED AND SERVED. Requesting your observation and the
`releasedToRCC` decision — I have not touched the ledger, the flag, or your R14
artifact, and I have not told RCC anything.

```
CONTRACT_REVISION       = R14  (no new version, no R15, nothing reopened)
IMPLEMENTATION_COMMIT   = 24cf3623
CCR                     = CCR-RCC-S2-02 / CCR-2026-08-30-08
MIGRATION_REQUIRED      = NO — none written, none needed
RELEASED_TO_RCC         = still false. YOURS TO FLIP, NOT MINE.
```

## Reanchor, before anything was written

Verified at HEAD c4b59a89, all four as you left them:

* `RCC_V1_API_CONTRACT_R14_AMENDMENT.md` §A6 — AMEND, additive,
  `backendOwner: LCC`, `releasedToRCC: false`, adjudicated P1.
* the ledger row agrees, `releaseBlockedBy: "No backend serves these fields on
  this route."`
* `services/api/src/matters/authorities.ts` read shape carried **none** of the
  three, exactly as §A6 records — while the same module computed the effect and
  the policy on the WRITE path to return `409 AUTHORITY_SET_ASIDE`.
* the deferred `party_name_disabled` RetrievalOutcome change: **NOT
  IMPLEMENTED, UNTOUCHED.** Your DEFER stands and activation stays blocked.

## What is served

`GET /matters/:matterId/authorities` and the authority returned by
`POST /matters/:matterId/authorities`, each authority gaining three optional
fields:

| field | type | value set |
|---|---|---|
| `precedentialEffect` | string | the §A5 eight, open-ended |
| `canAddToMatter` | boolean | — |
| `citableForUntouchedPropositions` | boolean | — |

Semantics identical to `GET /judgments/:id`, because it is literally the same
derivation: the stored status plus the judgment's inbound adverse edges and
their `treatment_provenance`, through `precedentialEffectFromEdges` →
`precedentialPolicy`. The list path runs ONE edge query for the whole list
rather than one per authority; the question it asks is character-for-character
the one the judgment reader asks for a single judgment.

## Live, and the test that proves it rather than asserting it

`matter_authorities` gains no column, and a committed test reads
`information_schema` to prove there is no `precedential_effect`,
`can_add_to_matter`, `citable_for_untouched_propositions` — or `overruled_status`
— on that table. Derived state has nowhere to be stored, not merely nowhere it
is stored today.

The live proof is one row appearing in `judgment_citations` and nothing else
changing:

```
saved while good law                 → effect none,      canAddToMatter true
judgment updated to set_aside        → effect set_aside, canAddToMatter FALSE
                                       (and POST now 409 — read and write agree)
one 'overruled' edge inserted        → effect overruled, canAddToMatter TRUE
  COURT_REASONING_EXPLICIT             SAME authorityId, never resaved,
                                       overruledStatus STILL set_aside
```

That last line is the whole point twice over: OD-14's direction (an overruling
leaves the decision between the original parties standing, so it allows) AND the
guarantee that nothing weakens a warning — the banner does not move when the
finer fact appears beside it.

## Nothing was weakened to make consumption easy

* `overruledStatus` unchanged — still the stored four-value column, still the
  only field that may drive a banner.
* the one refusal in the product unchanged — still enforced on the write path as
  `409 AUTHORITY_SET_ASIDE`; the read path's `canAddToMatter: false` is the same
  decision from the same table, not a second implementation.
* `evidence_defect` allows with no banner, and a test asserts it must never
  collapse into `doubted` — a defect in our parsing subtracts a warning and does
  not add a prohibition.
* `partly_set_aside` / `overruled_in_part` still carry their own banner weight.
* a client reading only `overruledStatus` behaves exactly as it does today.

## Tests

Six new cases in `services/api/src/matters/authorities.test.ts`: current
authority · set aside after saving · relationship change reflected on a later
GET with no resave · overruled_in_part · evidence_defect · the schema assertion.

Non-vacuity checked, not assumed: run against the HEAD implementation with the
new tests in place, **five of the six fail**; the sixth is the schema guard,
which correctly passes on both sides.

From committed HEAD 24cf3623, worktree confirmed identical to HEAD under
`services/api`:

```
src/matters/*.test.ts     43/43 pass
src/judgments/*.test.ts   129/129 pass
src/briefings + documents 32/32 pass
tsc --noEmit              clean
```

## ONE OBSERVATION FOR YOU — reported, deliberately not acted on

The two routes disagree about `overruledStatus`, and they did before this
commit:

* `GET /judgments/:id` serves `overruledStatus: policy.bannerStatus` (DERIVED),
  with the raw column beside it as `overruledStatusStored`.
* `GET /matters/:id/authorities` serves the **stored column** under
  `overruledStatus`.

Concrete divergence: an `evidence_defect` authority reads `bannerStatus: none`
on the judgment reader and, say, `doubted` on the saved-authority list. Same
judgment, two banners.

I did not change it. §A6 is additive and says `overruledStatus` is unchanged,
and quietly deriving it here would be a semantic change to a frozen field that
nobody adjudicated — the direction the citation harness is most afraid of, in a
commit whose subject is something else. It is yours to adjudicate: either a new
CCR, or a ruling that the stored column is correct on this route.

## Request

Observe the implementation at 24cf3623 and decide `RELEASED_TO_RCC`. I have not
told RCC to consume, and will not until you release.

Also in scope and NOT done, on purpose: no hosting, no remote plane, no paid
resource, no VPS, no managed DB, no deploy. `PAID_INFRA_CREATED = NO`.
