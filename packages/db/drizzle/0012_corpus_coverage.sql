-- What we hold, against what the source has.
--
-- The client lane found the gap by trying to render the bare-acts library:
-- `/statutes` returned 207 Acts, and 206 on the call before, because the ingest
-- was running live. Nothing in the response said so. A library rendered as
-- complete when it is not **misstates what we hold**, and an advocate searching
-- for an Act we have not reached yet concludes we do not have it.
--
-- That is the same argument this codebase already accepted for `truncated` on the
-- precedent graph and for `resolvedAuthorities` on the point-in-time endpoint: a
-- count without its denominator invites the reader to assume completeness.
--
-- One row per source. `source_total` is what the SOURCE reports — 845 from the
-- Central Acts browse index — not a number anyone typed. `held` is recomputed on
-- read from the actual tables, never cached, because a stale count is exactly the
-- lie this table exists to prevent.
CREATE TABLE IF NOT EXISTS "corpus_coverage" (
	"source" text PRIMARY KEY NOT NULL,
	-- What the source itself claims, read from its own index at enumeration time.
	-- Null until an enumeration has run: unknown is a state, never zero.
	"source_total" integer,
	-- When the source was last enumerated. Distinct from when rows were written:
	-- an ingest can be interrupted, and this says when we last knew the size.
	"enumerated_at" timestamp with time zone,
	-- True only when a full pass finished without failures.
	"complete" boolean DEFAULT false NOT NULL,
	-- Named, never merely counted. An ingest that skipped 40 Acts must be able to
	-- say which, or the gap is unauditable.
	"failed_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
