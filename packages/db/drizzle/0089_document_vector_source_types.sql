-- 0089 — DOCUMENT_VECTOR_STAGING ADMITS STATUTE SECTIONS, ORDERS AND ECOURTS TEXT
--
-- Owner: LCC (server/DB/release). Round: R9. Requested by NEW1, bus 1397.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES, AND THE SMALLER THING IT REFUSES TO DO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `document_vector_staging.source_object_type` admitted exactly two values,
-- `judgment` and `legal_object`. NEW1's `source-vector-embed.mjs` embeds statute
-- sections, official orders and eCourts order text into the same vector space,
-- through the same identity index, with a byte-identical model string — and
-- could not write a single row.
--
-- The cheaper move was to file statute sections as `legal_object` and it is the
-- wrong one. `legal_object` means a model-extracted holding, issue or
-- proposition lifted out of a judgment at SPAN_VERIFIED trust. An enacted
-- section of the Bharatiya Nyaya Sanhita is not a model's reading of anything,
-- and collapsing the two would put a machine's inference and the legislature's
-- own words in one class — which is the confusion the source-type column exists
-- to prevent. Reusing an allowed value because it is already allowed is how a
-- provenance field stops meaning anything.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS IS SAFE TO THE POINT OF BEING BORING
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Purely WIDENING. Every value the old CHECK admitted, the new one admits. No
-- column moves, no data rewrite, no reader changes, and the table holds
-- **0 rows** (verified on the live database immediately before writing this), so
-- the validation scan is instant and there is nothing that can fail it.
--
-- The DROP is guarded so a database that has already been widened by hand, or
-- one built before the constraint existed, replays this file without error.
-- `IF EXISTS` on the drop and a name that is re-created identically keep the
-- fresh-install replay and the live box on the same definition — which is the
-- thing `scripts/migration-fresh-install-proof.mjs` compares.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT MATTERS MORE THAN AN ARRAY LITERAL SUGGESTS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BNSS has 531 sections, BNS 358, BSA 170, and **116,678 judgments in this
-- corpus already cite the BNS family**. `CLAUDE.md`: no frontier model knows
-- those codes. A retrieval path that can return the section text and the
-- judgments applying it from one query is the transition feature, and it was
-- blocked by two strings in an ARRAY.

ALTER TABLE document_vector_staging
  DROP CONSTRAINT IF EXISTS document_vector_staging_source_object_type_check;

ALTER TABLE document_vector_staging
  ADD CONSTRAINT document_vector_staging_source_object_type_check
  CHECK (source_object_type = ANY (ARRAY[
    -- a whole judgment, or a representative of one
    'judgment',
    -- a model-extracted holding / issue / proposition, SPAN_VERIFIED
    'legal_object',
    -- an enacted section, the legislature's own words. NEVER a legal_object.
    'statute_section',
    -- a court's own order text, as published
    'official_order',
    -- raw eCourts observation text. Derived state never lands here.
    'ecourts_observation'
  ]));
