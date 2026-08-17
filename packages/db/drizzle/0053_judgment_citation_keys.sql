-- The resolver's lookup index, made a table instead of a per-run CTE.
--
-- `resolve-cli.ts` materialised `judgments × unnest(reporter_citations)` UNION
-- neutral citations UNION aliases, ran a LATERAL regexp over every resulting
-- string to extract its years, and grouped the whole thing — four times in one
-- `--apply --external` run. That was written against 38,341 judgments. Against
-- 7,296,068 it is two sequential scans of an 8.4 GB heap per materialisation,
-- and NEW1 measured it as a 16.4-hour query blocking a second copy of itself
-- (bus 0523).
--
-- Full reasoning, including why `source_text` and `years` are stored rather than
-- derived, is on `judgmentCitationKeys` in `packages/db/src/schema.ts`.
CREATE TABLE IF NOT EXISTS "judgment_citation_keys" (
  "citation_key" text NOT NULL,
  "judgment_id"  uuid NOT NULL REFERENCES "judgments"("id") ON DELETE CASCADE,
  "source"       text NOT NULL,
  "source_text"  text NOT NULL,
  "years"        text[] NOT NULL DEFAULT '{}',
  "created_at"   timestamptz NOT NULL DEFAULT now(),

  -- Three origins, spelled out. An unconstrained free-text `source` is how a
  -- provenance column quietly becomes decoration: nothing would ever notice a
  -- typo'd 'reporters', and the rows would still look fine.
  CONSTRAINT "judgment_citation_keys_source_check"
    CHECK ("source" IN ('neutral', 'reporter', 'alias')),

  -- The unique index below is a btree over four columns and btree tuples are
  -- capped at ~2704 bytes. A citation is short; anything approaching this limit
  -- is extraction garbage, not a citation. Refusing it AT THE DATABASE means the
  -- builder cannot quietly skip it — it has to count it and say so.
  CONSTRAINT "judgment_citation_keys_source_text_len"
    CHECK (length("source_text") <= 512),
  CONSTRAINT "judgment_citation_keys_key_len"
    CHECK (length("citation_key") BETWEEN 1 AND 512)
);

-- The resolver's only access path: given a key, which judgments claim it.
CREATE INDEX IF NOT EXISTS "judgment_citation_keys_key_idx"
  ON "judgment_citation_keys" ("citation_key");

-- Rebuild-one-judgment, and the ON DELETE CASCADE, both walk this.
CREATE INDEX IF NOT EXISTS "judgment_citation_keys_judgment_idx"
  ON "judgment_citation_keys" ("judgment_id");

-- Idempotence, and it is load-bearing rather than tidy. The builder is resumable,
-- so an overlapping restart WILL re-visit rows. Without this, a crash mid-page
-- doubles a key's target count — and a key with two targets is one the resolver
-- refuses outright. A duplicate row does not corrupt anything; it SUPPRESSES a
-- correct resolution, which is much harder to notice than a wrong one.
CREATE UNIQUE INDEX IF NOT EXISTS "judgment_citation_keys_unique"
  ON "judgment_citation_keys" ("citation_key", "judgment_id", "source", "source_text");

COMMENT ON TABLE "judgment_citation_keys" IS
  'Derived index of every citation form in the corpus. Asserts nothing that judgments '
  'and judgment_citation_aliases do not already say; safe to drop and rebuild with '
  'services/ingest/src/citation-keys-cli.ts. Never an authority.';
