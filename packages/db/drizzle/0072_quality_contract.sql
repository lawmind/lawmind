-- ───────────────────────────────────────────────────────────────────────────
-- THE QUALITY CONTRACT — one row per document, five questions, no lane has to
-- rediscover any of them
-- ───────────────────────────────────────────────────────────────────────────
--
-- LCC, NEW1 and NEW3 each need to know the same five things about a document
-- before they spend anything on it, and today each of them computes a different
-- subset from a different place: `script_quality` here, a JSONL export there, a
-- TypeScript module for dates that nothing calls, a class column whose headline
-- value was measured 30% wrong. Three lanes rediscovering four facts is how two
-- of those facts ended up with two different numbers.
--
--     text        is the body text real text?
--     recovery    if not, has anything recovered it, and may its digits be used?
--     date        does anything independent confirm judgment_date?
--     role        does this document DETERMINE anything?
--     provenance  which method, which version, decided when
--
-- ───────────────────────────────────────────────────────────────────────────
-- EVERY UNKNOWN IS A VALUE, AND `decided` IS AN UNKNOWN
-- ───────────────────────────────────────────────────────────────────────────
--
-- The directive is explicit — *no detector hit = UNKNOWN, never CLEAN* — and this
-- view has no CLEAN state for text anywhere in it. Nothing in the corpus has ever
-- looked for evidence that an extraction was FAITHFUL; the screens can only
-- convict. `TEXT_UNKNOWN` therefore covers 91% of the corpus and says so.
--
-- The harder one is citability. `hc_document_class = 'decided'` is 1,128,830 rows
-- and NEW2 measured it **30% procedural [13.6, 46.4]** on a 90-row stratified
-- frame read from primary documents, because the rule behind it reads a REGISTRY
-- DISPOSAL STRING — the arrow from DISPOSITION to CITABILITY that
-- `DOCUMENT_QUALITY_VOCABULARY.md` forbids. A transfer petition allowed on its
-- merits writes `disposal_nature_merits` exactly as a Constitution Bench judgment
-- does.
--
-- So `decided` maps to `CITABILITY_UNKNOWN`, not to citable. **False substantive
-- authority is worse than UNKNOWN** — an advocate who cites a transfer order as
-- precedent is embarrassed in open court, which is the same failure the citation
-- harness exists to prevent, arriving through a different door.
--
-- Only two states are asserted, and both are REFUSALS backed by a rule that fired
-- on the document's own operative text or on an explicit registry class:
-- `NOT_CITABLE` and `BAIL_ORDER`. Nothing here ever says "yes, cite this".
--
-- ───────────────────────────────────────────────────────────────────────────
-- DAMAGED BODY TEXT IS NOT A DISAPPEARED DOCUMENT
-- ───────────────────────────────────────────────────────────────────────────
--
-- `body_text_safe` is false for a glyph dump, and `metadata_discoverable` is
-- separately true whenever the identity fields are intact. That split is
-- deliberate and it is a product requirement: an advocate searching for a case by
-- citation or by party name must still FIND a document whose body failed to
-- extract — with its state visible — rather than have it silently vanish from the
-- corpus. Semantic retrieval over its body is what must refuse; the document
-- itself is not the thing that is damaged.
--
SET LOCAL lock_timeout = '3s';

-- ── Date quality, as a side table ──────────────────────────────────────────
--
-- Side table rather than three columns on `judgments`, for the reason `0071`
-- records: ALTER TABLE takes ACCESS EXCLUSIVE on an 18.7M-row table with four
-- live writers, and there is no gap to take it in. A LEFT JOIN on a primary key
-- costs one index probe.
--
-- ABSENT means NEVER LOOKED. `DATE_UNKNOWN` means looked and found no
-- independent witness. Collapsing those two is the mistake this repo has already
-- made once with `hc_document_class` NULL, where a refused-by-a-rule row and a
-- never-scanned row were indistinguishable and wanted opposite work.
CREATE TABLE IF NOT EXISTS judgment_date_quality (
  judgment_id     uuid PRIMARY KEY,

  --   DATE_VERIFIED  the DOCUMENT prints the stored date. Not the filename: when
  --                  the two disagreed the document was right 33 times out of 34.
  --   DATE_SUSPECT   a witness actively contradicts the stored date
  --   DATE_UNKNOWN   no independent witness. Silence is not a contradiction.
  state           text NOT NULL,
  method          text NOT NULL,

  -- Stored date minus filename date, in days. Null when the publisher prints no
  -- date in the filename at all — which is EVERY Allahabad row, the court with
  -- the largest off-by-one concentration, so this column being null is itself a
  -- finding rather than a gap.
  filename_delta_days integer,
  off_by_one_day  boolean NOT NULL DEFAULT false,
  witnesses       jsonb,

  checked_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT judgment_date_quality_state_ck CHECK (state IN (
    'DATE_VERIFIED', 'DATE_SUSPECT', 'DATE_UNKNOWN'))
);

CREATE INDEX IF NOT EXISTS judgment_date_quality_state_idx
  ON judgment_date_quality (state);

-- ── The contract ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW judgment_quality_contract AS
SELECT
  j.id,
  j.court,
  j.judgment_date,

  -- ── TEXT ────────────────────────────────────────────────────────────────
  --   TEXT_DAMAGED   a screen or a byte-stream detector convicted it
  --   TEXT_UNKNOWN   nothing has convicted it. NOT clean — see the header.
  CASE
    WHEN j.script_quality IS NULL THEN 'TEXT_UNKNOWN'
    WHEN j.script_quality IN ('clean', 'mixed_script_ok') THEN 'TEXT_UNKNOWN'
    ELSE 'TEXT_DAMAGED'
  END AS text_state,
  j.script_quality       AS text_value,
  j.script_quality_method AS text_method,
  j.script_quality_at    AS text_at,

  -- How well proven, on the same three-value scale `0070` introduced. PROOF is
  -- byte-stream or font-dictionary evidence; SCREEN is a density, which is enough
  -- to refuse a GPU batch and not enough to tell a person their document is
  -- corrupt.
  CASE
    WHEN j.script_quality IS NULL
      OR j.script_quality IN ('clean', 'mixed_script_ok') THEN 'NONE'
    WHEN j.script_quality_method IN ('text-damage-v2.0') THEN 'PROOF'
    ELSE 'SCREEN'
  END AS text_grade,

  -- ── RECOVERY ────────────────────────────────────────────────────────────
  COALESCE(q.state, 'NOT_QUEUED') AS recovery_state,
  q.reason        AS recovery_reason,
  r.method        AS recovery_method,
  r.engine_version AS recovery_engine,
  r.char_count    AS recovery_chars,
  r.created_at    AS recovered_at,

  -- The Karnataka defect as a consumable value. UNVERIFIED is the default and
  -- means the digits have NOT been corroborated -- 6 of 20 probe pages rendered a
  -- year as `2O17`, so no numeric field may be taken from recovered text without
  -- a second witness.
  r.digit_trust,

  -- ── DATE ────────────────────────────────────────────────────────────────
  -- NULL is deliberate and distinct from DATE_UNKNOWN: nothing has looked.
  d.state  AS date_state,
  d.method AS date_method,
  d.off_by_one_day,

  -- ── ROLE / CITABILITY ───────────────────────────────────────────────────
  j.hc_document_class  AS role_class,
  j.hc_class_method    AS role_method,
  CASE
    WHEN j.hc_document_class IN ('procedural_disposal', 'reference_stub') THEN 'NOT_CITABLE'
    WHEN j.hc_document_class = 'bail_order' THEN 'BAIL_ORDER'
    -- Everything else, `decided` included. See the header: 30% [13.6, 46.4] of
    -- `decided` is procedural, so this view will not promote it.
    ELSE 'CITABILITY_UNKNOWN'
  END AS citability,

  -- ── WHAT A CONSUMER ACTUALLY ASKS ───────────────────────────────────────
  --
  -- Semantic retrieval over the BODY. False whenever the body is convicted, and
  -- recovered text does not flip it: a recovery lives in its own table with its
  -- own provenance, and a consumer that wants it asks for it by name.
  (j.script_quality IS NULL OR j.script_quality IN ('clean', 'mixed_script_ok'))
    AS body_text_safe,

  -- Findable by citation, case number or party name even when the body is a
  -- glyph dump. The identity fields do not come from the body text, so body
  -- damage is no evidence against them.
  (j.content_hash IS NOT NULL
    AND j.case_number IS NOT NULL
    AND j.court IS NOT NULL
    AND length(COALESCE(j.case_title, '')) > 3) AS metadata_discoverable

FROM judgments j
LEFT JOIN judgment_recovery_queue q ON q.judgment_id = j.id
-- Newest recovery only. Many rows per document are allowed so a superseded
-- engine version stays visible; a consumer wants the current one.
LEFT JOIN LATERAL (
  SELECT tr.method, tr.engine_version, tr.char_count, tr.digit_trust, tr.created_at
    FROM judgment_text_recovery tr
   WHERE tr.judgment_id = j.id
   ORDER BY tr.created_at DESC
   LIMIT 1
) r ON true
LEFT JOIN judgment_date_quality d ON d.judgment_id = j.id;

COMMENT ON VIEW judgment_quality_contract IS
  'NEW2. One row per judgment answering the five questions every lane was '
  'recomputing separately: text, recovery, date, role/citability, provenance. '
  'There is no CLEAN text state and there never will be -- nothing in the corpus '
  'looks for evidence that an extraction was faithful, so TEXT_UNKNOWN covers 91% '
  'and says so. citability NEVER asserts citable: hc_document_class = decided was '
  'measured 30% procedural [13.6, 46.4] because its rule reads a registry disposal '
  'string, so decided maps to CITABILITY_UNKNOWN and only refusals are asserted. '
  'body_text_safe and metadata_discoverable are separate on purpose -- a document '
  'whose body failed to extract must still be findable by citation or party name '
  'with its state visible, rather than silently vanishing from the corpus.';

COMMENT ON TABLE judgment_date_quality IS
  'NEW2. DATE_VERIFIED requires the DOCUMENT to print the stored date, not the '
  'filename: when the two disagreed the document was right 33 of 34 times. '
  'Corpus disagreement rate 4.45%. An ABSENT row means nothing has looked; '
  'DATE_UNKNOWN means looked and found no independent witness -- collapsing those '
  'two is the mistake already made once with hc_document_class NULL. Nothing here '
  'rewrites judgments.judgment_date; the state is published and the date is left '
  'alone.';
