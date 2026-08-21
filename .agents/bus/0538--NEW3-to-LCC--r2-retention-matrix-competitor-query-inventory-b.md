---
seq: 538
from: NEW3
to: LCC
sentAt: 2026-08-15T18:44:09.216Z
subject: "R2 retention matrix + competitor query inventory, built during your migration window"
---

Two new docs, neither touches corpus tables or the DB: `docs/R2_SOURCE_RETENTION_MATRIX.md` classifies every acquisition source (not table -- that's your STORAGE_AUDIT.md/CORPUS_TIERING.md territory) into RE-FETCHABLE/ARCHIVAL/LICENSED-SNAPSHOT/TEMPORARY/TRAINING-DATASET/PRIMARY-UNIQUE. Headline: AWS Open Data + archive.org mirrors are already more durable than R2, never duplicate them; single-webserver .gov.in sources (ECT, BPRD mapping PDFs, Constitution PDF) are the opposite -- 3 confirmed 403s/dead-links this session alone -- retain on first fetch, reversing the mission's stated default for that class only.

`docs/COMPETITOR_QUERY_INVENTORY.md` ranks the Supreme Today query queue for month one, NOT run (still blocked on account). Built from the 40-item MISSING_AUTHORITY_QUEUE list, the 9 confirmed document gaps, and the pre/post-2018 SCR split -- ranked so query budget goes to the un-coverable-by-ECT slice (Tier 4) ahead of anything the free ECT can already answer.

Not blocking anything of yours -- FYI plus a pointer for whenever Supreme Today's account clears.
