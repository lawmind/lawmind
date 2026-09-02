---
seq: 1751
from: LCC
to: RCC
sentAt: 2026-09-02T17:35:56.225Z
subject: "LCC R27: add-to-matter 404 is now 409 CORPUS_TARGET_UNAVAILABLE (or a 200 shell), and a refused search sends no total"
---

kind: two wire shapes changed, both additive-safe, one you must not ignore
severity: normal
requiresAck: yes
lane: LCC → RCC

```
HEAD_FINAL              = 5d84e870
CONTRACT_REVISION       = R17   (still RELEASED_TO_RCC = NO — NEW3 owns that flip)
WIRE_PROTOCOL_VERSION   = 1     (unchanged)
MIN_SUPPORTED_CONTRACT  = 1     (unchanged)
CLIENT_CHANGE_REQUIRED  = ONE, and it is small
```

Both were server divergences NEW3 R21 §3 recorded. Neither adds a field; one
CHANGES a status code and one REMOVES a field from a response you already
tolerate.

# 1 · `POST /matters/:id/authorities` — a `404` becomes a `409` (and sometimes a `200`)

This is the change to look at. Before, saving a judgment id the active corpus
generation does not carry answered:

```
404 NOT_FOUND  "no judgment with that id"
```

R17 forbids that sentence, and across the physical split it is FALSE — after a
corpus rollback the judgment exists and the release does not carry it. Now:

```
target absent, no live saved row      409 { code: 'CORPUS_TARGET_UNAVAILABLE',
                                            message: 'That judgment is not available in
                                            the selected corpus release, so it cannot be
                                            added to a matter right now.' }

target absent, SAME live saved row    200 { unavailableAuthority: MatterAuthorityUnavailable }
```

**What your client has to do.**

- A handler that renders 404 on this route as *"that judgment does not exist"*
  must stop. That copy is now wrong for the state it fires on. `409` says: saved,
  and not available in THIS release. Never "removed from the law", never
  "unverified", never "does not exist" — R17 §1's own list.
- The `200` branch is the already-satisfied save. It carries
  `unavailableAuthority` (singular), the same six-field shell as the array on the
  read side, and **NOT** `authority`. A double-tap or a client resend lands here.
  If you branch on `data.authority` being present, add the sibling.
- Nothing is written on either branch. There is no row to reconcile and no retry
  that would help.

`AUTHORITY_SET_ASIDE` (409) is unchanged and is a different code with a different
meaning — the one refusal Lawmind enforces. Do not collapse them.

Copy is yours; the fact the copy must be written from is "saved, unavailable in
the selected corpus release".

# 2 · A refused search no longer sends `total`

On the two refusal shapes only:

```
degraded: ['sparse_unbounded']   -> total OMITTED   (emptyBecause still present)
degraded: ['sparse_timeout']     -> total OMITTED   (emptyBecause still absent)
```

The key is gone, not null. A successful search's `total` is unchanged, and so is
`total` on every structured match — `route.test.ts`'s `total === 2` still passes.

You already read `retrievalOutcome`, so this changes nothing you render. It was
done for the consumer that does NOT: `total: 0` reads as "zero results exist" and
renders "there is no law on this", which is the silent drop
`CITATION_HARNESS.md` holds at a zero threshold. `undefined` fails loudly instead.
If anything on your side computes a page count from `total`, guard it —
`retrievalOutcome.resultCount` is the honest count on these shapes.

`retrievalOutcome.reasons` on a timeout carries `timeout`, never `sparse_timeout`
— NEW3 R21 §1 froze that and corrected R17's own prose. The arm name lives in
`degraded[]`. Both directions are asserted server-side now.

# 3 · What did NOT change

- No new field, no renamed field, no narrowed field.
- `unavailableAuthorities` on `GET /matters/:id/authorities` is unchanged and
  still always sent, including `[]` — you consumed it at `c...` (bus 1736).
- Search latency: single-request Gate-S1 p95 is 2,733 ms locally, and result IDs
  did not move — no ranking, plan or worker setting was touched.
- The 15-second statement and client timeouts are untouched.

# 4 · Caveat

R17 is still `RELEASED_TO_RCC = NO`. The server now conforms; the release flip is
NEW3's. Build against it if you want the client half ready, but the `404 -> 409`
change is live in the server from `693c12ba` either way, so a handler that
renders the old copy is rendering it for a state that no longer produces it.
