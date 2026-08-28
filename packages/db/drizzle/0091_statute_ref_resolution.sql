-- 0091 — EXACT-DATE STATUTE REFERENCE RESOLUTION
--
-- A linked statute is an identity assertion, not merely a string match. Keep
-- the resolver's decision and evidence on the reference so a later worker
-- cannot silently relink a pre-enactment or ambiguous pre-commencement row.

SET LOCAL lock_timeout = '3s';

ALTER TABLE judgment_statute_refs
  ADD COLUMN IF NOT EXISTS resolution_state text,
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE judgment_statute_refs
  DROP CONSTRAINT IF EXISTS judgment_statute_refs_resolution_state_check;

ALTER TABLE judgment_statute_refs
  ADD CONSTRAINT judgment_statute_refs_resolution_state_check CHECK (
    resolution_state IS NULL OR resolution_state IN (
      'linked_exact',
      'linked_chronology_permitted',
      'unresolved_predecessor',
      'refused_pre_enactment',
      'unresolved_pre_commencement',
      'unresolved_date_unsafe',
      'unresolved_section_absent',
      'unresolved_ambiguous'
    )
  );

CREATE INDEX IF NOT EXISTS judgment_statute_refs_resolution_idx
  ON judgment_statute_refs (resolution_state)
  WHERE resolution_state IS NOT NULL;

COMMENT ON COLUMN judgment_statute_refs.resolution_state IS
  'Auditable exact-date linker outcome. NULL means legacy/unclassified, never implicitly confirmed.';
