-- A durable per-document record for the High Court ingest, `hc-load-cli.ts`.
--
-- Before this table, a restart only skipped documents already written to
-- `judgments` -- a SUCCESS ledger, effectively, via `source_url`'s unique
-- index. A document that failed (malformed PDF, missing decision date, a
-- fetch that timed out) left no trace: every restart re-downloaded and
-- re-attempted every one of them from scratch, forever, with no way to tell
-- "genuinely not yet tried" from "tried and failed three times already"
-- without re-reading a console log that does not survive the run.
--
-- `permanent` is the field that matters. A document whose row-level metadata
-- is unusable (`no_title`, `no_decision_date`, `test_fixture_bench` — the
-- bucket's own values, not the PDF) will read the same on attempt 10 as on
-- attempt 1, so it goes permanent on first sight. A document whose PDF fetch
-- timed out or 404'd (`pdf_timeout`, `pdf_missing`, `pdf_failed`) might be a
-- transient S3 hiccup, so it is retried up to `MAX_ATTEMPTS` (matching this
-- codebase's standing "3 failed cycles" convention) before the code gives up
-- on it too and marks it permanent — so a genuinely broken PDF stops costing
-- a download on every future restart, without a truly transient failure
-- being abandoned after one bad network moment.
--
-- Success needs no row here: `judgments.source_url` already is that record.
CREATE TABLE IF NOT EXISTS hc_ingest_ledger (
  source_url text PRIMARY KEY,
  -- Mirrors `SkipReason` in `hc-load.ts` plus the fetch/parse-level reasons
  -- `hc-load-cli.ts` adds. A CHECK, not an enum: this is an operational
  -- ledger for one ingest CLI, not a schema-truth table, and a new skip
  -- reason should not need a migration to record.
  outcome text NOT NULL,
  permanent boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 1,
  court_code text NOT NULL,
  year integer NOT NULL,
  first_attempted_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hc_ingest_ledger_attempts_positive CHECK (attempts > 0)
);

-- "What's left to retry" — the query a resumed run makes before touching the
-- network, and the query `--report` answers pending/retry-eligible from.
CREATE INDEX IF NOT EXISTS hc_ingest_ledger_retry_idx
  ON hc_ingest_ledger (court_code, year)
  WHERE permanent = false;

-- "What failed, and how" — the completion-proof breakdown by reason.
CREATE INDEX IF NOT EXISTS hc_ingest_ledger_outcome_idx
  ON hc_ingest_ledger (outcome, permanent);

ANALYZE hc_ingest_ledger;
