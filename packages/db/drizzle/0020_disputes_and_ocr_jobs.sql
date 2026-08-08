-- citation_disputes and ocr_jobs — documented in SCHEMA_TRUTH.md and referenced
-- throughout ADMIN_SURFACE.md and API_CONTRACTS.md as existing tables, but NO
-- migration ever created either one. `citation_fanouts.trigger` has carried the
-- enum value 'dispute_upheld' since 0016 — the design anticipated this table —
-- and admin/disputes.ts, admin/ocr-queue.ts (8 Aug 2026) were the first code to
-- actually try to query it, which is how the gap surfaced: a test run, not a
-- guess. Columns transcribed from SCHEMA_TRUTH.md exactly, nothing invented.

-- --------------------------------------------------------- citation_disputes --
--
-- "The trust feedback loop. Outranks everything else in the admin."
--
-- Upholding is a FAN-OUT WRITE, not a status change: it creates a
-- citation_fanouts row via the same applyOverruledChange the nightly re-check
-- calls (admin/disputes.ts). This table only ever records the dispute's own
-- lifecycle — open/upheld/rejected, who resolved it, and a pointer to the
-- fan-out that did the actual work.

CREATE TYPE dispute_status AS ENUM ('open', 'upheld', 'rejected');

CREATE TABLE citation_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by_user_id uuid NOT NULL REFERENCES users (id),
  -- Both nullable: a dispute can be about a specific rendered citation, about a
  -- judgment with no particular check in view, or (rare) about neither — a
  -- claim about the check itself. admin/disputes.ts refuses to uphold one with
  -- no judgment_id, since the fan-out has nothing to act on.
  citation_check_id uuid REFERENCES citation_checks (id),
  judgment_id uuid REFERENCES judgments (id),
  claim text NOT NULL,
  status dispute_status NOT NULL DEFAULT 'open',
  resolved_by_user_id uuid REFERENCES users (id),
  resolved_at timestamptz,
  -- The field-level fix written to the corpus — what admin/disputes.ts passes
  -- into applyOverruledChange as toStatus/overruledParas/etc. jsonb, not typed
  -- columns, because SCHEMA_TRUTH does not commit to one correction shape and a
  -- historical record should survive that shape changing.
  correction jsonb,
  fanout_id uuid REFERENCES citation_fanouts (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX citation_disputes_status_created_at_idx ON citation_disputes (status, created_at);
CREATE INDEX citation_disputes_judgment_id_idx ON citation_disputes (judgment_id);

-- ------------------------------------------------------------------ ocr_jobs --
--
-- "confirmed_by_user gates use. OCR output is never trusted silently."
-- Nothing derived from a job is written to a matter until POST
-- /ocr/jobs/:id/confirm is called (still SPECCED) — this table exists ahead of
-- that endpoint the same way citation_disputes exists ahead of a UI that files
-- disputes, so the admin queue and the eventual intake endpoint agree on shape
-- from day one rather than the endpoint inventing one later.

CREATE TYPE ocr_source_type AS ENUM ('pdf_scanned', 'image', 'camera');
CREATE TYPE ocr_engine AS ENUM ('paddleocr', 'tesseract');
CREATE TYPE ocr_job_status AS ENUM ('queued', 'processing', 'complete', 'failed', 'needs_review');

CREATE TABLE ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  matter_id uuid REFERENCES matters (id),
  source_type ocr_source_type NOT NULL,
  storage_key text NOT NULL,
  engine ocr_engine NOT NULL,
  detected_script text[],
  status ocr_job_status NOT NULL,
  extracted_text text,
  extracted_fields jsonb,
  confidence_overall numeric(4, 3),
  low_confidence_blocks jsonb,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX ocr_jobs_user_id_status_idx ON ocr_jobs (user_id, status);
CREATE INDEX ocr_jobs_matter_id_idx ON ocr_jobs (matter_id);
