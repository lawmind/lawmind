-- ───────────────────────────────────────────────────────────────────────────
-- THE ENTITLEMENT SPINE — SERVER TRUTH FOR WHAT AN ADVOCATE HAS PAID FOR
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW3 owns the paywall and what it looks like. This owns whether it is TRUE.
-- The division matters because the client is the one surface that can be lied
-- to: a jailbroken build, a replayed receipt, a cancelled subscription still
-- cached in an app that has not been opened for a week. **Never trust a
-- client-reported premium status** — so the client asks, and these tables
-- answer.
--
-- Nothing here activates a payment provider, names a plan, or prices anything.
-- Plan names and prices are the founder's and NEW3's; a schema that hard-codes
-- "PRO" is a schema that has to be migrated the first time marketing changes a
-- word.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY CAPABILITIES AND NOT A `is_pro` BOOLEAN
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two revenue models are live possibilities and the founder has picked neither:
-- a recurring subscription, and one-off purchases (a Hearing Pack bought for one
-- hearing). A boolean can express the first and cannot express the second, and
-- the migration from boolean to capability is the kind that happens after money
-- is already flowing, which is the worst time.
--
-- So the unit is a CAPABILITY — a named thing the advocate may do — and a
-- capability can be held two ways:
--
--   RECURRING   an entitlement row with a state and an expiry
--   CREDIT      a balance in a ledger, decremented atomically on redemption
--
-- Both answer the same question at the same call site: *may this user do this
-- thing right now*. The revenue model is a fact about how the row got there.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY NOT HERE
-- ───────────────────────────────────────────────────────────────────────────
--
-- No `price`, no `currency`, no `plan_name`, no provider SDK, no webhook
-- endpoint. `provider` and `provider_ref` are opaque strings so that RevenueCat,
-- a store receipt, a manual founder grant and a test fixture are all the same
-- shape. Nothing in this migration can charge anybody.

SET LOCAL lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- ENTITLEMENTS
-- ───────────────────────────────────────────────────────────────────────────
--
-- `state` is three values and not a boolean, because `expired` and `revoked` are
-- different facts with different consequences. An expired subscription is a
-- lapsed customer to win back; a revoked one is a refund, a chargeback or a
-- fraud signal, and showing the second the same re-subscribe prompt as the first
-- is how a chargeback becomes two chargebacks.
--
-- `source` records HOW it was granted. A founder grant and a purchase must be
-- distinguishable forever: the first is a business decision, the second is money
-- that can be refunded, and an audit that cannot tell them apart cannot answer
-- either question.
CREATE TABLE IF NOT EXISTS entitlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- A capability class name. Deliberately `text` with no FK to an enum table:
  -- the list lives in `entitlements/capabilities.ts`, where a new capability is
  -- a code review rather than a migration, and where the compiler can see it.
  capability      text NOT NULL,

  state           text NOT NULL DEFAULT 'active',
  source          text NOT NULL,

  -- Opaque. 'revenuecat' | 'apple' | 'google' | 'manual' | 'test'. Not an enum,
  -- because adding a provider must not require a migration during a launch.
  provider        text,
  -- The provider's own identifier for this grant, whatever it calls it. The
  -- idempotency key for every write: the same purchase seen twice is one row.
  provider_ref    text,

  granted_at      timestamptz NOT NULL DEFAULT now(),
  -- NULL means "does not expire on its own" — a lifetime grant or a credit-backed
  -- capability. It does NOT mean unknown.
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_reason  text,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entitlements_state_ck CHECK (state IN ('active', 'expired', 'revoked')),
  CONSTRAINT entitlements_source_ck CHECK (source IN (
    'purchase', 'subscription', 'credit_redemption', 'founder_grant', 'trial', 'test')),
  -- A revoked row must say why. The same rule `platform_config` applies to a
  -- kill switch, for the same reason: the reason is the whole audit value.
  CONSTRAINT entitlements_revoked_reason_ck
    CHECK (state <> 'revoked' OR revoked_reason IS NOT NULL)
);

-- **The idempotency guarantee.** A provider that delivers the same event twice —
-- and every one of them does — cannot create two grants. Partial, because a
-- manual founder grant legitimately carries no provider_ref.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_ref_uq
  ON entitlements (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- The question asked on every gated call: what does this user hold right now.
CREATE INDEX IF NOT EXISTS entitlements_user_capability_idx
  ON entitlements (user_id, capability) WHERE state = 'active';

-- ───────────────────────────────────────────────────────────────────────────
-- PROVIDER EVENTS — THE REPLAY AND ORDERING LEDGER
-- ───────────────────────────────────────────────────────────────────────────
--
-- Every webhook lands here FIRST, before anything is granted. Four properties
-- that a handler which writes entitlements directly cannot have:
--
--   1. REPLAY PROTECTION. `provider_event_id` is unique. A redelivered event is
--      an INSERT conflict, not a second grant.
--   2. ORDERING. Providers do not guarantee delivery order, so a `cancelled`
--      can arrive before the `renewed` it follows. `provider_sent_at` is the
--      provider's own clock and is what the state machine orders by — never
--      `received_at`, which is ours.
--   3. UNKNOWN USER. An event for a user we do not hold is stored with
--      `user_id` NULL and `outcome = 'deferred_unknown_user'` rather than
--      dropped. A purchase that arrives before the account finishes creating is
--      a real race, and a dropped one is a paying customer with nothing.
--   4. AUDIT. `payload_hash` proves what we acted on without storing a payload
--      that may carry an email or a device id.
CREATE TABLE IF NOT EXISTS entitlement_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  event_type        text NOT NULL,

  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  capability        text,

  -- The provider's clock, for ordering. Nullable: a provider that does not send
  -- one forces us to fall back to arrival order, and the NULL is how we know.
  provider_sent_at  timestamptz,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,

  -- sha256 of the raw body. NOT the body.
  payload_hash      text NOT NULL,
  -- Whether the signature verified. An unverified event is STORED and never
  -- acted on -- seeing forged traffic is worth more than refusing it silently.
  signature_valid   boolean NOT NULL,

  outcome           text NOT NULL DEFAULT 'received',
  outcome_detail    text,

  CONSTRAINT entitlement_events_outcome_ck CHECK (outcome IN (
    'received', 'applied', 'duplicate', 'deferred_unknown_user',
    'rejected_signature', 'rejected_stale', 'ignored_unknown_type', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS entitlement_events_provider_event_uq
  ON entitlement_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS entitlement_events_unprocessed_idx
  ON entitlement_events (received_at) WHERE processed_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- CREDIT LEDGER — APPEND-ONLY, BECAUSE A BALANCE COLUMN LOSES MONEY
-- ───────────────────────────────────────────────────────────────────────────
--
-- Designed now, activated only if Product approves one-off purchases.
--
-- A balance column and a concurrent redemption produce a lost update, and the
-- direction it is lost in is always the customer's favour or ours — never
-- neither. So the balance is `SUM(delta)` over an append-only ledger, and the
-- invariant that matters is enforced by two unique indexes rather than by care:
--
--   PURCHASE -> CREDIT ISSUED ONCE   `credit_ledger_issue_uq` on the provider ref
--   REDEMPTION ATOMIC                one row, one job, inside one transaction
--   JOB CREATED ONCE                 `credit_ledger_redeem_uq` on the job id
--
-- A network retry cannot consume two credits, because the second redemption
-- carries the same `premium_job_id` and violates a unique index.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability      text NOT NULL,

  -- Positive on issue, negative on redemption. Never an UPDATE.
  delta           integer NOT NULL,
  reason          text NOT NULL,

  provider        text,
  provider_ref    text,
  -- Set on a redemption; the job the credit paid for.
  premium_job_id  uuid,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credit_ledger_delta_ck CHECK (delta <> 0),
  CONSTRAINT credit_ledger_reason_ck CHECK (reason IN (
    'purchase', 'founder_grant', 'refund_reversal', 'redemption',
    'redemption_reversal', 'expiry', 'test')),
  -- Direction and reason must agree. An 'expiry' with a positive delta is a
  -- typo that hands out free credit, and it fails here rather than in a report.
  CONSTRAINT credit_ledger_direction_ck CHECK (
    (reason IN ('purchase', 'founder_grant', 'refund_reversal', 'redemption_reversal', 'test')
       AND delta > 0)
    OR (reason IN ('redemption', 'expiry', 'refund_reversal') AND delta < 0)
    OR (reason = 'test')
  )
);

-- One issue per provider reference. A redelivered purchase webhook is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_issue_uq
  ON credit_ledger (provider, provider_ref)
  WHERE provider_ref IS NOT NULL AND delta > 0;

-- One redemption per job. This is the index that makes a retry safe.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_redeem_uq
  ON credit_ledger (premium_job_id)
  WHERE premium_job_id IS NOT NULL AND delta < 0;

CREATE INDEX IF NOT EXISTS credit_ledger_balance_idx
  ON credit_ledger (user_id, capability);

-- ───────────────────────────────────────────────────────────────────────────
-- PREMIUM JOBS — GENERATION COSTS MONEY, SO TAPPING TWICE MUST NOT COST TWICE
-- ───────────────────────────────────────────────────────────────────────────
--
-- A hearing pack is minutes of model time. On a phone, on Indian mobile data, a
-- request that has not answered in eight seconds gets tapped again — that is
-- ordinary user behaviour, not abuse, and it must not produce two of anything.
--
-- `idempotency_key` is supplied by the CLIENT and unique per user. The same tap
-- returns the same job. `params_hash` is the server's own check: the same inputs
-- under a different key are still the same work, and returning the existing job
-- is cheaper than being right about which one the user meant.
CREATE TABLE IF NOT EXISTS premium_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability        text NOT NULL,

  idempotency_key   text NOT NULL,
  params_hash       text NOT NULL,
  -- What the job is about. NULL for capabilities that are not matter-scoped.
  matter_id         uuid REFERENCES matters(id) ON DELETE CASCADE,

  state             text NOT NULL DEFAULT 'queued',

  attempts          integer NOT NULL DEFAULT 0,
  -- The retry CEILING, not a target. A job that has failed three times is
  -- failing for a reason that a fourth attempt will not change, and each attempt
  -- is billed.
  max_attempts      integer NOT NULL DEFAULT 3,

  -- Rolling model spend for this job, summed from `llm_calls`, so "what did this
  -- feature cost" is a query and not an estimate.
  cost_usd          numeric(10, 6) NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  cancelled_at      timestamptz,
  -- Set the moment a worker claims the job, and refreshed as it works. A job
  -- whose heartbeat has stopped is STALLED, which is a different fact from
  -- failed and needs different handling -- restart on silence, never on exit.
  heartbeat_at      timestamptz,

  error_family      text,
  error_detail      text,

  CONSTRAINT premium_jobs_state_ck CHECK (state IN (
    'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT premium_jobs_attempts_ck CHECK (attempts >= 0 AND max_attempts > 0),
  -- A failed job must name its family, so the failure can be counted by cause
  -- rather than read one at a time.
  CONSTRAINT premium_jobs_error_ck CHECK (state <> 'failed' OR error_family IS NOT NULL)
);

-- The idempotency guarantee. Same user, same key -> the same job, always.
CREATE UNIQUE INDEX IF NOT EXISTS premium_jobs_idempotency_uq
  ON premium_jobs (user_id, idempotency_key);

-- Deduplication of live work: one user may not have two RUNNING jobs for the
-- same inputs. Deliberately partial on the live states — a finished job must not
-- block an advocate legitimately regenerating a pack after new material arrives.
CREATE UNIQUE INDEX IF NOT EXISTS premium_jobs_live_params_uq
  ON premium_jobs (user_id, capability, params_hash)
  WHERE state IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS premium_jobs_live_idx
  ON premium_jobs (state, created_at) WHERE state IN ('queued', 'running');

-- ───────────────────────────────────────────────────────────────────────────
-- EXPERIMENTS — ASSIGNMENT AND EXPOSURE, NOT "WE CHANGED THE UI ON TUESDAY"
-- ───────────────────────────────────────────────────────────────────────────
--
-- Changing a screen and watching the numbers is not an experiment; it is a
-- coincidence with a narrative. Two rows make it one: WHO was assigned to WHAT,
-- and WHEN they actually SAW it. Without exposure there is no denominator —
-- a user assigned to a variant who never reached the screen is not evidence
-- about the variant.
--
-- Outcomes are deliberately NOT stored here. Conversion is an `entitlements`
-- row, refund is a `credit_ledger` reversal, cost is `premium_jobs.cost_usd`,
-- retention is activity. Copying them into an experiment table creates a second
-- number that can disagree with the first, and the one that disagrees is always
-- the one in the deck.
CREATE TABLE IF NOT EXISTS experiment_assignments (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id text NOT NULL,
  variant       text NOT NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_id)
);

CREATE TABLE IF NOT EXISTS experiment_exposures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id text NOT NULL,
  variant       text NOT NULL,
  surface       text NOT NULL,
  exposed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiment_exposures_idx
  ON experiment_exposures (experiment_id, variant, exposed_at);

-- ───────────────────────────────────────────────────────────────────────────
-- ACTIVATION FUNNEL — THE STEPS THAT COME BEFORE ANY PAYWALL IS WORTH TUNING
-- ───────────────────────────────────────────────────────────────────────────
--
-- Premium conversion measured on users who never had a successful search is a
-- measurement of nothing. The funnel is ordered and each step is recorded ONCE,
-- at its first occurrence: the primary key is (user_id, step), so a
-- twentieth search does not look like activation happening twenty times.
--
-- No identity beyond the user id, and no query text. This is a funnel, not a
-- session recording.
CREATE TABLE IF NOT EXISTS activation_events (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step        text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, step),

  CONSTRAINT activation_events_step_ck CHECK (step IN (
    'onboarded',
    'first_successful_search',
    'opened_primary_authority',
    'saved_authority',
    'created_matter',
    'experienced_matter_value',
    'premium_intent'))
);

CREATE INDEX IF NOT EXISTS activation_events_step_idx
  ON activation_events (step, occurred_at);

COMMENT ON TABLE entitlements IS
  'LCC, 23 Aug 2026. Server truth for what a user has paid for. Capability-based '
  'rather than a PRO boolean so a one-off purchase and a subscription are the same '
  'question at the call site. Never trust a client-reported premium status.';
COMMENT ON TABLE credit_ledger IS
  'LCC, 23 Aug 2026. Append-only. Balance is SUM(delta); two partial unique indexes '
  'make a duplicate issue and a double redemption impossible rather than unlikely.';
COMMENT ON TABLE premium_jobs IS
  'LCC, 23 Aug 2026. Generation costs money, so a repeated tap must not buy the work '
  'twice. idempotency_key is the client tap; params_hash is the server''s own check.';
COMMENT ON TABLE activation_events IS
  'LCC, 23 Aug 2026. First occurrence per user per step. A paywall tuned on users who '
  'never had a successful search is tuned on noise.';
