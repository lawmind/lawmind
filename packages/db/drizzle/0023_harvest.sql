-- The licensed-harvest tables: a raw archive, a fetch ledger, and a work queue.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE ARCHIVE AND THE LEDGER ARE ONE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `docs/HARVEST_ENGINE.md` §1: archive the raw response first, parse it
-- afterwards. Every request costs money and rate budget, and the licence is
-- perpetual on what we INGEST — not on what we understood at the time. Parse a
-- page, keep three fields, discard the rest, and a later need for a fourth means
-- buying the licence again.
--
-- The ledger answers a different question — "did we stay inside the licence" —
-- and `ecourts_fetch_ledger` already sets that pattern. But every ledger row for
-- a successful fetch HAS a body, and every archived body HAS a request behind it.
-- Two tables would be a join that is always one-to-one and a chance for them to
-- disagree. One table, with a nullable body for the rows that never got one.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY NOT HERE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No credentials, ever. `account_label` is a nickname an operator chose —
-- "st-primary" — so a rate problem can be traced to an account without the
-- password being anywhere near the database.
--
-- No parsed fields. Parsing writes to `judgments`, `judgment_citations` and the
-- rest, through the normal path, and reads only from here.

CREATE TABLE IF NOT EXISTS "harvest_fetches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- Which licensed source. Text rather than an enum: sources are commercial
	-- relationships that come and go, and a migration per contract is friction
	-- for no safety — nothing branches on this value.
	"source" text NOT NULL,
	"url" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"requested_at" timestamptz DEFAULT now() NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	-- ok = we have a body · refused = we declined to send it (budget, halt,
	-- no credentials) · error = it was sent and failed. Three different facts,
	-- and collapsing them is how a refusal comes to read as an outage.
	"outcome" text NOT NULL,
	"refusal_reason" text,
	-- Paise, for metered sources. NULL where the source is not per-request
	-- priced. Zero would be a lie about a free call.
	"cost_paise" integer,
	"body" text,
	"body_sha256" text,
	"bytes" integer,
	"account_label" text,
	-- Links a fetch to the queue item that caused it, so a partly-done item can
	-- be resumed from what it already has.
	"work_item_key" text,
	CONSTRAINT "harvest_fetches_outcome_valid"
		CHECK ("outcome" IN ('ok', 'refused', 'error')),
	-- A refusal must say why. A ledger that records "refused" with no reason
	-- cannot answer the question it exists for.
	CONSTRAINT "harvest_fetches_refusal_has_reason"
		CHECK ("outcome" <> 'refused' OR "refusal_reason" IS NOT NULL),
	-- A refusal never reached the network, so it cannot have a status or a body.
	CONSTRAINT "harvest_fetches_refused_never_hit_the_network"
		CHECK ("outcome" <> 'refused' OR ("http_status" IS NULL AND "body" IS NULL)),
	-- A body without its hash cannot be de-duplicated or verified later.
	CONSTRAINT "harvest_fetches_body_has_hash"
		CHECK ("body" IS NULL OR "body_sha256" IS NOT NULL)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "harvest_fetches_source_requested_at_idx"
	ON "harvest_fetches" ("source", "requested_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "harvest_fetches_work_item_idx"
	ON "harvest_fetches" ("source", "work_item_key")
	WHERE "work_item_key" IS NOT NULL;
--> statement-breakpoint
-- Identical bodies across URLs are common — a judgment reachable by two routes.
-- The hash makes that visible without comparing megabytes.
CREATE INDEX IF NOT EXISTS "harvest_fetches_body_sha256_idx"
	ON "harvest_fetches" ("body_sha256")
	WHERE "body_sha256" IS NOT NULL;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- THE WORK QUEUE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Resumable and de-duplicated, because the same document fetched twice is money
-- spent on nothing. The unique constraint on (source, item_key) is the whole
-- guarantee: a crash mid-run, a restarted process, or two operators starting the
-- same job cannot produce a second fetch of the same page.
--
-- `item_key` is OUR identifier — a judgment id — not theirs. `HARVEST_ENGINE.md`
-- §11: our own corpus is the index into theirs, so the worklist is bounded by
-- our corpus and every row is a judgment we already care about.

CREATE TABLE IF NOT EXISTS "harvest_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"item_key" text NOT NULL,
	-- What we hand their citation search. Nullable: some items are discovered
	-- rather than looked up.
	"citation" text,
	-- Lower runs first. Cheap editorial reads before anything model-backed.
	"priority" integer DEFAULT 100 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	-- Set when a worker takes the item. A stale claim is recoverable by age —
	-- which is why it is a timestamp and not a boolean.
	"claimed_at" timestamptz,
	"completed_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "harvest_queue_state_valid"
		CHECK ("state" IN ('pending', 'in_flight', 'done', 'failed', 'skipped')),
	-- A failure with no reason cannot be triaged, and an item that failed
	-- silently is one nobody will ever look at again.
	CONSTRAINT "harvest_queue_failure_has_reason"
		CHECK ("state" <> 'failed' OR "last_error" IS NOT NULL),
	CONSTRAINT "harvest_queue_done_has_time"
		CHECK ("state" <> 'done' OR "completed_at" IS NOT NULL)
);
--> statement-breakpoint

-- THE de-duplication guarantee. Everything else in this file is bookkeeping.
CREATE UNIQUE INDEX IF NOT EXISTS "harvest_queue_source_item_key_uniq"
	ON "harvest_queue" ("source", "item_key");
--> statement-breakpoint
-- The claim query: next pending item by priority, oldest first.
CREATE INDEX IF NOT EXISTS "harvest_queue_claimable_idx"
	ON "harvest_queue" ("source", "priority", "created_at")
	WHERE "state" = 'pending';
--> statement-breakpoint
-- Finding claims that were never released, so a crashed worker's items return.
CREATE INDEX IF NOT EXISTS "harvest_queue_in_flight_idx"
	ON "harvest_queue" ("claimed_at")
	WHERE "state" = 'in_flight';
