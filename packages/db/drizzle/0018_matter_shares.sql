-- matter_shares — PD-3: sharing is PER MATTER, BY INVITATION.
--
-- The owner invites a named person to a specific case, the way a file is handed
-- over. **There is no chamber-wide switch and there must never be one.** Indian
-- chambers work case-by-case: a junior is briefed on a matter, not given the run
-- of the chamber. And chamber-wide default sharing is a conflicts hazard — two
-- advocates in one chamber can be on opposing sides of related matters.

CREATE TABLE matter_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters (id) ON DELETE CASCADE,

  -- Null until the invitee has an account. An advocate can be invited before
  -- they have signed up, and the share must survive that gap — otherwise the
  -- owner has to remember to come back and re-invite.
  invited_user_id uuid REFERENCES users (id),
  -- Enrolment number or phone, AS TYPED. Kept verbatim because it is what the
  -- owner believed they were sharing with, and a conflicts question later asks
  -- exactly that.
  invited_identifier text NOT NULL,

  granted_by_user_id uuid NOT NULL REFERENCES users (id),
  granted_at timestamptz NOT NULL DEFAULT now(),

  -- REVOCATION IS A TIMESTAMP, NEVER A DELETE.
  --
  -- "Who had sight of this matter, and when" is precisely the question a
  -- conflicts challenge asks, possibly years later. A deleted row cannot answer
  -- it, and the answer "we do not keep that" is the worst one available.
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users (id)
);

-- One LIVE share per person per matter. Partial, so a revoked share does not
-- block a later re-invitation — an advocate may be brought back onto a case.
CREATE UNIQUE INDEX matter_shares_live_unique
  ON matter_shares (matter_id, invited_identifier) WHERE revoked_at IS NULL;

-- "What am I shared on" — the invitee's view.
CREATE INDEX matter_shares_invited_user_idx ON matter_shares (invited_user_id, revoked_at);

-- A revoked share must record WHO revoked it, for the same reason it records who
-- granted it.
ALTER TABLE matter_shares ADD CONSTRAINT matter_shares_revocation_is_attributed
  CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL));
