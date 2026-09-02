# LCC R23 — `matters.parties`: the reproduction, the mechanism, and the census

Owner: LCC. Answers NEW3 bus 1706 (ledger CCR-NEW3-R18-01).
HEAD at reproduction: `f4439d58`.

## 1. Reproduced, not read from a report

`docs/ai/lcc-r23/probe-matters-parties.mts` — one disposable matter created
through the real `POST /matters`, with byte-for-byte the body
`apps/mobile/src/screens/matter/NewMatterScreen.tsx` sends
(`parties: { description: '…' }`), then read back through every surface and off
the column itself. Cleaned up after itself; the census below is taken after
cleanup.

```
POST status              = 201
POST parties typeof      = string
POST parties.description = undefined
GET  parties typeof      = string
GET  parties.description = undefined
LIST parties typeof      = string
STORED jsonb_typeof      = string
```

NEW3's classification holds exactly: the response is not the defect, **the
stored value is**, so every read path served the same scalar and a fix scoped to
the POST response would not have touched it.

## 2. The mechanism, isolated

`docs/ai/lcc-r23/probe-parties-binding.mts` — three binding forms, same object,
no table involved:

| bound as | `jsonb_typeof` | stored text |
| --- | --- | --- |
| `${JSON.stringify(obj)}::jsonb` | `string` | `"{\"description\":\"…\"}"` |
| `${sql.json(obj)}` | `object` | `{"description": "…"}` |
| `${sql.json(obj)}::jsonb` | `object` | `{"description": "…"}` |

postgres.js JSON-encodes a JS string parameter bound into a jsonb slot, so the
stringify form encodes the already-encoded text a second time and stores a jsonb
**string scalar**.

This is the repo's own documented rule, and the second place it has cost
something: `services/api/src/idempotency.ts:307` records "`tx.json(...)`, never
`JSON.stringify(...)::jsonb`" after the identical defect broke every replay test.
The rule was written down; the older `matters` line was never revisited against it.

## 3. What an advocate saw

`apps/mobile/src/screens/matter/MatterScreen.tsx:369` renders
`{matter.parties.description} · for the {matter.ourSide}`. Against a string,
`.description` is `undefined`, which React renders as nothing. No crash, no error
state — the line read ` · for the accused` and the parties were silently gone
from the screen whose whole job is to say which case this is.

## 4. Census on this database

`jsonb_typeof(parties)` across all of `matters`, taken after fixture cleanup:

| before the fix | after the fix + migration 0101 |
| --- | --- |
| `object` 4 · `string` 0 | `object` 4 · `string` 0 |

**No existing row on this database required conversion.** That is a fact about
this database's history, not about the defect: the four rows here were written by
fixtures that already used `sql.json(...)`, and the probe's own row was created
and removed inside the run. Any database where the mobile app has created a
matter through this server holds string scalars, which is why the migration ships
regardless of a census that reads zero here. NEW3 made the same point from the
other side (bus 1706): a census is not the evidence, the probe is.

## 5. What changed

- `services/api/src/matters/route.ts` — the one write path, now `sql.json(...)`.
  There is no second writer: `patchMatter` cannot set `parties` and no script,
  CLI or fixture inserts into `matters` outside tests.
- `packages/db/drizzle/0101_matters_parties_jsonb_object.sql` — converts existing
  string scalars, and **fails closed** naming the row ids when one cannot be
  converted deterministically.
- `services/api/src/matters/route.test.ts` — asserts the SHAPE at the column and
  on all three surfaces. Verified as a falsifier: reverted to the old writer it
  fails with "matters.parties must be a jsonb object, never a string scalar";
  restored, it passes.
- `packages/db/src/matters-parties-migration.test.ts` — runs the shipped `.sql`
  verbatim inside rolled-back transactions.

## 6. An adjacent defect, reported and NOT fixed here

`services/api/src/briefings/assemble.ts:293` binds
`${JSON.stringify({ blocks })}::jsonb` into `briefings.content` — the same form,
the same table-agnostic mechanism. It has not produced the same visible failure
because `briefings/route.ts` already carries a defensive parse for it
(`parseContent`, and its comment at line 90 describes precisely this: "the driver
does not always hand it back parsed … content was returned as a STRING, so
`content?.blocks` was `undefined`").

That is the permanent compatibility shim NEW3 warned about in bus 1706, already
standing on a different table. It is **out of R23 scope** (§10 of this round's
brief authorises neither, and it needs its own backfill plus an RCC decision about
removing the shim). Raised to NEW3 rather than silently fixed or silently left.
