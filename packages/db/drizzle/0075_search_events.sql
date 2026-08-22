-- ───────────────────────────────────────────────────────────────────────────
-- OPERATIONAL TRUTH ABOUT SEARCH, WITH NO ADVOCATE'S QUERY IN IT
-- ───────────────────────────────────────────────────────────────────────────
--
-- `searches.query_text` is `NOT NULL` and `searches.user_id` is `NOT NULL`
-- referencing `users`. Writing it on every request — which is what wiring
-- `deps.userId` would have done — creates a **user-linked, permanent record of
-- the legal question every advocate asked.**
--
-- That is client confidence. *"anticipatory bail 498A Ramesh Kumar Jalandhar"*
-- names a client, an allegation and a court in one string, and it is exactly
-- the kind of string an advocate types. The DPDP Act's purpose-limitation
-- obligation does not permit us to keep it because it might be useful later,
-- and no operational question we actually have needs it.
--
-- The questions we DO have are all about SHAPE, and none of them need the text:
--
--     is search slow?                     latency_ms
--     for which kind of query?            query_class, query_chars
--     did an arm time out?                degraded
--     are we returning nothing?           result_count = 0
--     which build?                        build_sha
--     is one caller hammering us?         subject_hash
--
-- ───────────────────────────────────────────────────────────────────────────
-- `subject_hash`, AND WHY IT IS NOT A USER ID
-- ───────────────────────────────────────────────────────────────────────────
--
-- Rate-limiting and abuse questions need to know that two requests came from
-- the same caller. They do not need to know WHO. `subject_hash` is a keyed hash
-- of the identity, salted per deployment, so it correlates within this dataset
-- and is not a join key back to `users`. A leak of this table is a leak of
-- latency numbers, not of a client list.
--
-- Nullable, because an unauthenticated search is a normal state and there is no
-- honest value for it.
--
-- ───────────────────────────────────────────────────────────────────────────
-- `searches` IS NOT DROPPED, AND IS NOT BEING WIRED
-- ───────────────────────────────────────────────────────────────────────────
--
-- `citation_checks.search_id` references it and the SAVED-SEARCH feature
-- legitimately stores an advocate's own query, because the advocate ASKED us to
-- remember it — that is `saved_searches`, a different table with a different
-- consent. `searches` stays exactly as unwired as it is today; this is the
-- table the API writes instead.
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS search_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  -- What KIND of query, from `query-shape.ts`'s classifier, never the query.
  -- `structured` covers the qlang path; `unknown` is honest about a shape the
  -- classifier declined to name.
  query_class   text NOT NULL,
  -- Length is a shape fact and a capacity fact (the 500-char bound), and it
  -- cannot reconstruct the text.
  query_chars   integer NOT NULL,

  latency_ms    integer NOT NULL,
  result_count  integer NOT NULL,
  -- Which arms ran out of their statement budget. Empty array = complete.
  degraded      text[]  NOT NULL DEFAULT '{}',
  -- Present and false is a different fact from absent: a zero-result search is
  -- the single most product-relevant event this table holds.
  zero_result   boolean NOT NULL,
  -- 503 at the admission gate. Recorded as an EVENT rather than inferred from
  -- an absence, because "we refused" and "nobody asked" must not look alike.
  admitted      boolean NOT NULL DEFAULT true,

  build_sha     text,
  request_id    text,
  -- Keyed hash of the caller. NOT a user id and not reversible. See the header.
  subject_hash  text,

  CONSTRAINT search_events_chars_ck CHECK (query_chars >= 0),
  CONSTRAINT search_events_latency_ck CHECK (latency_ms >= 0)
);

-- The two questions asked of this table: "how is search behaving lately" and
-- "how is THIS class behaving lately".
CREATE INDEX IF NOT EXISTS search_events_occurred_idx ON search_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS search_events_class_occurred_idx
  ON search_events (query_class, occurred_at DESC);
-- Partial, because the interesting rows are rare and the table is not.
CREATE INDEX IF NOT EXISTS search_events_degraded_idx
  ON search_events (occurred_at DESC) WHERE degraded <> '{}' OR zero_result OR NOT admitted;

COMMENT ON TABLE search_events IS
  'LCC, 22 Aug 2026. Operational telemetry for search with NO query text and no '
  'user id -- see the migration header. The alternative on the table was wiring '
  'searches.query_text, which is NOT NULL and user-linked and would have created '
  'a permanent record of every legal question every advocate asked. saved_searches '
  'remains the place an advocate deliberately stores their own query.';
