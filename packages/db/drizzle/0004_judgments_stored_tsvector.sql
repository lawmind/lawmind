DROP INDEX "judgments_full_text_idx";--> statement-breakpoint
ALTER TABLE "judgments" ADD COLUMN "full_text_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "full_text")) STORED;--> statement-breakpoint
CREATE INDEX "judgments_full_text_idx" ON "judgments" USING gin ("full_text_tsv");