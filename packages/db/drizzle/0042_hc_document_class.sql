-- What KIND of document each High Court row is.
-- `docs/ai/HC_CORPUS_QUALITY.md`, `services/ingest/src/hc-classify.ts`.
--
-- 40,980 High Court rows are 40,980 DOCUMENTS, not 40,980 authorities. The
-- measured judgment share of this corpus is 0.75%-18.64%, and
-- `source_document_type` is NULL on every one of them because the plain
-- metadata variant publishes no `order_type`. So the corpus cannot currently
-- tell a reasoned decision from a two-line adjournment, and an index built on
-- it would present both identically.
--
-- DERIVED, AND KEPT SEPARATE FROM THE SOURCE'S OWN FIELD. `source_document_type`
-- stays verbatim-from-source and NULL here; this column is ours and says so.
-- `hc_class_method` records which rule fired, so any row's classification is
-- auditable without re-deriving it -- the same shape as
-- `parties_extraction_method` (migration 0037).
--
-- NULL is a RESULT, never a default. A row no rule claims stays NULL with a
-- method naming why. `NOT INDEXED MUST NOT BECOME NOT RELEVANT`, and one level
-- up: not classified must not become classified-as-ordinary. 9,800 rows carry
-- `disposal_nature = 'DISPOSED'`, which covers a reasoned decision, a consent
-- order and an infructuous closure alike -- guessing it into `decided` would
-- inflate the authority count by 24% of the corpus on a word that does not mean
-- what the guess needs it to mean.

ALTER TABLE judgments ADD COLUMN IF NOT EXISTS hc_document_class text;
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS hc_class_method text;

ALTER TABLE judgments DROP CONSTRAINT IF EXISTS judgments_hc_document_class_check;
ALTER TABLE judgments ADD CONSTRAINT judgments_hc_document_class_check
  CHECK (hc_document_class IS NULL OR hc_document_class IN
    ('bail_order','procedural_disposal','reference_stub','decided','decided_brief'));

COMMENT ON COLUMN judgments.hc_document_class IS
  'DERIVED from disposal_nature + text length. What the source''s fields say this document is -- never a legal weight, and never a claim that it is or is not precedent. NULL means no rule claimed it.';
COMMENT ON COLUMN judgments.hc_class_method IS
  'Which classification rule fired, including the reason a row was left unclassified. Auditable without re-deriving.';

-- "What can actually be retrieved as an authority" is the question retrieval
-- asks, so it must not be a sequential scan over 40,980 rows.
CREATE INDEX IF NOT EXISTS judgments_hc_document_class_idx
  ON judgments (hc_document_class) WHERE hc_document_class IS NOT NULL;
