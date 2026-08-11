-- Authorities saved to a matter — the feature `matters/route.ts`'s own header
-- comment already described ("set_aside disables add-to-matter... it NAMES the
-- judgment that displaced it") without anything behind it. RCC found the gap
-- 11 Aug 2026 reading the code, not the docs: no table, no route, and
-- JudgmentScreen's "Add to a matter" button has never had an onPress.
--
-- `saved_authority_moved` (PD-5) does not depend on this table — its current
-- audience is derived from citation_checks joined through searches/documents,
-- independent of whether an authority was ever saved to a matter. This table
-- is still real product surface: the matter workspace's whole value
-- (PRODUCT_BRIEF.md §4, "the retention moat") is accumulated per-case work,
-- and an authority list is part of that, not an alert-plumbing requirement.
--
-- Mirrors matter_shares exactly: a write is owner-only (matters/route.ts's
-- own convention — createMatterEvent checks user_id directly, not shared
-- access), removal is a timestamp never a delete, and one live row per
-- (matter, judgment) via a partial unique index so re-adding the same
-- authority is idempotent rather than an error.
CREATE TABLE IF NOT EXISTS matter_authorities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id          uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  judgment_id        uuid NOT NULL REFERENCES judgments(id),
  added_by_user_id   uuid NOT NULL REFERENCES users(id),
  -- The verification record this authority was added FROM, where the calling
  -- surface had one (a search result, a judgment screen). Null when it does
  -- not — an authority added from a screen with no citation_checks row on it
  -- is still a real save, and inventing one would misattribute a check that
  -- never ran.
  citation_check_id  uuid REFERENCES citation_checks(id),
  added_at           timestamptz NOT NULL DEFAULT now(),
  -- Never a DELETE, same reasoning as matter_shares.revoked_at: what an
  -- advocate had saved, and when, and when they removed it, is exactly what a
  -- conflicts or malpractice question asks later.
  removed_at         timestamptz,
  removed_by_user_id uuid REFERENCES users(id)
);

-- One LIVE authority per (matter, judgment). Re-adding an already-saved
-- judgment is idempotent (the route returns the existing row), not an error;
-- re-adding one that was previously removed is allowed, matching
-- matter_shares' "advocates are brought back onto cases" reasoning.
CREATE UNIQUE INDEX IF NOT EXISTS matter_authorities_live_key
  ON matter_authorities (matter_id, judgment_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS matter_authorities_judgment_idx
  ON matter_authorities (judgment_id);
