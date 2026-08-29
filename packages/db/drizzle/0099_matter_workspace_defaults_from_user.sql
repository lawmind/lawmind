-- 0099 — A MATTER FINDS ITS OWN WORKSPACE
--
-- Owner: LCC. 0097 made `matters.workspace_id` NOT NULL. Every INSERT in the
-- product supplies `user_id` and none supplies `workspace_id`, so without this
-- the next `POST /matters` fails on a column the mobile app has never heard of.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE DATABASE FILLS IT AND NOT `matters/route.ts`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The requirement is that *API behaviour for a single-user account does not
-- require the mobile app to understand Workspace*. The cheapest way to honour
-- that is for no caller to have to: `route.ts`, the briefings fixtures, the
-- admin CLI and every test that inserts a matter all keep working unchanged,
-- and RCC's frozen contract does not gain a field.
--
-- It also removes a whole class of future bug. A writer that forgets
-- `workspace_id` would otherwise get a NOT NULL violation at runtime — or,
-- worse, a developer would "fix" it by passing whatever workspace was handy.
-- Deriving it from `user_id`, which is already constrained to be a member of the
-- workspace, means there is exactly one workspace it CAN be.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT DELIBERATELY DOES NOT DO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- It does not override a workspace that was supplied. `IS NULL` is the guard, so
-- the day a firm workspace is real, an explicit `workspace_id` wins and the
-- composite foreign key still checks membership. This is a default, not a
-- policy.
--
-- It does not create a workspace. If the user somehow has none, the insert fails
-- loudly on the NOT NULL rather than quietly manufacturing a container — 0098's
-- trigger is what guarantees one exists, and a second mechanism papering over
-- its absence would hide the failure of the first.

CREATE OR REPLACE FUNCTION matter_default_workspace() RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT w.id INTO NEW.workspace_id
    FROM workspaces w
    WHERE w.owner_user_id = NEW.user_id AND w.kind = 'personal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS matters_default_workspace ON matters;
CREATE TRIGGER matters_default_workspace
  BEFORE INSERT ON matters
  FOR EACH ROW EXECUTE FUNCTION matter_default_workspace();
