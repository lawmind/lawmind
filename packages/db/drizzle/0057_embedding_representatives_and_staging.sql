-- ───────────────────────────────────────────────────────────────────────────
-- EMBEDDING REPRESENTATIVES, A RESUMABLE CENSUS, AND THE VECTOR STAGING ROUTE
-- ───────────────────────────────────────────────────────────────────────────
--
-- 0056 gave eligibility a DEFINITION. This gives it a MEASUREMENT that survives
-- a crash, a representative for byte-identical content, and somewhere for NEW1
-- to put vectors before anybody decides to build an index.
--
-- Nothing here touches `judgments`. Four new tables, so the ACCESS EXCLUSIVE
-- problem that 0056 spent two paragraphs on does not arise — but the runner
-- refuses a file without a lock_timeout and it is right to, because the next
-- person editing this file may add an ALTER and not think about it.
SET LOCAL lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · EXACT-CONTENT REPRESENTATIVES
-- ───────────────────────────────────────────────────────────────────────────
--
-- 36,310 ambiguous citation keys are ONE decision each, byte-identical, and
-- they cover 104,930 judgment rows (`docs/ai/AMBIGUOUS_CITATION_POPULATION.md`).
-- A common final order disposing of forty writ petitions is forty rows and one
-- decision. Embedding it forty times buys forty copies of the same point in
-- vector space, which does not improve recall — it crowds a result page with
-- what a reader sees as the same case repeated.
--
-- ── WHAT THIS DOES **NOT** DO, AND THE DISTINCTION IS THE WHOLE POINT
--
-- It does not merge cases. Every petition, every case number, every caption and
-- every party keeps its own `judgments` row, untouched. This table says only:
-- "for the purpose of choosing what to hand a GPU, these N rows are one text."
-- Mapping back is `WHERE content_hash = $1` against
-- `judgments_content_hash_idx`, which already exists — so no identity is lost
-- and none has to be stored twice.
--
-- Advocate-visible consequence, stated so nobody has to rediscover it: a
-- retrieval hit on a representative must fan back out to its members before
-- display, or a petitioner searching their own case number finds a decision
-- filed under somebody else's name. That is a retrieval-surface obligation, and
-- `member_count` is on this table so the surface can see it is required.
--
-- ── ONLY BYTE-IDENTICAL. NOTHING FUZZY.
--
-- Keyed on `content_hash`, which is exact. ~2k citation keys are genuine
-- CONFLICTS — different decisions colliding on one key — and roughly 8,843
-- ambiguous keys are mostly OCR variance rather than true duplication. None of
-- that is collapsed here and none of it should be until a near-duplicate
-- program with its own evidence exists. Collapsing a true conflict deletes a
-- decision from the corpus while every count still looks healthy, which is the
-- single worst failure available in this table's design space.
CREATE TABLE IF NOT EXISTS embedding_content_representative (
  content_hash text PRIMARY KEY,
  -- `min(id)` over the members. Arbitrary but STABLE and reproducible from the
  -- data alone, which matters more than being meaningful: a representative that
  -- moved between runs would silently change what a measured recall figure was
  -- measured against.
  representative_judgment_id uuid NOT NULL,
  -- How many judgment rows share this exact text. 1 for the overwhelming
  -- majority. The sum of (member_count - 1) is the number of vectors this table
  -- saves, and it is a real count rather than a projection.
  member_count integer NOT NULL CHECK (member_count > 0),
  -- Which eligibility contract selected these members. A representative built
  -- under v1 is not evidence about a v2 population, and without this column the
  -- two would silently mix in one table.
  definition_version text NOT NULL,
  definition_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embedding_content_representative_rep_idx
  ON embedding_content_representative (representative_judgment_id);
-- The interesting minority: everything with more than one member. Partial,
-- because most rows will have member_count = 1 and an index over all of them
-- would be as large as the table and answer nothing anybody asks.
CREATE INDEX IF NOT EXISTS embedding_content_representative_multi_idx
  ON embedding_content_representative (member_count) WHERE member_count > 1;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · CENSUS PROGRESS — THE REASON THIS IS A TABLE AND NOT A FILE
-- ───────────────────────────────────────────────────────────────────────────
--
-- The census walk aggregates each page and writes the result. If the cursor
-- advanced in a FILE while the aggregate landed in the DATABASE, a crash between
-- the two double-counts a page on resume — and `member_count` would be wrong in
-- a way no later check could detect, because a plausible number is
-- indistinguishable from a correct one.
--
-- Postgres died six times in four days on this box (0xC000013A console control
-- signals, not OOM — NEW2 bus 0685). A resumable job here is not defensive
-- programming, it is the measured operating condition.
--
-- So the cursor lives in the same transaction as the aggregates it accounts for.
-- Commit both or neither. That makes the walk exactly-once per page and the
-- whole job idempotent under interruption.
CREATE TABLE IF NOT EXISTS embedding_census_progress (
  job text PRIMARY KEY,
  definition_version text NOT NULL,
  definition_hash text NOT NULL,
  -- NULL = not started. The walk is `WHERE id > cursor ORDER BY id`, one index
  -- descent per page regardless of depth — never OFFSET, which re-reads every
  -- skipped row and gets slower exactly as it gets deeper.
  cursor uuid,
  rows_seen bigint NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · CENSUS CELLS — DISTRIBUTIONS AS DATA, NOT AS A LOG LINE
-- ───────────────────────────────────────────────────────────────────────────
--
-- Court × year × band × bucket, counted exactly. Small — roughly 40 courts × 80
-- years × 5 bands — so it is queryable from any angle after one walk, and the
-- walk never has to be repeated to answer a question nobody thought to ask.
--
-- This is the table that answers "is Tier A actually distributed like the
-- corpus, or is it Madras and Allahabad wearing a national label". NEW2 found
-- 22 court-year BLACKOUTS invisible to every court-level percentage; a
-- court-level Tier A figure would hide exactly the same thing, and the year
-- column is here so it cannot.
CREATE TABLE IF NOT EXISTS embedding_census_cell (
  definition_version text NOT NULL,
  court text NOT NULL,
  -- Not a date. Year is the grain every coverage question is asked at, and a
  -- NULL judgment_date gets year -1 rather than being silently dropped — NULL
  -- in a primary key would make the upsert insert a new row every page.
  judgment_year integer NOT NULL,
  value_band text NOT NULL,
  -- 'tier_a' | 'tier_a_core' | 'bail_order' | 'excluded_role' | 'excluded_text'
  -- | 'excluded_identity' | 'excluded_stub'. Excluded rows are counted, not
  -- skipped: "how many did we throw away and why" is the question a selector
  -- has to be able to answer, and a walk that only counts what it keeps cannot.
  bucket text NOT NULL,
  rows bigint NOT NULL DEFAULT 0,
  -- Distinct content hashes are NOT summable across cells — the same text can
  -- appear in two courts — so that figure is deliberately absent here and comes
  -- from `embedding_content_representative`, the only place it is a true global
  -- count. `chars_total` IS summable, and gives the text-size distribution its
  -- mean without a second walk.
  chars_total bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (definition_version, court, judgment_year, value_band, bucket)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · VECTOR STAGING — VECTORS BEFORE ANY INDEX EXISTS
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW1 needs to generate and compare vectors while HNSW is deliberately NOT
-- being rebuilt. `judgment_chunks.embedding` cannot serve: it is one fixed
-- representation, it carries no model identity, and writing an experiment into
-- it would corrupt the only dense arm currently serving retrieval.
--
-- ── DELIBERATELY NO INDEX ON THE VECTOR COLUMNS
--
-- An HNSW build over millions of rows is `VECTOR_BUILD` class and is the single
-- most expensive thing available on this box, on which retrieval is already p50
-- 43s (NEW2 bus 0711). Staged vectors are for exact brute-force comparison over
-- bounded candidate sets first. The index gets built when a measurement says
-- which representation deserves one — not before, and not for three
-- representations in parallel.
--
-- ── UNDIMENSIONED `vector` AND `halfvec`, BOTH NULLABLE
--
-- pgvector 0.8.5 allows a column of type `vector` with no declared dimension.
-- It cannot be indexed that way, which here is a feature: the model is not
-- chosen, and a dimension baked into DDL now would need a rewrite of the whole
-- table when it is. `dim` is stored as an integer and checked against the vector
-- by the writer.
--
-- fp32 and halfvec are separate columns rather than one column plus a cast,
-- because the comparison "does halfvec lose quality" needs both present for the
-- SAME source object at the same time. NEW1's 0697 makes this load-bearing
-- rather than an optimisation: at 15.45 vectors/document Tier A is 70 GiB in
-- halfvec, so the question is not academic.
CREATE TABLE IF NOT EXISTS document_vector_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── WHAT WAS EMBEDDED ──────────────────────────────────────────────────
  -- The three independently addressable populations. LEVEL A is one vector for
  -- a whole authority; LEVEL B is a verified legal object; LEVEL C is a
  -- selected paragraph — selected, never every paragraph.
  representation_type text NOT NULL CHECK (representation_type IN (
    'document',        -- LEVEL A · one canonical vector per authority
    'holding',         -- LEVEL B
    'issue',           -- LEVEL B
    'proposition',     -- LEVEL B
    'paragraph'        -- LEVEL C · selected, not exhaustive
  )),
  -- The object this vector represents. For 'document' it is the REPRESENTATIVE
  -- judgment id, not an arbitrary member — see table 1.
  source_object_type text NOT NULL CHECK (source_object_type IN ('judgment', 'legal_object')),
  source_object_id uuid NOT NULL,
  -- Hash of the exact TEXT handed to the model, not of the source row. A row
  -- can change without the embedded text changing, and the embedded text can
  -- change without the row changing (a better extractor). Only this answers
  -- "is this vector still valid", and it is what makes the pipeline idempotent.
  source_hash text NOT NULL,

  -- ── WHAT PRODUCED IT ───────────────────────────────────────────────────
  embedding_model text NOT NULL,
  embedding_model_version text NOT NULL,
  -- The eligibility/selection contract in force. A vector whose population
  -- definition is unknown makes any precision figure computed from it
  -- unfalsifiable.
  definition_version text NOT NULL,

  -- ── THE VECTOR ─────────────────────────────────────────────────────────
  dim integer NOT NULL CHECK (dim > 0),
  -- Which columns are populated. Not derived from NULL-ness: "we meant to store
  -- both and one failed" and "we only wanted halfvec" are different states and
  -- a NULL check cannot tell them apart.
  precision text NOT NULL CHECK (precision IN ('fp32', 'halfvec', 'both')),
  embedding_fp32 vector,
  embedding_halfvec halfvec,
  -- Hash of the vector bytes. Lets an identical re-embed be detected without
  -- comparing millions of floats, and catches a truncated or mangled write.
  embedding_hash text,

  -- ── LIFECYCLE ──────────────────────────────────────────────────────────
  -- 'staged' is a vector that exists. 'approved' means NEW1 measured it and
  -- accepted it — SEMANTIC APPROVAL IS NEW1'S, never LCC's, and never a
  -- side-effect of a successful write. 'superseded' keeps a vector that a newer
  -- run replaced, because deleting it destroys the ability to reproduce the
  -- comparison that replaced it.
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'approved', 'superseded', 'failed')),
  status_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One vector per (object, representation, model, source text). Re-embedding the
-- same text with the same model is a no-op rather than a silent duplicate that
-- doubles a candidate set and halves a measured precision.
CREATE UNIQUE INDEX IF NOT EXISTS document_vector_staging_identity_idx
  ON document_vector_staging (
    source_object_type, source_object_id, representation_type,
    embedding_model, embedding_model_version, source_hash
  );
CREATE INDEX IF NOT EXISTS document_vector_staging_status_idx
  ON document_vector_staging (status, representation_type);
CREATE INDEX IF NOT EXISTS document_vector_staging_source_idx
  ON document_vector_staging (source_object_id);

COMMENT ON TABLE document_vector_staging IS
  'Staged vectors, deliberately unindexed for ANN. fp32 and halfvec side by side for the same source object so the precision question is answerable. status=approved is NEW1''s call, never a writer''s.';
COMMENT ON TABLE embedding_content_representative IS
  'One representative per byte-identical text, for EMBEDDING ONLY. Collapses no case identity: map back with judgments.content_hash. A retrieval hit on a representative MUST fan out to its members before display.';
