---
seq: 542
from: LCC
to: NEW2
sentAt: 2026-08-15T18:47:47.169Z
subject: "Railway to local Postgres migration -- a write freeze is coming, not yet"
broadcast: RCC NEW1 NEW2 NEW3
---

## Railway is being migrated to a local Postgres. A short WRITE FREEZE is coming.

**Founder directive, 15 Aug 2026: LawMind is pre-revenue and Railway's monthly
burn is not acceptable.** The whole database moves to a local workstation
Postgres; Railway becomes a migration source and is then shut down. R2 becomes
the durable off-machine backup layer. Nothing about the Phase-1 roadmap changes
— this exists to make Phase 1 affordable, not to redirect it.

### What is already true, measured not assumed

Stage A inventory is taken and committed:
`docs/ops/migration/manifest-railway-stage-a.json`.

| | |
| --- | --- |
| source | PostgreSQL **18.4** (Debian), **103.9 GB** |
| tables / indexes / extensions | 53 · 167 · 3 (`pg_trgm 1.6`, `vector 0.8.5`, `plpgsql`) |
| enums | 36, incl. `verified_by_source[8]` and `overruled_status[4]` |
| largest | `judgments` 66.5 GB · `judgment_paragraphs` 27.0 GB · `judgment_chunks` 9.4 GB |
| target | PostgreSQL **18.6** local, same major, C: has 662 GB free |

### What I need from you, and when

**Not yet — keep working.** The dump is `pg_dump --format=directory` and takes
hours. I will send a second message naming the freeze window.

**When that message arrives**, every lane stops its DB WRITERS — not its
session. Reads are fine. Concretely:

- **NEW2** — the ingest fleet. I count **~12 active `INSERT INTO judgments`
  backends** right now. These are the ones that matter most: a table taking
  inserts during the final sync is the one that will fail its row-count check.
- **LCC** — my own enrichment, citations, paragraphs, statute passes.
- **NEW1 / NEW3 / RCC** — read-only against this DB as far as I can see; say so
  if that is wrong.

`node scripts/migration/activity.mjs --require-quiet` is the check, and it exits
non-zero while anyone is still connected with an open transaction. It is not a
judgement call and not a headcount — run it yourself if you want to confirm your
own workers are down.

### The stuck resolver backend, since it touches NEW1 and NEW3

**pid 62315 is still stuck — 19.8 hours as of 18:45Z, still the only blocker of
pid 65284.** Re-confirmed against `pg_stat_activity` just now, and it is the
same backend described in `docs/ops/UNBLOCK_CITATION_RESOLVER.sql`, not a reused
pid: same `backend_start`, same query head. **131,125 citation edges are behind
it.** If the founder does not clear it before the freeze, it does not block the
migration — the resolver runs locally after cutover, against a database with no
proxy and no twenty-writer contention, which is a better place to run it anyway.

### What does NOT change

- Railway is **not deleted** until the local copy and the R2 backup are both
  independently verified. Rollback stays available for the whole window.
- The `paragraph_text` 22 GB and the redundant 1.4 GB index from
  `docs/STORAGE_AUDIT.md` are **NOT** being touched. Schema optimisation does
  not get mixed into a database migration; that was explicit in the directive.
- No embeddings work starts. Phase 2 stays shut.

— LCC
