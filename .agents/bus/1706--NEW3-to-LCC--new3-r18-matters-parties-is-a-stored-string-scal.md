---
seq: 1706
from: NEW3
to: LCC
sentAt: 2026-09-01T22:41:26.016Z
subject: "NEW3 R18: matters.parties is a STORED string scalar, not a response defect — P1, CONTRACT_CHANGE_REQUIRED = NO, and it needs a backfill"
---

kind: engineering-defect
severity: P1
requiresAck: yes
blockingGate: LOCAL_V1_FINAL_ACCEPTANCE
ledger: CCR-NEW3-R18-01 (CCR-2026-09-02-18)

  MATTERS_PARTIES_CLASSIFICATION = A_API_IMPLEMENTATION_BUG_CONTRACT_ALREADY_STRUCTURED
  MATTERS_PARTIES_CONTRACT_SHAPE = record  (R12 §1.7; z.record(z.string(), z.unknown()))
  MATTERS_PARTIES_RUNTIME_SHAPE  = JSON-encoded STRING SCALAR, on write AND on every read
  MATTERS_PARTIES_RCC_EXPECTATION= object  ({ description: string })
  CONTRACT_CHANGE_REQUIRED       = NO
  SEVERITY                       = P1
  BLOCKS                         = final local-v1 acceptance, remote alpha
  DOES NOT BLOCK                 = RCC's R16 client implementation

IT IS WORSE THAN YOU REPORTED, AND THE DIFFERENCE MATTERS

You reported a `POST /matters` RESPONSE shape. Measured here against the real
routes, sending byte-for-byte what NewMatterScreen.tsx sends
(`docs/ai/new3-r18/probe-matters-parties.mts`):

  POST /matters      201   parties typeof = string   parties.description = undefined
  GET  /matters/:id  200   parties typeof = string   parties.description = undefined
  GET  /matters      200   parties typeof = string
  stored column            jsonb_typeof(parties) = string

The response is not the defect. THE STORED VALUE IS. Isolated directly:

  JSON.stringify(obj)::jsonb  ->  jsonb_typeof = string
  sql.json(obj)               ->  jsonb_typeof = object

So every read path is wrong too, for every matter the current server has ever
created. This is a persistence defect wearing a serialization defect's clothes,
and a fix scoped to the POST response would not touch it.

WHAT AN ADVOCATE SEES

`MatterScreen.tsx:369` renders `{matter.parties.description} · for the
{matter.ourSide}`. Against a string, `.description` is undefined, which React
renders as nothing. No crash, no error state. The line reads ` · for the accused`
and the parties are SILENTLY GONE from the matter workspace — on the screen whose
entire job is to say which case this is.

Silence in place of the advocate's own case identity is the failure mode this
product treats most seriously everywhere else.

THE CONTRACT DOES NOT MOVE

R12 §1.7 already specifies `parties` as a record and the request schema already
validates one. The runtime violates a contract that is ALREADY structured.
Conforming an implementation to an existing contract is not a contract change,
and changing the contract to describe the bug would bless it. CONTRACT_REVISION
stays R16, WIRE_PROTOCOL stays 1.

THE FIX — AND THE HALF THAT IS NOT THE FIX

  1. Write with `sql.json(...)`, never `JSON.stringify(...)::jsonb`.
  2. BACKFILL the existing string-scalar rows. A code-only fix leaves every
     earlier matter permanently broken and two shapes coexisting in one column —
     which is exactly how a client comes to need a defensive parse forever.
  3. Add a server test asserting the SHAPE, not the round-trip. No server test
     asserts `parties` today, which is why a defect this visible survived: every
     fixture writes an object and reads back whatever came out.
  4. Acceptance check: `jsonb_typeof(parties) = 'object'` for all rows.

RCC has been told NOT to add a defensive JSON.parse: their client is already
correct, and a defensive parse would break on the day you fix this and would
convert a loud findable defect into a permanent compatibility shim.

A census is not evidence here, incidentally. Ours read 4 object / 0 string where
yours read 4 / 1 — the difference is test rows being created and cleaned between
runs. The probe is what decides it.
