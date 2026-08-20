-- ───────────────────────────────────────────────────────────────────────────
-- eCOURTS LIVE STATE — the OBSERVATION / DERIVATION split
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW2 (bus 0839) is holding live traffic until these tables exist, and is
-- right to: *"a live harvest whose rows have nowhere correct to land is the one
-- mistake that cannot be cleaned up afterwards."* The registrar's grant runs to
-- January 2029 and is not worth spending on a rehearsal.
--
-- Three things this migration decides, all three of them storage semantics and
-- therefore this lane's to decide:
--
-- ───────────────────────────────────────────────────────────────────────────
-- 1. AN OBSERVATION IS NOT A JUDGMENT, AND IT NEVER BECOMES ONE
-- ───────────────────────────────────────────────────────────────────────────
--
-- A cause-list entry, a next-hearing date and a status transition are REGISTRY
-- BOOKKEEPING. `judgments` is the population the retrieval lane treats as
-- AUTHORITY. Writing registry rows into it would put "listed on 11.03.2026"
-- into the set an advocate is shown as law, and once embeddings and citation
-- edges are built over that population there is no undo.
--
-- So `ecourts_observation` is a separate table with no foreign key to
-- `judgments` at all — not even a nullable one, because a nullable link is an
-- invitation to backfill it.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 2. AN OBSERVATION IS IMMUTABLE. LIVE STATE IS DERIVED FROM THE STACK.
-- ───────────────────────────────────────────────────────────────────────────
--
-- The founder roadmap's rule for this layer: *"never silently overwrite
-- historical observations when live state later changes."* If the court said
-- 11 March on Monday and 22 April on Wednesday, BOTH are true statements about
-- what the court published, and only the second is the current listing.
-- An UPDATE would destroy the first and with it the answer to *"when did this
-- move, and what did we tell the advocate before it moved."*
--
-- Enforced, not documented: `ecourts_observation` has no `updated_at`, and a
-- rule refuses UPDATE and DELETE on it outright. Append-only is the one
-- property that cannot be restored after it is lost.
--
-- Out-of-order and late observations therefore need no special handling in the
-- writer: `observed_at` (when WE fetched) and `source_asserted_at` (the date
-- the SOURCE puts on the fact, where it states one) are separate columns, and
-- the projection orders by the source's own assertion, falling back to ours.
-- A Wednesday fetch that returns Monday's page does not move the state forward.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 3. A LISTING IS NOT A HEARING. THE TRANSITION IS STORED, NOT DERIVED.
-- ───────────────────────────────────────────────────────────────────────────
--
-- *"Never infer: cause list says listed = hearing occurred."* The observation
-- kinds below keep those apart by construction — there is a `cause_list_entry`
-- kind and there is no `hearing_occurred` kind, because eCourts never publishes
-- that fact. A hearing having happened is only ever evidenced by a later
-- artefact (an order, a status change, a next-date move), and the projection
-- must reason from those rather than from the listing.
--
-- The CHANGE is the product — a hearing moved, a bench changed, an order
-- appeared — and a change is a diff between two observations. NEW2 asked
-- whether it is stored or derived. **Stored**, in `ecourts_transition`, for two
-- reasons that outweigh the redundancy:
--
--   a. Retention. Raw observations carry full payloads and will be pruned on a
--      schedule; the transitions they evidence must outlive them. A derived
--      view dies with its inputs.
--   b. Notification is a side effect with an at-most-once requirement. "Did we
--      already tell the advocate this hearing moved" has to be answerable from
--      a row, not recomputed from a window that may have shifted.
--
-- Both observation ids are kept on every transition, so a stored diff can
-- always be re-checked against its evidence while that evidence survives, and
-- `evidence_pruned_at` records honestly when it no longer can.
--
-- ───────────────────────────────────────────────────────────────────────────
-- PROVENANCE IS NOT OPTIONAL ON A SINGLE ROW
-- ───────────────────────────────────────────────────────────────────────────
--
-- Every observation carries the fetch-ledger id it came from, the endpoint, the
-- data type under the grant that permitted it, and `conditions_version` — the
-- fingerprint of the transcription in force (`authorisation.ts`). That last one
-- is what makes *"which version of the grant did this row run under"* survive a
-- renewal that narrows the terms. All four are NOT NULL: a row we cannot place
-- inside the grant is a row we cannot defend, and the registrar asking is
-- exactly the scenario the ledger exists for.
--
-- `payload_sha256` is NOT NULL for the same reason plus one more: it is what
-- makes a duplicate observation cheap to recognise without diffing payloads,
-- and duplicate rate per request is the metric NEW2 is instrumenting.
--
-- A duplicate observation is STILL WRITTEN. It is evidence that the court said
-- the same thing again on a later date, which is different from us not having
-- asked. There is deliberately no unique constraint on the payload hash.
--
SET LOCAL lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- RAW SOURCE OBSERVATION
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecourts_observation (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT KIND OF FACT. Deliberately narrow, and deliberately missing
  -- `hearing_occurred` — eCourts does not publish it and we must not mint it.
  observation_kind      text        NOT NULL,

  -- WHO SAID IT, WHEN WE HEARD IT, AND WHEN THEY DATED IT.
  source                text        NOT NULL DEFAULT 'ecourts',
  observed_at           timestamptz NOT NULL DEFAULT now(),
  source_asserted_at    timestamptz,

  -- IDENTITY, as the source states it. All nullable: a cause-list line often
  -- carries a case number and no CNR, and inventing one to satisfy a column is
  -- precisely the failure mode. `court_code` is ours, `court` is the source's
  -- own string, kept verbatim.
  court                 text        NOT NULL,
  court_code            text,
  cnr                   text,
  case_number           text,
  case_year             integer,
  case_type             text,

  -- THE FACT ITSELF, source-derived. Nullable because different kinds populate
  -- different subsets and a zero here would assert something the page did not.
  listing_date          date,
  next_listing_date     date,
  disposal_date         date,
  case_status           text,
  bench                 text,
  court_number          text,
  item_number           integer,
  order_ref             text,

  -- THE RAW MATERIAL. `payload` is what the extractor read; `payload_sha256` is
  -- over the bytes as received, before parsing, so a parser change does not
  -- silently renumber history.
  payload               jsonb       NOT NULL,
  payload_sha256        text        NOT NULL,

  -- PROVENANCE. All four NOT NULL — see the header.
  endpoint              text        NOT NULL,
  grant_data_type       text        NOT NULL,
  conditions_version    text        NOT NULL,
  fetch_ledger_id       uuid        NOT NULL REFERENCES ecourts_fetch_ledger (id),

  -- EXTRACTION HONESTY. An observation whose payload we could not fully read is
  -- still an observation and is still written; it is marked, never dropped, and
  -- never promoted into a transition. Same rule as an unverified citation.
  extraction_state      text        NOT NULL DEFAULT 'parsed',
  extraction_note       text,

  CONSTRAINT ecourts_observation_kind_check CHECK (
    observation_kind IN (
      'cause_list_entry',   -- the matter appears on a published list. NOT a hearing.
      'case_status',        -- the registry's own status string, as published
      'case_history_entry', -- one row of the published history
      'order_listed',       -- an order/judgment appears in the case's order list
      'next_date',          -- a next-listing date published for the case
      'bench_composition',  -- the coram/bench as published
      'disposal',           -- the registry records the case as disposed
      'caveat',             -- caveat search result
      'court_directory'     -- court_names: establishment/court metadata
    )
  ),
  -- Kept aligned with `GRANT_CONDITIONS.permittedDataTypes`. A row whose data
  -- type is not in the grant should never have been fetched; the CHECK makes
  -- writing one impossible rather than detectable afterwards.
  CONSTRAINT ecourts_observation_grant_data_type_check CHECK (
    grant_data_type IN (
      'court_names', 'case_status', 'cause_list', 'caveat_search', 'court_orders', 'judgments'
    )
  ),
  CONSTRAINT ecourts_observation_extraction_state_check CHECK (
    extraction_state IN ('parsed', 'partial', 'unreadable')
  )
);

-- The projection reads one case's observations newest-first. `coalesce` in the
-- index expression matches the projection's own ordering rule exactly, so the
-- ordering cannot drift from the index that serves it.
CREATE INDEX IF NOT EXISTS ecourts_observation_cnr_idx
  ON ecourts_observation (cnr, coalesce(source_asserted_at, observed_at) DESC)
  WHERE cnr IS NOT NULL;

-- The other identity path, for the very common case of a listing with no CNR.
CREATE INDEX IF NOT EXISTS ecourts_observation_court_case_idx
  ON ecourts_observation (court, case_number, coalesce(source_asserted_at, observed_at) DESC)
  WHERE case_number IS NOT NULL;

-- "What did we observe today", and the compliance sweep by day.
CREATE INDEX IF NOT EXISTS ecourts_observation_observed_at_idx
  ON ecourts_observation (observed_at DESC);

-- Duplicate-rate measurement (NEW2's request-allocation instrumentation) reads
-- this. Not unique: a repeated identical page IS a fact worth keeping.
CREATE INDEX IF NOT EXISTS ecourts_observation_payload_sha256_idx
  ON ecourts_observation (payload_sha256);

-- A cause-list sweep for one court-date, joined back to the sync that ran it.
CREATE INDEX IF NOT EXISTS ecourts_observation_court_listing_date_idx
  ON ecourts_observation (court, listing_date)
  WHERE listing_date IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY, ENFORCED
-- ───────────────────────────────────────────────────────────────────────────
--
-- A rule, not a trigger: `DO INSTEAD NOTHING` on UPDATE/DELETE would silently
-- discard the write, which is worse than the write. These raise instead, so an
-- attempt is a loud failure at the call site rather than a quiet no-op that
-- looks like success. Implemented as a trigger for that reason.
CREATE OR REPLACE FUNCTION ecourts_observation_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ecourts_observation is append-only: % refused. A source observation is a '
    'historical fact about what the court published. Correcting it destroys the '
    'answer to "what did we tell the advocate before this changed". Write a NEW '
    'observation instead.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ecourts_observation_no_update ON ecourts_observation;
CREATE TRIGGER ecourts_observation_no_update
  BEFORE UPDATE OR DELETE ON ecourts_observation
  FOR EACH ROW EXECUTE FUNCTION ecourts_observation_append_only();

-- ───────────────────────────────────────────────────────────────────────────
-- DERIVED TRANSITION — the CHANGE, which is the product
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecourts_transition (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  transition_kind       text        NOT NULL,

  -- Identity carried forward from the observations, so a transition is legible
  -- after its evidence is pruned.
  court                 text        NOT NULL,
  cnr                   text,
  case_number           text,

  -- THE DIFF. Both sides text so one column pair serves dates, statuses and
  -- bench strings; the kind says how to read them. `from_value` NULL means the
  -- first time we ever observed this attribute — which is NOT a change and is
  -- why `first_observation` is a kind of its own rather than a NULL-from move.
  from_value            text,
  to_value              text,

  -- EVIDENCE. Nullable only because pruning is coming; `evidence_pruned_at`
  -- says so explicitly rather than leaving a NULL to be read as "never had any".
  from_observation_id   uuid REFERENCES ecourts_observation (id) ON DELETE SET NULL,
  to_observation_id     uuid REFERENCES ecourts_observation (id) ON DELETE SET NULL,
  evidence_pruned_at    timestamptz,

  -- WHEN THE SOURCE SAYS IT CHANGED, and when we worked it out.
  occurred_at           timestamptz NOT NULL,
  derived_at            timestamptz NOT NULL DEFAULT now(),

  -- MATTER LINKAGE, LATE-BINDING BY DESIGN. A transition is observed before any
  -- advocate has a matter for it, and a matter may be created weeks later; the
  -- projection back-links then. Never required, never blocking.
  matter_id             uuid REFERENCES matters (id) ON DELETE SET NULL,

  -- NOTIFICATION IS AT-MOST-ONCE AND THAT IS A ROW, NOT A RECOMPUTATION.
  notified_at           timestamptz,

  CONSTRAINT ecourts_transition_kind_check CHECK (
    transition_kind IN (
      'first_observation',   -- we saw this attribute for the first time. Not a change.
      'next_date_moved',
      'status_changed',
      'bench_changed',
      'order_appeared',
      'disposed',
      'listing_added',       -- appeared on a list it was not previously on
      'listing_removed'      -- absent from a list it had been on. NOT a disposal.
    )
  ),
  -- A transition must not be its own evidence on both sides.
  CONSTRAINT ecourts_transition_distinct_evidence CHECK (
    from_observation_id IS NULL
    OR to_observation_id IS NULL
    OR from_observation_id <> to_observation_id
  )
);

-- At-most-once notification sweep: the unsent, oldest first.
CREATE INDEX IF NOT EXISTS ecourts_transition_unnotified_idx
  ON ecourts_transition (occurred_at)
  WHERE notified_at IS NULL;

-- "What has moved on this case", the Case Brain read.
CREATE INDEX IF NOT EXISTS ecourts_transition_cnr_idx
  ON ecourts_transition (cnr, occurred_at DESC)
  WHERE cnr IS NOT NULL;

-- The matter timeline read, once linkage exists.
CREATE INDEX IF NOT EXISTS ecourts_transition_matter_idx
  ON ecourts_transition (matter_id, occurred_at DESC)
  WHERE matter_id IS NOT NULL;

-- The same transition must not be derived twice from the same evidence pair —
-- the projection is re-runnable and re-running it must be idempotent. Partial,
-- because rows whose evidence has been pruned can no longer be deduplicated
-- this way and must not block the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS ecourts_transition_evidence_key
  ON ecourts_transition (transition_kind, from_observation_id, to_observation_id)
  WHERE from_observation_id IS NOT NULL AND to_observation_id IS NOT NULL;

COMMENT ON TABLE ecourts_observation IS
  'Immutable record of what a source published, with full grant provenance. '
  'APPEND-ONLY, enforced by trigger. Never joined to judgments: registry '
  'bookkeeping must not enter the authority population. A cause_list_entry is a '
  'listing, NEVER evidence that a hearing occurred.';

COMMENT ON COLUMN ecourts_observation.source_asserted_at IS
  'The date the SOURCE puts on the fact, where it states one. Separate from '
  'observed_at so a late or out-of-order fetch cannot move live state backwards.';

COMMENT ON COLUMN ecourts_observation.conditions_version IS
  'Fingerprint of the grant transcription in force (authorisation.ts '
  'CONDITIONS_VERSION). Answers "which version of the grant did this row run '
  'under" across a renewal that narrows the terms.';

COMMENT ON COLUMN ecourts_observation.extraction_state IS
  'partial/unreadable rows are still written and still counted; they are never '
  'promoted into a transition. An observation we could not read is not an '
  'observation that did not happen.';

COMMENT ON TABLE ecourts_transition IS
  'Derived CHANGE between two observations. Stored rather than viewed because '
  'raw payloads will be pruned and because notification is at-most-once. '
  'listing_removed is NOT a disposal and first_observation is NOT a change.';
