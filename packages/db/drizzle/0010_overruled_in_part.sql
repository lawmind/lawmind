-- "overruled to an extent" is not "overruled".
--
-- `overruled` back-fills to `set_aside`, the one status that DISABLES
-- add-to-matter. An authority overruled only in part is still good law for
-- everything else, and refusing it would deny an advocate a usable authority.
--
-- `SCHEMA_TRUTH.md` requires `overruled_paras` for `partly_set_aside`, and a bare
-- "to an extent" does not say which paragraphs fell — so this relationship is
-- recorded here and the status back-fill deliberately skips it.
ALTER TABLE "judgment_citations"
	DROP CONSTRAINT IF EXISTS "judgment_citations_relationship_check";
--> statement-breakpoint
ALTER TABLE "judgment_citations"
	ADD CONSTRAINT "judgment_citations_relationship_check"
	CHECK ("relationship" IN ('cites','followed','distinguished','doubted','overruled','overruled_in_part'));
