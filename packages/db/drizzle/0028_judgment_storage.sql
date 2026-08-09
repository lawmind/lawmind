-- Tiered corpus storage — the key, and the spend that produced it.
--
-- `docs/CURRENT_PLAN.md` §A3b.2 and §A3b.6. `docs/CORPUS_TIERING.md` §3.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `judgments.storage_key` IS A KEY, NOT A URL, AND NEVER POINTS AT A PDF
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two different things are deliberately not conflated here.
--
-- `source_url` already exists and points at **somebody else's CDN** —
-- `s3://indian-supreme-court-judgments` and `s3://indian-high-court-judgments`
-- are public, permanent and CC-BY-4.0. **The PDF is never copied.** Storing a
-- second copy of 15.9M PDFs would cost real money to duplicate something AWS
-- sponsors, and `CORPUS_TIERING.md` §3 books that line at zero on purpose.
--
-- `storage_key` points at **our own R2 object**: the brotli-compressed judgment
-- TEXT, which is ours to hold because we extracted it and because Tier 3 reads
-- it by key on the cold path. It is a key rather than a URL so that the bucket,
-- the account and the endpoint can all change without a data migration — a URL
-- would embed today's account id in 15.9M rows.
--
-- Nullable, because it must be: Tier 1 is the 38,341 Supreme Court judgments
-- held hot in Postgres and they have no R2 object at all. A NULL here means
-- "not tiered out", which is a real and permanent state, not a missing value.
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS storage_key text;

-- Partial: the whole point is finding the rows that HAVE been tiered out, and
-- at 15.9M rows the NULLs are the majority for as long as Tier 1 exists.
CREATE INDEX IF NOT EXISTS judgments_storage_key_idx
  ON judgments (storage_key)
  WHERE storage_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE OPERATION LEDGER — AGGREGATED, AND THAT IS THE DESIGN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `ecourts_fetch_ledger` writes ONE ROW PER REQUEST because the eCourts grant is
-- counted in requests — 1,000 a day — and the question it answers is *"did we
-- stay inside the grant"*. Every refusal is recorded, because a ledger of only
-- the requests we made could show volume and never show that the locks held.
--
-- **R2's constraint is spend, not permission.** Class A is $4.50 per million and
-- the corpus is 15.77M judgments, so a per-operation ledger would be tens of
-- millions of rows to audit a two-figure dollar number — the audit costing more
-- than the thing audited, and the table itself becoming the write pattern it
-- exists to catch.
--
-- So this is one row per run per window: counts, cost, and what refused. The
-- window counter is the right instrument for a budget; a per-request ledger is
-- the right instrument for a licence. Using either for the other's job is the
-- mistake, and it is written down here so nobody "fixes" this into per-row.
CREATE TABLE IF NOT EXISTS r2_operation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which job produced these operations. Free text so a one-off script is as
  -- accountable as a scheduled job.
  run_label text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  class_a_count bigint NOT NULL DEFAULT 0,
  class_b_count bigint NOT NULL DEFAULT 0,
  free_count bigint NOT NULL DEFAULT 0,
  bytes_written bigint NOT NULL DEFAULT 0,
  -- Computed by the application from the published per-million rates, and stored
  -- rather than derived so that a future price change cannot silently rewrite
  -- what we believed we spent at the time.
  operation_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  ceiling_usd numeric(12, 6) NOT NULL,
  -- Non-null when the budget or the halt switch stopped the run. A ledger that
  -- recorded only completed work would hide exactly the events worth reviewing.
  refusal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A window that ends before it starts is a clock or a code bug, and either way
  -- the arithmetic downstream would be wrong.
  CONSTRAINT r2_ledger_window_ordered CHECK (window_end >= window_start),
  -- Counts and costs are never negative. Cheap to assert, and it makes "sum the
  -- ledger" a trustworthy answer rather than one that needs a sanity filter.
  CONSTRAINT r2_ledger_counts_non_negative CHECK (
    class_a_count >= 0 AND class_b_count >= 0 AND free_count >= 0
    AND bytes_written >= 0 AND operation_cost_usd >= 0
  )
);

CREATE INDEX IF NOT EXISTS r2_operation_ledger_window_idx
  ON r2_operation_ledger (window_start DESC);

-- The halt switch. `platform_config` already carries the eCourts kill switch and
-- this reuses that mechanism rather than inventing a second one.
--
-- **It is NOT inserted here, and that is deliberate.** For eCourts a missing row
-- reads as OFF, because the danger there is contacting somebody else's service
-- under a permission nobody checked. Here the danger is spend, the guard is the
-- budget ceiling in `packages/storage/src/spend.ts` — which has a default that
-- binds — and a missing row correctly reads as "not halted". Seeding a row would
-- imply the switch is the primary gate. It is an incident control.
