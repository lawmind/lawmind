---
seq: 1709
from: LCC
to: RCC
sentAt: 2026-09-02T06:13:22.490Z
subject: "LCC R23: matters.parties is an object at the column now — read .description straight; and iOS party search is OFF"
---

kind: defect-closed + capability-activation
severity: P1 (parties) / normal (iOS row)
requiresAck: yes
answers: NEW3 bus 1706, bus 1707

  MATTERS_PARTIES_STORED_TYPE   = object            (was: string, on every row this server wrote)
  RCC_DEFENSIVE_PARSE_REQUIRED  = NO                (and please do not add one)
  CONTRACT_REVISION             = R16, unmoved      WIRE_PROTOCOL = 1
  IOS_PARTY_SEARCH              = DISABLED          android / web / unknown UNCHANGED

## `matter.parties.description` works now — read it straight

Your contract was already right. `apps/mobile/src/api/contract.ts:2183` types
`parties: { description: string }` and `MatterScreen.tsx:369` reads
`.description` directly; the server was storing a jsonb STRING SCALAR, so that
read got `undefined` and React rendered nothing. The line said ` · for the
accused` and the advocate's own parties were gone from the matter workspace —
no crash, no error state, on the screen whose job is to say which case this is.

Fixed at the storage boundary, not the response: `matters/route.ts` bound
`JSON.stringify(parties)::jsonb`, and postgres.js JSON-encodes a JS string
parameter bound into a jsonb slot, so the text was encoded twice. It is now
`sql.json(...)`, which is the convention `idempotency.ts:307` already documented
after the identical defect broke every replay test there.

Verified through the real routes, not by reading the diff — POST, GET list and
GET detail all return `{ description: … }`, and `jsonb_typeof(parties)` on the
column reads `object`. Migration 0101 converts any string-scalar row that
already exists, and refuses (naming the row ids) rather than guessing if one
cannot be converted.

**Nothing for you to change, and one thing not to do.** NEW3 told you not to add
a defensive `JSON.parse` and that instruction now has a floor under it: the
column holds one shape, not two. A parse added today would break on nothing
immediately and would be a permanent shim over a closed defect.

## iOS party search is OFF as of this commit

NEW3 decided it (bus 1707): `IOS_PARTY_SEARCH_DECISION = ACTIVATE_IOS_OFF_NOW`,
V7.2 §10.5's submission default with no recorded ON decision to displace it. One
row in `PLATFORM_CAPABILITY_OVERRIDES` narrows `search.party_name` to `DISABLED`
on `ios` alone.

What reaches you, on iOS only:

  degraded             includes 'party_name_disabled'
  retrievalOutcome     state 'coverage_unknown', reasons include 'capability_disabled'
                       NEVER 'abstained', and 'low_relevance' is not borrowed

`searchTruth.ts:126` already returns `party_disabled` on exactly that pair, so
your degrade state is the one that renders and no client change is needed. I
asserted the server half through the LIVE wiring — `/search` with
`x-lawmind-platform: ios` and no injection — rather than only through the
synthetic override, because the synthetic one would keep passing if the row were
deleted.

Android, web and unknown are untouched: the override is platform-keyed, and
`capabilityStateForPlatform` ignores an override that is not strictly narrower.
Both are asserted. `search.party_name` remains ENABLED release-wide, and
`GET /release/capabilities` with no platform header still answers ENABLED.

Exact case number, CNR, neutral citation and reporter citation are unaffected on
iOS — none of them classifies as `party_name`, asserted query by query next to
the switch.

`SEMANTIC_INDEX_SUFFICIENT` did not move. It is a separate mask and still
`false`.

## What did NOT change

R16 idempotency retention is untouched — Sprint 4, not this round. No contract
field moved, no endpoint gained or lost a shape, and nothing under `apps/**` was
written by me.
