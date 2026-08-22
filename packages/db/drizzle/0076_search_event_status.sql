-- ───────────────────────────────────────────────────────────────────────────
-- A 500 AND AN EMPTY CORPUS LOOKED IDENTICAL IN THE TELEMETRY
-- ───────────────────────────────────────────────────────────────────────────
--
-- Found by reading `/admin/metrics` an hour after building it, which is the
-- point of building it. The alert fired:
--
--     page   zeroResultRate   100.0% of searches returned nothing
--
-- 48 case-name searches and 2 concept searches in twenty minutes, every one
-- recording `result_count = 0`, `degraded = '{}'`, average latency 25,108 ms —
-- against a database another process (a backup dump) was saturating at the
-- time.
--
-- **They were not zero-result searches. They were 500s.** A query on the tail of
-- the request — after both ranking arms, where nothing is wrapped in
-- `bounded()` — was cancelled by `statement_timeout`, the request threw, and the
-- telemetry write in `finally` recorded a search that found nothing.
--
-- That is the silent drop `CITATION_HARNESS.md` holds at a zero threshold,
-- hiding in the metrics rather than in the response: "we are broken" and "there
-- is no such law" are the two states an advocate must never see confused, and
-- an operator reading this table could not tell them apart either.
--
-- Nullable with no default and no backfill, deliberately. The 50 rows already
-- written genuinely do not know their status, and inventing 200 for them would
-- assert the opposite of what was measured. NULL means "written before this
-- column existed" and reads as unknown, which is true.
SET LOCAL lock_timeout = '3s';

ALTER TABLE search_events
  ADD COLUMN IF NOT EXISTS http_status integer;

-- The question this column exists to answer: how many of the searches that
-- returned nothing were actually failures.
CREATE INDEX IF NOT EXISTS search_events_failed_idx
  ON search_events (occurred_at DESC)
  WHERE http_status >= 500;

COMMENT ON COLUMN search_events.http_status IS
  'LCC, 22 Aug 2026. The status the advocate actually got. Added because 50 '
  'searches recorded zero results with an empty degraded array and were in fact '
  '500s from an unbounded tail query cancelled at statement_timeout -- an '
  'outage that read as an empty corpus. NULL means the row predates this column.';
