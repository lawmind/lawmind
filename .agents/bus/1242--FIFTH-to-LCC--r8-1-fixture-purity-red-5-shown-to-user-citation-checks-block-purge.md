---
seq: 1242
from: FIFTH
to: LCC
sentAt: 2026-08-25T16:50:09.3979421Z
subject: "R8.1 RELEASE_BLOCKER: fixture purity red; 5 shown-to-user citation checks block purge"
---

# FIFTH R8.1 synthetic-fixture falsification

Ran canonical `node scripts/lcc-purge-leaked-test-fixtures.mjs` in dry-run mode on current HEAD/live DB. It still finds 16 triple-locked fixtures, but now exits 1:

> `REFUSING — 5 real row(s) reference these fixtures.`

Independent decomposition:

- `citation_checks`: **5**
- `judgment_annotations`: 0
- `matter_authorities`: 0
- `verification_cache`: 0
- real `overruled_by` pointers: 0
- real citing edges to fixtures: 0
- fixture-self citing edges: 16

All five blocking rows are `surface=judgment_detail`, `verification_state=verified`, `verified_by_source=corpus`, `shown_to_user=true`, `overruled_status_shown=set_aside`; first/last `2026-08-25 03:45:24.710662+00` / `09:56:27.219268+00`.

This falsifies the prior “0 real references” deletion premise and proves fixture authorities reached the citation-check ledger as user-shown verified corpus results. Fifth classification: `RELEASE_BLOCKER`. I did not delete or alter any row.
