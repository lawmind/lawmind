-- 0096 — ECOURTS QUOTA RESERVATION, RAW-CAPTURE LINKAGE AND OBSERVATION STRATEGY
--
-- Owner: LCC. Additive and rollback-safe: three nullable columns, one index, no
-- existing row is changed and no existing constraint is loosened. The switch
-- stays off, no request has ever been made, and this migration makes none.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY, IN ONE PARAGRAPH EACH
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `observation_strategy`. Master Roadmap v5 §3.4 requires that every fetch-ledger
-- row record which strategy spent the quota, because the request budget
-- (2,000 ms apart, 100/hour, 1,000/day) is the binding constraint on the premium
-- business and "how many matters can we monitor" is answerable only per strategy.
-- Nullable, because the rows written before a planner existed genuinely have no
-- strategy and back-filling one would be inventing history.
--
-- `official_source_artifact.ecourts_fetch_ledger_id`. The raw bytes of an
-- authorised response live in `official_source_artifact` (0090) and the request
-- that obtained them is recorded in `ecourts_fetch_ledger`. The table's existing
-- `fetch_ledger_id` points at the OTHER ledger — the official-source one — so
-- without this column the link between an eCourts response and the request that
-- earned it would be a jsonb field and a hope. The first authorised response is
-- not a thing to be careless with.
--
-- `ecourts_observation.source_artifact_id`. A normalised observation must be
-- traceable back to the exact bytes it was read from. `payload_sha256` proves
-- the bytes were hashed; only this proves they were RETAINED.

SET LOCAL lock_timeout = '3s';

ALTER TABLE ecourts_fetch_ledger
  ADD COLUMN IF NOT EXISTS observation_strategy text;

ALTER TABLE ecourts_fetch_ledger
  DROP CONSTRAINT IF EXISTS ecourts_fetch_ledger_strategy_check;
ALTER TABLE ecourts_fetch_ledger
  ADD CONSTRAINT ecourts_fetch_ledger_strategy_check CHECK (
    observation_strategy IS NULL OR observation_strategy IN (
      'CAUSE_LIST_BATCH', 'CASE_STATUS', 'ORDER_CHECK', 'USER_REFRESH'
    )
  );

COMMENT ON COLUMN ecourts_fetch_ledger.observation_strategy IS
  'CAUSE_LIST_BATCH | CASE_STATUS | ORDER_CHECK | USER_REFRESH. Master Roadmap '
  'v5 §3.4: quota utilisation is analysable per strategy or pricing is a guess. '
  'NULL means the row predates the planner, never that no strategy was used.';

-- Quota admission counts rows in the last hour and the last day over rows that
-- reached the network. Under the advisory lock that decision is now serialised,
-- and this index is what keeps it cheap enough to hold that lock briefly.
CREATE INDEX IF NOT EXISTS ecourts_fetch_ledger_quota_idx
  ON ecourts_fetch_ledger (requested_at DESC)
  WHERE outcome <> 'refused';

ALTER TABLE official_source_artifact
  ADD COLUMN IF NOT EXISTS ecourts_fetch_ledger_id uuid REFERENCES ecourts_fetch_ledger (id);

CREATE INDEX IF NOT EXISTS official_source_artifact_ecourts_ledger_idx
  ON official_source_artifact (ecourts_fetch_ledger_id)
  WHERE ecourts_fetch_ledger_id IS NOT NULL;

COMMENT ON COLUMN official_source_artifact.ecourts_fetch_ledger_id IS
  'The eCourts request that obtained these bytes. Distinct from fetch_ledger_id, '
  'which references official_source_fetch_ledger; an eCourts fetch is recorded in '
  'ecourts_fetch_ledger because that is the table the registrar''s grant is '
  'audited against.';

ALTER TABLE ecourts_observation
  ADD COLUMN IF NOT EXISTS source_artifact_id uuid REFERENCES official_source_artifact (id);

CREATE INDEX IF NOT EXISTS ecourts_observation_source_artifact_idx
  ON ecourts_observation (source_artifact_id)
  WHERE source_artifact_id IS NOT NULL;

COMMENT ON COLUMN ecourts_observation.source_artifact_id IS
  'The retained raw response this observation was parsed out of. Raw capture '
  'happens before parsing is required, so a parser failure keeps the bytes and a '
  'later parser can re-read them without re-spending quota.';
