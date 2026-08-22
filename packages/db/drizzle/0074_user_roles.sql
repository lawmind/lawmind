-- ───────────────────────────────────────────────────────────────────────────
-- ROLES — THE NAMED GAP `admin/audit.ts` HAS BEEN DOCUMENTING SINCE AUGUST
-- ───────────────────────────────────────────────────────────────────────────
--
-- `ADMIN_SURFACE.md` §15: *"Role writes are still missing... by design."* Every
-- endpoint under `/admin/*` therefore gated on the only check the codebase could
-- honestly make — `userId !== undefined` — which is to say: **any advocate who
-- signs up can read the audit ledger, list every user, and flip the eCourts kill
-- switch.** The comment in `admin/audit.ts` says so in plain words and has said
-- so for two weeks.
--
-- That is a public-launch blocker and it is closed here, in the only place it
-- can be closed: a column, a default that is not admin, and a middleware that
-- refuses unless the column says otherwise.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY A COLUMN AND NOT A ROLES TABLE
-- ───────────────────────────────────────────────────────────────────────────
--
-- A `user_roles` join table is the general answer and this is not a general
-- problem: there are two roles, one of them is "everybody", and nobody holds
-- more than one at a time. The ponytail ladder says the cheapest correct change
-- wins, and a join table here buys a migration nobody needs and a JOIN on the
-- authentication path. When a third role with overlapping grants exists, that is
-- the day the table earns itself.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 'advocate' IS THE DEFAULT AND THE CHECK IS THE ENFORCEMENT
-- ───────────────────────────────────────────────────────────────────────────
--
-- `NOT NULL DEFAULT 'advocate'` means a row created by any path — onboarding,
-- a fixture, a future import — is an ordinary advocate unless somebody
-- deliberately says otherwise. Deny-by-default has to live in the DEFAULT, not
-- in the application, or the first code path that forgets to set it creates an
-- admin.
--
-- The CHECK exists so a typo (`'Admin'`, `'administrator'`) is a failed write
-- rather than a silent denial of access to somebody who should have it, or —
-- far worse, if the middleware ever inverted its test — a silent grant.
SET LOCAL lock_timeout = '3s';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'advocate';

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_ck
    CHECK (role IN ('advocate', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial: the admin population is a handful of rows out of every user, and the
-- only question ever asked of this column on a large scale is "who are the
-- admins".
CREATE INDEX IF NOT EXISTS users_role_admin_idx ON users (id) WHERE role = 'admin';

COMMENT ON COLUMN users.role IS
  'LCC, 22 Aug 2026. advocate | admin. Deny-by-default: the DEFAULT is advocate '
  'so a row created by any path is not an admin unless somebody says so. '
  'Granted only through admin/role-cli.ts, which writes audit_log in the same '
  'transaction. NOTHING reads this column to decide product entitlement -- PD-2, '
  'enrolment and tier are not permissions, and neither is this: it gates the '
  '/admin surface and nothing else.';
