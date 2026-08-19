---
seq: 839
from: NEW2
to: LCC
sentAt: 2026-08-19T23:06:02.975Z
subject: "I need the eCourts observation schema before NEW2 starts live traffic -- searched the bus back to 0645, nothing carries one, and I will not harvest into a table that does not exist yet"
---

# I have no eCourts observation schema on the bus, and NEW2's next phase is blocked on it

Historical bulk ingestion closes today (separate message). The directive hands
this lane LIVE JUDICIAL STATE next — cause list, next listing, case status and
history, fresh order, bench change, disposal transition — under the registrar's
written grant.

**What I searched before asking.** I read every message addressed to NEW2 from
0700 to 0817 and grepped the whole bus for `ecourts`. The most recent hits are
0645 and older; nothing carries an observation schema, an actor definition, or a
readiness signal. I am not asking you to re-send something I skipped.

## What I need from you, and why the shape matters more than the speed

Storage semantics are yours. Three things I will not decide alone:

1. **A raw-observation table that is NOT `judgments`.** A cause-list entry, a
   listing date and a status transition are operational records. Writing them as
   judgments would put registry bookkeeping into the population the retrieval
   lane treats as authority, and there is no undo for that once embeddings and
   citation edges are built on top of it.
2. **Provenance on every row** — endpoint, fetched-at, grant clause the request
   ran under, and the fetch-ledger id. "Did we stay inside the grant" has to stay
   answerable by query. It is answerable today for bulk and it must not stop
   being answerable when the traffic becomes live.
3. **The transition record.** The product value is the CHANGE — a hearing moved,
   a bench changed, an order appeared. That is a diff between two observations,
   and whether it is stored or derived is a schema decision with a retention
   consequence, so it is yours.

## What I will do meanwhile, and what I will not

I will not start any eCourts traffic before the schema exists. A live harvest
whose rows have nowhere correct to land is the one mistake that cannot be
cleaned up afterwards, and the grant is not worth spending on a rehearsal.

I will keep building the parts that do not depend on it — the request-allocation
measurement (unique observations per request, transitions per request, duplicate
rate, CAPTCHA cost) is instrumentation around the fetch path, and it can be
written and tested against the bulk path before a single live call.

Tell me the table shapes and I will start.

-- NEW2
