-- 0098 — A PERSONAL WORKSPACE IS AUTOMATIC, NOT REMEMBERED
--
-- Owner: LCC. 0097 backfilled a personal workspace for every EXISTING account
-- and made `matters.workspace_id` NOT NULL. This closes the other half: an
-- account created after 0097 must get its workspace too, or the first matter it
-- tries to create fails a NOT NULL on a column the mobile app has never heard
-- of.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A TRIGGER, NOT A LINE IN THE SIGNUP HANDLER, AND THE REASON IS COUNTABLE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two paths insert into `users` today — `services/api/src/auth/account.ts` and
-- `services/api/src/admin/founder-cli.ts` — plus test fixtures. Putting the
-- workspace in the signup handler leaves the founder CLI creating accounts
-- without one, and leaves the NEXT writer free to do the same. Nothing would
-- report it until an advocate created their first matter.
--
-- The requirement is that a personal workspace *exists for every v1 account*.
-- That is a property of the ACCOUNT, so it belongs where the account is written
-- — which is also the pattern this schema already uses for invariants that must
-- survive their writer (0002 append-only audit, 0061 observations, 0087 citation
-- key dirty, 0090 source artifacts).
--
-- `SECURITY DEFINER` is deliberately NOT used. There is no privilege escalation
-- to perform: the trigger writes only rows the inserting session could already
-- write, and marking it definer would widen the surface for nothing.
--
-- Both inserts are `ON CONFLICT DO NOTHING`, so the trigger is idempotent
-- against the partial unique index 0097 created and cannot fail a legitimate
-- insert. Re-running this migration is safe: `CREATE OR REPLACE` plus
-- `DROP TRIGGER IF EXISTS`.

CREATE OR REPLACE FUNCTION ensure_personal_workspace() RETURNS trigger AS $$
BEGIN
  INSERT INTO workspaces (owner_user_id, kind)
  VALUES (NEW.id, 'personal')
  ON CONFLICT DO NOTHING;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT w.id, NEW.id, 'owner'
  FROM workspaces w
  WHERE w.owner_user_id = NEW.id AND w.kind = 'personal'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_personal_workspace ON users;
CREATE TRIGGER users_personal_workspace
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION ensure_personal_workspace();

-- A belt on the backfill. If 0097's backfill ever ran against a database that
-- gained a user between its INSERT and its NOT NULL, this catches the straggler
-- rather than leaving one account permanently unable to create a matter.
INSERT INTO workspaces (owner_user_id, kind)
SELECT u.id, 'personal' FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id AND w.kind = 'personal'
)
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_user_id, 'owner' FROM workspaces w WHERE w.kind = 'personal'
ON CONFLICT DO NOTHING;
