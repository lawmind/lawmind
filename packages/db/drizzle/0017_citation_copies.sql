-- citation_copies — the advocate at highest risk.
--
-- "Copy citation" is an action on every judgment card. An advocate who copies a
-- citation into their own Word document has taken it OUT OF THE APP ENTIRELY:
-- they saw the badge, they may file it, and without this record **no notification
-- can ever reach them** when the law moves. Plausibly a large share of early
-- users — the ones who trust the search but not yet the drafting.
--
-- RCC's client has been queuing these in its outbox against an endpoint that did
-- not exist. Every copy since then is counted and unsent, which is the designed
-- behaviour rather than a failure — but it is a growing list of advocates we
-- could not warn.

CREATE TABLE citation_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  judgment_id uuid NOT NULL REFERENCES judgments (id),
  matter_id uuid REFERENCES matters (id),
  -- The render it was copied FROM. Null when copied from a surface that did not
  -- go through a citation check.
  citation_check_id uuid REFERENCES citation_checks (id),
  -- What the advocate was looking at when they copied. TEXT, not the enum,
  -- deliberately: this is a historical record of what was SHOWN, and it must
  -- survive the enum gaining a value. Same reasoning as
  -- citation_checks.overruled_status_shown.
  overruled_status_at_copy text NOT NULL,
  surface citation_surface NOT NULL,
  copied_at timestamptz NOT NULL DEFAULT now(),

  -- IDEMPOTENCY IS PER TAP, NOT PER CITATION.
  --
  -- Copy works offline and queues through the outbox, so the same request can
  -- arrive twice. The client sends a per-tap key: the SAME citation copied a week
  -- apart is two real events an advocate may need warning about twice, and only a
  -- double-tap or a retry collapses. A content hash would silently merge the two
  -- and lose a warning.
  client_key text NOT NULL,
  CONSTRAINT citation_copies_user_client_key_unique UNIQUE (user_id, client_key)
);

-- The fan-out reads by judgment: "who copied this authority that has now moved".
CREATE INDEX citation_copies_judgment_id_idx ON citation_copies (judgment_id);
CREATE INDEX citation_copies_user_copied_at_idx ON citation_copies (user_id, copied_at DESC);
