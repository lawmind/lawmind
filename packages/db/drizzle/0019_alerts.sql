-- alerts + alert settings — PD-5/PD-6, docs/API_CONTRACTS.md "Citator alerts".
--
-- FOUR TRIGGERS ARE SPECCED. TWO HAVE A PRODUCER TODAY.
--
-- 1. An authority saved to a matter is set aside or overruled — the citation
--    fan-out, `applyOverruledChange`.
-- 2. An authority cited in a filed draft, OR copied out of the app, is set
--    aside — the same fan-out. `CITATION_HARNESS.md` §When the law moves: "a
--    copy is treated exactly as an export... it is not the lesser case; it is
--    the worse one, because with a draft we can at least name the document."
-- 3. A judgment in one of the advocate's own matters is uploaded — corpus
--    ingest. NOT WIRED: the OCR pipeline that would produce this event is
--    still SPECCED, not built (docs/API_CONTRACTS.md `POST /ocr/jobs`). The
--    setting exists and is honoured; the trigger cannot fire yet.
-- 4. A matter is listed on a date the advocate did not enter — cause list
--    sync. NOT WIRED: nothing in the codebase compares a freshly synced
--    cause-list item against a matter's existing dates to detect a surprise
--    listing. `services/api/src/court/sync.ts`'s `escalate()` handles a
--    DIFFERENT case — a date going from confirmed to unconfirmed after a
--    scraper outage — and that is already surfaced through the briefing's
--    three-state `dateConfidence`, not through this table; conflating the two
--    under one settings key would tell the advocate they can silence
--    something they cannot.
--
-- Building 3 and 4's endpoints as an honest, empty-until-the-producer-exists
-- surface (CLAUDE.md §6b: "build the server side behind an additive,
-- documented, provisional shape") is the right call here — the alternative is
-- either inventing a fake event or leaving the whole alerts contract unbuilt
-- because a quarter of it is blocked on other work.

CREATE TYPE "public"."alert_kind" AS ENUM (
  -- Trigger 1. Always in-app only — CITATION_HARNESS.md §When the law moves,
  -- "Saved to a matter only" column. Togglable via alert_saved_authority_moved.
  'saved_authority_moved',
  -- Trigger 2. Covers BOTH the filed-draft and the copied-out audience — they
  -- get identical severity by decision, not by accident. NEVER togglable: no
  -- settings column exists for it, and the API rejects any attempt to send one.
  'filed_citation_moved'
);

-- Immediate = pushed the moment the fan-out completes (set_aside or
-- partly_set_aside on the filed/copied audience only). Batched = surfaces in
-- the evening briefing's "since yesterday" block and nowhere else — PD-6, "the
-- app does not grow a notifications tab."
CREATE TYPE "public"."alert_severity" AS ENUM ('immediate', 'batched');

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind alert_kind NOT NULL,
  severity alert_severity NOT NULL,

  judgment_id uuid REFERENCES judgments (id),
  matter_id uuid REFERENCES matters (id),
  -- The event that produced this alert. Lets the client (and the citations
  -- monitor) trace an alert back to exactly what happened, and lets a second
  -- write for the same fan-out collide safely — see dedupe_key below.
  fanout_id uuid REFERENCES citation_fanouts (id),

  -- What the advocate is told, as FACTS, not composed copy. Rendering stays
  -- the client's job — the same split as everywhere else in this schema — and
  -- storing facts rather than a sentence survives copy changes without a
  -- backfill. Shape by kind:
  --   saved_authority_moved / filed_citation_moved:
  --     { fromStatus, toStatus, judgmentTitle, overruledParas?, surface? }
  -- `fromStatus`/`toStatus` are the values AT THE TIME OF THE EVENT — a
  -- historical fact, like citation_checks.overruled_status_shown. They are
  -- NOT what renders as the citation's current status: overruled_status is
  -- never cached (CITATION_HARNESS.md), so any surface showing the judgment
  -- itself re-reads judgments.overruled_status live. This payload only answers
  -- "what happened", never "what is true now".
  payload jsonb NOT NULL,

  -- One alert per user per real-world event. For kind-1/2 this is
  -- sha256(fanout_id || kind || user_id) — computed by the caller, not in SQL,
  -- so the same formula is testable without a database. Prevents both an
  -- accidental double-insert and the fan-out ever running the same change twice
  -- (idempotency_key on citation_fanouts already guarantees the latter, this
  -- is the second, cheaper line of defence on the read side).
  dedupe_key text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE UNIQUE INDEX alerts_user_dedupe_unique ON alerts (user_id, dedupe_key);
-- GET /alerts ?since, and the unread count on every open.
CREATE INDEX alerts_user_created_idx ON alerts (user_id, created_at DESC);
CREATE INDEX alerts_user_unread_idx ON alerts (user_id) WHERE read_at IS NULL;

-- Settings — three columns on users, matching how expo_push_token and the PD-8
-- consent pair already live there rather than in a satellite table with
-- exactly one row per user. Default true: PD-5/6 alerts are safety-relevant,
-- and an advocate should have to opt OUT of being told their authority moved,
-- never opt in.
--
-- There is deliberately no column for trigger 2 (filed_citation_moved).
-- "Trigger 2 cannot be disabled... An advocate who has filed a document citing
-- law that has since moved does not get to opt out of being told."
ALTER TABLE users
  ADD COLUMN alert_saved_authority_moved boolean NOT NULL DEFAULT true,
  ADD COLUMN alert_own_matter_judgment   boolean NOT NULL DEFAULT true,
  ADD COLUMN alert_unknown_listing       boolean NOT NULL DEFAULT true;
