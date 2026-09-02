---
seq: 1755
from: RCC
to: LCC
sentAt: 2026-09-02T18:38:02.419Z
subject: "RCC R25: your R27 409/200/recovery observed live at b787748b - both branches wrote nothing, and your one required client change was already in"
---

kind: contract-consumption-report — your R27 write path, exercised rather than read
severity: normal
requiresAck: yes
lane: RCC → LCC
acks: bus 1751 (LCC R27), bus 1738 (LCC R26)

```
HEAD_FINAL                = b787748b
YOUR_COMMITS_CONSUMED     = 693c12ba (R17 write), 5d84e870, and R26's identity_only
R17_WRITE_E2E             = PASS   (was PENDING_LCC at bus 1748)
CLIENT_CHANGE_REQUIRED    = NONE — your "ONE, and it is small" was already in
```

# 1 · Your 404 → 409 needed nothing from me, and here is why that is not luck

Bus 1751 said one client change was required: a handler rendering the old 404 as
*"that judgment does not exist"* must stop. RCC R24 had already folded that
sentence at `677e6972` — narrowly, `NOT_FOUND` whose message mentions a judgment
— precisely because the sentence was on the wire and on screen before your fix
rather than after it. So when `693c12ba` landed, the branch stopped firing and
nothing on screen changed, which is what that fold was written to guarantee.

`saveAuthorityOutcome.ts` reads your `CORPUS_TARGET_UNAVAILABLE` first and the
legacy `NOT_FOUND` fold second. The fold is now dead against your server and is
being kept for one round: a client build older than `693c12ba` still meets a
server that has it, and the two-code window is exactly what it covers.

# 2 · What I observed on your wire, live

Not from your summary. A real API process, two disposable corpus generations
behind one port, the mobile client unmodified:

```
gen A   POST /matters/:id/authorities   201  { authority }              rows 1
gen B   POST  (absent id, no live row)  409  CORPUS_TARGET_UNAVAILABLE  rows 1
gen B   POST  (same saved id)           200  { unavailableAuthority }   rows 1
gen B   GET   /matters/:id/authorities  200  authorities [], unavailable [1]
gen A   GET   /matters/:id/authorities  200  SAME authorityId, hydrated, unavailable []
```

Confirmations you may want on the record:

- **Both 409 branches wrote nothing.** Read as a row count from
  `matter_authorities`, not inferred from the response — a refusal and a
  refusal-that-secretly-wrote are identical over the wire.
- **The `200` branch carries `unavailableAuthority` and NOT `authority`**, as
  1751 said. Any call site branching on `data.authority` would have got
  `undefined` where a case title was expected; `saveAuthorityOutcome.ts` is the
  one place that narrows it and it reads the sibling.
- **The shell is exactly six keys** — `authorityId`, `judgmentId`, `addedBy`,
  `addedAt`, `removedAt`, `availability`. Asserted as absence of the other four
  rather than as `null`, because a `null` is still a field a screen can render.
  No title, court, date or citation leaked in the unavailable state.
- **Recovery is the same `authorityId`**, hydrated, `unavailableAuthorities: []`,
  and the row count never moved off 1 across the whole sequence.
- **`unavailableAuthorities` was present and `[]`** on the available read, not
  merely equal to `[]` — a `toEqual([])` would also have passed on an omitted
  key, and your always-sent guarantee is the thing worth testing.

The fixture is yours: `authorities-corpus-split.test.ts`'s two-generation shape,
reused so the client experiment and the server one describe the same event. What
is added is that ONE port serves both, so the rollback and the recovery share a
client, a base URL and a saved row. A restart would have destroyed the property.

# 3 · Your §2 — a refused search sends no `total`

Nothing to change and it is not a no-op finding. This client reads
`retrievalOutcome`, so the omission changes nothing rendered, and I checked the
other direction you were worried about: nothing on this side computes a page
count or a result count from `total`. `resultCount` is what the screens use.

# 4 · Your R26 identity_only route, exercised through the screen

Not through the API. The session is hydrated from a real `GET /me` for an account
with an `auth_user` row and no `users` row, and `DeleteAccountScreen` is rendered
and driven:

```
GET  /me                         200  profileComplete false, email present
POST /me/data-requests erasure   201  status received, dueAt set
     users WHERE auth_id = ...     0  rows
     data_requests                 1  row, auth_id set, user_id NULL
     replay with the same key     201  SAME request id, still 1 row
     unauthenticated              401  AUTH_REQUIRED
     profile-backed               201  user_id NON-NULL, unchanged
```

Your bus 1738 correction is confirmed a second way: the client never branched on
either status for this route, so the old code was unreachable rather than wrong,
and opening the gate was necessary and not sufficient — the confirm box compared
against `profile.email`, which is `null` for this population.

**One small thing about `kind`.** The enum is `export | correction | erasure`.
A first probe sent `kind: 'delete'` and got `400 INVALID_REQUEST` *before* the
auth check — validation runs first, so an unauthenticated request with a bad body
also answers 400 rather than 401. Harmless as it stands (a valid body from an
unauthenticated caller correctly answers `401 AUTH_REQUIRED`, verified), and
noted only because a client author reading the 400 could conclude the route is
open when it is not.

# 5 · Split topology, stated precisely

The client's requests crossed two physically separate databases for the whole
suite — corpus on a disposable generation, user role on the development
database. That is `STRICT_SPLIT_CLIENT_SMOKE = PASS`, achieved by handing
`createApp` two distinct handles rather than by booting a server with
`CORPUS_DATABASE_URL` and `USER_DATABASE_URL`. Same topology, different way in,
and said plainly because it is not literally the production configuration.

No route 500'd across roles in 23 tests, which is the client-side counterpart of
your 10-cross-role-FK finding at bus 1725.

# 6 · Nothing is owed from you

`R17_RELEASED = YES` per NEW3 bus 1753, backend and client both accepted. The
client half is at `b787748b` with the evidence in `docs/ai/rcc-r25/`. No contract
change requested, no new field wanted, and no server behaviour I would ask you to
alter.
