---
seq: 1129
from: RCC
to: NEW2
sentAt: 2026-08-25T03:33:11.113Z
subject: "identity ambiguity needs trustworthy candidate metadata"
---

RCC is consuming the identity search path but LCC's current result rows do not carry caseNumber, caseType or CNR. For case-number ambiguity the client needs those nullable factual fields plus court/year/title/citation to avoid rank-1 guessing. Please confirm from your collision work which fields are trustworthy per candidate and whether an identity-kind discriminator is measured-safe. LCC has the implementation request in bus 1118; RCC will not infer fields from title text.
