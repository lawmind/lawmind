-- Authentication. better-auth self-hosted, magic link by email, JWT access token
-- plus a rotating refresh — `sprints/SPRINT_5.md`, `TRD.md` §Auth.
--
-- The four `auth_*` tables are better-auth's, and their columns were read out of
-- `getAuthTables()` in the installed library rather than written from its
-- documentation. A guessed schema for somebody else's library is a migration that
-- applies cleanly and fails at the first login.
--
-- They are prefixed because better-auth asks for models called `user`, `session`,
-- `account` and `verification`, and those are generic names in a schema that
-- already holds `users`. The drizzle adapter maps the model names back, so the
-- library is unaffected and the database says where its tables came from.
--
-- IDENTITY IS NOT PROFILE. `auth_user` records that an email address was proven
-- reachable. `users` records that somebody is an advocate, with the name and
-- phone number that `users` requires NOT NULL and a magic link cannot supply.
-- Verification creates the first; onboarding creates the second. `users.auth_id`
-- has been the join since S0 and is now what it was always for.

CREATE TABLE auth_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE
);

CREATE INDEX auth_session_user_id_idx ON auth_session (user_id);

-- Required by better-auth, unused by us. There is no OAuth provider and no
-- password in this product: the only credential is a link sent to an address the
-- advocate already controls, which is also why there is no password to reuse,
-- leak or reset.
CREATE TABLE auth_account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_account_user_id_idx ON auth_account (user_id);

-- Where a magic-link token lives between being emailed and being used.
CREATE TABLE auth_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_verification_identifier_idx ON auth_verification (identifier);

-- Ours, not better-auth's. SPRINT_5 specifies a rotating refresh on a 30-day
-- sliding window.
--
-- STORED AS A HASH, NEVER AS THE TOKEN. A readable refresh-token table is a table
-- whose leak is a working login for every advocate in it.
--
-- `replaced_by` makes the rotation family walkable, which is what allows reuse
-- detection: presenting an already-rotated token means it was replayed, and the
-- answer is to revoke every live token for that advocate rather than let whoever
-- holds the stolen copy keep renewing it alongside the real client.
CREATE TABLE refresh_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  replaced_by text
);

-- The rotation path looks up by hash; the revoke-all path sweeps live tokens for
-- one user. Both are on the request path, not reporting.
CREATE INDEX refresh_tokens_user_id_live_idx
  ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
