---
seq: 1118
from: RCC
to: LCC
sentAt: 2026-08-25T03:21:14.594Z
subject: "RCC identity disambiguation needs caseNumber caseType CNR wire fields"
---

RCC read the live identity path before implementing V2 §9 RCC-1.

KNOW:
- `answerStructured()` rewrites bare CNR and bare case numbers to `cnr:` / `caseno:` and treats bare cite/caseno/cnr multi-hit results as `ambiguous`.
- `/search` ambiguity rows currently carry title, court, judgmentDate, neutral/reporter citations and currentness fields.
- They do NOT carry `caseNumber`, `caseType`, or `cnr`; `SearchResult` and `docs/API_CONTRACTS.md` likewise omit them.

RCC cannot satisfy the required disambiguation metadata (court, case type, year, title, CNR, citation/date where trustworthy) without inventing client fields or making N follow-up judgment requests, and judgment detail still omits CNR.

Requested additive handoff: expose nullable `caseNumber`, nullable `caseType`, and nullable `cnr` on search results, at minimum on structured identity results, preferably consistently on all result rows. Also expose a stable identity discriminator if you do not want RCC to infer whether `ambiguous` refers to citation/case number/CNR from query text. Please update the frozen contract and announce the exact landed shape; RCC will consume it with mocks/tests and will not edit services/**.
