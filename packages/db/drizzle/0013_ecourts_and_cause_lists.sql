-- eCourts harvesting under the registrar's authorisation of 7 Aug 2026, and the
-- cause-list sync health it exists to serve.
--
-- Nothing here reaches eCourts. This migration creates the machinery that decides
-- whether anything is ALLOWED to, and the ledger that proves what happened. The
-- kill switch is created OFF and there is no endpoint that turns it on.
--
-- `docs/SCHEMA_TRUTH.md` updated in the same commit — platform_config and
-- cause_list_syncs were two of SPRINT_0's ten deferred tables; ecourts_fetch_ledger
-- and the briefings date-confirmation columns are new and recorded there.

-- ---------------------------------------------------------------- enums --

CREATE TYPE platform_config_kind AS ENUM ('maintenance', 'kill_switch', 'flag');
CREATE TYPE cause_list_status AS ENUM ('ok', 'empty', 'stale', 'failed');
CREATE TYPE ecourts_fetch_outcome AS ENUM ('ok', 'refused', 'error');

-- ------------------------------------------------------- platform_config --

CREATE TABLE platform_config (
  key text PRIMARY KEY,
  kind platform_config_kind NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percent integer,
  message text,
  reason text,
  updated_by_user_id uuid REFERENCES users (id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- SCHEMA_TRUTH: `reason` is NOT NULL for kind = 'kill_switch'. A switch that
  -- moved for no recorded reason is a switch nobody can account for afterwards.
  CONSTRAINT platform_config_kill_switch_reason
    CHECK (kind <> 'kill_switch' OR reason IS NOT NULL),

  -- Flags only, 0-100.
  CONSTRAINT platform_config_rollout_percent_range
    CHECK (rollout_percent IS NULL OR (rollout_percent BETWEEN 0 AND 100)),
  CONSTRAINT platform_config_rollout_percent_flags_only
    CHECK (kind = 'flag' OR rollout_percent IS NULL),
  CONSTRAINT platform_config_message_maintenance_only
    CHECK (kind = 'maintenance' OR message IS NULL),

  -- The kill-switch key set is FIXED. An unknown key is rejected, never
  -- implicitly created — a typo must not silently produce a switch nobody is
  -- watching. `ecourts_harvest` joins the original five: it governs whether any
  -- code path may contact eCourts at all.
  CONSTRAINT platform_config_kill_switch_keys
    CHECK (
      kind <> 'kill_switch'
      OR key IN ('search', 'drafting', 'briefings', 'ocr_intake', 'signups', 'ecourts_harvest')
    )
);

-- Created OFF, and it stays off until someone deliberately turns it on with a
-- reason. There is no endpoint that writes this row: `POST /admin/platform/
-- kill-switches/:key` is S6 and still SPECCED, so today the only way to flip it
-- is a hand-written statement by someone with database access.
--
-- Even then it is not sufficient. `services/api/src/court/authorisation.ts` must
-- also hold the grant's transcribed conditions; with this switch ON and those
-- terms absent, the guard still refuses. Two independent locks, because the
-- expensive failure here is not an outage, it is losing the permission.
INSERT INTO platform_config (key, kind, enabled, reason)
VALUES (
  'ecourts_harvest',
  'kill_switch',
  false,
  'Created OFF 7 Aug 2026. The registrar granted permission on 7 Aug 2026; its stated conditions are not yet transcribed into the repo, and CLAUDE.md requires that before this moves.'
);

-- ------------------------------------------------------ cause_list_syncs --

-- Per-court scrape health. A parser that silently returns an empty list is worse
-- than an outage, because briefings still go out with stale dates.
CREATE TABLE cause_list_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court text NOT NULL,
  list_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  item_count integer NOT NULL DEFAULT 0,
  status cause_list_status NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  escalated_at timestamptz,
  error text
);

CREATE UNIQUE INDEX cause_list_syncs_court_list_date_key ON cause_list_syncs (court, list_date);
CREATE INDEX cause_list_syncs_list_date_status_idx ON cause_list_syncs (list_date DESC, status);

-- `ok` and `empty` are DIFFERENT FACTS and collapsing them is the same error
-- class as `miss` versus `not_attempted` on the verification sheet: a court
-- genuinely has no listings some days, and that is not a parser failure. So an
-- `ok` row must have found something and an `empty` row must have found nothing,
-- enforced rather than trusted.
ALTER TABLE cause_list_syncs ADD CONSTRAINT cause_list_syncs_ok_has_items
  CHECK (status <> 'ok' OR item_count > 0);
ALTER TABLE cause_list_syncs ADD CONSTRAINT cause_list_syncs_empty_has_none
  CHECK (status <> 'empty' OR item_count = 0);
ALTER TABLE cause_list_syncs ADD CONSTRAINT cause_list_syncs_failed_has_error
  CHECK (status <> 'failed' OR error IS NOT NULL);

-- -------------------------------------------------- ecourts_fetch_ledger --

-- Every request we make under the grant, and every one we REFUSED to make.
--
-- Permission always arrives with conditions — volume, frequency, hours,
-- attribution. This is what makes "did we stay inside the grant" a query rather
-- than a promise. Refusals are recorded too, because the ledger's other job is to
-- show that the switch and the limiter actually held.
CREATE TABLE ecourts_fetch_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  court text,
  endpoint text NOT NULL,
  outcome ecourts_fetch_outcome NOT NULL,
  http_status integer,
  duration_ms integer,
  -- Which transcription of the grant was in force when this request was made.
  -- If the registrar amends the conditions, rows written before and after must be
  -- distinguishable — otherwise adherence can only be argued, not shown.
  authorisation_reference text,
  -- Set on `refused` and null otherwise: WHICH lock stopped it.
  refusal_reason text,
  cause_list_sync_id uuid REFERENCES cause_list_syncs (id) ON DELETE SET NULL,

  CONSTRAINT ecourts_fetch_ledger_refusal_has_reason
    CHECK ((outcome = 'refused') = (refusal_reason IS NOT NULL)),
  -- A refused request never left the process, so it can have carried no status
  -- and consumed no quota.
  CONSTRAINT ecourts_fetch_ledger_refused_never_hit_the_network
    CHECK (outcome <> 'refused' OR (http_status IS NULL AND duration_ms IS NULL))
);

-- The rate limiter counts through this index, so it is the hot path, not a
-- reporting convenience.
CREATE INDEX ecourts_fetch_ledger_requested_at_idx ON ecourts_fetch_ledger (requested_at DESC);
CREATE INDEX ecourts_fetch_ledger_court_requested_at_idx
  ON ecourts_fetch_ledger (court, requested_at DESC);

-- ------------------------------------------------------------ briefings --

-- The escalation target. SCHEMA_TRUTH's fixed policy is: retry once → mark
-- affected briefings `dates_not_confirmed` → notify affected advocates.
--
-- **Deliberately not a boolean.** A bool cannot say "we never looked", and the
-- difference between a date we confirmed, a date we tried and failed to confirm,
-- and a date nobody has checked is exactly the difference the advocate needs.
-- Both columns null = never checked.
ALTER TABLE briefings ADD COLUMN dates_confirmed_at timestamptz;
ALTER TABLE briefings ADD COLUMN dates_not_confirmed_at timestamptz;
ALTER TABLE briefings ADD COLUMN dates_not_confirmed_reason text;

-- Where the hearing date came from. The registrar's decision determines whether
-- this is usually 'cause_list' or usually 'advocate', and the briefing assembly
-- must read the same either way — a date the advocate typed is a FIRST-CLASS
-- source (PD-12), not a fallback, and one we scraped is not more trustworthy for
-- having been scraped.
CREATE TYPE hearing_date_source AS ENUM ('advocate', 'cause_list');
ALTER TABLE briefings ADD COLUMN hearing_date_source hearing_date_source;

-- Confirmed and not-confirmed are mutually exclusive at any instant.
ALTER TABLE briefings ADD CONSTRAINT briefings_date_confirmation_exclusive
  CHECK (dates_confirmed_at IS NULL OR dates_not_confirmed_at IS NULL);
ALTER TABLE briefings ADD CONSTRAINT briefings_not_confirmed_has_reason
  CHECK ((dates_not_confirmed_at IS NULL) = (dates_not_confirmed_reason IS NULL));
