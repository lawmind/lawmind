# ACCOUNT ERASURE — TERMINATION PROOF

**Lane:** LCC · **Task:** LCC-2 (P0 release blocker) · **Date:** 23 Aug 2026
**Status:** token termination and identity minimisation PROVEN. One item
escalated to the founder (`credit_ledger`), one limitation restated (backups).

---

## 1. The defect, and why "returns 200" hid it

The existing suite proved the *content* half: matters gone, saved searches gone,
profile anonymised, ledger intact. It never asked whether the advocate could
still **sign in**. They could — by three independent mechanisms:

| # | mechanism | consequence |
| --- | --- | --- |
| 1 | `refresh_tokens` was never touched. Its FK is `auth_user.id`, **not** `users.id`, so a function that walks `users` never reaches it. | the family stayed live |
| 2 | `auth_user` was never touched. It kept the real name and email, **and** it is the existence check `rotateRefreshToken` performs before minting. | (1) became exploitable rather than merely untidy: a fresh access token, indefinitely, on a 30-day sliding window |
| 3 | the `auth_session` delete resolved the auth id through `(SELECT auth_id FROM users …)` **in a statement that ran after the same transaction had rewritten that column** to `erased-<uuid>`. | matched zero rows every time, and reported `auth_session: 0` — indistinguishable from a user who had no sessions |

`auth_account` and `auth_verification` were also untouched. A magic link already
sitting in the advocate's inbox is a working credential, and `auth_verification`
is keyed by **email address**, so it cascades from nothing.

The ordering bug in (3) is the transferable lesson: **the anonymisation destroys
the key the identity cleanup needs.**

---

## 2. Reproduced before it was fixed

`src/auth/erasure.test.ts`, against the real database, through `eraseUser` and
the real `issueTokens` / `rotateRefreshToken` (not hand-built rows — the refresh
token is stored only as a SHA-256 hash, so a test that INSERTed its own would
exercise a shape the product never produces):

```
✖ a refresh token minted before erasure cannot be rotated after it
  AssertionError: a pre-erasure refresh token still rotated — the account is
  deleted and still signs in
✖ destroys the better-auth identity, its sessions and its provider rows
  AssertionError: Expected values to be strictly equal          (auth_session: 0, had 1)
✖ a pending magic link cannot be redeemed into the erased account
  AssertionError: a magic link already sitting in the inbox outlived the account
  it opens
ℹ pass 7   ℹ fail 3
```

Each test asserts its **precondition** first (the refresh token rotates *before*
erasure; a session exists *before* erasure), so a pass cannot come from a
fixture that was never valid.

---

## 3. What changed

**Identity captured first.** `auth_id` and `email` are read at the top of the
transaction, before anything is redacted, and every identity statement uses the
captured values.

**Order reversed.** better-auth rows are destroyed *before* the profile is
anonymised:

```
DELETE FROM refresh_tokens    WHERE user_id   = <authId>
DELETE FROM auth_session      WHERE user_id   = <authId>
DELETE FROM auth_account      WHERE user_id   = <authId>
DELETE FROM auth_verification WHERE identifier = <email>
DELETE FROM auth_user         WHERE id        = <authId>
```

The first three would cascade from `auth_user`, and are still issued
**explicitly and counted**, because a cascade reports nothing: `auth_session: 1`
is the evidence that a session existed and is gone, and an erasure whose own
result cannot show what it terminated is one nobody can audit.

**Seven tables the function never named.** All carry `user_id`; all are empty
today (the premium spine exists and nothing has been sold), which is exactly why
they were easy to miss and exactly why they are added before the first paying
advocate closes an account:

| table | decision | why |
| --- | --- | --- |
| `activation_events` | DELETE | behavioural record of one person; the funnel is measurable in aggregate |
| `experiment_assignments` | DELETE | same |
| `experiment_exposures` | DELETE | same |
| `premium_jobs` | DELETE | carries `matter_id` and a params hash — points straight back at a client's case |
| `entitlements` | DELETE | LIVE state. An entitlement surviving its owner is a capability granted to a deleted account |
| `entitlement_events` | `user_id` → NULL | the provider's webhook ledger, and its FK is already `ON DELETE SET NULL` — the schema's own statement that the event outlives the person. Reconciling provider events against ours is how a double charge is found |
| `credit_ledger` | **LEFT — founder decision** | money. See §5 |

**`llm_calls.user_id` → NULL.** Verified against the live schema rather than
assumed: the table holds token counts, model, cost, latency, `data_class` and
`pseudonymised` — **no prompt content at all** — and **0 of 40,121 rows carry a
`user_id`** today. So there is no prompt residue to design a deletion for. What
there is, is a link between an advocate and what they asked for, and cost
accounting does not need it.

**The data-export artefact.** `data_requests.artefact_storage_key` points at a
single R2 object containing everything we held about this advocate — the most
concentrated file we ever write about one person — and `data_requests` rows
survive erasure by design (they are the record that it was asked for and carried
out). It was not returned by `erasedStorageKeys`, so the object was fetchable
forever and nothing said so. Now returned alongside the document keys.

---

## 4. Evidence — the live assertions, all twelve

```
✔ an advocate can raise an erasure request for their own account
✔ a second tap returns the SAME open request rather than a second clock
✔ an ordinary advocate cannot execute the erasure
✔ an admin executing it destroys the content and anonymises the identity
✔ the ledger records who did it, and cannot be edited afterwards
✔ a refresh token minted before erasure cannot be rotated after it
✔ destroys the better-auth identity, its sessions and its provider rows
✔ a pending magic link cannot be redeemed into the erased account
✔ an access token that has not yet expired cannot recover the identity
✔ revokes a share this advocate granted on a matter, in both directions
✔ hands back the data-export artefact key, not only document keys
✔ the request cannot be executed twice
ℹ pass 12   ℹ fail 0
```

Mapped to the task's required assertions:

| required | test |
| --- | --- |
| 1. issue refresh token | `signIn()` calls production `issueTokens` |
| 2. perform erasure | `eraseUser(...)` in each |
| 3. attempt refresh | `rotateRefreshToken(sql, live, SECRET)` |
| 4. refresh must fail | `assert.equal(rotated.ok, false)`; plus `refresh_tokens` live count `0` |
| 5. `GET /me` must not recover original active identity | *"an access token that has not yet expired…"* — `profileComplete: false`, `profile: null` through the real Hono app |
| 6. user-owned product rows absent/redacted | existing content test + the seven newly named tables |
| 7. shares revoked | *"…in both directions"* — granted-outward **and** received-inward, which are separate facts because deleting the victim's matters cascades only the first |
| 8. object-storage deletion responsibility explicit | *"hands back the data-export artefact key"* |

`tsc --noEmit -p services/api` clean.

---

## 5. Founder queue — `credit_ledger`

A purchase record is a **financial and tax document**. Erasing it to satisfy a
privacy request destroys an accounting record; keeping it retains a row tied to
a person who asked to be deleted. The two obligations point in opposite
directions and this is not an engineering call.

Left in place for now, pointing at the anonymised `users` row (no name, no
phone, no email, no sign-in). Empty today — 0 rows — so nothing is currently at
stake, and the decision is needed **before the first sale**, not before launch.

---

## 6. What this does NOT claim

- **An unexpired access token stays cryptographically valid.** A signed JWT
  cannot be un-signed. What it can *reach* is gone: the profile lookup goes
  through `users.auth_id`, which no longer matches, so the bearer sees a
  signed-in shell with no profile. Asserted on the response, not on the token,
  because the token's validity is not the product's promise. The residual window
  is the access-token TTL.
- **Backups are unchanged.** A restore of yesterday's dump restores yesterday's
  user. The backup retention window is the real bound on erasure and it belongs
  in the privacy disclosure. Not addressed here and not addressable here.
- **R2 objects are still the caller's job.** This service holds no R2
  credential. `erasedStorageKeys` is now complete (documents + export artefacts)
  but returning a key is not deleting an object, and the admin surface that
  consumes it has not been re-verified this round.
- **No claim of complete PII removal.** `PRIVACY_PII.md` opens by saying there is
  none, and `audit_log`, `citation_disputes`, `verification_cache`,
  `matter_authorities.added_by_user_id` and `platform_config.updated_by_user_id`
  all still reference the surviving `users` row. That row names nobody, which is
  a smaller residue — not zero.
- **Mobile is unverified from here.** `apps/mobile/app/delete-account.tsx` is
  NEW3's; the server contract it calls is unchanged by this round.
