-- 0095 — IMAGE-ONLY SOURCE ARTIFACT STATE
--
-- A retained source PDF is not a canonical judgment until body text exists.
-- 0090 already separates the artifact from judgments and already records raw
-- bytes or an object-storage key; this one nullable field is the missing state.
-- No OCR worker, judgment placeholder or backfill is introduced here.

SET LOCAL lock_timeout = '3s';

ALTER TABLE official_source_artifact
  ADD COLUMN IF NOT EXISTS text_state text;

ALTER TABLE official_source_artifact
  DROP CONSTRAINT IF EXISTS official_source_artifact_text_state_check;
ALTER TABLE official_source_artifact
  ADD CONSTRAINT official_source_artifact_text_state_check CHECK (
    text_state IS NULL OR text_state IN ('TEXT_AVAILABLE', 'IMAGE_ONLY_OCR_PENDING')
  );

COMMENT ON COLUMN official_source_artifact.text_state IS
  'TEXT_AVAILABLE | IMAGE_ONLY_OCR_PENDING. NULL means not classified. A PDF '
  'with IMAGE_ONLY_OCR_PENDING may count as source artifact held, but supplies '
  'no full-text, paragraph, semantic or generation evidence until OCR exists.';
