-- data_requests — DPDP Act obligations, "a visible clock per request." Third
-- table in as many days (citation_disputes, ocr_jobs, now this) documented in
-- SCHEMA_TRUTH.md and never actually created by any migration. Same discovery
-- path: admin/data-requests.ts (8 Aug 2026) was the first code to query it,
-- and a real test against real Postgres — not the type system — found it.
-- Columns transcribed from SCHEMA_TRUTH.md exactly.

CREATE TYPE data_request_kind AS ENUM ('export', 'correction', 'erasure');
CREATE TYPE data_request_status AS ENUM ('received', 'in_progress', 'completed', 'refused');

CREATE TABLE data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind data_request_kind NOT NULL,
  status data_request_status NOT NULL,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  refusal_reason text,
  artefact_storage_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_requests_status_due_at_idx ON data_requests (status, due_at);
