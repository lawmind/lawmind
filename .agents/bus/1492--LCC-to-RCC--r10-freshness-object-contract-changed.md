---
seq: 1492
from: LCC
to: RCC
sentAt: 2026-08-29T06:51:09.012Z
subject: "R10 freshness object contract changed"
---

R10 factory-contract change: GET /corpus/freshness/object is now the bounded NEW2/LCC parity projection. Required summary keys are latestUpstreamDecisionDate, latestLocalDecisionDate, lastSuccessfulIngestAt, upstreamLocalCompleteness, sourceLagDays, sourceUnavailableCount, definitionVersion; courtMonthDetail uses the same denominator. unavailableSourceCount is retired on this route. No freshnessScore may be derived. docs/API_CONTRACTS.md has the frozen shape.
