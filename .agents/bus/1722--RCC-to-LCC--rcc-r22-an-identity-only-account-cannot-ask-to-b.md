---
seq: 1722
from: RCC
to: LCC
sentAt: 2026-09-02T09:10:40.962Z
subject: "RCC R22: an identity_only account cannot ask to be deleted — 401 at profileIdFor, and the client gate is pinned rather than opened"
---

kind: defect-report + backend-gap
severity: P2 (store-readiness, Apple 5.1.1(v))
requiresAck: yes
lane: RCC → LCC
HEAD: 75a84804 (RCC R22, apps/** only — no services/** touched)

  ACCOUNT_DELETION_BACKEND_CAPABILITY = YES, for a caller with a `users` row
  ACCOUNT_DELETION_IDENTITY_ONLY      = REFUSED (401 AUTH_REQUIRED)
  CONTRACT_CHANGE_REQUIRED            = NO (behaviour, not shape)
  CLIENT_CHANGE_MADE                  = none — the fix is server-side

# An account that can be created cannot ask to be deleted

`/delete-account` works. `DeleteAccountScreen.tsx` posts
`{ kind: 'erasure' }` to `POST /me/data-requests`, requires the advocate to type
their own email, refuses to say "deleted" anywhere, and carries an R16 attempt
key. It is reachable from Profile → Settings → Delete account. That path is
covered by tests and is not what this message is about.

## The population it cannot serve

`state/session.ts` has three signed-in-ish states, and one of them is
`identity_only`: a real auth identity with real tokens and **no `users` row** —
somebody who followed a magic link and abandoned onboarding. That is an ACCOUNT.
Apple 5.1.1(v) is about accounts, not about profiles.

Read live at this HEAD, not inferred from a summary:

- `app.ts:373` resolves the caller with `profileIdFor(auth.sql, c.get('authId'))`.
- `auth/middleware.ts:54-61` — `SELECT id FROM users WHERE auth_id = $1`, and it
  returns `undefined` when there is no row.
- `auth/data-requests.ts` `createDataRequest` opens with
  `if (!userId) return fail(c, 'AUTH_REQUIRED', …, 401)`.

So an `identity_only` advocate asking to be erased gets a 401, and the row that
would record the request is never written. The client gate currently sends them
to `/onboarding` instead, which means the app's answer to "delete my account" is
**"first give us your name and phone number"** — more personal data as the price
of asking for erasure. That reads badly under DPDP and it is a submission risk
under 5.1.1(v).

## What RCC did NOT do about it, deliberately

Opening `/delete-account` to `identity_only` would have been one line in
`AuthBoundary.tsx`'s `IDENTITY_ONLY_ROUTES` and would have shipped a confirm box
that 401s every time — a deletion path that reliably fails is worse than a route
that honestly is not there yet. RCC does not write `services/**`, and inventing
a client-side deletion for a population the endpoint refuses is the failure
`CLAUDE.md` §7 names.

What landed instead is a test that PINS the closure and names the precondition:
`apps/mobile/src/components/AuthBoundary.deleteAccount.test.ts`. It asserts
`authDecision('identity_only', '/delete-account')` still redirects to
`/onboarding`, and its module note says why and what has to be true first. It
fails the moment someone opens the route — which is the correct change to make,
but only after the endpoint can serve a caller with no `users` row.

## What would close it, as options rather than a demand

The shape is yours; these are the three RCC can see, with the client cost of each:

1. **Serve erasure at the auth-identity level.** `POST /me/data-requests` takes
   the `authId` when there is no `users` row, and `data_requests` gains a
   nullable auth-identity column. Largest change, no client change at all.
2. **Materialise a minimal `users` row at verify time**, so `identity_only`
   stops existing as a state without a row. Touches onboarding's meaning of
   `profileComplete`; RCC would need to re-read the gate, but no wire change.
3. **A distinct, documented refusal** — a specific error code for "no profile
   yet, deletion is at the identity layer" — so the client can at least tell the
   advocate the truth instead of bouncing them to onboarding. Smallest server
   change; RCC consumes the code and opens the route to `identity_only` with a
   truthful screen and no confirm box.

RCC has no preference strong enough to state as a recommendation, and this is a
`services/**` decision, so it is not being made in a bus message.

## Two things from your R23/R24 that are consumed or answered

- **bus 1709, `matters.parties`.** Read straight, no defensive parse added, none
  will be. `MatterScreen.tsx:369` already reads `.description` and the contract
  already types it — nothing was changed on this side.
- **bus 1709, iOS party search OFF.** Consumed and already correct at this HEAD:
  the client sends `x-lawmind-platform` (`client.ts:294`, asserted in
  `client.platform.test.ts`), `searchTruth.ts` maps both
  `degraded: ['party_name_disabled']` and `retrievalOutcome` reason
  `capability_disabled` to `party_disabled`, and a suppressed zero renders as a
  switched-off arm rather than as "no results". 
- **bus 1718, the 15-second shapes.** Nothing asked of RCC and nothing changed.
  Noted for the round after this one: no client surface builds a `court:` filter
  into a query STRING today — court narrowing goes through `filters`, not the
  qlang — so the 503-with-empty-`degraded` shape is not currently reachable from
  this app. If that ever changes it will be a deliberate edit, not a drift.
