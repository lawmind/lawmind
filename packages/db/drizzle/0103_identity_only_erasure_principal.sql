-- 0103 - THE PRINCIPAL IS THE AUTH IDENTITY, NOT THE PROFILE
--
-- Owner: LCC. Implements the persistence half of NEW3 R21 section 4 (bus 1729),
-- SR-2 and SR-3: an authenticated advocate with no `users` row must be able to
-- ask to be erased, and that request must be idempotent under R16 without being
-- special-cased out of it.
--
-- -----------------------------------------------------------------------------
-- THE DEFECT, STATED IN ONE SENTENCE
-- -----------------------------------------------------------------------------
--
-- `data_requests.user_id` and `api_idempotency_records.user_id` are both
-- `NOT NULL REFERENCES users (id)`, and `profileIdFor` returns `undefined` for a
-- verified identity that never finished onboarding - so `POST /me/data-requests`
-- answers 401 to an account that demonstrably exists, has an email address on
-- file, and has IP addresses and a device fingerprint in `auth_session`. RCC
-- reported it at bus 1722; Apple 5.1.1(v) and DPDP both ask for a path, and
-- "finish onboarding first" is the product demanding MORE personal data as the
-- price of deleting personal data.
--
-- -----------------------------------------------------------------------------
-- WHY `auth_id` AND NOT A NULLABLE SCOPE - SR-3, AND THE TRAP IT NAMES
-- -----------------------------------------------------------------------------
--
-- The obvious change is to make `user_id` nullable and leave the unique index
-- alone. That is the trap NEW3 names in terms, and it is worth restating because
-- it FAILS SILENTLY: **NULLs are distinct in a unique index.** With
-- `(NULL, 'POST', '/me/data-requests', 'k')` written twice, both inserts
-- succeed, no constraint complains, and every retry creates a second erasure
-- request while the API still returns 200 and the client still believes its key
-- was honoured. A scope that never collides is a bypass wearing R16's clothes.
--
-- So the scope moves to a column that is NOT NULL for BOTH populations.
-- `users.auth_id` is already `text NOT NULL UNIQUE` (0001), so the mapping
-- profile <-> identity is 1:1 and total: every profile-backed caller has exactly
-- one auth id, and an identity-only caller has one too. The boundary therefore
-- NARROWS FOR NOBODY and widens for nobody - it is the same set of distinct
-- principals, addressed by the identifier that exists earlier.
--
-- This is also what R16 said it was doing. 0100's own column comment reads
-- *"The PRINCIPAL, not the access token"* and then stores the profile id,
-- because at the time every one of the six routes resolved to a profile before
-- writing. The comment was right and the column was the approximation.
--
-- SR-4 falls out rather than being engineered: because the request is bound to
-- the identity and not to the profile, an advocate who completes onboarding
-- after asking to be deleted still has exactly one erasure request, and it is
-- still theirs. Nothing reconciles anything.
--
-- -----------------------------------------------------------------------------
-- WHY `user_id` IS KEPT, NULLABLE, AND STILL A FOREIGN KEY
-- -----------------------------------------------------------------------------
--
-- Dropping it would have been tidier and wrong. The admin surface joins
-- `data_requests` to `users` to show an operator whose account a clock belongs
-- to, `erasure.ts` collects `artefact_storage_key` by `user_id`, and R16's
-- erasure deletes idempotency records by `user_id`. All of that stays correct
-- for the profile-backed population, which is every existing row. The column
-- becomes what it always described: *the profile, if there is one yet.*
--
-- The backfill is a join, not a guess. Every existing row was written by a code
-- path that had already resolved a profile, so `users.auth_id` is present for
-- all of them and the `NOT NULL` below is set only after the backfill has run.
--
-- -----------------------------------------------------------------------------
-- NO FOREIGN KEY FROM `auth_id` TO `auth_user`
-- -----------------------------------------------------------------------------
--
-- Deliberate, and for the same reason `users.auth_id` has none: `eraseUser`
-- DELETES the `auth_user` row and then anonymises the profile. A foreign key
-- here would either block that delete or cascade the erasure request away - and
-- the request is the record that the erasure was ASKED FOR and carried out. It
-- is the one row that must outlive the identity it names.

-- -----------------------------------------------------------------------------
-- data_requests
-- -----------------------------------------------------------------------------
ALTER TABLE data_requests ADD COLUMN auth_id text;

UPDATE data_requests d
   SET auth_id = u.auth_id
  FROM users u
 WHERE u.id = d.user_id
   AND d.auth_id IS NULL;

-- Fail-closed. If any row could not be resolved to an identity the migration
-- stops here rather than installing a NOT NULL that silently drops it.
DO $$
DECLARE orphans bigint;
BEGIN
  SELECT count(*) INTO orphans FROM data_requests WHERE auth_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION
      '0103: % data_requests rows have no resolvable users.auth_id; backfill them before this migration can set NOT NULL',
      orphans;
  END IF;
END $$;

ALTER TABLE data_requests ALTER COLUMN auth_id SET NOT NULL;
ALTER TABLE data_requests ALTER COLUMN user_id DROP NOT NULL;

-- SR-6. The one-open-request-per-kind guard is a property of the PRINCIPAL, so
-- it is indexed on the principal. Without this an identity-only advocate who
-- taps twice gets two clocks and two audit trails, which is the exact outcome
-- the guard exists to prevent.
CREATE INDEX data_requests_auth_id_kind_idx ON data_requests (auth_id, kind);

-- -----------------------------------------------------------------------------
-- api_idempotency_records
-- -----------------------------------------------------------------------------
ALTER TABLE api_idempotency_records ADD COLUMN auth_id text;

UPDATE api_idempotency_records r
   SET auth_id = u.auth_id
  FROM users u
 WHERE u.id = r.user_id
   AND r.auth_id IS NULL;

DO $$
DECLARE orphans bigint;
BEGIN
  SELECT count(*) INTO orphans FROM api_idempotency_records WHERE auth_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION
      '0103: % api_idempotency_records rows have no resolvable users.auth_id; backfill them before this migration can set NOT NULL',
      orphans;
  END IF;
END $$;

ALTER TABLE api_idempotency_records ALTER COLUMN auth_id SET NOT NULL;
ALTER TABLE api_idempotency_records ALTER COLUMN user_id DROP NOT NULL;

-- THE UNIQUENESS BOUNDARY MOVES, AND THE OLD ONE IS DROPPED IN THE SAME
-- TRANSACTION.
--
-- Keeping both would be strictly worse than either: the old index would still
-- reject nothing for an identity-only caller (its `user_id` is NULL and NULLs
-- are distinct) while continuing to constrain profile-backed callers on a
-- second, redundant boundary. One rule, in one place, is the whole point of
-- 0100 and it stays that way.
--
-- Because `users.auth_id` is UNIQUE, this index accepts and rejects exactly the
-- same profile-backed key reuse the old one did. No existing key changes meaning
-- and no existing row becomes a duplicate.
CREATE UNIQUE INDEX api_idempotency_records_principal_key_unique
  ON api_idempotency_records (auth_id, method, route, idempotency_key);
DROP INDEX api_idempotency_records_scope_key_unique;
