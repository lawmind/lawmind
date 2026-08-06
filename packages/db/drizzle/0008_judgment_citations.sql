CREATE TABLE IF NOT EXISTS "judgment_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"citing_judgment_id" uuid NOT NULL,
	"cited_judgment_id" uuid,
	"citation_text" text NOT NULL,
	"normalised_citation" text NOT NULL,
	"relationship" text DEFAULT 'cites' NOT NULL,
	"evidence" text,
	"char_offset" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgment_citations_relationship_check"
		CHECK ("relationship" IN ('cites','followed','distinguished','doubted','overruled')),
	CONSTRAINT "judgment_citations_no_self_citation"
		CHECK ("cited_judgment_id" IS NULL OR "cited_judgment_id" <> "citing_judgment_id")
);
--> statement-breakpoint
ALTER TABLE "judgment_citations"
	ADD CONSTRAINT "judgment_citations_citing_fk"
	FOREIGN KEY ("citing_judgment_id") REFERENCES "judgments"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "judgment_citations"
	ADD CONSTRAINT "judgment_citations_cited_fk"
	FOREIGN KEY ("cited_judgment_id") REFERENCES "judgments"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Re-running extraction over a judgment must not duplicate its edges. The unique
-- is on the NORMALISED citation, so the same authority quoted twice in different
-- typography collapses to one edge.
CREATE UNIQUE INDEX IF NOT EXISTS "judgment_citations_unique_edge"
	ON "judgment_citations" ("citing_judgment_id", "normalised_citation");
--> statement-breakpoint
-- The precedent graph walks outward from a judgment.
CREATE INDEX IF NOT EXISTS "judgment_citations_citing_idx"
	ON "judgment_citations" ("citing_judgment_id");
--> statement-breakpoint
-- Treatment analysis reads inward: who has cited THIS authority.
CREATE INDEX IF NOT EXISTS "judgment_citations_cited_idx"
	ON "judgment_citations" ("cited_judgment_id") WHERE "cited_judgment_id" IS NOT NULL;
--> statement-breakpoint
-- Counts group by relationship for one authority.
CREATE INDEX IF NOT EXISTS "judgment_citations_cited_relationship_idx"
	ON "judgment_citations" ("cited_judgment_id", "relationship")
	WHERE "cited_judgment_id" IS NOT NULL;
--> statement-breakpoint
-- Unresolved citations are kept, not discarded: they are the measure of corpus
-- coverage, and dropping them would hide how much law we cannot yet resolve.
CREATE INDEX IF NOT EXISTS "judgment_citations_unresolved_idx"
	ON "judgment_citations" ("normalised_citation") WHERE "cited_judgment_id" IS NULL;
