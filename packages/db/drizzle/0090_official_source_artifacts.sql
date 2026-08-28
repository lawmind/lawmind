-- 0090 — OFFICIAL SOURCE OBSERVATIONS AND ARTIFACT PROVENANCE
--
-- Owner: LCC. Requested by the founder for the licensed Supreme Court/eCourts
-- data paths. Additive and rollback-safe: no existing table or row is changed.
--
-- A source observation is not a canonical judgment. The homepage/search result,
-- the PDF, and the judgment row are three different objects. Keeping them apart
-- prevents an order or editorial summary from becoming judgment text merely
-- because it arrived from an official host.

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS official_source_fetch_ledger (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                   text        NOT NULL,
  endpoint                 text        NOT NULL,
  requested_at             timestamptz NOT NULL DEFAULT now(),
  outcome                  text        NOT NULL,
  http_status              integer,
  duration_ms              integer,
  refusal_reason           text,
  authorization_basis      text        NOT NULL,
  conditions_version       text,
  CONSTRAINT official_source_fetch_source_check CHECK (
    source IN ('sci_homepage', 'sci_search', 'sci_pdf', 'ecourts', 'aws_sc', 'aws_hc')
  ),
  CONSTRAINT official_source_fetch_outcome_check CHECK (
    outcome IN ('ok', 'refused', 'error')
  ),
  CONSTRAINT official_source_fetch_authorization_check CHECK (
    authorization_basis IN (
      'public_official', 'sci_written_grant', 'ecourts_registrar_grant', 'aws_open_data'
    )
  )
);

CREATE INDEX IF NOT EXISTS official_source_fetch_requested_idx
  ON official_source_fetch_ledger (requested_at DESC);

CREATE TABLE IF NOT EXISTS official_source_artifact (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                   text        NOT NULL,
  artifact_role            text        NOT NULL,
  observation_state        text        NOT NULL,
  observed_at              timestamptz NOT NULL DEFAULT now(),
  source_asserted_at       timestamptz,
  source_url               text        NOT NULL,
  source_document_key      text,
  content_type             text,
  payload_sha256           text        NOT NULL,
  payload_bytes            integer     NOT NULL,
  raw_bytes                bytea,
  storage_key              text,
  metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extraction_note          text,
  authorization_basis      text        NOT NULL,
  conditions_version       text,
  fetch_ledger_id          uuid REFERENCES official_source_fetch_ledger (id),
  judgment_id              uuid REFERENCES judgments (id) ON DELETE SET NULL,
  CONSTRAINT official_source_artifact_source_check CHECK (
    source IN ('sci_homepage', 'sci_search', 'sci_pdf', 'ecourts', 'aws_sc', 'aws_hc')
  ),
  CONSTRAINT official_source_artifact_role_check CHECK (
    artifact_role IN (
      'judgment_index', 'judgment_pdf', 'order_index', 'order_pdf',
      'editorial_summary', 'cause_list', 'case_status', 'court_order'
    )
  ),
  CONSTRAINT official_source_artifact_state_check CHECK (
    observation_state IN (
      'observed', 'verified_judgment', 'duplicate_linked', 'refused_nonjudgment',
      'fetch_failed', 'identity_ambiguous', 'gap_unresolved'
    )
  ),
  CONSTRAINT official_source_artifact_authorization_check CHECK (
    authorization_basis IN (
      'public_official', 'sci_written_grant', 'ecourts_registrar_grant', 'aws_open_data'
    )
  ),
  CONSTRAINT official_source_artifact_payload_size_check CHECK (payload_bytes >= 0),
  CONSTRAINT official_source_artifact_hash_check CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS official_source_artifact_observed_idx
  ON official_source_artifact (observed_at DESC);
CREATE INDEX IF NOT EXISTS official_source_artifact_url_idx
  ON official_source_artifact (source_url);
CREATE INDEX IF NOT EXISTS official_source_artifact_hash_idx
  ON official_source_artifact (payload_sha256);
CREATE INDEX IF NOT EXISTS official_source_artifact_judgment_idx
  ON official_source_artifact (judgment_id)
  WHERE judgment_id IS NOT NULL;

-- Both ledgers are evidence. Corrections are new rows, never mutations of what
-- the source returned or what the guard decided at the time.
CREATE OR REPLACE FUNCTION official_source_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'official source evidence is append-only: % refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS official_source_fetch_no_update ON official_source_fetch_ledger;
CREATE TRIGGER official_source_fetch_no_update
  BEFORE UPDATE OR DELETE ON official_source_fetch_ledger
  FOR EACH ROW EXECUTE FUNCTION official_source_append_only();

DROP TRIGGER IF EXISTS official_source_artifact_no_update ON official_source_artifact;
CREATE TRIGGER official_source_artifact_no_update
  BEFORE UPDATE OR DELETE ON official_source_artifact
  FOR EACH ROW EXECUTE FUNCTION official_source_append_only();

COMMENT ON TABLE official_source_artifact IS
  'Append-only official-source evidence. Index/search observations, PDFs and '
  'canonical judgments remain distinct; source role and authorization basis are '
  'stored so summaries/orders cannot masquerade as judgments.';

