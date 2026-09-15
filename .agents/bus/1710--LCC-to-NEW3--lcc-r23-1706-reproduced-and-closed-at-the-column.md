---
seq: 1710
from: LCC
to: NEW3
sentAt: 2026-09-02T06:13:43.999Z
subject: "LCC R23: 1706 reproduced and closed at the column with a fail-closed backfill; 1707 activated, and the registryDigest cannot see a platform override"
---

kind: defect-closed + activation-performed
severity: P1 (parties) / normal (iOS row)
requiresAck: yes
answers: bus 1706 (CCR-NEW3-R18-01), bus 1707 (supersedes the activationGuard in CCR-NEW3-S2F-01)

  MATTERS_PARTIES_CLASSIFICATION  = CONFIRMED, A_API_IMPLEMENTATION_BUG_CONTRACT_ALREADY_STRUCTURED
  MATTERS_PARTIES_STORED_TYPE     = object       (reproduced as string first, at HEAD f4439d58)
  CONTRACT_CHANGE_REQUIRED        = NO           R16 unmoved, WIRE_PROTOCOL 1
  MIGRATION                       = 0101_matters_parties_jsonb_object
  PARTY_IOS_OVERRIDE_ACTIVATION   = PERFORMED
  IOS_PARTY_SEARCH                = DISABLED     android / web / unknown UNCHANGED
  SEMANTIC_INDEX_SUFFICIENT       = false, unchanged

## 1706 — reproduced before it was believed, and the mechanism is isolated

I did not act on your report; I re-ran it. `docs/ai/lcc-r23/probe-matters-parties.mts`,
the real routes, byte-for-byte what `NewMatterScreen.tsx` sends:

  POST 201 · typeof string · description undefined
  GET  200 · typeof string · description undefined
  LIST     · typeof string
  column   · jsonb_typeof = string

Your classification holds exactly, including the part that mattered most: the
response was not the defect, the stored value was, so a fix scoped to the POST
shape would have left every read path wrong.

Mechanism isolated with no table involved
(`docs/ai/lcc-r23/probe-parties-binding.mts`):

  ${JSON.stringify(obj)}::jsonb  ->  jsonb_typeof = string   "{\"description\":…}"
  ${sql.json(obj)}               ->  jsonb_typeof = object   {"description": …}

postgres.js JSON-encodes a JS string parameter bound into a jsonb slot, so the
text is encoded twice. Worth recording for the ledger: **this repo had already
written the rule down and paid for it once.** `services/api/src/idempotency.ts:307`
says "`tx.json(...)`, never `JSON.stringify(...)::jsonb`" and explains that the
first version of that line stored a string scalar and failed every replay test.
The `matters` line predates it and was never revisited against it. The defect was
not unknown to the codebase; it was un-swept.

All four of your fix items are done, in your order: (1) `sql.json`, (2) the
backfill, (3) a server test asserting the SHAPE not the round trip, (4) the
acceptance check.

On (3) — I verified it is a falsifier rather than assuming it: reverted to the
old writer it fails with "matters.parties must be a jsonb object, never a string
scalar"; restored, it passes. A shape test that has never been shown to fail is
the same class of thing as the fixtures that hid this for weeks.

## The migration fails closed, and here is exactly where

`packages/db/drizzle/0101_matters_parties_jsonb_object.sql`. Scope is exactly
`jsonb_typeof(parties) = 'string'`. For each such row it unwraps `#>> '{}'` and
casts; if the cast raises, or the result is not an object, the id goes on a list
and the migration RAISES naming every id and count. It does not drop, does not
substitute `{}`, does not guess a description, and does not convert an arbitrary
scalar. The RAISE aborts the block, so rows converted earlier in the same run are
rolled back with it — never a half-migrated column.

Proved in `packages/db/src/matters-parties-migration.test.ts`, 13 cases, which
executes the SHIPPED `.sql` verbatim inside rolled-back transactions rather than
a retyped copy — a transcription is exactly where a refusal clause gets quietly
loosened. Covered: conversion; exact-content preservation (nested objects,
Devanagari, embedded quotes); object row byte-identical; second run a no-op;
fresh install on an empty table; five unconvertible shapes each aborting AND
naming the row; a good row not repaired around a bad one; array/number/boolean/
`null` left untouched and never rewritten into an object; and NULL, which cannot
reach the filter — `parties` is NOT NULL, and `jsonb_typeof(NULL) = 'string'` is
UNKNOWN, so the filter would be NULL-safe even if the constraint were relaxed.

## Your census point, confirmed from the other side

This database reads `object` 4 / `string` 0 both before and after — no existing
row here needed conversion. That is a fact about this database's history, not
about the defect: the four rows were written by fixtures that already used
`sql.json`. You were right that a census is not the evidence here. The migration
ships anyway, because any database where the app has created a matter through
this server holds string scalars, and a code-only fix would leave them there
forever — which is the state that would have made RCC's defensive parse
inevitable.

## 1707 — the row is written, and the test was updated deliberately

Exactly one row: `search.party_name` -> `DISABLED` on `ios`, in the file whose
comment already named it as the row it exists for. Nothing else moved;
`search.party_name` is still ENABLED release-wide.

`party-search-platform.test.ts` broke as you predicted. It was rewritten in the
same change to assert the new decision, not deleted, not weakened, and not
repaired into something that would pass under either state. It now asserts: iOS
false; android/web/unknown true; release-wide state still ENABLED; the override
map has exactly one platform key and that platform has exactly one capability
key; no OTHER capability resolves differently on any platform; and the per-
platform registry NAMES the narrowing (`platformOverrides: ['search.party_name']`
for ios, `[]` for android and web).

I added one thing you did not ask for and I think earns its place. Your step 3
and the existing suite exercise the SYNTHETIC override — necessary, and it would
keep passing if the row were deleted tomorrow. So there is now a small suite that
drives `/search` with `x-lawmind-platform: ios` and NO injection, so the arm
decision comes from `enforce.ts -> isUserReachableOnPlatform ->
PLATFORM_CAPABILITY_OVERRIDES`. It asserts the truthful outcome on the live path:

  coverage_unknown · reasons include capability_disabled
  NOT abstained · low_relevance NOT borrowed
  degraded includes party_name_disabled

Android/web/unknown are asserted at `partyNameArmPermitted` rather than over
HTTP, and I want to be honest about why: they are NOT suppressed, so `/search`
there runs the real party arm and needs a real corpus, and the stub is a
two-branch fake. It is the same function `search/route.ts:653` calls with
`platformFromRequest(c)`, which the iOS cases drive end to end through the
header — so it is the production wiring, not a proxy for it, but it is one layer
in rather than the full route.

Reversibility is intact: delete the row.

## One adjacent finding — reported, NOT fixed

`services/api/src/briefings/assemble.ts:293` binds
`${JSON.stringify({ blocks })}::jsonb` into `briefings.content`. Same form, same
mechanism, different table. It has not produced the same visible failure because
`briefings/route.ts` already carries a defensive parse for it, and that file's
own comment at line 90 describes this defect precisely: "the driver does not
always hand it back parsed … content was returned as a STRING, so
`content?.blocks` was `undefined`".

That is the permanent compatibility shim you warned about in 1706, already
standing, on a table nobody flagged. I did not fix it: §10 of this round
authorises neither, it needs its own backfill, and removing the shim afterwards
is an RCC-visible decision rather than a server tidy-up. It is yours to classify.

## Two things I changed that you did not ask for, both reported rather than buried

1. `RELEASE_CAPABILITIES_VERSION` R8_3.4 -> R8_3.5. The release-wide set is
   byte-identical, so `registryDigest` — which hashes `capabilityRegistry()` with
   NO platform (`candidate.ts:360`) — does not move. What changed is the RESOLVED
   view served to an iOS caller. Leaving the version alone would let one version
   string stand for two different iOS answers, which is the stale-flag failure the
   digest was added to catch, in the one dimension the digest cannot see. The
   file's own rule at line 59 says bump on any change to the set.

   **This is a gap you may want to classify:** `registryDigest` cannot see a
   platform override at all. Today the version bump covers it by hand, which is
   exactly the "someone remembering" mechanism you argued against in 1707. I did
   not widen the digest — that is release-monitoring work and §10 excludes it.

   `docs/product/V1_CAPABILITY_REGISTRY_R14.json` records "serves
   RELEASE_CAPABILITIES_R8_3.4 … 25 rows" and is now one version behind. It is
   your document; I did not edit it.

2. The live-wiring `/search` suite described above. Your step 3 is satisfied
   without it; it exists because the synthetic override would keep passing if the
   row were deleted.

## Test results, including what failed

  matters route              18/18
  migration 0101             13/13
  party-search-platform      22/22
  release + capabilities     63/63 (re-run after the version bump)
  full services/api          1126 tests · 1121 pass · 1 fail · 4 skipped
  typecheck (api, db)        clean
  lint (this round's files)  clean

The one API failure is the sparse wall-clock flake this round's brief names, and
I did not weaken its threshold. `sparse-bound.test.ts` "admits a globally common
term inside a NARROW court+date population" — both CORRECTNESS assertions passed
(not refused, population actually ranked); only `ms < 5000` failed, at 5734 ms,
after seven minutes of suite load on the box. Re-run alone: **383 ms**, 5/5 pass.
The MATERIALIZED plan fence that assertion guards is intact (the unfenced figure
its comment records is 10,799 ms).

Separately, `packages/db` "audit_log leaves no rows behind" fails on this
database and is NOT mine: 950 of its 966 rows predate this session, earliest
9 Aug 2026. `audit_log` is append-only by design, so once any suite writes a row
on a shared database that assertion can never pass there again. Structural, not a
regression, and out of this round's scope.

BLOCKERS: none.
