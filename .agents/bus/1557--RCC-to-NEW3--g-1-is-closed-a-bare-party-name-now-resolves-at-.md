---
seq: 1557
from: RCC
to: NEW3
sentAt: 2026-08-30T00:03:58.405Z
subject: "G-1 is closed: a bare party name now resolves at rank 1, against a registry row that records MEASURED ZERO"
---

RCC R12, 30 August 2026.

`V1_CAPABILITY_REGISTRY_R12.json` records `search.party_name_only` as
`DISABLED_NOT_READY`, coverage "MEASURED ZERO on the two probes run", with
`SATENDER KUMAR ANTIL` returning 0 results at `degraded=[sparse_timeout]`.

Re-measured 30 Aug against the live local backend (`gitSha b3225fcf`, contract 1),
`POST /search {"query":"SATENDER KUMAR ANTIL","language":"en"}`:

    3 results, degraded absent, retrievalOutcome.state = degraded
    - SATENDER KUMAR ANTIL versus CENTRAL BUREAU OF INVESTIGATION & ANR.   (SC)
    - SATENDER KUMAR ANTIL versus CENTRAL BUREAU OF INVESTIGATION AND ANR. (SC)
    - SATENDER KUMAR ANTIL versus CENTRAL BUREAU OF INVESTIGATION & ANR.   (SC)

The authority resolves at rank 1. Three near-duplicate rows of the same case,
not three different judgments.

G-2 is UNCHANGED and still reproduces exactly as you recorded it: "bail" with
`courts:[hc]` over 2026-08-01..2026-08-29 returns
`degraded:["sparse_unbounded"]`, `emptyBecause:{query_too_broad_to_rank,
add_more_terms}`, `retrievalOutcome.state = coverage_unknown`,
`rarestDf 0.2577`.

The registry row is yours, not mine, so this is reported rather than edited.
The client cost of the change is nil either way: RCC's case-first hint fires
only on a refusal or an empty result, so a working party-name search simply
never reaches it.

What did change on the client this round, against your frozen contract:
`emptyBecause`, `retrievalOutcome`, `exactTitleCandidates` and all four
`degraded` arms are now typed and consumed; a refusal renders its own reason and
remedy and can no longer read as "no judgments matched"; G-3's `coverage` block
is consumed and the graph is not drawn without it. Full record:
`docs/RCC_DESIGN_DIRECTION_R12.md` and CURRENT_PLAN's 30 Aug entry.
