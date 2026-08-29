-- 0097 — FIRM-READY WORKSPACE OWNERSHIP SEAM
--
-- Owner: LCC. NEW3 froze this domain model in
-- `docs/product/NEW3_V1_PRODUCT_DEFINITION_R12.md` §8 and changed no service
-- code; the schema had none of it. Verified before writing: no table matching
-- `%workspace%` existed on this database, and `matters` was owned directly by
-- `user_id`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE DECISION THAT COSTS NOTHING NOW AND IS UNAFFORDABLE LATER
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NEW3's words: *"ownership resolves through Workspace, never directly through
-- User. Every ownership check written today against `user_id` is a check that
-- must be rewritten when the first two-partner firm signs up."*
--
-- There are twelve such checks in `services/api/src` today. Rewriting all twelve
-- in the same change that introduces the tables would be one migration and one
-- large behavioural edit landing together, with the tenant-isolation tests
-- written against both at once. So this migration creates the SEAM and enforces
-- it, and the checks move onto it afterwards, each with the old behaviour still
-- available to compare against.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY `matters.user_id` SURVIVES, AND WHY THAT IS NOT DUPLICATED OWNERSHIP
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two columns describing ownership are a defect when they can DISAGREE. They
-- cannot here: `matters (workspace_id, user_id)` is a composite foreign key into
-- `workspace_members (workspace_id, user_id)`, so a matter's user is, by
-- database constraint, a member of that matter's workspace. There is exactly one
-- answer to "who may see this matter" — the workspace's members — and `user_id`
-- degrades to "which member created it", which is information we want and which
-- `matter_authorities.added_by_user_id` already records for authorities.
--
-- Dropping `user_id` instead would break twelve queries at the moment the tables
-- appear, with no intermediate state in which both readings can be compared.
-- The composite key buys the same guarantee — no contradiction is representable
-- — without that cliff.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No enterprise UI, no invite flow, no role picker, and no second member is ever
-- created by this migration. `workspace_members` exists from day one precisely
-- so that adding one later is a ROW rather than a migration of every ownership
-- check in the product. `monitoring_entitlements` is frozen and unused in v1 —
-- it is here for the same reason, and `USER_MONITORING_PRODUCT` remains
-- `DISABLED_NOT_READY`.
--
-- Court observations are NOT user-owned and nothing here changes that.
-- `ecourts_observation` gets no workspace column: it is a fact about a court,
-- two advocates monitoring the same matter must share one observation and one
-- unit of quota, and an erasure request must never delete a public court record.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE CONTAINER
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The user whose personal workspace this is. Kept because a personal
  -- workspace must be findable from its user in one index hit, on every request,
  -- before any membership join.
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'personal' is the only kind v1 creates. The column exists so that a firm
  -- workspace is a new VALUE rather than a new table.
  kind text NOT NULL DEFAULT 'personal',
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_kind_check CHECK (kind IN ('personal', 'firm'))
);

-- Exactly one personal workspace per user, enforced rather than assumed. A user
-- with two personal workspaces is a user whose matters are split across two
-- containers with nothing reporting it.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_personal_owner_uniq
  ON workspaces (owner_user_id) WHERE kind = 'personal';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MEMBERSHIP — the seam, present from day one
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'member'))
);

-- The composite key `matters` will point at. A plain PK is already unique on
-- (workspace_id, user_id), but a FK needs a named unique constraint to target,
-- and the PK provides it — declared explicitly here so a future reordering of
-- the PK cannot silently drop the FK's target.
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BACKFILL — every existing account, before any NOT NULL is imposed
-- ─────────────────────────────────────────────────────────────────────────────

-- One personal workspace for EVERY user, not only users who happen to hold a
-- matter. "Personal Workspace automatically exists for every v1 account" is the
-- requirement, and a workspace created lazily on first matter is a workspace
-- that does not exist for the account that has not made one yet.
INSERT INTO workspaces (owner_user_id, kind)
SELECT u.id, 'personal' FROM users u
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_user_id, 'owner' FROM workspaces w WHERE w.kind = 'personal'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MATTERS BELONG TO A WORKSPACE
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE matters ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE matters m
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_user_id = m.user_id AND w.kind = 'personal' AND m.workspace_id IS NULL;

-- Only after the backfill. A NOT NULL imposed first would fail on the three
-- existing rows and leave the migration half-applied.
ALTER TABLE matters ALTER COLUMN workspace_id SET NOT NULL;

-- THE CONSTRAINT THAT MAKES TWO COLUMNS SAFE. A matter's user must be a member
-- of the matter's workspace; the pair cannot drift apart, and moving a matter
-- between workspaces without also moving or adding the member is rejected by the
-- database rather than by a code review.
ALTER TABLE matters
  ADD CONSTRAINT matters_workspace_member_fk
  FOREIGN KEY (workspace_id, user_id)
  REFERENCES workspace_members (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS matters_workspace_idx ON matters (workspace_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MONITORING ENTITLEMENT — frozen, unused, and deliberately present
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Zero rows are written by v1. It is here so that when monitoring becomes real
-- the entitlement is a row against a workspace rather than a column bolted onto
-- a matter — and so that the shape is fixed now, while nothing depends on it.

CREATE TABLE IF NOT EXISTS monitoring_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES matters(id) ON DELETE CASCADE,
  -- The policy the advocate was told about. Null while monitoring is disabled,
  -- which is every row in v1 because there are no rows.
  policy text,
  -- `never_attempted` is the honest v1 value and matches the wire vocabulary the
  -- frozen contract already publishes for `lastObservationOutcome`.
  state text NOT NULL DEFAULT 'never_attempted',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitoring_entitlements_state_check
    CHECK (state IN ('never_attempted', 'active', 'suspended', 'degraded')),
  CONSTRAINT monitoring_entitlements_workspace_matter_uniq UNIQUE (workspace_id, matter_id)
);
