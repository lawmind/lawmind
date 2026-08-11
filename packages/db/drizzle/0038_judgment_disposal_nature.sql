-- docs/ai/LEGAL_STRUCTURE.md, Stage 5 -- the ORDERS/DISPOSITION structural
-- field. `disposal_nature` is present on BOTH source metadata schemas
-- (SciMetadataRow, required; HcMetadataRow, optional) and was read by
-- NEITHER mapper into JudgmentRecord -- the same class of gap `cnr` and
-- petitioner/respondent were found to be (task 007, migration 0037).
--
-- Verbatim, never classified. "Appeal(s) allowed", "Dismissed", "DISMISS FOR
-- NON-PROSECUTION" are real values sampled directly from the public source
-- (SC year=2018: 787 of 795 rows populated, 15 distinct real outcomes).
-- Turning this into a disposed-vs-pending or judgment-vs-order signal is
-- separate, harder work named but not built in
-- docs/ai/HC_CORPUS_CHARACTERIZATION.md §11.

ALTER TABLE judgments ADD COLUMN IF NOT EXISTS disposal_nature text;
